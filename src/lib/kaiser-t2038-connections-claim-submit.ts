/**
 * Build Connections Claim Submission rows for CalAIM_Claim_Submit_T2038
 * (Caspio datapage "Connections Claim Submission (T2038)"), then SDS 837P.
 */
import {
  DEFAULT_T2038_CLAIM_SETTINGS,
  formatCompactDate,
  formatUsDate,
  parseDateOnly,
  startOfToday,
  T2038_BILLING_PROVIDER,
  T2038_CLAIM_DUE_DAYS,
  T2038_CLAIM_SUBMIT_TABLE,
  T2038_PROC_CODE,
  type T2038ClaimSettings,
} from '@/lib/t2038-claims';
import {
  billingFromT2038Settings,
  to837ClaimInput,
  withKaiserRegion,
  type KaiserSdsClaimRow,
} from '@/lib/kaiser-sds-t2038-claims';
import { build837P } from '@/lib/x12-837p';
import type { Edi270Settings } from '@/lib/x12-270';
import {
  CLAIM_AUDIT_GAP_MAX_AGE_MONTHS,
  isActionableClaimAuditMonth,
  monthKeyFromDate,
} from '@/lib/kaiser-t2038-claim-audit';

export const CONNECTIONS_CLAIM_SUBMIT_TABLE = T2038_CLAIM_SUBMIT_TABLE;
export const CONNECTIONS_OR_RCFE_CLAIM_VALUE = 'Connections Claim Submission';

/** Fixed Connections service location + payee (always Connections, never RCFE). */
export const CONNECTIONS_CLAIM_FIXED = {
  Service_Location_Name: T2038_BILLING_PROVIDER.name,
  Service_Location_Address: T2038_BILLING_PROVIDER.address,
  Service_Location_City: T2038_BILLING_PROVIDER.city,
  Service_Location_State: T2038_BILLING_PROVIDER.state,
  /** Caspio datapage shows zip+4 without hyphen. */
  Service_Location_Zip: '922625353',
  Payee_Organization: T2038_BILLING_PROVIDER.name,
  Payee_Address: T2038_BILLING_PROVIDER.address,
  Payee_City: T2038_BILLING_PROVIDER.city,
  Payee_State: T2038_BILLING_PROVIDER.state,
  Payee_Zip: '922625353',
  Payee_Telephone: '800-330-5993',
  Payee_NPI: DEFAULT_T2038_CLAIM_SETTINGS.billNpi,
  Connections_or_RCFE_Claim: CONNECTIONS_OR_RCFE_CLAIM_VALUE,
  /** Live CalAIM_Claim_Submit_T2038 field (not Connections_T2038_Total_Charges). */
  Total_Charges: 432,
  Connections_Monthly_PMPM_Rate: 432,
  MCO_T2038_Amount: 432,
} as const;

export type ClaimSubmitSubmitter = {
  email: string;
  firstName: string;
  lastName: string;
  /** Caspio User_IDfk when known (Jason Bloome = 25 on live datapage). */
  userIdFk?: string | number;
};

export type ConnectionsT2038ClaimPreview = {
  id: string;
  clientId2: string;
  monthKey: string;
  monthLabel: string;
  dateOfService: string;
  dateOfServiceIso: string;
  /** Prior claimed claim DOS used for the 30-day spacing rule. */
  lastDateOfService: string;
  /** True when DOS was moved later to satisfy ≥30 days after last claimed claim. */
  dosAdjustedForLastClaim: boolean;
  memberName: string;
  blockers: string[];
  /** Human-readable field list for the preview card. */
  displayFields: Array<{ label: string; value: string; source: 'member' | 'fixed' | 'claim' | 'submitter' }>;
  /** Body ready for Caspio POST /records. */
  caspioBody: Record<string, string | number>;
  /** Raw member fields used for diagnostics / RCFE. */
  fromMember: Record<string, string>;
};

const clean = (value: unknown) => String(value ?? '').trim();

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return '';
};

