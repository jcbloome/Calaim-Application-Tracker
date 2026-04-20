import { NextResponse } from 'next/server';

type TranslateRequest = {
  texts?: unknown;
  target?: unknown;
  source?: unknown;
};

const PROTECTED_TRANSLATION_TERMS = [
  'Connect CalAIM',
  'CalAIM Application Tracker',
  'California Advancing and Innovating Medi-Cal',
  'California Advancing and Innovating Medi Cal',
  'Connections Care Home Consultants',
  'Social Worker Portal',
  'Admin Portal',
  'Medi-Cal',
  'CalOptima',
  'Caspio',
  'Firebase',
  'Google Drive',
  'Kaiser',
  'HNRC',
  'RCFE',
  'CCL',
  'ILS',
  'CalAIM',
];

type MaskedTranslationText = {
  masked: string;
  tokens: Array<{ token: string; value: string }>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskProtectedTerms(value: string): MaskedTranslationText {
  let masked = value;
  const tokens: Array<{ token: string; value: string }> = [];
  let tokenIndex = 0;

  const protectedTermsByLength = [...PROTECTED_TRANSLATION_TERMS].sort(
    (a, b) => b.length - a.length
  );
  protectedTermsByLength.forEach((term) => {
    const matcher = new RegExp(escapeRegExp(term), 'gi');
    masked = masked.replace(matcher, (match) => {
      const token = `__CALAIM_KEEP_${tokenIndex}__`;
      tokenIndex += 1;
      tokens.push({ token, value: match });
      return token;
    });
  });

  return { masked, tokens };
}

function unmaskProtectedTerms(value: string, tokens: Array<{ token: string; value: string }>): string {
  return tokens.reduce((result, tokenInfo) => result.replaceAll(tokenInfo.token, tokenInfo.value), value);
}

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
      process.env.GOOGLE_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_TRANSLATE_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing Google Translate API key configuration.' },
        { status: 500 }
      );
    }

    const maskedTexts = texts.map((text) => maskProtectedTerms(text));
    const translationInputs = maskedTexts.map((item) => item.masked);

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: translationInputs,
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

    const rawTranslations = Array.isArray((payload as any)?.data?.translations)
      ? (payload as any).data.translations.map((item: any) =>
          String(item?.translatedText ?? '')
        )
      : [];

    const translations = maskedTexts.map((maskedText, index) =>
      unmaskProtectedTerms(rawTranslations[index] ?? maskedText.masked, maskedText.tokens)
    );

    return NextResponse.json({ translations });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || 'Unexpected translation server error.') },
      { status: 500 }
    );
  }
}
