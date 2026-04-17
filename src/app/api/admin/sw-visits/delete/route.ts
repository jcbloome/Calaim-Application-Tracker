import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!adminCheck.ok) {
      return NextResponse.json({ success: false, error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const visitId = String(body?.visitId || '').trim();
    const reason = String(body?.reason || '').trim();
    if (!visitId) return NextResponse.json({ success: false, error: 'visitId is required' }, { status: 400 });
    if (!reason) return NextResponse.json({ success: false, error: 'Delete reason is required' }, { status: 400 });

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = adminModule.adminDb;

    const actorUid = adminCheck.uid;
    const actorEmail = adminCheck.email;
    const actorName = adminCheck.name;
    const actorLabel = String(actorName || actorEmail || 'Admin').trim();

    // Allow delete if Super Admin OR explicitly granted permission in Staff Management.
    // Stored as an array of allowed UIDs (and legacy email IDs) in system_settings/notifications.swVisitDeletePermissions.
    if (!adminCheck.isSuperAdmin) {
      const notifSnap = await adminDb.collection('system_settings').doc('notifications').get();
      const allowedRaw = notifSnap.exists ? (notifSnap.data() as any)?.swVisitDeletePermissions : null;
      const allowed: string[] = Array.isArray(allowedRaw) ? allowedRaw.map((x) => String(x || '').trim()).filter(Boolean) : [];
      const canDelete = allowed.includes(actorUid) || (actorEmail ? allowed.includes(String(actorEmail).trim().toLowerCase()) : false);
      if (!canDelete) {
        return NextResponse.json(
          {
            success: false,
            error: 'Delete permission required. Enable “SW visit delete” for this staff user in Staff Management.',
          },
          { status: 403 }
        );
      }
    }

    const visitRef = adminDb.collection('sw_visit_records').doc(visitId);
    const snap = await visitRef.get();
    if (!snap.exists) return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });

    const visit = snap.data() as any;
    const claimId = String(visit?.claimId || '').trim();
    const memberId = String(visit?.memberId || '').trim();
    const visitMonth = String(visit?.visitMonth || '').trim();
    const lockKey = memberId && visitMonth ? `${memberId}_${visitMonth}` : '';

    const nowIso = new Date().toISOString();

    // Audit snapshot
    const auditRef = adminDb.collection('sw_visit_deletions').doc();
    await auditRef.set(
      {
        id: auditRef.id,
        visitId,
        reason,
        actorUid,
        actorEmail,
        actorName: actorLabel,
        deletedAtIso: nowIso,
        claimId: claimId || null,
        lockKey: lockKey || null,
        visitSnapshot: visit,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Best-effort: remove from claim if linked
    if (claimId) {
      try {
        await adminDb.runTransaction(async (tx) => {
          const claimRef = adminDb.collection('sw-claims').doc(claimId);
          const claimSnap = await tx.get(claimRef);
          if (!claimSnap.exists) return;
          const claim = claimSnap.data() as any;
          const visitIds: string[] = Array.isArray(claim?.visitIds) ? claim.visitIds : [];
          const nextVisitIds = visitIds.filter((id) => String(id || '').trim() !== visitId);

          const memberVisits: any[] = Array.isArray(claim?.memberVisits) ? claim.memberVisits : [];
          const nextMemberVisits = memberVisits.filter((v) => String(v?.id || v?.visitId || '').trim() !== visitId);

          const visitFeeRate = Number(claim?.visitFeeRate || 45) || 45;
          const gasAmount = nextVisitIds.length > 0 ? Number(claim?.gasAmount || 20) || 20 : 0;
          const visitCount = nextVisitIds.length;
          const totalMemberVisitFees = visitCount * visitFeeRate;
          const totalAmount = totalMemberVisitFees + gasAmount;

          tx.set(
            claimRef,
            {
              visitIds: nextVisitIds,
              visitCount,
              memberVisits: nextMemberVisits,
              gasAmount,
              gasReimbursement: gasAmount,
              totalMemberVisitFees,
              totalAmount,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });
      } catch (e) {
        console.warn('⚠️ Visit delete: failed updating claim (best-effort):', e);
      }
    }

    // Best-effort: release monthly lock if it points to this visit.
    if (lockKey) {
      try {
        const lockRef = adminDb.collection('sw_member_monthly_visits').doc(lockKey);
        const lockSnap = await lockRef.get();
        const existingVisitId = lockSnap.exists ? String((lockSnap.data() as any)?.visitId || '').trim() : '';
        if (existingVisitId === visitId) {
          await lockRef.delete();
        }
      } catch (e) {
        console.warn('⚠️ Visit delete: failed releasing monthly lock (best-effort):', e);
      }
    }

    // Delete visit itself
    await visitRef.delete();

    return NextResponse.json({ success: true, visitId, claimId: claimId || null, auditId: auditRef.id });
  } catch (error: any) {
    console.error('❌ Error deleting SW visit:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete visit' },
      { status: 500 }
    );
  }
}

