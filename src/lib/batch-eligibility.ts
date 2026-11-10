export type BatchEligibilityPlan = 'healthnet' | 'kaiser';

export const BATCH_ELIGIBILITY_PLAN_LABELS: Record<BatchEligibilityPlan, string> = {
  healthnet: 'Health Net',
  kaiser: 'Kaiser',
};

export const BATCH_ELIGIBILITY_TEMPLATES_COLLECTION = 'batch_eligibility_templates';

export type BatchEligibilityMember = {
  clientId2: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: string;
  medicalId: string;
  mrn: string;
  calaimStatus: string;
  authStartT2038: string;
  authEndT2038: string;
  authStartH2022: string;
  authEndH2022: string;
  county: string;
  /** Kaiser North / Kaiser South (Kaiser members only). */
  region: string;
  /** Caspio CalAIM_MCO (Health Net / Kaiser). */
  healthPlan: string;
  /** Caspio Kaiser_Status (Authorized, Inactive, etc.). */
  kaiserStatus: string;
  /** Facility placement (for not-eligible RCFE outreach). */
  rcfeName: string;
  /**
   * RCFE contact emails for Bulk RCFE Email (semicolon-joined when multiple):
   * RCFE_Admin_Email, owner emails, and registration matches by RCFE_Name.
   */
  rcfeAdminEmail: string;
};

export type MemberFieldKey = keyof BatchEligibilityMember;

export const MEMBER_FIELD_LABELS: Record<MemberFieldKey, string> = {
  lastName: 'Member last name',
  firstName: 'Member first name',
  birthDate: 'Member birth date',
  sex: 'Member sex (M/F)',
  medicalId: 'Medi-Cal CIN',
  mrn: 'Kaiser MRN',
  clientId2: 'Caspio Client_ID2',
  calaimStatus: 'CalAIM status',
  kaiserStatus: 'Kaiser status',
  authStartT2038: 'T2038 auth start',
  authEndT2038: 'T2038 auth end',
  authStartH2022: 'H2022 auth start',
  authEndH2022: 'H2022 auth end',
  county: 'County',
  region: 'Kaiser region',
  healthPlan: 'Health plan (CalAIM_MCO)',
  rcfeName: 'RCFE name',
  rcfeAdminEmail: 'RCFE owner email',
};

/** Caspio Kaiser_Status values that mean the member is not active with Kaiser. */
export function isKaiserInactiveStatus(status: unknown): boolean {
  return /^(non[\s_-]?active|inactive)$/i.test(String(status ?? '').trim());
}

const DATE_FIELDS = new Set<MemberFieldKey>([
  'birthDate',
  'authStartT2038',
  'authEndT2038',
  'authStartH2022',
  'authEndH2022',
]);

/** Claim.MD payer IDs for Kaiser eligibility (ILS clearinghouse vs regional Kaiser). */
export const KAISER_CLAIMMD_PAYER_IDS = {
  ils: '81397',
  north: '94135',
  south: '94134',
} as const;

/** Claim.MD payer ID used for Health Net batch eligibility CSVs. */
export const HEALTH_NET_CLAIMMD_PAYER_ID = '95567';

export type KaiserClaimMdPayerMode = 'region' | 'ils';

const KAISER_PAYER_ID_SET = new Set<string>(Object.values(KAISER_CLAIMMD_PAYER_IDS));

/** Map a Claim.MD / 271 payer ID to Health Net or Kaiser. */
export function planFromClaimMdPayerId(payerId: unknown): BatchEligibilityPlan | null {
  const id = String(payerId || '').replace(/\D/g, '');
  if (!id) return null;
  if (KAISER_PAYER_ID_SET.has(id)) return 'kaiser';
  if (id === HEALTH_NET_CLAIMMD_PAYER_ID) return 'healthnet';
  return null;
}

