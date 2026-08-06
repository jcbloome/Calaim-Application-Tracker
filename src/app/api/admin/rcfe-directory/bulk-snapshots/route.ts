import { NextRequest, NextResponse } from 'next/server';
import { default as admin, adminDb } from '@/firebase-admin';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SnapshotRowValues = {
  contactPerson?: string;
  email?: string;
  phone?: string;
  npiNumber?: string;
  licenseNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
};

type SnapshotRow = {
  rowKey: string;
  facilityName: string;
  memberIds: string[];
  rcfeRegisteredIds: string[];
  changedFields: string[];
  previousValues: SnapshotRowValues;
  currentValues: SnapshotRowValues;
};

const clean = (value: unknown) => String(value ?? '').trim();
const normalizeArray = (value: unknown) =>
  Array.isArray(value) ? value.map((entry) => clean(entry)).filter(Boolean) : [];
const asTimestampIso = (value: any) => {
  if (value && typeof value?.toDate === 'function') {
    const date = value.toDate();
    return Number.isFinite(date?.getTime?.()) ? date.toISOString() : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export async function GET(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const snapshotId = clean(req.nextUrl.searchParams.get('snapshotId'));
    if (snapshotId) {
      const docSnap = await adminDb.collection('rcfe_bulk_operation_snapshots').doc(snapshotId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ success: false, error: 'Snapshot not found.' }, { status: 404 });
      }
      const data = (docSnap.data() || {}) as any;
      return NextResponse.json({
        success: true,
        snapshot: {
          snapshotId: docSnap.id,
          createdAt: asTimestampIso(data.createdAt),
          createdByEmail: clean(data.createdByEmail) || null,
          batchId: clean(data.batchId) || null,
          label: clean(data.label) || null,
          rowCount: Number(data.rowCount || 0),
          rows: Array.isArray(data.rows) ? data.rows : [],
        },
      });
    }

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 15), 1), 50);
    const snap = await adminDb
      .collection('rcfe_bulk_operation_snapshots')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const snapshots = snap.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as any;
      return {
        snapshotId: docSnap.id,
        createdAt: asTimestampIso(data.createdAt),
        createdByEmail: clean(data.createdByEmail) || null,
        batchId: clean(data.batchId) || null,
        label: clean(data.label) || null,
        rowCount: Number(data.rowCount || 0),
        changedFieldCount: Number(data.changedFieldCount || 0),
      };
    });

    return NextResponse.json({ success: true, snapshots });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || 'Failed to load snapshots.') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const body = (await req.json().catch(() => ({} as any))) as any;
    const label = clean(body?.label) || 'RCFE bulk operation snapshot';
    const clientBatchId = clean(body?.batchId);
    const rowsRaw = Array.isArray(body?.rows) ? body.rows : [];
    const rows: SnapshotRow[] = rowsRaw
      .map((row: any) => {
        const changedFields = normalizeArray(row?.changedFields);
        return {
          rowKey: clean(row?.rowKey),
          facilityName: clean(row?.facilityName),
          memberIds: normalizeArray(row?.memberIds),
          rcfeRegisteredIds: normalizeArray(row?.rcfeRegisteredIds),
          changedFields,
          previousValues: (row?.previousValues || {}) as SnapshotRowValues,
          currentValues: (row?.currentValues || {}) as SnapshotRowValues,
        } as SnapshotRow;
      })
      .filter((row) => row.rowKey && row.facilityName && (row.memberIds.length > 0 || row.rcfeRegisteredIds.length > 0));

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid snapshot rows were provided.' }, { status: 400 });
    }

    const batchId =
      clientBatchId ||
      `rcfe-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;
    const changedFieldCount = rows.reduce((sum, row) => sum + row.changedFields.length, 0);
    const docRef = await adminDb.collection('rcfe_bulk_operation_snapshots').add({
      type: 'rcfe_bulk_operation_snapshot',
      label,
      batchId,
      rowCount: rows.length,
      changedFieldCount,
      rows,
      createdByUid: authz.uid,
      createdByEmail: authz.email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await adminDb.collection('system_note_log').add({
      type: 'rcfe_bulk_snapshot_created',
      snapshotId: docRef.id,
      batchId,
      rowCount: rows.length,
      changedFieldCount,
      actorUid: authz.uid,
      actorEmail: authz.email || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      snapshotId: docRef.id,
      batchId,
      rowCount: rows.length,
      changedFieldCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to create bulk snapshot.') },
      { status: 500 }
    );
  }
}

