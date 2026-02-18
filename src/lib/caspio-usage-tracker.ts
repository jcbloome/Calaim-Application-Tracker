'server-only';

type CaspioCallMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type CaspioCallKind = 'token' | 'read' | 'write';

type CaspioCallEvent = {
  method: CaspioCallMethod;
  kind: CaspioCallKind;
  status?: number;
  ok?: boolean;
  context?: string;
};

type PendingCounters = {
  total: number;
  token: number;
  read: number;
  write: number;
  errors: number;
};

const LIMIT_MONTHLY = 1_000_000;
const WARN_THRESHOLD = 800_000; // projected month usage
const ERROR_THRESHOLD = 1_000_000; // projected month usage

const g = globalThis as any;
const STATE_KEY = '__calaim_caspio_usage_state_v1__';

function getState(): {
  pending: PendingCounters;
  lastFlushAtMs: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
} {
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      pending: { total: 0, token: 0, read: 0, write: 0, errors: 0 },
      lastFlushAtMs: 0,
      flushTimer: null,
    };
  }
  return g[STATE_KEY];
}

function yyyyMmDd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function yyyyMm(d = new Date()) {
  return d.toISOString().slice(0, 7);
}
function daysInMonth(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

async function flushToFirestore(delta: PendingCounters) {
  if (delta.total <= 0) return;

  const adminModule = await import('@/firebase-admin');
  const admin = adminModule.default;
  const adminDb = adminModule.adminDb;

  const dayId = yyyyMmDd();
  const monthId = yyyyMm();
  const dailyRef = adminDb.collection('caspio_api_usage_daily').doc(dayId);
  const settingsRef = adminDb.collection('admin-settings').doc('caspio-api-usage');

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const dim = daysInMonth(now);

  await adminDb.runTransaction(async (tx) => {
    tx.set(
      dailyRef,
      {
        dayId,
        monthId,
        total: admin.firestore.FieldValue.increment(delta.total),
        token: admin.firestore.FieldValue.increment(delta.token),
        read: admin.firestore.FieldValue.increment(delta.read),
        write: admin.firestore.FieldValue.increment(delta.write),
        errors: admin.firestore.FieldValue.increment(delta.errors),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const snap = await tx.get(settingsRef);
    const current = snap.exists ? (snap.data() as any) : {};
    const currentMonth = String(current?.monthId || '');

    const monthToDateTotal =
      currentMonth === monthId ? Number(current?.monthToDateTotal || 0) : 0;
    const nextMonthToDateTotal = monthToDateTotal + delta.total;
    const projectedMonthly = Math.round((nextMonthToDateTotal / Math.max(dayOfMonth, 1)) * dim);

    let warningLevel: 'ok' | 'warn' | 'error' = 'ok';
    if (projectedMonthly >= ERROR_THRESHOLD) warningLevel = 'error';
    else if (projectedMonthly >= WARN_THRESHOLD) warningLevel = 'warn';

    tx.set(
      settingsRef,
      {
        monthId,
        monthToDateTotal: nextMonthToDateTotal,
        projectedMonthly,
        limitMonthly: LIMIT_MONTHLY,
        warningLevel,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (warningLevel !== 'ok') {
      const msg = `[CASPIO USAGE] projectedMonthly=${projectedMonthly} (limit=${LIMIT_MONTHLY}) monthToDate=${nextMonthToDateTotal} day=${dayOfMonth}/${dim}`;
      if (warningLevel === 'error') console.error(msg);
      else console.warn(msg);
    }
  });
}

function scheduleFlush() {
  const state = getState();
  if (state.flushTimer) return;
  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flushNow();
  }, 60_000);
}

export async function flushNow() {
  const state = getState();
  const delta = state.pending;
  state.pending = { total: 0, token: 0, read: 0, write: 0, errors: 0 };
  state.lastFlushAtMs = Date.now();
  await flushToFirestore(delta);
}

export function trackCaspioCall(event: CaspioCallEvent) {
  const state = getState();
  state.pending.total += 1;
  if (event.kind === 'token') state.pending.token += 1;
  else if (event.kind === 'read') state.pending.read += 1;
  else if (event.kind === 'write') state.pending.write += 1;

  const ok = event.ok ?? (typeof event.status === 'number' ? event.status >= 200 && event.status < 300 : true);
  if (!ok) state.pending.errors += 1;

  // Flush sooner if we're accumulating quickly.
  if (state.pending.total >= 200) {
    void flushNow();
    return;
  }

  scheduleFlush();
}

