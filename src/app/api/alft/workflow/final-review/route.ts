import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendAlftManagerWorkflowStageEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
};

const clean = (v: unknown, max = 400) => String(v ?? '').trim().slice(0, max);
const JOHN_FINAL_REVIEW_EMAIL = 'john@carehomefinders.com';
const DEYDRY_SEND_EMAIL = 'deydry@carehomefinders.com';
const DEYDRY_SEND_NAME = 'Deydry';

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
    const name = clean((decoded as any)?.name, 160) || email || 'Manager';
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

    const isJohnFinalReviewer = email === JOHN_FINAL_REVIEW_EMAIL;
    const canReview = isAdmin || isJohnFinalReviewer;
    if (!canReview) {
      return NextResponse.json(
        { success: false, error: 'John (or admin) is required for this final ALFT review step.' },
        { status: 403 }
      );
    }

    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = intakeSnap.data() || {};
    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });

    const hasSignedPacket = Boolean(
      clean((intake as any)?.alftSignature?.packetPdfStoragePath, 1000) ||
        clean((intake as any)?.alftSignature?.signaturePagePdfStoragePath, 1000)
    );
    if (!hasSignedPacket) {
      return NextResponse.json(
        { success: false, error: 'Complete SW + RN signatures before final manager review.' },
        { status: 409 }
      );
    }

    await intakeRef.set(
      {
        alftManagerReview: {
          status: 'approved',
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedByUid: uid,
          reviewedByEmail: email || null,
          reviewedByName: name || null,
        },
        workflowStatus: 'manager_review_complete_ready_to_send',
        workflowStage: 'manager_final_review_complete',
        workflowRouting: {
          nextStepKey: 'deydry_send_to_jocelyn',
          nextStepLabel: 'Deydry send/print to Jocelyn',
          nextRecipientName: DEYDRY_SEND_NAME,
          nextRecipientEmail: DEYDRY_SEND_EMAIL,
          finalReviewOwnerName: JOHN_FINAL_REVIEW_EMAIL === email ? 'John' : name || 'John',
          finalReviewOwnerEmail: email || JOHN_FINAL_REVIEW_EMAIL,
        },
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    try {
      const deydryUserSnap = await adminDb
        .collection('users')
        .where('email', '==', DEYDRY_SEND_EMAIL)
        .limit(1)
        .get()
        .catch(() => null);

      const memberName = clean((intake as any)?.memberName, 160) || 'Member';
      const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn, 80);
      const deydryUid = clean(deydryUserSnap?.docs?.[0]?.id, 128);
      if (deydryUid) {
        await Promise.all(
          [deydryUid].map((recipientUid) =>
            adminDb.collection('staff_notifications').add({
              userId: recipientUid,
              recipientName: DEYDRY_SEND_NAME,
              title: 'ALFT ready for Deydry send step',
              message: `${memberName} • MRN ${mrn || '—'}\nJohn completed final review. Send/print packet to Jocelyn.`,
              memberName,
              type: 'alft_ready_for_deydry_send',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'system',
              createdBy: uid,
              createdByName: name,
              senderName: name,
              senderId: uid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(intakeId)}`,
              standaloneUploadId: intakeId,
            })
          )
        );
      }
      await sendAlftManagerWorkflowStageEmail({
        to: DEYDRY_SEND_EMAIL,
        managerName: DEYDRY_SEND_NAME,
        memberName,
        mrn: mrn || undefined,
        stageLabel: 'John final review complete',
        nextAction: 'Send or print the completed ALFT packet to Jocelyn at ILS.',
        actionUrl: `/admin/alft-tracker?edit=${encodeURIComponent(intakeId)}`,
        triggeredBy: name,
      }).catch(() => null);
    } catch {
      // best-effort only
    }

    return NextResponse.json({ success: true, intakeId });
  } catch (e: any) {
    console.error('[alft/workflow/final-review] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to complete final review' }, { status: 500 });
  }
}

