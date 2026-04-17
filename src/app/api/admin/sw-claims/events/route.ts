import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const claimId = String(searchParams.get('claimId') || '').trim();
    const limitN = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50) || 50));
    if (!claimId) {
      return NextResponse.json({ success: false, error: 'claimId is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    // Avoid composite-index requirements; filter in memory.
    const snap = await adminDb.collection('sw_claim_events').where('claimId', '==', claimId).limit(limitN).get();
    const events = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => String(b?.createdAtIso || '').localeCompare(String(a?.createdAtIso || '')));

    return NextResponse.json({ success: true, claimId, events });
  } catch (error: any) {
    console.error('❌ Error fetching SW claim events:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch claim events' },
      { status: 500 }
    );
  }
}

