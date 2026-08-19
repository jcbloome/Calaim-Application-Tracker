import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { extractMifGeneratedDateKey, formatMifGeneratedDateLabel } from '@/lib/ils-mif-parse';

export const MIF_SERVICE_DELIVERY_FORM_NAME = 'Service Delivery Form';
export const MIF_SERVICE_DELIVERY_LAYOUT_VERSION = 2;

export type MifServiceDeliveryIdentity = {
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberMediCalNum?: string;
  memberSex?: string;
  memberDob?: string;
  memberPhone?: string;
  memberEmail?: string;
  memberAddress?: string;
  memberCity?: string;
  memberState?: string;
  memberZip?: string;
  memberCounty?: string;
  contactPhone?: string;
  contactEmail?: string;
  referringOrganization?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  careManagerName?: string;
  careManagerPhone?: string;
  careManagerEmail?: string;
  authorizationNumberT2038?: string;
  authorizationStartT2038?: string;
  authorizationEndT2038?: string;
  dateReceivedRequestForAuthorization?: string;
  dateOfReferralAuthorizationDecision?: string;
  diagnosticCode?: string;
  cptCode?: string;
  kaiserStatus?: string;
  sourceFileName?: string;
  sourceType?: string;
  eligibilityCheckStatus?: string;
  caspioExists?: boolean;
  mifMasterExists?: boolean;
};

