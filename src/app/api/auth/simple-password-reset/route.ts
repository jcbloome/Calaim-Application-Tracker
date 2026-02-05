import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import admin from '@/firebase-admin';
import { sendPasswordResetEmail } from '@/lib/password-reset';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Simple password reset request received');
    const { email } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    console.log('📧 Email:', normalizedEmail);
    
    if (!normalizedEmail) {
      console.log('❌ No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // For development, we'll use Firebase's built-in password reset
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Using Firebase built-in password reset');
      
      try {
        // Check if user exists first
        const auth = getAuth(admin.app());
        await auth.getUserByEmail(normalizedEmail);
        console.log('✅ User found, would send Firebase password reset email');

        let role: 'sw' | 'user' = 'user';
        try {
          const swSnapshot = await admin
            .firestore()
            .collection('socialWorkers')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
          if (!swSnapshot.empty) {
            role = 'sw';
          }
        } catch (roleError) {
          console.warn('⚠️ Failed to determine user role from Firestore:', roleError);
        }
        
        // In development, we can't actually send the email without proper config
        // But we can simulate success and provide instructions
        return NextResponse.json({
          message: 'Development mode: Password reset would be sent via Firebase. For testing, try creating a new account or contact an admin.',
          devMode: true,
          role,
          suggestion: 'Try going to /signup to create a new account, or use /debug-login to test different passwords.'
        }, { status: 200 });
        
      } catch (userError: any) {
        if (userError.code === 'auth/user-not-found') {
          console.log('❌ User not found:', email);
          return NextResponse.json({
            error: 'No account found with this email address. Try signing up instead.',
            suggestion: 'Go to /signup to create a new account.'
          }, { status: 404 });
        }
        
        console.error('❌ Error checking user:', userError);
        return NextResponse.json({
          error: 'Unable to process password reset in development mode.',
          details: userError.message,
          suggestion: 'Try creating a new account at /signup or contact an admin.'
        }, { status: 500 });
      }
    }

    console.log('🔧 Production mode: Using custom password reset email');

    const result = await sendPasswordResetEmail(request, normalizedEmail);
    return NextResponse.json(result.body, { status: result.status });

  } catch (error: any) {
    console.error('Simple password reset failed:', error);
    return NextResponse.json({
      error: 'Failed to process password reset request',
      details: error.message,
      suggestion: 'Try creating a new account at /signup if you don\'t have one.'
    }, { status: 500 });
  }
}