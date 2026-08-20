export type UsStateCode = 'CA' | 'VA' | 'NY' | 'TN' | 'FL' | 'CO' | 'OTHER';

export type StaffPayrollRow = {
  name: string;
  annualSalary: number;
  /** Residence / work state for employer SUI (and UI). CO = Colombia (foreign). */
  state: UsStateCode;
};

export type OwnerPayrollRow = {
  name: string;
  annualSalary: number;
  /** Used for illustrative cash-balance contribution ceiling estimates. */
  age: number;
  state: UsStateCode;
};

/** Illustrative employer unemployment tax by employee state (planning defaults). */
export const STATE_EMPLOYER_UNEMPLOYMENT: Record<
  UsStateCode,
  {
    label: string;
    wageBase: number;
    ratePct: number;
    ettPct: number;
    /** When false, skip FICA + FUTA + UI (foreign services outside the US). */
    applyUsPayrollTaxes: boolean;
    notes: string;
  }
> = {
  CA: {
    label: 'California',
    wageBase: 7_000,
    ratePct: 2.7,
    ettPct: 0.1,
    applyUsPayrollTaxes: true,
    notes: 'Business HQ; CA SUI + ETT',
  },
  VA: {
    label: 'Virginia',
    wageBase: 8_000,
    ratePct: 2.5,
    ettPct: 0,
    applyUsPayrollTaxes: true,
    notes: 'VA UI',
  },
  NY: {
    label: 'New York',
    wageBase: 12_800,
    ratePct: 3.4,
    ettPct: 0,
    applyUsPayrollTaxes: true,
    notes: 'NY UI (higher wage base)',
  },
  TN: {
    label: 'Tennessee',
    wageBase: 7_000,
    ratePct: 2.7,
    ettPct: 0,
    applyUsPayrollTaxes: true,
    notes: 'TN UI; no state income tax',
  },
  FL: {
    label: 'Florida',
    wageBase: 7_000,
    ratePct: 2.7,
    ettPct: 0,
    applyUsPayrollTaxes: true,
    notes: 'FL UI; no state income tax',
  },
  CO: {
    label: 'Colombia',
    wageBase: 0,
    ratePct: 0,
    ettPct: 0,
    applyUsPayrollTaxes: false,
    notes: 'Foreign country — no US FICA/FUTA/SUI in this model',
  },
  OTHER: {
    label: 'Other',
    wageBase: 7_000,
    ratePct: 2.7,
    ettPct: 0,
    applyUsPayrollTaxes: true,
    notes: 'Generic UI placeholder',
  },
};

export const US_STATE_OPTIONS: UsStateCode[] = ['VA', 'CA', 'NY', 'TN', 'FL', 'CO', 'OTHER'];

export type KaiserIncomeAssumptions = {
  monthlyRatePerMember: number;
  newMembersPerMonth: number;
  mswReassessmentFee: number;
  mswReassessmentMonths: number;
  ownerPayrollSharePct: number;
  /** @deprecated Prefer structured federal/VA/CA rates below. Kept for older saved UI state. */
  effectiveTaxRatePct: number;
  projectionMonths: number;
  /** Override average auth length in months; 0 = use researched average from census. */
  averageAuthMonthsOverride: number;
  /** Months to subtract from each auth period (onboarding lag). Default 1. */
  authMonthsLessThanPeriod: number;
  fixedStaffAnnual: StaffPayrollRow[];
  /** Base W-2 payroll for owners (Monica / Jason), included in staff payroll expenses. */
  ownerAnnualPayroll: OwnerPayrollRow[];
  /** Employer 401(k) contribution as % of total staff + owner salaries. */
  k401EmployerContributionPct: number;
  /** Recurring monthly operating costs (rent, software, insurance, etc.). */
  monthlyBusinessCosts: Array<{ name: string; monthlyAmount: number }>;
  /** Annual cash balance plan contribution used to offset earnings. */
  cashBalancePlanAnnual: number;
  ownerNames: [string, string];

  /** Social Security wage base (employer + employee). */
  socialSecurityWageBase: number;
  employerSocialSecurityPct: number;
  employerMedicarePct: number;
  employeeSocialSecurityPct: number;
  employeeMedicarePct: number;
  additionalMedicarePct: number;
  additionalMedicareThreshold: number;
  futaWageBase: number;
  futaPct: number;
  /**
   * Fallback CA SUI overrides when employee state is CA.
   * Other states use STATE_EMPLOYER_UNEMPLOYMENT tables.
   */
  caSuiWageBase: number;
  caSuiPct: number;
  caEttPct: number;
  /** CA S-corp style entity tax: max(franchise minimum, pct × taxable income). */
  caFranchiseTaxAnnual: number;
  caSCorpTaxPct: number;
  /** Owner personal tax planning rates (VA residents; CA-source business income). */
  federalIncomeTaxPct: number;
  virginiaIncomeTaxPct: number;
  californiaOwnerIncomeTaxPct: number;
};

/**
 * Illustrative 2026-style cash balance max by participant age (high-comp plans).
 * Actual deductible amount must be certified by an enrolled actuary.
 */
export function estimateCashBalanceMaxByAge(age: number): number {
  const years = Math.max(0, Math.floor(Number(age) || 0));
  if (years >= 60) return 340_000;
  if (years >= 55) return 290_000;
  if (years >= 50) return 226_000;
  if (years >= 45) return 170_000;
  if (years >= 40) return 120_000;
  if (years >= 35) return 90_000;
  return 70_000;
}

