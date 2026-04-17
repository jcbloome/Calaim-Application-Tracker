import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

type CommandBody = {
  idToken?: string;
  allowAfterHours?: boolean;
  applyAll?: boolean;
  targetUids?: string[];
  resumeNotifications?: boolean;
};

async function resolveTargetUids(params: {
  adminDb: any;
  applyAll: boolean;
  targetUids: string[];
}) {
  if (!params.applyAll) {
    return Array.from(
      new Set(
        params.targetUids
          .map((x) => String(x || '').trim())
          .filter((x) => Boolean(x) && !x.includes('@'))
      )
    );
  }
  const [adminSnap, superAdminSnap, staffSnap] = await Promise.all([
    params.adminDb.collection('roles_admin').get(),
    params.adminDb.collection('roles_super_admin').get(),
    params.adminDb.collection('users').where('isStaff', '==', true).get(),
  ]);
  return Array.from(
    new Set([
      ...adminSnap.docs.map((d: any) => String(d.id || '').trim()).filter((id: string) => id && !id.includes('@')),
      ...superAdminSnap.docs.map((d: any) => String(d.id || '').trim()).filter((id: string) => id && !id.includes('@')),
      ...staffSnap.docs.map((d: any) => String(d.id || '').trim()).filter((id: string) => id && !id.includes('@')),
    ])
  ).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as CommandBody;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });

    const allowAfterHours = Boolean(body?.allowAfterHours);
    const applyAll = Boolean(body?.applyAll);
    const resumeNotifications = body?.resumeNotifications !== false;
    const targetUidsInput = Array.isArray(body?.targetUids) ? body!.targetUids! : [];

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }
    const { adminDb, uid, email } = authz;
    const targetUids = await resolveTargetUids({
      adminDb,
      applyAll,
      targetUids: targetUidsInput,
    });
    if (targetUids.length === 0) {
      return NextResponse.json({ success: false, error: 'No target staff selected' }, { status: 400 });
    }

    const commandId = `${Date.now()}-${uid.slice(0, 8)}`;
    const batch = adminDb.batch();
    targetUids.forEach((targetUid: string) => {
      const ref = adminDb.collection('desktop_control_commands').doc(targetUid);
      batch.set(
        ref,
        {
          uid: targetUid,
          allowAfterHours,
          resumeNotifications: Boolean(resumeNotifications),
          commandId,
          updatedAt: new Date().toISOString(),
          updatedByUid: uid,
          updatedByEmail: email,
        },
        { merge: true }
      );
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      commandId,
      targets: targetUids.length,
      allowAfterHours,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update Electron controls' },
      { status: 500 }
    );
  }
}

