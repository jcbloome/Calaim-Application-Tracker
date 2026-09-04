import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

/**
 * Undo a recent "return for edits" / reject action using the snapshot
 * stored on the intake when the return was performed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 12000);
    const intakeId = clean(body?.intakeId, 220);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminAuth = adminModule.adminAuth;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    const name = clean((decoded as any)?.name, 160) || email || 'Staff';
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    let isAdmin = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin);
    if (!isAdmin && isHardcodedAdminEmail(email)) isAdmin = true;
    if (!isAdmin) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      isAdmin = adminRole.exists || superAdminRole.exists;
    }

    const [meSnap, intakeSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get().catch(() => null),
      adminDb.collection('standalone_upload_submissions').doc(intakeId).get(),
    ]);
    if (!intakeSnap.exists) {
      return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    }

    const intake = intakeSnap.data() || {};
    const me = meSnap?.exists ? (meSnap.data() as any) : null;
    const isKaiserAssignmentManager = Boolean(me?.isKaiserAssignmentManager);
    const isKaiserStaff = Boolean(me?.isKaiserStaff);
    const rnUid = clean((intake as any)?.alftRnUid, 128);
    const rnEmail = clean((intake as any)?.alftRnEmail, 220).toLowerCase();
    const isAssignedRn = (uid && uid === rnUid) || (email && email === rnEmail);
    const canUndo = isAdmin || isKaiserAssignmentManager || isKaiserStaff || isAssignedRn;
    if (!canUndo) {
      return NextResponse.json(
        { success: false, error: 'Admin/Kaiser staff or assigned RN access is required to undo a return.' },
        { status: 403 }
      );
    }

    const undo = (intake as any)?.alftReturnUndo;
    if (!undo || undo.available !== true || !undo.previous || typeof undo.previous !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: 'No undo is available for this packet (already undone, or return was not recorded with a snapshot).',
        },
        { status: 400 }
      );
    }

    const prev = undo.previous as Record<string, unknown>;
    const memberId = clean(
      (intake as any)?.memberClientId || (intake as any)?.clientId2 || (intake as any)?.Client_ID2 || (intake as any)?.memberId,
      220
    );

    const activityEntry = {
      event: 'undo_return_for_edits',
      atIso: new Date().toISOString(),
      byName: name || null,
      byEmail: email || null,
      details: `Restored from return target: ${clean(undo.target, 40) || 'unknown'}`,
    };

    const intakePatch: Record<string, unknown> = {
      status: prev.status ?? 'pending',
      workflowStatus: prev.workflowStatus ?? 'awaiting_manager_review_pre_rn',
      workflowStage: prev.workflowStage ?? 'submitted_by_sw_waiting_manager_review',
      needsSwRevision: Boolean(prev.needsSwRevision),
      needsStaffRevision: Boolean(prev.needsStaffRevision),
      needsRnRevision: Boolean(prev.needsRnRevision),
      alftManagerReview: prev.alftManagerReview ?? { status: 'pending', required: true },
      alftSignature: prev.alftSignature ?? {},
      alftReturnUndo: {
        available: false,
        undoneAt: admin.firestore.FieldValue.serverTimestamp(),
        undoneByUid: uid,
        undoneByName: name || null,
        undoneByEmail: email || null,
        previousTarget: clean(undo.target, 40) || null,
      },
      ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
      workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Clear return markers that may have been set.
    if (prev.needsSwRevision === false || prev.needsSwRevision == null) {
      intakePatch.needsSwRevision = false;
    }
    if (prev.needsStaffRevision === false || prev.needsStaffRevision == null) {
      intakePatch.needsStaffRevision = false;
    }
    if (prev.needsRnRevision === false || prev.needsRnRevision == null) {
      intakePatch.needsRnRevision = false;
    }

    await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(intakePatch, { merge: true });

    if (memberId && undo.previousAssignment && typeof undo.previousAssignment === 'object') {
      const aPrev = undo.previousAssignment as Record<string, unknown>;
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            status: aPrev.status ?? 'submitted',
            workflowStatus: aPrev.workflowStatus ?? 'awaiting_manager_review_pre_rn',
            workflowStage: aPrev.workflowStage ?? 'submitted_by_sw_waiting_manager_review',
            needsSwRevision: Boolean(aPrev.needsSwRevision),
            needsStaffRevision: Boolean(aPrev.needsStaffRevision),
            needsRnRevision: Boolean(aPrev.needsRnRevision),
            workflowSteps: aPrev.workflowSteps ?? {
              swInviteSent: true,
              swSubmittedSigned: true,
              managerReview: 'pending',
              rnReviewSignature: 'pending',
              pdfReady: false,
            },
            submittedAt: aPrev.submittedAt ?? admin.firestore.FieldValue.serverTimestamp(),
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    } else if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            status: 'submitted',
            workflowStatus: String(prev.workflowStatus || 'awaiting_manager_review_pre_rn'),
            workflowStage: String(prev.workflowStage || 'submitted_by_sw_waiting_manager_review'),
            needsSwRevision: false,
            needsStaffRevision: false,
            needsRnRevision: false,
            workflowSteps: {
              swInviteSent: true,
              swSubmittedSigned: true,
              managerReview: 'pending',
              rnReviewSignature: 'pending',
              pdfReady: false,
            },
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion(activityEntry),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
    }

    return NextResponse.json({
      success: true,
      intakeId,
      restoredWorkflowStatus: intakePatch.workflowStatus,
    });
  } catch (e: any) {
    console.error('[alft/workflow/undo-return] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to undo return for edits' },
      { status: 500 }
    );
  }
}
