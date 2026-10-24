import { resolveIlsMifDedupeKey } from '@/lib/ils-mif-consolidator-sync';
import { normalizeMediCalNumber, toMmDdYyyy } from './service-request-parsing';

export type KaiserIlsImportRow = {
  rowId: string;
  sourceType: 'spreadsheet' | 'single_auth_pdf';
  sourceFileName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  memberSex: string;
  clientId2: string;
  memberAddress: string;
  memberResidentialAddress?: string;
  memberResidentialCity?: string;
  memberResidentialZip?: string;
  memberMailingCity?: string;
  memberMailingZip?: string;
  memberCity: string;
  memberZip: string;
  memberState: string;
  memberCounty: string;
  memberDob: string;
  memberPhone: string;
  primaryPhoneNumber?: string;
  homePhoneNumber?: string;
  mifOriginalColumns?: Record<string, string>;
  memberEmail: string;
  contactPhone: string;
  contactEmail: string;
  referringOrganization: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  emergencyContactEmail: string;
  careManagerName: string;
  careManagerPhone: string;
  careManagerEmail: string;
  eligibilityCheckStatus: 'Pending' | 'CalAIM Eligible' | 'Not CalAIM Eligible';
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  kaiserStatus: string;
  dateReceivedRequestForAuthorization: string;
  dateOfReferralAuthorizationDecision: string;
  cptCode: string;
  diagnosticCode: string;
  assignedStaffId: string;
  assignedStaffName: string;
  createStatus: 'idle' | 'created' | 'failed';
  pushStatus: 'idle' | 'pushed' | 'failed';
  deleteStatus: 'idle' | 'deleted' | 'failed';
  statusNote: string;
  applicationId: string;
  pushedClientId2: string;
  caspioExists: boolean;
  caspioMatchLabel: string;
  caspioMatchedClientId2: string;
  caspioMatchedBy: 'mrn' | 'medi_cal' | 'name' | '';
  caspioCalAIMStatus?: string;
  needsAuthorizedUpdate?: boolean;
  mifMasterExists: boolean;
  mifMasterMatchLabel: string;
  mifMasterMatchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | '';
  extraAdminNotes?: string;
};

export const normalizeEligibilityStatus = (value: unknown): 'Pending' | 'CalAIM Eligible' | 'Not CalAIM Eligible' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === 'calaim eligible' || normalized === 'eligible') return 'CalAIM Eligible';
  if (
    normalized === 'not calaim eligible' ||
    normalized === 'not eligible' ||
    normalized === 'ineligible'
  ) {
    return 'Not CalAIM Eligible';
  }
  return 'Pending';
};

export const isIlsRowCreated = (row: KaiserIlsImportRow) =>
  Boolean(String(row.applicationId || '').trim()) || row.createStatus === 'created';
/** Only lock after a skeleton already exists — in-Caspio rows can still be parsed / skeleton-created when needed. */
export const isIlsRowLockedForSkeletonCreate = (row: KaiserIlsImportRow) => isIlsRowCreated(row);
export const getIlsRowCreateAppDedupeKey = (row: KaiserIlsImportRow) =>
  resolveIlsMifDedupeKey({
    memberFirstName: String(row.memberFirstName || '').trim(),
    memberLastName: String(row.memberLastName || '').trim(),
    memberMrn: String(row.memberMrn || '').trim(),
    memberMediCalNum: String(row.memberMediCalNum || '').trim(),
    memberDob: String(row.memberDob || '').trim(),
    clientId2: String(row.clientId2 || row.pushedClientId2 || '').trim(),
  });

export const toSpreadsheetTrackingMembers = (rows: KaiserIlsImportRow[]) =>
  rows
    .filter((row) => row.sourceType === 'spreadsheet')
    .map((row) => ({
    rowId: row.rowId,
    memberFirstName: row.memberFirstName || '',
    memberLastName: row.memberLastName || '',
    memberMrn: row.memberMrn || '',
    memberCity: row.memberCity || '',
    caspioExists: Boolean(row.caspioExists),
    caspioMatchLabel: row.caspioMatchLabel || '',
    skeletonCreated: isIlsRowCreated(row),
    applicationId: row.applicationId || '',
    statusNote: row.statusNote || '',
    authorizationNumberT2038: row.authorizationNumberT2038 || '',
    authorizationStartT2038: row.authorizationStartT2038 || '',
    authorizationEndT2038: row.authorizationEndT2038 || '',
    kaiserStatus: row.kaiserStatus || '',
  }));

export type IlsDuplicateMatch = {
  source: 'application';
  sourceId: string;
  sourceLabel: string;
  matchedAuthorization: string;
};

export const normalizeSheetHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const buildMemberLookupNameKey = (firstName: unknown, lastName: unknown) =>
  `${normalizeLookupToken(firstName)}|${normalizeLookupToken(lastName)}`;

