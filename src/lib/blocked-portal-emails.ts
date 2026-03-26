const BLOCKED_PORTAL_EMAILS = new Set([
  'jocelyn@ilshealth.com',
]);

export const normalizePortalEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const isBlockedPortalEmail = (email: unknown) => {
  const normalized = normalizePortalEmail(email);
  return normalized.length > 0 && BLOCKED_PORTAL_EMAILS.has(normalized);
};
