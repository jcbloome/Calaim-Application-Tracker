import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DownloadEntry = {
  category?: string;
  documentName?: string;
  fileName?: string;
  downloadURL?: string;
  filePath?: string;
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
    const isAuthorizationRequestSheet = category.toLowerCase() === 'authorization request sheet';

    if (isAuthorizationRequestSheet) {
      const safeUrl = rawDownloadUrl || '';
      const content = ['[InternetShortcut]', `URL=${safeUrl}`].join('\r\n');
      const fileName = ensureExtension(baseFileName, 'text/plain').replace(/\.(txt|bin)$/i, '.url');
      return new NextResponse(Buffer.from(content, 'utf-8'), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const bucket = getStorage().bucket();
    const candidatePaths = [rawFilePath, parseStoragePathFromDownloadUrl(rawDownloadUrl)].filter(Boolean);
    let fileBuffer: Buffer | null = null;
    let contentType = 'application/octet-stream';

    for (const candidate of candidatePaths) {
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

    if (!fileBuffer && rawDownloadUrl) {
      const response = await fetch(rawDownloadUrl);
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
