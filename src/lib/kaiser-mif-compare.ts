import * as XLSX from 'xlsx';
import {
  parseIlsMifSpreadsheetWorkbook,
  pickIlsSheetName,
  repairWorksheetUsedRange,
  type IlsMifMasterRow,
} from '@/lib/ils-mif-parse';
import { isKaiserInactiveStatus } from '@/lib/batch-eligibility';
import { canonicalInactiveCalaimStatus } from '@/lib/inactive-calaim-status';
import { identityTokenLookupKeys } from '@/lib/member-identity';
import { isAuthorizedCalaimStatus, isKaiserPlan, parseDateOnly, formatUsDate } from '@/lib/t2038-claims';

const clean = (value: unknown) => String(value ?? '').trim();

const pickFirst = (...values: unknown[]) => {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return '';
};

const normalizeHeader = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normalizeName = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeId = (value: unknown) =>
  clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Strip leading zeros for Kaiser MRN compare (portal pads to 12 digits; Caspio often does not). */
const stripLeadingZeros = (value: string) => {
  const raw = normalizeId(value);
  if (!raw) return '';
  if (!/^\d+$/.test(raw)) return raw;
  const stripped = raw.replace(/^0+/, '');
  return stripped || '0';
};

/** Preserve Excel MRN/CIN text (leading zeros) and avoid scientific notation. */
function formatSpreadsheetIdentifier(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) || Math.abs(value - Math.trunc(value)) < 1e-9) {
      return String(Math.trunc(value));
    }
    return String(value).trim();
  }
  const text = String(value).trim();
  if (!text) return '';
  const sci = text.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (sci) {
    const n = Number(text);
    if (Number.isFinite(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
      return String(Math.trunc(n));
    }
  }
  // Excel sometimes keeps a leading apostrophe for text IDs.
  return text.replace(/^'/, '').trim();
}

export type KaiserMifCompareMember = {
  clientId2: string;
  memberFirstName: string;
  memberLastName: string;
  memberName: string;
  mrn: string;
  cin: string;
  /** Extra MRN/CIN/MCP tokens so field swaps still match. */
  altIds: string[];
  dob: string;
  calaimStatus: string;
  kaiserStatus: string;
  authorizationNumber: string;
  authorizationStart: string;
  authorizationEnd: string;
  source: 'caspio' | 'portal';
  rowNumber?: number;
};

export type KaiserMifMatchMethod = 'mrn' | 'cin' | 'clientId2' | 'name_dob' | 'name' | '';

export type KaiserMifCompareHit = {
  portal: KaiserMifCompareMember | null;
  ours: KaiserMifCompareMember | null;
  /** Reserved: previously annotated non-roster Caspio hits (roster is now all statuses). */
  caspioOther: KaiserMifCompareMember | null;
  matchMethod: KaiserMifMatchMethod;
  bucket: 'matched' | 'portal_only' | 'ours_only';
};

export type KaiserMifCompareResult = {
  matched: KaiserMifCompareHit[];
  portalOnly: KaiserMifCompareHit[];
  oursOnly: KaiserMifCompareHit[];
  summary: {
    portalCount: number;
    oursCount: number;
    matched: number;
    portalOnly: number;
    oursOnly: number;
    portalOnlyFoundInCaspioNotAuthorized: number;
  };
};

export type KaiserMifStatusFilter = 'all' | 'hide_died_nonactive' | 'only_died_nonactive';

/** Our-roster view: all Caspio statuses, or only currently Authorized. */
export type KaiserMifRosterFilter = 'all' | 'authorized';

/** True when CalAIM_Status or Kaiser_Status is Member Died or Non-Active (incl. Inactive). */
export function isKaiserMifDiedOrNonActiveStatus(...statuses: unknown[]): boolean {
  for (const status of statuses) {
    const inactive = canonicalInactiveCalaimStatus(status);
    if (inactive === 'Member Died' || inactive === 'Non-Active') return true;
    if (isKaiserInactiveStatus(status)) return true;
  }
  return false;
}

/** Hit matches Member Died / Non-Active on our authorized row or Caspio other-status annotation. */
export function kaiserMifHitIsDiedOrNonActive(hit: KaiserMifCompareHit): boolean {
  return isKaiserMifDiedOrNonActiveStatus(
    hit.ours?.calaimStatus,
    hit.ours?.kaiserStatus,
    hit.caspioOther?.calaimStatus,
    hit.caspioOther?.kaiserStatus
  );
}

export function filterKaiserMifHitsByStatus(
  hits: KaiserMifCompareHit[],
  statusFilter: KaiserMifStatusFilter
): KaiserMifCompareHit[] {
  if (statusFilter === 'all') return hits;
  if (statusFilter === 'hide_died_nonactive') {
    return hits.filter((hit) => !kaiserMifHitIsDiedOrNonActive(hit));
  }
  return hits.filter((hit) => kaiserMifHitIsDiedOrNonActive(hit));
}

/**
 * Restrict list to currently Authorized “ours” rows.
 * Portal-only rows (no Caspio hit) stay visible; matched / ours-only require Authorized.
 */
export function filterKaiserMifHitsByRoster(
  hits: KaiserMifCompareHit[],
  rosterFilter: KaiserMifRosterFilter
): KaiserMifCompareHit[] {
  if (rosterFilter === 'all') return hits;
  return hits.filter((hit) => {
    if (!hit.ours) return true;
    return isAuthorizedCalaimStatus(hit.ours.calaimStatus);
  });
}

const FIRST_NAME_HEADERS = [
  'memberfirstname',
  'firstname',
  'first',
  'patientfirstname',
  'clientfirstname',
  'seniorfirst',
];
const LAST_NAME_HEADERS = [
  'memberlastname',
  'lastname',
  'last',
  'patientlastname',
  'clientlastname',
  'seniorlast',
];
const FULL_NAME_HEADERS = [
  'membername',
  'patientname',
  'clientname',
  'name',
  'member',
  'fullname',
];
const MRN_HEADERS = [
  'medicalrecordnumbermrn',
  'medicalrecordnumber',
  'membermrn',
  'kaisermrn',
  'mrn',
  'medicalrecordno',
];
const CIN_HEADERS = [
  'medicalmemberclientindexnumbercin',
  'memberclientindexnumbercin',
  'clientindexnumbercin',
  'mcpcin',
  'medicaidid',
  'medicalid',
  'cin',
  'medicalnumber',
  'medicaidnumber',
];
const DOB_HEADERS = ['dateofbirth', 'dob', 'birthdate', 'memberdob', 'patientdob'];
const CLIENT_ID_HEADERS = ['clientid2', 'clientid', 'client_id2', 'memberid'];
const STATUS_HEADERS = ['status', 'calaimstatus', 'authorizationstatus', 'memberstatus'];

function headerIndex(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((c) => normalizeHeader(c)).filter(Boolean);
  // Prefer exact header matches first (avoids short tokens like "cin"/"mrn" false positives).
  for (let i = 0; i < headers.length; i += 1) {
    const h = normalizeHeader(headers[i]);
    if (!h) continue;
    if (normalizedCandidates.some((c) => h === c)) return i;
  }
  for (let i = 0; i < headers.length; i += 1) {
    const h = normalizeHeader(headers[i]);
    if (!h) continue;
    if (
      normalizedCandidates.some((c) => {
        if (c.length <= 3) {
          // Short tokens (mrn/cin) must be a standalone suffix/prefix, not a mid-string accident.
          return h === c || h.endsWith(c) || h.startsWith(c);
        }
        return h.includes(c) || c.includes(h);
      })
    ) {
      return i;
    }
  }
  return -1;
}

function splitFullName(value: string): { first: string; last: string } {
  const raw = clean(value);
  if (!raw) return { first: '', last: '' };
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    return { last: clean(last), first: clean(rest.join(' ')) };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function scoreHeaderRow(row: unknown[]) {
  const cells = (row || []).map((cell) => normalizeHeader(cell));
  let score = 0;
  if (cells.some((c) => FIRST_NAME_HEADERS.some((h) => c === h || c.includes(h)))) score += 3;
  if (cells.some((c) => LAST_NAME_HEADERS.some((h) => c === h || c.includes(h)))) score += 3;
  if (cells.some((c) => MRN_HEADERS.some((h) => c === h || c.includes(h)))) score += 3;
  if (cells.some((c) => CIN_HEADERS.some((h) => c === h || c.includes(h)))) score += 2;
  if (cells.some((c) => FULL_NAME_HEADERS.some((h) => c === h || c.includes('membername')))) score += 2;
  if (cells.some((c) => DOB_HEADERS.some((h) => c === h || c.includes(h)))) score += 1;
  return score;
}

function findHeaderRowIndex(matrix: unknown[][]) {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(Array.isArray(matrix[i]) ? matrix[i] : []);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= 3 ? bestIdx : 0;
}

function cellValue(row: unknown[], index: number) {
  if (index < 0) return '';
  const value = row[index];
  if (value instanceof Date) return formatUsDate(value);
  return clean(value);
}

function idCellValue(row: unknown[], index: number) {
  if (index < 0) return '';
  return normalizeId(formatSpreadsheetIdentifier(row[index]));
}

/** Read sheet matrix preferring formatted text (.w) so MRNs keep leading zeros. */
function sheetMatrixPreservingText(ws: XLSX.WorkSheet): unknown[][] {
  const ref = String(ws['!ref'] || 'A1');
  const range = XLSX.utils.decode_range(ref);
  const matrix: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row: unknown[] = [];
    let any = false;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell) {
        row.push('');
        continue;
      }
      any = true;
      // Prefer Excel display text for identifiers typed as text with leading zeros.
      if (typeof cell.w === 'string' && cell.w.trim()) {
        row.push(cell.w);
      } else if (cell.t === 's' || typeof cell.v === 'string') {
        row.push(cell.v);
      } else if (cell.t === 'n' && typeof cell.v === 'number') {
        row.push(cell.v);
      } else if (cell.v instanceof Date) {
        row.push(cell.v);
      } else {
        row.push(cell.v ?? '');
      }
    }
    if (any || row.some((v) => clean(v))) matrix.push(row);
  }
  return matrix;
}

