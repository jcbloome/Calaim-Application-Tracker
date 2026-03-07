import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendAlftSignatureRequestEmail } from '@/app/actions/send-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  intakeId?: string;
};

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

const base64UrlToken = (bytes = 32) =>
  crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const formatDate = (ms: number) => {
  try {
    return new Date(ms).toLocaleDateString();
  } catch {
    return '';
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 8000);
    const intakeId = clean(body?.intakeId, 200);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!intakeId) return NextResponse.json({ success: false, error: 'Missing intakeId' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const requesterUid = clean(decoded?.uid, 128);
    const requesterEmail = clean(decoded?.email, 200).toLowerCase();
    if (!requesterUid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
    if (!intakeSnap.exists) return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    const intake = intakeSnap.data() || {};

    const toolCode = clean((intake as any)?.toolCode, 50).toUpperCase();
    const docType = clean((intake as any)?.documentType, 120).toLowerCase();
    const isAlft = toolCode === 'ALFT' || docType.includes('alft');
    if (!isAlft) {
      return NextResponse.json({ success: false, error: 'This intake is not an ALFT upload' }, { status: 400 });
    }

    const memberName = clean((intake as any)?.memberName, 140) || 'Member';
    const mrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn || (intake as any)?.mediCalNumber, 80);

    const rnUid = clean((intake as any)?.alftRnUid, 128);
    const rnEmail = clean((intake as any)?.alftRnEmail, 200).toLowerCase();
    const rnName = clean((intake as any)?.alftRnName, 160) || rnEmail || 'RN';
    if (!rnUid || !rnEmail) {
      return NextResponse.json(
        { success: false, error: 'Assign an RN on the ALFT Tracker before requesting signatures.' },
        { status: 409 }
      );
    }

    const mswEmail = clean((intake as any)?.uploaderEmail, 200).toLowerCase();
    const mswName = clean((intake as any)?.uploaderName, 160) || mswEmail || 'MSW';
    if (!mswEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing uploader email for MSW signature. (uploaderEmail not found on intake)' },
        { status: 409 }
      );
    }

    const reviewedAtMs =
      (typeof (intake as any)?.alftRnRevisionUploadedAt?.toMillis === 'function'
        ? (intake as any).alftRnRevisionUploadedAt.toMillis()
        : 0) || Date.now();

    const rnToken = base64UrlToken(32);
    const mswToken = base64UrlToken(32);
    const rnTokenHash = sha256(rnToken);
    const mswTokenHash = sha256(mswToken);

    const requestRef = adminDb.collection('alft_signature_requests').doc();
    const requestId = clean(requestRef.id, 200);

    const docPayload = {
      intakeId,
      requestId,
      status: 'requested',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt: new Date(reviewedAtMs),
      memberName,
      mrn: mrn || null,
      originalFiles: Array.isArray((intake as any)?.files) ? (intake as any).files.slice(0, 5) : [],
      requester: {
        uid: requesterUid,
        email: requesterEmail || null,
        name: clean((decoded as any)?.name, 160) || null,
      },
      signers: {
        rn: {
          uid: rnUid,
          email: rnEmail,
          name: rnName,
          tokenHash: rnTokenHash,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedAt: null,
          signatureStoragePath: null,
          signedName: null,
          signedByUid: null,
        },
        msw: {
          uid: null,
          email: mswEmail,
          name: mswName,
          tokenHash: mswTokenHash,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          signedAt: null,
          signatureStoragePath: null,
          signedName: null,
          signedByUid: null,
        },
      },
      outputs: {
        signaturePagePdfStoragePath: null,
        packetPdfStoragePath: null,
      },
    };

    await requestRef.set(docPayload);

    await adminDb
      .collection('standalone_upload_submissions')
      .doc(intakeId)
      .set(
        {
          alftSignature: {
            requestId,
            status: 'requested',
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewedAt: new Date(reviewedAtMs),
            rnEmail,
            mswEmail,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    const adminSignUrl = `/admin/alft-sign/${encodeURIComponent(rnToken)}`;
    const swSignUrl = `/sw-portal/alft-sign/${encodeURIComponent(mswToken)}`;

    // RN Electron/My Notifications.
    try {
      await adminDb.collection('staff_notifications').add({
        userId: rnUid,
        recipientName: rnName,
        title: 'ALFT signature requested',
        message: `${memberName} • MRN ${mrn || '—'}\nPlease open and sign in the tracker.`,
        memberName,
        type: 'alft_signature_request',
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        source: 'system',
        createdBy: requesterUid,
        createdByName: clean((decoded as any)?.name, 160) || requesterEmail || 'Staff',
        senderName: clean((decoded as any)?.name, 160) || requesterEmail || 'Staff',
        senderId: requesterUid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        actionUrl: adminSignUrl,
        standaloneUploadId: intakeId,
        alftSignatureRequestId: requestId,
      });
    } catch {
      // ignore (email is still sent)
    }

    // Emails (RN + MSW)
    const reviewedDateLabel = formatDate(reviewedAtMs);
    const rnEmailResult = await sendAlftSignatureRequestEmail({
      to: rnEmail,
      recipientName: rnName,
      recipientRoleLabel: 'RN',
      memberName,
      mrn: mrn || undefined,
      reviewedDateLabel: reviewedDateLabel || undefined,
      signUrl: adminSignUrl,
    }).catch(() => null);

    const mswEmailResult = await sendAlftSignatureRequestEmail({
      to: mswEmail,
      recipientName: mswName,
      recipientRoleLabel: 'MSW',
      memberName,
      mrn: mrn || undefined,
      reviewedDateLabel: reviewedDateLabel || undefined,
      signUrl: swSignUrl,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      requestId,
      rn: { emailSent: Boolean(rnEmailResult), signUrl: adminSignUrl },
      msw: { emailSent: Boolean(mswEmailResult), signUrl: swSignUrl },
    });
  } catch (e: any) {
    console.error('[alft/signatures/request] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Request failed' }, { status: 500 });
  }
}

