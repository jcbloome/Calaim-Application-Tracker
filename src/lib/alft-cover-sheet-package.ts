export type CoverSheetPackageType = 'initial' | 'reassessment';
export type CoverSheetPlacementType = 'rcfe' | 'home';
export type CoverSheetIspSource = 'app' | 'external';

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
  source?: 'upload' | 'isp-download' | 'cover-download' | 'link' | 'application-portal';
  sourceLogId?: string;
  sourceApplicationId?: string;
};

export type CoverSheetPackageChecklistItem = {
  key: CoverSheetPackageDocKey | 'homeVettedByIls' | 'managerVerified';
  label: string;
  kind: 'file' | 'flag';
};

export const COVER_SHEET_PACKAGE_ALWAYS_REQUIRED: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'isp', label: 'ISP / ALFT (from app)' },
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

/** Cover page manager who must verify package contents before emailing Veronica. */
export const COVER_SHEET_PACKAGE_MANAGER_EMAIL = 'john@carehomefinders.com';
export const COVER_SHEET_PACKAGE_MANAGER_NAME = 'John';
export const COVER_SHEET_PACKAGE_MANAGER_LABEL = `${COVER_SHEET_PACKAGE_MANAGER_NAME} <${COVER_SHEET_PACKAGE_MANAGER_EMAIL}>`;

export function isCoverSheetPackageManagerEmail(email: unknown) {
  return (
    String(email || '')
      .trim()
      .toLowerCase() === COVER_SHEET_PACKAGE_MANAGER_EMAIL
  );
}

export function normalizeCoverSheetPlacementType(value: unknown): CoverSheetPlacementType {
  return String(value || '')
    .trim()
    .toLowerCase() === 'home'
    ? 'home'
    : 'rcfe';
}

export function normalizeCoverSheetIspSource(value: unknown): CoverSheetIspSource {
  return String(value || '')
    .trim()
    .toLowerCase() === 'external'
    ? 'external'
    : 'app';
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

/** Full checklist including home-vetted + final manager verification. */
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
  items.push({
    key: 'managerVerified',
    label: `Cover page manager verify (${COVER_SHEET_PACKAGE_MANAGER_NAME})`,
    kind: 'flag',
  });
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
    managerVerified?: boolean;
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
  // Final gate: manager verifies package contents before Veronica send.
  if (missing.length === 0 && !options?.managerVerified) {
    missing.push({
      key: 'managerVerified',
      label: `Cover page manager verify (${COVER_SHEET_PACKAGE_MANAGER_NAME})`,
      kind: 'flag',
    });
  }
  return missing;
}

/** Docs + home vetted only (before manager sign-off). */
export function coverSheetPackageDocsComplete(
  packageType: CoverSheetPackageType,
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>,
  options?: {
    placementType?: CoverSheetPlacementType;
    homeVettedByIls?: boolean;
  }
) {
  const placementType = options?.placementType || 'rcfe';
  if (missingCoverSheetPackageDocs(packageType, docs, placementType).length) return false;
  if (placementType === 'home' && !options?.homeVettedByIls) return false;
  return true;
}

export function coverSheetPackageAuthLabel(packageType: CoverSheetPackageType) {
  return packageType === 'reassessment' ? 'REAUTHORIZATION' : 'INITIAL Authorization';
}

/** Map application pathway form titles → ILS package checklist doc keys. */
export const PATHWAY_FORM_TO_PACKAGE_DOC: Array<{
  key: CoverSheetPackageDocKey;
  formNames: string[];
}> = [
  {
    key: 'proofOfIncome',
    formNames: ['Proof of Income', 'POI', 'Proof Of Income'],
  },
  {
    key: 'roomAndBoardStatement',
    formNames: [
      'Room and Board/Tier Level Agreement',
      'Room and Board/Tier Level Commitment',
      'Room and Board Commitment',
      'Room and Board Statement',
      'Room & Board Statement',
    ],
  },
  {
    key: 'rcfeW9',
    formNames: ['RCFE W-9', 'W-9', 'W9', 'Facility W-9'],
  },
  {
    key: 'proofOfLicense',
    formNames: [
      'Proof of License / Liability',
      'Proof of License',
      'Proof of Liability',
      'License / Liability',
      'Facility License',
    ],
  },
  {
    key: 'proofOfInsurance',
    formNames: ['Proof of Insurance', 'Liability Insurance', 'Facility Insurance'],
  },
];

const normalizeFormTitle = (raw: unknown) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export function packageDocKeyForPathwayFormName(formName: unknown): CoverSheetPackageDocKey | null {
  const needle = normalizeFormTitle(formName);
  if (!needle) return null;
  for (const row of PATHWAY_FORM_TO_PACKAGE_DOC) {
    if (row.formNames.some((name) => normalizeFormTitle(name) === needle)) return row.key;
    if (row.formNames.some((name) => needle.includes(normalizeFormTitle(name)))) return row.key;
  }
  return null;
}

export type PathwayPackageFileCandidate = CoverSheetPackageFile & {
  formName: string;
  applicationId: string;
};

