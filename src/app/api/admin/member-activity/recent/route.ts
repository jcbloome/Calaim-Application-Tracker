import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const hasAdminClaim = Boolean((decoded as any)?.admin);
  const hasSuperAdminClaim = Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || hasSuperAdminClaim) {
    return { ok: true as const, uid, email, adminDb };
  }

  if (isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, email, adminDb };
  }

  const [adminRole, superAdminRole] = await Promise.all([
    adminDb.collection('roles_admin').doc(uid).get(),
    adminDb.collection('roles_super_admin').doc(uid).get(),
  ]);

  let isAdmin = adminRole.exists || superAdminRole.exists;
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

  return { ok: true as const, uid, email, adminDb };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken || '').trim();
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 200;

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdmin(idToken);
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb } = adminCheck;

    // Prefer createdAt ordering; fall back to timestamp ordering if needed.
    let snap;
    try {
      snap = await adminDb.collection('member_activities').orderBy('createdAt', 'desc').limit(limit).get();
    } catch {
      snap = await adminDb.collection('member_activities').orderBy('timestamp', 'desc').limit(limit).get();
    }

    const activities = snap.docs.map((d: any) => {
      const data = d.data() || {};
      const createdAtIso =
        data?.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null;
      return {
        id: d.id,
        ...data,
        createdAt: createdAtIso,
        timestamp: data?.timestamp || createdAtIso || null,
      };
    });

    return NextResponse.json({ success: true, activities });
  } catch (error: any) {
    console.error('❌ Error fetching member activities:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

