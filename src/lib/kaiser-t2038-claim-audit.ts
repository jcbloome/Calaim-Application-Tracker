import {
  classifyT2038Window,
  daysBetween,
  formatUsDate,
  isHealthNetPlan,
  isKaiserPlan,
  parseDateOnly,
  startOfToday,
  T2038_CLAIM_DUE_DAYS,
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
  // Caspio T2038 table uses a zero in "Of" (Date_0f_Service) — keep both spellings.
  'Date_0f_Service',
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

/** Caspio claim-entry placeholders — not a real member Client_ID2; require MRN/CIN to attach. */
export function isPlaceholderClientId2(value: unknown): boolean {
  const key = normalizeClientId2Key(value) || clean(value);
  if (!key) return false;
  return key === '10000' || key === '0' || key === '1';
}

/** True when two normalized MRN/CIN keys differ by at most one character (same length). */
export function mrnKeysNearMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  if (a === b) return true;
  let diffs = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      diffs += 1;
      if (diffs > 1) return false;
    }
  }
  return diffs === 1;
}

function claimNameKey(first: string, last: string): string {
  const f = normalize(first);
  const l = normalize(last);
  if (!f || !l) return '';
  return `${l}|${f}`;
}

function claimMrnKey(raw: Record<string, unknown> | undefined): string {
  if (!raw) return '';
  return normalizeMrnKey(pickFirst(raw.MCP_CIN, raw.Kaiser_MRN, raw.Member_MRN, raw.MRN));
}

function dedupeSubmittedClaims(claims: SubmittedClaimRow[]): SubmittedClaimRow[] {
  const byKey = new Map<string, SubmittedClaimRow>();
  for (const claim of claims) {
    const pk = clean(claim.raw?.PK_ID);
    const key =
      pk ||
      `${claim.clientId2}|${claim.dateOfServiceIso}|${normalize(claim.clientLast)}|${normalize(claim.clientFirst)}|${claim.submitted ? '1' : '0'}`;
    if (!byKey.has(key)) byKey.set(key, claim);
  }
  return Array.from(byKey.values());
}

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

export type NoteMonthEvidence = 'has_notes' | 'no_notes' | 'unknown';

export type ClaimMonthCell = {
  monthKey: string;
  label: string;
  status: MonthStatus;
  claimDates: string[];
  /** DOS on rows entered in Caspio with blank Claim_Status (not yet submitted). */
  unsubmittedDates?: string[];
  justificationReason: string;
  justifiedBy: string;
  justifiedAt: string;
  /** Whether member-notes has an entry dated in this calendar month. */
  noteEvidence?: NoteMonthEvidence;
  noteCount?: number;
  /** ISO timestamp when this claimable month was pushed to CalAIM_Claim_Submit_T2038. */
  caspioPushedAt?: string;
  /** Caspio PK_ID from the insert, when known. */
  caspioClaimPkId?: string;
};

export type SubmittedClaimRow = {
  clientId2: string;
  clientFirst: string;
  clientLast: string;
  dateOfService: string;
  dateOfServiceIso: string;
  monthKey: string;
  /** False when the row exists but Claim_Status is blank (entered, not submitted). */
  submitted?: boolean;
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
  /** Latest claimed Date_of_Service (US format) — used for future monthly claim spacing. */
  lastClaimDate?: string;
  lastClaimDateIso?: string;
  /** Days since lastClaimDate (null when no last claim). */
  daysSinceLastClaim?: number | null;
  /** Earliest date a new claim may be pushed (last DOS + 30 days / 1 month). */
  nextClaimEligibleDate?: string;
  nextClaimMonthKey?: string;
  /**
   * Past gaps/claimables cleared, auth open, and ≥30 days since last DOS —
   * ready for the next ongoing Connections claim push.
   */
  futureClaimDue?: boolean;
  /** Month where gap audit begins (first claim month), when claims exist. */
  gapStartMonthKey: string;
  expectedMonthCount: number;
  claimedMonthCount: number;
  justifiedMonthCount: number;
  /** Months marked claimable (staff or notes evidence). */
  claimableMonthCount?: number;
  /** Gap months with no notes that month → not claimable / no work done. */
  noWorkMonthCount?: number;
  missingMonthCount: number;
  openMissingMonthCount: number;
  claimsComplete: boolean;
  months: ClaimMonthCell[];
  submittedClaims: SubmittedClaimRow[];
  /** Rows entered with blank Claim_Status — not counted as submitted. */
  unsubmittedClaimCount?: number;
  unsubmittedClaimDates?: string[];
};

/** Minimum gap before the next future T2038 claim (1 month ≈ 30 days). */
export const T2038_FUTURE_CLAIM_MIN_DAYS = T2038_CLAIM_DUE_DAYS;

/** T2038 room & board rate used for claim-audit dollar summaries. */
export const T2038_CLAIM_AUDIT_RATE_USD = 432;

