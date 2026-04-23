import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/firebase-admin';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const normalizeStatus = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const toYmd = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a') return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, '0');
    const dd = String(us[2]).padStart(2, '0');
    const yyyy = String(us[3]);
    return `${yyyy}-${mm}-${dd}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const hasMeaningfulValue = (value: unknown) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['null', 'undefined', 'n/a'].includes(normalized);
};

const isFinalMemberAtRcfe = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === 'final member at rcfe' || normalized === 'final at rcfe';
};

const isRbPendingOrFinalAtRcfeStatus = (value: unknown): boolean => {
  const normalized = normalizeStatus(value).replace(/[^a-z0-9]+/g, ' ').trim();
  return (
    normalized === 'r b sent pending ils contract' ||
    normalized === 'r b pending ils contract' ||
    normalized === 'final member at rcfe' ||
    normalized === 'final at rcfe'
  );
};

const getWeekStartYmd = (date = new Date()): string => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
};

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

    const resend = getResendClient();
    if (weeklyEmailEnabled && recipients.length > 0 && !resend) {
      return NextResponse.json({ success: false, error: 'RESEND_API_KEY missing' }, { status: 500 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);
    const membersUrl = `${credentials.baseUrl}/integrations/rest/v3/tables/CalAIM_tbl_Members/records?q.where=CalAIM_MCO='Kaiser'&q.limit=5000`;
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
    type QueueRow = { id: string; name: string; mrn: string; status: string; requestedDate: string };
    const queueRows = (membersInQueue: any[], requestedDateFor: (m: any) => string): QueueRow[] =>
      membersInQueue
        .map((m: any) => ({
          id: String(m?.Client_ID2 || '').trim(),
          name: `${String(m?.Senior_First || '').trim()} ${String(m?.Senior_Last || '').trim()}`.trim() || 'Member',
          mrn: String(m?.MCP_CIN || m?.MediCal_Number || '').trim() || 'N/A',
          status: String(m?.Kaiser_Status || '').trim() || 'Unknown',
          requestedDate: requestedDateFor(m),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const t2038AuthOnlyMembers = rows.filter((m: any) => {
      const hasAuthEmail = hasMeaningfulValue(m?.T2038_Auth_Email_Kaiser);
      const hasOfficialAuth =
        hasMeaningfulValue(m?.Kaiser_T2038_Received_Date) ||
        hasMeaningfulValue(m?.Kaiser_T2038_Received) ||
        hasMeaningfulValue(m?.Kaiser_T038_Received);
      return hasAuthEmail && !hasOfficialAuth;
    });
    const t2038RequestedMembers = rows.filter((m: any) => {
      const requested = Boolean(toYmd(m?.Kaiser_T2038_Requested || m?.Kaiser_T2038_Requested_Date));
      const received = Boolean(
        toYmd(m?.Kaiser_T2038_Received_Date || m?.Kaiser_T2038_Received || m?.Kaiser_T038_Received)
      );
      return requested && !received;
    });
    const t2038ReceivedUnreachableMembers = rows.filter((m: any) => {
      const compactStatus = normalizeStatus(m?.Kaiser_Status).replace(/[^a-z0-9]+/g, ' ').trim();
      return compactStatus === 't2038 received unreachable';
    });
    const tierRequestedMembers = rows.filter((m: any) => {
      const requested = Boolean(
        toYmd(
          m?.Kaiser_Tier_Level_Requested ||
            m?.Kaiser_Tier_Level_Requested_Date ||
            m?.Tier_Level_Request_Date ||
            m?.Tier_Level_Requested_Date ||
            m?.Tier_Request_Date
        )
      );
      const received = Boolean(
        toYmd(
          m?.Kaiser_Tier_Level_Received_Date ||
            m?.Kaiser_Tier_Level_Received ||
            m?.Tier_Level_Received_Date ||
            m?.Tier_Received_Date
        )
      );
      return requested && !received;
    });
    const tierAppealsMembers = rows.filter((m: any) => {
      const compactStatus = normalizeStatus(m?.Kaiser_Status).replace(/[^a-z0-9]+/g, ' ').trim();
      return compactStatus === 'tier level appeals' || compactStatus === 'tier level appeal';
    });
    const rbPendingIlsContractMembers = rows.filter((m: any) => {
      const status = normalizeStatus(m?.Kaiser_Status);
      const compactStatus = status.replace(/[^a-z0-9]+/g, ' ').trim();
      const byStatus =
        status === 'r&b sent pending ils contract' ||
        status === 'r & b sent pending ils contract' ||
        compactStatus === 'final member at rcfe';
      const rbRequested = Boolean(toYmd(m?.Kaiser_H2022_Requested));
      const rbReceived = Boolean(toYmd(m?.Kaiser_H2022_Received));
      return (byStatus || rbRequested) && !rbReceived;
    });
    const h2022AuthEligibleMembers = rows.filter((m: any) =>
      isRbPendingOrFinalAtRcfeStatus(m?.Kaiser_Status)
    );
    const h2022AuthDatesWithMembers = h2022AuthEligibleMembers.filter((m: any) => {
      const hasStart = Boolean(toYmd(m?.Authorization_Start_Date_H2022));
      const hasEnd = Boolean(toYmd(m?.Authorization_End_Date_H2022));
      return hasStart && hasEnd;
    });
    const h2022AuthDatesWithoutMembers = h2022AuthEligibleMembers.filter((m: any) => {
      const hasStart = Boolean(toYmd(m?.Authorization_Start_Date_H2022));
      const hasEnd = Boolean(toYmd(m?.Authorization_End_Date_H2022));
      return !hasStart || !hasEnd;
    });
    const finalRcfeMissingH2022Members = h2022AuthEligibleMembers.filter((m: any) => {
      if (!isFinalMemberAtRcfe(m?.Kaiser_Status)) return false;
      const hasStart = Boolean(toYmd(m?.Authorization_Start_Date_H2022));
      const hasEnd = Boolean(toYmd(m?.Authorization_End_Date_H2022));
      return !hasStart || !hasEnd;
    });

    const queues = {
      t2038AuthOnly: queueRows(t2038AuthOnlyMembers, (m) => toYmd(m?.Kaiser_T2038_Requested_Date)),
      t2038Requested: queueRows(t2038RequestedMembers, (m) => toYmd(m?.Kaiser_T2038_Requested || m?.Kaiser_T2038_Requested_Date)),
      t2038ReceivedUnreachable: queueRows(
        t2038ReceivedUnreachableMembers,
        (m) => toYmd(m?.Kaiser_T2038_Received_Date || m?.Kaiser_T2038_Received || m?.Kaiser_T038_Received)
      ),
      tierRequested: queueRows(
        tierRequestedMembers,
        (m) =>
          toYmd(
            m?.Kaiser_Tier_Level_Requested ||
              m?.Kaiser_Tier_Level_Requested_Date ||
              m?.Tier_Level_Request_Date ||
              m?.Tier_Level_Requested_Date ||
              m?.Tier_Request_Date
          )
      ),
      tierAppeals: queueRows(
        tierAppealsMembers,
        (m) =>
          toYmd(
            m?.Kaiser_Tier_Level_Requested ||
              m?.Kaiser_Tier_Level_Requested_Date ||
              m?.Tier_Level_Request_Date ||
              m?.Tier_Level_Requested_Date ||
              m?.Tier_Request_Date
          )
      ),
      rbPendingIlsContract: queueRows(rbPendingIlsContractMembers, (m) => toYmd(m?.Kaiser_H2022_Requested)),
      h2022AuthDatesWith: queueRows(
        h2022AuthDatesWithMembers,
        (m) => toYmd(m?.Authorization_End_Date_H2022 || m?.Authorization_Start_Date_H2022)
      ),
      h2022AuthDatesWithout: queueRows(
        h2022AuthDatesWithoutMembers,
        (m) => toYmd(m?.Authorization_End_Date_H2022 || m?.Authorization_Start_Date_H2022)
      ),
      finalRcfeMissingH2022Dates: queueRows(
        finalRcfeMissingH2022Members,
        (m) => toYmd(m?.Authorization_End_Date_H2022 || m?.Authorization_Start_Date_H2022)
      ),
    };

    const totalUnique = new Set<string>([
      ...queues.t2038AuthOnly.map((r) => r.id).filter(Boolean),
      ...queues.t2038Requested.map((r) => r.id).filter(Boolean),
      ...queues.t2038ReceivedUnreachable.map((r) => r.id).filter(Boolean),
      ...queues.tierRequested.map((r) => r.id).filter(Boolean),
      ...queues.tierAppeals.map((r) => r.id).filter(Boolean),
      ...queues.rbPendingIlsContract.map((r) => r.id).filter(Boolean),
      ...queues.h2022AuthDatesWith.map((r) => r.id).filter(Boolean),
      ...queues.h2022AuthDatesWithout.map((r) => r.id).filter(Boolean),
      ...queues.finalRcfeMissingH2022Dates.map((r) => r.id).filter(Boolean),
    ]).size;

    // Auto-capture weekly snapshot so ILS Log Tracker trends stay current
    // even when nobody clicks "Capture This Week" manually.
    const now = new Date();
    const weekStartYmd = getWeekStartYmd(now);
    const weekLabel = `Week of ${weekStartYmd}`;
    await adminDb.collection('ils_weekly_tracker_snapshots').doc(weekStartYmd).set(
      {
        weekStartYmd,
        weekLabel,
        capturedAtIso: now.toISOString(),
        capturedByUid: 'system_cron',
        capturedByEmail: 'system@cron',
        counts: {
          totalInQueues: totalUnique,
          t2038AuthOnly: queues.t2038AuthOnly.length,
          t2038Requested: queues.t2038Requested.length,
          t2038ReceivedUnreachable: queues.t2038ReceivedUnreachable.length,
          tierRequested: queues.tierRequested.length,
          tierAppeals: queues.tierAppeals.length,
          rbPendingIlsContract: queues.rbPendingIlsContract.length,
          h2022AuthDatesWith: queues.h2022AuthDatesWith.length,
          h2022AuthDatesWithout: queues.h2022AuthDatesWithout.length,
          finalAtRcfeWithDates: h2022AuthDatesWithMembers.filter((m: any) => isFinalMemberAtRcfe(m?.Kaiser_Status)).length,
          finalAtRcfeWithoutDates: finalRcfeMissingH2022Members.length,
          h2022EndingWithin1Month: h2022AuthEligibleMembers.filter((m: any) => {
            const ymd = toYmd(m?.Authorization_End_Date_H2022);
            if (!ymd) return false;
            const endDate = new Date(`${ymd}T00:00:00`);
            if (Number.isNaN(endDate.getTime())) return false;
            const today = new Date();
            const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const cutoff = new Date(start);
            cutoff.setDate(cutoff.getDate() + 30);
            return endDate >= start && endDate <= cutoff;
          }).length,
        },
      },
      { merge: true }
    );

    if (!weeklyEmailEnabled || recipients.length === 0) {
      return NextResponse.json({
        success: true,
        skippedEmail: true,
        reason: 'Weekly ILS email disabled or no recipients',
        autoCapturedSnapshot: true,
        weekStartYmd,
        totalMembers: totalUnique,
      });
    }

    const tableRowsFor = (rowsForQueue: QueueRow[]) =>
      rowsForQueue
        .slice(0, 80)
        .map(
          (r) =>
            `<tr><td style="padding:6px 8px;border:1px solid #e5e7eb;">${r.name}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${r.mrn}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${r.status}</td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${r.requestedDate || 'N/A'}</td></tr>`
        )
        .join('');

    const dateLabel = new Date().toLocaleDateString();
    await resend!.emails.send({
      from: 'Connections CalAIM <noreply@carehomefinders.com>',
      to: recipients,
      subject: `ILS Pending Weekly Report (${dateLabel})`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#111827;">
          <h2 style="margin:0 0 8px;">ILS Pending Weekly Report</h2>
          <p style="margin:0 0 12px;">Total unique members in request queues: <strong>${totalUnique}</strong></p>
          <div style="margin:0 0 16px;font-size:12px;color:#374151;">
            <div>ILS Pending (T2038_Auth_Email_Kaiser): <strong>${queues.t2038AuthOnly.length}</strong></div>
            <div>T2038 Requested: <strong>${queues.t2038Requested.length}</strong></div>
            <div>T2038 Received, Unreachable: <strong>${queues.t2038ReceivedUnreachable.length}</strong></div>
            <div>Tier Level Requested: <strong>${queues.tierRequested.length}</strong></div>
            <div>Tier Level Appeals: <strong>${queues.tierAppeals.length}</strong></div>
            <div>R &amp; B Pending ILS Contract: <strong>${queues.rbPendingIlsContract.length}</strong></div>
            <div>H2022 Auth Dates (With): <strong>${queues.h2022AuthDatesWith.length}</strong></div>
            <div>H2022 Auth Dates (Without): <strong>${queues.h2022AuthDatesWithout.length}</strong></div>
            <div>Final at RCFE Missing H2022 Dates: <strong>${queues.finalRcfeMissingH2022Dates.length}</strong></div>
          </div>

          ${[
            ['ILS Pending (T2038_Auth_Email_Kaiser)', queues.t2038AuthOnly],
            ['T2038 Requested', queues.t2038Requested],
            ['T2038 Received, Unreachable', queues.t2038ReceivedUnreachable],
            ['Tier Level Requested', queues.tierRequested],
            ['Tier Level Appeals', queues.tierAppeals],
            ['R &amp; B Pending ILS Contract', queues.rbPendingIlsContract],
            ['H2022 Auth Dates (With)', queues.h2022AuthDatesWith],
            ['H2022 Auth Dates (Without) — Waiting for ILS Progress', queues.h2022AuthDatesWithout],
            ['Final at RCFE Missing H2022 Dates', queues.finalRcfeMissingH2022Dates],
          ]
            .map(
              ([title, queue]) => `
                <h3 style="margin:18px 0 6px;">${title} (${(queue as QueueRow[]).length})</h3>
                <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Showing first ${Math.min((queue as QueueRow[]).length, 80)} members in this queue.</p>
                <table style="border-collapse:collapse; width:100%; font-size:12px;">
                  <thead>
                    <tr>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Member</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">MRN</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Kaiser Status</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;background:#f9fafb;">Request Date</th>
                    </tr>
                  </thead>
                  <tbody>${tableRowsFor(queue as QueueRow[])}</tbody>
                </table>
              `
            )
            .join('')}
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      sentTo: recipients.length,
      totalMembers: totalUnique,
      autoCapturedSnapshot: true,
      weekStartYmd,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to send ILS weekly list' }, { status: 500 });
  }
}

