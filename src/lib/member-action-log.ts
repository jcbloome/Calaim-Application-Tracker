export const MEMBER_ACTION_KEYS = {
  ilsServiceStartedEmail: 'ils_service_started_email',
  claimsDepartmentEmail: 'claims_department_email',
  primaryContactEmail: 'primary_contact_email',
  caspioPush: 'caspio_push',
  staffAssigned: 'staff_assigned',
  eligibilityCheck: 'eligibility_check',
  kaiserStatusSelected: 'kaiser_status_selected',
} as const;

export type MemberActionKey = (typeof MEMBER_ACTION_KEYS)[keyof typeof MEMBER_ACTION_KEYS];

export type MemberActionLogEntry = {
  id: string;
  actionKey: MemberActionKey | string;
  label: string;
  atIso: string;
  byName?: string | null;
  byEmail?: string | null;
  byUid?: string | null;
  details?: string | null;
};

export function buildMemberActionLogEntry(params: {
  actionKey: MemberActionKey | string;
  label: string;
  atIso?: string;
  byName?: string | null;
  byEmail?: string | null;
  byUid?: string | null;
  details?: string | null;
}): MemberActionLogEntry {
  const atIso = String(params.atIso || new Date().toISOString()).trim() || new Date().toISOString();
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    id: `${params.actionKey}-${atIso}-${suffix}`,
    actionKey: params.actionKey,
    label: String(params.label || '').trim() || String(params.actionKey),
    atIso,
    byName: String(params.byName || '').trim() || null,
    byEmail: String(params.byEmail || '').trim() || null,
    byUid: String(params.byUid || '').trim() || null,
    details: String(params.details || '').trim() || null,
  };
}

export function getMemberActionLog(appData: any): MemberActionLogEntry[] {
  const raw = Array.isArray(appData?.memberActionLog) ? appData.memberActionLog : [];
  return raw
    .map((entry: any) => {
      const atIso = String(entry?.atIso || '').trim();
      const actionKey = String(entry?.actionKey || '').trim();
      const label = String(entry?.label || '').trim();
      if (!atIso || !actionKey || !label) return null;
      return {
        id: String(entry?.id || `${actionKey}-${atIso}`).trim(),
        actionKey,
        label,
        atIso,
        byName: String(entry?.byName || '').trim() || null,
        byEmail: String(entry?.byEmail || '').trim() || null,
        byUid: String(entry?.byUid || '').trim() || null,
        details: String(entry?.details || '').trim() || null,
      } as MemberActionLogEntry;
    })
    .filter(Boolean) as MemberActionLogEntry[];
}

function toIsoFromUnknown(value: unknown): string {
  if (!value) return '';
  try {
    if (typeof (value as any)?.toDate === 'function') {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : '';
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    }
    if (typeof value === 'object' && value && 'seconds' in (value as any)) {
      const seconds = Number((value as any).seconds);
      if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString();
    }
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } catch {
    return '';
  }
}

/** One historical entry per action key from last-* fields when the log does not already include that key. */
export function synthesizeLegacyMemberActions(appData: any): MemberActionLogEntry[] {
  const existing = getMemberActionLog(appData);
  const existingKeys = new Set(existing.map((e) => e.actionKey));
  const out: MemberActionLogEntry[] = [];

  const maybeAdd = (actionKey: MemberActionKey, label: string, atRaw: unknown, byName?: unknown, byEmail?: unknown, details?: string) => {
    if (existingKeys.has(actionKey)) return;
    const atIso = toIsoFromUnknown(atRaw);
    if (!atIso) return;
    out.push({
      id: `legacy-${actionKey}-${atIso}`,
      actionKey,
      label,
      atIso,
      byName: String(byName || '').trim() || null,
      byEmail: String(byEmail || '').trim() || null,
      byUid: null,
      details: details || null,
    });
  };

  maybeAdd(
    MEMBER_ACTION_KEYS.ilsServiceStartedEmail,
    'Email ILS: service started',
    appData?.ilsServiceStartedEmailLastSentAt,
    appData?.ilsServiceStartedEmailLastSentByName,
    appData?.ilsServiceStartedEmailLastSentByEmail,
    appData?.ilsServiceStartedEmailLastSentToIls
      ? `To ${appData.ilsServiceStartedEmailLastSentToIls}`
      : undefined
  );
  maybeAdd(
    MEMBER_ACTION_KEYS.claimsDepartmentEmail,
    'Email claims department',
    appData?.claimsDepartmentEmailLastSentAt,
    appData?.claimsDepartmentEmailLastSentByName,
    appData?.claimsDepartmentEmailLastSentByEmail,
    appData?.claimsDepartmentEmailLastSentTo
      ? `To ${appData.claimsDepartmentEmailLastSentTo}`
      : undefined
  );
  maybeAdd(
    MEMBER_ACTION_KEYS.primaryContactEmail,
    'Email primary contact',
    appData?.introEmailLastSentAt || appData?.introEmailLastSentDate,
    appData?.introEmailLastSentByName || appData?.introEmailLastSentByEmail,
    appData?.introEmailLastSentByEmail,
    appData?.introEmailLastSentTo ? `To ${appData.introEmailLastSentTo}` : undefined
  );
  maybeAdd(
    MEMBER_ACTION_KEYS.caspioPush,
    'Pushed CS Summary to Caspio',
    appData?.caspioSentDate || appData?.caspioLastPushedAt,
    appData?.caspioSentByName,
    appData?.caspioSentByEmail,
    appData?.client_ID2 || appData?.clientId2
      ? `Client_ID2 ${appData.client_ID2 || appData.clientId2}`
      : undefined
  );
  maybeAdd(
    MEMBER_ACTION_KEYS.staffAssigned,
    appData?.assignedStaffName
      ? `Assigned staff: ${appData.assignedStaffName}`
      : 'Assigned staff',
    appData?.assignedDate,
    appData?.assignedStaffName,
    appData?.assignedStaffEmail
  );
  maybeAdd(
    MEMBER_ACTION_KEYS.eligibilityCheck,
    appData?.calaimTrackingStatus
      ? `Eligibility check: ${appData.calaimTrackingStatus}`
      : 'Eligibility check',
    appData?.lastEligibilityCheckAt || appData?.lastEligibilityCheckDate,
    undefined,
    undefined,
    appData?.calaimTrackingStatus || undefined
  );
  const kaiserStatusValue = String(appData?.kaiserStatus || appData?.Kaiser_Status || '').trim();
  if (kaiserStatusValue) {
    maybeAdd(
      MEMBER_ACTION_KEYS.kaiserStatusSelected,
      `Kaiser status: ${kaiserStatusValue}`,
      appData?.kaiserPrePushStatusPickedAt ||
        appData?.kaiserStatusSyncedFromCacheAt ||
        appData?.kaiserStatusUpdatedAt,
      undefined,
      undefined,
      kaiserStatusValue
    );
  }

  return out;
}
