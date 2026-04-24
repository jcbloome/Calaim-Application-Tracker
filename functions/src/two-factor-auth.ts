import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Resend } from "resend";

const resendApiKey = defineSecret("RESEND_API_KEY");

const CODE_EXPIRY_SECONDS = 10 * 60;
const CODE_EXPIRY_MS = CODE_EXPIRY_SECONDS * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 3;
const TWO_FA_SESSION_MS = 8 * 60 * 60 * 1000;
const TOTP_TIME_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW_STEPS = 1;

type TwoFactorMethod = 'email' | 'totp';
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
  if (method === 'sms') return 'email';
  if (method === 'email' || method === 'totp') return method;
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

function encodeBase32(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const sanitized = String(base32 || '')
    .trim()
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
  if (!sanitized) return Buffer.alloc(0);

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of sanitized) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function generateTotpCode(secret: string, epochSeconds = Math.floor(Date.now() / 1000)): string {
  const key = decodeBase32(secret);
  if (!key.length) return '';
  const counter = Math.floor(epochSeconds / TOTP_TIME_STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** TOTP_DIGITS;
  return String(otp).padStart(TOTP_DIGITS, '0');
}

function safeCodeEquals(left: string, right: string): boolean {
  const a = Buffer.from(String(left || '').trim());
  const b = Buffer.from(String(right || '').trim());
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function verifyTotpCode(secret: string, submittedCode: string): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (let i = -TOTP_WINDOW_STEPS; i <= TOTP_WINDOW_STEPS; i += 1) {
    const expected = generateTotpCode(secret, nowSeconds + i * TOTP_TIME_STEP_SECONDS);
    if (safeCodeEquals(expected, submittedCode)) return true;
  }
  return false;
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
    if (method === 'totp') {
      throw new HttpsError('failed-precondition', 'Authenticator app verification does not send a code. Enter your app code directly.');
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
    await sendEmailCode(contact, code, request.auth.uid);
    
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
    const method = request.data?.method ? normalizeMethod(request.data?.method) : undefined;
    const code = String(request.data?.code || '').trim();
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    if (!/^\d{6}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'A valid 6-digit verification code is required');
    }
    
    console.log(`🔐 Verifying 2FA code for user: ${request.auth.uid}`);
    
    const db = admin.firestore();
    const userRef = db.collection('users').doc(request.auth.uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() || {} : {};
    const preferredMethod = normalizeMethod((method || userData['2faPreferredMethod'] || 'email'));
    let logContact = '';

    if (preferredMethod === 'totp') {
      const secret = String(userData['2faTotpSecret'] || userData['2faTotpPendingSecret'] || '').trim();
      if (!secret) {
        throw new HttpsError('failed-precondition', 'Authenticator app is not configured for this account.');
      }
      if (!verifyTotpCode(secret, code)) {
        throw new HttpsError('invalid-argument', 'Invalid authenticator code. Please try again.');
      }

      const updateData: Record<string, any> = {};
      if (!userData['2faTotpEnabled'] || !userData['2faTotpSecret']) {
        updateData['2faTotpSecret'] = secret;
        updateData['2faTotpEnabled'] = true;
        updateData['2faTotpEnabledAt'] = admin.firestore.FieldValue.serverTimestamp();
        updateData['2faTotpPendingSecret'] = admin.firestore.FieldValue.delete();
        updateData['2faTotpPendingCreatedAt'] = admin.firestore.FieldValue.delete();
      }
      if (Object.keys(updateData).length > 0) {
        await userRef.set(updateData, { merge: true });
      }
      logContact = String(request.auth.token.email || '');
    } else {
      const codeDoc = await db.collection('2fa-codes').doc(request.auth.uid).get();
      if (!codeDoc.exists) {
        throw new HttpsError('not-found', 'No verification code found. Please request a new code.');
      }
      const codeData = codeDoc.data() as TwoFactorCodeDoc;
      if (codeData.expiresAt.toDate() < new Date()) {
        throw new HttpsError('deadline-exceeded', 'Verification code has expired. Please request a new code.');
      }
      if (Number(codeData.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
        throw new HttpsError('resource-exhausted', 'Too many failed attempts. Please request a new code.');
      }
      const submittedHash = buildCodeHash(code, String(codeData.codeSalt || ''));
      if (submittedHash !== String(codeData.codeHash || '')) {
        await codeDoc.ref.update({
          attempts: admin.firestore.FieldValue.increment(1)
        });
        throw new HttpsError('invalid-argument', 'Invalid verification code. Please try again.');
      }
      await codeDoc.ref.delete();
      logContact = String(codeData.contact || '');
    }
    
    // Set 2FA session (valid for 8 hours)
    const sessionExpiry = new Date(Date.now() + TWO_FA_SESSION_MS);
    await db.collection('users').doc(request.auth.uid).set(
      {
        '2faVerified': true,
        '2faVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
        '2faSessionExpiry': admin.firestore.Timestamp.fromDate(sessionExpiry),
      },
      { merge: true }
    );
    
    // Log successful 2FA
    await db.collection('2fa-logs').add({
      userId: request.auth.uid,
      method: preferredMethod,
      contactMasked: maskContact(logContact),
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

    // If a code is still active for this user, return enough info for UI to
    // resume the code-entry step after refresh/navigation.
    const codeSnap = await db.collection('2fa-codes').doc(request.auth.uid).get();
    const codeData = (codeSnap.exists ? codeSnap.data() : null) as TwoFactorCodeDoc | null;
    const pendingExpiry = codeData?.expiresAt?.toDate?.();
    const pendingMethod = String(codeData?.method || '').trim().toLowerCase();
    const pendingCode =
      Boolean(codeData) &&
      pendingMethod === 'email' &&
      !Boolean(codeData?.verified) &&
      Boolean(pendingExpiry && pendingExpiry > now) &&
      Number(codeData?.attempts || 0) < MAX_VERIFY_ATTEMPTS;
    
    return {
      success: true,
      isVerified: !!isVerified,
      sessionExpiry: sessionExpiry?.toISOString(),
      requiresVerification: !isVerified,
      pendingCode,
      pendingCodeExpiresAt: pendingExpiry?.toISOString(),
      preferredMethod: userData['2faPreferredMethod'] || 'email',
      totpEnabled: Boolean(userData['2faTotpEnabled']),
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
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const db = admin.firestore();
    const updateData: any = {};
    
    if (preferredMethod) {
      updateData['2faPreferredMethod'] = preferredMethod;
    }
    
    await db.collection('users').doc(request.auth.uid).set(updateData, { merge: true });
    
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

// Generate / refresh pending authenticator setup secret and return otpauth URI.
export const setup2FATOTP = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const db = admin.firestore();
    const userRef = db.collection('users').doc(request.auth.uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() || {} : {};

    const alreadyEnabled = Boolean(userData['2faTotpEnabled']) && Boolean(String(userData['2faTotpSecret'] || '').trim());
    let secret = String(userData['2faTotpPendingSecret'] || '').trim();
    if (alreadyEnabled) {
      secret = String(userData['2faTotpSecret'] || '').trim();
    }
    if (!secret) {
      secret = generateTotpSecret();
      await userRef.set(
        {
          '2faTotpPendingSecret': secret,
          '2faTotpPendingCreatedAt': admin.firestore.FieldValue.serverTimestamp(),
          '2faPreferredMethod': 'totp',
        },
        { merge: true }
      );
    }

    const accountLabel = String(request.auth.token.email || request.auth.uid);
    const issuer = 'CalAIM Tracker';
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_TIME_STEP_SECONDS}`;

    return {
      success: true,
      secret,
      otpauthUrl,
      alreadyEnabled,
      issuer,
      accountLabel,
    };
  } catch (error: any) {
    console.error('❌ Error setting up TOTP:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', `Failed to initialize authenticator setup: ${error.message}`);
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