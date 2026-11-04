import {
  daysBetween,
  formatUsDate,
  isAuthorizedCalaimStatus,
  isHealthNetPlan,
  isKaiserPlan,
  parseDateOnly,
  startOfToday,
} from '@/lib/t2038-claims';
import { isPlaceholderRcfeName } from '@/lib/rcfe-utils';

/** H2022 reauth visit review — RCFE members, T2038 expired → chargeable; T2038 still open → do not charge. */

export type ReauthAuthStatus = 'active' | 'ending_soon' | 'expired' | 'missing' | 'not_started';

export type ReauthPlan = 'Health Net' | 'Kaiser' | 'Other';

export type H2022ReauthVisitRow = {
  id: string;
  clientId2: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  plan: ReauthPlan;
  planRaw: string;
  calaimStatus: string;
  mrn: string;
  mediCal: string;
  rcfeName: string;
  county: string;
  t2038Start: string;
  t2038End: string;
  t2038StartIso: string;
  t2038EndIso: string;
  t2038Status: ReauthAuthStatus;
  t2038DaysUntilEnd: number | null;
  h2022Number: string;
  h2022Start: string;
  h2022End: string;
  h2022StartIso: string;
  h2022EndIso: string;
  h2022Status: ReauthAuthStatus;
  h2022DaysUntilEnd: number | null;
  /** T2038 still covers the member — do not charge for H2022 reauth visit. */
  doNotCharge: boolean;
  /** RCFE + T2038 expired (or missing end) — primary payment-review universe. */
  chargeCandidate: boolean;
  /** T2038 expired and H2022 dates exist — strongest signal a reauth visit already happened. */
  likelyReauthDone: boolean;
  /** RCFE member missing H2022 or H2022 already expired. */
  h2022NeedsAttention: boolean;
};

export type H2022ReauthVisitSummary = {
  withRcfe: number;
  authorized: number;
  doNotCharge: number;
  chargeCandidates: number;
  likelyReauthDone: number;
  h2022Missing: number;
  h2022Expired: number;
  h2022Active: number;
  healthNet: number;
  kaiser: number;
};

const WARNING_DAYS = 30;

const clean = (value: unknown) => String(value ?? '').trim();

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return '';
};

const toIso = (date: Date | null) => {
  if (!date) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function classifyAuthWindow(
  start: Date | null,
  end: Date | null,
  warningDays = WARNING_DAYS,
  today = startOfToday()
): { status: ReauthAuthStatus; daysUntilEnd: number | null } {
  if (!end && !start) return { status: 'missing', daysUntilEnd: null };
  if (!end) return { status: 'missing', daysUntilEnd: null };
  const daysUntilEnd = daysBetween(today, end);
  if (start && today.getTime() < start.getTime()) {
    return { status: 'not_started', daysUntilEnd };
  }
  if (today.getTime() > end.getTime()) return { status: 'expired', daysUntilEnd };
  if (daysUntilEnd <= Math.max(0, warningDays)) return { status: 'ending_soon', daysUntilEnd };
  return { status: 'active', daysUntilEnd };
}

function resolvePlan(raw: unknown): ReauthPlan {
  if (isHealthNetPlan(raw)) return 'Health Net';
  if (isKaiserPlan(raw)) return 'Kaiser';
  return 'Other';
}

/** Map a Caspio / cache member doc into a reauth-visit review row. Returns null if no RCFE_Name. */
export function mapMemberToH2022ReauthVisitRow(
  raw: Record<string, unknown>,
  docId = '',
  today = startOfToday()
): H2022ReauthVisitRow | null {
  const rcfeName = pickFirst(raw.RCFE_Name, raw.rcfeName, raw.Assisted_Living_Facility_Name);
  // Placeholder "CalAIM Use" / "CalAIM_Use" is not a real facility — exclude from reauth list.
  if (!rcfeName || isPlaceholderRcfeName(rcfeName)) return null;

  const clientId2 = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2, docId);
  const firstName = pickFirst(raw.Senior_First, raw.memberFirstName, raw.First_Name);
  const lastName = pickFirst(raw.Senior_Last, raw.memberLastName, raw.Last_Name);
  const planRaw = pickFirst(raw.CalAIM_MCO, raw.memberHealthPlan, raw.Health_Plan);
  const plan = resolvePlan(planRaw);
  const calaimStatus = pickFirst(raw.CalAIM_Status, raw.memberStatus, raw.calaimStatus, raw.caspioCalAIMStatus);

  const t2038StartDate = parseDateOnly(
    pickFirst(
      raw.Authorization_Start_Date_T2038,
      raw.Authorization_Start_T2038,
      raw.authStartDateT2038,
      raw.Next_Auth_Start_T2038
    )
  );
  const t2038EndDate = parseDateOnly(
    pickFirst(
      raw.Authorization_End_Date_T2038,
      raw.Authorization_End_T2038,
      raw.authEndDateT2038,
      raw.Next_Auth_End_T2038
    )
  );
  const h2022StartDate = parseDateOnly(
    pickFirst(
      raw.Next_Auth_Start_H2022,
      raw.Authorization_Start_Date_H2022,
      raw.Auth_Start_Date_H2022,
      raw.H2022_Start_Date,
      raw.authStartDateH2022
    )
  );
  const h2022EndDate = parseDateOnly(
    pickFirst(
      raw.Next_Auth_End_H2022,
      raw.Authorization_End_Date_H2022,
      raw.Authorization_End_Date_H222,
      raw.Auth_End_Date_H2022,
      raw.H2022_End_Date,
      raw.authEndDateH2022
    )
  );

  const t2038 = classifyAuthWindow(t2038StartDate, t2038EndDate, WARNING_DAYS, today);
  const h2022 = classifyAuthWindow(h2022StartDate, h2022EndDate, WARNING_DAYS, today);

  const doNotCharge = t2038.status === 'active' || t2038.status === 'ending_soon' || t2038.status === 'not_started';
  const chargeCandidate = !doNotCharge; // expired or missing T2038 end
  const hasH2022Dates = Boolean(h2022StartDate || h2022EndDate);
  const likelyReauthDone = chargeCandidate && hasH2022Dates;
  const h2022NeedsAttention = h2022.status === 'missing' || h2022.status === 'expired';

  return {
    id: clientId2 || `${lastName}-${firstName}-${rcfeName}`,
    clientId2,
    memberName: [lastName, firstName].filter(Boolean).join(', ') || clientId2 || 'Unknown',
    memberFirstName: firstName,
    memberLastName: lastName,
    plan,
    planRaw,
    calaimStatus,
    mrn: pickFirst(raw.Kaiser_MRN, raw.Member_MRN, raw.MRN, raw.memberMrn, raw.MCP_CIN),
    mediCal: pickFirst(raw.MediCal_Number, raw.Medical_Number, raw.memberMediCalNum, raw.MCP_CIN),
    rcfeName,
    county: pickFirst(raw.Member_County, raw.memberCounty, raw.RCFE_County, raw.rcfeCounty),
    t2038Start: formatUsDate(t2038StartDate),
    t2038End: formatUsDate(t2038EndDate),
    t2038StartIso: toIso(t2038StartDate),
    t2038EndIso: toIso(t2038EndDate),
    t2038Status: t2038.status,
    t2038DaysUntilEnd: t2038.daysUntilEnd,
    h2022Number: pickFirst(
      raw.Next_Auth_H2022_Number,
      raw.Authorization_Number_H2022,
      raw.authorizationNumber,
      raw.H2022_Auth_Number
    ),
    h2022Start: formatUsDate(h2022StartDate),
    h2022End: formatUsDate(h2022EndDate),
    h2022StartIso: toIso(h2022StartDate),
    h2022EndIso: toIso(h2022EndDate),
    h2022Status: h2022.status,
    h2022DaysUntilEnd: h2022.daysUntilEnd,
    doNotCharge,
    chargeCandidate,
    likelyReauthDone,
    h2022NeedsAttention,
  };
}

