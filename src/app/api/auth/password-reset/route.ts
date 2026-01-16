import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';
import crypto from 'crypto';
import { resetTokenStore } from '@/lib/reset-tokens';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Custom password reset request received');
    const { email } = await request.json();
    console.log('📧 Email:', email);
    
    if (!email) {
      console.log('No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️ RESEND_API_KEY not set, cannot send beautiful email');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (60 * 60 * 1000); // 1 hour from now
    
    // Store the token
    resetTokenStore.set(resetToken, { email, expires });
    console.log('🔑 Generated reset token for:', email);

    // Create a link to the custom reset password page
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    // Send beautiful email using Resend with React component
    console.log('📤 Sending beautiful CalAIM branded email to:', email);
    console.log('🔗 Reset URL:', resetUrl);
    
    const emailResult = await resend.emails.send({
      from: 'Connections CalAIM Application Portal <noreply@carehomefinders.com>',
      to: email,
      subject: 'Reset Your Connections CalAIM Application Portal Password',
      react: PasswordResetEmail({
        resetUrl,
        userEmail: email,
      }),
    });
    
    console.log('✅ Beautiful custom email sent successfully:', emailResult);

    return NextResponse.json(
      { message: 'Password reset email sent! Check your inbox for the Connections CalAIM branded email.' },
      { status: 200 }
    );

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
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    const tokenData = resetTokenStore.get(token);
    
    if (!tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      );
    }

    if (Date.now() > tokenData.expires) {
      resetTokenStore.delete(token);
      return NextResponse.json(
        { error: 'Token has expired' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { email: tokenData.email, valid: true },
      { status: 200 }
    );

  } catch (error) {
    console.error('Token validation failed:', error);
    return NextResponse.json(
      { error: 'Failed to validate token' },
      { status: 500 }
    );
  }
}