import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';
import { isPendingDocumentReview } from '@/lib/review-queue';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { resolveAppBaseUrl } from '@/lib/app-urls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EASTERN_TIME_ZONE = 'America/New_York';
const STATE_DOC_ID = 'kaiser_unassigned_docs_digest_state';
const STATUS_DOC_ID = 'kaiser_unassigned_docs_digest_status';

const normalize = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => normalize(value).toLowerCase();

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

const getEasternClock = (nowMs: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return {
    hour: hour === 24 ? 0 : hour,
    minute: Number.isFinite(minute) ? minute : 0,
  };
};

const is1230EasternWindow = (nowMs: number) => {
  const clock = getEasternClock(nowMs);
  return clock.hour === 12 && clock.minute >= 20 && clock.minute <= 45;
};

const isUnassignedStaff = (app: any) => {
  const label = [
    app?.assignedStaffName,
    app?.assignedStaff,
    app?.assignedToName,
    app?.assignedTo,
    app?.staffName,
  ]
    .map((value) => normalize(value))
    .find(Boolean) || '';
  const normalized = label.toLowerCase();
  if (!normalized || normalized === 'staff unassigned' || normalized === 'unassigned' || normalized === 'none' || normalized === 'n/a') {
    return true;
  }
  return /^\d+$/.test(normalized);
};

