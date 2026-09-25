import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb } from '@/firebase-admin';
import {
  COVER_SHEET_PACKAGE_ALWAYS_REQUIRED,
  COVER_SHEET_PACKAGE_INITIAL_ONLY,
  extractPathwayPackageDocsFromApplicationForms,
  missingCoverSheetPackageChecklist,
  normalizeCoverSheetPlacementType,
  requiredCoverSheetPackageDocs,
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
  return {
    fileName,
    downloadURL,
    storagePath: clean(row.storagePath, 900) || undefined,
    contentType: clean(row.contentType, 120) || undefined,
    uploadedAtIso: clean(row.uploadedAtIso, 80) || undefined,
    uploadedByName: clean(row.uploadedByName, 160) || undefined,
    uploadedByEmail: clean(row.uploadedByEmail, 220).toLowerCase() || undefined,
    source: (clean(row.source, 40) as CoverSheetPackageFile['source']) || 'upload',
    sourceLogId: clean(row.sourceLogId, 120) || undefined,
    sourceApplicationId: clean(row.sourceApplicationId, 120) || undefined,
  };
};

const ALL_DOC_KEYS: CoverSheetPackageDocKey[] = [
  ...COVER_SHEET_PACKAGE_ALWAYS_REQUIRED.map((d) => d.key),
  ...COVER_SHEET_PACKAGE_INITIAL_ONLY.map((d) => d.key),
];

async function findApplicationForMember(memberClientId: string, memberMrn: string) {
  const byKey = new Map<string, { id: string; data: Record<string, any>; updatedMs: number }>();
  const add = (id: string, data: Record<string, any>) => {
    const updatedMs =
      Number(data?.lastUpdated?.toMillis?.()) ||
      Number(data?.updatedAt?.toMillis?.()) ||
      Date.parse(String(data?.lastUpdatedIso || data?.updatedAtIso || '')) ||
      0;
    const prev = byKey.get(id);
    if (!prev || updatedMs >= prev.updatedMs) byKey.set(id, { id, data, updatedMs });
  };

  if (memberClientId) {
    try {
      const snap = await adminDb.collection('applications').doc(memberClientId).get();
      if (snap.exists) add(snap.id, snap.data() || {});
    } catch {
      /* ignore */
    }
    for (const field of ['clientId2', 'caspioMatchedClientId2', 'memberClientId']) {
      try {
        const snap = await adminDb
          .collection('applications')
          .where(field, '==', memberClientId)
          .limit(10)
          .get();
        snap.docs.forEach((d) => add(d.id, d.data() || {}));
      } catch {
        /* ignore */
      }
    }
  }
  if (memberMrn) {
    try {
      const snap = await adminDb
        .collection('applications')
        .where('memberMrn', '==', memberMrn)
        .limit(15)
        .get();
      snap.docs.forEach((d) => add(d.id, d.data() || {}));
    } catch {
      /* ignore */
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.updatedMs - a.updatedMs)[0] || null;
}

async function kaiserAssignmentForMember(memberClientId: string) {
  if (!memberClientId) return { name: '', email: '', kaiserStatus: '' };
  try {
    const snap = await adminDb.collection('caspio_members_cache').doc(memberClientId).get();
    if (!snap.exists) return { name: '', email: '', kaiserStatus: '' };
    const data = snap.data() || {};
    return {
      name:
        clean(data.Kaiser_User_Assignment, 160) ||
        clean(data.Staff_Assigned, 160) ||
        clean(data.staff_assigned, 160) ||
        '',
      email:
        clean(data.Staff_Assigned_Email, 220).toLowerCase() ||
        clean(data.staff_assigned_email, 220).toLowerCase() ||
        clean(data.Kaiser_User_Assignment_Email, 220).toLowerCase() ||
        '',
      kaiserStatus:
        clean(data.Kaiser_Status, 200) ||
        clean(data.kaiser_status, 200) ||
        clean(data.kaiserStatus, 200) ||
        '',
    };
  } catch {
    return { name: '', email: '', kaiserStatus: '' };
  }
}

const normalizeStaffKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function buildStaffEmailIndex() {
  const byKey = new Map<string, { name: string; email: string }>();
  try {
    const snap = await adminDb.collection('users').limit(5000).get();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const email = clean(data.email, 220).toLowerCase();
      if (!email || !email.includes('@')) return;
      const first = clean(data.firstName, 80);
      const last = clean(data.lastName, 80);
      const displayName = clean(data.displayName, 160);
      const fullName = [first, last].filter(Boolean).join(' ').trim();
      const name = fullName || displayName || email;
      const candidates = [fullName, displayName, email, email.split('@')[0], `${last} ${first}`];
      candidates
        .map((c) => normalizeStaffKey(c))
        .filter(Boolean)
        .forEach((key) => {
          if (!byKey.has(key)) byKey.set(key, { name, email });
        });
    });
  } catch {
    /* best-effort */
  }
  return byKey;
}

/**
 * Tracker rows for ILS Package Checklist — missing items, assignment, pathway vs manual sources.
 */
