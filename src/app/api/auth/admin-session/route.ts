import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SEC,
  createAdminSessionValue,
} from '@/lib/admin-session-token';

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
    if (isBlockedPortalEmail(email)) {
      return NextResponse.json({ error: 'Admin access removed for this account' }, { status: 403 });
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

    // Staff fallback: allow accounts explicitly marked as staff/admin in users/{uid}.
    // Do not auto-promote ILS-only limited contacts to full admin.
    let isIlsPackagePortalOnly = false;
    if (!isAdmin) {
      try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = (userDoc.exists ? (userDoc.data() as Record<string, unknown>) : {}) as Record<string, unknown>;
        const role = String(userData?.role || '').trim().toLowerCase();
        const isStaffFlag = Boolean(userData?.isStaff);
        const roleAllowsAdmin = ['staff', 'admin', 'super admin', 'super_admin'].includes(role);
        const ilsOnly =
          Boolean(userData?.isIlsStaff || userData?.canAccessIlsPackagePortal) &&
          !Boolean(userData?.canAccessAllTools) &&
          role === 'staff';
        if (ilsOnly) {
          isIlsPackagePortalOnly = true;
        } else if (isStaffFlag || roleAllowsAdmin) {
          isAdmin = true;
          if (role === 'super admin' || role === 'super_admin') {
            isSuperAdmin = true;
          }
        }
      } catch {
        // Fall through to normal lane checks below.
      }
    }

    // Enforce lane separation only when the account does not have admin/staff admin access.
    // This allows explicit admin accounts that also have SW records to sign in.
    if (!isAdmin && !isIlsPackagePortalOnly) {
      const [swUidDoc, swEmailDoc, swByEmailSnap] = await Promise.all([
        adminDb.collection('socialWorkers').doc(uid).get(),
        adminDb.collection('socialWorkers').doc(email).get(),
        adminDb.collection('socialWorkers').where('email', '==', email).limit(1).get(),
      ]);
      const hasSwLaneRecord = swUidDoc.exists || swEmailDoc.exists || !swByEmailSnap.empty;
      if (hasSwLaneRecord) {
        return NextResponse.json(
          { error: 'This email is reserved for Social Worker login. Please use a dedicated Admin email.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Per-user suspend: block staff/admin whose access was suspended in Staff Management.
    // Safety: Super Admins can still log in to restore access.
    try {
      const suspendedSnap = await adminDb.collection('users').doc(uid).get();
      const suspended = Boolean((suspendedSnap.exists ? suspendedSnap.data() : null)?.accessSuspended);
      if (suspended && !isSuperAdmin) {
        return NextResponse.json(
          { error: 'Your access has been suspended. Contact a Super Admin to restore access.' },
          { status: 403 }
        );
      }
    } catch {
      // If we can't read the flag, continue (Auth disabled flag still blocks login when set).
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
      if (isIlsPackagePortalOnly) {
        await admin.auth().setCustomUserClaims(uid, {
          admin: false,
          superAdmin: false,
          ilsPackagePortal: true,
        });
      } else {
        await admin.auth().setCustomUserClaims(uid, {
          admin: true,
          superAdmin: Boolean(isSuperAdmin)
        });
        // Firestore rules use roles_admin/{uid} — keep it in sync so Staff can load applications.
        const rolePayload = {
          email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'admin-session',
        };
        await adminDb.collection('roles_admin').doc(uid).set(rolePayload, { merge: true });
        if (isSuperAdmin) {
          await adminDb.collection('roles_super_admin').doc(uid).set(rolePayload, { merge: true });
        }
      }
      await adminDb.collection('admins').doc(uid).set({
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const userDocRef = adminDb.collection('users').doc(uid);
      const userSnap = await userDocRef.get();
      const existing = userSnap.exists ? (userSnap.data() as Record<string, any>) : {};
      const existingRole = String(existing?.role || '').trim();
      const preserveIlsStaffRole =
        isIlsPackagePortalOnly ||
        (Boolean(existing?.isIlsStaff || existing?.canAccessIlsPackagePortal) &&
          existingRole.toLowerCase() === 'staff');
      const displayName =
        decoded.name ||
        `${String(existing?.firstName || '').trim()} ${String(existing?.lastName || '').trim()}`.trim() ||
        email ||
        'Admin User';
      const userData: Record<string, any> = {
        email,
        displayName,
        role: preserveIlsStaffRole ? 'Staff' : isSuperAdmin ? 'Super Admin' : 'Admin',
        isStaff: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (preserveIlsStaffRole) {
        userData.isIlsStaff = true;
        userData.canAccessIlsPackagePortal = true;
      }
      if (!userSnap.exists) {
        userData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await userDocRef.set(userData, { merge: true });
    } catch (error) {
      console.error('Failed to sync admin UID:', error);
    }

    const sessionRole = isIlsPackagePortalOnly ? 'ils' : isSuperAdmin ? 'super' : 'admin';
    const response = NextResponse.json({ success: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, await createAdminSessionValue(uid, sessionRole), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/admin',
      // Persist across restarts (especially important for Electron).
      maxAge: ADMIN_SESSION_MAX_AGE_SEC,
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
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: 0,
  });
  return response;
}
