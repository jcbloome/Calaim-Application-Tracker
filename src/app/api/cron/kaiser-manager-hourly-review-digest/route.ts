import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';
import { isCsSummaryFormName, isPendingDocumentReview } from '@/lib/review-queue';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DigestEvent = {
  type: 'doc' | 'cs' | 'eligibility';
  occurredMs: number;
  memberName: string;
  memberMrn: string;
  itemLabel: string;
  actionUrl: string;
};

const normalize = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => normalize(value).toLowerCase();
const EASTERN_TIME_ZONE = 'America/New_York';

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value?.toDate === 'function') {
    const ms = Number(value.toDate()?.getTime?.());
    return Number.isFinite(ms) ? ms : 0;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDocContext = (path: string) => {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length >= 4 && parts[0] === 'users' && parts[2] === 'applications') {
    return { appUserId: parts[1], applicationId: parts[3] };
  }
  if (parts.length >= 2 && parts[0] === 'applications') {
    return { appUserId: '', applicationId: parts[1] };
  }
  return { appUserId: '', applicationId: parts[parts.length - 1] || '' };
};

const normalizeReviewRecipientUid = (key: string, value: any) => {
  const normalizedKey = normalize(key);
  if (normalizedKey && !normalizedKey.includes('@')) return normalizedKey;
  const valueUid = normalize(value?.uid);
  if (valueUid && !valueUid.includes('@')) return valueUid;
  return '';
};

const getFormActivityMs = (form: any): number => {
  const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
  const uploadedMs = uploadedFiles.reduce((maxMs: number, file: any) => {
    const candidate = Math.max(
      toMs(file?.uploadedAt),
      toMs(file?.uploadedAtIso),
      toMs(file?.createdAt),
      toMs(file?.createdAtIso)
    );
    return candidate > maxMs ? candidate : maxMs;
  }, 0);
  return Math.max(
    toMs(form?.uploadedAt),
    toMs(form?.uploadedAtIso),
    toMs(form?.updatedAt),
    toMs(form?.updatedAtIso),
    toMs(form?.completedAt),
    toMs(form?.completedAtIso),
    uploadedMs
  );
};

const getEasternHour24 = (nowMs: number) => {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(nowMs));
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour : 0;
};

const isWithinHourlyDigestWindowEt = (nowMs: number) => {
  const hour = getEasternHour24(nowMs);
  return hour >= 12 && hour < 20; // 12:00 PM ET through 7:59 PM ET
};

