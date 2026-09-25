import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

const clean = (value: unknown) => String(value || '').trim();

const toMs = (value: unknown): number => {
  try {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value && typeof (value as any)?.seconds === 'number') {
      return Number((value as any).seconds) * 1000;
    }
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  } catch {
    return 0;
  }
};

/**
 * True when the assignment was created/routed through the app (ISP Workflow invite),
 * not a Caspio-only SW hydration row from contact refresh.
 */
export function isAppAssignedAlft(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.ispAssignmentTracked === true) return true;
  if (Boolean((data as any)?.workflowSteps?.swInviteSent)) return true;
  if (toMs((data as any)?.workflowInvites?.invitedAt) > 0) return true;
  if (toMs((data as any)?.workflowStepsAt?.swInviteSentAt) > 0) return true;
  if (toMs((data as any)?.trackerPushedAt) > 0) return true;
  const ws = clean(data.workflowStatus).toLowerCase();
  const status = clean(data.status).toLowerCase();
  if (
    ws.includes('sw_invited') ||
    ws.includes('sw_form') ||
    ws.includes('awaiting') ||
    ws.includes('returned_to_sw') ||
    ws.includes('prefill') ||
    ws.includes('completed') ||
    ws.includes('manager_review') ||
    ws.includes('ready_to_send')
  ) {
    return true;
  }
  if (
    status.includes('sw_invited') ||
    status.includes('sw_form') ||
    status.includes('in_progress') ||
    status.includes('submitted') ||
    status.includes('returned_to_sw') ||
    status.includes('completed')
  ) {
    return true;
  }
  const emailLog = Array.isArray((data as any)?.swEmailDeliveryLog)
    ? ((data as any).swEmailDeliveryLog as any[])
    : [];
  if (emailLog.some((entry) => clean(entry?.status).toLowerCase() === 'sent')) return true;
  const activity = Array.isArray((data as any)?.ispWorkflowActivityLog)
    ? ((data as any).ispWorkflowActivityLog as any[])
    : [];
  if (
    activity.some((entry) => {
      const event = clean(entry?.event).toLowerCase();
      return event === 'sw_invite_sent' || event === 'returned_to_sw';
    })
  ) {
    return true;
  }
  return false;
}

/**
 * Load alft_assignments for the signed-in SW without letting a secondary
 * query (Caspio SW_ID / uid) wipe out a successful email query.
 *
 * Note: assignedSwId is Caspio SW_ID and is not valid for Firestore rules
 * against auth.uid — prefer assignedSwEmail / assignedSwUid.
 */
export async function fetchSwAlftAssignmentDocs(params: {
  firestore: Firestore;
  swEmail?: string;
  swUid?: string;
  swId?: string;
  /** When true (default), hide Caspio-only contact hydration rows with no app invite. */
  appAssignedOnly?: boolean;
}): Promise<QueryDocumentSnapshot[]> {
  const email = String(params.swEmail || '')
    .trim()
    .toLowerCase();
  const uid = String(params.swUid || '').trim();
  const swId = String(params.swId || '')
    .trim()
    .toLowerCase();
  const appAssignedOnly = params.appAssignedOnly !== false;

  const attempts: Array<Promise<QueryDocumentSnapshot[]>> = [];
  if (email) {
    attempts.push(
      getDocs(query(collection(params.firestore, 'alft_assignments'), where('assignedSwEmail', '==', email))).then(
        (snap) => snap.docs
      )
    );
  }
  if (uid) {
    attempts.push(
      getDocs(query(collection(params.firestore, 'alft_assignments'), where('assignedSwUid', '==', uid))).then(
        (snap) => snap.docs
      )
    );
  }
  // Best-effort Caspio SW_ID lookup. Rules may deny this; never fail the whole load.
  if (swId) {
    attempts.push(
      getDocs(query(collection(params.firestore, 'alft_assignments'), where('assignedSwId', '==', swId)))
        .then((snap) => snap.docs)
        .catch(() => [] as QueryDocumentSnapshot[])
    );
  }

  if (!attempts.length) return [];

  const settled = await Promise.allSettled(attempts);
  const byPath = new Map<string, QueryDocumentSnapshot>();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const docSnap of result.value) {
      byPath.set(docSnap.ref.path, docSnap);
    }
  }
  const docs = Array.from(byPath.values());
  if (!appAssignedOnly) return docs;
  return docs.filter((docSnap) => isAppAssignedAlft((docSnap.data() || {}) as Record<string, unknown>));
}
