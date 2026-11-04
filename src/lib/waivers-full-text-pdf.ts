import type { CsSummaryPdfSection } from '@/lib/cs-summary-download-pdf';

export type WaiversSignedPdfInput = {
  memberName: string;
  memberMrn: string;
  ackHipaa: boolean;
  ackLiability: boolean;
  ackFoc: boolean;
  ackRoomAndBoard: boolean;
  choice: string;
  monthlyIncome: string;
  incomeSource: string;
  signerType: string;
  signerName: string;
  signerRelationship: string;
  signatureDate?: string;
};

type WidthMeasuringFont = {
  widthOfTextAtSize: (text: string, size: number) => number;
};

const s = (value: unknown) => String(value ?? '').trim();

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

const yesNo = (value: boolean) => (value ? 'Yes — acknowledged' : 'No');

const choiceLabel = (choice: string) => {
  const v = s(choice).toLowerCase();
  if (v === 'accept') return 'I choose to accept Community Supports services.';
  if (v === 'decline') return 'I choose to decline Community Supports services.';
  return s(choice) || 'Not selected';
};

const signerLabel = (signerType: string) => {
  const v = s(signerType).toLowerCase();
  if (v === 'representative') return 'Authorized Representative (POA)';
  if (v === 'member') return 'Member';
  return s(signerType) || 'Not specified';
};

/** Pull signed-waiver fields out of the summary sections used by older callers. */
export function waiversSignedInputFromSections(
  sections: CsSummaryPdfSection[],
  fallbacks?: Partial<WaiversSignedPdfInput>
): WaiversSignedPdfInput {
  const find = (sectionTitle: string, label: string) => {
    const section = sections.find((row) => s(row?.title) === sectionTitle);
    const hit = (section?.rows || []).find((row) => s(row?.label) === label);
    return s(hit?.value);
  };
  const parseAck = (value: string) => /^yes/i.test(value);
  const choiceRaw = find('Acknowledgments', 'Choice');
  const choice =
    /accept/i.test(choiceRaw) ? 'accept' : /decline/i.test(choiceRaw) ? 'decline' : choiceRaw;
  const signerRaw = find('Electronic Signature', 'Signer');
  const signerType = /representative|poa/i.test(signerRaw)
    ? 'representative'
    : /member/i.test(signerRaw)
      ? 'member'
      : signerRaw;

  return {
    memberName: find('Member', 'Member Name') || s(fallbacks?.memberName),
    memberMrn: find('Member', 'MRN') || s(fallbacks?.memberMrn),
    ackHipaa: parseAck(find('Acknowledgments', 'HIPAA Authorization')) || Boolean(fallbacks?.ackHipaa),
    ackLiability:
      parseAck(find('Acknowledgments', 'Liability Waiver')) || Boolean(fallbacks?.ackLiability),
    ackFoc: parseAck(find('Acknowledgments', 'Freedom of Choice')) || Boolean(fallbacks?.ackFoc),
    ackRoomAndBoard:
      parseAck(find('Acknowledgments', 'Room & Board Commitment')) ||
      Boolean(fallbacks?.ackRoomAndBoard),
    choice: choice || s(fallbacks?.choice),
    monthlyIncome: find('Income', 'Monthly Income') || s(fallbacks?.monthlyIncome),
    incomeSource: find('Income', 'Income Source') || s(fallbacks?.incomeSource),
    signerType: signerType || s(fallbacks?.signerType),
    signerName: find('Electronic Signature', 'Signature') || s(fallbacks?.signerName),
    signerRelationship:
      find('Electronic Signature', 'Relationship') || s(fallbacks?.signerRelationship),
    signatureDate: s(fallbacks?.signatureDate),
  };
}

