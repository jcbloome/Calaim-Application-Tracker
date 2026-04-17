import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const idToken = String(body?.idToken || '').trim();
    const limitRaw = Number(body?.limit);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 200;

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing idToken' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    // Prefer createdAt ordering; fall back to timestamp ordering if needed.
    let snap;
    try {
      snap = await adminDb.collection('member_activities').orderBy('createdAt', 'desc').limit(limit).get();
    } catch {
      snap = await adminDb.collection('member_activities').orderBy('timestamp', 'desc').limit(limit).get();
    }

    const activities = snap.docs.map((d: any) => {
      const data = d.data() || {};
      const createdAtIso =
        data?.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : null;
      return {
        id: d.id,
        ...data,
        createdAt: createdAtIso,
        timestamp: data?.timestamp || createdAtIso || null,
      };
    });

    return NextResponse.json({ success: true, activities });
  } catch (error: any) {
    console.error('❌ Error fetching member activities:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}

