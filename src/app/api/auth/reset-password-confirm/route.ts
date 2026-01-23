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

    // Validate token
    let tokenData = resetTokenStore.get(token);
    if (!tokenData) {
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
    }
    
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    if (Date.now() > tokenData.expires) {
      resetTokenStore.delete(token);
      try {
        await admin.firestore().collection('passwordResetTokens').doc(token).delete();
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete expired Firestore token:', deleteError);
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
      try {
        await admin.firestore().collection('passwordResetTokens').doc(token).delete();
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete used Firestore token:', deleteError);
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
      
      // Return specific error message
      if (adminError.code === 'auth/user-not-found') {
        return NextResponse.json(
          { error: 'User account not found. Please contact support.' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { 
          error: `Failed to update password: ${adminError.message || 'Unknown error'}. Please try again or contact support.`
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