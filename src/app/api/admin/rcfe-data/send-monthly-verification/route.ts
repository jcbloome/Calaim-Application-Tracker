import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminAuth, adminDb, default as admin } from '@/firebase-admin';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

type VerificationMember = {
  id: string;
  name: string;
  planType?: 'health_net' | 'kaiser' | 'other';
  status?: 'there' | 'not_there' | 'unknown';
  lastVerifiedAt?: string;
  extraDetails?: string;
};

type VerificationRow = {
  rcfeKey?: string;
  rcfeName: string;
  adminName?: string;
  adminEmail: string;
  members: VerificationMember[];
};

type EmailMode = 'test' | 'bulk' | 'daily_followup';

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

async function requireAdminFromToken(idToken: string) {
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = String(decoded?.uid || '').trim();
  const email = normalizeEmail((decoded as any)?.email);
  if (!uid) return { ok: false as const, status: 401, error: 'Invalid token' };

  let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
  if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
  if (!isAdmin) {
    const [adminRole, superAdminRole] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminRole.exists || superAdminRole.exists;
    if (!isAdmin && email) {
      const [emailAdminRole, emailSuperAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(email).get(),
        adminDb.collection('roles_super_admin').doc(email).get(),
      ]);
      isAdmin = emailAdminRole.exists || emailSuperAdminRole.exists;
    }
  }

  if (!isAdmin) return { ok: false as const, status: 403, error: 'Admin privileges required' };
  return { ok: true as const, uid, email };
}

const toStatusLabel = (status?: string) => {
  if (status === 'there') return 'Confirmed There';
  if (status === 'not_there') return 'Told Not There';
  return 'Unverified';
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

async function requireAdminFromAuthHeader(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
  if (!idToken) {
    return { ok: false as const, status: 401, error: 'Missing Authorization Bearer token' };
  }
  return requireAdminFromToken(idToken);
}

const uniqueNonEmpty = (values: unknown[]) =>
  Array.from(new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean)));

