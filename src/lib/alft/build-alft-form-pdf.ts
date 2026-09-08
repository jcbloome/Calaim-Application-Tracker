import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { EXACT_ALFT_PAGES, type ExactAlftQuestion } from '@/lib/alft/exact-alft-pages-data';

const clean = (value: unknown) => String(value || '').trim();

/** Tier rates stay in-app / download logs only — never in the official ISP packet PDF. */
const EXCLUDE_FROM_PACKET_IDS = new Set([
  'p14_rn_recommended_tier',
  'p14_admin_approved_tier',
]);

const PAGE_LAYOUT: Array<{ number: number; sourceId: string; prefix: string; title: string }> = [
  { number: 1, sourceId: 'page1', prefix: 'p1_', title: 'Header Information + Demographic' },
  { number: 2, sourceId: 'page2', prefix: 'p2_', title: 'Addresses, Site, Risk, Living Situation, Income' },
  { number: 3, sourceId: 'page3', prefix: 'p3_', title: 'Memory and Cognitive Questions' },
  { number: 4, sourceId: 'page4_6', prefix: 'p4_', title: 'GENERAL HEALTH, SENSORY, AND COMMUNICATION' },
  { number: 5, sourceId: 'page4_6', prefix: 'p5_', title: 'ACTIVITIES OF DAILY LIVING' },
  { number: 6, sourceId: 'page4_6', prefix: 'p6_', title: 'INSTRUMENTAL ACTIVITIES OF DAILY LIVING' },
  { number: 7, sourceId: 'page7_8', prefix: 'p7_', title: 'HEALTH CONDITIONS AND THERAPIES' },
  { number: 8, sourceId: 'page7_8', prefix: 'p8_', title: 'Therapies + Specialty Care' },
  { number: 9, sourceId: 'page9_10', prefix: 'p9_', title: 'MENTAL HEALTH' },
  { number: 10, sourceId: 'page9_10', prefix: 'p10_', title: 'NUTRITION' },
  { number: 11, sourceId: 'page11_12', prefix: 'p11_', title: 'MEDICATION AND SUBSTANCE USE' },
  { number: 12, sourceId: 'page11_12', prefix: 'p12_', title: 'Self-Reported Health + Vision/Hearing' },
  { number: 13, sourceId: 'page13_14', prefix: 'p13_', title: 'MEDICATIONS + SIGNATURES' },
];

const formatLabel = (label: string) => {
  const raw = clean(label);
  const qMatch = raw.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qMatch) return `${qMatch[1]}. ${qMatch[2]}`;
  const nMatch = raw.match(/^(\d+)\.\s*(.+)$/);
  if (nMatch) return `${nMatch[1]}. ${nMatch[2]}`;
  return raw;
};

const answerText = (value: unknown, question?: ExactAlftQuestion) => {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        const raw = clean(v);
        const opt = question?.options?.find((o) => o.value === raw);
        return opt?.label || raw;
      })
      .filter(Boolean)
      .join(', ');
  }
  const raw = clean(value);
  if (!raw) return '';
  const opt = question?.options?.find((o) => o.value === raw);
  return opt?.label || raw;
};

