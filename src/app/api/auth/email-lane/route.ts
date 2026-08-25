import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

const isActiveSocialWorkerRecord = (data: Record<string, any> | null | undefined) =>
  Boolean(data) && data?.isActive !== false;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = clean(body?.email, 240).toLowerCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    let uid = '';
    let claims: Record<string, any> = {};
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      uid = clean(userRecord?.uid, 128);
      claims = (userRecord?.customClaims || {}) as Record<string, any>;
    } catch (error: any) {
      if (String(error?.code || '') !== 'auth/user-not-found') {
        throw error;
      }
    }

    const [swEmailDoc, swByEmailSnap, adminEmailDoc, superAdminEmailDoc, swUidDoc, adminUidDoc, superAdminUidDoc, userUidDoc] =
      await Promise.all([
        adminDb.collection('socialWorkers').doc(email).get(),
        adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get(),
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
        uid ? adminDb.collection('socialWorkers').doc(uid).get() : Promise.resolve(null as any),
        uid ? adminDb.collection('roles_admin').doc(uid).get() : Promise.resolve(null as any),
        uid ? adminDb.collection('roles_super_admin').doc(uid).get() : Promise.resolve(null as any),
        uid ? adminDb.collection('users').doc(uid).get() : Promise.resolve(null as any),
      ]);

    const isSwLaneByRoleOnly =
      (swEmailDoc?.exists && isActiveSocialWorkerRecord(swEmailDoc.data() as Record<string, any>)) ||
      (swUidDoc?.exists && isActiveSocialWorkerRecord(swUidDoc.data() as Record<string, any>)) ||
      swByEmailSnap.docs.some((docSnap) => isActiveSocialWorkerRecord(docSnap.data() as Record<string, any>));
    const isAdminLaneByRoleOnly =
      isHardcodedAdminEmail(email) ||
      Boolean(adminEmailDoc?.exists) ||
      Boolean(superAdminEmailDoc?.exists) ||
      Boolean(adminUidDoc?.exists) ||
      Boolean(superAdminUidDoc?.exists);
    const userData = userUidDoc?.exists ? (userUidDoc.data() as Record<string, any>) : {};
    const roleLabel = clean(userData?.role, 120).toLowerCase();
    const isStaffAdminProfile =
      Boolean(userData?.isStaff) ||
      ['staff', 'admin', 'super admin', 'super_admin'].includes(roleLabel);
    // Keep for API consumers / debugging (includes SW-ish labels used elsewhere).
    const isStaffProfile =
      isStaffAdminProfile ||
      roleLabel.includes('social worker') ||
      roleLabel.includes('super');
    // Any admin/staff account must use /admin/login — do not require a staff-profile
    // flag on top of roles_admin / admin claims (that let admins into /login).
    const isAdminLaneAccount =
      isHardcodedAdminEmail(email) ||
      Boolean(claims.admin) ||
      Boolean(claims.superAdmin) ||
      isAdminLaneByRoleOnly ||
      isStaffAdminProfile;
    const shouldBlockUserLaneForAdmin = isAdminLaneAccount;
    const isSwLaneAccount = isSwLaneByRoleOnly;

    const reservedLane = shouldBlockUserLaneForAdmin ? 'admin' : isSwLaneAccount ? 'sw' : null;
    return NextResponse.json({
      success: true,
      email,
      uid: uid || null,
      isAdminLaneAccount,
      isSwLaneAccount,
      isAdminLaneByRoleOnly,
      isSwLaneByRoleOnly,
      isStaffProfile,
      shouldBlockUserLaneForAdmin,
      isUserLaneAllowed: !shouldBlockUserLaneForAdmin && !isSwLaneAccount,
      reservedLane,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to evaluate email lane.' },
      { status: 500 }
    );
  }
}

