export const DEFAULT_APP_BASE_URL = 'https://connectcalaim.com';

export const SW_LOGIN_URL = `${DEFAULT_APP_BASE_URL}/sw-login`;
export const SW_PORTAL_ALFT_UPLOAD_URL = `${DEFAULT_APP_BASE_URL}/sw-portal/alft-upload`;

function isLocalHostname(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

export function resolveAppBaseUrl(rawBaseUrl?: string): string {
  const raw = String(
    rawBaseUrl || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || ''
  ).trim();
  if (!raw) return DEFAULT_APP_BASE_URL;

  try {
    const parsed = new URL(raw);
    if (isLocalHostname(parsed.hostname)) {
      return DEFAULT_APP_BASE_URL;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_APP_BASE_URL;
  }
}

export function resolveAppPathUrl(path: string, rawBaseUrl?: string): string {
  const trimmed = String(path || '').trim();
  if (!trimmed) return SW_PORTAL_ALFT_UPLOAD_URL;
  const baseUrl = resolveAppBaseUrl(rawBaseUrl);
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      // Never email localhost links — rewrite to the live app origin, keep path/query.
      if (isLocalHostname(parsed.hostname)) {
        return `${baseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return trimmed;
    } catch {
      return trimmed;
    }
  }
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

/** Turn relative SW portal paths in plain text into full https URLs for email. */
export function linkifyAppPathsInPlainText(text: string, rawBaseUrl?: string): string {
  const baseUrl = resolveAppBaseUrl(rawBaseUrl);
  return String(text || '').replace(
    /(^|[\s(])\/((?:sw-portal|sw-login)(?:\/[^\s<>,.)]*)?)/g,
    (_, lead, path) => `${lead}${baseUrl}/${path}`
  );
}