/** Infer MCP from 271 payer IDs first (authoritative), then payer name. */
export function inferBatchEligibilityPlanFrom271(
  results: Array<{ payerName?: string; payerId?: string }>,
  fallback: BatchEligibilityPlan = 'healthnet'
): BatchEligibilityPlan {
  let kaiserVotes = 0;
  let healthNetVotes = 0;
  for (const result of results) {
    const fromId = planFromClaimMdPayerId(result.payerId);
    if (fromId === 'kaiser') kaiserVotes++;
    else if (fromId === 'healthnet') healthNetVotes++;
    else {
      const name = String(result.payerName || '').toLowerCase();
      if (/kaiser|\bkp\b|kfhp/.test(name)) kaiserVotes++;
      else if (/health\s*net|healthnet/.test(name)) healthNetVotes++;
    }
  }
  if (kaiserVotes > healthNetVotes) return 'kaiser';
  if (healthNetVotes > kaiserVotes) return 'healthnet';
  return fallback;
}

/** Fast MCP detect from raw 271 / EDI text via known Claim.MD payer IDs. */
export function inferBatchEligibilityPlanFromEdiText(
  text: string,
  fallback: BatchEligibilityPlan | null = null
): BatchEligibilityPlan | null {
  const sample = String(text || '').slice(0, 200_000);
  const hasKaiserId = [...KAISER_PAYER_ID_SET].some((id) => sample.includes(id));
  const hasHealthNetId = sample.includes(HEALTH_NET_CLAIMMD_PAYER_ID);
  if (hasKaiserId && !hasHealthNetId) return 'kaiser';
  if (hasHealthNetId && !hasKaiserId) return 'healthnet';
  if (hasKaiserId && hasHealthNetId) {
    // Prefer whichever ID appears first (matches the file's primary payer).
    const kPos = Math.min(
      ...[...KAISER_PAYER_ID_SET].map((id) => {
        const i = sample.indexOf(id);
        return i < 0 ? Number.POSITIVE_INFINITY : i;
      })
    );
    const hPos = sample.indexOf(HEALTH_NET_CLAIMMD_PAYER_ID);
    return kPos <= hPos ? 'kaiser' : 'healthnet';
  }
  if (/NM1\*PR\*[^*]*\*[^~]*KAISER/i.test(sample) || /\bKFHP\b|\bKP\s*HP\b/i.test(sample)) return 'kaiser';
  if (/NM1\*PR\*[^*]*\*[^~]*HEALTH\s*NET/i.test(sample)) return 'healthnet';
  return fallback;
}

/** Display MCP for a logged run (prefers payer-detected plan over the UI tab used at save time). */
export function resolveBatchEligibilityRunPlan(run: {
  plan?: string;
  summary?: Record<string, any> | null;
}): BatchEligibilityPlan {
  const detected = String(run.summary?.detectedPlan || run.summary?.mcp || '').toLowerCase();
  if (detected === 'kaiser' || detected === 'healthnet') return detected;
  return run.plan === 'kaiser' ? 'kaiser' : 'healthnet';
}

/**
 * Kaiser statuses historically used for routine checks.
 * Full Kaiser eligibility runs now include all living members; these remain for lost-coverage flags.
 */
export const KAISER_ELIGIBILITY_STATUSES = ['Authorized', 'H2022'] as const;

export const isKaiserEligibilityStatus = (status: string) =>
  KAISER_ELIGIBILITY_STATUSES.some((s) => s.toLowerCase() === status.trim().toLowerCase());

/** Caspio shows the Kaiser member as inactive (Kaiser_Status and/or CalAIM Non-Active). */
export function isKaiserMemberInactiveInCaspio(
  member: Pick<BatchEligibilityMember, 'kaiserStatus' | 'calaimStatus'> | null | undefined
): boolean {
  if (!member) return false;
  if (isKaiserInactiveStatus(member.kaiserStatus)) return true;
  return /^(non[\s_-]?active|inactive)$/i.test(String(member.calaimStatus || '').trim());
}

/**
 * CalAIM_Status Authorization / Authorized on Hold — included in Kaiser batches so we can
 * detect when coverage is active again and flag reauthorization visits.
 */
export function isAuthorizationOnHoldCalaimStatus(status: unknown): boolean {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized || !normalized.includes('hold')) return false;
  return (
    normalized.includes('authorization on hold') ||
    normalized.includes('authorized on hold') ||
    ((normalized.includes('authorization') || normalized.includes('authorized')) &&
      normalized.includes('on hold'))
  );
}

