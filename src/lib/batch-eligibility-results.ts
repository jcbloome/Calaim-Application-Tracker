import { format } from 'date-fns';
import {
  BATCH_ELIGIBILITY_PLAN_LABELS,
  buildCsv,
  formatDate,
  type BatchEligibilityMember,
  type BatchEligibilityPlan,
} from '@/lib/batch-eligibility';
import {
  coverageDates,
  decode271,
  otherEntities,
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
  unmatched: 'Not matched to one of our members',
};

const normId = (value: string) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
const dobKey = (value: string) => formatDate(value, 'YYYYMMDD');

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
  for (const m of members) {
    if (m.medicalId) byId.set(normId(m.medicalId), m);
    if (m.mrn && !byId.has(normId(m.mrn))) byId.set(normId(m.mrn), m);
    if (m.clientId2) byClientId.set(String(m.clientId2).trim(), m);
    byNameDob.set(`${m.lastName.trim().toUpperCase()}|${dobKey(m.birthDate)}`, m);
  }
  return results.map((result, i) => {
    const member =
      result.traceNumbers.map((t) => byClientId.get(t.trim())).find(Boolean) ||
      byId.get(normId(result.memberId)) ||
      (result.birthDate ? byNameDob.get(`${result.lastName.trim().toUpperCase()}|${dobKey(result.birthDate)}`) : undefined) ||
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
    'Medi-Cal ID',
    'DOB',
    'Eligibility result',
    'Coverage',
    'Coverage dates',
    'Plans / entities',
    'Messages',
    'Client_ID2',
    'Caspio CalAIM status',
    'Needs review detail',
  ];
  const data = rowsToExport.map((row) => [
    ...(options?.includeReviewBucket ? [reviewBucketLabel(row)] : []),
    row.result.lastName,
    row.result.firstName,
    row.result.memberId,
    row.result.birthDate,
    ELIGIBILITY_OUTCOME_LABELS[row.result.outcome],
    row.coverage,
    row.dates.join('; '),
    row.entities.join('; '),
    [...new Set(row.result.benefits.flatMap((b) => b.messages))].join('; '),
    row.member?.clientId2 || '',
    row.member?.calaimStatus || '',
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
