import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Cancel an outstanding ISP / ALFT social worker invite.
 * Removes the request from the SW portal queue while keeping routing, clinical files,
 * and invite history for audit. Does not cancel after SW has submitted/signed.
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as { memberId?: string; reason?: string };
    const memberId = clean(body?.memberId, 160);
    const reason = clean(body?.reason, 500);
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'memberId is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = authCheck.adminDb;

    const assignmentRef = adminDb.collection('alft_assignments').doc(memberId);
    const snap = await assignmentRef.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'ISP assignment not found' }, { status: 404 });
    }

    const data = snap.data() || {};
    const memberName =
      clean(data.memberName, 160) ||
      `${clean(data.memberFirstName, 80)} ${clean(data.memberLastName, 80)}`.trim() ||
      'Member';

    const status = clean(data.status, 160).toLowerCase();
    const workflowStatus = clean(data.workflowStatus || data.workflowStage, 160).toLowerCase();
    if (status.includes('sw_invite_cancelled') || workflowStatus.includes('sw_invite_cancelled')) {
      return NextResponse.json({
        success: true,
        memberId,
        memberName,
        alreadyCancelled: true,
        message: `${memberName} ISP request was already cancelled.`,
      });
    }

    const hasSubmission = Boolean(
      data.submittedAt ||
        data?.workflowStepsAt?.swSubmittedAt ||
        data?.workflowStepsAt?.swSubmittedSignedAt ||
        data?.workflowSteps?.swSubmittedSigned ||
        data.latestIntakeId
    );
    if (hasSubmission) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This ISP request already has an SW submission. Use ISP Tracker to return for edits or delete & start over instead of cancelling the invite.',
        },
        { status: 409 }
      );
    }

    const cancelledAtIso = new Date().toISOString();
    const priorInvites =
      data.workflowInvites && typeof data.workflowInvites === 'object' ? data.workflowInvites : {};

    await assignmentRef.set(
      {
        status: 'sw_invite_cancelled',
        workflowStatus: 'sw_invite_cancelled',
        workflowStage: 'sw_invite_cancelled',
        swInviteCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        swInviteCancelledAtIso: cancelledAtIso,
        swInviteCancelledByUid: authCheck.uid,
        swInviteCancelledByEmail: authCheck.email || null,
        swInviteCancelReason: reason || null,
        workflowInvites: {
          ...priorInvites,
          cancelledAt: cancelledAtIso,
          cancelledByUid: authCheck.uid,
          cancelledByEmail: authCheck.email || null,
          cancelReason: reason || null,
          active: false,
        },
        workflowSteps: {
          ...(data.workflowSteps && typeof data.workflowSteps === 'object' ? data.workflowSteps : {}),
          swInviteSent: false,
          swSubmittedSigned: false,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
          event: 'sw_invite_cancelled',
          atIso: cancelledAtIso,
          byName: authCheck.email || 'Admin',
          byEmail: authCheck.email || null,
          recipientEmail: clean(data.assignedSwEmail, 200) || null,
          details: reason
            ? `ISP request cancelled for social worker. Reason: ${reason}`
            : 'ISP request cancelled for social worker. Removed from SW portal queue.',
        }),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      memberId,
      memberName,
      message: `${memberName} ISP request cancelled. Social worker will no longer see it in their portal.`,
    });
  } catch (e: any) {
    console.error('[alft/assignment/cancel-sw-invite] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to cancel SW ISP request' },
      { status: 500 }
    );
  }
}
