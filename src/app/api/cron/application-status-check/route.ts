import { NextRequest, NextResponse } from 'next/server';
import { runDailyApplicationStatusCheck } from '@/lib/application-caspio-status-check';
import { recordDailyUpdateRun } from '@/lib/daily-updates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const getTrigger = (request: NextRequest) =>
  request.nextUrl.searchParams.get('trigger') === 'manual' ? ('manual' as const) : ('cron' as const);

/** Daily: align application Kaiser_Status / CalAIM_Status with Caspio (via the nightly members cache). */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    if (!adminDb) {
      return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const dryRun = ['1', 'true'].includes(String(request.nextUrl.searchParams.get('dryRun') || '').toLowerCase());
    const startedAt = new Date().toISOString();
    try {
      const result = await runDailyApplicationStatusCheck({ adminDb, dryRun });
      const { changes, ...summary } = result;
      if (!dryRun) {
        const finishedAt = new Date().toISOString();
        await recordDailyUpdateRun(adminDb, 'application-status-check', {
          ok: true,
          trigger: getTrigger(request),
          startedAt,
          finishedAt,
          durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
          summary: summary as Record<string, unknown>,
        });
      }
      return NextResponse.json({ success: true, ...summary, changes: changes.slice(0, 100) });
    } catch (error: any) {
      await recordDailyUpdateRun(adminDb, 'application-status-check', {
        ok: false,
        trigger: getTrigger(request),
        startedAt,
        finishedAt: new Date().toISOString(),
        error: String(error?.message || error),
      });
      throw error;
    }
  } catch (error: any) {
    console.error('Daily application status check failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Daily application status check failed') },
      { status: 500 }
    );
  }
}
