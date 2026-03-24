import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb, adminStorage, default as admin } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SignBody = {
  idToken?: string;
  token?: string;
  signedName?: string;
  signaturePngDataUrl?: string;
  consent?: boolean;
  relationship?: string;
  phone?: string;
  title?: string;
  address?: string;
  rcfeName?: string;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 320).toLowerCase();
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function parsePngDataUrl(dataUrl: string): Buffer {
  const value = clean(dataUrl, 2_000_000);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!m) throw new Error('Invalid PNG signature payload.');
  return Buffer.from(m[1], 'base64');
}

async function setApplicationAgreementStatus(
  applicationId: string,
  applicationUserId: string | null,
  patch: Record<string, any>
) {
  const refs = [];
  if (applicationUserId) {
    refs.push(adminDb.collection('users').doc(applicationUserId).collection('applications').doc(applicationId));
  }
  refs.push(adminDb.collection('applications').doc(applicationId));
  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  for (const ref of refs) {
    const snap = await ref.get();
    if (!snap.exists) continue;
    await ref.set(
      {
        roomBoardTierAgreement: {
          ...patch,
          updatedAt: nowTs,
        },
        lastUpdated: nowTs,
      },
      { merge: true }
    );
    break;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as SignBody;
    const idToken = clean(body?.idToken, 8000);
    const rawToken = clean(body?.token, 4000);
    const signedName = clean(body?.signedName, 160);
    const signaturePngDataUrl = clean(body?.signaturePngDataUrl, 2_000_000);
    const consent = Boolean(body?.consent);
    if (!idToken || !rawToken) {
      return NextResponse.json({ success: false, error: 'Missing token or idToken.' }, { status: 400 });
    }
    if (!signedName) {
      return NextResponse.json({ success: false, error: 'Signed name is required.' }, { status: 400 });
    }
    if (!signaturePngDataUrl) {
      return NextResponse.json({ success: false, error: 'Signature image is required.' }, { status: 400 });
    }
    if (!consent) {
      return NextResponse.json({ success: false, error: 'Consent is required.' }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = clean(decoded?.uid, 128);
    const email = normalizeEmail((decoded as any)?.email);
    if (!uid || !email) {
      return NextResponse.json({ success: false, error: 'Invalid sign-in session.' }, { status: 401 });
    }

    const tokenHash = sha256(rawToken);
    const [memberRepSnap, rcfeSnap] = await Promise.all([
      adminDb
        .collection('room_board_agreement_requests')
        .where('signers.memberRep.tokenHash', '==', tokenHash)
        .limit(1)
        .get(),
      adminDb
        .collection('room_board_agreement_requests')
        .where('signers.rcfe.tokenHash', '==', tokenHash)
        .limit(1)
        .get(),
    ]);

    const role: 'memberRep' | 'rcfe' | '' = !memberRepSnap.empty
      ? 'memberRep'
      : !rcfeSnap.empty
      ? 'rcfe'
      : '';
    const docSnap = !memberRepSnap.empty
      ? memberRepSnap.docs[0]
      : !rcfeSnap.empty
      ? rcfeSnap.docs[0]
      : null;
    if (!role || !docSnap) {
      return NextResponse.json({ success: false, error: 'Invalid or expired signature link.' }, { status: 404 });
    }

    const requestId = docSnap.id;
    const requestData = (docSnap.data() || {}) as any;
    const signerEmail = normalizeEmail(requestData?.signers?.[role]?.email);
    if (!signerEmail || signerEmail !== email) {
      return NextResponse.json(
        { success: false, error: `You are signed in as ${email}, but this link is assigned to ${signerEmail || 'another signer'}.` },
        { status: 403 }
      );
    }
    if (requestData?.signers?.[role]?.signedAt) {
      return NextResponse.json({ success: false, error: 'This signature has already been completed.' }, { status: 409 });
    }

    const signatureBytes = parsePngDataUrl(signaturePngDataUrl);
    const storagePath = `room_board_agreements/${requestId}/${role}-signature-${Date.now()}.png`;
    const bucket = adminStorage.bucket();
    const file = bucket.file(storagePath);
    await file.save(signatureBytes, {
      metadata: { contentType: 'image/png', cacheControl: 'private, max-age=0, no-cache' },
      resumable: false,
    });

    const signerPatch: Record<string, any> = {
      signedAt: admin.firestore.FieldValue.serverTimestamp(),
      signedName,
      signedByUid: uid,
      signedByEmail: email,
      consent: true,
      signatureStoragePath: storagePath,
    };
    if (role === 'memberRep') {
      signerPatch.relationship = clean(body?.relationship, 120) || null;
      signerPatch.phone = clean(body?.phone, 40) || null;
    } else {
      signerPatch.title = clean(body?.title, 120) || null;
      signerPatch.phone = clean(body?.phone, 40) || null;
      signerPatch.address = clean(body?.address, 260) || null;
      signerPatch.rcfeName = clean(body?.rcfeName, 180) || null;
    }

    await adminDb.collection('room_board_agreement_requests').doc(requestId).set(
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        [`signers.${role}`]: signerPatch,
      },
      { merge: true }
    );

    const afterSnap = await adminDb.collection('room_board_agreement_requests').doc(requestId).get();
    const afterData = (afterSnap.data() || {}) as any;
    const memberSigned = Boolean(afterData?.signers?.memberRep?.signedAt);
    const rcfeSigned = Boolean(afterData?.signers?.rcfe?.signedAt);
    const nextStatus = memberSigned && rcfeSigned ? 'signed' : 'partially_signed';

    await adminDb.collection('room_board_agreement_requests').doc(requestId).set(
      {
        status: nextStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await setApplicationAgreementStatus(
      clean(afterData?.applicationId, 200),
      clean(afterData?.applicationUserId, 200) || null,
      {
        requestId,
        status: nextStatus,
        memberRepSignedAt: afterData?.signers?.memberRep?.signedAt || null,
        rcfeSignedAt: afterData?.signers?.rcfe?.signedAt || null,
      }
    );

    return NextResponse.json({
      success: true,
      requestId,
      status: nextStatus,
      memberRepSigned: memberSigned,
      rcfeSigned,
    });
  } catch (error: any) {
    console.error('[room-board-agreement/signatures/sign] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sign agreement.' },
      { status: 500 }
    );
  }
}
