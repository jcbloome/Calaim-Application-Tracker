import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Undelete a soft-deleted ISP / ALFT intake and restore assignment snapshot when available.
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as { intakeId?: string };
    const intakeId = clean(body?.intakeId, 220);
    if (!intakeId) {
      return NextResponse.json({ success: false, error: 'intakeId is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = authCheck.adminDb;

    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) {
      return NextResponse.json({ success: false, error: 'ISP intake not found' }, { status: 404 });
    }

    const intake = intakeSnap.data() || {};
    const memberId = clean(intake.memberId, 160);
    const memberName = clean(intake.memberName, 160) || 'Member';
    const deleted =
      Boolean(intake.removedFromIspTrackerAt) ||
      Boolean(intake.ispTrackerSoftDeleted) ||
      String(intake.workflowStatus || '')
        .toLowerCase()
        .includes('removed_from_isp_tracker');
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'This ISP record is not deleted' }, { status: 400 });
    }

    const snapshot =
      intake.ispTrackerRestoreSnapshot && typeof intake.ispTrackerRestoreSnapshot === 'object'
        ? (intake.ispTrackerRestoreSnapshot as Record<string, unknown>)
        : null;
    const assignmentSnapshot =
      snapshot?.assignment && typeof snapshot.assignment === 'object'
        ? (snapshot.assignment as Record<string, unknown>)
        : null;

    await intakeRef.set(
      {
        ispTrackerSoftDeleted: false,
        removedFromIspTrackerAt: admin.firestore.FieldValue.delete(),
        removedFromIspTrackerByUid: admin.firestore.FieldValue.delete(),
        removedFromIspTrackerByEmail: admin.firestore.FieldValue.delete(),
        workflowStatus:
          clean(snapshot?.workflowStatus, 160) || clean(intake.workflowStatusBeforeDelete, 160) || clean(intake.workflowStatus, 160),
        workflowStage:
          clean(snapshot?.workflowStage, 160) || clean(intake.workflowStageBeforeDelete, 160) || clean(intake.workflowStage, 160),
        status: clean(snapshot?.status, 120) || clean(intake.statusBeforeDelete, 120) || clean(intake.status, 120),
        restoredToIspTrackerAt: admin.firestore.FieldValue.serverTimestamp(),
        restoredToIspTrackerByUid: authCheck.uid,
        restoredToIspTrackerByEmail: authCheck.email || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
          event: 'restored_to_tracker',
          atIso: new Date().toISOString(),
          byName: authCheck.name || authCheck.email || 'Admin',
          byEmail: authCheck.email || null,
          details: 'Undeleted ISP record and restored to tracker',
        }),
      },
      { merge: true }
    );

    if (memberId && assignmentSnapshot) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            status: clean(assignmentSnapshot.status, 120) || 'submitted',
            workflowStatus: clean(assignmentSnapshot.workflowStatus, 160) || null,
            workflowStage: clean(assignmentSnapshot.workflowStage, 160) || null,
            workflowSteps:
              assignmentSnapshot.workflowSteps && typeof assignmentSnapshot.workflowSteps === 'object'
                ? assignmentSnapshot.workflowSteps
                : {
                    swInviteSent: true,
                    swSubmittedSigned: true,
                  },
            latestIntakeId: intakeId,
            lastIntakeId: intakeId,
            removedFromIspTrackerAt: admin.firestore.FieldValue.delete(),
            restoredToIspTrackerAt: admin.firestore.FieldValue.serverTimestamp(),
            restoredToIspTrackerByUid: authCheck.uid,
            restoredToIspTrackerByEmail: authCheck.email || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
              event: 'restored_to_tracker',
              atIso: new Date().toISOString(),
              byName: authCheck.name || authCheck.email || 'Admin',
              byEmail: authCheck.email || null,
              intakeId,
              details: 'Undeleted ISP record and restored to tracker',
            }),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    return NextResponse.json({
      success: true,
      intakeId,
      memberId: memberId || null,
      memberName,
      message: `${memberName} ISP record restored to tracker.`,
    });
  } catch (e: any) {
    console.error('[alft/intake/restore] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to restore ISP intake' },
      { status: 500 }
    );
  }
}