export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 150);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 300) : 150;
    const statusFilter = clean(req.nextUrl.searchParams.get('status'), 40).toLowerCase();

    const [snap, staffIndex] = await Promise.all([
      adminDb
        .collection(COLLECTION)
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get()
        .catch(async () =>
          adminDb.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit).get()
        ),
      buildStaffEmailIndex(),
    ]);

    const rows = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const packageType = normalizePackageType(data.packageType);
      const placementType = normalizeCoverSheetPlacementType(data.placementType);
      const homeVettedByIls = Boolean(data.homeVettedByIls);
      const rcfeVettedByIls = Boolean(data.rcfeVettedByIls);
      const managerVerified = Boolean(data.managerVerified || data.managerVerification?.verified);
      const docs: Partial<Record<CoverSheetPackageDocKey, CoverSheetPackageFile | null>> = {};
      for (const key of ALL_DOC_KEYS) {
        docs[key] = normalizeFile(data.docs?.[key]);
      }

      const memberClientId = clean(data.memberClientId, 80);
      const memberMrn = clean(data.memberMrn, 80);
      const memberName = clean(data.memberName, 200) || 'Member';

      // Pathway availability (for UI + optional auto-fill status).
      const app = await findApplicationForMember(memberClientId, memberMrn);
      const pathwayDocs = app
        ? extractPathwayPackageDocsFromApplicationForms(app.id, app.data?.forms)
        : {};
      const pathwayAvailableKeys = Object.keys(pathwayDocs) as CoverSheetPackageDocKey[];

      const missing = missingCoverSheetPackageChecklist(packageType, docs, {
        placementType,
        homeVettedByIls,
        rcfeVettedByIls,
        managerVerified,
      });
      const status = clean(data.status, 40) || (missing.length ? 'draft' : 'ready');
      if (statusFilter === 'open' && status === 'sent') continue;
      if (statusFilter === 'sent' && status !== 'sent') continue;
      if (statusFilter === 'missing' && missing.length === 0) continue;

      const requiredDocKeys = requiredCoverSheetPackageDocs(packageType, placementType).map((d) => d.key);
      const presentKeys = requiredDocKeys.filter((key) => Boolean(docs[key]?.downloadURL));
      const sources = presentKeys.map((key) => {
        const src = clean(docs[key]?.source, 40) || 'upload';
        return { key, source: src };
      });
      const fromPathway = sources.filter((s) => s.source === 'application-portal').length;
      const fromManual = sources.filter(
        (s) => s.source === 'upload' || s.source === 'link' || !s.source
      ).length;
      const fromAppDownload = sources.filter(
        (s) => s.source === 'isp-download' || s.source === 'cover-download'
      ).length;

      const assignmentFromCache = await kaiserAssignmentForMember(memberClientId);
      const kaiserUserAssignment =
        clean(data.kaiserUserAssignment, 160) || assignmentFromCache.name;
      const staffHit = staffIndex.get(normalizeStaffKey(kaiserUserAssignment));
      const assignedStaffEmail =
        clean(data.assignedStaffEmail, 220).toLowerCase() ||
        assignmentFromCache.email ||
        staffHit?.email ||
        '';
      const assignedStaffName =
        clean(data.assignedStaffName, 160) ||
        kaiserUserAssignment ||
        staffHit?.name ||
        '';
      const kaiserStatus =
        clean(data.kaiserStatus, 200) || assignmentFromCache.kaiserStatus || '';

      const applicationId = app?.id || clean(data.linkedApplicationId, 120) || null;
      const checklistHref = `/admin/tools/alft-cover-sheet-package?memberClientId=${encodeURIComponent(
        memberClientId
      )}&packageType=${encodeURIComponent(packageType)}${
        memberMrn ? `&memberMrn=${encodeURIComponent(memberMrn)}` : ''
      }`;
      const pathwayHref = applicationId
        ? `/admin/applications/${encodeURIComponent(applicationId)}`
        : null;

      rows.push({
        id: docSnap.id,
        memberClientId,
        memberName,
        memberMrn,
        packageType,
        placementType,
        status,
        homeVettedByIls,
        rcfeVettedByIls,
        managerVerified,
        missingLabels: missing.map((m) => m.label),
        missingCount: missing.length,
        docsComplete: missing.filter((m) => m.kind === 'file').length === 0,
        readyToSend: missing.length === 0,
        presentCount: presentKeys.length,
        requiredCount: requiredDocKeys.length,
        docStatuses: requiredDocKeys.map((key) => ({
          key,
          label:
            COVER_SHEET_PACKAGE_ALWAYS_REQUIRED.find((d) => d.key === key)?.label ||
            COVER_SHEET_PACKAGE_INITIAL_ONLY.find((d) => d.key === key)?.label ||
            key,
          present: Boolean(docs[key]?.downloadURL),
          source: clean(docs[key]?.source, 40) || null,
          fileName: clean(docs[key]?.fileName, 240) || null,
          pathwayAvailable: pathwayAvailableKeys.includes(key),
        })),
        kaiserUserAssignment,
        kaiserStatus,
        assignedStaffName,
        assignedStaffEmail,
        staffName: clean(data.staffName, 160),
        staffEmail: clean(data.staffEmail, 220).toLowerCase(),
        applicationId,
        pathwayHref,
        pathwayDocCount: pathwayAvailableKeys.length,
        fromPathwayCount: fromPathway,
        fromManualCount: fromManual,
        fromAppDownloadCount: fromAppDownload,
        sentAt: toIso(data.sentAt) || clean(data.sentAtIso),
        updatedAt: toIso(data.updatedAt) || clean(data.updatedAtIso),
        createdAt: toIso(data.createdAt) || clean(data.createdAtIso),
        checklistHref,
      });
    }

    return NextResponse.json({
      success: true,
      rows,
      counts: {
        total: rows.length,
        missing: rows.filter((r) => r.missingCount > 0).length,
        ready: rows.filter((r) => r.readyToSend && r.status !== 'sent').length,
        sent: rows.filter((r) => r.status === 'sent').length,
      },
    });
  } catch (error: any) {
    console.error('ILS package tracker failed:', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load ILS package tracker') },
      { status: 500 }
    );
  }
}