async function loadReplyToContacts() {
  const notificationSnap = await adminDb.collection('system_settings').doc('notifications').get();
  const data = (notificationSnap.data() || {}) as any;
  const healthNetUids = uniqueNonEmpty(data?.memberVerificationHealthNetRecipientUids || []);
  const kaiserUids = uniqueNonEmpty(data?.memberVerificationKaiserRecipientUids || []);
  const allUids = Array.from(new Set([...healthNetUids, ...kaiserUids]));

  const userDocs = await Promise.all(allUids.map((uid) => adminDb.collection('users').doc(uid).get()));
  const usersByUid = userDocs.reduce((acc, docSnap) => {
    acc[docSnap.id] = (docSnap.data() || {}) as any;
    return acc;
  }, {} as Record<string, any>);

  const mapContacts = (uids: string[]) => {
    const contacts = uids
      .map((uid) => {
        const user = usersByUid[uid] || {};
        const email = normalizeEmail(user?.email || uid);
        if (!email || !email.includes('@')) return null;
        const first = String(user?.firstName || '').trim();
        const last = String(user?.lastName || '').trim();
        const name = [first, last].filter(Boolean).join(' ').trim();
        const label = name ? `${name} <${email}>` : email;
        return { email, label };
      })
      .filter(Boolean) as Array<{ email: string; label: string }>;
    return {
      emails: Array.from(new Set(contacts.map((c) => c.email))),
      labels: Array.from(new Set(contacts.map((c) => c.label))),
    };
  };

  const healthNet = mapContacts(healthNetUids);
  const kaiser = mapContacts(kaiserUids);
  return {
    healthNetEmails: healthNet.emails,
    healthNetLabels: healthNet.labels,
    kaiserEmails: kaiser.emails,
    kaiserLabels: kaiser.labels,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdminFromAuthHeader(req);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const [statusSnapshot, sentLogSnapshot, replyToContacts] = await Promise.all([
      adminDb.collection('rcfe_daily_followup_status').limit(5000).get(),
      adminDb.collection('rcfe_verification_email_send_log').orderBy('sentAt', 'desc').limit(1000).get(),
      loadReplyToContacts(),
    ]);
    const statuses = statusSnapshot.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as any;
      const toIso = (v: any) =>
        typeof v?.toDate === 'function' ? v.toDate().toISOString() : String(v || '').trim() || null;
      return {
        rcfeKey: String(data?.rcfeKey || docSnap.id || '').trim(),
        rcfeName: String(data?.rcfeName || '').trim(),
        lastDailyFollowupSentAt: toIso(data?.lastDailyFollowupSentAt),
        lastDailyFollowupSentBy: String(data?.lastDailyFollowupSentBy || '').trim() || null,
      };
    });
    const sentLog = sentLogSnapshot.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as any;
      const toIso = (v: any) =>
        typeof v?.toDate === 'function' ? v.toDate().toISOString() : String(v || '').trim() || null;
      return {
        id: docSnap.id,
        rcfeKey: String(data?.rcfeKey || '').trim() || null,
        rcfeName: String(data?.rcfeName || '').trim() || 'Unknown RCFE',
        adminName: String(data?.adminName || '').trim() || null,
        adminEmail: String(data?.adminEmail || '').trim() || null,
        batchId: String(data?.batchId || '').trim() || null,
        emailMode: String(data?.emailMode || '').trim() || 'bulk',
        sentAt: toIso(data?.sentAt),
        sentBy: String(data?.sentBy || '').trim() || null,
        isTest: Boolean(data?.isTest),
        success: Boolean(data?.success),
      };
    });
    const dailySentEntries = sentLog.filter(
      (entry) => entry?.emailMode === 'daily_followup' && entry?.success && !entry?.isTest
    );
    const toMinuteBucket = (iso: string | null | undefined) => {
      const value = String(iso || '').trim();
      return value ? value.slice(0, 16) : 'unknown';
    };
    const groupedByBatch = new Map<
      string,
      {
        batchId: string | null;
        sentAt: string | null;
        sentBy: string | null;
        rcfeKeys: Set<string>;
        rcfeNames: Set<string>;
        count: number;
      }
    >();
    dailySentEntries.forEach((entry) => {
      const explicitBatchId = String(entry?.batchId || '').trim();
      const legacyKey = `legacy:${String(entry?.sentBy || '').trim().toLowerCase()}|${toMinuteBucket(entry?.sentAt)}`;
      const key = explicitBatchId ? `batch:${explicitBatchId}` : legacyKey;
      const current =
        groupedByBatch.get(key) ||
        {
          batchId: explicitBatchId || null,
          sentAt: entry?.sentAt || null,
          sentBy: entry?.sentBy || null,
          rcfeKeys: new Set<string>(),
          rcfeNames: new Set<string>(),
          count: 0,
        };
      const sentAtMs = new Date(String(entry?.sentAt || '')).getTime();
      const currentMs = new Date(String(current.sentAt || '')).getTime();
      if (Number.isFinite(sentAtMs) && (!Number.isFinite(currentMs) || sentAtMs > currentMs)) {
        current.sentAt = entry?.sentAt || current.sentAt;
      }
      const rcfeKey = String(entry?.rcfeKey || '').trim();
      const rcfeName = String(entry?.rcfeName || '').trim();
      if (rcfeKey) current.rcfeKeys.add(rcfeKey);
      if (rcfeName) current.rcfeNames.add(rcfeName);
      current.count += 1;
      groupedByBatch.set(key, current);
    });
    const dailyBatchHistory = Array.from(groupedByBatch.values())
      .map((batch) => ({
        batchId: batch.batchId,
        sentAt: batch.sentAt,
        sentBy: batch.sentBy,
        rcfeKeys: Array.from(batch.rcfeKeys),
        rcfeNames: Array.from(batch.rcfeNames),
        count: batch.count,
      }))
      .sort((a, b) => new Date(String(b.sentAt || '')).getTime() - new Date(String(a.sentAt || '')).getTime());
    const latestDailyBatch = dailyBatchHistory[0]
      ? {
          batchId: dailyBatchHistory[0].batchId,
          sentAt: dailyBatchHistory[0].sentAt,
          rcfeKeys: dailyBatchHistory[0].rcfeKeys,
        }
      : null;

    return NextResponse.json({
      success: true,
      statuses,
      sentLog,
      dailyBatchHistory,
      latestDailyBatch,
      replyToContacts,
      count: statuses.length,
    });
  } catch (error: any) {
    console.error('Error loading RCFE daily follow-up status:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load RCFE daily follow-up status' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdminFromAuthHeader(req);
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json({ success: false, error: 'Resend API key is not configured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const subject = String(body?.subject || '').trim();
    const intro = String(body?.intro || '').trim();
    const isTest = Boolean(body?.isTest);
    const testEmail = normalizeEmail(body?.testEmail);
    const emailMode = (String(body?.emailMode || (isTest ? 'test' : 'bulk')).trim() as EmailMode) || 'bulk';
    const rows = Array.isArray(body?.rows) ? (body.rows as VerificationRow[]) : [];

    if (!subject || !intro) {
      return NextResponse.json({ success: false, error: 'subject and intro are required' }, { status: 400 });
    }

    const usableRows = rows
      .map((row) => ({
        rcfeKey: String(row?.rcfeKey || '').trim(),
        rcfeName: String(row?.rcfeName || '').trim(),
        adminName: String(row?.adminName || '').trim(),
        adminEmail: normalizeEmail(row?.adminEmail),
        members: Array.isArray(row?.members)
          ? row.members.map((m) => ({
              id: String(m?.id || '').trim(),
              name: String(m?.name || '').trim(),
              planType: (String((m as any)?.planType || '').trim().toLowerCase() as any) || 'other',
              status: (String(m?.status || '').trim() as any) || 'unknown',
              lastVerifiedAt: String(m?.lastVerifiedAt || '').trim(),
              extraDetails: String(m?.extraDetails || '').trim(),
            }))
          : [],
      }))
      .map((row) => ({
        ...row,
        // Health Net only for current workflow; Kaiser-specific emails will be configured later.
        members: row.members.filter((member) => member.planType === 'health_net'),
      }))
      .filter((row) => row.rcfeName && row.adminEmail && row.adminEmail.includes('@') && row.members.length > 0);

    if (usableRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid RCFE rows with admin emails/members to send' }, { status: 400 });
    }

    const sendRows = isTest
      ? usableRows.slice(0, 1).map((row) => ({ ...row, adminEmail: testEmail || authz.email }))
      : usableRows;
    const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const replyToContacts = await loadReplyToContacts();
    const replyToEmails = replyToContacts.healthNetEmails;
    const replyToLabels = replyToContacts.healthNetLabels;
    const replyToDisplay = replyToLabels.join(', ') || replyToEmails.join(', ');

    const results: Array<{ to: string; rcfeName: string; id?: string; error?: string }> = [];

    for (const row of sendRows) {
      const verifiedThere = row.members.filter((m) => m.status === 'there');
      const notAtRcfe = row.members.filter((m) => m.status === 'not_there');
      const unverified = row.members.filter((m) => m.status !== 'there' && m.status !== 'not_there');

      const buildRowsHtml = (members: VerificationMember[]) =>
        members
          .map((member) => {
            const status = toStatusLabel(member.status);
            return `
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(member.name)}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(member.id)}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(status)}</td>
              </tr>
            `;
          })
          .join('');

      const buildSection = (title: string, members: VerificationMember[]) => {
        if (members.length === 0) {
          return `<p style="margin:8px 0 0;color:#6b7280;"><strong>${escapeHtml(title)}:</strong> None listed.</p>`;
        }
        return `
          <h3 style="margin:14px 0 6px;font-size:15px;">${escapeHtml(title)} (${members.length})</h3>
          <table style="border-collapse:collapse;width:100%;margin-top:6px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Member Name</th>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Client ID</th>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Current Status</th>
              </tr>
            </thead>
            <tbody>${buildRowsHtml(members)}</tbody>
          </table>
        `;
      };

      const timestamp = new Date().toLocaleString();
      const effectiveSubject =
        emailMode === 'daily_followup'
          ? `[Daily Follow-up ${timestamp}] ${subject}`
          : subject;

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;line-height:1.5;color:#111827;">
          <p>${escapeHtml(intro).replace(/\n/g, '<br/>')}</p>
          <p style="margin-top:4px;color:#6b7280;"><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>
          <p style="margin-top:4px;color:#6b7280;"><strong>Plan scope:</strong> Health Net members only</p>
          <p style="margin-top:4px;color:#6b7280;"><strong>Reply to assigned staff:</strong> ${escapeHtml(
            replyToDisplay || 'Assigned Health Net verification staff (not configured yet)'
          )}</p>
          <p><strong>RCFE:</strong> ${escapeHtml(row.rcfeName)}</p>
          <p style="margin-top:6px;"><strong>Please reply to confirm this roster for your RCFE.</strong></p>
          <p style="margin-top:4px;color:#374151;">
            Please reply and confirm:
            <br/>1) Who is still living at your RCFE.
            <br/>2) Who is not currently at your RCFE.
            <br/>3) Any corrections we should make.
          </p>
          ${buildSection('Members Verified at RCFE (Confirmed There)', verifiedThere)}
          ${buildSection('Residents Not at RCFE (Told Not There)', notAtRcfe)}
          ${buildSection('Members Pending Verification', unverified)}
          <p style="margin-top:12px;">Thank you for confirming by email reply.</p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: 'Connections CalAIM <noreply@carehomefinders.com>',
        to: [row.adminEmail],
        ...(replyToEmails.length ? { replyTo: replyToEmails } : {}),
        subject: effectiveSubject,
        html,
      });

      if (error) {
        results.push({ to: row.adminEmail, rcfeName: row.rcfeName, error: error.message });
        await adminDb.collection('rcfe_verification_email_send_log').add({
          rcfeKey: row.rcfeKey || null,
          rcfeName: row.rcfeName,
          adminName: row.adminName || null,
          adminEmail: row.adminEmail,
          batchId,
          emailMode,
          isTest,
          success: false,
          error: error.message,
          replyToEmails,
          sentBy: authz.email || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        results.push({ to: row.adminEmail, rcfeName: row.rcfeName, id: data?.id });
        await adminDb.collection('rcfe_verification_email_send_log').add({
          rcfeKey: row.rcfeKey || null,
          rcfeName: row.rcfeName,
          adminName: row.adminName || null,
          adminEmail: row.adminEmail,
          batchId,
          emailMode,
          isTest,
          success: true,
          providerMessageId: data?.id || null,
          replyToEmails,
          sentBy: authz.email || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (emailMode === 'daily_followup' && row.rcfeKey) {
          await adminDb.collection('rcfe_daily_followup_status').doc(row.rcfeKey).set(
            {
              rcfeKey: row.rcfeKey,
              rcfeName: row.rcfeName,
              lastDailyFollowupSentAt: admin.firestore.FieldValue.serverTimestamp(),
              lastDailyFollowupSentBy: authz.email || null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    }

    const failed = results.filter((r) => r.error);
    await adminDb.collection('system_note_log').add({
      type: emailMode === 'daily_followup' ? 'rcfe_daily_followup_email' : 'rcfe_monthly_verification_email',
      actorUid: authz.uid,
      actorEmail: authz.email,
      subject,
      emailMode,
      isTest,
      attempted: results.length,
      failed: failed.length,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      isTest,
      attempted: results.length,
      sent: results.length - failed.length,
      failed: failed.length,
      results,
    });
  } catch (error: any) {
    console.error('Error sending RCFE monthly verification emails:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send monthly verification emails' },
      { status: 500 }
    );
  }
}
