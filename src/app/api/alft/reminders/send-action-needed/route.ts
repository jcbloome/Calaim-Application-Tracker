import { NextRequest, NextResponse } from 'next/server';
import { sendIspDailyActionReminderEmail } from '@/app/actions/send-email';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import {
  buildIspForcedActionReminder,
  resolveIspDailyActionNeeded,
  type IspActionRole,
} from '@/lib/isp-action-needed';
import { buildIspWorkflowActivityEntry } from '@/lib/isp-workflow-activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  memberId?: string;
  /** auto = whoever currently needs action; msw/rn force that recipient. */
  targetRole?: 'auto' | 'msw' | 'rn';
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const memberId = clean(body?.memberId, 200);
    const targetRoleRaw = clean(body?.targetRole, 20).toLowerCase();
    const targetRole =
      targetRoleRaw === 'msw' || targetRoleRaw === 'rn' || targetRoleRaw === 'auto'
        ? targetRoleRaw
        : 'auto';

    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!memberId) return NextResponse.json({ success: false, error: 'Missing memberId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const name = clean((decoded as any)?.name, 160) || email || 'Admin';
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole, userDoc] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
        adminDb.collection('users').doc(uid).get().catch(() => null),
      ]);
      const userData = userDoc?.exists ? (userDoc.data() as any) : null;
      isAdmin =
        adminRole.exists ||
        superAdminRole.exists ||
        Boolean(userData?.isKaiserAssignmentManager) ||
        Boolean(userData?.isKaiserStaff);
    }
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
    const assignmentSnap = await assignmentRef.get();
    if (!assignmentSnap.exists) {
      return NextResponse.json({ success: false, error: 'ISP assignment not found for this member' }, { status: 404 });
    }
    const assignment = assignmentSnap.data() || {};

    const memberName =
      clean(assignment.memberName, 160) ||
      `${clean(assignment.memberFirstName, 80)} ${clean(assignment.memberLastName, 80)}`.trim() ||
      'Member';
    const mrn = clean(assignment.memberMrn || assignment.medicalRecordNumber, 80);

    let intake: Record<string, unknown> | null = null;
    let intakeId = clean(assignment.latestIntakeId || assignment.lastIntakeId, 220);
    if (intakeId) {
      const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
      if (intakeSnap.exists) intake = { id: intakeSnap.id, ...(intakeSnap.data() || {}) };
    }
    if (!intake) {
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
        // best-effort
      }
    }

    const needed =
      targetRole === 'auto'
        ? resolveIspDailyActionNeeded({ assignment, intake, intakeId })
        : buildIspForcedActionReminder({
            role: targetRole,
            assignment,
            intake,
            intakeId,
          });

    if (!needed || needed.role === 'none') {
      return NextResponse.json(
        {
          success: false,
          error:
            targetRole === 'auto'
              ? 'No outstanding action needed for this member right now.'
              : targetRole === 'msw'
                ? 'No social worker email on file for this member.'
                : 'No RN email on file for this member.',
        },
        { status: 409 }
      );
    }
    if (needed.role === 'admin' && targetRole === 'auto') {
      // Manual SW/RN control is the product ask; still allow auto→admin if that is next.
    }
    if (!needed.recipientEmail || !needed.recipientEmail.includes('@')) {
      return NextResponse.json(
        { success: false, error: `Missing email for ${needed.role === 'msw' ? 'social worker' : needed.role}` },
        { status: 409 }
      );
    }

    await sendIspDailyActionReminderEmail({
      to: needed.recipientEmail,
      recipientName: needed.recipientName,
      recipientRole: needed.role as Exclude<IspActionRole, 'none'>,
      memberName,
      mrn: mrn || undefined,
      stageLabel: needed.stageLabel,
      nextAction: needed.nextAction,
      actionUrl: needed.actionUrl,
      isManual: true,
    });

    const nowMs = Date.now();
    await assignmentRef.set(
      {
        reminders: {
          dailyActionLastSentAtMs: nowMs,
          dailyActionLastRole: needed.role,
          dailyActionLastStage: needed.stageLabel,
          lastManualActionReminderAtMs: nowMs,
          lastManualActionReminderRole: needed.role,
          lastManualActionReminderByEmail: email || null,
          lastManualActionReminderByName: name || null,
        },
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(
          buildIspWorkflowActivityEntry({
            event: 'action_needed_reminder_sent',
            byName: name || null,
            byEmail: email || null,
            recipientEmail: needed.recipientEmail,
            details: `Manual ${needed.role} reminder: ${needed.stageLabel}`,
            isResend: true,
          })
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      role: needed.role,
      recipientEmail: needed.recipientEmail,
      recipientName: needed.recipientName,
      stageLabel: needed.stageLabel,
      memberName,
    });
  } catch (e: any) {
    console.error('[alft/reminders/send-action-needed]', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to send action-needed reminder' },
      { status: 500 }
    );
  }
}