const formActivityMs = (form: any) => {
  const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
  const uploadedMs = uploadedFiles.reduce((maxMs: number, file: any) => {
    const candidate = Math.max(toMs(file?.uploadedAt), toMs(file?.uploadedAtIso), toMs(file?.createdAt));
    return candidate > maxMs ? candidate : maxMs;
  }, 0);
  return Math.max(
    toMs(form?.uploadedAt),
    toMs(form?.uploadedAtIso),
    toMs(form?.updatedAt),
    toMs(form?.completedAt),
    uploadedMs
  );
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

async function writeStatus(payload: Record<string, any>) {
  try {
    await adminDb.collection('system_settings').doc(STATUS_DOC_ID).set(
      {
        ...payload,
        updatedAtMs: Date.now(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error: any) {
    console.warn('[kaiser-unassigned-docs-digest] status write failed:', error?.message || error);
  }
}

async function runDigest(options: { enforceClock: boolean; triggerSource: string }) {
  const now = Date.now();
  const clock = getEasternClock(now);
  if (options.enforceClock && !is1230EasternWindow(now)) {
    await writeStatus({
      success: true,
      skipped: true,
      reason: 'Outside 12:30 PM Eastern send window.',
      triggerSource: options.triggerSource,
      etHour24: clock.hour,
      etMinute: clock.minute,
      emailsSent: 0,
    });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'Outside 12:30 PM Eastern send window.',
      etHour24: clock.hour,
      etMinute: clock.minute,
    });
  }

  const resendKey = normalize(process.env.RESEND_API_KEY);
  if (!resendKey) {
    return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
  }

  const [reviewSnap, stateSnap, usersSnap, appsSnap] = await Promise.all([
    adminDb.collection('system_settings').doc('review_notifications').get(),
    adminDb.collection('system_settings').doc(STATE_DOC_ID).get(),
    adminDb.collection('users').get(),
    adminDb.collectionGroup('applications').get(),
  ]);

  const reviewRecipients = ((reviewSnap.exists ? reviewSnap.data() : {}) as any)?.recipients || {};
  const recipientUids = Array.from(
    new Set(
      Object.entries(reviewRecipients)
        .filter(([, value]) => Boolean((value as any)?.enabled) && Boolean((value as any)?.kaiserUploads ?? true))
        .map(([key, value]) => normalizeReviewRecipientUid(key, value))
        .filter(Boolean)
    )
  );
  if (!recipientUids.length) {
    await writeStatus({
      success: true,
      skipped: true,
      reason: 'No Kaiser CS/docs managers enabled.',
      triggerSource: options.triggerSource,
      emailsSent: 0,
    });
    return NextResponse.json({ success: true, skipped: true, reason: 'No Kaiser CS/docs managers enabled.' });
  }

  const previousState = (stateSnap.exists ? stateSnap.data() : {}) as any;
  const lastSentAtMs = Number(previousState?.lastSentAtMs || 0);
  const sinceMs = lastSentAtMs > 0 ? lastSentAtMs + 1 : now - 24 * 60 * 60 * 1000;
  const baseUrl = resolveAppBaseUrl();

  type MemberDocs = { memberName: string; memberMrn: string; docs: string[]; actionUrl: string };
  const members: MemberDocs[] = [];

  appsSnap.docs.forEach((doc: any) => {
    const app = doc.data() as any;
    if (!lower(app?.healthPlan).includes('kaiser')) return;
    if (!isUnassignedStaff(app)) return;
    const context = parseDocContext(doc.ref.path);
    if (!context.applicationId) return;
    const forms = Array.isArray(app?.forms) ? app.forms : [];
    const docs = forms
      .filter((form: any) => isPendingDocumentReview(form) && formActivityMs(form) >= sinceMs)
      .map((form: any) => normalize(form?.name) || 'Document')
      .filter(Boolean);
    if (!docs.length) return;
    const memberName = normalize(`${normalize(app?.memberFirstName)} ${normalize(app?.memberLastName)}`) || 'Member';
    members.push({
      memberName,
      memberMrn: normalize(app?.memberMrn) || 'N/A',
      docs,
      actionUrl: `${baseUrl}/admin/applications/${encodeURIComponent(context.applicationId)}${
        context.appUserId ? `?userId=${encodeURIComponent(context.appUserId)}` : ''
      }`,
    });
  });

  members.sort((a, b) => a.memberName.localeCompare(b.memberName));
  if (!members.length) {
    await writeStatus({
      success: true,
      skipped: true,
      reason: 'No new unassigned Kaiser documents since the last send.',
      triggerSource: options.triggerSource,
      emailsSent: 0,
      sinceMs,
    });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'No new unassigned Kaiser documents since the last send.',
      emailsSent: 0,
    });
  }

  const usersByUid = new Map<string, any>();
  usersSnap.docs.forEach((userDoc: any) => usersByUid.set(userDoc.id, userDoc.data() || {}));
  const docCount = members.reduce((sum, member) => sum + member.docs.length, 0);
  const rows = members
    .map((member) => {
      const docList = member.docs.map((name) => `<li>${name}</li>`).join('');
      return `<li><strong>${member.memberName}</strong> (MRN: ${member.memberMrn}) — <a href="${member.actionUrl}">Open</a><ul>${docList}</ul></li>`;
    })
    .join('');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
      <p>New documents were received for Kaiser members who are not assigned to staff.</p>
      <p><strong>${members.length} member${members.length === 1 ? '' : 's'}</strong>, <strong>${docCount} document${docCount === 1 ? '' : 's'}</strong>.</p>
      <ul>${rows}</ul>
      <p>These stay on your action items as Kaiser CS/docs until a staff member is assigned or the documents are reviewed.</p>
      <p><a href="${baseUrl}/admin?plan=kaiser&kind=docs&scope=review#new-items-log">Open Kaiser document review</a></p>
    </div>
  `;

  const resend = new Resend(resendKey);
  let emailsSent = 0;
  const sentTo: string[] = [];
  for (const uid of recipientUids) {
    const email = normalize(usersByUid.get(uid)?.email);
    if (!email) continue;
    const firstName = normalize(usersByUid.get(uid)?.firstName);
    await resend.emails.send({
      from: 'CalAIM Tracker <noreply@carehomefinders.com>',
      to: [email],
      subject: `Unassigned Kaiser documents (${docCount})`,
      html: `<p>Hi ${firstName || email},</p>${html}`,
    });
    sentTo.push(email);
    emailsSent += 1;
  }

  if (emailsSent > 0) {
    await adminDb.collection('system_settings').doc(STATE_DOC_ID).set(
      {
        lastSentAtMs: now,
        updatedAt: new Date(now).toISOString(),
        updatedBy: options.triggerSource,
        memberCount: members.length,
        docCount,
      },
      { merge: true }
    );
  }

  await writeStatus({
    success: true,
    skipped: emailsSent === 0,
    reason: emailsSent === 0 ? 'Kaiser CS/docs managers have no email on file.' : '',
    triggerSource: options.triggerSource,
    emailsSent,
    sentTo,
    memberCount: members.length,
    docCount,
  });

  return NextResponse.json({
    success: true,
    emailsSent,
    sentTo,
    memberCount: members.length,
    docCount,
    triggerSource: options.triggerSource,
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return runDigest({ enforceClock: true, triggerSource: 'cron' });
  } catch (error: any) {
    console.error('[kaiser-unassigned-docs-digest] cron error:', error);
    return NextResponse.json({ success: false, error: String(error?.message || 'Digest failed') }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(request, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }
    return runDigest({ enforceClock: false, triggerSource: `manual:${adminCheck.uid}` });
  } catch (error: any) {
    console.error('[kaiser-unassigned-docs-digest] manual error:', error);
    return NextResponse.json({ success: false, error: String(error?.message || 'Digest failed') }, { status: 500 });
  }
}
