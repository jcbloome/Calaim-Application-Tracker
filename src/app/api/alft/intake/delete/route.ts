import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Delete an ISP / ALFT intake so the member can start the workflow over.
 * - Deletes standalone_upload_submissions/{intakeId}
 * - Cancels related alft_signature_requests
 * - Resets alft_assignments workflow fields (keeps SW / staff routing)
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
    const toolCode = clean(intake.toolCode, 40).toUpperCase();
    const docType = clean(intake.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) {
      return NextResponse.json({ success: false, error: 'This intake is not an ISP / ALFT record' }, { status: 400 });
    }

    const memberId = clean(intake.memberId, 160);
    const memberName = clean(intake.memberName, 160) || 'Member';
    const requestId = clean(intake?.alftSignature?.requestId, 220);

    // Cancel active signature request(s) for this intake.
    let signatureRequestsCancelled = 0;
    if (requestId) {
      await adminDb
        .collection('alft_signature_requests')
        .doc(requestId)
        .set(
          {
            status: 'cancelled_start_over',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelledByUid: authCheck.uid,
            cancelledByEmail: authCheck.email || null,
            'signers.rn.tokenHash': null,
            'signers.msw.tokenHash': null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
      signatureRequestsCancelled += 1;
    }

    try {
      const relatedSigSnap = await adminDb
        .collection('alft_signature_requests')
        .where('intakeId', '==', intakeId)
        .limit(20)
        .get();
      await Promise.all(
        relatedSigSnap.docs.map((d: any) =>
          d.ref.set(
            {
              status: 'cancelled_start_over',
              cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
              cancelledByUid: authCheck.uid,
              cancelledByEmail: authCheck.email || null,
              'signers.rn.tokenHash': null,
              'signers.msw.tokenHash': null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
      signatureRequestsCancelled = Math.max(signatureRequestsCancelled, relatedSigSnap.size);
    } catch {
      // index may be missing; primary requestId cancel above is enough
    }

    // Reset assignment so SW can submit again (keep SW/staff/RN routing).
    let assignmentReset = false;
    if (memberId) {
      await adminDb
        .collection('alft_assignments')
        .doc(memberId)
        .set(
          {
            status: 'ready_for_resubmit',
            workflowStatus: null,
            workflowStage: null,
            workflowRouting: {
              nextStepKey: 'sw_submit',
              nextStepLabel: 'Social worker submit ISP / ALFT',
            },
            workflowSteps: {
              swInviteSent: true,
              swSubmittedSigned: false,
              managerReview: 'pending',
              rnReviewSignature: 'pending',
              pdfReady: false,
            },
            lastIntakeId: null,
            startOverAt: admin.firestore.FieldValue.serverTimestamp(),
            startOverByUid: authCheck.uid,
            startOverByEmail: authCheck.email || null,
            startOverFromIntakeId: intakeId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        .catch(() => null);
      assignmentReset = true;
    }

    await intakeRef.delete();

    return NextResponse.json({
      success: true,
      intakeId,
      memberId: memberId || null,
      memberName,
      signatureRequestsCancelled,
      assignmentReset,
      message: `${memberName} ISP record deleted. Member can start over.`,
    });
  } catch (e: any) {
    console.error('[alft/intake/delete] error', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Failed to delete ISP intake' },
      { status: 500 }
    );
  }
}
