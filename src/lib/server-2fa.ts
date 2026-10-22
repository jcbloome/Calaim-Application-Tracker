import { createHash, randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { Resend } from 'resend';
import type { NextRequest } from 'next/server';

export const CODE_EXPIRY_SECONDS = 10 * 60;
export const CODE_EXPIRY_MS = CODE_EXPIRY_SECONDS * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_HOUR = 5;
export const MAX_VERIFY_ATTEMPTS = 3;
export const TWO_FA_SESSION_MS = 8 * 60 * 60 * 1000;
export const TOTP_TIME_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW_STEPS = 1;

export function extractBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
}

export async function verifyBearerUser(request: NextRequest): Promise<{
  uid: string;
  email: string;
  adminDb: any;
  admin: any;
}> {
  const idToken = extractBearerToken(request);
  if (!idToken) throw Object.assign(new Error('Missing Authorization Bearer token'), { status: 401 });

  const adminModule = await import('@/firebase-admin');
  const adminAuth = adminModule.adminAuth;
  const adminDb = adminModule.adminDb;
  const admin = adminModule.default;

  let decoded: any;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired auth token'), { status: 401 });
  }

  const uid = String(decoded?.uid || '').trim();
  const email = String(decoded?.email || '')
    .trim()
    .toLowerCase();
  if (!uid) throw Object.assign(new Error('Invalid token payload'), { status: 401 });

  return { uid, email, adminDb, admin };
}

export function buildCodeHash(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

export function maskContact(contact: string): string {
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
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
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

export function generateTotpSecret(): string {
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

export function verifyTotpCode(secret: string, submittedCode: string): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (let i = -TOTP_WINDOW_STEPS; i <= TOTP_WINDOW_STEPS; i += 1) {
    const expected = generateTotpCode(secret, nowSeconds + i * TOTP_TIME_STEP_SECONDS);
    if (safeCodeEquals(expected, submittedCode)) return true;
  }
  return false;
}

export function newEmailCode(): { code: string; salt: string; hash: string; expiresAt: Date } {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const salt = randomBytes(16).toString('hex');
  return {
    code,
    salt,
    hash: buildCodeHash(code, salt),
    expiresAt: new Date(Date.now() + CODE_EXPIRY_MS),
  };
}

export async function send2faEmailCode(email: string, code: string): Promise<void> {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new Error('RESEND_API_KEY is not configured for 2FA email delivery.');

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: String(process.env.EMAIL_FROM || 'CalAIM Security <noreply@carehomefinders.com>').trim(),
    to: [email],
    subject: 'CalAIM Tracker verification code',
    html: `
      <html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">CalAIM Tracker Verification</h2>
          <p>Your verification code is:</p>
          <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #2563eb;">${code}</span>
          </div>
          <p><strong>This code expires in 10 minutes.</strong></p>
        </div>
      </body></html>
    `,
    text: `Your CalAIM Tracker verification code is ${code}. It expires in 10 minutes.`,
  });
  if (error) throw new Error(`Resend error while sending 2FA code: ${String(error.message || 'unknown error')}`);
}
