export type SwAssignmentHistoryEntry = {
  atIso: string;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail: string;
  toName?: string | null;
  byEmail?: string | null;
  byName?: string | null;
  reason?: string | null;
  inviteSent?: boolean;
};

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

export function normalizeSwEmail(email: unknown): string {
  return clean(email, 220).toLowerCase();
}

export function swEmailsDiffer(a: unknown, b: unknown): boolean {
  const left = normalizeSwEmail(a);
  const right = normalizeSwEmail(b);
  if (!left || !right) return Boolean(left || right);
  return left !== right;
}

export function buildSwAssignmentHistoryEntry(input: {
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail: string;
  toName?: string | null;
  byEmail?: string | null;
  byName?: string | null;
  reason?: string | null;
  inviteSent?: boolean;
  atIso?: string;
}): SwAssignmentHistoryEntry | null {
  const toEmail = normalizeSwEmail(input.toEmail);
  if (!toEmail) return null;
  return {
    atIso: clean(input.atIso) || new Date().toISOString(),
    fromEmail: normalizeSwEmail(input.fromEmail) || null,
    fromName: clean(input.fromName, 160) || null,
    toEmail,
    toName: clean(input.toName, 160) || null,
    byEmail: normalizeSwEmail(input.byEmail) || null,
    byName: clean(input.byName, 160) || null,
    reason: clean(input.reason, 80) || null,
    inviteSent: Boolean(input.inviteSent),
  };
}

export function parseSwAssignmentHistory(raw: unknown): SwAssignmentHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SwAssignmentHistoryEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const parsed = buildSwAssignmentHistoryEntry(entry as any);
    if (parsed) out.push(parsed);
  }
  return out.sort((a, b) => Date.parse(a.atIso || '') - Date.parse(b.atIso || ''));
}

/** Last email that actually received an SW invite (delivery log / activity), not the currently assigned SW. */
export function resolveLastInvitedSwEmail(assignment: Record<string, any> | null | undefined): string {
  if (!assignment) return '';
  const invites = assignment.workflowInvites && typeof assignment.workflowInvites === 'object'
    ? assignment.workflowInvites
    : {};
  const fromInvites =
    normalizeSwEmail(invites.lastInvitedToEmail) || normalizeSwEmail(invites.invitedToEmail);
  if (fromInvites) return fromInvites;

  const emailLog = Array.isArray(assignment.swEmailDeliveryLog) ? assignment.swEmailDeliveryLog : [];
  const sent = emailLog
    .filter((entry: any) => clean(entry?.status).toLowerCase() === 'sent' && normalizeSwEmail(entry?.recipientEmail))
    .slice()
    .sort(
      (a: any, b: any) =>
        Date.parse(clean(a?.atIso) || '') - Date.parse(clean(b?.atIso) || '')
    );
  if (sent.length) return normalizeSwEmail(sent[sent.length - 1]?.recipientEmail);

  const activity = Array.isArray(assignment.ispWorkflowActivityLog)
    ? assignment.ispWorkflowActivityLog
    : [];
  const inviteEvents = activity
    .filter(
      (entry: any) =>
        clean(entry?.event) === 'sw_invite_sent' && normalizeSwEmail(entry?.recipientEmail)
    )
    .slice()
    .sort(
      (a: any, b: any) =>
        Date.parse(clean(a?.atIso) || '') - Date.parse(clean(b?.atIso) || '')
    );
  if (inviteEvents.length) {
    return normalizeSwEmail(inviteEvents[inviteEvents.length - 1]?.recipientEmail);
  }
  return '';
}

export function formatSwAssignmentHistoryLabel(entry: SwAssignmentHistoryEntry): string {
  const from =
    clean(entry.fromName) || clean(entry.fromEmail) || (entry.fromEmail ? entry.fromEmail : 'Unassigned');
  const to = clean(entry.toName) || clean(entry.toEmail) || entry.toEmail;
  const when = entry.atIso
    ? (() => {
        const d = new Date(entry.atIso);
        return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
      })()
    : '';
  const by = clean(entry.byName) || clean(entry.byEmail);
  const parts = [`${from} → ${to}`];
  if (when) parts.push(when);
  if (by) parts.push(`by ${by}`);
  if (entry.inviteSent) parts.push('invite sent');
  return parts.join(' · ');
}

/**
 * Prefer stored swAssignmentHistory; if empty, synthesize transitions from invite delivery log
 * so older members still show SW reassignment history in ISP Tracker Details.
 */
export function buildDisplaySwAssignmentHistory(
  assignment: Record<string, any> | null | undefined
): SwAssignmentHistoryEntry[] {
  const stored = parseSwAssignmentHistory(assignment?.swAssignmentHistory);
  if (stored.length) return stored;

  const emailLog = Array.isArray(assignment?.swEmailDeliveryLog) ? assignment!.swEmailDeliveryLog : [];
  const sent = emailLog
    .filter((entry: any) => clean(entry?.status).toLowerCase() === 'sent' && normalizeSwEmail(entry?.recipientEmail))
    .slice()
    .sort(
      (a: any, b: any) =>
        Date.parse(clean(a?.atIso) || '') - Date.parse(clean(b?.atIso) || '')
    );
  const out: SwAssignmentHistoryEntry[] = [];
  let prevEmail = '';
  for (const entry of sent) {
    const toEmail = normalizeSwEmail(entry?.recipientEmail);
    if (!toEmail) continue;
    if (prevEmail && prevEmail === toEmail) continue;
    if (!prevEmail) {
      prevEmail = toEmail;
      continue;
    }
    const built = buildSwAssignmentHistoryEntry({
      fromEmail: prevEmail,
      toEmail,
      byEmail: clean(entry?.triggeredByEmail, 220) || null,
      byName: clean(entry?.triggeredByName, 160) || null,
      reason: 'invite_reassign',
      inviteSent: true,
      atIso: clean(entry?.atIso) || new Date().toISOString(),
    });
    if (built) out.push(built);
    prevEmail = toEmail;
  }
  return out;
}
