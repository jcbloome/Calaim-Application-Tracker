/**
 * Minimal X12 271 (eligibility response) decoder for Claim.MD batch eligibility results.
 * Handles multiple interchanges per file and any delimiters declared in the ISA segment.
 */

export type EligibilityOutcome = 'active' | 'inactive' | 'rejected' | 'unknown';

export type EligibilityBenefit = {
  code: string;
  label: string;
  coverageLevel: string;
  serviceTypes: string[];
  insuranceType: string;
  planDescription: string;
  dates: string[];
  messages: string[];
  entities: string[];
};

export type EligibilityResult = {
  payerName: string;
  payerId: string;
  lastName: string;
  firstName: string;
  memberId: string;
  birthDate: string;
  sex: string;
  traceNumbers: string[];
  outcome: EligibilityOutcome;
  rejections: Array<{ code: string; label: string; followUp: string }>;
  dates: string[];
  references: string[];
  benefits: EligibilityBenefit[];
  segments: string[];
};

export const ELIGIBILITY_CODES: Record<string, string> = {
  '1': 'Active coverage',
  '2': 'Active - full risk capitation',
  '3': 'Active - services capitated',
  '4': 'Active - services capitated to PCP',
  '5': 'Active - pending investigation',
  '6': 'Inactive',
  '7': 'Inactive - pending eligibility update',
  '8': 'Inactive - pending investigation',
  A: 'Co-insurance',
  B: 'Co-payment',
  C: 'Deductible',
  CB: 'Coverage basis',
  D: 'Benefit description',
  E: 'Exclusions',
  F: 'Limitations',
  G: 'Out of pocket (stop loss)',
  H: 'Unlimited',
  I: 'Non-covered',
  J: 'Cost containment',
  K: 'Reserve',
  L: 'Primary care provider',
  M: 'Pre-existing condition',
  MC: 'Managed care coordinator',
  N: 'Services restricted to following provider',
  O: 'Not deemed a medical necessity',
  P: 'Benefit disclaimer',
  Q: 'Second surgical opinion required',
  R: 'Other or additional payer',
  S: 'Prior year(s) history',
  T: 'Card(s) reported lost/stolen',
  U: 'Contact following entity for eligibility or benefit information',
  V: 'Cannot process',
  W: 'Other source of data',
  X: 'Health care facility',
  Y: 'Spend down',
};

const ACTIVE_CODES = new Set(['1', '2', '3', '4', '5']);
const INACTIVE_CODES = new Set(['6', '7', '8']);

export const REJECT_REASONS: Record<string, string> = {
  '04': 'Authorized quantity exceeded',
  '15': 'Required application data missing',
  '41': 'Authorization/access restrictions',
  '42': 'Unable to respond at current time',
  '43': 'Invalid/missing provider identification',
  '44': 'Invalid/missing provider name',
  '45': 'Invalid/missing provider specialty',
  '46': 'Invalid/missing provider phone number',
  '47': 'Invalid/missing provider state',
  '48': 'Invalid/missing referring provider ID',
  '49': 'Provider is not primary care physician',
  '50': 'Provider ineligible for inquiries',
  '51': 'Provider not on file',
  '52': 'Service dates not within provider plan enrollment',
  '53': 'Inquired benefit inconsistent with provider type',
  '54': 'Inappropriate product/service ID qualifier',
  '55': 'Inappropriate product/service ID',
  '56': 'Inappropriate date',
  '57': 'Invalid/missing date(s) of service',
  '58': 'Invalid/missing date of birth',
  '60': 'Date of birth follows date(s) of service',
  '61': 'Date of death precedes date(s) of service',
  '62': 'Date of service not within allowable inquiry period',
  '63': 'Date of service in future',
  '64': 'Invalid/missing patient ID',
  '65': 'Invalid/missing patient name',
  '66': 'Invalid/missing patient gender',
  '67': 'Patient not found',
  '68': 'Duplicate patient ID number',
  '69': "Inconsistent with patient's age",
  '70': "Inconsistent with patient's gender",
  '71': 'Birth date does not match payer record',
  '72': 'Invalid/missing subscriber ID',
  '73': 'Invalid/missing subscriber name',
  '74': 'Invalid/missing subscriber gender',
  '75': 'Subscriber not found',
  '76': 'Duplicate subscriber ID number',
  '77': 'Subscriber found, patient not found',
  '78': 'Subscriber not in group/plan identified',
  '79': 'Invalid participant identification',
  '80': 'No response received - transaction terminated',
  '97': 'Invalid or missing provider address',
  T4: 'Payer name or identifier missing',
};