/** Exclude deceased members from eligibility batches and decoded results. */
export function isMemberDiedCalaimStatus(status: unknown): boolean {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    normalized === 'member died' ||
    normalized === 'died' ||
    normalized === 'deceased' ||
    normalized === 'passed away' ||
    normalized.includes('member died') ||
    normalized.includes('passed away')
  );
}

/** Payerid for a Kaiser member row in the Claim.MD CSV. */
export function kaiserClaimMdPayerId(
  member: Pick<BatchEligibilityMember, 'region'>,
  mode: KaiserClaimMdPayerMode = 'region'
): string {
  if (mode === 'ils') return KAISER_CLAIMMD_PAYER_IDS.ils;
  if (/south/i.test(member.region || '')) return KAISER_CLAIMMD_PAYER_IDS.south;
  return KAISER_CLAIMMD_PAYER_IDS.north;
}

/** How a template column is filled: a member field, a fixed value, today's date, or left blank. */
export type ColumnSource =
  | { kind: 'member'; field: MemberFieldKey }
  | { kind: 'constant'; value: string }
  | { kind: 'today' }
  | { kind: 'kaiserPayer'; mode: KaiserClaimMdPayerMode }
  | { kind: 'blank' };

export type DateFormat = 'MM/DD/YYYY' | 'YYYYMMDD' | 'YYYY-MM-DD';

export const BATCH_ELIGIBILITY_RUNS_COLLECTION = 'batch_eligibility_runs';

/** sessionStorage key holding Client_ID2s picked from decoded results for a re-check batch. */
export const RECHECK_STORAGE_KEY = 'batch-eligibility-recheck-healthnet';

export const recheckStorageKeyForPlan = (plan: BatchEligibilityPlan) =>
  plan === 'kaiser' ? 'batch-eligibility-recheck-kaiser' : RECHECK_STORAGE_KEY;

/** A logged batch file creation ("batch") or 271 results decode ("decode"). Files live in Storage. */
export type BatchEligibilityRun = {
  id: string;
  kind: 'batch' | 'decode';
  plan: string;
  list: string;
  createdAtIso: string;
  createdByEmail: string;
  createdByName: string;
  summary: Record<string, any>;
  files: Array<{ name: string; storagePath: string; size: number }>;
};

/** Per-column notes from Claim.MD's "Supported Column Definitions" sheet. */
export type ColumnInfo = {
  description: string;
  required: boolean;
  dataType: string;
  allowedValues: string;
};

export type BatchEligibilityTemplate = {
  plan: BatchEligibilityPlan;
  fileName: string;
  columns: string[];
  exampleRow: string[];
  columnInfo?: Record<string, ColumnInfo>;
  mapping: Record<string, ColumnSource>;
  dateFormat: DateFormat;
  uploadedAtIso?: string;
  uploadedByEmail?: string;
  updatedAtIso?: string;
};

const norm = (value: string) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Best-guess source for a template column from its header (and the example value for fixed fields). */
export function guessColumnSource(header: string, exampleValue: string): ColumnSource {
  const h = norm(header);
  const words = new Set(h.split(' '));
  const has = (...tokens: string[]) => tokens.some((t) => (t.includes(' ') ? h.includes(t) : words.has(t) || h.includes(t)));
  const example = String(exampleValue ?? '').trim();
  const constantFromExample: ColumnSource = example ? { kind: 'constant', value: example } : { kind: 'blank' };

  if (has('rel', 'relationship') && !example) return { kind: 'constant', value: '18' };
  if (has('payer', 'payerid', 'npi', 'taxid', 'tax id', 'prov', 'provider', 'rel', 'relationship', 'service type', 'stc')) {
    return constantFromExample;
  }
  if (has('fdos', 'tdos', 'dos', 'date of service', 'service date')) return { kind: 'today' };
  if (has('dob', 'birth')) return { kind: 'member', field: 'birthDate' };
  if (has('sex', 'gender')) return { kind: 'member', field: 'sex' };
  if (has('last', 'lname', 'name l')) return { kind: 'member', field: 'lastName' };
  if (has('first', 'fname', 'name f')) return { kind: 'member', field: 'firstName' };
  if (has('mrn')) return { kind: 'member', field: 'mrn' };
  if (has('cin', 'medi cal', 'medical id', 'member id', 'subscriber id', 'ins number', 'insured id', 'policy', 'id number')) {
    return { kind: 'member', field: 'medicalId' };
  }
  if (has('number') && has('ins', 'member', 'subscriber', 'patient', 'pat')) return { kind: 'member', field: 'medicalId' };
  if (has('account', 'acct', 'pcn', 'patient control', 'client id', 'reference')) return { kind: 'member', field: 'clientId2' };
  return { kind: 'blank' };
}

