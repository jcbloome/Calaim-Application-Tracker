import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();

  if (!uid) {
    return { ok: false as const, status: 401, error: 'Invalid token' };
  }

  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isAdmin = true;

  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    if (!isAdmin && email) {
      const [adminRoleByEmail, superAdminRoleByEmail] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = adminRoleByEmail.exists || superAdminRoleByEmail.exists;
    }
  }

  if (!isAdmin) {
    return { ok: false as const, status: 403, error: 'Admin privileges required' };
  }

  return { ok: true as const, adminDb };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    const applicationId = String(body?.applicationId || '').trim();
    const appUserId = String(body?.appUserId || '').trim();
    const source = String(body?.source || '').trim().toLowerCase();
    const clientId2 = String(body?.clientId2 || '').trim();
    const healthPlan = String(body?.healthPlan || '').trim().toLowerCase();

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }
    if (!applicationId || !clientId2) {
      return NextResponse.json(
        { success: false, error: 'applicationId and clientId2 are required' },
        { status: 400 }
      );
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const table = encodeURIComponent('CalAIM_tbl_Members');
    const select = encodeURIComponent('client_ID2,CalAIM_MCO,Kaiser_Status,Health_Net_Process_Status');
    const where = encodeURIComponent(`client_ID2='${clientId2.replace(/'/g, "''")}'`);
    const url = `${credentials.baseUrl}/rest/v2/tables/${table}/records?q.select=${select}&q.where=${where}&q.limit=1`;

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
      return NextResponse.json(
        { success: false, error: `Caspio fetch failed (${res.status}) ${text}` },
        { status: 502 }
      );
    }

    const data = (await res.json().catch(() => ({}))) as any;
    const row = Array.isArray(data?.Result) ? data.Result[0] : null;
    if (!row) {
      return NextResponse.json(
        { success: false, error: `No Caspio member found for client_ID2 ${clientId2}` },
        { status: 404 }
      );
    }

    const kaiserStatus = String(row?.Kaiser_Status || '').trim();
    const healthNetStatus = String(row?.Health_Net_Process_Status || '').trim();

    const updateData: Record<string, any> = {
      Kaiser_Status: kaiserStatus || null,
      Health_Net_Process_Status: healthNetStatus || null,
      healthNetStatus: healthNetStatus || null,
      processStatusSyncedAt: new Date().toISOString(),
    };
    if (healthPlan.includes('kaiser') && kaiserStatus) {
      updateData.kaiserStatus = kaiserStatus;
    }
    if (healthPlan.includes('health net') && healthNetStatus) {
      updateData.healthNetStatus = healthNetStatus;
    }

    const { adminDb } = adminCheck;
    const candidatePaths = [
      source === 'admin' ? `applications/${applicationId}` : '',
      appUserId ? `users/${appUserId}/applications/${applicationId}` : '',
      `applications/${applicationId}`,
    ].filter(Boolean);

    let updatedPath = '';
    for (const path of candidatePaths) {
      const ref = adminDb.doc(path);
      const snap = await ref.get();
      if (!snap.exists) continue;
      await ref.set(updateData, { merge: true });
      updatedPath = path;
      break;
    }

    return NextResponse.json({
      success: true,
      clientId2,
      healthPlan: row?.CalAIM_MCO || '',
      kaiserStatus,
      healthNetStatus,
      processStatus: healthPlan.includes('health net') ? healthNetStatus : kaiserStatus,
      updatedPath: updatedPath || null,
    });
  } catch (error: any) {
    console.error('❌ Error syncing process status:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync process status' },
      { status: 500 }
    );
  }
}

