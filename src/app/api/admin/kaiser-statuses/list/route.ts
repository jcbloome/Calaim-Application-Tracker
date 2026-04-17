import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const snap = await adminDb.collection('admin-settings').doc('kaiser-statuses').get();
    const data = snap.exists ? (snap.data() as any) : null;
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    const updatedAtRaw = data?.updatedAt;
    const updatedAtIso =
      updatedAtRaw && typeof updatedAtRaw?.toDate === 'function'
        ? updatedAtRaw.toDate().toISOString()
        : typeof updatedAtRaw === 'string'
          ? updatedAtRaw
          : null;

    return NextResponse.json(
      {
        success: true,
        rows,
        updatedAt: updatedAtIso,
        updatedByEmail: data?.updatedByEmail || null,
        source: data?.source || (rows.length > 0 ? 'firestore' : 'none'),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('❌ Error listing Kaiser statuses:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to list Kaiser statuses' },
      { status: 500 }
    );
  }
}

