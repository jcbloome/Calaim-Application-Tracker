import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminDb, adminStorage } from '@/firebase-admin';

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
    if (Number.isNaN(d.getTime())) return 'Unknown Date';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  return `ALFT ISP Packet, ${safeMember}, MRN ${safeMrn}, ${safeDate}`;
};

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
      const archivedStoragePath = clean(logData.archivedStoragePath || logData.packetPdfStoragePath);
      if (!archivedStoragePath) {
        return NextResponse.json({ success: false, error: 'No archived file on this log.' }, { status: 409 });
      }
      const storageFile = adminStorage.bucket().file(archivedStoragePath);
      const [exists] = await storageFile.exists();
      if (!exists) {
        return NextResponse.json({ success: false, error: 'Archived file missing from storage.' }, { status: 404 });
      }
      const [buffer] = await storageFile.download();
      const fileName = `${clean(logData.downloadName) || 'ALFT ISP Packet'}.pdf`;
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
      // Fallback if composite index is missing.
      return authCheck.adminDb.collection('alft_isp_download_logs').orderBy('createdAt', 'desc').limit(200).get();
    });

    const logs = snap.docs
      .map((doc: any) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          downloadName: clean(data.downloadName),
          memberName: clean(data.memberName),
          memberMrn: clean(data.memberMrn),
          memberClientId: clean(data.memberClientId),
          intakeId: clean(data.intakeId),
          staffName: clean(data.staffName),
          staffEmail: clean(data.staffEmail).toLowerCase(),
          createdAt: toIso(data.createdAt) || toIso(data.createdAtIso) || '',
          archivedStoragePath: clean(data.archivedStoragePath),
          packetPdfStoragePath: clean(data.packetPdfStoragePath),
          signatureRequestId: clean(data.signatureRequestId),
        };
      })
      .filter((row: any) => {
        if (intakeId && row.intakeId !== intakeId) return false;
        if (memberId && row.memberClientId !== memberId) return false;
        return true;
      })
      .slice(0, limit);

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
      copyFromSignaturePacket?: boolean;
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
    const packetPath = clean((intake as any)?.alftSignature?.packetPdfStoragePath);
    const signaturePagePath = clean((intake as any)?.alftSignature?.signaturePagePdfStoragePath);
    const sourcePath = packetPath || signaturePagePath;
    if (!sourcePath) {
      return NextResponse.json(
        { success: false, error: 'No signed packet is available to download yet.' },
        { status: 409 }
      );
    }

    const memberName = clean((intake as any)?.memberName) || 'Member';
    const memberMrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn);
    const memberClientId = clean((intake as any)?.memberId);
    const requestId = clean((intake as any)?.alftSignature?.requestId);
    const createdAtIso = new Date().toISOString();
    const downloadName = buildDownloadName(memberName, memberMrn, createdAtIso);

    const sourceFile = adminStorage.bucket().file(sourcePath);
    const [exists] = await sourceFile.exists();
    if (!exists) {
      return NextResponse.json({ success: false, error: 'Signed packet file is missing from storage.' }, { status: 404 });
    }

    const [buffer] = await sourceFile.download();
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
        },
      },
    });

    const adminModule = await import('@/firebase-admin');
    const serverTimestamp = adminModule.default.firestore.FieldValue.serverTimestamp();
    const logRef = await adminDb.collection('alft_isp_download_logs').add({
      formType: 'alft-isp-workflow',
      downloadName,
      memberName,
      memberMrn,
      memberClientId,
      intakeId,
      signatureRequestId: requestId || null,
      packetPdfStoragePath: sourcePath,
      archivedStoragePath: archivePath,
      archived: true,
      archivedAt: serverTimestamp,
      staffName: authCheck.name || authCheck.email || 'Staff',
      staffEmail: (authCheck.email || '').toLowerCase(),
      staffUid: authCheck.uid || null,
      createdAt: serverTimestamp,
      createdAtIso,
    });

    await adminDb.collection('standalone_upload_submissions').doc(intakeId).set(
      {
        alftStaffDownloadedAt: serverTimestamp,
        alftLastDownloadLogId: logRef.id,
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
        'X-Download-Log-Id': logRef.id,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Download failed' }, { status: 500 });
  }
}
