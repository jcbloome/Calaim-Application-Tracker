export type CoverSheetPackageType = 'initial' | 'reassessment';
export type CoverSheetPlacementType = 'rcfe' | 'home';

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

export type CoverSheetPackageChecklistItem = {
  key: CoverSheetPackageDocKey | 'homeVettedByIls';
  label: string;
  kind: 'file' | 'flag';
};

export const COVER_SHEET_PACKAGE_ALWAYS_REQUIRED: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'isp', label: 'ISP' },
  { key: 'coversheet', label: 'Cover page (from app)' },
  { key: 'proofOfIncome', label: 'Proof of Income' },
  { key: 'roomAndBoardStatement', label: 'Room and Board Statement' },
];

/** Reassessment may reuse these from a prior package for the same member (no re-upload required). */
export const COVER_SHEET_PACKAGE_REUSE_ON_REASSESSMENT: CoverSheetPackageDocKey[] = [
  'proofOfIncome',
  'roomAndBoardStatement',
];

/** Initial RCFE placements only — not required for reassessments or home placements. */
export const COVER_SHEET_PACKAGE_INITIAL_ONLY: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'rcfeW9', label: 'RCFE W-9' },
  { key: 'proofOfLicense', label: 'Proof of License / Liability' },
  { key: 'proofOfInsurance', label: 'Proof of Insurance' },
];

export function normalizeCoverSheetPlacementType(value: unknown): CoverSheetPlacementType {
  return String(value || '')
    .trim()
    .toLowerCase() === 'home'
    ? 'home'
    : 'rcfe';
}

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

/** File uploads required for this package type + placement. */
export function requiredCoverSheetPackageDocs(
  packageType: CoverSheetPackageType,
  placementType: CoverSheetPlacementType = 'rcfe'
) {
  const base = [...COVER_SHEET_PACKAGE_ALWAYS_REQUIRED];
  if (packageType === 'initial' && placementType === 'rcfe') {
    return [...base, ...COVER_SHEET_PACKAGE_INITIAL_ONLY];
  }
  return base;
}

/** Full checklist including home-vetted flag for home placements. */
export function requiredCoverSheetPackageChecklist(
  packageType: CoverSheetPackageType,
  placementType: CoverSheetPlacementType = 'rcfe'
): CoverSheetPackageChecklistItem[] {
  const items: CoverSheetPackageChecklistItem[] = requiredCoverSheetPackageDocs(
    packageType,
    placementType
  ).map((item) => ({ ...item, kind: 'file' as const }));
  if (placementType === 'home') {
    items.push({
      key: 'homeVettedByIls',
      label: 'Home approved / vetted by ILS',
      kind: 'flag',
    });
  }
  return items;
}

export function missingCoverSheetPackageDocs(
  packageType: CoverSheetPackageType,
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>,
  placementType: CoverSheetPlacementType = 'rcfe'
) {
  return requiredCoverSheetPackageDocs(packageType, placementType).filter((item) => {
    const file = docs[item.key];
    return !(file && String(file.downloadURL || '').trim() && String(file.fileName || '').trim());
  });
}

export function missingCoverSheetPackageChecklist(
  packageType: CoverSheetPackageType,
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>,
  options?: {
    placementType?: CoverSheetPlacementType;
    homeVettedByIls?: boolean;
  }
): CoverSheetPackageChecklistItem[] {
  const placementType = options?.placementType || 'rcfe';
  const missing: CoverSheetPackageChecklistItem[] = missingCoverSheetPackageDocs(
    packageType,
    docs,
    placementType
  ).map((item) => ({ ...item, kind: 'file' as const }));
  if (placementType === 'home' && !options?.homeVettedByIls) {
    missing.push({
      key: 'homeVettedByIls',
      label: 'Home approved / vetted by ILS',
      kind: 'flag',
    });
  }
  return missing;
}

export function buildAlftCoverSheetPackageSubject(memberName: string, memberMrn: string) {
  const name = String(memberName || '').trim() || 'Member';
  const mrn = String(memberMrn || '').trim() || 'N/A';
  return `Request for Ongoing ALFT Services for ${name}, ${mrn}`;
}

export const ALFT_COVER_SHEET_PACKAGE_TO = 'VOrtiz02@ilshealth.com';
export const ALFT_COVER_SHEET_PACKAGE_TO_NAME = 'Veronica';
export const ALFT_COVER_SHEET_PACKAGE_TO_LABEL = `${ALFT_COVER_SHEET_PACKAGE_TO_NAME} <${ALFT_COVER_SHEET_PACKAGE_TO}>`;

export const ALFT_COVER_SHEET_PACKAGE_SEND_LOGS_COLLECTION = 'alft_cover_sheet_package_send_logs';

export function buildAlftCoverSheetPackageEmailPreview(params: {
  memberName: string;
  memberMrn: string;
  packageType: CoverSheetPackageType;
  placementType?: CoverSheetPlacementType;
  homeVettedByIls?: boolean;
  staffName: string;
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>;
}) {
  const memberName = String(params.memberName || '').trim() || 'Member';
  const memberMrn = String(params.memberMrn || '').trim() || 'N/A';
  const staffName = String(params.staffName || '').trim() || 'Connections staff';
  const placementType = params.placementType || 'rcfe';
  const packageTypeLabel = params.packageType === 'initial' ? 'Initial cover sheet' : 'Reassessment';
  const placementLabel = placementType === 'home' ? 'Home' : 'RCFE';
  const subject = buildAlftCoverSheetPackageSubject(memberName, memberMrn);
  const required = requiredCoverSheetPackageChecklist(params.packageType, placementType);
  const attachmentLines = required.map((item) => {
    if (item.kind === 'flag') {
      return {
        key: item.key,
        label: item.label,
        fileName: params.homeVettedByIls ? 'Confirmed' : '(missing)',
        downloadURL: '',
      };
    }
    const file = params.docs[item.key as CoverSheetPackageDocKey];
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
        <strong>Placement:</strong> ${placementLabel}<br/>
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
    `Placement: ${placementLabel}`,
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
