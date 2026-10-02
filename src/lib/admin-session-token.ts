/**
 * Signed admin session cookie shared by /api/auth/admin-session (issuer) and middleware (verifier).
 * Uses Web Crypto only so it runs in both the Node and Edge runtimes.
 *
 * Format: v1.<base64url uid>.<role>.<expSec>.<base64url HMAC-SHA256>
 * When ADMIN_SESSION_SECRET is not configured, the cookie falls back to the legacy "1" marker.
 */

export const ADMIN_SESSION_COOKIE = 'calaim_admin_session';
export const ADMIN_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
export const LEGACY_ADMIN_SESSION_VALUE = '1';

export type AdminSessionRole = 'super' | 'admin' | 'ils';

export type AdminSessionCheck =
  | { status: 'missing' }
  | { status: 'legacy' }
  | { status: 'invalid' }
  | { status: 'valid'; uid: string; role: AdminSessionRole; expSec: number };

const encoder = new TextEncoder();

const getSecret = () => String(process.env.ADMIN_SESSION_SECRET || '').trim();

export const isAdminSessionSigningEnabled = () => getSecret().length >= 16;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64UrlToString(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return atob(padded);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAdminSessionValue(uid: string, role: AdminSessionRole): Promise<string> {
  const secret = getSecret();
  if (!isAdminSessionSigningEnabled()) return LEGACY_ADMIN_SESSION_VALUE;
  const expSec = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SEC;
  const body = `v1.${toBase64Url(encoder.encode(uid))}.${role}.${expSec}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyAdminSessionValue(value: string | undefined | null): Promise<AdminSessionCheck> {
  const raw = String(value || '').trim();
  if (!raw) return { status: 'missing' };
  if (raw === LEGACY_ADMIN_SESSION_VALUE) return { status: 'legacy' };

  const secret = getSecret();
  if (!isAdminSessionSigningEnabled()) return { status: 'legacy' };

  const parts = raw.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return { status: 'invalid' };
  const [version, uidPart, role, expPart, sig] = parts;
  if (role !== 'super' && role !== 'admin' && role !== 'ils') return { status: 'invalid' };
  const expSec = Number(expPart);
  if (!Number.isFinite(expSec) || expSec * 1000 < Date.now()) return { status: 'invalid' };

  const expected = await hmac(secret, `${version}.${uidPart}.${role}.${expPart}`);
  if (!timingSafeEqual(expected, sig)) return { status: 'invalid' };

  let uid = '';
  try {
    uid = fromBase64UrlToString(uidPart);
  } catch {
    return { status: 'invalid' };
  }
  return { status: 'valid', uid, role, expSec };
}
