import type { User } from 'firebase/auth';

export type TwoFactorStatusResponse = {
  success: boolean;
  isVerified?: boolean;
  sessionExpiry?: string;
  requiresVerification?: boolean;
  pendingCode?: boolean;
  pendingCodeExpiresAt?: string | null;
  preferredMethod?: 'email' | 'sms' | 'totp';
  totpEnabled?: boolean;
  email?: string;
  phone?: string | null;
  error?: string;
};

/**
 * Prefer the Next.js API (same-origin, no callable CORS). Falls back to nothing —
 * callers may still try the Cloud Function if desired.
 */
export async function fetch2faStatusViaApi(user: User): Promise<TwoFactorStatusResponse> {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/2fa-status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const data = (await res.json().catch(() => ({}))) as TwoFactorStatusResponse;
  if (!res.ok) {
    throw new Error(String(data?.error || `2FA status HTTP ${res.status}`));
  }
  if (!data?.success) {
    throw new Error(String(data?.error || '2FA status check failed'));
  }
  return data;
}