/** True when a status string means H2022 / On H2022 Revisits. */
export function isKaiserMifH2022Status(value: unknown): boolean {
  const status = clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!status) return false;
  if (status === 'h2022') return true;
  return status.includes('h2022');
}

/**
 * Members we treat as “ours” for portal MIF compare.
 * All Kaiser Caspio rows (any CalAIM_Status / Kaiser_Status) so portal-only means not in Caspio.
 */
export function isKaiserMifRosterMember(
  _member: Pick<KaiserMifCompareMember, 'calaimStatus' | 'kaiserStatus'>
): boolean {
  return true;
}

export function mapCaspioRawToKaiserCompareMember(
  raw: Record<string, unknown>,
  index = 0
): KaiserMifCompareMember | null {
  if (!isKaiserPlan(pickFirst(raw.CalAIM_MCO, raw.memberHealthPlan, raw.healthPlan))) return null;
  const memberFirstName = pickFirst(raw.Senior_First, raw.memberFirstName, raw.First_Name);
  const memberLastName = pickFirst(raw.Senior_Last, raw.memberLastName, raw.Last_Name);
  const clientId2 = pickFirst(raw.Client_ID2, raw.client_ID2, raw.clientId2);
  // Caspio UI "MRN" → Member_MRN/MRN. Kaiser batches often also store MRN in MCP_CIN / memberMrn.
  const memberMrnField = normalizeId(
    pickFirst(
      raw.Member_MRN,
      raw.Kaiser_MRN,
      raw.MRN,
      raw.Medical_Record_Number,
      raw.Medical_Record_Number_MRN
    )
  );
  // Caspio UI "MediCal Number" → MediCal_Number (true CIN). MCP_CIN is often the Kaiser MRN.
  const mediCalField = normalizeId(
    pickFirst(raw.MediCal_Number, raw.Medical_Number, raw.Medi_Cal_Number, raw.memberMediCalNum)
  );
  const mcpCin = normalizeId(pickFirst(raw.MCP_CIN, raw.CIN));
  const trackerMrn = normalizeId(pickFirst(raw.memberMrn));
  const mrnFinal =
    memberMrnField ||
    (mcpCin && mcpCin !== mediCalField ? mcpCin : '') ||
    (trackerMrn && trackerMrn !== mediCalField ? trackerMrn : '') ||
    '';
  const cin = mediCalField || (mcpCin && mcpCin !== mrnFinal ? mcpCin : '') || '';
  const altIds = Array.from(
    new Set(
      [memberMrnField, mediCalField, mcpCin, trackerMrn, mrnFinal, cin].filter((value) => Boolean(value))
    )
  );
  const dob = formatUsDate(
    parseDateOnly(
      pickFirst(
        raw.Birth_Date,
        raw.Senior_DOB,
        raw.DOB,
        raw.Date_of_Birth,
        raw.Date_Of_Birth,
        raw.Member_DOB,
        raw.birthDate,
        raw.memberDob
      )
    )
  );
  return {
    clientId2,
    memberFirstName,
    memberLastName,
    memberName: [memberLastName, memberFirstName].filter(Boolean).join(', ') || clientId2 || `Member ${index}`,
    mrn: mrnFinal,
    cin,
    altIds,
    dob,
    calaimStatus: pickFirst(raw.CalAIM_Status, raw.calaimStatus, raw.caspioCalAIMStatus, raw.memberStatus),
    kaiserStatus: pickFirst(raw.Kaiser_Status, raw.Kaiser_ID_Status, raw.kaiserStatus),
    authorizationNumber: pickFirst(raw.Authorization_Number_T2038, raw.Authorization_Number_T038),
    authorizationStart: formatUsDate(
      parseDateOnly(pickFirst(raw.Authorization_Start_Date_T2038, raw.Authorization_Start_T2038))
    ),
    authorizationEnd: formatUsDate(
      parseDateOnly(pickFirst(raw.Authorization_End_Date_T2038, raw.Authorization_End_T2038))
    ),
    source: 'caspio',
  };
}

