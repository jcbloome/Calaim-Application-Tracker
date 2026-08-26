import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  ILS_MIF_AUDIT_COLLECTION,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
} from '@/lib/ils-mif-parse';

/** Admin SDK batch limit is 500 ops; stay under for safety. */
const ADMIN_BATCH_SIZE = 400;

const clean = (value: unknown) => String(value ?? '').trim();

async function commitAdminChunks(
  adminDb: Firestore,
  writes: Array<(batch: WriteBatch) => void>
) {
  for (let i = 0; i < writes.length; i += ADMIN_BATCH_SIZE) {
    const chunk = writes.slice(i, i + ADMIN_BATCH_SIZE);
    const batch = adminDb.batch();
    chunk.forEach((apply) => apply(batch));
    await batch.commit();
  }
}

function collectMemberWrites(
  adminDb: Firestore,
  runId: string,
  members: unknown[]
) {
  const masterWrites: Array<(batch: WriteBatch) => void> = [];
  const runWrites: Array<(batch: WriteBatch) => void> = [];

  for (const entry of members) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const key = clean(row.key || row.dedupeKey).replace(/[\/#?[\]]/g, '_').slice(0, 700);
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    if (!key || !payload) continue;

    masterWrites.push((batch) => {
      batch.set(adminDb.collection(ILS_MIF_MASTER_COLLECTION).doc(key), payload, { merge: true });
    });
    runWrites.push((batch) => {
      batch.set(
        adminDb
          .collection(ILS_MIF_CONSOLIDATION_RUNS_COLLECTION)
          .doc(runId)
          .collection(ILS_MIF_RUN_MEMBERS_SUBCOLLECTION)
          .doc(key),
        payload,
        { merge: true }
      );
    });
  }

  return { masterWrites, runWrites };
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireTwoFactor: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const phase = clean(body.phase || 'full') || 'full';
    const runId = clean(body.runId);
    const createdAtIso = clean(body.createdAtIso) || new Date().toISOString();
    const runLabel = clean(body.runLabel) || new Date(createdAtIso).toLocaleString();
    const actor = clean(body.updatedBy) || authz.email || authz.uid;
    const sourceFiles = Array.isArray(body.sourceFiles)
      ? body.sourceFiles.map((name: unknown) => clean(name)).filter(Boolean)
      : [];
    const totals =
      body.totals && typeof body.totals === 'object' && !Array.isArray(body.totals)
        ? (body.totals as Record<string, unknown>)
        : {};
    const monthlyNewMembers =
      body.monthlyNewMembers &&
      typeof body.monthlyNewMembers === 'object' &&
      !Array.isArray(body.monthlyNewMembers)
        ? (body.monthlyNewMembers as Record<string, number>)
        : {};
    const runCounts =
      body.runCounts && typeof body.runCounts === 'object' && !Array.isArray(body.runCounts)
        ? (body.runCounts as Record<string, unknown>)
        : {};
    const members = Array.isArray(body.members) ? body.members : [];
    const uploadFileIds = Array.isArray(body.uploadFileIds)
      ? body.uploadFileIds.map((id: unknown) => clean(id)).filter(Boolean)
      : [];

    if (!runId) {
      return NextResponse.json({ success: false, error: 'runId is required' }, { status: 400 });
    }

    const adminDb = authz.adminDb as Firestore;
    const memberCount = Number(totals.total || members.length) || members.length;

    if (phase === 'init' || phase === 'full') {
      const headerBatch = adminDb.batch();
      headerBatch.set(
        adminDb.collection(ILS_MIF_MASTER_COLLECTION).doc('_meta'),
        {
          updatedAt: createdAtIso,
          updatedAtServer: FieldValue.serverTimestamp(),
          updatedBy: actor,
          sourceFiles,
          totals,
          memberCount,
          latestRunId: runId,
          latestRunAtIso: createdAtIso,
          monthlyNewMembers,
          monthlyNewMembersUpdatedAtIso: createdAtIso,
        },
        { merge: true }
      );
      headerBatch.set(adminDb.collection(ILS_MIF_CONSOLIDATION_RUNS_COLLECTION).doc(runId), {
        createdAtIso,
        createdAtServer: FieldValue.serverTimestamp(),
        label: runLabel,
        sourceFiles,
        totals,
        memberCount,
        newMemberCount: Number(runCounts.newMemberCount || 0) || 0,
        brandNewMasterCount: Number(runCounts.brandNewMasterCount || 0) || 0,
        caspioMemberCount: Number(runCounts.caspioMemberCount || 0) || 0,
        northernMemberCount: Number(runCounts.northernMemberCount || 0) || 0,
        declinedMemberCount: Number(runCounts.declinedMemberCount || 0) || 0,
        createdBy: actor,
      });
      await headerBatch.commit();

      if (uploadFileIds.length) {
        const linkWrites = uploadFileIds.map(
          (fileId) => (batch: WriteBatch) => {
            batch.set(
              adminDb.collection(ILS_MIF_UPLOADED_FILES_COLLECTION).doc(fileId),
              { runId, linkedRunAtIso: createdAtIso },
              { merge: true }
            );
          }
        );
        await commitAdminChunks(adminDb, linkWrites);
      }
    }

    if ((phase === 'members' || phase === 'full' || phase === 'init') && members.length) {
      const { masterWrites, runWrites } = collectMemberWrites(adminDb, runId, members);
      await commitAdminChunks(adminDb, masterWrites);
      await commitAdminChunks(adminDb, runWrites);

      if (phase === 'members') {
        return NextResponse.json({
          success: true,
          runId,
          phase,
          masterWrites: masterWrites.length,
          runWrites: runWrites.length,
        });
      }
    }

    if (phase === 'finalize' || phase === 'full') {
      await adminDb.collection(ILS_MIF_AUDIT_COLLECTION).add({
        action: 'run_saved',
        message: `Saved consolidation run ${runLabel}`,
        runId,
        memberCount,
        sourceFileCount: sourceFiles.length,
        brandNewMasterCount: Number(runCounts.brandNewMasterCount || 0) || 0,
        actor,
        createdAtIso,
        createdAtServer: FieldValue.serverTimestamp(),
      });
    }

    if (phase === 'members' && !members.length) {
      return NextResponse.json(
        { success: false, error: 'No master members were provided to save.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      runId,
      phase,
      memberCount,
      actor,
    });
  } catch (error: any) {
    console.error('ILS MIF save-master failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to save ILS MIF master list'),
      },
      { status: 500 }
    );
  }
}
