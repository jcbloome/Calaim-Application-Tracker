import { NextRequest, NextResponse } from 'next/server';
import { sendStaffAssignmentEmail } from '@/app/actions/send-email';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const { type, email, testData } = await request.json();
    
    console.log('🧪 Testing email system:', { type, email, testData });
    console.log('🔧 Environment check:');
    console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('- NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'Not set');

    if (type === 'password-reset') {
      // Test password reset email
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?email=${encodeURIComponent(email)}`;
      
      const result = await resend.emails.send({
        from: 'Connections CalAIM Application Portal <noreply@carehomefinders.com>',
        to: email,
        subject: 'TEST - Reset Your Connections CalAIM Application Portal Password',
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
                background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
                color: white;
                padding: 30px;
                border-radius: 12px;
                margin: -40px -40px 30px -40px;
              }
              .logo {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .title {
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .subtitle {
                font-size: 16px;
                opacity: 0.9;
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
              .test-badge {
                background: #fbbf24;
                color: #92400e;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                display: inline-block;
                margin-bottom: 20px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="test-badge">🧪 TEST EMAIL</div>
                <div class="logo">🏥 CalAIM Application Portal</div>
                <h1 class="title">Reset Your Password</h1>
                <p class="subtitle">We received a request to reset your password</p>
              </div>
              
              <div class="content">
                <p>Hello,</p>
                <p>This is a <strong>TEST</strong> of the password reset email system. You recently requested to reset your password for your Connections CalAIM Application Portal account.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}" class="reset-button">Reset My Password</a>
                </div>
                
                <div class="info-box">
                  <strong>🔒 Security Information:</strong>
                  <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>This is a test email - the link may not work</li>
                    <li>If you didn't request this test, you can safely ignore this email</li>
                    <li>This email is testing the custom branded design</li>
                  </ul>
                </div>
              </div>
              
              <div class="footer">
                <p><strong>Connections CalAIM Application Portal Team</strong></p>
                <p>This test email was sent to ${email}</p>
                <p>🧪 This is a test of the email system</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      
      return NextResponse.json({ 
        success: true, 
        message: 'Password reset test email sent',
        result 
      });
    }
    
    if (type === 'staff-assignment') {
      // Test staff assignment email
      const result = await sendStaffAssignmentEmail({
        to: email,
        staffName: testData?.staffName || 'Test Staff Member',
        memberName: testData?.memberName || 'Test Member Name',
        memberMrn: testData?.memberMrn || 'TEST123456',
        memberCounty: testData?.memberCounty || 'Test County',
        kaiserStatus: testData?.kaiserStatus || 'T2038 Requested',
        calaimStatus: testData?.calaimStatus || 'Pending',
        assignedBy: testData?.assignedBy || 'System Administrator',
        nextStepsDate: testData?.nextStepsDate || new Date().toLocaleDateString(),
      });
      
      return NextResponse.json({ 
        success: true, 
        message: 'Staff assignment test email sent',
        result 
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      message: 'Invalid test type. Use "password-reset" or "staff-assignment"' 
    }, { status: 400 });
    
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to send test email',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}