import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

const resendApiKey = defineSecret("RESEND_API_KEY");

const CODE_EXPIRY_SECONDS = 10 * 60;
const CODE_EXPIRY_MS = CODE_EXPIRY_SECONDS * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 3;
const TWO_FA_SESSION_MS = 8 * 60 * 60 * 1000;

type TwoFactorMethod = 'email' | 'sms';
type TwoFactorCodeDoc = {
  codeHash: string;
  codeSalt: string;
  method: TwoFactorMethod;
  contact: string;
  expiresAt: admin.firestore.Timestamp;
  verified: boolean;
  attempts: number;
  createdAt?: admin.firestore.Timestamp;
  lastSentAt?: admin.firestore.Timestamp;
  sendCountWindowStart?: admin.firestore.Timestamp;
  sendCountInWindow?: number;
};

function nowTs() {
  return admin.firestore.Timestamp.now();
}

function normalizeMethod(value: unknown): TwoFactorMethod {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'email' || method === 'sms') return method;
  throw new HttpsError('invalid-argument', 'Invalid 2FA method');
}

function maskContact(contact: string): string {
  const value = String(contact || '').trim();
  if (!value) return '';
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    const safeLocal = local.length <= 2 ? `${local[0] || '*'}*` : `${local[0]}***${local[local.length - 1]}`;
    return `${safeLocal}@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `***-***-${digits.slice(-4)}`;
}

function buildCodeHash(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

// Generate and send 2FA code
export const send2FACode = onCall({ secrets: [resendApiKey] }, async (request) => {
  try {
    const method = normalizeMethod(request.data?.method);
    const contact = String(request.data?.contact || '').trim();
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!method || !contact) {
      throw new HttpsError('invalid-argument', 'Method and contact information required');
    }

    if (method === 'sms') {
      throw new HttpsError('failed-precondition', 'SMS 2FA is not configured yet. Please use email verification.');
    }
    
    const userEmail = String(request.auth.token.email || '').trim().toLowerCase();
    if (method === 'email' && userEmail && contact.toLowerCase() !== userEmail) {
      throw new HttpsError('permission-denied', '2FA email must match your authenticated account email.');
    }
    
    console.log(`🔐 Sending 2FA code via ${method} to ${maskContact(contact)}`);
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
    const codeSalt = randomBytes(16).toString('hex');
    const codeHash = buildCodeHash(code, codeSalt);
    
    const db = admin.firestore();
    const codeRef = db.collection('2fa-codes').doc(request.auth.uid);
    
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(codeRef);
      const existing = (snapshot.exists ? snapshot.data() : null) as TwoFactorCodeDoc | null;
      const now = Date.now();

      const lastSentMs = existing?.lastSentAt?.toDate?.().getTime?.() || 0;
      if (lastSentMs && now - lastSentMs < RESEND_COOLDOWN_MS) {
        throw new HttpsError('resource-exhausted', 'Please wait before requesting another code.');
      }

      const windowStartMs = existing?.sendCountWindowStart?.toDate?.().getTime?.() || 0;
      const sameWindow = windowStartMs && now - windowStartMs < 60 * 60 * 1000;
      const sendCountInWindow = sameWindow ? Number(existing?.sendCountInWindow || 0) + 1 : 1;
      if (sendCountInWindow > MAX_SENDS_PER_HOUR) {
        throw new HttpsError('resource-exhausted', 'Too many 2FA code requests. Try again later.');
      }

      tx.set(codeRef, {
        codeHash,
        codeSalt,
        method,
        contact,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        verified: false,
        attempts: 0,
        createdAt: nowTs(),
        lastSentAt: nowTs(),
        sendCountWindowStart: sameWindow && existing?.sendCountWindowStart ? existing.sendCountWindowStart : nowTs(),
        sendCountInWindow,
      }, { merge: true });
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
      expiresIn: CODE_EXPIRY_SECONDS
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
    const code = String(request.data?.code || '').trim();
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!/^\d{6}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'A valid 6-digit verification code is required');
    }
    
    console.log(`🔐 Verifying 2FA code for user: ${request.auth.uid}`);
    
    const db = admin.firestore();
    const codeDoc = await db.collection('2fa-codes').doc(request.auth.uid).get();
    
    if (!codeDoc.exists) {
      throw new HttpsError('not-found', 'No verification code found. Please request a new code.');
    }
    
    const codeData = codeDoc.data() as TwoFactorCodeDoc;
    
    // Check if code is expired
    if (codeData.expiresAt.toDate() < new Date()) {
      throw new HttpsError('deadline-exceeded', 'Verification code has expired. Please request a new code.');
    }
    
    // Check if too many attempts
    if (Number(codeData.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Too many failed attempts. Please request a new code.');
    }
    
    // Check if code hash matches
    const submittedHash = buildCodeHash(code, String(codeData.codeSalt || ''));
    if (submittedHash !== String(codeData.codeHash || '')) {
      // Increment attempts
      await codeDoc.ref.update({
        attempts: admin.firestore.FieldValue.increment(1)
      });
      
      throw new HttpsError('invalid-argument', 'Invalid verification code. Please try again.');
    }
    
    await codeDoc.ref.delete();
    
    // Set 2FA session (valid for 8 hours)
    const sessionExpiry = new Date(Date.now() + TWO_FA_SESSION_MS);
    await db.collection('users').doc(request.auth.uid).update({
      '2faVerified': true,
      '2faVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      '2faSessionExpiry': admin.firestore.Timestamp.fromDate(sessionExpiry)
    });
    
    // Log successful 2FA
    await db.collection('2fa-logs').add({
      userId: request.auth.uid,
      method: codeData.method,
      contactMasked: maskContact(String(codeData.contact || '')),
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
    const isVerified = Boolean(userData['2faVerified']) && Boolean(sessionExpiry && sessionExpiry > now);
    
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
    const preferredMethod = request.data?.preferredMethod ? normalizeMethod(request.data.preferredMethod) : undefined;
    const phone = String(request.data?.phone || '').trim();
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const db = admin.firestore();
    const updateData: any = {};
    
    if (preferredMethod === 'sms') {
      throw new HttpsError('failed-precondition', 'SMS 2FA is not configured yet. Please use email.');
    }

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
  void userId;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured for 2FA email delivery.');
  }

  console.log(`📧 Sending 2FA email code to: ${maskContact(email)}`);

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: String(process.env.EMAIL_FROM || 'CalAIM Security <noreply@carehomefinders.com>').trim(),
    to: [email],
    subject: 'CalAIM Tracker verification code',
    html: generate2FAEmailHTML(code),
    text: generate2FAEmailText(code),
  });

  if (error) {
    throw new Error(`Resend error while sending 2FA code: ${String(error.message || 'unknown error')}`);
  }
}

// Helper function to send SMS code
async function sendSMSCode(phone: string, code: string, userId: string): Promise<void> {
  void phone;
  void code;
  void userId;
  throw new HttpsError('failed-precondition', 'SMS 2FA is not configured yet.');
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