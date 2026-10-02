import { writeChangeEvents } from '@/lib/global-change-log-server';
import type { WriteGlobalChangeLogInput } from '@/lib/global-change-log';

/** Server-only: keeps application docs' Kaiser_Status / CalAIM_Status in line with Caspio. */

const clean = (value: unknown) => String(value ?? '').trim();
const FIRESTORE_BATCH_LIMIT = 400;
const CACHE_COLLECTION = 'caspio_members_cache';
export const APPLICATION_STATUS_CHECK_SETTINGS_DOC = 'application-caspio-status-check';

export const getApplicationClientId2 = (app: Record<string, any>) =>
  clean(app.client_ID2 || app.clientId2 || app.Client_ID2 || app.caspioClientId2);

const getAppKaiserStatus = (app: Record<string, any>) => clean(app.kaiserStatus || app.Kaiser_Status);
const getAppCalAIMStatus = (app: Record<string, any>) =>
  clean(app.caspioCalAIMStatus || app.CalAIM_Status || app.calaimStatus);

export type CaspioMemberStatuses = { kaiserStatus: string; calaimStatus: string };

export type ApplicationStatusChange = {
  docPath: string;
  applicationId: string;
  clientId2: string;
  memberName: string;
  memberMrn: string;
  kaiser?: { from: string; to: string };
  calaim?: { from: string; to: string };
};

const parseDocPath = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 4 && parts[0] === 'users' && parts[2] === 'applications') {
    return { userId: parts[1], applicationId: parts[3] };
  }
  return { userId: '', applicationId: parts[parts.length - 1] || '' };
};

/**
 * Compare one application to Caspio's statuses and build the patch.
 * Empty Caspio values never wipe the application. `respectManualLock` keeps a status staff just picked.
 */
export function buildApplicationStatusPatch(params: {
  app: Record<string, any>;
  caspio: CaspioMemberStatuses;
  source: string;
  respectManualLock: boolean;
  nowMs?: number;
}): { patch: Record<string, unknown>; kaiser?: { from: string; to: string }; calaim?: { from: string; to: string } } {
  const { app, caspio, source, respectManualLock } = params;
  const nowMs = params.nowMs ?? Date.now();
  const patch: Record<string, unknown> = {};
  let kaiser: { from: string; to: string } | undefined;
  let calaim: { from: string; to: string } | undefined;

  const manualLockUntilMs = Number(app.kaiserStatusManualLockUntilMs || 0);
  const manualLockActive = respectManualLock && Number.isFinite(manualLockUntilMs) && manualLockUntilMs > nowMs;
  const currentKaiser = getAppKaiserStatus(app);
  if (caspio.kaiserStatus && caspio.kaiserStatus !== currentKaiser && !manualLockActive) {
    kaiser = { from: currentKaiser, to: caspio.kaiserStatus };
    Object.assign(patch, {
      kaiserStatus: caspio.kaiserStatus,
      Kaiser_Status: caspio.kaiserStatus,
      kaiserStatusSyncedFromCaspioAt: new Date(nowMs).toISOString(),
      kaiserStatusSyncSource: source,
    });
  }

  const currentCalAIM = getAppCalAIMStatus(app);
  if (caspio.calaimStatus && caspio.calaimStatus !== currentCalAIM) {
    calaim = { from: currentCalAIM, to: caspio.calaimStatus };
    Object.assign(patch, {
      caspioCalAIMStatus: caspio.calaimStatus,
      CalAIM_Status: caspio.calaimStatus,
      calaimStatusSyncedFromCaspioAt: new Date(nowMs).toISOString(),
      calaimStatusSyncSource: source,
    });
  }

  return { patch, kaiser, calaim };
}

export function buildStatusChangeEvents(
  changes: ApplicationStatusChange[],
  options: { source: string; staffName?: string; staffEmail?: string }
): WriteGlobalChangeLogInput[] {
  return changes.map((change) => {
    const parts = [
      change.kaiser ? `Kaiser_Status: ${change.kaiser.from || '(blank)'} → ${change.kaiser.to}` : '',
      change.calaim ? `CalAIM_Status: ${change.calaim.from || '(blank)'} → ${change.calaim.to}` : '',
    ].filter(Boolean);
    const { userId } = parseDocPath(change.docPath);
    return {
      category: 'member_status' as const,
      action: 'application_status_synced_from_caspio',
      summary: `Application status updated from Caspio — ${parts.join('; ')}`,
      memberName: change.memberName || undefined,
      memberMrn: change.memberMrn || undefined,
      clientId2: change.clientId2 || undefined,
      applicationId: change.applicationId || undefined,
      staffName: options.staffName || 'Daily Caspio status check',
      staffEmail: options.staffEmail || undefined,
      source: options.source,
      details: {
        kaiserFrom: change.kaiser?.from ?? null,
        kaiserTo: change.kaiser?.to ?? null,
        calaimFrom: change.calaim?.from ?? null,
        calaimTo: change.calaim?.to ?? null,
        docPath: change.docPath,
      },
      href: `/admin/applications/${encodeURIComponent(change.applicationId)}${
        userId ? `?userId=${encodeURIComponent(userId)}` : ''
      }`,
    };
  });
}