/** Caspio list fields often expect 2-letter state codes. */
function toUsStateCode(value: unknown): string {
  const raw = clean(value);
  if (!raw) return '';
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  const map: Record<string, string> = {
    california: 'CA',
    arizona: 'AZ',
    nevada: 'NV',
    oregon: 'OR',
    washington: 'WA',
    texas: 'TX',
    florida: 'FL',
    newyork: 'NY',
  };
  return map[key] || raw;
}

/** Match Connections Claim Submission SNF list values when possible. */
function normalizeSnfPathway(value: unknown): string {
  const raw = clean(value);
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('diversion')) return 'Diversion';
  if (key.includes('transition')) return 'Transition';
  return raw;
}

/** New claimable Date_of_Service must be at least this many days after the last claimed claim. */
export const T2038_MIN_DAYS_AFTER_LAST_DOS = T2038_CLAIM_DUE_DAYS; // 30

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * PMPM DOS for a claimable month:
 * - prefer the 1st of the month (clamped into auth start)
 * - never earlier than last *claimed* claim Date_of_Service + 30 days
 * - must still be on/before Auth_End when Auth_End exists
 */
export function dateOfServiceForClaimMonth(
  monthKey: string,
  authStart?: string | Date | null,
  authEnd?: string | Date | null,
  lastDateOfService?: string | Date | null,
  minGapDays = T2038_MIN_DAYS_AFTER_LAST_DOS
): { date: Date | null; blockers: string[]; adjustedForLastDos: boolean; lastDosLabel: string } {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return { date: null, blockers: ['Invalid month key'], adjustedForLastDos: false, lastDosLabel: '' };
  }
  const start = authStart instanceof Date ? authStart : parseDateOnly(authStart);
  const end = authEnd instanceof Date ? authEnd : parseDateOnly(authEnd);
  const last = lastDateOfService instanceof Date ? startOfToday(lastDateOfService) : parseDateOnly(lastDateOfService);
  const lastDosLabel = last ? formatUsDate(last) : '';

  let dos = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (start && dos.getTime() < start.getTime()) {
    dos = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  }

  let adjustedForLastDos = false;
  if (last) {
    const minDos = addDays(last, Math.max(1, minGapDays));
    if (dos.getTime() < minDos.getTime()) {
      dos = minDos;
      adjustedForLastDos = true;
    }
  }

  const blockers: string[] = [];
  if (end && dos.getTime() > end.getTime()) {
    blockers.push(
      last
        ? `Date_of_Service must be ≥${minGapDays} days after last claimed claim ${lastDosLabel}, but that falls after Auth_End ${formatUsDate(end)}`
        : `Date_of_Service falls after Auth_End ${formatUsDate(end)}`
    );
    return { date: null, blockers, adjustedForLastDos, lastDosLabel };
  }

  return { date: dos, blockers, adjustedForLastDos, lastDosLabel };
}

