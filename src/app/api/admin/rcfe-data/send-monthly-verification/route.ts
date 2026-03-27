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
  status?: 'there' | 'not_there' | 'unknown';
  lastVerifiedAt?: string;
  extraDetails?: string;
};

type VerificationRow = {
  rcfeName: string;
  adminName?: string;
  adminEmail: string;
  members: VerificationMember[];
};

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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const authz = await requireAdminFromToken(idToken);
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
    const rows = Array.isArray(body?.rows) ? (body.rows as VerificationRow[]) : [];

    if (!subject || !intro) {
      return NextResponse.json({ success: false, error: 'subject and intro are required' }, { status: 400 });
    }

    const usableRows = rows
      .map((row) => ({
        rcfeName: String(row?.rcfeName || '').trim(),
        adminName: String(row?.adminName || '').trim(),
        adminEmail: normalizeEmail(row?.adminEmail),
        members: Array.isArray(row?.members)
          ? row.members.map((m) => ({
              id: String(m?.id || '').trim(),
              name: String(m?.name || '').trim(),
              status: (String(m?.status || '').trim() as any) || 'unknown',
              lastVerifiedAt: String(m?.lastVerifiedAt || '').trim(),
              extraDetails: String(m?.extraDetails || '').trim(),
            }))
          : [],
      }))
      .filter((row) => row.rcfeName && row.adminEmail && row.adminEmail.includes('@') && row.members.length > 0);

    if (usableRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid RCFE rows with admin emails/members to send' }, { status: 400 });
    }

    const sendRows = isTest
      ? usableRows.slice(0, 1).map((row) => ({ ...row, adminEmail: testEmail || authz.email }))
      : usableRows;

    const results: Array<{ to: string; rcfeName: string; id?: string; error?: string }> = [];

    for (const row of sendRows) {
      const rowsHtml = row.members
        .map((member) => {
          const status = toStatusLabel(member.status);
          const lastVerified = member.lastVerifiedAt ? escapeHtml(member.lastVerifiedAt) : 'Not recorded';
          const details = member.extraDetails ? `<div style="font-size:12px;color:#6b7280;">Notes: ${escapeHtml(member.extraDetails)}</div>` : '';
          return `
            <tr>
              <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(member.name)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(member.id)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(status)}</td>
              <td style="padding:8px;border:1px solid #e5e7eb;">${lastVerified}${details}</td>
            </tr>
          `;
        })
        .join('');

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;line-height:1.5;color:#111827;">
          <p>${escapeHtml(intro).replace(/\n/g, '<br/>')}</p>
          <p><strong>RCFE:</strong> ${escapeHtml(row.rcfeName)}</p>
          <table style="border-collapse:collapse;width:100%;margin-top:10px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Member Name</th>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Client ID</th>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Current Status</th>
                <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;background:#f9fafb;">Last Verified / Notes</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="margin-top:12px;">Please reply with any updates for members who have moved or no longer reside at the RCFE.</p>
        </div>
      `;

      const { data, error } = await resend.emails.send({
        from: 'Connections CalAIM <noreply@carehomefinders.com>',
        to: [row.adminEmail],
        subject,
        html,
      });

      if (error) {
        results.push({ to: row.adminEmail, rcfeName: row.rcfeName, error: error.message });
      } else {
        results.push({ to: row.adminEmail, rcfeName: row.rcfeName, id: data?.id });
      }
    }

    const failed = results.filter((r) => r.error);
    await adminDb.collection('system_note_log').add({
      type: 'rcfe_monthly_verification_email',
      actorUid: authz.uid,
      actorEmail: authz.email,
      subject,
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