export type MonthJustification = {
  clientId2: string;
  monthKey: string;
  /** justified = no claim needed; claimable = forgotten claim queued for Caspio batch. */
  disposition: MonthDisposition;
  reason: string;
  justifiedBy: string;
  justifiedByEmail: string;
  updatedAt: string;
  /** Set after successful Connections Claim Submission insert. */
  caspioPushedAt?: string;
  caspioClaimPkId?: string;
  /** Date_of_Service that was pushed (MM/DD/YYYY). */
  caspioDateOfService?: string;
};

export const DEFAULT_JUSTIFY_REASON = 'No claim — staff review';
export const DEFAULT_CLAIMABLE_REASON = 'Claimable — forgotten claim queued for Caspio batch';
/** Auto when member-notes has no entry in that calendar month. */
export const DEFAULT_NO_WORK_REASON = 'Not claimable — no notes that month';
/** Auto when member-notes has at least one entry in that calendar month. */
export const DEFAULT_NOTES_CLAIMABLE_REASON = 'Claimable — notes entered that month';

export function isNoWorkJustification(reason: unknown): boolean {
  const value = clean(reason);
  return value === DEFAULT_NO_WORK_REASON || /^not claimable/i.test(value);
}

export function isNotesClaimableJustification(reason: unknown): boolean {
  const value = clean(reason);
  return value === DEFAULT_NOTES_CLAIMABLE_REASON || value === DEFAULT_CLAIMABLE_REASON;
}

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

const CLAIM_SUBMIT_DATE_FIELDS = new Set(['Claim_Date', 'ClaimDate']);

/** Date_of_Service and other service-day columns — never Claim_Date (submission date). */
export function isClaimServiceDateField(field: string): boolean {
  if (CLAIM_SUBMIT_DATE_FIELDS.has(field)) return false;
  const nk = field.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (nk.includes('input') || nk.includes('modified') || nk.includes('created')) return false;
  return nk === 'dos' || nk.includes('service');
}

export function collectServiceDatesFromClaimRow(row: Record<string, unknown>): Date[] {
  const collect = (fields: string[]) => {
    const dates: Date[] = [];
    const seen = new Set<number>();
    for (const field of fields) {
      const date = parseClaimServiceDate(row[field]);
      if (!date) continue;
      const key = date.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      dates.push(date);
    }
    return dates;
  };
  const serviceDates = collect(Object.keys(row || {}).filter(isClaimServiceDateField));
  if (serviceDates.length) return serviceDates;
  // Claim_Date is the submission date, not DOS — only a fallback for rows with no service date.
  return collect(Array.from(CLAIM_SUBMIT_DATE_FIELDS));
}

/**
 * Clearinghouse submission gate on CalAIM_Claim_Submit_T2038:
 * - Blank Claim_Status = entered in Caspio only (not sent to clearinghouse) → unsubmitted
 * - Non-blank ("Claim Submitted", "Payment Received", …) → submitted
 *
 * Compact Firestore storage used to omit empty Claim_Status, so a missing key on a stored row
 * means it was blank when saved — treat as not submitted (not as submitted).
 */
export function isClaimRowSubmitted(raw: Record<string, unknown>): boolean {
  if (!raw) return false;
  return clean(raw.Claim_Status) !== '';
}

/** CalAIM_Status values that should surface “no claims during auth” (Authorized or on H2022). */
export function isClaimAuditActiveCalaimStatus(value: unknown): boolean {
  const n = normalize(value);
  return n === 'authorized' || n === 'h2022';
}

export function indexClaimsByClientId2(
  records: Array<Record<string, unknown>> | null | undefined
): Map<string, SubmittedClaimRow[]> {
  const byClient = new Map<string, SubmittedClaimRow[]>();
  for (const raw of Array.isArray(records) ? records : []) {
    const clientId2Raw = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2, raw.ClientId2);
    const clientFirst = pickFirst(raw.Client_First, raw.Senior_First);
    const clientLast = pickFirst(raw.Client_Last, raw.Senior_Last);
    const mrnKey = claimMrnKey(raw);
    const nameKey = claimNameKey(clientFirst, clientLast);
    // Prefer real Client_ID2; otherwise still index under MRN/name so rows are not dropped.
    const clientId2 =
      normalizeClientId2Key(clientId2Raw) ||
      clean(clientId2Raw) ||
      (mrnKey ? `mrn:${mrnKey}` : '') ||
      (nameKey ? `name:${nameKey}` : '');
    if (!clientId2) continue;
    const dates = collectServiceDatesFromClaimRow(raw);
    const submitted = isClaimRowSubmitted(raw);
    const pushForKey = (mapKey: string) => {
      const list = byClient.get(mapKey) || [];
      if (dates.length === 0) {
        // Still record that a claim row exists for this member (avoids false "no claims yet").
        list.push({
          clientId2: normalizeClientId2Key(clientId2Raw) || clean(clientId2Raw) || mapKey,
          clientFirst,
          clientLast,
          dateOfService: '',
          dateOfServiceIso: '',
          monthKey: '',
          submitted,
          raw,
        });
      } else {
        for (const date of dates) {
          list.push({
            clientId2: normalizeClientId2Key(clientId2Raw) || clean(clientId2Raw) || mapKey,
            clientFirst,
            clientLast,
            dateOfService: formatUsDate(date),
            dateOfServiceIso: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            monthKey: monthKeyFromDate(date),
            submitted,
            raw,
          });
        }
      }
      byClient.set(mapKey, list);
    };
    pushForKey(clientId2);
    // Dual-index by name so Client_ID2 / CIN typos still attach (Mooney / Alderette).
    if (nameKey && !clientId2.startsWith('name:')) pushForKey(`name:${nameKey}`);
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
  if (isClaimAuditActiveCalaimStatus(n)) return true;
  if (n.includes('authorization ended')) return true;
  if (n === 'authorized on hold') return true;
  return false;
}

