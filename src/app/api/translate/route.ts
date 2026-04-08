import { NextResponse } from 'next/server';

type TranslateRequest = {
  texts?: unknown;
  target?: unknown;
  source?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TranslateRequest;
    const texts = Array.isArray(body?.texts)
      ? body.texts.map((value) => String(value ?? '')).filter((value) => value.trim().length > 0)
      : [];
    const target = String(body?.target || '').trim().toLowerCase();
    const source = String(body?.source || 'en').trim().toLowerCase();

    if (!texts.length) {
      return NextResponse.json({ translations: [] });
    }

    if (target !== 'es' && target !== 'en') {
      return NextResponse.json({ error: 'Unsupported target language.' }, { status: 400 });
    }

    if (target === 'en') {
      return NextResponse.json({ translations: texts });
    }

    const apiKey =
      process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY ||
      process.env.GOOGLE_TRANSLATE_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing Google Translate API key configuration.' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: texts,
          target,
          source,
          format: 'text',
        }),
        cache: 'no-store',
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: String((payload as any)?.error?.message || 'Translation request failed.') },
        { status: response.status }
      );
    }

    const translations = Array.isArray((payload as any)?.data?.translations)
      ? (payload as any).data.translations.map((item: any) =>
          String(item?.translatedText ?? '')
        )
      : [];

    return NextResponse.json({ translations });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || 'Unexpected translation server error.') },
      { status: 500 }
    );
  }
}
