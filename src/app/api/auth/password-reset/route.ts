import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Password reset request received');
    const { email } = await request.json();
    console.log('📧 Email:', email);
    
    // Debug environment variables
    console.log('🔧 Environment check:');
    console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('- FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing');
    console.log('- FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing');
    console.log('- FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Set' : '❌ Missing');

    if (!email) {
      console.log('No email provided');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if required environment variables are set
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY not set');
      return NextResponse.json(
        { error: 'Email service not configured - missing RESEND_API_KEY' },
        { status: 500 }
      );
    }
    
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.error('❌ Firebase credentials incomplete');
      return NextResponse.json(
        { error: 'Firebase service not configured - missing credentials' },
        { status: 500 }
      );
    }

    // Verify user exists in Firebase Auth
    const auth = admin.auth();
    const firestore = admin.firestore();
    let userRecord;
    
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        // Don't reveal if user exists or not for security
        return NextResponse.json(
          { message: 'If an account with this email exists, you will receive a password reset email.' },
          { status: 200 }
        );
      }
      throw error;
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in Firestore
    await firestore.collection('passwordResets').doc(resetToken).set({
      email: email,
      userId: userRecord.uid,
      expiresAt: expiresAt,
      used: false,
      createdAt: new Date(),
    });

    // Create reset URL
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://studio-2881432245-f1d94.firebaseapp.com'}/reset-password?token=${resetToken}`;

    // Send beautiful email using Resend
    console.log('📤 Sending custom CalAIM branded email to:', email);
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
                  <li>This link will expire in 1 hour for your security</li>
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
        
        This link will expire in 1 hour for your security.
        
        If you didn't request this reset, you can safely ignore this email.
        
        Connections CalAIM Application Portal Team
      `,
    });
    
    console.log('✅ Custom email sent successfully:', emailResult);

    return NextResponse.json(
      { message: 'If an account with this email exists, you will receive a password reset email.' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}