import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = tokenMatch?.[1] ? String(tokenMatch[1]).trim() : '';
    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const visitId = String(body?.visitId || body?.visitData?.visitId || '').trim();
    const visitData = (body?.visitData || body) as any;
    if (!visitId) {
      return NextResponse.json({ success: false, error: 'visitId is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminAuth = adminModule.adminAuth;
    const adminDb = adminModule.adminDb;

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = String(decoded?.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    const ref = adminDb.collection('sw_visit_records').doc(visitId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }
    const existing = snap.data() as any;

    const owner = String(existing?.socialWorkerEmail || '').trim().toLowerCase();
    if (owner && owner !== email) {
      return NextResponse.json({ success: false, error: 'Visit does not belong to this social worker' }, { status: 403 });
    }

    const claimStatus = String(existing?.claimStatus || 'draft').trim().toLowerCase();
    const claimSubmitted = Boolean(existing?.claimSubmitted) || claimStatus !== 'draft';
    const claimPaid = Boolean(existing?.claimPaid) || claimStatus === 'paid';
    if (claimSubmitted || claimPaid) {
      return NextResponse.json(
        { success: false, error: 'This visit is already tied to a submitted/paid claim and cannot be edited.' },
        { status: 409 }
      );
    }
    if (Boolean(existing?.signedOff)) {
      return NextResponse.json(
        { success: false, error: 'This visit has been signed off and cannot be edited.' },
        { status: 409 }
      );
    }

    const nextVisitDate = String(visitData?.visitDate || '').trim().slice(0, 10);
    const existingVisitDate = String(existing?.visitDate || '').trim().slice(0, 10);
    if (!nextVisitDate || nextVisitDate !== existingVisitDate) {
      return NextResponse.json(
        { success: false, error: 'visitDate cannot be changed when editing a visit.' },
        { status: 409 }
      );
    }

    const memberId = String(visitData?.memberId || '').trim();
    const existingMemberId = String(existing?.memberId || '').trim();
    if (!memberId || (existingMemberId && memberId !== existingMemberId)) {
      return NextResponse.json({ success: false, error: 'memberId mismatch' }, { status: 409 });
    }

    const rcfeId = String(visitData?.rcfeId || '').trim();
    const existingRcfeId = String(existing?.rcfeId || '').trim();
    if (!rcfeId || (existingRcfeId && rcfeId !== existingRcfeId)) {
      return NextResponse.json({ success: false, error: 'rcfeId mismatch' }, { status: 409 });
    }

    const totalScore = Number(visitData?.visitSummary?.totalScore || existing?.totalScore || 0);
    const flagged = Boolean(visitData?.visitSummary?.flagged ?? existing?.flagged);

    const update: Record<string, any> = {
      memberName: String(visitData?.memberName || existing?.memberName || '').trim(),
      memberRoomNumber: String(visitData?.memberRoomNumber || '').trim() || null,
      rcfeName: String(visitData?.rcfeName || existing?.rcfeName || '').trim(),
      rcfeAddress: String(visitData?.rcfeAddress || existing?.rcfeAddress || '').trim(),
      visitDate: existingVisitDate,
      totalScore,
      flagged,
      raw: visitData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(update, { merge: true });

    const claimId = String(existing?.claimId || '').trim();
    if (claimId) {
      try {
        const claimRef = adminDb.collection('sw-claims').doc(claimId);
        const claimSnap = await claimRef.get();
        if (claimSnap.exists) {
          const claim = claimSnap.data() as any;
          const memberVisits = Array.isArray(claim?.memberVisits) ? claim.memberVisits : [];
          const nextMemberVisits = memberVisits.map((v: any) => {
            const id = String(v?.id || v?.visitId || '').trim();
            if (id !== visitId) return v;
            return {
              ...v,
              memberName: String(visitData?.memberName || v?.memberName || '').trim(),
              memberRoomNumber: String(visitData?.memberRoomNumber || v?.memberRoomNumber || '').trim(),
              rcfeName: String(visitData?.rcfeName || v?.rcfeName || '').trim(),
              rcfeAddress: String(visitData?.rcfeAddress || v?.rcfeAddress || '').trim(),
              visitDate: existingVisitDate,
            };
          });
          await claimRef.set(
            {
              memberVisits: nextMemberVisits,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.warn('⚠️ Failed updating claim memberVisits (best-effort):', e);
      }
    }

    return NextResponse.json({ success: true, visitId });
  } catch (error: any) {
    console.error('❌ Error updating SW visit:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update visit' },
      { status: 500 }
    );
  }
}

