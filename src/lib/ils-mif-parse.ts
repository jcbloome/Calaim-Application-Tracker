import { extractIdentitySignals, identityTokenLookupKeys, normalizeIdentityToken } from '@/lib/member-identity';
import { findCountyByCityAndZip } from '@/lib/california-cities';

export type IlsMifMasterRow = {
  rowId: string;
  sourceFileName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  memberSex: string;
  clientId2: string;
  memberAddress: string;
  memberCity: string;
  memberZip: string;
  memberState: string;
  memberCounty: string;
  memberDob: string;
  memberPhone: string;
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
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
  dateReceivedRequestForAuthorization: string;
  dateOfReferralAuthorizationDecision: string;
  extraAdminNotes: string;
  caspioExists: boolean;
  caspioMatchLabel: string;
  caspioMatchedClientId2: string;
  caspioMatchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | '';
  batchDuplicate: boolean;
  mergeStatus: 'unique' | 'duplicate_in_batch' | 'already_in_caspio' | 'incomplete';
  statusNote: string;
  /** Set when a Create Application skeleton was created for this member. */
  skeletonApplicationId?: string;
};

export const ILS_MIF_MASTER_COLLECTION = 'ils_mif_master_members';
export const ILS_MIF_CONSOLIDATOR_HANDOFF_KEY = 'ils_mif_consolidator_handoff';
export const ILS_MIF_CONSOLIDATION_RUNS_COLLECTION = 'ils_mif_consolidation_runs';
export const ILS_MIF_RUN_MEMBERS_SUBCOLLECTION = 'members';
export const ILS_MIF_RUN_REMOVED_SUBCOLLECTION = 'removed';
export const ILS_MIF_DECLINED_COLLECTION = 'ils_mif_declined_members';
export const ILS_MIF_NORTHERN_DECLINE_BATCHES_COLLECTION = 'ils_mif_northern_decline_batches';
export const ILS_MIF_REMOVED_COLLECTION = 'ils_mif_removed_members';
/** Hide from Create Application picker only — member stays on consolidator master list. */
export const ILS_MIF_CREATE_APP_EXCLUDED_COLLECTION = 'ils_mif_create_app_excluded';
export const ILS_MIF_AUDIT_COLLECTION = 'ils_mif_audit_log';
export const ILS_MIF_UPLOADED_FILES_COLLECTION = 'ils_mif_uploaded_files';
export const ILS_MIF_UPLOADED_MEMBERS_SUBCOLLECTION = 'members';
/** Log of skeleton applications created from Create App / consolidator flow. */
export const ILS_MIF_SKELETON_CREATES_COLLECTION = 'ils_mif_skeleton_creates';

/** Calendar month key (UTC) for monthly new-member tracking, e.g. `2026-08`. */
export function ilsMifMonthKeyFromIso(iso?: string) {
  const raw = String(iso || '').trim();
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatIlsMifMonthLabel(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || '').trim());
  if (!match) return monthKey || 'Unknown';
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Sort YYYY-MM keys newest first. */
export function sortIlsMifMonthKeysDesc(keys: string[]) {
  return [...keys].sort((a, b) => b.localeCompare(a));
}

/** Merge monthly count maps (additive). */
export function mergeIlsMifMonthlyCounts(
  base: Record<string, number>,
  increment: Record<string, number>
) {
  const next = { ...base };
  Object.entries(increment).forEach(([month, count]) => {
    const n = Number(count) || 0;
    if (!month || n <= 0) return;
    next[month] = (Number(next[month]) || 0) + n;
  });
  return next;
}

/** Merge nested month → assignee → count maps (additive). */
export function mergeIlsMifMonthlyAssigneeCounts(
  base: Record<string, Record<string, number>>,
  monthKey: string,
  assigneeName: string,
  increment = 1
) {
  const month = String(monthKey || '').trim();
  const name = String(assigneeName || '').trim() || 'Unassigned';
  const n = Number(increment) || 0;
  if (!month || n === 0) return { ...base };
  const next: Record<string, Record<string, number>> = { ...base };
  const monthMap = { ...(next[month] || {}) };
  monthMap[name] = (Number(monthMap[name]) || 0) + n;
  next[month] = monthMap;
  return next;
}

export function parseIlsMifMonthlyCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: Record<string, number> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([month, value]) => {
    const n = Number(value);
    if (/^\d{4}-\d{2}$/.test(month) && Number.isFinite(n) && n > 0) {
      next[month] = Math.floor(n);
    }
  });
  return next;
}

export function parseIlsMifMonthlyAssigneeCounts(
  raw: unknown
): Record<string, Record<string, number>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: Record<string, Record<string, number>> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([month, assignees]) => {
    if (!/^\d{4}-\d{2}$/.test(month) || !assignees || typeof assignees !== 'object' || Array.isArray(assignees)) {
      return;
    }
    const monthMap: Record<string, number> = {};
    Object.entries(assignees as Record<string, unknown>).forEach(([name, value]) => {
      const n = Number(value);
      if (name && Number.isFinite(n) && n > 0) monthMap[name] = Math.floor(n);
    });
    if (Object.keys(monthMap).length) next[month] = monthMap;
  });
  return next;
}

/** Require typed confirmation when bulk-sending this many or more northern decline emails. */
export const NORTHERN_DECLINE_CONFIRM_THRESHOLD = 10;

export const MASTER_LIST_PAGE_SIZE = 50;