const sanitizePdfText = (value: unknown) =>
  String(value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
    .trimEnd();

export function resolveMifDateFromFileNames(fileNames: Array<string | undefined | null>): {
  mifDateLabel: string;
  mifDateSourceFile: string;
} {
  let mifDateLabel = '';
  let mifDateSourceFile = '';
  for (const candidate of fileNames) {
    const name = String(candidate || '').trim();
    if (!name) continue;
    if (!mifDateSourceFile) mifDateSourceFile = name;
    const label = formatMifGeneratedDateLabel(extractMifGeneratedDateKey(name));
    if (label) {
      return { mifDateLabel: label, mifDateSourceFile: name };
    }
  }
  return { mifDateLabel, mifDateSourceFile };
}

export function applicationHasMifServiceDeliveryFile(application: any): boolean {
  const forms = Array.isArray(application?.forms) ? application.forms : [];
  const formHit = forms.some((form: any) => {
    const name = String(form?.name || '').toLowerCase();
    if (!name.includes('service delivery')) return false;
    return Boolean(
      String(form?.downloadURL || form?.filePath || form?.uploadedFiles?.[0]?.downloadURL || form?.uploadedFiles?.[0]?.filePath || '').trim()
    );
  });
  if (formHit) return true;
  const root = application?.serviceDeliveryForm || {};
  return Boolean(String(root?.downloadURL || root?.filePath || '').trim());
}

export function applicationMifServiceDeliveryNeedsRefresh(application: any): boolean {
  if (!isMifSpreadsheetIntakeApplication(application)) return false;
  if (!applicationHasMifServiceDeliveryFile(application)) return true;
  const forms = Array.isArray(application?.forms) ? application.forms : [];
  const form = forms.find((entry: any) => String(entry?.name || '').toLowerCase().includes('service delivery'));
  const version = Number(
    form?.layoutVersion || application?.serviceDeliveryForm?.layoutVersion || 0
  );
  return version < MIF_SERVICE_DELIVERY_LAYOUT_VERSION;
}

export function isMifSpreadsheetIntakeApplication(application: any): boolean {
  const intakeSource = String(application?.intakeSource || '').trim().toLowerCase();
  const adminNotes = String(application?.adminNotes || '').toLowerCase();
  if (intakeSource.includes('spreadsheet') || intakeSource === 'ils_spreadsheet_batch') return true;
  if (adminNotes.includes('ils spreadsheet details')) return true;
  if (String(application?.ilsMifSourceFileName || '').trim()) return true;
  if (!application?.kaiserAuthReceivedViaIls) return false;
  if (intakeSource === 'ils_single_authorization_sheet') return false;
  const forms = Array.isArray(application?.forms) ? application.forms : [];
  const hasSingleAuthPdf = forms.some((form: any) => {
    const hay = `${form?.source || ''} ${form?.sourceTag || ''} ${form?.name || ''}`.toLowerCase();
    return hay.includes('single_auth') || hay.includes('authorization sheet pdf');
  });
  return !hasSingleAuthPdf;
}

export async function buildMifServiceDeliveryPdf(params: {
  identity: MifServiceDeliveryIdentity;
  extraFileNames?: Array<string | undefined | null>;
}): Promise<{ bytes: Uint8Array; displayFileName: string; mifDateLabel: string; mifDateSourceFile: string }> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const identity = params.identity || {};
  const memberName =
    `${String(identity.memberFirstName || '').trim()} ${String(identity.memberLastName || '').trim()}`.trim() ||
    'Member';
  const memberMrnLabel = String(identity.memberMrn || '').trim() || 'MRN Unknown';
  const { mifDateLabel, mifDateSourceFile } = resolveMifDateFromFileNames([
    identity.sourceFileName,
    ...(params.extraFileNames || []),
  ]);
  const displayFileName = mifDateLabel
    ? `Service Delivery Form for ${memberName} (${memberMrnLabel}) MIF ${mifDateLabel.replace(/\//g, '-')}.pdf`
    : `Service Delivery Form for ${memberName} (${memberMrnLabel}).pdf`;
  const statusLabel = String(identity.kaiserStatus || '').trim() || 'Not specified';
  const authNumber = String(identity.authorizationNumberT2038 || '').trim() || '—';
  const authStart = String(identity.authorizationStartT2038 || '').trim() || '—';
  const authEnd = String(identity.authorizationEndT2038 || '').trim() || '—';
  const cityStateZip = [identity.memberCity, identity.memberState, identity.memberZip]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodySize = 9;
  const lineHeight = 12;
  const marginX = 36;
  const pageBottom = 36;
  let y = 760;

  const rightEdge = 576;
  const wrapChunks = (text: string, usedFont: typeof font, size: number, maxWidth: number) => {
    const clean = sanitizePdfText(text || '—') || '—';
    const words = clean.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    let current = '';
    const pushCurrent = () => {
      if (current) chunks.push(current);
      current = '';
    };
    for (const word of words.length ? words : [clean]) {
      const next = current ? `${current} ${word}` : word;
      if (usedFont.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }
      pushCurrent();
      if (usedFont.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      let slice = '';
      for (const ch of word) {
        const trial = slice + ch;
        if (usedFont.widthOfTextAtSize(trial, size) <= maxWidth) {
          slice = trial;
        } else {
          if (slice) chunks.push(slice);
          slice = ch;
        }
      }
      current = slice;
    }
    pushCurrent();
    return chunks.length ? chunks : [clean];
  };

  const drawText = (text: string, x: number, options?: { size?: number; bold?: boolean }) => {
    const size = options?.size ?? bodySize;
    const usedFont = options?.bold ? boldFont : font;
    const line = sanitizePdfText(text);
    if (!line || y < pageBottom) return;
    try {
      page.drawText(line, { x, y, size, font: usedFont });
    } catch {
      page.drawText(line.replace(/[^\x20-\x7E]/g, ''), { x, y, size, font: usedFont });
    }
  };

  const drawRow = (label: string, value: string, options?: { highlight?: boolean }) => {
    if (y < pageBottom) return;
    const highlight = Boolean(options?.highlight);
    const size = highlight ? 10 : bodySize;
    const usedFont = highlight ? boldFont : font;
    const labelText = `${sanitizePdfText(label)}: `;
    const labelWidth = Math.min(usedFont.widthOfTextAtSize(labelText, size), 210);
    const valueX = marginX + labelWidth;
    const chunks = wrapChunks(value, usedFont, size, Math.max(80, rightEdge - valueX));
    drawText(labelText, marginX, { size, bold: highlight });
    drawText(chunks[0], valueX, { size, bold: highlight });
    y -= highlight ? 13 : lineHeight;
    for (const extra of chunks.slice(1)) {
      if (y < pageBottom) return;
      drawText(extra, valueX, { size, bold: highlight });
      y -= highlight ? 13 : lineHeight;
    }
  };

  const drawPair = (left: [string, string], right?: [string, string]) => {
    if (y < pageBottom) return;
    const colGap = 286;
    const drawCol = (pair: [string, string], x: number) => {
      const labelText = `${sanitizePdfText(pair[0])}: `;
      const labelWidth = Math.min(font.widthOfTextAtSize(labelText, bodySize), 118);
      const valueX = x + labelWidth;
      const maxWidth = Math.max(60, x + 250 - valueX);
      const chunks = wrapChunks(pair[1], font, bodySize, maxWidth);
      drawText(labelText, x, { size: bodySize });
      drawText(chunks[0], valueX, { size: bodySize });
      return chunks.length;
    };
    const leftLines = drawCol(left, marginX);
    const rightLines = right ? drawCol(right, marginX + colGap) : 1;
    y -= lineHeight * Math.max(leftLines, rightLines);
  };

  const drawSection = (title: string) => {
    if (y < pageBottom + 20) return;
    y -= 3;
    drawText(title, marginX, { size: 10, bold: true });
    y -= 13;
  };

  drawText('Service Delivery Form', marginX, { size: 16, bold: true });
  y -= 18;
  drawRow('Member', memberName, { highlight: true });
  drawRow('MRN', memberMrnLabel, { highlight: true });
  drawRow('Authorization Number', authNumber, { highlight: true });
  drawRow('Authorization Start', authStart, { highlight: true });
  drawRow('Authorization End', authEnd, { highlight: true });
  drawRow('MIF Date', mifDateLabel || 'Date not found in MIF filename');
  if (mifDateSourceFile) drawRow('MIF File', mifDateSourceFile);
  y -= 2;
  page.drawLine({
    start: { x: marginX, y: y + 8 },
    end: { x: rightEdge, y: y + 8 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 4;

  drawSection('Authorization');
  drawPair(['Authorization Status', 'Authorized'], ['Kaiser Status', statusLabel]);
  if (identity.dateReceivedRequestForAuthorization || identity.dateOfReferralAuthorizationDecision) {
    drawPair(
      ['Date Received Request', String(identity.dateReceivedRequestForAuthorization || '—')],
      ['Auth Decision Date', String(identity.dateOfReferralAuthorizationDecision || '—')]
    );
  }
  if (identity.diagnosticCode || identity.cptCode) {
    drawPair(
      ['Diagnostic Code', String(identity.diagnosticCode || '—')],
      ['CPT Code', String(identity.cptCode || '—')]
    );
  }

  drawSection('Member');
  drawPair(
    ['First Name', String(identity.memberFirstName || '')],
    ['Last Name', String(identity.memberLastName || '')]
  );
  drawPair(
    ['Medical Number (CIN)', String(identity.memberMediCalNum || '—')],
    ['Date of Birth', String(identity.memberDob || '—')]
  );
  drawPair(['Sex', String(identity.memberSex || '—')], ['County', String(identity.memberCounty || '—')]);
  drawPair(
    ['Member Phone', String(identity.memberPhone || '—')],
    ['Member Email', String(identity.memberEmail || '—')]
  );
  if (identity.memberAddress) drawRow('Address', String(identity.memberAddress));
  if (cityStateZip) drawRow('City / State / ZIP', cityStateZip);

  drawSection('Referral / Contact');
  if (identity.referringOrganization) drawRow('Referring Organization', String(identity.referringOrganization));
  drawPair(
    ['Care Manager', String(identity.careManagerName || '—')],
    ['Care Manager Phone', String(identity.careManagerPhone || '—')]
  );
  if (identity.careManagerEmail) drawRow('Care Manager Email', String(identity.careManagerEmail));
  drawPair(
    ['Emergency Contact', String(identity.emergencyContactName || '—')],
    ['Relationship', String(identity.emergencyContactRelationship || '—')]
  );
  drawPair(
    ['Emergency Phone', String(identity.emergencyContactPhone || '—')],
    ['Contact Phone', String(identity.contactPhone || '—')]
  );
  if (identity.contactEmail) drawRow('Contact Email', String(identity.contactEmail));

  drawSection('Source');
  drawPair(['Generated', new Date().toLocaleString('en-US')], ['Source Type', String(identity.sourceType || 'spreadsheet')]);
  drawPair(
    ['Caspio Exists At Import', identity.caspioExists ? 'Yes' : 'No'],
    ['On MIF Master', identity.mifMasterExists ? 'Yes' : 'No']
  );
  if (identity.eligibilityCheckStatus) drawRow('Eligibility Check Status', String(identity.eligibilityCheckStatus));
  drawText(
    'Generated from MIF spreadsheet intake. This PDF is the Service Delivery Form for this skeleton application.',
    marginX,
    { size: 8 }
  );

  const pdfBytes = await pdfDoc.save();
  return { bytes: pdfBytes, displayFileName, mifDateLabel, mifDateSourceFile };
}

export function toMifServiceDeliveryFormRecord(params: {
  displayFileName: string;
  storagePath: string;
  downloadURL: string;
}) {
  return {
    name: MIF_SERVICE_DELIVERY_FORM_NAME,
    status: 'Completed',
    type: 'Upload',
    href: params.downloadURL,
    downloadHref: params.downloadURL,
    fileName: params.displayFileName,
    filePath: params.storagePath,
    downloadURL: params.downloadURL,
    dateCompleted: new Date().toISOString(),
    source: 'spreadsheet_service_delivery_placeholder',
    layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
    uploadedFiles: [
      {
        fileName: params.displayFileName,
        filePath: params.storagePath,
        downloadURL: params.downloadURL,
      },
    ],
    notes:
      'Auto-generated placeholder because spreadsheet intake did not include the actual Service Delivery Form.',
  };
}

export async function uploadMifServiceDeliveryForm(params: {
  storage: FirebaseStorage;
  applicationId: string;
  identity: MifServiceDeliveryIdentity;
  extraFileNames?: Array<string | undefined | null>;
}) {
  const { bytes, displayFileName } = await buildMifServiceDeliveryPdf({
    identity: params.identity,
    extraFileNames: params.extraFileNames,
  });
  const safeFileName = displayFileName.replace(/[<>:"/\\|?*]/g, '_');
  const storagePath = `documents/applications/${params.applicationId}/Service Delivery Form/${Date.now()}_mif-service-delivery.pdf`;
  const storageRef = ref(params.storage, storagePath);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  await uploadBytes(storageRef, blob, {
    contentType: 'application/pdf',
  });
  const downloadURL = await getDownloadURL(storageRef);
  const formRecord = toMifServiceDeliveryFormRecord({
    displayFileName,
    storagePath,
    downloadURL,
  });
  return {
    formRecord,
    fileName: displayFileName,
    filePath: storagePath,
    downloadURL,
  };
}
