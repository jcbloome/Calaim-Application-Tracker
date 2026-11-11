import type { User } from 'firebase/auth';
import { fetch2faStatusViaApi, type TwoFactorStatusResponse } from '@/lib/fetch-2fa-status';

function networkErrorMessage(error: unknown, path: string): string {
  const raw = String((error as any)?.message || error || '');
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return `Could not reach ${path} (network). Check your connection, refresh, and try again — or use Email code.`;
  }
  return raw || `Request failed (${path})`;
}

async function authJson(user: User, path: string, body: Record<string, unknown>) {
  const idToken = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(networkErrorMessage(error, path));
  }
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

export async function setup2faTotpViaApi(user: User) {
  return authJson(user, '/api/auth/2fa-totp-setup', {});
}