export function detectDateFormat(columns: string[], exampleRow: string[]): DateFormat {
  for (let i = 0; i < columns.length; i++) {
    const h = norm(columns[i]);
    if (!/dob|birth|dos|date/.test(h)) continue;
    const v = String(exampleRow[i] ?? '').trim();
    if (/^\d{8}$/.test(v)) return 'YYYYMMDD';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'YYYY-MM-DD';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return 'MM/DD/YYYY';
  }
  return 'MM/DD/YYYY';
}

/**
 * Turn an uploaded sheet (array of rows) into a template. Accepts either a sample batch file
 * (header row = columns, second row = example values) or Claim.MD's column definitions sheet
 * (one row per field, with a "Field Name" column).
 */
export function parseTemplateSheet(
  rows: unknown[][],
  plan: BatchEligibilityPlan
): Pick<BatchEligibilityTemplate, 'columns' | 'exampleRow' | 'columnInfo' | 'mapping' | 'dateFormat'> {
  const parsed = parseSheetColumns(rows);
  for (const [column, value] of Object.entries(PLAN_FIXED_VALUES[plan])) {
    if (parsed.columns.includes(column)) parsed.mapping[column] = { kind: 'constant', value };
  }
  if (plan === 'kaiser') {
    for (const column of parsed.columns) {
      if (isKaiserClaimMdMemberIdColumn(column)) {
        parsed.mapping[column] = { kind: 'member', field: 'mrn' };
      }
    }
  }
  return parsed;
}

/** Columns that are always the same value for a plan's Claim.MD batch file. */
export const PLAN_FIXED_VALUES: Record<BatchEligibilityPlan, Record<string, string>> = {
  healthnet: { payerid: '95567', prov_npi: '1508537325', pat_rel: '18' },
  // payerid is set per row via ColumnSource kind `kaiserPayer` (North/South or ILS).
  kaiser: { prov_npi: '1508537325', pat_rel: '18' },
};

/** Claim.MD columns that carry the subscriber / insured ID (Kaiser needs MRN here, not Medi-Cal CIN). */
export function isKaiserClaimMdMemberIdColumn(column: string): boolean {
  const key = column.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!key || key.includes('payer') || key.includes('npi') || key.includes('tax')) return false;
  if (key === 'mrn' || key.includes('kaiser')) return true;
  if (/(insnumber|insuredid|memberid|subscriberid|subscriber|policyid|patid|patientid|idnumber)/.test(key)) {
    return true;
  }
  const h = norm(column);
  return (
    /\b(ins|insured|member|subscriber|patient|pat)\b/.test(h) && /\b(id|number|num|no)\b/.test(h)
  );
}

/** Apply Kaiser Claim.MD payer mapping (region or ILS) onto any payerid-like columns. */
export function applyKaiserPayerMapping(
  template: BatchEligibilityTemplate,
  mode: KaiserClaimMdPayerMode
): BatchEligibilityTemplate {
  const mapping = { ...template.mapping };
  for (const column of template.columns) {
    const key = column.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (key.includes('payer')) mapping[column] = { kind: 'kaiserPayer', mode };
  }
  return { ...template, mapping };
}

/**
 * Kaiser Claim.MD defaults: regional/ILS payerid + Kaiser MRN in the subscriber/member ID column
 * (Medi-Cal CIN is rejected by Claim.MD for Kaiser).
 */
export function applyKaiserClaimMdDefaults(
  template: BatchEligibilityTemplate,
  mode: KaiserClaimMdPayerMode
): BatchEligibilityTemplate {
  const withPayer = applyKaiserPayerMapping(template, mode);
  const mapping = { ...withPayer.mapping };
  for (const column of withPayer.columns) {
    if (isKaiserClaimMdMemberIdColumn(column)) {
      mapping[column] = { kind: 'member', field: 'mrn' };
    }
  }
  return { ...withPayer, mapping };
}

