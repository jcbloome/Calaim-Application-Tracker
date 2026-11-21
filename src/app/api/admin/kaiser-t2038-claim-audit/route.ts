import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { isKaiserPlan, T2038_CLAIM_SUBMIT_TABLE } from '@/lib/t2038-claims';
import {
  applyActionableGapMonthPolicy,
  applyMemberNoteEvidenceToAuditRows,
  buildKaiserT2038ClaimAuditRows,
  claimDocIdFromRecord,
  compactAuditRowForStorage,
  compactClaimRecordForStorage,
  KAISER_T2038_CLAIM_STORAGE_SCHEMA,
  indexClaimsByClientId2,
  isClaimRowSubmitted,
  justificationDocId,
  KAISER_T2038_CLAIM_AUDIT_CLAIMS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_RUNS_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION,
  KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID,
  maxClaimPkFromRecords,
  monthKeyFromDate,
  normalizeMrnKey,
  findKaiserMrnNonKaiserMcoMembers,
  DEFAULT_CLAIMABLE_REASON,
  DEFAULT_JUSTIFY_REASON,
  isNotesClaimableJustification,
  summarizeKaiserT2038ClaimAudit,
  type KaiserT2038ClaimAuditRunMeta,
  type KaiserT2038ClaimAuditRunMode,
  type KaiserT2038ClaimAuditRow,
  type MonthDisposition,
  type MonthJustification,
} from '@/lib/kaiser-t2038-claim-audit';

const MEMBER_NOTES_COLLECTION = 'member-notes';
const NOTE_CLIENT_IN_CHUNK = 10;

/** Load calendar months that have member-notes for the given Client_ID2 values. */
async function loadNoteMonthEvidenceByClientId2(
  adminDb: any,
  clientId2s: string[]
): Promise<{ months: Map<string, Set<string>>; counts: Map<string, Map<string, number>> }> {
  const months = new Map<string, Set<string>>();
  const counts = new Map<string, Map<string, number>>();
  const unique = [
    ...new Set(
      clientId2s
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    ),
  ];
  if (!adminDb || unique.length === 0) return { months, counts };

  const bump = (clientId2: string, monthKey: string) => {
    if (!months.has(clientId2)) months.set(clientId2, new Set());
    months.get(clientId2)!.add(monthKey);
    if (!counts.has(clientId2)) counts.set(clientId2, new Map());
    const byMonth = counts.get(clientId2)!;
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);
  };

  for (let i = 0; i < unique.length; i += NOTE_CLIENT_IN_CHUNK) {
    const chunk = unique.slice(i, i + NOTE_CLIENT_IN_CHUNK);
    try {
      const snap = await adminDb
        .collection(MEMBER_NOTES_COLLECTION)
        .where('clientId2', 'in', chunk)
        .get();
      for (const doc of snap.docs as Array<{ data: () => Record<string, unknown> }>) {
        const data = doc.data() || {};
        if (data.deleted) continue;
        const clientId2 = String(data.clientId2 || '').trim();
        if (!clientId2) continue;
        const rawCreated = data.createdAt as { toDate?: () => Date } | string | Date | undefined;
        const createdAt =
          rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === 'function'
            ? (rawCreated as { toDate: () => Date }).toDate()
            : rawCreated
              ? new Date(rawCreated as string | Date)
              : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
        bump(clientId2, monthKeyFromDate(createdAt));
      }
    } catch (err) {
      console.warn(
        `[kaiser-t2038-claim-audit] note-month load failed for chunk ${chunk.join(',')}:`,
        String((err as { message?: string })?.message || err)
      );
    }
  }
  return { months, counts };
}