const SERVICE_TYPES: Record<string, string> = {
  '1': 'Medical care',
  '30': 'Health benefit plan coverage',
  '33': 'Chiropractic',
  '35': 'Dental care',
  '42': 'Home health care',
  '45': 'Hospice',
  '47': 'Hospital',
  '48': 'Hospital - inpatient',
  '50': 'Hospital - outpatient',
  '54': 'Long term care',
  '56': 'Medically related transportation',
  '86': 'Emergency services',
  '88': 'Pharmacy',
  '98': 'Physician office visit',
  AL: 'Vision',
  MH: 'Mental health',
  UC: 'Urgent care',
};

const INSURANCE_TYPES: Record<string, string> = {
  MC: 'Medicaid (Medi-Cal)',
  HM: 'HMO',
  HN: 'HMO Medicare risk',
  MA: 'Medicare Part A',
  MB: 'Medicare Part B',
  MP: 'Medicare primary',
  QM: 'Qualified Medicare beneficiary',
  C1: 'Commercial',
  PR: 'PPO',
  PS: 'POS',
  EP: 'EPO',
  IN: 'Indemnity',
  OT: 'Other',
};

const COVERAGE_LEVELS: Record<string, string> = {
  IND: 'Individual',
  FAM: 'Family',
  EMP: 'Employee',
  ESP: 'Employee and spouse',
  CHD: 'Children only',
};

const DATE_QUALIFIERS: Record<string, string> = {
  '102': 'Issue',
  '291': 'Plan',
  '307': 'Eligibility',
  '318': 'Added',
  '340': 'COBRA begin',
  '341': 'COBRA end',
  '346': 'Plan begin',
  '347': 'Plan end',
  '348': 'Benefit begin',
  '349': 'Benefit end',
  '356': 'Eligibility begin',
  '357': 'Eligibility end',
  '435': 'Admission',
  '472': 'Service',
  '636': 'Last update',
};

const REF_QUALIFIERS: Record<string, string> = {
  '6P': 'Group number',
  '18': 'Plan number',
  '1L': 'Group/policy number',
  '1W': 'Member ID',
  '49': 'Family unit number',
  F6: 'Medicare (HIC) number',
  IG: 'Insurance policy number',
  N6: 'Plan network ID',
  NQ: 'Medicaid recipient ID',
  SY: 'SSN',
  Q4: 'Prior ID',
  EJ: 'Patient account number',
};

const label = (map: Record<string, string>, code: string) => (code ? map[code] || code : '');

