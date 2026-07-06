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

const buildPdfFromRows = async (
  title: string,
  rows: Array<{ label?: string; value?: string }>
): Promise<Buffer> => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  let y = 750;
  const marginX = 42;
  const lineHeight = 18;

  page.drawText(title, { x: marginX, y, size: 16, font: boldFont });
  y -= 28;
  page.drawText('Generated from application data for download package.', {
    x: marginX,
    y,
    size: 10,
    font,
  });
  y -= 22;

  const normalizedRows = rows
    .map((row) => ({
      label: String(row?.label || '').trim(),
      value: String(row?.value || '').trim(),
    }))
    .filter((row) => row.label && row.value);

  normalizedRows.forEach((row) => {
    if (y < 60) {
      page = pdfDoc.addPage([612, 792]);
      y = 750;
    }
    page.drawText(`${row.label}:`, { x: marginX, y, size: 10, font: boldFont });
    const valueText = row.value.length > 240 ? `${row.value.slice(0, 237)}...` : row.value;
    page.drawText(valueText, { x: marginX + 150, y, size: 10, font });
    y -= lineHeight;
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

type WidthMeasuringFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

const wrapTextToWidth = (
  text: string,
  maxWidth: number,
  font: WidthMeasuringFont,
  fontSize: number
): string[] => {
  const normalized = String(text || '').trim();
  if (!normalized) return [''];
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const buildPdfFromSections = async (
  title: string,
  sections: Array<{ title?: string; rows?: Array<{ label?: string; value?: string }> }>
): Promise<Buffer> => {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const marginX = 42;
  const topY = 718;
  const bottomY = 54;
  const labelX = marginX;
  const valueX = 210;
  const valueWidth = pageSize[0] - marginX - valueX;
  const generatedAt = new Date().toLocaleString();

  const getSectionRows = (sectionName: string) =>
    (sections.find((section) => String(section?.title || '').trim() === sectionName)?.rows || []).map((row) => ({
      label: String(row?.label || '').trim(),
      value: String(row?.value || '').trim(),
    }));
  const memberRows = getSectionRows('Member');
  const memberName = memberRows.find((row) => row.label === 'Member Name')?.value || 'Unknown member';
  const memberMrn = memberRows.find((row) => row.label === 'MRN')?.value || 'Unknown MRN';

  let page = pdfDoc.addPage(pageSize);
  let y = topY;

  const drawPageHeader = (targetPage: (typeof page)) => {
    targetPage.drawText(title, { x: marginX, y: 762, size: 11, font: boldFont });
    targetPage.drawText(`Member: ${memberName}  •  MRN: ${memberMrn}`, {
      x: marginX,
      y: 748,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    targetPage.drawText(`Generated: ${generatedAt}`, {
      x: pageSize[0] - marginX - 180,
      y: 748,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    targetPage.drawLine({
      start: { x: marginX, y: 738 },
      end: { x: pageSize[0] - marginX, y: 738 },
      thickness: 0.7,
      color: rgb(0.82, 0.82, 0.82),
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed >= bottomY) return;
    page = pdfDoc.addPage(pageSize);
    drawPageHeader(page);
    y = topY;
  };

  drawPageHeader(page);
  page.drawText(title, { x: marginX, y, size: 16, font: boldFont });
  y -= 24;
  page.drawText('Generated from application data for download package.', {
    x: marginX,
    y,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 22;

  for (const section of sections) {
    const sectionTitle = String(section?.title || '').trim();
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    const normalizedRows = rows
      .map((row) => ({
        label: String(row?.label || '').trim(),
        value: String(row?.value || '').trim(),
      }))
      .filter((row) => row.label && row.value);
    if (!normalizedRows.length) continue;

    if (sectionTitle) {
      ensureSpace(18);
      page.drawText(sectionTitle, { x: marginX, y, size: 12, font: boldFont });
      y -= 6;
      page.drawLine({
        start: { x: marginX, y },
        end: { x: pageSize[0] - marginX, y },
        thickness: 0.7,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 14;
    }

    for (const row of normalizedRows) {
      const valueLines = wrapTextToWidth(row.value, valueWidth, font, 10);
      const rowHeight = Math.max(16, valueLines.length * 12 + 4);
      ensureSpace(rowHeight);
      page.drawText(`${row.label}:`, { x: labelX, y, size: 10, font: boldFont });
      valueLines.forEach((line, index) => {
        page.drawText(line, { x: valueX, y: y - index * 12, size: 10, font });
      });
      y -= rowHeight;
    }

    y -= 12;
  }

  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i += 1) {
    const footerPage = pdfDoc.getPage(i);
    const footerText = `Page ${i + 1} of ${totalPages}`;
    const footerWidth = font.widthOfTextAtSize(footerText, 9);
    footerPage.drawText(footerText, {
      x: pageSize[0] - marginX - footerWidth,
      y: 24,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
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
    const memberFirstName = sanitizeName(String(body?.memberFirstName || '').trim(), '');
    const memberLastName = sanitizeName(String(body?.memberLastName || '').trim(), '');

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

        const sourceNameWithExt = ensureExtension(fileName, mimeType);
        const extMatch = sourceNameWithExt.match(/(\.[a-z0-9]{2,8})$/i);
        const extension = extMatch?.[1] || '';
        const memberPrefix = [memberLastName, memberFirstName].filter(Boolean).join(' ').trim();
        const baseLabel = [memberPrefix || 'Member', documentName || 'Document'].filter(Boolean).join(' - ').trim();
        const baseName = sanitizeName(`${baseLabel}${extension}`, `${documentName || 'document'}${extension || ''}`);
        const zipName = baseName;
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
