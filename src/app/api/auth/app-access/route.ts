import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const snap = await adminDb.collection('system_settings').doc('app_access').get();
    const enabled = snap.exists ? Boolean((snap.data() as any)?.enabled ?? true) : true;
    const message = snap.exists ? String((snap.data() as any)?.message || '').trim() : '';
    return NextResponse.json({ success: true, enabled, message: message || null });
  } catch (e: any) {
    // Fail-open if the setting can't be read.
    return NextResponse.json({ success: true, enabled: true, message: null });
  }
}