/** Full signed Waivers & Authorizations PDF (legal text + member acknowledgments / signature). */
export async function buildWaiversFullTextPdf(input: WaiversSignedPdfInput): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const marginX = 42;
  const topY = 718;
  const bottomY = 54;
  const contentWidth = pageSize[0] - marginX * 2;
  const generatedAt = new Date().toLocaleString();
  const memberName = s(input.memberName) || 'Unknown member';
  const memberMrn = s(input.memberMrn) || 'Unknown MRN';

  let page = pdfDoc.addPage(pageSize);
  let y = topY;

  const drawPageHeader = (targetPage: (typeof page)) => {
    targetPage.drawText('Waivers & Authorizations', { x: marginX, y: 762, size: 11, font: boldFont });
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

  const drawParagraph = (text: string, opts?: { bold?: boolean; size?: number; indent?: number }) => {
    const size = opts?.size ?? 10;
    const useFont = opts?.bold ? boldFont : font;
    const indent = opts?.indent ?? 0;
    const lines = wrapTextToWidth(text, contentWidth - indent, useFont, size);
    const lineHeight = size + 3;
    ensureSpace(lines.length * lineHeight + 4);
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: marginX + indent,
        y: y - index * lineHeight,
        size,
        font: useFont,
      });
    });
    y -= lines.length * lineHeight + 6;
  };

  const drawBullets = (items: string[]) => {
    for (const item of items) {
      const lines = wrapTextToWidth(item, contentWidth - 14, font, 10);
      const lineHeight = 13;
      ensureSpace(lines.length * lineHeight + 2);
      page.drawText('•', { x: marginX, y, size: 10, font });
      lines.forEach((line, index) => {
        page.drawText(line, { x: marginX + 14, y: y - index * lineHeight, size: 10, font });
      });
      y -= lines.length * lineHeight + 4;
    }
    y -= 4;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(28);
    page.drawText(title, { x: marginX, y, size: 12, font: boldFont });
    y -= 6;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: pageSize[0] - marginX, y },
      thickness: 0.7,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 14;
  };

  const drawAckLine = (label: string, acknowledged: boolean) => {
    drawParagraph(`${acknowledged ? '[X]' : '[ ]'}  ${label}`, { size: 10 });
  };

  drawPageHeader(page);
  page.drawText('Waivers & Authorizations', { x: marginX, y, size: 16, font: boldFont });
  y -= 20;
  drawParagraph(
    'This document contains the HIPAA Authorization, Liability Waiver, Freedom of Choice, Room and Board Commitment, and Medi-Cal Share of Cost Determination acknowledgments signed for this member.'
  );
  drawParagraph(`Member Name: ${memberName}`, { bold: true });
  drawParagraph(`Medical Record Number (MRN): ${memberMrn}`, { bold: true });
  y -= 4;

  drawSectionTitle('HIPAA Authorization');
  drawParagraph(
    'This form, when completed and signed by you (member or POA), authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.'
  );
  drawParagraph(
    'Authorized to disclose: Any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions.'
  );
  drawParagraph('Authorized to receive: Connections Care Home Consultants, LLC.');
  drawParagraph('Description of Information to be Disclosed', { bold: true });
  drawParagraph('The information to be disclosed includes, but is not limited to:');
  drawBullets([
    'Demographic information (Name, DOB, Social Security Number, Medi-Cal ID).',
    'Medical history and physical examination reports.',
    'Individual Service Plans (ISP) and Functional Assessments.',
    'Level of Care (LOC) Tier determinations.',
    'Physician orders and medication lists.',
  ]);
  drawParagraph('Purpose of Disclosure', { bold: true });
  drawParagraph('This information will be used specifically for:');
  drawBullets([
    'Determining eligibility for CalAIM Community Supports.',
    'Conducting clinical assessments for tier-level placement.',
    'Facilitating transition and admission into a contracted RCFE/ARF.',
    'Coordinating billing and claims processing between the Facility, Connections, and the MCP.',
  ]);
  drawParagraph(
    'My Rights: The member (or POA) may revoke this authorization at any time by written notice. Revocation applies prospectively and does not affect disclosures already made in reliance on this authorization before written revocation is received.'
  );
  drawParagraph(
    'Use Limitation: Information disclosed under this authorization is limited to what is reasonably necessary for program eligibility, placement coordination, transition support, and related care/billing coordination.'
  );
  drawAckLine('I have read and understood the HIPAA Authorization section.', input.ackHipaa);

  drawSectionTitle('Liability Waiver & Hold Harmless Agreement');
  drawParagraph(
    "Intention. The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not limited to, negligence, fault, or breach of contract."
  );
  drawParagraph(
    "Assumption of Risk. Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program."
  );
  drawParagraph(
    'No Insurance. Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not limited to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.'
  );
  drawParagraph(
    'Acknowledgment. Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.'
  );
  drawAckLine('I have read and understood the Liability Waiver section.', input.ackLiability);

  drawSectionTitle('Freedom of Choice Waiver');
  drawParagraph(
    'I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.'
  );
  drawParagraph(
    'If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.'
  );
  drawParagraph(
    'If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.'
  );
  drawParagraph('My Choice', { bold: true });
  drawParagraph(choiceLabel(input.choice));
  drawAckLine('I have read and understood the Freedom of Choice Waiver section.', input.ackFoc);

  drawSectionTitle('Room and Board Commitment & Medi-Cal SOC Determination');
  drawParagraph(
    'I understand the member is responsible for paying the RCFE/ARF the room and board portion, while the Managed Care Plan pays the assisted living service portion.'
  );
  drawParagraph('I understand Room and Board payment depends on the member’s monthly income.');
  drawParagraph(
    'I acknowledge that inability to pay any room and board portion may impact eligibility for this community support program.'
  );
  drawParagraph(
    'CalAIM applicants must have a zero Medi-Cal Share of Cost (SOC) before enrollment can proceed. Monthly income helps determine if there may be a Medi-Cal Share of Cost (SOC). Generally, a monthly income of more than $1,801 (single)/$2,433 (couple) will have a Medi-Cal SOC.'
  );
  drawParagraph(
    'If the member’s monthly income is over $1,801, the family should confirm there is no Medi-Cal SOC. For example, a Medicare Part B deduction (about $200) can reduce countable income and SOC.'
  );
  drawParagraph('Families can go to benefitscal.com to see if there is Medi-Cal SOC.');
  drawParagraph(
    'Members who receive less than $1,626.08 in 2026 may be eligible for the Non-Medical Out-of-Home Care (NMOHC) payment. The member generally pays the RCFE $1,444 and receives back $182 for personal-needs expenses.'
  );
  drawParagraph(
    'Proof of income might need to be furnished as part of this application process (for example, an annual award letter or 3 months of bank statements showing Social Security income).'
  );
  if (s(input.monthlyIncome)) drawParagraph(`Member monthly income: ${s(input.monthlyIncome)}`, { bold: true });
  if (s(input.incomeSource)) drawParagraph(`Income source: ${s(input.incomeSource)}`, { bold: true });
  drawAckLine(
    'I have read and understood the Room and Board Commitment and Medi-Cal SOC Determination sections.',
    input.ackRoomAndBoard
  );

  drawSectionTitle('Signature for All Sections');
  drawParagraph(
    'Under penalty of perjury, the person signing must be either the member or the authorized representative (POA) for the member.'
  );
  drawParagraph(`I am the: ${signerLabel(input.signerType)}`, { bold: true });
  drawParagraph(`Signature (Full Name): ${s(input.signerName) || 'Not provided'}`, { bold: true });
  if (s(input.signatureDate)) drawParagraph(`Date: ${s(input.signatureDate)}`, { bold: true });
  drawParagraph(
    `If authorized representative, relationship to member: ${s(input.signerRelationship) || 'N/A'}`,
    { bold: true }
  );

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
