import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

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

    const [swEmailDoc, swByEmailSnap, adminEmailDoc, superAdminEmailDoc, swUidDoc, adminUidDoc, superAdminUidDoc] =
      await Promise.all([
        adminDb.collection('socialWorkers').doc(email).get(),
        adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get(),
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
        uid ? adminDb.collection('socialWorkers').doc(uid).get() : Promise.resolve(null as any),
        uid ? adminDb.collection('roles_admin').doc(uid).get() : Promise.resolve(null as any),
        uid ? adminDb.collection('roles_super_admin').doc(uid).get() : Promise.resolve(null as any),
      ]);

    const isSwLaneAccount =
      Boolean(claims.socialWorker) || Boolean(swEmailDoc?.exists) || Boolean(swUidDoc?.exists) || !swByEmailSnap.empty;
    const isAdminLaneAccount =
      isHardcodedAdminEmail(email) ||
      Boolean(claims.admin) ||
      Boolean(claims.superAdmin) ||
      Boolean(adminEmailDoc?.exists) ||
      Boolean(superAdminEmailDoc?.exists) ||
      Boolean(adminUidDoc?.exists) ||
      Boolean(superAdminUidDoc?.exists);

    const reservedLane = isAdminLaneAccount ? 'admin' : isSwLaneAccount ? 'sw' : null;
    return NextResponse.json({
      success: true,
      email,
      uid: uid || null,
      isAdminLaneAccount,
      isSwLaneAccount,
      isUserLaneAllowed: !isAdminLaneAccount && !isSwLaneAccount,
      reservedLane,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to evaluate email lane.' },
      { status: 500 }
    );
  }
}

