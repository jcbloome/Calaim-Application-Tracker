import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { identityTokenLookupKeys } from '@/lib/member-identity';
import {
  buildIlsMifDedupeKey,
  ilsMifMonthKeyFromIso,
  mergeIlsMifMonthlyAssigneeCounts,
  mergeIlsMifMonthlyCounts,
  parseIlsMifMonthlyAssigneeCounts,
  parseIlsMifMonthlyCounts,
  ILS_MIF_AUDIT_COLLECTION,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_CREATE_APP_EXCLUDED_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_SKELETON_CREATES_COLLECTION,
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

/**
 * After skeleton application create, mark the consolidator member so Create App
 * "Load new members" no longer includes them. Also tracks monthly skeleton counts
 * and assignee breakdown on consolidator _meta + skeleton create log.
 */
export async function markIlsMifMemberSkeletonCreated(
  firestore: Firestore,
  params: IlsMifMemberIdentityInput & {
    consolidatorRunId?: string;
    ilsMifDedupeKey?: string;
    applicationId?: string;
    actor?: string;
    assignedStaffId?: string;
    assignedStaffName?: string;
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

  const applicationId = String(params.applicationId || '').trim();
  const assignedStaffId = String(params.assignedStaffId || '').trim();
  const assignedStaffName =
    String(params.assignedStaffName || '').trim() || (assignedStaffId ? 'Assigned staff' : 'Unassigned');
  const createdAtIso = new Date().toISOString();
  const monthKey = ilsMifMonthKeyFromIso(createdAtIso);

  // Avoid double-counting if this member already has a skeleton on the master.
  let alreadyCounted = false;
  try {
    const existingMaster = await getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, dedupeKey));
    if (existingMaster.exists() && String(existingMaster.data()?.skeletonApplicationId || '').trim()) {
      alreadyCounted = true;
    }
  } catch {
    // continue; still mark the member
  }

  const patch: Record<string, unknown> = {
    ...identity,
    dedupeKey,
    skeletonApplicationId: applicationId,
    skeletonCreatedAtIso: createdAtIso,
    skeletonCreatedMonthKey: monthKey,
    skeletonAssignedStaffId: assignedStaffId,
    skeletonAssignedStaffName: assignedStaffName,
    statusNote: applicationId
      ? `Skeleton created: ${applicationId}${assignedStaffName ? ` · ${assignedStaffName}` : ''}`
      : 'Skeleton created',
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
    await addDoc(collection(firestore, ILS_MIF_SKELETON_CREATES_COLLECTION), {
      applicationId,
      dedupeKey,
      runId,
      memberFirstName: identity.memberFirstName,
      memberLastName: identity.memberLastName,
      memberMrn: identity.memberMrn,
      assignedStaffId,
      assignedStaffName,
      createdAtIso,
      monthKey,
      actor: String(params.actor || '').trim(),
      createdAtServer: serverTimestamp(),
    });
  } catch {
    // log is best-effort
  }

  if (!alreadyCounted) {
    try {
      const metaRef = doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta');
      const metaSnap = await getDoc(metaRef);
      const meta = metaSnap.exists() ? metaSnap.data() || {} : {};
      const monthlySkeletonCreates = mergeIlsMifMonthlyCounts(
        parseIlsMifMonthlyCounts(meta.monthlySkeletonCreates),
        { [monthKey]: 1 }
      );
      const monthlySkeletonByAssignee = mergeIlsMifMonthlyAssigneeCounts(
        parseIlsMifMonthlyAssigneeCounts(meta.monthlySkeletonByAssignee),
        monthKey,
        assignedStaffName,
        1
      );
      await setDoc(
        metaRef,
        {
          monthlySkeletonCreates,
          monthlySkeletonByAssignee,
          monthlySkeletonUpdatedAtIso: createdAtIso,
        },
        { merge: true }
      );
    } catch {
      // monthly rollup is best-effort
    }
  }

  try {
    await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
      action: 'skeleton_create_cleared_from_new',
      summary: `Marked ${identity.memberLastName || '—'}, ${
        identity.memberFirstName || '—'
      } skeleton-created (removed from Create App new-member list)${
        assignedStaffName && assignedStaffName !== 'Unassigned' ? ` · assigned ${assignedStaffName}` : ''
      }`,
      atIso: createdAtIso,
      atServer: serverTimestamp(),
      actor: String(params.actor || '').trim(),
      applicationId,
      runId,
      dedupeKey,
      memberMrn: identity.memberMrn,
      assignedStaffId,
      assignedStaffName,
      monthKey,
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

const uniqueNonEmpty = (values: Array<string | undefined>) =>
  Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const firestoreIdentityQueryValues = (raw: unknown): string[] => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  const stripped = alnum.replace(/^0+/, '') || alnum;
  const padded12 = /^\d+$/.test(stripped) && stripped.length < 12 ? stripped.padStart(12, '0') : '';
  return uniqueNonEmpty([
    trimmed,
    alnum,
    stripped,
    padded12,
    trimmed.toUpperCase(),
    trimmed.toLowerCase(),
    alnum.toUpperCase(),
    alnum.toLowerCase(),
  ]);
};

export type ExistingApplicationIdentityIndex = {
  byKey: Map<string, ExistingApplicationMatch>;
};

export async function loadExistingApplicationIdentityIndex(
  firestore: Firestore
): Promise<ExistingApplicationIdentityIndex> {
  const byKey = new Map<string, ExistingApplicationMatch>();
  const snap = await getDocs(collection(firestore, 'applications'));
  snap.forEach((docSnap) => {
    const data = docSnap.data() as any;
    const status = String(data?.status || '').trim();
    const statusLower = status.toLowerCase();
    if (statusLower === 'deleted' || statusLower === 'cancelled' || statusLower === 'canceled') return;
    const match: ExistingApplicationMatch = {
      applicationId: docSnap.id,
      memberFirstName: String(data?.memberFirstName || '').trim(),
      memberLastName: String(data?.memberLastName || '').trim(),
      memberMrn: String(data?.memberMrn || data?.confirmMemberMrn || data?.Member_MRN || '').trim(),
      memberMediCalNum: String(
        data?.memberMediCalNum || data?.confirmMemberMediCalNum || ''
      ).trim(),
      status,
      matchedBy: 'mrn',
    };
    const add = (key: string, matchedBy: 'mrn' | 'medi_cal') => {
      if (!key || byKey.has(key)) return;
      byKey.set(key, { ...match, matchedBy });
    };
    identityTokenLookupKeys(data?.memberMrn).forEach((key) => add(`mrn:${key}`, 'mrn'));
    identityTokenLookupKeys(data?.confirmMemberMrn).forEach((key) => add(`mrn:${key}`, 'mrn'));
    identityTokenLookupKeys(data?.Member_MRN).forEach((key) => add(`mrn:${key}`, 'mrn'));
    identityTokenLookupKeys(data?.memberMediCalNum).forEach((key) => add(`cin:${key}`, 'medi_cal'));
    identityTokenLookupKeys(data?.confirmMemberMediCalNum).forEach((key) => add(`cin:${key}`, 'medi_cal'));
  });
  return { byKey };
}

export function matchIdentityToExistingApplications(
  index: ExistingApplicationIdentityIndex,
  identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
  }
): ExistingApplicationMatch[] {
  const byId = new Map<string, ExistingApplicationMatch>();
  const consider = (key: string) => {
    const hit = index.byKey.get(key);
    if (hit) byId.set(hit.applicationId, hit);
  };
  identityTokenLookupKeys(identity.memberMrn).forEach((key) => consider(`mrn:${key}`));
  identityTokenLookupKeys(identity.memberMediCalNum).forEach((key) => consider(`cin:${key}`));
  return Array.from(byId.values());
}

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

  const queryField = async (field: string, values: string[], matchedBy: 'mrn' | 'medi_cal') => {
    for (const value of values) {
      const snap = await getDocs(query(collection(firestore, 'applications'), where(field, '==', value)));
      snap.docs.forEach((d) => ingest(d, matchedBy));
    }
  };

  if (mrn) {
    const mrnValues = firestoreIdentityQueryValues(mrn);
    await queryField('memberMrn', mrnValues, 'mrn');
    await queryField('confirmMemberMrn', mrnValues, 'mrn');
  }
  if (mediCal) {
    const cinValues = firestoreIdentityQueryValues(mediCal);
    await queryField('memberMediCalNum', cinValues, 'medi_cal');
    await queryField('confirmMemberMediCalNum', cinValues, 'medi_cal');
  }

  return Array.from(byId.values());
}

