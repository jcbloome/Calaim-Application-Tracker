import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import path from 'path';
import { readFile } from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const superAdminDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = superAdminDoc.exists;
    if (!isSuperAdmin && email) {
      const superAdminByEmailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = superAdminByEmailDoc.exists;
    }
  }

  if (!isSuperAdmin) return { ok: false as const, status: 403, error: 'Super Admin privileges required' };

  return { ok: true as const };
}

type EraRow = {
  payer: string;
  remittance_date: string | null;
  page: number;
  member_name: string;
  hic: string | null;
  medi_cal_number: string | null;
  acnt: string | null;
  icn: string | null;
  proc: 'H2022' | 'T2038';
  service_from: string | null;
  service_to: string | null;
  billed: number | null;
  allowed: number | null;
  paid: number | null;
  source_line: string;
};

type EraSummary = {
  total_rows?: number;
  t2038?: { rows?: number; members?: number; total_paid?: number };
  h2022?: { rows?: number; members?: number; total_paid?: number };
  era_grand_total?: number | null;
  parser_total?: number | null;
  variance?: number | null;
};

type EraCacheMeta = {
  cacheKey: string;
  fileName: string;
  sourceMode: 'fast' | 'local' | 'local_path' | 'unknown';
  fileSize: number | null;
  fileLastModified: number | null;
  parsedByUid: string;
  payer: string;
  summary: EraSummary | null;
  totalRows: number;
  chunkCount: number;
  createdAt?: any;
  updatedAt?: any;
};

type ClaimProc = 'H2022' | 'T2038';

type SubmittedClaim = {
  sourceTable: string;
  proc: ClaimProc;
  primaryKey: string;
  recordKeyField: string | null;
  recordKeyValue: string | null;
  claimStatus: string | null;
  clientId2: string | null;
  mcpCin: string | null;
  totalCharges: number | null;
  totalDaysOfService: number | null;
  serviceWindows: Array<{ from: string | null; to: string | null }>;
  raw: Record<string, any>;
};

type ClaimMatchResult = {
  sourceTable: string;
  proc: ClaimProc;
  primaryKey: string;
  recordKeyField: string | null;
  recordKeyValue: string | null;
  claimStatus: string | null;
  clientId2: string | null;
  mcpCin: string | null;
  totalCharges: number | null;
  totalDaysOfService: number | null;
  serviceWindows: Array<{ from: string | null; to: string | null }>;
  matched: boolean;
  confidence: 'none' | 'low' | 'medium' | 'high';
  reason: string;
  matchedRows: number;
  matchedPaidTotal: number;
  paidDelta: number | null;
  sampleRows: EraRow[];
  isConnectionsPaidRcfe: boolean;
  potentialDuplicatePayment: boolean;
  canPush: boolean;
  proposedMatchFields: Record<string, string>;
};

const AMOUNT_RE = /(?<!\d)(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\))(?!\d)/g;
// Support PROC values with or without separator before modifiers (e.g. "T2038 U5" or "T2038U5")
const PROC_RE = /\b(H2022|T2038)(?:\b|(?=[A-Z0-9]))/i;
const ERA_CACHE_COLLECTION = 'era_parser_cache';
const ERA_CACHE_CHUNK_SIZE = 250;
const ERA_HISTORY_LOOKUP_DEFAULT_LIMIT = 25;
const ERA_HISTORY_LOOKUP_MAX_LIMIT = 100;

const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const normalizeNameForLookup = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CLAIM_TABLES: Array<{ table: string; proc: ClaimProc }> = [
  { table: 'CalAIM_Claim_Submit_RCFE_H2022', proc: 'H2022' },
  { table: 'CalAIM_Claim_Submit_T2038', proc: 'T2038' },
];

const CLAIM_DATE_FIELD_PAIRS = [
  ['Days_of_Service_First1', 'Days_of_Service_Last1'],
  ['Days_of_Service_First2', 'Days_of_Service_Last2'],
  ['Days_of_Service_First3', 'Days_of_Service_Last3'],
  ['Days_of_Service_First4', 'Days_of_Service_Last4'],
] as const;

const parseNumberLoose = (value: unknown): number | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const isParen = raw.startsWith('(') && raw.endsWith(')');
  const cleaned = raw.replace(/[,$()\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isParen ? -Math.abs(n) : n;
};

const parseIntegerLoose = (value: unknown): number | null => {
  const n = parseNumberLoose(value);
  if (n === null) return null;
  const rounded = Math.round(n);
  return Number.isFinite(rounded) ? rounded : null;
};

const parseDateLoose = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const mmddyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mmddyyyy) {
    const mm = String(Number(mmddyyyy[1])).padStart(2, '0');
    const dd = String(Number(mmddyyyy[2])).padStart(2, '0');
    const yyyy = mmddyyyy[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const mmddyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (mmddyy) {
    const mm = String(Number(mmddyy[1])).padStart(2, '0');
    const dd = String(Number(mmddyy[2])).padStart(2, '0');
    const yyyy = 2000 + Number(mmddyy[3]);
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
};

const normalizeFieldName = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const getFieldValueByNormalizedKey = (row: Record<string, any>, normalizedKeys: string[]) => {
  const wanted = new Set(normalizedKeys.map((k) => normalizeFieldName(k)));
  for (const [k, v] of Object.entries(row || {})) {
    if (wanted.has(normalizeFieldName(k))) return v;
  }
  return undefined;
};

const parseClaimStatus = (row: Record<string, any>) => {
  const raw = getFieldValueByNormalizedKey(row, ['Claim_Status', 'claim_status', 'ClaimStatus']);
  const out = String(raw ?? '').trim();
  return out || null;
};

const pickClaimRecordLocator = (row: Record<string, any>) => {
  const candidates = ['PK_ID', 'Record_ID', 'ID', 'Claim_ID', 'claim_id'];
  for (const field of candidates) {
    const raw = row?.[field];
    const value = String(raw ?? '').trim();
    if (value) return { field, value };
  }
  return null;
};

const parseClaimChargeFromDiscontinuousWindows = (row: Record<string, any>): number | null => {
  const parts: number[] = [];
  for (let idx = 1; idx <= 4; idx += 1) {
    const raw = getFieldValueByNormalizedKey(row, [
      `Total_Charges_Days_Service${idx}`,
      `Total_Charges_Days_of_Service${idx}`,
      `Total_Charges_DaysOfService${idx}`,
      `Total_Charge_Days_Service${idx}`,
      `Total Charges Days Service${idx}`,
    ]);
    const n = parseNumberLoose(raw);
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) parts.push(n);
  }
  if (!parts.length) return null;
  return Number(parts.reduce((a, b) => a + b, 0).toFixed(2));
};

const parseMemberFirstLastFromEraName = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return { first: '', last: '' };
  if (raw.includes(',')) {
    const [lastRaw, firstRaw] = raw.split(',', 2);
    return { first: String(firstRaw || '').trim(), last: String(lastRaw || '').trim() };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' ').trim(), last: parts[parts.length - 1] || '' };
};