export type IlsMifAuditAction =
  | 'northern_decline_bulk'
  | 'create_app_load'
  | 'create_app_exclude'
  | 'session_member_remove'
  | 'session_member_restore'
  | 'run_saved'
  | 'export_download'
  | 'skeleton_create'
  | 'skeleton_create_blocked'
  | 'skeleton_create_cleared_from_new'
  | 'caspio_push_cleared_from_new'
  | 'run_compare';

export type IlsMifMemberDiffSummary = {
  added: Array<Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum' | 'memberCounty'>>;
  removed: Array<Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum' | 'memberCounty'>>;
  unchangedCount: number;
};

export type IlsMifUploadedFileRecord = {
  id: string;
  fileName: string;
  uploadedAtIso: string;
  rowCount: number;
  uploadedBy: string;
  runId?: string;
  mifDateKey?: string;
  mifDateLabel?: string;
};

export type IlsMifMemberIdentitySummary = {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum?: string;
  memberDob?: string;
};

export function summarizeIlsMifMembersForBrowse(
  rows: Array<Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum'>>
): IlsMifMemberIdentitySummary[] {
  return rows
    .map((row) => ({
      memberFirstName: String(row.memberFirstName || '').trim(),
      memberLastName: String(row.memberLastName || '').trim(),
      memberMrn: String(row.memberMrn || '').trim(),
      memberMediCalNum: String(row.memberMediCalNum || '').trim(),
    }))
    .filter((row) => row.memberFirstName && row.memberLastName)
    .sort((a, b) => {
      const last = a.memberLastName.localeCompare(b.memberLastName, undefined, { sensitivity: 'base' });
      if (last) return last;
      return a.memberFirstName.localeCompare(b.memberFirstName, undefined, { sensitivity: 'base' });
    });
}

/** Prefer YYYYMMDD from names like ILS_CS_MIF_20260805.xlsx or MIF_20260805.xlsx. */
export function extractMifGeneratedDateKey(fileName: unknown): string {
  const name = String(fileName || '').trim();
  if (!name) return '';
  const mifPrefixed = name.match(/(?:^|[_\-.])MIF[_-]?(\d{8})(?:[_\-.]|$)/i);
  if (mifPrefixed?.[1]) return mifPrefixed[1];
  const anyEight = name.match(/(20\d{6})/);
  return anyEight?.[1] || '';
}

export function formatMifGeneratedDateLabel(dateKey: string): string {
  const key = String(dateKey || '').trim();
  if (!/^\d{8}$/.test(key)) return '';
  const yyyy = key.slice(0, 4);
  const mm = key.slice(4, 6);
  const dd = key.slice(6, 8);
  return `${mm}/${dd}/${yyyy}`;
}

export function compareMifFileNamesByGeneratedDate(a: unknown, b: unknown): number {
  const dateA = extractMifGeneratedDateKey(a);
  const dateB = extractMifGeneratedDateKey(b);
  if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

export function sortMifFileNamesByGeneratedDate(
  fileNames: string[],
  direction: 'asc' | 'desc' = 'desc'
): string[] {
  const sorted = [...fileNames].sort(compareMifFileNamesByGeneratedDate);
  return direction === 'desc' ? sorted.reverse() : sorted;
}

export type IlsMifDateUploadOverlap = {
  fileName: string;
  dateKey: string;
  dateLabel: string;
  exactNameMatches: string[];
  sameDateDifferentNames: string[];
};

export function findMifDateUploadOverlaps(
  incomingFileNames: string[],
  alreadyUploadedFileNames: string[]
): IlsMifDateUploadOverlap[] {
  const known = alreadyUploadedFileNames
    .map((fileName) => String(fileName || '').trim())
    .filter(Boolean);
  const knownLower = new Set(known.map((name) => name.toLowerCase()));
  const byDate = new Map<string, string[]>();
  known.forEach((fileName) => {
    const dateKey = extractMifGeneratedDateKey(fileName);
    if (!dateKey) return;
    const list = byDate.get(dateKey) || [];
    list.push(fileName);
    byDate.set(dateKey, list);
  });

  const overlaps: IlsMifDateUploadOverlap[] = [];
  incomingFileNames.forEach((rawName) => {
    const fileName = String(rawName || '').trim();
    if (!fileName) return;
    const dateKey = extractMifGeneratedDateKey(fileName);
    const exactNameMatches = knownLower.has(fileName.toLowerCase())
      ? known.filter((name) => name.toLowerCase() === fileName.toLowerCase())
      : [];
    const sameDateDifferentNames = dateKey
      ? (byDate.get(dateKey) || []).filter((name) => name.toLowerCase() !== fileName.toLowerCase())
      : [];
    if (!exactNameMatches.length && !sameDateDifferentNames.length) return;
    overlaps.push({
      fileName,
      dateKey,
      dateLabel: formatMifGeneratedDateLabel(dateKey) || dateKey || 'unknown date',
      exactNameMatches: sortMifFileNamesByGeneratedDate(exactNameMatches),
      sameDateDifferentNames: sortMifFileNamesByGeneratedDate(sameDateDifferentNames),
    });
  });
  return overlaps;
}

export type IlsMifConsolidationRunRecord = {
  id: string;
  createdAtIso: string;
  label: string;
  sourceFiles: string[];
  newMemberCount: number;
  totals?: {
    total?: number;
    unique?: number;
    caspio?: number;
    duplicates?: number;
    incomplete?: number;
    northern?: number;
  };
};

/** Fresno and north (Kaiser North service area we do not cover for ILS intake). */
export const NORTHERN_COUNTIES = [
  'Alameda',
  'Amador',
  'Butte',
  'Colusa',
  'Contra Costa',
  'Del Norte',
  'El Dorado',
  'Fresno',
  'Glenn',
  'Humboldt',
  'Kings',
  'Lake',
  'Lassen',
  'Madera',
  'Marin',
  'Mendocino',
  'Merced',
  'Modoc',
  'Napa',
  'Nevada',
  'Placer',
  'Plumas',
  'Sacramento',
  'San Francisco',
  'San Joaquin',
  'San Mateo',
  'Santa Clara',
  'Shasta',
  'Siskiyou',
  'Solano',
  'Sonoma',
  'Stanislaus',
  'Sutter',
  'Tehama',
  'Trinity',
  'Yolo',
  'Yuba',
] as const;

const normalizeCountyToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');

const NORTHERN_COUNTY_TOKENS = new Set(NORTHERN_COUNTIES.map((county) => normalizeCountyToken(county)));

export const isNorthernCounty = (countyValue: unknown) => {
  const token = normalizeCountyToken(countyValue);
  return Boolean(token) && NORTHERN_COUNTY_TOKENS.has(token);
};

const normalizeSheetHeader = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildMemberLookupNameKey = (firstName: unknown, lastName: unknown) =>
  `${normalizeLookupToken(firstName)}|${normalizeLookupToken(lastName)}`;

const toNameCase = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());

