import {
  classifyT2038Window,
  formatUsDate,
  isKaiserPlan,
  parseDateOnly,
  startOfToday,
  type T2038AuthWindow,
} from '@/lib/t2038-claims';

export const KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION =
  'kaiser_t2038_claim_month_justifications';

const clean = (value: unknown) => String(value ?? '').trim();

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return '';
};

const normalize = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

/** Service-date fields on CalAIM_Claim_Submit_T2038 (includes Date_of_Service / Claim_Date). */
export const T2038_CLAIM_DOS_FIELDS = [
  'Date_of_Service',
  'Date_Of_Service',
  'Claim_Date',
  'ClaimDate',
  'Service_Date',
  'DOS',
  'Days_of_Service_Last1',
  'Days_of_Service_Last2',
  'Days_of_Service_Last3',
  'Days_of_Service_Last4',
  'Days_of_Service_First1',
  'Days_of_Service_First2',
  'Days_of_Service_First3',
  'Days_of_Service_First4',
] as const;

/** Normalize Client_ID2 so "10914", 10914, and "10914.0" share one map key. */
export function normalizeClientId2Key(value: unknown): string {
  const raw = clean(value);
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return raw.toLowerCase();
  // Strip leading zeros / decimal junk while keeping the integer id.
  const asNum = Number(digits);
  if (Number.isFinite(asNum) && asNum > 0) return String(Math.trunc(asNum));
  return digits;
}