function formatMonthLabel(monthKey: string) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function splitDisplayName(full: string): { first: string; last: string } {
  const cleaned = clean(full);
  if (!cleaned) return { first: '', last: '' };
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((part) => part.trim());
    return { first: first || '', last: last || '' };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * Fallback User_IDfk when connect_tbl_usersregistration lookup misses.
 * Prefer resolving from usersregistration (User_ID) matched to Kaiser Staff name.
 */
export function resolveConnectionsClaimUserIdFk(email: string): number | undefined {
  const key = clean(email).toLowerCase();
  if (key === 'jason@carehomefinders.com') return 25;
  return undefined;
}

/**
 * Map CalAIM_tbl_Members (+ claim month) → preview + Caspio insert body
 * matching the Connections Claim Submission datapage.
 */
export function buildConnectionsT2038ClaimPreview(opts: {
  rawMember: Record<string, unknown>;
  monthKey: string;
  submitter: ClaimSubmitSubmitter;
  settings?: T2038ClaimSettings;
  /** Last claimed claim Date_of_Service — new claimable DOS must be ≥ 30 days after this. */
  lastDateOfService?: string | Date | null;
}): ConnectionsT2038ClaimPreview {
  const raw = opts.rawMember || {};
  const settings = opts.settings || DEFAULT_T2038_CLAIM_SETTINGS;
  const clientId2 = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2);
  const clientFirst = pickFirst(raw.Senior_First, raw.Client_First, raw.memberFirstName);
  const clientLast = pickFirst(raw.Senior_Last, raw.Client_Last, raw.memberLastName);
  const birthdate = formatUsDate(
    parseDateOnly(
      pickFirst(
        raw.Birth_Date,
        raw.Senior_DOB,
        raw.Client_Birthdate,
        raw.DOB,
        raw.Date_of_Birth,
        raw.Member_DOB
      )
    )
  );
  // MCP_CIN on CalAIM_tbl_Members is often blank; Medi-Cal Number / Medical_Number holds the CIN.
  const mcpCin = pickFirst(
    raw.MCP_CIN,
    raw.MediCal_Number,
    raw.Medi_Cal_Number,
    raw.Medical_Number,
    raw.CIN,
    raw.MC
  );
  // Same fallback chain as claim-audit MRN: Kaiser_MRN → Member_MRN → MRN → MCP_CIN / Medi-Cal.
  const kaiserMrn = pickFirst(
    raw.Kaiser_MRN,
    raw.Member_MRN,
    raw.MRN,
    raw.MCP_CIN,
    raw.MediCal_Number,
    raw.Medi_Cal_Number,
    raw.Medical_Number,
    raw.CIN
  );
  const gender = (() => {
    const g = pickFirst(raw.Gender, raw.Sex, raw.Member_Gender, raw.Senior_Gender).toUpperCase();
    if (g.startsWith('M')) return 'M';
    if (g.startsWith('F')) return 'F';
    return g.slice(0, 1);
  })();
  const snf = normalizeSnfPathway(
    pickFirst(raw.SNF_Diversion_or_Transition, raw.SNF_Diversion_Transition, raw.Pathway)
  );
  const mcp = pickFirst(raw.CalAIM_MCO, raw.MCP, raw.memberHealthPlan) || 'Kaiser';
  const locationName = pickFirst(
    raw.Current_Location_Name,
    raw.RCFE_Name,
    raw.Name_Where_Residing,
    raw.ISP_Current_Location,
    raw.Facility_Name
  );
  const rcfeAddress = pickFirst(raw.RCFE_Address, raw.RCFE_Street, raw.Normal_Housing_Street);
  const rcfeCity = pickFirst(raw.RCFE_City, raw.Normal_Housing_City);
  const rcfeState = toUsStateCode(pickFirst(raw.RCFE_State, raw.Normal_Housing_State, 'CA')) || 'CA';
  const rcfeZip = pickFirst(raw.RCFE_Zip, raw.Normal_Housing_Zip);
  const mcoName = pickFirst(raw.MCO_Name, raw.CalAIM_MCO, mcp);
  const authEnd = formatUsDate(
    parseDateOnly(
      pickFirst(raw.Authorization_End_Date_T2038, raw.Authorization_End_T2038, raw.Auth_End, raw.Auth_End_Date_T2038)
    )
  );
  const authStart = formatUsDate(
    parseDateOnly(pickFirst(raw.Authorization_Start_Date_T2038, raw.Authorization_Start_T2038))
  );
  const diag1 = pickFirst(raw.Diagnostic_Code1, raw.Diagnostic_ICD_Code_1, raw.Diagnostic_Code, settings.diag1)
    .replace(/\./g, '')
    .toUpperCase();
  const diag2 = pickFirst(raw.Diagnostic_Code2, raw.Diagnostic_ICD_Code_2).replace(/\./g, '').toUpperCase();
  const diag3 = pickFirst(raw.Diagnostic_Code3, raw.Diagnostic_ICD_Code_3).replace(/\./g, '').toUpperCase();
  const diagText1 = pickFirst(raw.Diagnostic_CodeText1, raw.Diagnostic_Code_Text1);
  const diagText2 = pickFirst(raw.Diagnostic_CodeText2, raw.Diagnostic_Code_Text2);
  const diagText3 = pickFirst(raw.Diagnostic_CodeText3, raw.Diagnostic_Code_Text3);

  const dosResult = dateOfServiceForClaimMonth(
    opts.monthKey,
    authStart,
    authEnd,
    opts.lastDateOfService
  );
  const dos = dosResult.date;
  const dateOfService = formatUsDate(dos);
  const dateOfServiceIso = dos ? formatCompactDate(dos) : '';

  const submitterFirst =
    clean(opts.submitter.firstName) || splitDisplayName(opts.submitter.email.split('@')[0] || '').first;
  const submitterLast = clean(opts.submitter.lastName);
  const userIdFk =
    opts.submitter.userIdFk ?? resolveConnectionsClaimUserIdFk(opts.submitter.email) ?? '';

  const submitterFull = [submitterFirst, submitterLast].filter(Boolean).join(' ').trim();

  const fromMember: Record<string, string> = {
    Client_ID2: clientId2,
    Client_First: clientFirst,
    Client_Last: clientLast,
    Client_Birthdate: birthdate,
    MCP_CIN: mcpCin,
    Kaiser_MRN: kaiserMrn,
    Sex: gender,
    SNF_Diversion_Transition: snf,
    MCP: mcp,
    Current_Location_Name_Var: locationName,
    RCFE_Name: locationName,
    RCFE_Address: rcfeAddress,
    RCFE_City: rcfeCity,
    RCFE_State: rcfeState,
    RCFE_Zip: rcfeZip,
    MCO_Name: mcoName,
    Auth_End: authEnd,
    Auth_Start: authStart,
    Diagnostic_Code_1: diag1,
    Diagnostic_Code_2: diag2,
    Diagnostic_Code_3: diag3,
    Diagnostic_Code_Text1: diagText1,
    Diagnostic_Code_Text2: diagText2,
    Diagnostic_Code_Text3: diagText3,
  };

  // Field names must match live CalAIM_Claim_Submit_T2038 (Caspio FieldNotFound otherwise).
  const caspioBody: Record<string, string | number> = {
    Client_ID2: clientId2 ? Number(clientId2) || clientId2 : '',
    Client_First: clientFirst,
    Client_Last: clientLast,
    Client_Birthdate: birthdate,
    MCP_CIN: mcpCin,
    Kaiser_MRN: kaiserMrn,
    Sex: gender,
    SNF_Diversion_Transition: snf,
    MCP: mcp.includes('Kaiser') ? 'Kaiser' : mcp,
    Connections_or_RCFE_Claim: CONNECTIONS_OR_RCFE_CLAIM_VALUE,
    Current_Location_Name_Var: locationName,
    RCFE_Name: locationName,
    RCFE_Address: rcfeAddress,
    RCFE_City: rcfeCity,
    RCFE_State: rcfeState,
    RCFE_Zip: rcfeZip,
    MCO_Name: mcoName,
    Total_Charges: CONNECTIONS_CLAIM_FIXED.Total_Charges,
    Connections_Monthly_PMPM_Rate: CONNECTIONS_CLAIM_FIXED.Connections_Monthly_PMPM_Rate,
    MCO_T2038_Amount: CONNECTIONS_CLAIM_FIXED.MCO_T2038_Amount,
    Date_of_Service: dateOfService,
    Auth_End: authEnd,
    Auth_Start: authStart,
    Diagnostic_Code_1: diag1,
    Diagnostic_Code_2: diag2,
    Diagnostic_Code_3: diag3,
    Diagnostic_Code_Text1: diagText1,
    Diagnostic_Code_Text2: diagText2,
    Diagnostic_Code_Text3: diagText3,
    Service_Location_Name: CONNECTIONS_CLAIM_FIXED.Service_Location_Name,
    Service_Location_Address: CONNECTIONS_CLAIM_FIXED.Service_Location_Address,
    Service_Location_City: CONNECTIONS_CLAIM_FIXED.Service_Location_City,
    Service_Location_State: CONNECTIONS_CLAIM_FIXED.Service_Location_State,
    Service_Location_Zip: CONNECTIONS_CLAIM_FIXED.Service_Location_Zip,
    Payee_Organization: CONNECTIONS_CLAIM_FIXED.Payee_Organization,
    Payee_Address: CONNECTIONS_CLAIM_FIXED.Payee_Address,
    Payee_City: CONNECTIONS_CLAIM_FIXED.Payee_City,
    Payee_State: CONNECTIONS_CLAIM_FIXED.Payee_State,
    Payee_Zip: CONNECTIONS_CLAIM_FIXED.Payee_Zip,
    Payee_Telephone: CONNECTIONS_CLAIM_FIXED.Payee_Telephone,
    Payee_NPI: CONNECTIONS_CLAIM_FIXED.Payee_NPI,
    Email_Submitter: clean(opts.submitter.email),
    Name_of_Submitter: submitterFull,
    User_First: submitterFirst,
    User_Last: submitterLast,
  };
  if (userIdFk !== '' && userIdFk !== undefined) {
    caspioBody.User_IDfk = typeof userIdFk === 'number' ? userIdFk : Number(userIdFk) || String(userIdFk);
  }

  // Drop empty optional strings so Caspio required-field errors stay clear.
  // Omit Claim_Status entirely when blank — some Caspio REST inserts reject "".
  for (const key of Object.keys(caspioBody)) {
    if (caspioBody[key] === '' || caspioBody[key] === undefined || caspioBody[key] === null) {
      delete caspioBody[key];
    }
  }
  caspioBody.Connections_or_RCFE_Claim = CONNECTIONS_OR_RCFE_CLAIM_VALUE;

  const blockers: string[] = [...dosResult.blockers];
  if (!isActionableClaimAuditMonth(opts.monthKey)) {
    blockers.push(
      `Month older than ${CLAIM_AUDIT_GAP_MAX_AGE_MONTHS} months — not claimable on T2038 audit`
    );
  }
  if (!clientId2) blockers.push('Missing Client_ID2');
  if (!clientFirst || !clientLast) blockers.push('Missing Client_First / Client_Last');
  if (!dateOfService && !dosResult.blockers.length) blockers.push('Missing Date_of_Service');
  if (!mcpCin && !kaiserMrn) blockers.push('Missing MCP_CIN / Kaiser_MRN');
  if (!diag1) blockers.push('Missing Diagnostic_Code_1');
  if (!authEnd) blockers.push('Missing Auth_End');
  if (!locationName) blockers.push('Missing Current_Location_Name_Var / RCFE_Name');
  if (!clean(opts.submitter.email)) blockers.push('Missing Email_Submitter');

  // One line per Caspio field name (exact insert keys) — no source badges.
  const fieldOrder = [
    'Client_ID2',
    'Client_First',
    'Client_Last',
    'Client_Birthdate',
    'MCP_CIN',
    'Kaiser_MRN',
    'Sex',
    'SNF_Diversion_Transition',
    'MCP',
    'Connections_or_RCFE_Claim',
    'Current_Location_Name_Var',
    'RCFE_Name',
    'RCFE_Address',
    'RCFE_City',
    'RCFE_State',
    'RCFE_Zip',
    'MCO_Name',
    'Total_Charges',
    'Connections_Monthly_PMPM_Rate',
    'MCO_T2038_Amount',
    'Date_of_Service',
    'Auth_Start',
    'Auth_End',
    'Diagnostic_Code_1',
    'Diagnostic_Code_2',
    'Diagnostic_Code_3',
    'Diagnostic_Code_Text1',
    'Diagnostic_Code_Text2',
    'Diagnostic_Code_Text3',
    'Service_Location_Name',
    'Service_Location_Address',
    'Service_Location_City',
    'Service_Location_State',
    'Service_Location_Zip',
    'Payee_Organization',
    'Payee_Address',
    'Payee_City',
    'Payee_State',
    'Payee_Zip',
    'Payee_Telephone',
    'Payee_NPI',
    'Email_Submitter',
    'Name_of_Submitter',
    'User_First',
    'User_Last',
    'User_IDfk',
  ] as const;
  const displayFields: ConnectionsT2038ClaimPreview['displayFields'] = fieldOrder.map((label) => {
    const rawValue = caspioBody[label];
    let value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    if (label === 'Claim_Status' && !value) value = '';
    if (
      label === 'Date_of_Service' &&
      value &&
      dosResult.adjustedForLastDos &&
      dosResult.lastDosLabel
    ) {
      value = `${value} (≥${T2038_MIN_DAYS_AFTER_LAST_DOS}d after last claimed ${dosResult.lastDosLabel})`;
    } else if (label === 'Date_of_Service' && value && dosResult.lastDosLabel) {
      value = `${value} (last claimed ${dosResult.lastDosLabel})`;
    }
    return { label, value, source: 'claim' };
  });

  return {
    id: `${clientId2 || 'unknown'}__${opts.monthKey}`,
    clientId2,
    monthKey: opts.monthKey,
    monthLabel: formatMonthLabel(opts.monthKey),
    dateOfService,
    dateOfServiceIso,
    lastDateOfService: dosResult.lastDosLabel,
    dosAdjustedForLastClaim: dosResult.adjustedForLastDos,
    memberName: [clientLast, clientFirst].filter(Boolean).join(', ') || clientId2 || 'Member',
    blockers,
    displayFields,
    caspioBody,
    fromMember,
  };
}

