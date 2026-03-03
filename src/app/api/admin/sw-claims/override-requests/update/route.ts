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
  const name = String((decoded as any)?.name || '').trim();

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

  return { ok: true as const, adminDb, uid, email, name };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const requestId = String(body?.requestId || '').trim();
    const status = String(body?.status || '').trim().toLowerCase();
    const adminNote = String(body?.adminNote || '').trim();
    const result = body?.result && typeof body.result === 'object' ? body.result : null;

    if (!requestId) return NextResponse.json({ success: false, error: 'requestId is required' }, { status: 400 });
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    if ((status === 'approved' || status === 'rejected') && !adminNote && !result) {
      return NextResponse.json({ success: false, error: 'adminNote is required for approved/rejected decisions' }, { status: 400 });
    }

    const adminCheck = await requireAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { adminDb, uid: actorUid, email: actorEmail, name: actorName } = adminCheck;
    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;

    const ref = adminDb.collection('sw_claim_override_requests').doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const nowIso = new Date().toISOString();
    const actorLabel = String(actorName || actorEmail || 'Admin').trim() || 'Admin';

    await ref.set(
      {
        status,
        adminNote: adminNote || null,
        decidedAtIso: nowIso,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
        decidedBy: actorLabel,
        decidedByUid: actorUid,
        decidedByEmail: actorEmail,
        ...(result ? { result } : {}),
        updatedAtIso: nowIso,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, requestId, status });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update request' }, { status: 500 });
  }
}

