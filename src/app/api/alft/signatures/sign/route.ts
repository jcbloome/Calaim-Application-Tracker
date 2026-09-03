import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { sendAlftSignatureRequestEmail } from '@/app/actions/send-email';
import { ispWorkflowActionUrl, notifyAlftWorkflowParties } from '@/lib/alft-workflow-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  token?: string;
  signedName?: string;
  licenseNumber?: string;
  signaturePngDataUrl?: string; // data:image/png;base64,...
  consent?: boolean;
};

const clean = (v: unknown, max = 8000) => String(v ?? '').trim().slice(0, max);
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const base64UrlToken = (bytes = 32) =>
  crypto
    .randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
const DEFAULT_RN_EMAIL = 'leslie@carehomefinders.com';
const DEFAULT_RN_NAME = 'Leslie';

const parsePngDataUrl = (dataUrl: string): Buffer | null => {
  const raw = String(dataUrl || '').trim();
  const m = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
};

const toMs = (v: any) => {
  try {
    if (!v) return 0;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (typeof v?.toDate === 'function') return v.toDate().getTime();
    const d = new Date(v);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

async function saveBytesToStorage(adminStorage: any, storagePath: string, bytes: Buffer, contentType: string) {
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);
  await file.save(bytes, {
    metadata: { contentType },
    resumable: false,
    validation: false,
  });
  return storagePath;
}

async function readBytesFromStorage(adminStorage: any, storagePath: string): Promise<Buffer | null> {
  try {
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    const [buf] = await file.download();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

async function generateSignaturePagePdf(args: {
  memberName: string;
  mrn?: string | null;
  reviewedAtMs?: number;
  rn: { name: string; licenseNumber?: string | null; signedAtMs?: number; sigPngBytes?: Buffer | null };
  msw: { name: string; licenseNumber?: string | null; signedAtMs?: number; sigPngBytes?: Buffer | null };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US letter

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const rightCol = marginX + 300;
  let y = 740;
  const lineGap = 18;
  const dark = rgb(0.06, 0.09, 0.14);
  const mid = rgb(0.2, 0.23, 0.28);
  const light = rgb(0.4, 0.45, 0.53);
  const rule = rgb(0.82, 0.85, 0.89);

  const drawLabelValue = (label: string, value: string, xOff = 0) => {
    page.drawText(label, { x: marginX + xOff, y, size: 10.5, font: fontBold, color: dark });
    page.drawText(value, { x: marginX + xOff + 130, y, size: 10.5, font, color: dark });
    y -= lineGap;
  };

  // Title
  page.drawText('ALFT Signature Page', { x: marginX, y, size: 20, font: fontBold, color: dark });
  y -= 10;
  page.drawLine({ start: { x: marginX, y }, end: { x: 564, y }, thickness: 1.5, color: rgb(0.06, 0.09, 0.14) });
  y -= 20;

  // Member block
  drawLabelValue('Member:', args.memberName || 'Member');
  if (args.mrn) drawLabelValue('Kaiser MRN:', String(args.mrn));
  if (args.reviewedAtMs) drawLabelValue('Reviewed:', new Date(args.reviewedAtMs).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));

  y -= 8;
  page.drawText(
    'By signing below, I attest that I have reviewed the ALFT documentation for the above member and that the information is accurate to the best of my knowledge.',
    { x: marginX, y, size: 9.5, font, color: mid, maxWidth: 516 }
  );
  y -= 36;

  const drawSignerBlock = async (
    roleLabel: string,
    signer: { name: string; licenseNumber?: string | null; signedAtMs?: number; sigPngBytes?: Buffer | null }
  ) => {
    // Role header bar
    page.drawRectangle({ x: marginX, y: y - 2, width: 516, height: 18, color: rgb(0.94, 0.96, 0.98) });
    page.drawText(roleLabel, { x: marginX + 6, y: y + 1, size: 12, font: fontBold, color: dark });
    y -= 26;

    // ── Left column: Signature image + label ──────────────────────────────
    const sigBoxTop = y + 4;
    const sigBoxH = 72;
    page.drawRectangle({ x: marginX, y: sigBoxTop - sigBoxH, width: 240, height: sigBoxH, color: rgb(0.99, 0.99, 0.99), borderColor: rule, borderWidth: 1 });

    if (signer.sigPngBytes && signer.sigPngBytes.length > 0) {
      try {
        const img = await pdf.embedPng(signer.sigPngBytes);
        const scaleW = 228 / img.width;
        const drawH = Math.min(sigBoxH - 8, img.height * scaleW);
        page.drawImage(img, {
          x: marginX + 6,
          y: sigBoxTop - sigBoxH + (sigBoxH - drawH) / 2,
          width: 228,
          height: drawH,
        });
      } catch { /* ignore embed errors */ }
    }
    page.drawText('Signature', { x: marginX + 4, y: sigBoxTop - sigBoxH - 12, size: 8, font, color: light });

    // ── Right column: Printed name, License, Date ─────────────────────────
    const fieldX = marginX + 256;
    const fieldW = 260;
    let fy = sigBoxTop - 2;

    const drawField = (label: string, value: string) => {
      page.drawText(label, { x: fieldX, y: fy, size: 8, font, color: light });
      fy -= 13;
      page.drawText(value || '—', { x: fieldX, y: fy, size: 10.5, font: fontBold, color: dark, maxWidth: fieldW });
      page.drawLine({ start: { x: fieldX, y: fy - 3 }, end: { x: fieldX + fieldW, y: fy - 3 }, thickness: 0.75, color: rule });
      fy -= 22;
    };

    drawField('Printed name', signer.name || '—');
    drawField('License number', signer.licenseNumber || '—');
    drawField('Date of submission', signer.signedAtMs
      ? new Date(signer.signedAtMs).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '—');

    y = sigBoxTop - sigBoxH - 36;
  };

  await drawSignerBlock('MSW (Social Worker) — Master of Social Work', {
    name: args.msw.name || 'MSW',
    licenseNumber: args.msw.licenseNumber,
    signedAtMs: args.msw.signedAtMs,
    sigPngBytes: args.msw.sigPngBytes,
  });

  await drawSignerBlock('RN (Registered Nurse) — Leslie', {
    name: args.rn.name || 'RN',
    licenseNumber: args.rn.licenseNumber,
    signedAtMs: args.rn.signedAtMs,
    sigPngBytes: args.rn.sigPngBytes,
  });

  page.drawText('Generated by CalAIM Tracker · Connections Care Home Consultants · Confidential', {
    x: marginX,
    y: 24,
    size: 8.5,
    font,
    color: light,
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function mergePacket(originalPdfBytes: Buffer, signaturePdfBytes: Buffer) {
  const orig = await PDFDocument.load(originalPdfBytes);
  const sig = await PDFDocument.load(signaturePdfBytes);
  const out = await PDFDocument.create();
  const origPages = await out.copyPages(orig, orig.getPageIndices());
  origPages.forEach((p) => out.addPage(p));
  const sigPages = await out.copyPages(sig, sig.getPageIndices());
  sigPages.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return Buffer.from(bytes);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const idToken = clean(body?.idToken, 8000);
    const token = clean(body?.token, 4000);
    const signedName = clean(body?.signedName, 140);
    const licenseNumber = clean(body?.licenseNumber, 80);
    const signaturePngDataUrl = clean(body?.signaturePngDataUrl, 250000); // allow big
    const consent = Boolean(body?.consent);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!token) return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
    if (!signedName) return NextResponse.json({ success: false, error: 'Printed name is required' }, { status: 400 });
    if (!licenseNumber) return NextResponse.json({ success: false, error: 'License number is required' }, { status: 400 });
    if (!consent) return NextResponse.json({ success: false, error: 'Consent is required' }, { status: 400 });

    const sigBytes = parsePngDataUrl(signaturePngDataUrl);
    if (!sigBytes || sigBytes.length < 200) {
      return NextResponse.json({ success: false, error: 'Missing or invalid signature image' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;
    const adminStorage = adminModule.adminStorage;

    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = clean(decoded?.email, 220).toLowerCase();
    const uid = clean(decoded?.uid, 128);
    if (!uid) return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });

    const tokenHash = sha256(token);
    const snap = await adminDb
      .collection('alft_signature_requests')
      .where('signers.rn.tokenHash', '==', tokenHash)
      .limit(1)
      .get()
      .catch(() => null);
    const snap2 =
      snap && !snap.empty
        ? snap
        : await adminDb.collection('alft_signature_requests').where('signers.msw.tokenHash', '==', tokenHash).limit(1).get();
    const doc = snap2?.docs?.[0];
    if (!doc) return NextResponse.json({ success: false, error: 'Signature request not found' }, { status: 404 });

    const data = doc.data() || {};
    const rnEmail = clean(data?.signers?.rn?.email, 220).toLowerCase();
    const mswEmail = clean(data?.signers?.msw?.email, 220).toLowerCase();
    const signerRole = email && email === rnEmail ? 'rn' : email && email === mswEmail ? 'msw' : '';
    if (!signerRole) {
      return NextResponse.json(
        { success: false, error: 'This link is for a different signer. Please sign in with the correct email.' },
        { status: 403 }
      );
    }

    const rolePath = signerRole === 'rn' ? 'signers.rn' : 'signers.msw';
    const existingSignedAt = data?.signers?.[signerRole]?.signedAt;
    if (existingSignedAt) {
      return NextResponse.json({ success: false, error: 'This signer has already completed signing.' }, { status: 409 });
    }
    // Enforce signing order: SW first, then final RN sign-off.
    if (signerRole === 'rn') {
      const mswSigned = Boolean(data?.signers?.msw?.signedAt);
      if (!mswSigned) {
        return NextResponse.json(
          { success: false, error: 'Waiting for Social Worker signature. Please sign after the SW has signed.' },
          { status: 409 }
        );
      }
    }
    const requestId = doc.id;
    const intakeId = clean(data?.intakeId, 200);
    const memberName = clean(data?.memberName, 180) || 'Member';
    const mrn = clean(data?.mrn, 80) || null;
    const reviewedAtMs = toMs(data?.reviewedAt) || null;

    const sigStoragePath = `alft-signatures/requests/${requestId}/${signerRole}-signature.png`;
    await saveBytesToStorage(adminStorage, sigStoragePath, sigBytes, 'image/png');

    await adminDb.collection('alft_signature_requests').doc(requestId).set(
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        [`${rolePath}.signedAt`]: admin.firestore.FieldValue.serverTimestamp(),
        [`${rolePath}.signatureStoragePath`]: sigStoragePath,
        [`${rolePath}.signedName`]: signedName,
        [`${rolePath}.licenseNumber`]: licenseNumber,
        [`${rolePath}.signedByUid`]: uid,
      },
      { merge: true }
    );

    if (signerRole === 'msw') {
      await adminDb.collection('alft_signature_requests').doc(requestId).set(
        {
          status: 'awaiting_rn_final',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // If RN email was deferred until SW signed, mint a fresh RN token and notify RN now.
      let deferFromIntake = false;
      if (intakeId) {
        try {
          const intakeSnapForDefer = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
          deferFromIntake = Boolean((intakeSnapForDefer.data() as any)?.alftSignature?.deferRnEmail);
        } catch {
          deferFromIntake = false;
        }
      }
      const shouldNotifyRn = Boolean(data?.deferRnEmail) || deferFromIntake;
      const rnAlreadyEmailed = Boolean(data?.signers?.rn?.emailSentAt);
      if (intakeId && shouldNotifyRn && !rnAlreadyEmailed) {
        try {
          const intakeSnapForRn = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
          const intakeForRn = intakeSnapForRn.exists ? (intakeSnapForRn.data() as any) : null;
          const rnEmailNotify =
            clean(data?.signers?.rn?.email, 220).toLowerCase() ||
            clean(intakeForRn?.alftRnEmail, 220).toLowerCase() ||
            DEFAULT_RN_EMAIL;
          const rnNameNotify =
            clean(data?.signers?.rn?.name, 160) ||
            clean(intakeForRn?.alftRnName, 160) ||
            DEFAULT_RN_NAME;
          const rnUidNotify = clean(data?.signers?.rn?.uid, 128) || clean(intakeForRn?.alftRnUid, 128);
          const rnToken = base64UrlToken(32);
          const rnTokenHash = sha256(rnToken);
          const adminSignUrl = `/admin/alft-sign/${encodeURIComponent(rnToken)}`;

          await adminDb.collection('alft_signature_requests').doc(requestId).set(
            {
              'signers.rn.tokenHash': rnTokenHash,
              'signers.rn.requestedAt': admin.firestore.FieldValue.serverTimestamp(),
              'signers.rn.emailSentAt': admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          if (rnUidNotify) {
            await adminDb.collection('staff_notifications').add({
              userId: rnUidNotify,
              recipientName: rnNameNotify,
              title: 'ALFT ready for RN review',
              message: `${memberName} • MRN ${mrn || '—'}\nSocial worker signed. Please review, edit if needed, and sign.`,
              memberName,
              type: 'alft_signature_request',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'system',
              createdBy: uid,
              createdByName: clean((decoded as any)?.name, 160) || email || 'MSW',
              senderName: clean((decoded as any)?.name, 160) || email || 'MSW',
              senderId: uid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: adminSignUrl,
              standaloneUploadId: intakeId,
              alftSignatureRequestId: requestId,
            });
          }

          await sendAlftSignatureRequestEmail({
            to: rnEmailNotify,
            recipientName: rnNameNotify,
            recipientRoleLabel: 'RN',
            memberName,
            mrn: mrn || undefined,
            signUrl: adminSignUrl,
          }).catch(() => null);

          await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
            {
              'alftSignature.rnRequestedAt': admin.firestore.FieldValue.serverTimestamp(),
              'alftSignature.status': 'awaiting_rn_final_signature',
              workflowStatus: 'awaiting_rn_final_signature',
              workflowStage: 'sw_signed_waiting_rn_review',
              workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // Admin / ALFT reviewers: MSW signed → RN notified.
          try {
            const intakeForStaff = intakeForRn || {};
            await notifyAlftWorkflowParties({
              admin,
              adminDb,
              intakeId,
              memberName,
              mrn: mrn || undefined,
              title: 'MSW signed — RN notified',
              message: `${memberName} • MRN ${mrn || '—'}\nMSW signed. ${rnNameNotify} (${rnEmailNotify}) emailed for review and signature.`,
              type: 'alft_msw_signed_rn_notified',
              stageLabel: 'MSW signed — ready for RN review',
              nextAction: `RN ${rnNameNotify} has been emailed. Track RN review/signature in ISP Tracker.`,
              triggeredBy: clean((decoded as any)?.name, 160) || email || 'MSW',
              assignedStaff: {
                uid: clean(intakeForStaff?.alftStaffUid, 128) || undefined,
                email: clean(intakeForStaff?.alftStaffEmail, 220).toLowerCase() || undefined,
                name: clean(intakeForStaff?.alftStaffName, 160) || 'ALFT Reviewer',
              },
              includeAlftReviewers: true,
              sendEmails: true,
              actionUrl: ispWorkflowActionUrl(intakeId),
              createdBy: uid,
              createdByName: clean((decoded as any)?.name, 160) || email || 'MSW',
            });
          } catch {
            // best-effort
          }
        } catch (notifyErr) {
          console.warn('[alft/signatures/sign] deferred RN notify failed', notifyErr);
        }
      }
    }

    // Update intake summary status (for tracker visibility).
    if (intakeId) {
      const patch: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      patch[`alftSignature.${signerRole}SignedAt`] = admin.firestore.FieldValue.serverTimestamp();
      if (signerRole === 'msw') {
        patch.workflowStatus = 'awaiting_rn_final_signature';
        patch.workflowStage = 'awaiting_rn_signature';
        patch.workflowUpdatedAt = admin.firestore.FieldValue.serverTimestamp();
      }
      await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(patch, { merge: true }).catch(() => null);
    }

    // Reload request doc to check completion.
    const afterSnap = await adminDb.collection('alft_signature_requests').doc(requestId).get();
    const after = afterSnap.data() || {};
    const rnSignedMs = toMs(after?.signers?.rn?.signedAt);
    const mswSignedMs = toMs(after?.signers?.msw?.signedAt);
    const bothSigned = rnSignedMs > 0 && mswSignedMs > 0;

    let signaturePageReady = Boolean(clean(after?.outputs?.signaturePagePdfStoragePath, 800));
    let packetReady = Boolean(clean(after?.outputs?.packetPdfStoragePath, 800));

    if (bothSigned && (!signaturePageReady || !packetReady)) {
      const rnSigPath = clean(after?.signers?.rn?.signatureStoragePath, 800);
      const mswSigPath = clean(after?.signers?.msw?.signatureStoragePath, 800);
      const rnSigBytes = rnSigPath ? await readBytesFromStorage(adminStorage, rnSigPath) : null;
      const mswSigBytes = mswSigPath ? await readBytesFromStorage(adminStorage, mswSigPath) : null;

      const signaturePdfBytes = await generateSignaturePagePdf({
        memberName,
        mrn,
        reviewedAtMs: reviewedAtMs || undefined,
        rn: {
          name: clean(after?.signers?.rn?.signedName, 160) || clean(after?.signers?.rn?.name, 160) || 'RN',
          licenseNumber: clean(after?.signers?.rn?.licenseNumber, 80) || null,
          signedAtMs: rnSignedMs || undefined,
          sigPngBytes: rnSigBytes,
        },
        msw: {
          name: clean(after?.signers?.msw?.signedName, 160) || clean(after?.signers?.msw?.name, 160) || 'MSW',
          licenseNumber: clean(after?.signers?.msw?.licenseNumber, 80) || null,
          signedAtMs: mswSignedMs || undefined,
          sigPngBytes: mswSigBytes,
        },
      });

      const signaturePdfPath = `alft-signatures/requests/${requestId}/signature-page.pdf`;
      await saveBytesToStorage(adminStorage, signaturePdfPath, signaturePdfBytes, 'application/pdf');

      let packetPdfPath: string | null = null;
      // Merge packet if original is a PDF.
      try {
        const originalUrl = String(after?.originalFiles?.[0]?.downloadURL || '').trim();
        if (originalUrl) {
          const res = await fetch(originalUrl);
          const arr = await res.arrayBuffer();
          const originalBytes = Buffer.from(arr);
          const merged = await mergePacket(originalBytes, signaturePdfBytes);
          packetPdfPath = `alft-signatures/requests/${requestId}/packet.pdf`;
          await saveBytesToStorage(adminStorage, packetPdfPath, merged, 'application/pdf');
        }
      } catch {
        packetPdfPath = null;
      }

      await adminDb.collection('alft_signature_requests').doc(requestId).set(
        {
          status: packetPdfPath ? 'completed' : 'signed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          outputs: {
            signaturePagePdfStoragePath: signaturePdfPath,
            packetPdfStoragePath: packetPdfPath,
          },
        },
        { merge: true }
      );

      if (intakeId) {
        await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
          {
            alftSignature: {
              status: packetPdfPath ? 'completed' : 'signed',
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              signaturePagePdfStoragePath: signaturePdfPath,
              packetPdfStoragePath: packetPdfPath,
            },
            alftManagerReview: {
              status: 'pending',
              required: true,
            },
            workflowStatus: 'awaiting_kaiser_manager_final_review',
            workflowStage: 'awaiting_manager_final_review',
            workflowUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      signaturePageReady = true;
      packetReady = Boolean(packetPdfPath);

      // Notify assigned staff + ALFT reviewers that signatures are complete / final review needed.
      try {
        if (intakeId) {
          const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
          const intake = intakeSnap.exists ? intakeSnap.data() : null;
          const staffEmail =
            clean((intake as any)?.alftStaffEmail, 220).toLowerCase() ||
            clean((intake as any)?.workflowRouting?.finalReviewOwnerEmail, 220).toLowerCase() ||
            clean((intake as any)?.assignedManager?.email, 220).toLowerCase();
          const staffNameFinal =
            clean((intake as any)?.alftStaffName, 160) ||
            clean((intake as any)?.workflowRouting?.finalReviewOwnerName, 160) ||
            clean((intake as any)?.assignedManager?.name, 160) ||
            'Connections Staff';
          const staffUidFinal =
            clean((intake as any)?.alftStaffUid, 128) || clean((intake as any)?.assignedManager?.uid, 128);

          const partyResult = await notifyAlftWorkflowParties({
            admin,
            adminDb,
            intakeId,
            memberName,
            mrn: mrn || undefined,
            title: 'ALFT ready for final review',
            message: `${memberName} • MRN ${mrn || '—'}\nRN signed. Please complete final review and download.`,
            type: 'alft_final_review',
            stageLabel: 'RN signed — Connections staff final review required',
            nextAction: 'Review the signed packet, then download and archive from ISP Downloads.',
            triggeredBy: clean((decoded as any)?.name, 160) || email || 'RN',
            assignedStaff: {
              uid: staffUidFinal || undefined,
              email: staffEmail || undefined,
              name: staffNameFinal,
            },
            includeAlftReviewers: true,
            sendEmails: true,
            actionUrl: ispWorkflowActionUrl(intakeId),
            createdBy: uid,
            createdByName: clean((decoded as any)?.name, 160) || email || 'Signer',
          });

          if (partyResult.emailed > 0) {
            await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
              {
                workflowEmailStatus: {
                  managerStep4Recipients: partyResult.recipients.length,
                  managerStep4SentCount: partyResult.emailed,
                  managerStep4EmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                workflowRouting: {
                  nextStepKey: 'staff_final_review',
                  nextStepLabel: 'Connections Staff Final Review',
                  nextRecipientName: staffNameFinal,
                  nextRecipientEmail: staffEmail || null,
                  finalReviewOwnerName: staffNameFinal,
                  finalReviewOwnerEmail: staffEmail || null,
                },
              },
              { merge: true }
            );
          }
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      intakeId,
      memberName,
      mrn,
      reviewedAtMs,
      signerRole,
      outputs: { signaturePageReady, packetReady },
    });
  } catch (e: any) {
    console.error('[alft/signatures/sign] error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Signing failed' }, { status: 500 });
  }
}

