import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeLookup = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getApplicationAliases = (app: Record<string, any>) => {
  const first = normalizeLookup(app?.memberFirstName);
  const last = normalizeLookup(app?.memberLastName);
  const fullName = normalizeLookup(`${first} ${last}`);
  const dob = normalizeLookup(app?.memberDob);
  const plan = normalizeLookup(app?.healthPlan);
  const pathway = normalizeLookup(app?.pathway);
  const mrn = normalizeLookup(app?.memberMrn);
  const mediCal = normalizeLookup(app?.memberMediCalNum || app?.confirmMemberMediCalNum);
  const clientId2 = normalizeLookup(app?.client_ID2 || app?.clientId2 || app?.caspioClientId2);
  const aliases = new Set<string>();

  if (mrn) aliases.add(`mrn:${mrn}`);
  if (clientId2) aliases.add(`client:${clientId2}`);
  if (mediCal) aliases.add(`medi:${mediCal}`);
  if (fullName && dob) aliases.add(`name_dob:${fullName}|${dob}`);
  if (fullName && (plan || pathway)) aliases.add(`name_plan_path:${fullName}|${plan}|${pathway}`);

  return aliases;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const idToken = String(body?.idToken || '').trim();
    const applicationId = String(body?.applicationId || '').trim();
    const userId = String(body?.userId || '').trim();

    if (!idToken || !applicationId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: idToken, applicationId' },
        { status: 400 }
      );
    }

    const authz = await requireAdminApiAuthFromIdToken(idToken, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const { adminDb } = authz;
    const refsByPath = new Map<string, FirebaseFirestore.DocumentReference>();

    const adminDocRef = adminDb.collection('applications').doc(applicationId);
    refsByPath.set(adminDocRef.path, adminDocRef);

    if (userId) {
      const userDocRef = adminDb.collection('users').doc(userId).collection('applications').doc(applicationId);
      refsByPath.set(userDocRef.path, userDocRef);
    }

    // Avoid FieldPath.documentId() collection-group equality constraints here.
    // Some environments reject plain IDs as invalid paths for group doc-id filters.
    const collectionGroupSnap = await adminDb.collectionGroup('applications').get();
    const collectionGroupDocs = collectionGroupSnap.docs as FirebaseFirestore.QueryDocumentSnapshot[];
    const directIdMatches = collectionGroupDocs.filter((docSnap) => docSnap.id === applicationId);
    directIdMatches.forEach((docSnap) => {
      refsByPath.set(docSnap.ref.path, docSnap.ref);
    });

    // Delete linked duplicates too: the applications list can collapse multiple docs
    // into one visible row (same member identity). Deleting only one ID can make the
    // "same" member appear to persist.
    const targetAliasSet = new Set<string>();
    directIdMatches.forEach((docSnap) => {
      const aliases = getApplicationAliases((docSnap.data() || {}) as Record<string, any>);
      aliases.forEach((alias) => targetAliasSet.add(alias));
    });

    // Fallback to request payload identity hints if direct-id docs were not found.
    if (targetAliasSet.size === 0) {
      const aliasesFromPayload = getApplicationAliases({
        memberFirstName: body?.memberFirstName,
        memberLastName: body?.memberLastName,
        memberDob: body?.memberDob,
        memberMrn: body?.memberMrn,
        memberMediCalNum: body?.memberMediCalNum,
        confirmMemberMediCalNum: body?.confirmMemberMediCalNum,
        client_ID2: body?.client_ID2,
        clientId2: body?.clientId2,
        caspioClientId2: body?.caspioClientId2,
        healthPlan: body?.healthPlan,
        pathway: body?.pathway,
      });
      aliasesFromPayload.forEach((alias) => targetAliasSet.add(alias));
    }

    if (targetAliasSet.size > 0) {
      collectionGroupDocs.forEach((docSnap) => {
        const docAliases = getApplicationAliases((docSnap.data() || {}) as Record<string, any>);
        if (docAliases.size === 0) return;
        const hasSharedAlias = Array.from(docAliases).some((alias) => targetAliasSet.has(alias));
        if (hasSharedAlias) {
          refsByPath.set(docSnap.ref.path, docSnap.ref);
        }
      });
    }

    const deleteTargets = Array.from(refsByPath.values());
    await Promise.all(deleteTargets.map((ref) => ref.delete()));

    return NextResponse.json({
      success: true,
      deletedCount: deleteTargets.length,
      deletedPaths: Array.from(refsByPath.keys()),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to delete application') },
      { status: 500 }
    );
  }
}

