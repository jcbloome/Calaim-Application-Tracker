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

type NoActionMetaResult = {
  clientId2: string;
  success: boolean;
  lastAssignedStaffActionAt: string;
  error?: string;
};

type DailySnapshotByStaff = Record<string, { critical: number; priority: number }>;

const ET_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const normalize = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getEtDayKey = (value: Date) => ET_DATE_FMT.format(value);

const getAssignedStaffName = (member: any) =>
  String(
    member?.Kaiser_Staff_Assignment ||
      member?.Staff_Assigned ||
      member?.Kaiser_User_Assignment ||
      member?.Staff_Assignment ||
      member?.Assigned_Staff ||
      ''
  ).trim();

const getMemberStatus = (member: any) => String(member?.Kaiser_Status || member?.Kaiser_ID_Status || '').trim();

const isNoActionStatusInScope = (status: string) => {
  const normalized = normalize(status);
  const scoped = new Set([
    normalize('T2038 received, Need First Contact'),
    normalize('T2038 received, Needs First Contact'),
    normalize('T2038 received, doc collection'),
    normalize('RCFE Needed'),
    normalize('R&B Needed'),
    normalize('R B Needed'),
  ]);
  return scoped.has(normalized);
};

const getPriorityBucket = (status: string): 'critical' | 'priority' | 'other' => {
  const normalized = normalize(status);
  const isCritical =
    normalized === 't2038 received' ||
    normalized === 'received t2038' ||
    normalized === 't2038 received need first contact' ||
    normalized === 't2038 received needs first contact' ||
    normalized.includes('need first contact');
  if (isCritical) return 'critical';
  const isPriority =
    normalized === 't2038 received doc collection' ||
    normalized.includes('doc collection') ||
    normalized === 'rcfe needed' ||
    normalized === 'r b needed' ||
    normalized === 'r&b needed';
  if (isPriority) return 'priority';
  return 'other';
};

const isNoActionForWeek = (lastAssignedStaffActionAt: string) => {
  const raw = String(lastAssignedStaffActionAt || '').trim();
  if (!raw) return true;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() - parsed.getTime() >= 7 * 24 * 60 * 60 * 1000;
};

function parseMode(request: NextRequest): 'full' | 'incremental' {
  const mode = String(request.nextUrl.searchParams.get('mode') || 'full')
    .trim()
    .toLowerCase();
  return mode === 'incremental' ? 'incremental' : 'full';
}

async function runFullMembersSync(request: NextRequest, mode: 'full' | 'incremental') {
  const authHeader = request.headers.get('authorization') || '';
  const proxyRequest = new NextRequest(
    new Request(new URL('/api/caspio/members-cache/sync', request.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authHeader,
      },
      body: JSON.stringify({ mode }),
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

async function runNoActionMetaForMember(
  request: NextRequest,
  clientId2: string,
  assignedStaff: string
): Promise<NoActionMetaResult> {
  const query = new URLSearchParams({
    clientId2,
    skipSync: 'true',
    metaOnly: 'true',
  });
  if (assignedStaff) query.set('assignedStaff', assignedStaff);

  const notesReq = new NextRequest(
    new Request(new URL(`/api/member-notes?${query.toString()}`, request.url), { method: 'GET' })
  );
  const res = await runMemberNotesRoute(notesReq);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.success === false) {
    return {
      clientId2,
      success: false,
      lastAssignedStaffActionAt: '',
      error: String(payload?.error || `HTTP ${res.status}`),
    };
  }
  return {
    clientId2,
    success: true,
    lastAssignedStaffActionAt: String(payload?.lastAssignedStaffActionAt || ''),
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const mode = parseMode(request);
    const membersSync = await runFullMembersSync(request, mode);
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
        return { clientId2, data };
      })
      .filter(Boolean) as Array<{ clientId2: string; data: any }>;
    const clientIds = members.map((member) => member.clientId2);

    let syncedMembers = 0;
    let failedMembers = 0;
    let totalNotes = 0;
    let totalNewNotes = 0;
    let totalExistingNotes = 0;
    const errors: Array<{ clientId2: string; error: string }> = [];

    const concurrency = 6;
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

    const scopedMembers = members.filter((member) => isNoActionStatusInScope(getMemberStatus(member.data)));
    let noActionCritical = 0;
    let noActionPriority = 0;
    const noActionByStaff: DailySnapshotByStaff = {};
    const noActionErrors: Array<{ clientId2: string; error: string }> = [];

    let scopedCursor = 0;
    const scopedWorker = async () => {
      while (true) {
        const idx = scopedCursor;
        scopedCursor += 1;
        if (idx >= scopedMembers.length) return;
        const scoped = scopedMembers[idx];
        const assignedStaff = getAssignedStaffName(scoped.data) || 'Unassigned';
        const status = getMemberStatus(scoped.data);
        const bucket = getPriorityBucket(status);
        if (bucket === 'other') continue;

        const meta = await runNoActionMetaForMember(request, scoped.clientId2, assignedStaff);
        if (!meta.success) {
          if (noActionErrors.length < 25) {
            noActionErrors.push({
              clientId2: scoped.clientId2,
              error: String(meta.error || 'No-action meta sync failed'),
            });
          }
          continue;
        }
        if (!isNoActionForWeek(meta.lastAssignedStaffActionAt)) continue;

        if (!noActionByStaff[assignedStaff]) {
          noActionByStaff[assignedStaff] = { critical: 0, priority: 0 };
        }
        if (bucket === 'critical') {
          noActionCritical += 1;
          noActionByStaff[assignedStaff].critical += 1;
        } else if (bucket === 'priority') {
          noActionPriority += 1;
          noActionByStaff[assignedStaff].priority += 1;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, scopedMembers.length || 1) }, () => scopedWorker()));

    const dayKey = getEtDayKey(new Date());
    const capturedAt = new Date().toISOString();
    await adminDb
      .collection('admin-settings')
      .doc('kaiser-no-action-daily-snapshot')
      .set(
        {
          dayKey,
          start: {
            critical: noActionCritical,
            priority: noActionPriority,
            capturedAt,
            byStaff: noActionByStaff,
          },
          updatedAt: capturedAt,
          source: 'cron-kaiser-midnight-preload',
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      triggeredBy: 'cron-kaiser-midnight-preload',
      mode,
      memberCacheSync: membersSync.payload,
      kaiserMembersInCache: clientIds.length,
      notesSync: {
        syncedMembers,
        failedMembers,
        totalNotes,
        totalNewNotes,
        totalExistingNotes,
        errorSample: errors,
      },
      dailyNoActionSnapshot: {
        dayKey,
        start: {
          critical: noActionCritical,
          priority: noActionPriority,
          capturedAt,
          byStaff: noActionByStaff,
        },
        scopedMembersEvaluated: scopedMembers.length,
        errorSample: noActionErrors,
      },
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to run Kaiser midnight preload',
      },
      { status: 500 }
    );
  }
}
