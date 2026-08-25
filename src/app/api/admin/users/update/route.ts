import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Mode = 'disable' | 'enable' | 'delete';

async function deleteDocIfExists(adminDb: any, collectionName: string, docId: string) {
  const id = String(docId || '').trim();
  if (!id) return;
  const ref = adminDb.collection(collectionName).doc(id);
  const snap = await ref.get();
  if (snap.exists) await ref.delete();
}

export async function POST(req: NextRequest) {
  try {
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

    // Super-admin Auth management: allow when signed in as super admin.
    // Keep 2FA preferred, but do not hard-block delete if the list page already loaded.
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: false });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    if (adminCheck.uid && targetUid === adminCheck.uid && mode === 'delete') {
      return NextResponse.json({ success: false, error: 'You cannot delete your own account.' }, { status: 400 });
    }

    let targetEmail = '';
    try {
      const targetUser = await adminCheck.adminAuth.getUser(targetUid);
      targetEmail = String(targetUser?.email || '').trim().toLowerCase();
    } catch (error: any) {
      if (String(error?.code || '') === 'auth/user-not-found') {
        return NextResponse.json({ success: false, error: 'User was already deleted from Auth.' }, { status: 404 });
      }
      throw error;
    }

    if (mode === 'delete' && isHardcodedAdminEmail(targetEmail)) {
      return NextResponse.json(
        { success: false, error: 'This protected admin account cannot be deleted from Registered Users.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const actorLabel = String(adminCheck.name || adminCheck.email || 'Super Admin').trim() || 'Super Admin';

    if (mode === 'delete') {
      await adminCheck.adminAuth.deleteUser(targetUid);

      // Best-effort cleanup of role/profile markers so the account does not reappear as staff/SW.
      try {
        const email = targetEmail;
        await Promise.all([
          deleteDocIfExists(adminCheck.adminDb, 'roles_admin', targetUid),
          deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', targetUid),
          deleteDocIfExists(adminCheck.adminDb, 'socialWorkers', targetUid),
          deleteDocIfExists(adminCheck.adminDb, 'activeSessions', targetUid),
          email ? deleteDocIfExists(adminCheck.adminDb, 'roles_admin', email) : Promise.resolve(),
          email ? deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', email) : Promise.resolve(),
          email ? deleteDocIfExists(adminCheck.adminDb, 'socialWorkers', email) : Promise.resolve(),
        ]);

        if (email) {
          const swByEmail = await adminCheck.adminDb.collection('socialWorkers').where('email', '==', email).limit(10).get();
          await Promise.all(swByEmail.docs.map((docSnap: any) => docSnap.ref.delete()));
        }
      } catch (cleanupError) {
        console.warn('⚠️ Registered user delete cleanup (best-effort) failed:', cleanupError);
      }
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
          email: targetEmail || null,
          mode,
          reason: reason || null,
          actorUid: adminCheck.uid,
          actorEmail: adminCheck.email,
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
