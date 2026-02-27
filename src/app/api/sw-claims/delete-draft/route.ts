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
    const uid = String(decoded?.uid || '').trim();
    const email = String(decoded?.email || '').trim().toLowerCase();

    if (!uid || !email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const claimRef = adminDb.collection('sw-claims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 });
    }

    const claim = claimSnap.data() as any;
    const ownerEmail = String(claim?.socialWorkerEmail || '').trim().toLowerCase();
    const ownerUid = String(claim?.socialWorkerUid || '').trim();

    if (ownerEmail && ownerEmail !== email) {
      return NextResponse.json({ success: false, error: 'Claim does not belong to this social worker' }, { status: 403 });
    }
    if (ownerUid && ownerUid !== uid) {
      return NextResponse.json({ success: false, error: 'Claim does not belong to this social worker' }, { status: 403 });
    }

    const status = String(claim?.status || 'draft').toLowerCase();
    if (status !== 'draft') {
      return NextResponse.json({ success: false, error: `Only draft claims can be deleted (status=${status})` }, { status: 409 });
    }

    const signoffById = claim?.signoffById;
    const hasAnySignoff = !!(signoffById && typeof signoffById === 'object' && Object.keys(signoffById).length > 0);
    if (hasAnySignoff) {
      return NextResponse.json(
        { success: false, error: 'This draft already has an RCFE sign-off attached and cannot be deleted.' },
        { status: 409 }
      );
    }

    const visitIds: string[] = Array.isArray(claim?.visitIds)
      ? claim.visitIds.map((v: any) => String(v || '').trim()).filter(Boolean)
      : [];

    // Safety: only delete visits that are still draft + not signed off.
    const visitRefs = visitIds.slice(0, 500).map((id) => adminDb.collection('sw_visit_records').doc(String(id)));
    const visitSnaps = visitRefs.length > 0 ? await adminDb.getAll(...visitRefs) : [];

    for (const s of visitSnaps) {
      if (!s?.exists) continue;
      const v = s.data() as any;
      const vEmail = String(v?.socialWorkerEmail || '').trim().toLowerCase();
      const vClaimId = String(v?.claimId || '').trim();
      const vSignedOff = Boolean(v?.signedOff);
      const vClaimStatus = String(v?.claimStatus || 'draft').toLowerCase();
      const vSubmitted = Boolean(v?.claimSubmitted) || vClaimStatus !== 'draft';

      if (vEmail && vEmail !== email) {
        return NextResponse.json({ success: false, error: 'Cannot delete: visit record owner mismatch.' }, { status: 403 });
      }
      if (vClaimId && vClaimId !== claimId) {
        return NextResponse.json({ success: false, error: 'Cannot delete: visit record is linked to a different claim.' }, { status: 409 });
      }
      if (vSignedOff) {
        return NextResponse.json({ success: false, error: 'Cannot delete: one or more visits are already signed off.' }, { status: 409 });
      }
      if (vSubmitted) {
        return NextResponse.json({ success: false, error: 'Cannot delete: one or more visits are already submitted.' }, { status: 409 });
      }
    }

    const batch = adminDb.batch();
    visitSnaps.forEach((s: any) => {
      if (!s?.exists) return;
      batch.delete(s.ref);
    });
    batch.delete(claimRef);
    await batch.commit();

    return NextResponse.json({ success: true, claimId, deletedVisits: visitSnaps.filter((s: any) => s?.exists).length });
  } catch (error: any) {
    console.error('❌ Error deleting draft SW claim:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete draft claim' },
      { status: 500 }
    );
  }
}

