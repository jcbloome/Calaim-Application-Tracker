import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

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
}): Promise<QueryDocumentSnapshot[]> {
  const email = String(params.swEmail || '')
    .trim()
    .toLowerCase();
  const uid = String(params.swUid || '').trim();
  const swId = String(params.swId || '')
    .trim()
    .toLowerCase();

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
  return Array.from(byPath.values());
}
