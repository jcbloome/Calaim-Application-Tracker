import * as XLSX from 'xlsx';

export const T2038_CLAIMS_SETTINGS_DOC = 'admin-settings/t2038-claimmd';
export const T2038_PROC_CODE = 'T2038';
export const CLAIMMD_UPLOAD_URL = 'https://svc.claim.md/services/upload/';

export type T2038Plan = 'Health Net' | 'Kaiser';

export type T2038AuthWindow =
  | 'in_window'
  | 'ending_soon'
  | 'not_started'
  | 'expired'
  | 'missing_dates';

export type T2038ClaimMemberRow = {
  id: string;
  plan: T2038Plan;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  dateOfBirth: string;
  gender: string;
  memberId: string;
  clientId2: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  authorizationNumber: string;
  authorizationStart: string;
  authorizationEnd: string;
  authorizationStartIso: string;
  authorizationEndIso: string;
  daysUntilEnd: number | null;
  window: T2038AuthWindow;
  calaimStatus: string;
  batchBlockers: string[];
};

export type T2038ClaimSettings = {
  billName: string;
  billNpi: string;
  billTaxId: string;
  healthNetPayerId: string;
  healthNetPayerName: string;
  kaiserPayerId: string;
  kaiserPayerName: string;
  charge: string;
  diag1: string;
  placeOfService: string;
  units: string;
  acceptAssign: string;
  warningDays: number;
};

export const DEFAULT_T2038_CLAIM_SETTINGS: T2038ClaimSettings = {
  billName: 'Connections',
  billNpi: '1508537325',
  billTaxId: '',
  healthNetPayerId: '95567',
  healthNetPayerName: 'HEALTH NET',
  kaiserPayerId: '',
  kaiserPayerName: 'KAISER FOUNDATION HEALTH PLAN',
  charge: '',
  diag1: '',
  placeOfService: '12',
  units: '1',
  acceptAssign: 'Y',
  warningDays: 30,
};

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

export function isHealthNetPlan(value: unknown) {
  const plan = normalize(value);
  return plan.includes('health net') || plan.includes('healthnet') || plan === 'hn';
}

export function isKaiserPlan(value: unknown) {
  return normalize(value).includes('kaiser');
}

export function isAuthorizedCalaimStatus(value: unknown) {
  return normalize(value) === 'authorized';
}

