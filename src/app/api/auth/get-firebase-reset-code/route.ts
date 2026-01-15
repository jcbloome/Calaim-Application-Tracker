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

    const auth = admin.auth();
    const firestore = admin.firestore();
    
    const tokenDoc = await firestore.collection('passwordResets').doc(token).get();

    if (!tokenDoc.exists) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      );
    }

    const tokenData = tokenDoc.data();
    
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid token data' },
        { status: 400 }
      );
    }

    // Check if token has expired
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();
    
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    // Check if token has already been used
    if (tokenData.used) {
      return NextResponse.json(
        { error: 'Token has already been used' },
        { status: 400 }
      );
    }

    // Generate Firebase password reset link to get the code
    const resetLink = await auth.generatePasswordResetLink(tokenData.email);
    
    // Extract the oobCode from the reset link
    const url = new URL(resetLink);
    const oobCode = url.searchParams.get('oobCode');
    
    if (!oobCode) {
      return NextResponse.json(
        { error: 'Failed to generate reset code' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { code: oobCode },
      { status: 200 }
    );

  } catch (error) {
    console.error('Get Firebase reset code error:', error);
    return NextResponse.json(
      { error: 'Failed to get reset code' },
      { status: 500 }
    );
  }
}