function formatX12Date(format: string, value: string) {
  const one = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(4, 6)}/${v.slice(6, 8)}/${v.slice(0, 4)}` : v);
  if (format === 'RD8' && value.includes('-')) {
    const [from, to] = value.split('-');
    return `${one(from)} – ${one(to)}`;
  }
  return one(value);
}

/** Split raw X12 text into segments of elements, using the delimiters declared in each ISA. */
export function splitX12Segments(raw: string): string[][] {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  const isaIdx = text.indexOf('ISA');
  if (isaIdx < 0) throw new Error('This does not look like an X12 file (no ISA header found).');
  const body = text.slice(isaIdx);
  const elementSep = body[3];
  let seen = 0;
  let segmentTerm = '~';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === elementSep && ++seen === 16) {
      segmentTerm = body[i + 2] || '~';
      break;
    }
  }
  const pieces = /[\r\n]/.test(segmentTerm) ? body.split(/\r?\n|\r/) : body.split(segmentTerm);
  return pieces
    .map((p) => p.replace(/^[\r\n\s]+|[\r\n\s]+$/g, ''))
    .filter(Boolean)
    .map((p) => p.split(elementSep));
}

/** Decode every subscriber/dependent (HL 22/23) in one or more 271 interchanges. */
export function decode271(raw: string): EligibilityResult[] {
  const segments = splitX12Segments(raw);
  if (!segments.some((s) => s[0] === 'ST' && s[1] === '271')) {
    const types = [...new Set(segments.filter((s) => s[0] === 'ST').map((s) => s[1]))];
    throw new Error(`No 271 eligibility responses found${types.length ? ` (file contains ${types.join(', ')})` : ''}.`);
  }
  const results: EligibilityResult[] = [];
  let payerName = '';
  let payerId = '';
  let current: EligibilityResult | null = null;
  let benefit: EligibilityBenefit | null = null;
  let hlLevel = '';

  const finish = () => {
    if (!current) return;
    const codes = current.benefits.map((b) => b.code);
    current.outcome = codes.some((c) => ACTIVE_CODES.has(c))
      ? 'active'
      : codes.some((c) => INACTIVE_CODES.has(c))
        ? 'inactive'
        : current.rejections.length
          ? 'rejected'
          : 'unknown';
    results.push(current);
    current = null;
    benefit = null;
  };

  for (const e of segments) {
    const tag = e[0];
    const at = (i: number) => String(e[i] ?? '').trim();
    if (tag === 'HL') {
      hlLevel = at(3);
      if (hlLevel === '20' || hlLevel === '21' || hlLevel === '22' || hlLevel === '23') finish();
      if (hlLevel === '22' || hlLevel === '23') {
        current = {
          payerName,
          payerId,
          lastName: '',
          firstName: '',
          memberId: '',
          birthDate: '',
          sex: '',
          traceNumbers: [],
          outcome: 'unknown',
          rejections: [],
          dates: [],
          references: [],
          benefits: [],
          segments: [],
        };
      }
      continue;
    }
    if (tag === 'SE' || tag === 'GE' || tag === 'IEA') {
      finish();
      continue;
    }
    if (current) current.segments.push(e.join('*'));

    if (!current) {
      if (hlLevel === '20' && tag === 'NM1' && at(1) === 'PR') {
        payerName = at(3);
        payerId = at(9);
      }
      continue;
    }

    if (tag === 'EB') {
      benefit = {
        code: at(1),
        label: label(ELIGIBILITY_CODES, at(1)),
        coverageLevel: label(COVERAGE_LEVELS, at(2)),
        serviceTypes: at(3)
          .split(/[\^:>]/)
          .filter(Boolean)
          .map((c) => label(SERVICE_TYPES, c)),
        insuranceType: label(INSURANCE_TYPES, at(4)),
        planDescription: at(5),
        dates: [],
        messages: [],
        entities: [],
      };
      current.benefits.push(benefit);
      continue;
    }

    if (benefit) {
      if (tag === 'DTP') benefit.dates.push(`${label(DATE_QUALIFIERS, at(1))}: ${formatX12Date(at(2), at(3))}`);
      else if (tag === 'MSG') benefit.messages.push(at(1));
      else if (tag === 'NM1') benefit.entities.push([at(3), at(4)].filter(Boolean).join(', ') + (at(9) ? ` (${at(9)})` : ''));
      else if (tag === 'PER') benefit.entities.push([at(2), at(4)].filter(Boolean).join(' '));
      else if (tag === 'REF') benefit.messages.push(`${label(REF_QUALIFIERS, at(1))}: ${at(2)}`);
      continue;
    }

    if (tag === 'NM1' && (at(1) === 'IL' || at(1) === '03')) {
      current.lastName = at(3);
      current.firstName = at(4);
      if (at(9)) current.memberId = at(9);
    } else if (tag === 'TRN') {
      if (at(2)) current.traceNumbers.push(at(2));
    } else if (tag === 'DMG') {
      current.birthDate = formatX12Date(at(1), at(2));
      current.sex = at(3);
    } else if (tag === 'DTP') {
      current.dates.push(`${label(DATE_QUALIFIERS, at(1))}: ${formatX12Date(at(2), at(3))}`);
    } else if (tag === 'REF') {
      current.references.push(`${label(REF_QUALIFIERS, at(1))}: ${at(2)}`);
    } else if (tag === 'AAA') {
      current.rejections.push({ code: at(3), label: label(REJECT_REASONS, at(3)), followUp: at(4) });
    }
  }
  finish();
  return results;
}

/** One-line description of the coverage found, for tables and CSV export. */
export function summarizeCoverage(result: EligibilityResult): string {
  if (result.outcome === 'rejected') {
    return result.rejections.map((r) => r.label).join('; ');
  }
  const primary = result.benefits.filter((b) => ACTIVE_CODES.has(b.code) || INACTIVE_CODES.has(b.code));
  const parts = (primary.length ? primary : result.benefits.slice(0, 3)).map((b) =>
    [b.label, b.insuranceType, b.planDescription].filter(Boolean).join(' · ')
  );
  return [...new Set(parts)].join('; ');
}

/** Coverage dates from the subscriber and from active/inactive benefit lines. */
export function coverageDates(result: EligibilityResult): string[] {
  const fromBenefits = result.benefits
    .filter((b) => ACTIVE_CODES.has(b.code) || INACTIVE_CODES.has(b.code))
    .flatMap((b) => b.dates);
  return [...new Set([...result.dates, ...fromBenefits])];
}

/** Other payers / managed care plans named in the response (EB R, U, L, MC lines). */
export function otherEntities(result: EligibilityResult): string[] {
  return [
    ...new Set(
      result.benefits
        .filter((b) => ['R', 'U', 'L', 'MC'].includes(b.code) || ACTIVE_CODES.has(b.code))
        .flatMap((b) => b.entities)
        .filter(Boolean)
    ),
  ];
}
