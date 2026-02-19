import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken, transformCaspioMember } from '@/lib/caspio-api-utils';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SyncMode = 'incremental' | 'full';

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const CACHE_COLLECTION = 'caspio_members_cache';
const SETTINGS_COLLECTION = 'admin-settings';
const SETTINGS_DOC_ID = 'caspio-members-sync';
const UPDATED_FIELD = 'Date_Modified';
const TABLE_FIELDS_SETTINGS_DOC_ID = 'caspio-table-fields';

const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // safety cap

const MEMBERS_SELECT_FIELDS: string[] = [
  'Client_ID2',
  'Senior_First',
  'Senior_Last',
  'Senior_Last_First_ID',
  'Member_County',
  'MemberCity',
  'CalAIM_MCO',
  'CalAIM_Status',
  'Kaiser_Status',
  'Kaiser_ID_Status',
  'Kaiser_User_Assignment',
  'Kaiser_Next_Step_Date',
  'T2038_Auth_Email_Kaiser',
  'Social_Worker_Assigned',
  'Hold_For_Social_Worker',
  'SW_ID',
  'RCFE_Registered_ID',
  'RCFE_Name',
  'RCFE_Address',
  'RCFE_City',
  'RCFE_State',
  'RCFE_Zip',
  'RCFE_County',
  'Pathway',
  'Next_Step_Due_Date',
  'workflow_step',
  'workflow_notes',
  'Birth_Date',
  'Member_Phone',
  'Member_Email',
  'MCP_CIN',
  'MediCal_Number',
  'Date_Modified',
  'Date_Created',
  'Kaiser_T2038_Requested_Date',
  'Kaiser_T2038_Received_Date',
  'Kaiser_Tier_Level_Requested_Date',
  'Kaiser_Tier_Level_Received_Date',
  'ILS_RCFE_Sent_For_Contract_Date',
  'ILS_RCFE_Received_Contract_Date',
];

function toCaspioComparableDate(value: Date): string {
  // Caspio comparisons are most reliable when we send a stable ISO-like string.
  // Avoid milliseconds and timezone suffix.
  return value.toISOString().slice(0, 19);
}

async function getCachedCaspioTableFields(params: { adminDb: any; tableName: string }): Promise<string[]> {
  const { adminDb, tableName } = params;
  try {
    const snap = await adminDb.collection(SETTINGS_COLLECTION).doc(TABLE_FIELDS_SETTINGS_DOC_ID).get();
    const data = snap.exists ? (snap.data() as any) : null;
    const tableData = (data?.tables && (data.tables as Record<string, any>)[tableName]) || null;
    const fields = Array.isArray(tableData?.fields) ? tableData.fields : [];
    return fields
      .filter((f: any) => typeof f === 'string' && f.trim().length > 0)
      .map((f: string) => f.trim());
  } catch {
    return [];
  }
}