const wrapLines = (text: string, maxChars: number): string[] => {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  if (!raw) return [''];
  const out: string[] = [];
  for (const paragraph of raw.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= maxChars) {
        line = next;
      } else {
        if (line) out.push(line);
        if (word.length <= maxChars) {
          line = word;
        } else {
          for (let i = 0; i < word.length; i += maxChars) {
            out.push(word.slice(i, i + maxChars));
          }
          line = '';
        }
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
};

export async function buildAlftFormPdfFromAnswers(args: {
  answers: Record<string, unknown>;
  memberName?: string | null;
  memberMrn?: string | null;
}): Promise<Buffer> {
  const answers = args.answers || {};
  const memberName =
    clean(args.memberName) || clean(answers.p1_member_name) || 'Member';
  const memberMrn = clean(args.memberMrn) || clean(answers.p1_mrn) || clean(answers.p1_plan_id);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.06, 0.09, 0.14);
  const mid = rgb(0.25, 0.28, 0.32);
  const rule = rgb(0.78, 0.82, 0.86);

  const marginX = 40;
  const pageWidth = 612;
  const pageHeight = 792;
  const contentWidth = pageWidth - marginX * 2;
  const bottomY = 48;
  const lineH = 11;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 42;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - 42;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < bottomY) newPage();
  };

  const drawText = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number }
  ) => {
    const size = opts.size ?? 9;
    const f = opts.bold ? fontBold : font;
    const color = opts.color ?? dark;
    const x = opts.x ?? marginX;
    const maxW = opts.maxWidth ?? contentWidth;
    const maxChars = Math.max(24, Math.floor(maxW / (size * 0.52)));
    const lines = wrapLines(text, maxChars);
    for (const line of lines) {
      ensureSpace(lineH + 2);
      page.drawText(line || ' ', { x, y, size, font: f, color, maxWidth: maxW });
      y -= lineH;
    }
  };

  const drawHeader = (layoutNumber: number, title: string) => {
    ensureSpace(70);
    page.drawText('ALF TRANSITION ASSESSMENT', {
      x: marginX,
      y,
      size: 13,
      font: fontBold,
      color: dark,
    });
    y -= 16;
    page.drawText(`${memberName}${memberMrn ? `  •  MRN: ${memberMrn}` : ''}`, {
      x: marginX,
      y,
      size: 9,
      font,
      color: mid,
    });
    page.drawText(`Page ${layoutNumber} of ${PAGE_LAYOUT.length}`, {
      x: pageWidth - marginX - 90,
      y,
      size: 8,
      font,
      color: mid,
    });
    y -= 14;
    page.drawRectangle({
      x: marginX,
      y: y - 2,
      width: contentWidth,
      height: 16,
      color: rgb(0.06, 0.55, 0.71),
    });
    page.drawText(title.toUpperCase(), {
      x: marginX + 6,
      y: y + 2,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    y -= 22;
  };

  for (const layout of PAGE_LAYOUT) {
    if (layout.number > 1) newPage();
    drawHeader(layout.number, layout.title);

    const source = EXACT_ALFT_PAGES.find((p) => p.id === layout.sourceId);
    const questions = (source?.questions || []).filter(
      (q) => q.id.startsWith(layout.prefix) && !EXCLUDE_FROM_PACKET_IDS.has(q.id)
    );

    for (const q of questions) {
      const value = answerText(answers[q.id], q);
      const label = formatLabel(q.label);
      const isLong = q.type === 'textarea' || label.toLowerCase().includes('notes') || label.toLowerCase().includes('commentary');
      ensureSpace(isLong ? 48 : 28);
      drawText(label, { size: 8, bold: true, color: mid });
      if (value) {
        drawText(value, { size: isLong ? 9 : 9, bold: false, color: dark });
      } else {
        page.drawLine({
          start: { x: marginX, y: y + 2 },
          end: { x: marginX + contentWidth, y: y + 2 },
          thickness: 0.6,
          color: rule,
        });
        y -= 10;
      }
      y -= 4;
    }

    if (layout.number === 13) {
      ensureSpace(120);
      y -= 6;
      page.drawRectangle({
        x: marginX,
        y: y - 2,
        width: contentWidth,
        height: 16,
        color: rgb(0.06, 0.55, 0.71),
      });
      page.drawText('SIGNATURE SECTION', {
        x: marginX + 6,
        y: y + 2,
        size: 9,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      y -= 24;

      const mswName = clean(answers.p14_print_name) || clean(answers.p1_assessor_name);
      const mswDate = clean(answers.p14_date);
      const mswSigned = clean(answers.p14_sw_signed_at) || clean(answers.p14_electronic_notice);
      const rnName = clean(answers.p14_rn_print_name);
      const rnLicense = clean(answers.p14_license_number);
      const rnSigned = clean(answers.p14_rn_signed_at);

      drawText('MSW Signature', { size: 10, bold: true });
      drawText(`Print name: ${mswName || '—'}`, { size: 9 });
      drawText(`Date: ${mswDate || '—'}`, { size: 9 });
      drawText(
        mswSigned
          ? `Electronic signature: ${mswSigned.startsWith('Electronically') ? mswSigned : `Electronically signed on ${mswSigned}`}`
          : 'Electronic signature: Pending',
        { size: 8, color: mid }
      );
      y -= 8;
      drawText('RN Signature', { size: 10, bold: true });
      drawText(`Print name: ${rnName || '—'}`, { size: 9 });
      drawText(`License number: ${rnLicense || '—'}`, { size: 9 });
      drawText(
        rnSigned
          ? `Electronic signature: Electronically signed on ${rnSigned}`
          : 'Electronic signature: Pending',
        { size: 8, color: mid }
      );
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export async function appendPdfBytes(base: Buffer, appendix: Buffer | null | undefined): Promise<Buffer> {
  if (!appendix?.length) return base;
  try {
    const out = await PDFDocument.load(base);
    const extra = await PDFDocument.load(appendix);
    const pages = await out.copyPages(extra, extra.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    return Buffer.from(await out.save());
  } catch {
    return base;
  }
}