export function summarizeH2022ReauthRows(rows: H2022ReauthVisitRow[]): H2022ReauthVisitSummary {
  return {
    withRcfe: rows.length,
    authorized: rows.filter((r) => isAuthorizedCalaimStatus(r.calaimStatus)).length,
    doNotCharge: rows.filter((r) => r.doNotCharge).length,
    chargeCandidates: rows.filter((r) => r.chargeCandidate).length,
    likelyReauthDone: rows.filter((r) => r.likelyReauthDone).length,
    h2022Missing: rows.filter((r) => r.h2022Status === 'missing').length,
    h2022Expired: rows.filter((r) => r.h2022Status === 'expired').length,
    h2022Active: rows.filter((r) => r.h2022Status === 'active' || r.h2022Status === 'ending_soon').length,
    healthNet: rows.filter((r) => r.plan === 'Health Net').length,
    kaiser: rows.filter((r) => r.plan === 'Kaiser').length,
  };
}

export function buildH2022ReauthVisitsCsv(rows: H2022ReauthVisitRow[]): string {
  const headers = [
    'Member',
    'First',
    'Last',
    'Plan',
    'Status',
    'MRN',
    'Medi-Cal',
    'Client_ID2',
    'RCFE',
    'County',
    'T2038 Start',
    'T2038 End',
    'T2038 Status',
    'H2022 Number',
    'H2022 Start',
    'H2022 End',
    'H2022 Status',
    'Do Not Charge (T2038 open)',
    'Charge Candidate (T2038 expired)',
    'Likely Reauth Done',
    'H2022 Needs Attention',
  ];
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.memberName,
        row.memberFirstName,
        row.memberLastName,
        row.plan,
        row.calaimStatus,
        row.mrn,
        row.mediCal,
        row.clientId2,
        row.rcfeName,
        row.county,
        row.t2038Start,
        row.t2038End,
        row.t2038Status,
        row.h2022Number,
        row.h2022Start,
        row.h2022End,
        row.h2022Status,
        row.doNotCharge ? 'Y' : 'N',
        row.chargeCandidate ? 'Y' : 'N',
        row.likelyReauthDone ? 'Y' : 'N',
        row.h2022NeedsAttention ? 'Y' : 'N',
      ]
        .map(escape)
        .join(',')
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

export { isAuthorizedCalaimStatus };
