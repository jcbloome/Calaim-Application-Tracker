
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import 'firebase-admin/auth';
import 'firebase-admin/firestore';

// This initializes the Firebase Admin SDK.
// It's safe to import here as it ensures initialization only happens once.
import '@/ai/firebase';

// --- Hardcoded Admin User Details ---
const ADMIN_EMAIL = 'jason@carehomefinders.com';
const ADMIN_PASSWORD = 'fisherman2';
const ADMIN_FIRST_NAME = 'Jason';
const ADMIN_LAST_NAME = 'Carefinder';
// ------------------------------------


/**
 * This is a one-time use API route to create the initial Super Admin user.
 * Once the admin is created, this file can be deleted for security.
 */
export async function GET(request: NextRequest) {
  try {
    const firestore = admin.firestore();
    let userRecord;

    // 1. Check if the user already exists in Firebase Auth
    try {
      userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL);
      console.log(`[bootstrap-admin] User ${ADMIN_EMAIL} already exists with UID: ${userRecord.uid}`);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // User does not exist, so create them
        console.log(`[bootstrap-admin] User ${ADMIN_EMAIL} not found. Creating...`);
        userRecord = await admin.auth().createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          displayName: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
        });
        console.log(`[bootstrap-admin] Successfully created new user with UID: ${userRecord.uid}`);
      } else {
        // For other errors (e.g., network issues), re-throw
        throw error;
      }
    }

    const userId = userRecord.uid;
    const batch = firestore.batch();

    // 2. Create or update the user document in 'users' collection
    const userDocRef = firestore.collection('users').doc(userId);
    batch.set(userDocRef, {
      id: userId,
      email: ADMIN_EMAIL,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      displayName: `${ADMIN_FIRST_NAME} ${ADMIN_LAST_NAME}`,
    }, { merge: true });

    // 3. Grant the 'Admin' role
    const adminRoleRef = firestore.collection('roles_admin').doc(userId);
    batch.set(adminRoleRef, { grantedAt: admin.firestore.FieldValue.serverTimestamp() });

    // 4. Grant the 'Super Admin' role
    const superAdminRoleRef = firestore.collection('roles_super_admin').doc(userId);
    batch.set(superAdminRoleRef, { grantedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Commit all Firestore operations
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Successfully created or verified user '${ADMIN_EMAIL}' and granted Super Admin permissions. You can now log in.`,
      uid: userId,
    });

  } catch (error: any) {
    console.error('[bootstrap-admin] Error:', error);
    const errorMessage = error.message || 'An unexpected error occurred.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
