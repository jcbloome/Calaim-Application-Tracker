export type CoverSheetPackageType = 'initial' | 'reassessment';

export type CoverSheetPackageDocKey =
  | 'isp'
  | 'coversheet'
  | 'proofOfIncome'
  | 'roomAndBoardStatement'
  | 'rcfeW9'
  | 'proofOfLicense'
  | 'proofOfInsurance';

export type CoverSheetPackageFile = {
  fileName: string;
  downloadURL: string;
  storagePath?: string;
  contentType?: string;
  uploadedAtIso?: string;
  uploadedByName?: string;
  uploadedByEmail?: string;
  source?: 'upload' | 'isp-download' | 'cover-download' | 'link';
  sourceLogId?: string;
};

export const COVER_SHEET_PACKAGE_ALWAYS_REQUIRED: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'isp', label: 'ISP' },
  { key: 'coversheet', label: 'Coversheet' },
  { key: 'proofOfIncome', label: 'Proof of Income' },
  { key: 'roomAndBoardStatement', label: 'Room and Board Statement' },
];

/** Reassessment may reuse these from a prior package for the same member (no re-upload required). */
export const COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT: CoverSheetPackageDocKey[] = [
  'proofOfIncome',
  'roomAndBoardStatement',
];

export const COVER_SHEET_PACKAGE_INITIAL_ONLY: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'rcfeW9', label: 'RCFE W-9' },
  { key: 'proofOfLicense', label: 'Proof of License' },
  { key: 'proofOfInsurance', label: 'Proof of Insurance' },
];

export function pickReusableCoverSheetDocs(
  packages: Array<{
    docs?: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>;
    status?: string;
    packageType?: string;
    updatedAt?: string;
    sentAt?: string;
  }>
): Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile>> {
  const reusable: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile>> = {};
  const sorted = [...packages].sort((a, b) => {
    const aMs = Date.parse(String(a.sentAt || a.updatedAt || '')) || 0;
    const bMs = Date.parse(String(b.sentAt || b.updatedAt || '')) || 0;
    return bMs - aMs;
  });
  for (const key of COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT) {
    for (const pkg of sorted) {
      const file = pkg.docs?.[key];
      if (file && String(file.downloadURL || '').trim() && String(file.fileName || '').trim()) {
        reusable[key] = {
          ...file,
          source: file.source || 'link',
        };
        break;
      }
    }
  }
  return reusable;
}

export function requiredCoverSheetPackageDocs(packageType: CoverSheetPackageType) {
  if (packageType === 'initial') {
    return [...COVER_SHEET_PACKAGE_ALWAYS_REQUIRED, ...COVER_SHEET_PACKAGE_INITIAL_ONLY];
  }
  return [...COVER_SHEET_PACKAGE_ALWAYS_REQUIRED];
}

export function missingCoverSheetPackageDocs(
  packageType: CoverSheetPackageType,
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>
) {
  return requiredCoverSheetPackageDocs(packageType).filter((item) => {
    const file = docs[item.key];
    return !(file && String(file.downloadURL || '').trim() && String(file.fileName || '').trim());
  });
}

export function buildAlftCoverSheetPackageSubject(memberName: string, memberMrn: string) {
  const name = String(memberName || '').trim() || 'Member';
  const mrn = String(memberMrn || '').trim() || 'N/A';
  return `Request for Ongoing ALFT Services for ${name}, ${mrn}`;
}

export const ALFT_COVER_SHEET_PACKAGE_TO = 'vortiz@ilshealth.com';
export const ALFT_COVER_SHEET_PACKAGE_TO_NAME = 'Veronica';
export const ALFT_COVER_SHEET_PACKAGE_TO_LABEL = `${ALFT_COVER_SHEET_PACKAGE_TO_NAME} <${ALFT_COVER_SHEET_PACKAGE_TO}>`;

export const ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION = 'alft_cover_sheet_package_send_logs';

export function buildAlftCoverSheetPackageEmailPreview(params: {
  memberName: string;
  memberMrn: string;
  packageType: CoverSheetPackageType;
  staffName: string;
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>;
}) {
  const memberName = String(params.memberName || '').trim() || 'Member';
  const memberMrn = String(params.memberMrn || '').trim() || 'N/A';
  const staffName = String(params.staffName || '').trim() || 'Connections staff';
  const packageTypeLabel = params.packageType === 'initial' ? 'Initial cover sheet' : 'Reassessment';
  const subject = buildAlftCoverSheetPackageSubject(memberName, memberMrn);
  const required = requiredCoverSheetPackageDocs(params.packageType);
  const attachmentLines = required.map((item) => {
    const file = params.docs[item.key];
    return {
      key: item.key,
      label: item.label,
      fileName: String(file?.fileName || '').trim() || '(missing)',
      downloadURL: String(file?.downloadURL || '').trim(),
    };
  });

  const html = `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:720px;">
        <p>Hello ${ALFT_COVER_SHEET_PACKAGE_TO_NAME},</p>
        <p>Please find the completed ALFT Cover Sheet Package for ongoing ALFT services.</p>
        <p><strong>Member:</strong> ${memberName}<br/>
        <strong>MRN:</strong> ${memberMrn}<br/>
        <strong>Package type:</strong> ${packageTypeLabel}<br/>
        <strong>Prepared by:</strong> ${staffName}</p>
        <p><strong>Included documents:</strong></p>
        <ul>
          ${attachmentLines.map((item) => `<li>${item.label}: ${item.fileName}</li>`).join('')}
        </ul>
        <p>Thank you,<br/>CalAIM Application Tracker</p>
      </div>
    `;

  const text = [
    `Hello ${ALFT_COVER_SHEET_PACKAGE_TO_NAME},`,
    '',
    'Please find the completed ALFT Cover Sheet Package for ongoing ALFT services.',
    '',
    `Member: ${memberName}`,
    `MRN: ${memberMrn}`,
    `Package type: ${packageTypeLabel}`,
    `Prepared by: ${staffName}`,
    '',
    'Included documents:',
    ...attachmentLines.map((item) => `- ${item.label}: ${item.fileName}`),
    '',
    'Thank you,',
    'CalAIM Application Tracker',
  ].join('\n');

  return {
    to: ALFT_COVER_SHEET_PACKAGE_TO,
    toName: ALFT_COVER_SHEET_PACKAGE_TO_NAME,
    toLabel: ALFT_COVER_SHEET_PACKAGE_TO_LABEL,
    subject,
    html,
    text,
    attachmentLines,
  };
}