export function collectAuthorizedKaiserMembers(
  rawMembers: Array<Record<string, unknown>> | null | undefined
): { authorized: KaiserMifCompareMember[]; allKaiser: KaiserMifCompareMember[] } {
  const allKaiser: KaiserMifCompareMember[] = [];
  const seenAll = new Set<string>();
  (Array.isArray(rawMembers) ? rawMembers : []).forEach((raw, index) => {
    const member = mapCaspioRawToKaiserCompareMember(raw || {}, index);
    if (!member) return;
    const key = normalizeId(member.clientId2) || `${normalizeName(member.memberName)}|${member.mrn}|${member.cin}`;
    if (seenAll.has(key)) return;
    seenAll.add(key);
    allKaiser.push(member);
  });
  allKaiser.sort((a, b) => a.memberName.localeCompare(b.memberName, undefined, { sensitivity: 'base' }));
  // `authorized` kept for API/UI compatibility — full Kaiser roster, every CalAIM_Status.
  return { authorized: allKaiser, allKaiser };
}

function scorePortalSheet(matrix: unknown[][], sheetName: string): number {
  if (!matrix.length) return -1;
  const headerIdx = findHeaderRowIndex(matrix);
  const headerRow = (Array.isArray(matrix[headerIdx]) ? matrix[headerIdx] : []).map((c) => clean(c));
  const mrnIdx = headerIndex(headerRow, MRN_HEADERS);
  const cinIdx = headerIndex(headerRow, CIN_HEADERS);
  const firstIdx = headerIndex(headerRow, FIRST_NAME_HEADERS);
  const lastIdx = headerIndex(headerRow, LAST_NAME_HEADERS);
  const dataRows = Math.max(0, matrix.length - headerIdx - 1);
  let score = 0;
  if (mrnIdx >= 0) score += 80;
  if (cinIdx >= 0) score += 40;
  if (firstIdx >= 0) score += 25;
  if (lastIdx >= 0) score += 25;
  score += Math.min(dataRows, 800);
  const n = normalizeHeader(sheetName);
  if (n === 'csmif' || n.includes('csmif')) score += 1000;
  if (n === 'lists' || n.endsWith('list') || n.includes('dropdown')) score -= 250;
  return score;
}