function resolveUnemploymentForState(
  state: UsStateCode | string | undefined,
  assumptions: Pick<KaiserIncomeAssumptions, 'caSuiWageBase' | 'caSuiPct' | 'caEttPct'>
) {
  const raw = String(state || 'CA').toUpperCase();
  const code = (US_STATE_OPTIONS.includes(raw as UsStateCode) ? raw : 'OTHER') as UsStateCode;
  const base = STATE_EMPLOYER_UNEMPLOYMENT[code];
  if (code === 'CA') {
    return {
      ...base,
      wageBase: assumptions.caSuiWageBase || base.wageBase,
      ratePct: assumptions.caSuiPct || base.ratePct,
      ettPct: assumptions.caEttPct ?? base.ettPct,
    };
  }
  return base;
}

/** Employer payroll taxes: federal FICA/FUTA + state UI by employee residence/work state. */
export function estimateEmployerPayrollTaxesAnnual(
  people: Array<{ annualSalary: number; state?: UsStateCode | string }>,
  assumptions: Pick<
    KaiserIncomeAssumptions,
    | 'socialSecurityWageBase'
    | 'employerSocialSecurityPct'
    | 'employerMedicarePct'
    | 'futaWageBase'
    | 'futaPct'
    | 'caSuiWageBase'
    | 'caSuiPct'
    | 'caEttPct'
  >
): number {
  return people.reduce((sum, person) => {
    const wage = Math.max(0, Number(person.annualSalary) || 0);
    const ui = resolveUnemploymentForState(person.state, assumptions);
    if (!ui.applyUsPayrollTaxes) {
      return sum;
    }
    const ss =
      Math.min(wage, assumptions.socialSecurityWageBase) *
      (assumptions.employerSocialSecurityPct / 100);
    const medicare = wage * (assumptions.employerMedicarePct / 100);
    const futa = Math.min(wage, assumptions.futaWageBase) * (assumptions.futaPct / 100);
    const sui = Math.min(wage, ui.wageBase) * (ui.ratePct / 100);
    const ett = Math.min(wage, ui.wageBase) * (ui.ettPct / 100);
    return sum + ss + medicare + futa + sui + ett;
  }, 0);
}

export function estimateCaEntityTaxAnnual(
  taxableIncome: number,
  assumptions: Pick<KaiserIncomeAssumptions, 'caFranchiseTaxAnnual' | 'caSCorpTaxPct'>
): number {
  const incomeTax = Math.max(0, taxableIncome) * (assumptions.caSCorpTaxPct / 100);
  return Math.max(Math.max(0, assumptions.caFranchiseTaxAnnual), incomeTax);
}

export function estimateEmployeeFicaAnnual(
  w2Wages: number,
  assumptions: Pick<
    KaiserIncomeAssumptions,
    | 'socialSecurityWageBase'
    | 'employeeSocialSecurityPct'
    | 'employeeMedicarePct'
    | 'additionalMedicarePct'
    | 'additionalMedicareThreshold'
  >
): number {
  const wage = Math.max(0, w2Wages);
  const ss =
    Math.min(wage, assumptions.socialSecurityWageBase) * (assumptions.employeeSocialSecurityPct / 100);
  const medicare = wage * (assumptions.employeeMedicarePct / 100);
  const addl =
    wage > assumptions.additionalMedicareThreshold
      ? (wage - assumptions.additionalMedicareThreshold) * (assumptions.additionalMedicarePct / 100)
      : 0;
  return ss + medicare + addl;
}

/**
 * Owner personal taxes: VA residents with CA-source pass-through income.
 * VA credit for CA tax paid → net state ≈ max(VA, CA).
 */
export function estimateOwnerPersonalTaxesAnnual(params: {
  w2Income: number;
  drawIncome: number;
  assumptions: Pick<
    KaiserIncomeAssumptions,
    | 'federalIncomeTaxPct'
    | 'virginiaIncomeTaxPct'
    | 'californiaOwnerIncomeTaxPct'
    | 'socialSecurityWageBase'
    | 'employeeSocialSecurityPct'
    | 'employeeMedicarePct'
    | 'additionalMedicarePct'
    | 'additionalMedicareThreshold'
  >;
}) {
  const w2Income = Math.max(0, params.w2Income);
  const drawIncome = Math.max(0, params.drawIncome);
  const taxableOrdinary = w2Income + drawIncome;
  const federal = taxableOrdinary * (params.assumptions.federalIncomeTaxPct / 100);
  const virginia = taxableOrdinary * (params.assumptions.virginiaIncomeTaxPct / 100);
  const california = taxableOrdinary * (params.assumptions.californiaOwnerIncomeTaxPct / 100);
  const netState = Math.max(virginia, california);
  const employeeFica = estimateEmployeeFicaAnnual(w2Income, params.assumptions);
  return {
    taxableOrdinary,
    federal,
    virginia,
    california,
    netState,
    employeeFica,
    total: federal + netState + employeeFica,
  };
}

export type KaiserAuthMemberLite = {
  memberHealthPlan?: string;
  memberStatus?: string;
  calaimStatus?: string;
  authStartDateT2038?: string;
  authEndDateT2038?: string;
  nextAuthStartDateT2038?: string;
  nextAuthEndDateT2038?: string;
};

