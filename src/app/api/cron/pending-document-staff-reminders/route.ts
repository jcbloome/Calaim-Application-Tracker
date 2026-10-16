import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { isPendingDocumentReview } from '@/lib/review-queue';
import { resolveAppBaseUrl } from '@/lib/app-urls';

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

const getFormActivityMs = (form: any): number => {
  const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
  const fileMs = uploadedFiles.reduce((max: number, file: any) => {
    return Math.max(max, toMs(file?.uploadedAt), toMs(file?.uploadedAtIso), toMs(file?.createdAt));
  }, 0);
  return Math.max(
    fileMs,
    toMs(form?.uploadedAt),
    toMs(form?.uploadedAtIso),
    toMs(form?.dateCompleted),
    toMs(form?.completedAt),
    toMs(form?.updatedAt)
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

type PendingDoc = {
  name: string;
  uploadedAtMs: number;
};

type ReminderMember = {
  applicationId: string;
  memberName: string;
  memberMrn: string;
  documents: PendingDoc[];
  newestUploadMs: number;
  actionUrl: string;
  appRef: any;
};

/**
 * Daily digest to assigned staff listing members with uploaded documents
 * that still need review (mark reviewed to drop off this list).
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

    const easternHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(new Date())
    );
    if (easternHour !== 12) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Outside the 12:30 PM Eastern daily send hour.',
      });
    }

    const baseUrl = resolveAppBaseUrl();
    const nowMs = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const digestStateRef = adminDb.collection('system_settings').doc('pending_doc_staff_daily_digest');
    const digestStateSnap = await digestStateRef.get();
    const lastSentAtByStaff = ((digestStateSnap.exists ? digestStateSnap.data() : {}) as any)?.lastSentAtByStaff || {};

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
      const staffId = clean(app?.assignedStaffId, 128);
      const staffEmail = clean(app?.assignedStaffEmail, 200).toLowerCase();
      const staffName = clean(app?.assignedStaffName, 200) || 'Staff';
      if (!staffId && !staffEmail) continue;

      const forms = Array.isArray(app?.forms) ? app.forms : [];
      const pendingDocs: PendingDoc[] = forms
        .filter((form: any) => isPendingDocumentReview(form))
        .map((form: any) => ({
          name: clean(form?.name, 200) || 'Document upload',
          uploadedAtMs: getFormActivityMs(form),
        }))
        .filter((docItem: PendingDoc) => docItem.uploadedAtMs <= 0 || docItem.uploadedAtMs >= nowMs - cooldownMs)
        .sort((a: PendingDoc, b: PendingDoc) => b.uploadedAtMs - a.uploadedAtMs);

      if (!pendingDocs.length) continue;

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
      const newestUploadMs = pendingDocs.reduce((max, d) => Math.max(max, d.uploadedAtMs || 0), 0);

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
        documents: pendingDocs,
        newestUploadMs,
        actionUrl,
        appRef: doc.ref,
      });
    }

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
    let documentsListed = 0;
    const errors: string[] = [];

    const nextLastSentAtByStaff = { ...(lastSentAtByStaff || {}) } as Record<string, number>;
    for (const group of byStaff.values()) {
      if (!group.staffEmail || !group.members.length) continue;
      const staffKey = group.staffId || group.staffEmail;
      const previousSentMs = Number(lastSentAtByStaff?.[staffKey] || 0);
      if (previousSentMs > 0 && nowMs - previousSentMs < cooldownMs) continue;
      group.members.sort((a, b) => b.newestUploadMs - a.newestUploadMs);

      const totalDocs = group.members.reduce((sum, m) => sum + m.documents.length, 0);
      const memberBlocks = group.members
        .map((m) => {
          const docList = m.documents
            .map((d) => {
              const when =
                d.uploadedAtMs > 0
                  ? new Date(d.uploadedAtMs).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : 'Upload time unavailable';
              return `<li style="margin:4px 0;"><strong>${d.name}</strong> <span style="color:#6b7280;">(${when})</span></li>`;
            })
            .join('');
          return `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:0 0 12px;background:#f8fafc;">
              <div style="font-weight:600;margin-bottom:4px;">${m.memberName}</div>
              <div style="font-size:13px;color:#4b5563;margin-bottom:8px;">MRN: ${m.memberMrn}</div>
              <div style="font-size:13px;margin-bottom:6px;">Documents waiting for review:</div>
              <ul style="margin:0;padding-left:18px;font-size:13px;">${docList}</ul>
              <div style="margin-top:10px;">
                <a href="${m.actionUrl}" style="color:#1d4ed8;font-size:13px;">Open application →</a>
              </div>
            </div>`;
        })
        .join('');

      const html = `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;max-width:720px;">
          <h2 style="color:#1e40af;margin:0 0 12px;">Daily documents received</h2>
          <p>Hi ${group.staffName},</p>
          <p>
            Documents received in the last day for <strong>${group.members.length}</strong> member${group.members.length === 1 ? '' : 's'}
            (<strong>${totalDocs}</strong> item${totalDocs === 1 ? '' : 's'}).
          </p>
          ${memberBlocks}
          <p style="color:#6b7280;font-size:12px;margin-top:16px;">Automated CalAIM reminder — do not reply.</p>
        </div>
      `;

      try {
        await resend.emails.send({
          from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
          to: [group.staffEmail],
          subject: `Daily documents received: ${totalDocs} item${totalDocs === 1 ? '' : 's'} for ${group.members.length} member${group.members.length === 1 ? '' : 's'}`,
          html,
        });
        emailsSent += 1;
        membersReminded += group.members.length;
        documentsListed += totalDocs;
        nextLastSentAtByStaff[staffKey] = nowMs;

        const batch = adminDb.batch();
        const sentAt = admin.firestore.Timestamp.now();
        for (const member of group.members) {
          batch.set(
            member.appRef,
            {
              pendingDocStaffReminderLastSentAt: sentAt,
              pendingDocStaffReminderLastSentAtIso: new Date(nowMs).toISOString(),
              pendingDocStaffReminderLastDocCount: member.documents.length,
            },
            { merge: true }
          );
        }
        await batch.commit();
      } catch (err: any) {
        errors.push(`${group.staffEmail}: ${String(err?.message || err)}`);
      }
    }

    if (emailsSent > 0) {
      await digestStateRef.set(
        {
          lastSentAtByStaff: nextLastSentAtByStaff,
          updatedAt: new Date(nowMs).toISOString(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      success: errors.length === 0,
      emailsSent,
      membersReminded,
      documentsListed,
      staffGroups: byStaff.size,
      errors: errors.length ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[pending-document-staff-reminders]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || error) },
      { status: 500 }
    );
  }
}
