import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { resolveAppBaseUrl } from '@/lib/app-urls';
import { classifyProofIncomeDocumentDate } from '@/lib/proof-income-age';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

const toMs = (value: unknown) => {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Daily Kaiser reminder to the primary contact when proof of income is
 * within two months of one year old, or already older than one year.
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
    const { adminDb } = await import('@/firebase-admin');
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

    const appsSnap = await adminDb.collectionGroup('applications').get();
    const byId = new Map<string, Array<{ id: string; data: () => any; ref: { set: (data: any, options: { merge: boolean }) => Promise<unknown> } }>>();
    appsSnap.docs.forEach((docSnap) => {
      const list = byId.get(docSnap.id) || [];
      list.push(docSnap);
      byId.set(docSnap.id, list);
    });

    const now = new Date();
    const cooldownMs = 14 * 24 * 60 * 60 * 1000;
    const baseUrl = resolveAppBaseUrl();
    let emailed = 0;
    let skipped = 0;

    for (const [applicationId, docs] of byId) {
      const records = docs.map((docSnap) => docSnap.data() || {});
      const isKaiser = records.some((record) => clean(record.healthPlan).toLowerCase().includes('kaiser'));
      if (!isKaiser) continue;
      if (records.some((record) => record.proofIncomeAutoRemindersEnabled === false)) {
        skipped += 1;
        continue;
      }

      const newestDate = records
        .map((record) => clean(record.proofIncomeDocumentDate))
        .find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) || '';
      const status = newestDate ? classifyProofIncomeDocumentDate(newestDate, now) : 'missing';
      if (status !== 'due-soon' && status !== 'expired') {
        skipped += 1;
        continue;
      }

      const source =
        records.find((record) => clean(record.bestContactEmail)) ||
        records.find((record) => clean(record.referrerEmail)) ||
        records[0];
      const to = clean(source?.bestContactEmail || source?.referrerEmail);
      if (!to) {
        skipped += 1;
        continue;
      }
      const contactName =
        [clean(source?.bestContactFirstName), clean(source?.bestContactLastName)].filter(Boolean).join(' ') ||
        [clean(source?.referrerFirstName), clean(source?.referrerLastName)].filter(Boolean).join(' ') ||
        'there';
      const memberName =
        [clean(source?.memberFirstName), clean(source?.memberLastName)].filter(Boolean).join(' ') || 'this member';
      const recentlySent = records.some((record) => {
        const lastMs = toMs(record.proofIncomeReminderLastSentAt);
        return (
          clean(record.proofIncomeReminderLastDocumentDate) === newestDate &&
          lastMs > 0 &&
          now.getTime() - lastMs < cooldownMs
        );
      });
      if (recentlySent) {
        skipped += 1;
        continue;
      }

      const ageSentence =
        status === 'expired'
          ? `The proof of income date on file is ${newestDate}, which is more than one year old.`
          : `The proof of income date on file is ${newestDate}, which will be one year old within two months.`;
      const pathwayUrl = `${baseUrl}/pathway?applicationId=${encodeURIComponent(applicationId)}`;
      await resend.emails.send({
        from: 'CalAIM Pathfinder <noreply@carehomefinders.com>',
        to,
        subject: `New proof of income needed for ${memberName}`,
        text: [
          `Hello ${contactName},`,
          '',
          `This is needed for the authorization that is renewed every six months.`,
          `Kaiser requires proof of income that is not more than one year old.`,
          ageSentence,
          `Please upload a newer award letter or bank statement for ${memberName} in the application pathway.`,
          '',
          pathwayUrl,
          '',
          'Connections Care Home Consultants',
        ].join('\n'),
      });

      const sentAt = now.toISOString();
      await Promise.all(
        docs.map((docSnap) =>
          docSnap.ref.set(
            {
              proofIncomeReminderLastSentAt: sentAt,
              proofIncomeReminderLastDocumentDate: newestDate,
              proofIncomeReminderLastStatus: status,
              proofIncomeReminderRecipientEmail: to,
              proofIncomeReminderRecipientName: contactName,
            },
            { merge: true }
          )
        )
      );
      emailed += 1;
    }

    return NextResponse.json({ success: true, emailed, skipped });
  } catch (error: any) {
    console.error('proof-income-age-reminders failed', error);
    return NextResponse.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
}
