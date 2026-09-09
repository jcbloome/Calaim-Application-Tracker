/**
 * Parse a completed ALFT assessment PDF (page images) into exactPacketAnswers field IDs.
 * Uses Gemini Vision, same key pattern as service-request vision parse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  buildAlftParseSchemaPrompt,
  sanitizeAlftExtractedAnswers,
  type AlftParsedAnswerMap,
} from '@/lib/alft/parse-alft-completed-pdf';

export const runtime = 'nodejs';
export const maxDuration = 120;

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const extractJsonObject = (text: string): Record<string, unknown> | null => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || raw).trim();
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export async function POST(request: NextRequest) {
  try {
    if (!apiKey || !genAI) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ALFT PDF parsing is not configured. Missing GEMINI_API_KEY or GOOGLE_API_KEY.',
        },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const images = formData.getAll('images').filter((entry): entry is File => entry instanceof File);
    const single = formData.get('image');
    if (single instanceof File) images.push(single);

    if (!images.length) {
      return NextResponse.json({ ok: false, error: 'No page images provided.' }, { status: 400 });
    }
    if (images.length > 8) {
      return NextResponse.json(
        { ok: false, error: 'Send at most 8 page images per request (batch on the client).' },
        { status: 400 }
      );
    }

    const batchLabel = String(formData.get('batchLabel') || '').trim();
    const schemaPrompt = buildAlftParseSchemaPrompt();

    const imageParts = await Promise.all(
      images.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = String(file.type || 'image/png').trim() || 'image/png';
        return {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: mimeType.startsWith('image/') ? mimeType : 'image/png',
          },
        };
      })
    );

    const prompt = `You are extracting filled answers from a completed Assisted Living Facility Transition (ALFT) / ISP assessment form PDF pages.

Return ONLY a valid JSON object. Keys MUST be the exact field ids listed below. Omit keys that are blank or not visible on these pages.

Field schema:
${schemaPrompt}

Rules:
- For radio/select fields, return the schema value (e.g. "yes", "no", "independent"), not the display label, when possible.
- For checkboxGroup fields, return an array of schema values.
- For text/textarea, return the handwritten or typed text as seen.
- Dates: prefer MM-DD-YYYY or MM/DD/YYYY as written.
- Do not invent answers. If unclear, omit the key.
- Medication tables and long commentary: put readable text into p13_medication_table and p13_commentary_section when those pages are present.
${batchLabel ? `\nThis batch covers: ${batchLabel}` : ''}

Return ONLY JSON, no markdown.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([{ text: prompt }, ...imageParts]);
    const responseText = result.response.text();
    const parsed = extractJsonObject(responseText);
    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Could not parse model JSON for ALFT fields.',
          details: responseText.slice(0, 500),
        },
        { status: 422 }
      );
    }

    const { answers, filledIds, ignoredKeys } = sanitizeAlftExtractedAnswers(parsed);
    return NextResponse.json({
      ok: true,
      answers: answers as AlftParsedAnswerMap,
      filledIds,
      ignoredKeys,
      pageCount: images.length,
      batchLabel: batchLabel || null,
    });
  } catch (error: any) {
    console.error('[parse-completed-alft-pdf]', error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error?.message || 'ALFT PDF parse failed'),
      },
      { status: 500 }
    );
  }
}