export const pickIlsSheetName = (sheetNames: string[]): string => {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return '';
  const exact = sheetNames.find((name) => normalizeLookupToken(name) === 'csmif');
  if (exact) return exact;
  const includes = sheetNames.find((name) => normalizeLookupToken(name).includes('csmif'));
  if (includes) return includes;
  return sheetNames[0] || '';
};

export const toSpreadsheetDate = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 90000) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return toMmDdYyyy(d.toISOString().slice(0, 10));
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toMmDdYyyy(value.toISOString().slice(0, 10));
  }
  return toMmDdYyyy(String(value || '').trim());
};

export const normalizeUsZip = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const exact = text.match(/\b\d{5}(?:-\d{4})?\b/);
  if (exact?.[0]) return exact[0];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  if (digits.length >= 5) return digits.slice(0, 5);
  return text;
};

export const getSpreadsheetValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return String(value ?? '').trim();
  }
  return '';
};

export const getSpreadsheetRawValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return value;
  }
  return '';
};

const MIF_MAPPED_SHEET_HEADERS = [
  'Member First Name',
  'Member Last Name',
  'Medical Record Number (MRN)',
  'Medi-Cal Member Client Index Number (CIN)',
  'Medi Cal Member Client Index Number (CIN)',
  'Medi-Cal Member Client Index Number',
  'Medi Cal Member Client Index Number',
  'Member Client Index Number (CIN)',
  'MCP_CIN',
  'MCP CIN',
  'CIN',
  'Member Gender Code',
  'Member Gender',
  'Member Sex',
  'Gender',
  'Sex',
  'Client_ID2',
  'Client ID2',
  'client_ID2',
  'Member Residential City',
  'Member Residential Zip Code',
  'Member Resdidential Zip Code',
  'Member Resdential Zip Code',
  'Member Residential Zip',
  'Residential Zip Code',
  'Residential Zip',
  'Member Mailing Address',
  'Member Mailing City',
  'Member Mailing Zip Code',
  'Medi-Cal Coverage County',
  'Member County',
  'County',
  'Member Date of Birth',
  'Primary Phone Number',
  'Home Phone Number',
  'Referring Organization',
  'Referring Individual Name',
  'Referring Individual Phone Number',
  'Referring Individual Email Address',
  'Emergency/ Alternate Contact Name',
  'Emergency/Alternate Contact Name',
  'Emergency/Alternate Contact Relation',
  'Emergency/ Alternate Contact Relation',
  'Emergency/Alternate Contact Phone Number',
  'Emergency/ Alternate Contact Phone Number',
  'Emergency/Contact Alternate Contact Phone Number',
  'Emergency/Alternate Contact Email Address',
  'Emergency/ Alternate Contact Email Address',
  'Emergency/Alternate Contact Email',
  'Emergency Contact Email Address',
  'Emergency Contact Email',
  'Member Email Address',
  'Authorization Number',
  'Authorization Start Date',
  'Authorizatin End Date',
  'Authorization End Date',
  'Date Received Request for Authorization',
  'Date of Referral Authorization Decision',
];

export const collectUnusedSpreadsheetNotes = (row: Record<string, unknown>) => {
  const consumed = new Set(MIF_MAPPED_SHEET_HEADERS.map((header) => normalizeSheetHeader(header)));
  const lines: string[] = [];
  for (const [key, value] of Object.entries(row || {})) {
    const label = String(key || '').replace(/\s+/g, ' ').trim();
    const nk = normalizeSheetHeader(label);
    if (!nk || consumed.has(nk) || /^empty/i.test(nk) || nk.startsWith('__')) continue;
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text === '0' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'na') continue;
    if (text.length > 400) continue;
    lines.push(`${label}: ${text}`);
  }
  return lines;
};

export const extractSpreadsheetMediCalNumber = (row: Record<string, unknown>) => {
  const direct = getSpreadsheetValue(row, [
    'Medi-Cal Member Client Index Number (CIN)',
    'Medi Cal Member Client Index Number (CIN)',
    'Medi-Cal Member Client Index Number',
    'Medi Cal Member Client Index Number',
    'Member Client Index Number (CIN)',
    'MCP_CIN',
    'MCP CIN',
    'MCP CIN Number',
    'Medi-Cal Number',
    'Medi Cal Number',
    'Medical Number',
    'Member Medical Number',
    'Member Medi-Cal Number',
    'Member Medi Cal Number',
    'CIN',
    'CIN Number',
  ]);
  if (String(direct || '').trim()) return normalizeMediCalNumber(direct);

  // Fallback for spreadsheets where XLSX de-duplicates repeated headers
  // (e.g. appending `_1`) or where CIN headers vary slightly.
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    const looksLikeCinHeader =
      (nk.includes('clientindexnumber') && nk.includes('cin')) ||
      (nk.includes('mcp') && nk.includes('cin')) ||
      nk === 'cin' ||
      nk === 'cinnumber' ||
      (nk.includes('medicalnumber') && !nk.includes('medicalrecord'));
    if (!looksLikeCinHeader) continue;
    const candidate = normalizeMediCalNumber(value);
    if (candidate) return candidate;
  }

  return '';
};
