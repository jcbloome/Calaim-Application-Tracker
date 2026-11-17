import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { isKaiserPlan, T2038_CLAIM_SUBMIT_TABLE } from '@/lib/t2038-claims';
import {
  applyActionableGapMonthPolicy,
  buildKaiserT2038ClaimAuditRows,
  claimDocIdFromRecord,
  compactAuditRowForStorage,
  compactClaimRecordForStorage,
  indexClaimsByClientId2,
  justificationDocId,
  KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID,
  maxClaimPkFromRecords,
  DEFAULT_CLAIMABLE_REASON,
  DEFAULT_JUSTIFY_REASON,
  summarizeKaiserT2038ClaimAudit,
  type KaiserT2038ClaimAuditRunMeta,
  type KaiserT2038ClaimAuditRunMode,
  type KaiserT2038ClaimAuditRow,
  type MonthDisposition,
  type MonthJustification,
} from '@/lib/kaiser-t2038-claim-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const FIRESTORE_BATCH_LIMIT = 400;

/** Keep select list to known Caspio columns — invalid names make q.select 400. */
const CLAIM_SELECT = [
  'PK_ID',
  'Record_ID',
  'Client_ID2',
  'Client_First',
  'Client_Last',
  'Claim_Status',
  'MCP',
  'Date_of_Service',
  'Claim_Date',
  'Days_of_Service_Last1',
  'Days_of_Service_Last2',
  'Days_of_Service_Last3',
  'Days_of_Service_Last4',
  'Days_of_Service_First1',
  'Days_of_Service_First2',
  'Days_of_Service_First3',
  'Days_of_Service_First4',
].join(',');

/** Caspio WHERE fragment — Kaiser MCP only (this audit never needs Health Net rows). */
const KAISER_MCP_WHERE = `(MCP LIKE '%Kaiser%' OR MCP='Kaiser')`;

function claimRecordKey(row: Record<string, unknown>) {
  const id = String(row.PK_ID || row.Record_ID || row.ID || row.Claim_Number || '').trim();
  if (id) return `id:${id}`;
  const client = String(row.Client_ID2 || row.client_ID2 || row.clientId2 || '').trim();
  const dos = String(row.Date_of_Service || row.Claim_Date || '').trim();
  return `row:${client}|${dos}|${String(row.Client_First || '')}|${String(row.Client_Last || '')}`;
}

function isKaiserClaimRow(row: Record<string, unknown>): boolean {
  const mcp = row.MCP ?? row.Mcp ?? row.mcp ?? row.CalAIM_MCO ?? row.Plan ?? row.Health_Plan;
  // If MCP is missing (partial select / legacy cache), keep the row — members list is already Kaiser-only.
  if (mcp === undefined || mcp === null || String(mcp).trim() === '') return true;
  return isKaiserPlan(mcp);
}

function filterKaiserClaims(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.filter(isKaiserClaimRow);
}

