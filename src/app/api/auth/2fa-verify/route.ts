import { NextRequest, NextResponse } from 'next/server';
import {
  MAX_VERIFY_ATTEMPTS,
  TWO_FA_SESSION_MS,
  buildCodeHash,
  maskContact,
  verifyBearerUser,
  verifyTotpCode,
} from '@/lib/server-2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { uid, email, adminDb, admin } = await verifyBearerUser(request);
    const body = await request.json().catch(() => ({}));
    const method = String(body?.method || 'email').trim().toLowerCase();
    const code = String(body?.code || '').trim();

    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'A valid 6-digit verification code is required' },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() || {} : {};
    let logContact = email;
    const preferredMethod = method === 'totp' ? 'totp' : 'email';

    if (preferredMethod === 'totp') {
      const secret = String(userData['2faTotpSecret'] || userData['2faTotpPendingSecret'] || '').trim();
      if (!secret) {
        return NextResponse.json(
          { success: false, error: 'Authenticator app is not configured for this account.' },
          { status: 400 }
        );
      }
      if (!verifyTotpCode(secret, code)) {
        return NextResponse.json(
          { success: false, error: 'Invalid authenticator code. Please try again.' },
          { status: 400 }
        );
      }
      const updateData: Record<string, any> = {};
      if (!userData['2faTotpEnabled'] || !userData['2faTotpSecret']) {
        updateData['2faTotpSecret'] = secret;
        updateData['2faTotpEnabled'] = true;
        updateData['2faTotpEnabledAt'] = admin.firestore.FieldValue.serverTimestamp();
        updateData['2faTotpPendingSecret'] = admin.firestore.FieldValue.delete();
        updateData['2faTotpPendingCreatedAt'] = admin.firestore.FieldValue.delete();
      }
      if (Object.keys(updateData).length > 0) {
        await userRef.set(updateData, { merge: true });
      }
    } else {
      const codeDoc = await adminDb.collection('2fa-codes').doc(uid).get();
      if (!codeDoc.exists) {
        return NextResponse.json(
          { success: false, error: 'No verification code found. Please request a new code.' },
          { status: 404 }
        );
      }
      const codeData = codeDoc.data() || {};
      const expiresAt = codeData.expiresAt?.toDate?.() || null;
      if (!expiresAt || expiresAt < new Date()) {
        return NextResponse.json(
          { success: false, error: 'Verification code has expired. Please request a new code.' },
          { status: 400 }
        );
      }
      if (Number(codeData.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
        return NextResponse.json(
          { success: false, error: 'Too many failed attempts. Please request a new code.' },
          { status: 429 }
        );
      }
      const submittedHash = buildCodeHash(code, String(codeData.codeSalt || ''));
      if (submittedHash !== String(codeData.codeHash || '')) {
        await codeDoc.ref.update({
          attempts: admin.firestore.FieldValue.increment(1),
        });
        return NextResponse.json(
          { success: false, error: 'Invalid verification code. Please try again.' },
          { status: 400 }
        );
      }
      await codeDoc.ref.delete();
      logContact = String(codeData.contact || email || '');
    }

    const sessionExpiry = new Date(Date.now() + TWO_FA_SESSION_MS);
    const sessionPayload = {
      '2faVerified': true,
      '2faVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
      '2faSessionExpiry': admin.firestore.Timestamp.fromDate(sessionExpiry),
      '2faPreferredMethod': preferredMethod,
      email: email || null,
    };
    // Write both uid and email-keyed docs — admin APIs accept either.
    await userRef.set(sessionPayload, { merge: true });
    if (email && email !== uid) {
      await adminDb.collection('users').doc(email).set(sessionPayload, { merge: true });
    }

    await adminDb.collection('2fa-logs').add({
      userId: uid,
      method: preferredMethod,
      contactMasked: maskContact(logContact),
      success: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      via: 'next-api',
    });

    return NextResponse.json({
      success: true,
      message: 'Two-factor authentication verified successfully',
      sessionExpiry: sessionExpiry.toISOString(),
    });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    console.warn('2fa-verify failed:', String(error?.message || error));
    return NextResponse.json(
      { success: false, error: String(error?.message || '2FA verification failed') },
      { status }
    );
  }
}
