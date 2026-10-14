export type UsStateCode = 'CA' | 'VA' | 'NY' | 'TN' | 'FL' | 'CO' | 'OTHER';

export type StaffPayrollRow = {
  name: string;
  annualSalary: number;
  /** Residence / work state for employer SUI (and UI). CO = Colombia (foreign). */
  state: UsStateCode;
  /** Employer 401(k) match applies (full-time, 1+ year). */
  k401Eligible?: boolean;
  /** Last day worked (YYYY-MM-DD). Paid through this date; excluded from payroll after it. */
  endDate?: string;
  /** Annual salary amount the state grant covered for this person (capped at salary). */
  grantAnnualCovered?: number;
};

export type OwnerPayrollRow = {
  name: string;
  annualSalary: number;
  /** Used for illustrative cash-balance contribution ceiling estimates. */
  age: number;
  state: UsStateCode;
  /** Employer 401(k) match applies (full-time, 1+ year). */
  k401Eligible?: boolean;
  /** Annual salary amount the state grant covered for this owner (capped at salary). */
  grantAnnualCovered?: number;
};

/** Default names eligible for the 3% employer 401(k) (FT + 1 year). */
export const DEFAULT_K401_ELIGIBLE_NAMES = [
  'james',
  'monica',
  'nick',
  'jason',
  'alberto',
  'deydry',
] as const;

export function isDefaultK401EligibleName(name: unknown): boolean {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return (DEFAULT_K401_ELIGIBLE_NAMES as readonly string[]).includes(key);
}

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
  /** Employer 401(k) contribution as % of eligible staff + owner salaries (FT, 1+ year). */
  k401EmployerContributionPct: number;
  /** Recurring monthly operating costs (rent, software, insurance, etc.). */
  monthlyBusinessCosts: Array<{ name: string; monthlyAmount: number }>;
  /** Annual cash balance plan contribution used to offset earnings. */
  cashBalancePlanAnnual: number;
  ownerNames: [string, string];

  /**
   * Health Net cash received year-to-date (still managing HN members this year).
   * Annualized with paymentLagMonths so current-month services aren't treated as collected yet.
   */
  healthNetYtdPaid: number;
  /**
   * Calendar month (1–12) that Health Net / Kaiser cash YTD figures are through.
   * 0 = use the projection as-of month.
   */
  revenueYtdThroughMonth: number;
  /** Months after service before cash typically arrives (e.g. 1.5). */
  paymentLagMonths: number;
  /**
   * Month-over-month Health Net revenue decline during wind-down (e.g. 20 = −20%/mo).
   * Applied from the projection start month through healthNetProgramEndMonth.
   */
  healthNetMonthlyDeclinePct: number;
  /**
   * Calendar month (1–12) when the Health Net program ends (default 12 = December).
   * Months after this in the program-end year earn $0 Health Net revenue.
   */
  healthNetProgramEndMonth: number;
  /** Optional Kaiser cash YTD (for cash-based annual estimate vs census projection). */
  kaiserYtdPaid: number;
  /** Prior-year reference: Health Net gross (display / planning context). */
  priorYearHealthNetGross: number;
  /** Prior-year reference: Kaiser gross. */
  priorYearKaiserGross: number;
  /** Prior-year reference: taxable income. */
  priorYearTaxableIncome: number;
  /** Months of the current calendar year the state grant covered salaries (Jan–Aug = 8). */
  grantMonthsCoveredThisYear: number;
  /** Count grant funding as taxable business income in the calendar-year estimate. */
  grantIsTaxableIncome: boolean;
  /** Calendar-year revenue basis: cash received in the year, or services earned in the year. */
  taxYearBasis: 'cash' | 'accrual';

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

export type YtdCashAnnualization = {
  ytdPaid: number;
  ytdThroughMonth: number;
  paymentLagMonths: number;
  /** Months of service the YTD cash is assumed to cover (through month − lag). */
  serviceMonthsRepresented: number;
  impliedMonthlyRunRate: number;
  /** Full-year cash estimate = run rate × 12. */
  estimatedAnnual: number;
  /** Estimate of work already done but not yet paid (lag × monthly run rate). */
  unpaidAccruedEstimate: number;
  /** Estimate of remaining calendar-year cash after YTD (annual − ytd). */
  remainingYearCashEstimate: number;
};

