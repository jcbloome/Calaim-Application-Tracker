import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const firestore = admin.firestore();
    
    // Mark token as used
    await firestore.collection('passwordResets').doc(token).update({
      used: true,
      usedAt: new Date(),
    });

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );

  } catch (error) {
    console.error('Mark token used error:', error);
    return NextResponse.json(
      { error: 'Failed to mark token as used' },
      { status: 500 }
    );
  }
}