export type AuthPeriodBucket = {
  key: string;
  label: string;
  minMonths: number;
  maxMonths: number;
  count: number;
};

export type AuthDurationStats = {
  sampleSize: number;
  averageMonths: number;
  medianMonths: number;
  minMonths: number;
  maxMonths: number;
  withStartOnly: number;
  withEndOnly: number;
  withBothDates: number;
  currentlyAuthorizedWithKnownEnd: number;
  endingInNext12Months: number;
  periodBuckets: AuthPeriodBucket[];
};

export const AUTH_PERIOD_BUCKET_DEFS: Array<{
  key: string;
  label: string;
  minMonths: number;
  maxMonths: number;
}> = [
  { key: '2-5', label: '2–5 months', minMonths: 2, maxMonths: 5.999 },
  { key: '6-8', label: '6–8 months', minMonths: 6, maxMonths: 8.999 },
  { key: '9-11', label: '9–11 months', minMonths: 9, maxMonths: 11.999 },
  { key: '12', label: '12 months', minMonths: 12, maxMonths: 12.999 },
  { key: '13-17', label: '13–17 months', minMonths: 13, maxMonths: 17.999 },
  { key: '18', label: '18 months', minMonths: 18, maxMonths: 18.999 },
  { key: '19-23', label: '19–23 months', minMonths: 19, maxMonths: 23.999 },
  { key: '24', label: '24 months', minMonths: 24, maxMonths: 24.999 },
  { key: '25+', label: '25+ months', minMonths: 25, maxMonths: 48 },
];

function buildAuthPeriodBuckets(durationMonths: number[]): AuthPeriodBucket[] {
  return AUTH_PERIOD_BUCKET_DEFS.map((def) => ({
    ...def,
    count: durationMonths.filter((months) => months >= def.minMonths && months <= def.maxMonths).length,
  })).filter((bucket) => bucket.count > 0 || ['6-8', '12', '18', '24'].includes(bucket.key));
}

export const DEFAULT_KAISER_INCOME_ASSUMPTIONS: KaiserIncomeAssumptions = {
  monthlyRatePerMember: 432,
  newMembersPerMonth: 40,
  mswReassessmentFee: 150,
  mswReassessmentMonths: 6,
  ownerPayrollSharePct: 30,
  effectiveTaxRatePct: 28,
  projectionMonths: 12,
  averageAuthMonthsOverride: 0,
  authMonthsLessThanPeriod: 1,
  fixedStaffAnnual: [
    { name: 'James', annualSalary: 85_000, state: 'VA' },
    { name: 'Deydry', annualSalary: 70_000, state: 'TN' },
    { name: 'John', annualSalary: 65_000, state: 'CA' },
    { name: 'Nick', annualSalary: 70_000, state: 'NY' },
    { name: 'Lilo', annualSalary: 55_000, state: 'FL' },
    { name: 'Leidy', annualSalary: 60_000, state: 'FL' },
    { name: 'Valentina', annualSalary: 41_600, state: 'CO' },
  ],
  ownerAnnualPayroll: [
    { name: 'Monica', annualSalary: 100_000, age: 55, state: 'VA' },
    { name: 'Jason', annualSalary: 100_000, age: 59, state: 'VA' },
  ],
  k401EmployerContributionPct: 6,
  monthlyBusinessCosts: [{ name: 'General operating', monthlyAmount: 5_000 }],
  cashBalancePlanAnnual: 80_000,
  ownerNames: ['Monica', 'Jason'],
  socialSecurityWageBase: 184_500,
  employerSocialSecurityPct: 6.2,
  employerMedicarePct: 1.45,
  employeeSocialSecurityPct: 6.2,
  employeeMedicarePct: 1.45,
  additionalMedicarePct: 0.9,
  additionalMedicareThreshold: 200_000,
  futaWageBase: 7_000,
  futaPct: 0.6,
  caSuiWageBase: 7_000,
  caSuiPct: 2.7,
  caEttPct: 0.1,
  caFranchiseTaxAnnual: 800,
  caSCorpTaxPct: 1.5,
  federalIncomeTaxPct: 24,
  virginiaIncomeTaxPct: 5.75,
  californiaOwnerIncomeTaxPct: 9.3,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_AUTH_MONTHS = 12;

const normalize = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export function isKaiserPlan(value: unknown) {
  return normalize(value).includes('kaiser');
}

export function isAuthorizedStatus(member: Pick<KaiserAuthMemberLite, 'memberStatus' | 'calaimStatus'>) {
  const status = normalize(member.memberStatus || member.calaimStatus);
  return status.includes('authorized');
}

export function parseDateMaybe(raw: unknown): Date | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const parsed = new Date(year, month - 1, day, 12, 0, 0);
    const isValid =
      !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day;
    return isValid ? parsed : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), 12, 0, 0);
}

