import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

const normalize = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const DEFAULT_EMAIL_SUBJECT_TEMPLATE = 'Biweekly ILS follow-up for {{rcfeName}}';
const DEFAULT_EMAIL_BODY_TEMPLATE = [
  'Hello {{rcfeAdminName}},',
  '',
  'This is our biweekly care coordination follow-up for Kaiser members at {{rcfeName}}.',
  'Please confirm whether ILS has connected yet for each member below and let us know if any issues need support.',
  '',
  '{{memberList}}',
  '',
  '{{deydryReplyLinkList}}',
  '',
  'This outreach continues while each member has an active T2038 authorization.',
  '',
  'Thank you,',
  'Connections CalAIM Care Coordination',
].join('\n');
const DEFAULT_CADENCE_DAYS = 14;
const DEYDRY_EMAIL = 'deydry@carehomefinders.com';

type EligibleMember = {
  clientId2: string;
  fullName: string;
  kaiserStatus: string;
  rcfeName: string;
  rcfeAdminEmail: string;
  rcfeAdminName: string;
  authorizationEndT2038: string;
};

type RetryQueueItem = {
  clientId2: string;
  fullName: string;
  kaiserStatus: string;
  rcfeName: string;
  rcfeAdminEmail: string;
  rcfeAdminName: string;
  authorizationEndT2038: string;
  sentAtIso: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string;
  status: 'pending' | 'failed' | 'completed';
};

const RETRY_QUEUE_COLLECTION = 'kaiser_rcfe_note_retry_queue';
const AUDIT_COLLECTION = 'kaiser_rcfe_followup_audit';
const MAX_RETRY_ATTEMPTS = 6;

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

const isBiweeklyFollowupStatus = (statusValue: unknown) => {
  const status = normalize(statusValue);
  return (
    status === 'r b sent pending ils contract' ||
    status === 'final member at rcfe'
  );
};

const toDateOrNull = (value: unknown): Date | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const isUnexpiredT2038 = (value: unknown) => {
  const parsed = toDateOrNull(value);
  if (!parsed) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return endDay >= today;
};

const renderTemplate = (template: string, data: Record<string, string>) => {
  let rendered = String(template || '');
  Object.entries(data).forEach(([key, value]) => {
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
  });
  return rendered;
};

const toRcfeKey = (rcfeName: string, rcfeAdminEmail: string) =>
  `${String(rcfeName || '').trim().toLowerCase()}|${String(rcfeAdminEmail || '').trim().toLowerCase()}`;

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function getCaspioContext() {
  const config = getCaspioServerConfig();
  const token = await getCaspioServerAccessToken(config);
  return { restBaseUrl: config.restBaseUrl, token };
}

