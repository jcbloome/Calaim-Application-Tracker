import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const KAISER_SDS_CLAIM_RUNS_COLLECTION = 'kaiser_sds_claim_runs';

/** Log a downloaded Kaiser SDS 837P batch for audit. */
export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const memberCount = Number(body.memberCount) || 0;
    const serviceDate = String(body.serviceDate || '').trim();
    const skippedCount = Number(body.skippedCount) || 0;
    const fileName = String(body.fileName || '').trim().slice(0, 200);
    const clientIds = Array.isArray(body.clientIds)
      ? body.clientIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 2000)
      : [];

    const { adminDb } = await import('@/firebase-admin');
    const docRef = adminDb.collection(KAISER_SDS_CLAIM_RUNS_COLLECTION).doc();
    const run = {
      kind: '837p_download',
      plan: 'kaiser',
      procedure: 'T2038',
      createdAtIso: new Date().toISOString(),
      createdByEmail: authz.email || '',
      createdByName: authz.name || '',
      memberCount,
      skippedCount,
      serviceDate,
      fileName,
      clientIds,
      summary: {
        memberCount,
        skippedCount,
        serviceDate,
        fileName,
      },
    };
    await docRef.set(run);
    return NextResponse.json({ success: true, run: { id: docRef.id, ...run } });
  } catch (error: any) {
    console.error('[kaiser-sds-claims/runs POST]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to log SDS claim run.') },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 25));
    const { adminDb } = await import('@/firebase-admin');
    const snap = await adminDb
      .collection(KAISER_SDS_CLAIM_RUNS_COLLECTION)
      .orderBy('createdAtIso', 'desc')
      .limit(limit)
      .get();
    const runs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    console.error('[kaiser-sds-claims/runs GET]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load SDS claim runs.') },
      { status: 500 }
    );
  }
}
