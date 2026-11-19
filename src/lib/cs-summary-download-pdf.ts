type WidthMeasuringFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

export type CsSummaryPdfSection = {
  title?: string;
  rows?: Array<{ label?: string; value?: string }>;
};

/** Helvetica/WinAnsi cannot encode bullets/smart punctuation — strip before drawText. */
const pdfSafeText = (value: unknown) =>
  String(value ?? '')
    .replace(/\u2022/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\n\r\t]/g, '?')
    .trim();

const wrapTextToWidth = (
  text: string,
  maxWidth: number,
  font: WidthMeasuringFont,
  fontSize: number
): string[] => {
  const normalized = pdfSafeText(text);
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

export async function buildCsSummaryPdfFromRows(
  title: string,
  rows: Array<{ label?: string; value?: string }>
): Promise<Buffer> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]);
  let y = 750;
  const marginX = 42;
  const lineHeight = 18;

  page.drawText(pdfSafeText(title) || 'CS Member Summary', { x: marginX, y, size: 16, font: boldFont });
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
      label: pdfSafeText(row?.label),
      value: pdfSafeText(row?.value),
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
}

export async function buildCsSummaryPdfFromSections(
  title: string,
  sections: CsSummaryPdfSection[]
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const marginX = 42;
  const topY = 718;
  const bottomY = 54;
  const labelX = marginX;
  const valueX = 230;
  const labelWidth = valueX - labelX - 8;
  const valueWidth = pageSize[0] - marginX - valueX;
  const generatedAt = new Date().toLocaleString();

  const getSectionRows = (sectionName: string) =>
    (sections.find((section) => String(section?.title || '').trim() === sectionName)?.rows || []).map((row) => ({
      label: String(row?.label || '').trim(),
      value: String(row?.value || '').trim(),
    }));
  const memberRows = getSectionRows('Member');
  const memberName =
    pdfSafeText(memberRows.find((row) => row.label === 'Member Name')?.value) || 'Unknown member';
  const memberMrn = pdfSafeText(memberRows.find((row) => row.label === 'MRN')?.value) || 'Unknown MRN';
  const safeTitle = pdfSafeText(title) || 'CS Member Summary (Filled Printable)';

  let page = pdfDoc.addPage(pageSize);
  let y = topY;

  const drawPageHeader = (targetPage: (typeof page)) => {
    targetPage.drawText(safeTitle, { x: marginX, y: 762, size: 11, font: boldFont });
    targetPage.drawText(`Member: ${memberName}  |  MRN: ${memberMrn}`, {
      x: marginX,
      y: 748,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    targetPage.drawText(`Generated: ${pdfSafeText(generatedAt)}`, {
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
  page.drawText(safeTitle, { x: marginX, y, size: 16, font: boldFont });
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
    const sectionTitle = pdfSafeText(section?.title);
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    const normalizedRows = rows
      .map((row) => ({
        label: pdfSafeText(row?.label),
        value: pdfSafeText(row?.value),
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
      const labelLines = wrapTextToWidth(`${row.label}:`, labelWidth, boldFont, 10);
      const valueLines = wrapTextToWidth(row.value, valueWidth, font, 10);
      const rowHeight = Math.max(16, Math.max(labelLines.length, valueLines.length) * 12 + 4);
      ensureSpace(rowHeight);
      labelLines.forEach((line, index) => {
        page.drawText(line, { x: labelX, y: y - index * 12, size: 10, font: boldFont });
      });
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
}