const stripTrailingNonNameTokens = (value: unknown) =>
  String(value || '')
    .replace(/\s+(jr|sr|ii|iii|iv|md|rn|msw)\.?$/i, '')
    .trim();

const normalizeUsZip = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const exact = text.match(/\b\d{5}(?:-\d{4})?\b/);
  if (exact?.[0]) return exact[0];
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  if (digits.length >= 5) return digits.slice(0, 5);
  return text;
};

const normalizePhoneDigits = (value: unknown) => String(value || '').replace(/\D/g, '');

const formatPhoneDashed = (digits: string) => {
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
};

const normalizeMediCalNumber = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const normalizeMemberSex = (value: unknown) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('f') || raw === '2') return 'Female';
  if (raw.startsWith('m') || raw === '1') return 'Male';
  return toNameCase(raw);
};

const toSpreadsheetDate = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 90000) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      const [y, m, day] = iso.split('-');
      return `${m}/${day}/${y}`;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10);
    const [y, m, day] = iso.split('-');
    return `${m}/${day}/${y}`;
  }
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return text;
};

const getSpreadsheetValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return String(value ?? '').trim();
  }
  return '';
};

const getSpreadsheetRawValue = (row: Record<string, unknown>, aliases: string[]) => {
  const normalizedAlias = aliases.map((x) => normalizeSheetHeader(x));
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (normalizedAlias.includes(nk)) return value;
  }
  return '';
};

const extractSpreadsheetMediCalNumber = (row: Record<string, unknown>) => {
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

/** Catch county columns with slight header wording differences. */
const extractSpreadsheetCountyFallback = (row: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    if (!nk.includes('county') || nk.includes('country')) continue;
    const text = String(value ?? '')
      .replace(/\s+county$/i, '')
      .trim();
    if (text.length >= 3 && !/^\d+$/.test(text)) return text;
  }
  return '';
};

export const pickIlsSheetName = (sheetNames: string[]): string => {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return '';
  const exact = sheetNames.find((name) => normalizeLookupToken(name) === 'csmif');
  if (exact) return exact;
  const includes = sheetNames.find((name) => normalizeLookupToken(name).includes('csmif'));
  if (includes) return includes;
  return sheetNames[0] || '';
};

export const buildIlsMifDedupeKey = (row: Pick<
  IlsMifMasterRow,
  'clientId2' | 'memberMrn' | 'memberMediCalNum' | 'memberFirstName' | 'memberLastName' | 'memberDob'
>) => {
  const clientId2 = normalizeIdentityToken(row.clientId2);
  if (clientId2) return `id2:${clientId2}`;
  const mrnRaw = normalizeIdentityToken(row.memberMrn);
  const mrn = mrnRaw.replace(/^0+/, '') || mrnRaw;
  if (mrn) return `mrn:${mrn}`;
  const mediCal = normalizeIdentityToken(row.memberMediCalNum);
  if (mediCal) return `cin:${mediCal}`;
  const name = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
  const dob = normalizeIdentityToken(row.memberDob);
  if (name !== '|' && dob) return `name_dob:${name}|${dob}`;
  if (name !== '|') return `name:${name}`;
  return `row:${row.memberFirstName}|${row.memberLastName}`;
};

/** Members in `incoming` that are not already present in `prior` (MRN → CIN → name). */
export function findNewMembersNotInPriorList(
  incoming: Array<
    Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum' | 'clientId2'>
  >,
  prior: Array<
    Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum' | 'clientId2'>
  >
) {
  const priorKeys = new Set(
    prior.map((row) =>
      buildIlsMifDedupeKey({
        clientId2: row.clientId2 || '',
        memberMrn: row.memberMrn,
        memberMediCalNum: row.memberMediCalNum,
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        memberDob: '',
      })
    )
  );
  return incoming.filter((row) => {
    const key = buildIlsMifDedupeKey({
      clientId2: row.clientId2 || '',
      memberMrn: row.memberMrn,
      memberMediCalNum: row.memberMediCalNum,
      memberFirstName: row.memberFirstName,
      memberLastName: row.memberLastName,
      memberDob: '',
    });
    return !priorKeys.has(key);
  });
}

