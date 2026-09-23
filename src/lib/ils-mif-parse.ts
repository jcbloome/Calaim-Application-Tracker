import { extractIdentitySignals, identityTokenLookupKeys, normalizeIdentityToken } from '@/lib/member-identity';
import { findCountyByCityAndZip } from '@/lib/california-cities';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';

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
  /** Original MIF residential street address (distinct from mailing address). */
  memberResidentialAddress?: string;
  memberResidentialCity?: string;
  memberResidentialZip?: string;
  memberMailingCity?: string;
  memberMailingZip?: string;
  primaryPhoneNumber?: string;
  homePhoneNumber?: string;
  /** Worksheet tab name from the uploaded MIF file (for round-trip export). */
  sourceSheetName?: string;
  /** Header row from the uploaded MIF file (exact column order for resubmission). */
  mifSourceHeaders?: string[];
  /** Original CS MIF column values captured at upload for ILS resubmission. */
  mifOriginalColumns?: Record<string, string>;
  extraAdminNotes: string;
  caspioExists: boolean;
  caspioMatchLabel: string;
  caspioMatchedClientId2: string;
  caspioMatchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name' | '';
  /** Caspio CalAIM_Status when matched (e.g. Pending, Authorized). */
  caspioCalAIMStatus?: string;
  /** Caspio Kaiser_Status when matched (e.g. T2038 Requested). */
  caspioKaiserStatus?: string;
  /**
   * True when this master-list member matches Caspio with CalAIM_Status Pending
   * and should be updated to Authorized (scanned across the entire master, including past MIFs).
   */
  needsAuthorizedUpdate?: boolean;
  /**
   * True when Caspio Kaiser_Status is T2038 Requested and should move to
   * T2038 Received, doc collection (full master scan, including past MIFs).
   */
  needsT2038ReceivedUpdate?: boolean;
  batchDuplicate: boolean;
  mergeStatus: 'unique' | 'duplicate_in_batch' | 'already_in_caspio' | 'incomplete';
  statusNote: string;
  /** Set when a Create Application skeleton was created for this member. */
  skeletonApplicationId?: string;
  /** YYYYMMDD from MIF filename (e.g. ILS_CS_MIF_20260805.xlsx) — persisted so Load Latest keeps dates. */
  mifDateKey?: string;
  /** Display label for mifDateKey (MM/DD/YYYY). */
  mifDateLabel?: string;
};

export const ILS_MIF_MASTER_COLLECTION = 'ils_mif_master_members';
export const ILS_MIF_CONSOLIDATOR_HANDOFF_KEY = 'ils_mif_consolidator_handoff';
export const ILS_MIF_CONSOLIDATION_RUNS_COLLECTION = 'ils_mif_consolidation_runs';

/** Eligible for Send → Create Application (parse into form / skeleton). Includes incomplete (e.g. missing CIN). */
export function isIlsMifCreateAppCandidate(
  row: Pick<IlsMifMasterRow, 'mergeStatus' | 'caspioExists' | 'skeletonApplicationId'>,
  declined = false
): boolean {
  if (declined) return false;
  if (String(row.skeletonApplicationId || '').trim()) return false;
  if (row.caspioExists || row.mergeStatus === 'already_in_caspio') return false;
  if (row.mergeStatus === 'duplicate_in_batch') return false;
  return row.mergeStatus === 'unique' || row.mergeStatus === 'incomplete';
}

export type IlsMifConsolidatorHandoff = {
  createdAt: string;
  sourceFiles?: string[];
  runId?: string;
  rows: ReturnType<typeof masterRowToCreateAppImportShape>[];
  /** When set, Create Application auto-parses this row into the form. */
  autoParseRowId?: string;
};

export function writeIlsMifConsolidatorHandoff(handoff: IlsMifConsolidatorHandoff) {
  if (typeof window === 'undefined') return;
  const raw = JSON.stringify(handoff);
  try {
    window.sessionStorage.setItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY, raw);
  } catch {
    // ignore quota / private mode
  }
  // localStorage survives window.open tab handoff more reliably than sessionStorage alone
  try {
    window.localStorage.setItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY, raw);
  } catch {
    // ignore
  }
}

export function readAndClearIlsMifConsolidatorHandoff(): IlsMifConsolidatorHandoff | null {
  if (typeof window === 'undefined') return null;
  let raw = '';
  try {
    raw = String(window.sessionStorage.getItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY) || '').trim();
  } catch {
    raw = '';
  }
  if (!raw) {
    try {
      raw = String(window.localStorage.getItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY) || '').trim();
    } catch {
      raw = '';
    }
  }
  try {
    window.sessionStorage.removeItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY);
  } catch {
    // ignore
  }
  try {
    window.localStorage.removeItem(ILS_MIF_CONSOLIDATOR_HANDOFF_KEY);
  } catch {
    // ignore
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as IlsMifConsolidatorHandoff;
    if (!parsed || !Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
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
/** Extra worksheets from uploaded MIFs (RFT, etc.) retained for master download. */
export const ILS_MIF_COMPANION_SHEETS_COLLECTION = 'ils_mif_companion_sheets';
/** Log of skeleton applications created from Create App / consolidator flow. */
export const ILS_MIF_SKELETON_CREATES_COLLECTION = 'ils_mif_skeleton_creates';

/** Non-CS-MIF worksheets captured from uploaded ILS workbooks (e.g. RFT). */
export type IlsMifCompanionSheet = {
  sheetName: string;
  /** Full sheet as array-of-arrays (header + data), stringified for Firestore/export. */
  matrix: string[][];
  sourceFileNames: string[];
};

export type IlsMifParseResult = {
  members: IlsMifMasterRow[];
  companionSheets: IlsMifCompanionSheet[];
};

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
  | 'northern_decline_resend'
  | 'member_undecline'
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
  | 'mif_pending_to_authorized_push'
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
  const mifPrefixed = name.match(/(?:^|[_\-. ])MIF[_\-.\s]?(\d{8})(?:[_\-.]|$)/i);
  if (mifPrefixed?.[1]) return mifPrefixed[1];
  // ILS_CS_MIF_2026.08.05 / MIF 2026-08-05 / MIF_08-05-2026
  const dotted = name.match(
    /(?:^|[_\-. ])MIF[_\-.\s]?(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[_\-.]|$)/i
  );
  if (dotted) {
    return `${dotted[1]}${dotted[2].padStart(2, '0')}${dotted[3].padStart(2, '0')}`;
  }
  const usInName = name.match(
    /(?:^|[_\-. ])MIF[_\-.\s]?(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})(?:[_\-.]|$)/i
  );
  if (usInName) {
    return `${usInName[3]}${usInName[1].padStart(2, '0')}${usInName[2].padStart(2, '0')}`;
  }
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

const normalizeIlsMifDisplayDate = (raw: unknown): { mifDateKey: string; mifDateLabel: string } => {
  if (raw == null || raw === '') return { mifDateKey: '', mifDateLabel: '' };
  // Excel serial date (days since 1899-12-30)
  const asNumber = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (Number.isFinite(asNumber) && asNumber >= 30000 && asNumber <= 60000) {
    const utc = new Date(Math.round((asNumber - 25569) * 86400 * 1000));
    if (!Number.isNaN(utc.getTime())) {
      const yyyy = utc.getUTCFullYear();
      const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(utc.getUTCDate()).padStart(2, '0');
      return { mifDateKey: `${yyyy}${mm}${dd}`, mifDateLabel: `${mm}/${dd}/${yyyy}` };
    }
  }

  const value = String(raw || '').trim();
  if (!value) return { mifDateKey: '', mifDateLabel: '' };

  if (/^\d{8}$/.test(value) && /^20\d{6}$/.test(value)) {
    return { mifDateKey: value, mifDateLabel: formatMifGeneratedDateLabel(value) || value };
  }

  const us = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (us) {
    const label = `${us[1].padStart(2, '0')}/${us[2].padStart(2, '0')}/${us[3]}`;
    return { mifDateKey: `${us[3]}${us[1].padStart(2, '0')}${us[2].padStart(2, '0')}`, mifDateLabel: label };
  }
  const iso = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) {
    const label = `${iso[2].padStart(2, '0')}/${iso[3].padStart(2, '0')}/${iso[1]}`;
    return { mifDateKey: `${iso[1]}${iso[2].padStart(2, '0')}${iso[3].padStart(2, '0')}`, mifDateLabel: label };
  }

  const fromEmbedded = extractMifGeneratedDateKey(value);
  if (fromEmbedded) {
    return {
      mifDateKey: fromEmbedded,
      mifDateLabel: formatMifGeneratedDateLabel(fromEmbedded) || fromEmbedded,
    };
  }
  return { mifDateKey: '', mifDateLabel: '' };
};

/** Resolve a display MIF date for a master-list row (persisted → filename → referral dates → original columns). */
export function resolveIlsMifMasterRowDateLabel(
  row: Pick<
    IlsMifMasterRow,
    | 'sourceFileName'
    | 'mifDateKey'
    | 'mifDateLabel'
    | 'dateReceivedRequestForAuthorization'
    | 'dateOfReferralAuthorizationDecision'
    | 'mifOriginalColumns'
  >
): { mifDateKey: string; mifDateLabel: string } {
  const fromPersistedLabel = normalizeIlsMifDisplayDate(row.mifDateLabel);
  if (fromPersistedLabel.mifDateLabel) {
    const key =
      String(row.mifDateKey || '').trim() ||
      fromPersistedLabel.mifDateKey ||
      extractMifGeneratedDateKey(`MIF_${fromPersistedLabel.mifDateKey}`);
    return {
      mifDateKey: key,
      mifDateLabel: fromPersistedLabel.mifDateLabel,
    };
  }

  const fromPersistedKey = normalizeIlsMifDisplayDate(row.mifDateKey);
  if (fromPersistedKey.mifDateLabel) return fromPersistedKey;

  const fromFile = extractMifGeneratedDateKey(row.sourceFileName);
  if (fromFile) {
    return { mifDateKey: fromFile, mifDateLabel: formatMifGeneratedDateLabel(fromFile) || fromFile };
  }

  for (const candidate of [
    row.dateReceivedRequestForAuthorization,
    row.dateOfReferralAuthorizationDecision,
  ]) {
    const normalized = normalizeIlsMifDisplayDate(candidate);
    if (normalized.mifDateLabel) return normalized;
  }

  const cols = row.mifOriginalColumns || {};
  for (const [header, value] of Object.entries(cols)) {
    const h = String(header || '').toLowerCase();
    if (
      !(
        h.includes('mif') ||
        h.includes('report date') ||
        h.includes('generated') ||
        h === 'date' ||
        (h.includes('date') && h.includes('received')) ||
        (h.includes('date') && h.includes('referral')) ||
        (h.includes('date') && h.includes('authorization')) ||
        h.includes('mif date') ||
        h.includes('file date')
      )
    ) {
      continue;
    }
    const fromColFile = extractMifGeneratedDateKey(value);
    if (fromColFile) {
      return { mifDateKey: fromColFile, mifDateLabel: formatMifGeneratedDateLabel(fromColFile) || fromColFile };
    }
    const normalized = normalizeIlsMifDisplayDate(value);
    if (normalized.mifDateLabel) return normalized;
  }

  return { mifDateKey: '', mifDateLabel: '' };
}

export function withResolvedIlsMifMasterRowDate(row: IlsMifMasterRow): IlsMifMasterRow {
  const resolved = resolveIlsMifMasterRowDateLabel(row);
  if (!resolved.mifDateLabel && !resolved.mifDateKey) return row;
  return {
    ...row,
    mifDateKey: resolved.mifDateKey || row.mifDateKey || undefined,
    mifDateLabel: resolved.mifDateLabel || row.mifDateLabel || undefined,
  };
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

/** Preserve Excel identifier cells (MRN/CIN/auth #) without scientific notation or float rounding. */
const formatSpreadsheetIdentifier = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) || Math.abs(value - Math.trunc(value)) < 1e-9) {
      return String(Math.trunc(value));
    }
    return String(value).trim();
  }
  const text = String(value).trim();
  if (!text) return '';
  // Excel often displays large auth numbers as 6.45722E+12 when the cell is numeric.
  const sci = text.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (sci) {
    const n = Number(text);
    if (Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
      return String(Math.trunc(n));
    }
  }
  return text;
};