/** Parse a date-only value without shifting the calendar day. */
export function parseDateOnly(value: unknown): Date | null {
  const raw = clean(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const date = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function formatUsDate(date: Date | null) {
  if (!date) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

export function formatCompactDate(date: Date | null) {
  if (!date) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}${mm}${dd}`;
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysBetween(from: Date, to: Date) {
  const ms = startOfToday(to).getTime() - startOfToday(from).getTime();
  return Math.round(ms / 86400000);
}

export function classifyT2038Window(
  start: Date | null,
  end: Date | null,
  warningDays: number,
  today = startOfToday()
): { window: T2038AuthWindow; daysUntilEnd: number | null } {
  if (!start || !end) return { window: 'missing_dates', daysUntilEnd: end ? daysBetween(today, end) : null };
  const daysUntilEnd = daysBetween(today, end);
  if (today.getTime() < start.getTime()) return { window: 'not_started', daysUntilEnd };
  if (today.getTime() > end.getTime()) return { window: 'expired', daysUntilEnd };
  if (daysUntilEnd <= Math.max(0, warningDays)) return { window: 'ending_soon', daysUntilEnd };
  return { window: 'in_window', daysUntilEnd };
}

function formatGender(value: unknown) {
  const raw = normalize(value);
  if (raw === 'm' || raw.startsWith('male') || raw === 'man') return 'M';
  if (raw === 'f' || raw.startsWith('female') || raw === 'woman') return 'F';
  return '';
}

function memberIdFor(plan: T2038Plan, rawMember: Record<string, unknown>) {
  if (plan === 'Kaiser') {
    return pickFirst(
      rawMember.Kaiser_MRN,
      rawMember.Member_MRN,
      rawMember.MRN,
      rawMember.MCP_CIN,
      rawMember.memberMrn,
      rawMember.MediCal_Number,
      rawMember.memberMediCalNum
    );
  }
  return pickFirst(
    rawMember.MediCal_Number,
    rawMember.MC,
    rawMember.memberMediCalNum,
    rawMember.MCP_CIN
  );
}

export function mapCaspioMemberToT2038ClaimRow(
  rawMember: Record<string, unknown>,
  index = 0,
  warningDays = DEFAULT_T2038_CLAIM_SETTINGS.warningDays,
  today = startOfToday()
): T2038ClaimMemberRow | null {
  const planRaw = pickFirst(rawMember.CalAIM_MCO, rawMember.memberHealthPlan);
  const plan: T2038Plan | '' = isHealthNetPlan(planRaw) ? 'Health Net' : isKaiserPlan(planRaw) ? 'Kaiser' : '';
  if (!plan) return null;
  const status = pickFirst(rawMember.CalAIM_Status, rawMember.memberStatus, rawMember.calaimStatus);
  if (!isAuthorizedCalaimStatus(status)) return null;

  const memberFirstName = pickFirst(rawMember.Senior_First, rawMember.memberFirstName);
  const memberLastName = pickFirst(rawMember.Senior_Last, rawMember.memberLastName);
  const clientId2 = pickFirst(rawMember.client_ID2, rawMember.Client_ID2, rawMember.clientId2);
  const start = parseDateOnly(
    pickFirst(rawMember.Authorization_Start_Date_T2038, rawMember.Authorization_Start_T2038)
  );
  const end = parseDateOnly(
    pickFirst(rawMember.Authorization_End_Date_T2038, rawMember.Authorization_End_T2038)
  );
  const classified = classifyT2038Window(start, end, warningDays, today);
  const authorizationNumber = pickFirst(
    rawMember.Authorization_Number_T2038,
    rawMember.Authorization_Number_T038
  );
  const memberId = memberIdFor(plan, rawMember).replace(/\s+/g, '');
  const batchBlockers: string[] = [];
  if (!authorizationNumber) batchBlockers.push('Missing T2038 authorization number');
  if (!memberId) batchBlockers.push(plan === 'Kaiser' ? 'Missing Kaiser member ID' : 'Missing Medi-Cal number');
  if (!memberLastName || !memberFirstName) batchBlockers.push('Missing member name');
  if (classified.window === 'missing_dates') batchBlockers.push('Missing authorization dates');
  if (classified.window === 'expired') batchBlockers.push('Authorization has ended');
  if (classified.window === 'not_started') batchBlockers.push('Authorization has not started');

  return {
    id: pickFirst(clientId2, memberId, `${memberLastName}-${memberFirstName}-${index}`) || `row-${index}`,
    plan,
    memberName: [memberLastName, memberFirstName].filter(Boolean).join(', '),
    memberFirstName,
    memberLastName,
    dateOfBirth: formatUsDate(
      parseDateOnly(
        pickFirst(
          rawMember.Senior_DOB,
          rawMember.DOB,
          rawMember.Date_of_Birth,
          rawMember.Member_DOB
        )
      )
    ),
    gender: formatGender(pickFirst(rawMember.Sex, rawMember.Gender, rawMember.Member_Gender, rawMember.Senior_Gender)),
    memberId,
    clientId2,
    address: pickFirst(
      rawMember.Member_Address,
      rawMember.Normal_Housing_Street,
      rawMember.RCFE_Address,
      rawMember.RCFE_Street
    ),
    city: pickFirst(rawMember.Member_City, rawMember.Normal_Housing_City, rawMember.RCFE_City),
    state: pickFirst(rawMember.Member_State, rawMember.Normal_Housing_State, rawMember.RCFE_State, 'CA'),
    zip: pickFirst(rawMember.Member_Zip, rawMember.Normal_Housing_Zip, rawMember.RCFE_Zip),
    authorizationNumber,
    authorizationStart: formatUsDate(start),
    authorizationEnd: formatUsDate(end),
    authorizationStartIso: start ? formatCompactDate(start) : '',
    authorizationEndIso: end ? formatCompactDate(end) : '',
    daysUntilEnd: classified.daysUntilEnd,
    window: classified.window,
    calaimStatus: status,
    batchBlockers,
  };
}

export function collectAuthorizedT2038Rows(
  rawMembers: Array<Record<string, unknown>> | null | undefined,
  warningDays = DEFAULT_T2038_CLAIM_SETTINGS.warningDays
): T2038ClaimMemberRow[] {
  const rows: T2038ClaimMemberRow[] = [];
  const seen = new Set<string>();
  (Array.isArray(rawMembers) ? rawMembers : []).forEach((raw, index) => {
    const row = mapCaspioMemberToT2038ClaimRow(raw || {}, index, warningDays);
    if (!row) return;
    const key = normalize(`${row.plan}|${row.clientId2 || row.memberId || row.memberName}`);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    rows.push(row);
  });
  const rank: Record<T2038AuthWindow, number> = {
    ending_soon: 0,
    in_window: 1,
    missing_dates: 2,
    not_started: 3,
    expired: 4,
  };
  rows.sort(
    (a, b) =>
      rank[a.window] - rank[b.window] ||
      (a.daysUntilEnd ?? 9999) - (b.daysUntilEnd ?? 9999) ||
      a.plan.localeCompare(b.plan) ||
      a.memberLastName.localeCompare(b.memberLastName, undefined, { sensitivity: 'base' })
  );
  return rows;
}

export function summarizeT2038Rows(rows: T2038ClaimMemberRow[]) {
  const count = (window: T2038AuthWindow) => rows.filter((row) => row.window === window).length;
  return {
    authorized: rows.length,
    healthNet: rows.filter((row) => row.plan === 'Health Net').length,
    kaiser: rows.filter((row) => row.plan === 'Kaiser').length,
    inWindow: count('in_window') + count('ending_soon'),
    endingSoon: count('ending_soon'),
    expired: count('expired'),
    notStarted: count('not_started'),
    missingDates: count('missing_dates'),
  };
}

export function sanitizeT2038ClaimSettings(raw: unknown): T2038ClaimSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const warningDays = Number(source.warningDays);
  return {
    billName: clean(source.billName) || DEFAULT_T2038_CLAIM_SETTINGS.billName,
    billNpi: clean(source.billNpi).replace(/\D/g, '') || DEFAULT_T2038_CLAIM_SETTINGS.billNpi,
    billTaxId: clean(source.billTaxId).replace(/\D/g, ''),
    healthNetPayerId: clean(source.healthNetPayerId) || DEFAULT_T2038_CLAIM_SETTINGS.healthNetPayerId,
    healthNetPayerName: clean(source.healthNetPayerName) || DEFAULT_T2038_CLAIM_SETTINGS.healthNetPayerName,
    kaiserPayerId: clean(source.kaiserPayerId),
    kaiserPayerName: clean(source.kaiserPayerName) || DEFAULT_T2038_CLAIM_SETTINGS.kaiserPayerName,
    charge: clean(source.charge),
    diag1: clean(source.diag1).replace(/\./g, '').toUpperCase(),
    placeOfService: clean(source.placeOfService) || DEFAULT_T2038_CLAIM_SETTINGS.placeOfService,
    units: clean(source.units) || DEFAULT_T2038_CLAIM_SETTINGS.units,
    acceptAssign: clean(source.acceptAssign) || DEFAULT_T2038_CLAIM_SETTINGS.acceptAssign,
    warningDays: Number.isFinite(warningDays) && warningDays >= 0 ? Math.min(365, Math.round(warningDays)) : 30,
  };
}

export function missingBillingSettings(settings: T2038ClaimSettings): string[] {
  const missing: string[] = [];
  if (!settings.billName.trim()) missing.push('Billing name');
  if (!/^\d{10}$/.test(settings.billNpi)) missing.push('Billing NPI (10 digits)');
  if (!/^\d{9}$/.test(settings.billTaxId)) missing.push('Billing tax ID (9 digits)');
  if (!settings.healthNetPayerId.trim()) missing.push('Health Net Claim.MD payer ID');
  if (!settings.kaiserPayerId.trim()) missing.push('Kaiser Claim.MD payer ID');
  const charge = Number(settings.charge);
  if (!Number.isFinite(charge) || charge <= 0) missing.push('T2038 charge amount');
  if (!settings.diag1.trim()) missing.push('Diagnosis code (diag_1)');
  if (!/^\d{2}$/.test(settings.placeOfService)) missing.push('Place of service (2 digits)');
  if (!settings.units.trim() || Number(settings.units) <= 0) missing.push('Units');
  return missing;
}

function csvCell(value: unknown) {
  const text = clean(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export const CLAIMMD_T2038_CSV_HEADERS = [
  'pcn',
  'remote_claimid',
  'pat_name_l',
  'pat_name_f',
  'pat_dob',
  'patient_sex',
  'pat_addr_1',
  'pat_city',
  'pat_state',
  'pat_zip',
  'pat_rel',
  'ins_number',
  'ins_name_l',
  'ins_name_f',
  'ins_dob',
  'ins_sex',
  'payerid',
  'payer_name',
  'bill_name',
  'bill_npi',
  'bill_taxid',
  'prov_npi',
  'accept_assign',
  'prior_auth',
  'diag_1',
  'from_date',
  'thru_date',
  'place_of_service',
  'proc_code',
  'diag_ref',
  'charge',
  'units',
] as const;

export function serviceDateWithinAuth(row: T2038ClaimMemberRow, serviceDate: Date) {
  const start = parseDateOnly(row.authorizationStart);
  const end = parseDateOnly(row.authorizationEnd);
  if (!start || !end) return false;
  const day = startOfToday(serviceDate);
  return day.getTime() >= start.getTime() && day.getTime() <= end.getTime();
}

export function buildT2038ClaimMdCsv(
  rows: T2038ClaimMemberRow[],
  settings: T2038ClaimSettings,
  serviceDate: Date
): { csv: string; included: number; skipped: Array<{ id: string; memberName: string; reason: string }> } {
  const dos = formatCompactDate(startOfToday(serviceDate));
  const chargeNumber = Number(settings.charge);
  const charge = Number.isFinite(chargeNumber) && chargeNumber > 0 ? chargeNumber.toFixed(2) : '';
  const settingsProblems = missingBillingSettings(settings);
  const skipped: Array<{ id: string; memberName: string; reason: string }> = [];
  const lines = [CLAIMMD_T2038_CSV_HEADERS.join(',')];

  for (const row of rows) {
    if (row.window !== 'in_window' && row.window !== 'ending_soon') {
      skipped.push({ id: row.id, memberName: row.memberName, reason: 'Not inside the current authorization window' });
      continue;
    }
    if (!serviceDateWithinAuth(row, serviceDate)) {
      skipped.push({ id: row.id, memberName: row.memberName, reason: 'Date of service is outside the authorization' });
      continue;
    }
    const payerId = row.plan === 'Kaiser' ? settings.kaiserPayerId : settings.healthNetPayerId;
    const payerName = row.plan === 'Kaiser' ? settings.kaiserPayerName : settings.healthNetPayerName;
    const blockers = [...row.batchBlockers, ...settingsProblems];
    if (!payerId) blockers.push(`Missing ${row.plan} payer ID`);
    if (!row.dateOfBirth) blockers.push('Missing date of birth');
    if (!charge) blockers.push('Missing T2038 charge amount');
    if (blockers.length) {
      skipped.push({ id: row.id, memberName: row.memberName, reason: blockers.join('; ') });
      continue;
    }
    const remoteId = `T2038-${row.clientId2 || row.memberId}-${dos}`;
    const values = [
      row.clientId2 || row.memberId,
      remoteId,
      row.memberLastName,
      row.memberFirstName,
      formatCompactDate(parseDateOnly(row.dateOfBirth)),
      row.gender,
      row.address,
      row.city,
      row.state,
      row.zip.replace(/\D/g, '').slice(0, 9),
      '18',
      row.memberId,
      row.memberLastName,
      row.memberFirstName,
      formatCompactDate(parseDateOnly(row.dateOfBirth)),
      row.gender,
      payerId,
      payerName,
      settings.billName,
      settings.billNpi,
      settings.billTaxId,
      settings.billNpi,
      settings.acceptAssign || 'Y',
      row.authorizationNumber,
      settings.diag1,
      dos,
      dos,
      settings.placeOfService,
      T2038_PROC_CODE,
      '1',
      charge,
      settings.units,
    ];
    lines.push(values.map(csvCell).join(','));
  }

  return { csv: `${lines.join('\r\n')}\r\n`, included: lines.length - 1, skipped };
}

export function buildT2038TrackerWorkbook(rows: T2038ClaimMemberRow[]): Buffer {
  const sheetRows = rows.map((row) => ({
    Plan: row.plan,
    Member: row.memberName,
    'Client ID2': row.clientId2,
    'Member ID': row.memberId,
    'Auth number': row.authorizationNumber,
    'Auth start': row.authorizationStart,
    'Auth end': row.authorizationEnd,
    'Days until end': row.daysUntilEnd ?? '',
    Window: row.window,
    'Batch blockers': row.batchBlockers.join('; '),
    'CalAIM status': row.calaimStatus,
  }));
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'T2038 authorizations');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
