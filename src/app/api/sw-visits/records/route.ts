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

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

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

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };

  return { ok: true as const, adminDb };
}

const clampDays = (value: string | null, fallback = 30) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 365);
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const days = clampDays(searchParams.get('days'), 30);

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminCheck.adminDb;

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);
    const toMillis = (value: any): number => {
      if (!value) return 0;
      if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
      if (typeof value?.seconds === 'number' && Number.isFinite(value.seconds)) return Math.floor(Number(value.seconds) * 1000);
      const d = new Date(String(value));
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const primarySnap = await adminDb
      .collection('sw_visit_records')
      .where('submittedAtTs', '>=', cutoffTs)
      .orderBy('submittedAtTs', 'desc')
      .limit(1000)
      .get();

    // Backfill-safe: older records created through draft/sign-off may not have submittedAtTs.
    // Pull recent updated rows as a fallback and merge by id.
    const fallbackSnap = await adminDb
      .collection('sw_visit_records')
      .where('updatedAt', '>=', cutoffTs)
      .orderBy('updatedAt', 'desc')
      .limit(1000)
      .get();

    const byId = new Map<string, any>();
    primarySnap.docs.forEach((doc) => {
      byId.set(doc.id, { id: doc.id, ...doc.data() });
    });

    fallbackSnap.docs.forEach((doc) => {
      if (byId.has(doc.id)) return;
      const data = doc.data() as any;
      const status = String(data?.status || '').trim().toLowerCase();
      if (status === 'draft') return;
      byId.set(doc.id, { id: doc.id, ...data });
    });

    const cutoffMs = cutoffDate.getTime();
    const visits = Array.from(byId.values())
      .filter((visit) => {
        const submittedMs = toMillis((visit as any)?.submittedAtTs);
        const updatedMs = toMillis((visit as any)?.updatedAt);
        const createdMs = toMillis((visit as any)?.createdAt);
        return Math.max(submittedMs, updatedMs, createdMs) >= cutoffMs;
      })
      .sort((a, b) => {
        const aMs = Math.max(
          toMillis((a as any)?.submittedAtTs),
          toMillis((a as any)?.updatedAt),
          toMillis((a as any)?.createdAt)
        );
        const bMs = Math.max(
          toMillis((b as any)?.submittedAtTs),
          toMillis((b as any)?.updatedAt),
          toMillis((b as any)?.createdAt)
        );
        return bMs - aMs;
      })
      .slice(0, 1000);

    return NextResponse.json({ success: true, visits, days });
  } catch (error: any) {
    console.error('❌ Error fetching SW visit records:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch visit records' },
      { status: 500 }
    );
  }
}

