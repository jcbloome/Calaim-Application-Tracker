import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const recentAttempts = new Map<string, { count: number; resetAt: number }>();

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function allowAttempt(key: string, max = 30, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const current = recentAttempts.get(key);
  if (!current || current.resetAt <= now) {
    recentAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}

/**
 * Records member-portal login attempts (including failures) for staff visibility.
 * Failed attempts may arrive before Firebase Auth succeeds, so auth is optional.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const success = body?.success === true;
    const failureReason = String(body?.failureReason || '').trim().slice(0, 400);
    const portal = String(body?.portal || 'user').trim().toLowerCase() || 'user';
    const action = String(body?.action || 'login').trim().toLowerCase() || 'login';
    const displayName = String(body?.displayName || '').trim().slice(0, 160);
    let uid = String(body?.uid || '').trim();

    if (!email && !uid) {
      return NextResponse.json({ success: false, error: 'email or uid is required' }, { status: 400 });
    }

    const rateKey = `${email || uid}|${request.headers.get('x-forwarded-for') || 'local'}`;
    if (!allowAttempt(rateKey)) {
      return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = String(decoded.uid || uid || '').trim();
      } catch {
        // Optional auth — continue for failed pre-auth attempts.
      }
    }

    await adminDb.collection('loginLogs').add({
      userId: uid || `email:${email}`,
      userEmail: email || null,
      userName: displayName || email || null,
      userRole: 'User',
      role: 'User',
      action,
      portal,
      success,
      failureReason: success ? null : failureReason || 'Login failed',
      timestamp: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      userAgent: String(request.headers.get('user-agent') || '').slice(0, 500) || null,
      source: 'member-portal-login-attempt',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('log-login-attempt error:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to log login attempt') },
      { status: 500 }
    );
  }
}
