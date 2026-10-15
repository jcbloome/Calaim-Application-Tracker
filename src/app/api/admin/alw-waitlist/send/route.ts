import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  ALW_WAITLIST_CCA_NAME,
  ALW_WAITLIST_FROM,
  ALW_WAITLIST_TO_EMAIL,
  buildAlwWaitlistFileName,
  buildAlwWaitlistWorkbookBuffer,
  collectAuthorizedHealthNetAlwRows,
  type AlwWaitlistMemberRow,
} from '@/lib/alw-waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function uniqueEmails(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed || !trimmed.includes('@')) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const previewOnly = Boolean(body.previewOnly);
    const toOverride = String(body.to || '').trim();
    const includeRows = Array.isArray(body.rows) ? (body.rows as AlwWaitlistMemberRow[]) : null;

    let rows: AlwWaitlistMemberRow[] = [];
    if (includeRows && includeRows.length > 0) {
      rows = includeRows.filter((row) => String(row?.memberName || '').trim());
    } else {
      const credentials = getCaspioCredentialsFromEnv();
      const result = await fetchAllCalAIMMembers(credentials, {
        includeRawData: true,
        forceRefresh: true,
      });
      const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : result.members || [];
      rows = collectAuthorizedHealthNetAlwRows(rawMembers as Array<Record<string, unknown>>);
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No authorized Health Net members found for the ALW waitlist sheet.' },
        { status: 400 }
      );
    }

    const fileName = buildAlwWaitlistFileName();
    const workbookBuffer = buildAlwWaitlistWorkbookBuffer(rows);
    const workbookBase64 = workbookBuffer.toString('base64');

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        previewOnly: true,
        count: rows.length,
        fileName,
        ccaName: ALW_WAITLIST_CCA_NAME,
        toEmail: toOverride || ALW_WAITLIST_TO_EMAIL,
        workbookBase64,
      });
    }

    const resendKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!resendKey) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY is not configured.' }, { status: 500 });
    }

    const submitterEmail = String(authz.email || '').trim().toLowerCase();
    const submitterName = String(authz.name || '').trim() || submitterEmail || 'Connections staff';
    const toRecipients = uniqueEmails([toOverride || ALW_WAITLIST_TO_EMAIL]);
    const ccRecipients = uniqueEmails([submitterEmail, 'jason@carehomefinders.com']);

    const subject = `ALW Waitlist Request — ${rows.length} authorized Health Net member${rows.length === 1 ? '' : 's'} — ${ALW_WAITLIST_CCA_NAME}`;
    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827; line-height: 1.5;">
        <p>Hello Sierra CCA,</p>
        <p>
          Please find attached an Assisted Living Waiver Waitlist Request spreadsheet for
          <strong>${rows.length}</strong> authorized Health Net CalAIM member${rows.length === 1 ? '' : 's'}.
        </p>
        <p>
          <strong>Care Coordination Agency:</strong> ${ALW_WAITLIST_CCA_NAME}<br/>
          <strong>Sent by:</strong> ${submitterName}${submitterEmail ? ` (${submitterEmail})` : ''}
        </p>
        <p>
          Fields are pre-filled from our CalAIM member records where available.
          Blank cells (and program/service checkboxes) may still need completion on your side.
        </p>
        <p>Thank you,<br/>Connections CalAIM</p>
      </div>
    `;

    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: ALW_WAITLIST_FROM,
      to: toRecipients,
      ...(ccRecipients.length ? { cc: ccRecipients } : {}),
      subject,
      html,
      attachments: [
        {
          filename: fileName,
          content: workbookBase64,
        },
      ],
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: String(error.message || 'Failed to send ALW waitlist email.') },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: rows.length,
      fileName,
      to: toRecipients,
      cc: ccRecipients,
      ccaName: ALW_WAITLIST_CCA_NAME,
      providerMessageId: String(data?.id || ''),
    });
  } catch (error: any) {
    console.error('[alw-waitlist/send]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Unexpected ALW waitlist send error.') },
      { status: 500 }
    );
  }
}
