import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

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

    // Send beautiful email using Resend
    console.log('📤 Sending beautiful CalAIM branded email to:', email);
    console.log('🔗 Reset URL:', resetUrl);
    
    const emailResult = await resend.emails.send({
      from: 'Connections CalAIM Application Portal <noreply@studio-2881432245-f1d94.firebaseapp.com>',
      to: email,
      subject: 'Reset Your Connections CalAIM Application Portal Password',
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f8fafc;
            }
            .container {
              background: white;
              border-radius: 12px;
              padding: 40px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #2563eb;
              margin-bottom: 10px;
            }
            .title {
              font-size: 28px;
              font-weight: bold;
              color: #1e293b;
              margin-bottom: 10px;
            }
            .subtitle {
              color: #64748b;
              font-size: 16px;
            }
            .content {
              margin: 30px 0;
            }
            .reset-button {
              display: inline-block;
              background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
              color: white;
              text-decoration: none;
              padding: 16px 32px;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
              text-align: center;
              margin: 20px 0;
              box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.3);
              transition: all 0.2s;
            }
            .reset-button:hover {
              transform: translateY(-1px);
              box-shadow: 0 6px 20px 0 rgba(37, 99, 235, 0.4);
            }
            .info-box {
              background: #f1f5f9;
              border-left: 4px solid #2563eb;
              padding: 16px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              text-align: center;
              color: #64748b;
              font-size: 14px;
            }
            .security-note {
              background: #fef3c7;
              border: 1px solid #f59e0b;
              border-radius: 6px;
              padding: 12px;
              margin: 20px 0;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="${process.env.NEXT_PUBLIC_APP_URL || 'https://studio-2881432245-f1d94.firebaseapp.com'}/calaimlogopdf.png" alt="Connections CalAIM Logo" style="max-width: 300px; height: auto; margin-bottom: 20px;">
              <h1 class="title">Reset Your Password</h1>
              <p class="subtitle">We received a request to reset your password</p>
            </div>
            
            <div class="content">
              <p>Hello,</p>
              <p>You recently requested to reset your password for your Connections CalAIM Application Portal account. Click the button below to reset it:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" class="reset-button">Reset My Password</a>
              </div>
              
              <div class="info-box">
                <strong>🔒 Security Information:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li>This link will take you to the password reset page</li>
                  <li>If you didn't request this reset, you can safely ignore this email</li>
                  <li>Your password won't change until you create a new one</li>
                </ul>
              </div>
              
              <div class="security-note">
                <strong>⚠️ Can't click the button?</strong> Copy and paste this link into your browser:<br>
                <span style="word-break: break-all; font-family: monospace; font-size: 12px;">${resetUrl}</span>
              </div>
            </div>
            
            <div class="footer">
              <p><strong>Connections CalAIM Application Portal Team</strong></p>
              <p>This email was sent to ${email}</p>
              <p>If you have any questions, please contact our support team.</p>
              <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Connections CalAIM Application Portal - Reset Your Password
        
        Hello,
        
        You recently requested to reset your password for your Connections CalAIM Application Portal account.
        
        Click this link to reset your password: ${resetUrl}
        
        If you didn't request this reset, you can safely ignore this email.
        
        Connections CalAIM Application Portal Team
      `,
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