const getSpreadsheetIdentifierValue = (row: Record<string, unknown>, aliases: string[]) => {
  const raw = getSpreadsheetRawValue(row, aliases);
  return formatSpreadsheetIdentifier(raw);
};

/** Map MIF header wording onto auth number / start / end, including T2038 and "stop" variants. */
function classifyMifAuthHeader(header: string): 'number' | 'start' | 'end' | '' {
  const nk = normalizeSheetHeader(header);
  if (!nk.includes('auth')) return '';
  if (nk.includes('decision') || nk.includes('receivedrequest') || nk.includes('referral')) return '';
  if (nk.includes('start')) return 'start';
  if (nk.includes('stop') || nk.includes('end') || nk.includes('expir')) return 'end';
  if (
    nk.includes('number') ||
    nk.includes('authno') ||
    nk.includes('authorizationno') ||
    nk === 'authorization' ||
    nk === 'auth' ||
    (nk.includes('t2038') && !nk.includes('date'))
  ) {
    return 'number';
  }
  return '';
}

/** Typed auth fields first, then any matching column saved from the original MIF. */
export function resolveIlsMifAuthorizationFields(source: {
  authorizationNumberT2038?: unknown;
  authorizationStartT2038?: unknown;
  authorizationEndT2038?: unknown;
  mifOriginalColumns?: Record<string, unknown> | null;
} | null | undefined): {
  authorizationNumberT2038: string;
  authorizationStartT2038: string;
  authorizationEndT2038: string;
} {
  const row = source || {};
  let number = formatSpreadsheetIdentifier(row.authorizationNumberT2038);
  let start = toSpreadsheetDate(row.authorizationStartT2038);
  let end = toSpreadsheetDate(row.authorizationEndT2038);
  const columns =
    row.mifOriginalColumns && typeof row.mifOriginalColumns === 'object' ? row.mifOriginalColumns : {};
  for (const [key, value] of Object.entries(columns)) {
    const kind = classifyMifAuthHeader(key);
    if (!kind) continue;
    if (kind === 'number' && !number) number = formatSpreadsheetIdentifier(value);
    if (kind === 'start' && !start) start = toSpreadsheetDate(value);
    if (kind === 'end' && !end) end = toSpreadsheetDate(value);
  }
  return {
    authorizationNumberT2038: number,
    authorizationStartT2038: start,
    authorizationEndT2038: end,
  };
}

const extractSpreadsheetMediCalNumber = (row: Record<string, unknown>) => {
  const direct = getSpreadsheetIdentifierValue(row, [
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
  if (direct) return normalizeMediCalNumber(direct);

  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    const looksLikeCinHeader =
      (nk.includes('clientindexnumber') && nk.includes('cin')) ||
      (nk.includes('mcp') && nk.includes('cin')) ||
      nk === 'cin' ||
      nk === 'cinnumber' ||
      (nk.includes('medicalnumber') && !nk.includes('medicalrecord'));
    if (!looksLikeCinHeader) continue;
    const candidate = normalizeMediCalNumber(formatSpreadsheetIdentifier(value));
    if (candidate) return candidate;
  }
  return '';
};

const extractSpreadsheetMrn = (row: Record<string, unknown>) => {
  const direct = getSpreadsheetIdentifierValue(row, [
    'Medical Record Number (MRN)',
    'Medical Record Number',
    'MRN',
    'Member MRN',
    'Member_MRN',
    'Medical_Record_Number',
  ]);
  if (direct) return direct;

  for (const [key, value] of Object.entries(row || {})) {
    const nk = normalizeSheetHeader(key);
    const looksLikeMrnHeader =
      nk.includes('medicalrecordnumber') ||
      nk === 'mrn' ||
      nk === 'membermrn' ||
      (nk.includes('member') && nk.includes('mrn') && !nk.includes('email'));
    if (!looksLikeMrnHeader) continue;
    const candidate = formatSpreadsheetIdentifier(value);
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

const companionSheetKey = (sheetName: string) =>
  normalizeLookupToken(sheetName) || String(sheetName || '').trim().toLowerCase();

const formatCompanionCell = (value: unknown): string => {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    const yyyy = value.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }
  return String(value).replace(/\s+/g, ' ').trim();
};

const matrixHasContent = (matrix: string[][]) =>
  matrix.some((row) => row.some((cell) => String(cell || '').trim()));

const matricesShareHeader = (a: string[] | undefined, b: string[] | undefined) => {
  if (!a?.length || !b?.length) return false;
  const left = a.map((cell) => normalizeLookupToken(cell)).filter(Boolean);
  const right = b.map((cell) => normalizeLookupToken(cell)).filter(Boolean);
  if (!left.length || !right.length || left.length !== right.length) return false;
  return left.every((cell, idx) => cell === right[idx]);
};

/** Excel worksheet names are capped at 31 chars and disallow : \ / ? * [ ]. */
export function sanitizeIlsMifExcelSheetName(name: string, usedNames: Set<string>): string {
  let base = String(name || 'Sheet')
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sheet';
  if (base.length > 31) base = base.slice(0, 31).trim();
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    n += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function extractIlsMifCompanionSheets(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  primarySheetName: string,
  sourceFileName: string,
  XLSX: typeof import('xlsx')
): IlsMifCompanionSheet[] {
  const primaryKey = companionSheetKey(primarySheetName);
  const source = String(sourceFileName || '').trim();
  return (wb.SheetNames || [])
    .filter((name) => companionSheetKey(name) && companionSheetKey(name) !== primaryKey)
    .map((sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) {
        return { sheetName, matrix: [] as string[][], sourceFileNames: source ? [source] : [] };
      }
      const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(ws as any, {
        header: 1,
        defval: '',
        raw: false,
      });
      const matrix = (Array.isArray(rawMatrix) ? rawMatrix : []).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => formatCompanionCell(cell))
      );
      // Drop trailing entirely-empty rows so Firestore docs stay smaller.
      while (matrix.length && !matrix[matrix.length - 1].some((cell) => String(cell || '').trim())) {
        matrix.pop();
      }
      return {
        sheetName: String(sheetName || '').trim() || 'Sheet',
        matrix,
        sourceFileNames: source ? [source] : [],
      };
    })
    .filter((sheet) => matrixHasContent(sheet.matrix));
}

/** Merge companion sheets by tab name; concatenate data rows when headers match. */
export function mergeIlsMifCompanionSheets(
  existing: IlsMifCompanionSheet[] = [],
  incoming: IlsMifCompanionSheet[] = []
): IlsMifCompanionSheet[] {
  const byKey = new Map<string, IlsMifCompanionSheet>();
  const order: string[] = [];

  const upsert = (sheet: IlsMifCompanionSheet) => {
    const key = companionSheetKey(sheet.sheetName);
    if (!key || !matrixHasContent(sheet.matrix)) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        sheetName: String(sheet.sheetName || '').trim() || 'Sheet',
        matrix: sheet.matrix.map((row) => [...row]),
        sourceFileNames: Array.from(new Set((sheet.sourceFileNames || []).map(String).filter(Boolean))),
      });
      order.push(key);
      return;
    }
    const incomingMatrix = sheet.matrix;
    if (!incomingMatrix.length) return;
    const startIdx = matricesShareHeader(prev.matrix[0], incomingMatrix[0]) ? 1 : 0;
    for (let i = startIdx; i < incomingMatrix.length; i += 1) {
      prev.matrix.push([...incomingMatrix[i]]);
    }
    prev.sourceFileNames = Array.from(
      new Set([...(prev.sourceFileNames || []), ...(sheet.sourceFileNames || [])].map(String).filter(Boolean))
    );
  };

  existing.forEach(upsert);
  incoming.forEach(upsert);
  return order.map((key) => byKey.get(key)!).filter(Boolean);
}

export function companionSheetNamesLabel(sheets: IlsMifCompanionSheet[]): string {
  return (sheets || [])
    .map((sheet) => String(sheet.sheetName || '').trim())
    .filter(Boolean)
    .join(', ');
}

export function parseIlsMifCompanionSheetsFromFirestore(raw: unknown): IlsMifCompanionSheet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      const sheetName = String(row.sheetName || '').trim();
      const matrixRaw = Array.isArray(row.matrix) ? row.matrix : [];
      const matrix = matrixRaw
        .map((line) => (Array.isArray(line) ? line.map((cell) => formatCompanionCell(cell)) : []))
        .filter((line) => line.length);
      const sourceFileNames = Array.isArray(row.sourceFileNames)
        ? row.sourceFileNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [];
      if (!sheetName || !matrixHasContent(matrix)) return null;
      return { sheetName, matrix, sourceFileNames } satisfies IlsMifCompanionSheet;
    })
    .filter((sheet): sheet is IlsMifCompanionSheet => Boolean(sheet));
}

export const buildIlsMifDedupeKey = (row: Pick<
  IlsMifMasterRow,
  | 'clientId2'
  | 'memberMrn'
  | 'memberMediCalNum'
  | 'memberFirstName'
  | 'memberLastName'
  | 'memberDob'
  | 'authorizationNumberT2038'
  | 'memberZip'
  | 'memberResidentialZip'
  | 'memberAddress'
  | 'memberResidentialAddress'
>) => {
  const clientId2 = normalizeIdentityToken(formatSpreadsheetIdentifier(row.clientId2));
  if (clientId2) return `id2:${clientId2}`;
  const mrnRaw = normalizeIdentityToken(formatSpreadsheetIdentifier(row.memberMrn));
  const mrn = mrnRaw.replace(/^0+/, '') || mrnRaw;
  if (mrn) return `mrn:${mrn}`;
  const mediCal = normalizeIdentityToken(formatSpreadsheetIdentifier(row.memberMediCalNum));
  if (mediCal) return `cin:${mediCal}`;
  const name = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
  const dob = normalizeIdentityToken(row.memberDob);
  const zip = normalizeIdentityToken(row.memberZip || row.memberResidentialZip || '');
  const addrToken = normalizeIdentityToken(
    String(row.memberResidentialAddress || row.memberAddress || '').slice(0, 48)
  );
  if (name !== '|' && dob && zip) return `name_dob_zip:${name}|${dob}|${zip}`;
  if (name !== '|' && dob) return `name_dob:${name}|${dob}`;
  if (name !== '|' && zip && addrToken) return `name_zip_addr:${name}|${zip}|${addrToken}`;
  if (name !== '|') return `name:${name}`;
  const auth = normalizeIdentityToken(formatSpreadsheetIdentifier(row.authorizationNumberT2038));
  if (auth) return `auth:${auth}`;
  return `row:${name}|${dob}|${zip}|${auth}`;
};

/**
 * Strong identity aliases used to collapse the same person across full MIF re-uploads.
 * A member with Client_ID2 in one file and only MRN in another must still merge to one row.
 */
export function ilsMifIdentityAliasKeys(
  row: Pick<
    IlsMifMasterRow,
    | 'clientId2'
    | 'memberMrn'
    | 'memberMediCalNum'
    | 'memberFirstName'
    | 'memberLastName'
    | 'memberDob'
    | 'authorizationNumberT2038'
    | 'memberZip'
    | 'memberResidentialZip'
    | 'memberAddress'
    | 'memberResidentialAddress'
  >
): string[] {
  const aliases: string[] = [];
  const clientId2 = normalizeIdentityToken(formatSpreadsheetIdentifier(row.clientId2));
  if (clientId2) aliases.push(`id2:${clientId2}`);
  const mrnRaw = normalizeIdentityToken(formatSpreadsheetIdentifier(row.memberMrn));
  const mrn = mrnRaw.replace(/^0+/, '') || mrnRaw;
  if (mrn) aliases.push(`mrn:${mrn}`);
  const mediCal = normalizeIdentityToken(formatSpreadsheetIdentifier(row.memberMediCalNum));
  if (mediCal) aliases.push(`cin:${mediCal}`);
  const primary = buildIlsMifDedupeKey(row);
  if (primary) aliases.push(primary);
  return Array.from(new Set(aliases.filter(Boolean)));
}

const countNonEmptyMifColumns = (columns?: Record<string, string>) =>
  Object.values(columns || {}).filter((value) => String(value || '').trim()).length;

