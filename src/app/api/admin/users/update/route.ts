import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Mode = 'disable' | 'enable' | 'delete' | 'setRole';

async function deleteDocIfExists(adminDb: any, collectionName: string, docId: string) {
  const id = String(docId || '').trim();
  if (!id) return;
  const ref = adminDb.collection(collectionName).doc(id);
  const snap = await ref.get();
  if (snap.exists) await ref.delete();
}

async function setRoleDoc(adminDb: any, collectionName: string, docId: string, payload: Record<string, unknown>) {
  const id = String(docId || '').trim();
  if (!id) return;
  await adminDb.collection(collectionName).doc(id).set(payload, { merge: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const targetUid = String(body?.uid || '').trim();
    const mode = String(body?.mode || '').trim() as Mode;
    const reason = String(body?.reason || '').trim();
    const nextRoleRaw = String(body?.role || '').trim();
    const nextRole =
      nextRoleRaw === 'Super Admin' || nextRoleRaw === 'Admin' || nextRoleRaw === 'Staff'
        ? nextRoleRaw
        : '';

    if (!targetUid) return NextResponse.json({ success: false, error: 'uid is required' }, { status: 400 });
    if (!mode || !(['disable', 'enable', 'delete', 'setRole'] as Mode[]).includes(mode)) {
      return NextResponse.json({ success: false, error: 'mode must be disable|enable|delete|setRole' }, { status: 400 });
    }
    if ((mode === 'disable' || mode === 'delete') && !reason) {
      return NextResponse.json({ success: false, error: 'reason is required' }, { status: 400 });
    }
    if (mode === 'setRole' && !nextRole) {
      return NextResponse.json({ success: false, error: 'role must be Admin|Super Admin|Staff' }, { status: 400 });
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
    if (adminCheck.uid && targetUid === adminCheck.uid && mode === 'setRole' && nextRole === 'Staff') {
      return NextResponse.json({ success: false, error: 'You cannot remove your own admin access.' }, { status: 400 });
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
    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();

    if (mode === 'setRole') {
      const rolePayload = {
        enabled: true,
        role: nextRole,
        email: targetEmail || null,
        updatedAt: serverTimestamp(),
        updatedByUid: adminCheck.uid || null,
        updatedByEmail: adminCheck.email || null,
      };

      await adminCheck.adminDb.collection('users').doc(targetUid).set(
        {
          role: nextRole,
          isStaff: nextRole !== 'Staff',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (nextRole === 'Staff') {
        await Promise.all([
          deleteDocIfExists(adminCheck.adminDb, 'roles_admin', targetUid),
          deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', targetUid),
          targetEmail ? deleteDocIfExists(adminCheck.adminDb, 'roles_admin', targetEmail) : Promise.resolve(),
          targetEmail ? deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', targetEmail) : Promise.resolve(),
        ]);
      } else if (nextRole === 'Super Admin') {
        await setRoleDoc(adminCheck.adminDb, 'roles_super_admin', targetUid, rolePayload);
        await setRoleDoc(adminCheck.adminDb, 'roles_admin', targetUid, rolePayload);
        if (targetEmail) {
          await setRoleDoc(adminCheck.adminDb, 'roles_super_admin', targetEmail, rolePayload);
          await setRoleDoc(adminCheck.adminDb, 'roles_admin', targetEmail, rolePayload);
        }
      } else {
        // Admin: ensure roles_admin, remove super-admin markers.
        await setRoleDoc(adminCheck.adminDb, 'roles_admin', targetUid, rolePayload);
        await deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', targetUid);
        if (targetEmail) {
          await setRoleDoc(adminCheck.adminDb, 'roles_admin', targetEmail, rolePayload);
          await deleteDocIfExists(adminCheck.adminDb, 'roles_super_admin', targetEmail);
        }
      }

      try {
        const eventRef = adminCheck.adminDb.collection('admin_user_events').doc();
        await eventRef.set(
          {
            id: eventRef.id,
            uid: targetUid,
            email: targetEmail || null,
            mode: 'setRole',
            role: nextRole,
            reason: reason || `Role changed to ${nextRole}`,
            actorUid: adminCheck.uid,
            actorEmail: adminCheck.email,
            actorName: actorLabel,
            createdAtIso: nowIso,
            createdAt: adminModule.default.firestore.Timestamp.now(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn('⚠️ Failed writing admin_user_events (best-effort):', e);
      }

      return NextResponse.json({ success: true, uid: targetUid, mode, role: nextRole });
    }

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
          createdAt: adminModule.default.firestore.Timestamp.now(),
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
