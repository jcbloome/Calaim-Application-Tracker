export const HARD_CODED_ADMIN_EMAILS = ['jason@carehomefinders.com'];

export const isHardcodedAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return HARD_CODED_ADMIN_EMAILS.includes(email.toLowerCase());
};