function mergeClaimRecords(
  ...groups: Array<Array<Record<string, unknown>>>
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const row of group) {
      if (!isKaiserClaimRow(row)) continue;
      const key = claimRecordKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

function combineWhere(...parts: Array<string | undefined | null>) {
  const cleaned = parts.map((p) => String(p || '').trim()).filter(Boolean);
  if (!cleaned.length) return '';
  if (cleaned.length === 1) return cleaned[0];
  return cleaned.map((p) => `(${p})`).join(' AND ');
}

async function caspioClaimPage(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  token: string,
  params: URLSearchParams
): Promise<{ ok: boolean; status: number; rows: Array<Record<string, unknown>>; text: string }> {
  const url =
    `${credentials.baseUrl}/integrations/rest/v3/tables/${T2038_CLAIM_SUBMIT_TABLE}/records?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    return { ok: false, status: response.status, rows: [], text };
  }
  let json: { Result?: Array<Record<string, unknown>> } = {};
  try {
    json = JSON.parse(text || '{}') as { Result?: Array<Record<string, unknown>> };
  } catch {
    json = {};
  }
  return {
    ok: true,
    status: response.status,
    rows: Array.isArray(json.Result) ? json.Result : [],
    text: '',
  };
}

async function fetchSubmittedT2038Claims(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  opts?: { afterPk?: string }
) {
  const token = await getCaspioToken(credentials);
  let useSelect = true;
  let useKaiserWhere = true;
  const byKey = new Map<string, Record<string, unknown>>();
  const afterPk = String(opts?.afterPk || '').trim();

  const addRows = (rows: Array<Record<string, unknown>>) => {
    for (const row of filterKaiserClaims(rows)) byKey.set(claimRecordKey(row), row);
  };

  const pkWhere = (lastPk: string) => {
    if (!lastPk) return '';
    const numeric = /^\d+$/.test(lastPk);
    return numeric ? `PK_ID>${lastPk}` : `PK_ID>'${lastPk.replace(/'/g, "''")}'`;
  };

  // Strategy A: PK_ID cursor, Kaiser MCP only
  let lastPk = afterPk;
  let cursorWorked = false;
  for (let i = 0; i < 200; i += 1) {
    const params = new URLSearchParams();
    if (useSelect) params.set('q.select', CLAIM_SELECT);
    params.set('q.orderBy', 'PK_ID');
    params.set('q.limit', '1000');
    const where = combineWhere(useKaiserWhere ? KAISER_MCP_WHERE : '', pkWhere(lastPk));
    if (where) params.set('q.where', where);
    const page = await caspioClaimPage(credentials, token, params);
    if (!page.ok && i === 0) {
      const lower = page.text.toLowerCase();
      if (useSelect && (lower.includes('invalid column') || lower.includes('q.select') || page.status === 400)) {
        useSelect = false;
        i -= 1;
        continue;
      }
      if (useKaiserWhere && page.status === 400) {
        console.warn('[kaiser-t2038-claim-audit] Kaiser MCP where rejected; filtering client-side');
        useKaiserWhere = false;
        i -= 1;
        continue;
      }
    }
    if (!page.ok) {
      console.warn(
        `[kaiser-t2038-claim-audit] PK_ID cursor failed (HTTP ${page.status}): ${page.text.slice(0, 160)}`
      );
      break;
    }
    cursorWorked = true;
    if (!page.rows.length) break;
    addRows(page.rows);
    const nextPk = String(page.rows[page.rows.length - 1]?.PK_ID || '').trim();
    if (!nextPk || nextPk === lastPk) break;
    lastPk = nextPk;
    if (page.rows.length < 1000) break;
  }

  // Strategy B: pageNumber only for full pulls when cursor failed / underfetched
  if (!afterPk && (!cursorWorked || byKey.size < 200)) {
    useSelect = true;
    useKaiserWhere = true;
    for (let pageNumber = 1; pageNumber <= 120; pageNumber += 1) {
      const params = new URLSearchParams();
      if (useSelect) params.set('q.select', CLAIM_SELECT);
      params.set('q.pageSize', '1000');
      params.set('q.pageNumber', String(pageNumber));
      if (useKaiserWhere) params.set('q.where', KAISER_MCP_WHERE);
      const page = await caspioClaimPage(credentials, token, params);
      if (!page.ok && pageNumber === 1) {
        const lower = page.text.toLowerCase();
        if (useSelect && (lower.includes('invalid column') || lower.includes('q.select') || page.status === 400)) {
          useSelect = false;
          pageNumber = 0;
          continue;
        }
        if (useKaiserWhere && page.status === 400) {
          useKaiserWhere = false;
          pageNumber = 0;
          continue;
        }
      }
      if (!page.ok) {
        if (pageNumber === 1 && byKey.size === 0) {
          throw new Error(
            `Could not read ${T2038_CLAIM_SUBMIT_TABLE} (HTTP ${page.status}). ${page.text.slice(0, 180)}`
          );
        }
        break;
      }
      if (!page.rows.length) break;
      const before = byKey.size;
      addRows(page.rows);
      if (byKey.size === before && pageNumber > 1) break;
      if (page.rows.length < 1000) break;
    }
  }

  return Array.from(byKey.values());
}

