import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ZipEntry = {
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
    const entries = Array.isArray(body?.entries) ? (body.entries as ZipEntry[]) : [];
    const zipFileName = sanitizeName(String(body?.zipFileName || '').trim() || 'member-files.zip', 'member-files.zip');

    if (!entries.length) {
      return NextResponse.json({ success: false, error: 'No files provided for ZIP' }, { status: 400 });
    }

    const zip = new JSZip();
    const usedNames = new Map<string, number>();
    let downloadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedNames: string[] = [];

    const bucket = getStorage().bucket();

    for (const entry of entries) {
      const category = sanitizeName(String(entry?.category || '').trim() || 'Application files', 'Application files');
      const documentName = sanitizeName(String(entry?.documentName || '').trim() || 'file', 'file');
      const fileName = sanitizeName(String(entry?.fileName || '').trim() || documentName, documentName);
      const downloadURL = String(entry?.downloadURL || '').trim();
      const filePath = String(entry?.filePath || '').trim();
      try {
        let buffer: Buffer | null = null;
        let mimeType = 'application/octet-stream';
        const candidates = [filePath, parseStoragePathFromDownloadUrl(downloadURL)].filter(Boolean);

        for (const candidate of candidates) {
          try {
            const [bytes] = await bucket.file(candidate).download();
            buffer = bytes;
            const [meta] = await bucket.file(candidate).getMetadata().catch(() => [null as any]);
            mimeType = String(meta?.contentType || mimeType);
            break;
          } catch {
            // continue
          }
        }

        const fetchableUrl = toFetchableUrl(downloadURL, request);
        if (!buffer && fetchableUrl) {
          const response = await fetch(fetchableUrl);
          if (response.ok) {
            const arr = await response.arrayBuffer();
            buffer = Buffer.from(arr);
            mimeType = String(response.headers.get('content-type') || mimeType);
          }
        }

        if (!buffer) {
          skippedCount += 1;
          failedNames.push(fileName);
          continue;
        }

        const baseName = ensureExtension(fileName, mimeType);
        const zipName = `${category} - ${baseName}`;
        const key = zipName.toLowerCase();
        const dupCount = usedNames.get(key) || 0;
        usedNames.set(key, dupCount + 1);
        const finalName = dupCount === 0 ? zipName : zipName.replace(/(\.[a-z0-9]{2,8})$/i, ` (${dupCount + 1})$1`);
        zip.file(finalName, buffer);
        downloadedCount += 1;
      } catch {
        failedCount += 1;
        failedNames.push(fileName);
      }
    }

    if (downloadedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No files could be added to ZIP',
          failed: failedNames.slice(0, 20),
        },
        { status: 422 }
      );
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFileName.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
        'x-downloaded-count': String(downloadedCount),
        'x-skipped-count': String(skippedCount),
        'x-failed-count': String(failedCount),
        'x-failed-files': failedNames.slice(0, 10).join(', '),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to create ZIP'),
      },
      { status: 500 }
    );
  }
}
