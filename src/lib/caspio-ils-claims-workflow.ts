export const CASPIO_ILS_INFORMED_YES = 'Yes';
export const CASPIO_CLAIMS_DEPT_STATUS_VALUE = '🟢';

export function extractApplicationTimestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsedNumeric = Number(trimmed);
      if (Number.isFinite(parsedNumeric) && parsedNumeric > 0) {
        return Math.round(parsedNumeric);
      }
    }
    const parsed = new Date(trimmed).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (value && typeof value === 'object') {
    const ts = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof ts.toMillis === 'function') {
      const ms = Number(ts.toMillis());
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof ts.toDate === 'function') {
      const ms = ts.toDate().getTime();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    const seconds = typeof ts.seconds === 'number' ? ts.seconds : ts._seconds;
    if (typeof seconds === 'number' && seconds > 0) return seconds * 1000;
  }
  return 0;
}

export function shouldApplyIlsClaimsCaspioWorkflowFields(
  app: Record<string, unknown> | null | undefined
): boolean {
  const ilsSent = extractApplicationTimestampMs(app?.ilsServiceStartedEmailLastSentAt) > 0;
  const claimsSent = extractApplicationTimestampMs(app?.claimsDepartmentEmailLastSentAt) > 0;
  return ilsSent && claimsSent;
}

export function resolveIlsInformedDateForCaspio(app: Record<string, unknown>): string {
  const ms = extractApplicationTimestampMs(app?.ilsServiceStartedEmailLastSentAt);
  if (!ms) return '';
  const date = new Date(ms);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export type ApplyIlsClaimsWorkflowParams = {
  memberData: Record<string, unknown>;
  applicationData: Record<string, unknown>;
  resolveTableField: (candidates: string[]) => string;
};

export function applyIlsClaimsWorkflowFieldsToMemberData(
  params: ApplyIlsClaimsWorkflowParams
): string[] {
  const { memberData, applicationData, resolveTableField } = params;
  const applied: string[] = [];
  if (!shouldApplyIlsClaimsCaspioWorkflowFields(applicationData)) return applied;

  const ilsInformedDate = resolveIlsInformedDateForCaspio(applicationData);
  const fieldMappings: Array<{ candidates: string[]; value: string }> = [
    { candidates: ['Deydry_Notified'], value: CASPIO_CLAIMS_DEPT_STATUS_VALUE },
    {
      candidates: ['Deydry_Confirmed', 'Deydry_Notified_Confirmed'],
      value: CASPIO_CLAIMS_DEPT_STATUS_VALUE,
    },
    { candidates: ['ILS_Informed'], value: CASPIO_ILS_INFORMED_YES },
    { candidates: ['ILS_Informed_Date'], value: ilsInformedDate },
  ];

  for (const { candidates, value } of fieldMappings) {
    if (!value) continue;
    const fieldName = resolveTableField(candidates);
    if (!fieldName) continue;
    memberData[fieldName] = value;
    applied.push(fieldName);
  }
  return applied;
}

export async function pushIlsClaimsWorkflowToCaspio(params: {
  application: Record<string, unknown>;
}): Promise<{ success: boolean; message?: string }> {
  const app = params.application;
  if (!shouldApplyIlsClaimsCaspioWorkflowFields(app)) {
    return {
      success: false,
      message: 'Both ILS service started and claims department emails must be sent.',
    };
  }
  if (!app.caspioSent) {
    return { success: false, message: 'Member has not been pushed to Caspio yet.' };
  }

  const clientId2 = String(
    app.clientId2 || app.client_ID2 || app.Client_ID2 || app.caspioClientId2 || ''
  ).trim();
  if (!clientId2) {
    return { success: false, message: 'No Client_ID2 available for Caspio update.' };
  }

  const response = await fetch('/api/admin/caspio/push-cs-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicationData: {
        ...app,
        clientId2,
        client_ID2: clientId2,
        Client_ID2: clientId2,
        caspioClientId2: clientId2,
      },
      mapping: null,
      updateExistingOnly: true,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    return {
      success: false,
      message: String(payload?.message || 'Unable to sync ILS/claims workflow fields to Caspio.'),
    };
  }
  return { success: true };
}

export async function maybeSyncIlsClaimsWorkflowToCaspio(
  application: Record<string, unknown>,
  overrides?: Record<string, unknown>
): Promise<{ synced: boolean; success?: boolean; message?: string }> {
  const merged = { ...application, ...(overrides || {}) };
  if (!shouldApplyIlsClaimsCaspioWorkflowFields(merged)) {
    return { synced: false };
  }
  const result = await pushIlsClaimsWorkflowToCaspio({ application: merged });
  return { synced: true, ...result };
}
