import { isHardcodedAdminEmail } from '@/lib/admin-emails';

/**
 * Connections staff emails that must never use /sw-login for RN ALFT assessor work.
 * These people use Admin / Staff Management login instead.
 */
export const RN_PORTAL_EXCLUDED_STAFF_EMAILS = new Set([
  'leslie@carehomefinders.com',
  'jason@carehomefinders.com',
  'john@carehomefinders.com',
]);

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

/** True when this email must not get Social Worker portal access as an RN. */
export function isRnPortalExcludedStaffEmail(email: unknown): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes('@')) return true;
  if (isHardcodedAdminEmail(normalized)) return true;
  if (RN_PORTAL_EXCLUDED_STAFF_EMAILS.has(normalized)) return true;
  // Connections office domain — staff use Admin login, not /sw-login.
  if (normalized.endsWith('@carehomefinders.com')) return true;
  return false;
}

/** Eligible Caspio RN emails for /sw-login portal access. */
export function isEligibleRnPortalEmail(email: unknown): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized.includes('@')) return false;
  return !isRnPortalExcludedStaffEmail(normalized);
}
