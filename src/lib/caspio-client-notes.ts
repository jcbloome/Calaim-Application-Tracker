import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

const clean = (value: unknown, max = 2000) => {
  const next = String(value ?? '').trim();
  return next.length > max ? next.slice(0, max) : next;
};

const hasValue = (value: unknown) => clean(value).length > 0;

async function resolveClientNotesUserId(params: {
  baseUrl: string;
  token: string;
  clientId2: string;
  preferredUserId?: string;
}): Promise<number> {
  const preferredNumeric = Number.parseInt(clean(params.preferredUserId, 40), 10);
  if (Number.isFinite(preferredNumeric) && preferredNumeric > 0) return preferredNumeric;

  try {
    const q = encodeURIComponent(`Client_ID2=${clean(params.clientId2, 80)}`);
    const url = `${params.baseUrl}/tables/connect_tbl_clientnotes/records?q.where=${q}&q.orderBy=Time_Stamp DESC&q.limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
      cache: 'no-store',
    });
    if (response.ok) {
      const json = await response.json().catch(() => ({} as any));
      const row = Array.isArray(json?.Result) ? json.Result[0] : null;
      const parsed = Number.parseInt(clean(row?.User_ID, 40), 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // fall through
  }
  return 1;
}

export type AppendCaspioClientNoteResult = {
  success: boolean;
  skipped?: boolean;
  reason?: 'inserted' | 'missing-client-id2' | 'missing-comments' | 'insert-failed';
  error?: string;
};

/**
 * Append a row to Caspio `connect_tbl_clientnotes` (same table as pathway / family-status notes).
 */
export async function appendCaspioClientNote(params: {
  clientId2?: string | null;
  comments: string;
  preferredUserId?: string | null;
  assignedStaffName?: string | null;
  sourceTag?: string | null;
}): Promise<AppendCaspioClientNoteResult> {
  const clientId2 = clean(params.clientId2, 80);
  if (!clientId2) {
    return { success: false, skipped: true, reason: 'missing-client-id2' };
  }
  const commentsBase = clean(params.comments, 1800);
  if (!commentsBase) {
    return { success: true, skipped: true, reason: 'missing-comments' };
  }
  const sourceTag = clean(params.sourceTag, 120);
  const comments = sourceTag ? `${commentsBase} [${sourceTag}]` : commentsBase;

  try {
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);
    const resolvedUserId = await resolveClientNotesUserId({
      baseUrl: credentials.baseUrl,
      token,
      clientId2,
      preferredUserId: clean(params.preferredUserId, 40) || undefined,
    });

    const basePayload: Record<string, any> = {
      Client_ID2: /^\d+$/.test(clientId2) ? Number(clientId2) : clientId2,
      User_ID: resolvedUserId,
      Comments: comments,
      Time_Stamp: new Date().toISOString(),
    };
    const payload: Record<string, any> = {
      ...basePayload,
      Follow_Up_Status: '🟢Open',
    };
    if (hasValue(params.preferredUserId)) payload.Follow_Up_Assignment = clean(params.preferredUserId, 80);
    if (hasValue(params.assignedStaffName)) {
      payload.Assigned_First = clean(params.assignedStaffName, 120);
      payload.User_Full_Name = clean(params.assignedStaffName, 120);
    }

    const insertUrl = `${credentials.baseUrl}/tables/connect_tbl_clientnotes/records`;
    const postNote = async (notePayload: Record<string, any>) => {
      const insertResponse = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notePayload),
      });
      if (insertResponse.ok) return { ok: true as const, errorText: '' };
      const errorText = await insertResponse.text().catch(() => '');
      return {
        ok: false as const,
        errorText: `Caspio note insert failed: ${insertResponse.status} ${errorText}`,
      };
    };

    const firstAttempt = await postNote(payload);
    if (firstAttempt.ok) return { success: true, reason: 'inserted' };

    const fallbackAttempt = await postNote(basePayload);
    if (fallbackAttempt.ok) return { success: true, reason: 'inserted' };

    const secondFallbackPayload = { ...basePayload };
    delete secondFallbackPayload.Time_Stamp;
    const secondFallback = await postNote(secondFallbackPayload);
    if (secondFallback.ok) return { success: true, reason: 'inserted' };

    return {
      success: false,
      reason: 'insert-failed',
      error: [firstAttempt.errorText, fallbackAttempt.errorText, secondFallback.errorText]
        .filter(Boolean)
        .join(' | '),
    };
  } catch (error: any) {
    return {
      success: false,
      reason: 'insert-failed',
      error: String(error?.message || 'unknown'),
    };
  }
}

/** Family-status / pathway labels that should create RN visit Caspio notes. */
export function isRnVisitScheduledStatus(status: string): boolean {
  const s = clean(status).toLowerCase();
  return (
    s === 'rn/msw visit scheduled' ||
    s === 'rn/visit scheduled' ||
    s === 'rn/msw scheduled' ||
    s === 'rn isp scheduled' ||
    s.includes('visit scheduled')
  );
}

export function isRnVisitSubmittedOrCompleteStatus(status: string): boolean {
  const s = clean(status).toLowerCase();
  return (
    s === 'rn/msw visit complete' ||
    s === 'rn visit complete' ||
    s === 'rn isp complete' ||
    s === 'rn visit submitted' ||
    s.includes('visit complete') ||
    s.includes('visit submitted')
  );
}
