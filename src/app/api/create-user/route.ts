
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import 'firebase-admin/auth';
import 'firebase-admin/firestore';

// DO NOT MOVE THIS IMPORT. It must be one of the first lines to initialize Firebase Admin.
import '@/ai/firebase';

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    const firestore = admin.firestore();
    const batch = firestore.batch();

    // 2. Create the user document in Firestore
    const userDocRef = firestore.collection('users').doc(userRecord.uid);
    batch.set(userDocRef, {
      id: userRecord.uid,
      email,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
    });

    // 3. Grant the 'Admin' role
    const adminRoleRef = firestore.collection('roles_admin').doc(userRecord.uid);
    batch.set(adminRoleRef, { grantedAt: admin.firestore.FieldValue.serverTimestamp() });

    await batch.commit();

    return NextResponse.json({ uid: userRecord.uid, message: 'User created and granted admin role successfully' });

  } catch (error: any) {
    console.error('Error creating user:', error);
    
    // Provide a more specific error message if available
    const errorMessage = error.code === 'auth/email-already-exists'
      ? 'A user with this email address already exists.'
      : error.message || 'An unexpected error occurred.';
      
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

    