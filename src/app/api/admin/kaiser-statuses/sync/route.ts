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

  return { ok: true as const, adminDb, uid, email };
}

function toNumber(value: any): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid, email } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const encodedTable = encodeURIComponent('CalAIM_Kaiser_Status');

    const url = `${credentials.baseUrl}/rest/v2/tables/${encodedTable}/records?q.select=${encodeURIComponent(
      'Kaiser_ID_Status,Status,Sort_Order'
    )}&q.pageSize=1000&q.pageNumber=1`;

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: `Caspio status fetch failed (${res.status}) ${text}` },
        { status: 502 }
      );
    }

    const data = (await res.json().catch(() => ({}))) as any;
    const resultRows = Array.isArray(data?.Result) ? data.Result : [];

    const rows = resultRows
      .map((row: any) => {
        const id = toNumber(row?.Kaiser_ID_Status);
        const status = String(row?.Status || '').trim();
        const sortOrder = toNumber(row?.Sort_Order);
        if (id == null || !status || sortOrder == null) return null;
        return { id: Number(id), status, sortOrder: Number(sortOrder) };
      })
      .filter(Boolean) as Array<{ id: number; status: string; sortOrder: number }>;

    rows.sort((a, b) => a.sortOrder - b.sortOrder);

    await adminDb
      .collection('admin-settings')
      .doc('kaiser-statuses')
      .set(
        {
          rows,
          source: 'caspio',
          count: rows.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedByUid: uid,
          updatedByEmail: email,
        },
        { merge: true }
      );

    return NextResponse.json(
      { success: true, rows, count: rows.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error syncing Kaiser statuses:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync Kaiser statuses' },
      { status: 500 }
    );
  }
}

