import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Remove an invite-only ISP member from the ISP Tracker list.
 * Soft-clears invite workflow status on alft_assignments (keeps routing / clinical files).
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as { memberId?: string };
    const memberId = clean(body?.memberId, 160);
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

    const restoreSnapshot = {
      status: clean(data.status, 120) || null,
      workflowStatus: clean(data.workflowStatus, 160) || null,
      workflowStage: clean(data.workflowStage, 160) || null,
      workflowSteps:
        data.workflowSteps && typeof data.workflowSteps === 'object' ? data.workflowSteps : null,
      removedAtIso: new Date().toISOString(),
    };

    const removedAtIso = new Date().toISOString();
    const priorInvites =
      data.workflowInvites && typeof data.workflowInvites === 'object' ? data.workflowInvites : {};

    await assignmentRef.set(
      {
        status: 'removed_from_isp_tracker',
        workflowStatus: 'removed_from_isp_tracker',
        workflowStage: 'removed_from_isp_tracker',
        ispTrackerSoftDeleted: true,
        removedFromIspTrackerAt: admin.firestore.FieldValue.serverTimestamp(),
        removedFromIspTrackerAtIso: removedAtIso,
        removedFromIspTrackerByUid: authCheck.uid,
        removedFromIspTrackerByEmail: authCheck.email || null,
        ispTrackerRestoreSnapshot: restoreSnapshot,
        workflowInvites: {
          ...priorInvites,
          active: false,
          cancelledAt: removedAtIso,
          cancelledByUid: authCheck.uid,
          cancelledByEmail: authCheck.email || null,
        },
        swInviteCancelledAtIso: removedAtIso,
        workflowSteps: {
          ...(data.workflowSteps && typeof data.workflowSteps === 'object' ? data.workflowSteps : {}),
          swInviteSent: false,
          swSubmittedSigned: false,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
          event: 'removed_from_tracker',
          atIso: removedAtIso,
          byName: authCheck.email || 'Admin',
          byEmail: authCheck.email || null,
          details: 'Removed from ISP Tracker (soft delete)',
        }),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      memberId,
      memberName,
      message: `${memberName} removed from ISP Tracker.`,
    });
  } catch (e: any) {
    console.error('[alft/assignment/remove-from-tracker] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to remove member from ISP Tracker' },
      { status: 500 }
    );
  }
}