const buildProposedMatchFields = (claim: SubmittedClaim, matchedRows: EraRow[], matchedPaidTotal: number) => {
  const windows = Array.isArray(claim.serviceWindows) ? claim.serviceWindows.slice(0, 4) : [];
  const primaryRow = matchedRows[0] || null;
  const name = parseMemberFirstLastFromEraName(primaryRow?.member_name || '');
  const fields: Record<string, string> = {
    Match: matchedRows.length > 0 ? 'Matched' : 'Unmatched',
    Match_Payment_Amount: Number(matchedPaidTotal || 0).toFixed(2),
    Match_Client_ID2_Confirm: String(claim.clientId2 || '').trim(),
    Match_Client_First: name.first,
    Match_Client_Last: name.last,
  };
  for (let idx = 0; idx < 4; idx += 1) {
    const w = windows[idx] || { from: null, to: null };
    fields[`Match_Days_of_Service_First${idx + 1}`] = String(w.from || '').trim();
    fields[`Match_Days_of_Service_Last${idx + 1}`] = String(w.to || '').trim();
  }
  return fields;
};

const normalizeSubmittedClaim = (row: any, sourceTable: string, proc: ClaimProc): SubmittedClaim => {
  const rowObj = (row || {}) as Record<string, any>;
  const locator = pickClaimRecordLocator(rowObj);
  const serviceWindows = CLAIM_DATE_FIELD_PAIRS.map(([firstField, lastField]) => {
    const from = parseDateLoose(rowObj?.[firstField]);
    const to = parseDateLoose(rowObj?.[lastField]);
    return { from, to };
  }).filter((w) => w.from || w.to);
  const primaryKey = String(locator?.value || '').trim() || `${sourceTable}-${Math.random().toString(36).slice(2, 10)}`;
  const totalChargesFromWindows = parseClaimChargeFromDiscontinuousWindows(rowObj);
  const totalChargesFromField = parseNumberLoose(rowObj?.Total_Charges);
  const totalCharges =
    typeof totalChargesFromWindows === 'number' && Number.isFinite(totalChargesFromWindows)
      ? totalChargesFromWindows
      : totalChargesFromField;
  return {
    sourceTable,
    proc,
    primaryKey,
    recordKeyField: locator?.field || null,
    recordKeyValue: locator?.value || null,
    claimStatus: parseClaimStatus(rowObj),
    clientId2: String(rowObj?.Client_ID2 ?? '').trim() || null,
    mcpCin: String(rowObj?.MCP_CIN ?? rowObj?.MediCal_Number ?? rowObj?.Medi_Cal_Number ?? '').trim() || null,
    totalCharges,
    totalDaysOfService: parseIntegerLoose(rowObj?.Total_Days_of_Service),
    serviceWindows,
    raw: rowObj,
  };
};

const windowsOverlap = (
  claimWindows: Array<{ from: string | null; to: string | null }>,
  eraFrom: string | null,
  eraTo: string | null
) => {
  const rowFrom = parseDateLoose(eraFrom);
  const rowTo = parseDateLoose(eraTo) || rowFrom;
  if (!rowFrom || !rowTo) return false;
  const rowFromMs = Date.parse(rowFrom);
  const rowToMs = Date.parse(rowTo);
  if (!Number.isFinite(rowFromMs) || !Number.isFinite(rowToMs)) return false;
  for (const w of claimWindows) {
    const from = parseDateLoose(w.from);
    const to = parseDateLoose(w.to) || from;
    if (!from || !to) continue;
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) continue;
    if (Math.max(fromMs, rowFromMs) <= Math.min(toMs, rowToMs)) return true;
  }
  return false;
};

const isAmountClose = (a: number | null, b: number | null) => {
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return Math.abs(a - b) <= 0.01;
};

async function fetchSubmittedClaimsForTable(params: {
  accessToken: string;
  restBaseUrl: string;
  tableName: string;
  proc: ClaimProc;
  pageSize?: number;
  maxPages?: number;
}) {
  const pageSize = Number.isFinite(params.pageSize) ? Math.max(50, Math.min(2000, Number(params.pageSize))) : 500;
  const maxPages = Number.isFinite(params.maxPages) ? Math.max(1, Math.min(100, Number(params.maxPages))) : 25;
  const selectFields = [
    'PK_ID',
    'Record_ID',
    'Claim_Status',
    'Client_ID2',
    'MCP_CIN',
    'Total_Charges',
    'Total_Days_of_Service',
    'Total_Charges_Days_Service1',
    'Total_Charges_Days_Service2',
    'Total_Charges_Days_Service3',
    'Total_Charges_Days_Service4',
    ...CLAIM_DATE_FIELD_PAIRS.flat(),
  ];
  const claims: SubmittedClaim[] = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const attempt = async (includeSelect: boolean) => {
      const sp = new URLSearchParams();
      sp.set('q.pageSize', String(pageSize));
      sp.set('q.pageNumber', String(pageNumber));
      if (includeSelect) sp.set('q.select', selectFields.join(','));
      const url = `${params.restBaseUrl}/tables/${encodeURIComponent(params.tableName)}/records?${sp.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false as const, status: res.status, statusText: res.statusText, text, url };
      }
      const data = (await res.json().catch(() => ({}))) as any;
      return { ok: true as const, data, url };
    };

    // Prefer explicit column selection for performance, but gracefully fall back
    // when table schemas differ (common across Caspio environments).
    let res = await attempt(true);
    if (!res.ok) {
      const textLower = String(res.text || '').toLowerCase();
      const invalidColumn = textLower.includes('invalid column name');
      if (invalidColumn) {
        res = await attempt(false);
      }
    }
    if (!res.ok) {
      throw new Error(`Caspio fetch failed for ${params.tableName} (${res.status}): ${res.text || res.statusText}`);
    }

    const data = res.data;
    const pageRows = Array.isArray(data?.Result) ? data.Result : [];
    for (const row of pageRows) {
      const claim = normalizeSubmittedClaim(row, params.tableName, params.proc);
      claims.push(claim);
    }
    if (pageRows.length < pageSize) break;
  }
  return claims;
}

async function pushMatchFieldsToCaspio(params: {
  accessToken: string;
  restBaseUrl: string;
  tableName: string;
  keyField: string;
  keyValue: string;
  matchFields: Record<string, string>;
}) {
  const allowedKeyFields = new Set(['PK_ID', 'Record_ID', 'ID', 'Claim_ID', 'claim_id']);
  if (!allowedKeyFields.has(params.keyField)) {
    throw new Error(`Unsupported key field for Caspio update: ${params.keyField}`);
  }
  const valueRaw = String(params.keyValue || '').trim();
  if (!valueRaw) throw new Error('Missing record key value for Caspio update');
  const whereValue = /^-?\d+(?:\.\d+)?$/.test(valueRaw) ? valueRaw : `'${valueRaw.replace(/'/g, "''")}'`;
  const whereClause = `${params.keyField}=${whereValue}`;
  const url = `${params.restBaseUrl}/tables/${encodeURIComponent(params.tableName)}/records?q.where=${encodeURIComponent(whereClause)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.matchFields),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Caspio update failed (${response.status}) for ${params.tableName} ${whereClause}: ${text || response.statusText}`);
  }
  return true;
}