async function fetchClaimsForOneClient(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  token: string,
  clientId: string
): Promise<Array<Record<string, unknown>>> {
  const escaped = clientId.replace(/'/g, "''");
  const out: Array<Record<string, unknown>> = [];
  let useSelect = true;
  let useKaiserWhere = true;
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const params = new URLSearchParams();
    params.set(
      'q.where',
      combineWhere(`Client_ID2='${escaped}'`, useKaiserWhere ? KAISER_MCP_WHERE : '')
    );
    if (useSelect) params.set('q.select', CLAIM_SELECT);
    params.set('q.pageSize', '1000');
    params.set('q.pageNumber', String(pageNumber));
    const page = await caspioClaimPage(credentials, token, params);
    if (!page.ok && pageNumber === 1) {
      if (useSelect) {
        useSelect = false;
        pageNumber = 0;
        continue;
      }
      if (useKaiserWhere) {
        useKaiserWhere = false;
        pageNumber = 0;
        continue;
      }
    }
    if (!page.ok) break;
    if (!page.rows.length) break;
    out.push(...filterKaiserClaims(page.rows));
    if (page.rows.length < 1000) break;
  }
  return out;
}

/** Parallel Client_ID2 lookups — capped so full rebuild cannot stall on hundreds of sequential Caspio calls. */
async function fetchClaimsForClientIds(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  clientIds: string[],
  opts?: { limit?: number; concurrency?: number }
): Promise<Array<Record<string, unknown>>> {
  if (!clientIds.length) return [];
  const token = await getCaspioToken(credentials);
  const limit = Math.max(1, Math.min(opts?.limit ?? 40, 80));
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 8, 12));
  const unique = Array.from(
    new Set(clientIds.map((id) => String(id || '').trim()).filter(Boolean))
  ).slice(0, limit);

  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const pages = await Promise.all(
      chunk.map((clientId) => fetchClaimsForOneClient(credentials, token, clientId))
    );
    for (const rows of pages) out.push(...rows);
  }
  return out;
}

async function fetchCachedT2038Claims(
  adminDb: any,
  opts?: { sinceIso?: string }
): Promise<Array<Record<string, unknown>>> {
  try {
    let query: any = adminDb.collection('t2038_claims_cache');
    const sinceIso = String(opts?.sinceIso || '').trim();
    if (sinceIso) {
      // Prefer docs written after the last audit run when field exists.
      query = query.where('updatedAt', '>=', sinceIso);
    }
    const snap = await query.limit(20000).get().catch(async () => {
      // Fallback without date filter if updatedAt index/field missing.
      return adminDb.collection('t2038_claims_cache').limit(20000).get();
    });
    const rows: Array<Record<string, unknown>> = [];
    snap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
      const data = doc.data() || {};
      if (data.deleted === true || data.deletedFromCaspio === true) return;
      if (sinceIso) {
        const stamp = String(
          data.updatedAt || data.updatedAtIso || data.storedAt || data.syncedAt || ''
        ).trim();
        if (stamp && stamp < sinceIso) return;
      }
      const nested =
        (data.record_data && typeof data.record_data === 'object' && data.record_data) ||
        (data.record && typeof data.record === 'object' && data.record) ||
        (data.data && typeof data.data === 'object' && data.data) ||
        null;
      rows.push({ ...(nested as Record<string, unknown>), ...data });
    });
    return rows;
  } catch (error) {
    console.warn('[kaiser-t2038-claim-audit] t2038_claims_cache read failed', error);
    return [];
  }
}

