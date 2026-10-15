export type PortalAccessPerson = {
  email: string;
  name?: string;
  canUpload: boolean;
  role?: 'primary' | 'secondary' | 'uploader' | 'viewer';
  addedAtIso?: string | null;
  addedByEmail?: string | null;
};

export function normalizePortalEmail(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function emailsFromPossiblyList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePortalEmail(item)).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((part) => normalizePortalEmail(part))
    .filter(Boolean);
}

/** All emails currently allowed to claim/open this application in the family portal. */
export function collectPortalAuthorizedEmails(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return [];
  const people = Array.isArray(data.portalAccessPeople)
    ? (data.portalAccessPeople as Array<Record<string, unknown>>)
    : [];
  const fromPeople = people
    .map((person) => normalizePortalEmail(person?.email))
    .filter(Boolean);
  const set = new Set<string>([
    ...emailsFromPossiblyList(data.portalAuthorizedEmails),
    ...fromPeople,
    normalizePortalEmail(data.bestContactEmail),
    normalizePortalEmail(data.bestContactEmailLower),
    normalizePortalEmail(data.secondaryContactEmail),
    normalizePortalEmail(data.linkedToFamilyEmail),
    ...emailsFromPossiblyList(data.introEmailLastSentTo),
    ...emailsFromPossiblyList(data.introEmailRecipientEmails),
  ]);
  set.delete('');
  return Array.from(set);
}

export function hasPortalAuthorizedEmail(
  data: Record<string, unknown> | null | undefined,
  email: unknown
): boolean {
  const normalized = normalizePortalEmail(email);
  if (!normalized) return false;
  return collectPortalAuthorizedEmails(data).includes(normalized);
}

function looksLikePortalMailbox(email: string): boolean {
  const value = normalizePortalEmail(email);
  if (!value || !value.includes('@')) return false;
  if (value === 'n/a' || value === 'na' || value === 'none' || value === 'null') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Extra recipients to CC when emailing the primary / family contact.
 * Includes secondaryContactEmail and other portalAccessPeople (not already on To).
 */
export function collectPrimaryContactCcEmails(
  data: Record<string, unknown> | null | undefined,
  toEmails: unknown = []
): string[] {
  if (!data) return [];
  const excluded = new Set<string>([
    ...emailsFromPossiblyList(toEmails),
    normalizePortalEmail(data.bestContactEmail),
    normalizePortalEmail(data.bestContactEmailLower),
  ]);
  excluded.delete('');

  const candidates = new Map<string, string>();
  const add = (raw: unknown) => {
    const email = normalizePortalEmail(raw);
    if (!looksLikePortalMailbox(email) || excluded.has(email)) return;
    if (!candidates.has(email)) candidates.set(email, email);
  };

  add(data.secondaryContactEmail);
  normalizePortalAccessPeople(data.portalAccessPeople).forEach((person) => {
    const email = normalizePortalEmail(person.email);
    if (!email || excluded.has(email)) return;
    // Primary role on the list is the family contact; everyone else is a copy recipient.
    if (person.role === 'primary') return;
    add(email);
  });

  return Array.from(candidates.values());
}

export function mergePortalAuthorizedEmails(
  existing: unknown,
  additions: unknown
): string[] {
  const set = new Set<string>([
    ...emailsFromPossiblyList(existing),
    ...emailsFromPossiblyList(additions),
  ]);
  set.delete('');
  return Array.from(set);
}

export function upsertPortalAccessPerson(
  existing: unknown,
  person: PortalAccessPerson
): PortalAccessPeople {
  const email = normalizePortalEmail(person.email);
  if (!email) return normalizePortalAccessPeople(existing);
  const next = normalizePortalAccessPeople(existing).filter((row) => row.email !== email);
  const name = String(person.name || '').trim();
  next.push(
    sanitizePortalAccessPerson({
      email,
      ...(name ? { name } : {}),
      canUpload: person.canUpload !== false,
      role: person.role || 'uploader',
      addedAtIso: person.addedAtIso || new Date().toISOString(),
      addedByEmail: person.addedByEmail || null,
    })
  );
  return next;
}

export type PortalAccessPeople = PortalAccessPerson[];

/** Firestore-safe person object (no undefined fields). */
export function sanitizePortalAccessPerson(person: PortalAccessPerson): PortalAccessPerson {
  const email = normalizePortalEmail(person.email);
  const name = String(person.name || '').trim();
  const addedAtIso = String(person.addedAtIso || '').trim() || null;
  const addedByEmail = normalizePortalEmail(person.addedByEmail) || null;
  return {
    email,
    ...(name ? { name } : {}),
    canUpload: person.canUpload !== false,
    role: person.role || 'uploader',
    addedAtIso,
    addedByEmail,
  };
}

export function normalizePortalAccessPeople(value: unknown): PortalAccessPeople {
  if (!Array.isArray(value)) return [];
  const byEmail = new Map<string, PortalAccessPerson>();
  value.forEach((raw) => {
    const row = (raw || {}) as Record<string, unknown>;
    const email = normalizePortalEmail(row.email);
    if (!email) return;
    byEmail.set(
      email,
      sanitizePortalAccessPerson({
        email,
        name: String(row.name || '').trim() || undefined,
        canUpload: row.canUpload !== false,
        role: (String(row.role || 'uploader').trim() as PortalAccessPerson['role']) || 'uploader',
        addedAtIso: String(row.addedAtIso || '').trim() || null,
        addedByEmail: String(row.addedByEmail || '').trim() || null,
      })
    );
  });
  return Array.from(byEmail.values());
}
