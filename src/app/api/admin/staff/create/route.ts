import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function randomPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const { email, firstName, lastName, role } = await request.json().catch(() => ({}));
    const normalizedEmail = normalizeEmail(email);
    const safeRole = role === 'Super Admin' ? 'Super Admin' : 'Admin';

    if (!normalizedEmail) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const callerUid = decoded.uid;
    const callerEmail = normalizeEmail(decoded.email || '');

    let callerIsSuperAdmin = false;
    if (isHardcodedAdminEmail(callerEmail)) {
      callerIsSuperAdmin = true;
    } else {
      const [superByUid, superByEmail] = await Promise.all([
        adminDb.collection('roles_super_admin').doc(callerUid).get(),
        callerEmail ? adminDb.collection('roles_super_admin').doc(callerEmail).get() : Promise.resolve({ exists: false } as any)
      ]);
      callerIsSuperAdmin = Boolean(superByUid.exists || superByEmail.exists);
    }

    if (!callerIsSuperAdmin) {
      return NextResponse.json({ error: 'Super Admin access required' }, { status: 403 });
    }

    const displayName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
    const tempPassword = randomPassword();

    // Create (or update) Firebase Auth user.
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(normalizedEmail);
      userRecord = await adminAuth.updateUser(userRecord.uid, {
        displayName: displayName || userRecord.displayName || normalizedEmail,
        password: tempPassword,
      });
    } catch (e: any) {
      if (String(e?.code || '').includes('auth/user-not-found')) {
        userRecord = await adminAuth.createUser({
          email: normalizedEmail,
          password: tempPassword,
          displayName: displayName || normalizedEmail,
        });
      } else {
        throw e;
      }
    }

    const newUid = userRecord.uid;

    // Write role docs (source of truth for admin-session gate).
    if (safeRole === 'Super Admin') {
      await adminDb.collection('roles_super_admin').doc(newUid).set({
        email: normalizedEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: callerUid
      }, { merge: true });
      await adminDb.collection('roles_admin').doc(newUid).set({
        email: normalizedEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: callerUid
      }, { merge: true });
    } else {
      await adminDb.collection('roles_admin').doc(newUid).set({
        email: normalizedEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: callerUid
      }, { merge: true });
    }

    // Ensure users/{uid} exists with staff metadata.
    await adminDb.collection('users').doc(newUid).set({
      id: newUid,
      email: normalizedEmail,
      firstName: String(firstName || '').trim(),
      lastName: String(lastName || '').trim(),
      displayName: displayName || normalizedEmail,
      role: safeRole,
      isStaff: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerUid
    }, { merge: true });

    return NextResponse.json({
      success: true,
      uid: newUid,
      email: normalizedEmail,
      role: safeRole,
      tempPassword
    });
  } catch (error: any) {
    console.error('Error creating staff user:', error);
    return NextResponse.json(
      { error: 'Failed to create staff user', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