function pickKaiserPortalSheetName(wb: XLSX.WorkBook): string {
  const preferred = pickIlsSheetName(wb.SheetNames);
  let bestName = preferred || wb.SheetNames[0] || '';
  let bestScore = -1;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    try {
      repairWorksheetUsedRange(ws, XLSX);
    } catch {
      // continue with current range
    }
    const matrix = sheetMatrixPreservingText(ws);
    let score = scorePortalSheet(matrix, name);
    if (name === preferred) score += 60;
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
    }
  }
  return bestName;
}

function mapIlsMifRowToPortalMember(row: IlsMifMasterRow, index: number): KaiserMifCompareMember {
  const mrn = normalizeId(formatSpreadsheetIdentifier(row.memberMrn));
  const cin = normalizeId(formatSpreadsheetIdentifier(row.memberMediCalNum));
  return {
    clientId2: clean(row.clientId2),
    memberFirstName: clean(row.memberFirstName),
    memberLastName: clean(row.memberLastName),
    memberName:
      [clean(row.memberLastName), clean(row.memberFirstName)].filter(Boolean).join(', ') ||
      clean(row.memberMrn) ||
      clean(row.memberMediCalNum) ||
      `Row ${index + 1}`,
    mrn,
    cin,
    altIds: Array.from(new Set([mrn, cin].filter(Boolean))),
    dob: clean(row.memberDob),
    calaimStatus: '',
    kaiserStatus: '',
    authorizationNumber: clean(row.authorizationNumberT2038),
    authorizationStart: clean(row.authorizationStartT2038),
    authorizationEnd: clean(row.authorizationEndT2038),
    source: 'portal',
    rowNumber: index + 1,
  };
}

/**
 * Preferred path for Kaiser/ILS CS MIF Excel files (e.g. *_MIF_CS.xlsx).
 * Uses the same CS_MIF sheet + column mapping as the ILS MIF consolidator —
 * avoids the companion "Lists" tab that has no MRN/CIN member columns.
 */
