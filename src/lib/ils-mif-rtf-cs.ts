import { normalizeKaiserStatusName } from '@/lib/kaiser-status-progression';

export type CsMemberEngagementCode = 1 | 2 | 3 | 4;

export const CS_ENGAGEMENT_LABELS: Record<CsMemberEngagementCode, string> = {
  1: 'Pending Outreach',
  2: 'Currently in Outreach',
  3: 'Currently Delivering Service',
  4: 'Services Discontinued',
};

/** ILS manual: 1 In-Person, 2 Telephonic, 3 Electronic */
export const OUTREACH_METHOD_TELEPHONIC = 2;

export const OUTREACH_METHOD_LABELS: Record<1 | 2 | 3, string> = {
  1: 'In-Person',
  2: 'Telephonic',
  3: 'Electronic',
};

/** ILS manual: 1 clinical staff, 2 non-clinical staff */
export const PROVIDER_TYPE_NON_CLINICAL = 2;

export const PROVIDER_TYPE_LABELS: Record<1 | 2, string> = {
  1: 'Outreach performed by clinical staff',
  2: 'Outreach performed by non-clinical staff',
};

export const HAS_MEMBER_HOUSED_YES = 1;
export const HAS_MEMBER_HOUSED_NO = 0;

export type MemberNoteLike = {
  noteText?: string;
  createdAt?: string;
};

export type FirstLastNoteSummary = {
  firstNoteDate: string;
  firstNoteText: string;
  lastNoteDate: string;
  lastNoteText: string;
};

const PENDING_OUTREACH_STATUSES = new Set([
  'T2038, Not Requested, Doc Collection',
  'T2038 Request Ready',
  'T2038 Requested',
  'T2038 received, Need First Contact',
]);

const IN_OUTREACH_STATUSES = new Set([
  'T2038 received, Unreachable',
  'T2038 received, doc collection',
  'T2038_Auth_Email_Kaiser',
  'RN Visit Needed',
  'RN/MSW Scheduled',
  'RN Visit Complete',
  'RN Visit Complete, Pending Signatures',
  'Tier Level Requested',
  'Tier Level Received',
  'Tier Level Appeal',
  'RCFE Needed',
  'RCFE_Located',
  'R&B Needed',
  'R&B Requested',
  'R&B Signed',
  'ILS/RCFE Contract Email Needed',
  'ILS/RCFE Contract Email Sent',
  'ILS/RCFE_Member_At_RCFE_Need_Conf',
]);

const DELIVERING_SERVICE_STATUSES = new Set([
  'Final- Member at RCFE',
  'Placed',
  'On H2022 Revisits',
]);

const DISCONTINUED_STATUSES = new Set([
  'Case Closed',
  'Non-active',
  'On-Hold',
]);

const normalizeStatusLoose = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function isHousedEligibleKaiserStatus(kaiserStatus: string): boolean {
  const normalized = normalizeKaiserStatusName(String(kaiserStatus || '').trim());
  if (!normalized) return false;
  if (DELIVERING_SERVICE_STATUSES.has(normalized)) return true;
  const loose = normalizeStatusLoose(normalized);
  if (loose === 'placed') return true;
  if (loose.includes('final') && loose.includes('rcfe') && loose.includes('member at rcfe')) return true;
  if (loose.includes('h2022') && loose.includes('revisit')) return true;
  return false;
}

/** Returns 1 when RCFE is set and Kaiser status indicates housed; otherwise blank (leave RTF cell empty). */
export function deriveHasMemberBeenHoused(
  rcfeName: string,
  kaiserStatus: string
): typeof HAS_MEMBER_HOUSED_YES | typeof HAS_MEMBER_HOUSED_NO | '' {
  const rcfe = String(rcfeName || '').trim();
  if (!rcfe) return '';
  if (!isHousedEligibleKaiserStatus(kaiserStatus)) return '';
  return HAS_MEMBER_HOUSED_YES;
}

export function mapKaiserStatusToCsEngagement(kaiserStatus: string): CsMemberEngagementCode {
  const normalized = normalizeKaiserStatusName(String(kaiserStatus || '').trim());
  if (!normalized) return 1;
  if (DISCONTINUED_STATUSES.has(normalized)) return 4;
  if (DELIVERING_SERVICE_STATUSES.has(normalized)) return 3;
  const loose = normalizeStatusLoose(normalized);
  if (loose === 'placed') return 3;
  if (loose.includes('h2022') && loose.includes('revisit')) return 3;
  if (PENDING_OUTREACH_STATUSES.has(normalized)) return 1;
  if (IN_OUTREACH_STATUSES.has(normalized)) return 2;
  return 2;
}