/**
 * Hide a member from Create Application runs only.
 * Does not remove them from the consolidator master list / full consolidated view.
 */
export async function excludeIlsMifMemberFromCreateApp(
  firestore: Firestore,
  params: IlsMifMemberIdentityInput & {
    ilsMifDedupeKey?: string;
    reason?: string;
    actor?: string;
    consolidatorRunId?: string;
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

  const reason =
    String(params.reason || '').trim() ||
    'Excluded from Create Application (kept on consolidator master list)';
  const atIso = new Date().toISOString();

  await setDoc(
    doc(firestore, ILS_MIF_CREATE_APP_EXCLUDED_COLLECTION, dedupeKey),
    {
      ...identity,
      dedupeKey,
      reason,
      excludedAtIso: atIso,
      excludedAtServer: serverTimestamp(),
      excludedBy: String(params.actor || '').trim() || null,
      consolidatorRunId: String(params.consolidatorRunId || '').trim() || null,
      keepOnConsolidatorMaster: true,
    },
    { merge: true }
  );

  try {
    await addDoc(collection(firestore, ILS_MIF_AUDIT_COLLECTION), {
      action: 'create_app_exclude',
      summary: `Excluded ${identity.memberLastName || '—'}, ${
        identity.memberFirstName || '—'
      } from Create Application (kept on consolidator list)`,
      atIso,
      atServer: serverTimestamp(),
      actor: String(params.actor || '').trim(),
      runId: String(params.consolidatorRunId || '').trim(),
      dedupeKey,
      memberMrn: identity.memberMrn,
      reason,
    });
  } catch {
    // audit is best-effort
  }

  return { dedupeKey };
}

export async function loadCreateAppExcludedDedupeKeys(firestore: Firestore): Promise<Set<string>> {
  const keys = new Set<string>();
  const snap = await getDocs(collection(firestore, ILS_MIF_CREATE_APP_EXCLUDED_COLLECTION));
  snap.forEach((docSnap) => {
    keys.add(docSnap.id);
    const data = docSnap.data() as any;
    const dedupeKey = String(data?.dedupeKey || '').trim();
    if (dedupeKey) keys.add(dedupeKey);
    const fromFields = resolveIlsMifDedupeKey({
      memberFirstName: String(data?.memberFirstName || ''),
      memberLastName: String(data?.memberLastName || ''),
      memberMrn: String(data?.memberMrn || ''),
      memberMediCalNum: String(data?.memberMediCalNum || ''),
      memberDob: String(data?.memberDob || ''),
      clientId2: String(data?.clientId2 || ''),
    });
    if (fromFields) keys.add(fromFields);
  });
  return keys;
}
