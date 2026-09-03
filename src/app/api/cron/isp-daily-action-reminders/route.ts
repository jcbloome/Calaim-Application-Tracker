import { NextRequest, NextResponse } from 'next/server';
import { sendIspDailyActionReminderEmail } from '@/app/actions/send-email';
import { resolveIspDailyActionNeeded } from '@/lib/isp-action-needed';

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

/**
 * Daily ISP action reminders (default ON).
 * Skips only when dailyActionReminderEnabled === false.
 * Emails SW, Admin (first reviewer), or RN based on whose next action is required.
 * Intended schedule: 9:00 AM Pacific / 12:00 PM Eastern.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const nowMs = Date.now();
    const cooldownMs = 23 * 60 * 60 * 1000; // ~daily, slight buffer for schedule drift

    // Default ON: include missing/undefined; exclude explicit false.
    const all = await adminDb.collection('alft_assignments').limit(800).get();
    const assignmentSnap = {
      docs: all.docs.filter((d: any) => d.data()?.dailyActionReminderEnabled !== false),
      size: 0,
    } as any;
    assignmentSnap.size = assignmentSnap.docs.length;

    let considered = 0;
    let sent = 0;
    let skippedNoAction = 0;
    let skippedCooldown = 0;
    let skippedNoEmail = 0;
    const errors: string[] = [];

    for (const docSnap of assignmentSnap.docs) {
      considered += 1;
      const assignment = docSnap.data() || {};
      const memberId = clean(assignment.memberId || docSnap.id, 160);
      const memberName =
        clean(assignment.memberName, 160) ||
        `${clean(assignment.memberFirstName, 80)} ${clean(assignment.memberLastName, 80)}`.trim() ||
        'Member';
      const mrn = clean(assignment.memberMrn || assignment.medicalRecordNumber, 80);

      const lastSentMs = Number(assignment?.reminders?.dailyActionLastSentAtMs || 0);
      if (lastSentMs > 0 && nowMs - lastSentMs < cooldownMs) {
        skippedCooldown += 1;
        continue;
      }

      let intake: Record<string, unknown> | null = null;
      let intakeId = clean(assignment.latestIntakeId || assignment.lastIntakeId, 220);
      if (intakeId) {
        const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
        if (intakeSnap.exists) {
          intake = { id: intakeSnap.id, ...(intakeSnap.data() || {}) };
        }
      }
      if (!intake && memberId) {
        try {
          const byMember = await adminDb
            .collection('standalone_upload_submissions')
            .where('memberId', '==', memberId)
            .orderBy('updatedAt', 'desc')
            .limit(1)
            .get();
          if (!byMember.empty) {
            const d = byMember.docs[0];
            intake = { id: d.id, ...(d.data() || {}) };
            intakeId = d.id;
          }
        } catch {
          // index may be missing
        }
      }

      if (intake && (Boolean((intake as any).ispTrackerSoftDeleted) || Boolean((intake as any).removedFromIspTrackerAt))) {
        skippedNoAction += 1;
        continue;
      }

      const needed = resolveIspDailyActionNeeded({
        assignment,
        intake,
        intakeId,
      });
      if (!needed || needed.role === 'none') {
        skippedNoAction += 1;
        continue;
      }
      if (!needed.recipientEmail || !needed.recipientEmail.includes('@')) {
        skippedNoEmail += 1;
        continue;
      }

      try {
        await sendIspDailyActionReminderEmail({
          to: needed.recipientEmail,
          recipientName: needed.recipientName,
          recipientRole: needed.role,
          memberName,
          mrn: mrn || undefined,
          stageLabel: needed.stageLabel,
          nextAction: needed.nextAction,
          actionUrl: needed.actionUrl,
        });
        sent += 1;
        await docSnap.ref.set(
          {
            reminders: {
              dailyActionLastSentAtMs: nowMs,
              dailyActionLastRole: needed.role,
              dailyActionLastStage: needed.stageLabel,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e: any) {
        errors.push(`${memberId}: ${e?.message || e}`);
      }
    }

    return NextResponse.json({
      success: true,
      considered,
      sent,
      skippedNoAction,
      skippedCooldown,
      skippedNoEmail,
      errors: errors.slice(0, 20),
    });
  } catch (e: any) {
    console.error('[cron/isp-daily-action-reminders] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to send ISP daily action reminders' },
      { status: 500 }
    );
  }
}