async function resolveCaspioUserIdForClient(params: { restBaseUrl: string; token: string; clientId2: string }) {
  const envFallback = Number.parseInt(String(process.env.CASPIO_NOTES_DEFAULT_USER_ID || '').trim(), 10);
  if (Number.isFinite(envFallback) && envFallback > 0) return envFallback;
  const whereClause = `Client_ID2='${params.clientId2}'`;
  const url =
    `${params.restBaseUrl}/tables/connect_tbl_clientnotes/records` +
    `?q.where=${encodeURIComponent(whereClause)}` +
    `&q.orderBy=${encodeURIComponent('Time_Stamp DESC')}` +
    `&q.pageSize=1` +
    `&q.select=${encodeURIComponent('User_ID')}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
  });
  if (response.ok) {
    const data = await response.json().catch(() => ({}));
    const latest = Array.isArray(data?.Result) ? data.Result[0] : null;
    const latestUserId = Number.parseInt(String(latest?.User_ID || '').trim(), 10);
    if (Number.isFinite(latestUserId) && latestUserId > 0) return latestUserId;
  }
  return 1;
}

const buildDeydryMailtoUrl = (memberName: string, rcfeName: string, authEndT2038: string) => {
  const subject = `To Deydy RE: Kaiser/ILS Status Update Check for ${memberName}`;
  const body = [
    'Hi Deydry,',
    '',
    `RCFE shared an ILS status update for ${memberName}.`,
    `RCFE: ${rcfeName}`,
    `Authorization End Date (T2038): ${authEndT2038 || 'Not set'}`,
    '',
    'Update details:',
    '',
    '',
    'Thank you,',
  ].join('\n');
  return `mailto:${DEYDRY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

async function createClientNoteForFollowup(params: {
  restBaseUrl: string;
  token: string;
  member: EligibleMember;
  rcfeName: string;
  rcfeAdminEmail: string;
  sentAtIso: string;
}) {
  const userId = await resolveCaspioUserIdForClient({
    restBaseUrl: params.restBaseUrl,
    token: params.token,
    clientId2: params.member.clientId2,
  });

  const comments = [
    `Biweekly RCFE follow-up email sent to ${params.rcfeAdminEmail} (${params.rcfeName}).`,
    `Member: ${params.member.fullName} (Client_ID2: ${params.member.clientId2})`,
    `Kaiser Status: ${params.member.kaiserStatus || 'Unknown'}`,
    `Authorization End Date (T2038): ${params.member.authorizationEndT2038 || 'Not set'}`,
    `Sent At: ${params.sentAtIso}`,
  ].join(' ');

  const insertUrl = `${params.restBaseUrl}/tables/connect_tbl_clientnotes/records`;
  const insertResponse = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Client_ID2: params.member.clientId2,
      User_ID: userId,
      Comments: comments,
      Time_Stamp: params.sentAtIso,
      Follow_Up_Status: '🟢Open',
    }),
  });

  if (!insertResponse.ok) {
    const errorText = await insertResponse.text().catch(() => '');
    throw new Error(`Failed to insert follow-up note for ${params.member.clientId2}: ${insertResponse.status} ${errorText}`);
  }
}

