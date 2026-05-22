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
type NoActionReminder = {
  scope: 'assignment' | 'intake';
  targetId: string;
  role: 'sw' | 'rn' | 'manager';
  recipientEmail: string;
  recipientName: string;
  recipientUid?: string;
  memberName: string;
  mrn: string;
  waitingSinceMs: number;
  stageLabel: string;
  actionUrl: string;
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
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const reminderCooldownMs = 24 * 60 * 60 * 1000;
    const baseUrl = clean(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com', 400).replace(/\/$/, '');
    const defaultFinalManagerEmails = ['jason@carehomefinders.com', 'deydry@carehomefinders.com'];

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
    const managerUsersSnap = await adminDb
      .collection('users')
      .where('isKaiserAssignmentManager', '==', true)
      .limit(80)
      .get()
      .catch(() => null);
    const managerRecipients: Recipient[] = [
      ...((managerUsersSnap?.docs || []).map((docSnap: any) => {
        const userData = docSnap.data() || {};
        const userEmail = clean(userData?.email, 220).toLowerCase();
        const userName =
          clean(userData?.displayName, 160) ||
          clean(`${clean(userData?.firstName, 80)} ${clean(userData?.lastName, 80)}`, 160) ||
          userEmail ||
          'Kaiser Manager';
        return { uid: clean(docSnap.id, 128), email: userEmail, name: userName };
      })),
      ...defaultFinalManagerEmails.map((managerEmail) => ({
        uid: '',
        email: clean(managerEmail, 220).toLowerCase(),
        name: managerEmail.includes('jason@') ? 'Jason' : managerEmail.includes('deydry@') ? 'Deydry' : 'Kaiser Manager',
      })),
    ]
      .filter((r) => Boolean(r.email))
      .filter((r, idx, arr) => arr.findIndex((x) => x.email === r.email) === idx);

    const visitDateReminders: VisitDateReminder[] = [];
    const rnNoResponseReminders: RnNoResponseReminder[] = [];
    const noActionReminders: NoActionReminder[] = [];
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

      const workflowStatus = clean(data?.workflowStatus, 180).toLowerCase();
      const waitingOnSw =
        workflowStatus.includes('sw_invited_pending_submission') ||
        workflowStatus.includes('sw_form_in_progress');
      const swEmail = clean(data?.assignedSwEmail, 220).toLowerCase();
      const swName = clean(data?.assignedSwName, 160) || swEmail || 'Social Worker';
      const waitingSinceMs = toMs(data?.workflowInvites?.invitedAt) || assignedAtMs || toMs(data?.updatedAt);
      const swLastSentMs = Number(data?.reminders?.noActionSwInviteLastSentAtMs || 0);
      if (
        waitingOnSw &&
        swEmail &&
        waitingSinceMs > 0 &&
        nowMs - waitingSinceMs >= oneDayMs &&
        (swLastSentMs <= 0 || nowMs - swLastSentMs >= reminderCooldownMs)
      ) {
        noActionReminders.push({
          scope: 'assignment',
          targetId: clean(docSnap.id, 180),
          role: 'sw',
          recipientEmail: swEmail,
          recipientName: swName,
          memberName: clean(data?.memberName, 180) || 'Member',
          mrn: clean(data?.memberMrn, 80) || '—',
          waitingSinceMs,
          stageLabel: 'Sent to social worker (waiting for form action)',
          actionUrl: `${baseUrl}/sw-portal/alft-upload`,
        });
        assignmentUpdateWrites.push(
          docSnap.ref.set(
            {
              reminders: {
                noActionSwInviteLastSentAtMs: nowMs,
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        );
      }
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
      const intakeId = clean(docSnap.id, 180);
      const memberName = clean(data?.memberName, 180) || 'Member';
      const mrn = clean(data?.medicalRecordNumber || data?.kaiserMrn || data?.mediCalNumber, 80) || '—';
      const waitingSinceDefaultMs = toMs(data?.workflowUpdatedAt) || toMs(data?.updatedAt) || toMs(data?.createdAt);
      const awaitingManagerPreRn = workflowStatus.includes('awaiting_manager_review_pre_rn');
      const awaitingManagerFinal = workflowStatus.includes('awaiting_kaiser_manager_final_review');
      const returnedToSw = workflowStatus.includes('returned_to_sw_for_revision');
      const swEmail = clean(data?.uploaderEmail, 220).toLowerCase();
      const swName = clean(data?.uploaderName, 160) || swEmail || 'Social Worker';
      const rnEmail = clean(data?.alftRnEmail, 220).toLowerCase();
      const rnName = clean(data?.alftRnName, 160) || rnEmail || 'RN';

      if (returnedToSw && swEmail) {
        const swLastSentMs = Number(data?.reminders?.noActionSwRevisionLastSentAtMs || 0);
        if (
          waitingSinceDefaultMs > 0 &&
          nowMs - waitingSinceDefaultMs >= oneDayMs &&
          (swLastSentMs <= 0 || nowMs - swLastSentMs >= reminderCooldownMs)
        ) {
          noActionReminders.push({
            scope: 'intake',
            targetId: intakeId,
            role: 'sw',
            recipientEmail: swEmail,
            recipientName: swName,
            memberName,
            mrn,
            waitingSinceMs: waitingSinceDefaultMs,
            stageLabel: 'Sent back to social worker',
            actionUrl: `${baseUrl}/sw-portal/alft-upload`,
            reminderField: 'noActionSwRevisionLastSentAtMs',
          });
          intakeUpdateWrites.push(
            docSnap.ref.set(
              {
                reminders: {
                  noActionSwRevisionLastSentAtMs: nowMs,
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
          );
        }
      }

      if (awaitingManagerPreRn || awaitingManagerFinal) {
        const managerReminderField = awaitingManagerFinal ? 'noActionManagerFinalLastSentAtMs' : 'noActionManagerPreRnLastSentAtMs';
        const managerLastSentMs = Number(data?.reminders?.[managerReminderField] || 0);
        if (
          waitingSinceDefaultMs > 0 &&
          nowMs - waitingSinceDefaultMs >= oneDayMs &&
          (managerLastSentMs <= 0 || nowMs - managerLastSentMs >= reminderCooldownMs)
        ) {
          managerRecipients.forEach((recipient) => {
            noActionReminders.push({
              scope: 'intake',
              targetId: intakeId,
              role: 'manager',
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              recipientUid: recipient.uid || undefined,
              memberName,
              mrn,
              waitingSinceMs: waitingSinceDefaultMs,
              stageLabel: awaitingManagerFinal
                ? 'Sent to manager for final review'
                : 'Sent to manager for pre-RN review',
              actionUrl: `${baseUrl}/admin/alft-tracker?edit=${encodeURIComponent(intakeId)}`,
            });
          });
          intakeUpdateWrites.push(
            docSnap.ref.set(
              {
                reminders: {
                  [managerReminderField]: nowMs,
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
          );
        }
      }

      const awaitingRn =
        workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
        workflowStatus.includes('awaiting_rn_final_signature');
      if (!awaitingRn) return;

      const rnSignedAtMs = toMs(data?.alftSignature?.rnSignedAt);
      if (rnSignedAtMs > 0) return;

      const rnRequestedAtMs = toMs(data?.alftSignature?.rnRequestedAt) || toMs(data?.updatedAt);
      if (!rnRequestedAtMs || nowMs - rnRequestedAtMs < twoDaysMs) return;

      const rnNoActionLastSentMs = Number(data?.reminders?.noActionRnLastSentAtMs || 0);
      if (
        rnEmail &&
        rnRequestedAtMs > 0 &&
        nowMs - rnRequestedAtMs >= oneDayMs &&
        (rnNoActionLastSentMs <= 0 || nowMs - rnNoActionLastSentMs >= reminderCooldownMs)
      ) {
        noActionReminders.push({
          scope: 'intake',
          targetId: intakeId,
          role: 'rn',
          recipientEmail: rnEmail,
          recipientName: rnName,
          memberName,
          mrn,
          waitingSinceMs: rnRequestedAtMs,
          stageLabel: 'Sent to RN for review/signature',
          actionUrl: `${baseUrl}/admin/alft-tracker?focus=${encodeURIComponent(intakeId)}`,
        });
        intakeUpdateWrites.push(
          docSnap.ref.set(
            {
              reminders: {
                noActionRnLastSentAtMs: nowMs,
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        );
      }

      const lastSentMs = Number(data?.reminders?.rnNoResponseLastSentAtMs || 0);
      if (lastSentMs > 0 && nowMs - lastSentMs < reminderCooldownMs) return;

      rnNoResponseReminders.push({
        intakeId,
        memberName,
        mrn,
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

    if (visitDateReminders.length === 0 && rnNoResponseReminders.length === 0 && noActionReminders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No ALFT reminder emails needed',
        visitDateReminders: 0,
        rnNoResponseReminders: 0,
        noActionReminders: 0,
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

    for (const reminder of noActionReminders) {
      const daysWaiting = Math.max(1, Math.floor((nowMs - reminder.waitingSinceMs) / (24 * 60 * 60 * 1000)));
      const roleLabel = reminder.role === 'sw' ? 'Social Worker' : reminder.role === 'rn' ? 'RN' : 'Kaiser Manager';
      const subject = `ALFT no-action reminder (${roleLabel}) — ${reminder.memberName}`;
      const html = `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
          <p>Hi ${reminder.recipientName},</p>
          <p><strong>${reminder.memberName}</strong> (MRN: ${reminder.mrn || '—'}) is waiting for your action.</p>
          <p><strong>Current stage:</strong> ${reminder.stageLabel}</p>
          <p><strong>Waiting:</strong> ${daysWaiting} day(s) without action.</p>
          <p>
            <a href="${reminder.actionUrl}" style="background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;display:inline-block;font-weight:600;">
              Open ALFT
            </a>
          </p>
          <p style="color:#64748b;font-size:12px;">${reminder.actionUrl}</p>
        </div>
      `;
      await resend.emails.send({
        from: 'CalAIM Tracker <noreply@carehomefinders.com>',
        to: [reminder.recipientEmail],
        subject,
        html,
      });
      sent += 1;

      if (reminder.recipientUid) {
        await adminDb.collection('staff_notifications').add({
          userId: reminder.recipientUid,
          recipientName: reminder.recipientName,
          title: 'ALFT no-action reminder',
          message: `${reminder.memberName} • MRN ${reminder.mrn || '—'}\n${reminder.stageLabel} (${daysWaiting} day(s) waiting).`,
          type: 'alft_no_action_reminder',
          priority: 'Priority',
          status: 'Open',
          isRead: false,
          source: 'alft-rn-reminders-cron',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          actionUrl: reminder.actionUrl.replace(baseUrl, ''),
          standaloneUploadId: reminder.scope === 'intake' ? reminder.targetId : null,
        });
      }
    }

    await Promise.all([...assignmentUpdateWrites, ...intakeUpdateWrites]);

    return NextResponse.json({
      success: true,
      recipients: recipients.length,
      visitDateReminders: visitDateReminders.length,
      rnNoResponseReminders: rnNoResponseReminders.length,
      noActionReminders: noActionReminders.length,
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

