import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const idToken = String(body?.idToken || '').trim();
    const claimId = String(body?.claimId || '').trim();

    if (!idToken || !claimId) {
      return NextResponse.json({ success: false, error: 'Missing idToken or claimId' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = (decoded.email || '').toLowerCase();

    if (!uid || !email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const claimRef = adminDb.collection('sw-claims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 });
    }

    const claim = claimSnap.data() as any;
    const ownerEmail = String(claim?.socialWorkerEmail || '').toLowerCase();
    const ownerUid = String(claim?.socialWorkerUid || '').trim();

    if (ownerEmail && ownerEmail !== email) {
      return NextResponse.json({ success: false, error: 'Claim does not belong to this social worker' }, { status: 403 });
    }
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'Claim does not belong to this social worker' }, { status: 403 });
    }

    const status = String(claim?.status || 'draft');
    if (status !== 'draft') {
      return NextResponse.json({ success: false, error: `Claim is already ${status}` }, { status: 409 });
    }

    const now = admin.firestore.Timestamp.now();
    await claimRef.set(
      {
        status: 'submitted',
        submittedAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const visitIds: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds : [];
    if (visitIds.length > 0) {
      const batch = adminDb.batch();
      visitIds.slice(0, 500).forEach((visitId) => {
        const visitRef = adminDb.collection('sw_visit_records').doc(String(visitId));
        batch.set(
          visitRef,
          {
            claimId,
            claimStatus: 'submitted',
            claimSubmitted: true,
            claimSubmittedAt: now,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }

    return NextResponse.json({ success: true, claimId, status: 'submitted' });
  } catch (error: any) {
    console.error('❌ Error submitting SW claim:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to submit claim' },
      { status: 500 }
    );
  }
}

