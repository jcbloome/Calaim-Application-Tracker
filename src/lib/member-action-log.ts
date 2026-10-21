export const MEMBER_ACTION_KEYS = {
  ilsServiceStartedEmail: 'ils_service_started_email',
  claimsDepartmentEmail: 'claims_department_email',
  primaryContactEmail: 'primary_contact_email',
  primaryContactEmailStaffGmail: 'primary_contact_email_staff_gmail',
  caspioPush: 'caspio_push',
  staffAssigned: 'staff_assigned',
  eligibilityCheck: 'eligibility_check',
  kaiserStatusSelected: 'kaiser_status_selected',
  autoDocumentReminder: 'auto_document_reminder',
  proofIncomeAutoReminder: 'proof_income_auto_reminder',
  familyStatusReminder: 'family_status_reminder',
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
      ? `Sent to staff: ${appData.assignedStaffName}`
      : 'Sent to staff',
    appData?.staffAssignmentNotifiedAt || appData?.assignedDate,
    appData?.assignedByName || appData?.staffAssignedByName,
    appData?.assignedByEmail || appData?.staffAssignedByEmail,
    appData?.assignedStaffEmail ? `To ${appData.assignedStaffEmail}` : undefined
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

  maybeAdd(
    MEMBER_ACTION_KEYS.autoDocumentReminder,
    'Auto reminder: pending documents email sent',
    appData?.emailReminderLastSentAt,
    'System',
    null,
    appData?.bestContactEmail || appData?.referrerEmail
      ? `To ${appData.bestContactEmail || appData.referrerEmail}`
      : undefined
  );

  const proofStatus = String(appData?.proofIncomeReminderLastStatus || '').trim();
  maybeAdd(
    MEMBER_ACTION_KEYS.proofIncomeAutoReminder,
    proofStatus === 'expired'
      ? 'Auto reminder: proof of income expired'
      : proofStatus === 'due-soon'
        ? 'Auto reminder: proof of income due soon'
        : 'Auto reminder: proof of income',
    appData?.proofIncomeReminderLastSentAt,
    'System',
    null,
    [
      appData?.proofIncomeReminderRecipientEmail
        ? `To ${appData.proofIncomeReminderRecipientEmail}`
        : '',
      appData?.proofIncomeReminderLastDocumentDate
        ? `Document date ${appData.proofIncomeReminderLastDocumentDate}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  );

  // Family status / auto status emails — one entry per history row when not already logged.
  const familyHistory = Array.isArray(appData?.familyStatusReminderHistory)
    ? appData.familyStatusReminderHistory
    : [];
  familyHistory.forEach((row: any, index: number) => {
    const atIso = toIsoFromUnknown(row?.sentAtIso || row?.sentAtMs);
    if (!atIso) return;
    const alreadyLogged = existing.some(
      (e) =>
        e.actionKey === MEMBER_ACTION_KEYS.familyStatusReminder &&
        e.atIso === atIso
    );
    if (alreadyLogged) return;
    const status = String(row?.status || '').trim() || 'Status update';
    const trigger = String(row?.trigger || '').trim();
    out.push({
      id: `legacy-family-status-${atIso}-${index}`,
      actionKey: MEMBER_ACTION_KEYS.familyStatusReminder,
      label:
        trigger === 'manual'
          ? `Family status email: ${status}`
          : `Auto reminder: family status — ${status}`,
      atIso,
      byName: String(row?.sentByName || 'System').trim() || 'System',
      byEmail: null,
      byUid: String(row?.sentByUid || '').trim() || null,
      details: [
        row?.to ? `To ${row.to}` : '',
        row?.reason ? `Reason: ${row.reason}` : '',
        trigger ? `Trigger: ${trigger}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || null,
    });
  });

  return out;
}
