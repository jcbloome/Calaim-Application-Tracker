import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';

const normalize = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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

    const resend = getResendClient();
    if (!resend) return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });

    const settingsSnap = await adminDb.collection('system_settings').doc('kaiser_rcfe_weekly_confirm').get();
    const entries = (settingsSnap.exists ? (settingsSnap.data()?.entries as Record<string, any>) : {}) || {};
    const enabledRows = Object.values(entries).filter((e: any) => Boolean(e?.enabled));
    if (enabledRows.length === 0) {
      return NextResponse.json({ success: true, skipped: true, reason: 'No enabled RCFE weekly toggles' });
    }

    const cacheSnap = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_MCO', '==', 'Kaiser')
      .limit(5000)
      .get();
    const members = cacheSnap.docs.map((d) => d.data() as any);

    const byRcfe = new Map<string, any[]>();
    for (const m of members) {
      const key = normalize(m?.RCFE_Name);
      if (!key) continue;
      if (!byRcfe.has(key)) byRcfe.set(key, []);
      byRcfe.get(key)!.push(m);
    }

    let sent = 0;
    const errors: Array<{ rcfe: string; error: string }> = [];

    for (const row of enabledRows as any[]) {
      const rcfeName = String(row?.rcfeName || '').trim();
      const to = String(row?.rcfeAdminEmail || '').trim();
      if (!rcfeName || !to) continue;
      try {
        const membersAtRcfe = byRcfe.get(normalize(rcfeName)) || [];
        await resend.emails.send({
          from: 'Connections CalAIM <noreply@carehomefinders.com>',
          to: [to],
          subject: `Weekly confirmation needed: ${rcfeName}`,
          html: `
            <div style="font-family: Arial, sans-serif; color:#111827;">
              <h3 style="margin:0 0 8px;">Weekly RCFE Contact Confirmation</h3>
              <p style="margin:0 0 10px;">Hello,</p>
              <p style="margin:0 0 10px;">
                Please confirm whether ILS has contacted your RCFE this week for Kaiser members.
              </p>
              <p style="margin:0 0 10px;"><strong>RCFE:</strong> ${rcfeName}</p>
              <p style="margin:0 0 10px;"><strong>Kaiser members currently listed at this RCFE:</strong> ${membersAtRcfe.length}</p>
              <p style="margin:0;color:#6b7280;font-size:12px;">
                This is an automated weekly email from CalAIM Tracker.
              </p>
            </div>
          `,
        });
        sent += 1;
      } catch (e: any) {
        errors.push({ rcfe: rcfeName, error: e?.message || 'Failed to send' });
      }
    }

    return NextResponse.json({ success: true, enabled: enabledRows.length, sent, errors });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send RCFE weekly confirmations' },
      { status: 500 }
    );
  }
}
