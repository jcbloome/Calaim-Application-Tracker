import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'needs_correction'
  | 'reviewed'
  | 'ready_for_payment'
  | 'approved'
  | 'paid'
  | 'rejected';

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
    const newStatus = String(body?.newStatus || '').trim() as ClaimStatus;
    const reviewNotes = String(body?.reviewNotes || '').trim();

    if (!claimId) {
      return NextResponse.json({ success: false, error: 'claimId is required' }, { status: 400 });
    }
    const allowed: ClaimStatus[] = [
      'draft',
      'submitted',
      'needs_correction',
      'reviewed',
      'ready_for_payment',
      'approved',
      'paid',
      'rejected',
    ];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({ success: false, error: 'Invalid newStatus' }, { status: 400 });
    }
    if (newStatus === 'needs_correction' && !reviewNotes) {
      return NextResponse.json({ success: false, error: 'A correction reason is required' }, { status: 400 });
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
    const prevStatus = String(claim?.status || 'draft').trim() as ClaimStatus;

    const actorLabel = String(actorName || actorEmail || 'Admin').trim() || 'Admin';
    const nowIso = new Date().toISOString();
    const nowTs = admin.firestore.Timestamp.now();

    const updates: any = {
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewNotes: reviewNotes || '',
    };

    // Normalize payment fields so admin reporting is consistent across legacy data.
    if (newStatus !== 'paid') {
      updates.claimPaid = false;
      updates.paidAt = null;
      updates.paidBy = null;
      updates.paymentStatus = 'unpaid';
    }

    if (newStatus === 'submitted') {
      updates.submittedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.submittedBy = actorLabel;
      updates.submittedByAdmin = true;
    } else if (
      newStatus === 'reviewed' ||
      newStatus === 'needs_correction' ||
      newStatus === 'ready_for_payment' ||
      newStatus === 'approved' ||
      newStatus === 'rejected' ||
      newStatus === 'paid'
    ) {
      updates.reviewedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.reviewedBy = actorLabel;
    }

    if (newStatus === 'needs_correction') {
      updates.correctionReason = reviewNotes;
      updates.correctionRequestedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.correctionRequestedBy = actorLabel;
    } else if (newStatus === 'reviewed' || newStatus === 'ready_for_payment' || newStatus === 'paid') {
      updates.correctionReason = null;
      updates.correctionRequestedAt = null;
      updates.correctionRequestedBy = null;
    }

    if (newStatus === 'ready_for_payment') {
      updates.readyForPaymentAt = admin.firestore.FieldValue.serverTimestamp();
      updates.readyForPaymentBy = actorLabel;
      updates.paymentStatus = 'unpaid';
    }

    if (newStatus === 'paid') {
      updates.paidAt = admin.firestore.FieldValue.serverTimestamp();
      updates.claimPaid = true;
      updates.paidBy = actorLabel;
      // Many places still look at paymentStatus
      updates.paymentStatus = 'paid';
    }

    // Write claim update + audit log + visit propagation together.
    const visitIds = pickVisitIds(claim);
    const batch = adminDb.batch();
    batch.set(claimRef, updates, { merge: true });

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
        toStatus: newStatus,
        notes: reviewNotes || null,
        actorUid,
        actorEmail,
        actorName: actorLabel,
        createdAtIso: nowIso,
        createdAt: nowTs,
      },
      { merge: true }
    );

    if (newStatus !== 'draft' && visitIds.length > 0) {
      visitIds.forEach((visitId) => {
        const visitRef = adminDb.collection('sw_visit_records').doc(String(visitId));
        batch.set(
          visitRef,
          {
            claimId,
            claimStatus: newStatus,
            claimSubmitted: true,
            ...(newStatus === 'paid'
              ? { claimPaid: true, claimPaidAt: admin.firestore.FieldValue.serverTimestamp() }
              : { claimPaid: false, claimPaidAt: null }),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true, claimId, fromStatus: prevStatus, toStatus: newStatus, eventId: eventRef.id });
  } catch (error: any) {
    console.error('❌ Error updating SW claim status:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update claim status' },
      { status: 500 }
    );
  }
}

