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
    const pdfPageStart = Number(formData.get('pdfPageStart') || 0) || undefined;
    const pdfPageEnd = Number(formData.get('pdfPageEnd') || 0) || undefined;
    const pdfPageCount = Number(formData.get('pdfPageCount') || 0) || undefined;
    const schemaPrompt = buildAlftParseSchemaPrompt({ pdfPageStart, pdfPageEnd, pdfPageCount });

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

Return ONLY a valid flat JSON object. Keys MUST be the exact field ids listed below (example: "p1_member_name"). Do NOT nest under "answers" or "fields". Omit keys that are blank or not visible on these pages.

Field schema for this batch:
${schemaPrompt}

Rules:
- Read handwritten and typed values carefully from the page images.
- CHECKBOXES ARE CRITICAL: for every visible checked box, emit the matching field id with the schema value.
  Examples: Yes→"yes", No→"no", Not at all→"not_at_all", Ten pounds or more→"10_or_more",
  Total Assistance→"total", Substantial Assistance→"substantial", Calorie supplement→"calorie_supplement", Puree Diet→"puree".
- For radio/select fields, return ONLY the schema value from the list (never the long parenthetical text).
- ADL/IADL rows use a two-column checkbox layout — return the ONE checked option value per row.
- For checkboxGroup fields, return an array of schema values for every checked box.
- For text/textarea, return the full typed/handwritten text as seen (do not truncate).
- ALWAYS fill p13_commentary_section when "Additional Details", "RN Commentary", "MSW Commentary", or long narrative notes appear.
- ALWAYS fill p10_notes_summary / other Notes and Summary textareas when present on the page.
- Dates: prefer MM-DD-YYYY or MM/DD/YYYY as written.
- Do not invent answers. If a box is unchecked, omit that option.
- Medication tables: put readable text into p13_medication_table when that page is present.
- Always include p1_member_name and p1_mrn when visible anywhere in these images.
${batchLabel ? `\nThis batch covers: ${batchLabel}` : ''}

Return ONLY JSON, no markdown.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      } as any,
    });
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
      filledCount: filledIds.length,
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