async function runDigest(options: {
  enforceCronWindow: boolean;
  triggerSource: string;
}) {
  const { enforceCronWindow, triggerSource } = options;
  const now = Date.now();
  const etHour = getEasternHour24(now);

  if (enforceCronWindow && !isWithinHourlyDigestWindowEt(now)) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Outside allowed ET window (12:00 PM - 7:59 PM).',
      etHour24: etHour,
      emailsSent: 0,
      triggerSource,
    });
  }

  const resendKey = normalize(process.env.RESEND_API_KEY);
  if (!resendKey) {
    return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
  }
  const resend = new Resend(resendKey);

  const baseUrl = normalize(
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com'
  ).replace(/\/$/, '');

  const [reviewSnap, stateSnap, usersSnap] = await Promise.all([
    adminDb.collection('system_settings').doc('review_notifications').get(),
    adminDb.collection('system_settings').doc('kaiser_manager_hourly_digest_state').get(),
    adminDb.collection('users').get(),
  ]);

  const reviewData = (reviewSnap.exists ? reviewSnap.data() : {}) as any;
    const reviewRecipients = (reviewData?.recipients || {}) as Record<string, any>;
  const configuredCadenceHoursRaw = Number(reviewData?.kaiserManagerDigestIntervalHours || 2);
  const configuredCadenceHours = Number.isFinite(configuredCadenceHoursRaw)
    ? Math.max(1, Math.min(24, Math.round(configuredCadenceHoursRaw)))
    : 2;
  const cadenceMs = configuredCadenceHours * 60 * 60 * 1000;
  const enforceCadence = Boolean(enforceCronWindow);

    const selectedRecipientUids = Array.from(
      new Set(
        Object.entries(reviewRecipients)
          .filter(([, value]) =>
            Boolean(value?.enabled) &&
            Boolean(value?.kaiserUploads ?? true) &&
            Boolean(value?.kaiserHourlyEmailDigest)
          )
          .map(([key, value]) => normalizeReviewRecipientUid(key, value))
          .filter(Boolean)
      )
    );

    if (!selectedRecipientUids.length) {
      return NextResponse.json({
        success: true,
        message: 'No recipients enabled for hourly Kaiser digest.',
        recipientsEvaluated: 0,
        emailsSent: 0,
      });
    }

    const usersByUid = new Map<string, any>();
    usersSnap.docs.forEach((doc: any) => {
      usersByUid.set(doc.id, doc.data() || {});
    });

  const previousState = (stateSnap.exists ? stateSnap.data() : {}) as any;
  const lastSentAtByUid = (previousState?.lastSentAtByUid || {}) as Record<string, number>;

  const sinceByUid = selectedRecipientUids.reduce<Record<string, number>>((acc, uid) => {
    const previous = Number(lastSentAtByUid?.[uid] || 0);
    // First run starts at configured cadence window so we do not blast historical queue.
    acc[uid] = previous > 0 ? previous + 1 : now - cadenceMs;
    return acc;
  }, {});
  const globalSinceMs = Math.min(...Object.values(sinceByUid));

  const [appsSnap, eligibilitySnap] = await Promise.all([
    adminDb.collectionGroup('applications').get(),
    adminDb.collection('eligibility_checks').get(),
  ]);

  const events: DigestEvent[] = [];

    appsSnap.docs.forEach((doc: any) => {
      const app = doc.data() as any;
      if (!lower(app?.healthPlan).includes('kaiser')) return;

      const context = parseDocContext(doc.ref.path);
      if (!context.applicationId) return;
      const actionUrl = `${baseUrl}/admin/applications/${encodeURIComponent(context.applicationId)}${
        context.appUserId ? `?userId=${encodeURIComponent(context.appUserId)}` : ''
      }`;
      const memberName = normalize(`${normalize(app?.memberFirstName)} ${normalize(app?.memberLastName)}`) || 'Member';
      const memberMrn = normalize(app?.memberMrn) || 'N/A';

      const forms = Array.isArray(app?.forms) ? app.forms : [];
      forms.forEach((form: any) => {
        if (!isPendingDocumentReview(form)) return;
        const occurredMs = getFormActivityMs(form);
        if (!occurredMs || occurredMs < globalSinceMs) return;
        events.push({
          type: 'doc',
          occurredMs,
          memberName,
          memberMrn,
          itemLabel: normalize(form?.name) || 'Document upload',
          actionUrl,
        });
      });

      const csSummaryForm = forms.find((form: any) => isCsSummaryFormName(form?.name));
      const csCompleted = Boolean(app?.csSummaryComplete) || lower(csSummaryForm?.status) === 'completed';
      const csReviewed = Boolean(app?.applicationChecked);
      const csOccurredMs = Math.max(
        toMs(app?.csSummaryCompletedAt),
        toMs(csSummaryForm?.completedAt),
        toMs(csSummaryForm?.updatedAt)
      );
      if (csCompleted && !csReviewed && csOccurredMs >= globalSinceMs) {
        events.push({
          type: 'cs',
          occurredMs: csOccurredMs,
          memberName,
          memberMrn,
          itemLabel: 'CS Summary',
          actionUrl,
        });
      }
    });

    eligibilitySnap.docs.forEach((doc: any) => {
      const data = doc.data() as any;
      if (!lower(data?.healthPlan).includes('kaiser')) return;
      const status = lower(data?.status || 'pending');
      if (status && status !== 'pending' && status !== 'open' && status !== 'in progress') return;
      const occurredMs = Math.max(toMs(data?.timestamp), toMs(data?.createdAt), toMs(data?.submittedAt));
      if (!occurredMs || occurredMs < globalSinceMs) return;
      const memberName = normalize(data?.memberName) || normalize(`${normalize(data?.memberFirstName)} ${normalize(data?.memberLastName)}`) || 'Member';
      const memberMrn = normalize(data?.memberMrn) || 'N/A';
      events.push({
        type: 'eligibility',
        occurredMs,
        memberName,
        memberMrn,
        itemLabel: 'Eligibility Check',
        actionUrl: `${baseUrl}/admin/eligibility-checks?checkId=${encodeURIComponent(doc.id)}`,
      });
    });

  events.sort((a, b) => b.occurredMs - a.occurredMs);

  let emailsSent = 0;
  const sentByUid: Record<string, { email: string; itemCount: number }> = {};
  const nextLastSentAtByUid = { ...(lastSentAtByUid || {}) } as Record<string, number>;

    for (const uid of selectedRecipientUids) {
      const staff = usersByUid.get(uid) || {};
      const email = normalize(staff?.email);
      if (!email) continue;
      const previous = Number(lastSentAtByUid?.[uid] || 0);
      if (enforceCadence && previous > 0 && now - previous < cadenceMs) {
        continue;
      }

      const sinceMs = sinceByUid[uid];
      const recipientEvents = events.filter((event) => event.occurredMs >= sinceMs);
      if (!recipientEvents.length) continue;

      const docCount = recipientEvents.filter((event) => event.type === 'doc').length;
      const csCount = recipientEvents.filter((event) => event.type === 'cs').length;
      const eligibilityCount = recipientEvents.filter((event) => event.type === 'eligibility').length;
      const displayName = normalize(`${normalize(staff?.firstName)} ${normalize(staff?.lastName)}`) || email;

      const rows = recipientEvents
        .slice(0, 30)
        .map((event) => {
          const typeLabel =
            event.type === 'doc'
              ? 'Document upload'
              : event.type === 'cs'
                ? 'CS summary'
                : 'Eligibility check';
          const occurredAt = new Date(event.occurredMs).toLocaleString();
          return `<li><strong>${event.memberName}</strong> (MRN: ${event.memberMrn}) - ${typeLabel}: ${event.itemLabel} - ${occurredAt} - <a href="${event.actionUrl}">Open</a></li>`;
        })
        .join('');

      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <p>Hi ${displayName},</p>
          <p>New Kaiser review items in the last hour:</p>
          <ul>
            <li><strong>Documents:</strong> ${docCount}</li>
            <li><strong>CS summaries:</strong> ${csCount}</li>
            <li><strong>Eligibility checks:</strong> ${eligibilityCount}</li>
          </ul>
          <p><strong>Recent items</strong></p>
          <ul>${rows}</ul>
          <p><a href="${baseUrl}/admin?plan=kaiser&scope=review#new-items-log">Open Kaiser needs-review list</a></p>
        </div>
      `;

      await resend.emails.send({
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [email],
        subject: `Hourly Kaiser review summary (${recipientEvents.length} new)`,
        html,
      });

      nextLastSentAtByUid[uid] = now;
      sentByUid[uid] = { email, itemCount: recipientEvents.length };
      emailsSent += 1;
    }

  if (emailsSent > 0) {
    await adminDb.collection('system_settings').doc('kaiser_manager_hourly_digest_state').set(
      {
        lastSentAtByUid: nextLastSentAtByUid,
        updatedAtMs: now,
        updatedAt: new Date(now).toISOString(),
        updatedBy: triggerSource,
      },
      { merge: true }
    );
  }

  return NextResponse.json({
    success: true,
    recipientsEvaluated: selectedRecipientUids.length,
    emailsSent,
    sentByUid,
    scannedEvents: events.length,
    etHour24: etHour,
    cadenceHours: configuredCadenceHours,
    triggerSource,
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return runDigest({ enforceCronWindow: true, triggerSource: 'cron' });
  } catch (error: any) {
    console.error('kaiser-manager-hourly-review-digest cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Hourly digest failed'),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    return runDigest({ enforceCronWindow: false, triggerSource: `manual:${adminCheck.uid}` });
  } catch (error: any) {
    console.error('kaiser-manager-hourly-review-digest manual trigger error:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Hourly digest failed'),
      },
      { status: 500 }
    );
  }
}
