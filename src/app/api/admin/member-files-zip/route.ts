import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { getStorage } from 'firebase-admin/storage';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  buildCsSummaryPdfFromRows,
  buildCsSummaryPdfFromSections,
} from '@/lib/cs-summary-download-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ZipEntry = {
  category?: string;
  documentName?: string;
  fileName?: string;
  downloadURL?: string;
  filePath?: string;
  inlineContent?: string;
  inlineMimeType?: string;
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

const splitNameAndExtension = (name: string): { stem: string; extension: string } => {
  const trimmed = String(name || '').trim();
  const match = trimmed.match(/^(.*?)(\.[a-z0-9]{2,8})$/i);
  if (!match) return { stem: trimmed || 'file', extension: '' };
  return { stem: match[1] || 'file', extension: match[2] || '' };
};

const allocateUniqueZipName = (desiredName: string, usedNames: Map<string, number>): string => {
  const { stem, extension } = splitNameAndExtension(desiredName);
  const baseKey = `${stem.toLowerCase()}${extension.toLowerCase()}`;
  const nextIndex = (usedNames.get(baseKey) || 0) + 1;
  usedNames.set(baseKey, nextIndex);
  // First keeps plain name; later copies: Proof of Income2.pdf, Proof of Income3.pdf
  if (nextIndex === 1) return `${stem}${extension}`;
  return `${stem}${nextIndex}${extension}`;
};

/**
 * When several ZIP entries share the same base name, rename the whole group to
 * stem1.ext, stem2.ext, … so every file is clearly distinct (e.g. Proof of Income1.pdf).
 */
