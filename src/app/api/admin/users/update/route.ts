import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireSuperAdmin(params: { idToken: string }) {
  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;

  const decoded = await adminAuth.verifyIdToken(params.idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = String((decoded as any)?.email || '').trim().toLowerCase();
  const name = String((decoded as any)?.name || '').trim();

  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isSuperAdmin = Boolean((decoded as any)?.superAdmin);
  if (isHardcodedAdminEmail(email)) isSuperAdmin = true;

  if (!isSuperAdmin) {
    const superAdminDoc = await adminDb.collection('roles_super_admin').doc(uid).get();
    isSuperAdmin = superAdminDoc.exists;
    if (!isSuperAdmin && email) {
      const superAdminByEmailDoc = await adminDb.collection('roles_super_admin').doc(email).get();
      isSuperAdmin = superAdminByEmailDoc.exists;
    }
  }

  if (!isSuperAdmin) return { ok: false as const, status: 403, error: 'Super Admin privileges required' };

  return { ok: true as const, adminAuth, adminDb, actorUid: uid, actorEmail: email, actorName: name };
}

type Mode = 'disable' | 'enable' | 'delete';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const targetUid = String(body?.uid || '').trim();
    const mode = String(body?.mode || '').trim() as Mode;
    const reason = String(body?.reason || '').trim();

    if (!targetUid) return NextResponse.json({ success: false, error: 'uid is required' }, { status: 400 });
    if (!mode || !(['disable', 'enable', 'delete'] as Mode[]).includes(mode)) {
      return NextResponse.json({ success: false, error: 'mode must be disable|enable|delete' }, { status: 400 });
    }
    if ((mode === 'disable' || mode === 'delete') && !reason) {
      return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });
    }

    const adminCheck = await requireSuperAdmin({ idToken });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    if (adminCheck.actorUid && targetUid === adminCheck.actorUid && mode === 'delete') {
      return NextResponse.json({ success: false, error: 'You cannot delete your own account.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    const actorLabel = String(adminCheck.actorName || adminCheck.actorEmail || 'Super Admin').trim() || 'Super Admin';

    if (mode === 'delete') {
      await adminCheck.adminAuth.deleteUser(targetUid);
    } else {
      await adminCheck.adminAuth.updateUser(targetUid, { disabled: mode === 'disable' });
    }

    // Audit log
    try {
      const eventRef = adminCheck.adminDb.collection('admin_user_events').doc();
      await eventRef.set(
        {
          id: eventRef.id,
          uid: targetUid,
          mode,
          reason: reason || null,
          actorUid: adminCheck.actorUid,
          actorEmail: adminCheck.actorEmail,
          actorName: actorLabel,
          createdAtIso: nowIso,
          createdAt: (await import('@/firebase-admin')).default.firestore.Timestamp.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('⚠️ Failed writing admin_user_events (best-effort):', e);
    }

    return NextResponse.json({ success: true, uid: targetUid, mode });
  } catch (error: any) {
    console.error('❌ Error updating user:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update user' }, { status: 500 });
  }
}

