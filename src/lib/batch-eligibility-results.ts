import { format } from 'date-fns';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  buildCsv,
  formatDate,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
} from '@/lib/batch-eligibility';
import { identityTokenLookupKeys } from '@/lib/member-identity';
import {
  coverageDates,
  decode271,
  otherEntities,
  primaryCoverageDate,
  summarizeCoverage,
  type EligibilityOutcome,
  type EligibilityResult,
} from '@/lib/x12-271';

export type EligibilityFlag = 'lost' | 'gained' | 'unmatched' | 'none';

export type EligibilityResultRow = {
  key: string;
  result: EligibilityResult;
  member: BatchEligibilityMember | null;
  flag: EligibilityFlag;
  coverage: string;
  dates: string[];
  /** Single current plan-begin (or empty) for the results table. */
  primaryDate: string;
  entities: string[];
};

export const ELIGIBILITY_OUTCOME_LABELS: Record<EligibilityOutcome, string> = {
  active: 'Active',
  inactive: 'Inactive',
  rejected: 'Rejected / not found',
  unknown: 'Unclear',
};

export const ELIGIBILITY_FLAG_LABELS: Record<Exclude<EligibilityFlag, 'none'>, string> = {
  lost: 'Authorized in Caspio, not active',
  gained: 'Not authorized in Caspio, now active',
  unmatched: 'Not matched to Caspio cache (check plan tab, ID, or DOB)',
};

/** ID keys: leading-zero variants, 12-digit pad, and last 8 digits (Kaiser MRN core). */
const idKeys = (value: string): string[] => {
  const keys = new Set<string>();
  for (const key of identityTokenLookupKeys(value)) {
    const upper = key.toUpperCase();
    if (upper) keys.add(upper);
    if (/^\d+$/.test(upper) && upper.length > 8) keys.add(upper.slice(-8));
  }
  return [...keys];
};
const dobKey = (value: string) => {
  const formatted = formatDate(value, 'YYYYMMDD');
  if (/^\d{8}$/.test(formatted)) return formatted;
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : formatted;
};
const normName = (value: string) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

export const isEligibilityFlagged = (row: EligibilityResultRow) =>
  row.flag === 'lost' || row.flag === 'gained';

const isAuthorized = (member: BatchEligibilityMember | null) =>
  member?.calaimStatus.trim().toLowerCase() === 'authorized';

export function buildEligibilityResultRows(
  results: EligibilityResult[],
  members: BatchEligibilityMember[]
): EligibilityResultRow[] {
  const byId = new Map<string, BatchEligibilityMember>();
  const byClientId = new Map<string, BatchEligibilityMember>();
  const byNameDob = new Map<string, BatchEligibilityMember>();
  const byLastFirstDob = new Map<string, BatchEligibilityMember>();
  const preferMember = (existing: BatchEligibilityMember | undefined, next: BatchEligibilityMember) => {
    if (!existing) return next;
    // Prefer the Caspio row that has RCFE_Name / owner email when IDs collide (e.g. MRN last-8).
    const existingScore = (existing.rcfeName ? 2 : 0) + (existing.rcfeAdminEmail ? 1 : 0);
    const nextScore = (next.rcfeName ? 2 : 0) + (next.rcfeAdminEmail ? 1 : 0);
    return nextScore > existingScore ? next : existing;
  };
  const addId = (raw: string, member: BatchEligibilityMember) => {
    for (const key of idKeys(raw)) {
      if (!key) continue;
      byId.set(key, preferMember(byId.get(key), member));
    }
  };
  for (const m of members) {
    if (m.medicalId) addId(m.medicalId, m);
    if (m.mrn) addId(m.mrn, m);
    if (m.clientId2) {
      const cid = String(m.clientId2).trim();
      byClientId.set(cid, preferMember(byClientId.get(cid), m));
      addId(m.clientId2, m);
    }
    const dob = dobKey(m.birthDate);
    if (dob && /^\d{8}$/.test(dob)) {
      const last = normName(m.lastName);
      const first = normName(m.firstName);
      if (last) byNameDob.set(`${last}|${dob}`, preferMember(byNameDob.get(`${last}|${dob}`), m));
      if (last && first) {
        const key = `${last}|${first}|${dob}`;
        byLastFirstDob.set(key, preferMember(byLastFirstDob.get(key), m));
      }
    }
  }
  const lookupId = (raw: string) => {
    for (const key of idKeys(raw)) {
      const hit = byId.get(key);
      if (hit) return hit;
    }
    return undefined;
  };
  return results.map((result, i) => {
    const last = normName(result.lastName);
    const first = normName(result.firstName);
    const dob = dobKey(result.birthDate);
    const member =
      result.traceNumbers.map((t) => byClientId.get(t.trim()) || lookupId(t)).find(Boolean) ||
      lookupId(result.memberId) ||
      (last && first && /^\d{8}$/.test(dob) ? byLastFirstDob.get(`${last}|${first}|${dob}`) : undefined) ||
      (last && /^\d{8}$/.test(dob) ? byNameDob.get(`${last}|${dob}`) : undefined) ||
      null;
    let flag: EligibilityFlag = 'none';
    if (!member) flag = 'unmatched';
    else if (isAuthorized(member) && result.outcome !== 'active') flag = 'lost';
    else if (!isAuthorized(member) && result.outcome === 'active') flag = 'gained';
    return {
      key: `${i}-${result.memberId}`,
      result,
      member,
      flag,
      coverage: summarizeCoverage(result),
      dates: coverageDates(result),
      primaryDate: primaryCoverageDate(result),
      entities: otherEntities(result),
    };
  });
}

