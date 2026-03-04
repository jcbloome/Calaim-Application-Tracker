import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

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

    const { adminDb } = adminCheck;
    const snap = await adminDb.collection('admin-settings').doc('kaiser-statuses').get();
    const data = snap.exists ? (snap.data() as any) : null;
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    const updatedAtRaw = data?.updatedAt;
    const updatedAtIso =
      updatedAtRaw && typeof updatedAtRaw?.toDate === 'function'
        ? updatedAtRaw.toDate().toISOString()
        : typeof updatedAtRaw === 'string'
          ? updatedAtRaw
          : null;

    return NextResponse.json(
      {
        success: true,
        rows,
        updatedAt: updatedAtIso,
        updatedByEmail: data?.updatedByEmail || null,
        source: data?.source || (rows.length > 0 ? 'firestore' : 'none'),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error listing Kaiser statuses:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list Kaiser statuses' },
      { status: 500 }
    );
  }
}

