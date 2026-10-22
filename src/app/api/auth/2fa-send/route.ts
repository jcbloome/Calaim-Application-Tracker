import { NextRequest, NextResponse } from 'next/server';
import {
  CODE_EXPIRY_SECONDS,
  MAX_SENDS_PER_HOUR,
  RESEND_COOLDOWN_MS,
  maskContact,
  newEmailCode,
  send2faEmailCode,
  verifyBearerUser,
} from '@/lib/server-2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { uid, email, adminDb, admin } = await verifyBearerUser(request);
    const body = await request.json().catch(() => ({}));
    const method = String(body?.method || 'email').trim().toLowerCase();
    const contact = String(body?.contact || email || '')
      .trim()
      .toLowerCase();

    if (method !== 'email') {
      return NextResponse.json(
        { success: false, error: 'Only email verification is available via this endpoint.' },
        { status: 400 }
      );
    }
    if (!contact || !contact.includes('@')) {
      return NextResponse.json({ success: false, error: 'A valid email is required.' }, { status: 400 });
    }
    if (email && contact !== email) {
      return NextResponse.json(
        { success: false, error: '2FA email must match your authenticated account email.' },
        { status: 403 }
      );
    }

    const { code, salt, hash, expiresAt } = newEmailCode();
    const codeRef = adminDb.collection('2fa-codes').doc(uid);

    await adminDb.runTransaction(async (tx: any) => {
      const snapshot = await tx.get(codeRef);
      const existing = snapshot.exists ? snapshot.data() : null;
      const now = Date.now();
      const lastSentMs = existing?.lastSentAt?.toDate?.()?.getTime?.() || 0;
      if (lastSentMs && now - lastSentMs < RESEND_COOLDOWN_MS) {
        throw Object.assign(new Error('Please wait before requesting another code.'), { status: 429 });
      }
      const windowStartMs = existing?.sendCountWindowStart?.toDate?.()?.getTime?.() || 0;
      const sameWindow = windowStartMs && now - windowStartMs < 60 * 60 * 1000;
      const sendCountInWindow = sameWindow ? Number(existing?.sendCountInWindow || 0) + 1 : 1;
      if (sendCountInWindow > MAX_SENDS_PER_HOUR) {
        throw Object.assign(new Error('Too many 2FA code requests. Try again later.'), { status: 429 });
      }
      const nowTs = admin.firestore.Timestamp.now();
      tx.set(
        codeRef,
        {
          codeHash: hash,
          codeSalt: salt,
          method: 'email',
          contact,
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          verified: false,
          attempts: 0,
          createdAt: nowTs,
          lastSentAt: nowTs,
          sendCountWindowStart:
            sameWindow && existing?.sendCountWindowStart ? existing.sendCountWindowStart : nowTs,
          sendCountInWindow,
        },
        { merge: true }
      );
    });

    await send2faEmailCode(contact, code);
    console.log(`2FA email code sent to ${maskContact(contact)}`);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent via email',
      expiresIn: CODE_EXPIRY_SECONDS,
    });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    console.warn('2fa-send failed:', String(error?.message || error));
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to send 2FA code') },
      { status }
    );
  }
}
