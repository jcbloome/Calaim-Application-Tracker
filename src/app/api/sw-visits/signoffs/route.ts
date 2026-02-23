import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clampDays = (value: string | null, fallback = 30) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), 365);
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = clampDays(searchParams.get('days'), 30);

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);

    const snap = await adminDb
      .collection('sw_signoff_records')
      .where('createdAt', '>=', cutoffTs)
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    const signoffs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, signoffs, days });
  } catch (error: any) {
    console.error('❌ Error fetching SW sign-off records:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch sign-off records' },
      { status: 500 }
    );
  }
}