const claimLikelyBelongsToEra = (claim: SubmittedClaim, rows: EraRow[]) => {
  const claimClientId2 = normalizeLookupToken(claim.clientId2);
  const claimMcpCin = normalizeLookupToken(claim.mcpCin);
  if (!claimClientId2 && !claimMcpCin) return false;
  const idMatchedRows = rows.filter((row) => {
    if (row.proc !== claim.proc) return false;
    const rowAcnt = normalizeLookupToken(row.acnt);
    const rowIcn = normalizeLookupToken(row.icn);
    return Boolean(
      (claimClientId2 && rowAcnt && rowAcnt === claimClientId2) ||
        (claimMcpCin && rowIcn && rowIcn === claimMcpCin)
    );
  });
  if (!idMatchedRows.length) return false;
  if (!claim.serviceWindows.length) return true;
  // Narrow to likely current-batch claims: require at least one service-date overlap.
  return idMatchedRows.some((row) => windowsOverlap(claim.serviceWindows, row.service_from || null, row.service_to || null));
};

const eraRowKey = (row: EraRow) =>
  [
    String(row.proc || ''),
    String(row.page || ''),
    String(row.acnt || ''),
    String(row.icn || ''),
    String(row.hic || ''),
    String(row.service_from || ''),
    String(row.service_to || ''),
    String(row.paid ?? ''),
    String(row.source_line || ''),
  ].join('|');

const filterEraRowsForClaimMatch = (rows: EraRow[], matchQueryRaw?: string) => {
  const q = String(matchQueryRaw || '').trim().toLowerCase();
  if (!q) return rows;
  const qToken = normalizeLookupToken(q);
  const qName = normalizeNameForLookup(q);
  const qNameTokens = qName
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return rows.filter((row) => {
    const member = String(row.member_name || '').toLowerCase().trim();
    const memberNormalized = normalizeNameForLookup(member);
    const memberToken = normalizeLookupToken(member);
    const acnt = String(row.acnt || '').toLowerCase().trim();
    const acntToken = normalizeLookupToken(acnt);
    const icn = String(row.icn || '').toLowerCase().trim();
    const icnToken = normalizeLookupToken(icn);
    const hic = String(row.hic || '').toLowerCase().trim();
    const hicToken = normalizeLookupToken(hic);
    const nameMatchesByTokens =
      qNameTokens.length > 0 &&
      qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));
    return (
      member.includes(q) ||
      acnt.includes(q) ||
      icn.includes(q) ||
      hic.includes(q) ||
      (qToken ? memberToken.includes(qToken) || acntToken.includes(qToken) || icnToken.includes(qToken) || hicToken.includes(qToken) : false) ||
      nameMatchesByTokens
    );
  });
};

