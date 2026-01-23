import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import { renderAsync } from '@react-email/render';
import crypto from 'crypto';
import { resetTokenStore } from '@/lib/reset-tokens';
import admin, { adminDb } from '@/firebase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Custom password reset request received');
    const { email } = await request.json();
    console.log('📧 Email:', email);
    
    // Debug environment variables
    console.log('🔧 Environment check:');
    console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? `✅ Set (${process.env.RESEND_API_KEY.substring(0, 10)}...)` : '❌ Missing');
    console.log('- NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'Not set');
    
    if (!email) {
      console.log('❌ No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not set - email service not configured');
      return NextResponse.json(
        { error: 'Email service not configured. Please check server configuration.' },
        { status: 500 }
      );
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (60 * 60 * 1000); // 1 hour from now
    
    // Store the token
    resetTokenStore.set(resetToken, { email, expires });
    console.log('🔑 Generated reset token for:', email);
    try {
      await adminDb.collection('passwordResetTokens').doc(resetToken).set({
        email,
        expires,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('💾 Stored reset token in Firestore');
    } catch (storeError) {
      console.warn('⚠️ Failed to store reset token in Firestore:', storeError);
    }

    // Create a link to the custom reset password page
    // Clean up the base URL to handle potential concatenation issues
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Handle cases where NEXT_PUBLIC_APP_URL might contain multiple URLs or be malformed
    if (baseUrl.includes(',')) {
      // If there are multiple URLs separated by commas, use the first one
      baseUrl = baseUrl.split(',')[0].trim();
    }
    
    // Ensure the URL doesn't end with a slash
    baseUrl = baseUrl.replace(/\/$/, '');
    
    // For development, always use localhost:3000 to avoid Firebase URL issues
    if (process.env.NODE_ENV === 'development') {
      baseUrl = 'http://localhost:3000';
    }
    
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    // Send email using Resend with React component
    console.log('📤 Sending CalAIM branded email to:', email);
    console.log('🔗 Reset URL:', resetUrl);
    console.log('🌐 Base URL used:', baseUrl);
    console.log('🔧 Original NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
    console.log('🏗️ NODE_ENV:', process.env.NODE_ENV);
    
    try {
      // Render the React email component to HTML
      const emailHtml = await renderAsync(PasswordResetEmail({
        resetUrl,
        userEmail: email,
      }));

      const emailResult = await resend.emails.send({
        from: 'Connections CalAIM Application Portal <noreply@carehomefinders.com>',
        to: email,
        subject: 'Reset Your Connections CalAIM Application Portal Password',
        html: emailHtml,
      });
      
      console.log('✅ Email sent successfully:', emailResult);

      return NextResponse.json(
        { message: 'Password reset email sent! Check your inbox for the reset link.' },
        { status: 200 }
      );
    } catch (emailError) {
      console.error('❌ Failed to send email via Resend:', emailError);
      return NextResponse.json(
        { error: 'Failed to send password reset email. Please try again or contact support.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Custom password reset failed:', error);
    return NextResponse.json(
      { error: 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    
    console.log('🔍 Token validation request received');
    console.log('📝 Token:', token ? `${token.substring(0, 8)}...` : 'null');
    console.log('📝 Full token length:', token?.length);
    console.log('📝 Token format valid:', token ? /^[a-f0-9]{64}$/.test(token) : false);
    
    if (!token) {
      console.log('❌ No token provided');
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    let tokenData = resetTokenStore.get(token);
    console.log('💾 In-memory store check:', tokenData ? 'Found' : 'Not found');
    
    if (!tokenData) {
      try {
        console.log('🔍 Checking Firestore for token...');
        const tokenDoc = await adminDb.collection('passwordResetTokens').doc(token).get();
        console.log('📄 Firestore document exists:', tokenDoc.exists);
        
        if (tokenDoc.exists) {
          const data = tokenDoc.data() as { email?: string; expires?: number } | undefined;
          console.log('📄 Firestore document data:', { 
            hasEmail: !!data?.email, 
            hasExpires: !!data?.expires,
            expires: data?.expires ? new Date(data.expires).toISOString() : 'none'
          });
          
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
      console.log('❌ Token not found in store');
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const timeRemaining = tokenData.expires - now;
    
    console.log('⏰ Token validation details:');
    console.log('  - Email:', tokenData.email);
    console.log('  - Expires:', new Date(tokenData.expires).toLocaleString());
    console.log('  - Time remaining:', Math.round(timeRemaining / 1000 / 60), 'minutes');

    if (now > tokenData.expires) {
      console.log('❌ Token has expired');
      resetTokenStore.delete(token);
      try {
        await adminDb.collection('passwordResetTokens').doc(token).delete();
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete expired Firestore token:', deleteError);
      }
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    console.log('✅ Token is valid');
    return NextResponse.json(
      { email: tokenData.email, valid: true },
      { status: 200 }
    );

  } catch (error) {
    console.error('❌ Token validation failed:', error);
    return NextResponse.json(
      { error: 'Failed to validate token' },
      { status: 500 }
    );
  }
}