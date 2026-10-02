import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { POST as runMembersCacheSync } from '@/app/api/caspio/members-cache/sync/route';
import { GET as runMemberNotesRoute } from '@/app/api/member-notes/route';
import { FieldValue } from 'firebase-admin/firestore';
import { DAILY_UPDATE_RUNS_COLLECTION, recordDailyUpdateRun } from '@/lib/daily-updates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOB_ID = 'kaiser-cache-refresh';

type NotesSyncResult = {
  clientId2: string;
  success: boolean;
  count: number;
  newNotesCount: number;
  existingNotesCount: number;
  syncLastAt: string;
  error?: string;
};

function parseConcurrency(request: NextRequest): number {
  const raw = String(request.nextUrl.searchParams.get('concurrency') || '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 6;
  return Math.min(Math.max(parsed, 1), 12);
}

function parseNonNegativeInt(request: NextRequest, key: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(request.nextUrl.searchParams.get(key) || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function shouldSyncMembersFirst(request: NextRequest): boolean {
  const raw = String(request.nextUrl.searchParams.get('syncMembersFirst') || '1')
    .trim()
    .toLowerCase();
  return !['0', 'false', 'no'].includes(raw);
}

async function runIncrementalMembersSync(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const proxyRequest = new NextRequest(
    new Request(new URL('/api/caspio/members-cache/sync', request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader,
      },
      body: JSON.stringify({ mode: 'incremental', mcoFilter: ['Kaiser'] }),
    })
  );
  const response = await runMembersCacheSync(proxyRequest);
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok && payload?.success !== false, status: response.status, payload };
}

async function runMemberNotesSync(request: NextRequest, clientId2: string): Promise<NotesSyncResult> {
  const notesReq = new NextRequest(
    new Request(
      new URL(
        `/api/member-notes?clientId2=${encodeURIComponent(clientId2)}&forceSync=false&skipSync=false&repairIfEmpty=true`,
        request.url
      ),
      { method: 'GET' }
    )
  );
  const res = await runMemberNotesRoute(notesReq);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    return {
      clientId2,
      success: false,
      count: 0,
      newNotesCount: 0,
      existingNotesCount: 0,
      syncLastAt: '',
      error: String(payload?.error || `HTTP ${res.status}`),
    };
  }
  return {
    clientId2,
    success: true,
    count: Number(payload?.count || 0),
    newNotesCount: Number(payload?.newNotesCount || 0),
    existingNotesCount: Number(payload?.existingNotesCount || 0),
    syncLastAt: String(payload?.syncLastAt || ''),
  };
}

