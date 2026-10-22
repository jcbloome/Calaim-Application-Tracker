import type { User } from 'firebase/auth';
import { fetch2faStatusViaApi, type TwoFactorStatusResponse } from '@/lib/fetch-2fa-status';

async function authJson(user: User, path: string, body: Record<string, unknown>) {
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(String(data?.error || `Request failed (${res.status})`));
  }
  return data;
}

export { fetch2faStatusViaApi };
export type { TwoFactorStatusResponse };

export async function send2faCodeViaApi(user: User, opts: { method: string; contact: string }) {
  return authJson(user, '/api/auth/2fa-send', opts);
}

export async function verify2faCodeViaApi(user: User, opts: { code: string; method: string }) {
  return authJson(user, '/api/auth/2fa-verify', opts);
}

export async function update2faPreferencesViaApi(user: User, preferredMethod: string) {
  return authJson(user, '/api/auth/2fa-preferences', { preferredMethod });
}
