import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      idToken?: string;
      targetUid?: string;
      suspended?: boolean;
      reason?: string;
    };
    const idToken = clean(body?.idToken, 12000);
    const targetUid = clean(body?.targetUid, 160);
    const suspended = Boolean(body?.suspended);
    const reason = clean(body?.reason, 500) || (suspended ? 'Suspended from Staff Management' : 'Access restored from Staff Management');
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!targetUid) return NextResponse.json({ success: false, error: 'Missing targetUid' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const actorUid = clean(decoded?.uid, 160);
    const actorEmail = clean((decoded as any)?.email, 220).toLowerCase();
    if (!actorUid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    let isSuperAdmin = Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(actorEmail);
    if (!isSuperAdmin) {
      const [superByUid, superByEmail] = await Promise.all([
        adminDb.collection('roles_super_admin').doc(actorUid).get(),
        actorEmail ? adminDb.collection('roles_super_admin').doc(actorEmail).get() : Promise.resolve(null),
      ]);
      isSuperAdmin = Boolean(superByUid.exists || (superByEmail as any)?.exists);
    }
    if (!isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Super Admin required to suspend access.' }, { status: 403 });
    }
    if (targetUid === actorUid) {
      return NextResponse.json({ success: false, error: 'You cannot suspend your own access.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    await adminDb.collection('users').doc(targetUid).set(
      {
        accessSuspended: suspended,
        accessSuspendedAt: suspended ? admin.firestore.FieldValue.serverTimestamp() : null,
        accessSuspendedAtIso: suspended ? nowIso : null,
        accessSuspendedByUid: suspended ? actorUid : null,
        accessSuspendedByEmail: suspended ? actorEmail || null : null,
        accessSuspendedReason: suspended ? reason : null,
        accessRestoredAt: suspended ? null : admin.firestore.FieldValue.serverTimestamp(),
        accessRestoredAtIso: suspended ? null : nowIso,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let authUpdated = false;
    let authError: string | null = null;
    try {
      await adminAuth.updateUser(targetUid, { disabled: suspended });
      authUpdated = true;
    } catch (e: any) {
      authError = clean(e?.message || 'Could not update Firebase Auth disabled flag', 300);
    }

    return NextResponse.json({
      success: true,
      targetUid,
      suspended,
      authUpdated,
      authError,
      message: suspended
        ? authUpdated
          ? 'Access suspended (portal + Auth login disabled).'
          : `Access flagged suspended, but Auth disable failed: ${authError || 'unknown'}`
        : authUpdated
          ? 'Access restored (portal + Auth login enabled).'
          : `Access flag cleared, but Auth enable failed: ${authError || 'unknown'}`,
    });
  } catch (e: any) {
    console.error('[api/admin/staff/suspend-access]', e);
    return NextResponse.json(
      { success: false, error: clean(e?.message || 'Failed to update suspend access', 400) },
      { status: 500 }
    );
  }
}