async function enrichRowsWithMemberNoteEvidence(
  adminDb: any,
  rows: KaiserT2038ClaimAuditRow[]
): Promise<KaiserT2038ClaimAuditRow[]> {
  const clientIds = rows
    .filter((row) => !row.noClaimsYet && (row.months || []).some((month) => month.status !== 'claimed'))
    .map((row) => row.clientId2)
    .filter(Boolean);
  if (!clientIds.length) return rows;
  const { months, counts } = await loadNoteMonthEvidenceByClientId2(adminDb, clientIds);
  console.log(
    `[kaiser-t2038-claim-audit] note evidence for ${months.size}/${clientIds.length} member(s) with open months`
  );
  return applyMemberNoteEvidenceToAuditRows(rows, months, counts);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const FIRESTORE_BATCH_LIMIT = 400;

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
  params: URLSearchParams,
  table: string = T2038_CLAIM_SUBMIT_TABLE
): Promise<{ ok: boolean; status: number; rows: Array<Record<string, unknown>>; text: string }> {
  const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${table}/records?${params.toString()}`;
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

/**
 * Kaiser rows from CalAIM_tbl_Members via PK_ID cursor. The shared member loader pages with
 * q.pageNumber, which Caspio can repeat/skip — that silently dropped newer members.
 * Returns null when the cursor is not supported so callers can fall back.
 */
async function fetchKaiserMembersByCursor(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>
): Promise<Array<Record<string, unknown>> | null> {
  const token = await getCaspioToken(credentials);
  const out: Array<Record<string, unknown>> = [];
  let lastPk = '';
  for (let i = 0; i < 100; i += 1) {
    const params = new URLSearchParams();
    params.set('q.orderBy', 'PK_ID');
    params.set('q.limit', '1000');
    params.set('q.where', combineWhere(`CalAIM_MCO LIKE '%Kaiser%'`, lastPk ? `PK_ID>${lastPk}` : ''));
    const page = await caspioClaimPage(credentials, token, params, 'CalAIM_tbl_Members');
    if (!page.ok) {
      console.warn(
        `[kaiser-t2038-claim-audit] member PK_ID cursor failed (HTTP ${page.status}): ${page.text.slice(0, 160)}`
      );
      return i === 0 ? null : out;
    }
    if (!page.rows.length) break;
    out.push(...page.rows);
    const nextPk = String(page.rows[page.rows.length - 1]?.PK_ID || '').trim();
    if (!/^\d+$/.test(nextPk) || nextPk === lastPk) break;
    lastPk = nextPk;
    if (page.rows.length < 1000) break;
  }
  return out;
}

function memberRecordKey(row: Record<string, unknown>) {
  const pk = String(row.PK_ID || '').trim();
  if (pk) return `pk:${pk}`;
  const id = String(row.Client_ID2 || row.client_ID2 || row.clientId2 || '').trim();
  if (id) return `id:${id}`;
  return `name:${String(row.Senior_Last || '')}|${String(row.Senior_First || '')}|${String(row.MCP_CIN || '')}`;
}

function mergeMemberRecords(...groups: Array<Array<Record<string, unknown>>>) {
  const byKey = new Map<string, Record<string, unknown>>();
  const seenClientIds = new Set<string>();
  for (const group of groups) {
    for (const row of group) {
      const key = memberRecordKey(row);
      const clientId = String(row.Client_ID2 || row.client_ID2 || row.clientId2 || '').trim();
      if (byKey.has(key) || (clientId && seenClientIds.has(clientId))) continue;
      byKey.set(key, row);
      if (clientId) seenClientIds.add(clientId);
    }
  }
  return Array.from(byKey.values());
}

async function fetchClaimsByPks(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  pks: string[]
): Promise<Array<Record<string, unknown>>> {
  const token = await getCaspioToken(credentials);
  const chunks: string[][] = [];
  for (let i = 0; i < pks.length; i += 100) chunks.push(pks.slice(i, i + 100));
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < chunks.length; i += 4) {
    const pages = await Promise.all(
      chunks.slice(i, i + 4).map((chunk) => {
        const params = new URLSearchParams();
        params.set('q.where', `PK_ID IN (${chunk.join(',')})`);
        params.set('q.limit', '1000');
        return caspioClaimPage(credentials, token, params);
      })
    );
    for (const page of pages) {
      if (!page.ok) {
        console.warn(`[kaiser-t2038-claim-audit] PK refresh failed (HTTP ${page.status}): ${page.text.slice(0, 160)}`);
        continue;
      }
      out.push(...filterKaiserClaims(page.rows));
    }
  }
  return out;
}

async function fetchSubmittedT2038Claims(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  opts?: { afterPk?: string }
) {
  const token = await getCaspioToken(credentials);
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
    params.set('q.orderBy', 'PK_ID');
    params.set('q.limit', '1000');
    const where = combineWhere(useKaiserWhere ? KAISER_MCP_WHERE : '', pkWhere(lastPk));
    if (where) params.set('q.where', where);
    const page = await caspioClaimPage(credentials, token, params);
    if (!page.ok && i === 0) {
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
    useKaiserWhere = true;
    for (let pageNumber = 1; pageNumber <= 120; pageNumber += 1) {
      const params = new URLSearchParams();
      params.set('q.pageSize', '1000');
      params.set('q.pageNumber', String(pageNumber));
      if (useKaiserWhere) params.set('q.where', KAISER_MCP_WHERE);
      const page = await caspioClaimPage(credentials, token, params);
      if (!page.ok && pageNumber === 1) {
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

async function fetchClaimsByWhere(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  token: string,
  identityWhere: string
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let useKaiserWhere = true;
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const params = new URLSearchParams();
    params.set('q.where', combineWhere(identityWhere, useKaiserWhere ? KAISER_MCP_WHERE : ''));
    params.set('q.pageSize', '1000');
    params.set('q.pageNumber', String(pageNumber));
    const page = await caspioClaimPage(credentials, token, params);
    if (!page.ok && pageNumber === 1) {
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

/** Live Caspio pull for one member — Client_ID2 / client_ID2, then MCP_CIN / MRN, then name. */
async function fetchClaimsForOneMember(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  token: string,
  opts: { clientId2?: string; mrn?: string; memberFirstName?: string; memberLastName?: string }
): Promise<Array<Record<string, unknown>>> {
  const clientId = String(opts.clientId2 || '').trim();
  const mrnRaw = String(opts.mrn || '').trim();
  const mrnKey = normalizeMrnKey(mrnRaw);
  const first = String(opts.memberFirstName || '').trim();
  const last = String(opts.memberLastName || '').trim();
  const byKey = new Map<string, Record<string, unknown>>();
  const add = (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) byKey.set(claimRecordKey(row), row);
  };

  if (clientId) {
    const escaped = clientId.replace(/'/g, "''");
    // Caspio tables have used both Client_ID2 and client_ID2.
    for (const field of ['Client_ID2', 'client_ID2'] as const) {
      add(await fetchClaimsByWhere(credentials, token, `${field}='${escaped}'`));
      if (byKey.size > 0) break;
    }
    // Numeric Client_ID2 variants (Caspio sometimes stores without quotes / as number).
    if (/^\d+$/.test(clientId) && byKey.size === 0) {
      for (const field of ['Client_ID2', 'client_ID2'] as const) {
        add(await fetchClaimsByWhere(credentials, token, `${field}=${clientId}`));
        if (byKey.size > 0) break;
      }
    }
  }

  if (byKey.size === 0 && (mrnRaw || mrnKey)) {
    const candidates = Array.from(
      new Set(
        [mrnRaw, mrnKey, mrnKey ? mrnKey.padStart(12, '0') : '']
          .map((v) => String(v || '').trim())
          .filter(Boolean)
      )
    );
    for (const cin of candidates) {
      const escaped = cin.replace(/'/g, "''");
      add(await fetchClaimsByWhere(credentials, token, `MCP_CIN='${escaped}'`));
      if (byKey.size > 0) break;
    }
  }

  // Name fallback when Client_ID2 / MRN on the member don't match claim rows (typos).
  if (byKey.size === 0 && first && last) {
    const ef = first.replace(/'/g, "''");
    const el = last.replace(/'/g, "''");
    add(
      await fetchClaimsByWhere(
        credentials,
        token,
        `Client_Last='${el}' AND Client_First='${ef}'`
      )
    );
  }

  return Array.from(byKey.values());
}

type TargetedMemberRef = {
  clientId2?: string;
  mrn?: string;
  memberFirstName?: string;
  memberLastName?: string;
};

/**
 * Parallel live Caspio lookups for no-claims members.
 * Processes the full list in concurrency batches (no hard skip when count > 40).
 */
async function fetchClaimsForMembers(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  members: TargetedMemberRef[],
  opts?: { concurrency?: number; maxMembers?: number }
): Promise<Array<Record<string, unknown>>> {
  if (!members.length) return [];
  const token = await getCaspioToken(credentials);
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 8, 12));
  const maxMembers = Math.max(1, opts?.maxMembers ?? 500);
  const seen = new Set<string>();
  const unique: TargetedMemberRef[] = [];
  for (const member of members) {
    const clientId2 = String(member.clientId2 || '').trim();
    const mrn = String(member.mrn || '').trim();
    const key = `${clientId2}|${normalizeMrnKey(mrn) || mrn}`;
    if (!clientId2 && !mrn) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ clientId2: clientId2 || undefined, mrn: mrn || undefined });
    if (unique.length >= maxMembers) break;
  }

  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const pages = await Promise.all(
      chunk.map((member) => fetchClaimsForOneMember(credentials, token, member))
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
      dispositionRaw === 'claimable' || isNotesClaimableJustification(reason) ? 'claimable' : 'justified';
    byKey.set(`${clientId2}__${monthKey}`, {
      clientId2,
      monthKey,
      disposition,
      reason,
      justifiedBy: String(data.justifiedBy || '').trim(),
      justifiedByEmail: String(data.justifiedByEmail || '').trim(),
      updatedAt: String(data.updatedAt || '').trim(),
      caspioPushedAt: String(data.caspioPushedAt || '').trim(),
      caspioClaimPkId: String(data.caspioClaimPkId || '').trim(),
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
  const hitCaspio = mode === 'full' || mode === 'incremental' || mode === 'refresh_member';
  const meta: KaiserT2038ClaimAuditRunMeta = {
    mode,
    createdAtIso: fetchedAt,
    createdByEmail: String(authz.email || ''),
    createdByName: String(authz.name || ''),
    fetchedAt,
    firestoreStoredAt: fetchedAt,
    ...(hitCaspio ? { lastCaspioRefreshAt: fetchedAt } : {}),
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

  const statePatch: Record<string, unknown> = {
    ...meta,
    runId: runRef.id,
    updatedAt: fetchedAt,
    firestoreStoredAt: fetchedAt,
  };
  if (hitCaspio) statePatch.lastCaspioRefreshAt = fetchedAt;

  await adminDb.collection(KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION).doc(KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID).set(
    statePatch,
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

function parseMode(
  request: NextRequest
): KaiserT2038ClaimAuditRunMode | 'list_runs' | 'mco_mrn_mismatch' {
  const raw = String(request.nextUrl.searchParams.get('mode') || '').trim().toLowerCase();
  if (
    raw === 'full' ||
    raw === 'incremental' ||
    raw === 'saved' ||
    raw === 'list_runs' ||
    raw === 'refresh_member' ||
    raw === 'mco_mrn_mismatch'
  ) {
    return raw;
  }
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

    // Separate scan: Kaiser-looking MRN (starts with 0/1, or Kaiser_MRN set) but CalAIM_MCO ≠ Kaiser.
    // Skips Closed / Member Died / Non_Active. ?refresh=true|forceCaspio=true bypasses member cache.
    if (mode === 'mco_mrn_mismatch') {
      const credentials = getCaspioCredentialsFromEnv();
      const forceCaspio =
        String(request.nextUrl.searchParams.get('forceCaspio') || '').trim() === 'true' ||
        String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true';
      const membersResult = await fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh: forceCaspio,
        cacheTtlMs: forceCaspio ? 0 : 30 * 60 * 1000,
      });
      const rawMembers = (
        Array.isArray(membersResult.rawMembers) ? membersResult.rawMembers : membersResult.members || []
      ) as Array<Record<string, unknown>>;
      const mismatches = findKaiserMrnNonKaiserMcoMembers(rawMembers);
      return NextResponse.json({
        success: true,
        mode: 'mco_mrn_mismatch',
        forceCaspio,
        membersScanned: rawMembers.length,
        mismatchCount: mismatches.length,
        mismatches,
        fetchedAt: new Date().toISOString(),
      });
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
          snapshotAt: '',
          firestoreStoredAt: '',
          lastCaspioRefreshAt: '',
        });
      }
      let rows = applyActionableGapMonthPolicy(saved.rows || []);
      rows = await enrichRowsWithMemberNoteEvidence(adminDb, rows);
      const stateData = (saved.meta || {}) as KaiserT2038ClaimAuditRunMeta & {
        firestoreStoredAt?: string;
        lastCaspioRefreshAt?: string;
      };
      const firestoreStoredAt =
        String(stateData.firestoreStoredAt || stateData.fetchedAt || stateData.createdAtIso || '').trim();
      const lastCaspioRefreshAt = String(stateData.lastCaspioRefreshAt || '').trim();
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
        fetchedAt: firestoreStoredAt,
        snapshotAt: firestoreStoredAt,
        firestoreStoredAt,
        lastCaspioRefreshAt,
      });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const fetchedAt = new Date().toISOString();
    const isIncremental = mode === 'incremental';
    const isRefreshMember = mode === 'refresh_member';
    // Rare escape hatch: ?mode=full&forceCaspio=true rescrapes the whole claims table.
    const forceCaspio =
      String(request.nextUrl.searchParams.get('forceCaspio') || '').trim() === 'true';

    // Per-member live Caspio pull — merge into inventory and rebuild the saved run.
    if (isRefreshMember) {
      const clientId2 = String(request.nextUrl.searchParams.get('clientId2') || '').trim();
      const mrn = String(request.nextUrl.searchParams.get('mrn') || '').trim();
      const memberFirstName = String(request.nextUrl.searchParams.get('first') || '').trim();
      const memberLastName = String(request.nextUrl.searchParams.get('last') || '').trim();
      if (!clientId2 && !mrn && !(memberFirstName && memberLastName)) {
        return NextResponse.json(
          { success: false, error: 'clientId2, mrn, or first+last is required for refresh_member.' },
          { status: 400 }
        );
      }

      const [baseInventory, justificationsByKey, membersResult] = await Promise.all([
        loadStoredClaims(adminDb),
        loadJustifications(adminDb),
        fetchAllCalAIMMembers(credentials, {
          includeRawData: true,
          forceRefresh: false,
          cacheTtlMs: 30 * 60 * 1000,
        }),
      ]);
      const token = await getCaspioToken(credentials);
      const targeted = await fetchClaimsForOneMember(credentials, token, {
        clientId2,
        mrn,
        memberFirstName,
        memberLastName,
      });
      console.log(
        `[kaiser-t2038-claim-audit] refresh_member clientId2=${clientId2 || '—'} mrn=${mrn || '—'} name=${memberLastName},${memberFirstName} → ${targeted.length} row(s)`
      );
      const claims = mergeClaimRecords(targeted, filterKaiserClaims(baseInventory));
      if (targeted.length) await upsertStoredClaims(adminDb, targeted, fetchedAt);

      const cachedMembers = (
        Array.isArray(membersResult.rawMembers) ? membersResult.rawMembers : membersResult.members || []
      ) as Array<Record<string, unknown>>;
      const claimsByClient = indexClaimsByClientId2(claims);
      let rows = buildKaiserT2038ClaimAuditRows({
        rawMembers: cachedMembers,
        claimsByClient,
        justificationsByKey,
      });
      rows = applyActionableGapMonthPolicy(rows);
      rows = await enrichRowsWithMemberNoteEvidence(adminDb, rows);

      const saved = await saveAuditRun({
        adminDb,
        mode: 'refresh_member',
        rows,
        claims,
        stats: {
          claimRowsLive: targeted.length,
          claimRowsCached: baseInventory.length,
          claimRowsTargeted: targeted.length,
          claimClientsIndexed: claimsByClient.size,
          newClaimCount: targeted.length,
        },
        authz,
        fetchedAt,
      });

      const refreshedRow =
        rows.find(
          (row) =>
            (clientId2 && row.clientId2 === clientId2) ||
            (mrn && normalizeMrnKey(row.mrn) === normalizeMrnKey(mrn))
        ) || null;

      return NextResponse.json({
        success: true,
        mode: 'refresh_member',
        hasSavedRun: true,
        runId: saved.runId,
        summary: saved.meta.summary,
        rows,
        refreshedRow,
        claimRowsFetched: claims.length,
        claimRowsLive: targeted.length,
        claimRowsCached: baseInventory.length,
        claimRowsTargeted: targeted.length,
        claimRowsNew: targeted.length,
        claimClientsIndexed: claimsByClient.size,
        maxClaimPk: saved.meta.maxClaimPk,
        fetchedAt,
        snapshotAt: fetchedAt,
        firestoreStoredAt: fetchedAt,
        lastCaspioRefreshAt: fetchedAt,
      });
    }

    const stateSnap = await adminDb
      .collection(KAISER_T2038_CLAIM_AUDIT_STATE_COLLECTION)
      .doc(KAISER_T2038_CLAIM_AUDIT_STATE_DOC_ID)
      .get();
    const state = (stateSnap.data() || {}) as Record<string, unknown>;
    const priorMaxPk = String(state.maxClaimPk || '').trim();
    const priorFetchedAt = String(state.fetchedAt || state.createdAtIso || '').trim();

    // First visit / no inventory yet: treat incremental like a seed rebuild (live Caspio pull).
    const seedFromScratch = isIncremental && (!stateSnap.exists || !priorMaxPk);

    // Never force-refresh the entire members table here — that alone can take minutes.
    // Members come from the existing Caspio/Firestore member cache.
    const [cursorMembers, membersResult, storedClaims, webhookCachedClaims, justificationsByKey] = await Promise.all([
      fetchKaiserMembersByCursor(credentials).catch((err) => {
        console.warn('[kaiser-t2038-claim-audit] member cursor error', err);
        return null;
      }),
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
    // Rows stored before the full-column pull lack Date 0f Service — re-scrape once on full rebuild.
    const inventoryStale =
      !isIncremental &&
      kaiserStored.some((row) => row._claimSchema !== KAISER_T2038_CLAIM_STORAGE_SCHEMA);
    const scrapeAll = forceCaspio || inventoryStale || seedFromScratch || baseInventory.length < 100;

    if (isIncremental && !scrapeAll) {
      const deltaLive = await fetchSubmittedT2038Claims(credentials, {
        afterPk: priorMaxPk || inventoryMaxPk || undefined,
      });
      liveClaims = deltaLive;
      newClaims = mergeClaimRecords(deltaLive, kaiserCached);
    } else if (scrapeAll) {
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

    // Rows stored with blank Claim_Status get marked submitted later — re-read them by PK_ID.
    let refreshedClaims: Array<Record<string, unknown>> = [];
    if (!scrapeAll) {
      const blankPks = baseInventory
        .filter((row) => !isClaimRowSubmitted(row))
        .map((row) => String(row.PK_ID || '').trim())
        .filter((pk) => /^\d+$/.test(pk));
      if (blankPks.length) {
        refreshedClaims = await fetchClaimsByPks(credentials, blankPks);
        newClaims = mergeClaimRecords(refreshedClaims, newClaims);
      }
    }

    let claims = mergeClaimRecords(newClaims, baseInventory);
    const cachedMembers = (
      Array.isArray(membersResult.rawMembers) ? membersResult.rawMembers : membersResult.members || []
    ) as Array<Record<string, unknown>>;
    const rawMembers = mergeMemberRecords(cursorMembers || [], cachedMembers);
    console.log(
      `[kaiser-t2038-claim-audit] members: cursor ${cursorMembers ? cursorMembers.length : 'n/a'} · cache ${cachedMembers.length} · merged ${rawMembers.length}`
    );
    let claimsByClient = indexClaimsByClientId2(claims);
    let rows = buildKaiserT2038ClaimAuditRows({
      rawMembers: rawMembers as Array<Record<string, unknown>>,
      claimsByClient,
      justificationsByKey,
    });

    // Always live-pull Caspio for open-auth "no claims yet" members (Client_ID2 + MRN fallback).
    // Older paid rows can sit below maxClaimPk and never arrive via incremental PK delta.
    // Previously skipped entirely when missingClientIds.length > 40 and inventory was large.
    const missingMembers: TargetedMemberRef[] = rows
      .filter(
        (row) =>
          row.noClaimsYet &&
          (row.clientId2 || row.mrn) &&
          (row.window === 'in_window' ||
            row.window === 'ending_soon' ||
            row.window === 'not_started' ||
            // Also catch false negatives still listed under open+ended filters.
            row.window === 'expired')
      )
      .map((row) => ({
        clientId2: row.clientId2 || undefined,
        mrn: row.mrn || undefined,
        memberFirstName: row.memberFirstName || undefined,
        memberLastName: row.memberLastName || undefined,
      }));
    let claimRowsTargeted = 0;
    if (missingMembers.length > 0 && !scrapeAll) {
      console.log(
        `[kaiser-t2038-claim-audit] targeted refresh for ${missingMembers.length} noClaimsYet member(s)`
      );
      const targeted = await fetchClaimsForMembers(credentials, missingMembers, {
        concurrency: 8,
        maxMembers: 500,
      });
      claimRowsTargeted = targeted.length;
      console.log(
        `[kaiser-t2038-claim-audit] targeted pull returned ${targeted.length} claim row(s)`
      );
      if (targeted.length > 0) {
        newClaims = mergeClaimRecords(targeted, newClaims);
        claims = mergeClaimRecords(targeted, claims);
        claimsByClient = indexClaimsByClientId2(claims);
        rows = buildKaiserT2038ClaimAuditRows({
          rawMembers: rawMembers as Array<Record<string, unknown>>,
          claimsByClient,
          justificationsByKey,
        });
      }
    } else if (missingMembers.length > 0 && scrapeAll) {
      console.log(
        `[kaiser-t2038-claim-audit] skipping targeted refresh (forceCaspio full scrape already ran)`
      );
    }

    rows = applyActionableGapMonthPolicy(rows);
    rows = await enrichRowsWithMemberNoteEvidence(adminDb, rows);

    // Persist only net-new claim rows (not the entire inventory every full rebuild).
    const existingKeys = new Set(baseInventory.map((row) => claimRecordKey(row)));
    const claimsToUpsert = mergeClaimRecords(
      refreshedClaims,
      (scrapeAll ? claims : newClaims).filter((row) => scrapeAll || !existingKeys.has(claimRecordKey(row)))
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
      membersFromCursor: cursorMembers ? cursorMembers.length : null,
      membersFromCache: cachedMembers.length,
      maxClaimPk: saved.meta.maxClaimPk,
      fetchedAt,
      snapshotAt: fetchedAt,
      firestoreStoredAt: fetchedAt,
      lastCaspioRefreshAt: fetchedAt,
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
