import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  buildCsSummaryPdfFromRows,
  buildCsSummaryPdfFromSections,
} from '@/lib/cs-summary-download-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DownloadEntry = {
  category?: string;
  documentName?: string;
  fileName?: string;
  downloadURL?: string;
  filePath?: string;
  inlineMode?: string;
  inlineRows?: Array<{ label?: string; value?: string }>;
  inlineSections?: Array<{
    title?: string;
    rows?: Array<{ label?: string; value?: string }>;
  }>;
};

const sanitizeName = (name: string, fallback = 'file'): string => {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
};

const parseStoragePathFromDownloadUrl = (url: string): string => {
  try {
    const input = String(url || '').trim();
    if (!input) return '';
    if (input.startsWith('gs://')) return input;
    const parsed = new URL(input);
    if (!parsed.pathname.includes('/o/')) return '';
    const afterO = parsed.pathname.split('/o/')[1] || '';
    if (!afterO) return '';
    return decodeURIComponent(afterO);
  } catch {
    return '';
  }
};

const toFetchableUrl = (rawUrl: string, request: NextRequest): string => {
  const input = String(rawUrl || '').trim();
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith('/')) return `${request.nextUrl.origin}${input}`;
  return '';
};

const extensionFromMime = (mime: string): string => {
  const normalized = String(mime || '').trim().toLowerCase();
  if (normalized.includes('pdf')) return '.pdf';
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('msword')) return '.doc';
  if (normalized.includes('officedocument.wordprocessingml.document')) return '.docx';
  if (normalized.includes('json')) return '.json';
  if (normalized.includes('text/html')) return '.html';
  if (normalized.includes('text/plain')) return '.txt';
  return '';
};

const ensureExtension = (name: string, mime: string): string => {
  const trimmed = String(name || '').trim();
  if (/\.[a-z0-9]{2,8}$/i.test(trimmed)) return trimmed;
  const ext = extensionFromMime(mime);
  return `${trimmed || 'file'}${ext || '.bin'}`;
};

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: false, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const entry = (body?.entry || {}) as DownloadEntry;
    const category = sanitizeName(String(entry?.category || '').trim(), 'Application files');
    const documentName = sanitizeName(String(entry?.documentName || '').trim(), 'file');
    const baseFileName = sanitizeName(String(entry?.fileName || '').trim(), documentName);
    const rawDownloadUrl = String(entry?.downloadURL || '').trim();
    const rawFilePath = String(entry?.filePath || '').trim();
    const inlineMode = String(entry?.inlineMode || '').trim();
    const inlineRows = Array.isArray(entry?.inlineRows) ? entry.inlineRows : [];
    const inlineSections = Array.isArray(entry?.inlineSections) ? entry.inlineSections : [];
    const bucket = getStorage().bucket();
    const candidatePaths = [rawFilePath, parseStoragePathFromDownloadUrl(rawDownloadUrl)].filter(Boolean);
    let fileBuffer: Buffer | null = null;
    let contentType = 'application/octet-stream';

    if (inlineMode === 'cs-summary-pdf' && inlineSections.length > 0) {
      fileBuffer = await buildCsSummaryPdfFromSections(
        documentName || 'CS Member Summary',
        inlineSections
      );
      contentType = 'application/pdf';
    } else if (inlineMode === 'cs-summary-pdf' && inlineRows.length > 0) {
      fileBuffer = await buildCsSummaryPdfFromRows(documentName || 'CS Member Summary', inlineRows);
      contentType = 'application/pdf';
    }

    for (const candidate of candidatePaths) {
      if (fileBuffer) break;
      try {
        const [bytes] = await bucket.file(candidate).download();
        fileBuffer = bytes;
        const [meta] = await bucket.file(candidate).getMetadata().catch(() => [null as any]);
        contentType = String(meta?.contentType || contentType);
        break;
      } catch {
        // try next
      }
    }

    const fetchableUrl = toFetchableUrl(rawDownloadUrl, request);
    const isAppPrintableHtmlRoute =
      /\/forms\/kaiser-referral\/printable/i.test(rawDownloadUrl) ||
      /\/admin\/kaiser-referral-generator\/printable/i.test(rawDownloadUrl) ||
      /\/admin\/forms\/cs-summary-printable/i.test(rawDownloadUrl);
    if (!fileBuffer && fetchableUrl && !isAppPrintableHtmlRoute) {
      const response = await fetch(fetchableUrl);
      if (response.ok) {
        const arr = await response.arrayBuffer();
        fileBuffer = Buffer.from(arr);
        contentType = String(response.headers.get('content-type') || contentType);
      }
    }

    if (!fileBuffer) {
      return NextResponse.json({ success: false, error: 'Could not load file bytes' }, { status: 422 });
    }

    const fileName = ensureExtension(baseFileName, contentType);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to download file') },
      { status: 500 }
    );
  }
}