async function writeAuditEntry(payload: {
  type: string;
  message: string;
  member?: Partial<EligibleMember>;
  details?: Record<string, unknown>;
}) {
  try {
    await adminDb.collection(AUDIT_COLLECTION).add({
      type: payload.type,
      message: payload.message,
      member: payload.member || null,
      details: payload.details || {},
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit logging should never break cron execution.
  }
}

async function enqueueRetryItem(params: {
  member: EligibleMember;
  sentAtIso: string;
  errorMessage: string;
}) {
  const item: RetryQueueItem = {
    clientId2: params.member.clientId2,
    fullName: params.member.fullName,
    kaiserStatus: params.member.kaiserStatus,
    rcfeName: params.member.rcfeName,
    rcfeAdminEmail: params.member.rcfeAdminEmail,
    rcfeAdminName: params.member.rcfeAdminName,
    authorizationEndT2038: params.member.authorizationEndT2038,
    sentAtIso: params.sentAtIso,
    attempts: 0,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    nextAttemptAt: new Date().toISOString(),
    lastError: params.errorMessage,
    status: 'pending',
  };
  await adminDb.collection(RETRY_QUEUE_COLLECTION).add(item);
}

async function processRetryQueue(caspioContext: { restBaseUrl: string; token: string }) {
  const nowIso = new Date().toISOString();
  const pendingSnapshot = await adminDb
    .collection(RETRY_QUEUE_COLLECTION)
    .where('status', '==', 'pending')
    .limit(200)
    .get();

  let retried = 0;
  let recovered = 0;
  let stillPending = 0;
  let permanentlyFailed = 0;

  const dueDocs = pendingSnapshot.docs.filter((doc) => {
    const data = (doc.data() || {}) as Partial<RetryQueueItem>;
    const nextAttemptAt = String(data.nextAttemptAt || '').trim();
    return nextAttemptAt && nextAttemptAt <= nowIso;
  });

  for (const doc of dueDocs.slice(0, 100)) {
    retried += 1;
    const data = (doc.data() || {}) as RetryQueueItem;
    const member: EligibleMember = {
      clientId2: String(data.clientId2 || '').trim(),
      fullName: String(data.fullName || '').trim() || 'Unknown Member',
      kaiserStatus: String(data.kaiserStatus || '').trim(),
      rcfeName: String(data.rcfeName || '').trim(),
      rcfeAdminEmail: String(data.rcfeAdminEmail || '').trim().toLowerCase(),
      rcfeAdminName: String(data.rcfeAdminName || '').trim(),
      authorizationEndT2038: String(data.authorizationEndT2038 || '').trim(),
    };
    const attempts = Number.isFinite(Number(data.attempts)) ? Math.max(0, Number(data.attempts)) : 0;
    const maxAttempts = Number.isFinite(Number(data.maxAttempts))
      ? Math.max(1, Number(data.maxAttempts))
      : MAX_RETRY_ATTEMPTS;

    try {
      await createClientNoteForFollowup({
        restBaseUrl: caspioContext.restBaseUrl,
        token: caspioContext.token,
        member,
        rcfeName: member.rcfeName,
        rcfeAdminEmail: member.rcfeAdminEmail,
        sentAtIso: String(data.sentAtIso || new Date().toISOString()),
      });
      recovered += 1;
      await doc.ref.set(
        {
          status: 'completed',
          completedAt: new Date().toISOString(),
          lastError: '',
          attempts: attempts + 1,
        },
        { merge: true }
      );
      await writeAuditEntry({
        type: 'retry_recovered',
        message: `Recovered queued note write for ${member.clientId2}`,
        member,
      });
    } catch (error: any) {
      const nextAttempts = attempts + 1;
      const errMsg = String(error?.message || 'Retry failed');
      if (nextAttempts >= maxAttempts) {
        permanentlyFailed += 1;
        await doc.ref.set(
          {
            status: 'failed',
            attempts: nextAttempts,
            failedAt: new Date().toISOString(),
            lastError: errMsg,
          },
          { merge: true }
        );
        await writeAuditEntry({
          type: 'retry_permanent_failure',
          message: `Permanent note-write failure for ${member.clientId2}`,
          member,
          details: { error: errMsg, attempts: nextAttempts },
        });
      } else {
        stillPending += 1;
        const backoffMinutes = Math.min(24 * 60, Math.pow(2, nextAttempts) * 5);
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
        await doc.ref.set(
          {
            status: 'pending',
            attempts: nextAttempts,
            nextAttemptAt,
            lastError: errMsg,
          },
          { merge: true }
        );
      }
    }
  }

  return { retried, recovered, stillPending, permanentlyFailed };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const force = String(new URL(request.url).searchParams.get('force') || '').toLowerCase() === 'true';
    const utcDay = new Date().getUTCDay(); // 3 = Wednesday
    if (!force && utcDay !== 3) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Not Wednesday (UTC)' });
    }

    const resend = getResendClient();
    if (!resend) return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });

    const settingsRef = adminDb.collection('system_settings').doc('kaiser_rcfe_weekly_confirm');
    const settingsSnap = await settingsRef.get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const entries = (settingsData.entries as Record<string, any>) || {};
    const sendState = (settingsData.sendState as Record<string, any>) || {};
    const automationEnabled = Boolean(settingsData.automationEnabled);
    const cadenceDays = Math.max(1, Math.floor(Number(settingsData.cadenceDays || DEFAULT_CADENCE_DAYS)));
    const cadenceMs = cadenceDays * 24 * 60 * 60 * 1000;
    const emailSubjectTemplate = String(settingsData.emailSubjectTemplate || DEFAULT_EMAIL_SUBJECT_TEMPLATE);
    const emailBodyTemplate = String(settingsData.emailBodyTemplate || DEFAULT_EMAIL_BODY_TEMPLATE);

    if (!automationEnabled && !force) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Master automation toggle is OFF',
        automationEnabled,
      });
    }

    const cacheSnap = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_MCO', '==', 'Kaiser')
      .limit(5000)
      .get();
    const allMembers = cacheSnap.docs.map((d) => d.data() as any);

    const eligibleMembers: EligibleMember[] = [];
    for (const member of allMembers) {
      const status = String(member?.Kaiser_Status || member?.Kaiser_ID_Status || '').trim();
      if (!isBiweeklyFollowupStatus(status)) continue;
      const authEnd = String(member?.Authorization_End_Date_T2038 || member?.Authorization_End_T2038 || '').trim();
      if (!isUnexpiredT2038(authEnd)) continue;
      const rcfeName = String(member?.RCFE_Name || '').trim();
      const rcfeAdminEmail = String(
        member?.RCFE_Admin_Email || member?.RCFE_Administrator_Email || member?.RCFE_AdminEmail || ''
      )
        .trim()
        .toLowerCase();
      if (!rcfeName || !rcfeAdminEmail) continue;
      eligibleMembers.push({
        clientId2: String(member?.Client_ID2 || member?.client_ID2 || '').trim(),
        fullName:
          String(member?.Senior_Full_Name || '').trim() ||
          `${String(member?.Senior_First || '').trim()} ${String(member?.Senior_Last || '').trim()}`.trim() ||
          'Unknown Member',
        kaiserStatus: status,
        rcfeName,
        rcfeAdminEmail,
        rcfeAdminName: String(member?.RCFE_Admin_Name || member?.RCFE_Administrator || member?.RCFE_Admin || '').trim(),
        authorizationEndT2038: authEnd,
      });
    }

    const byRcfe = new Map<
      string,
      { rcfeName: string; rcfeAdminEmail: string; rcfeAdminName: string; members: EligibleMember[] }
    >();
    for (const member of eligibleMembers) {
      const key = toRcfeKey(member.rcfeName, member.rcfeAdminEmail);
      const existing = byRcfe.get(key);
      if (!existing) {
        byRcfe.set(key, {
          rcfeName: member.rcfeName,
          rcfeAdminEmail: member.rcfeAdminEmail,
          rcfeAdminName: member.rcfeAdminName,
          members: [member],
        });
      } else {
        existing.members.push(member);
        if (!existing.rcfeAdminName && member.rcfeAdminName) existing.rcfeAdminName = member.rcfeAdminName;
        byRcfe.set(key, existing);
      }
    }

    if (byRcfe.size === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'No eligible Kaiser members for biweekly RCFE follow-up',
      });
    }

    let sent = 0;
    let notesCreated = 0;
    let noteWriteQueued = 0;
    let skippedCadence = 0;
    let skippedDisabled = 0;
    const now = new Date();
    const nowIso = now.toISOString();
    const nextSendState = { ...sendState } as Record<string, any>;
    const errors: Array<{ rcfe: string; error: string }> = [];
    let caspioContext: Awaited<ReturnType<typeof getCaspioContext>> | null = null;
    let retryQueueStats = { retried: 0, recovered: 0, stillPending: 0, permanentlyFailed: 0 };

    try {
      caspioContext = await getCaspioContext();
      retryQueueStats = await processRetryQueue(caspioContext);
    } catch (retryError: any) {
      await writeAuditEntry({
        type: 'retry_queue_processing_failed',
        message: 'Failed to process retry queue before cron run',
        details: { error: String(retryError?.message || 'Unknown error') },
      });
    }

    for (const [rcfeKey, row] of byRcfe.entries()) {
      const rcfeName = row.rcfeName;
      const to = row.rcfeAdminEmail;
      const toggle = entries[rcfeKey];
      const enabled = toggle?.enabled !== false; // default ON unless explicitly disabled
      if (!enabled) {
        skippedDisabled += 1;
        continue;
      }
      const lastSentAt = String(sendState?.[rcfeKey]?.lastSentAt || '').trim();
      const lastSentMs = lastSentAt ? new Date(lastSentAt).getTime() : 0;
      if (!force && lastSentMs && now.getTime() - lastSentMs < cadenceMs) {
        skippedCadence += 1;
        continue;
      }
      try {
        const memberLines = row.members
          .map((m) => `- ${m.fullName} (Client_ID2: ${m.clientId2}) - Auth End: ${m.authorizationEndT2038}`)
          .join('\n');
        const memberHtmlList = row.members
          .map(
            (m) =>
              `<li>${escapeHtml(m.fullName)} (Client_ID2: ${escapeHtml(m.clientId2)}) - Auth End: ${escapeHtml(
                m.authorizationEndT2038
              )}</li>`
          )
          .join('');
        const deydryReplyLinkList = row.members
          .map((m) => {
            const url = buildDeydryMailtoUrl(m.fullName, rcfeName, m.authorizationEndT2038);
            return `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Email update to Deydry for ${escapeHtml(
              m.fullName
            )}</a></li>`;
          })
          .join('');
        const rcfeAdminName = row.rcfeAdminName || 'RCFE Admin';
        const templateData = {
          rcfeName,
          rcfeAdminName,
          memberCount: String(row.members.length),
          memberList: memberLines || '- No eligible members listed',
          deydryReplyLinkList: row.members.map((m) => `- Email update to Deydry for ${m.fullName}`).join('\n'),
          today: now.toLocaleDateString('en-US'),
        };
        const subject = renderTemplate(emailSubjectTemplate, templateData);
        const bodyLines = String(emailBodyTemplate || '').split('\n');
        const hasDeydryPlaceholder = bodyLines.some((line) => line.trim() === '{{deydryReplyLinkList}}');
        const deydryLinksHtml = `<div style="margin:8px 0;"><strong>Reply links to Kaiser manager (${escapeHtml(
          DEYDRY_EMAIL
        )}):</strong><ul style="margin:8px 0 10px 20px;">${deydryReplyLinkList || '<li>No member links available</li>'}</ul></div>`;
        const bodyHtml = `
          <div style="font-family: Arial, sans-serif; color:#111827; line-height:1.5;">
            ${bodyLines
              .map((lineRaw) => {
                if (lineRaw.trim() === '{{memberList}}') {
                  return `<ul style="margin:10px 0 10px 20px;">${memberHtmlList || '<li>No eligible members listed</li>'}</ul>`;
                }
                if (lineRaw.trim() === '{{deydryReplyLinkList}}') {
                  return deydryLinksHtml;
                }
                const line = renderTemplate(lineRaw, templateData);
                if (!line.trim()) return '<div style="height:8px"></div>';
                return `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`;
              })
              .join('')}
            ${hasDeydryPlaceholder ? '' : deydryLinksHtml}
          </div>
        `;

        await resend.emails.send({
          from: 'Connections CalAIM <noreply@carehomefinders.com>',
          to: [to],
          subject: subject || `Biweekly ILS follow-up for ${rcfeName}`,
          html: bodyHtml,
        });
        sent += 1;

        if (!caspioContext) caspioContext = await getCaspioContext();
        for (const member of row.members) {
          if (!member.clientId2) continue;
          try {
            await createClientNoteForFollowup({
              restBaseUrl: caspioContext.restBaseUrl,
              token: caspioContext.token,
              member,
              rcfeName,
              rcfeAdminEmail: to,
              sentAtIso: nowIso,
            });
            notesCreated += 1;
          } catch (noteWriteError: any) {
            const errorMessage = String(noteWriteError?.message || 'Failed to write note');
            noteWriteQueued += 1;
            await enqueueRetryItem({
              member,
              sentAtIso: nowIso,
              errorMessage,
            });
            await writeAuditEntry({
              type: 'note_write_queued_for_retry',
              message: `Queued failed note write for ${member.clientId2}`,
              member,
              details: { error: errorMessage, rcfeName, rcfeAdminEmail: to },
            });
          }
        }

        nextSendState[rcfeKey] = {
          lastSentAt: nowIso,
          cadenceDays,
          memberCount: row.members.length,
          rcfeName,
          rcfeAdminEmail: to,
        };
      } catch (e: any) {
        errors.push({ rcfe: rcfeName, error: e?.message || 'Failed to send' });
      }
    }

    await settingsRef.set(
      {
        sendState: nextSendState,
        lastCronRunAt: nowIso,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      automationEnabled,
      cadenceDays,
      rcfeCandidates: byRcfe.size,
      eligibleMembers: eligibleMembers.length,
      sent,
      notesCreated,
      noteWriteQueued,
      skippedCadence,
      skippedDisabled,
      retryQueueStats,
      errors,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send RCFE weekly confirmations' },
      { status: 500 }
    );
  }
}
