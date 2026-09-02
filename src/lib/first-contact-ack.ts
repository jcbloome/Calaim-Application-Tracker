/** Helpers for staff assignment acknowledgement on Kaiser Need First Contact apps.
 *  Admin assigns staff separately; assigned staff opens the record and acknowledges.
 *  Unacknowledged assignments stay on the daily reminder list.
 */

export const normalizeKaiserStatusKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isNeedFirstContactKaiserStatus = (value: unknown) => {
  const key = normalizeKaiserStatusKey(value);
  if (!key) return false;
  return (
    key === 't2038 received need first contact' ||
    key === 't2038 received needs first contact' ||
    (key.includes('t2038') && key.includes('need') && key.includes('first contact'))
  );
};

export const getApplicationKaiserStatus = (app: Record<string, any> | null | undefined) =>
  String(app?.kaiserStatus || app?.Kaiser_Status || '').trim();

export const shouldTrackFirstContactAck = (app: Record<string, any> | null | undefined) => {
  if (!app) return false;
  const plan = String(app.healthPlan || '').trim().toLowerCase();
  if (!plan.includes('kaiser')) return false;
  const assigned = Boolean(String(app.assignedStaffId || '').trim() || String(app.assignedStaffName || '').trim());
  if (!assigned) return false;
  return isNeedFirstContactKaiserStatus(getApplicationKaiserStatus(app));
};

export const isFirstContactAcknowledged = (app: Record<string, any> | null | undefined) =>
  Boolean(app?.firstContactAcknowledged);

/** True when the signed-in user is the application's assigned staff member. */
export const isUserAssignedStaffForApp = (
  app: Record<string, any> | null | undefined,
  userId: string | null | undefined
) => {
  const assignedId = String(app?.assignedStaffId || '').trim();
  const uid = String(userId || '').trim();
  if (!assignedId || !uid) return false;
  return assignedId === uid;
};

/** @deprecated kept for older records; UI no longer uses in-progress. */
export const isFirstContactInProgress = (app: Record<string, any> | null | undefined) =>
  Boolean(app?.firstContactInProgress);

/** Reset acknowledgement when (re)assigning staff on a Need First Contact member. */
export function buildFirstContactAckResetFields(params?: {
  assignedByName?: string;
  assignedAtIso?: string;
}) {
  const assignedAtIso = params?.assignedAtIso || new Date().toISOString();
  return {
    firstContactAcknowledged: false,
    firstContactAcknowledgedAt: null,
    firstContactAcknowledgedBy: null,
    firstContactAcknowledgedByUid: null,
    firstContactInProgress: false,
    firstContactInProgressAt: null,
    firstContactInProgressBy: null,
    firstContactAssignedAt: assignedAtIso,
    firstContactStaffReminderLastSentAt: null,
  };
}
