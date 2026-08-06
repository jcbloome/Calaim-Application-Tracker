import { NextRequest, NextResponse } from 'next/server';
import { default as admin, adminDb } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value ?? '').trim();

const toIso = (value: any) => {
  if (value && typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.toISOString() : null;
  }
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const snapshotId = clean(req.nextUrl.searchParams.get('snapshotId'));
    if (snapshotId) {
      const docSnap = await adminDb.collection('admin_operation_snapshots').doc(snapshotId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ success: false, error: 'Snapshot not found.' }, { status: 404 });
      }
      const data = (docSnap.data() || {}) as any;
      return NextResponse.json({
        success: true,
        snapshot: {
          snapshotId: docSnap.id,
          scope: clean(data.scope) || null,
          status: clean(data.status) || null,
          label: clean(data.label) || null,
          batchId: clean(data.batchId) || null,
          applicationId: clean(data.applicationId) || null,
          payload: data.payload || null,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
          createdByEmail: clean(data.createdByEmail) || null,
          updatedByEmail: clean(data.updatedByEmail) || null,
        },
      });
    }

    const scope = clean(req.nextUrl.searchParams.get('scope'));
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 20), 1), 100);
    let query: FirebaseFirestore.Query = adminDb.collection('admin_operation_snapshots');
    if (scope) query = query.where('scope', '==', scope);
    const snap = await query.orderBy('createdAt', 'desc').limit(limit).get();
    const snapshots = snap.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as any;
      return {
        snapshotId: docSnap.id,
        scope: clean(data.scope) || null,
        status: clean(data.status) || null,
        label: clean(data.label) || null,
        batchId: clean(data.batchId) || null,
        applicationId: clean(data.applicationId) || null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });
    return NextResponse.json({ success: true, snapshots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || 'Failed to load operation snapshots.') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const body = (await req.json().catch(() => ({} as any))) as any;
    const scope = clean(body?.scope);
    if (!scope) {
      return NextResponse.json({ success: false, error: 'scope is required.' }, { status: 400 });
    }

    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
    const batchId = clean(body?.batchId) || `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const label = clean(body?.label) || `${scope} snapshot`;
    const status = clean(body?.status) || 'prepared';
    const applicationId = clean(body?.applicationId) || null;

    const docRef = await adminDb.collection('admin_operation_snapshots').add({
      scope,
      status,
      label,
      batchId,
      applicationId,
      payload,
      createdByUid: authz.uid,
      createdByEmail: authz.email || null,
      updatedByUid: authz.uid,
      updatedByEmail: authz.email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await adminDb.collection('system_note_log').add({
      type: 'admin_operation_snapshot_created',
      scope,
      status,
      snapshotId: docRef.id,
      batchId,
      applicationId,
      actorUid: authz.uid,
      actorEmail: authz.email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      snapshotId: docRef.id,
      batchId,
      scope,
      status,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || 'Failed to create operation snapshot.') }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });

    const body = (await req.json().catch(() => ({} as any))) as any;
    const snapshotId = clean(body?.snapshotId);
    if (!snapshotId) {
      return NextResponse.json({ success: false, error: 'snapshotId is required.' }, { status: 400 });
    }
    const patch: Record<string, any> = {};
    if (body?.status !== undefined) patch.status = clean(body.status) || 'updated';
    if (body?.label !== undefined) patch.label = clean(body.label) || null;
    if (body?.applicationId !== undefined) patch.applicationId = clean(body.applicationId) || null;
    if (body?.payload && typeof body.payload === 'object') patch.payload = body.payload;
    if (body?.payloadMerge && typeof body.payloadMerge === 'object') {
      patch.payload = admin.firestore.FieldValue.delete();
    }
    patch.updatedByUid = authz.uid;
    patch.updatedByEmail = authz.email || null;
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    const docRef = adminDb.collection('admin_operation_snapshots').doc(snapshotId);
    const currentSnap = await docRef.get();
    if (!currentSnap.exists) {
      return NextResponse.json({ success: false, error: 'Snapshot not found.' }, { status: 404 });
    }

    if (body?.payloadMerge && typeof body.payloadMerge === 'object') {
      const currentPayload = (((currentSnap.data() || {}) as any).payload || {}) as Record<string, any>;
      patch.payload = { ...currentPayload, ...body.payloadMerge };
    }

    await docRef.set(patch, { merge: true });
    return NextResponse.json({ success: true, snapshotId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || 'Failed to update snapshot.') }, { status: 500 });
  }
}