const matchSubmittedClaimsToEraRows = (claims: SubmittedClaim[], eraRows: EraRow[], matchQueryRaw?: string) => {
  const cleanRows = filterEraRowsForClaimMatch(sanitizeRows(eraRows), matchQueryRaw);
  const relevantClaims = claims.filter((claim) => claimLikelyBelongsToEra(claim, cleanRows));
  const matchedUniquePaidByRow = new Map<string, number>();
  const matchedEraRowKeys = new Set<string>();
  const results: ClaimMatchResult[] = relevantClaims.map((claim) => {
    const isConnectionsPaidRcfe = normalizeLookupToken(claim.claimStatus) === normalizeLookupToken('Connections Paid RCFE');
    const claimClientId2 = normalizeLookupToken(claim.clientId2);
    const claimMcpCin = normalizeLookupToken(claim.mcpCin);
    const byProc = cleanRows.filter((row) => row.proc === claim.proc);
    const idMatched = byProc.filter((row) => {
      const rowAcnt = normalizeLookupToken(row.acnt);
      const rowIcn = normalizeLookupToken(row.icn);
      return Boolean(
        (claimClientId2 && rowAcnt && rowAcnt === claimClientId2) ||
          (claimMcpCin && rowIcn && rowIcn === claimMcpCin)
      );
    });
    const withDateOverlap =
      claim.serviceWindows.length > 0
        ? idMatched.filter((row) => windowsOverlap(claim.serviceWindows, row.service_from || null, row.service_to || null))
        : idMatched;
    const matchedRows = withDateOverlap.slice(0, 200);
    let matchedPaidTotal = 0;
    for (const row of matchedRows) {
      if (typeof row.paid === 'number' && Number.isFinite(row.paid)) {
        matchedPaidTotal += row.paid;
        const key = eraRowKey(row);
        matchedUniquePaidByRow.set(key, row.paid);
        matchedEraRowKeys.add(key);
      }
    }
    matchedPaidTotal = Number(matchedPaidTotal.toFixed(2));
    const charges = claim.totalCharges;
    const paidDelta = typeof charges === 'number' ? Number((matchedPaidTotal - charges).toFixed(2)) : null;
    const exactAmount = isAmountClose(matchedPaidTotal, charges);
    const hasIdMatch = idMatched.length > 0;
    const hasDateMatch = withDateOverlap.length > 0 || claim.serviceWindows.length === 0;
    const matched = matchedRows.length > 0;
    const potentialDuplicatePayment = isConnectionsPaidRcfe && matched;
    const confidence: ClaimMatchResult['confidence'] = !matched
      ? 'none'
      : exactAmount && hasDateMatch
        ? 'high'
        : hasDateMatch
          ? 'medium'
          : 'low';
    const reason = potentialDuplicatePayment
      ? exactAmount
        ? 'Claim was already marked Connections Paid RCFE and matches a current ERA payment (amount/date aligned): potential duplicate MCP payment.'
        : 'Claim was already marked Connections Paid RCFE and matches current ERA lines: potential duplicate MCP payment.'
      : !hasIdMatch
        ? 'No ACNT/Client_ID2 or ICN/MCP_CIN match in parsed ERA rows.'
        : !hasDateMatch
          ? 'ID matched, but no service-date overlap was found.'
          : exactAmount
            ? 'ID, date window, and amount align.'
            : 'ID and dates align; amount differs.';
    const proposedMatchFields = buildProposedMatchFields(claim, matchedRows, matchedPaidTotal);
    const canPush =
      matched &&
      !isConnectionsPaidRcfe &&
      claim.sourceTable === 'CalAIM_Claim_Submit_RCFE_H2022' &&
      Boolean(claim.recordKeyField && claim.recordKeyValue);
    return {
      sourceTable: claim.sourceTable,
      proc: claim.proc,
      primaryKey: claim.primaryKey,
      recordKeyField: claim.recordKeyField,
      recordKeyValue: claim.recordKeyValue,
      claimStatus: claim.claimStatus,
      clientId2: claim.clientId2,
      mcpCin: claim.mcpCin,
      totalCharges: claim.totalCharges,
      totalDaysOfService: claim.totalDaysOfService,
      serviceWindows: claim.serviceWindows,
      matched,
      confidence,
      reason,
      matchedRows: matchedRows.length,
      matchedPaidTotal,
      paidDelta,
      sampleRows: matchedRows.slice(0, 5),
      isConnectionsPaidRcfe,
      potentialDuplicatePayment,
      canPush,
      proposedMatchFields,
    };
  });

  const totalClaims = results.length;
  const matchedClaims = results.filter((r) => r.matched).length;
  const highConfidence = results.filter((r) => r.confidence === 'high').length;
  const mediumConfidence = results.filter((r) => r.confidence === 'medium').length;
  const lowConfidence = results.filter((r) => r.confidence === 'low').length;
  const unmatchedClaims = totalClaims - matchedClaims;
  const potentialDuplicatePayments = results.filter((r) => r.potentialDuplicatePayment).length;
  const submittedChargesTotal = Number(
    results
      .map((r) => r.totalCharges)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .reduce((a, b) => a + b, 0)
      .toFixed(2)
  );
  const matchedPaidTotal = Number(
    Array.from(matchedUniquePaidByRow.values())
      .filter((v) => Number.isFinite(v))
      .reduce((a, b) => a + b, 0)
      .toFixed(2)
  );
  return {
    summary: {
      totalClaims,
      matchedClaims,
      unmatchedClaims,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      potentialDuplicatePayments,
      submittedChargesTotal,
      matchedPaidTotal,
      variance: Number((matchedPaidTotal - submittedChargesTotal).toFixed(2)),
    },
    claims: results,
    matchedEraRowKeys: Array.from(matchedEraRowKeys),
  };
};

const rowMatchesLookup = (row: EraRow, rawQuery: string) => {
  const qText = String(rawQuery || '').trim().toLowerCase();
  if (!qText) return false;
  const qToken = normalizeLookupToken(qText);
  const qName = normalizeNameForLookup(qText);
  const qNameTokens = qName
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const member = String(row.member_name || '').toLowerCase().trim();
  const memberNormalized = normalizeNameForLookup(member);
  const memberToken = normalizeLookupToken(member);
  const mediCal = String(row.medi_cal_number || '').toLowerCase().trim();
  const mediCalToken = normalizeLookupToken(mediCal);
  const hic = String(row.hic || '').toLowerCase().trim();
  const hicToken = normalizeLookupToken(hic);
  const clientId2 = String(row.acnt || '').toLowerCase().trim();
  const clientId2Token = normalizeLookupToken(clientId2);
  const icn = String(row.icn || '').toLowerCase().trim();
  const icnToken = normalizeLookupToken(icn);

  const nameMatchDirect = member.includes(qText) || (qName ? memberNormalized.includes(qName) : false);
  const nameMatchByTokens =
    qNameTokens.length > 0 &&
    qNameTokens.every((tok) => memberNormalized.includes(tok) || memberToken.includes(normalizeLookupToken(tok)));
  const idTextMatch = hic.includes(qText) || mediCal.includes(qText) || clientId2.includes(qText) || icn.includes(qText);
  const idTokenMatch = qToken
    ? hicToken.includes(qToken) || mediCalToken.includes(qToken) || clientId2Token.includes(qToken) || icnToken.includes(qToken)
    : false;

  return nameMatchDirect || nameMatchByTokens || idTextMatch || idTokenMatch;
};

const normalizeCacheKey = (raw: unknown) => {
  const token = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:|-]+/g, '_')
    .slice(0, 220);
  return token || null;
};

