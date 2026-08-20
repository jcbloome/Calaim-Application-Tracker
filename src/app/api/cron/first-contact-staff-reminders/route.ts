import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  getApplicationKaiserStatus,
  isFirstContactAcknowledged,
  isNeedFirstContactKaiserStatus,
  shouldTrackFirstContactAck,
} from '@/lib/first-contact-ack';

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

type ReminderMember = {
  applicationId: string;
  memberName: string;
  memberMrn: string;
  kaiserStatus: string;
  assignedAtMs: number;
  actionUrl: string;
  appRef: any;
};

/**
 * Daily reminders to assigned staff for Kaiser "Need First Contact" members
 * that have not yet been acknowledged in the app.
 */
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
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const baseUrl = clean(
      process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://connectcalaim.com',
      400
    ).replace(/\/$/, '');
    const nowMs = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;

    const appsSnap = await adminDb.collectionGroup('applications').get();
    const byStaff = new Map<
      string,
      {
        staffId: string;
        staffName: string;
        staffEmail: string;
        members: ReminderMember[];
      }
    >();

    for (const doc of appsSnap.docs) {
      const app = doc.data() as any;
      if (!shouldTrackFirstContactAck(app)) continue;
      if (isFirstContactAcknowledged(app)) continue;
      if (!isNeedFirstContactKaiserStatus(getApplicationKaiserStatus(app))) continue;

      const lastSentMs = toMs(app?.firstContactStaffReminderLastSentAt);
      if (lastSentMs > 0 && nowMs - lastSentMs < cooldownMs) continue;

      const staffId = clean(app?.assignedStaffId, 128);
      const staffEmail = clean(app?.assignedStaffEmail, 200).toLowerCase();
      const staffName = clean(app?.assignedStaffName, 200) || 'Staff';
      if (!staffId && !staffEmail) continue;

      const context = parseDocContext(doc.ref.path);
      const applicationId = context.applicationId || doc.id;
      const actionUrl = `${baseUrl}/admin/applications/${encodeURIComponent(applicationId)}${
        context.appUserId ? `?userId=${encodeURIComponent(context.appUserId)}` : ''
      }`;
      const memberName =
        clean(`${clean(app?.memberFirstName)} ${clean(app?.memberLastName)}`, 200) ||
        clean(app?.memberName, 200) ||
        'Member';
      const memberMrn = clean(app?.memberMrn || app?.Member_MRN, 80) || 'N/A';
      const assignedAtMs = Math.max(
        toMs(app?.firstContactAssignedAt),
        toMs(app?.assignedDate),
        toMs(app?.lastUpdated),
        toMs(app?.createdAt)
      );

      const key = staffId || staffEmail;
      if (!byStaff.has(key)) {
        byStaff.set(key, {
          staffId,
          staffName,
          staffEmail,
          members: [],
        });
      }
      byStaff.get(key)!.members.push({
        applicationId,
        memberName,
        memberMrn,
        kaiserStatus: getApplicationKaiserStatus(app) || 'Need First Contact',
        assignedAtMs,
        actionUrl,
        appRef: doc.ref,
      });
    }

    // Resolve missing emails from users collection
    for (const group of byStaff.values()) {
      if (group.staffEmail || !group.staffId) continue;
      try {
        const userSnap = await adminDb.collection('users').doc(group.staffId).get();
        if (userSnap.exists) {
          const data = userSnap.data() as any;
          group.staffEmail = clean(data?.email, 200).toLowerCase();
          if (!group.staffName || group.staffName === 'Staff') {
            group.staffName =
              clean(`${clean(data?.firstName)} ${clean(data?.lastName)}`, 200) ||
              clean(data?.displayName, 200) ||
              group.staffName;
          }
        }
      } catch {
        // ignore
      }
    }

    let emailsSent = 0;
    let membersReminded = 0;
    const errors: string[] = [];

    for (const group of byStaff.values()) {
      if (!group.staffEmail || !group.members.length) continue;
      group.members.sort((a, b) => a.assignedAtMs - b.assignedAtMs);

      const rows = group.members
        .map(
          (m) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${m.memberName}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${m.memberMrn}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${m.kaiserStatus}</td>
              <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
                <a href="${m.actionUrl}">Open app</a>
              </td>
            </tr>`
        )
        .join('');

      const html = `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
          <h2 style="color:#1e40af;margin:0 0 12px;">Daily first-contact reminder</h2>
          <p>Hi ${group.staffName},</p>
          <p>
            You have <strong>${group.members.length}</strong> Kaiser member${group.members.length === 1 ? '' : 's'}
            still waiting for first-contact acknowledgement in the CalAIM app.
          </p>
          <p>
            Open each member, check <strong>Acknowledge first-contact assignment</strong>, and mark
            <strong>In progress</strong> once outreach has started. Acknowledged members drop off this daily list.
          </p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0;">
            <thead>
              <tr style="background:#f8fafc;text-align:left;">
                <th style="padding:8px;border-bottom:1px solid #e5e7eb;">Member</th>
                <th style="padding:8px;border-bottom:1px solid #e5e7eb;">MRN</th>
                <th style="padding:8px;border-bottom:1px solid #e5e7eb;">Kaiser Status</th>
                <th style="padding:8px;border-bottom:1px solid #e5e7eb;">Link</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#6b7280;font-size:12px;">Automated CalAIM reminder — do not reply.</p>
        </div>
      `;

      try {
        await resend.emails.send({
          from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
          to: [group.staffEmail],
          subject: `Daily reminder: ${group.members.length} member${group.members.length === 1 ? '' : 's'} need first contact`,
          html,
        });
        emailsSent += 1;
        membersReminded += group.members.length;

        const batch = adminDb.batch();
        const sentAt = admin.firestore.Timestamp.now();
        for (const member of group.members) {
          batch.set(
            member.appRef,
            {
              firstContactStaffReminderLastSentAt: sentAt,
              firstContactStaffReminderLastSentAtIso: new Date(nowMs).toISOString(),
            },
            { merge: true }
          );
        }
        await batch.commit();
      } catch (err: any) {
        errors.push(`${group.staffEmail}: ${String(err?.message || err)}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      emailsSent,
      membersReminded,
      staffGroups: byStaff.size,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[first-contact-staff-reminders]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
