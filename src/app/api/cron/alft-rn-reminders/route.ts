import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const toMs = (value: any) => {
  if (!value) return 0;
  try {
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
};

type Recipient = { uid: string; email: string; name: string };
type VisitDateReminder = {
  memberId: string;
  memberName: string;
  mrn: string;
  assignedAtMs: number;
};
type RnNoResponseReminder = {
  intakeId: string;
  memberName: string;
  mrn: string;
  rnRequestedAtMs: number;
};

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const resendKey = clean(process.env.RESEND_API_KEY, 2000);
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
    }
    const resend = new Resend(resendKey);

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const nowMs = Date.now();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const reminderCooldownMs = 24 * 60 * 60 * 1000;
    const baseUrl = clean(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com', 400).replace(/\/$/, '');

    // Resolve RN Visit Assigner recipients from review-notification settings.
    const reviewSettingsSnap = await adminDb.collection('system_settings').doc('review_notifications').get();
    const reviewRecipients = ((reviewSettingsSnap.data() as any)?.recipients || {}) as Record<string, any>;
    const recipientUids = Object.entries(reviewRecipients)
      .filter(([, rec]) => Boolean((rec as any)?.enabled) && Boolean((rec as any)?.kaiserRnVisitAssigner))
      .map(([key, rec]) => clean((rec as any)?.uid || key, 128))
      .filter(Boolean);

    if (recipientUids.length === 0) {
      return NextResponse.json({ success: true, message: 'No RN Visit Assigner recipients configured', sent: 0 });
    }

    const recipients: Recipient[] = [];
    for (const uid of recipientUids) {
      const userSnap = await adminDb.collection('users').doc(uid).get().catch(() => null);
      const userData = userSnap?.exists ? (userSnap.data() as any) : {};
      const email = clean(userData?.email, 220).toLowerCase();
      if (!email) continue;
      const name =
        clean(userData?.displayName, 160) ||
        clean(`${clean(userData?.firstName, 80)} ${clean(userData?.lastName, 80)}`, 160) ||
        email;
      recipients.push({ uid, email, name });
    }
    if (recipients.length === 0) {
      return NextResponse.json({ success: true, message: 'No valid recipient emails found', sent: 0 });
    }

    const visitDateReminders: VisitDateReminder[] = [];
    const rnNoResponseReminders: RnNoResponseReminder[] = [];
    const assignmentUpdateWrites: Promise<any>[] = [];
    const intakeUpdateWrites: Promise<any>[] = [];

    // 1) Missing expected visit date on ALFT assignments.
    const assignmentsSnap = await adminDb.collection('alft_assignments').limit(4000).get();
    assignmentsSnap.docs.forEach((docSnap: any) => {
      const data = docSnap.data() || {};
      const status = clean(data?.status, 120).toLowerCase();
      if (status === 'completed') return;
      const expectedVisitDate = clean(data?.expectedVisitDate || data?.alftExpectedVisitDate, 40);
      if (expectedVisitDate) return;

      const assignedAtMs =
        toMs(data?.assignedAt) ||
        toMs(data?.createdAt) ||
        toMs(data?.updatedAt);
      if (!assignedAtMs || nowMs - assignedAtMs < twoDaysMs) return;

      const lastSentMs = Number(data?.reminders?.expectedVisitDateMissingLastSentAtMs || 0);
      if (lastSentMs > 0 && nowMs - lastSentMs < reminderCooldownMs) return;

      visitDateReminders.push({
        memberId: clean(data?.memberId || docSnap.id, 180),
        memberName: clean(data?.memberName, 180) || 'Member',
        mrn: clean(data?.memberMrn, 80) || '—',
        assignedAtMs,
      });

      assignmentUpdateWrites.push(
        docSnap.ref.set(
          {
            reminders: {
              expectedVisitDateMissingLastSentAtMs: nowMs,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    });

    // 2) RN no response after 2 days once sent to RN stage.
    const intakesSnap = await adminDb
      .collection('standalone_upload_submissions')
      .where('toolCode', '==', 'ALFT')
      .limit(4000)
      .get();
    intakesSnap.docs.forEach((docSnap: any) => {
      const data = docSnap.data() || {};
      const workflowStatus = clean(data?.workflowStatus, 180).toLowerCase();
      const awaitingRn =
        workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
        workflowStatus.includes('awaiting_rn_final_signature');
      if (!awaitingRn) return;

      const rnSignedAtMs = toMs(data?.alftSignature?.rnSignedAt);
      if (rnSignedAtMs > 0) return;

      const rnRequestedAtMs = toMs(data?.alftSignature?.rnRequestedAt) || toMs(data?.updatedAt);
      if (!rnRequestedAtMs || nowMs - rnRequestedAtMs < twoDaysMs) return;

      const lastSentMs = Number(data?.reminders?.rnNoResponseLastSentAtMs || 0);
      if (lastSentMs > 0 && nowMs - lastSentMs < reminderCooldownMs) return;

      rnNoResponseReminders.push({
        intakeId: clean(docSnap.id, 180),
        memberName: clean(data?.memberName, 180) || 'Member',
        mrn: clean(data?.medicalRecordNumber || data?.kaiserMrn || data?.mediCalNumber, 80) || '—',
        rnRequestedAtMs,
      });

      intakeUpdateWrites.push(
        docSnap.ref.set(
          {
            reminders: {
              rnNoResponseLastSentAtMs: nowMs,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    });

    if (visitDateReminders.length === 0 && rnNoResponseReminders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No ALFT reminder emails needed',
        visitDateReminders: 0,
        rnNoResponseReminders: 0,
        sent: 0,
      });
    }

    const visitDateRows = visitDateReminders
      .slice(0, 40)
      .map(
        (item) =>
          `<li><strong>${item.memberName}</strong> (MRN: ${item.mrn}) - assigned ${Math.floor((nowMs - item.assignedAtMs) / (24 * 60 * 60 * 1000))} day(s) ago - <a href="${baseUrl}/admin/alft-assignment?member=${encodeURIComponent(item.memberName)}">Open assignment</a></li>`
      )
      .join('');
    const rnNoResponseRows = rnNoResponseReminders
      .slice(0, 40)
      .map(
        (item) =>
          `<li><strong>${item.memberName}</strong> (MRN: ${item.mrn}) - RN requested ${Math.floor((nowMs - item.rnRequestedAtMs) / (24 * 60 * 60 * 1000))} day(s) ago - <a href="${baseUrl}/admin/alft-tracker?focus=${encodeURIComponent(item.intakeId)}">Open ALFT tracker</a></li>`
      )
      .join('');

    let sent = 0;
    for (const recipient of recipients) {
      const subject = `ALFT escalation reminders (${visitDateReminders.length + rnNoResponseReminders.length})`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <p>Hi ${recipient.name},</p>
          <p>The ALFT workflow has reminder items requiring RN Visit Assigner follow-up.</p>
          ${visitDateReminders.length > 0 ? `
            <h3 style="margin: 16px 0 8px;">Missing expected visit date (2+ days)</h3>
            <ul>${visitDateRows}</ul>
          ` : ''}
          ${rnNoResponseReminders.length > 0 ? `
            <h3 style="margin: 16px 0 8px;">RN no response after 2 days</h3>
            <ul>${rnNoResponseRows}</ul>
          ` : ''}
          <p style="margin-top: 18px;">Open ALFT tracker: <a href="${baseUrl}/admin/alft-tracker">${baseUrl}/admin/alft-tracker</a></p>
        </div>
      `;

      await resend.emails.send({
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [recipient.email],
        subject,
        html,
      });
      sent += 1;

      await adminDb.collection('staff_notifications').add({
        userId: recipient.uid,
        recipientName: recipient.name,
        title: 'ALFT escalation reminder sent',
        message: `${visitDateReminders.length} missing visit date + ${rnNoResponseReminders.length} RN no-response reminder(s).`,
        type: 'alft_escalation_digest',
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        source: 'alft-rn-reminders-cron',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: '/admin/alft-tracker',
      });
    }

    await Promise.all([...assignmentUpdateWrites, ...intakeUpdateWrites]);

    return NextResponse.json({
      success: true,
      recipients: recipients.length,
      visitDateReminders: visitDateReminders.length,
      rnNoResponseReminders: rnNoResponseReminders.length,
      sent,
    });
  } catch (error: any) {
    console.error('[cron/alft-rn-reminders] error:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Cron failed') },
      { status: 500 }
    );
  }
}