/**
 * Annualize YTD cash collections when payment lags service by ~1.5 months.
 * Example: through October, $4.48M collected ≈ 8.5 service months → ~$6.33M annual.
 */
export function estimateAnnualFromYtdWithPaymentLag(params: {
  ytdPaid: number;
  asOf?: Date;
  ytdThroughMonth?: number;
  paymentLagMonths?: number;
}): YtdCashAnnualization {
  const asOf = params.asOf || new Date();
  const throughRaw = Number(params.ytdThroughMonth);
  const ytdThroughMonth =
    Number.isFinite(throughRaw) && throughRaw >= 1 && throughRaw <= 12
      ? Math.floor(throughRaw)
      : asOf.getMonth() + 1;
  const paymentLagMonths = Math.max(0, Number(params.paymentLagMonths) || 0);
  const ytdPaid = Math.max(0, Number(params.ytdPaid) || 0);
  const serviceMonthsRepresented = Math.max(0.25, ytdThroughMonth - paymentLagMonths);
  const impliedMonthlyRunRate = ytdPaid / serviceMonthsRepresented;
  const estimatedAnnual = impliedMonthlyRunRate * 12;
  const unpaidAccruedEstimate = impliedMonthlyRunRate * paymentLagMonths;
  const remainingYearCashEstimate = Math.max(0, estimatedAnnual - ytdPaid);
  return {
    ytdPaid,
    ytdThroughMonth,
    paymentLagMonths,
    serviceMonthsRepresented: Number(serviceMonthsRepresented.toFixed(2)),
    impliedMonthlyRunRate,
    estimatedAnnual,
    unpaidAccruedEstimate,
    remainingYearCashEstimate,
  };
}

/**
 * Health Net monthly revenue during wind-down: base × (1 − decline)^monthIndex,
 * then $0 after the program-end calendar month (same year as asOf, or later years).
 */
export function healthNetRevenueForProjectionMonth(params: {
  baseMonthly: number;
  monthIndex: number;
  asOf: Date;
  declinePct?: number;
  programEndMonth?: number;
}): number {
  const base = Math.max(0, Number(params.baseMonthly) || 0);
  const monthIndex = Math.max(0, Math.floor(Number(params.monthIndex) || 0));
  const declinePct = Math.min(100, Math.max(0, Number(params.declinePct) || 0));
  const programEndMonthRaw = Number(params.programEndMonth);
  const programEndMonth =
    Number.isFinite(programEndMonthRaw) && programEndMonthRaw >= 1 && programEndMonthRaw <= 12
      ? Math.floor(programEndMonthRaw)
      : 12;
  const monthDate = new Date(params.asOf.getFullYear(), params.asOf.getMonth() + monthIndex, 1);
  const programEndDate = new Date(params.asOf.getFullYear(), programEndMonth - 1, 1);
  // After December (or chosen end month) of the as-of year — no further HN program revenue.
  if (
    monthDate.getFullYear() > programEndDate.getFullYear() ||
    (monthDate.getFullYear() === programEndDate.getFullYear() &&
      monthDate.getMonth() > programEndDate.getMonth())
  ) {
    return 0;
  }
  const factor = Math.pow(1 - declinePct / 100, monthIndex);
  return base * factor;
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

export type EmployerPayrollTaxBreakdown = {
  federal: number;
  state: number;
  total: number;
};

/** Employer payroll taxes: federal FICA/FUTA + state UI by employee residence/work state. */
export function estimateEmployerPayrollTaxesBreakdown(
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
): EmployerPayrollTaxBreakdown {
  return people.reduce(
    (acc, person) => {
      const wage = Math.max(0, Number(person.annualSalary) || 0);
      const ui = resolveUnemploymentForState(person.state, assumptions);
      if (!ui.applyUsPayrollTaxes) {
        return acc;
      }
      const ss =
        Math.min(wage, assumptions.socialSecurityWageBase) *
        (assumptions.employerSocialSecurityPct / 100);
      const medicare = wage * (assumptions.employerMedicarePct / 100);
      const futa = Math.min(wage, assumptions.futaWageBase) * (assumptions.futaPct / 100);
      const sui = Math.min(wage, ui.wageBase) * (ui.ratePct / 100);
      const ett = Math.min(wage, ui.wageBase) * (ui.ettPct / 100);
      const federal = ss + medicare + futa;
      const state = sui + ett;
      return {
        federal: acc.federal + federal,
        state: acc.state + state,
        total: acc.total + federal + state,
      };
    },
    { federal: 0, state: 0, total: 0 }
  );
}

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
  return estimateEmployerPayrollTaxesBreakdown(people, assumptions).total;
}

