import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import {
  buildIlsMifDedupeKey,
  ILS_MIF_AUDIT_COLLECTION,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
} from '@/lib/ils-mif-parse';

export function sanitizeIlsMifDocId(key: string): string {
  return String(key || '')
    .replace(/[\/#?[\]]/g, '_')
    .slice(0, 700);
}

export type IlsMifMemberIdentityInput = {
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberMediCalNum?: string;
  memberDob?: string;
  clientId2?: string;
};

export function resolveIlsMifDedupeKey(
  identity: IlsMifMemberIdentityInput,
  preferredKey?: string
): string {
  const preferred = sanitizeIlsMifDocId(String(preferredKey || '').trim());
  if (preferred) return preferred;
  return sanitizeIlsMifDocId(
    buildIlsMifDedupeKey({
      memberFirstName: String(identity.memberFirstName || '').trim(),
      memberLastName: String(identity.memberLastName || '').trim(),
      memberMrn: String(identity.memberMrn || '').trim(),
      memberMediCalNum: String(identity.memberMediCalNum || '').trim(),
      memberDob: String(identity.memberDob || '').trim(),
      clientId2: String(identity.clientId2 || '').trim(),
    })
  );
}

/**
 * After a successful Caspio push, mark the member as already in Caspio on the
 * consolidator master list + optional run snapshot so they leave the "New / not in Caspio" lists.
 */
export async function markIlsMifMemberPushedToCaspio(
  firestore: Firestore,
  params: IlsMifMemberIdentityInput & {
    consolidatorRunId?: string;
    ilsMifDedupeKey?: string;
    applicationId?: string;
    actor?: string;
  }
): Promise<{ dedupeKey: string }> {
  const identity = {
    memberFirstName: String(params.memberFirstName || '').trim(),
    memberLastName: String(params.memberLastName || '').trim(),
    memberMrn: String(params.memberMrn || '').trim(),
    memberMediCalNum: String(params.memberMediCalNum || '').trim(),
    memberDob: String(params.memberDob || '').trim(),
    clientId2: String(params.clientId2 || '').trim(),
  };
  const dedupeKey = resolveIlsMifDedupeKey(identity, params.ilsMifDedupeKey);
  if (!dedupeKey) return { dedupeKey: '' };

  const patch: Record<string, unknown> = {
    ...identity,
    dedupeKey,
    caspioExists: true,
    mergeStatus: 'already_in_caspio',
    statusNote: 'Pushed to Caspio from application',
    caspioMatchedClientId2: identity.clientId2 || '',
    pushedToCaspioAtIso: new Date().toISOString(),
    pushedToCaspioApplicationId: String(params.applicationId || '').trim(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, dedupeKey), patch, { merge: true });

  const runId = String(params.consolidatorRunId || '').trim();
  if (runId) {
    await setDoc(
      doc(
        firestore,
        ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
        runId,
        ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
        dedupeKey
      ),
      { ...patch, runId },
      { merge: true }
    );
  }

  try {
    await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
      action: 'caspio_push_cleared_from_new',
      summary: `Marked ${identity.memberLastName || '—'}, ${
        identity.memberFirstName || '—'
      } as in Caspio after push (removed from New / non-Caspio list)`,
      atIso: new Date().toISOString(),
      atServer: serverTimestamp(),
      actor: String(params.actor || '').trim(),
      applicationId: String(params.applicationId || '').trim(),
      runId,
      dedupeKey,
      memberMrn: identity.memberMrn,
      clientId2: identity.clientId2,
    });
  } catch {
    // audit is best-effort
  }

  return { dedupeKey };
}

export type ExistingApplicationMatch = {
  applicationId: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  memberMediCalNum: string;
  status: string;
  matchedBy: 'mrn' | 'medi_cal';
};

/**
 * Find existing Firestore applications for the same MRN and/or Medi-Cal/CIN.
 * Used to block duplicate skeleton creates.
 */
export async function findExistingApplicationsForMember(
  firestore: Firestore,
  params: {
    memberMrn?: string;
    memberMediCalNum?: string;
    excludeApplicationId?: string;
  }
): Promise<ExistingApplicationMatch[]> {
  const mrn = String(params.memberMrn || '').trim();
  const mediCal = String(params.memberMediCalNum || '').trim();
  const excludeId = String(params.excludeApplicationId || '').trim();
  if (!mrn && !mediCal) return [];

  const byId = new Map<string, ExistingApplicationMatch>();

  const ingest = (docSnap: { id: string; data: () => any }, matchedBy: 'mrn' | 'medi_cal') => {
    if (excludeId && docSnap.id === excludeId) return;
    const data = docSnap.data() as any;
    const status = String(data?.status || '').trim();
    const statusLower = status.toLowerCase();
    if (statusLower === 'deleted' || statusLower === 'cancelled' || statusLower === 'canceled') return;
    byId.set(docSnap.id, {
      applicationId: docSnap.id,
      memberFirstName: String(data?.memberFirstName || '').trim(),
      memberLastName: String(data?.memberLastName || '').trim(),
      memberMrn: String(data?.memberMrn || '').trim(),
      memberMediCalNum: String(data?.memberMediCalNum || '').trim(),
      status,
      matchedBy,
    });
  };

  if (mrn) {
    const snap = await getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', mrn)));
    snap.docs.forEach((d) => ingest(d, 'mrn'));
  }
  if (mediCal) {
    const snap = await getDocs(
      query(collection(firestore, 'applications'), where('memberMediCalNum', '==', mediCal))
    );
    snap.docs.forEach((d) => ingest(d, byId.has(d.id) ? 'mrn' : 'medi_cal'));
  }

  return Array.from(byId.values());
}