function monthsBetween(start: Date, end: Date) {
  const days = Math.max(0, (startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS);
  return days / 30.4375;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function windowCoversToday(start: Date | null, end: Date | null, today: Date): boolean | null {
  if (!start && !end) return null;
  if (start && startOfDay(start) > today) return false;
  if (end && startOfDay(end) < today) return false;
  return true;
}

export function resolveEffectiveAuthWindow(member: KaiserAuthMemberLite, asOf: Date = new Date()) {
  const today = startOfDay(asOf);
  const currentStart = parseDateMaybe(member.authStartDateT2038);
  const currentEnd = parseDateMaybe(member.authEndDateT2038);
  const nextStart = parseDateMaybe(member.nextAuthStartDateT2038);
  const nextEnd = parseDateMaybe(member.nextAuthEndDateT2038);

  const currentCovers = windowCoversToday(currentStart, currentEnd, today);
  if (currentCovers === true) {
    return { start: currentStart, end: currentEnd, source: 'current' as const };
  }

  const nextCovers = windowCoversToday(nextStart, nextEnd, today);
  if (nextCovers === true) {
    return { start: nextStart, end: nextEnd, source: 'next' as const };
  }

  if (currentStart || currentEnd) {
    return { start: currentStart, end: currentEnd, source: 'current' as const };
  }
  if (nextStart || nextEnd) {
    return { start: nextStart, end: nextEnd, source: 'next' as const };
  }
  return { start: null, end: null, source: 'none' as const };
}

/** Currently billable: Kaiser + Authorized. Prefer an auth window that covers today when dates exist. */
export function isCurrentlyAuthorizedKaiserMember(
  member: KaiserAuthMemberLite,
  asOf: Date = new Date()
): boolean {
  if (!isKaiserPlan(member.memberHealthPlan)) return false;
  if (!isAuthorizedStatus(member)) return false;

  const today = startOfDay(asOf);
  const current = windowCoversToday(
    parseDateMaybe(member.authStartDateT2038),
    parseDateMaybe(member.authEndDateT2038),
    today
  );
  if (current === true) return true;
  if (current === false) {
    const next = windowCoversToday(
      parseDateMaybe(member.nextAuthStartDateT2038),
      parseDateMaybe(member.nextAuthEndDateT2038),
      today
    );
    return next === true;
  }

  const nextOnly = windowCoversToday(
    parseDateMaybe(member.nextAuthStartDateT2038),
    parseDateMaybe(member.nextAuthEndDateT2038),
    today
  );
  if (nextOnly === true) return true;
  if (nextOnly === false) return false;

  return true;
}

export function countCurrentlyAuthorizedKaiserMembers(
  members: KaiserAuthMemberLite[],
  asOf: Date = new Date()
) {
  return members.filter((member) => isCurrentlyAuthorizedKaiserMember(member, asOf)).length;
}

/** Pick a stable typical auth length from researched stats. */
export function resolveTypicalAuthMonths(stats: AuthDurationStats): number {
  const mean = Number(stats.averageMonths) || 0;
  const med = Number(stats.medianMonths) || 0;
  // Prefer median when it looks like a real multi-month auth period.
  if (med >= 6 && (mean <= 0 || med >= mean * 0.45)) {
    return med;
  }
  if (mean >= 6) return mean;
  if (med >= 3) return med;
  if (mean >= 3) return mean;
  return FALLBACK_AUTH_MONTHS;
}

function collectAuthDurationMonths(member: KaiserAuthMemberLite): number[] {
  const durations: number[] = [];
  // Prefer the primary auth window for length research. Next-auth pairs are often short renewals
  // and skew the mean toward ~1 month while the median stays near a full auth period.
  const pairs: Array<[unknown, unknown]> = [
    [member.authStartDateT2038, member.authEndDateT2038],
  ];
  for (const [rawStart, rawEnd] of pairs) {
    const start = parseDateMaybe(rawStart);
    const end = parseDateMaybe(rawEnd);
    if (!start || !end) continue;
    if (startOfDay(end) < startOfDay(start)) continue;
    const months = monthsBetween(start, end);
    // Ignore tiny / impossible windows; Kaiser auth periods are typically many months.
    if (months >= 2 && months <= 48) durations.push(months);
  }
  return durations;
}

export function researchAuthDurationStats(
  members: KaiserAuthMemberLite[],
  asOf: Date = new Date()
): AuthDurationStats {
  const today = startOfDay(asOf);
  const horizon = addMonths(today, 12);
  const durationMonths: number[] = [];
  let withStartOnly = 0;
  let withEndOnly = 0;
  let withBothDates = 0;
  let currentlyAuthorizedWithKnownEnd = 0;
  let endingInNext12Months = 0;

  for (const member of members) {
    if (!isKaiserPlan(member.memberHealthPlan)) continue;

    const currentStart = parseDateMaybe(member.authStartDateT2038);
    const currentEnd = parseDateMaybe(member.authEndDateT2038);
    const nextStart = parseDateMaybe(member.nextAuthStartDateT2038);
    const nextEnd = parseDateMaybe(member.nextAuthEndDateT2038);
    const hasStart = Boolean(currentStart || nextStart);
    const hasEnd = Boolean(currentEnd || nextEnd);
    if (hasStart && hasEnd) withBothDates += 1;
    else if (hasStart) withStartOnly += 1;
    else if (hasEnd) withEndOnly += 1;

    durationMonths.push(...collectAuthDurationMonths(member));

    if (!isCurrentlyAuthorizedKaiserMember(member, asOf)) continue;
    const window = resolveEffectiveAuthWindow(member, asOf);
    if (!window.end) continue;
    currentlyAuthorizedWithKnownEnd += 1;
    const end = startOfDay(window.end);
    if (end >= today && end <= horizon) endingInNext12Months += 1;
  }

  const meanMonths = durationMonths.length
    ? durationMonths.reduce((sum, value) => sum + value, 0) / durationMonths.length
    : FALLBACK_AUTH_MONTHS;
  const medianMonths = durationMonths.length ? median(durationMonths) : FALLBACK_AUTH_MONTHS;

  return {
    sampleSize: durationMonths.length,
    // Mean kept for display; model should prefer median (robust typical auth length).
    averageMonths: Number(meanMonths.toFixed(2)),
    medianMonths: Number(medianMonths.toFixed(2)),
    minMonths: durationMonths.length ? Number(Math.min(...durationMonths).toFixed(2)) : 0,
    maxMonths: durationMonths.length ? Number(Math.max(...durationMonths).toFixed(2)) : 0,
    withStartOnly,
    withEndOnly,
    withBothDates,
    currentlyAuthorizedWithKnownEnd,
    endingInNext12Months,
    periodBuckets: buildAuthPeriodBuckets(durationMonths),
  };
}

export type MonthlyKaiserIncomeProjection = {
  monthIndex: number;
  monthLabel: string;
  activeMembers: number;
  newMembers: number;
  endingMembers: number;
  monthlyRevenue: number;
  monthlyMswCost: number;
  monthlyStaffPayrollCost: number;
  monthlyEmployerPayrollTax: number;
  monthlyK401Cost: number;
  monthlyBusinessCost: number;
  monthlyCashBalanceCost: number;
  monthlyCaEntityTax: number;
  monthlyOperatingProfit: number;
  monthlyEarningsAfterCashBalance: number;
  monthlyOwnerPayrollPool: number;
  monthlyOwnerDrawPool: number;
  monthlyPerOwnerPayroll: number;
  monthlyPerOwnerDraw: number;
  monthlyPerOwnerTotal: number;
  monthlyPerOwnerAfterTaxEstimate: number;
};

export type KaiserIncomeEstimateResult = {
  asOfIso: string;
  currentAuthorizedCount: number;
  authDuration: AuthDurationStats;
  researchedAverageAuthMonths: number;
  effectiveAverageAuthMonths: number;
  assumptions: KaiserIncomeAssumptions;
  fixedStaffAnnualTotal: number;
  ownerPayrollAnnualTotal: number;
  totalStaffPayrollAnnual: number;
  employerPayrollTaxAnnual: number;
  k401EmployerAnnual: number;
  monthlyBusinessCostTotal: number;
  annualBusinessCostTotal: number;
  cashBalancePlanAnnual: number;
  estimatedCashBalanceMaxAnnual: number;
  estimatedCashBalanceMaxByOwner: Array<{ name: string; age: number; estimatedMax: number }>;
  mswAnnualPerMember: number;
  currentMonthlyRevenue: number;
  currentAnnualRevenueRunRate: number;
  currentMonthlyMswCost: number;
  currentAnnualMswCost: number;
  currentMonthlyFixedStaffCost: number;
  currentMonthlyOwnerPayrollCost: number;
  currentMonthlyStaffPayrollCost: number;
  currentMonthlyEmployerPayrollTax: number;
  currentMonthlyK401Cost: number;
  currentMonthlyBusinessCost: number;
  currentMonthlyCashBalanceCost: number;
  currentMonthlyCaEntityTax: number;
  currentAnnualOperatingProfitRunRate: number;
  currentAnnualEarningsAfterCashBalance: number;
  currentAnnualCaEntityTax: number;
  currentAnnualEarningsAfterEntityTax: number;
  projection: MonthlyKaiserIncomeProjection[];
  yearEndActiveMembers: number;
  yearNewMembersTotal: number;
  yearEndingMembersTotal: number;
  yearRevenueTotal: number;
  yearMswCostTotal: number;
  yearStaffPayrollCost: number;
  yearEmployerPayrollTax: number;
  yearK401Cost: number;
  yearBusinessCost: number;
  yearCashBalanceCost: number;
  yearCaEntityTax: number;
  yearOperatingProfit: number;
  yearEarningsAfterCashBalance: number;
  yearEarningsAfterEntityTax: number;
  yearOwnerPayrollPool: number;
  yearOwnerDrawPool: number;
  yearPerOwnerBasePayroll: number;
  yearPerOwnerPayroll: number;
  yearPerOwnerDraw: number;
  yearPerOwnerTotal: number;
  yearPerOwnerFederalTax: number;
  yearPerOwnerNetStateTax: number;
  yearPerOwnerVirginiaTax: number;
  yearPerOwnerCaliforniaTax: number;
  yearPerOwnerEmployeeFica: number;
  yearPerOwnerPersonalTaxTotal: number;
  yearPerOwnerAfterTaxEstimate: number;
  yearCompanyAfterOwnerComp: number;
};

function monthLabel(asOf: Date, offset: number) {
  const d = new Date(asOf.getFullYear(), asOf.getMonth() + offset, 1);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build month-by-month billable census:
 * - current authorized census at month 0
 * - known auth end dates remove members in that month (no longer paid)
 * - members without end dates expire after average auth length from start (or asOf)
 * - new members stay for average auth months, then churn
 * - staff payroll includes Monica/Jason base W-2; employer payroll taxes + 401(k) + monthly business costs + cash balance
 * - CA entity tax (S-corp style); owner personal tax = federal + max(VA, CA) + employee FICA on W-2
 */
export function buildKaiserIncomeEstimate(params: {
  members: KaiserAuthMemberLite[];
  assumptions?: Partial<KaiserIncomeAssumptions>;
  asOf?: Date;
}): KaiserIncomeEstimateResult {
  const asOf = params.asOf || new Date();
  const assumptions: KaiserIncomeAssumptions = {
    ...DEFAULT_KAISER_INCOME_ASSUMPTIONS,
    ...params.assumptions,
    fixedStaffAnnual:
      params.assumptions?.fixedStaffAnnual || DEFAULT_KAISER_INCOME_ASSUMPTIONS.fixedStaffAnnual,
    ownerAnnualPayroll:
      params.assumptions?.ownerAnnualPayroll || DEFAULT_KAISER_INCOME_ASSUMPTIONS.ownerAnnualPayroll,
    monthlyBusinessCosts:
      params.assumptions?.monthlyBusinessCosts ||
      DEFAULT_KAISER_INCOME_ASSUMPTIONS.monthlyBusinessCosts,
    ownerNames: params.assumptions?.ownerNames || DEFAULT_KAISER_INCOME_ASSUMPTIONS.ownerNames,
  };

  const authDuration = researchAuthDurationStats(params.members, asOf);
  const overrideMonths = Number(assumptions.averageAuthMonthsOverride);
  const researchedFromData = resolveTypicalAuthMonths(authDuration);
  const researchedAverageAuthMonths = Math.max(
    1,
    overrideMonths >= 3 ? overrideMonths : researchedFromData
  );
  const authMonthsLess = Math.max(0, Number(assumptions.authMonthsLessThanPeriod) || 0);
  const effectiveAverageAuthMonths = Math.max(1, researchedAverageAuthMonths - authMonthsLess);

  const currentAuthorized = params.members.filter((member) =>
    isCurrentlyAuthorizedKaiserMember(member, asOf)
  );
  const currentAuthorizedCount = currentAuthorized.length;

  const fixedStaffAnnualTotal = assumptions.fixedStaffAnnual.reduce(
    (sum, row) => sum + Number(row.annualSalary || 0),
    0
  );
  const ownerPayrollAnnualTotal = assumptions.ownerAnnualPayroll.reduce(
    (sum, row) => sum + Number(row.annualSalary || 0),
    0
  );
  const totalStaffPayrollAnnual = fixedStaffAnnualTotal + ownerPayrollAnnualTotal;
  const allWageRows = [
    ...assumptions.fixedStaffAnnual.map((row) => ({
      annualSalary: Number(row.annualSalary || 0),
      state: row.state,
    })),
    ...assumptions.ownerAnnualPayroll.map((row) => ({
      annualSalary: Number(row.annualSalary || 0),
      state: row.state,
    })),
  ];
  const employerPayrollTaxAnnual = estimateEmployerPayrollTaxesAnnual(allWageRows, assumptions);
  const k401Pct = Math.max(0, Number(assumptions.k401EmployerContributionPct) || 0) / 100;
  const k401EmployerAnnual = totalStaffPayrollAnnual * k401Pct;
  const monthlyBusinessCost = (assumptions.monthlyBusinessCosts || []).reduce(
    (sum, row) => sum + Math.max(0, Number(row.monthlyAmount) || 0),
    0
  );
  const annualBusinessCostTotal = monthlyBusinessCost * 12;
  const cashBalancePlanAnnual = Math.max(0, Number(assumptions.cashBalancePlanAnnual) || 0);
  const estimatedCashBalanceMaxByOwner = assumptions.ownerAnnualPayroll.map((row) => ({
    name: row.name,
    age: Number(row.age) || 0,
    estimatedMax: estimateCashBalanceMaxByAge(row.age),
  }));
  const estimatedCashBalanceMaxAnnual = estimatedCashBalanceMaxByOwner.reduce(
    (sum, row) => sum + row.estimatedMax,
    0
  );
  const mswAnnualPerMember =
    (assumptions.mswReassessmentFee * 12) / Math.max(1, assumptions.mswReassessmentMonths);
  const monthlyFixedStaffCost = fixedStaffAnnualTotal / 12;
  const monthlyOwnerPayrollCost = ownerPayrollAnnualTotal / 12;
  const monthlyStaffPayrollCost = totalStaffPayrollAnnual / 12;
  const monthlyEmployerPayrollTax = employerPayrollTaxAnnual / 12;
  const monthlyK401Cost = k401EmployerAnnual / 12;
  const monthlyCashBalanceCost = cashBalancePlanAnnual / 12;
  const currentMonthlyRevenue = currentAuthorizedCount * assumptions.monthlyRatePerMember;
  const currentMonthlyMswCost = currentAuthorizedCount * (mswAnnualPerMember / 12);
  const currentAnnualRevenueRunRate = currentMonthlyRevenue * 12;
  const currentAnnualMswCost = currentMonthlyMswCost * 12;
  const currentAnnualOperatingProfitRunRate =
    currentAnnualRevenueRunRate -
    currentAnnualMswCost -
    totalStaffPayrollAnnual -
    employerPayrollTaxAnnual -
    k401EmployerAnnual -
    annualBusinessCostTotal;
  const currentAnnualEarningsAfterCashBalance =
    currentAnnualOperatingProfitRunRate - cashBalancePlanAnnual;
  const currentAnnualCaEntityTax = estimateCaEntityTaxAnnual(
    currentAnnualEarningsAfterCashBalance,
    assumptions
  );
  const currentAnnualEarningsAfterEntityTax =
    currentAnnualEarningsAfterCashBalance - currentAnnualCaEntityTax;
  const currentMonthlyCaEntityTax = currentAnnualCaEntityTax / 12;

  const ownerPayrollShare = Math.min(100, Math.max(0, assumptions.ownerPayrollSharePct)) / 100;
  const ownerDrawShare = 1 - ownerPayrollShare;
  const ownerCount = Math.max(1, assumptions.ownerAnnualPayroll.length || assumptions.ownerNames.length);
  const yearPerOwnerBasePayroll = ownerPayrollAnnualTotal / ownerCount;

  const endingsByMonth = new Map<string, number>();
  const bumpEnding = (date: Date, count = 1) => {
    const key = monthKey(date);
    endingsByMonth.set(key, (endingsByMonth.get(key) || 0) + count);
  };

  for (const member of currentAuthorized) {
    const window = resolveEffectiveAuthWindow(member, asOf);
    if (window.end) {
      bumpEnding(window.end, 1);
      continue;
    }
    const start = window.start || asOf;
    const elapsed = Math.max(0, monthsBetween(start, asOf));
    const remaining = Math.max(1, Math.round(effectiveAverageAuthMonths - elapsed));
    bumpEnding(addMonths(asOf, remaining), 1);
  }

  const projection: MonthlyKaiserIncomeProjection[] = [];
  let activeMembers = currentAuthorizedCount;
  let yearRevenueTotal = 0;
  let yearMswCostTotal = 0;
  let yearNewMembersTotal = 0;
  let yearEndingMembersTotal = 0;

  for (let monthIndex = 0; monthIndex < assumptions.projectionMonths; monthIndex++) {
    const monthDate = new Date(asOf.getFullYear(), asOf.getMonth() + monthIndex, 1);
    const key = monthKey(monthDate);
    const newMembers = monthIndex === 0 ? 0 : assumptions.newMembersPerMonth;

    if (monthIndex > 0) {
      activeMembers += newMembers;
      yearNewMembersTotal += newMembers;
      const estimatedEnd = addMonths(monthDate, Math.round(effectiveAverageAuthMonths));
      bumpEnding(estimatedEnd, newMembers);
    }

    const endingMembers = Math.min(activeMembers, endingsByMonth.get(key) || 0);
    const monthlyRevenue = activeMembers * assumptions.monthlyRatePerMember;
    const monthlyMswCost = activeMembers * (mswAnnualPerMember / 12);
    const monthlyOperatingProfit =
      monthlyRevenue -
      monthlyMswCost -
      monthlyStaffPayrollCost -
      monthlyEmployerPayrollTax -
      monthlyK401Cost -
      monthlyBusinessCost;
    const monthlyEarningsAfterCashBalance = monthlyOperatingProfit - monthlyCashBalanceCost;
    const monthlyCaEntityTax =
      estimateCaEntityTaxAnnual(monthlyEarningsAfterCashBalance * 12, assumptions) / 12;
    const monthlyEarningsAfterEntityTax = monthlyEarningsAfterCashBalance - monthlyCaEntityTax;
    const positiveOwnerPool = Math.max(0, monthlyEarningsAfterEntityTax);
    const monthlyOwnerPayrollPool = positiveOwnerPool * ownerPayrollShare;
    const monthlyOwnerDrawPool = positiveOwnerPool * ownerDrawShare;
    const monthlyPerOwnerPayroll = monthlyOwnerPayrollPool / ownerCount;
    const monthlyPerOwnerDraw = monthlyOwnerDrawPool / ownerCount;
    const monthlyPerOwnerTotal =
      yearPerOwnerBasePayroll / 12 + monthlyPerOwnerPayroll + monthlyPerOwnerDraw;
    const monthlyPersonalTax = estimateOwnerPersonalTaxesAnnual({
      w2Income: yearPerOwnerBasePayroll / 12 + monthlyPerOwnerPayroll,
      drawIncome: monthlyPerOwnerDraw,
      assumptions,
    });
    const monthlyPerOwnerAfterTaxEstimate = monthlyPerOwnerTotal - monthlyPersonalTax.total;

    yearRevenueTotal += monthlyRevenue;
    yearMswCostTotal += monthlyMswCost;
    yearEndingMembersTotal += endingMembers;
    activeMembers = Math.max(0, activeMembers - endingMembers);

    projection.push({
      monthIndex,
      monthLabel: monthLabel(asOf, monthIndex),
      activeMembers: activeMembers + endingMembers,
      newMembers,
      endingMembers,
      monthlyRevenue,
      monthlyMswCost,
      monthlyStaffPayrollCost,
      monthlyEmployerPayrollTax,
      monthlyK401Cost,
      monthlyBusinessCost,
      monthlyCashBalanceCost,
      monthlyCaEntityTax,
      monthlyOperatingProfit,
      monthlyEarningsAfterCashBalance,
      monthlyOwnerPayrollPool,
      monthlyOwnerDrawPool,
      monthlyPerOwnerPayroll,
      monthlyPerOwnerDraw,
      monthlyPerOwnerTotal,
      monthlyPerOwnerAfterTaxEstimate,
    });
  }

  const yearStaffPayrollCost = monthlyStaffPayrollCost * assumptions.projectionMonths;
  const yearEmployerPayrollTax = monthlyEmployerPayrollTax * assumptions.projectionMonths;
  const yearK401Cost = monthlyK401Cost * assumptions.projectionMonths;
  const yearBusinessCost = monthlyBusinessCost * assumptions.projectionMonths;
  const yearCashBalanceCost = monthlyCashBalanceCost * assumptions.projectionMonths;
  const yearOperatingProfit =
    yearRevenueTotal -
    yearMswCostTotal -
    yearStaffPayrollCost -
    yearEmployerPayrollTax -
    yearK401Cost -
    yearBusinessCost;
  const yearEarningsAfterCashBalance = yearOperatingProfit - yearCashBalanceCost;
  const yearCaEntityTax = estimateCaEntityTaxAnnual(yearEarningsAfterCashBalance, assumptions);
  const yearEarningsAfterEntityTax = yearEarningsAfterCashBalance - yearCaEntityTax;
  const yearPositiveOwnerPool = Math.max(0, yearEarningsAfterEntityTax);
  const yearOwnerPayrollPool = yearPositiveOwnerPool * ownerPayrollShare;
  const yearOwnerDrawPool = yearPositiveOwnerPool * ownerDrawShare;
  const yearPerOwnerPayroll = yearOwnerPayrollPool / ownerCount;
  const yearPerOwnerDraw = yearOwnerDrawPool / ownerCount;
  const yearPerOwnerTotal = yearPerOwnerBasePayroll + yearPerOwnerPayroll + yearPerOwnerDraw;
  const yearPersonalTax = estimateOwnerPersonalTaxesAnnual({
    w2Income: yearPerOwnerBasePayroll + yearPerOwnerPayroll,
    drawIncome: yearPerOwnerDraw,
    assumptions,
  });
  const yearPerOwnerAfterTaxEstimate = yearPerOwnerTotal - yearPersonalTax.total;

  return {
    asOfIso: asOf.toISOString(),
    currentAuthorizedCount,
    authDuration,
    researchedAverageAuthMonths: Number(researchedAverageAuthMonths.toFixed(2)),
    effectiveAverageAuthMonths: Number(effectiveAverageAuthMonths.toFixed(2)),
    assumptions,
    fixedStaffAnnualTotal,
    ownerPayrollAnnualTotal,
    totalStaffPayrollAnnual,
    employerPayrollTaxAnnual,
    k401EmployerAnnual,
    monthlyBusinessCostTotal: monthlyBusinessCost,
    annualBusinessCostTotal,
    cashBalancePlanAnnual,
    estimatedCashBalanceMaxAnnual,
    estimatedCashBalanceMaxByOwner,
    mswAnnualPerMember,
    currentMonthlyRevenue,
    currentAnnualRevenueRunRate,
    currentMonthlyMswCost,
    currentAnnualMswCost,
    currentMonthlyFixedStaffCost: monthlyFixedStaffCost,
    currentMonthlyOwnerPayrollCost: monthlyOwnerPayrollCost,
    currentMonthlyStaffPayrollCost: monthlyStaffPayrollCost,
    currentMonthlyEmployerPayrollTax: monthlyEmployerPayrollTax,
    currentMonthlyK401Cost: monthlyK401Cost,
    currentMonthlyBusinessCost: monthlyBusinessCost,
    currentMonthlyCashBalanceCost: monthlyCashBalanceCost,
    currentMonthlyCaEntityTax,
    currentAnnualOperatingProfitRunRate,
    currentAnnualEarningsAfterCashBalance,
    currentAnnualCaEntityTax,
    currentAnnualEarningsAfterEntityTax,
    projection,
    yearEndActiveMembers: activeMembers,
    yearNewMembersTotal,
    yearEndingMembersTotal,
    yearRevenueTotal,
    yearMswCostTotal,
    yearStaffPayrollCost,
    yearEmployerPayrollTax,
    yearK401Cost,
    yearBusinessCost,
    yearCashBalanceCost,
    yearCaEntityTax,
    yearOperatingProfit,
    yearEarningsAfterCashBalance,
    yearEarningsAfterEntityTax,
    yearOwnerPayrollPool,
    yearOwnerDrawPool,
    yearPerOwnerBasePayroll,
    yearPerOwnerPayroll,
    yearPerOwnerDraw,
    yearPerOwnerTotal,
    yearPerOwnerFederalTax: yearPersonalTax.federal,
    yearPerOwnerNetStateTax: yearPersonalTax.netState,
    yearPerOwnerVirginiaTax: yearPersonalTax.virginia,
    yearPerOwnerCaliforniaTax: yearPersonalTax.california,
    yearPerOwnerEmployeeFica: yearPersonalTax.employeeFica,
    yearPerOwnerPersonalTaxTotal: yearPersonalTax.total,
    yearPerOwnerAfterTaxEstimate,
    yearCompanyAfterOwnerComp: yearEarningsAfterEntityTax - yearPositiveOwnerPool,
  };
}

export function formatUsd(amount: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number.isFinite(amount) ? amount : 0);
}