const sanitizeRows = (rows: unknown): EraRow[] => {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter(Boolean).map((r: any) => ({
    payer: String(r?.payer || 'Health Net'),
    remittance_date: r?.remittance_date ? String(r.remittance_date) : null,
    page: Number(r?.page || 0),
    member_name: String(r?.member_name || ''),
    hic: r?.hic ? String(r.hic) : null,
    medi_cal_number: r?.medi_cal_number ? String(r.medi_cal_number) : null,
    acnt: r?.acnt ? String(r.acnt) : null,
    icn: r?.icn ? String(r.icn) : null,
    proc: String(r?.proc || '').toUpperCase() === 'T2038' ? 'T2038' : 'H2022',
    service_from: r?.service_from ? String(r.service_from) : null,
    service_to: r?.service_to ? String(r.service_to) : null,
    billed: typeof r?.billed === 'number' ? r.billed : null,
    allowed: typeof r?.allowed === 'number' ? r.allowed : null,
    paid: typeof r?.paid === 'number' ? r.paid : null,
    source_line: String(r?.source_line || ''),
  }));
};

async function readCachedEra(adminDb: any, cacheKeyRaw: unknown) {
  const cacheKey = normalizeCacheKey(cacheKeyRaw);
  if (!cacheKey) return null;

  const metaSnap = await adminDb.collection(ERA_CACHE_COLLECTION).doc(cacheKey).get();
  if (!metaSnap.exists) return null;

  const meta = (metaSnap.data() || {}) as EraCacheMeta;
  const chunksSnap = await adminDb
    .collection(ERA_CACHE_COLLECTION)
    .doc(cacheKey)
    .collection('chunks')
    .orderBy('index', 'asc')
    .get();
  const rows: EraRow[] = [];
  chunksSnap.forEach((d: any) => {
    const part = Array.isArray(d.data()?.rows) ? d.data().rows : [];
    rows.push(...sanitizeRows(part));
  });

  return {
    cacheKey,
    payer: String(meta?.payer || 'Health Net'),
    summary: (meta?.summary || null) as EraSummary | null,
    rows,
    fileName: String(meta?.fileName || ''),
    sourceMode: String(meta?.sourceMode || 'unknown'),
    fileSize: typeof meta?.fileSize === 'number' ? meta.fileSize : null,
    fileLastModified: typeof meta?.fileLastModified === 'number' ? meta.fileLastModified : null,
    updatedAt: meta?.updatedAt || null,
  };
}

async function fetchEraCacheMetaDocs(adminDb: any, limit: number) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25;
  const ordered = await adminDb.collection(ERA_CACHE_COLLECTION).orderBy('updatedAt', 'desc').limit(safeLimit).get();
  if (!ordered.empty) return ordered.docs;
  const fallback = await adminDb.collection(ERA_CACHE_COLLECTION).limit(safeLimit).get();
  return fallback.docs || [];
}

async function writeCachedEra(
  adminDb: any,
  payload: {
    cacheKey: unknown;
    fileName?: unknown;
    sourceMode?: unknown;
    fileSize?: unknown;
    fileLastModified?: unknown;
    parsedByUid: string;
    payer: unknown;
    summary: unknown;
    rows: unknown;
  }
) {
  const cacheKey = normalizeCacheKey(payload.cacheKey);
  if (!cacheKey) throw new Error('Missing cacheKey');

  const rows = sanitizeRows(payload.rows);
  const metaRef = adminDb.collection(ERA_CACHE_COLLECTION).doc(cacheKey);
  const chunksRef = metaRef.collection('chunks');
  const oldChunks = await chunksRef.get();
  if (!oldChunks.empty) {
    const deleteBatch = adminDb.batch();
    oldChunks.docs.forEach((d: any) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
  }

  const chunks: EraRow[][] = [];
  for (let i = 0; i < rows.length; i += ERA_CACHE_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + ERA_CACHE_CHUNK_SIZE));
  }

  const writeBatch = adminDb.batch();
  chunks.forEach((chunkRows, idx) => {
    writeBatch.set(chunksRef.doc(String(idx).padStart(4, '0')), {
      index: idx,
      rows: chunkRows,
      rowCount: chunkRows.length,
      updatedAt: new Date(),
    });
  });

  const nowTs = new Date();
  const metaPayload: EraCacheMeta = {
    cacheKey,
    fileName: String(payload.fileName || 'Unknown PDF'),
    sourceMode: (String(payload.sourceMode || 'unknown') as EraCacheMeta['sourceMode']) || 'unknown',
    fileSize: typeof payload.fileSize === 'number' ? payload.fileSize : null,
    fileLastModified: typeof payload.fileLastModified === 'number' ? payload.fileLastModified : null,
    parsedByUid: payload.parsedByUid,
    payer: String(payload.payer || 'Health Net'),
    summary: (payload.summary || null) as EraSummary | null,
    totalRows: rows.length,
    chunkCount: chunks.length,
    updatedAt: nowTs,
  };

  const metaExists = (await metaRef.get()).exists;
  const mergedMeta: Record<string, any> = { ...metaPayload };
  if (!metaExists) mergedMeta.createdAt = nowTs;
  writeBatch.set(metaRef, mergedMeta, { merge: true });
  await writeBatch.commit();

  return { cacheKey, totalRows: rows.length };
}

const toIsoFromMmddyy = (mmddyy: string) => {
  const raw = String(mmddyy || '').trim();
  if (!/^\d{6}$/.test(raw)) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  const yy = raw.slice(4, 6);
  const year = 2000 + Number(yy);
  return `${String(year)}-${mm}-${dd}`;
};

const toIsoFromMmdd = (mmdd: string, year: number) => {
  const raw = String(mmdd || '').trim();
  if (!/^\d{4}$/.test(raw)) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  return `${String(year)}-${mm}-${dd}`;
};

