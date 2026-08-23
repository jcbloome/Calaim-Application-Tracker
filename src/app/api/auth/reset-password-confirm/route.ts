import { NextRequest, NextResponse } from 'next/server';
import { resetTokenStore } from '@/lib/reset-tokens';
import admin, { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    // Allow password reset in development mode for testing
    if (process.env.NODE_ENV === 'development') {
      console.log('🔧 Development mode: Allowing password reset for testing');
      // Continue with normal flow instead of simulating
    }

    // Validate token
    let tokenData = resetTokenStore.get(token);
    if (!tokenData && process.env.NODE_ENV !== 'development') {
      // Only try Firestore in production where credentials are available
      try {
        const tokenDoc = await adminDb.collection('passwordResetTokens').doc(token).get();
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
          await adminDb.collection('passwordResetTokens').doc(token).delete();
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
      const userRecord = await adminAuth.getUserByEmail(email);
      await adminAuth.updateUser(userRecord.uid, {
        password: newPassword,
      });

      // Remove the used token
      resetTokenStore.delete(token);
      if (process.env.NODE_ENV !== 'development') {
        try {
          await adminDb.collection('passwordResetTokens').doc(token).delete();
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
      console.error('❌ Full error details:', JSON.stringify(adminError, null, 2));
      
      // Remove token even on error to prevent reuse
      resetTokenStore.delete(token);
      
      // Do not simulate success when Admin SDK cannot update the password.
      if (
        process.env.NODE_ENV === 'development' &&
        adminError.message &&
        (adminError.message.includes('metadata.google.internal') || adminError.message.includes('ENOTFOUND'))
      ) {
        return NextResponse.json(
          {
            error:
              'Password reset could not complete locally because Firebase Admin credentials are unavailable. Configure Firebase Admin locally or test reset in production.',
          },
          { status: 503 }
        );
      }
      
      // Handle permission errors specifically
      if (adminError.message && (
        adminError.message.includes('PERMISSION_DENIED') || 
        adminError.message.includes('serviceusage.serviceUsageConsumer') ||
        adminError.message.includes('required permission')
      )) {
        console.log('🚫 Firebase Admin SDK permission error detected');
        return NextResponse.json(
          { 
            error: 'Server configuration error: Firebase Admin SDK lacks required permissions. Please contact your administrator to update service account roles in Google Cloud Console.',
            details: 'Required roles: Service Usage Consumer, Firebase Admin, Firebase Auth Admin',
            errorCode: adminError.code || 'unknown'
          },
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
          error: `Failed to update password: ${adminError.message || 'Unknown error'}. Please contact support.`,
          errorCode: adminError.code || 'unknown'
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