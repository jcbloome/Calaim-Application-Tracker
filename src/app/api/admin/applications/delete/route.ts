import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';
import { buildApplicationIdentityAliases } from '@/lib/member-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      const aliases = buildApplicationIdentityAliases((docSnap.data() || {}) as Record<string, any>);
      aliases.forEach((alias) => targetAliasSet.add(alias));
    });

    // Fallback to request payload identity hints if direct-id docs were not found.
    if (targetAliasSet.size === 0) {
      const aliasesFromPayload = buildApplicationIdentityAliases({
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
        const docAliases = buildApplicationIdentityAliases((docSnap.data() || {}) as Record<string, any>);
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