export function resolveK401Eligible(
  row: { name?: string; k401Eligible?: boolean }
): boolean {
  if (typeof row.k401Eligible === 'boolean') return row.k401Eligible;
  return isDefaultK401EligibleName(row.name);
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
    { name: 'James', annualSalary: 85_000, state: 'VA', k401Eligible: true },
    {
      name: 'Deydry',
      annualSalary: 70_000,
      state: 'TN',
      k401Eligible: true,
      grantAnnualCovered: 65_000,
    },
    { name: 'Nick', annualSalary: 70_000, state: 'NY', k401Eligible: true, grantAnnualCovered: 70_000 },
    { name: 'Alberto', annualSalary: 65_000, state: 'CA', k401Eligible: true },
    { name: 'John', annualSalary: 65_000, state: 'CA', k401Eligible: false },
    { name: 'Lilo', annualSalary: 55_000, state: 'FL', k401Eligible: false },
    {
      name: 'Leidy',
      annualSalary: 60_000,
      state: 'FL',
      k401Eligible: false,
      endDate: '2026-09-15',
      grantAnnualCovered: 60_000,
    },
    { name: 'Valentina', annualSalary: 41_600, state: 'CO', k401Eligible: false },
    // Salary not yet entered — set it on the page so Jan–Aug wages count in the tax year.
    { name: 'Tang', annualSalary: 0, state: 'CA', k401Eligible: false, endDate: '2026-08-28' },
  ],
  ownerAnnualPayroll: [
    {
      name: 'Monica',
      annualSalary: 100_000,
      age: 55,
      state: 'VA',
      k401Eligible: true,
      grantAnnualCovered: 80_000,
    },
    {
      name: 'Jason',
      annualSalary: 100_000,
      age: 59,
      state: 'VA',
      k401Eligible: true,
      grantAnnualCovered: 28_000,
    },
  ],
  /** 3% employer contribution for FT staff with 1+ year (eligible names only). */
  k401EmployerContributionPct: 3,
  monthlyBusinessCosts: [{ name: 'General operating', monthlyAmount: 5_000 }],
  cashBalancePlanAnnual: 80_000,
  ownerNames: ['Monica', 'Jason'],
  /** YTD Health Net cash received (editable). Default reflects Oct 2026 planning input. */
  healthNetYtdPaid: 4_480_000,
  revenueYtdThroughMonth: 0,
  paymentLagMonths: 1.5,
  /** −20%/mo Health Net wind-down through December program end. */
  healthNetMonthlyDeclinePct: 20,
  healthNetProgramEndMonth: 12,
  /** YTD Kaiser cash received (editable; census projection is still primary for Kaiser). */
  kaiserYtdPaid: 734_000,
  priorYearHealthNetGross: 1_800_000,
  priorYearKaiserGross: 186_000,
  priorYearTaxableIncome: 1_500_000,
  /** State grant ended Aug 30 → covered Jan–Aug of this year. */
  grantMonthsCoveredThisYear: 8,
  grantIsTaxableIncome: true,
  taxYearBasis: 'cash',
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
  /** Kaiser census-based monthly revenue only. */
  monthlyKaiserRevenue: number;
  /** Health Net annualized monthly revenue (flat from YTD cash + lag). */
  monthlyHealthNetRevenue: number;
  /** Kaiser + Health Net. */
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
  k401EligiblePayrollAnnual: number;
  k401EligibleNames: string[];
  employerPayrollTaxAnnual: number;
  employerFederalPayrollTaxAnnual: number;
  employerStatePayrollTaxAnnual: number;
  k401EmployerAnnual: number;
  monthlyBusinessCostTotal: number;
  annualBusinessCostTotal: number;
  cashBalancePlanAnnual: number;
  estimatedCashBalanceMaxAnnual: number;
  estimatedCashBalanceMaxByOwner: Array<{ name: string; age: number; estimatedMax: number }>;
  /** Projection-year profit before cash balance (the most that could be funded from earnings). */
  cashBalanceProfitRoomAnnual: number;
  /** min(age-based max, profit room) — planning amount before actuary review. */
  cashBalanceSuggestedAnnual: number;
  mswAnnualPerMember: number;
  healthNetAnnualization: YtdCashAnnualization;
  kaiserCashAnnualization: YtdCashAnnualization;
  /** Flat YTD annualization if HN did not decline / end (reference only). */
  healthNetFlatAnnualIfNoDecline: number;
  currentMonthlyKaiserRevenue: number;
  currentMonthlyHealthNetRevenue: number;
  currentMonthlyRevenue: number;
  currentAnnualKaiserRevenueRunRate: number;
  /** Sum of declining HN months in the projection window (through program end). */
  currentAnnualHealthNetRevenue: number;
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
  yearKaiserRevenueTotal: number;
  yearHealthNetRevenueTotal: number;
  yearRevenueTotal: number;
  yearMswCostTotal: number;
  yearStaffPayrollCost: number;
  yearEmployerPayrollTax: number;
  yearEmployerFederalPayrollTax: number;
  yearEmployerStatePayrollTax: number;
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
  /** Combined owners (Monica + Jason) personal federal income tax for the projection year. */
  yearOwnerFederalTaxTotal: number;
  /** Combined owners net state tax (after VA credit for CA) for the projection year. */
  yearOwnerStateTaxTotal: number;
  /** Combined owners employee FICA for the projection year. */
  yearOwnerEmployeeFicaTotal: number;
  /**
   * Estimated federal taxes for the year: employer FICA/FUTA + CA S-corp federal isn't modeled;
   * includes employer federal payroll + owner federal income tax (× owners).
   */
  yearTotalFederalTaxes: number;
  /** Estimated state taxes: employer SUI/ETT + CA entity tax + owner net state tax (× owners). */
  yearTotalStateTaxes: number;
  /** yearTotalFederalTaxes + yearTotalStateTaxes + owner employee FICA (withheld but shown separately in UI). */
  yearTotalTaxesEstimated: number;
  yearCompanyAfterOwnerComp: number;
  /** Calendar (tax) year view: YTD actuals + rest of year, grant, prorated payroll. */
  calendarYear: CalendarYearTaxEstimate;
};

