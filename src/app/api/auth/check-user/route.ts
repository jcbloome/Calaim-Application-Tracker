import { NextRequest, NextResponse } from 'next/server';

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
      // Try to import and use Firebase Admin
      const admin = await import('@/firebase-admin').then(m => m.default);
      
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
      
      // If it's a credential error, provide a helpful message
      if (userError.message?.includes('credential') || userError.message?.includes('ENOTFOUND')) {
        return NextResponse.json({
          error: 'Firebase Admin credentials not configured for local development. This is normal - you can still try logging in directly.',
          details: userError.message,
          suggestion: 'Try logging in at /login or creating an account at /signup'
        }, { status: 500 });
      }
      
      return NextResponse.json(
        { error: `Error checking user: ${userError.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Check user failed:', error);
    return NextResponse.json({
      error: 'Firebase Admin not available in development mode',
      details: error.message,
      suggestion: 'Try logging in directly at /login or creating an account at /signup'
    }, { status: 500 });
  }
}