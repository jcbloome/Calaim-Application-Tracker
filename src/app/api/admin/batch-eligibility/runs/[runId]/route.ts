import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { BATCH_ELIGIBILITY_RUNS_COLLECTION, type BatchEligibilityRun } from '@/lib/batch-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A logged run, or one of its saved files with ?file=<index>. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  const { runId } = await params;
  try {
    const snap = await adminCheck.adminDb.collection(BATCH_ELIGIBILITY_RUNS_COLLECTION).doc(String(runId)).get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'Run not found' }, { status: 404 });
    const run = { id: snap.id, ...snap.data() } as BatchEligibilityRun;

    const fileParam = req.nextUrl.searchParams.get('file');
    if (fileParam === null) return NextResponse.json({ success: true, run });

    const file = run.files?.[Number(fileParam)];
    if (!file) return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    const [bytes] = await adminStorage.bucket().file(file.storagePath).download();
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': file.name.toLowerCase().endsWith('.csv') ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${file.name.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[batch-eligibility/runs/:id] GET failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load run' }, { status: 500 });
  }
}