export type CalendarYearPayrollLine = {
  name: string;
  isOwner: boolean;
  annualSalary: number;
  endDate: string;
  /** Share of the calendar year the person was on payroll (0–1). */
  fractionOfYear: number;
  wagesInYear: number;
  grantFunding: number;
};

export type CalendarYearTaxEstimate = {
  year: number;
  basis: 'cash' | 'accrual';
  healthNetYtdCash: number;
  healthNetRestOfYear: number;
  healthNetTotal: number;
  kaiserYtdCash: number;
  kaiserRestOfYear: number;
  kaiserTotal: number;
  grantFunding: number;
  grantIsTaxableIncome: boolean;
  /** HN + Kaiser + grant (when taxable). */
  revenueTotal: number;
  payrollLines: CalendarYearPayrollLine[];
  staffWages: number;
  ownerWages: number;
  employerFederalPayrollTax: number;
  employerStatePayrollTax: number;
  k401Employer: number;
  mswCost: number;
  businessCost: number;
  operatingProfit: number;
  cashBalancePlan: number;
  cashBalanceSuggested: number;
  /** Pass-through business taxable income after owner W-2 and cash balance (compare to prior year). */
  businessTaxableIncome: number;
  caEntityTax: number;
  perOwnerTotalIncome: number;
  perOwnerAfterTax: number;
  ownerFederalTaxTotal: number;
  ownerStateTaxTotal: number;
  ownerEmployeeFicaTotal: number;
  totalFederalTaxes: number;
  totalStateTaxes: number;
  totalTaxesEstimated: number;
};

function fractionOfYearOnPayroll(endDateRaw: string | undefined, year: number): number {
  const end = parseDateMaybe(endDateRaw);
  if (!end) return 1;
  if (end.getFullYear() < year) return 0;
  if (end.getFullYear() > year) return 1;
  const startOfYear = new Date(year, 0, 1);
  const daysInYear = Math.round((new Date(year + 1, 0, 1).getTime() - startOfYear.getTime()) / DAY_MS);
  const daysWorked = Math.floor((end.getTime() - startOfYear.getTime()) / DAY_MS) + 1;
  return Math.min(1, Math.max(0, daysWorked / daysInYear));
}

