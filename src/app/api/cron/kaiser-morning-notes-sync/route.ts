import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/firebase-admin';
import { POST as runMembersCacheSync } from '@/app/api/caspio/members-cache/sync/route';
import { GET as runMemberNotesRoute } from '@/app/api/member-notes/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
 *   - syncMembersFirst=1|0 (default 1)
 *   - concurrency=1..12 (default 6)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const concurrency = parseConcurrency(request);
    const syncMembersFirst = shouldSyncMembersFirst(request);

    let membersSyncPayload: any = null;
    if (syncMembersFirst) {
      const membersSync = await runIncrementalMembersSync(request);
      membersSyncPayload = membersSync.payload;
      if (!membersSync.ok) {
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
    const clientIds = members.map((member) => member.clientId2);

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

    return NextResponse.json({
      success: true,
      triggeredBy: 'cron-kaiser-morning-notes-sync',
      syncMembersFirst,
      concurrency,
      memberCacheSync: membersSyncPayload,
      kaiserMembersInCache: clientIds.length,
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
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to run Kaiser morning notes sync',
      },
      { status: 500 }
    );
  }
}