/** Merge original MIF column bags without letting empty values wipe populated ones. */
export const mergeMifOriginalColumnsPreferNonEmpty = (
  ...bags: Array<Record<string, string> | undefined | null>
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [key, value] of Object.entries(bag)) {
      const label = String(key || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      const next = String(value ?? '').trim();
      if (next) {
        out[label] = next;
        continue;
      }
      if (!String(out[label] ?? '').trim()) out[label] = '';
    }
  }
  for (const bag of bags) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [key, value] of Object.entries(bag)) {
      const next = String(value ?? '').trim();
      if (!next) continue;
      const target = normalizeSheetHeader(key);
      for (const existingKey of Object.keys(out)) {
        if (normalizeSheetHeader(existingKey) !== target) continue;
        if (!String(out[existingKey] || '').trim()) out[existingKey] = next;
      }
      const label = String(key || '').replace(/\s+/g, ' ').trim();
      if (label && !String(out[label] || '').trim()) out[label] = next;
    }
  }
  return out;
};

const preferRicherIlsMifMasterRow = (a: IlsMifMasterRow, b: IlsMifMasterRow): IlsMifMasterRow => {
  const pick = (...values: Array<unknown>) => {
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return '';
  };
  const score = (row: IlsMifMasterRow) => {
    let n = 0;
    if (String(row.clientId2 || '').trim()) n += 8;
    if (String(row.memberMrn || '').trim()) n += 4;
    if (String(row.memberMediCalNum || '').trim()) n += 3;
    if (String(row.authorizationNumberT2038 || '').trim()) n += 6;
    if (String(row.authorizationStartT2038 || '').trim()) n += 3;
    if (String(row.authorizationEndT2038 || '').trim()) n += 3;
    if (row.caspioExists || row.mergeStatus === 'already_in_caspio') n += 5;
    if (String(row.sourceFileName || '').trim()) n += 1;
    if (String(row.memberPhone || row.primaryPhoneNumber || '').trim()) n += 1;
    if (String(row.memberAddress || row.memberResidentialAddress || '').trim()) n += 1;
    n += Math.min(12, countNonEmptyMifColumns(row.mifOriginalColumns));
    return n;
  };
  const preferred = score(b) >= score(a) ? b : a;
  const other = preferred === a ? b : a;
  const preferredCols = preferred.mifOriginalColumns || {};
  const otherCols = other.mifOriginalColumns || {};
  const preferredColCount = countNonEmptyMifColumns(preferredCols);
  const otherColCount = countNonEmptyMifColumns(otherCols);
  // Prefer the richer column bag as the base, then overlay without empty wipes.
  const mergedColumns =
    preferredColCount >= otherColCount
      ? mergeMifOriginalColumnsPreferNonEmpty(otherCols, preferredCols)
      : mergeMifOriginalColumnsPreferNonEmpty(preferredCols, otherCols);
  const auth = resolveIlsMifAuthorizationFields({
    authorizationNumberT2038: pick(preferred.authorizationNumberT2038, other.authorizationNumberT2038),
    authorizationStartT2038: pick(preferred.authorizationStartT2038, other.authorizationStartT2038),
    authorizationEndT2038: pick(preferred.authorizationEndT2038, other.authorizationEndT2038),
    mifOriginalColumns: mergedColumns,
  });
  const merged: IlsMifMasterRow = {
    ...preferred,
    ...auth,
    sourceFileName: pick(preferred.sourceFileName, other.sourceFileName),
    memberAddress: pick(preferred.memberAddress, other.memberAddress),
    memberResidentialAddress: pick(preferred.memberResidentialAddress, other.memberResidentialAddress),
    memberResidentialCity: pick(preferred.memberResidentialCity, other.memberResidentialCity),
    memberResidentialZip: pick(preferred.memberResidentialZip, other.memberResidentialZip),
    memberMailingCity: pick(preferred.memberMailingCity, other.memberMailingCity),
    memberMailingZip: pick(preferred.memberMailingZip, other.memberMailingZip),
    memberCity: pick(preferred.memberCity, other.memberCity),
    memberZip: pick(preferred.memberZip, other.memberZip),
    memberCounty: pick(preferred.memberCounty, other.memberCounty),
    memberDob: pick(preferred.memberDob, other.memberDob),
    memberPhone: pick(preferred.memberPhone, other.memberPhone),
    primaryPhoneNumber: pick(preferred.primaryPhoneNumber, other.primaryPhoneNumber),
    homePhoneNumber: pick(preferred.homePhoneNumber, other.homePhoneNumber),
    memberEmail: pick(preferred.memberEmail, other.memberEmail),
    referringOrganization: pick(preferred.referringOrganization, other.referringOrganization),
    emergencyContactName: pick(preferred.emergencyContactName, other.emergencyContactName),
    emergencyContactRelationship: pick(
      preferred.emergencyContactRelationship,
      other.emergencyContactRelationship
    ),
    emergencyContactPhone: pick(preferred.emergencyContactPhone, other.emergencyContactPhone),
    emergencyContactEmail: pick(preferred.emergencyContactEmail, other.emergencyContactEmail),
    careManagerName: pick(preferred.careManagerName, other.careManagerName),
    careManagerPhone: pick(preferred.careManagerPhone, other.careManagerPhone),
    careManagerEmail: pick(preferred.careManagerEmail, other.careManagerEmail),
    dateReceivedRequestForAuthorization: pick(
      preferred.dateReceivedRequestForAuthorization,
      other.dateReceivedRequestForAuthorization
    ),
    dateOfReferralAuthorizationDecision: pick(
      preferred.dateOfReferralAuthorizationDecision,
      other.dateOfReferralAuthorizationDecision
    ),
    mifDateKey: pick(preferred.mifDateKey, other.mifDateKey),
    mifDateLabel: pick(preferred.mifDateLabel, other.mifDateLabel),
    mifOriginalColumns: Object.keys(mergedColumns).length ? mergedColumns : preferred.mifOriginalColumns,
    mifSourceHeaders:
      (preferred.mifSourceHeaders?.length || 0) >= (other.mifSourceHeaders?.length || 0)
        ? preferred.mifSourceHeaders?.length
          ? preferred.mifSourceHeaders
          : other.mifSourceHeaders
        : other.mifSourceHeaders?.length
          ? other.mifSourceHeaders
          : preferred.mifSourceHeaders,
  };
  return withResolvedIlsMifMasterRowDate(merged);
};

