import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken, normalizeCaspioBlankValue } from '@/lib/caspio-api-utils';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 1000;
const MAX_PAGES = 200;
const FIRESTORE_BATCH_LIMIT = 500;

type BackfillResult = {
  key: string;
  table: string;
  collection: string;
  fetched: number;
  upserted: number;
  skippedMissingId: number;
  skippedTestMarkers: number;
  pages: number;
  warning?: string;
};

type LooseRecord = Record<string, unknown>;
type WriteBatchLike = {
  set: (ref: unknown, data: unknown, options?: unknown) => void;
  commit: () => Promise<unknown>;
};
type CollectionLike = {
  doc: (id: string) => unknown;
};
type AdminDbLike = {
  batch: () => WriteBatchLike;
  collection: (path: string) => CollectionLike;
};

type TableConfig = {
  key: string;
  table: string;
  tableAliases?: string[];
  collection: string;
  toDocId: (record: LooseRecord) => string;
  toWriteData?: (record: LooseRecord) => LooseRecord;
  optional?: boolean;
};

function readBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return String(match?.[1] || '').trim();
}

function hasWebhookTestMarker(...values: unknown[]) {
  return values.some((value) => String(value || '').toUpperCase().includes('WEBHOOK_TEST'));
}

function toSafeSuffix(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[^\w.\-@]+/g, '_')
    .slice(0, 240);
}

function claimIdCandidate(record: LooseRecord) {
  return (
    record?.PK_ID ||
    record?.Record_ID ||
    record?.ID ||
    record?.Claim_ID ||
    record?.Claim_Number ||
    record?.Client_ID2 ||
    record?.client_ID2 ||
    ''
  );
}

async function fetchTablePage(params: {
  baseUrl: string;
  accessToken: string;
  tableName: string;
  pageNumber: number;
}) {
  const { baseUrl, accessToken, tableName, pageNumber } = params;
  const url = `${baseUrl}/integrations/rest/v3/tables/${encodeURIComponent(tableName)}/records?q.pageSize=${PAGE_SIZE}&q.pageNumber=${pageNumber}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch ${tableName} page ${pageNumber}: ${res.status} ${text}`);
  }
  const payload = (await res.json().catch(() => ({}))) as { Result?: unknown };
  return Array.isArray(payload?.Result) ? payload.Result : [];
}

function isTableNotFoundError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('tablenotfound') || message.includes('cannot perform operation because');
}

