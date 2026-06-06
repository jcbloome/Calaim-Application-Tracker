import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuthFromIdToken } from '@/lib/admin-api-auth';

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
    collectionGroupSnap.docs
      .filter((docSnap: FirebaseFirestore.QueryDocumentSnapshot) => docSnap.id === applicationId)
      .forEach((docSnap: FirebaseFirestore.QueryDocumentSnapshot) => {
        refsByPath.set(docSnap.ref.path, docSnap.ref);
      });

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

