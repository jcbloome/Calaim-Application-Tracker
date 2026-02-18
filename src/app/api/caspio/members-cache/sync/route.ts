import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken, transformCaspioMember } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SyncMode = 'incremental' | 'full';

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const CACHE_COLLECTION = 'caspio_members_cache';
const SETTINGS_COLLECTION = 'admin-settings';
const SETTINGS_DOC_ID = 'caspio-members-sync';
const UPDATED_FIELD = 'Date_Modified';

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
  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);
  if (!adminRole.exists && !superAdminRole.exists) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, uid, adminDb };
}

async function fetchUpdatedMembersFromCaspio(params: {
  accessToken: string;
  baseUrl: string;
  since: Date | null;
}) {
  const { accessToken, baseUrl, since } = params;

  const select = MEMBERS_SELECT_FIELDS.join(',');
  const where = since ? `${UPDATED_FIELD}>'${toCaspioComparableDate(since)}'` : null;

  const results: any[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const sp = new URLSearchParams();
    if (where) sp.set('q.where', where);
    sp.set('q.pageSize', String(PAGE_SIZE));
    sp.set('q.pageNumber', String(pageNumber));
    sp.set('q.select', select);

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
      throw new Error(`Caspio fetch failed (${res.status}): ${text || res.statusText}`);
    }

    const data = (await res.json().catch(() => ({}))) as any;
    const page = Array.isArray(data?.Result) ? data.Result : [];
    results.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
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

    // If we've never synced, treat "incremental" as full.
    const effectiveMode: SyncMode = mode === 'incremental' && !since ? 'full' : mode;

    let rawMembers: any[] = [];
    if (effectiveMode === 'full') {
      const full = await fetchUpdatedMembersFromCaspio({
        accessToken,
        baseUrl: credentials.baseUrl,
        since: null,
      });
      rawMembers = full;
    } else {
      rawMembers = await fetchUpdatedMembersFromCaspio({
        accessToken,
        baseUrl: credentials.baseUrl,
        since,
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

        const modifiedRaw = raw?.Date_Modified || raw?.date_modified || raw?.last_updated;
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

