import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import {
  KAISER_PORTAL_MIF_UPLOADS_COLLECTION,
  compareKaiserPortalMifUploads,
  serializePortalMembersForStorage,
  type KaiserMifCompareMember,
  type KaiserPortalMifStoredMember,
  type KaiserPortalMifUploadRecord,
  type KaiserPortalMifUploadSummary,
} from '@/lib/kaiser-mif-compare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function asSummary(id: string, data: Record<string, unknown>): KaiserPortalMifUploadSummary {
  return {
    id,
    fileName: String(data.fileName || ''),
    sheetName: String(data.sheetName || ''),
    headerRow: Number(data.headerRow || 0) || 0,
    rowCount: Number(data.rowCount || 0) || 0,
    rowsWithMrn: Number(data.rowsWithMrn || 0) || 0,
    rowsWithCin: Number(data.rowsWithCin || 0) || 0,
    uploadedAt: String(data.uploadedAt || ''),
    uploadedByUid: String(data.uploadedByUid || ''),
    uploadedByEmail: String(data.uploadedByEmail || ''),
    uploadedByName: String(data.uploadedByName || ''),
  };
}

function asRecord(id: string, data: Record<string, unknown>): KaiserPortalMifUploadRecord {
  return {
    ...asSummary(id, data),
    members: Array.isArray(data.members) ? (data.members as KaiserPortalMifStoredMember[]) : [],
  };
}

/** GET: list summaries, or one upload (`?id=`), or diff two uploads (`?baselineId=&newerId=`). */
export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const { adminDb } = authz;
    const id = String(request.nextUrl.searchParams.get('id') || '').trim();
    const baselineId = String(request.nextUrl.searchParams.get('baselineId') || '').trim();
    const newerId = String(request.nextUrl.searchParams.get('newerId') || '').trim();
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 30;

    if (baselineId && newerId) {
      const [baselineSnap, newerSnap] = await Promise.all([
        adminDb.collection(KAISER_PORTAL_MIF_UPLOADS_COLLECTION).doc(baselineId).get(),
        adminDb.collection(KAISER_PORTAL_MIF_UPLOADS_COLLECTION).doc(newerId).get(),
      ]);
      if (!baselineSnap.exists || !newerSnap.exists) {
        return NextResponse.json(
          { success: false, error: 'One or both portal uploads were not found.' },
          { status: 404 }
        );
      }
      const baseline = asRecord(baselineSnap.id, baselineSnap.data() || {});
      const newer = asRecord(newerSnap.id, newerSnap.data() || {});
      const diff = compareKaiserPortalMifUploads({ baseline, newer });
      return NextResponse.json({ success: true, baseline, newer, diff });
    }

    if (id) {
      const snap = await adminDb.collection(KAISER_PORTAL_MIF_UPLOADS_COLLECTION).doc(id).get();
      if (!snap.exists) {
        return NextResponse.json({ success: false, error: 'Portal upload not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, upload: asRecord(snap.id, snap.data() || {}) });
    }

    const snap = await adminDb
      .collection(KAISER_PORTAL_MIF_UPLOADS_COLLECTION)
      .orderBy('uploadedAt', 'desc')
      .limit(limit)
      .get();
    const uploads = snap.docs.map((doc: { id: string; data: () => Record<string, unknown> }) =>
      asSummary(doc.id, doc.data() || {})
    );
    return NextResponse.json({ success: true, uploads });
  } catch (error: unknown) {
    console.error('[kaiser-mif-compare/uploads GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to load portal uploads.'),
      },
      { status: 500 }
    );
  }
}

/** POST: save a parsed portal MIF upload to Firestore. */
export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const fileName = String(body?.fileName || '').trim();
    const sheetName = String(body?.sheetName || '').trim();
    const headerRow = Number(body?.headerRow || 0) || 0;
    const rowsWithMrn = Number(body?.rowsWithMrn || 0) || 0;
    const rowsWithCin = Number(body?.rowsWithCin || 0) || 0;
    const membersInput = Array.isArray(body?.members) ? body.members : [];
    if (!fileName) {
      return NextResponse.json({ success: false, error: 'fileName is required.' }, { status: 400 });
    }
    if (!membersInput.length) {
      return NextResponse.json({ success: false, error: 'members array is required.' }, { status: 400 });
    }

    const members = serializePortalMembersForStorage(membersInput as KaiserMifCompareMember[]);
    const uploadedAt = new Date().toISOString();
    const payload = {
      fileName,
      sheetName,
      headerRow,
      rowCount: members.length,
      rowsWithMrn,
      rowsWithCin,
      members,
      uploadedAt,
      uploadedByUid: authz.uid || '',
      uploadedByEmail: authz.email || '',
      uploadedByName: authz.name || '',
    };

    const docRef = await authz.adminDb.collection(KAISER_PORTAL_MIF_UPLOADS_COLLECTION).add(payload);
    return NextResponse.json({
      success: true,
      upload: asSummary(docRef.id, payload),
    });
  } catch (error: unknown) {
    console.error('[kaiser-mif-compare/uploads POST]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to save portal upload.'),
      },
      { status: 500 }
    );
  }
}
