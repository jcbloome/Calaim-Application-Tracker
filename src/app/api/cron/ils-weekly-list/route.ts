import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (resendClient) return resendClient;
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const force = String(new URL(request.url).searchParams.get('force') || '').toLowerCase() === 'true';
    const utcDay = new Date().getUTCDay(); // 3 = Wednesday
    if (!force && utcDay !== 3) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Not Wednesday (UTC)' });
    }

    const settingsSnap = await adminDb.collection('system_settings').doc('ils_member_access').get();
    const settings = (settingsSnap.exists ? settingsSnap.data() : {}) as any;
    const weeklyEmailEnabled = Boolean(settings?.weeklyEmailEnabled);
    const recipients = Array.isArray(settings?.weeklyEmailRecipients)
      ? settings.weeklyEmailRecipients.map(normalizeEmail).filter(Boolean)
      : [];

    if (!weeklyEmailEnabled || recipients.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'Weekly ILS email disabled or no recipients' });
    }

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const membersUrl = `${credentials.baseUrl}/rest/v2/tables/CalAIM_tbl_Members/records?q.where=ILS_View='Yes'&q.limit=1000`;
    const membersResponse = await fetch(membersUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!membersResponse.ok) {
      const errorText = await membersResponse.text().catch(() => '');
      return NextResponse.json({ success: false, error: `Failed to fetch ILS members: ${errorText}` }, { status: 500 });
    }
    const membersData = await membersResponse.json();
    const rows = Array.isArray(membersData?.Result) ? membersData.Result : [];
    const total = rows.length;

    const previewRows = rows
      .slice()
      .sort(
        (a: any, b: any) =>
          String(a?.Senior_Last || '').localeCompare(String(b?.Senior_Last || '')) ||
          String(a?.Senior_First || '').localeCompare(String(b?.Senior_First || ''))
      )
      .slice(0, 80);

    const tableRows = previewRows
      .map((m: any) => {
        const name = `${String(m?.Senior_First || '').trim()} ${String(m?.Senior_Last || '').trim()}`.trim() || 'Member';
        const mrn = String(m?.MCP_CIN || m?.MediCal_Number || '').trim() || 'N/A';
        const kaiser = String(m?.Kaiser_Status || '').trim() || 'Unknown';
        const tierDate =
          String(
            m?.Kaiser_Tier_Level_Requested_Date ||
              m?.Tier_Level_Request_Date ||
              m?.Tier_Level_Requested_Date ||
              ''
          ).trim() || 'N/A';
        return `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;">${name}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${mrn}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${kaiser}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${tierDate}</td></tr>`;
      })
      .join('');

    const dateLabel = new Date().toLocaleDateString();
    await resend.emails.send({
      from: 'Connections CalAIM <noreply@carehomefinders.com>',
      to: recipients,
      subject: `ILS Weekly Member List (${dateLabel})`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#111827;">
          <h2 style="margin:0 0 8px;">ILS Weekly Member List</h2>
          <p style="margin:0 0 12px;">Total ILS members: <strong>${total}</strong></p>
          <p style="margin:0 0 16px;font-size:12px;color:#6b7280;">Showing first ${previewRows.length} members in this email preview.</p>
          <table style="border-collapse:collapse; width:100%; font-size:12px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Member</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">MRN</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Kaiser Status</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Tier Level Request Date</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      `,
    });

    return NextResponse.json({ success: true, sentTo: recipients.length, totalMembers: total });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to send ILS weekly list' }, { status: 500 });
  }
}

