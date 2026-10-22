import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerUser } from '@/lib/server-2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { uid, adminDb } = await verifyBearerUser(request);
    const body = await request.json().catch(() => ({}));
    const preferredMethod = String(body?.preferredMethod || 'email').trim().toLowerCase();
    if (preferredMethod !== 'email' && preferredMethod !== 'totp') {
      return NextResponse.json({ success: false, error: 'Invalid preferred method' }, { status: 400 });
    }

    await adminDb.collection('users').doc(uid).set(
      {
        '2faPreferredMethod': preferredMethod,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to update preferences') },
      { status }
    );
  }
}