export function formatRtfDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatRtfReportingPeriod(start: unknown, end: unknown): string {
  const startFormatted = formatRtfDate(start);
  const endFormatted = formatRtfDate(end);
  if (!startFormatted || !endFormatted) return '';
  return `${startFormatted}.${endFormatted}`;
}

export function pickFirstAndLastNotes(notes: MemberNoteLike[]): FirstLastNoteSummary {
  const sorted = [...(notes || [])]
    .filter((note) => String(note?.createdAt || '').trim())
    .sort((a, b) => new Date(String(a.createdAt)).getTime() - new Date(String(b.createdAt)).getTime());

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    firstNoteDate: first?.createdAt ? formatRtfDate(first.createdAt) : '',
    firstNoteText: String(first?.noteText || '').trim(),
    lastNoteDate: last?.createdAt ? formatRtfDate(last.createdAt) : '',
    lastNoteText: String(last?.noteText || '').trim(),
  };
}

export type IlsRtfRowValues = {
  mrn: string;
  cin: string;
  engagementCode: CsMemberEngagementCode;
  authorizationNumber: string;
  outreachMethod: 1 | 2 | 3;
  providerType: 1 | 2;
  dateOfOutreachAttempt: string;
  hasMemberBeenHoused: typeof HAS_MEMBER_HOUSED_YES | typeof HAS_MEMBER_HOUSED_NO | '';
  rtfProductionDate: string;
  rtfReportingPeriod: string;
};

export type IlsRtfTemplate = {
  fileName: string;
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
};

const normalizeRtfHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const RTF_HEADER_ALIASES: Record<keyof IlsRtfRowValues, string[]> = {
  mrn: ['medicalrecordnumbermrn', 'medicalrecordnumber', 'mrn'],
  cin: ['memberclientindexnumbercin', 'memberclientindexnumber', 'cin', 'mcpcin'],
  engagementCode: ['statusofmemberengagement'],
  authorizationNumber: ['authorizationnumber'],
  outreachMethod: ['outreachattemptmethod'],
  providerType: ['providertype'],
  dateOfOutreachAttempt: ['dateofoutreachattempt'],
  hasMemberBeenHoused: ['hasmemberbeenhoused'],
  rtfProductionDate: [
    'communitysupportsproviderrtfproductiondate',
    'rtfproductiondate',
    'communitysupportsproviderrtfproduction',
  ],
  rtfReportingPeriod: [
    'communitysupportsproviderrtfreportingperiod',
    'rtfreportingperiod',
    'communitysupportsproviderrtfreporting',
  ],
};

export function findRtfSheetName(sheetNames: string[]): string {
  const names = Array.isArray(sheetNames) ? sheetNames : [];
  const exact = names.find((name) => normalizeRtfHeader(name) === 'rtfcs');
  if (exact) return exact;
  const includes = names.find((name) => normalizeRtfHeader(name).includes('rtf'));
  if (includes) return includes;
  return '';
}

const findHeaderRowIndex = (matrix: string[][]) => {
  const scanRows = Math.min(matrix.length, 8);
  for (let rowIdx = 0; rowIdx < scanRows; rowIdx += 1) {
    const row = matrix[rowIdx] || [];
    const normalized = row.map((cell) => normalizeRtfHeader(cell));
    const hasMrn = normalized.some((cell) => RTF_HEADER_ALIASES.mrn.includes(cell) || cell.includes('mrn'));
    const hasEngagement = normalized.some((cell) => cell.includes('statusofmemberengagement'));
    if (hasMrn || hasEngagement) return rowIdx;
  }
  return 0;
};

const buildHeaderColumnMap = (headers: string[]) => {
  const normalizedHeaders = headers.map((header) => normalizeRtfHeader(header));
  const map: Partial<Record<keyof IlsRtfRowValues, number>> = {};

  (Object.entries(RTF_HEADER_ALIASES) as [keyof IlsRtfRowValues, string[]][]).forEach(([field, aliases]) => {
    const idx = normalizedHeaders.findIndex((header) =>
      aliases.some((alias) => header === alias || header.includes(alias))
    );
    if (idx >= 0) map[field] = idx;
  });

  return map;
};

export function parseIlsRtfTemplateFromWorkbook(
  wb: { SheetNames: string[]; Sheets: Record<string, unknown> },
  XLSX: typeof import('xlsx'),
  fileName: string
): IlsRtfTemplate | null {
  const sheetName = findRtfSheetName(wb.SheetNames || []);
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;

  const matrix = (XLSX.utils.sheet_to_json<unknown[]>(ws as any, {
    header: 1,
    defval: '',
    raw: false,
  }) || []) as string[][];

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = (matrix[headerRowIndex] || []).map((cell) => String(cell || '').replace(/\s+/g, ' ').trim());

  return {
    fileName,
    sheetName,
    headerRowIndex,
    headers,
  };
}

const normalizeIdentityToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

const buildSheetIdentityMaps = (matrix: string[][], headerRowIndex: number, headerMap: ReturnType<typeof buildHeaderColumnMap>) => {
  const mrnToRow = new Map<string, number>();
  const cinToRow = new Map<string, number>();
  const mrnCol = headerMap.mrn;
  const cinCol = headerMap.cin;

  for (let rowIdx = headerRowIndex + 1; rowIdx < matrix.length; rowIdx += 1) {
    const row = matrix[rowIdx] || [];
    if (mrnCol !== undefined) {
      const mrn = normalizeIdentityToken(row[mrnCol]);
      if (mrn) mrnToRow.set(mrn, rowIdx);
    }
    if (cinCol !== undefined) {
      const cin = normalizeIdentityToken(row[cinCol]);
      if (cin) cinToRow.set(cin, rowIdx);
    }
  }

  return { mrnToRow, cinToRow };
};

const setSheetCell = (
  ws: Record<string, unknown>,
  rowIdx: number,
  colIdx: number,
  value: string | number,
  XLSX: typeof import('xlsx')
) => {
  const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  const existing = (ws as any)[addr];
  const nextType = typeof value === 'number' ? 'n' : 's';
  (ws as any)[addr] = {
    ...(existing && typeof existing === 'object' ? existing : {}),
    t: nextType,
    v: value,
  };
};

const valueForField = (field: keyof IlsRtfRowValues, row: IlsRtfRowValues): string | number | '' => {
  switch (field) {
    case 'mrn':
    case 'cin':
      return '';
    case 'engagementCode':
      return row.engagementCode;
    case 'authorizationNumber':
      return row.authorizationNumber;
    case 'outreachMethod':
      return row.outreachMethod;
    case 'providerType':
      return row.providerType;
    case 'dateOfOutreachAttempt':
      return row.dateOfOutreachAttempt;
    case 'hasMemberBeenHoused':
      return row.hasMemberBeenHoused === '' ? '' : row.hasMemberBeenHoused;
    case 'rtfProductionDate':
      return row.rtfProductionDate;
    case 'rtfReportingPeriod':
      return row.rtfReportingPeriod;
    default:
      return '';
  }
};

/** Fill provider response values into the RTF tab of the original ILS workbook (MIF tab untouched). */
export function fillIlsRtfWorkbook(
  workbookBuffer: ArrayBuffer,
  reportRows: IlsRtfRowValues[],
  template: IlsRtfTemplate | null,
  XLSX: typeof import('xlsx')
): ArrayBuffer {
  const wb = XLSX.read(workbookBuffer, { type: 'array', cellDates: true });
  const sheetName =
    template?.sheetName ||
    findRtfSheetName(wb.SheetNames || '') ||
    '';
  if (!sheetName) {
    throw new Error('No RTF worksheet found in the uploaded MIF workbook.');
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`RTF worksheet "${sheetName}" is missing.`);

  const matrix = (XLSX.utils.sheet_to_json<unknown[]>(ws as any, {
    header: 1,
    defval: '',
    raw: false,
  }) || []) as string[][];

  const headerRowIndex = template?.headerRowIndex ?? findHeaderRowIndex(matrix);
  const headers =
    template?.headers?.length
      ? template.headers
      : (matrix[headerRowIndex] || []).map((cell) => String(cell || '').replace(/\s+/g, ' ').trim());

  const headerMap = buildHeaderColumnMap(headers);
  const { mrnToRow, cinToRow } = buildSheetIdentityMaps(matrix, headerRowIndex, headerMap);

  const responseFields: (keyof IlsRtfRowValues)[] = [
    'engagementCode',
    'authorizationNumber',
    'outreachMethod',
    'providerType',
    'dateOfOutreachAttempt',
    'hasMemberBeenHoused',
    'rtfProductionDate',
    'rtfReportingPeriod',
  ];

  for (const row of reportRows) {
    const mrnKey = normalizeIdentityToken(row.mrn);
    const cinKey = normalizeIdentityToken(row.cin);
    const targetRowIdx =
      (mrnKey && mrnToRow.get(mrnKey)) ||
      (cinKey && cinToRow.get(cinKey)) ||
      undefined;
    if (targetRowIdx === undefined) continue;

    for (const field of responseFields) {
      const colIdx = headerMap[field];
      if (colIdx === undefined) continue;
      const value = valueForField(field, row);
      if (value === '') continue;
      setSheetCell(ws as Record<string, unknown>, targetRowIdx, colIdx, value, XLSX);
    }
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function defaultRtfProductionDate(): string {
  return formatRtfDate(new Date());
}

export function defaultRtfReportingPeriod(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return formatRtfReportingPeriod(start, end);
}