async function loadJustifications(adminDb: any) {
  const snap = await adminDb
    .collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION)
    .limit(5000)
    .get();
  const byKey = new Map<string, MonthJustification>();
  snap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
    const data = (doc.data() || {}) as Record<string, unknown>;
    const clientId2 = String(data.clientId2 || '').trim();
    const monthKey = String(data.monthKey || '').trim();
    if (!clientId2 || !monthKey) return;
    const dispositionRaw = String(data.disposition || '').trim().toLowerCase();
    const reason = String(data.reason || '').trim();
    const disposition: MonthDisposition =
      dispositionRaw === 'claimable' || reason === DEFAULT_CLAIMABLE_REASON ? 'claimable' : 'justified';
    byKey.set(`${clientId2}__${monthKey}`, {
      clientId2,
      monthKey,
      disposition,
      reason,
      justifiedBy: String(data.justifiedBy || '').trim(),
      justifiedByEmail: String(data.justifiedByEmail || '').trim(),
      updatedAt: String(data.updatedAt || '').trim(),
    });
  });
  return byKey;
}

async function loadStoredClaims(adminDb: any): Promise<Array<Record<string, unknown>>> {
  const snap = await adminDb.collection(KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION).limit(20000).get();
  const rows: Array<Record<string, unknown>> = [];
  snap.docs.forEach((doc: { data: () => Record<string, unknown> }) => {
    const data = doc.data() || {};
    if (data.deleted === true) return;
    const record =
      data.record && typeof data.record === 'object'
        ? (data.record as Record<string, unknown>)
        : data;
    rows.push(record);
  });
  return rows;
}

