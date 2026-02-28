import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase();
    const uid = decoded.uid;

    if (!email || !uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let isAdmin = isHardcodedAdminEmail(email);
    let isSuperAdmin = isAdmin;

    if (!isAdmin) {
      const [adminDoc, superAdminDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get()
      ]);
      isSuperAdmin = superAdminDoc.exists;
      isAdmin = adminDoc.exists || isSuperAdmin;
    }

    // Backward-compat: some roles were stored by email instead of UID.
    if (!isAdmin && email) {
      const [emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get()
      ]);
      isSuperAdmin = emailSuperAdminDoc.exists;
      isAdmin = emailAdminDoc.exists || isSuperAdmin;
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Global master switch: block admin logins when disabled.
    // Safety: Super Admins can still log in to re-enable.
    try {
      const adminAccessSnap = await adminDb.collection('system_settings').doc('admin_access').get();
      const adminAccessEnabled = adminAccessSnap.exists
        ? Boolean((adminAccessSnap.data() as any)?.enabled ?? true)
        : true;
      if (!adminAccessEnabled && !isSuperAdmin) {
        return NextResponse.json({ error: 'Admin portal temporarily disabled by Super Admin' }, { status: 403 });
      }
    } catch {
      // If we can't read the setting, default to allowing access (fail-open).
    }

    try {
      await admin.auth().setCustomUserClaims(uid, {
        admin: true,
        superAdmin: Boolean(isSuperAdmin)
      });
      await adminDb.collection('admins').doc(uid).set({
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const userDocRef = adminDb.collection('users').doc(uid);
      const userSnap = await userDocRef.get();
      const displayName = decoded.name || email || 'Admin User';
      const userData: Record<string, any> = {
        email,
        displayName,
        role: isSuperAdmin ? 'Super Admin' : 'Admin',
        isStaff: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (!userSnap.exists) {
        userData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await userDocRef.set(userData, { merge: true });
    } catch (error) {
      console.error('Failed to sync admin UID:', error);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set('calaim_admin_session', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/admin',
      // Persist across restarts (especially important for Electron).
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error: any) {
    console.error('Admin session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to establish admin session', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('calaim_admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0,
  });
  return response;
}
