import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_VERIFY_ATTEMPTS = 3;

function toDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizePreferredMethod(value: unknown): 'email' | 'sms' | 'totp' {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'sms' || method === 'totp') return method;
  return 'email';
}

/**
 * Local 2FA status check (mirrors Cloud Function check2FAStatus).
 * Avoids Firebase callable CORS/status-0 failures from localhost.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;
    const admin = adminModule.default;

    let decoded: any;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid or expired auth token' }, { status: 401 });
    }

    const uid = String(decoded?.uid || '').trim();
    const emailFromToken = String(decoded?.email || '').trim();
    if (!uid) {
      return NextResponse.json({ success: false, error: 'Invalid token payload' }, { status: 401 });
    }

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? ((userDoc.data() || {}) as Record<string, any>) : {};
    if (!userDoc.exists) {
      await userRef.set(
        {
          email: emailFromToken || null,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const now = new Date();
    const sessionExpiry = toDate(userData['2faSessionExpiry']);
    const isVerified = Boolean(userData['2faVerified']) && Boolean(sessionExpiry && sessionExpiry > now);

    const codeSnap = await adminDb.collection('2fa-codes').doc(uid).get();
    const codeData = (codeSnap.exists ? codeSnap.data() : null) as Record<string, any> | null;
    const pendingExpiry = toDate(codeData?.expiresAt);
    const pendingMethod = String(codeData?.method || '')
      .trim()
      .toLowerCase();
    const pendingCode =
      Boolean(codeData) &&
      pendingMethod !== 'totp' &&
      !Boolean(codeData?.verified) &&
      Boolean(pendingExpiry && pendingExpiry > now) &&
      Number(codeData?.attempts || 0) < MAX_VERIFY_ATTEMPTS;

    return NextResponse.json({
      success: true,
      isVerified: !!isVerified,
      sessionExpiry: sessionExpiry?.toISOString(),
      requiresVerification: !isVerified,
      pendingCode,
      pendingCodeExpiresAt: pendingExpiry?.toISOString() || null,
      preferredMethod: normalizePreferredMethod(userData['2faPreferredMethod'] || 'email'),
      totpEnabled: Boolean(userData['2faTotpEnabled']),
      email: String(userData.email || emailFromToken || '').trim(),
      phone: userData.phone || null,
    });
  } catch (error: any) {
    console.warn('2fa-status route failed:', String(error?.message || error));
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to check 2FA status') },
      { status: 500 }
    );
  }
}
