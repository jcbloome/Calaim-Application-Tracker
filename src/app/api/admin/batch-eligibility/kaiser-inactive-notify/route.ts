import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  buildKaiserInactiveMembersCsv,
  buildKaiserInactiveNoticeHtml,
  KAISER_INACTIVE_NOTICE_CC,
  KAISER_INACTIVE_NOTICE_SUBJECT,
  normalizeEmail,
  type KaiserInactiveRcfeGroup,
} from '@/lib/kaiser-inactive-rcfe-notice';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Email RCFEs about Kaiser Medi-Cal inactive members from a batch eligibility decode. */
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
      groups?: KaiserInactiveRcfeGroup[];
      testEmail?: string;
      subject?: string;
      runId?: string;
    };
    const groups = Array.isArray(body.groups) ? body.groups : [];
    const testEmail = normalizeEmail(body.testEmail);
    const subject =
      String(body.subject || KAISER_INACTIVE_NOTICE_SUBJECT).trim() || KAISER_INACTIVE_NOTICE_SUBJECT;
    const cc = [normalizeEmail(KAISER_INACTIVE_NOTICE_CC)].filter(Boolean);

    if (!groups.length) {
      return NextResponse.json({ success: false, error: 'No RCFE groups to email.' }, { status: 400 });
    }

    const results: Array<{
      rcfeName: string;
      to: string[];
      cc: string[];
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
          cc,
          memberCount: members.length,
          ok: false,
          error: 'No RCFE admin email on file',
        });
        continue;
      }

      const html = buildKaiserInactiveNoticeHtml({
        memberCount: members.length,
        rcfeName: group.rcfeName,
      });
      const csv = buildKaiserInactiveMembersCsv(members);
      const fileName = `Kaiser inactive members - ${(group.rcfeName || 'RCFE')
        .replace(/[^\w\s.-]/g, '')
        .trim() || 'RCFE'}.csv`;

      // Avoid duplicating CC when the RCFE email is the same as jason@.
      const ccFiltered = cc.filter((email) => !to.includes(email));

      try {
        const { data, error } = await resend.emails.send({
          from: 'Connections CalAIM <noreply@carehomefinders.com>',
          to,
          cc: ccFiltered.length ? ccFiltered : undefined,
          subject: testEmail ? `[TEST for ${group.rcfeName || 'RCFE'}] ${subject}` : subject,
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
            cc: ccFiltered,
            memberCount: members.length,
            ok: false,
            error: error.message,
          });
        } else {
          results.push({
            rcfeName: group.rcfeName || 'Unknown RCFE',
            to,
            cc: ccFiltered,
            memberCount: members.length,
            ok: true,
            id: data?.id,
          });
        }
      } catch (error: any) {
        results.push({
          rcfeName: group.rcfeName || 'Unknown RCFE',
          to,
          cc: ccFiltered,
          memberCount: members.length,
          ok: false,
          error: String(error?.message || 'Send failed'),
        });
      }

      await sleep(250);
      if (testEmail) break;
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    try {
      const adminModule = await import('@/firebase-admin');
      const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
      await authCheck.adminDb.collection('notifications').add({
        type: 'kaiser_inactive_rcfe_notice_send',
        message: `Kaiser inactive RCFE notice: ${sent} sent, ${failed} failed${
          testEmail ? ` (test to ${testEmail})` : ''
        }.`,
        sentBy: authCheck.name || authCheck.email || 'Admin',
        senderEmail: authCheck.email || '',
        sentAt: serverTimestamp,
        source: 'system',
        runId: String(body.runId || '').trim() || null,
        results,
      });
    } catch {
      // ignore audit failure
    }

    return NextResponse.json({ success: true, sent, failed, results, cc });
  } catch (error: any) {
    console.error('[kaiser-inactive-notify]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send Kaiser inactive notices.') },
      { status: 500 }
    );
  }
}