/**
 * Secure cron endpoint for daily Kaiser note sync.
 *
 * Auth:
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Query params:
 *   - syncMembersFirst=1|0 (default 1; only applies to the first batch, offset=0)
 *   - concurrency=1..12 (default 6)
 *   - offset / limit (default 0 / 150): requests time out at 300s, so callers loop until nextOffset is null
 *   - trigger=manual (set by the admin daily-updates page)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const offset = parseNonNegativeInt(request, 'offset', 0, 100000);
  const limit = Math.max(1, parseNonNegativeInt(request, 'limit', 150, 500));
  const trigger = request.nextUrl.searchParams.get('trigger') === 'manual' ? 'manual' : 'cron';
  const runRef = adminDb.collection(DAILY_UPDATE_RUNS_COLLECTION).doc(JOB_ID);

  try {
    const concurrency = parseConcurrency(request);
    const syncMembersFirst = offset === 0 && shouldSyncMembersFirst(request);

    if (offset === 0) {
      await runRef.set(
        {
          jobId: JOB_ID,
          currentRun: {
            startedAt: new Date().toISOString(),
            trigger,
            syncedMembers: 0,
            failedMembers: 0,
            totalNewNotes: 0,
            membersCache: null,
          },
        },
        { merge: true }
      );
    }

    let membersSyncPayload: any = null;
    if (syncMembersFirst) {
      const membersSync = await runIncrementalMembersSync(request);
      membersSyncPayload = membersSync.payload;
      if (!membersSync.ok) {
        await recordDailyUpdateRun(adminDb, JOB_ID, {
          ok: false,
          trigger,
          finishedAt: new Date().toISOString(),
          error: `Kaiser members cache sync failed: ${String(membersSync.payload?.error || `HTTP ${membersSync.status}`)}`,
        });
        return NextResponse.json(
          {
            success: false,
            stage: 'members-cache-sync',
            error: String(membersSync.payload?.error || 'Members cache sync failed'),
            membersSyncStatus: membersSync.status,
            membersSyncPayload: membersSync.payload,
          },
          { status: 502 }
        );
      }
      await runRef.set(
        {
          currentRun: {
            membersCache: {
              fetched: Number(membersSyncPayload?.fetched || 0),
              upserted: Number(membersSyncPayload?.upserted || 0),
              appKaiserStatusUpdated: Number(membersSyncPayload?.appKaiserStatusUpdated || 0),
              appCalAIMStatusUpdated: Number(membersSyncPayload?.appCalAIMStatusUpdated || 0),
            },
          },
        },
        { merge: true }
      );
    }

    const snapshot = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_MCO', '==', 'Kaiser')
      .limit(5000)
      .get();
    const members = snapshot.docs
      .map((doc) => {
        const data = doc.data() || {};
        const clientId2 = String(data?.Client_ID2 || data?.client_ID2 || doc.id || '').trim();
        if (!clientId2) return null;
        return { clientId2 };
      })
      .filter(Boolean) as Array<{ clientId2: string }>;
    const allClientIds = Array.from(new Set(members.map((member) => member.clientId2))).sort();
    const clientIds = allClientIds.slice(offset, offset + limit);
    const nextOffset = offset + limit < allClientIds.length ? offset + limit : null;

    let syncedMembers = 0;
    let failedMembers = 0;
    let totalNotes = 0;
    let totalNewNotes = 0;
    let totalExistingNotes = 0;
    const errors: Array<{ clientId2: string; error: string }> = [];

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= clientIds.length) return;
        const clientId2 = clientIds[idx];
        const result = await runMemberNotesSync(request, clientId2);
        if (result.success) {
          syncedMembers += 1;
          totalNotes += result.count;
          totalNewNotes += result.newNotesCount;
          totalExistingNotes += result.existingNotesCount;
        } else {
          failedMembers += 1;
          if (errors.length < 25) {
            errors.push({
              clientId2,
              error: String(result.error || 'Unknown notes sync error'),
            });
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, clientIds.length || 1) }, () => worker()));

    await runRef.set(
      {
        currentRun: {
          syncedMembers: FieldValue.increment(syncedMembers),
          failedMembers: FieldValue.increment(failedMembers),
          totalNewNotes: FieldValue.increment(totalNewNotes),
          lastBatchAt: new Date().toISOString(),
          processedThrough: offset + clientIds.length,
          kaiserMembersInCache: allClientIds.length,
        },
      },
      { merge: true }
    );

    if (nextOffset === null) {
      const current = ((await runRef.get()).data() || {}).currentRun || {};
      const startedAt = String(current.startedAt || '');
      const finishedAt = new Date().toISOString();
      await recordDailyUpdateRun(adminDb, JOB_ID, {
        ok: Number(current.failedMembers || 0) === 0 || Number(current.syncedMembers || 0) > 0,
        trigger: current.trigger === 'manual' ? 'manual' : trigger,
        startedAt: startedAt || undefined,
        finishedAt,
        durationMs: startedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : undefined,
        summary: {
          kaiserMembersInCache: allClientIds.length,
          membersCache: current.membersCache || null,
          notesSyncedMembers: Number(current.syncedMembers || 0),
          notesFailedMembers: Number(current.failedMembers || 0),
          newNotes: Number(current.totalNewNotes || 0),
        },
      });
    }

    return NextResponse.json({
      success: true,
      triggeredBy: 'cron-kaiser-morning-notes-sync',
      syncMembersFirst,
      concurrency,
      offset,
      limit,
      nextOffset,
      memberCacheSync: membersSyncPayload,
      kaiserMembersInCache: allClientIds.length,
      batchMembers: clientIds.length,
      notesSync: {
        syncedMembers,
        failedMembers,
        totalNotes,
        totalNewNotes,
        totalExistingNotes,
        errorSample: errors,
      },
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    await recordDailyUpdateRun(adminDb, JOB_ID, {
      ok: false,
      trigger,
      finishedAt: new Date().toISOString(),
      error: `Batch at offset ${offset}: ${String(error?.message || error)}`,
    });
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to run Kaiser morning notes sync',
      },
      { status: 500 }
    );
  }
}