export async function parseKaiserPortalMifFile(file: File): Promise<{
  members: KaiserMifCompareMember[];
  sheetName: string;
  headerRow: number;
  mrnColumn: string;
  cinColumn: string;
  rowsWithMrn: number;
  rowsWithCin: number;
}> {
  const parsed = await parseIlsMifSpreadsheetWorkbook(file);
  const members = parsed.members.map((row, index) => mapIlsMifRowToPortalMember(row, index));
  const sheetName = clean(parsed.members[0]?.sourceSheetName) || pickIlsSheetName([]) || 'CS_MIF';
  const rowsWithMrn = members.filter((m) => Boolean(m.mrn)).length;
  const rowsWithCin = members.filter((m) => Boolean(m.cin)).length;
  return {
    members,
    sheetName,
    headerRow: 1,
    mrnColumn: 'Medical Record Number (MRN)',
    cinColumn: 'Medi-Cal Member Client Index Number (CIN)',
    rowsWithMrn,
    rowsWithCin,
  };
}

export function parseKaiserPortalMifWorkbook(buffer: ArrayBuffer): {
  members: KaiserMifCompareMember[];
  sheetName: string;
  headerRow: number;
  mrnColumn: string;
  cinColumn: string;
  rowsWithMrn: number;
  rowsWithCin: number;
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellText: true });
  const sheetName = pickKaiserPortalSheetName(wb);
  if (!sheetName) {
    return {
      members: [],
      sheetName: '',
      headerRow: 0,
      mrnColumn: '',
      cinColumn: '',
      rowsWithMrn: 0,
      rowsWithCin: 0,
    };
  }
  const ws = wb.Sheets[sheetName];
  try {
    repairWorksheetUsedRange(ws, XLSX);
  } catch {
    // keep going
  }
  const matrix = sheetMatrixPreservingText(ws);
  if (!matrix.length) {
    return {
      members: [],
      sheetName,
      headerRow: 0,
      mrnColumn: '',
      cinColumn: '',
      rowsWithMrn: 0,
      rowsWithCin: 0,
    };
  }

  const headerIdx = findHeaderRowIndex(matrix);
  const headerRow = (Array.isArray(matrix[headerIdx]) ? matrix[headerIdx] : []).map((c) =>
    clean(c)
  );
  const firstIdx = headerIndex(headerRow, FIRST_NAME_HEADERS);
  const lastIdx = headerIndex(headerRow, LAST_NAME_HEADERS);
  const fullIdx = headerIndex(headerRow, FULL_NAME_HEADERS);
  const mrnIdx = headerIndex(headerRow, MRN_HEADERS);
  const cinIdx = headerIndex(headerRow, CIN_HEADERS);
  const dobIdx = headerIndex(headerRow, DOB_HEADERS);
  const clientIdx = headerIndex(headerRow, CLIENT_ID_HEADERS);
  const statusIdx = headerIndex(headerRow, STATUS_HEADERS);

  const members: KaiserMifCompareMember[] = [];
  const seen = new Set<string>();
  let rowsWithMrn = 0;
  let rowsWithCin = 0;
  for (let r = headerIdx + 1; r < matrix.length; r += 1) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    let first = cellValue(row, firstIdx);
    let last = cellValue(row, lastIdx);
    if ((!first || !last) && fullIdx >= 0) {
      const split = splitFullName(cellValue(row, fullIdx));
      if (!first) first = split.first;
      if (!last) last = split.last;
    }
    // Keep portal MRN text (including leading zeros). Matching also tries zero-stripped form.
    const mrn = idCellValue(row, mrnIdx);
    const cin = idCellValue(row, cinIdx);
    const clientId2 = clean(formatSpreadsheetIdentifier(row[clientIdx]));
    const dob = formatUsDate(parseDateOnly(cellValue(row, dobIdx))) || cellValue(row, dobIdx);
    if (!first && !last && !mrn && !cin && !clientId2) continue;
    if (mrn) rowsWithMrn += 1;
    if (cin) rowsWithCin += 1;
    const member: KaiserMifCompareMember = {
      clientId2,
      memberFirstName: first,
      memberLastName: last,
      memberName: [last, first].filter(Boolean).join(', ') || mrn || cin || `Row ${r + 1}`,
      mrn,
      cin,
      altIds: Array.from(new Set([mrn, cin].filter(Boolean))),
      dob,
      calaimStatus: cellValue(row, statusIdx),
      kaiserStatus: '',
      authorizationNumber: '',
      authorizationStart: '',
      authorizationEnd: '',
      source: 'portal',
      rowNumber: r + 1,
    };
    const key =
      normalizeId(clientId2) ||
      stripLeadingZeros(mrn) ||
      mrn ||
      cin ||
      `${normalizeName(last)}|${normalizeName(first)}|${normalizeId(dob)}|${r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    members.push(member);
  }
  return {
    members,
    sheetName,
    headerRow: headerIdx + 1,
    mrnColumn: mrnIdx >= 0 ? headerRow[mrnIdx] || `col ${mrnIdx + 1}` : '(not detected)',
    cinColumn: cinIdx >= 0 ? headerRow[cinIdx] || `col ${cinIdx + 1}` : '(not detected)',
    rowsWithMrn,
    rowsWithCin,
  };
}

function indexIdentifier(
  map: Map<string, KaiserMifCompareMember>,
  value: string,
  member: KaiserMifCompareMember
) {
  for (const key of identityTokenLookupKeys(value)) {
    if (!map.has(key)) map.set(key, member);
  }
  // Also keep uppercase normalizeId form for callers that still use it.
  const upper = normalizeId(value);
  if (upper && !map.has(upper)) map.set(upper, member);
  const stripped = stripLeadingZeros(upper);
  if (stripped && !map.has(stripped)) map.set(stripped, member);
}

function lookupIdentifier(
  map: Map<string, KaiserMifCompareMember>,
  value: string
): KaiserMifCompareMember | undefined {
  if (!value) return undefined;
  for (const key of identityTokenLookupKeys(value)) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  const upper = normalizeId(value);
  if (upper && map.has(upper)) return map.get(upper);
  const stripped = stripLeadingZeros(upper);
  if (stripped && map.has(stripped)) return map.get(stripped);
  return undefined;
}

function buildIndexes(members: KaiserMifCompareMember[]) {
  const byMrn = new Map<string, KaiserMifCompareMember>();
  const byCin = new Map<string, KaiserMifCompareMember>();
  const byAnyId = new Map<string, KaiserMifCompareMember>();
  const byClient = new Map<string, KaiserMifCompareMember>();
  const byNameDob = new Map<string, KaiserMifCompareMember>();
  const byName = new Map<string, KaiserMifCompareMember[]>();
  for (const member of members) {
    if (member.mrn) {
      indexIdentifier(byMrn, member.mrn, member);
      indexIdentifier(byAnyId, member.mrn, member);
    }
    if (member.cin) {
      indexIdentifier(byCin, member.cin, member);
      indexIdentifier(byAnyId, member.cin, member);
    }
    for (const alt of member.altIds || []) {
      indexIdentifier(byAnyId, alt, member);
      // Treat alt tokens as both MRN and CIN candidates (Caspio field swaps).
      indexIdentifier(byMrn, alt, member);
      indexIdentifier(byCin, alt, member);
    }
    const clientKey = normalizeId(member.clientId2);
    if (clientKey && !byClient.has(clientKey)) byClient.set(clientKey, member);
    for (const key of identityTokenLookupKeys(member.clientId2)) {
      if (!byClient.has(key)) byClient.set(key, member);
    }
    const nameKey = `${normalizeName(member.memberLastName)}|${normalizeName(member.memberFirstName)}`;
    if (nameKey !== '|') {
      const list = byName.get(nameKey) || [];
      list.push(member);
      byName.set(nameKey, list);
      if (member.dob) {
        const nd = `${nameKey}|${normalizeId(member.dob)}`;
        if (!byNameDob.has(nd)) byNameDob.set(nd, member);
      }
    }
  }
  return { byMrn, byCin, byAnyId, byClient, byNameDob, byName };
}

function findMatch(
  target: KaiserMifCompareMember,
  indexes: ReturnType<typeof buildIndexes>
): { member: KaiserMifCompareMember; method: KaiserMifMatchMethod } | null {
  if (target.clientId2) {
    const clientHit =
      indexes.byClient.get(normalizeId(target.clientId2)) ||
      (() => {
        for (const key of identityTokenLookupKeys(target.clientId2)) {
          const hit = indexes.byClient.get(key);
          if (hit) return hit;
        }
        return undefined;
      })();
    if (clientHit) return { member: clientHit, method: 'clientId2' };
  }

  if (target.mrn) {
    // Same as ILS MIF: try MRN index, then CIN index (Caspio often swaps / duplicates IDs).
    const viaMrn =
      lookupIdentifier(indexes.byMrn, target.mrn) ||
      lookupIdentifier(indexes.byCin, target.mrn) ||
      lookupIdentifier(indexes.byAnyId, target.mrn);
    if (viaMrn) return { member: viaMrn, method: 'mrn' };
  }
  if (target.cin) {
    const viaCin =
      lookupIdentifier(indexes.byCin, target.cin) ||
      lookupIdentifier(indexes.byMrn, target.cin) ||
      lookupIdentifier(indexes.byAnyId, target.cin);
    if (viaCin) return { member: viaCin, method: 'cin' };
  }
  const nameKey = `${normalizeName(target.memberLastName)}|${normalizeName(target.memberFirstName)}`;
  if (nameKey !== '|' && target.dob) {
    const nd = `${nameKey}|${normalizeId(target.dob)}`;
    if (indexes.byNameDob.has(nd)) {
      return { member: indexes.byNameDob.get(nd)!, method: 'name_dob' };
    }
  }
  if (nameKey !== '|') {
    const list = indexes.byName.get(nameKey) || [];
    if (list.length === 1) return { member: list[0], method: 'name' };
  }
  return null;
}

export function compareKaiserPortalToAuthorized(opts: {
  portalMembers: KaiserMifCompareMember[];
  authorizedMembers: KaiserMifCompareMember[];
  allKaiserMembers?: KaiserMifCompareMember[];
}): KaiserMifCompareResult {
  const authIndexes = buildIndexes(opts.authorizedMembers);
  const otherKaiser = (opts.allKaiserMembers || []).filter((m) => !isKaiserMifRosterMember(m));
  const otherIndexes = buildIndexes(otherKaiser);

  const matched: KaiserMifCompareHit[] = [];
  const portalOnly: KaiserMifCompareHit[] = [];
  const matchedOursKeys = new Set<string>();

  for (const portal of opts.portalMembers) {
    const hit = findMatch(portal, authIndexes);
    if (hit) {
      const oursKey =
        normalizeId(hit.member.clientId2) ||
        hit.member.mrn ||
        hit.member.cin ||
        `${normalizeName(hit.member.memberLastName)}|${normalizeName(hit.member.memberFirstName)}`;
      matchedOursKeys.add(oursKey);
      matched.push({
        portal,
        ours: hit.member,
        caspioOther: null,
        matchMethod: hit.method,
        bucket: 'matched',
      });
      continue;
    }
    const other = findMatch(portal, otherIndexes);
    portalOnly.push({
      portal,
      ours: null,
      caspioOther: other?.member || null,
      matchMethod: other?.method || '',
      bucket: 'portal_only',
    });
  }

  // Ours-only = currently Authorized Caspio members missing from the portal MIF
  // (other CalAIM statuses still match for portal-only detection, but are not listed here).
  const authorizedRoster = opts.authorizedMembers.filter((m) =>
    isAuthorizedCalaimStatus(m.calaimStatus)
  );
  const oursOnly: KaiserMifCompareHit[] = [];
  for (const ours of authorizedRoster) {
    const oursKey =
      normalizeId(ours.clientId2) ||
      ours.mrn ||
      ours.cin ||
      `${normalizeName(ours.memberLastName)}|${normalizeName(ours.memberFirstName)}`;
    if (matchedOursKeys.has(oursKey)) continue;
    oursOnly.push({
      portal: null,
      ours,
      caspioOther: null,
      matchMethod: '',
      bucket: 'ours_only',
    });
  }

  return {
    matched,
    portalOnly,
    oursOnly,
    summary: {
      portalCount: opts.portalMembers.length,
      oursCount: authorizedRoster.length,
      matched: matched.length,
      portalOnly: portalOnly.length,
      oursOnly: oursOnly.length,
      portalOnlyFoundInCaspioNotAuthorized: portalOnly.filter((h) => Boolean(h.caspioOther)).length,
    },
  };
}

export function kaiserMifCompareHitsToSheetRows(hits: KaiserMifCompareHit[]) {
  return hits.map((hit) => ({
    Bucket:
      hit.bucket === 'matched'
        ? 'Matched'
        : hit.bucket === 'portal_only'
          ? 'On Kaiser portal MIF only'
          : 'Authorized with us, missing from portal MIF',
    Match_Method: hit.matchMethod || '',
    Portal_Name: hit.portal?.memberName || '',
    Portal_MRN: hit.portal?.mrn || '',
    Portal_CIN: hit.portal?.cin || '',
    Portal_DOB: hit.portal?.dob || '',
    Portal_Row: hit.portal?.rowNumber || '',
    Ours_Name: hit.ours?.memberName || '',
    Ours_Client_ID2: hit.ours?.clientId2 || '',
    Ours_MRN: hit.ours?.mrn || '',
    Ours_CIN: hit.ours?.cin || '',
    Ours_CalAIM_Status: hit.ours?.calaimStatus || '',
    Ours_Kaiser_Status: hit.ours?.kaiserStatus || '',
    Ours_Auth: hit.ours
      ? `${hit.ours.authorizationStart || '—'} → ${hit.ours.authorizationEnd || '—'}`
      : '',
    Caspio_Other_Name: hit.caspioOther?.memberName || '',
    Caspio_Other_CalAIM_Status: hit.caspioOther?.calaimStatus || '',
    Caspio_Other_Kaiser_Status: hit.caspioOther?.kaiserStatus || '',
    Caspio_Other_Client_ID2: hit.caspioOther?.clientId2 || '',
  }));
}

export function buildKaiserMifCompareWorkbook(result: KaiserMifCompareResult): ArrayBuffer {
  const book = XLSX.utils.book_new();
  const sheets: Array<[string, KaiserMifCompareHit[]]> = [
    ['Portal only', result.portalOnly],
    ['Ours only', result.oursOnly],
    ['Matched', result.matched],
  ];
  for (const [name, hits] of sheets) {
    const rows = kaiserMifCompareHitsToSheetRows(hits);
    const sheet = XLSX.utils.json_to_sheet(
      rows.length
        ? rows
        : [{ Bucket: name, Note: 'No rows in this bucket' }]
    );
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  }
  const summary = XLSX.utils.aoa_to_sheet([
    ['Kaiser portal MIF vs Caspio Kaiser members'],
    ['Portal rows', result.summary.portalCount],
    ['Our Authorized (CalAIM_Status)', result.summary.oursCount],
    ['Matched (any Caspio status)', result.summary.matched],
    ['Portal only (not in Caspio)', result.summary.portalOnly],
    ['Ours only (Authorized, missing from portal)', result.summary.oursOnly],
    [
      'Portal only found in Caspio (legacy other-status note)',
      result.summary.portalOnlyFoundInCaspioNotAuthorized,
    ],
  ]);
  XLSX.utils.book_append_sheet(book, summary, 'Summary');
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/** Clean ILS handoff sheet: Authorized Caspio members missing from the Kaiser portal MIF. */
export function kaiserMifOursOnlyToIlsSheetRows(hits: KaiserMifCompareHit[]) {
  return hits
    .filter((hit) => hit.bucket === 'ours_only' && hit.ours)
    .map((hit, index) => {
      const ours = hit.ours!;
      return {
        Row: index + 1,
        Member_Last_Name: ours.memberLastName || '',
        Member_First_Name: ours.memberFirstName || '',
        Member_Name: ours.memberName || '',
        MRN: ours.mrn || '',
        MediCal_CIN: ours.cin || '',
        DOB: ours.dob || '',
        Client_ID2: ours.clientId2 || '',
        CalAIM_Status: ours.calaimStatus || '',
        Kaiser_Status: ours.kaiserStatus || '',
        Authorization_Number: ours.authorizationNumber || '',
        Authorization_Start: ours.authorizationStart || '',
        Authorization_End: ours.authorizationEnd || '',
        Issue:
          'Authorized in our Caspio roster but not found on the uploaded Kaiser portal MIF — please advise why this member does not appear in the Kaiser/ILS portal tool.',
      };
    });
}

export function buildKaiserMifOursOnlyIlsWorkbook(
  result: KaiserMifCompareResult,
  meta?: { portalFileName?: string; comparedAt?: string }
): ArrayBuffer {
  const book = XLSX.utils.book_new();
  const rows = kaiserMifOursOnlyToIlsSheetRows(result.oursOnly);
  const sheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [
          {
            Row: 0,
            Issue: 'No Authorized members were missing from the uploaded Kaiser portal MIF.',
          },
        ]
  );
  XLSX.utils.book_append_sheet(book, sheet, 'Ours only for ILS');
  const summary = XLSX.utils.aoa_to_sheet([
    ['Authorized Caspio members missing from Kaiser portal MIF'],
    ['Purpose', 'Send to ILS to investigate why these members do not appear in the Kaiser portal tool'],
    ['Compared at', meta?.comparedAt || new Date().toISOString()],
    ['Portal file', meta?.portalFileName || ''],
    ['Portal MIF rows', result.summary.portalCount],
    ['Our Authorized in Caspio', result.summary.oursCount],
    ['Ours only (this list)', rows.length],
    ['Matched', result.summary.matched],
    ['Portal only', result.summary.portalOnly],
  ]);
  XLSX.utils.book_append_sheet(book, summary, 'Cover note');
  const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
