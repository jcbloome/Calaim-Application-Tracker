import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';

let adminDb: any;
try {
  if (!getApps().length) {
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-2881432245-f1d94',
    });
    adminDb = getFirestore(app);
  } else {
    adminDb = getFirestore();
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

const toMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const ms = value.toDate().getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalize = (value: unknown) => String(value || '').trim();
const lower = (value: unknown) => normalize(value).toLowerCase();

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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const resendKey = normalize(process.env.RESEND_API_KEY);
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
    }
    const resend = new Resend(resendKey);
    const baseUrl = normalize(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com').replace(/\/$/, '');

    const [staffSnap, appsSnap] = await Promise.all([
      adminDb.collection('users').where('isKaiserStaff', '==', true).get(),
      adminDb.collectionGroup('applications').get(),
    ]);

    const staffById = new Map<
      string,
      { id: string; name: string; email: string; openApps: any[] }
    >();
    staffSnap.docs.forEach((doc: any) => {
      const data = doc.data() as any;
      const email = normalize(data?.email);
      if (!email) return;
      const name =
        normalize(`${normalize(data?.firstName)} ${normalize(data?.lastName)}`) ||
        normalize(data?.displayName) ||
        email;
      staffById.set(doc.id, { id: doc.id, name, email, openApps: [] });
    });

    const now = Date.now();
    const inactivityMs = 48 * 60 * 60 * 1000; // 48h
    const resendCooldownMs = 24 * 60 * 60 * 1000; // 24h
    const inactivityCandidates: Array<{
      appRef: any;
      staffId: string;
      staffName: string;
      staffEmail: string;
      memberName: string;
      memberMrn: string;
      ageHours: number;
      actionUrl: string;
    }> = [];

    appsSnap.docs.forEach((doc: any) => {
      const app = doc.data() as any;
      const healthPlan = lower(app?.healthPlan);
      if (!healthPlan.includes('kaiser')) return;
      if (app?.caspioSent === true) return;

      const assignedStaffId = normalize(app?.assignedStaffId);
      if (!assignedStaffId || !staffById.has(assignedStaffId)) return;
      const staff = staffById.get(assignedStaffId)!;

      const context = parseDocContext(doc.ref.path);
      const applicationId = context.applicationId;
      if (!applicationId) return;
      const actionUrl = `${baseUrl}/admin/applications/${encodeURIComponent(applicationId)}${
        context.appUserId ? `?userId=${encodeURIComponent(context.appUserId)}` : ''
      }`;

      const memberName = normalize(`${normalize(app?.memberFirstName)} ${normalize(app?.memberLastName)}`) || 'Member';
      const memberMrn = normalize(app?.memberMrn) || 'N/A';
      const updatedAtMs = Math.max(
        toMs(app?.lastUpdated),
        toMs(app?.createdAt),
        toMs(app?.submissionDate),
      );
      const ageMs = updatedAtMs > 0 ? now - updatedAtMs : 0;

      const openItem = { memberName, memberMrn, actionUrl, ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))) };
      staff.openApps.push(openItem);

      const lastReminderMs = Number(app?.kaiserProcessReminderLastSentAtMs || 0);
      if (ageMs >= inactivityMs && now - lastReminderMs >= resendCooldownMs) {
        inactivityCandidates.push({
          appRef: doc.ref,
          applicationId,
          staffId: staff.id,
          staffName: staff.name,
          staffEmail: staff.email,
          memberName,
          memberMrn,
          ageHours: openItem.ageHours,
          actionUrl,
        });
      }
    });

    let inactivitySent = 0;
    for (const item of inactivityCandidates) {
      const subject = `Reminder: Kaiser member needs action (${item.memberName})`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <p>Hi ${item.staffName},</p>
          <p>This Kaiser member assignment has not been updated in the last ${item.ageHours} hours:</p>
          <ul>
            <li><strong>Member:</strong> ${item.memberName}</li>
            <li><strong>MRN:</strong> ${item.memberMrn}</li>
          </ul>
          <p><strong>Required workflow:</strong></p>
          <ol>
            <li>Complete Eligibility Check</li>
            <li>Complete CS Summary form</li>
            <li>Push to Caspio when ready</li>
          </ol>
          <p><a href="${item.actionUrl}">Open assigned member</a></p>
        </div>
      `;
      await resend.emails.send({
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [item.staffEmail],
        subject,
        html,
      });

      await Promise.all([
        item.appRef.set(
          {
            kaiserProcessReminderLastSentAtMs: now,
            lastUpdated: FieldValue.serverTimestamp(),
          },
          { merge: true }
        ),
        adminDb.collection('staff_notifications').add({
          userId: item.staffId,
          title: `Kaiser follow-up reminder: ${item.memberName}`,
          message:
            `No recent progress detected. Complete Eligibility Check, CS Summary, and push to Caspio when ready.`,
          memberName: item.memberName,
          memberMrn: item.memberMrn,
          type: 'kaiser_process_inactivity',
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          requiresStaffAction: true,
          actionUrl: item.actionUrl.replace(baseUrl, ''),
          source: 'kaiser-process-digest-cron',
          timestamp: FieldValue.serverTimestamp(),
        }),
        adminDb.collection('adminDailyTasks').doc(`kaiser-process-${item.staffId}-${item.applicationId}`).set({
          title: `Kaiser follow-up reminder: ${item.memberName}`,
          description: `No recent progress for ${item.ageHours}h. Complete Eligibility Check, CS Summary, and push to Caspio.`,
          memberName: item.memberName,
          memberClientId: item.memberMrn,
          healthPlan: 'Kaiser',
          assignedTo: item.staffId,
          assignedToName: item.staffName,
          priority: 'high',
          status: 'pending',
          dueDate: new Date(now).toISOString().slice(0, 10),
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          createdBy: 'system',
          notes: `Auto-created by kaiser-staff-process-digest cron after ${item.ageHours}h inactivity.`,
          tags: ['kaiser', 'reminder', 'inactivity'],
          applicationId: item.applicationId,
          applicationLink: item.actionUrl.replace(baseUrl, ''),
          source: 'caspio_kaiser',
        }, { merge: true }),
      ]);
      inactivitySent += 1;
    }

    let digestSent = 0;
    for (const staff of staffById.values()) {
      if (!staff.openApps.length) continue;
      const sorted = [...staff.openApps].sort((a, b) => b.ageHours - a.ageHours).slice(0, 12);
      const subject = `Daily Kaiser assignment digest (${staff.openApps.length} open)`;
      const rows = sorted
        .map(
          (item) =>
            `<li><strong>${item.memberName}</strong> (MRN: ${item.memberMrn}) - ${item.ageHours}h since last update - <a href="${item.actionUrl}">Open</a></li>`
        )
        .join('');
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <p>Hi ${staff.name},</p>
          <p>You currently have <strong>${staff.openApps.length}</strong> open Kaiser assignments not pushed to Caspio.</p>
          <p>Top items by age:</p>
          <ul>${rows}</ul>
          <p><strong>Workflow reminder:</strong> Eligibility Check -> CS Summary -> Push to Caspio.</p>
        </div>
      `;
      await resend.emails.send({
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [staff.email],
        subject,
        html,
      });
      digestSent += 1;
    }

    return NextResponse.json({
      success: true,
      staffCount: staffById.size,
      inactivityCandidates: inactivityCandidates.length,
      inactivitySent,
      digestSent,
    });
  } catch (error: any) {
    console.error('kaiser-staff-process-digest cron error:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Cron failed') },
      { status: 500 }
    );
  }
}
