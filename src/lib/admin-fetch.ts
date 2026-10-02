import { getApps } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';

export class AdminFetchError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
    this.body = body;
  }
}

export type AdminFetchOptions = Omit<RequestInit, 'body'> & {
  /** Sent as a JSON body with the matching Content-Type. */
  json?: unknown;
  body?: BodyInit | null;
  /** Defaults to the signed-in Firebase user. */
  user?: User | null;
  /** Set false for public routes that don't need the Firebase ID token. */
  auth?: boolean;
};

const currentFirebaseUser = (): User | null => (getApps().length ? getAuth().currentUser : null);

/**
 * Fetch an internal API route as the signed-in staff member: attaches the Firebase ID token, sends/parses JSON,
 * and throws AdminFetchError with the route's error message when the response is not OK or `success: false`.
 */
export async function adminFetch<T = any>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { json, user, auth = true, headers, body, ...init } = options;

  const requestHeaders = new Headers(headers);
  if (auth) {
    const tokenUser = user ?? currentFirebaseUser();
    if (!tokenUser) throw new AdminFetchError('Sign in required', 401);
    requestHeaders.set('Authorization', `Bearer ${await tokenUser.getIdToken()}`);
  }

  let requestBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(json);
  }

  const response = await fetch(path, {
    cache: 'no-store',
    ...init,
    headers: requestHeaders,
    body: requestBody,
  });

  const text = await response.text().catch(() => '');
  let parsed: any = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  const reportedFailure = parsed && typeof parsed === 'object' && parsed.success === false;
  if (!response.ok || reportedFailure) {
    const message =
      (parsed && typeof parsed === 'object' && String(parsed.error || parsed.message || '').trim()) ||
      `Request failed (HTTP ${response.status})`;
    throw new AdminFetchError(message, response.status, parsed);
  }

  return parsed as T;
}
