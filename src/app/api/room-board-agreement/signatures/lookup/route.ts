import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LookupBody = {
  idToken?: string;
  token?: string;
};

const clean = (value: unknown, max = 400) => String(value || '').trim().slice(0, max);
const normalizeEmail = (value: unknown) => clean(value, 320).toLowerCase();
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as LookupBody;
    const idToken = clean(body?.idToken, 8000);
    const rawToken = clean(body?.token, 4000);
    if (!idToken || !rawToken) {
      return NextResponse.json({ success: false, error: 'Missing token or idToken.' }, { status: 400 });
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

    const data = (docSnap.data() || {}) as any;
    const signerEmail = normalizeEmail(data?.signers?.[role]?.email);
    if (!signerEmail || signerEmail !== email) {
      return NextResponse.json(
        { success: false, error: `You are signed in as ${email}, but this link is assigned to ${signerEmail || 'another signer'}.` },
        { status: 403 }
      );
    }

    const signer = data?.signers?.[role] || {};
    return NextResponse.json({
      success: true,
      requestId: docSnap.id,
      status: clean(data?.status, 80) || 'invited',
      signerRole: role,
      memberName: clean(data?.memberName, 160),
      mrn: clean(data?.mrn, 80) || null,
      applicationId: clean(data?.applicationId, 200),
      applicationUserId: clean(data?.applicationUserId, 200) || null,
      clientId2: clean(data?.clientId2, 120) || null,
      rcfeName: clean(data?.rcfeName, 180) || '',
      mcoAndTier: clean(data?.mcoAndTier, 120) || '',
      tierLevel: clean(data?.tierLevel, 20) || '',
      assistedLivingDailyRate: clean(data?.assistedLivingDailyRate, 40) || '',
      assistedLivingMonthlyRate: clean(data?.assistedLivingMonthlyRate, 40) || '',
      agreedRoomBoardAmount: clean(data?.agreedRoomBoardAmount, 40) || '',
      signer: {
        email: signerEmail,
        name: clean(signer?.name, 160),
        signedAtMs: typeof signer?.signedAt?.toMillis === 'function' ? signer.signedAt.toMillis() : null,
        relationship: clean(signer?.relationship, 120) || '',
        phone: clean(signer?.phone, 40) || '',
        title: clean(signer?.title, 120) || '',
        address: clean(signer?.address, 260) || '',
      },
      allSigners: {
        memberRep: {
          email: normalizeEmail(data?.signers?.memberRep?.email),
          signedAtMs:
            typeof data?.signers?.memberRep?.signedAt?.toMillis === 'function'
              ? data.signers.memberRep.signedAt.toMillis()
              : null,
        },
        rcfe: {
          email: normalizeEmail(data?.signers?.rcfe?.email),
          signedAtMs:
            typeof data?.signers?.rcfe?.signedAt?.toMillis === 'function'
              ? data.signers.rcfe.signedAt.toMillis()
              : null,
        },
      },
    });
  } catch (error: any) {
    console.error('[room-board-agreement/signatures/lookup] error', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lookup failed.' },
      { status: 500 }
    );
  }
}
