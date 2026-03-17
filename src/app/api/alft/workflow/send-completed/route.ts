import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { sendAlftCompletedWorkflowEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const JOCELYN_EMAIL = 'jocelyn@ilshealth.com';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { idToken?: string; intakeId?: string };
    const idToken = clean(body?.idToken, 8000);
    const intakeId = clean(body?.intakeId, 200);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminStorage = adminModule.adminStorage;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = clean((decoded as any)?.email, 220).toLowerCase();
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    let allowed = Boolean((decoded as any)?.admin) || Boolean((decoded as any)?.superAdmin) || isHardcodedAdminEmail(email);
    if (!allowed) {
      const [adminRole, superAdminRole] = await Promise.all([
        adminDb.collection('roles_admin').doc(uid).get(),
        adminDb.collection('roles_super_admin').doc(uid).get(),
      ]);
      allowed = adminRole.exists || superAdminRole.exists;
    }
    if (!allowed) return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });

    const intakeRef = adminDb.collection('standalone_upload_submissions').doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = intakeSnap.data() || {};

    const memberName = clean((intake as any)?.memberName, 180) || 'Member';
    const mrn =
      clean((intake as any)?.medicalRecordNumber, 80) ||
      clean((intake as any)?.kaiserMrn, 80) ||
      clean((intake as any)?.mediCalNumber, 80) ||
      '';

    const managerReviewStatus = clean((intake as any)?.alftManagerReview?.status, 80).toLowerCase();
    if (managerReviewStatus !== 'approved') {
      return NextResponse.json(
        { success: false, error: 'Final Kaiser manager review must be approved before sending completed ALFT.' },
        { status: 409 }
      );
    }

    const to = JOCELYN_EMAIL;
    const requestId = clean((intake as any)?.alftSignature?.requestId, 200);
    let signaturePageUrl = '';
    let packetUrl = '';
    if (requestId) {
      const requestSnap = await adminDb.collection('alft_signature_requests').doc(requestId).get();
      const requestData = requestSnap.exists ? requestSnap.data() : null;
      const signaturePath = clean(requestData?.outputs?.signaturePagePdfStoragePath, 1000);
      const packetPath = clean(requestData?.outputs?.packetPdfStoragePath, 1000);
      const bucket = adminStorage.bucket();
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
      if (signaturePath) {
        try {
          const [url] = await bucket.file(signaturePath).getSignedUrl({ action: 'read', expires: expiresAt });
          signaturePageUrl = url;
        } catch {
          signaturePageUrl = '';
        }
      }
      if (packetPath) {
        try {
          const [url] = await bucket.file(packetPath).getSignedUrl({ action: 'read', expires: expiresAt });
          packetUrl = url;
        } catch {
          packetUrl = '';
        }
      }
    }

    const originalFiles = Array.isArray((intake as any)?.files) ? (intake as any).files : [];
    const revisionFiles = Array.isArray((intake as any)?.alftRevisions) ? (intake as any).alftRevisions : [];
    const summary = clean((intake as any)?.alftForm?.transitionSummary, 800);

    await sendAlftCompletedWorkflowEmail({
      to,
      memberName,
      mrn: mrn || undefined,
      intakeId,
      summary: summary || undefined,
      packetUrl: packetUrl || undefined,
      signaturePageUrl: signaturePageUrl || undefined,
      originalFiles,
      revisionFiles,
    });

    await intakeRef.set(
      {
        status: 'completed',
        workflowStatus: 'completed_sent_to_jocelyn',
        workflowStage: 'completed_email_sent',
        workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        alftCompletionEmail: {
          to,
          sentByUid: uid,
          sentByEmail: email || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, to });
  } catch (e: any) {
    console.error('[alft/workflow/send-completed] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to send completed ALFT email' }, { status: 500 });
  }
}

