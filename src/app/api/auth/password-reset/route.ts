import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import PasswordResetEmail from '@/components/emails/PasswordResetEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Password reset request received');
    const { email } = await request.json();
    console.log('📧 Email:', email);
    
    // Debug environment variables
    console.log('🔧 Environment check:');
    console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing');

    if (!email) {
      console.log('No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if Resend API key is available for beautiful emails
    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️ RESEND_API_KEY not set, cannot send beautiful email');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Create a link to the reset password page
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?email=${encodeURIComponent(email)}`;

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
      { message: 'Beautiful password reset email sent! Check your inbox for the Connections CalAIM branded email.' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Beautiful email failed:', error);
    return NextResponse.json(
      { error: 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}