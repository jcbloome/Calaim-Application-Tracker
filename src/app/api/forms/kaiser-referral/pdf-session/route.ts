import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PdfSessionEntry = {
  pdfBytes: Uint8Array;
  fileName: string;
  expiresAt: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __kaiserPdfSessionStore: Map<string, PdfSessionEntry> | undefined;
}

function getStore() {
  if (!global.__kaiserPdfSessionStore) {
    global.__kaiserPdfSessionStore = new Map<string, PdfSessionEntry>();
  }
  return global.__kaiserPdfSessionStore;
}

function cleanupExpired(store: Map<string, PdfSessionEntry>) {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(id);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { pdfBase64?: string; fileName?: string };
    const pdfBase64 = String(body?.pdfBase64 || '').trim();
    const fileName = String(body?.fileName || 'kaiser_referral.pdf').trim() || 'kaiser_referral.pdf';

    if (!pdfBase64) {
      return NextResponse.json({ success: false, error: 'Missing pdfBase64' }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    if (!pdfBuffer.length) {
      return NextResponse.json({ success: false, error: 'Invalid PDF payload' }, { status: 400 });
    }

    // Prevent oversized payloads from lingering in memory.
    if (pdfBuffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'PDF payload too large' }, { status: 413 });
    }

    const store = getStore();
    cleanupExpired(store);
    const id = randomUUID();
    store.set(id, {
      pdfBytes: new Uint8Array(pdfBuffer),
      fileName,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    return NextResponse.json({
      success: true,
      id,
      url: `/api/forms/kaiser-referral/pdf-session?id=${encodeURIComponent(id)}`,
      expiresInMs: SESSION_TTL_MS,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create PDF session' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get('id') || '').trim();
  if (!id) {
    return new NextResponse('Missing session id', { status: 400 });
  }

  const store = getStore();
  cleanupExpired(store);
  const entry = store.get(id);
  if (!entry) {
    return new NextResponse('PDF session not found or expired', { status: 404 });
  }

  return new NextResponse(entry.pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${entry.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