async function fetchCaspioTableFields(params: {
  accessToken: string;
  baseUrl: string;
  tableName: string;
}): Promise<string[]> {
  const { accessToken, baseUrl, tableName } = params;
  const restBaseUrl = baseUrl.replace(/\/$/, '').endsWith('/rest/v2')
    ? baseUrl.replace(/\/$/, '')
    : `${baseUrl.replace(/\/$/, '')}/rest/v2`;

  const encodedTableName = encodeURIComponent(tableName);

  // Try schema endpoint first (often includes fields inline).
  const schemaUrl = `${restBaseUrl}/tables/${encodedTableName}`;
  const schemaResponse = await fetch(schemaUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (schemaResponse.ok) {
    const schemaData = (await schemaResponse.json().catch(() => ({}))) as any;
    const inlineFields = Array.isArray(schemaData?.Result?.Fields)
      ? schemaData.Result.Fields.map((f: any) => f?.Name).filter(Boolean)
      : [];
    if (inlineFields.length > 0) {
      return inlineFields.map((n: any) => String(n).trim()).filter((n: string) => n.length > 0);
    }
  }

  // Fallback to /fields or /columns endpoints.
  for (const endpoint of ['fields', 'columns'] as const) {
    const url = `${restBaseUrl}/tables/${encodedTableName}/${endpoint}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) continue;
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    const names = rows.map((r: any) => r?.Name).filter(Boolean);
    if (names.length > 0) {
      return names.map((n: any) => String(n).trim()).filter((n: string) => n.length > 0);
    }
  }

  return [];
}

async function writeCachedCaspioTableFields(params: { adminDb: any; tableName: string; fields: string[] }) {
  const { adminDb, tableName, fields } = params;
  try {
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    await adminDb
      .collection(SETTINGS_COLLECTION)
      .doc(TABLE_FIELDS_SETTINGS_DOC_ID)
      .set(
        {
          tables: {
            [tableName]: {
              fields,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
  } catch {
    // best-effort only
  }
}

function normalizeRawMember(raw: any) {
  const clientId2 = String(raw?.Client_ID2 || raw?.client_ID2 || raw?.clientId2 || '').trim();
  const normalized = {
    ...raw,
    client_ID2: raw?.client_ID2 ?? raw?.Client_ID2 ?? raw?.clientId2 ?? clientId2,
  };
  return { clientId2, normalized };
}

async function requireAdmin(idToken: string) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = decoded.uid;
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  // Fast-path: trust custom claims set by `/api/auth/admin-session`
  // (avoids relying on Firestore role reads for admin gating).
  const hasAdminClaim = Boolean((decoded as any)?.admin);
  const hasSuperAdminClaim = Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || hasSuperAdminClaim) {
    return { ok: true as const, uid, adminDb };
  }

  // Email allow-list always wins.
  if (isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, adminDb };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);

  let isAdmin = adminRole.exists || superAdminRole.exists;

  // Backward-compat: some roles were stored by email instead of UID.
  if (!isAdmin && email) {
    const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(email).get(),
      adminDb.collection('roles_super_admin').doc(email).get(),
    ]);
    isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
  }

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, uid, adminDb };
}

async function fetchUpdatedMembersFromCaspio(params: {
  accessToken: string;
  baseUrl: string;
  since: Date | null;
  updatedField: string | null;
  selectFields: string[] | null;
}) {
  const { accessToken, baseUrl, since, updatedField, selectFields } = params;

  const select = Array.isArray(selectFields) && selectFields.length > 0 ? selectFields.join(',') : null;
  const where = since && updatedField ? `${updatedField}>'${toCaspioComparableDate(since)}'` : null;

  const results: any[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const attempt = async (opts: { includeWhere: boolean; includeSelect: boolean }) => {
      const sp = new URLSearchParams();
      if (opts.includeWhere && where) sp.set('q.where', where);
      sp.set('q.pageSize', String(PAGE_SIZE));
      sp.set('q.pageNumber', String(pageNumber));
      if (opts.includeSelect && select) sp.set('q.select', select);

      const url = `${baseUrl}/rest/v2/tables/${MEMBERS_TABLE}/records?${sp.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false as const, status: res.status, statusText: res.statusText, text, url };
      }

      const data = (await res.json().catch(() => ({}))) as any;
      const page = Array.isArray(data?.Result) ? data.Result : [];
      return { ok: true as const, page, url };
    };

    // Prefer strict query; fall back if Caspio reports invalid columns.
    let res = await attempt({ includeWhere: true, includeSelect: true });
    if (!res.ok) {
      const textLower = String(res.text || '').toLowerCase();
      const invalidColumn = textLower.includes('invalid column name');
      if (invalidColumn && select) {
        res = await attempt({ includeWhere: true, includeSelect: false });
      }
      if (!res.ok && invalidColumn && where) {
        res = await attempt({ includeWhere: false, includeSelect: false });
      }
    }

    if (!res.ok) {
      throw new Error(
        `Caspio fetch failed (${res.status}): ${res.text || res.statusText}\nResource: "${res.url}"`
      );
    }

    results.push(...res.page);
    if (res.page.length < PAGE_SIZE) break;
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken || '').trim();
    const mode = (String(body?.mode || 'incremental') as SyncMode) || 'incremental';

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdmin(idToken);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid } = adminCheck;
    const settingsRef = adminDb.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);
    const settingsSnap = await settingsRef.get();
    const settings = (settingsSnap.exists ? (settingsSnap.data() as any) : {}) as any;

    const now = new Date();
    const lastSyncAtRaw = settings?.lastSyncAt ? new Date(String(settings.lastSyncAt)) : null;
    const since = mode === 'incremental' ? lastSyncAtRaw : null;

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    // Determine which columns exist in Caspio so we don't request invalid ones.
    let availableFields = await getCachedCaspioTableFields({ adminDb, tableName: MEMBERS_TABLE });
    if (availableFields.length === 0) {
      try {
        availableFields = await fetchCaspioTableFields({
          accessToken,
          baseUrl: credentials.baseUrl,
          tableName: MEMBERS_TABLE,
        });
        if (availableFields.length > 0) {
          await writeCachedCaspioTableFields({ adminDb, tableName: MEMBERS_TABLE, fields: availableFields });
        }
      } catch {
        availableFields = [];
      }
    }

    const availableLower = new Set(availableFields.map((f) => String(f).trim().toLowerCase()));
    const selectFields =
      availableLower.size > 0
        ? MEMBERS_SELECT_FIELDS.filter((f) => availableLower.has(String(f).trim().toLowerCase()))
        : null;
    const updatedField =
      availableLower.size > 0 && availableLower.has(UPDATED_FIELD.toLowerCase()) ? UPDATED_FIELD : null;

    // If we've never synced, treat "incremental" as full.
    const effectiveMode: SyncMode = mode === 'incremental' && !since ? 'full' : mode;

    let rawMembers: any[] = [];
    if (effectiveMode === 'full') {
      const full = await fetchUpdatedMembersFromCaspio({
        accessToken,
        baseUrl: credentials.baseUrl,
        since: null,
        updatedField,
        selectFields,
      });
      rawMembers = full;
    } else {
      rawMembers = await fetchUpdatedMembersFromCaspio({
        accessToken,
        baseUrl: credentials.baseUrl,
        // If we can't filter by modified time (column missing), fall back to full pull.
        since: updatedField ? since : null,
        updatedField,
        selectFields,
      });
    }

    let upserted = 0;
    let skippedMissingId = 0;
    let maxModified: Date | null = since ? new Date(since) : null;

    const chunkSize = 400; // keep under Firestore batch limits safely
    for (let i = 0; i < rawMembers.length; i += chunkSize) {
      const slice = rawMembers.slice(i, i + chunkSize);
      const batch = adminDb.batch();

      slice.forEach((raw) => {
        const { clientId2, normalized } = normalizeRawMember(raw);
        if (!clientId2) {
          skippedMissingId += 1;
          return;
        }

        const transformed = transformCaspioMember(normalized as any);
        const calaimStatusRaw = String((normalized as any)?.CalAIM_Status ?? (normalized as any)?.calaim_status ?? '').trim();
        const calaimStatus =
          calaimStatusRaw && calaimStatusRaw.toLowerCase() === 'authorized'
            ? 'Authorized'
            : calaimStatusRaw || (normalized as any)?.CalAIM_Status;
        const mcoRaw = String((normalized as any)?.CalAIM_MCO ?? (normalized as any)?.calAIM_MCO ?? '').trim();
        const calaimMco = mcoRaw || (normalized as any)?.CalAIM_MCO;

        const modifiedRaw =
          (updatedField ? (raw as any)?.[updatedField] : undefined) ||
          raw?.Date_Modified ||
          raw?.date_modified ||
          raw?.last_updated;
        const modifiedDate = modifiedRaw ? new Date(String(modifiedRaw)) : null;
        if (modifiedDate && !Number.isNaN(modifiedDate.getTime())) {
          if (!maxModified || modifiedDate.getTime() > maxModified.getTime()) {
            maxModified = modifiedDate;
          }
        }

        const docRef = adminDb.collection(CACHE_COLLECTION).doc(clientId2);
        batch.set(
          docRef,
          {
            ...normalized,
            ...transformed,
            Client_ID2: clientId2,
            CalAIM_Status: calaimStatus,
            CalAIM_MCO: calaimMco,
            cachedAt: now.toISOString(),
          },
          { merge: true }
        );
        upserted += 1;
      });

      await batch.commit();
    }

    const nextSyncAt = maxModified ? maxModified.toISOString() : now.toISOString();
    await settingsRef.set(
      {
        lastSyncAt: nextSyncAt,
        lastRunAt: now.toISOString(),
        lastMode: effectiveMode,
        lastRunByUid: uid,
        lastRunSummary: {
          fetched: rawMembers.length,
          upserted,
          skippedMissingId,
        },
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      mode: effectiveMode,
      since: since ? since.toISOString() : null,
      lastSyncAt: nextSyncAt,
      fetched: rawMembers.length,
      upserted,
      skippedMissingId,
    });
  } catch (error: any) {
    console.error('❌ Error syncing Caspio members cache:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync members cache' },
      { status: 500 }
    );
  }
}