/** Diff two member lists by dedupe key (for run-vs-run comparison). */
export function diffIlsMifMemberLists(
  current: Array<
    Pick<
      IlsMifMasterRow,
      | 'memberFirstName'
      | 'memberLastName'
      | 'memberMrn'
      | 'memberMediCalNum'
      | 'clientId2'
      | 'memberDob'
      | 'memberCounty'
    >
  >,
  prior: Array<
    Pick<
      IlsMifMasterRow,
      | 'memberFirstName'
      | 'memberLastName'
      | 'memberMrn'
      | 'memberMediCalNum'
      | 'clientId2'
      | 'memberDob'
      | 'memberCounty'
    >
  >
): IlsMifMemberDiffSummary {
  const toKey = (
    row: Pick<
      IlsMifMasterRow,
      'memberFirstName' | 'memberLastName' | 'memberMrn' | 'memberMediCalNum' | 'clientId2' | 'memberDob'
    >
  ) =>
    buildIlsMifDedupeKey({
      clientId2: row.clientId2 || '',
      memberMrn: row.memberMrn || '',
      memberMediCalNum: row.memberMediCalNum || '',
      memberFirstName: row.memberFirstName || '',
      memberLastName: row.memberLastName || '',
      memberDob: row.memberDob || '',
    });

  const priorByKey = new Map(prior.map((row) => [toKey(row), row]));
  const currentByKey = new Map(current.map((row) => [toKey(row), row]));
  const added: IlsMifMemberDiffSummary['added'] = [];
  const removed: IlsMifMemberDiffSummary['removed'] = [];
  let unchangedCount = 0;

  currentByKey.forEach((row, key) => {
    if (priorByKey.has(key)) unchangedCount += 1;
    else {
      added.push({
        memberFirstName: row.memberFirstName || '',
        memberLastName: row.memberLastName || '',
        memberMrn: row.memberMrn || '',
        memberMediCalNum: row.memberMediCalNum || '',
        memberCounty: row.memberCounty || '',
      });
    }
  });
  priorByKey.forEach((row, key) => {
    if (!currentByKey.has(key)) {
      removed.push({
        memberFirstName: row.memberFirstName || '',
        memberLastName: row.memberLastName || '',
        memberMrn: row.memberMrn || '',
        memberMediCalNum: row.memberMediCalNum || '',
        memberCounty: row.memberCounty || '',
      });
    }
  });

  return { added, removed, unchangedCount };
}

