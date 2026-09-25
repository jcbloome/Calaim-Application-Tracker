import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  coverSheetPackageDocsComplete,
  missingCoverSheetPackageChecklist,
  normalizeCoverSheetIspSource,
  normalizeCoverSheetPlacementType,
  type CoverSheetPackageDocKey,
  type CoverSheetPackageFile,
  type CoverSheetPackageType,
} from '@/lib/alft-cover-sheet-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'alft_cover_sheet_packages';
const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

const toIso = (value: unknown) => {
  try {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate?.toDate === 'function') {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    }
    const d = new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  } catch {
    return '';
  }
};

const normalizePackageType = (value: unknown): CoverSheetPackageType =>
  String(value || '').trim().toLowerCase() === 'reassessment' ? 'reassessment' : 'initial';

const normalizeFile = (raw: unknown): CoverSheetPackageFile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const fileName = clean(row.fileName, 240);
  const downloadURL = clean(row.downloadURL, 2000);
  if (!fileName || !downloadURL) return null;
  const out: CoverSheetPackageFile = {
    fileName,
    downloadURL,
    source: (clean(row.source, 40) as CoverSheetPackageFile['source']) || 'upload',
  };
  const storagePath = clean(row.storagePath, 900);
  if (storagePath) out.storagePath = storagePath;
  const contentType = clean(row.contentType, 120);
  if (contentType) out.contentType = contentType;
  const uploadedAtIso = clean(row.uploadedAtIso, 80);
  if (uploadedAtIso) out.uploadedAtIso = uploadedAtIso;
  const uploadedByName = clean(row.uploadedByName, 160);
  if (uploadedByName) out.uploadedByName = uploadedByName;
  const uploadedByEmail = clean(row.uploadedByEmail, 220).toLowerCase();
  if (uploadedByEmail) out.uploadedByEmail = uploadedByEmail;
  const sourceLogId = clean(row.sourceLogId, 120);
  if (sourceLogId) out.sourceLogId = sourceLogId;
  const sourceApplicationId = clean(row.sourceApplicationId, 120);
  if (sourceApplicationId) out.sourceApplicationId = sourceApplicationId;
  return out;
};