/** True when claim DOS is on/after auth start and on/before auth end (missing bounds = open). */
function claimDosInAuthPeriod(
  claim: SubmittedClaimRow,
  authStart: Date | null,
  authEnd: Date | null
): boolean {
  if (!authStart && !authEnd) return true;
  const dos = parseClaimServiceDate(claim.dateOfServiceIso || claim.dateOfService);
  if (!dos) return true;
  if (authStart && dos.getTime() < authStart.getTime()) return false;
  if (authEnd && dos.getTime() > authEnd.getTime()) return false;
  return true;
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
 * - Unsubmitted = Claim_Status blank (Caspio only, not sent to clearinghouse).
 * - No claims yet = zero clearinghouse-submitted claim rows on the member (any DOS) for
 *   CalAIM_Status Authorized / H2022 (or T2038 auth on file). Prior-auth claims still count —
 *   do not require DOS inside the current auth dates (new/future auth would false-flag billers).
 * - Gap months: from the first submitted claim on/after auth start (else first claim) through
 *   auth end / today. If the member has history but the new auth has not started yet, show no
 *   gap grid (not "no claims yet").
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
  const claimsByMrn = new Map<string, SubmittedClaimRow[]>();
  const claimsByName = new Map<string, SubmittedClaimRow[]>();
  for (const list of opts.claimsByClient.values()) {
    for (const claim of list) {
      const mrnKey = claimMrnKey(claim.raw);
      if (mrnKey) {
        const bucket = claimsByMrn.get(mrnKey) || [];
        bucket.push(claim);
        claimsByMrn.set(mrnKey, bucket);
      }
      const nameKey = claimNameKey(claim.clientFirst, claim.clientLast);
      if (nameKey) {
        const bucket = claimsByName.get(nameKey) || [];
        bucket.push(claim);
        claimsByName.set(nameKey, bucket);
      }
    }
  }

  const nearMrnClaims = (memberKeys: Set<string>): SubmittedClaimRow[] => {
    const out: SubmittedClaimRow[] = [];
    const seenClaim = new Set<SubmittedClaimRow>();
    for (const memberKey of memberKeys) {
      for (const [claimKey, list] of claimsByMrn.entries()) {
        if (!mrnKeysNearMatch(memberKey, claimKey)) continue;
        for (const claim of list) {
          if (seenClaim.has(claim)) continue;
          seenClaim.add(claim);
          out.push(claim);
        }
      }
    }
    return out;
  };

  opts.rawMembers.forEach((raw, index) => {
    const base = mapKaiserMemberForClaimAudit(raw || {}, index, today);
    if (!base) return;
    // New members may not have a Client_ID2 yet — keep them (dedupe on MRN / name instead).
    const key = base.clientId2
      ? normalize(base.clientId2)
      : `noid:${normalizeMrnKey(base.mrn) || normalize(base.memberName)}`;
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
    const byClientId = clientKey
      ? opts.claimsByClient.get(clientKey) || opts.claimsByClient.get(base.clientId2) || []
      : [];
    // Claim rows sometimes carry a placeholder Client_ID2 (e.g. 10000); MCP_CIN/MRN is the reliable link.
    // For a real Client_ID2, trust the ID even when member MRN and claim MCP_CIN disagree by a digit
    // (Alderette 8957 / Mooney 9418 — member MRN off by one from claim MCP_CIN).
    const memberMrnKeys = new Set(
      [base.mrn, raw?.MCP_CIN, raw?.Kaiser_MRN, raw?.Member_MRN, raw?.MRN]
        .map(normalizeMrnKey)
        .filter(Boolean)
    );
    const memberNameKey = claimNameKey(base.memberFirstName, base.memberLastName);
    const fromMrnExact = Array.from(memberMrnKeys).flatMap((k) => claimsByMrn.get(k) || []);
    const fromMrnNear = fromMrnExact.length ? [] : nearMrnClaims(memberMrnKeys);
    const fromName = memberNameKey ? claimsByName.get(memberNameKey) || [] : [];
    const fromClientId = isPlaceholderClientId2(clientKey)
      ? byClientId.filter((claim) => {
          const claimKey = claimMrnKey(claim.raw);
          return (
            !claimKey ||
            memberMrnKeys.has(claimKey) ||
            Array.from(memberMrnKeys).some((k) => mrnKeysNearMatch(k, claimKey))
          );
        })
      : byClientId;
    const matchedClaims = dedupeSubmittedClaims([
      ...fromClientId,
      ...fromMrnExact,
      ...fromMrnNear,
      ...fromName,
    ]);
    // Submitted = non-blank Claim_Status (sent / paid). Unsubmitted = blank (Caspio only).
    // Any DOS counts for "has this member ever been billed" / noClaimsYet (Buchanan pattern:
    // new Dec auth must not hide Jan–Nov Payment Received rows).
    const submittedClaims = matchedClaims.filter((claim) => claim.submitted !== false);
    const unsubmittedClaims = matchedClaims.filter((claim) => claim.submitted === false);
    const unsubmittedByMonth = new Map<string, string[]>();
    for (const claim of unsubmittedClaims) {
      if (!claim.monthKey || !claim.dateOfService) continue;
      const list = unsubmittedByMonth.get(claim.monthKey) || [];
      if (!list.includes(claim.dateOfService)) list.push(claim.dateOfService);
      unsubmittedByMonth.set(claim.monthKey, list);
    }
    const datedClaimsAll = submittedClaims
      .filter((claim) => Boolean(claim.monthKey && claim.dateOfService))
      .sort((a, b) => String(a.dateOfServiceIso).localeCompare(String(b.dateOfServiceIso)));
    // Gap grid prefers claims on/after current auth start; fall back to full history for first-claim label.
    const datedClaimsInAuth = datedClaimsAll.filter((claim) =>
      claimDosInAuthPeriod(claim, authStart, null)
    );
    const datedClaims = datedClaimsInAuth.length ? datedClaimsInAuth : [];
    const claimsByMonth = new Map<string, string[]>();
    for (const claim of datedClaimsAll) {
      const list = claimsByMonth.get(claim.monthKey) || [];
      if (claim.dateOfService && !list.includes(claim.dateOfService)) list.push(claim.dateOfService);
      claimsByMonth.set(claim.monthKey, list);
    }

    const firstClaimEver = datedClaimsAll[0] || null;
    const firstClaimInAuth = datedClaims[0] || null;
    const firstClaimDate = firstClaimEver?.dateOfService || '';
    const firstClaimMonthKey = firstClaimEver?.monthKey || '';
    // Latest claimed DOS (submitted). Also consider unsubmitted entered rows so a just-pushed
    // Connections claim (blank Claim_Status) still spaces the next future claim.
    const lastSubmitted = datedClaimsAll.length ? datedClaimsAll[datedClaimsAll.length - 1] : null;
    let lastClaimDateObj =
      parseClaimServiceDate(lastSubmitted?.dateOfServiceIso || lastSubmitted?.dateOfService) || null;
    for (const claim of unsubmittedClaims) {
      const d = parseClaimServiceDate(claim.dateOfServiceIso || claim.dateOfService);
      if (d && (!lastClaimDateObj || d.getTime() > lastClaimDateObj.getTime())) lastClaimDateObj = d;
    }
    const lastClaimDate = lastClaimDateObj ? formatUsDate(lastClaimDateObj) : '';
    const lastClaimDateIso = lastClaimDateObj
      ? `${lastClaimDateObj.getFullYear()}${String(lastClaimDateObj.getMonth() + 1).padStart(2, '0')}${String(
          lastClaimDateObj.getDate()
        ).padStart(2, '0')}`
      : '';
    const daysSinceLastClaim = lastClaimDateObj ? daysBetween(lastClaimDateObj, today) : null;
    const nextEligibleObj = lastClaimDateObj
      ? new Date(
          lastClaimDateObj.getFullYear(),
          lastClaimDateObj.getMonth(),
          lastClaimDateObj.getDate() + T2038_FUTURE_CLAIM_MIN_DAYS
        )
      : null;
    const nextClaimEligibleDate = nextEligibleObj ? formatUsDate(nextEligibleObj) : '';
    // "No claims yet": zero clearinghouse-submitted rows on the member (any DOS).
    // Blank Claim_Status does not clear this — counted in unsubmittedClaimCount instead.
    const noClaimsYet =
      submittedClaims.length === 0 &&
      Boolean(
        authStart ||
          authEnd ||
          base.authorizationNumber ||
          isClaimAuditActiveCalaimStatus(base.calaimStatus)
      );

    let expectedMonths: string[] = [];
    let gapStartMonthKey = '';
    const authNotStarted = Boolean(authStart && authStart.getTime() > today.getTime());
    if (firstClaimInAuth) {
      const firstClaimDateObj = parseClaimServiceDate(
        firstClaimInAuth.dateOfServiceIso || firstClaimInAuth.dateOfService
      );
      const gapStart = firstClaimDateObj || authStart;
      if (gapStart) {
        expectedMonths = filterActionableClaimAuditMonths(
          listMonthKeysInclusive(gapStart, rangeEnd),
          today
        );
        gapStartMonthKey = expectedMonths[0] || '';
      }
    } else if (submittedClaims.length > 0 && authNotStarted) {
      // Billed before; new auth has not started — do not invent gaps or "no claims yet".
      expectedMonths = [];
    } else if (submittedClaims.length > 0 && authStart) {
      // History exists but only before this auth start, and auth has started — audit from auth start.
      expectedMonths = filterActionableClaimAuditMonths(
        listMonthKeysInclusive(authStart, rangeEnd),
        today
      );
      gapStartMonthKey = expectedMonths[0] || '';
    } else if (!noClaimsYet && authStart && !authNotStarted) {
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
      else if (
        justification?.disposition === 'claimable' ||
        justification?.reason === DEFAULT_CLAIMABLE_REASON ||
        isNotesClaimableJustification(justification?.reason)
      ) {
        status = 'claimable';
      } else if (justification?.disposition === 'justified' || justification?.reason) {
        status = 'justified';
      }
      return {
        monthKey,
        label: formatMonthLabel(monthKey),
        status,
        claimDates,
        unsubmittedDates: unsubmittedByMonth.get(monthKey) || [],
        justificationReason: justification?.reason || '',
        justifiedBy: justification?.justifiedBy || '',
        justifiedAt: justification?.updatedAt || '',
        noteEvidence: 'unknown' as NoteMonthEvidence,
        noteCount: 0,
        caspioPushedAt: justification?.caspioPushedAt || '',
        caspioClaimPkId: justification?.caspioClaimPkId || '',
      };
    });

    const counts = monthCountsFromCells(months, noClaimsYet);
    // Next service month for ongoing claims: not earlier than last DOS + 30 days, and not a month already claimed.
    let nextClaimMonthKey = '';
    if (nextEligibleObj) {
      const anchor = nextEligibleObj.getTime() > today.getTime() ? nextEligibleObj : today;
      let candidate = monthKeyFromDate(anchor);
      // Skip months that already have a claimed DOS.
      for (let i = 0; i < 24; i += 1) {
        if (!claimsByMonth.has(candidate)) {
          nextClaimMonthKey = candidate;
          break;
        }
        const [y, m] = candidate.split('-').map(Number);
        candidate = monthKeyFromDate(new Date(y, m, 1)); // next calendar month
      }
    }
    const pastBacklogClear =
      !noClaimsYet &&
      counts.openMissingMonthCount === 0 &&
      Number(counts.claimableMonthCount || 0) === 0;
    const authStillOpen =
      base.window === 'in_window' || base.window === 'ending_soon' || (!base.authEnded && Boolean(authStart));
    const futureClaimDue = Boolean(
      pastBacklogClear &&
        authStillOpen &&
        lastClaimDateObj &&
        daysSinceLastClaim != null &&
        daysSinceLastClaim >= T2038_FUTURE_CLAIM_MIN_DAYS &&
        nextClaimMonthKey
    );

    rows.push({
      ...base,
      noClaimsYet,
      firstClaimDate,
      firstClaimMonthKey,
      lastClaimDate,
      lastClaimDateIso,
      daysSinceLastClaim,
      nextClaimEligibleDate,
      nextClaimMonthKey,
      futureClaimDue,
      gapStartMonthKey,
      expectedMonthCount: months.length,
      ...counts,
      months,
      submittedClaims,
      unsubmittedClaimCount: unsubmittedClaims.length,
      unsubmittedClaimDates: unsubmittedClaims
        .map((claim) => claim.dateOfService)
        .filter((value, i, all) => Boolean(value) && all.indexOf(value) === i),
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

function monthCountsFromCells(months: ClaimMonthCell[], noClaimsYet: boolean) {
  const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
  const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
  const claimableMonthCount = months.filter((m) => m.status === 'claimable').length;
  const noWorkMonthCount = months.filter(
    (m) => m.status === 'justified' && (isNoWorkJustification(m.justificationReason) || m.noteEvidence === 'no_notes')
  ).length;
  const openMissingFromGrid = months.filter((m) => m.status === 'missing').length;
  const resolvedCount = months.filter(
    (m) => m.status === 'justified' || m.status === 'claimable'
  ).length;
  const openMissingMonthCount = noClaimsYet ? 1 : openMissingFromGrid;
  const missingMonthCount = noClaimsYet ? 1 : openMissingFromGrid + resolvedCount;
  return {
    claimedMonthCount,
    justifiedMonthCount,
    claimableMonthCount,
    noWorkMonthCount,
    missingMonthCount,
    openMissingMonthCount,
    claimsComplete: !noClaimsYet && months.length > 0 && openMissingFromGrid === 0,
  };
}

export function summarizeKaiserT2038ClaimAudit(rows: KaiserT2038ClaimAuditRow[]) {
  const h2022Rows = rows.filter((r) => normalize(r.calaimStatus) === 'h2022');
  const h2022UnsubmittedClaims = h2022Rows.reduce(
    (sum, r) => sum + Number(r.unsubmittedClaimCount || 0),
    0
  );
  const claimableMonths = rows.reduce((sum, r) => sum + Number(r.claimableMonthCount || 0), 0);
  const noWorkMonths = rows.reduce((sum, r) => sum + Number(r.noWorkMonthCount || 0), 0);
  return {
    total: rows.length,
    openAuth: rows.filter((r) => r.window === 'in_window' || r.window === 'ending_soon').length,
    authEnded: rows.filter((r) => r.authEnded).length,
    missingDates: rows.filter((r) => r.window === 'missing_dates').length,
    noClaimsYet: rows.filter((r) => r.noClaimsYet).length,
    incomplete: rows.filter(
      (r) => r.openMissingMonthCount > 0 || r.noClaimsYet || Number(r.claimableMonthCount || 0) > 0
    ).length,
    complete: rows.filter((r) => r.claimsComplete && Number(r.claimableMonthCount || 0) === 0).length,
    openMissingMonths: rows.reduce(
      (sum, r) => sum + (r.noClaimsYet ? 0 : r.openMissingMonthCount),
      0
    ),
    claimableMonths,
    noWorkMonths,
    h2022UnsubmittedClaims,
    h2022MemberCount: h2022Rows.length,
    claimableAmountUsd: claimableMonths * T2038_CLAIM_AUDIT_RATE_USD,
    noWorkAmountUsd: noWorkMonths * T2038_CLAIM_AUDIT_RATE_USD,
    h2022UnsubmittedAmountUsd: h2022UnsubmittedClaims * T2038_CLAIM_AUDIT_RATE_USD,
    rateUsd: T2038_CLAIM_AUDIT_RATE_USD,
  };
}

/**
 * For open (missing) months, use member-notes dates:
 * - notes in that month → claimable
 * - no notes → not claimable (no work done)
 * Staff-saved dispositions are left alone.
 */
export function applyMemberNoteEvidenceToAuditRows(
  rows: KaiserT2038ClaimAuditRow[],
  noteMonthsByClient: Map<string, Set<string>>,
  noteCountsByClient?: Map<string, Map<string, number>>
): KaiserT2038ClaimAuditRow[] {
  return rows.map((row) => {
    if (row.noClaimsYet || !row.months?.length) return row;
    const clientKey = clean(row.clientId2);
    const noteMonths = noteMonthsByClient.get(clientKey) || new Set<string>();
    const countsForClient = noteCountsByClient?.get(clientKey);
    const months = row.months.map((month) => {
      const noteCount = countsForClient?.get(month.monthKey) || (noteMonths.has(month.monthKey) ? 1 : 0);
      const noteEvidence: NoteMonthEvidence = noteMonths.has(month.monthKey) ? 'has_notes' : 'no_notes';
      if (month.status === 'claimed') {
        return { ...month, noteEvidence, noteCount };
      }
      // Already pushed to Caspio — never reclassify away from claimable.
      if (clean(month.caspioPushedAt)) {
        return {
          ...month,
          status: 'claimable' as const,
          noteEvidence,
          noteCount,
        };
      }
      const hasStaffDisposition = Boolean(clean(month.justifiedBy));
      const wasAutoFromNotes =
        !hasStaffDisposition &&
        (month.status === 'missing' ||
          isNoWorkJustification(month.justificationReason) ||
          month.justificationReason === DEFAULT_NOTES_CLAIMABLE_REASON);
      if (!wasAutoFromNotes) {
        // Staff (or prior manual) disposition wins — only attach note evidence.
        return { ...month, noteEvidence, noteCount };
      }
      if (noteEvidence === 'has_notes') {
        return {
          ...month,
          status: 'claimable' as const,
          justificationReason: DEFAULT_NOTES_CLAIMABLE_REASON,
          justifiedBy: '',
          justifiedAt: '',
          noteEvidence,
          noteCount,
        };
      }
      return {
        ...month,
        status: 'justified' as const,
        justificationReason: DEFAULT_NO_WORK_REASON,
        justifiedBy: '',
        justifiedAt: '',
        noteEvidence,
        noteCount,
      };
    });
    const counts = monthCountsFromCells(months, false);
    return {
      ...row,
      months,
      expectedMonthCount: months.length,
      ...counts,
    };
  });
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
    const counts = monthCountsFromCells(months, false);
    return {
      ...row,
      months,
      gapStartMonthKey: months[0]?.monthKey || row.gapStartMonthKey,
      expectedMonthCount: months.length,
      ...counts,
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

export type KaiserT2038ClaimAuditRunMode = 'full' | 'incremental' | 'saved' | 'refresh_member';

export type KaiserT2038ClaimAuditRunMeta = {
  id?: string;
  mode: KaiserT2038ClaimAuditRunMode;
  createdAtIso: string;
  createdByEmail: string;
  createdByName: string;
  fetchedAt: string;
  /** When this run was last written to Firestore. */
  firestoreStoredAt?: string;
  /** Last time claims/members were pulled live from Caspio (global or per-member). */
  lastCaspioRefreshAt?: string;
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

/** MRN / CIN compare key: alphanumerics only, leading zeros dropped. */
export function normalizeMrnKey(value: unknown): string {
  return clean(value)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^0+(?=\d)/, '');
}

/**
 * Kaiser MRNs are typically long numeric IDs that start with 0 or 1 (often zero-padded to 12).
 * Used to spot members whose CalAIM_MCO is not Kaiser but who still carry a Kaiser-looking MRN.
 */
export function looksLikeKaiserMrn(value: unknown): boolean {
  const raw = clean(value);
  if (!raw) return false;
  if (!/^[01]/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return false;
  const compact = raw.replace(/[\s-]/g, '');
  // Mostly numeric (allow rare trailing letter noise)
  return digits.length >= Math.ceil(compact.length * 0.85);
}

export type KaiserMrnNonKaiserMcoRow = {
  id: string;
  clientId2: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  calaimMco: string;
  calaimStatus: string;
  mrn: string;
  mrnField: string;
  kaiserMrn: string;
  memberMrn: string;
  mcpCin: string;
};

/** Skip inactive / closed members on the Kaiser-MRN × non-Kaiser-MCO scan. */
export function isIgnoredCalaimStatusForMrnMcoMismatch(value: unknown): boolean {
  const n = normalize(value);
  if (!n) return false;
  if (n === 'closed') return true;
  if (n === 'member died' || n === 'memberdied') return true;
  if (n === 'non active' || n === 'nonactive' || n === 'inactive') return true;
  return false;
}

/**
 * Members with a Kaiser-looking MRN (or populated Kaiser_MRN) whose CalAIM_MCO does not say Kaiser.
 * Excludes:
 * - CalAIM_Status Closed / Member Died / Non_Active
 * - CalAIM_MCO Health Net (zero-padded Medi-Cal CINs are normal there — not a Kaiser MRN mismatch)
 * Does not treat MCP_CIN alone as a Kaiser MRN (Medi-Cal numbers often start with 0).
 */
export function findKaiserMrnNonKaiserMcoMembers(
  rawMembers: Array<Record<string, unknown>> | null | undefined
): KaiserMrnNonKaiserMcoRow[] {
  const out: KaiserMrnNonKaiserMcoRow[] = [];
  const seen = new Set<string>();

  for (const raw of Array.isArray(rawMembers) ? rawMembers : []) {
    const calaimStatus = pickFirst(raw.CalAIM_Status, raw.memberStatus, raw.calaimStatus);
    if (isIgnoredCalaimStatusForMrnMcoMismatch(calaimStatus)) continue;

    const calaimMco = pickFirst(raw.CalAIM_MCO, raw.memberHealthPlan, raw.MCP, raw.Plan);
    if (isKaiserPlan(calaimMco)) continue;
    // Health Net members routinely have zero-padded MCP_CIN — not a Kaiser MRN on wrong MCO.
    if (isHealthNetPlan(calaimMco)) continue;

    const kaiserMrn = pickFirst(raw.Kaiser_MRN);
    const memberMrn = pickFirst(raw.Member_MRN, raw.MRN, raw.memberMrn);
    const mcpCin = pickFirst(raw.MCP_CIN, raw.MediCal_Number);
    // Only Kaiser_MRN / Member_MRN / MRN — never MCP_CIN (Medi-Cal for every plan).
    const candidates: Array<{ field: string; value: string }> = [
      { field: 'Kaiser_MRN', value: kaiserMrn },
      { field: 'Member_MRN', value: pickFirst(raw.Member_MRN) },
      { field: 'MRN', value: pickFirst(raw.MRN, raw.memberMrn) },
    ].filter((c) => Boolean(c.value));

    // Strong signal: Kaiser_MRN populated on a non-Kaiser MCO row.
    const match =
      candidates.find((c) => c.field === 'Kaiser_MRN' && Boolean(c.value)) ||
      candidates.find((c) => looksLikeKaiserMrn(c.value));
    if (!match) continue;

    const clientId2 =
      normalizeClientId2Key(pickFirst(raw.client_ID2, raw.Client_ID2, raw.clientId2)) ||
      clean(pickFirst(raw.client_ID2, raw.Client_ID2, raw.clientId2));
    const memberFirstName = pickFirst(raw.Senior_First, raw.memberFirstName);
    const memberLastName = pickFirst(raw.Senior_Last, raw.memberLastName);
    const memberName =
      [memberLastName, memberFirstName].filter(Boolean).join(', ') ||
      clientId2 ||
      match.value;
    const dedupe = `${clientId2}|${normalizeMrnKey(match.value)}|${normalize(calaimMco)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({
      id: pickFirst(clientId2, normalizeMrnKey(match.value), memberName) || `mco-${out.length}`,
      clientId2,
      memberName,
      memberFirstName,
      memberLastName,
      calaimMco: calaimMco || '(blank)',
      calaimStatus,
      mrn: match.value,
      mrnField: match.field,
      kaiserMrn,
      memberMrn,
      mcpCin,
    });
  }

  out.sort((a, b) => {
    const nameCmp = a.memberName.localeCompare(b.memberName, undefined, { sensitivity: 'base' });
    if (nameCmp) return nameCmp;
    return a.clientId2.localeCompare(b.clientId2);
  });
  return out;
}

/**
 * Bump when stored claim records need a full Caspio re-pull.
 * 2 = all service-date columns kept · 3 = blank Claim_Status stored explicitly.
 */
export const KAISER_T2038_CLAIM_STORAGE_SCHEMA = 3;

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
    'MCP_CIN',
    'Kaiser_MRN',
    'Member_MRN',
    'MRN',
    ...T2038_CLAIM_DOS_FIELDS,
  ] as const;
  const out: Record<string, unknown> = {};
  const keep = new Set<string>([...fields, ...Object.keys(row || {}).filter(isClaimServiceDateField)]);
  for (const field of keep) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      out[field] = row[field];
    }
  }
  if (!out.Client_ID2 && row.clientId2) out.Client_ID2 = row.clientId2;
  // Keep blank Claim_Status explicitly — blank means entered, not submitted.
  if (out.Claim_Status === undefined) out.Claim_Status = clean(row.Claim_Status);
  out._claimSchema = KAISER_T2038_CLAIM_STORAGE_SCHEMA;
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

/**
 * Fill last-DOS / future-claim-due fields on older saved audit rows that predate those properties.
 */
export function enrichKaiserT2038FutureClaimFields(
  row: KaiserT2038ClaimAuditRow,
  today = startOfToday()
): KaiserT2038ClaimAuditRow {
  if (row.lastClaimDate !== undefined && row.futureClaimDue !== undefined) return row;

  let lastClaimDateObj: Date | null = null;
  for (const claim of row.submittedClaims || []) {
    const d = parseClaimServiceDate(claim.dateOfServiceIso || claim.dateOfService);
    if (d && (!lastClaimDateObj || d.getTime() > lastClaimDateObj.getTime())) lastClaimDateObj = d;
  }
  for (const dos of row.unsubmittedClaimDates || []) {
    const d = parseClaimServiceDate(dos);
    if (d && (!lastClaimDateObj || d.getTime() > lastClaimDateObj.getTime())) lastClaimDateObj = d;
  }

  const lastClaimDate = lastClaimDateObj ? formatUsDate(lastClaimDateObj) : '';
  const lastClaimDateIso = lastClaimDateObj
    ? `${lastClaimDateObj.getFullYear()}${String(lastClaimDateObj.getMonth() + 1).padStart(2, '0')}${String(
        lastClaimDateObj.getDate()
      ).padStart(2, '0')}`
    : '';
  const daysSinceLastClaim = lastClaimDateObj ? daysBetween(lastClaimDateObj, today) : null;
  const nextEligibleObj = lastClaimDateObj
    ? new Date(
        lastClaimDateObj.getFullYear(),
        lastClaimDateObj.getMonth(),
        lastClaimDateObj.getDate() + T2038_FUTURE_CLAIM_MIN_DAYS
      )
    : null;
  const nextClaimEligibleDate = nextEligibleObj ? formatUsDate(nextEligibleObj) : '';

  const claimedMonths = new Set(
    (row.months || []).filter((m) => m.status === 'claimed').map((m) => m.monthKey)
  );
  for (const claim of row.submittedClaims || []) {
    if (claim.monthKey) claimedMonths.add(claim.monthKey);
  }

  let nextClaimMonthKey = '';
  if (nextEligibleObj) {
    const anchor = nextEligibleObj.getTime() > today.getTime() ? nextEligibleObj : today;
    let candidate = monthKeyFromDate(anchor);
    for (let i = 0; i < 24; i += 1) {
      if (!claimedMonths.has(candidate)) {
        nextClaimMonthKey = candidate;
        break;
      }
      const [y, m] = candidate.split('-').map(Number);
      candidate = monthKeyFromDate(new Date(y, m, 1));
    }
  }

  const pastBacklogClear =
    !row.noClaimsYet &&
    row.openMissingMonthCount === 0 &&
    Number(row.claimableMonthCount || 0) === 0;
  const authStillOpen =
    row.window === 'in_window' || row.window === 'ending_soon' || (!row.authEnded && Boolean(row.authorizationStart));
  const futureClaimDue = Boolean(
    pastBacklogClear &&
      authStillOpen &&
      lastClaimDateObj &&
      daysSinceLastClaim != null &&
      daysSinceLastClaim >= T2038_FUTURE_CLAIM_MIN_DAYS &&
      nextClaimMonthKey
  );

  return {
    ...row,
    lastClaimDate: row.lastClaimDate || lastClaimDate,
    lastClaimDateIso: row.lastClaimDateIso || lastClaimDateIso,
    daysSinceLastClaim: row.daysSinceLastClaim ?? daysSinceLastClaim,
    nextClaimEligibleDate: row.nextClaimEligibleDate || nextClaimEligibleDate,
    nextClaimMonthKey: row.nextClaimMonthKey || nextClaimMonthKey,
    futureClaimDue: row.futureClaimDue ?? futureClaimDue,
  };
}
