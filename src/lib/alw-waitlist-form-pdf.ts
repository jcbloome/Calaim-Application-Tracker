import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ALW_WAITLIST_CCA_NAME, type AlwWaitlistMemberRow } from '@/lib/alw-waitlist';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.35, 0.35, 0.35);

const sanitize = (value: unknown) =>
  String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
    .trim();

function yesNo(value: unknown): 'Yes' | 'No' | '' {
  const raw = sanitize(value).toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(raw)) return 'Yes';
  if (['n', 'no', 'false', '0'].includes(raw)) return 'No';
  return '';
}

function isMale(value: unknown) {
  const raw = sanitize(value).toLowerCase();
  return raw === 'm' || raw.startsWith('male') || raw === 'man';
}

function isFemale(value: unknown) {
  const raw = sanitize(value).toLowerCase();
  return raw === 'f' || raw.startsWith('female') || raw === 'woman';
}

function residenceChecked(row: AlwWaitlistMemberRow, label: string) {
  const current = sanitize(row.currentResidence).toLowerCase();
  const needle = label.toLowerCase();
  if (!current) return false;
  if (needle.includes('acute') && current.includes('acute')) return true;
  if (needle.includes('at home') && current.includes('at home')) return true;
  if (needle.includes('homeless') && current.includes('homeless')) return true;
  if (needle.includes('rcfe') && current.includes('rcfe')) return true;
  if (needle.includes('skilled') && current.includes('skilled')) return true;
  if (needle.includes('other') && current.includes('other')) return true;
  return false;
}

export function alwWaitlistFormFileName(row: AlwWaitlistMemberRow): string {
  const name = sanitize(row.memberName || `${row.memberLastName}_${row.memberFirstName}` || 'member')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  const id = sanitize(row.mediCalNumber || row.clientId2 || 'id')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 24);
  return `ALW_Waitlist_${name || 'member'}_${id || 'id'}.pdf`;
}

