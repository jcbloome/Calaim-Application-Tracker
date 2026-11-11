import { NextRequest, NextResponse } from 'next/server';
import {
  generateTotpSecret,
  TOTP_DIGITS,
  TOTP_TIME_STEP_SECONDS,
  verifyBearerUser,
} from '@/lib/server-2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin TOTP setup (mirrors Cloud Function setup2FATOTP).
 * Avoids Firebase callable CORS / status-0 failures from the browser.
 */
export async function POST(request: NextRequest) {
  try {
    const { uid, email, adminDb, admin } = await verifyBearerUser(request);
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? ((userSnap.data() || {}) as Record<string, unknown>) : {};

    const alreadyEnabled =
      Boolean(userData['2faTotpEnabled']) && Boolean(String(userData['2faTotpSecret'] || '').trim());
    let secret = String(userData['2faTotpPendingSecret'] || '').trim();
    if (alreadyEnabled) {
      secret = String(userData['2faTotpSecret'] || '').trim();
    }
    if (!secret) {
      secret = generateTotpSecret();
      await userRef.set(
        {
          '2faTotpPendingSecret': secret,
          '2faTotpPendingCreatedAt': admin.firestore.FieldValue.serverTimestamp(),
          '2faPreferredMethod': 'totp',
        },
        { merge: true }
      );
    }

    const accountLabel = email || uid;
    const issuer = 'CalAIM Tracker';
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_TIME_STEP_SECONDS}`;

    return NextResponse.json({
      success: true,
      secret,
      otpauthUrl,
      alreadyEnabled,
      issuer,
      accountLabel,
    });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to initialize authenticator setup') },
      { status }
    );
  }
}