export function summarizeIlsMifUploadIdentityStats(rows: IlsMifMasterRow[]) {
  const keyCounts = new Map<string, number>();
  rows.forEach((row) => {
    const key = buildIlsMifDedupeKey(row);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  });
  const topCollisions = [...keyCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ key, count }));
  return {
    parsedRows: rows.length,
    uniqueKeys: keyCounts.size,
    repeatLines: Math.max(0, rows.length - keyCounts.size),
    topCollisions,
  };
}

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
  sourceFileName: string,
  sourceSheetName = '',
  sourceHeaders: string[] = []
): IlsMifMasterRow | null => {
  const memberFirstName = toNameCase(getSpreadsheetValue(raw, ['Member First Name']));
  const memberLastName = toNameCase(stripTrailingNonNameTokens(getSpreadsheetValue(raw, ['Member Last Name'])));
  if (!memberFirstName || !memberLastName) return null;

  const memberMrn = extractSpreadsheetMrn(raw);
  const memberMediCalNum = extractSpreadsheetMediCalNumber(raw);
  const memberSex = normalizeMemberSex(
    getSpreadsheetValue(raw, ['Member Gender Code', 'Member Gender', 'Member Sex', 'Gender', 'Sex'])
  );
  const clientId2 = getSpreadsheetIdentifierValue(raw, ['Client_ID2', 'Client ID2', 'client_ID2']);
  const residentialAddressRaw = toNameCase(getSpreadsheetValue(raw, ['Member Residential Address']));
  const residentialCityRaw = toNameCase(getSpreadsheetValue(raw, ['Member Residential City']));
  const residentialZipRaw = normalizeUsZip(
    getSpreadsheetValue(raw, [
      'Member Residential Zip Code',
      'Member Resdidential Zip Code',
      'Member Resdential Zip Code',
      'Member Residential Zip',
      'Residential Zip Code',
      'Residential Zip',
    ])
  );
  const mailingAddressRaw = toNameCase(getSpreadsheetValue(raw, ['Member Mailing Address']));
  const mailingCityRaw = toNameCase(getSpreadsheetValue(raw, ['Member Mailing City']));
  const mailingZipRaw = normalizeUsZip(getSpreadsheetValue(raw, ['Member Mailing Zip Code']));
  // If the MIF only filled one address block, mirror it to the other (common when mailing = home).
  const residentialAddress = residentialAddressRaw || mailingAddressRaw;
  const residentialCity = residentialCityRaw || mailingCityRaw;
  const residentialZip = residentialZipRaw || mailingZipRaw;
  const mailingAddress = mailingAddressRaw || residentialAddressRaw;
  const mailingCity = mailingCityRaw || residentialCityRaw;
  const mailingZip = mailingZipRaw || residentialZipRaw;
  const memberCity = mailingCity || residentialCity;
  const memberZip = mailingCity ? mailingZip || residentialZip : residentialZip || mailingZip;
  const memberMailingCity = mailingCity;
  const memberMailingZip = mailingZip;
  const memberResidentialCity = residentialCity;
  const memberResidentialZip = residentialZip;
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
  const primaryPhoneNumber = normalizePhoneDigits(primaryPhone)
    ? formatPhoneDashed(normalizePhoneDigits(primaryPhone))
    : String(primaryPhone || '').trim();
  const homePhoneNumber = normalizePhoneDigits(homePhone)
    ? formatPhoneDashed(normalizePhoneDigits(homePhone))
    : String(homePhone || '').trim();
  const memberPhone = primaryPhoneNumber || homePhoneNumber;
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
  const emergencyContactRelationship = sanitizeRelationshipLabel(
    toNameCase(
      getSpreadsheetValue(raw, [
        'Emergency/Alternate Contact Relation',
        'Emergency/ Alternate Contact Relation',
      ])
    )
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
  const resolvedAuth = resolveIlsMifAuthorizationFields({
    authorizationNumberT2038: getSpreadsheetIdentifierValue(raw, [
      'Authorization Number',
      'Auth Number',
      'Auth #',
      'Authorization #',
      'T2038 Authorization Number',
    ]),
    authorizationStartT2038: toSpreadsheetDate(
      getSpreadsheetRawValue(raw, [
        'Authorization Start Date',
        'Auth Start Date',
        'Authorization Start',
        'T2038 Authorization Start Date',
      ])
    ),
    authorizationEndT2038: toSpreadsheetDate(
      getSpreadsheetRawValue(raw, [
        'Authorizatin End Date',
        'Authorization End Date',
        'Authorization Stop Date',
        'Auth End Date',
        'Auth Stop Date',
        'Authorization End',
        'T2038 Authorization End Date',
      ])
    ),
    mifOriginalColumns: raw as Record<string, unknown>,
  });
  const authorizationNumberT2038 = resolvedAuth.authorizationNumberT2038;
  const authorizationStartT2038 = resolvedAuth.authorizationStartT2038;
  const authorizationEndT2038 = resolvedAuth.authorizationEndT2038;
  const dateReceivedRequestForAuthorization = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Date Received Request for Authorization'])
  );
  const dateOfReferralAuthorizationDecision = toSpreadsheetDate(
    getSpreadsheetRawValue(raw, ['Date of Referral Authorization Decision'])
  );
  const incomplete = !memberMediCalNum;

  const row: IlsMifMasterRow = {
    rowId: `mif-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    sourceFileName,
    sourceSheetName: String(sourceSheetName || '').trim(),
    memberFirstName,
    memberLastName,
    memberMrn,
    memberMediCalNum,
    memberSex,
    clientId2,
    memberAddress: mailingAddress,
    memberCity,
    memberZip,
    memberResidentialAddress: residentialAddress,
    memberResidentialCity,
    memberResidentialZip,
    memberMailingCity,
    memberMailingZip,
    memberState: '',
    memberCounty,
    memberDob,
    memberPhone,
    primaryPhoneNumber,
    homePhoneNumber,
    memberEmail,
    contactPhone: normalizePhoneDigits(emergencyContactPhone || referringIndividualPhone)
      ? formatPhoneDashed(normalizePhoneDigits(emergencyContactPhone || referringIndividualPhone))
      : '',
    // Primary contact email is emergency/alternate only — never referring individual (referral source).
    contactEmail: emergencyContactEmail,
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
    caspioCalAIMStatus: '',
    caspioKaiserStatus: '',
    needsAuthorizedUpdate: false,
    needsT2038ReceivedUpdate: false,
    batchDuplicate: false,
    mergeStatus: incomplete ? 'incomplete' : 'unique',
    statusNote: incomplete ? 'Missing Medi-Cal/CIN' : '',
  };

  row.mifSourceHeaders = sourceHeaders.length ? [...sourceHeaders] : undefined;
  row.mifOriginalColumns = captureCsMifOriginalColumnsFromRaw(raw);
  return withResolvedIlsMifMasterRowDate(row);
};

const extractIlsMifSheetHeaders = (ws: unknown, XLSX: typeof import('xlsx')): string[] => {
  const sheet = ws as { '!ref'?: string };
  if (!sheet?.['!ref']) return [];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
  const headerIdx = findIlsMifHeaderRowIndex(matrix as unknown[][]);
  const headerRow = Array.isArray(matrix?.[headerIdx]) ? matrix[headerIdx] : [];
  return headerRow
    .map((cell) => String(cell || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
};

/** Kaiser MIFs often have title rows above the real header — pick the best match in the first 30 rows. */
function findIlsMifHeaderRowIndex(matrix: unknown[][]): number {
  const scoreRow = (row: unknown[]) => {
    const cells = (row || []).map((cell) => normalizeSheetHeader(String(cell || '')));
    let score = 0;
    if (cells.some((c) => c.includes('memberfirstname') || c === 'firstname')) score += 3;
    if (cells.some((c) => c.includes('memberlastname') || c === 'lastname')) score += 3;
    if (cells.some((c) => c.includes('authorizationnumber') || c === 'authorizationno')) score += 3;
    if (cells.some((c) => c.includes('authorizationstartdate') || c === 'authorizationstart')) score += 2;
    if (cells.some((c) => c.includes('authorizationenddate') || c.includes('authorizationstop'))) score += 2;
    if (cells.some((c) => c.includes('medicalrecordnumber') || c === 'mrn')) score += 2;
    if (cells.some((c) => c.includes('clientindexnumber') || c === 'cin')) score += 1;
    return score;
  };
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(Array.isArray(matrix) ? matrix.length : 0, 30);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreRow(Array.isArray(matrix[i]) ? (matrix[i] as unknown[]) : []);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= 4 ? bestIdx : 0;
}

function sheetRowsFromHeaderIndex(
  matrix: unknown[][],
  headerIdx: number
): Record<string, unknown>[] {
  const headerRow = Array.isArray(matrix[headerIdx]) ? (matrix[headerIdx] as unknown[]) : [];
  const headers = headerRow.map((cell) => String(cell || '').replace(/\s+/g, ' ').trim());
  const out: Record<string, unknown>[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const row = Array.isArray(matrix[r]) ? (matrix[r] as unknown[]) : [];
    const obj: Record<string, unknown> = {};
    let hasName = false;
    headers.forEach((header, col) => {
      if (!header) return;
      const value = row[col];
      obj[header] = value ?? '';
      const nk = normalizeSheetHeader(header);
      if (
        (nk.includes('memberfirstname') || nk.includes('memberlastname') || nk === 'firstname' || nk === 'lastname') &&
        String(value ?? '').trim()
      ) {
        hasName = true;
      }
    });
    if (hasName || Object.values(obj).some((v) => String(v ?? '').trim())) out.push(obj);
  }
  return out;
}

export async function parseIlsMifSpreadsheetWorkbook(file: File): Promise<IlsMifParseResult> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = pickIlsSheetName(wb.SheetNames);
  if (!sheetName) throw new Error(`${file.name}: no worksheet found.`);
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  }) as unknown[][];
  const headerIdx = findIlsMifHeaderRowIndex(matrix);
  const sourceHeaders = (Array.isArray(matrix[headerIdx]) ? (matrix[headerIdx] as unknown[]) : [])
    .map((cell) => String(cell || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const rows = sheetRowsFromHeaderIndex(matrix, headerIdx);
  if (!rows.length) throw new Error(`${file.name}: spreadsheet has no data rows.`);
  const sourceFileName = String(file.name || '').trim() || 'upload.xlsx';
  const members = rows
    .map((raw, idx) => mapRawRowToMasterRow(raw, idx, sourceFileName, sheetName, sourceHeaders))
    .filter((row): row is IlsMifMasterRow => Boolean(row));
  const companionSheets = extractIlsMifCompanionSheets(wb, sheetName, sourceFileName, XLSX);
  return { members, companionSheets };
}

export async function parseIlsMifSpreadsheetFile(file: File): Promise<IlsMifMasterRow[]> {
  const { members } = await parseIlsMifSpreadsheetWorkbook(file);
  return members;
}

export function dedupeIlsMifMasterRows(rows: IlsMifMasterRow[]): IlsMifMasterRow[] {
  // Union-find over strong aliases so full MIF re-uploads cannot create a second row
  // for the same MRN/CIN/Client_ID2 under a different primary key shape.
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    let root = i;
    while ((parent.get(root) ?? root) !== root) {
      root = parent.get(root) ?? root;
    }
    let cur = i;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent.set(rb, ra);
  };

  rows.forEach((_, index) => parent.set(index, index));
  const aliasOwner = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const alias of ilsMifIdentityAliasKeys(row)) {
      const existing = aliasOwner.get(alias);
      if (existing === undefined) aliasOwner.set(alias, index);
      else unite(existing, index);
    }
  });

  const groupCanonical = new Map<number, number>();
  rows.forEach((row, index) => {
    const root = find(index);
    const current = groupCanonical.get(root);
    if (current === undefined) {
      groupCanonical.set(root, index);
      return;
    }
    const preferred = preferRicherIlsMifMasterRow(rows[current], row);
    groupCanonical.set(root, preferred === row ? index : current);
  });

  const usedRowIds = new Set<string>();
  return rows.map((row, index) => {
    const root = find(index);
    const canonicalIndex = groupCanonical.get(root) ?? index;
    if (canonicalIndex === index) {
      usedRowIds.add(row.rowId);
      return {
        ...row,
        batchDuplicate: false,
        mergeStatus:
          row.mergeStatus === 'incomplete'
            ? 'incomplete'
            : resolveIlsMifMergeStatusForCaspioMatch(row, Boolean(row.caspioExists)),
        statusNote:
          row.mergeStatus === 'incomplete'
            ? row.statusNote
            : row.mergeStatus === 'already_in_caspio' || row.needsAuthorizedUpdate
              ? row.statusNote
              : '',
      };
    }

    const firstId = rows[canonicalIndex]?.rowId || row.rowId;
    let uniqueRowId = row.rowId;
    if (!uniqueRowId || uniqueRowId === firstId || usedRowIds.has(uniqueRowId)) {
      uniqueRowId = `${firstId || row.rowId || 'mif'}-dup-${index}`;
    }
    while (usedRowIds.has(uniqueRowId)) {
      uniqueRowId = `${uniqueRowId}-${index}`;
    }
    usedRowIds.add(uniqueRowId);
    return {
      ...row,
      rowId: uniqueRowId,
      batchDuplicate: true,
      mergeStatus: 'duplicate_in_batch',
      statusNote: `Duplicate of row in this master list (${firstId}) — same member already present from another MIF line`,
    };
  });
}

export function normalizeIlsMifCalAimStatus(value: unknown): string {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (raw === 'authorized' || raw.startsWith('authorized ')) return 'Authorized';
  if (raw === 'pending' || raw.startsWith('pending ')) return 'Pending';
  // Preserve readable casing for other statuses
  return String(value || '').trim();
}

export function isIlsMifCaspioAuthorizedStatus(value: unknown): boolean {
  return normalizeIlsMifCalAimStatus(value) === 'Authorized';
}

export function isIlsMifCaspioPendingStatus(value: unknown): boolean {
  return normalizeIlsMifCalAimStatus(value) === 'Pending';
}

/** Consolidator master rows must come from an uploaded MIF (not Caspio-only patches). */
export function isIlsMifSourcedMasterRow(
  row: Pick<IlsMifMasterRow, 'sourceFileName' | 'memberFirstName' | 'memberLastName'>
): boolean {
  return Boolean(
    String(row.sourceFileName || '').trim() && row.memberFirstName && row.memberLastName
  );
}

/** Load saved Firestore master/run rows (sourceFileName optional on older saves). */
export function isIlsMifPersistedMasterRow(
  row: Pick<IlsMifMasterRow, 'memberFirstName' | 'memberLastName'>
): boolean {
  return Boolean(String(row.memberFirstName || '').trim() && String(row.memberLastName || '').trim());
}

/** Merge two master lists by dedupe key; optionally let incoming rows win on conflicts.
 *  Always preserve non-empty auth / source-file fields from either side. */
export function mergeIlsMifMasterRowMaps(
  base: IlsMifMasterRow[],
  incoming: IlsMifMasterRow[],
  options?: { preferIncoming?: boolean }
): IlsMifMasterRow[] {
  const byKey = new Map<string, IlsMifMasterRow>();
  const put = (row: IlsMifMasterRow, prefer: boolean) => {
    const key = buildIlsMifDedupeKey(row);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...row,
        ...resolveIlsMifAuthorizationFields(row),
        rowId: row.rowId || key,
      });
      return;
    }
    const preferred = prefer ? row : existing;
    const other = prefer ? existing : row;
    const merged = preferRicherIlsMifMasterRow(
      { ...other, ...resolveIlsMifAuthorizationFields(other) },
      { ...preferred, ...resolveIlsMifAuthorizationFields(preferred) }
    );
    // When preferIncoming, keep preferred identity/caspio flags but never drop auth/source.
    byKey.set(key, {
      ...merged,
      ...(prefer
        ? {
            caspioExists: Boolean(preferred.caspioExists || other.caspioExists),
            caspioCalAIMStatus: preferred.caspioCalAIMStatus || other.caspioCalAIMStatus || '',
            caspioKaiserStatus: preferred.caspioKaiserStatus || other.caspioKaiserStatus || '',
            caspioMatchLabel: preferred.caspioMatchLabel || other.caspioMatchLabel || '',
            caspioMatchedClientId2:
              preferred.caspioMatchedClientId2 || other.caspioMatchedClientId2 || '',
            needsAuthorizedUpdate: Boolean(
              preferred.needsAuthorizedUpdate || other.needsAuthorizedUpdate
            ),
            needsT2038ReceivedUpdate: Boolean(
              preferred.needsT2038ReceivedUpdate || other.needsT2038ReceivedUpdate
            ),
            mergeStatus: preferred.mergeStatus || other.mergeStatus,
            skeletonApplicationId: preferred.skeletonApplicationId || other.skeletonApplicationId,
          }
        : {}),
      rowId: preferred.rowId || other.rowId || key,
    });
  };
  if (options?.preferIncoming) {
    base.forEach((row) => put(row, false));
    incoming.forEach((row) => put(row, true));
  } else {
    incoming.forEach((row) => put(row, true));
    base.forEach((row) => put(row, false));
  }
  return [...byKey.values()];
}

export function resolveIlsMifMergeStatusForCaspioMatch(
  row: Pick<IlsMifMasterRow, 'mergeStatus' | 'caspioCalAIMStatus'>,
  caspioMatched: boolean
): IlsMifMasterRow['mergeStatus'] {
  if (row.mergeStatus === 'incomplete') return 'incomplete';
  if (row.mergeStatus === 'duplicate_in_batch') return 'duplicate_in_batch';
  if (!caspioMatched) return 'unique';
  return isIlsMifCaspioAuthorizedStatus(row.caspioCalAIMStatus) ? 'already_in_caspio' : 'unique';
}

export const ILS_MIF_TARGET_T2038_RECEIVED_STATUS = 'T2038 Received, doc collection';

export function normalizeIlsMifKaiserStatusKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isIlsMifT2038RequestedStatus(value: unknown): boolean {
  const key = normalizeIlsMifKaiserStatusKey(value);
  return key === 't2038 requested' || key.startsWith('t2038 requested');
}

export function isIlsMifT2038ReceivedStatus(value: unknown): boolean {
  const key = normalizeIlsMifKaiserStatusKey(value);
  return key.startsWith('t2038 received') || key.startsWith('received t2038');
}

export function pickIlsMifCaspioCalAimStatus(member: any): string {
  const raw = (member?.caspioRaw || {}) as Record<string, unknown>;
  return normalizeIlsMifCalAimStatus(
    member?.CalAIM_Status ||
      member?.calaim_status ||
      member?.caspioCalAIMStatus ||
      raw?.CalAIM_Status ||
      raw?.calaim_status ||
      ''
  );
}

export function pickIlsMifCaspioKaiserStatus(member: any): string {
  const raw = (member?.caspioRaw || {}) as Record<string, unknown>;
  return String(
    member?.Kaiser_Status ||
      member?.kaiserStatus ||
      member?.Kaiser_ID_Status ||
      member?.caspioKaiserStatus ||
      raw?.Kaiser_Status ||
      raw?.Kaiser_ID_Status ||
      raw?.kaiserStatus ||
      ''
  ).trim();
}

export function resolveIlsMifNeedsAuthorizedUpdate(
  caspioCalAIMStatus: unknown,
  caspioMatched: boolean,
  fallback = false
): boolean {
  if (!caspioMatched) return false;
  if (isIlsMifCaspioAuthorizedStatus(caspioCalAIMStatus)) return false;
  if (isIlsMifCaspioPendingStatus(caspioCalAIMStatus)) return true;
  return Boolean(fallback);
}

export function ilsMifRowNeedsAuthorizedUpdate(
  row: Pick<IlsMifMasterRow, 'needsAuthorizedUpdate' | 'caspioExists' | 'caspioCalAIMStatus'>
): boolean {
  return resolveIlsMifNeedsAuthorizedUpdate(
    row.caspioCalAIMStatus,
    Boolean(row.caspioExists),
    Boolean(row.needsAuthorizedUpdate)
  );
}

export function ilsMifRowHasT2038AuthForPush(
  row: Pick<IlsMifMasterRow, 'authorizationNumberT2038' | 'authorizationStartT2038' | 'authorizationEndT2038'>
): boolean {
  return Boolean(
    String(row.authorizationNumberT2038 || '').trim() &&
      String(row.authorizationStartT2038 || '').trim() &&
      String(row.authorizationEndT2038 || '').trim()
  );
}

export type IlsMifReferralNoteInput = {
  referringOrganization?: string;
  careManagerName?: string;
  careManagerPhone?: string;
  careManagerEmail?: string;
  authorizationNumberT2038?: string;
  authorizationStartT2038?: string;
  authorizationEndT2038?: string;
  dateReceivedRequestForAuthorization?: string;
  dateOfReferralAuthorizationDecision?: string;
  extraAdminNotes?: string;
  sourceFileName?: string;
};

/** Line-item referral/auth text for Caspio `connect_tbl_clientnotes`. */
export function buildIlsMifCaspioReferralNoteText(input: IlsMifReferralNoteInput): string {
  const line = (label: string, value: unknown) => {
    const next = String(value ?? '').trim();
    return next ? `${label}: ${next}` : '';
  };
  return [
    'MIF authorization / referral',
    line('Authorization Number', input.authorizationNumberT2038),
    line('Authorization Start', input.authorizationStartT2038),
    line('Authorization End', input.authorizationEndT2038),
    line('Referring Organization', input.referringOrganization),
    line('Referring Individual', input.careManagerName),
    line('Referring Individual Phone', input.careManagerPhone),
    line('Referring Individual Email', input.careManagerEmail),
    line('Date Received Request for Authorization', input.dateReceivedRequestForAuthorization),
    line('Date of Referral Authorization Decision', input.dateOfReferralAuthorizationDecision),
    line('Source File', input.sourceFileName),
    String(input.extraAdminNotes || '').trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function ilsMifNeedsStatusUpdate(
  row: Pick<
    IlsMifMasterRow,
    'needsAuthorizedUpdate' | 'needsT2038ReceivedUpdate' | 'caspioExists' | 'caspioCalAIMStatus'
  >
): boolean {
  return ilsMifRowNeedsAuthorizedUpdate(row) || Boolean(row.needsT2038ReceivedUpdate);
}

export function isIlsMifNonDuplicateRow(row: Pick<IlsMifMasterRow, 'mergeStatus'>): boolean {
  return row.mergeStatus !== 'duplicate_in_batch';
}

export function filterIlsMifNonDuplicateRows(rows: IlsMifMasterRow[]): IlsMifMasterRow[] {
  return rows.filter(isIlsMifNonDuplicateRow);
}

/** Matched in Kaiser Caspio (Authorized) — excluded from “not in Caspio” views. */
export function isIlsMifRowInCaspio(
  row: Pick<IlsMifMasterRow, 'mergeStatus' | 'caspioExists'>
): boolean {
  if (row.mergeStatus === 'duplicate_in_batch') return false;
  return Boolean(row.caspioExists) || row.mergeStatus === 'already_in_caspio';
}

/** On master list but not matched in Kaiser Caspio. */
export function isIlsMifRowNotInCaspio(
  row: Pick<IlsMifMasterRow, 'mergeStatus' | 'caspioExists'>
): boolean {
  if (!isIlsMifNonDuplicateRow(row)) return false;
  return !isIlsMifRowInCaspio(row);
}

/** Matched in Caspio with CalAIM_Status Pending (needs Authorized update). */
export function isIlsMifRowCaspioCalAimPending(
  row: Pick<IlsMifMasterRow, 'mergeStatus' | 'caspioExists' | 'caspioCalAIMStatus'>
): boolean {
  if (!isIlsMifNonDuplicateRow(row) || !row.caspioExists) return false;
  return isIlsMifCaspioPendingStatus(row.caspioCalAIMStatus);
}

export function annotateIlsMifRowsWithCaspioMembers(
  rows: IlsMifMasterRow[],
  members: any[]
): IlsMifMasterRow[] {
  type MatchValue = {
    label: string;
    clientId2: string;
    county: string;
    calAimStatus: string;
    kaiserStatus: string;
  };
  const byMrn = new Map<string, MatchValue>();
  const byMediCal = new Map<string, MatchValue>();
  const byName = new Map<string, MatchValue>();
  const byClientId2 = new Map<string, MatchValue>();

  const mrnLookupKeys = (token: string) => new Set(identityTokenLookupKeys(token));

  const setMrnMatch = (token: string, value: MatchValue) => {
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
    const calAimStatus = pickIlsMifCaspioCalAimStatus(member);
    const kaiserStatus = pickIlsMifCaspioKaiserStatus(member);
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
    const matchValue = { label, clientId2, county, calAimStatus, kaiserStatus };
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
    // Name-only is never enough for "In Caspio" — common names (e.g. two Maria Hernandez
    // rows) would falsely attach to the one Caspio member with that name.
    const nameOnlyHint =
      !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|' ? byName.get(nameKey) : undefined;
    const match = clientId2Match || mrnMatch || mediCalMatch;
    if (!match) {
      const inferredCounty =
        String(row.memberCounty || '').trim() ||
        toNameCase(findCountyByCityAndZip(row.memberCity, row.memberZip) || '') ||
        '';
      const nameHintNote = nameOnlyHint
        ? `Name-only Caspio hint (not counted as In Caspio): ${nameOnlyHint.label}${
            nameOnlyHint.clientId2 ? ` · ${nameOnlyHint.clientId2}` : ''
          } — confirm MRN/CIN`
        : '';
      return {
        ...row,
        memberCounty: inferredCounty || row.memberCounty,
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '',
        caspioCalAIMStatus: '',
        caspioKaiserStatus: '',
        needsAuthorizedUpdate: false,
        needsT2038ReceivedUpdate: false,
        mergeStatus: row.mergeStatus === 'incomplete' ? 'incomplete' : 'unique',
        statusNote:
          row.mergeStatus === 'incomplete'
            ? row.statusNote
            : nameHintNote,
      };
    }
    const matchedBy = clientId2Match
      ? 'client_id2'
      : mrnMatch
        ? 'mrn'
        : 'medi_cal';
    let nextCounty = String(row.memberCounty || '').trim();
    if (!nextCounty && match.county) nextCounty = match.county;
    if (!nextCounty) {
      nextCounty = toNameCase(findCountyByCityAndZip(row.memberCity, row.memberZip) || '') || '';
    }
    const calAimStatus = normalizeIlsMifCalAimStatus(match.calAimStatus);
    const kaiserStatus = String(match.kaiserStatus || '').trim();
    const isPending = isIlsMifCaspioPendingStatus(calAimStatus);
    const isAuthorized = isIlsMifCaspioAuthorizedStatus(calAimStatus);
    const needsAuthorizedUpdate = resolveIlsMifNeedsAuthorizedUpdate(calAimStatus, true, isPending);
    const needsT2038ReceivedUpdate = isIlsMifT2038ReceivedStatus(kaiserStatus)
      ? false
      : isIlsMifT2038RequestedStatus(kaiserStatus);
    const baseNote = isAuthorized
      ? `Already in Caspio (${matchedBy.replace('_', ' ')}): ${match.label}`
      : isPending
        ? `Caspio match Pending (${matchedBy.replace('_', ' ')}): ${match.label}`
        : `Caspio match (${matchedBy.replace('_', ' ')}): ${match.label}`;
    const flagNotes: string[] = [];
    if (needsAuthorizedUpdate) {
      flagNotes.push('CalAIM_Status Pending — update to Authorized');
    }
    if (needsT2038ReceivedUpdate) {
      flagNotes.push(
        `Kaiser_Status T2038 Requested — update to ${ILS_MIF_TARGET_T2038_RECEIVED_STATUS}`
      );
    }
    const statusBits = [
      calAimStatus ? `CalAIM_Status ${calAimStatus}` : '',
      kaiserStatus ? `Kaiser_Status ${kaiserStatus}` : '',
    ].filter(Boolean);
    const statusNote = flagNotes.length
      ? `${baseNote} · ${flagNotes.join(' · ')}`
      : statusBits.length
        ? `${baseNote} · ${statusBits.join(' · ')}`
        : baseNote;
    return {
      ...row,
      memberCounty: nextCounty || row.memberCounty,
      caspioExists: true,
      caspioMatchLabel: match.label,
      caspioMatchedClientId2: match.clientId2,
      caspioMatchedBy: matchedBy,
      caspioCalAIMStatus: calAimStatus,
      caspioKaiserStatus: kaiserStatus,
      needsAuthorizedUpdate,
      needsT2038ReceivedUpdate,
      mergeStatus: resolveIlsMifMergeStatusForCaspioMatch(
        { mergeStatus: row.mergeStatus, caspioCalAIMStatus: calAimStatus },
        true
      ),
      statusNote,
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
    const firstToken = normalizeLookupToken(row.memberFirstName);
    const lastToken = normalizeLookupToken(row.memberLastName);
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
    let nameMatch =
      !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|' ? byName.get(nameKey) : undefined;
    // Single-token name search: allow matching first OR last when only one side was provided.
    // Helps when staff type a given name into Last name (e.g. "jung" for Pun, Jung).
    if (!clientId2Match && !mrnMatch && !mediCalMatch && !nameMatch) {
      const singleToken = firstToken && !lastToken ? firstToken : lastToken && !firstToken ? lastToken : '';
      if (singleToken) {
        for (const [key, label] of byName.entries()) {
          const [memberFirst, memberLast] = key.split('|');
          if (memberFirst === singleToken || memberLast === singleToken) {
            nameMatch = label;
            break;
          }
        }
      }
    }
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

/** Return the full consolidated MIF master member for an identity (same match rules as annotate). */
export function findIlsMifMasterMemberMatch(
  identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
    clientId2?: string;
  },
  masterMembers: Array<Partial<IlsMifMasterRow>>
): {
  member: Partial<IlsMifMasterRow>;
  matchLabel: string;
  matchedBy: 'client_id2' | 'mrn' | 'medi_cal' | 'name';
} | null {
  const byMrn = new Map<string, Partial<IlsMifMasterRow>>();
  const byMediCal = new Map<string, Partial<IlsMifMasterRow>>();
  const byName = new Map<string, Partial<IlsMifMasterRow>>();
  const byClientId2 = new Map<string, Partial<IlsMifMasterRow>>();

  masterMembers.forEach((member) => {
    const firstName = String(member.memberFirstName || '').trim();
    const lastName = String(member.memberLastName || '').trim();
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
      if (key && !byMrn.has(key)) byMrn.set(key, member);
    });
    identityTokenLookupKeys(signals.mediCalToken).forEach((key) => {
      if (key && !byMediCal.has(key)) byMediCal.set(key, member);
    });
    if (signals.clientId2Token && !byClientId2.has(signals.clientId2Token)) {
      byClientId2.set(signals.clientId2Token, member);
    }
    const nameKey = buildMemberLookupNameKey(firstName, lastName);
    if (nameKey !== '|' && !byName.has(nameKey)) byName.set(nameKey, member);
  });

  const firstName = String(identity.memberFirstName || '').trim();
  const lastName = String(identity.memberLastName || '').trim();
  const rowSignals = extractIdentitySignals(
    {
      memberFirstName: firstName,
      memberLastName: lastName,
      memberMrn: identity.memberMrn,
      memberMediCalNum: identity.memberMediCalNum,
      clientId2: identity.clientId2 || '',
    },
    {
      mrnFields: ['memberMrn'],
      mediCalFields: ['memberMediCalNum'],
      clientId2Fields: ['clientId2'],
    }
  );
  const nameKey = buildMemberLookupNameKey(firstName, lastName);
  const firstToken = normalizeLookupToken(firstName);
  const lastToken = normalizeLookupToken(lastName);
  const clientId2Match = rowSignals.clientId2Token
    ? byClientId2.get(rowSignals.clientId2Token)
    : undefined;
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
  let nameMatch =
    !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|'
      ? byName.get(nameKey)
      : undefined;
  if (!clientId2Match && !mrnMatch && !mediCalMatch && !nameMatch) {
    const singleToken = firstToken && !lastToken ? firstToken : lastToken && !firstToken ? lastToken : '';
    if (singleToken) {
      for (const [key, member] of byName.entries()) {
        const [memberFirst, memberLast] = key.split('|');
        if (memberFirst === singleToken || memberLast === singleToken) {
          nameMatch = member;
          break;
        }
      }
    }
  }
  const member = clientId2Match || mrnMatch || mediCalMatch || nameMatch;
  if (!member) return null;
  const matchLabel =
    `${String(member.memberLastName || '').trim()}, ${String(member.memberFirstName || '').trim()}`
      .trim()
      .replace(/^,\s*/, '') || 'MIF Master Member';
  return {
    member,
    matchLabel,
    matchedBy: clientId2Match
      ? 'client_id2'
      : mrnMatch
        ? 'mrn'
        : mediCalMatch
          ? 'medi_cal'
          : 'name',
  };
}

export const CS_MIF_EXPORT_HEADERS = [
  'Member First Name',
  'Member Last Name',
  'Medical Record Number (MRN)',
  'Medi-Cal Member Client Index Number (CIN)',
  'Member Residential Address',
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

export type CsMifExportHeader = (typeof CS_MIF_EXPORT_HEADERS)[number];

export const ILS_MIF_DEFAULT_WORKSHEET_NAME = 'CSMIF';

const formatPhoneForMifExport = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = normalizePhoneDigits(raw);
  return digits ? formatPhoneDashed(digits) : raw;
};

const pickMifExportValue = (originalValue: unknown, builtValue: unknown) => {
  const original = String(originalValue ?? '').trim();
  if (original) return original;
  return String(builtValue ?? '').trim();
};

const EXCLUDED_MIF_EXPORT_HEADERS = new Set([
  'clientid2',
  'client_id2',
  'membergendercode',
  'membergender',
  'membersex',
  'gender',
  'sex',
]);

const formatMifRawCellValue = (header: string, value: unknown): string => {
  const nk = normalizeSheetHeader(header);
  if (
    nk.includes('date') ||
    nk.includes('dob') ||
    nk.includes('authorizationstart') ||
    nk.includes('authorizationend') ||
    nk.includes('referralauthorizationdecision') ||
    nk.includes('receivedrequestforauthorization')
  ) {
    return toSpreadsheetDate(value);
  }
  if (nk.includes('phone')) return formatPhoneForMifExport(value);
  if (nk.includes('email')) return String(value || '').trim().toLowerCase();
  if (nk.includes('city') || nk.includes('county') || (nk.includes('name') && !nk.includes('email'))) {
    return toNameCase(String(value || '').trim());
  }
  if (nk.includes('address')) return toNameCase(String(value || '').trim());
  return String(value ?? '').trim();
};

/** Capture every column from the uploaded MIF row exactly as labeled in the spreadsheet. */
export function captureCsMifOriginalColumnsFromRaw(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const label = String(key || '').replace(/\s+/g, ' ').trim();
    if (!label || /^empty/i.test(normalizeSheetHeader(label)) || label.startsWith('__')) continue;
    out[label] = formatMifRawCellValue(label, value);
  }
  return out;
}

export function resolveCsMifExportHeaderOrder(rows: IlsMifMasterRow[]): string[] {
  const orderCounts = new Map<string, { headers: string[]; count: number }>();
  rows.forEach((row) => {
    const headers = (row.mifSourceHeaders || []).filter(
      (header) => !EXCLUDED_MIF_EXPORT_HEADERS.has(normalizeSheetHeader(header))
    );
    if (!headers.length) return;
    const key = headers.map((header) => normalizeSheetHeader(header)).join('|');
    const hit = orderCounts.get(key);
    if (hit) hit.count += 1;
    else orderCounts.set(key, { headers, count: 1 });
  });
  const best = [...orderCounts.values()].sort(
    (a, b) => b.count - a.count || b.headers.length - a.headers.length
  )[0];
  const baseHeaders = best?.headers.length ? [...best.headers] : [...CS_MIF_EXPORT_HEADERS];
  const seen = new Set(baseHeaders.map((header) => normalizeSheetHeader(header)));
  CS_MIF_EXPORT_HEADERS.forEach((header) => {
    const normalized = normalizeSheetHeader(header);
    if (seen.has(normalized)) return;
    baseHeaders.push(header);
    seen.add(normalized);
  });
  return baseHeaders;
}

const pickNonEmptyMifValue = (...values: Array<unknown>) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

export const pickRicherMifOriginalColumns = (
  primary?: Record<string, string>,
  fallback?: Record<string, string>
): Record<string, string> | undefined => {
  const merged = mergeMifOriginalColumnsPreferNonEmpty(fallback, primary);
  if (!Object.keys(merged).length) return primary || fallback;
  return merged;
};

/** Prefer the latest uploaded MIF snapshot while keeping Caspio flags on the master row. */
export function mergeIlsMifSessionSnapshotIntoMasterRow(
  existing: IlsMifMasterRow,
  session: IlsMifMasterRow
): IlsMifMasterRow {
  const auth = resolveIlsMifAuthorizationFields({
    authorizationNumberT2038: pickNonEmptyMifValue(
      session.authorizationNumberT2038,
      existing.authorizationNumberT2038
    ),
    authorizationStartT2038: pickNonEmptyMifValue(
      session.authorizationStartT2038,
      existing.authorizationStartT2038
    ),
    authorizationEndT2038: pickNonEmptyMifValue(
      session.authorizationEndT2038,
      existing.authorizationEndT2038
    ),
    mifOriginalColumns: pickRicherMifOriginalColumns(
      session.mifOriginalColumns,
      existing.mifOriginalColumns
    ),
  });
  const mergedSession: IlsMifMasterRow = {
    ...existing,
    ...session,
    ...auth,
    sourceFileName: pickNonEmptyMifValue(session.sourceFileName, existing.sourceFileName),
    mifDateKey: pickNonEmptyMifValue(session.mifDateKey, existing.mifDateKey),
    mifDateLabel: pickNonEmptyMifValue(session.mifDateLabel, existing.mifDateLabel),
    memberAddress: pickNonEmptyMifValue(session.memberAddress, existing.memberAddress),
    memberResidentialAddress: pickNonEmptyMifValue(
      session.memberResidentialAddress,
      existing.memberResidentialAddress
    ),
    memberResidentialCity: pickNonEmptyMifValue(
      session.memberResidentialCity,
      existing.memberResidentialCity
    ),
    memberResidentialZip: pickNonEmptyMifValue(session.memberResidentialZip, existing.memberResidentialZip),
    memberMailingCity: pickNonEmptyMifValue(session.memberMailingCity, existing.memberMailingCity),
    memberMailingZip: pickNonEmptyMifValue(session.memberMailingZip, existing.memberMailingZip),
    memberCity: pickNonEmptyMifValue(session.memberCity, existing.memberCity),
    memberZip: pickNonEmptyMifValue(session.memberZip, existing.memberZip),
    memberCounty: pickNonEmptyMifValue(session.memberCounty, existing.memberCounty),
    memberPhone: pickNonEmptyMifValue(session.primaryPhoneNumber, session.memberPhone, existing.memberPhone),
    primaryPhoneNumber: pickNonEmptyMifValue(session.primaryPhoneNumber, existing.primaryPhoneNumber),
    homePhoneNumber: pickNonEmptyMifValue(session.homePhoneNumber, existing.homePhoneNumber),
    mifSourceHeaders: session.mifSourceHeaders?.length ? session.mifSourceHeaders : existing.mifSourceHeaders,
    mifOriginalColumns:
      pickRicherMifOriginalColumns(session.mifOriginalColumns, existing.mifOriginalColumns) ||
      session.mifOriginalColumns ||
      existing.mifOriginalColumns,
    caspioExists: Boolean(session.caspioExists || existing.caspioExists),
    caspioMatchLabel: session.caspioMatchLabel || existing.caspioMatchLabel,
    caspioMatchedClientId2: session.caspioMatchedClientId2 || existing.caspioMatchedClientId2,
    caspioMatchedBy: session.caspioMatchedBy || existing.caspioMatchedBy,
    caspioCalAIMStatus: session.caspioCalAIMStatus || existing.caspioCalAIMStatus || '',
    caspioKaiserStatus: session.caspioKaiserStatus || existing.caspioKaiserStatus || '',
    needsAuthorizedUpdate: Boolean(session.needsAuthorizedUpdate || existing.needsAuthorizedUpdate),
    needsT2038ReceivedUpdate: Boolean(
      session.needsT2038ReceivedUpdate || existing.needsT2038ReceivedUpdate
    ),
    mergeStatus:
      session.mergeStatus === 'incomplete' || existing.mergeStatus === 'incomplete'
        ? 'incomplete'
        : resolveIlsMifMergeStatusForCaspioMatch(
            {
              mergeStatus: session.mergeStatus || existing.mergeStatus,
              caspioCalAIMStatus: session.caspioCalAIMStatus || existing.caspioCalAIMStatus || '',
            },
            Boolean(session.caspioExists || existing.caspioExists)
          ),
    statusNote: session.statusNote || existing.statusNote,
    skeletonApplicationId: existing.skeletonApplicationId || session.skeletonApplicationId,
  };
  return withResolvedIlsMifMasterRowDate(mergedSession);
}

/** Apply a fresh MIF upload over existing session/master rows (preserves Caspio flags on matches). */
export function mergeFreshIlsMifUploadIntoRows(
  existingRows: IlsMifMasterRow[],
  incomingRows: IlsMifMasterRow[]
): { masterRows: IlsMifMasterRow[]; spreadsheetDuplicateLines: number } {
  const incomingFresh = incomingRows.filter((row) => row.mergeStatus !== 'duplicate_in_batch');
  const existingCanonical = existingRows.filter((row) => row.mergeStatus !== 'duplicate_in_batch');

  const latestIncomingByAlias = new Map<string, IlsMifMasterRow>();
  incomingFresh.forEach((row) => {
    for (const alias of ilsMifIdentityAliasKeys(row)) {
      latestIncomingByAlias.set(alias, row);
    }
  });

  const matchedIncomingKeys = new Set<string>();
  const mergedExisting = existingCanonical.map((row) => {
    let fresh: IlsMifMasterRow | undefined;
    for (const alias of ilsMifIdentityAliasKeys(row)) {
      const hit = latestIncomingByAlias.get(alias);
      if (hit) {
        fresh = hit;
        break;
      }
    }
    if (!fresh) return row;
    for (const alias of ilsMifIdentityAliasKeys(fresh)) matchedIncomingKeys.add(alias);
    return mergeIlsMifSessionSnapshotIntoMasterRow(row, fresh);
  });

  // Only append incoming people who are not already represented on the master.
  const netNewIncoming = incomingFresh.filter((row) => {
    const aliases = ilsMifIdentityAliasKeys(row);
    return !aliases.some((alias) => matchedIncomingKeys.has(alias));
  });

  const merged = dedupeIlsMifMasterRows([...mergedExisting, ...netNewIncoming]);
  const spreadsheetDuplicateLines =
    Math.max(0, incomingFresh.length - netNewIncoming.length) +
    merged.filter((row) => row.mergeStatus === 'duplicate_in_batch').length;
  return {
    masterRows: filterIlsMifNonDuplicateRows(merged),
    spreadsheetDuplicateLines,
  };
}

const MIF_EXPORT_HEADER_ALIASES: Partial<Record<CsMifExportHeader, string[]>> = {
  'Member First Name': ['Member First Name', 'First Name', 'MemberFirstName'],
  'Member Last Name': ['Member Last Name', 'Last Name', 'MemberLastName'],
  'Medical Record Number (MRN)': [
    'Medical Record Number (MRN)',
    'Medical Record Number',
    'Member MRN',
    'MRN',
  ],
  'Medi-Cal Member Client Index Number (CIN)': [
    'Medi-Cal Member Client Index Number (CIN)',
    'Medi-Cal Member Client ID',
    'Medi-Cal Member Client Index Number',
    'Medi-Cal CIN',
    'Member CIN',
    'CIN',
    'MCP CIN',
  ],
  'Member Residential Address': ['Member Residential Address', 'Residential Address'],
  'Member Residential City': ['Member Residential City', 'Residential City'],
  'Member Residential Zip Code': [
    'Member Residential Zip Code',
    'Member Resdidential Zip Code',
    'Member Resdential Zip Code',
    'Member Residential Zip',
    'Residential Zip Code',
    'Residential Zip',
  ],
  'Member Mailing Address': ['Member Mailing Address', 'Mailing Address'],
  'Member Mailing City': ['Member Mailing City', 'Mailing City'],
  'Member Mailing Zip Code': ['Member Mailing Zip Code', 'Mailing Zip Code', 'Mailing Zip'],
  'Medi-Cal Coverage County': ['Medi-Cal Coverage County', 'Coverage County', 'Member County', 'County'],
  'Member Date of Birth': ['Member Date of Birth', 'Date of Birth', 'DOB', 'Member DOB'],
  'Primary Phone Number': [
    'Primary Phone Number',
    'Member Primary Phone Number',
    'Member Primary Phone',
    'Primary Phone',
  ],
  'Home Phone Number': [
    'Home Phone Number',
    'Member Home Phone Number',
    'Member Home Phone',
    'Home Phone',
    'Member Home',
  ],
  'Referring Organization': ['Referring Organization'],
  'Referring Individual Name': ['Referring Individual Name', 'Referring Individual'],
  'Referring Individual Phone Number': [
    'Referring Individual Phone Number',
    'Referring Individual Phone',
  ],
  'Referring Individual Email Address': [
    'Referring Individual Email Address',
    'Referring Individual Email',
  ],
  'Emergency/ Alternate Contact Name': [
    'Emergency/ Alternate Contact Name',
    'Emergency/Alternate Contact Name',
    'Emergency Contact Name',
  ],
  'Emergency/Alternate Contact Relation': [
    'Emergency/Alternate Contact Relation',
    'Emergency/ Alternate Contact Relation',
    'Emergency Contact Relation',
  ],
  'Emergency/Alternate Contact Phone Number': [
    'Emergency/Alternate Contact Phone Number',
    'Emergency/ Alternate Contact Phone Number',
    'Emergency Contact Phone Number',
  ],
  'Emergency/Alternate Contact Email Address': [
    'Emergency/Alternate Contact Email Address',
    'Emergency/ Alternate Contact Email Address',
    'Emergency Contact Email Address',
  ],
  'Member Email Address': ['Member Email Address', 'Member Email'],
  'Authorization Number': ['Authorization Number', 'Auth Number', 'Auth #'],
  'Authorization Start Date': ['Authorization Start Date', 'Auth Start Date'],
  'Authorization End Date': [
    'Authorization End Date',
    'Authorizatin End Date',
    'Auth End Date',
    'Authorization Stop Date',
  ],
  'Date Received Request for Authorization': ['Date Received Request for Authorization'],
  'Date of Referral Authorization Decision': ['Date of Referral Authorization Decision'],
};

const MIF_RESIDENTIAL_HEADER_ALIASES = MIF_EXPORT_HEADER_ALIASES;

const lookupMifOriginalColumnValue = (
  fromOriginal: Record<string, string>,
  header: string
): string => {
  const direct = String(fromOriginal[header] ?? '').trim();
  if (direct) return direct;
  const target = normalizeSheetHeader(header);
  for (const [key, value] of Object.entries(fromOriginal)) {
    if (normalizeSheetHeader(key) === target) return String(value || '').trim();
  }
  for (const aliases of Object.values(MIF_EXPORT_HEADER_ALIASES)) {
    if (!aliases?.some((alias) => normalizeSheetHeader(alias) === target)) continue;
    for (const alias of aliases) {
      const hit = String(fromOriginal[alias] ?? '').trim();
      if (hit) return hit;
      const aliasTarget = normalizeSheetHeader(alias);
      for (const [key, value] of Object.entries(fromOriginal)) {
        if (normalizeSheetHeader(key) === aliasTarget) return String(value || '').trim();
      }
    }
  }
  return '';
};

const resolveCanonicalExportHeaderForLabel = (header: string): CsMifExportHeader | null => {
  const target = normalizeSheetHeader(header);
  for (const canonical of CS_MIF_EXPORT_HEADERS) {
    if (normalizeSheetHeader(canonical) === target) return canonical;
  }
  for (const [canonical, aliases] of Object.entries(MIF_EXPORT_HEADER_ALIASES) as Array<
    [CsMifExportHeader, string[]]
  >) {
    if (aliases.some((alias) => normalizeSheetHeader(alias) === target)) return canonical;
  }
  return null;
};

/** Build one export row using only the original ILS CS MIF column headers. */
export function buildCsMifExportRowFromMasterRow(row: IlsMifMasterRow): Record<CsMifExportHeader, string> {
  const fromOriginal = row.mifOriginalColumns || {};
  const built: Record<CsMifExportHeader, string> = {
    'Member First Name': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member First Name'),
      row.memberFirstName
    ),
    'Member Last Name': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Last Name'),
      row.memberLastName
    ),
    'Medical Record Number (MRN)': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Medical Record Number (MRN)'),
      row.memberMrn
    ),
    'Medi-Cal Member Client Index Number (CIN)': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Medi-Cal Member Client Index Number (CIN)'),
      row.memberMediCalNum
    ),
    'Member Residential Address': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Residential Address'),
      row.memberResidentialAddress,
      row.memberAddress
    ),
    'Member Residential City': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Residential City'),
      row.memberResidentialCity,
      row.memberMailingCity || row.memberCity
    ),
    'Member Residential Zip Code': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Residential Zip Code'),
      row.memberResidentialZip,
      row.memberMailingZip || row.memberZip
    ),
    'Member Mailing Address': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing Address'),
      row.memberAddress,
      row.memberResidentialAddress
    ),
    'Member Mailing City': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing City'),
      row.memberMailingCity || row.memberCity,
      row.memberResidentialCity
    ),
    'Member Mailing Zip Code': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing Zip Code'),
      row.memberMailingZip || row.memberZip,
      row.memberResidentialZip
    ),
    'Medi-Cal Coverage County': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Medi-Cal Coverage County'),
      row.memberCounty
    ),
    'Member Date of Birth': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Date of Birth'),
      row.memberDob
    ),
    'Primary Phone Number': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Primary Phone Number'),
      formatPhoneForMifExport(row.primaryPhoneNumber || row.memberPhone)
    ),
    'Home Phone Number': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Home Phone Number'),
      formatPhoneForMifExport(row.homePhoneNumber)
    ),
    'Referring Organization': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Referring Organization'),
      row.referringOrganization
    ),
    'Referring Individual Name': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Referring Individual Name'),
      row.careManagerName
    ),
    'Referring Individual Phone Number': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Referring Individual Phone Number'),
      formatPhoneForMifExport(row.careManagerPhone)
    ),
    'Referring Individual Email Address': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Referring Individual Email Address'),
      row.careManagerEmail
    ),
    'Emergency/ Alternate Contact Name': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Emergency/ Alternate Contact Name'),
      row.emergencyContactName
    ),
    'Emergency/Alternate Contact Relation': sanitizeRelationshipLabel(
      pickMifExportValue(
        lookupMifOriginalColumnValue(fromOriginal, 'Emergency/Alternate Contact Relation'),
        row.emergencyContactRelationship
      )
    ),
    'Emergency/Alternate Contact Phone Number': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Emergency/Alternate Contact Phone Number'),
      formatPhoneForMifExport(row.emergencyContactPhone)
    ),
    'Emergency/Alternate Contact Email Address': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Emergency/Alternate Contact Email Address'),
      row.emergencyContactEmail
    ),
    'Member Email Address': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Member Email Address'),
      row.memberEmail
    ),
    'Authorization Number': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Authorization Number'),
      row.authorizationNumberT2038
    ),
    'Authorization Start Date': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Authorization Start Date'),
      row.authorizationStartT2038
    ),
    'Authorization End Date': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Authorization End Date'),
      row.authorizationEndT2038
    ),
    'Date Received Request for Authorization': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Date Received Request for Authorization'),
      row.dateReceivedRequestForAuthorization
    ),
    'Date of Referral Authorization Decision': pickMifExportValue(
      lookupMifOriginalColumnValue(fromOriginal, 'Date of Referral Authorization Decision'),
      row.dateOfReferralAuthorizationDecision
    ),
  };

  return built;
}

export function buildCsMifExportRowValues(row: IlsMifMasterRow, headers: string[]): string[] {
  const canonical = buildCsMifExportRowFromMasterRow(row);
  const fromOriginal = row.mifOriginalColumns || {};
  return headers.map((header) => {
    const canonicalKey = resolveCanonicalExportHeaderForLabel(header);
    return pickNonEmptyMifValue(
      lookupMifOriginalColumnValue(fromOriginal, header),
      canonicalKey ? canonical[canonicalKey] : '',
      (canonical as Record<string, string>)[header]
    );
  });
}

export function resolveIlsMifWorksheetName(rows: IlsMifMasterRow[]): string {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const name = String(row.sourceSheetName || '').trim();
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  if (!counts.size) return ILS_MIF_DEFAULT_WORKSHEET_NAME;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function masterRowsToCsMifExportRows(rows: IlsMifMasterRow[]) {
  return rows.map((row) => buildCsMifExportRowFromMasterRow(row));
}

export type IlsMifAddressNotesInput = {
  memberResidentialAddress?: string;
  memberResidentialCity?: string;
  memberResidentialZip?: string;
  memberAddress?: string;
  memberMailingCity?: string;
  memberMailingZip?: string;
  memberCity?: string;
  memberZip?: string;
  memberCounty?: string;
  primaryPhoneNumber?: string;
  homePhoneNumber?: string;
  memberPhone?: string;
  mifOriginalColumns?: Record<string, string>;
};

/** Address / phone lines for admin notes when creating apps from MIF and pushing to Caspio. */
export function buildIlsMifAddressNotesLines(input: IlsMifAddressNotesInput): string[] {
  const fromOriginal = input.mifOriginalColumns || {};
  const residentialAddress = pickNonEmptyMifValue(
    input.memberResidentialAddress,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Residential Address')
  );
  const residentialCity = pickNonEmptyMifValue(
    input.memberResidentialCity,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Residential City')
  );
  const residentialZip = pickNonEmptyMifValue(
    input.memberResidentialZip,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Residential Zip Code')
  );
  const mailingAddress = pickNonEmptyMifValue(
    input.memberAddress,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing Address')
  );
  const mailingCity = pickNonEmptyMifValue(
    input.memberMailingCity,
    input.memberCity,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing City')
  );
  const mailingZip = pickNonEmptyMifValue(
    input.memberMailingZip,
    input.memberZip,
    lookupMifOriginalColumnValue(fromOriginal, 'Member Mailing Zip Code')
  );
  const county = pickNonEmptyMifValue(
    input.memberCounty,
    lookupMifOriginalColumnValue(fromOriginal, 'Medi-Cal Coverage County')
  );
  const primaryPhone = formatPhoneForMifExport(
    pickNonEmptyMifValue(
      input.primaryPhoneNumber,
      input.memberPhone,
      lookupMifOriginalColumnValue(fromOriginal, 'Primary Phone Number')
    )
  );
  const homePhone = formatPhoneForMifExport(
    pickNonEmptyMifValue(
      input.homePhoneNumber,
      lookupMifOriginalColumnValue(fromOriginal, 'Home Phone Number')
    )
  );

  const lines: string[] = [];
  if (residentialAddress) lines.push(`Member Residential Address: ${residentialAddress}`);
  if (residentialCity) lines.push(`Member Residential City: ${residentialCity}`);
  if (residentialZip) lines.push(`Member Residential Zip Code: ${residentialZip}`);
  if (mailingAddress) lines.push(`Member Mailing Address: ${mailingAddress}`);
  if (mailingCity) lines.push(`Member Mailing City: ${mailingCity}`);
  if (mailingZip) lines.push(`Member Mailing Zip Code: ${mailingZip}`);
  if (county) lines.push(`Medi-Cal Coverage County: ${county}`);
  if (primaryPhone) lines.push(`Primary Phone Number: ${primaryPhone}`);
  if (
    homePhone &&
    normalizePhoneDigits(homePhone) &&
    normalizePhoneDigits(homePhone) !== normalizePhoneDigits(primaryPhone)
  ) {
    lines.push(`Home Phone Number: ${homePhone}`);
  }
  return lines;
}

/** Firestore batch limit is 10MB — rows with full mifOriginalColumns must use small batches. */
/** Upload-history subcollection: one write per member row. */
export const ILS_MIF_FIRESTORE_MEMBER_BATCH_SIZE = 5;
/** Master/run save: one collection write per member row per phase (two phases). */
export const ILS_MIF_FIRESTORE_MASTER_BATCH_SIZE = 5;
/** Link uploaded file records to a run (one write each). */
export const ILS_MIF_FIRESTORE_LINK_BATCH_SIZE = 5;
/** Remove/restore: up to four writes per member. */
export const ILS_MIF_FIRESTORE_REMOVE_BATCH_SIZE = 4;
export const ILS_MIF_FIRESTORE_DECLINE_BATCH_SIZE = 5;
/** Above this row count, skip per-member upload-history writes (metadata only). */
export const ILS_MIF_UPLOAD_HISTORY_MEMBER_DETAIL_MAX = 150;
/** Single-op deletes (run members, upload history cleanup). */
export const ILS_MIF_FIRESTORE_DELETE_BATCH_SIZE = 50;

export type IlsMifUploadParsePreview = {
  sourceFileName: string;
  memberCount: number;
  sheetHeaderCount: number;
  originalColumnCount: number;
  sampleMemberLabel: string;
  /** ILS CS MIF export columns and parsed values for one sample member. */
  sampleByHeader: Record<string, string>;
  emptyHeaders: string[];
  populatedHeaderCount: number;
};

/** Build a one-member parse preview so staff can verify round-trip fields before saving. */
export function buildIlsMifUploadParsePreview(rows: IlsMifMasterRow[]): IlsMifUploadParsePreview | null {
  if (!rows.length) return null;
  const sample =
    rows.find(
      (row) =>
        row.memberFirstName &&
        row.memberLastName &&
        (row.memberResidentialAddress ||
          row.memberAddress ||
          Object.keys(row.mifOriginalColumns || {}).length)
    ) || rows[0];
  const exportRow = buildCsMifExportRowFromMasterRow(sample);
  const sampleByHeader: Record<string, string> = {};
  CS_MIF_EXPORT_HEADERS.forEach((header) => {
    sampleByHeader[header] = String(exportRow[header] || '').trim();
  });
  const emptyHeaders = CS_MIF_EXPORT_HEADERS.filter((header) => !sampleByHeader[header]);
  const originalColumnCount = Object.values(sample.mifOriginalColumns || {}).filter((value) =>
    String(value || '').trim()
  ).length;
  return {
    sourceFileName: String(sample.sourceFileName || '').trim(),
    memberCount: rows.length,
    sheetHeaderCount: sample.mifSourceHeaders?.length || 0,
    originalColumnCount,
    sampleMemberLabel: `${sample.memberLastName || ''}, ${sample.memberFirstName || ''}`.trim(),
    sampleByHeader,
    emptyHeaders,
    populatedHeaderCount: CS_MIF_EXPORT_HEADERS.length - emptyHeaders.length,
  };
}

/** Slim upload-history row — identity + auth fields (no full mifOriginalColumns). */
export function buildIlsMifUploadHistoryMemberPayload(
  row: IlsMifMasterRow,
  dedupeKey: string
): Record<string, unknown> {
  const auth = resolveIlsMifAuthorizationFields(row);
  return {
    rowId: row.rowId,
    dedupeKey,
    sourceFileName: row.sourceFileName,
    memberFirstName: row.memberFirstName,
    memberLastName: row.memberLastName,
    memberMrn: row.memberMrn,
    memberMediCalNum: row.memberMediCalNum,
    memberDob: row.memberDob,
    memberCounty: row.memberCounty,
    clientId2: row.clientId2 || '',
    memberAddress: row.memberAddress || '',
    memberResidentialAddress: row.memberResidentialAddress || '',
    memberResidentialCity: row.memberResidentialCity || '',
    memberResidentialZip: row.memberResidentialZip || '',
    memberMailingCity: row.memberMailingCity || '',
    memberMailingZip: row.memberMailingZip || '',
    authorizationNumberT2038: auth.authorizationNumberT2038 || '',
    authorizationStartT2038: auth.authorizationStartT2038 || '',
    authorizationEndT2038: auth.authorizationEndT2038 || '',
  };
}

/** Full master-list payload including original MIF columns for exact export round-trip.
 *  Empty auth / source-file / original-column bags are omitted so Firestore merge:true
 *  does not wipe previously stored values. */
export function buildIlsMifFirestoreMasterPayload(
  row: IlsMifMasterRow,
  extras: Record<string, unknown> = {}
): Record<string, unknown> {
  const auth = resolveIlsMifAuthorizationFields(row);
  const sourceFileName = String(row.sourceFileName || '').trim();
  const headers = Array.isArray(row.mifSourceHeaders) ? row.mifSourceHeaders : [];
  const columns =
    row.mifOriginalColumns && typeof row.mifOriginalColumns === 'object' ? row.mifOriginalColumns : {};
  const hasColumns = Object.keys(columns).length > 0;
  const payload: Record<string, unknown> = {
    rowId: row.rowId,
    sourceSheetName: row.sourceSheetName || '',
    memberFirstName: row.memberFirstName,
    memberLastName: row.memberLastName,
    memberMrn: row.memberMrn,
    memberMediCalNum: row.memberMediCalNum,
    memberSex: row.memberSex || '',
    clientId2: row.clientId2 || '',
    memberAddress: row.memberAddress || '',
    memberCity: row.memberCity || '',
    memberZip: row.memberZip || '',
    memberState: row.memberState || '',
    memberCounty: row.memberCounty || '',
    memberResidentialAddress: row.memberResidentialAddress || '',
    memberResidentialCity: row.memberResidentialCity || '',
    memberResidentialZip: row.memberResidentialZip || '',
    memberMailingCity: row.memberMailingCity || '',
    memberMailingZip: row.memberMailingZip || '',
    memberDob: row.memberDob || '',
    memberPhone: row.memberPhone || '',
    primaryPhoneNumber: row.primaryPhoneNumber || '',
    homePhoneNumber: row.homePhoneNumber || '',
    memberEmail: row.memberEmail || '',
    contactPhone: row.contactPhone || '',
    contactEmail: row.contactEmail || '',
    referringOrganization: row.referringOrganization || '',
    emergencyContactName: row.emergencyContactName || '',
    emergencyContactRelationship: sanitizeRelationshipLabel(row.emergencyContactRelationship) || '',
    emergencyContactPhone: row.emergencyContactPhone || '',
    emergencyContactEmail: row.emergencyContactEmail || '',
    careManagerName: row.careManagerName || '',
    careManagerPhone: row.careManagerPhone || '',
    careManagerEmail: row.careManagerEmail || '',
    dateReceivedRequestForAuthorization: row.dateReceivedRequestForAuthorization || '',
    dateOfReferralAuthorizationDecision: row.dateOfReferralAuthorizationDecision || '',
    extraAdminNotes: row.extraAdminNotes || '',
    caspioExists: Boolean(row.caspioExists),
    caspioMatchLabel: row.caspioMatchLabel || '',
    caspioMatchedClientId2: row.caspioMatchedClientId2 || '',
    caspioMatchedBy: row.caspioMatchedBy || '',
    caspioCalAIMStatus: row.caspioCalAIMStatus || '',
    caspioKaiserStatus: row.caspioKaiserStatus || '',
    needsAuthorizedUpdate: Boolean(row.needsAuthorizedUpdate),
    needsT2038ReceivedUpdate: Boolean(row.needsT2038ReceivedUpdate),
    batchDuplicate: Boolean(row.batchDuplicate),
    mergeStatus: row.mergeStatus || 'unique',
    statusNote: row.statusNote || '',
    skeletonApplicationId: row.skeletonApplicationId || '',
    ...extras,
  };
  if (sourceFileName) payload.sourceFileName = sourceFileName;
  const mifDate = resolveIlsMifMasterRowDateLabel({ ...row, ...auth });
  if (mifDate.mifDateKey) payload.mifDateKey = mifDate.mifDateKey;
  if (mifDate.mifDateLabel) payload.mifDateLabel = mifDate.mifDateLabel;
  if (auth.authorizationNumberT2038) payload.authorizationNumberT2038 = auth.authorizationNumberT2038;
  if (auth.authorizationStartT2038) payload.authorizationStartT2038 = auth.authorizationStartT2038;
  if (auth.authorizationEndT2038) payload.authorizationEndT2038 = auth.authorizationEndT2038;
  if (headers.length) payload.mifSourceHeaders = headers;
  if (hasColumns) payload.mifOriginalColumns = columns;
  return payload;
}

/** Size Excel columns from content so downloads show full values without manual widening. */
const applyWorksheetAutoColumnWidths = (
  worksheet: { ['!cols']?: Array<{ wch: number }> },
  matrix: unknown[][]
) => {
  if (!Array.isArray(matrix) || !matrix.length) return;
  const colCount = matrix.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0
  );
  if (!colCount) return;
  const widths: number[] = Array.from({ length: colCount }, () => 10);
  matrix.forEach((row) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, colIdx) => {
      const text = String(cell ?? '');
      // Approximate display width: count characters (Excel wch is roughly character units).
      const len = Math.min(72, Math.max(text.length, 1));
      if (len > widths[colIdx]) widths[colIdx] = len;
    });
  });
  worksheet['!cols'] = widths.map((wch) => ({
    // Pad a little past content; keep a usable floor for short headers.
    wch: Math.max(12, Math.min(72, wch + 2)),
  }));
};

export async function downloadIlsMifMasterAsCsMifWorkbook(
  rows: IlsMifMasterRow[],
  fileName?: string,
  companionSheets: IlsMifCompanionSheet[] = []
) {
  const XLSX = await import('xlsx');
  const headers = resolveCsMifExportHeaderOrder(rows);
  const worksheetData = [
    headers,
    ...rows.map((row) => buildCsMifExportRowValues(row, headers)),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  applyWorksheetAutoColumnWidths(worksheet, worksheetData);
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const primaryName = sanitizeIlsMifExcelSheetName(resolveIlsMifWorksheetName(rows), usedNames);
  XLSX.utils.book_append_sheet(workbook, worksheet, primaryName);

  for (const companion of companionSheets || []) {
    if (!matrixHasContent(companion.matrix)) continue;
    const sheetName = sanitizeIlsMifExcelSheetName(companion.sheetName, usedNames);
    const companionWs = XLSX.utils.aoa_to_sheet(companion.matrix);
    applyWorksheetAutoColumnWidths(companionWs, companion.matrix);
    XLSX.utils.book_append_sheet(workbook, companionWs, sheetName);
  }

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
    memberResidentialAddress: row.memberResidentialAddress,
    memberResidentialCity: row.memberResidentialCity,
    memberResidentialZip: row.memberResidentialZip,
    memberMailingCity: row.memberMailingCity,
    memberMailingZip: row.memberMailingZip,
    memberCity: row.memberCity,
    memberZip: row.memberZip,
    memberState: row.memberState,
    memberCounty: row.memberCounty,
    memberDob: row.memberDob,
    memberPhone: row.memberPhone,
    primaryPhoneNumber: row.primaryPhoneNumber,
    homePhoneNumber: row.homePhoneNumber,
    mifOriginalColumns: row.mifOriginalColumns,
    memberEmail: row.memberEmail,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    referringOrganization: row.referringOrganization,
    emergencyContactName: row.emergencyContactName,
    emergencyContactRelationship: sanitizeRelationshipLabel(row.emergencyContactRelationship),
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