/** Filled DHCS-style Assisted Living Waiver Waitlist Request PDF for one member. */
export async function buildAlwWaitlistFormPdfBytes(row: AlwWaitlistMemberRow): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = PAGE_H - MARGIN_TOP;

  const drawText = (
    text: string,
    x: number,
    size: number,
    options?: { bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number }
  ) => {
    const used = options?.bold ? bold : font;
    const color = options?.color || BLACK;
    const value = sanitize(text);
    try {
      page.drawText(value || ' ', {
        x,
        y,
        size,
        font: used,
        color,
        ...(options?.maxWidth ? { maxWidth: options.maxWidth } : {}),
      });
    } catch {
      page.drawText((value || ' ').replace(/[^\x20-\x7E]/g, ''), {
        x,
        y,
        size,
        font: used,
        color,
      });
    }
  };

  const line = (fromX: number, toX: number, thickness = 0.7) => {
    page.drawLine({
      start: { x: fromX, y },
      end: { x: toX, y },
      thickness,
      color: BLACK,
    });
  };

  const checkbox = (x: number, checked: boolean, label: string, labelSize = 9) => {
    const box = 9;
    page.drawRectangle({
      x,
      y: y - 1,
      width: box,
      height: box,
      borderWidth: 0.9,
      borderColor: BLACK,
    });
    if (checked) {
      drawText('X', x + 1.6, 8, { bold: true });
    }
    drawText(label, x + box + 4, labelSize);
  };

  const fieldRow = (
    label: string,
    value: string,
    options?: { labelWidth?: number; valueWidth?: number }
  ) => {
    const labelWidth = options?.labelWidth ?? 120;
    drawText(label, MARGIN_X, 9, { bold: true });
    const valueX = MARGIN_X + labelWidth;
    const valueWidth = options?.valueWidth ?? PAGE_W - MARGIN_X - valueX - 8;
    const text = sanitize(value);
    drawText(text, valueX + 2, 9, { maxWidth: valueWidth - 4 });
    const underlineY = y - 2;
    page.drawLine({
      start: { x: valueX, y: underlineY },
      end: { x: valueX + valueWidth, y: underlineY },
      thickness: 0.6,
      color: BLACK,
    });
    y -= 16;
  };

  // Header (ASCII-only strings for Helvetica)
  drawText('State of California - Health and Human Services Agency', MARGIN_X, 8, {
    color: GRAY,
  });
  y -= 11;
  drawText('Department of Health Care Services', MARGIN_X, 8, { color: GRAY });
  y -= 16;
  drawText('Assisted Living Waiver Waitlist Request', MARGIN_X, 14, { bold: true });
  y -= 10;
  line(MARGIN_X, PAGE_W - MARGIN_X, 1.2);
  y -= 18;

  // Member identity
  fieldRow("Member's Name", row.memberName || `${row.memberLastName}, ${row.memberFirstName}`.trim(), {
    labelWidth: 95,
  });
  fieldRow('Home Phone', row.homePhone, { labelWidth: 95 });
  fieldRow('Date of Birth', row.dateOfBirth, { labelWidth: 95 });

  drawText('Gender', MARGIN_X, 9, { bold: true });
  checkbox(MARGIN_X + 55, isMale(row.gender), 'Male');
  checkbox(MARGIN_X + 120, isFemale(row.gender), 'Female');
  y -= 16;

  drawText('Married', MARGIN_X, 9, { bold: true });
  checkbox(MARGIN_X + 55, yesNo(row.maritalStatusMarried) === 'Yes', 'Yes');
  checkbox(MARGIN_X + 105, yesNo(row.maritalStatusMarried) === 'No', 'No');
  y -= 16;

  fieldRow('9-Digit Medi-Cal Number', row.mediCalNumber, { labelWidth: 145 });
  fieldRow('Address', row.address, { labelWidth: 55 });

  // City / State / Zip on one visual row (from RCFE_*)
  {
    const cityState = [sanitize(row.city), sanitize(row.state)].filter(Boolean).join(', ');
    drawText('City', MARGIN_X, 9, { bold: true });
    const cityX = MARGIN_X + 35;
    drawText(cityState, cityX + 2, 9, { maxWidth: 250 });
    page.drawLine({
      start: { x: cityX, y: y - 2 },
      end: { x: cityX + 260, y: y - 2 },
      thickness: 0.6,
      color: BLACK,
    });
    drawText('Zip', MARGIN_X + 320, 9, { bold: true });
    const zipX = MARGIN_X + 345;
    drawText(row.zip, zipX + 2, 9, { maxWidth: 120 });
    page.drawLine({
      start: { x: zipX, y: y - 2 },
      end: { x: zipX + 120, y: y - 2 },
      thickness: 0.6,
      color: BLACK,
    });
    y -= 16;
  }

  fieldRow('County in which the applicant currently resides', row.county, { labelWidth: 265 });
  fieldRow('Care Coordination Agency (CCA) Name', row.ccaName || ALW_WAITLIST_CCA_NAME, {
    labelWidth: 210,
  });

  y -= 4;
  drawText('Where is the applicant currently residing?', MARGIN_X, 9, { bold: true });
  y -= 14;

  const residences: Array<{ label: string; key: string }> = [
    { label: 'Acute Hospital', key: 'Acute Hospital' },
    { label: 'At Home', key: 'At Home' },
    { label: 'Homeless', key: 'Homeless' },
    { label: 'Residential Care Facility for the Elderly (RCFE)', key: 'RCFE' },
    { label: 'Skilled Nursing', key: 'Skilled Nursing' },
  ];
  residences.forEach((item) => {
    checkbox(MARGIN_X, residenceChecked(row, item.key), item.label);
    y -= 13;
  });
  checkbox(MARGIN_X, residenceChecked(row, 'Other'), 'Other (please specify):');
  const otherX = MARGIN_X + 145;
  drawText(row.currentResidenceOther, otherX + 2, 9, { maxWidth: 300 });
  page.drawLine({
    start: { x: otherX, y: y - 2 },
    end: { x: PAGE_W - MARGIN_X, y: y - 2 },
    thickness: 0.6,
    color: BLACK,
  });
  y -= 16;

  drawText("Who has the legal authority to make the applicant's health care decisions?", MARGIN_X, 9, {
    bold: true,
  });
  y -= 14;
  const authority = sanitize(row.legalAuthority).toLowerCase();
  const hasOtherAuthority = Boolean(authority && !authority.includes('applicant'));
  checkbox(MARGIN_X, !hasOtherAuthority, 'Applicant');
  y -= 13;
  checkbox(MARGIN_X, hasOtherAuthority, 'Other:');
  {
    const otherAuthX = MARGIN_X + 70;
    let authLines: string[] = [];
    if (hasOtherAuthority) {
      const nameLine = sanitize(row.authorizedPartyName)
        ? sanitize(row.authorizedPartyRelationship)
          ? `${sanitize(row.authorizedPartyName)} (${sanitize(row.authorizedPartyRelationship)})`
          : sanitize(row.authorizedPartyName)
        : sanitize(row.authorizedPartyRelationship)
          ? `Authorized party (${sanitize(row.authorizedPartyRelationship)})`
          : '';
      authLines = [
        nameLine,
        sanitize(row.authorizedPartyPhone) ? `Phone: ${sanitize(row.authorizedPartyPhone)}` : '',
        sanitize(row.authorizedPartyEmail) ? `Email: ${sanitize(row.authorizedPartyEmail)}` : '',
      ].filter(Boolean);
    } else {
      // No authorized party: put best contact on this line for Sierra outreach
      // (RCFE / member at RCFE / best contact), clearly labeled — not legal authority.
      const bestName = sanitize(row.bestContactName);
      const bestRel = sanitize(row.bestContactRelationship);
      const nameLine = bestName
        ? bestRel
          ? `Best contact: ${bestName} (${bestRel})`
          : `Best contact: ${bestName}`
        : bestRel
          ? `Best contact (${bestRel})`
          : sanitize(row.bestContactPhone) || sanitize(row.bestContactEmail)
            ? 'Best contact'
            : '';
      authLines = [
        nameLine,
        sanitize(row.bestContactPhone) ? `Phone: ${sanitize(row.bestContactPhone)}` : '',
        sanitize(row.bestContactEmail) ? `Email: ${sanitize(row.bestContactEmail)}` : '',
      ].filter(Boolean);
    }
    if (authLines.length === 0 && sanitize(row.legalAuthorityOther)) {
      authLines.push(sanitize(row.legalAuthorityOther));
    }
    if (authLines.length === 0) {
      page.drawLine({
        start: { x: otherAuthX, y: y - 2 },
        end: { x: PAGE_W - MARGIN_X, y: y - 2 },
        thickness: 0.6,
        color: BLACK,
      });
      y -= 16;
    } else {
      authLines.forEach((lineText, index) => {
        drawText(lineText, otherAuthX + 2, 9, { maxWidth: PAGE_W - MARGIN_X - otherAuthX - 8 });
        page.drawLine({
          start: { x: otherAuthX, y: y - 2 },
          end: { x: PAGE_W - MARGIN_X, y: y - 2 },
          thickness: 0.6,
          color: BLACK,
        });
        y -= index === authLines.length - 1 ? 16 : 13;
      });
    }
  }

  drawText('Was the legal representative notified of this request for the ALW waitlist?', MARGIN_X, 9, {
    bold: true,
  });
  y -= 14;
  checkbox(MARGIN_X, yesNo(row.legalRepresentativeNotified) === 'Yes', 'Yes');
  checkbox(MARGIN_X + 55, yesNo(row.legalRepresentativeNotified) === 'No', 'No');
  y -= 16;

  drawText('Is there Adult Protective Services or Long-Term Care Ombudsman Involvement?', MARGIN_X, 9, {
    bold: true,
  });
  y -= 14;
  checkbox(MARGIN_X, yesNo(row.apsOrOmbudsmanInvolvement) === 'Yes', 'Yes');
  checkbox(MARGIN_X + 55, yesNo(row.apsOrOmbudsmanInvolvement) !== 'Yes', 'No');
  y -= 12;
  drawText('If yes, please attach supporting documentation.', MARGIN_X, 8, { color: GRAY });
  y -= 16;

  drawText('Identify all current programs and services the applicant is receiving:', MARGIN_X, 9, {
    bold: true,
  });
  y -= 14;

  const programs = [
    'Adult Day Health Care',
    'Program of All Inclusive Care for the Elderly (PACE)',
    'Senior Care Action Network (SCAN)',
    'Hospice',
    'Regional Center',
  ];
  programs.forEach((label) => {
    checkbox(MARGIN_X, false, label);
    y -= 12;
  });

  checkbox(MARGIN_X, false, 'Home Health Agency');
  y -= 12;
  drawText('Hours per week:', MARGIN_X + 18, 8, { color: GRAY });
  page.drawLine({
    start: { x: MARGIN_X + 100, y: y - 2 },
    end: { x: MARGIN_X + 180, y: y - 2 },
    thickness: 0.5,
    color: BLACK,
  });
  y -= 12;
  drawText('Type of Services Received:', MARGIN_X + 18, 8, { color: GRAY });
  y -= 12;
  checkbox(MARGIN_X + 18, false, 'Attendant Care', 8);
  checkbox(MARGIN_X + 120, false, 'Certified Home Health Aide (CHHA)', 8);
  y -= 12;
  checkbox(MARGIN_X + 18, false, 'Nursing: RN', 8);
  checkbox(MARGIN_X + 110, false, 'Nursing: LVN', 8);
  y -= 13;

  checkbox(MARGIN_X, false, 'In-Home Support Services (IHSS)');
  y -= 12;
  drawText('Hours Authorized Per Month:', MARGIN_X + 18, 8, { color: GRAY });
  page.drawLine({
    start: { x: MARGIN_X + 155, y: y - 2 },
    end: { x: MARGIN_X + 240, y: y - 2 },
    thickness: 0.5,
    color: BLACK,
  });
  y -= 13;

  ['Multipurpose Senior Services Program (MSSP)', 'California Community Transitions (CCT)', 'Home and Community-Based Alternatives (HCBA) Waiver'].forEach(
    (label) => {
      checkbox(MARGIN_X, false, label);
      y -= 12;
    }
  );

  y -= 8;
  line(MARGIN_X, PAGE_W - MARGIN_X, 0.6);
  y -= 12;
  drawText(
    `Generated for Sierra CCA - ${ALW_WAITLIST_CCA_NAME} - ${new Date().toLocaleDateString('en-US')}`,
    MARGIN_X,
    7,
    { color: GRAY }
  );
  y -= 10;
  if (row.clientId2 || row.rcfeName) {
    drawText(
      [
        row.clientId2 ? `Client_ID2: ${row.clientId2}` : '',
        row.rcfeName ? `Facility: ${row.rcfeName}` : '',
      ]
        .filter(Boolean)
        .join('  |  '),
      MARGIN_X,
      7,
      { color: GRAY }
    );
  }

  return pdf.save();
}