/**
 * Calendar-year (tax year) estimate: YTD cash already collected + the rest of the year from the
 * forward projection, payroll prorated by end dates, and state grant funding for Jan–Aug.
 * Cash basis counts only cash expected by Dec 31 (services through Dec minus payment lag);
 * accrual basis counts all services through Dec 31.
 */
function buildCalendarYearTaxEstimate(params: {
  asOf: Date;
  assumptions: KaiserIncomeAssumptions;
  projection: MonthlyKaiserIncomeProjection[];
  healthNetAnnualization: YtdCashAnnualization;
  kaiserCashAnnualization: YtdCashAnnualization;
  monthlyBusinessCost: number;
  estimatedCashBalanceMaxAnnual: number;
}): CalendarYearTaxEstimate {
  const { asOf, assumptions, projection } = params;
  const year = asOf.getFullYear();
  const startMonthIdx = asOf.getMonth();
  const lag = Math.max(0, Number(assumptions.paymentLagMonths) || 0);
  const basis = assumptions.taxYearBasis === 'accrual' ? 'accrual' : 'cash';

  const serviceRevenueForMonth = (source: 'hn' | 'kaiser', monthOfYear: number) => {
    if (monthOfYear >= startMonthIdx) {
      const row = projection[monthOfYear - startMonthIdx];
      if (!row) return 0;
      return source === 'hn' ? row.monthlyHealthNetRevenue : row.monthlyKaiserRevenue;
    }
    if (source === 'hn') return params.healthNetAnnualization.impliedMonthlyRunRate;
    return params.kaiserCashAnnualization.ytdPaid > 0
      ? params.kaiserCashAnnualization.impliedMonthlyRunRate
      : projection[0]?.monthlyKaiserRevenue || 0;
  };
  const integrateService = (source: 'hn' | 'kaiser', from: number, to: number) => {
    let total = 0;
    for (let m = 0; m < 12; m++) {
      const overlap = Math.min(to, m + 1) - Math.max(from, m);
      if (overlap > 0) total += overlap * serviceRevenueForMonth(source, m);
    }
    return total;
  };
  const restOfYear = (source: 'hn' | 'kaiser', annualization: YtdCashAnnualization) => {
    const ytdServiceEnd = Math.max(0, annualization.ytdThroughMonth - lag);
    const yearEnd = basis === 'cash' ? Math.max(ytdServiceEnd, 12 - lag) : 12;
    return integrateService(source, ytdServiceEnd, yearEnd);
  };

  const healthNetYtdCash = params.healthNetAnnualization.ytdPaid;
  const healthNetRestOfYear = restOfYear('hn', params.healthNetAnnualization);
  const kaiserYtdCash = params.kaiserCashAnnualization.ytdPaid;
  const kaiserRestOfYear = restOfYear('kaiser', params.kaiserCashAnnualization);

  const grantMonths = Math.min(12, Math.max(0, Number(assumptions.grantMonthsCoveredThisYear) || 0));
  const toLine = (
    row: { name: string; annualSalary: number; grantAnnualCovered?: number; endDate?: string },
    isOwner: boolean
  ): CalendarYearPayrollLine => {
    const annualSalary = Math.max(0, Number(row.annualSalary) || 0);
    const fractionOfYear = fractionOfYearOnPayroll(row.endDate, year);
    const covered = Math.min(annualSalary, Math.max(0, Number(row.grantAnnualCovered) || 0));
    return {
      name: row.name,
      isOwner,
      annualSalary,
      endDate: String(row.endDate || ''),
      fractionOfYear,
      wagesInYear: annualSalary * fractionOfYear,
      grantFunding: Math.min(covered * (grantMonths / 12), annualSalary * fractionOfYear),
    };
  };
  const payrollLines = [
    ...assumptions.fixedStaffAnnual.map((row) => toLine(row, false)),
    ...assumptions.ownerAnnualPayroll.map((row) => toLine(row, true)),
  ];
  const staffWages = payrollLines.filter((l) => !l.isOwner).reduce((s, l) => s + l.wagesInYear, 0);
  const ownerWages = payrollLines.filter((l) => l.isOwner).reduce((s, l) => s + l.wagesInYear, 0);
  const grantFunding = payrollLines.reduce((s, l) => s + l.grantFunding, 0);

  const wageRows = [
    ...assumptions.fixedStaffAnnual.map((row) => ({
      annualSalary: Math.max(0, Number(row.annualSalary) || 0) * fractionOfYearOnPayroll(row.endDate, year),
      state: row.state,
    })),
    ...assumptions.ownerAnnualPayroll.map((row) => ({
      annualSalary: Math.max(0, Number(row.annualSalary) || 0),
      state: row.state,
    })),
  ];
  const employerTaxes = estimateEmployerPayrollTaxesBreakdown(wageRows, assumptions);
  const k401Pct = Math.max(0, Number(assumptions.k401EmployerContributionPct) || 0) / 100;
  const k401Employer =
    [...assumptions.fixedStaffAnnual, ...assumptions.ownerAnnualPayroll]
      .filter((row) => resolveK401Eligible(row))
      .reduce(
        (s, row) =>
          s +
          Math.max(0, Number(row.annualSalary) || 0) *
            fractionOfYearOnPayroll((row as StaffPayrollRow).endDate, year),
        0
      ) * k401Pct;

  let mswCost = 0;
  for (let m = 0; m < 12; m++) {
    const row = m >= startMonthIdx ? projection[m - startMonthIdx] : projection[0];
    mswCost += row?.monthlyMswCost || 0;
  }
  const businessCost = params.monthlyBusinessCost * 12;

  const healthNetTotal = healthNetYtdCash + healthNetRestOfYear;
  const kaiserTotal = kaiserYtdCash + kaiserRestOfYear;
  const grantIsTaxableIncome = assumptions.grantIsTaxableIncome !== false;
  const revenueTotal = healthNetTotal + kaiserTotal + (grantIsTaxableIncome ? grantFunding : 0);
  const operatingProfit =
    revenueTotal -
    mswCost -
    staffWages -
    ownerWages -
    employerTaxes.total -
    k401Employer -
    businessCost;
  const cashBalancePlan = Math.max(0, Number(assumptions.cashBalancePlanAnnual) || 0);
  const businessTaxableIncome = operatingProfit - cashBalancePlan;
  const caEntityTax = estimateCaEntityTaxAnnual(businessTaxableIncome, assumptions);

  const ownerCount = Math.max(1, assumptions.ownerAnnualPayroll.length || assumptions.ownerNames.length);
  const ownerPayrollShare = Math.min(100, Math.max(0, assumptions.ownerPayrollSharePct)) / 100;
  const ownerPool = Math.max(0, businessTaxableIncome - caEntityTax);
  const perOwnerBase = ownerWages / ownerCount;
  const perOwnerResidualPayroll = (ownerPool * ownerPayrollShare) / ownerCount;
  const perOwnerDraw = (ownerPool * (1 - ownerPayrollShare)) / ownerCount;
  const personal = estimateOwnerPersonalTaxesAnnual({
    w2Income: perOwnerBase + perOwnerResidualPayroll,
    drawIncome: perOwnerDraw,
    assumptions,
  });
  const perOwnerTotalIncome = perOwnerBase + perOwnerResidualPayroll + perOwnerDraw;
  const ownerFederalTaxTotal = personal.federal * ownerCount;
  const ownerStateTaxTotal = personal.netState * ownerCount;
  const ownerEmployeeFicaTotal = personal.employeeFica * ownerCount;
  const totalFederalTaxes = employerTaxes.federal + ownerFederalTaxTotal;
  const totalStateTaxes = employerTaxes.state + caEntityTax + ownerStateTaxTotal;

  return {
    year,
    basis,
    healthNetYtdCash,
    healthNetRestOfYear,
    healthNetTotal,
    kaiserYtdCash,
    kaiserRestOfYear,
    kaiserTotal,
    grantFunding,
    grantIsTaxableIncome,
    revenueTotal,
    payrollLines,
    staffWages,
    ownerWages,
    employerFederalPayrollTax: employerTaxes.federal,
    employerStatePayrollTax: employerTaxes.state,
    k401Employer,
    mswCost,
    businessCost,
    operatingProfit,
    cashBalancePlan,
    cashBalanceSuggested: Math.min(params.estimatedCashBalanceMaxAnnual, Math.max(0, operatingProfit)),
    businessTaxableIncome,
    caEntityTax,
    perOwnerTotalIncome,
    perOwnerAfterTax: perOwnerTotalIncome - personal.total,
    ownerFederalTaxTotal,
    ownerStateTaxTotal,
    ownerEmployeeFicaTotal,
    totalFederalTaxes,
    totalStateTaxes,
    totalTaxesEstimated: totalFederalTaxes + totalStateTaxes + ownerEmployeeFicaTotal,
  };
}

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

  const activeFixedStaff = assumptions.fixedStaffAnnual.filter((row) => {
    const end = parseDateMaybe(row.endDate);
    return !end || end.getTime() >= asOf.getTime();
  });
  const fixedStaffAnnualTotal = activeFixedStaff.reduce(
    (sum, row) => sum + Number(row.annualSalary || 0),
    0
  );
  const ownerPayrollAnnualTotal = assumptions.ownerAnnualPayroll.reduce(
    (sum, row) => sum + Number(row.annualSalary || 0),
    0
  );
  const totalStaffPayrollAnnual = fixedStaffAnnualTotal + ownerPayrollAnnualTotal;
  const allWageRows = [
    ...activeFixedStaff.map((row) => ({
      annualSalary: Number(row.annualSalary || 0),
      state: row.state,
    })),
    ...assumptions.ownerAnnualPayroll.map((row) => ({
      annualSalary: Number(row.annualSalary || 0),
      state: row.state,
    })),
  ];
  const employerPayrollTaxes = estimateEmployerPayrollTaxesBreakdown(allWageRows, assumptions);
  const employerPayrollTaxAnnual = employerPayrollTaxes.total;
  const employerFederalPayrollTaxAnnual = employerPayrollTaxes.federal;
  const employerStatePayrollTaxAnnual = employerPayrollTaxes.state;
  const k401EligibleRows = [
    ...activeFixedStaff.filter((row) => resolveK401Eligible(row)),
    ...assumptions.ownerAnnualPayroll.filter((row) => resolveK401Eligible(row)),
  ];
  const k401EligibleNames = k401EligibleRows.map((row) => String(row.name || '').trim()).filter(Boolean);
  const k401EligiblePayrollAnnual = k401EligibleRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.annualSalary) || 0),
    0
  );
  const k401Pct = Math.max(0, Number(assumptions.k401EmployerContributionPct) || 0) / 100;
  const k401EmployerAnnual = k401EligiblePayrollAnnual * k401Pct;
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
  const healthNetAnnualization = estimateAnnualFromYtdWithPaymentLag({
    ytdPaid: assumptions.healthNetYtdPaid,
    asOf,
    ytdThroughMonth: assumptions.revenueYtdThroughMonth,
    paymentLagMonths: assumptions.paymentLagMonths,
  });
  const kaiserCashAnnualization = estimateAnnualFromYtdWithPaymentLag({
    ytdPaid: assumptions.kaiserYtdPaid,
    asOf,
    ytdThroughMonth: assumptions.revenueYtdThroughMonth,
    paymentLagMonths: assumptions.paymentLagMonths,
  });
  const currentMonthlyKaiserRevenue = currentAuthorizedCount * assumptions.monthlyRatePerMember;
  const healthNetBaseMonthly = healthNetAnnualization.impliedMonthlyRunRate;
  const healthNetFlatAnnualIfNoDecline = healthNetAnnualization.estimatedAnnual;
  const currentMonthlyHealthNetRevenue = healthNetRevenueForProjectionMonth({
    baseMonthly: healthNetBaseMonthly,
    monthIndex: 0,
    asOf,
    declinePct: assumptions.healthNetMonthlyDeclinePct,
    programEndMonth: assumptions.healthNetProgramEndMonth,
  });
  const currentMonthlyRevenue = currentMonthlyKaiserRevenue + currentMonthlyHealthNetRevenue;
  const currentMonthlyMswCost = currentAuthorizedCount * (mswAnnualPerMember / 12);
  const currentAnnualKaiserRevenueRunRate = currentMonthlyKaiserRevenue * 12;
  const currentAnnualMswCost = currentMonthlyMswCost * 12;

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
  let yearKaiserRevenueTotal = 0;
  let yearHealthNetRevenueTotal = 0;
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
    const monthlyKaiserRevenue = activeMembers * assumptions.monthlyRatePerMember;
    const monthlyHealthNetRevenue = healthNetRevenueForProjectionMonth({
      baseMonthly: healthNetBaseMonthly,
      monthIndex,
      asOf,
      declinePct: assumptions.healthNetMonthlyDeclinePct,
      programEndMonth: assumptions.healthNetProgramEndMonth,
    });
    const monthlyRevenue = monthlyKaiserRevenue + monthlyHealthNetRevenue;
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

    yearKaiserRevenueTotal += monthlyKaiserRevenue;
    yearHealthNetRevenueTotal += monthlyHealthNetRevenue;
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
      monthlyKaiserRevenue,
      monthlyHealthNetRevenue,
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

  const currentAnnualHealthNetRevenue = yearHealthNetRevenueTotal;
  const currentAnnualRevenueRunRate =
    currentAnnualKaiserRevenueRunRate + currentAnnualHealthNetRevenue;
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

  const yearStaffPayrollCost = monthlyStaffPayrollCost * assumptions.projectionMonths;
  const yearEmployerPayrollTax = monthlyEmployerPayrollTax * assumptions.projectionMonths;
  const yearEmployerFederalPayrollTax =
    (employerFederalPayrollTaxAnnual / 12) * assumptions.projectionMonths;
  const yearEmployerStatePayrollTax =
    (employerStatePayrollTaxAnnual / 12) * assumptions.projectionMonths;
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
  const yearOwnerFederalTaxTotal = yearPersonalTax.federal * ownerCount;
  const yearOwnerStateTaxTotal = yearPersonalTax.netState * ownerCount;
  const yearOwnerEmployeeFicaTotal = yearPersonalTax.employeeFica * ownerCount;
  const yearTotalFederalTaxes = yearEmployerFederalPayrollTax + yearOwnerFederalTaxTotal;
  const yearTotalStateTaxes =
    yearEmployerStatePayrollTax + yearCaEntityTax + yearOwnerStateTaxTotal;
  const yearTotalTaxesEstimated =
    yearTotalFederalTaxes + yearTotalStateTaxes + yearOwnerEmployeeFicaTotal;

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
    k401EligiblePayrollAnnual,
    k401EligibleNames,
    employerPayrollTaxAnnual,
    employerFederalPayrollTaxAnnual,
    employerStatePayrollTaxAnnual,
    k401EmployerAnnual,
    monthlyBusinessCostTotal: monthlyBusinessCost,
    annualBusinessCostTotal,
    cashBalancePlanAnnual,
    estimatedCashBalanceMaxAnnual,
    estimatedCashBalanceMaxByOwner,
    cashBalanceProfitRoomAnnual: Math.max(0, yearOperatingProfit),
    cashBalanceSuggestedAnnual: Math.min(
      estimatedCashBalanceMaxAnnual,
      Math.max(0, yearOperatingProfit)
    ),
    mswAnnualPerMember,
    healthNetAnnualization,
    kaiserCashAnnualization,
    healthNetFlatAnnualIfNoDecline,
    currentMonthlyKaiserRevenue,
    currentMonthlyHealthNetRevenue,
    currentMonthlyRevenue,
    currentAnnualKaiserRevenueRunRate,
    currentAnnualHealthNetRevenue,
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
    yearKaiserRevenueTotal,
    yearHealthNetRevenueTotal,
    yearRevenueTotal,
    yearMswCostTotal,
    yearStaffPayrollCost,
    yearEmployerPayrollTax,
    yearEmployerFederalPayrollTax,
    yearEmployerStatePayrollTax,
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
    yearOwnerFederalTaxTotal,
    yearOwnerStateTaxTotal,
    yearOwnerEmployeeFicaTotal,
    yearTotalFederalTaxes,
    yearTotalStateTaxes,
    yearTotalTaxesEstimated,
    yearCompanyAfterOwnerComp: yearEarningsAfterEntityTax - yearPositiveOwnerPool,
    calendarYear: buildCalendarYearTaxEstimate({
      asOf,
      assumptions,
      projection,
      healthNetAnnualization,
      kaiserCashAnnualization,
      monthlyBusinessCost,
      estimatedCashBalanceMaxAnnual,
    }),
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