const memberNameOf = (app: Record<string, any>) =>
  `${clean(app.memberLastName)}, ${clean(app.memberFirstName)}`.replace(/^,\s*/, '').replace(/,\s*$/, '') ||
  clean(app.memberName);

/**
 * Daily check: every application already pushed to Caspio (caspioSent + Client_ID2) is compared with
 * `caspio_members_cache` (refreshed nightly from Caspio) and updated where Kaiser/CalAIM status differs.
 */
export async function runDailyApplicationStatusCheck(params: { adminDb: any; dryRun?: boolean }) {
  const { adminDb, dryRun = false } = params;
  const nowMs = Date.now();
  const source = 'daily_caspio_status_check';

  const appsSnap = await adminDb.collectionGroup('applications').get();
  const candidates = appsSnap.docs
    .map((doc: any) => ({ ref: doc.ref, path: String(doc.ref.path || ''), data: (doc.data() || {}) as Record<string, any> }))
    .filter((entry: any) => Boolean(entry.data.caspioSent) && getApplicationClientId2(entry.data));

  const clientIds = Array.from(new Set(candidates.map((entry: any) => getApplicationClientId2(entry.data)))) as string[];
  const cacheById = new Map<string, Record<string, any>>();
  for (let i = 0; i < clientIds.length; i += 300) {
    const refs = clientIds.slice(i, i + 300).map((id) => adminDb.collection(CACHE_COLLECTION).doc(id));
    const snaps = refs.length ? await adminDb.getAll(...refs) : [];
    snaps.forEach((snap: any) => {
      if (snap?.exists) cacheById.set(String(snap.id), snap.data() || {});
    });
  }

  const changes: ApplicationStatusChange[] = [];
  const writes: Array<{ ref: any; patch: Record<string, unknown> }> = [];
  let notInCache = 0;
  let lockedSkipped = 0;

  for (const entry of candidates) {
    const clientId2 = getApplicationClientId2(entry.data);
    const cached = cacheById.get(clientId2);
    if (!cached) {
      notInCache += 1;
      continue;
    }
    const caspio = {
      kaiserStatus: clean(cached.Kaiser_Status || cached.kaiserStatus),
      calaimStatus: clean(cached.CalAIM_Status || cached.caspioCalAIMStatus),
    };
    const result = buildApplicationStatusPatch({ app: entry.data, caspio, source, respectManualLock: true, nowMs });
    if (!result.kaiser && caspio.kaiserStatus && caspio.kaiserStatus !== getAppKaiserStatus(entry.data)) {
      lockedSkipped += 1;
    }
    if (!result.kaiser && !result.calaim) continue;
    writes.push({ ref: entry.ref, patch: result.patch });
    changes.push({
      docPath: entry.path,
      applicationId: parseDocPath(entry.path).applicationId,
      clientId2,
      memberName: memberNameOf(entry.data),
      memberMrn: clean(entry.data.memberMrn),
      kaiser: result.kaiser,
      calaim: result.calaim,
    });
  }

  if (!dryRun) {
    for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = adminDb.batch();
      writes.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach(({ ref, patch }) => batch.set(ref, patch, { merge: true }));
      await batch.commit();
    }
    await writeChangeEvents(buildStatusChangeEvents(changes, { source }), { adminDb });
  }

  const summary = {
    ranAtIso: new Date(nowMs).toISOString(),
    dryRun,
    applicationsScanned: appsSnap.size,
    applicationsChecked: candidates.length,
    notInCache,
    lockedSkipped,
    updated: changes.length,
    kaiserUpdated: changes.filter((c) => c.kaiser).length,
    calaimUpdated: changes.filter((c) => c.calaim).length,
  };
  if (!dryRun) {
    await adminDb
      .collection('admin-settings')
      .doc(APPLICATION_STATUS_CHECK_SETTINGS_DOC)
      .set({ lastRun: summary, lastChanges: changes.slice(0, 200) }, { merge: true });
  }
  return { ...summary, changes };
}

/** Live Caspio lookup for one member (used by the per-application "Check Caspio now" button). */
export async function fetchCaspioMemberStatuses(params: {
  baseUrl: string;
  token: string;
  clientId2: string;
}): Promise<(CaspioMemberStatuses & { found: true }) | { found: false }> {
  const where = /^\d+$/.test(params.clientId2)
    ? `Client_ID2=${params.clientId2}`
    : `Client_ID2='${params.clientId2.replace(/'/g, "''")}'`;
  const url =
    `${params.baseUrl}/tables/CalAIM_tbl_Members/records?q.where=${encodeURIComponent(where)}` +
    `&q.select=${encodeURIComponent('Client_ID2,Kaiser_Status,CalAIM_Status')}&q.limit=1`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${params.token}` }, cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Caspio lookup failed (HTTP ${response.status})${text ? `: ${clean(text).slice(0, 160)}` : ''}`);
  }
  const body = (await response.json().catch(() => ({}))) as any;
  const row = Array.isArray(body?.Result) ? body.Result[0] : null;
  if (!row) return { found: false };
  return { found: true, kaiserStatus: clean(row.Kaiser_Status), calaimStatus: clean(row.CalAIM_Status) };
}
