import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const { searchParams } = new URL(req.url);
    const status = String(searchParams.get('status') || 'pending').trim().toLowerCase();

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const snap = await adminDb.collection('sw_claim_override_requests').where('status', '==', status).limit(200).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    rows.sort((a, b) => String(b?.createdAtIso || '').localeCompare(String(a?.createdAtIso || '')));

    return NextResponse.json({ success: true, status, requests: rows });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to load override requests' }, { status: 500 });
  }
}

