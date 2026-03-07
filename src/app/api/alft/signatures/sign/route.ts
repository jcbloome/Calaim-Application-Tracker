import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  idToken?: string;
  token?: string;
  signedName?: string;
  signaturePngDataUrl?: string; // data:image/png;base64,...
  consent?: boolean;
};

const clean = (v: unknown, max = 8000) => String(v ?? '').trim().slice(0, max);
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

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
  rn: { name: string; signedAtMs?: number; sigPngBytes?: Buffer | null };
  msw: { name: string; signedAtMs?: number; sigPngBytes?: Buffer | null };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // letter

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  let y = 740;
  const lineGap = 18;

  const drawLabelValue = (label: string, value: string) => {
    page.drawText(label, { x: marginX, y, size: 11, font: fontBold, color: rgb(0.06, 0.09, 0.14) });
    page.drawText(value, { x: marginX + 140, y, size: 11, font, color: rgb(0.06, 0.09, 0.14) });
    y -= lineGap;
  };

  page.drawText('ALFT Signature Page', { x: marginX, y, size: 22, font: fontBold, color: rgb(0.06, 0.09, 0.14) });
  y -= 34;

  drawLabelValue('Member', args.memberName || 'Member');
  if (args.mrn) drawLabelValue('MRN', String(args.mrn));
  if (args.reviewedAtMs) drawLabelValue('Reviewed date', new Date(args.reviewedAtMs).toLocaleDateString());

  y -= 14;
  page.drawText(
    'By signing below, I attest that I have reviewed the ALFT documentation associated with this member.',
    { x: marginX, y, size: 10.5, font, color: rgb(0.2, 0.23, 0.28), maxWidth: 520 }
  );
  y -= 44;

  const drawSignerBlock = async (roleLabel: string, name: string, signedAtMs?: number, sigPngBytes?: Buffer | null) => {
    page.drawText(roleLabel, { x: marginX, y, size: 13, font: fontBold, color: rgb(0.06, 0.09, 0.14) });
    y -= 18;

    // signature line
    page.drawLine({
      start: { x: marginX, y: y - 2 },
      end: { x: marginX + 280, y: y - 2 },
      thickness: 1,
      color: rgb(0.82, 0.85, 0.89),
    });
    page.drawText('Signature', { x: marginX, y: y - 16, size: 9, font, color: rgb(0.4, 0.45, 0.53) });

    if (sigPngBytes && sigPngBytes.length > 0) {
      try {
        const img = await pdf.embedPng(sigPngBytes);
        const targetW = 240;
        const scale = targetW / img.width;
        const targetH = Math.min(80, img.height * scale);
        page.drawImage(img, { x: marginX + 6, y: y + 6, width: targetW, height: targetH });
      } catch {
        // ignore embed errors
      }
    }

    // name line
    page.drawLine({
      start: { x: marginX + 310, y: y - 2 },
      end: { x: marginX + 520, y: y - 2 },
      thickness: 1,
      color: rgb(0.82, 0.85, 0.89),
    });
    page.drawText('Printed name', { x: marginX + 310, y: y - 16, size: 9, font, color: rgb(0.4, 0.45, 0.53) });
    page.drawText(name || '—', { x: marginX + 310, y: y + 10, size: 11, font, color: rgb(0.06, 0.09, 0.14), maxWidth: 210 });

    y -= 64;
    page.drawText(`Signed: ${signedAtMs ? new Date(signedAtMs).toLocaleString() : '—'}`, {
      x: marginX,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.23, 0.28),
    });
    y -= 34;
  };

  await drawSignerBlock('RN signature', args.rn.name || 'RN', args.rn.signedAtMs, args.rn.sigPngBytes);
  await drawSignerBlock('MSW signature', args.msw.name || 'MSW', args.msw.signedAtMs, args.msw.sigPngBytes);

  page.drawText('Generated by CalAIM Tracker', {
    x: marginX,
    y: 28,
    size: 9.5,
    font,
    color: rgb(0.4, 0.45, 0.53),
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
    const signaturePngDataUrl = clean(body?.signaturePngDataUrl, 250000); // allow big
    const consent = Boolean(body?.consent);
    if (!idToken) return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    if (!token) return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
    if (!signedName) return NextResponse.json({ success: false, error: 'Missing signedName' }, { status: 400 });
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
    // Enforce signing order: RN first, then MSW.
    if (signerRole === 'msw') {
      const rnSigned = Boolean(data?.signers?.rn?.signedAt);
      if (!rnSigned) {
        return NextResponse.json(
          { success: false, error: 'Waiting for RN signature. Please try again after the RN has signed.' },
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
        [`${rolePath}.signedByUid`]: uid,
      },
      { merge: true }
    );

    // Update intake summary status (for tracker visibility).
    if (intakeId) {
      const patch: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      patch[`alftSignature.${signerRole}SignedAt`] = admin.firestore.FieldValue.serverTimestamp();
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
          signedAtMs: rnSignedMs || undefined,
          sigPngBytes: rnSigBytes,
        },
        msw: {
          name: clean(after?.signers?.msw?.signedName, 160) || clean(after?.signers?.msw?.name, 160) || 'MSW',
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      signaturePageReady = true;
      packetReady = Boolean(packetPdfPath);

      // Notify assigned staff that signatures are complete.
      try {
        if (intakeId) {
          const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
          const intake = intakeSnap.exists ? intakeSnap.data() : null;
          const staffUid = clean((intake as any)?.alftStaffUid, 128);
          const staffName = clean((intake as any)?.alftStaffName, 160) || 'Staff';
          if (staffUid) {
            await adminDb.collection('staff_notifications').add({
              userId: staffUid,
              recipientName: staffName,
              title: 'ALFT signatures complete',
              message: `${memberName} • MRN ${mrn || '—'}\nSignature page is ready to download.`,
              memberName,
              type: 'alft_signature_complete',
              priority: 'Priority',
              status: 'Open',
              isRead: false,
              source: 'system',
              createdBy: uid,
              createdByName: clean((decoded as any)?.name, 160) || email || 'Signer',
              senderName: clean((decoded as any)?.name, 160) || email || 'Signer',
              senderId: uid,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(intakeId)}`,
              standaloneUploadId: intakeId,
              alftSignatureRequestId: requestId,
            });
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

