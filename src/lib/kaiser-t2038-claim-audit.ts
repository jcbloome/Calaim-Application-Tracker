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

/** Service-date fields on CalAIM_Claim_Submit_T2038 (includes Date_of_Service). */
export const T2038_CLAIM_DOS_FIELDS = [
  'Date_of_Service',
  'Days_of_Service_Last1',
  'Days_of_Service_Last2',
  'Days_of_Service_Last3',
  'Days_of_Service_Last4',
  'Days_of_Service_First1',
  'Days_of_Service_First2',
  'Days_of_Service_First3',
  'Days_of_Service_First4',
] as const;

export type MonthStatus = 'claimed' | 'missing' | 'justified';

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
  reason: string;
  justifiedBy: string;
  justifiedByEmail: string;
  updatedAt: string;
};

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

export function collectServiceDatesFromClaimRow(row: Record<string, unknown>): Date[] {
  const dates: Date[] = [];
  const seen = new Set<number>();
  for (const field of T2038_CLAIM_DOS_FIELDS) {
    const date = parseDateOnly(row[field]);
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
    const clientId2 = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2);
    if (!clientId2) continue;
    const clientFirst = pickFirst(raw.Client_First, raw.Senior_First);
    const clientLast = pickFirst(raw.Client_Last, raw.Senior_Last);
    const dates = collectServiceDatesFromClaimRow(raw);
    if (dates.length === 0) continue;
    const list = byClient.get(clientId2) || [];
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
    byClient.set(clientId2, list);
  }
  for (const [clientId2, list] of byClient.entries()) {
    list.sort((a, b) => a.dateOfServiceIso.localeCompare(b.dateOfServiceIso));
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
  const clientId2 = pickFirst(rawMember.client_ID2, rawMember.Client_ID2, rawMember.clientId2);
  const classified = classifyT2038Window(start, end, 30, today);

  return {
    id: pickFirst(clientId2, `${memberLastName}-${memberFirstName}-${index}`) || `row-${index}`,
    clientId2,
    memberFirstName,
    memberLastName,
    memberName: [memberLastName, memberFirstName].filter(Boolean).join(', ') || clientId2 || `Member ${index}`,
    calaimStatus: calaimStatus || (hasAuthDates ? 'Has T2038 dates' : ''),
    kaiserStatus: pickFirst(rawMember.Kaiser_Status, rawMember.Kaiser_ID_Status),
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

    const start = parseDateOnly(base.authorizationStartIso || base.authorizationStart);
    const end = parseDateOnly(base.authorizationEndIso || base.authorizationEnd);
    const rangeEnd =
      end && end.getTime() < today.getTime()
        ? end
        : end && end.getTime() >= today.getTime()
          ? today
          : today;
    const expectedMonths = start ? listMonthKeysInclusive(start, rangeEnd) : [];

    const submittedClaims = opts.claimsByClient.get(base.clientId2) || [];
    const claimsByMonth = new Map<string, string[]>();
    for (const claim of submittedClaims) {
      const list = claimsByMonth.get(claim.monthKey) || [];
      if (!list.includes(claim.dateOfService)) list.push(claim.dateOfService);
      claimsByMonth.set(claim.monthKey, list);
    }

    const months: ClaimMonthCell[] = expectedMonths.map((monthKey) => {
      const claimDates = claimsByMonth.get(monthKey) || [];
      const justification = opts.justificationsByKey.get(`${base.clientId2}__${monthKey}`);
      let status: MonthStatus = 'missing';
      if (claimDates.length > 0) status = 'claimed';
      else if (justification?.reason) status = 'justified';
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

    const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
    const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
    const openMissingMonthCount = months.filter((m) => m.status === 'missing').length;
    const missingMonthCount = openMissingMonthCount + justifiedMonthCount;

    rows.push({
      ...base,
      expectedMonthCount: months.length,
      claimedMonthCount,
      justifiedMonthCount,
      missingMonthCount,
      openMissingMonthCount,
      claimsComplete: months.length > 0 && openMissingMonthCount === 0,
      months,
      submittedClaims,
    });
  });

  rows.sort((a, b) => {
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
    incomplete: rows.filter((r) => r.openMissingMonthCount > 0).length,
    complete: rows.filter((r) => r.claimsComplete).length,
    openMissingMonths: rows.reduce((sum, r) => sum + r.openMissingMonthCount, 0),
  };
}

export function justificationDocId(clientId2: string, monthKey: string) {
  return `${clean(clientId2)}__${clean(monthKey)}`.replace(/[^\w.-]+/g, '_');
}
