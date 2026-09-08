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

export const COVER_SHEET_PACKAGE_INITIAL_ONLY: Array<{
  key: CoverSheetPackageDocKey;
  label: string;
}> = [
  { key: 'rcfeW9', label: 'RCFE W-9' },
  { key: 'proofOfLicense', label: 'Proof of License' },
  { key: 'proofOfInsurance', label: 'Proof of Insurance' },
];

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
