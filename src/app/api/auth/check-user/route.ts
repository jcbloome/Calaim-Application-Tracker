import { NextRequest, NextResponse } from 'next/server';
import admin from '@/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log('🔍 Checking user:', email);

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      console.log('✅ User found:', {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        creationTime: userRecord.metadata.creationTime
      });

      return NextResponse.json({
        exists: true,
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        creationTime: userRecord.metadata.creationTime
      });

    } catch (userError: any) {
      if (userError.code === 'auth/user-not-found') {
        console.log('❌ User not found:', email);
        return NextResponse.json({
          exists: false,
          message: 'User not found'
        });
      }
      
      console.error('❌ Error checking user:', userError);
      return NextResponse.json(
        { error: `Error checking user: ${userError.message}` },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Check user failed:', error);
    return NextResponse.json(
      { error: 'Failed to check user' },
      { status: 500 }
    );
  }
}