/** Extract ILS-package-relevant uploads from an application's forms[] array. */
export function extractPathwayPackageDocsFromApplicationForms(
  applicationId: string,
  forms: unknown
): Partial<Record<CoverSheetPackageDocKey, PathwayPackageFileCandidate>> {
  if (!Array.isArray(forms)) return {};
  const out: Partial<Record<CoverSheetPackageDocKey, PathwayPackageFileCandidate>> = {};
  forms.forEach((form: any) => {
    const formName = String(form?.name || '').trim();
    const key = packageDocKeyForPathwayFormName(formName);
    if (!key || out[key]) return;
    const status = String(form?.status || '').trim().toLowerCase();
    const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
    const entries =
      uploadedFiles.length > 0
        ? uploadedFiles
        : [
            {
              fileName: form?.fileName,
              downloadURL: form?.downloadURL || form?.uploadUrl || form?.url,
              filePath: form?.filePath || form?.storagePath || form?.path,
              contentType: form?.contentType,
            },
          ];
    for (const item of entries) {
      const fileName = String(item?.fileName || form?.fileName || formName || '').trim();
      const downloadURL = String(item?.downloadURL || item?.url || item?.uploadUrl || '').trim();
      const storagePath = String(item?.filePath || item?.storagePath || item?.path || '').trim();
      if (!downloadURL && !storagePath) continue;
      if (!fileName && !downloadURL) continue;
      if (!downloadURL && status !== 'completed') continue;
      out[key] = {
        fileName: fileName || `${formName}.pdf`,
        downloadURL: downloadURL || storagePath,
        storagePath: storagePath || undefined,
        contentType: String(item?.contentType || form?.contentType || '').trim() || undefined,
        uploadedAtIso: new Date().toISOString(),
        source: 'application-portal',
        sourceApplicationId: applicationId,
        formName,
        applicationId,
      };
      break;
    }
  });
  return out;
}

export function buildAlftCoverSheetPackageSubject(memberName: string, memberMrn: string) {
  const name = String(memberName || '').trim() || 'Member';
  const mrn = String(memberMrn || '').trim() || 'N/A';
  return `Request for Ongoing ALFT For ${name} and ${mrn}`;
}

export function buildAlftCoverSheetPackagePortalUrl(packageId?: string) {
  const base =
    String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://www.carehomefinders.com').replace(
      /\/$/,
      ''
    );
  const path = '/admin/ils-package-review';
  const id = String(packageId || '').trim();
  return id ? `${base}${path}?packageId=${encodeURIComponent(id)}` : `${base}${path}`;
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
  managerVerified?: boolean;
  managerVerifiedByName?: string;
  staffName: string;
  packageId?: string;
  subjectOverride?: string;
  textOverride?: string;
  docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null | undefined>>;
}) {
  const memberName = String(params.memberName || '').trim() || 'Member';
  const memberMrn = String(params.memberMrn || '').trim() || 'N/A';
  const staffName = String(params.staffName || '').trim() || 'Connections staff';
  const placementType = params.placementType || 'rcfe';
  const authLabel = coverSheetPackageAuthLabel(params.packageType);
  const packageTypeLabel = params.packageType === 'initial' ? 'Initial' : 'Reassessment';
  const placementLabel = placementType === 'home' ? 'Home' : 'RCFE';
  const portalUrl = buildAlftCoverSheetPackagePortalUrl(params.packageId);
  const subject =
    String(params.subjectOverride || '').trim() ||
    buildAlftCoverSheetPackageSubject(memberName, memberMrn);
  const required = requiredCoverSheetPackageChecklist(params.packageType, placementType);
  const attachmentLines = required
    .filter((item) => item.kind === 'file')
    .map((item) => {
      const file = params.docs[item.key as CoverSheetPackageDocKey];
      return {
        key: item.key,
        label: item.label,
        fileName: String(file?.fileName || '').trim() || '(missing)',
        downloadURL: String(file?.downloadURL || '').trim(),
      };
    });

  const defaultText = [
    `Hi ${ALFT_COVER_SHEET_PACKAGE_TO_NAME},`,
    '',
    `Please find ALFT Ongoing Request for above member for ${authLabel}.`,
    '',
    'Please log into the portal to approve or reject (with explanation).',
    '',
    `Member: ${memberName}`,
    `MRN: ${memberMrn}`,
    `Package type: ${packageTypeLabel}`,
    `Placement: ${placementLabel}`,
    `Prepared by: ${staffName}`,
    `Verified by: ${
      params.managerVerified
        ? params.managerVerifiedByName || COVER_SHEET_PACKAGE_MANAGER_NAME
        : COVER_SHEET_PACKAGE_MANAGER_NAME
    }`,
    '',
    `Portal: ${portalUrl}`,
    '',
    'All required documents are attached to this email.',
    '',
    'Included documents:',
    ...attachmentLines.map((item) => `- ${item.label}: ${item.fileName}`),
    '',
    'Thank you,',
    staffName,
  ].join('\n');

  const text = String(params.textOverride || '').trim() || defaultText;
  const htmlBody = text
    .split('\n')
    .map((line) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (!escaped) return '<br/>';
      const withLinks = escaped.replace(
        /(https?:\/\/[^\s]+)/g,
        '<a href="$1" style="color:#1d4ed8;">$1</a>'
      );
      return `<p style="margin:0 0 8px;">${withLinks}</p>`;
    })
    .join('');

  const html = `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:720px;">
        ${htmlBody}
      </div>
    `;

  return {
    to: ALFT_COVER_SHEET_PACKAGE_TO,
    toName: ALFT_COVER_SHEET_PACKAGE_TO_NAME,
    toLabel: ALFT_COVER_SHEET_PACKAGE_TO_LABEL,
    subject,
    html,
    text,
    defaultText,
    authLabel,
    portalUrl,
    attachmentLines,
  };
}
