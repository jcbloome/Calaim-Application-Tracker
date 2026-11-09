import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

const MEMBER_ID_FIELDS = [
  'memberId',
  'memberClientId',
  'clientId2',
  'Client_ID2',
  'client_ID2',
  'caspioMatchedClientId2',
  'caspioClientId2',
] as const;

function remapMemberIdFields(data: Record<string, unknown>, fromId: string, toId: string) {
  const next: Record<string, unknown> = { ...data };
  for (const field of MEMBER_ID_FIELDS) {
    const current = clean(next[field], 160);
    if (current && current === fromId) {
      next[field] = toId;
    }
  }
  return next;
}

/**
 * Move ISP/ALFT Firestore data from one Caspio Client_ID2 to another.
 * Used when a duplicate Caspio member id was retired (e.g. 11470 → 11461 for Raquel Lara).
 */
export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      fromClientId2?: string;
      toClientId2?: string;
      deleteStaleCache?: boolean;
    };

    const fromId = clean(body?.fromClientId2, 160);
    const toId = clean(body?.toClientId2, 160);
    const deleteStaleCache = body?.deleteStaleCache !== false;

    if (!fromId || !toId) {
      return NextResponse.json(
        { success: false, error: 'fromClientId2 and toClientId2 are required.' },
        { status: 400 }
      );
    }
    if (fromId === toId) {
      return NextResponse.json(
        { success: false, error: 'fromClientId2 and toClientId2 must be different.' },
        { status: 400 }
      );
    }

    const adminModule = await import('@/firebase-admin');
    const admin = adminModule.default;
    const adminDb = authCheck.adminDb;
    const nowIso = new Date().toISOString();

    const fromAssignmentRef = adminDb.collection('alft_assignments').doc(fromId);
    const toAssignmentRef = adminDb.collection('alft_assignments').doc(toId);
    const [fromAssignmentSnap, toAssignmentSnap] = await Promise.all([
      fromAssignmentRef.get(),
      toAssignmentRef.get(),
    ]);

    let assignmentMoved = false;
    let assignmentMerged = false;
    if (fromAssignmentSnap.exists) {
      const fromData = remapMemberIdFields(
        (fromAssignmentSnap.data() || {}) as Record<string, unknown>,
        fromId,
        toId
      );
      const toData = toAssignmentSnap.exists
        ? ((toAssignmentSnap.data() || {}) as Record<string, unknown>)
        : null;

      // Prefer the source ISP when it has an intake and destination does not.
      // Otherwise merge source on top of destination so SW progress is preserved under toId.
      const fromHasIntake = Boolean(clean(fromData.latestIntakeId, 160));
      const toHasIntake = Boolean(clean(toData?.latestIntakeId, 160));
      const preferFrom = !toData || (fromHasIntake && !toHasIntake);

      const merged = preferFrom
        ? {
            ...(toData || {}),
            ...fromData,
            memberId: toId,
            remappedFromClientId2: fromId,
            remappedToClientId2: toId,
            remappedAtIso: nowIso,
            remappedByUid: authCheck.uid,
            remappedByEmail: authCheck.email || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
              event: 'remapped_client_id',
              atIso: nowIso,
              byName: authCheck.email || 'Admin',
              byEmail: authCheck.email || null,
              details: `ISP remapped from Client_ID2 ${fromId} → ${toId}`,
            }),
          }
        : {
            ...fromData,
            ...(toData || {}),
            memberId: toId,
            remappedFromClientId2: fromId,
            remappedToClientId2: toId,
            remappedAtIso: nowIso,
            remappedByUid: authCheck.uid,
            remappedByEmail: authCheck.email || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ispWorkflowActivityLog: admin.firestore.FieldValue.arrayUnion({
              event: 'remapped_client_id',
              atIso: nowIso,
              byName: authCheck.email || 'Admin',
              byEmail: authCheck.email || null,
              details: `Kept existing ${toId} ISP and archived source ${fromId}`,
            }),
          };

      await toAssignmentRef.set(merged, { merge: true });
      await fromAssignmentRef.set(
        {
          status: 'remapped_to_other_client_id',
          workflowStatus: 'remapped_to_other_client_id',
          remappedToClientId2: toId,
          remappedAtIso: nowIso,
          remappedByUid: authCheck.uid,
          remappedByEmail: authCheck.email || null,
          ispTrackerSoftDeleted: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      assignmentMoved = true;
      assignmentMerged = Boolean(toData);
    }

    const intakeQueryFields = ['memberId', 'memberClientId', 'clientId2', 'Client_ID2', 'caspioMatchedClientId2'];
    const intakeRefs = new Map<string, any>();
    for (const field of intakeQueryFields) {
      try {
        const snap = await adminDb
          .collection('standalone_upload_submissions')
          .where(field, '==', fromId)
          .limit(100)
          .get();
        snap.docs.forEach((doc: any) => {
          intakeRefs.set(String(doc.id), doc.ref);
        });
      } catch {
        // best-effort per field (index may be missing)
      }
    }

    let intakesUpdated = 0;
    for (const ref of intakeRefs.values()) {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = remapMemberIdFields((snap.data() || {}) as Record<string, unknown>, fromId, toId);
      await ref.set(
        {
          ...data,
          memberId: toId,
          remappedFromClientId2: fromId,
          remappedToClientId2: toId,
          remappedAtIso: nowIso,
          remappedByUid: authCheck.uid,
          remappedByEmail: authCheck.email || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      intakesUpdated += 1;
    }

    let signatureRequestsUpdated = 0;
    try {
      const sigSnap = await adminDb
        .collection('alft_signature_requests')
        .where('memberId', '==', fromId)
        .limit(100)
        .get();
      for (const doc of sigSnap.docs) {
        await doc.ref.set(
          {
            memberId: toId,
            remappedFromClientId2: fromId,
            remappedToClientId2: toId,
            remappedAtIso: nowIso,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        signatureRequestsUpdated += 1;
      }
    } catch {
      // optional index
    }

    let cacheDeleted = false;
    if (deleteStaleCache) {
      const cacheRef = adminDb.collection('caspio_members_cache').doc(fromId);
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        await cacheRef.delete();
        cacheDeleted = true;
      }
    }

    return NextResponse.json({
      success: true,
      fromClientId2: fromId,
      toClientId2: toId,
      assignmentMoved,
      assignmentMerged,
      intakesUpdated,
      signatureRequestsUpdated,
      cacheDeleted,
      message: `ISP remapped ${fromId} → ${toId} (intakes ${intakesUpdated}, signatures ${signatureRequestsUpdated}${
        cacheDeleted ? ', stale cache removed' : ''
      }).`,
    });
  } catch (error: any) {
    console.error('[alft/assignment/remap-client-id]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to remap ISP Client_ID2.' },
      { status: 500 }
    );
  }
}
