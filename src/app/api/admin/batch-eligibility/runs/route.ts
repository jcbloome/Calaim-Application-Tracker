import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  BATCH_ELIGIBILITY_RUNS_COLLECTION,
  inferBatchEligibilityPlanFromEdiText,
  resolveBatchEligibilityRunPlan,
  type BatchEligibilityPlan,
  type BatchEligibilityRun,
} from '@/lib/batch-eligibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILES = 25;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const s = (value: unknown, max = 200) => String(value ?? '').trim().slice(0, max);

/** Correct MCP on decode runs using payer IDs inside the saved 271 (fixes tab mis-labels). */
async function withCorrectedMcp(
  run: BatchEligibilityRun,
  adminDb: { collection: (name: string) => { doc: (id: string) => { set: (data: any, opts: any) => Promise<unknown> } } }
): Promise<BatchEligibilityRun> {
  if (run.kind !== 'decode') return { ...run, plan: resolveBatchEligibilityRunPlan(run) };
  if (run.summary?.detectedPlan === 'kaiser' || run.summary?.detectedPlan === 'healthnet') {
    const plan = resolveBatchEligibilityRunPlan(run);
    return plan === run.plan ? run : { ...run, plan };
  }
  const file = run.files?.[0];
  if (!file?.storagePath) return run;
  try {
    const [bytes] = await adminStorage.bucket().file(file.storagePath).download({ start: 0, end: 200_000 });
    const detected = inferBatchEligibilityPlanFromEdiText(bytes.toString('utf8'));
    if (!detected) return run;
    const summary = { ...(run.summary || {}), detectedPlan: detected, mcp: detected };
    if (detected !== run.plan || run.summary?.detectedPlan !== detected) {
      await adminDb.collection(BATCH_ELIGIBILITY_RUNS_COLLECTION).doc(run.id).set(
        { plan: detected, summary },
        { merge: true }
      );
    }
    return { ...run, plan: detected, summary };
  } catch {
    return run;
  }
}

/** Batch eligibility log: batch CSVs created and 271 result files decoded. */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  try {
    const plan = s(req.nextUrl.searchParams.get('plan')).toLowerCase();
    const limitRaw = Number(req.nextUrl.searchParams.get('limit') || 300);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.floor(limitRaw)), 300) : 300;
    // Fetch extra when filtering by plan so a small limit still yields enough matches.
    const fetchLimit = plan ? Math.min(300, Math.max(limit * 5, limit)) : limit;
    const snap = await adminCheck.adminDb
      .collection(BATCH_ELIGIBILITY_RUNS_COLLECTION)
      .orderBy('createdAtIso', 'desc')
      .limit(fetchLimit)
      .get();
    const rawRuns = (snap.docs as Array<{ id: string; data: () => any }>).map(
      (doc) => ({ id: doc.id, ...doc.data() }) as BatchEligibilityRun
    );
    // Newest-first order preserved; correct MCP from payer IDs when needed.
    const corrected: BatchEligibilityRun[] = [];
    for (const run of rawRuns) {
      corrected.push(await withCorrectedMcp(run, adminCheck.adminDb));
    }
    const runs = corrected
      .filter((run) => !plan || resolveBatchEligibilityRunPlan(run) === (plan as BatchEligibilityPlan))
      .slice(0, limit);
    return NextResponse.json({ success: true, runs });
  } catch (error: any) {
    console.error('[batch-eligibility/runs] GET failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load log' }, { status: 500 });
  }
}

/** Save a run. Multipart: kind, plan, list, summary (JSON), files[]. */
export async function POST(req: NextRequest) {
  const adminCheck = await requireAdminApiAuth(req);
  if (!adminCheck.ok) {
    return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
  }
  try {
    const form = await req.formData();
    const kind = s(form.get('kind'));
    const plan = s(form.get('plan')).toLowerCase();
    if (kind !== 'batch' && kind !== 'decode') {
      return NextResponse.json({ success: false, error: 'kind must be batch or decode' }, { status: 400 });
    }
    if (plan !== 'healthnet' && plan !== 'kaiser') {
      return NextResponse.json({ success: false, error: 'Unknown plan' }, { status: 400 });
    }
    const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f);
    if (!files.length) return NextResponse.json({ success: false, error: 'No files' }, { status: 400 });
    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: `At most ${MAX_FILES} files per run` }, { status: 400 });
    }
    let summary: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(form.get('summary') || '{}'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) summary = parsed;
    } catch {
      summary = {};
    }

    const docRef = adminCheck.adminDb.collection(BATCH_ELIGIBILITY_RUNS_COLLECTION).doc();
    const bucket = adminStorage.bucket();
    const savedFiles: BatchEligibilityRun['files'] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ success: false, error: `${file.name} is larger than 25 MB` }, { status: 400 });
      }
      const name = s(file.name, 150) || `file-${i + 1}`;
      const safeName = name.replace(/[^A-Za-z0-9._ -]+/g, '_');
      const storagePath = `batch-eligibility/${plan}/${docRef.id}/${i + 1}-${safeName}`;
      await bucket.file(storagePath).save(Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'text/plain',
        resumable: false,
      });
      savedFiles.push({ name, storagePath, size: file.size });
    }

    const run: Omit<BatchEligibilityRun, 'id'> = {
      kind,
      plan,
      list: s(form.get('list'), 60),
      createdAtIso: new Date().toISOString(),
      createdByEmail: adminCheck.email || '',
      createdByName: adminCheck.name || '',
      summary: JSON.parse(JSON.stringify(summary)),
      files: savedFiles,
    };
    await docRef.set(run);
    return NextResponse.json({ success: true, run: { id: docRef.id, ...run } });
  } catch (error: any) {
    console.error('[batch-eligibility/runs] POST failed', error);
    return NextResponse.json({ success: false, error: error?.message || 'Save failed' }, { status: 500 });
  }
}
