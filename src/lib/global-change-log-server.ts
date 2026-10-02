import {
  GLOBAL_CHANGE_LOG_COLLECTION,
  buildGlobalChangeMemberKeys,
  toGlobalChangeIso,
  type GlobalChangeEvent,
  type WriteGlobalChangeLogInput,
} from '@/lib/global-change-log';
import { toChangeEventInput } from '@/lib/global-change-log-mappers';

const clean = (value: unknown) => String(value ?? '').trim();

type AdminDbLike = {
  collection: (name: string) => {
    add: (data: Record<string, unknown>) => Promise<{ id: string }>;
    doc: () => { id: string };
  };
  batch?: () => {
    set: (ref: unknown, data: Record<string, unknown>) => unknown;
    commit: () => Promise<unknown>;
  };
};

const stripUndefined = (value: Record<string, unknown> | undefined | null) => {
  if (!value || typeof value !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
};

async function resolveAdmin(adminDb?: AdminDbLike) {
  const adminModule = await import('@/firebase-admin');
  return {
    db: (adminDb || adminModule.adminDb) as AdminDbLike,
    serverTimestamp: adminModule.default.firestore.FieldValue.serverTimestamp(),
  };
}

function buildDoc(input: WriteGlobalChangeLogInput, serverTimestamp: unknown): Record<string, unknown> {
  const atIso = toGlobalChangeIso(input.atIso) || new Date().toISOString();
  return {
    category: input.category || 'other',
    action: clean(input.action) || 'change',
    summary: clean(input.summary) || clean(input.action) || 'Change logged',
    memberName: clean(input.memberName) || null,
    memberMrn: clean(input.memberMrn) || null,
    clientId2: clean(input.clientId2) || null,
    applicationId: clean(input.applicationId) || null,
    staffName: clean(input.staffName) || null,
    staffEmail: clean(input.staffEmail).toLowerCase() || null,
    source: clean(input.source) || 'app',
    sourceRef: clean(input.sourceRef) || null,
    details: stripUndefined(input.details),
    href: clean(input.href) || null,
    memberKeys: buildGlobalChangeMemberKeys(input),
    atIso,
    createdAt: serverTimestamp,
  };
}

/**
 * Append one event to the unified `global_change_log` collection.
 * Never throws: logging must not break the action that triggered it.
 */
export async function writeChangeEvent(
  input: WriteGlobalChangeLogInput,
  options?: { adminDb?: AdminDbLike }
): Promise<string | null> {
  try {
    const { db, serverTimestamp } = await resolveAdmin(options?.adminDb);
    const ref = await db.collection(GLOBAL_CHANGE_LOG_COLLECTION).add(buildDoc(input, serverTimestamp));
    return ref.id;
  } catch (error) {
    console.warn('[global-change-log] write failed:', error);
    return null;
  }
}

/** Mirror a just-written legacy log row (already mapped) into the unified collection. */
export function mirrorLegacyLog(event: GlobalChangeEvent, options?: { adminDb?: AdminDbLike }): Promise<string | null> {
  return writeChangeEvent(toChangeEventInput(event), options);
}

/**
 * `db.collection(name).add(payload)` plus a mirrored unified-log entry.
 * The legacy write behaves exactly as before (including throwing); only the mirror is best-effort.
 */
export async function addAndMirror<T extends Record<string, any>>(
  db: any,
  collectionName: string,
  payload: T,
  mapper: (id: string, data: T) => GlobalChangeEvent
): Promise<{ id: string }> {
  const ref = await db.collection(collectionName).add(payload);
  await mirrorLegacyLog(mapper(ref.id, payload), { adminDb: db });
  return ref;
}

/** Batched variant for bulk jobs (e.g. Caspio sync status changes). */
export async function writeChangeEvents(
  inputs: WriteGlobalChangeLogInput[],
  options?: { adminDb?: AdminDbLike }
): Promise<number> {
  if (!inputs.length) return 0;
  try {
    const { db, serverTimestamp } = await resolveAdmin(options?.adminDb);
    if (!db.batch) {
      await Promise.all(inputs.map((input) => writeChangeEvent(input, { adminDb: db })));
      return inputs.length;
    }
    const CHUNK = 400;
    for (let i = 0; i < inputs.length; i += CHUNK) {
      const batch = db.batch();
      for (const input of inputs.slice(i, i + CHUNK)) {
        batch.set(db.collection(GLOBAL_CHANGE_LOG_COLLECTION).doc(), buildDoc(input, serverTimestamp));
      }
      await batch.commit();
    }
    return inputs.length;
  } catch (error) {
    console.warn('[global-change-log] batch write failed:', error);
    return 0;
  }
}
