import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const visitIdsRaw = Array.isArray(body?.visitIds) ? body.visitIds : [];
    const visitIds = Array.from(
      new Set(visitIdsRaw.map((v: any) => String(v || '').trim()).filter(Boolean))
    ).slice(0, 500);
    if (visitIds.length === 0) {
      return NextResponse.json({ success: false, error: 'visitIds[] is required' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const refs = visitIds.map((id) => adminDb.collection('sw_visit_records').doc(id));
    const snaps = await adminDb.getAll(...refs);

    const visits = snaps
      .filter((s: any) => s?.exists)
      .map((s: any) => {
        const v = s.data() as any;
        return {
          id: s.id,
          visitId: String(v?.visitId || s.id || '').trim(),
          memberId: String(v?.memberId || '').trim(),
          memberName: String(v?.memberName || '').trim(),
          memberRoomNumber: String(v?.memberRoomNumber || v?.raw?.memberRoomNumber || '').trim() || null,
          rcfeId: String(v?.rcfeId || '').trim(),
          rcfeName: String(v?.rcfeName || '').trim(),
          rcfeAddress: String(v?.rcfeAddress || '').trim(),
          visitDate: String(v?.visitDate || '').trim(),
          visitMonth: String(v?.visitMonth || '').trim(),
          totalScore: Number(v?.totalScore || v?.raw?.visitSummary?.totalScore || 0) || 0,
          flagged: Boolean(v?.flagged || v?.raw?.visitSummary?.flagged),
          flagReasons: Array.isArray(v?.flagReasons) ? v.flagReasons : [],
          signedOff: Boolean(v?.signedOff),
          claimId: String(v?.claimId || '').trim() || null,
          claimStatus: String(v?.claimStatus || '').trim() || null,
          raw: v?.raw || null,
        };
      });

    return NextResponse.json({ success: true, visits });
  } catch (error: any) {
    console.error('❌ Error fetching SW visits by IDs:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}

