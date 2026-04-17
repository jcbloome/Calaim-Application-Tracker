import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireSuperAdmin: true, requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const claimIds: string[] = Array.isArray(body?.claimIds)
      ? body.claimIds.map((c: any) => String(c || '').trim()).filter(Boolean)
      : [];
    const reason = String(body?.reason || '').trim();

    if (claimIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No claimIds provided' }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, error: 'Delete reason is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;
    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;
    const admin = adminModule.default;

    const nowIso = new Date().toISOString();
    const deleted: string[] = [];
    const errors: Array<{ claimId: string; error: string }> = [];

    for (const claimId of claimIds.slice(0, 250)) {
      try {
        const claimRef = adminDb.collection('sw-claims').doc(claimId);
        const snap = await claimRef.get();
        if (!snap.exists) {
          errors.push({ claimId, error: 'Not found' });
          continue;
        }

        const claim = snap.data() as any;
        const visitIdsFromDoc: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds : [];
        const visitIdsFromMemberVisits: string[] = Array.isArray(claim?.memberVisits)
          ? claim.memberVisits.map((v: any) => String(v?.id || '').trim()).filter(Boolean)
          : [];
        const visitIds = Array.from(new Set([...visitIdsFromDoc, ...visitIdsFromMemberVisits])).slice(0, 500);

        // Audit log (store a snapshot so we can explain what was deleted later).
        const auditRef = adminDb.collection('sw_claim_deletions').doc();
        await auditRef.set(
          {
            id: auditRef.id,
            claimId,
            reason,
            actorUid,
            actorEmail,
            actorName: actorName || actorEmail || 'Admin',
            deletedAtIso: nowIso,
            claimSnapshot: claim,
            visitIds,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Clear claim linkage on visit records, but only if they currently point at this claim.
        if (visitIds.length > 0) {
          const visitRefs = visitIds.map((id) => adminDb.collection('sw_visit_records').doc(String(id)));
          const visitSnaps = await adminDb.getAll(...visitRefs);
          const batch = adminDb.batch();
          let count = 0;
          for (const vs of visitSnaps) {
            if (!vs.exists) continue;
            const v = vs.data() as any;
            const currentClaimId = String(v?.claimId || '').trim();
            if (currentClaimId && currentClaimId !== claimId) continue;
            batch.set(
              vs.ref,
              {
                claimId: admin.firestore.FieldValue.delete(),
                claimStatus: admin.firestore.FieldValue.delete(),
                claimSubmitted: admin.firestore.FieldValue.delete(),
                claimSubmittedAt: admin.firestore.FieldValue.delete(),
                claimPaid: admin.firestore.FieldValue.delete(),
                claimPaidAt: admin.firestore.FieldValue.delete(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            count += 1;
          }
          if (count > 0) await batch.commit();
        }

        await claimRef.delete();
        deleted.push(claimId);
      } catch (e: any) {
        errors.push({ claimId, error: e?.message || 'Delete failed' });
      }
    }

    return NextResponse.json({ success: true, deleted, errors });
  } catch (error: any) {
    console.error('❌ Error deleting SW claims:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete claims' },
      { status: 500 }
    );
  }
}