/** Build SDS 837P for previews that already have DOS + member identity. */
export function buildEdiForConnectionsClaimPreviews(
  previews: ConnectionsT2038ClaimPreview[],
  rawMembersByClientId2: Map<string, Record<string, unknown>>,
  edi: Edi270Settings,
  settings: T2038ClaimSettings = DEFAULT_T2038_CLAIM_SETTINGS
) {
  const claims = [];
  const skipped: Array<{ id: string; memberName: string; reason: string }> = [];
  for (const preview of previews) {
    if (preview.blockers.length) {
      skipped.push({
        id: preview.id,
        memberName: preview.memberName,
        reason: preview.blockers.join('; '),
      });
      continue;
    }
    const raw = rawMembersByClientId2.get(preview.clientId2) || {};
    const mapped = {
      id: preview.clientId2,
      plan: 'Kaiser' as const,
      memberName: preview.memberName,
      memberFirstName: String(preview.caspioBody.Client_First || ''),
      memberLastName: String(preview.caspioBody.Client_Last || ''),
      dateOfBirth: String(preview.caspioBody.Client_Birthdate || ''),
      gender: String(preview.caspioBody.Sex || ''),
      memberId: String(
        preview.caspioBody.Kaiser_MRN || preview.caspioBody.MCP_CIN || ''
      ).replace(/\s+/g, ''),
      clientId2: preview.clientId2,
      address: String(preview.caspioBody.RCFE_Address || ''),
      city: String(preview.caspioBody.RCFE_City || ''),
      state: String(preview.caspioBody.RCFE_State || 'CA'),
      zip: String(preview.caspioBody.RCFE_Zip || ''),
      authorizationNumber: pickFirst(raw.Authorization_Number_T2038, raw.Authorization_Number_T038),
      authorizationStart: '',
      authorizationEnd: String(preview.caspioBody.Auth_End || ''),
      authorizationStartIso: '',
      authorizationEndIso: '',
      daysUntilEnd: null,
      window: 'in_window' as const,
      calaimStatus: pickFirst(raw.CalAIM_Status),
      diagnosisCode: String(preview.caspioBody.Diagnostic_Code_1 || settings.diag1 || 'R69'),
      lastClaimDate: '',
      daysSinceLastClaim: null,
      claimDue: true,
      batchBlockers: [] as string[],
    };
    const sdsRow: KaiserSdsClaimRow = withKaiserRegion(mapped, raw);
    const dos = parseDateOnly(preview.dateOfService);
    if (!dos) {
      skipped.push({ id: preview.id, memberName: preview.memberName, reason: 'Invalid Date_of_Service' });
      continue;
    }
    // Prefer member ICD from Caspio claim body for EDI when present; else R69.
    const claimSettings: T2038ClaimSettings = {
      ...settings,
      diag1: String(preview.caspioBody.Diagnostic_Code_1 || settings.diag1 || 'R69'),
    };
    const input = to837ClaimInput(sdsRow, claimSettings, dos);
    if (!input) {
      skipped.push({ id: preview.id, memberName: preview.memberName, reason: 'Could not build 837 claim line' });
      continue;
    }
    claims.push(input);
  }
  if (!claims.length) {
    return { edi: '', included: 0, skipped, claims, procedureCode: T2038_PROC_CODE };
  }
  return {
    edi: build837P(claims, edi, billingFromT2038Settings(settings)),
    included: claims.length,
    skipped,
    claims,
    procedureCode: T2038_PROC_CODE,
  };
}