const parseRemitDate = (lines: string[]) => {
  for (const ln of lines.slice(0, 120)) {
    const m = ln.match(/\bDATE\b\s*[:#]?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2,4})/i);
    if (m?.[1]) return String(m[1]);
  }
  return null;
};

const findKwToken = (line: string, kw: string) => {
  const m = line.match(new RegExp(`\\b${kw}\\b\\s*[:#]?\\s*(\\S+)`, 'i'));
  return m?.[1] ? String(m[1]).trim() : null;
};

const segmentBetween = (line: string, startKw: string, endKws: string[]) => {
  const lower = line.toLowerCase();
  const startIdx = lower.indexOf(startKw.toLowerCase());
  if (startIdx < 0) return '';
  const tail = line.slice(startIdx + startKw.length);
  const tailLower = tail.toLowerCase();
  let cut = tail.length;
  for (const kw of endKws) {
    const idx = tailLower.indexOf(` ${kw.toLowerCase()} `);
    if (idx >= 0) cut = Math.min(cut, idx);
  }
  return tail.slice(0, cut).trim();
};

const extractNameHicAcntIcn = (line: string) => {
  const name = segmentBetween(line, 'NAME', ['HIC', 'ACNT', 'ICN']);
  const hicSegment = segmentBetween(line, 'HIC', ['ACNT', 'ICN']);
  const tokens = hicSegment ? hicSegment.split(/\s+/).filter(Boolean) : [];
  const hic = tokens.length >= 1 ? tokens[0] : null;
  const medi = tokens.length >= 2 ? tokens[1] : null;
  const acnt = findKwToken(line, 'ACNT');
  const icn = findKwToken(line, 'ICN');
  return { name, hic, medi, acnt, icn };
};

function parseServiceDatesFromProcLine(line: string, remitDate: string | null) {
  const tokens = String(line || '').trim().split(/\s+/).filter(Boolean);
  const mmdd = tokens.find((t) => /^\d{4}$/.test(t)) || null;
  const mmddyy = tokens.find((t) => /^\d{6}$/.test(t)) || null;

  const yearFromRemit = (() => {
    if (!remitDate) return null;
    const m = remitDate.match(/(\d{4})/);
    return m?.[1] ? Number(m[1]) : null;
  })();

  let toIso: string | null = null;
  if (mmddyy) toIso = toIsoFromMmddyy(mmddyy);
  const year = (() => {
    if (toIso) return Number(toIso.slice(0, 4));
    if (yearFromRemit) return yearFromRemit;
    return null;
  })();

  const fromIso = mmdd && year ? toIsoFromMmdd(mmdd, year) : null;
  return { service_from: fromIso, service_to: toIso };
}

const parseEraGrandTotalFromLines = (lines: string[]) => {
  for (let i = 0; i < lines.length; i++) {
    const ln = String(lines[i] || '');
    if (!/\bTOTALS:\b/i.test(ln)) continue;
    for (let j = i; j < Math.min(lines.length, i + 8); j++) {
      const amounts = Array.from(String(lines[j] || '').matchAll(AMOUNT_RE)).map((mm) => mm?.[1]).filter(Boolean) as string[];
      if (amounts.length < 3) continue;
      const nums = amounts
        .map((v) => {
          const raw = String(v || '').trim();
          const isParen = raw.startsWith('(') && raw.endsWith(')');
          const n = Number(raw.replace(/[(),]/g, ''));
          if (!Number.isFinite(n)) return null;
          return isParen ? -Math.abs(n) : n;
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (!nums.length) continue;
      return nums[nums.length - 1];
    }
  }
  return null as number | null;
};

function parseEraFromPages(pages: string[][]) {
  const payer = 'Health Net';
  const allRows: EraRow[] = [];
  let eraGrandTotal: number | null = null;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const lines = Array.isArray(pages[pageIdx]) ? pages[pageIdx] : [];
    const pageGrandTotal = parseEraGrandTotalFromLines(lines);
    if (typeof pageGrandTotal === 'number' && Number.isFinite(pageGrandTotal)) {
      eraGrandTotal = pageGrandTotal;
    }
    const remittance_date = parseRemitDate(lines);
    let current = {
      member_name: '',
      hic: null as string | null,
      medi: null as string | null,
      acnt: null as string | null,
      icn: null as string | null,
    };

    for (const ln of lines) {
      if (/^\s*NAME\b/i.test(ln)) {
        const parsed = extractNameHicAcntIcn(ln);
        current = { member_name: parsed.name || '', hic: parsed.hic, medi: parsed.medi, acnt: parsed.acnt, icn: parsed.icn };
        continue;
      }

      const m = ln.match(PROC_RE);
      if (!m?.[1]) continue;
      const proc = String(m[1]).toUpperCase() as 'H2022' | 'T2038';

      const amounts = Array.from(ln.matchAll(AMOUNT_RE)).map((mm) => mm?.[1]).filter(Boolean);
      const toNum = (v?: string | null) => {
        if (!v) return null;
        const raw = String(v).trim();
        const isParen = raw.startsWith('(') && raw.endsWith(')');
        const n = Number(raw.replace(/[(),]/g, ''));
        if (!Number.isFinite(n)) return null;
        return isParen ? -Math.abs(n) : n;
      };
      const billed = amounts.length >= 1 ? toNum(amounts[0]) : null;
      const allowed = amounts.length >= 2 ? toNum(amounts[1]) : null;
      const paid = amounts.length >= 1 ? toNum(amounts[amounts.length - 1]) : null;

      const svc = parseServiceDatesFromProcLine(ln, remittance_date);

      allRows.push({
        payer,
        remittance_date,
        page: pageIdx + 1,
        member_name: String(current.member_name || '').trim(),
        hic: current.hic,
        medi_cal_number: current.medi,
        acnt: current.acnt,
        icn: current.icn,
        proc,
        service_from: svc.service_from,
        service_to: svc.service_to,
        billed,
        allowed,
        paid,
        source_line: ln,
      });
    }
  }

  const sumPaid = (code: 'H2022' | 'T2038') =>
    Number(
      allRows
        .filter((r) => r.proc === code)
        .map((r) => r.paid)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .reduce((a, b) => a + b, 0)
        .toFixed(2)
    );

  const uniqueMembers = (code: 'H2022' | 'T2038') => {
    const s = new Set<string>();
    for (const r of allRows) {
      if (r.proc !== code) continue;
      const key = String(r.acnt || '').trim() || String(r.member_name || '').trim();
      if (key) s.add(key);
    }
    return s.size;
  };

  const summary = {
    total_rows: allRows.length,
    t2038: { rows: allRows.filter((r) => r.proc === 'T2038').length, members: uniqueMembers('T2038'), total_paid: sumPaid('T2038') },
    h2022: { rows: allRows.filter((r) => r.proc === 'H2022').length, members: uniqueMembers('H2022'), total_paid: sumPaid('H2022') },
    era_grand_total: eraGrandTotal,
    parser_total: Number((sumPaid('T2038') + sumPaid('H2022')).toFixed(2)),
    variance:
      typeof eraGrandTotal === 'number'
        ? Number((sumPaid('T2038') + sumPaid('H2022') - eraGrandTotal).toFixed(2))
        : null,
  };

  const totalLines = pages.reduce((acc, p) => acc + (Array.isArray(p) ? p.length : 0), 0);

  return { success: true as const, payer, summary, rows: allRows, debug: { pages: pages.length, totalLines } };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const contentType = String(req.headers.get('content-type') || '');
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json({ success: false, error: 'Unsupported request. Send JSON body.' }, { status: 415 });
    }
    const body = (await req.json().catch(() => null)) as any;
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const decoded = await adminModule.adminAuth.verifyIdToken(idToken);
    const parsedByUid = String(decoded?.uid || '').trim();
    const action = String(body?.action || '').trim();

    if (action === 'push_claim_match_fields') {
      const requestRows = sanitizeRows(body?.rows);
      const matchQuery = String(body?.matchQuery || '').trim();
      const selectedClaimKeys = Array.isArray(body?.selectedClaimKeys)
        ? body.selectedClaimKeys.map((v: any) => String(v || '').trim()).filter(Boolean)
        : [];
      let matchRows = requestRows;
      if (!matchRows.length) {
        const cached = await readCachedEra(adminDb, body?.cacheKey);
        matchRows = cached?.rows || [];
      }
      if (!matchRows.length) {
        return NextResponse.json(
          { success: false, error: 'No ERA rows provided. Parse/open an ERA first, then retry pushing match fields.' },
          { status: 400 }
        );
      }
      const caspioConfig = getCaspioServerConfig();
      const accessToken = await getCaspioServerAccessToken(caspioConfig);
      const allClaims: SubmittedClaim[] = [];
      for (const cfg of CLAIM_TABLES) {
        const claims = await fetchSubmittedClaimsForTable({
          accessToken,
          restBaseUrl: caspioConfig.restBaseUrl,
          tableName: cfg.table,
          proc: cfg.proc,
          pageSize: 500,
          maxPages: 50,
        });
        allClaims.push(...claims);
      }
      const matched = matchSubmittedClaimsToEraRows(allClaims, matchRows, matchQuery);
      const keySet = new Set(selectedClaimKeys);
      const candidates = matched.claims.filter((claim) => {
        if (!claim.canPush) return false;
        const claimKey = `${claim.sourceTable}::${claim.primaryKey}`;
        if (keySet.size > 0 && !keySet.has(claimKey)) return false;
        return true;
      });
      const pushed: Array<{ claimKey: string; sourceTable: string; primaryKey: string }> = [];
      const failed: Array<{ claimKey: string; sourceTable: string; primaryKey: string; error: string }> = [];
      for (const claim of candidates) {
        const claimKey = `${claim.sourceTable}::${claim.primaryKey}`;
        try {
          await pushMatchFieldsToCaspio({
            accessToken,
            restBaseUrl: caspioConfig.restBaseUrl,
            tableName: claim.sourceTable,
            keyField: String(claim.recordKeyField || ''),
            keyValue: String(claim.recordKeyValue || ''),
            matchFields: claim.proposedMatchFields || {},
          });
          pushed.push({ claimKey, sourceTable: claim.sourceTable, primaryKey: claim.primaryKey });
        } catch (err: any) {
          failed.push({
            claimKey,
            sourceTable: claim.sourceTable,
            primaryKey: claim.primaryKey,
            error: String(err?.message || err || 'Unknown error'),
          });
        }
      }
      return NextResponse.json(
        {
          success: true,
          action: 'push_claim_match_fields',
          matchQuery,
          candidates: candidates.length,
          pushed: pushed.length,
          failed: failed.length,
          pushedRows: pushed,
          failedRows: failed,
        },
        { status: 200 }
      );
    }

    if (action === 'match_submitted_claims') {
      const requestRows = sanitizeRows(body?.rows);
      const matchQuery = String(body?.matchQuery || '').trim();
      let matchRows = requestRows;
      if (!matchRows.length) {
        const cached = await readCachedEra(adminDb, body?.cacheKey);
        matchRows = cached?.rows || [];
      }
      if (!matchRows.length) {
        return NextResponse.json(
          { success: false, error: 'No ERA rows provided. Parse/open an ERA first, then retry claim matching.' },
          { status: 400 }
        );
      }
      const caspioConfig = getCaspioServerConfig();
      const accessToken = await getCaspioServerAccessToken(caspioConfig);
      const allClaims: SubmittedClaim[] = [];
      for (const cfg of CLAIM_TABLES) {
        const claims = await fetchSubmittedClaimsForTable({
          accessToken,
          restBaseUrl: caspioConfig.restBaseUrl,
          tableName: cfg.table,
          proc: cfg.proc,
          pageSize: 500,
          maxPages: 50,
        });
        allClaims.push(...claims);
      }
      const matched = matchSubmittedClaimsToEraRows(allClaims, matchRows, matchQuery);
      return NextResponse.json(
        {
          success: true,
          action: 'match_submitted_claims',
          matchQuery,
          eraRows: matchRows.length,
          claimsFetched: allClaims.length,
          claimsConsidered: matched.summary.totalClaims,
          ...matched,
        },
        { status: 200 }
      );
    }

    if (action === 'save_cache') {
      if (!parsedByUid) {
        return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
      }
      const saved = await writeCachedEra(adminDb, {
        cacheKey: body?.cacheKey,
        fileName: body?.fileName,
        sourceMode: body?.sourceMode,
        fileSize: body?.fileSize,
        fileLastModified: body?.fileLastModified,
        parsedByUid,
        payer: body?.payer,
        summary: body?.summary,
        rows: body?.rows,
      });
      return NextResponse.json({ success: true, cached: true, ...saved }, { status: 200 });
    }

    const cacheKey = normalizeCacheKey(body?.cacheKey);
    if (cacheKey) {
      const cached = await readCachedEra(adminDb, cacheKey);
      if (cached && Array.isArray(cached.rows) && cached.rows.length) {
        return NextResponse.json({ success: true, cached: true, ...cached }, { status: 200 });
      }
    }

    let pages = Array.isArray(body?.pages) ? (body.pages as any[]) : [];
    const pdfPath = String(body?.pdfPath || '').trim();
    if (!pages.length && pdfPath) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { success: false, error: 'Local file path parsing is only available in local development.' },
          { status: 400 }
        );
      }
      if (!path.isAbsolute(pdfPath)) {
        return NextResponse.json({ success: false, error: 'pdfPath must be an absolute path.' }, { status: 400 });
      }
      try {
        const pdfBytes = await readFile(pdfPath);
        const mod: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const pdfjs: any = mod?.getDocument ? mod : mod?.default || mod;
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true });
        const pdf = await loadingTask.promise;
        const extractedPages: string[][] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const tc = await page.getTextContent();
          const items = (tc.items || []) as Array<any>;
          const rows: Array<{ str: string; x: number; y: number }> = [];
          for (const it of items) {
            const str = String(it?.str || '').trim();
            if (!str) continue;
            const tr = it?.transform || [];
            const x = Number(tr?.[4] ?? 0);
            const y = Number(tr?.[5] ?? 0);
            rows.push({ str, x, y });
          }
          const byY = new Map<number, Array<{ str: string; x: number }>>();
          for (const r of rows) {
            const yk = Math.round(r.y);
            const arr = byY.get(yk) || [];
            arr.push({ str: r.str, x: r.x });
            byY.set(yk, arr);
          }
          const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);
          const lines: string[] = [];
          for (const yk of yKeys) {
            const parts = (byY.get(yk) || []).sort((a, b) => a.x - b.x).map((p) => p.str);
            const ln = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
            if (ln) lines.push(ln);
          }
          extractedPages.push(lines);
        }
        pages = extractedPages;
      } catch (err: any) {
        return NextResponse.json(
          { success: false, error: `Failed to read/parse pdfPath: ${err?.message || 'Unknown error'}` },
          { status: 422 }
        );
      }
    }

    if (!pages.length) {
      return NextResponse.json(
        {
          success: false,
          error: 'No extracted pages were provided. This usually means the PDF has no selectable text (scanned).',
        },
        { status: 422 }
      );
    }
    const payload = parseEraFromPages(pages as any);
    const rows = Array.isArray((payload as any)?.rows) ? (payload as any).rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No H2022/T2038 lines were extracted from the extracted text. The remittance format may differ or the PDF is scanned.',
          details: (payload as any)?.debug || null,
        },
        { status: 422 }
      );
    }

    const responsePayload = {
      success: true,
      payer: (payload as any)?.payer || 'Health Net',
      summary: (payload as any)?.summary || null,
      rows,
      cached: false,
      cacheKey,
    };

    if (cacheKey && parsedByUid) {
      await writeCachedEra(adminDb, {
        cacheKey,
        fileName: body?.fileName || (pdfPath ? path.basename(pdfPath) : 'ERA PDF'),
        sourceMode: body?.sourceMode || (pdfPath ? 'local_path' : 'unknown'),
        fileSize: typeof body?.fileSize === 'number' ? body.fileSize : null,
        fileLastModified: typeof body?.fileLastModified === 'number' ? body.fileLastModified : null,
        parsedByUid,
        payer: responsePayload.payer,
        summary: responsePayload.summary,
        rows,
      });
    }

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }
    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const { searchParams } = new URL(req.url);
    const lookup = String(searchParams.get('lookup') || '').trim();
    const cacheKey = normalizeCacheKey(searchParams.get('cacheKey'));
    if (cacheKey) {
      const cached = await readCachedEra(adminDb, cacheKey);
      if (!cached) return NextResponse.json({ success: false, error: 'Cache not found' }, { status: 404 });
      return NextResponse.json({ success: true, cached: true, ...cached }, { status: 200 });
    }

    const limitRaw = Number(searchParams.get('limit') || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;

    if (lookup) {
      const lookupLimit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(ERA_HISTORY_LOOKUP_MAX_LIMIT, Math.floor(limitRaw)))
        : ERA_HISTORY_LOOKUP_DEFAULT_LIMIT;
      const docs = await fetchEraCacheMetaDocs(adminDb, lookupLimit);
      const batches: Array<{
        cacheKey: string;
        fileName: string;
        sourceMode: string;
        payer: string;
        totalRows: number;
        updatedAt: any;
        matchedRows: number;
        matchedMembers: number;
        totalPaid: number;
        sampleRows: EraRow[];
        matchedRowsPreview: EraRow[];
      }> = [];

      for (const d of docs) {
        const x = d.data() || {};
        const chunksSnap = await adminDb
          .collection(ERA_CACHE_COLLECTION)
          .doc(d.id)
          .collection('chunks')
          .orderBy('index', 'asc')
          .get();

        const matched: EraRow[] = [];
        chunksSnap.forEach((chunkDoc: any) => {
          const chunkRows = sanitizeRows(chunkDoc.data()?.rows || []);
          for (const row of chunkRows) {
            if (rowMatchesLookup(row, lookup)) matched.push(row);
          }
        });
        if (!matched.length) continue;

        const memberKeys = new Set<string>();
        let totalPaid = 0;
        for (const row of matched) {
          const memberKey = String(row.acnt || '').trim() || String(row.member_name || '').trim();
          if (memberKey) memberKeys.add(memberKey);
          if (typeof row.paid === 'number' && Number.isFinite(row.paid)) totalPaid += row.paid;
        }

        batches.push({
          cacheKey: d.id,
          fileName: String(x?.fileName || 'ERA PDF'),
          sourceMode: String(x?.sourceMode || 'unknown'),
          payer: String(x?.payer || 'Health Net'),
          totalRows: Number(x?.totalRows || 0),
          updatedAt: x?.updatedAt || null,
          matchedRows: matched.length,
          matchedMembers: memberKeys.size,
          totalPaid: Number(totalPaid.toFixed(2)),
          sampleRows: matched.slice(0, 5),
          matchedRowsPreview: matched.slice(0, 50),
        });
      }

      return NextResponse.json({ success: true, lookup, searchedBatches: docs.length, matchedBatches: batches.length, batches }, { status: 200 });
    }

    const docs = await fetchEraCacheMetaDocs(adminDb, limit);
    const history = docs.map((d: any) => {
      const x = d.data() || {};
      return {
        cacheKey: d.id,
        fileName: String(x?.fileName || ''),
        sourceMode: String(x?.sourceMode || 'unknown'),
        totalRows: Number(x?.totalRows || 0),
        payer: String(x?.payer || 'Health Net'),
        summary: (x?.summary || null) as EraSummary | null,
        updatedAt: x?.updatedAt || null,
      };
    });
    return NextResponse.json({ success: true, history }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

