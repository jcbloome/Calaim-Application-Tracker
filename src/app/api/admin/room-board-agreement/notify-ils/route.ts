import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { dispatchRoomBoardIlsIfReady } from '@/lib/room-board-ils-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  applicationId?: string;
  userId?: string | null;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 320).toLowerCase();

async function canManageRoomBoardAgreement(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = clean(decoded?.uid, 128);
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  const hasAdminClaim = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (hasAdminClaim || isHardcodedAdminEmail(email)) {
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
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Unauthorized' };
  return { ok: true as const, uid, email };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 8000);
    const applicationId = clean(body?.applicationId, 200);
    const applicationUserId = clean(body?.userId, 200);
    if (!idToken || !applicationId) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    const authz = await canManageRoomBoardAgreement(idToken);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const result = await dispatchRoomBoardIlsIfReady({
      applicationId,
      applicationUserId: applicationUserId || null,
      triggeredByUid: authz.uid,
      triggeredByEmail: authz.email || null,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[admin/room-board-agreement/notify-ils] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to notify ILS.' },
      { status: 500 }
    );
  }
}
