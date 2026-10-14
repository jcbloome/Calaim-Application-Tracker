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
};

export type MemberFieldKey = keyof BatchEligibilityMember;

export const MEMBER_FIELD_LABELS: Record<MemberFieldKey, string> = {
  lastName: 'Member last name',
  firstName: 'Member first name',
  birthDate: 'Member birth date',
  sex: 'Member sex (M/F)',
  medicalId: 'Medi-Cal CIN / member ID',
  mrn: 'MRN',
  clientId2: 'Caspio Client_ID2',
  calaimStatus: 'CalAIM status',
  authStartT2038: 'T2038 auth start',
  authEndT2038: 'T2038 auth end',
  authStartH2022: 'H2022 auth start',
  authEndH2022: 'H2022 auth end',
  county: 'County',
};

const DATE_FIELDS = new Set<MemberFieldKey>([
  'birthDate',
  'authStartT2038',
  'authEndT2038',
  'authStartH2022',
  'authEndH2022',
]);

/** How a template column is filled: a member field, a fixed value, today's date, or left blank. */
export type ColumnSource =
  | { kind: 'member'; field: MemberFieldKey }
  | { kind: 'constant'; value: string }
  | { kind: 'today' }
  | { kind: 'blank' };

export type DateFormat = 'MM/DD/YYYY' | 'YYYYMMDD' | 'YYYY-MM-DD';

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
  return parsed;
}

/** Columns that are always the same value for a plan's Claim.MD batch file. */
export const PLAN_FIXED_VALUES: Record<BatchEligibilityPlan, Record<string, string>> = {
  healthnet: { payerid: '95567', prov_npi: '1508537325', pat_rel: '18' },
  kaiser: {},
};

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
