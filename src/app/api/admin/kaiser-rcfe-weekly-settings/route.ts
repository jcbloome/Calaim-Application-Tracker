import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeRcfeName = (value: unknown) => String(value || '').trim();
const toKey = (rcfeName: unknown, rcfeAdminEmail: unknown) =>
  `${normalizeRcfeName(rcfeName).toLowerCase()}|${normalizeEmail(rcfeAdminEmail)}`;

async function requireAdmin(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  if (Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(email)) {
    return { ok: true as const, uid, email };
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
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const idToken = String(body?.idToken || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const authz = await requireAdmin(idToken);
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const settingsRef = adminDb.collection('system_settings').doc('kaiser_rcfe_weekly_confirm');
    const snap = await settingsRef.get();
    const entries = (snap.exists ? (snap.data()?.entries as Record<string, any>) : {}) || {};

    if (action === 'get') {
      return NextResponse.json({ success: true, entries });
    }

    if (action === 'set') {
      const rcfeName = normalizeRcfeName(body?.rcfeName);
      const rcfeAdminEmail = normalizeEmail(body?.rcfeAdminEmail);
      const enabled = Boolean(body?.enabled);
      if (!rcfeName || !rcfeAdminEmail) {
        return NextResponse.json({ success: false, error: 'rcfeName and rcfeAdminEmail are required' }, { status: 400 });
      }
      const key = toKey(rcfeName, rcfeAdminEmail);
      const next = {
        ...entries,
        [key]: {
          key,
          rcfeName,
          rcfeAdminEmail,
          enabled,
          updatedAt: new Date().toISOString(),
          updatedByEmail: authz.email || '',
        },
      };
      await settingsRef.set({ entries: next }, { merge: true });
      return NextResponse.json({ success: true, entries: next });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to manage RCFE weekly settings' }, { status: 500 });
  }
}
