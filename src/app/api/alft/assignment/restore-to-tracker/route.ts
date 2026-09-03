import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Undelete / restore an ISP assignment previously removed from the ISP Tracker.
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
    const snapshot =
      data.ispTrackerRestoreSnapshot && typeof data.ispTrackerRestoreSnapshot === 'object'
        ? (data.ispTrackerRestoreSnapshot as Record<string, unknown>)
        : null;

    const restoredStatus = clean(snapshot?.status, 120) || 'sw_invited_pending_submission';
    const restoredWorkflowStatus =
      clean(snapshot?.workflowStatus, 160) || 'sw_invited_pending_submission';
    const restoredWorkflowStage = clean(snapshot?.workflowStage, 160) || 'sw_invited';
    const restoredSteps =
      snapshot?.workflowSteps && typeof snapshot.workflowSteps === 'object'
        ? snapshot.workflowSteps
        : {
            swInviteSent: true,
            swSubmittedSigned: false,
          };

    await assignmentRef.set(
      {
        status: restoredStatus,
        workflowStatus: restoredWorkflowStatus,
        workflowStage: restoredWorkflowStage,
        workflowSteps: restoredSteps,
        removedFromIspTrackerAt: admin.firestore.FieldValue.delete(),
        removedFromIspTrackerByUid: admin.firestore.FieldValue.delete(),
        removedFromIspTrackerByEmail: admin.firestore.FieldValue.delete(),
        restoredToIspTrackerAt: admin.firestore.FieldValue.serverTimestamp(),
        restoredToIspTrackerByUid: authCheck.uid,
        restoredToIspTrackerByEmail: authCheck.email || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      memberId,
      memberName,
      message: `${memberName} restored to ISP Tracker.`,
    });
  } catch (e: any) {
    console.error('[alft/assignment/restore-to-tracker] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to restore member to ISP Tracker' },
      { status: 500 }
    );
  }
}
