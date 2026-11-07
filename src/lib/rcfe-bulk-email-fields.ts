import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

/**
 * Caspio RCFE contact fields used by RCFE Bulk Email / RCFE Data:
 * - Name: RCFE_Name
 * - Emails (may be more than one): RCFE_Admin_Email, RCFE_Administrator_Email,
 *   CalAIM_RCFE_Owner_Email / RCFE_Owner_Email, plus registration contacts
 */

export const normalizeEmail = (value: unknown) => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw || !raw.includes('@')) return '';
  return raw;
};

/** Split a Caspio email cell that may contain multiple addresses. */
export function splitEmailList(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const parts = raw.split(/[;,|/]+|\s+/g).map((p) => normalizeEmail(p)).filter(Boolean);
  return [...new Set(parts)];
}

export const normalizeLookupToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Always from Caspio RCFE_Name (drops CalAIM_Use placeholders only). */
export function extractMemberRcfeName(member: Record<string, unknown> | null | undefined): string {
  if (!member) return '';
  return String(normalizeRcfeNameForAssignment(member.RCFE_Name) || '').trim();
}

/** All member-side RCFE emails used for bulk / verification outreach. */
export function extractMemberRcfeEmails(member: Record<string, unknown> | null | undefined): string[] {
  if (!member) return [];
  const out: string[] = [];
  const add = (value: unknown) => {
    for (const email of splitEmailList(value)) {
      if (!out.includes(email)) out.push(email);
    }
  };
  // RCFE_Admin_Email first (Bulk RCFE Email / RCFE Data admin contact — may be multi).
  add(member.RCFE_Admin_Email);
  add(member.RCFE_Administrator_Email);
  add(member.RCFE_AdminEmail);
  add(member.CalAIM_RCFE_Owner_Email);
  add(member.RCFE_Owner_Email);
  add(member.CalAIM_RCFE_OwnerEmail);
  return out;
}

export function extractRegistrationEmails(record: Record<string, unknown>): string[] {
  const keys = [
    'RCFE_Admin_Email',
    'RCFE_Administrator_Email',
    'RCFE_Registered_User_Email',
    'RCFE_Registered_UserEmail',
    'CalAIM_RCFE_Owner_Email',
    'RCFE_Owner_Email',
    'Email',
  ];
  const emails: string[] = [];
  for (const key of keys) {
    for (const email of splitEmailList(record[key])) {
      if (!emails.includes(email)) emails.push(email);
    }
  }
  return emails;
}

/**
 * Build RCFE_Name / Registered_ID → email list indexes from members + registration rows.
 */
export function buildRcfeBulkEmailIndexes(
  members: Array<Record<string, unknown>>,
  registrations: Array<Record<string, unknown>> = []
) {
  const emailsByName = new Map<string, string[]>();
  const emailsByRegisteredId = new Map<string, string[]>();
  const nameByRegisteredId = new Map<string, string>();

  const merge = (map: Map<string, string[]>, key: string, emails: string[]) => {
    if (!key || !emails.length) return;
    const existing = map.get(key) || [];
    for (const email of emails) {
      if (!existing.includes(email)) existing.push(email);
    }
    map.set(key, existing);
  };

  for (const member of members) {
    const emails = extractMemberRcfeEmails(member);
    const rid = String(member.RCFE_Registered_ID || '').trim();
    const rcfeName = extractMemberRcfeName(member);
    const nameToken = normalizeLookupToken(rcfeName);
    if (rid && rcfeName && !nameByRegisteredId.has(rid)) nameByRegisteredId.set(rid, rcfeName);
    merge(emailsByRegisteredId, rid, emails);
    merge(emailsByName, nameToken, emails);
  }

  for (const record of registrations) {
    const emails = extractRegistrationEmails(record);
    const rid = String(
      record.RCFE_Registered_ID ||
        record.User_Registered_For_RCFE_ID ||
        record.RCFE_ID ||
        record.RCFE_ID2 ||
        ''
    ).trim();
    const rcfeName = String(record.RCFE_Name || record['RCFE Name'] || record.RCFE || '').trim();
    const nameToken = normalizeLookupToken(rcfeName);
    if (rid && rcfeName && !nameByRegisteredId.has(rid)) nameByRegisteredId.set(rid, rcfeName);
    merge(emailsByRegisteredId, rid, emails);
    merge(emailsByName, nameToken, emails);
  }

  return { emailsByName, emailsByRegisteredId, nameByRegisteredId };
}

export type RcfeBulkEmailIndexes = ReturnType<typeof buildRcfeBulkEmailIndexes>;

/** Resolve RCFE_Name + all bulk emails for one member. */
export function resolveRcfeBulkEmailContact(
  member: Record<string, unknown>,
  indexes: RcfeBulkEmailIndexes
): { rcfeName: string; emails: string[] } {
  const rid = String(member.RCFE_Registered_ID || '').trim();
  let rcfeName = extractMemberRcfeName(member);
  if (!rcfeName && rid && indexes.nameByRegisteredId.has(rid)) {
    rcfeName = indexes.nameByRegisteredId.get(rid) || '';
  }

  const emails: string[] = [];
  const addAll = (list: string[] | undefined) => {
    for (const email of list || []) {
      if (email && !emails.includes(email)) emails.push(email);
    }
  };

  addAll(extractMemberRcfeEmails(member));
  if (rid) addAll(indexes.emailsByRegisteredId.get(rid));
  const nameToken = normalizeLookupToken(rcfeName);
  if (nameToken) addAll(indexes.emailsByName.get(nameToken));

  return { rcfeName, emails };
}

/** Join emails for a single display / CSV cell. */
export function joinRcfeEmails(emails: string[]): string {
  return [...new Set(emails.map(normalizeEmail).filter(Boolean))].join('; ');
}
