import { NextRequest, NextResponse } from 'next/server';
import { resetTokenStore } from '@/lib/reset-tokens';
// DO NOT MOVE THIS IMPORT. It must be early to initialize Firebase Admin.
import '@/ai/firebase';
import * as admin from 'firebase-admin';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Password reset confirmation received');
    const { token, newPassword } = await request.json();
    
    if (!token || !newPassword) {
      return NextResponse.json(
        { error: 'Token and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Temporarily disabled development mode simulation to test real password reset
    // if (process.env.NODE_ENV === 'development') {
    //   console.log('🔧 Development mode: Simulating password reset success');
    //   return NextResponse.json(
    //     { message: 'Development mode: Password reset simulation successful' },
    //     { status: 200 }
    //   );
    // }

    // Validate token
    let tokenData = resetTokenStore.get(token);
    if (!tokenData && process.env.NODE_ENV !== 'development') {
      // Only try Firestore in production where credentials are available
      try {
        const tokenDoc = await admin.firestore().collection('passwordResetTokens').doc(token).get();
        if (tokenDoc.exists) {
          const data = tokenDoc.data() as { email?: string; expires?: number } | undefined;
          if (data?.email && data?.expires) {
            tokenData = { email: data.email, expires: data.expires };
            console.log('🔍 Found reset token in Firestore for:', data.email);
          }
        }
      } catch (lookupError) {
        console.warn('⚠️ Failed to read reset token from Firestore:', lookupError);
      }
    } else if (!tokenData && process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Skipping Firestore lookup (credentials not available)');
    }
    
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    if (Date.now() > tokenData.expires) {
      resetTokenStore.delete(token);
      if (process.env.NODE_ENV !== 'development') {
        try {
          await admin.firestore().collection('passwordResetTokens').doc(token).delete();
        } catch (deleteError) {
          console.warn('⚠️ Failed to delete expired Firestore token:', deleteError);
        }
      }
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    const email = tokenData.email;
    console.log('🔄 Resetting password for:', email);

    try {
      // Get user by email and update password using Firebase Admin SDK
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, {
        password: newPassword,
      });

      // Remove the used token
      resetTokenStore.delete(token);
      if (process.env.NODE_ENV !== 'development') {
        try {
          await admin.firestore().collection('passwordResetTokens').doc(token).delete();
        } catch (deleteError) {
          console.warn('⚠️ Failed to delete used Firestore token:', deleteError);
        }
      }
      
      console.log('✅ Password updated successfully for:', email);
      console.log('✅ User UID:', userRecord.uid);

      return NextResponse.json(
        { 
          message: 'Password updated successfully',
          uid: userRecord.uid 
        },
        { status: 200 }
      );

    } catch (adminError: any) {
      console.error('❌ Admin SDK error:', adminError);
      
      // Remove token even on error to prevent reuse
      resetTokenStore.delete(token);
      
      // Handle specific credential errors
      if (adminError.message && (adminError.message.includes('metadata.google.internal') || adminError.message.includes('ENOTFOUND'))) {
        console.log('🔧 Development mode credential error - trying alternative approach');
        return NextResponse.json(
          { error: 'Development mode: Password update requires production environment. Please use the published site for password reset.' },
          { status: 500 }
        );
      }
      
      // Return specific error message
      if (adminError.code === 'auth/user-not-found') {
        return NextResponse.json(
          { error: 'User account not found. Please contact support.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: `Failed to update password: ${adminError.message || 'Unknown error'}. Please contact support.`
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Password reset confirmation failed:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}