/** Parse Caspio claim dates: US/ISO, /Date(ms)/, Excel serial, Date objects. */
export function parseClaimServiceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 90000) {
      const ms = Math.round((value - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      }
    }
    // Epoch ms
    if (value > 1e11) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
    }
  }
  const raw = clean(value);
  if (!raw) return null;
  const msJson = raw.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/i);
  if (msJson) {
    const d = new Date(Number(msJson[1]));
    if (!Number.isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return parseDateOnly(value);
}

export type MonthStatus = 'claimed' | 'missing' | 'justified' | 'claimable';

/** Staff disposition for a missing month (persisted for audit / future Caspio batch). */
export type MonthDisposition = 'justified' | 'claimable';

export type ClaimMonthCell = {
  monthKey: string;
  label: string;
  status: MonthStatus;
  claimDates: string[];
  justificationReason: string;
  justifiedBy: string;
  justifiedAt: string;
};

export type SubmittedClaimRow = {
  clientId2: string;
  clientFirst: string;
  clientLast: string;
  dateOfService: string;
  dateOfServiceIso: string;
  monthKey: string;
  raw: Record<string, unknown>;
};

export type KaiserT2038ClaimAuditRow = {
  id: string;
  clientId2: string;
  memberFirstName: string;
  memberLastName: string;
  memberName: string;
  /** Kaiser MRN (falls back to MCP_CIN / Medi-Cal) — may be blank on older saved runs. */
  mrn?: string;
  calaimStatus: string;
  kaiserStatus: string;
  authorizationNumber: string;
  authorizationStart: string;
  authorizationEnd: string;
  authorizationStartIso: string;
  authorizationEndIso: string;
  window: T2038AuthWindow;
  daysUntilEnd: number | null;
  authEnded: boolean;
  /** True when auth dates exist but CalAIM_Claim_Submit_T2038 has no DOS rows yet. */
  noClaimsYet: boolean;
  /** First submitted claim DOS (US format), when any claims exist. */
  firstClaimDate: string;
  firstClaimMonthKey: string;
  /** Month where gap audit begins (first claim month), when claims exist. */
  gapStartMonthKey: string;
  expectedMonthCount: number;
  claimedMonthCount: number;
  justifiedMonthCount: number;
  missingMonthCount: number;
  openMissingMonthCount: number;
  claimsComplete: boolean;
  months: ClaimMonthCell[];
  submittedClaims: SubmittedClaimRow[];
};

export type MonthJustification = {
  clientId2: string;
  monthKey: string;
  /** justified = no claim needed; claimable = forgotten claim queued for Caspio batch. */
  disposition: MonthDisposition;
  reason: string;
  justifiedBy: string;
  justifiedByEmail: string;
  updatedAt: string;
};

export const DEFAULT_JUSTIFY_REASON = 'No claim — staff review';
export const DEFAULT_CLAIMABLE_REASON = 'Claimable — forgotten claim queued for Caspio batch';

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(monthKey: string): string {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** Inclusive calendar months from start through end (date-only). */
export function listMonthKeysInclusive(start: Date, end: Date): string[] {
  const from = new Date(start.getFullYear(), start.getMonth(), 1);
  const to = new Date(end.getFullYear(), end.getMonth(), 1);
  if (from.getTime() > to.getTime()) return [];
  const keys: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    keys.push(monthKeyFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

/** Open gaps older than this many calendar months are ignored. */
export const CLAIM_AUDIT_GAP_MAX_AGE_MONTHS = 6;

/**
 * Actionable gap months only: drop calendar year 2025 (and earlier),
 * and anything more than six months before today's month.
 */
export function isActionableClaimAuditMonth(monthKey: string, today = startOfToday()): boolean {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return false;
  if (year <= 2025) return false;
  const monthStart = new Date(year, month - 1, 1);
  const cutoff = new Date(today.getFullYear(), today.getMonth() - CLAIM_AUDIT_GAP_MAX_AGE_MONTHS, 1);
  return monthStart.getTime() >= cutoff.getTime();
}

export function filterActionableClaimAuditMonths(
  monthKeys: string[],
  today = startOfToday()
): string[] {
  return monthKeys.filter((key) => isActionableClaimAuditMonth(key, today));
}

export function collectServiceDatesFromClaimRow(row: Record<string, unknown>): Date[] {
  const dates: Date[] = [];
  const seen = new Set<number>();
  for (const field of T2038_CLAIM_DOS_FIELDS) {
    const date = parseClaimServiceDate(row[field]);
    if (!date) continue;
    const key = date.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push(date);
  }
  // Scan any remaining keys that look like service/claim dates.
  for (const [field, value] of Object.entries(row || {})) {
    const nk = field.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!nk.includes('date') && !nk.includes('dos') && !nk.includes('service')) continue;
    if (nk.includes('input') || nk.includes('modified') || nk.includes('created')) continue;
    const date = parseClaimServiceDate(value);
    if (!date) continue;
    const key = date.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push(date);
  }
  return dates;
}

export function indexClaimsByClientId2(
  records: Array<Record<string, unknown>> | null | undefined
): Map<string, SubmittedClaimRow[]> {
  const byClient = new Map<string, SubmittedClaimRow[]>();
  for (const raw of Array.isArray(records) ? records : []) {
    const clientId2Raw = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2, raw.ClientId2);
    const clientId2 = normalizeClientId2Key(clientId2Raw) || clean(clientId2Raw);
    if (!clientId2) continue;
    const clientFirst = pickFirst(raw.Client_First, raw.Senior_First);
    const clientLast = pickFirst(raw.Client_Last, raw.Senior_Last);
    const dates = collectServiceDatesFromClaimRow(raw);
    const list = byClient.get(clientId2) || [];
    if (dates.length === 0) {
      // Still record that a claim row exists for this member (avoids false "no claims yet").
      list.push({
        clientId2,
        clientFirst,
        clientLast,
        dateOfService: '',
        dateOfServiceIso: '',
        monthKey: '',
        raw,
      });
    } else {
      for (const date of dates) {
        list.push({
          clientId2,
          clientFirst,
          clientLast,
          dateOfService: formatUsDate(date),
          dateOfServiceIso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          monthKey: monthKeyFromDate(date),
          raw,
        });
      }
    }
    byClient.set(clientId2, list);
  }
  for (const [clientId2, list] of byClient.entries()) {
    list.sort((a, b) => {
      if (!a.dateOfServiceIso && !b.dateOfServiceIso) return 0;
      if (!a.dateOfServiceIso) return 1;
      if (!b.dateOfServiceIso) return -1;
      return a.dateOfServiceIso.localeCompare(b.dateOfServiceIso);
    });
    byClient.set(clientId2, list);
  }
  return byClient;
}

function isRelevantKaiserStatus(status: string) {
  const n = normalize(status);
  if (!n) return false;
  if (n === 'authorized') return true;
  if (n.includes('authorization ended')) return true;
  if (n === 'authorized on hold') return true;
  return false;
}

/**
 * Kaiser members to audit: currently/previously authorized for T2038,
 * including authorization-ended rows when auth dates exist.
 */
export function mapKaiserMemberForClaimAudit(
  rawMember: Record<string, unknown>,
  index = 0,
  today = startOfToday()
): Omit<
  KaiserT2038ClaimAuditRow,
  | 'noClaimsYet'
  | 'firstClaimDate'
  | 'firstClaimMonthKey'
  | 'gapStartMonthKey'
  | 'expectedMonthCount'
  | 'claimedMonthCount'
  | 'justifiedMonthCount'
  | 'missingMonthCount'
  | 'openMissingMonthCount'
  | 'claimsComplete'
  | 'months'
  | 'submittedClaims'
> | null {
  if (!isKaiserPlan(pickFirst(rawMember.CalAIM_MCO, rawMember.memberHealthPlan))) return null;

  const calaimStatus = pickFirst(rawMember.CalAIM_Status, rawMember.memberStatus, rawMember.calaimStatus);
  const start = parseDateOnly(
    pickFirst(rawMember.Authorization_Start_Date_T2038, rawMember.Authorization_Start_T2038)
  );
  const end = parseDateOnly(
    pickFirst(rawMember.Authorization_End_Date_T2038, rawMember.Authorization_End_T2038)
  );
  const hasAuthDates = Boolean(start && end);
  if (!isRelevantKaiserStatus(calaimStatus) && !hasAuthDates) return null;

  const memberFirstName = pickFirst(rawMember.Senior_First, rawMember.memberFirstName);
  const memberLastName = pickFirst(rawMember.Senior_Last, rawMember.memberLastName);
  const clientId2Raw = pickFirst(rawMember.client_ID2, rawMember.Client_ID2, rawMember.clientId2);
  const clientId2 = normalizeClientId2Key(clientId2Raw) || clean(clientId2Raw);
  const classified = classifyT2038Window(start, end, 30, today);

  return {
    id: pickFirst(clientId2, `${memberLastName}-${memberFirstName}-${index}`) || `row-${index}`,
    clientId2,
    memberFirstName,
    memberLastName,
    memberName: [memberLastName, memberFirstName].filter(Boolean).join(', ') || clientId2 || `Member ${index}`,
    calaimStatus: calaimStatus || (hasAuthDates ? 'Has T2038 dates' : ''),
    kaiserStatus: pickFirst(rawMember.Kaiser_Status, rawMember.Kaiser_ID_Status),
    mrn: pickFirst(
      rawMember.Kaiser_MRN,
      rawMember.Member_MRN,
      rawMember.MRN,
      rawMember.memberMrn,
      rawMember.MCP_CIN,
      rawMember.MediCal_Number
    ),
    authorizationNumber: pickFirst(
      rawMember.Authorization_Number_T2038,
      rawMember.Authorization_Number_T038
    ),
    authorizationStart: formatUsDate(start),
    authorizationEnd: formatUsDate(end),
    authorizationStartIso: start
      ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
      : '',
    authorizationEndIso: end
      ? `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      : '',
    window: classified.window,
    daysUntilEnd: classified.daysUntilEnd,
    authEnded: classified.window === 'expired',
  };
}

/**
 * Gap window:
 * - If claims exist: from the first submitted claim month through auth end (or today while auth open).
 *   Months before the first claim are ignored (ILS may not have released auth on Caspio start).
 * - If auth exists but no claims yet: flag as noClaimsYet (new auth awaiting first submission).
 */
export function buildKaiserT2038ClaimAuditRows(opts: {
  rawMembers: Array<Record<string, unknown>>;
  claimsByClient: Map<string, SubmittedClaimRow[]>;
  justificationsByKey: Map<string, MonthJustification>;
  today?: Date;
}): KaiserT2038ClaimAuditRow[] {
  const today = opts.today || startOfToday();
  const rows: KaiserT2038ClaimAuditRow[] = [];
  const seen = new Set<string>();

  opts.rawMembers.forEach((raw, index) => {
    const base = mapKaiserMemberForClaimAudit(raw || {}, index, today);
    if (!base?.clientId2) return;
    const key = normalize(base.clientId2);
    if (seen.has(key)) return;
    seen.add(key);

    const authStart = parseDateOnly(base.authorizationStartIso || base.authorizationStart);
    const authEnd = parseDateOnly(base.authorizationEndIso || base.authorizationEnd);
    const rangeEnd =
      authEnd && authEnd.getTime() < today.getTime()
        ? authEnd
        : authEnd && authEnd.getTime() >= today.getTime()
          ? today
          : today;

    const clientKey = normalizeClientId2Key(base.clientId2) || clean(base.clientId2);
    const submittedClaims = opts.claimsByClient.get(clientKey) || opts.claimsByClient.get(base.clientId2) || [];
    const datedClaims = submittedClaims.filter((claim) => Boolean(claim.monthKey && claim.dateOfService));
    const claimsByMonth = new Map<string, string[]>();
    for (const claim of datedClaims) {
      const list = claimsByMonth.get(claim.monthKey) || [];
      if (claim.dateOfService && !list.includes(claim.dateOfService)) list.push(claim.dateOfService);
      claimsByMonth.set(claim.monthKey, list);
    }

    const firstClaim = datedClaims[0] || null;
    const firstClaimDate = firstClaim?.dateOfService || '';
    const firstClaimMonthKey = firstClaim?.monthKey || '';
    // "No claims yet" only when we truly have zero claim rows for this Client_ID2.
    const noClaimsYet =
      submittedClaims.length === 0 && Boolean(authStart || authEnd || base.authorizationNumber);

    let expectedMonths: string[] = [];
    let gapStartMonthKey = '';
    if (firstClaim) {
      const firstClaimDateObj = parseClaimServiceDate(
        firstClaim.dateOfServiceIso || firstClaim.dateOfService
      );
      const gapStart = firstClaimDateObj || authStart;
      if (gapStart) {
        expectedMonths = filterActionableClaimAuditMonths(
          listMonthKeysInclusive(gapStart, rangeEnd),
          today
        );
        gapStartMonthKey = expectedMonths[0] || '';
      }
    } else if (submittedClaims.length > 0 && authStart) {
      // Claim rows exist but DOS could not be parsed — still audit from auth start.
      expectedMonths = filterActionableClaimAuditMonths(
        listMonthKeysInclusive(authStart, rangeEnd),
        today
      );
      gapStartMonthKey = expectedMonths[0] || '';
    } else if (!noClaimsYet && authStart) {
      expectedMonths = filterActionableClaimAuditMonths(
        listMonthKeysInclusive(authStart, rangeEnd),
        today
      );
      gapStartMonthKey = expectedMonths[0] || '';
    }

    const months: ClaimMonthCell[] = expectedMonths.map((monthKey) => {
      const claimDates = claimsByMonth.get(monthKey) || [];
      const justification = opts.justificationsByKey.get(`${base.clientId2}__${monthKey}`);
      let status: MonthStatus = 'missing';
      if (claimDates.length > 0) status = 'claimed';
      else if (justification?.disposition === 'claimable' || justification?.reason === DEFAULT_CLAIMABLE_REASON) {
        status = 'claimable';
      } else if (justification?.disposition === 'justified' || justification?.reason) {
        status = 'justified';
      }
      return {
        monthKey,
        label: formatMonthLabel(monthKey),
        status,
        claimDates,
        justificationReason: justification?.reason || '',
        justifiedBy: justification?.justifiedBy || '',
        justifiedAt: justification?.updatedAt || '',
      };
    });

    // Include any claimed months after first claim that somehow fall outside expectedMonths
    // (should be rare). Keep grid focused on gap window.
    const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
    const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
    const openMissingFromGrid = months.filter((m) => m.status === 'missing').length;
    const resolvedCount = months.filter(
      (m) => m.status === 'justified' || m.status === 'claimable'
    ).length;
    // New auth with zero claims counts as incomplete (1 open gap) until first claim lands.
    const openMissingMonthCount = noClaimsYet ? 1 : openMissingFromGrid;
    const missingMonthCount = noClaimsYet ? 1 : openMissingFromGrid + resolvedCount;

    rows.push({
      ...base,
      noClaimsYet,
      firstClaimDate,
      firstClaimMonthKey,
      gapStartMonthKey,
      expectedMonthCount: months.length,
      claimedMonthCount,
      justifiedMonthCount,
      missingMonthCount,
      openMissingMonthCount,
      claimsComplete: !noClaimsYet && months.length > 0 && openMissingFromGrid === 0,
      months,
      submittedClaims,
    });
  });

  rows.sort((a, b) => {
    if (Number(a.noClaimsYet) !== Number(b.noClaimsYet)) return Number(b.noClaimsYet) - Number(a.noClaimsYet);
    if (a.openMissingMonthCount !== b.openMissingMonthCount) {
      return b.openMissingMonthCount - a.openMissingMonthCount;
    }
    if (Number(a.authEnded) !== Number(b.authEnded)) return Number(a.authEnded) - Number(b.authEnded);
    return a.memberName.localeCompare(b.memberName, undefined, { sensitivity: 'base' });
  });

  return rows;
}

export function summarizeKaiserT2038ClaimAudit(rows: KaiserT2038ClaimAuditRow[]) {
  return {
    total: rows.length,
    openAuth: rows.filter((r) => r.window === 'in_window' || r.window === 'ending_soon').length,
    authEnded: rows.filter((r) => r.authEnded).length,
    missingDates: rows.filter((r) => r.window === 'missing_dates').length,
    noClaimsYet: rows.filter((r) => r.noClaimsYet).length,
    incomplete: rows.filter((r) => r.openMissingMonthCount > 0 || r.noClaimsYet).length,
    complete: rows.filter((r) => r.claimsComplete).length,
    openMissingMonths: rows.reduce(
      (sum, r) => sum + (r.noClaimsYet ? 0 : r.openMissingMonthCount),
      0
    ),
  };
}

/** Drop 2025 / >6-month-old gap months from a saved run without rebuilding from Caspio. */
export function applyActionableGapMonthPolicy(
  rows: KaiserT2038ClaimAuditRow[],
  today = startOfToday()
): KaiserT2038ClaimAuditRow[] {
  return rows.map((row) => {
    if (row.noClaimsYet) return row;
    const months = (row.months || []).filter((month) =>
      isActionableClaimAuditMonth(month.monthKey, today)
    );
    const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
    const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
    const openMissingFromGrid = months.filter((m) => m.status === 'missing').length;
    const resolvedCount = months.filter(
      (m) => m.status === 'justified' || m.status === 'claimable'
    ).length;
    return {
      ...row,
      months,
      gapStartMonthKey: months[0]?.monthKey || row.gapStartMonthKey,
      expectedMonthCount: months.length,
      claimedMonthCount,
      justifiedMonthCount,
      missingMonthCount: openMissingFromGrid + resolvedCount,
      openMissingMonthCount: openMissingFromGrid,
      claimsComplete: months.length > 0 && openMissingFromGrid === 0,
    };
  });
}

export function justificationDocId(clientId2: string, monthKey: string) {
  return `${clean(clientId2)}__${clean(monthKey)}`.replace(/[^\w.-]+/g, '_');
}

/** Persisted claim inventory between audit runs (one doc per claim). */
export const KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION = 'kaiser_t2038_claim_audit_claims';
/** One doc per audit run (metadata); rows live in subcollection `rows`. */
export const KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION = 'kaiser_t2038_claim_audit_runs';
/** Pointer to the latest saved run. */
export const KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION = 'kaiser_t2038_claim_audit_state';
export const KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID = 'latest';

export type KaiserT2038ClaimAuditRunMode = 'full' | 'incremental' | 'saved';

export type KaiserT2038ClaimAuditRunMeta = {
  id?: string;
  mode: KaiserT2038ClaimAuditRunMode;
  createdAtIso: string;
  createdByEmail: string;
  createdByName: string;
  fetchedAt: string;
  maxClaimPk: string;
  claimCount: number;
  newClaimCount: number;
  memberCount: number;
  claimClientsIndexed: number;
  claimRowsLive: number;
  claimRowsCached: number;
  claimRowsTargeted: number;
  summary: ReturnType<typeof summarizeKaiserT2038ClaimAudit>;
};

export function claimDocIdFromRecord(row: Record<string, unknown>): string {
  const pk = clean(row.PK_ID || row.Record_ID || row.ID || row.Claim_Number);
  if (pk) return pk.replace(/[^\w.-]+/g, '_').slice(0, 700);
  const client = normalizeClientId2Key(row.Client_ID2 || row.client_ID2) || clean(row.Client_ID2);
  const dos = clean(row.Date_of_Service || row.Claim_Date);
  return `row_${client}_${dos}_${clean(row.Client_First)}_${clean(row.Client_Last)}`
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 700);
}

/** Compact Caspio claim fields we keep in Firestore for rebuilds. */
export function compactClaimRecordForStorage(row: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    'PK_ID',
    'Record_ID',
    'ID',
    'Claim_Number',
    'Client_ID2',
    'client_ID2',
    'Client_First',
    'Client_Last',
    'Claim_Status',
    'MCP',
    ...T2038_CLAIM_DOS_FIELDS,
  ] as const;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      out[field] = row[field];
    }
  }
  if (!out.Client_ID2 && row.clientId2) out.Client_ID2 = row.clientId2;
  return out;
}

export function maxClaimPkFromRecords(records: Array<Record<string, unknown>>): string {
  let maxNum = -1;
  let maxStr = '';
  for (const row of records) {
    const pk = clean(row.PK_ID);
    if (!pk) continue;
    if (/^\d+$/.test(pk)) {
      const n = Number(pk);
      if (n > maxNum) maxNum = n;
    } else if (!maxStr || pk > maxStr) {
      maxStr = pk;
    }
  }
  return maxNum >= 0 ? String(maxNum) : maxStr;
}

/** Drop bulky `raw` payloads before writing audit rows to Firestore. */
export function compactAuditRowForStorage(row: KaiserT2038ClaimAuditRow) {
  return {
    ...row,
    submittedClaims: (row.submittedClaims || []).map((claim) => ({
      clientId2: claim.clientId2,
      clientFirst: claim.clientFirst,
      clientLast: claim.clientLast,
      dateOfService: claim.dateOfService,
      dateOfServiceIso: claim.dateOfServiceIso,
      monthKey: claim.monthKey,
    })),
  };
}