const serializePackage = (id: string, data: Record<string, any>) => {
  const packageType = normalizePackageType(data.packageType);
  const placementType = normalizeCoverSheetPlacementType(data.placementType);
  const ispSource = normalizeCoverSheetIspSource(data.ispSource);
  const homeVettedByIls = Boolean(data.homeVettedByIls);
  const rcfeVettedByIls = Boolean(data.rcfeVettedByIls);
  const managerVerified = Boolean(data.managerVerified || data.managerVerification?.verified);
  const docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {
    isp: normalizeFile(data.docs?.isp),
    coversheet: normalizeFile(data.docs?.coversheet),
    proofOfIncome: normalizeFile(data.docs?.proofOfIncome),
    roomAndBoardStatement: normalizeFile(data.docs?.roomAndBoardStatement),
    rcfeW9: normalizeFile(data.docs?.rcfeW9),
    proofOfLicense: normalizeFile(data.docs?.proofOfLicense),
    proofOfInsurance: normalizeFile(data.docs?.proofOfInsurance),
  };
  const docsComplete = coverSheetPackageDocsComplete(packageType, docs, {
    placementType,
    homeVettedByIls,
    rcfeVettedByIls,
  });
  const missing = missingCoverSheetPackageChecklist(packageType, docs, {
    placementType,
    homeVettedByIls,
    rcfeVettedByIls,
    managerVerified,
  });
  return {
    id,
    memberClientId: clean(data.memberClientId, 80),
    memberName: clean(data.memberName, 200),
    memberMrn: clean(data.memberMrn, 80),
    packageType,
    placementType,
    ispSource,
    homeVettedByIls,
    rcfeVettedByIls,
    managerVerified,
    managerVerifiedAt: toIso(data.managerVerifiedAt) || clean(data.managerVerifiedAtIso),
    managerVerifiedByEmail: clean(data.managerVerifiedByEmail, 220).toLowerCase(),
    managerVerifiedByName: clean(data.managerVerifiedByName, 160),
    docs,
    linkedIspDownloadLogId: clean(data.linkedIspDownloadLogId, 120) || null,
    linkedCoverDownloadLogId: clean(data.linkedCoverDownloadLogId, 120) || null,
    linkedApplicationId: clean(data.linkedApplicationId, 120) || null,
    status: clean(data.status, 40) || (missing.length ? 'draft' : 'ready'),
    missingLabels: missing.map((m) => m.label),
    docsComplete,
    readyToSend: missing.length === 0,
    sentAt: toIso(data.sentAt) || clean(data.sentAtIso),
    sentTo: clean(data.sentTo, 200).toLowerCase(),
    staffName: clean(data.staffName, 160),
    staffEmail: clean(data.staffEmail, 220).toLowerCase(),
    createdAt: toIso(data.createdAt) || clean(data.createdAtIso),
    updatedAt: toIso(data.updatedAt) || clean(data.updatedAtIso),
    notes: clean(data.notes, 2000),
  };
};

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const packageId = clean(req.nextUrl.searchParams.get('packageId'), 120);
    const memberClientId = clean(req.nextUrl.searchParams.get('memberClientId'), 80);
    const memberMrn = clean(req.nextUrl.searchParams.get('memberMrn'), 80);
    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

    if (packageId) {
      const snap = await adminDb.collection(COLLECTION).doc(packageId).get();
      if (!snap.exists) {
        return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, package: serializePackage(snap.id, snap.data() || {}) });
    }

    let query: any = adminDb.collection(COLLECTION).orderBy('updatedAt', 'desc').limit(limit);
    if (memberClientId) {
      query = adminDb
        .collection(COLLECTION)
        .where('memberClientId', '==', memberClientId)
        .orderBy('updatedAt', 'desc')
        .limit(limit);
    } else if (memberMrn) {
      query = adminDb
        .collection(COLLECTION)
        .where('memberMrn', '==', memberMrn)
        .orderBy('updatedAt', 'desc')
        .limit(limit);
    }

    const snap = await query.get().catch(async () =>
      adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get()
    );

    const packages = snap.docs
      .map((doc) => serializePackage(doc.id, doc.data() || {}))
      .filter((row) => {
        if (memberClientId && row.memberClientId !== memberClientId) return false;
        if (memberMrn && row.memberMrn !== memberMrn) return false;
        return true;
      });

    return NextResponse.json({ success: true, packages });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load cover sheet packages') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const packageId = clean(body.packageId, 120);
    const memberClientId = clean(body.memberClientId, 80);
    const memberName = clean(body.memberName, 200);
    const memberMrn = clean(body.memberMrn, 80);
    const packageType = normalizePackageType(body.packageType);
    const notes = clean(body.notes, 2000);

    if (!memberClientId && !memberMrn) {
      return NextResponse.json(
        { success: false, error: 'memberClientId or memberMrn is required' },
        { status: 400 }
      );
    }
    if (!memberName) {
      return NextResponse.json({ success: false, error: 'memberName is required' }, { status: 400 });
    }

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const nowIso = new Date().toISOString();

    let ref = packageId ? adminDb.collection(COLLECTION).doc(packageId) : null;
    let existing: Record<string, any> = {};
    if (ref) {
      const snap = await ref.get();
      if (snap.exists) existing = snap.data() || {};
    } else if (memberClientId) {
      const existingSnap = await adminDb
        .collection(COLLECTION)
        .where('memberClientId', '==', memberClientId)
        .where('packageType', '==', packageType)
        .limit(5)
        .get()
        .catch(() => null);
      const active = existingSnap?.docs.find((d) => String(d.data()?.status || '') !== 'sent') || existingSnap?.docs[0];
      if (active) {
        ref = active.ref;
        existing = active.data() || {};
      }
    }
    if (!ref) ref = adminDb.collection(COLLECTION).doc();

    const nextDocs = { ...(existing.docs || {}) } as Record<string, unknown>;
    const incomingDocs = (body.docs || {}) as Record<string, unknown>;
    for (const key of Object.keys(incomingDocs)) {
      const file = normalizeFile(incomingDocs[key]);
      if (file) nextDocs[key] = file;
      else if (incomingDocs[key] === null) delete nextDocs[key];
    }

    const removeDocKey = clean(body.removeDocKey, 60) as CoverSheetPackageDocKey;
    if (removeDocKey) delete nextDocs[removeDocKey];

    const placementType = normalizeCoverSheetPlacementType(
      body.placementType !== undefined ? body.placementType : existing.placementType
    );
    const ispSource = normalizeCoverSheetIspSource(
      body.ispSource !== undefined ? body.ispSource : existing.ispSource
    );
    const homeVettedByIls =
      body.homeVettedByIls !== undefined
        ? Boolean(body.homeVettedByIls)
        : Boolean(existing.homeVettedByIls);
    const rcfeVettedByIls =
      body.rcfeVettedByIls !== undefined
        ? Boolean(body.rcfeVettedByIls)
        : Boolean(existing.rcfeVettedByIls);

    let managerVerified = Boolean(existing.managerVerified || existing.managerVerification?.verified);
    let managerVerifiedAt = existing.managerVerifiedAt || null;
    let managerVerifiedAtIso = clean(existing.managerVerifiedAtIso);
    let managerVerifiedByEmail = clean(existing.managerVerifiedByEmail, 220).toLowerCase();
    let managerVerifiedByName = clean(existing.managerVerifiedByName, 160);

    if (body.managerVerified !== undefined) {
      const nextVerified = Boolean(body.managerVerified);
      if (nextVerified) {
        const actorEmail = clean(authCheck.email, 220).toLowerCase();
        const { isCoverSheetPackageManagerEmail, COVER_SHEET_PACKAGE_MANAGER_EMAIL } = await import(
          '@/lib/alft-cover-sheet-package'
        );
        if (!isCoverSheetPackageManagerEmail(actorEmail) && !Boolean(authCheck.isSuperAdmin)) {
          return NextResponse.json(
            {
              success: false,
              error: `Only cover page manager (${COVER_SHEET_PACKAGE_MANAGER_EMAIL}) can verify the package.`,
            },
            { status: 403 }
          );
        }
        managerVerified = true;
        managerVerifiedAt = serverTimestamp;
        managerVerifiedAtIso = nowIso;
        managerVerifiedByEmail = actorEmail;
        managerVerifiedByName = clean(authCheck.name || authCheck.email, 160);
      } else {
        managerVerified = false;
        managerVerifiedAt = null;
        managerVerifiedAtIso = '';
        managerVerifiedByEmail = '';
        managerVerifiedByName = '';
      }
    }

    // Changing docs or placement clears manager verification.
    const docsChanged =
      Object.keys(incomingDocs).length > 0 || Boolean(removeDocKey) || body.placementType !== undefined;
    if (docsChanged && managerVerified && body.managerVerified === undefined) {
      managerVerified = false;
      managerVerifiedAt = null;
      managerVerifiedAtIso = '';
      managerVerifiedByEmail = '';
      managerVerifiedByName = '';
    }

    const missing = missingCoverSheetPackageChecklist(packageType, nextDocs as any, {
      placementType,
      homeVettedByIls,
      rcfeVettedByIls,
      managerVerified,
    });
    const status = clean(existing.status) === 'sent' && !body.forceDraft ? 'sent' : missing.length ? 'draft' : 'ready';

    const payload = {
      memberClientId: memberClientId || clean(existing.memberClientId, 80),
      memberName,
      memberMrn: memberMrn || clean(existing.memberMrn, 80),
      packageType,
      placementType,
      ispSource,
      homeVettedByIls,
      rcfeVettedByIls,
      managerVerified,
      managerVerifiedAt,
      managerVerifiedAtIso: managerVerifiedAtIso || null,
      managerVerifiedByEmail: managerVerifiedByEmail || null,
      managerVerifiedByName: managerVerifiedByName || null,
      docs: nextDocs,
      linkedIspDownloadLogId:
        clean(body.linkedIspDownloadLogId, 120) || clean(existing.linkedIspDownloadLogId, 120) || null,
      linkedCoverDownloadLogId:
        clean(body.linkedCoverDownloadLogId, 120) || clean(existing.linkedCoverDownloadLogId, 120) || null,
      linkedApplicationId:
        clean(body.linkedApplicationId, 120) || clean(existing.linkedApplicationId, 120) || null,
      notes: notes || clean(existing.notes, 2000),
      status,
      staffName: clean(authCheck.name || authCheck.email, 160) || 'Staff',
      staffEmail: clean(authCheck.email, 220).toLowerCase(),
      staffUid: authCheck.uid || null,
      updatedAt: serverTimestamp,
      updatedAtIso: nowIso,
      createdAt: existing.createdAt || serverTimestamp,
      createdAtIso: clean(existing.createdAtIso) || nowIso,
    };

    await ref.set(payload, { merge: true });
    const saved = await ref.get();
    return NextResponse.json({
      success: true,
      package: serializePackage(ref.id, saved.data() || payload),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to save cover sheet package') },
      { status: 500 }
    );
  }
}