const finalizeDistinctZipNames = (baseNames: string[]): string[] => {
  const counts = new Map<string, number>();
  for (const name of baseNames) {
    const key = String(name || '').trim().toLowerCase() || 'file';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const seen = new Map<string, number>();
  return baseNames.map((name) => {
    const trimmed = String(name || '').trim() || 'file';
    const key = trimmed.toLowerCase();
    const total = counts.get(key) || 1;
    const index = (seen.get(key) || 0) + 1;
    seen.set(key, index);
    if (total <= 1) return trimmed;
    const { stem, extension } = splitNameAndExtension(trimmed);
    return `${stem}${index}${extension}`;
  });
};

/** Prefer readable labels, but keep original upload stems so duplicate categories stay unique. */
const buildZipEntryBaseName = (opts: {
  memberLabel: string;
  documentName: string;
  fileName: string;
  mimeType: string;
}): string => {
  const documentLabel = sanitizeName(opts.documentName || 'Document', 'Document');
  const sourceWithExt = ensureExtension(
    sanitizeName(opts.fileName || documentLabel, documentLabel),
    opts.mimeType
  );
  const { stem: originalStem, extension } = splitNameAndExtension(sourceWithExt);
  const labelLower = opts.memberLabel.toLowerCase();
  const documentLower = documentLabel.toLowerCase();
  const originalLower = originalStem.toLowerCase();

  const originalIsGeneric =
    !originalStem ||
    originalLower === 'file' ||
    originalLower === 'document' ||
    originalLower === documentLower ||
    /^screen.?shot/i.test(originalStem) ||
    /^image\b/i.test(originalStem) ||
    /^img[_-]?\d+/i.test(originalStem) ||
    /^photo/i.test(originalStem);

  // Original already carries member + document + unique suffix (or a distinctive source name).
  if (!originalIsGeneric) {
    if (
      originalLower.startsWith(labelLower) ||
      originalLower.includes(documentLower) ||
      /\d{6,}/.test(originalStem) ||
      /statements?/i.test(originalStem)
    ) {
      if (originalLower === labelLower || originalLower.startsWith(`${labelLower} - `) || originalLower.startsWith(`${labelLower}_`)) {
        return sanitizeName(`${originalStem}${extension}`, `${documentLabel}${extension || '.bin'}`);
      }
      if (opts.memberLabel) {
        return sanitizeName(
          `${opts.memberLabel} - ${documentLabel} - ${originalStem}${extension}`,
          `${documentLabel}${extension || '.bin'}`
        );
      }
      return sanitizeName(`${documentLabel} - ${originalStem}${extension}`, `${documentLabel}${extension || '.bin'}`);
    }
  }

  const alreadyLabeled =
    documentLower === labelLower ||
    documentLower.startsWith(`${labelLower} - `) ||
    documentLower.startsWith(`${labelLower}_`);
  const parts: string[] = [];
  if (!alreadyLabeled && opts.memberLabel) parts.push(opts.memberLabel);
  parts.push(documentLabel);
  return sanitizeName(`${parts.join(' - ')}${extension}`, `${documentLabel}${extension || '.bin'}`);
};

const buildPdfFromRows = buildCsSummaryPdfFromRows;
const buildPdfFromSections = buildCsSummaryPdfFromSections;

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: false, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await request.json().catch(() => ({}));
    const entries = Array.isArray(body?.entries) ? (body.entries as ZipEntry[]) : [];
    const zipFileName = sanitizeName(String(body?.zipFileName || '').trim() || 'member-files.zip', 'member-files.zip');
    const memberFirstName = sanitizeName(String(body?.memberFirstName || '').trim(), '');
    const memberLastName = sanitizeName(String(body?.memberLastName || '').trim(), '');
    const memberMrn = sanitizeName(String(body?.memberMrn || '').trim(), '');
    const memberLabelParts = [
      [memberLastName, memberFirstName].filter(Boolean).join(', ').trim() || 'Member',
      memberMrn || '',
    ].filter(Boolean);
    const memberLabel = memberLabelParts.join(' - ');

    if (!entries.length) {
      return NextResponse.json({ success: false, error: 'No files provided for ZIP' }, { status: 400 });
    }

    const zip = new JSZip();
    const usedNames = new Map<string, number>();
    let downloadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedNames: string[] = [];
    const preparedEntries: Array<{ buffer: Buffer; baseName: string; documentName: string; mimeType: string }> =
      [];

    const bucket = getStorage().bucket();

    for (const entry of entries) {
      const documentName = sanitizeName(String(entry?.documentName || '').trim() || 'file', 'file');
      const fileName = sanitizeName(String(entry?.fileName || '').trim() || documentName, documentName);
      const downloadURL = String(entry?.downloadURL || '').trim();
      const filePath = String(entry?.filePath || '').trim();
      const inlineContent = String(entry?.inlineContent || '');
      const inlineMimeType = String(entry?.inlineMimeType || '').trim();
      const inlineMode = String(entry?.inlineMode || '').trim();
      const inlineRows = Array.isArray(entry?.inlineRows) ? entry.inlineRows : [];
      const inlineSections = Array.isArray(entry?.inlineSections) ? entry.inlineSections : [];
      try {
        let buffer: Buffer | null = null;
        let mimeType = 'application/octet-stream';

        if (inlineMode === 'cs-summary-pdf' && inlineSections.length > 0) {
          buffer = await buildPdfFromSections(
            documentName || 'CS Member Summary Printable',
            inlineSections
          );
          mimeType = 'application/pdf';
        } else if (inlineMode === 'cs-summary-pdf' && inlineRows.length > 0) {
          buffer = await buildPdfFromRows(documentName || 'CS Member Summary Printable', inlineRows);
          mimeType = 'application/pdf';
        } else if (inlineContent) {
          buffer = Buffer.from(inlineContent, 'utf8');
          mimeType = inlineMimeType || 'text/plain';
        }

        const candidates = [filePath, parseStoragePathFromDownloadUrl(downloadURL)].filter(Boolean);

        for (const candidate of candidates) {
          if (buffer) break;
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
        // Never zip app printable/HTML routes (e.g. Kaiser referral generator page) — they are not documents.
        const isAppPrintableHtmlRoute =
          /\/forms\/kaiser-referral\/printable/i.test(downloadURL) ||
          /\/admin\/kaiser-referral-generator\/printable/i.test(downloadURL) ||
          /\/admin\/forms\/cs-summary-printable/i.test(downloadURL);
        if (!buffer && fetchableUrl && !isAppPrintableHtmlRoute) {
          const response = await fetch(fetchableUrl);
          if (response.ok) {
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            // Skip HTML page payloads that would produce unreadable .html "documents".
            if (contentType.includes('text/html')) {
              skippedCount += 1;
              failedNames.push(fileName);
              continue;
            }
            const arr = await response.arrayBuffer();
            buffer = Buffer.from(arr);
            mimeType = contentType || mimeType;
          }
        }

        if (!buffer) {
          skippedCount += 1;
          failedNames.push(fileName);
          continue;
        }

        const baseName = buildZipEntryBaseName({
          memberLabel,
          documentName,
          fileName,
          mimeType,
        });
        preparedEntries.push({ buffer, baseName, documentName, mimeType });
      } catch {
        failedCount += 1;
        failedNames.push(fileName);
      }
    }

    // Multiple uploads of the same form (e.g. Proof of Income x3) share one labeled base
    // so finalizeDistinctZipNames can emit Proof of Income1 / Proof of Income2 / …
    const documentCounts = new Map<string, number>();
    for (const row of preparedEntries) {
      const key = row.documentName.toLowerCase();
      documentCounts.set(key, (documentCounts.get(key) || 0) + 1);
    }
    const normalizedBaseNames = preparedEntries.map((row) => {
      if ((documentCounts.get(row.documentName.toLowerCase()) || 0) <= 1) return row.baseName;
      return buildZipEntryBaseName({
        memberLabel,
        documentName: row.documentName,
        fileName: row.documentName,
        mimeType: row.mimeType,
      });
    });

    const distinctNames = finalizeDistinctZipNames(normalizedBaseNames);
    preparedEntries.forEach((row, index) => {
      // Safety net if finalize somehow collides (shouldn't).
      const finalName = allocateUniqueZipName(distinctNames[index] || row.baseName, usedNames);
      zip.file(finalName, row.buffer);
      downloadedCount += 1;
    });

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
