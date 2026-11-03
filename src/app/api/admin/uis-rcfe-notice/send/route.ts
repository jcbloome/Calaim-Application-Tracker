import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  buildUisNoticeHtml,
  normalizeEmail,
  UIS_NOTICE_SUBJECT,
  type UisMatchedMember,
  type UisRcfeGroup,
} from '@/lib/uis-rcfe-notice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

const csvEscape = (value: unknown) => {
  const raw = String(value ?? '');
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

function membersCsv(members: UisMatchedMember[]): string {
  const columns = [
    'Medi-Cal ID',
    'Last name',
    'First name',
    'DOB',
    'Client_ID2',
    'CalAIM status',
    'MCO',
    'RCFE name',
    'RCFE city',
  ];
  const rows = members.map((m) =>
    [
      m.mediCalId,
      m.lastName,
      m.firstName,
      m.dob,
      m.clientId2,
      m.calaimStatus,
      m.mco,
      m.rcfeName,
      m.rcfeCity,
    ]
      .map(csvEscape)
      .join(',')
  );
  return [columns.join(','), ...rows].join('\r\n');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Send UIS transition notice to one or more RCFE groups (CSV of impacted members attached). */
export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
  if (!authCheck.ok) {
    return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
  }

  try {
    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json({ success: false, error: 'Resend API key is not configured' }, { status: 500 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      groups?: UisRcfeGroup[];
      testEmail?: string;
      subject?: string;
    };
    const groups = Array.isArray(body.groups) ? body.groups : [];
    const testEmail = normalizeEmail(body.testEmail);
    const subject = String(body.subject || UIS_NOTICE_SUBJECT).trim() || UIS_NOTICE_SUBJECT;

    if (!groups.length) {
      return NextResponse.json({ success: false, error: 'No RCFE groups to email.' }, { status: 400 });
    }

    const html = buildUisNoticeHtml();
    const results: Array<{
      rcfeName: string;
      to: string[];
      memberCount: number;
      ok: boolean;
      id?: string;
      error?: string;
    }> = [];

    for (const group of groups) {
      const members = Array.isArray(group.members) ? group.members : [];
      const to = testEmail
        ? [testEmail]
        : [...new Set((group.emails || []).map(normalizeEmail).filter(Boolean))];

      if (!to.length) {
        results.push({
          rcfeName: group.rcfeName || 'Unknown RCFE',
          to: [],
          memberCount: members.length,
          ok: false,
          error: 'No email on file',
        });
        continue;
      }

      const csv = membersCsv(members);
      const fileName = `UIS impacted members - ${(group.rcfeName || 'RCFE').replace(/[^\w\s.-]/g, '').trim() || 'RCFE'}.csv`;

      try {
        const { data, error } = await resend.emails.send({
          from: 'Connections CalAIM <noreply@carehomefinders.com>',
          to,
          subject: testEmail
            ? `[TEST for ${group.rcfeName || 'RCFE'}] ${subject}`
            : subject,
          html,
          attachments: [
            {
              filename: fileName,
              content: Buffer.from(csv, 'utf8'),
            },
          ],
        });
        if (error) {
          results.push({
            rcfeName: group.rcfeName || 'Unknown RCFE',
            to,
            memberCount: members.length,
            ok: false,
            error: error.message,
          });
        } else {
          results.push({
            rcfeName: group.rcfeName || 'Unknown RCFE',
            to,
            memberCount: members.length,
            ok: true,
            id: data?.id,
          });
        }
      } catch (error: any) {
        results.push({
          rcfeName: group.rcfeName || 'Unknown RCFE',
          to,
          memberCount: members.length,
          ok: false,
          error: String(error?.message || 'Send failed'),
        });
      }

      // Light throttle to avoid Resend rate limits on larger RCFE lists.
      await sleep(250);
      if (testEmail) break; // one test send is enough
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    try {
      const adminModule = await import('@/firebase-admin');
      const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
      await authCheck.adminDb.collection('notifications').add({
        type: 'uis_rcfe_notice_send',
        message: `UIS RCFE notice: ${sent} sent, ${failed} failed${testEmail ? ` (test to ${testEmail})` : ''}.`,
        sentBy: authCheck.name || authCheck.email || 'Admin',
        senderEmail: authCheck.email || '',
        sentAt: serverTimestamp,
        source: 'system',
        subtype: 'uis-rcfe-notice',
        meta: { sent, failed, testEmail: testEmail || null, resultCount: results.length },
      });
    } catch {
      // non-blocking
    }

    return NextResponse.json({
      success: failed === 0,
      sent,
      failed,
      testMode: Boolean(testEmail),
      results,
    });
  } catch (error: any) {
    console.error('[uis-rcfe-notice/send] failed', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send UIS notices') },
      { status: 500 }
    );
  }
}