export function countEligibilityRows(rows: EligibilityResultRow[]) {
  const c: Record<EligibilityOutcome, number> = { active: 0, inactive: 0, rejected: 0, unknown: 0 };
  let lost = 0;
  let gained = 0;
  let unmatched = 0;
  for (const row of rows) {
    c[row.result.outcome]++;
    if (row.flag === 'lost') lost++;
    else if (row.flag === 'gained') gained++;
    else if (row.flag === 'unmatched') unmatched++;
  }
  return { ...c, lost, gained, unmatched, flagged: lost + gained };
}

export function reviewBucketLabel(row: EligibilityResultRow) {
  const buckets: string[] = [];
  if (isEligibilityFlagged(row)) buckets.push('Needs review');
  if (row.result.outcome === 'unknown') buckets.push('Unclear');
  if (row.result.outcome === 'rejected') buckets.push('Rejected / not found');
  return buckets.join('; ');
}

export function buildEligibilityRowsCsv(
  rowsToExport: EligibilityResultRow[],
  options?: { includeReviewBucket?: boolean }
) {
  const columns = [
    ...(options?.includeReviewBucket ? ['Review status'] : []),
    'Last name',
    'First name',
    'Health plan',
    'Medi-Cal ID',
    'DOB',
    'Eligibility result',
    'Coverage',
    'Coverage dates',
    'Plans / entities',
    'Messages',
    'Client_ID2',
    'Caspio CalAIM status',
    'RCFE name',
    'RCFE owner email',
    'Needs review detail',
  ];
  const data = rowsToExport.map((row) => [
    ...(options?.includeReviewBucket ? [reviewBucketLabel(row)] : []),
    row.result.lastName,
    row.result.firstName,
    [row.member?.healthPlan, row.member?.region].filter(Boolean).join(' · ') || row.result.payerName || '',
    row.result.memberId,
    row.result.birthDate,
    ELIGIBILITY_OUTCOME_LABELS[row.result.outcome],
    row.coverage,
    row.primaryDate || row.dates.join('; '),
    row.entities.join('; '),
    [...new Set(row.result.benefits.flatMap((b) => b.messages))].join('; '),
    row.member?.clientId2 || '',
    row.member?.calaimStatus || '',
    row.member?.rcfeName || '',
    row.member?.rcfeAdminEmail || '',
    row.flag === 'none' ? '' : ELIGIBILITY_FLAG_LABELS[row.flag],
  ]);
  return buildCsv(columns, data);
}

/** Trigger a browser download of eligibility result rows as CSV. */
export function downloadEligibilityRowsCsv(
  rowsToExport: EligibilityResultRow[],
  plan: BatchEligibilityPlan,
  fileLabel: string,
  options?: { includeReviewBucket?: boolean; createdAtIso?: string }
) {
  const blob = new Blob([buildEligibilityRowsCsv(rowsToExport, options)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const stamp = options?.createdAtIso
    ? format(new Date(options.createdAtIso), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');
  link.download = `${BATCH_ELIGIBILITY_PLAN_LABELS[plan]} ${fileLabel} ${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Decode one or more 271 texts and match them to Caspio members for CSV export. */
export function decodeEligibilityFilesToRows(
  files: Array<{ name: string; text: string }>,
  members: BatchEligibilityMember[]
) {
  const decoded: EligibilityResult[] = [];
  for (const file of files) {
    decoded.push(...decode271(file.text));
  }
  return buildEligibilityResultRows(decoded, members);
}
