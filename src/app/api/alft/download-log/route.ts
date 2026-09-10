import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb, adminStorage } from '@/firebase-admin';
import { appendPdfBytes, buildAlftFormPdfFromAnswers } from '@/lib/alft/build-alft-form-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

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

const buildDownloadName = (memberName: string, memberMrn: string, createdAtIso: string) => {
  const safeMember = clean(memberName) || 'Unknown Member';
  const safeMrn = clean(memberMrn) || 'N/A';
  const safeDate = (() => {
    const d = new Date(createdAtIso);
    if (Number.isNaN(d.getTime())) {
      const now = new Date();
      return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
    }
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
  })();
  return `ISP, ${safeMember}, ${safeMrn}, ${safeDate}`;
};

async function loadBytesFromStorage(path: string): Promise<Buffer | null> {
  const storagePath = clean(path);
  if (!storagePath) return null;
  try {
    const file = adminStorage.bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

async function loadMedListAppendix(intake: any): Promise<Buffer | null> {
  const att = intake?.alftForm?.medListAttachment || null;
  if (!att) return null;
  const contentType = clean(att.contentType).toLowerCase();
  const fromStorage = await loadBytesFromStorage(att.storagePath);
  if (fromStorage?.length && (contentType.includes('pdf') || clean(att.fileName).toLowerCase().endsWith('.pdf'))) {
    return fromStorage;
  }
  const url = clean(att.downloadURL);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = clean(res.headers.get('content-type')).toLowerCase() || contentType;
    if (!ct.includes('pdf') && !clean(att.fileName).toLowerCase().endsWith('.pdf')) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Full ISP/ALFT form PDF from digital answers — never includes suggested/admin tier rates. */
async function buildOfficialIspPacketPdf(intake: any): Promise<Buffer> {
  const answers = {
    ...((intake?.alftForm?.exactPacketAnswers || {}) as Record<string, unknown>),
  };
  const memberName = clean(intake?.memberName) || clean(answers.p1_member_name) || 'Member';
  const memberMrn = clean(intake?.medicalRecordNumber || intake?.kaiserMrn) || clean(answers.p1_mrn);
  let buffer = await buildAlftFormPdfFromAnswers({ answers, memberName, memberMrn });
  const medAppendix = await loadMedListAppendix(intake);
  if (medAppendix?.length) {
    buffer = await appendPdfBytes(buffer, medAppendix);
  }
  return buffer;
}

function tierMetaFromIntake(intake: any) {
  const swRecommendedTier = clean(intake?.alftSwTierRecommendation?.tier);
  const rnRecommendedTier =
    clean(intake?.alftRnTierRecommendation?.tier) ||
    clean(intake?.alftForm?.exactPacketAnswers?.p14_rn_recommended_tier);
  const adminApprovedTier =
    clean(intake?.alftManagerReview?.adminApprovedTier) ||
    clean(intake?.alftManagerReview?.rnRecommendedTier) ||
    clean(intake?.alftForm?.exactPacketAnswers?.p14_admin_approved_tier) ||
    (String(intake?.alftManagerReview?.status || '').toLowerCase() === 'approved' ? rnRecommendedTier : '');
  const adminApprovedByName = clean(intake?.alftManagerReview?.reviewedByName);
  return { swRecommendedTier, rnRecommendedTier, adminApprovedTier, adminApprovedByName };
}

async function findExistingLogsForIntake(intakeId: string) {
  const id = clean(intakeId);
  if (!id) return [] as Array<{ id: string; data: Record<string, any>; createdAtMs: number }>;
  const snap = await adminDb
    .collection('alft_isp_download_logs')
    .where('intakeId', '==', id)
    .get()
    .catch(() => null);
  if (!snap) return [];
  return snap.docs
    .map((doc) => {
      const data = (doc.data() || {}) as Record<string, any>;
      const createdAtMs = Date.parse(toIso(data.createdAt) || toIso(data.createdAtIso) || '') || 0;
      return { id: doc.id, data, createdAtMs };
    })
    .filter((row) => !row.data.deleted)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/** One list row per intake — keep newest, sum download counts. */
function collapseLogsByIntake<T extends { id: string; intakeId?: string; createdAt?: string; downloadCount?: number }>(
  rows: T[]
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = clean(row.intakeId) || `log:${row.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row, downloadCount: Math.max(1, Number(row.downloadCount) || 1) });
      continue;
    }
    const existingMs = Date.parse(existing.createdAt || '') || 0;
    const nextMs = Date.parse(row.createdAt || '') || 0;
    const count =
      Math.max(1, Number(existing.downloadCount) || 1) + Math.max(1, Number(row.downloadCount) || 1);
    if (nextMs >= existingMs) {
      byKey.set(key, { ...row, downloadCount: count });
    } else {
      byKey.set(key, { ...existing, downloadCount: count });
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0)
  );
}

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const limitParam = Number(req.nextUrl.searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const intakeId = clean(req.nextUrl.searchParams.get('intakeId'));
    const memberId = clean(req.nextUrl.searchParams.get('memberId'));
    const logId = clean(req.nextUrl.searchParams.get('logId'));
    const format = clean(req.nextUrl.searchParams.get('format') || 'file').toLowerCase();

    if (logId) {
      const logDoc = await authCheck.adminDb.collection('alft_isp_download_logs').doc(logId).get();
      if (!logDoc.exists) {
        return NextResponse.json({ success: false, error: 'Download log not found' }, { status: 404 });
      }
      const logData = logDoc.data() || {};
      if (logData.deleted) {
        return NextResponse.json({ success: false, error: 'Download log not found' }, { status: 404 });
      }
      const downloadName = clean(logData.downloadName) || 'ISP';
      const fileName = `${downloadName}.pdf`;

      // Serve only the original archived packet from ALFT/Workflow download — never rebuild.
      const archivedStoragePath = clean(logData.archivedStoragePath || logData.packetPdfStoragePath);
      if (!archivedStoragePath) {
        return NextResponse.json(
          { success: false, error: 'No archived file linked on this download record. Re-download from ALFT / ISP Workflow first.' },
          { status: 409 }
        );
      }
      const buffer = await loadBytesFromStorage(archivedStoragePath);
      if (!buffer?.length) {
        return NextResponse.json(
          { success: false, error: 'Archived file missing from storage. Re-download from ALFT / ISP Workflow to restore the link.' },
          { status: 404 }
        );
      }

      const disposition =
        format === 'view'
          ? `inline; filename="${fileName.replace(/"/g, '')}"`
          : `attachment; filename="${fileName.replace(/"/g, '')}"`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': disposition,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'private, no-store',
          'X-Download-Name': downloadName,
        },
      });
    }

    let query: any = authCheck.adminDb
      .collection('alft_isp_download_logs')
      .orderBy('createdAt', 'desc')
      .limit(Math.max(limit, 100));

    if (intakeId) {
      query = authCheck.adminDb
        .collection('alft_isp_download_logs')
        .where('intakeId', '==', intakeId)
        .orderBy('createdAt', 'desc')
        .limit(limit);
    } else if (memberId) {
      query = authCheck.adminDb
        .collection('alft_isp_download_logs')
        .where('memberClientId', '==', memberId)
        .orderBy('createdAt', 'desc')
        .limit(limit);
    }

    const snap = await query.get().catch(async () => {
      return authCheck.adminDb.collection('alft_isp_download_logs').orderBy('createdAt', 'desc').limit(200).get();
    });

    const logs = collapseLogsByIntake(
      snap.docs
        .map((doc: any) => {
          const data = doc.data() || {};
          if (data.deleted) return null;
          return {
            id: doc.id,
            downloadName: clean(data.downloadName),
            memberName: clean(data.memberName),
            memberMrn: clean(data.memberMrn),
            memberClientId: clean(data.memberClientId),
            intakeId: clean(data.intakeId),
            staffName: clean(data.staffName),
            staffEmail: clean(data.staffEmail).toLowerCase(),
            createdAt: toIso(data.createdAt) || toIso(data.createdAtIso) || toIso(data.lastDownloadedAt) || '',
            archivedStoragePath: clean(data.archivedStoragePath),
            packetPdfStoragePath: clean(data.packetPdfStoragePath),
            signatureRequestId: clean(data.signatureRequestId),
            rnRecommendedTier: clean(data.rnRecommendedTier),
            adminApprovedTier: clean(data.adminApprovedTier),
            downloadCount: Math.max(1, Number(data.downloadCount) || 1),
          };
        })
        .filter(Boolean)
        .filter((row: any) => {
          if (intakeId && row.intakeId !== intakeId) return false;
          if (memberId && row.memberClientId !== memberId) return false;
          return true;
        })
    ).slice(0, limit);

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load logs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      intakeId?: string;
      pdfBase64?: string;
    };
    const intakeId = clean(body.intakeId);
    if (!intakeId) {
      return NextResponse.json({ success: false, error: 'intakeId is required' }, { status: 400 });
    }

    const intakeSnap = await adminDb.collection('standalone_upload_submissions').doc(intakeId).get();
    if (!intakeSnap.exists) {
      return NextResponse.json({ success: false, error: 'ALFT intake not found' }, { status: 404 });
    }
    const intake = intakeSnap.data() || {};
    const answers = (intake as any)?.alftForm?.exactPacketAnswers;
    if (!answers || typeof answers !== 'object' || !Object.keys(answers).length) {
      return NextResponse.json(
        { success: false, error: 'No ALFT form answers found to build the ISP packet.' },
        { status: 409 }
      );
    }

    const memberName = clean((intake as any)?.memberName) || 'Member';
    const memberMrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn);
    const memberClientId = clean((intake as any)?.memberId);
    const requestId = clean((intake as any)?.alftSignature?.requestId);
    const { rnRecommendedTier, adminApprovedTier, adminApprovedByName } = tierMetaFromIntake(intake);
    const createdAtIso = new Date().toISOString();
    const downloadName = buildDownloadName(memberName, memberMrn, createdAtIso);

    let buffer: Buffer;
    const uploaded = clean(body.pdfBase64);
    if (uploaded) {
      const raw = uploaded.includes(',') ? uploaded.split(',').pop() || '' : uploaded;
      buffer = Buffer.from(raw, 'base64');
      if (!buffer.length) {
        return NextResponse.json({ success: false, error: 'Invalid uploaded PDF.' }, { status: 400 });
      }
    } else {
      buffer = await buildOfficialIspPacketPdf(intake);
    }

    const archivePath = `alft-isp-downloads/${intakeId}/${Date.now()}-${downloadName.replace(/[^\w.-]+/g, '_')}.pdf`;
    await adminStorage.bucket().file(archivePath).save(buffer, {
      contentType: 'application/pdf',
      resumable: false,
      metadata: {
        metadata: {
          intakeId,
          memberName,
          memberMrn,
          downloadedBy: authCheck.email || '',
          downloadName,
        },
      },
    });

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const existingLogs = await findExistingLogsForIntake(intakeId);
    const primary = existingLogs[0] || null;
    const priorCount = existingLogs.reduce(
      (sum, row) => sum + Math.max(1, Number(row.data.downloadCount) || 1),
      0
    );
    // Re-download updates the same intake record instead of creating another list row.
    const nextCount = primary ? Math.max(1, priorCount) + 1 : 1;

    const logPayload = {
      formType: 'alft-isp-workflow',
      downloadName,
      memberName,
      memberMrn,
      memberClientId,
      intakeId,
      signatureRequestId: requestId || null,
      packetPdfStoragePath: null,
      archivedStoragePath: archivePath,
      archived: true,
      archivedAt: serverTimestamp,
      // Tier rates are logged for tracking only — not included in the PDF packet.
      rnRecommendedTier: rnRecommendedTier || null,
      adminApprovedTier: adminApprovedTier || null,
      adminApprovedByName: adminApprovedByName || null,
      staffName: authCheck.name || authCheck.email || 'Staff',
      staffEmail: (authCheck.email || '').toLowerCase(),
      staffUid: authCheck.uid || null,
      lastDownloadedAt: serverTimestamp,
      lastDownloadedAtIso: createdAtIso,
      downloadCount: nextCount,
      deleted: false,
      updatedAt: serverTimestamp,
    };

    let logId = '';
    if (primary) {
      logId = primary.id;
      const oldPath = clean(primary.data.archivedStoragePath || primary.data.packetPdfStoragePath);
      await adminDb.collection('alft_isp_download_logs').doc(primary.id).set(
        {
          ...logPayload,
          // Keep original first-download timestamp.
          createdAt: primary.data.createdAt || serverTimestamp,
          createdAtIso: clean(primary.data.createdAtIso) || createdAtIso,
        },
        { merge: true }
      );
      // Soft-delete older duplicate rows for this intake so the list stays one record.
      await Promise.all(
        existingLogs.slice(1).map(async (dup) => {
          const dupPath = clean(dup.data.archivedStoragePath || dup.data.packetPdfStoragePath);
          if (dupPath && dupPath !== archivePath && dupPath !== oldPath) {
            try {
              await adminStorage.bucket().file(dupPath).delete({ ignoreNotFound: true });
            } catch {
              // best-effort
            }
          }
          await adminDb.collection('alft_isp_download_logs').doc(dup.id).set(
            {
              deleted: true,
              deletedAt: serverTimestamp,
              deletedAtIso: createdAtIso,
              deletedByUid: authCheck.uid || null,
              deletedByName: authCheck.name || authCheck.email || 'Staff',
              deletedByEmail: (authCheck.email || '').toLowerCase(),
              deletedReason: 'merged-into-primary-download-log',
            },
            { merge: true }
          );
        })
      );
      if (oldPath && oldPath !== archivePath) {
        try {
          await adminStorage.bucket().file(oldPath).delete({ ignoreNotFound: true });
        } catch {
          // best-effort
        }
      }
    } else {
      const logRef = await adminDb.collection('alft_isp_download_logs').add({
        ...logPayload,
        createdAt: serverTimestamp,
        createdAtIso,
      });
      logId = logRef.id;
    }

    await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
      {
        alftStaffDownloadedAt: serverTimestamp,
        alftLastDownloadLogId: logId,
        alftLastDownloadName: downloadName,
        alftLastDownloadFileName: `${downloadName}.pdf`,
        updatedAt: serverTimestamp,
      },
      { merge: true }
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${downloadName.replace(/"/g, '')}.pdf"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Download-Log-Id': logId,
        'X-Download-Name': downloadName,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Download failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const logId = clean(req.nextUrl.searchParams.get('logId'));
    if (!logId) {
      return NextResponse.json({ success: false, error: 'logId is required' }, { status: 400 });
    }

    const logRef = authCheck.adminDb.collection('alft_isp_download_logs').doc(logId);
    const logDoc = await logRef.get();
    if (!logDoc.exists) {
      return NextResponse.json({ success: false, error: 'Download log not found' }, { status: 404 });
    }
    const logData = logDoc.data() || {};
    const intakeId = clean(logData.intakeId);

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const deletedAtIso = new Date().toISOString();
    const actorName = clean(authCheck.name) || clean(authCheck.email).toLowerCase() || 'Staff';
    const actorEmail = clean(authCheck.email).toLowerCase();

    const targets = intakeId
      ? await findExistingLogsForIntake(intakeId)
      : [{ id: logId, data: logData as Record<string, any>, createdAtMs: 0 }];

    // Always include the requested log even if already filtered oddly.
    if (!targets.some((t) => t.id === logId)) {
      targets.push({ id: logId, data: logData as Record<string, any>, createdAtMs: 0 });
    }

    await Promise.all(
      targets.map(async (target) => {
        const path = clean(target.data.archivedStoragePath || target.data.packetPdfStoragePath);
        if (path) {
          try {
            await adminStorage.bucket().file(path).delete({ ignoreNotFound: true });
          } catch {
            // best-effort
          }
        }
        await authCheck.adminDb.collection('alft_isp_download_logs').doc(target.id).set(
          {
            deleted: true,
            deletedAt: serverTimestamp,
            deletedAtIso,
            deletedByUid: clean(authCheck.uid),
            deletedByName: actorName,
            deletedByEmail: actorEmail,
          },
          { merge: true }
        );
      })
    );

    return NextResponse.json({ success: true, deletedCount: targets.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to delete download log entry') },
      { status: 500 }
    );
  }
}