const mapRawRowToMasterRow = (
  raw: Record<string, unknown>,
  idx: number,
  sourceFileName: string
): IlsMifMasterRow | null => {
  const memberFirstName = toNameCase(getSpreadsheetValue(raw, ['Member First Name']));
  const memberLastName = toNameCase(stripTrailingNonNameTokens(getSpreadsheetValue(raw, ['Member Last Name'])));
  if (!memberFirstName || !memberLastName) return null;

  const memberMrn = getSpreadsheetValue(raw, ['Medical Record Number (MRN)']);
  const memberMediCalNum = extractSpreadsheetMediCalNumber(raw);
  const memberSex = normalizeMemberSex(
    getSpreadsheetValue(raw, ['Member Gender Code', 'Member Gender', 'Member Sex', 'Gender', 'Sex'])
  );
  const clientId2 = getSpreadsheetValue(raw, ['Client_ID2', 'Client ID2', 'client_ID2']);
  const residentialCity = toNameCase(getSpreadsheetValue(raw, ['Member Residential City']));
  const residentialZip = normalizeUsZip(
    getSpreadsheetValue(raw, [
      'Member Residential Zip Code',
      'Member Resdidential Zip Code',
      'Member Resdential Zip Code',
      'Member Residential Zip',
      'Residential Zip Code',
      'Residential Zip',
    ])
  );
  const mailingAddress = toNameCase(getSpreadsheetValue(raw, ['Member Mailing Address']));
  const mailingCity = toNameCase(getSpreadsheetValue(raw, ['Member Mailing City']));
  const mailingZip = normalizeUsZip(getSpreadsheetValue(raw, ['Member Mailing Zip Code']));
  const memberCity = mailingCity || residentialCity;
  const memberZip = mailingCity ? mailingZip || residentialZip : residentialZip || mailingZip;
  const memberCountyRaw = String(
    getSpreadsheetValue(raw, [
      'Medi-Cal Coverage County',
      'Medi Cal Coverage County',
      'Coverage County',
      'Member County',
      'Member Residential County',
      'Residential County',
      'County of Residence',
      'Residence County',
      'County',
    ]) || extractSpreadsheetCountyFallback(raw) || ''
  )
    .replace(/\s+county$/i, '')
    .trim();
  let memberCounty =
    memberCountyRaw.length >= 3 && !/^\d+$/.test(memberCountyRaw) ? toNameCase(memberCountyRaw) : '';
  if (!memberCounty) {
    memberCounty = toNameCase(findCountyByCityAndZip(memberCity, memberZip) || '') || '';
  }
  const memberDob = toSpreadsheetDate(getSpreadsheetRawValue(raw, ['Member Date of Birth']));
  const primaryPhone = getSpreadsheetValue(raw, ['Primary Phone Number']);
  const homePhone = getSpreadsheetValue(raw, ['Home Phone Number']);
  const memberPhone = primaryPhone || homePhone;
  const referringOrganization = toNameCase(getSpreadsheetValue(raw, ['Referring Organization']));
  const referringIndividualName = toNameCase(getSpreadsheetValue(raw, ['Referring Individual Name']));
  const referringIndividualPhone = getSpreadsheetValue(raw, ['Referring Individual Phone Number']);
  const referringIndividualEmail = String(
    getSpreadsheetValue(raw, ['Referring Individual Email Address']) || ''
  )
    .trim()
    .toLowerCase();
  const emergencyContactName = toNameCase(
    getSpreadsheetValue(raw, ['Emergency/ Alternate Contact Name', 'Emergency/Alternate Contact Name'])
  );
  const emergencyContactRelationship = toNameCase(
    getSpreadsheetValue(raw, [
      'Emergency/Alternate Contact Relation',
      'Emergency/ Alternate Contact Relation',
    ])
  );
  const emergencyContactPhone =
    getSpreadsheetValue(raw, [
      'Emergency/Alternate Contact Phone Number',
      'Emergency/ Alternate Contact Phone Number',
      'Emergency/Contact Alternate Contact Phone Number',
    ]) ||
    Object.entries(raw || {}).reduce((found, [key, value]) => {
      if (found) return found;
      const nk = normalizeSheetHeader(key);
      if (
        nk.includes('emergency') &&
        nk.includes('phone') &&
        !nk.includes('referring') &&
        !nk.includes('primary') &&
        !nk.includes('home')
      ) {
        return String(value ?? '').trim();
      }
      return '';
    }, '');
  const emergencyContactEmail = String(
    getSpreadsheetValue(raw, [
      'Emergency/Alternate Contact Email Address',
      'Emergency/ Alternate Contact Email Address',
      'Emergency/Alternate Contact Email',
      'Emergency Contact Email Address',
      'Emergency Contact Email',
    ]) ||
      Object.entries(raw || {}).reduce((found, [key, value]) => {
        if (found) return found;
        const nk = normalizeSheetHeader(key);
        if (nk.includes('emergency') && nk.includes('email') && !nk.includes('referring')) {
          return String(value ?? '').trim();
        }
        return '';
      }, '') ||
      ''
  )
    .trim()
    .toLowerCase();
  const memberEmail = String(getSpreadsheetValue(raw, ['Member Email Address']) || '')
    .trim()
    .toLowerCase();
  const authorizationNumberT2038 = getSpreadsheetValue(raw, ['Authorization Number']);
  const authorizationStartT2038 = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Authorization Start Date'])
  );
  const authorizationEndT2038 = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Authorizatin End Date', 'Authorization End Date'])
  );
  const dateReceivedRequestForAuthorization = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Date Received Request for Authorization'])
  );
  const dateOfReferralAuthorizationDecision = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Date of Referral Authorization Decision'])
  );
  const incomplete = !memberMediCalNum;

  return {
    rowId: `mif-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    sourceFileName,
    memberFirstName,
    memberLastName,
    memberMrn,
    memberMediCalNum,
    memberSex,
    clientId2,
    memberAddress: mailingAddress,
    memberCity,
    memberZip,
    memberState: '',
    memberCounty,
    memberDob,
    memberPhone: normalizePhoneDigits(memberPhone)
      ? formatPhoneDashed(normalizePhoneDigits(memberPhone))
      : String(memberPhone || '').trim(),
    memberEmail,
    contactPhone: normalizePhoneDigits(emergencyContactPhone || referringIndividualPhone)
      ? formatPhoneDashed(normalizePhoneDigits(emergencyContactPhone || referringIndividualPhone))
      : '',
    contactEmail: emergencyContactEmail || referringIndividualEmail,
    referringOrganization,
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactPhone: normalizePhoneDigits(emergencyContactPhone)
      ? formatPhoneDashed(normalizePhoneDigits(emergencyContactPhone))
      : '',
    emergencyContactEmail,
    careManagerName: referringIndividualName,
    careManagerPhone: normalizePhoneDigits(referringIndividualPhone)
      ? formatPhoneDashed(normalizePhoneDigits(referringIndividualPhone))
      : '',
    careManagerEmail: referringIndividualEmail,
    authorizationNumberT2038,
    authorizationStartT2038,
    authorizationEndT2038,
    dateReceivedRequestForAuthorization,
    dateOfReferralAuthorizationDecision,
    extraAdminNotes: '',
    caspioExists: false,
    caspioMatchLabel: '',
    caspioMatchedClientId2: '',
    caspioMatchedBy: '',
    batchDuplicate: false,
    mergeStatus: incomplete ? 'incomplete' : 'unique',
    statusNote: incomplete ? 'Missing Medi-Cal/CIN' : '',
  };
};

export async function parseIlsMifSpreadsheetFile(file: File): Promise<IlsMifMasterRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = pickIlsSheetName(wb.SheetNames);
  if (!sheetName) throw new Error(`${file.name}: no worksheet found.`);
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (!rows.length) throw new Error(`${file.name}: spreadsheet has no data rows.`);
  const sourceFileName = String(file.name || '').trim() || 'upload.xlsx';
  return rows
    .map((raw, idx) => mapRawRowToMasterRow(raw, idx, sourceFileName))
    .filter((row): row is IlsMifMasterRow => Boolean(row));
}

export function dedupeIlsMifMasterRows(rows: IlsMifMasterRow[]): IlsMifMasterRow[] {
  const seen = new Map<string, string>();
  return rows.map((row) => {
    const key = buildIlsMifDedupeKey(row);
    const firstId = seen.get(key);
    if (!firstId) {
      seen.set(key, row.rowId);
      return {
        ...row,
        batchDuplicate: false,
        mergeStatus: row.mergeStatus === 'incomplete' ? 'incomplete' : row.caspioExists ? 'already_in_caspio' : 'unique',
        statusNote: row.mergeStatus === 'incomplete' ? row.statusNote : row.caspioExists ? row.statusNote : '',
      };
    }
    return {
      ...row,
      batchDuplicate: true,
      mergeStatus: 'duplicate_in_batch',
      statusNote: `Duplicate of row in this master list (${firstId})`,
    };
  });
}

export function annotateIlsMifRowsWithCaspioMembers(
  rows: IlsMifMasterRow[],
  members: any[]
): IlsMifMasterRow[] {
  const byMrn = new Map<string, { label: string; clientId2: string; county: string }>();
  const byMediCal = new Map<string, { label: string; clientId2: string; county: string }>();
  const byName = new Map<string, { label: string; clientId2: string; county: string }>();
  const byClientId2 = new Map<string, { label: string; clientId2: string; county: string }>();

  const mrnLookupKeys = (token: string) => new Set(identityTokenLookupKeys(token));

  const setMrnMatch = (token: string, value: { label: string; clientId2: string; county: string }) => {
    mrnLookupKeys(token).forEach((key) => {
      if (!byMrn.has(key)) byMrn.set(key, value);
    });
  };

  const getMrnMatch = (token: string) => {
    for (const key of mrnLookupKeys(token)) {
      const hit = byMrn.get(key);
      if (hit) return hit;
    }
    return undefined;
  };

  members.forEach((member) => {
    const raw = (member?.caspioRaw || member || {}) as Record<string, unknown>;
    const firstName = String(member?.memberFirstName || member?.Senior_First || raw?.Senior_First || '').trim();
    const lastName = String(member?.memberLastName || member?.Senior_Last || raw?.Senior_Last || '').trim();
    const label = `${lastName}, ${firstName}`.trim().replace(/^,\s*/, '') || 'Caspio Member';
    const clientId2 = String(
      member?.client_ID2 || member?.Client_ID2 || raw?.Client_ID2 || raw?.client_ID2 || ''
    ).trim();
    const county = toNameCase(
      String(
        member?.memberCounty ||
          member?.Member_County ||
          raw?.Member_County ||
          raw?.memberCounty ||
          ''
      )
        .replace(/\s+county$/i, '')
        .trim()
    );
    const signals = extractIdentitySignals(
      {
        ...raw,
        ...member,
        memberFirstName: firstName,
        memberLastName: lastName,
        clientId2,
      },
      {
        firstNameFields: ['memberFirstName', 'Senior_First', 'First_Name'],
        lastNameFields: ['memberLastName', 'Senior_Last', 'Last_Name'],
        mrnFields: ['Member_MRN', 'MRN', 'Medical_Record_Number', 'memberMrn'],
        mediCalFields: [
          'memberMediCalNum',
          'MediCal_Number',
          'MCP_CIN',
          'Medical_Number',
          'CIN',
          'Medi_Cal_Number',
        ],
        clientId2Fields: ['clientId2', 'client_ID2', 'Client_ID2'],
      }
    );
    const matchValue = { label, clientId2, county };
    if (signals.mrnToken) setMrnMatch(signals.mrnToken, matchValue);
    if (signals.mediCalToken && !byMediCal.has(signals.mediCalToken)) {
      byMediCal.set(signals.mediCalToken, matchValue);
    }
    if (signals.clientId2Token && !byClientId2.has(signals.clientId2Token)) {
      byClientId2.set(signals.clientId2Token, matchValue);
    }
    const nameKey = buildMemberLookupNameKey(firstName, lastName);
    if (nameKey !== '|' && !byName.has(nameKey)) byName.set(nameKey, matchValue);
  });

  return rows.map((row) => {
    if (row.batchDuplicate) return row;
    const rowSignals = extractIdentitySignals(
      {
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        memberMrn: row.memberMrn,
        memberMediCalNum: row.memberMediCalNum,
        clientId2: row.clientId2,
      },
      {
        mrnFields: ['memberMrn'],
        mediCalFields: ['memberMediCalNum'],
        clientId2Fields: ['clientId2'],
      }
    );
    const nameKey = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
    const clientId2Match = rowSignals.clientId2Token ? byClientId2.get(rowSignals.clientId2Token) : undefined;
    const mrnMatch = !clientId2Match && rowSignals.mrnToken ? getMrnMatch(rowSignals.mrnToken) : undefined;
    const mediCalMatch =
      !clientId2Match && !mrnMatch && rowSignals.mediCalToken ? byMediCal.get(rowSignals.mediCalToken) : undefined;
    const nameMatch =
      !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|' ? byName.get(nameKey) : undefined;
    const match = clientId2Match || mrnMatch || mediCalMatch || nameMatch;
    if (!match) {
      const inferredCounty =
        String(row.memberCounty || '').trim() ||
        toNameCase(findCountyByCityAndZip(row.memberCity, row.memberZip) || '') ||
        '';
      return {
        ...row,
        memberCounty: inferredCounty || row.memberCounty,
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '',
        mergeStatus: row.mergeStatus === 'incomplete' ? 'incomplete' : 'unique',
        statusNote: row.mergeStatus === 'incomplete' ? row.statusNote : '',
      };
    }
    const matchedBy = clientId2Match
      ? 'client_id2'
      : mrnMatch
        ? 'mrn'
        : mediCalMatch
          ? 'medi_cal'
          : 'name';
    let nextCounty = String(row.memberCounty || '').trim();
    if (!nextCounty && match.county) nextCounty = match.county;
    if (!nextCounty) {
      nextCounty = toNameCase(findCountyByCityAndZip(row.memberCity, row.memberZip) || '') || '';
    }
    return {
      ...row,
      memberCounty: nextCounty || row.memberCounty,
      caspioExists: true,
      caspioMatchLabel: match.label,
      caspioMatchedClientId2: match.clientId2,
      caspioMatchedBy: matchedBy,
      mergeStatus: row.mergeStatus === 'incomplete' ? 'incomplete' : 'already_in_caspio',
      statusNote: `Already in Caspio (${matchedBy.replace('_', ' ')}): ${match.label}`,
    };
  });
}

export function annotateIdentityRowsAgainstMasterMembers<T extends {
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  clientId2?: string;
}>(
  rows: T[],
  masterMembers: Array<Partial<IlsMifMasterRow>>
): Array<
  T & {
    mifMasterExists: boolean;
    mifMasterMatchLabel: string;
    mifMasterMatchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | '';
  }
> {
  const byMrn = new Map<string, string>();
  const byMediCal = new Map<string, string>();
  const byName = new Map<string, string>();
  const byClientId2 = new Map<string, string>();

  masterMembers.forEach((member) => {
    const firstName = String(member.memberFirstName || '').trim();
    const lastName = String(member.memberLastName || '').trim();
    const label = `${lastName}, ${firstName}`.trim().replace(/^,\s*/, '') || 'MIF Master Member';
    const signals = extractIdentitySignals(
      {
        memberFirstName: firstName,
        memberLastName: lastName,
        memberMrn: member.memberMrn,
        memberMediCalNum: member.memberMediCalNum,
        clientId2: member.clientId2,
      },
      {
        mrnFields: ['memberMrn'],
        mediCalFields: ['memberMediCalNum'],
        clientId2Fields: ['clientId2'],
      }
    );
    identityTokenLookupKeys(signals.mrnToken).forEach((key) => {
      if (key && !byMrn.has(key)) byMrn.set(key, label);
    });
    identityTokenLookupKeys(signals.mediCalToken).forEach((key) => {
      if (key && !byMediCal.has(key)) byMediCal.set(key, label);
    });
    if (signals.clientId2Token && !byClientId2.has(signals.clientId2Token)) {
      byClientId2.set(signals.clientId2Token, label);
    }
    const nameKey = buildMemberLookupNameKey(firstName, lastName);
    if (nameKey !== '|' && !byName.has(nameKey)) byName.set(nameKey, label);
  });

  return rows.map((row) => {
    const rowSignals = extractIdentitySignals(
      {
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        memberMrn: row.memberMrn,
        memberMediCalNum: row.memberMediCalNum,
        clientId2: row.clientId2 || '',
      },
      {
        mrnFields: ['memberMrn'],
        mediCalFields: ['memberMediCalNum'],
        clientId2Fields: ['clientId2'],
      }
    );
    const nameKey = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
    const clientId2Match = rowSignals.clientId2Token ? byClientId2.get(rowSignals.clientId2Token) : undefined;
    const mrnMatch = !clientId2Match
      ? identityTokenLookupKeys(rowSignals.mrnToken)
          .map((key) => byMrn.get(key))
          .find(Boolean)
      : undefined;
    const mediCalMatch =
      !clientId2Match && !mrnMatch
        ? identityTokenLookupKeys(rowSignals.mediCalToken)
            .map((key) => byMediCal.get(key))
            .find(Boolean)
        : undefined;
    const nameMatch =
      !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|' ? byName.get(nameKey) : undefined;
    const match = clientId2Match || mrnMatch || mediCalMatch || nameMatch;
    if (!match) {
      return {
        ...row,
        mifMasterExists: false,
        mifMasterMatchLabel: '',
        mifMasterMatchedBy: '' as const,
      };
    }
    return {
      ...row,
      mifMasterExists: true,
      mifMasterMatchLabel: match,
      mifMasterMatchedBy: (clientId2Match
        ? 'client_id2'
        : mrnMatch
          ? 'mrn'
          : mediCalMatch
            ? 'medi_cal'
            : 'name') as 'client_id2' | 'mrn' | 'medi_cal' | 'name',
    };
  });
}

const CS_MIF_EXPORT_HEADERS = [
  'Member First Name',
  'Member Last Name',
  'Medical Record Number (MRN)',
  'Medi-Cal Member Client Index Number (CIN)',
  'Member Gender Code',
  'Client_ID2',
  'Member Residential City',
  'Member Residential Zip Code',
  'Member Mailing Address',
  'Member Mailing City',
  'Member Mailing Zip Code',
  'Medi-Cal Coverage County',
  'Member Date of Birth',
  'Primary Phone Number',
  'Home Phone Number',
  'Referring Organization',
  'Referring Individual Name',
  'Referring Individual Phone Number',
  'Referring Individual Email Address',
  'Emergency/ Alternate Contact Name',
  'Emergency/Alternate Contact Relation',
  'Emergency/Alternate Contact Phone Number',
  'Emergency/Alternate Contact Email Address',
  'Member Email Address',
  'Authorization Number',
  'Authorization Start Date',
  'Authorization End Date',
  'Date Received Request for Authorization',
  'Date of Referral Authorization Decision',
] as const;

export function masterRowsToCsMifExportRows(rows: IlsMifMasterRow[]) {
  return rows.map((row) => ({
    'Member First Name': row.memberFirstName || '',
    'Member Last Name': row.memberLastName || '',
    'Medical Record Number (MRN)': row.memberMrn || '',
    'Medi-Cal Member Client Index Number (CIN)': row.memberMediCalNum || '',
    'Member Gender Code': row.memberSex || '',
    Client_ID2: row.clientId2 || '',
    'Member Residential City': row.memberCity || '',
    'Member Residential Zip Code': row.memberZip || '',
    'Member Mailing Address': row.memberAddress || '',
    'Member Mailing City': row.memberCity || '',
    'Member Mailing Zip Code': row.memberZip || '',
    'Medi-Cal Coverage County': row.memberCounty || '',
    'Member Date of Birth': row.memberDob || '',
    'Primary Phone Number': row.memberPhone || '',
    'Home Phone Number': '',
    'Referring Organization': row.referringOrganization || '',
    'Referring Individual Name': row.careManagerName || '',
    'Referring Individual Phone Number': row.careManagerPhone || '',
    'Referring Individual Email Address': row.careManagerEmail || '',
    'Emergency/ Alternate Contact Name': row.emergencyContactName || '',
    'Emergency/Alternate Contact Relation': row.emergencyContactRelationship || '',
    'Emergency/Alternate Contact Phone Number': row.emergencyContactPhone || '',
    'Emergency/Alternate Contact Email Address': row.emergencyContactEmail || '',
    'Member Email Address': row.memberEmail || '',
    'Authorization Number': row.authorizationNumberT2038 || '',
    'Authorization Start Date': row.authorizationStartT2038 || '',
    'Authorization End Date': row.authorizationEndT2038 || '',
    'Date Received Request for Authorization': row.dateReceivedRequestForAuthorization || '',
    'Date of Referral Authorization Decision': row.dateOfReferralAuthorizationDecision || '',
  }));
}

export async function downloadIlsMifMasterAsCsMifWorkbook(
  rows: IlsMifMasterRow[],
  fileName?: string
) {
  const XLSX = await import('xlsx');
  const exportRows = masterRowsToCsMifExportRows(rows);
  const worksheet = XLSX.utils.json_to_sheet(exportRows, {
    header: [...CS_MIF_EXPORT_HEADERS],
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CS_MIF');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outName = String(fileName || '').trim() || `ILS_CS_MIF_Master_${stamp}.xlsx`;
  XLSX.writeFile(workbook, outName);
  return outName;
}

export function masterRowToCreateAppImportShape(row: IlsMifMasterRow) {
  return {
    rowId: row.rowId,
    sourceType: 'spreadsheet' as const,
    sourceFileName: row.sourceFileName,
    memberFirstName: row.memberFirstName,
    memberLastName: row.memberLastName,
    memberMrn: row.memberMrn,
    memberMediCalNum: row.memberMediCalNum,
    memberSex: row.memberSex,
    clientId2: row.clientId2,
    memberAddress: row.memberAddress,
    memberCity: row.memberCity,
    memberZip: row.memberZip,
    memberState: row.memberState,
    memberCounty: row.memberCounty,
    memberDob: row.memberDob,
    memberPhone: row.memberPhone,
    memberEmail: row.memberEmail,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    referringOrganization: row.referringOrganization,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: row.emergencyContactRelationship,
    emergencyContactPhone: row.emergencyContactPhone,
    emergencyContactEmail: row.emergencyContactEmail,
    careManagerName: row.careManagerName,
    careManagerPhone: row.careManagerPhone,
    careManagerEmail: row.careManagerEmail,
    eligibilityCheckStatus: 'Pending' as const,
    authorizationNumberT2038: row.authorizationNumberT2038,
    authorizationStartT2038: row.authorizationStartT2038,
    authorizationEndT2038: row.authorizationEndT2038,
    kaiserStatus: '',
    dateReceivedRequestForAuthorization: row.dateReceivedRequestForAuthorization,
    dateOfReferralAuthorizationDecision: row.dateOfReferralAuthorizationDecision,
    cptCode: '',
    diagnosticCode: '',
    assignedStaffId: '',
    assignedStaffName: '',
    createStatus: 'idle' as const,
    pushStatus: 'idle' as const,
    deleteStatus: 'idle' as const,
    statusNote: row.statusNote,
    applicationId: '',
    pushedClientId2: '',
    caspioExists: row.caspioExists,
    caspioMatchLabel: row.caspioMatchLabel,
    caspioMatchedClientId2: row.caspioMatchedClientId2,
    caspioMatchedBy:
      row.caspioMatchedBy === 'client_id2'
        ? 'name'
        : row.caspioMatchedBy === 'mrn' || row.caspioMatchedBy === 'medi_cal' || row.caspioMatchedBy === 'name'
          ? row.caspioMatchedBy
          : '',
    mifMasterExists: true,
    mifMasterMatchLabel: `${row.memberLastName || ''}, ${row.memberFirstName || ''}`.trim().replace(/^,\s*/, ''),
    mifMasterMatchedBy: 'name' as const,
    extraAdminNotes: row.extraAdminNotes,
  };
}
