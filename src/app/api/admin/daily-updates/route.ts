import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { DAILY_UPDATE_JOBS, DAILY_UPDATE_RUNS_COLLECTION, getDailyUpdateJob } from '@/lib/daily-updates';
import { GET as runKaiserCacheRefresh } from '@/app/api/cron/kaiser-morning-notes-sync/route';
import { GET as runApplicationStatusCheck } from '@/app/api/cron/application-status-check/route';
import { POST as runMembersCacheSync } from '@/app/api/caspio/members-cache/sync/route';
import { POST as runSocialWorkersCacheSync } from '@/app/api/caspio/social-workers-cache/sync/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const clean = (value: unknown) => String(value ?? '').trim();

function legacyMembersCacheRun(settings: any) {
  const finishedAt = clean(settings?.lastRunAt);
  if (!finishedAt) return null;
  return {
    ok: true,
    trigger: clean(settings?.lastRunTrigger) === 'cron' || settings?.lastAutoSyncAt === finishedAt ? 'cron' : 'manual',
    finishedAt,
    summary: { mode: settings?.lastMode || null, ...(settings?.lastRunSummary || {}) },
  };
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

  try {
    const adminDb = authz.adminDb;
    const [runSnaps, membersSettingsSnap] = await Promise.all([
      adminDb.getAll(...DAILY_UPDATE_JOBS.map((job) => adminDb.collection(DAILY_UPDATE_RUNS_COLLECTION).doc(job.id))),
      adminDb.collection('admin-settings').doc('caspio-members-sync').get(),
    ]);
    const runsById = new Map<string, any>();
    runSnaps.forEach((snap: any) => {
      if (snap.exists) runsById.set(snap.id, snap.data());
    });

    const jobs = DAILY_UPDATE_JOBS.map((job) => {
      const runDoc = runsById.get(job.id) || null;
      let lastRun = runDoc?.lastRun || null;
      if (!lastRun && job.legacySettingsDocId === 'caspio-members-sync') {
        lastRun = legacyMembersCacheRun(membersSettingsSnap.exists ? membersSettingsSnap.data() : null);
      }
      return {
        ...job,
        lastRun,
        lastSuccessAt: runDoc?.lastSuccessAt || null,
        lastFailureAt: runDoc?.lastFailureAt || null,
        currentRun: runDoc?.currentRun || null,
      };
    });

    return NextResponse.json({ success: true, jobs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load daily updates') },
      { status: 500 }
    );
  }
}

/** Run a job now. Batched jobs return nextOffset; the page keeps calling until it is null. */
export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

  const body = (await request.json().catch(() => ({}))) as { jobId?: string; offset?: number };
  const job = getDailyUpdateJob(clean(body.jobId));
  if (!job || !job.canRunNow) {
    return NextResponse.json({ success: false, error: 'This job cannot be run from here.' }, { status: 400 });
  }

  // Cron routes accept the CRON_SECRET; without it configured they fall back to their own (open/admin) checks.
  const authorization = process.env.CRON_SECRET
    ? `Bearer ${process.env.CRON_SECRET}`
    : clean(request.headers.get('authorization'));
  const offset = Math.max(0, Number.parseInt(String(body.offset ?? 0), 10) || 0);

  const buildRequest = (path: string, init?: { method?: string; json?: unknown }) =>
    new NextRequest(
      new Request(new URL(path, request.url), {
        method: init?.method || 'GET',
        headers: { authorization, 'content-type': 'application/json' },
        body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
      })
    );

  try {
    let response: Response;
    switch (job.id) {
      case 'kaiser-cache-refresh':
        response = await runKaiserCacheRefresh(
          buildRequest(`/api/cron/kaiser-morning-notes-sync?offset=${offset}&limit=100&trigger=manual`)
        );
        break;
      case 'application-status-check':
        response = await runApplicationStatusCheck(buildRequest('/api/cron/application-status-check?trigger=manual'));
        break;
      case 'members-cache-incremental':
        response = await runMembersCacheSync(
          buildRequest('/api/caspio/members-cache/sync', { method: 'POST', json: { mode: 'incremental' } })
        );
        break;
      case 'social-workers-cache':
        response = await runSocialWorkersCacheSync(
          buildRequest('/api/caspio/social-workers-cache/sync', { method: 'POST', json: { mode: 'full' } })
        );
        break;
      default:
        return NextResponse.json({ success: false, error: 'Unknown job.' }, { status: 400 });
    }

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      return NextResponse.json(
        { success: false, error: clean(payload?.error) || `Job failed (HTTP ${response.status})` },
        { status: 502 }
      );
    }
    const { changes: _changes, memberCacheSync: _memberCacheSync, ...summary } = payload || {};
    return NextResponse.json({
      success: true,
      jobId: job.id,
      nextOffset: job.batched ? (payload?.nextOffset ?? null) : null,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || 'Job failed') }, { status: 500 });
  }
}
