import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

// Gmail SMTP configuration using app passwords
const gmailUser = defineSecret("GMAIL_USER"); // Your Gmail address
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD"); // Gmail app password

interface EmailOptions {
  to: string[];
  subject: string;
  htmlContent: string;
  textContent: string;
}

// Simple email sending function using Gmail SMTP
export const sendGmailNotification = onCall({
  secrets: [gmailUser, gmailAppPassword]
}, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { to, subject, htmlContent, textContent } = request.data;

    if (!to || !subject || !htmlContent) {
      throw new HttpsError('invalid-argument', 'Missing required email fields');
    }

    console.log(`📧 Sending Gmail notification to ${to.length} recipients`);

    // Use nodemailer with Gmail SMTP
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: gmailUser.value(),
        pass: gmailAppPassword.value()
      }
    });

    const mailOptions = {
      from: `"CalAIM Tracker" <${gmailUser.value()}>`,
      to: to.join(', '),
      subject: subject,
      text: textContent,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('✅ Gmail notification sent successfully:', result.messageId);

    return {
      success: true,
      message: `Email sent successfully to ${to.length} recipients`,
      messageId: result.messageId
    };

  } catch (error: any) {
    console.error('❌ Error sending Gmail notification:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Gmail notification failed: ${error.message}`);
  }
});

// Helper function to send CalAIM notifications via Gmail
export async function sendCalAIMNotificationViaGmail(
  recipients: string[],
  subject: string,
  memberName: string,
  content: string,
  applicationId: string
): Promise<void> {
  
  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">📋 CalAIM Notification</h2>
          
          <p><strong>Member:</strong> ${memberName}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          
          <div style="margin: 20px 0; padding: 20px; background-color: #f3f4f6; border-radius: 8px;">
            ${content}
          </div>
          
          <a href="https://connectcalaim.com/admin/applications/${applicationId}" 
             style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            View Application
          </a>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            This is an automated notification from the CalAIM Tracker system.
          </p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
CalAIM NOTIFICATION

Member: ${memberName}
Date: ${new Date().toLocaleDateString()}

${content}

View Application: https://connectcalaim.com/admin/applications/${applicationId}

---
This is an automated notification from the CalAIM Tracker system.
  `.trim();

  // This would be called from other functions
  const functions = require('firebase-functions');
  const sendGmail = functions.httpsCallable('sendGmailNotification');
  
  await sendGmail({
    to: recipients,
    subject: subject,
    htmlContent: htmlContent,
    textContent: textContent
  });
}