async function upsertStoredClaims(
  adminDb: any,
  claims: Array<Record<string, unknown>>,
  nowIso: string
) {
  let written = 0;
  for (let i = 0; i < claims.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = claims.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const row of chunk) {
      const compact = compactClaimRecordForStorage(row);
      const docId = claimDocIdFromRecord(compact);
      if (!docId) continue;
      const ref = adminDb.collection(KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION).doc(docId);
      batch.set(
        ref,
        {
          record: compact,
          clientId2: String(compact.Client_ID2 || compact.client_ID2 || ''),
          pkId: String(compact.PK_ID || ''),
          updatedAt: nowIso,
        },
        { merge: true }
      );
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

async function saveAuditRun(opts: {
  adminDb: any;
  mode: KaiserT2038ClaimAuditRunMode;
  rows: KaiserT2038ClaimAuditRow[];
  claims: Array<Record<string, unknown>>;
  stats: {
    claimRowsLive: number;
    claimRowsCached: number;
    claimRowsTargeted: number;
    claimClientsIndexed: number;
    newClaimCount: number;
  };
  authz: { email?: string; name?: string };
  fetchedAt: string;
}) {
  const { adminDb, mode, rows, claims, stats, authz, fetchedAt } = opts;
  const summary = summarizeKaiserT2038ClaimAudit(rows);
  const runRef = adminDb.collection(KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION).doc();
  const meta: KaiserT2038ClaimAuditRunMeta = {
    mode,
    createdAtIso: fetchedAt,
    createdByEmail: String(authz.email || ''),
    createdByName: String(authz.name || ''),
    fetchedAt,
    maxClaimPk: maxClaimPkFromRecords(claims),
    claimCount: claims.length,
    newClaimCount: stats.newClaimCount,
    memberCount: rows.length,
    claimClientsIndexed: stats.claimClientsIndexed,
    claimRowsLive: stats.claimRowsLive,
    claimRowsCached: stats.claimRowsCached,
    claimRowsTargeted: stats.claimRowsTargeted,
    summary,
  };
  await runRef.set(meta);

  const compactRows = rows.map(compactAuditRowForStorage);
  for (let i = 0; i < compactRows.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = compactRows.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = adminDb.batch();
    for (const row of chunk) {
      const rowId = String(row.clientId2 || row.id || `row-${i}`).replace(/[^\w.-]+/g, '_').slice(0, 700);
      batch.set(runRef.collection('rows').doc(rowId || `idx-${i}`), row, { merge: true });
    }
    await batch.commit();
  }

  await adminDb.collection(KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION).doc(KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID).set(
    {
      ...meta,
      runId: runRef.id,
      updatedAt: fetchedAt,
    },
    { merge: true }
  );

  return { runId: runRef.id, meta };
}

async function loadLatestSavedRun(adminDb: any): Promise<{
  ok: boolean;
  error?: string;
  runId?: string;
  meta?: KaiserT2038ClaimAuditRunMeta & { runId?: string };
  rows?: KaiserT2038ClaimAuditRow[];
}> {
  const stateSnap = await adminDb
    .collection(KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION)
    .doc(KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID)
    .get();
  if (!stateSnap.exists) {
    return { ok: false, error: 'No saved audit run yet. Run a full Caspio load first.' };
  }
  const state = (stateSnap.data() || {}) as Record<string, unknown>;
  const runId = String(state.runId || '').trim();
  if (!runId) {
    return { ok: false, error: 'Saved audit state is missing runId.' };
  }
  const rowsSnap = await adminDb
    .collection(KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION)
    .doc(runId)
    .collection('rows')
    .limit(5000)
    .get();
  const rows = rowsSnap.docs.map((doc: { data: () => KaiserT2038ClaimAuditRow }) => doc.data());
  return {
    ok: true,
    runId,
    meta: { ...(state as KaiserT2038ClaimAuditRunMeta), runId },
    rows,
  };
}

function parseMode(request: NextRequest): KaiserT2038ClaimAuditRunMode | 'list_runs' {
  const raw = String(request.nextUrl.searchParams.get('mode') || '').trim().toLowerCase();
  if (raw === 'full' || raw === 'incremental' || raw === 'saved' || raw === 'list_runs') return raw;
  // Legacy: refresh=true → full; otherwise prefer saved snapshot.
  if (String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true') return 'full';
  return 'saved';
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const mode = parseMode(request);
    const { adminDb } = await import('@/firebase-admin');

    if (mode === 'list_runs') {
      const snap = await adminDb
        .collection(KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION)
        .orderBy('createdAtIso', 'desc')
        .limit(25)
        .get();
      const runs = snap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({
        id: doc.id,
        ...doc.data(),
      }));
      return NextResponse.json({ success: true, runs });
    }

    if (mode === 'saved') {
      const saved = await loadLatestSavedRun(adminDb);
      if (!saved.ok) {
        return NextResponse.json({
          success: true,
          mode: 'saved',
          hasSavedRun: false,
          summary: null,
          rows: [],
          message: saved.error,
          fetchedAt: '',
        });
      }
      const rows = applyActionableGapMonthPolicy(saved.rows || []);
      return NextResponse.json({
        success: true,
        mode: 'saved',
        hasSavedRun: true,
        runId: saved.runId,
        summary: summarizeKaiserT2038ClaimAudit(rows),
        rows,
        claimRowsFetched: saved.meta?.claimCount || 0,
        claimRowsLive: saved.meta?.claimRowsLive || 0,
        claimRowsCached: saved.meta?.claimRowsCached || 0,
        claimRowsTargeted: saved.meta?.claimRowsTargeted || 0,
        claimRowsNew: 0,
        claimClientsIndexed: saved.meta?.claimClientsIndexed || 0,
        maxClaimPk: saved.meta?.maxClaimPk || '',
        fetchedAt: saved.meta?.fetchedAt || saved.meta?.createdAtIso || '',
      });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const fetchedAt = new Date().toISOString();
    const isIncremental = mode === 'incremental';
    // Rare escape hatch: ?mode=full&forceCaspio=true rescrapes the whole claims table.
    const forceCaspio =
      String(request.nextUrl.searchParams.get('forceCaspio') || '').trim() === 'true';

    const stateSnap = await adminDb
      .collection(KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION)
      .doc(KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID)
      .get();
    const state = (stateSnap.data() || {}) as Record<string, unknown>;
    const priorMaxPk = String(state.maxClaimPk || '').trim();
    const priorFetchedAt = String(state.fetchedAt || state.createdAtIso || '').trim();

    if (isIncremental && (!stateSnap.exists || !priorMaxPk)) {
      return NextResponse.json(
        {
          success: false,
          error: 'No saved audit yet. Run a full rebuild once before incremental updates.',
        },
        { status: 400 }
      );
    }

    // Never force-refresh the entire members table here — that alone can take minutes.
    // Members come from the existing Caspio/Firestore member cache.
    const [membersResult, storedClaims, webhookCachedClaims, justificationsByKey] = await Promise.all([
      fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh: false,
        cacheTtlMs: 30 * 60 * 1000,
      }),
      loadStoredClaims(adminDb),
      fetchCachedT2038Claims(adminDb, isIncremental ? { sinceIso: priorFetchedAt || undefined } : undefined),
      loadJustifications(adminDb),
    ]);

    let liveClaims: Array<Record<string, unknown>> = [];
    let cachedClaims = webhookCachedClaims;
    let newClaims: Array<Record<string, unknown>> = [];

    // Inventory already on hand — Kaiser MCP only (Health Net rows dropped).
    const kaiserStored = filterKaiserClaims(storedClaims);
    const kaiserCached = filterKaiserClaims(webhookCachedClaims);
    cachedClaims = kaiserCached;
    const baseInventory = mergeClaimRecords(kaiserStored, isIncremental ? [] : kaiserCached);
    const inventoryMaxPk = maxClaimPkFromRecords(baseInventory) || priorMaxPk;

    if (isIncremental) {
      const deltaLive = await fetchSubmittedT2038Claims(credentials, {
        afterPk: priorMaxPk || inventoryMaxPk || undefined,
      });
      liveClaims = deltaLive;
      newClaims = mergeClaimRecords(deltaLive, kaiserCached);
    } else if (forceCaspio) {
      // Explicit full Caspio scrape of Kaiser MCP rows only.
      liveClaims = await fetchSubmittedT2038Claims(credentials);
      newClaims = mergeClaimRecords(liveClaims, kaiserCached);
    } else if (baseInventory.length >= 100) {
      // Fast full rebuild: rebuild audit from Firestore inventory + Kaiser Caspio delta only.
      liveClaims = await fetchSubmittedT2038Claims(credentials, {
        afterPk: inventoryMaxPk || undefined,
      });
      newClaims = liveClaims;
    } else {
      // First-time / thin inventory: scrape Kaiser MCP claims once to seed Firestore.
      liveClaims = await fetchSubmittedT2038Claims(credentials);
      newClaims = mergeClaimRecords(liveClaims, kaiserCached);
    }

    let claims = mergeClaimRecords(baseInventory, newClaims);
    const rawMembers = Array.isArray(membersResult.rawMembers)
      ? membersResult.rawMembers
      : membersResult.members || [];
    let claimsByClient = indexClaimsByClientId2(claims);
    let rows = buildKaiserT2038ClaimAuditRows({
      rawMembers: rawMembers as Array<Record<string, unknown>>,
      claimsByClient,
      justificationsByKey,
    });

    // Targeted Client_ID2 lookups only for open-auth "no claims" — capped + parallel.
    // (Previously this did up to 400 sequential Caspio calls and made full rebuild crawl.)
    const missingClientIds = rows
      .filter(
        (row) =>
          row.noClaimsYet &&
          row.clientId2 &&
          (row.window === 'in_window' || row.window === 'ending_soon' || row.window === 'not_started')
      )
      .map((row) => row.clientId2);
    let claimRowsTargeted = 0;
    const shouldTarget =
      missingClientIds.length > 0 &&
      (forceCaspio || claims.length < 100 || missingClientIds.length <= 40);
    if (shouldTarget) {
      const targeted = await fetchClaimsForClientIds(credentials, missingClientIds, {
        limit: forceCaspio ? 80 : 40,
        concurrency: 8,
      });
      claimRowsTargeted = targeted.length;
      if (targeted.length > 0) {
        newClaims = mergeClaimRecords(newClaims, targeted);
        claims = mergeClaimRecords(claims, targeted);
        claimsByClient = indexClaimsByClientId2(claims);
        rows = buildKaiserT2038ClaimAuditRows({
          rawMembers: rawMembers as Array<Record<string, unknown>>,
          claimsByClient,
          justificationsByKey,
        });
      }
    }

    // Persist only net-new claim rows (not the entire inventory every full rebuild).
    const existingKeys = new Set(baseInventory.map((row) => claimRecordKey(row)));
    const claimsToUpsert = (forceCaspio ? claims : newClaims).filter(
      (row) => forceCaspio || !existingKeys.has(claimRecordKey(row))
    );
    // First seed: inventory was thin — write the merged set so incremental works next time.
    const seedWrite = !forceCaspio && baseInventory.length < 100 ? claims : claimsToUpsert;
    await upsertStoredClaims(adminDb, seedWrite, fetchedAt);

    const saved = await saveAuditRun({
      adminDb,
      mode,
      rows,
      claims,
      stats: {
        claimRowsLive: liveClaims.length,
        claimRowsCached: cachedClaims.length,
        claimRowsTargeted,
        claimClientsIndexed: claimsByClient.size,
        newClaimCount: isIncremental ? newClaims.length : claims.length,
      },
      authz,
      fetchedAt,
    });

    return NextResponse.json({
      success: true,
      mode,
      hasSavedRun: true,
      runId: saved.runId,
      summary: saved.meta.summary,
      rows,
      claimRowsFetched: claims.length,
      claimRowsLive: liveClaims.length,
      claimRowsCached: cachedClaims.length,
      claimRowsTargeted,
      claimRowsNew: isIncremental ? newClaims.length : claims.length,
      claimClientsIndexed: claimsByClient.size,
      maxClaimPk: saved.meta.maxClaimPk,
      fetchedAt,
    });
  } catch (error: unknown) {
    console.error('[kaiser-t2038-claim-audit GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to load Kaiser T2038 claim audit.'),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      clientId2?: string;
      monthKey?: string;
      reason?: string;
      disposition?: string;
      clear?: boolean;
    };
    const clientId2 = String(body.clientId2 || '').trim();
    const monthKey = String(body.monthKey || '').trim();
    const clear = Boolean(body.clear);
    const disposition: MonthDisposition =
      String(body.disposition || '').trim().toLowerCase() === 'claimable' ? 'claimable' : 'justified';
    const reason =
      String(body.reason || '').trim() ||
      (disposition === 'claimable' ? DEFAULT_CLAIMABLE_REASON : DEFAULT_JUSTIFY_REASON);

    if (!clientId2 || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json(
        { success: false, error: 'clientId2 and monthKey (YYYY-MM) are required.' },
        { status: 400 }
      );
    }

    const { adminDb } = await import('@/firebase-admin');
    const docId = justificationDocId(clientId2, monthKey);
    const ref = adminDb.collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION).doc(docId);

    if (clear) {
      await ref.delete().catch(async () => {
        await ref.set({ deleted: true, updatedAt: new Date().toISOString() }, { merge: true });
      });
      return NextResponse.json({ success: true, cleared: true, clientId2, monthKey });
    }

    const payload: MonthJustification = {
      clientId2,
      monthKey,
      disposition,
      reason,
      justifiedBy: String(authz.name || authz.email || authz.uid || 'Admin').trim(),
      justifiedByEmail: String(authz.email || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(
      {
        ...payload,
        uid: authz.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, justification: payload });
  } catch (error: unknown) {
    console.error('[kaiser-t2038-claim-audit POST]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to save justification.'),
      },
      { status: 500 }
    );
  }
}
