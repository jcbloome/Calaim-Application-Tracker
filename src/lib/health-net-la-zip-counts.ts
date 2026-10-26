export type HealthNetLaZipCountRow = {
  zip: string;
  count: number;
};

export type HealthNetLaZipCountSummary = {
  rows: HealthNetLaZipCountRow[];
  totalAuthorizedHealthNet: number;
  totalLosAngeles: number;
  totalWithZip: number;
  missingZip: number;
  missingCounty: number;
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const pickFirstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

export const isHealthNetPlan = (value: unknown) => {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
};

export const isAuthorizedStatus = (value: unknown) => normalize(value) === 'authorized';

export const isLosAngelesCounty = (value: unknown) => {
  const county = normalize(value);
  return county.includes('los angeles') || county === 'la' || county === 'l.a.';
};

/** Normalize to 5-digit ZIP when possible; keep longer ZIP+4 as `#####-####`. */
export const normalizeZipCode = (value: unknown): string => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length >= 9) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  if (digits.length >= 5) return digits.slice(0, 5);
  return '';
};

export const resolveMemberZip = (rawMember: Record<string, unknown>): string =>
  normalizeZipCode(
    pickFirstNonEmpty(
      rawMember.RCFE_Zip,
      rawMember.rcfeZip,
      rawMember.Member_Zip,
      rawMember.memberZip,
      rawMember.Normal_Housing_Zip,
      rawMember.Home_Zip,
      rawMember.Zip,
      rawMember.Zip_Code
    )
  );

export const resolveMemberCounty = (rawMember: Record<string, unknown>): string =>
  pickFirstNonEmpty(
    rawMember.RCFE_County,
    rawMember.RCFE_County_Name,
    rawMember.Facility_County,
    rawMember.Member_County,
    rawMember.memberCounty,
    rawMember.County
  );

export const resolveHealthPlan = (rawMember: Record<string, unknown>): string =>
  pickFirstNonEmpty(rawMember.CalAIM_MCO, rawMember.memberHealthPlan, rawMember.Health_Plan);

export const resolveCalaimStatus = (rawMember: Record<string, unknown>): string =>
  pickFirstNonEmpty(rawMember.CalAIM_Status, rawMember.calaimStatus, rawMember.memberStatus);

/**
 * Aggregate authorized Health Net members in Los Angeles County by ZIP.
 * Returns counts only — no member identifiers or names.
 */
export function collectHealthNetLaZipCounts(
  rawMembers: Array<Record<string, unknown>>
): HealthNetLaZipCountSummary {
  const counts = new Map<string, number>();
  let totalAuthorizedHealthNet = 0;
  let totalLosAngeles = 0;
  let totalWithZip = 0;
  let missingZip = 0;
  let missingCounty = 0;

  for (const raw of rawMembers) {
    if (!isHealthNetPlan(resolveHealthPlan(raw))) continue;
    if (!isAuthorizedStatus(resolveCalaimStatus(raw))) continue;
    totalAuthorizedHealthNet += 1;

    const county = resolveMemberCounty(raw);
    if (!county) {
      missingCounty += 1;
      continue;
    }
    if (!isLosAngelesCounty(county)) continue;
    totalLosAngeles += 1;

    const zip = resolveMemberZip(raw);
    if (!zip) {
      missingZip += 1;
      continue;
    }

    totalWithZip += 1;
    counts.set(zip, (counts.get(zip) || 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([zip, count]) => ({ zip, count }))
    .sort((a, b) => b.count - a.count || a.zip.localeCompare(b.zip));

  return {
    rows,
    totalAuthorizedHealthNet,
    totalLosAngeles,
    totalWithZip,
    missingZip,
    missingCounty,
  };
}
