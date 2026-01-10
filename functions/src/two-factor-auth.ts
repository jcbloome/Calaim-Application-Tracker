import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Generate and send 2FA code
export const send2FACode = onCall(async (request) => {
  try {
    const { method, contact } = request.data; // method: 'email' | 'sms', contact: email or phone
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!method || !contact) {
      throw new HttpsError('invalid-argument', 'Method and contact information required');
    }
    
    console.log(`🔐 Sending 2FA code via ${method} to ${contact}`);
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    const db = admin.firestore();
    
    // Store 2FA code in Firestore
    await db.collection('2fa-codes').doc(request.auth.uid).set({
      code: code,
      method: method,
      contact: contact,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      verified: false,
      attempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Send code based on method
    if (method === 'email') {
      await sendEmailCode(contact, code, request.auth.uid);
    } else if (method === 'sms') {
      await sendSMSCode(contact, code, request.auth.uid);
    }
    
    console.log(`✅ 2FA code sent via ${method}`);
    
    return {
      success: true,
      message: `Verification code sent via ${method}`,
      expiresIn: 600 // 10 minutes in seconds
    };
    
  } catch (error: any) {
    console.error('❌ Error sending 2FA code:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to send 2FA code: ${error.message}`);
  }
});

// Verify 2FA code
export const verify2FACode = onCall(async (request) => {
  try {
    const { code } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!code) {
      throw new HttpsError('invalid-argument', 'Verification code is required');
    }
    
    console.log(`🔐 Verifying 2FA code for user: ${request.auth.uid}`);
    
    const db = admin.firestore();
    const codeDoc = await db.collection('2fa-codes').doc(request.auth.uid).get();
    
    if (!codeDoc.exists) {
      throw new HttpsError('not-found', 'No verification code found. Please request a new code.');
    }
    
    const codeData = codeDoc.data()!;
    
    // Check if code is expired
    if (codeData.expiresAt.toDate() < new Date()) {
      throw new HttpsError('deadline-exceeded', 'Verification code has expired. Please request a new code.');
    }
    
    // Check if too many attempts
    if (codeData.attempts >= 3) {
      throw new HttpsError('resource-exhausted', 'Too many failed attempts. Please request a new code.');
    }
    
    // Check if code matches
    if (codeData.code !== code.toString()) {
      // Increment attempts
      await codeDoc.ref.update({
        attempts: admin.firestore.FieldValue.increment(1)
      });
      
      throw new HttpsError('invalid-argument', 'Invalid verification code. Please try again.');
    }
    
    // Mark as verified
    await codeDoc.ref.update({
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Set 2FA session (valid for 24 hours)
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.collection('users').doc(request.auth.uid).update({
      '2faVerified': true,
      '2faVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      '2faSessionExpiry': admin.firestore.Timestamp.fromDate(sessionExpiry)
    });
    
    // Log successful 2FA
    await db.collection('2fa-logs').add({
      userId: request.auth.uid,
      method: codeData.method,
      contact: codeData.contact,
      success: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: request.rawRequest.ip,
      userAgent: request.rawRequest.headers['user-agent']
    });
    
    console.log(`✅ 2FA verification successful for user: ${request.auth.uid}`);
    
    return {
      success: true,
      message: 'Two-factor authentication verified successfully',
      sessionExpiry: sessionExpiry.toISOString()
    };
    
  } catch (error: any) {
    console.error('❌ Error verifying 2FA code:', error);
    
    // Log failed 2FA attempt
    const db = admin.firestore();
    await db.collection('2fa-logs').add({
      userId: request.auth?.uid,
      success: false,
      error: error.message,
      attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: request.rawRequest.ip,
      userAgent: request.rawRequest.headers['user-agent']
    });
    
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `2FA verification failed: ${error.message}`);
  }
});

// Check 2FA status
export const check2FAStatus = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found');
    }
    
    const userData = userDoc.data()!;
    const now = new Date();
    
    // Check if 2FA session is still valid
    const sessionExpiry = userData['2faSessionExpiry']?.toDate();
    const isVerified = userData['2faVerified'] && sessionExpiry && sessionExpiry > now;
    
    return {
      success: true,
      isVerified: !!isVerified,
      sessionExpiry: sessionExpiry?.toISOString(),
      requiresVerification: !isVerified,
      preferredMethod: userData['2faPreferredMethod'] || 'email',
      email: userData.email,
      phone: userData.phone
    };
    
  } catch (error: any) {
    console.error('❌ Error checking 2FA status:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to check 2FA status: ${error.message}`);
  }
});

// Update 2FA preferences
export const update2FAPreferences = onCall(async (request) => {
  try {
    const { preferredMethod, phone } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const db = admin.firestore();
    const updateData: any = {};
    
    if (preferredMethod) {
      updateData['2faPreferredMethod'] = preferredMethod;
    }
    
    if (phone) {
      updateData.phone = phone;
    }
    
    await db.collection('users').doc(request.auth.uid).update(updateData);
    
    console.log(`✅ 2FA preferences updated for user: ${request.auth.uid}`);
    
    return {
      success: true,
      message: '2FA preferences updated successfully'
    };
    
  } catch (error: any) {
    console.error('❌ Error updating 2FA preferences:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to update 2FA preferences: ${error.message}`);
  }
});

// Helper function to send email code
async function sendEmailCode(email: string, code: string, userId: string): Promise<void> {
  console.log(`📧 Sending 2FA email code to: ${email}`);
  
  // For now, just log the code (integrate with actual email service later)
  console.log(`🔐 2FA Code for ${email}: ${code}`);
  
  // TODO: Integrate with SendGrid or other email service
  // const emailContent = {
  //   to: email,
  //   subject: 'CalAIM Tracker - Verification Code',
  //   html: generate2FAEmailHTML(code),
  //   text: generate2FAEmailText(code)
  // };
  // await sendEmail(emailContent);
}

// Helper function to send SMS code
async function sendSMSCode(phone: string, code: string, userId: string): Promise<void> {
  console.log(`📱 Sending 2FA SMS code to: ${phone}`);
  
  // For now, just log the code (integrate with Twilio or other SMS service later)
  console.log(`🔐 2FA Code for ${phone}: ${code}`);
  
  // TODO: Integrate with Twilio or other SMS service
  // const smsContent = {
  //   to: phone,
  //   body: `Your CalAIM Tracker verification code is: ${code}. This code expires in 10 minutes.`
  // };
  // await sendSMS(smsContent);
}

// Email template generators
function generate2FAEmailHTML(code: string): string {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">🔐 CalAIM Tracker Verification</h2>
          
          <p>Your verification code is:</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #2563eb;">${code}</span>
          </div>
          
          <p><strong>This code expires in 10 minutes.</strong></p>
          
          <p>If you didn't request this code, please ignore this email or contact support.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #6b7280;">
            This is an automated security message from the CalAIM Tracker system.
          </p>
        </div>
      </body>
    </html>
  `;
}

function generate2FAEmailText(code: string): string {
  return `
🔐 CALAIM TRACKER VERIFICATION

Your verification code is: ${code}

This code expires in 10 minutes.

If you didn't request this code, please ignore this email or contact support.

---
This is an automated security message from the CalAIM Tracker system.
  `.trim();
}