async function backfillTable(params: {
  adminDb: AdminDbLike;
  credentialsBaseUrl: string;
  accessToken: string;
  config: TableConfig;
  nowIso: string;
}) {
  const { adminDb, credentialsBaseUrl, accessToken, config, nowIso } = params;
  const candidateTables = [config.table, ...(config.tableAliases || [])].filter(Boolean);
  let selectedTable = '';
  let fetched = 0;
  let upserted = 0;
  let skippedMissingId = 0;
  let skippedTestMarkers = 0;
  let pages = 0;
  let tableMissingWarning = '';

  for (const tableName of candidateTables) {
    try {
      fetched = 0;
      upserted = 0;
      skippedMissingId = 0;
      skippedTestMarkers = 0;
      pages = 0;

      for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
        const pageRowsRaw = await fetchTablePage({
          baseUrl: credentialsBaseUrl,
          accessToken,
          tableName,
          pageNumber,
        });
        const pageRows = pageRowsRaw.map((row) => normalizeCaspioBlankValue((row as LooseRecord) || {}));
        pages += 1;
        if (pageRows.length === 0) break;
        fetched += pageRows.length;

        for (let idx = 0; idx < pageRows.length; idx += FIRESTORE_BATCH_LIMIT) {
          const chunk = pageRows.slice(idx, idx + FIRESTORE_BATCH_LIMIT);
          const batch = adminDb.batch();

          chunk.forEach((record: LooseRecord) => {
            if (
              hasWebhookTestMarker(
                record?.Client_ID2,
                record?.client_ID2,
                record?.Note_ID,
                record?.User_ID,
                record?.RCFE_Registered_ID,
                record?.PK_ID,
                record?.Record_ID
              )
            ) {
              skippedTestMarkers += 1;
              return;
            }

            const docId = toSafeSuffix(config.toDocId(record));
            if (!docId) {
              skippedMissingId += 1;
              return;
            }

            const docRef = adminDb.collection(config.collection).doc(docId);
            const extra = config.toWriteData ? config.toWriteData(record) : {};
            batch.set(
              docRef,
              {
                ...record,
                ...extra,
                deletedFromCaspio: false,
                caspioBackfillAt: nowIso,
                caspioBackfillSourceTable: tableName,
                caspioBackfillDocId: docId,
                updatedAt: nowIso,
              },
              { merge: true }
            );
            upserted += 1;
          });

          await batch.commit();
        }

        if (pageRows.length < PAGE_SIZE) break;
      }

      selectedTable = tableName;
      break;
    } catch (error) {
      if (isTableNotFoundError(error)) {
        tableMissingWarning = `Table not found in Caspio: ${tableName}`;
        continue;
      }
      throw error;
    }
  }

  if (!selectedTable) {
    return {
      key: config.key,
      table: config.table,
      collection: config.collection,
      fetched: 0,
      upserted: 0,
      skippedMissingId: 0,
      skippedTestMarkers: 0,
      pages: 0,
      warning:
        tableMissingWarning ||
        `Skipped. None of these tables were found: ${candidateTables.join(', ')}`,
    } satisfies BackfillResult;
  }

  const result: BackfillResult = {
    key: config.key,
    table: selectedTable,
    collection: config.collection,
    fetched,
    upserted,
    skippedMissingId,
    skippedTestMarkers,
    pages,
    ...(selectedTable !== config.table
      ? { warning: `Using alias table "${selectedTable}" (configured default: "${config.table}")` }
      : {}),
  };
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: false });
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json().catch(() => ({}))) as {
      includeMembers?: boolean;
      runMembersOnly?: boolean;
      tableKeys?: string[];
    };
    const runMembersOnly = body?.runMembersOnly === true;
    const includeMembers = body?.includeMembers !== false;
    const nowIso = new Date().toISOString();
    const results: BackfillResult[] = [];
    const token = readBearerToken(request);

    if (runMembersOnly || (includeMembers && (!Array.isArray(body?.tableKeys) || body.tableKeys.length === 0))) {
      const memberSyncUrl = new URL('/api/caspio/members-cache/sync', request.nextUrl.origin).toString();
      const memberRes = await fetch(memberSyncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: token,
          mode: 'full',
        }),
        cache: 'no-store',
      });
      const memberPayload = await memberRes.json().catch(() => ({}));
      if (!memberRes.ok || !memberPayload?.success) {
        throw new Error(memberPayload?.error || 'Members full sync failed before backfill');
      }
      results.push({
        key: 'members',
        table: 'CalAIM_tbl_Members',
        collection: 'caspio_members_cache',
        fetched: Number(memberPayload?.fetched || 0),
        upserted: Number(memberPayload?.upserted || 0),
        skippedMissingId: Number(memberPayload?.skippedMissingId || 0),
        skippedTestMarkers: 0,
        pages: 0,
      });
    }

    if (runMembersOnly) {
      const totals = results.reduce(
        (acc, row) => {
          acc.fetched += row.fetched;
          acc.upserted += row.upserted;
          acc.skippedMissingId += row.skippedMissingId;
          acc.skippedTestMarkers += row.skippedTestMarkers;
          return acc;
        },
        { fetched: 0, upserted: 0, skippedMissingId: 0, skippedTestMarkers: 0 }
      );
      return NextResponse.json({
        success: true,
        startedAt: nowIso,
        results,
        totals,
      });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const allTables: TableConfig[] = [
      {
        key: 'h2022Claims',
        table: 'CalAIM_Claim_Submit_RCFE_H2022',
        collection: 'h2022_claim_checker_claims',
        toDocId: (record) => `claim_${toSafeSuffix(claimIdCandidate(record))}`,
      },
      {
        key: 't2038Claims',
        table: 'CalAIM_Claim_Submit_T2038',
        collection: 't2038_claims_cache',
        toDocId: (record) => `t2038_claim_${toSafeSuffix(claimIdCandidate(record))}`,
      },
      {
        key: 'usersRegistration',
        table: 'connect_tbl_userregistration',
        collection: 'caspio_usersregistration_cache',
        toDocId: (record) =>
          `userreg_${toSafeSuffix(record?.User_ID || record?.Table_ID || record?.table_ID || record?.Email || '')}`,
        toWriteData: (record) => {
          const safeRecord = { ...record };
          delete safeRecord.Password;
          delete safeRecord.Show_Password;
          return safeRecord;
        },
      },
      {
        key: 'rcfeRegistration',
        table: 'CalAIM_tbl_New_RCFE_Registration',
        collection: 'caspio_rcfe_registration_cache',
        toDocId: (record) =>
          `rcfe_${toSafeSuffix(
            record?.RCFE_Registered_ID || record?.CalAIM__RCFE_Connect_Home_ID || record?.table_ID || record?.Table_ID || ''
          )}`,
      },
      {
        key: 'memberNotes',
        table: 'CalAIM_Member_Notes_ILS',
        collection: 'caspio_notes',
        toDocId: (record) => `caspio_member_note_${toSafeSuffix(record?.Note_ID || `${record?.Client_ID2 || ''}_${record?.Note_Date || ''}`)}`,
        toWriteData: () => ({ tableType: 'calaim_members', isRead: false, notificationsSent: [] }),
        optional: true,
      },
      {
        key: 'clientNotes',
        table: 'connect_tbl_clientnotes',
        collection: 'caspio_notes',
        toDocId: (record) => `caspio_client_note_${toSafeSuffix(record?.Note_ID || `${record?.Client_ID2 || record?.Client_ID || ''}_${record?.Note_Date || ''}`)}`,
        toWriteData: () => ({ tableType: 'client_notes', isRead: false, notificationsSent: [] }),
        optional: true,
      },
    ];

    const requestedKeys = Array.isArray(body?.tableKeys) ? body.tableKeys.map((k) => String(k || '').trim()).filter(Boolean) : [];
    const unknownKeys = requestedKeys.filter((key) => !allTables.some((table) => table.key === key));
    if (unknownKeys.length > 0) {
      throw new Error(`Unknown backfill table key(s): ${unknownKeys.join(', ')}`);
    }

    const tables = requestedKeys.length > 0 ? allTables.filter((table) => requestedKeys.includes(table.key)) : allTables;

    for (const config of tables) {
      const result = await backfillTable({
        adminDb: auth.adminDb as AdminDbLike,
        credentialsBaseUrl: credentials.baseUrl,
        accessToken,
        config,
        nowIso,
      });
      if (result.warning && !config.optional && result.fetched === 0 && result.upserted === 0) {
        throw new Error(result.warning);
      }
      results.push(result);
    }

    const totals = results.reduce(
      (acc, row) => {
        acc.fetched += row.fetched;
        acc.upserted += row.upserted;
        acc.skippedMissingId += row.skippedMissingId;
        acc.skippedTestMarkers += row.skippedTestMarkers;
        return acc;
      },
      { fetched: 0, upserted: 0, skippedMissingId: 0, skippedTestMarkers: 0 }
    );

    return NextResponse.json({
      success: true,
      startedAt: nowIso,
      results,
      totals,
    });
  } catch (error: unknown) {
    console.error('❌ Caspio backfill-all failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Backfill failed',
      },
      { status: 500 }
    );
  }
}

