import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const pickVisitIds = (claim: any): string[] => {
  const visitIdsFromDoc: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds : [];
  const visitIdsFromMemberVisits: string[] = Array.isArray(claim?.memberVisits)
    ? claim.memberVisits.map((v: any) => String(v?.id || v?.visitId || '').trim()).filter(Boolean)
    : [];
  return Array.from(new Set([...visitIdsFromDoc, ...visitIdsFromMemberVisits])).slice(0, 500);
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const claimId = String(body?.claimId || '').trim();
    const reason = String(body?.reason || '').trim();

    if (!claimId) {
      return NextResponse.json({ success: false, error: 'claimId is required' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'A reason is required for override submit' }, { status: 400 });
    }

    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;
    const admin = adminModule.default;

    const claimRef = adminDb.collection('sw-claims').doc(claimId);
    const snap = await claimRef.get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 });
    }
    const claim = (snap.data() as any) || {};
    const prevStatus = String(claim?.status || 'draft').trim().toLowerCase();
    if (prevStatus !== 'draft') {
      return NextResponse.json(
        { success: false, error: `Only draft claims can be override-submitted (status=${prevStatus})` },
        { status: 409 }
      );
    }

    const actorLabel = String(actorName || actorEmail || 'Admin').trim() || 'Admin';
    const nowIso = new Date().toISOString();
    const nowTs = admin.firestore.Timestamp.now();

    const visitIds = pickVisitIds(claim);

    const batch = adminDb.batch();
    batch.set(
      claimRef,
      {
        status: 'submitted',
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedBy: actorLabel,
        submittedByAdmin: true,
        overrideSubmitted: true,
        overrideSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
        overrideSubmittedBy: actorLabel,
        overrideSubmittedByUid: actorUid,
        overrideSubmittedByEmail: actorEmail,
        overrideReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const eventRef = adminDb.collection('sw_claim_events').doc();
    batch.set(
      eventRef,
      {
        id: eventRef.id,
        claimId,
        claimMonth: String(claim?.claimMonth || '').trim() || null,
        socialWorkerEmail: String(claim?.socialWorkerEmail || '').trim().toLowerCase() || null,
        rcfeId: String(claim?.rcfeId || '').trim() || null,
        rcfeName: String(claim?.rcfeName || '').trim() || null,
        fromStatus: prevStatus,
        toStatus: 'submitted',
        notes: reason,
        action: 'override_submit',
        actorUid,
        actorEmail,
        actorName: actorLabel,
        createdAtIso: nowIso,
        createdAt: nowTs,
      },
      { merge: true }
    );

    if (visitIds.length > 0) {
      visitIds.forEach((visitId) => {
        const visitRef = adminDb.collection('sw_visit_records').doc(String(visitId));
        batch.set(
          visitRef,
          {
            claimId,
            claimStatus: 'submitted',
            claimSubmitted: true,
            claimSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
            overrideSubmitted: true,
            overrideReason: reason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, claimId, eventId: eventRef.id });
  } catch (error: any) {
    console.error('❌ Error override-submitting SW claim:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to override submit claim' },
      { status: 500 }
    );
  }
}

