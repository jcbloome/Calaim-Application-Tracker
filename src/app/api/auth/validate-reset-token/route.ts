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
        { error: 'Token is required', valid: false },
        { status: 400 }
      );
    }

    const firestore = admin.firestore();
    const tokenDoc = await firestore.collection('passwordResets').doc(token).get();

    if (!tokenDoc.exists) {
      return NextResponse.json(
        { error: 'Invalid token', valid: false },
        { status: 400 }
      );
    }

    const tokenData = tokenDoc.data();
    
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid token data', valid: false },
        { status: 400 }
      );
    }

    // Check if token has expired
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();
    
    if (now > expiresAt) {
      return NextResponse.json(
        { error: 'Token has expired', valid: false },
        { status: 400 }
      );
    }

    // Check if token has already been used
    if (tokenData.used) {
      return NextResponse.json(
        { error: 'Token has already been used', valid: false },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { valid: true, email: tokenData.email },
      { status: 200 }
    );

  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate token', valid: false },
      { status: 500 }
    );
  }
}