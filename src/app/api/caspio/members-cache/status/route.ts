import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const settingsSnap = await adminDb.collection('admin-settings').doc('caspio-members-sync').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;

    return NextResponse.json({
      success: true,
      settings: settings || {},
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load sync status' },
      { status: 500 }
    );
  }
}