function parseSheetColumns(
  rows: unknown[][]
): Pick<BatchEligibilityTemplate, 'columns' | 'exampleRow' | 'columnInfo' | 'mapping' | 'dateFormat'> {
  const cell = (row: unknown[] | undefined, i: number) => String(row?.[i] ?? '').trim();
  const header = (rows[0] || []).map((_, i) => cell(rows[0], i));
  const headerNorm = header.map(norm);
  const nameIdx = headerNorm.indexOf('field name');

  if (nameIdx >= 0) {
    const idx = (label: string) => headerNorm.indexOf(label);
    const descIdx = idx('field description');
    const reqIdx = idx('required');
    const typeIdx = idx('data type');
    const allowedIdx = idx('allowed values');
    const columns: string[] = [];
    const columnInfo: Record<string, ColumnInfo> = {};
    for (const row of rows.slice(1)) {
      const name = cell(row, nameIdx);
      if (!name || !/^[A-Za-z0-9_]+$/.test(name) || columnInfo[name]) continue;
      columns.push(name);
      columnInfo[name] = {
        description: descIdx >= 0 ? cell(row, descIdx) : '',
        required: reqIdx >= 0 && /^y/i.test(cell(row, reqIdx)),
        dataType: typeIdx >= 0 ? cell(row, typeIdx) : '',
        allowedValues: allowedIdx >= 0 ? cell(row, allowedIdx) : '',
      };
    }
    if (!columns.length) throw new Error('No field names found in the "Field Name" column.');
    const mapping: Record<string, ColumnSource> = {};
    for (const column of columns) mapping[column] = guessColumnSource(column, '');
    const mentionsYyyymmdd = columns.some((c) => /yyyymmdd/i.test(columnInfo[c].dataType));
    return {
      columns,
      exampleRow: columns.map(() => ''),
      columnInfo,
      mapping,
      dateFormat: mentionsYyyymmdd ? 'YYYYMMDD' : 'MM/DD/YYYY',
    };
  }

  const columns = header.filter(Boolean);
  if (!columns.length) throw new Error('The first row must contain the column names.');
  const exampleRow = columns.map((_, i) => cell(rows[1], i));
  const mapping: Record<string, ColumnSource> = {};
  columns.forEach((column, i) => {
    mapping[column] = guessColumnSource(column, exampleRow[i]);
  });
  return { columns, exampleRow, mapping, dateFormat: detectDateFormat(columns, exampleRow) };
}

function toYmdParts(raw: string): [string, string, string] | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return [m[1], m[2].padStart(2, '0'), m[3].padStart(2, '0')];
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return [m[3], m[1].padStart(2, '0'), m[2].padStart(2, '0')];
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return [m[1], m[2], m[3]];
  return null;
}

export function formatDate(raw: string, format: DateFormat): string {
  const parts = toYmdParts(raw);
  if (!parts) return String(raw || '').trim();
  const [y, mo, d] = parts;
  if (format === 'YYYYMMDD') return `${y}${mo}${d}`;
  if (format === 'YYYY-MM-DD') return `${y}-${mo}-${d}`;
  return `${mo}/${d}/${y}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function buildRow(member: BatchEligibilityMember, template: Pick<BatchEligibilityTemplate, 'columns' | 'mapping' | 'dateFormat'>) {
  return template.columns.map((column) => {
    const source = template.mapping[column] || { kind: 'blank' };
    if (source.kind === 'constant') return source.value;
    if (source.kind === 'today') return formatDate(todayIso(), template.dateFormat);
    if (source.kind === 'kaiserPayer') return kaiserClaimMdPayerId(member, source.mode);
    if (source.kind === 'member') {
      const value = String(member[source.field] ?? '').trim();
      return DATE_FIELDS.has(source.field) ? formatDate(value, template.dateFormat) : value;
    }
    return '';
  });
}

const csvCell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function buildCsv(columns: string[], rows: string[][]) {
  return [columns, ...rows].map((row) => row.map((cell) => csvCell(String(cell ?? ''))).join(',')).join('\r\n');
}
