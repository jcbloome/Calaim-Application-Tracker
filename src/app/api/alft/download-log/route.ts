import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

/** Append RN recommended + admin approved tier page so downloads always show tiers at the end. */
async function appendTierStampPage(
  packetBytes: Buffer,
  args: {
    memberName: string;
    memberMrn: string;
    rnRecommendedTier: string;
    adminApprovedTier: string;
    adminApprovedByName: string;
  }
): Promise<Buffer> {
  const rnTier = clean(args.rnRecommendedTier);
  const adminTier = clean(args.adminApprovedTier);
  if (!rnTier && !adminTier) return packetBytes;

  try {
    const out = await PDFDocument.load(packetBytes);
    const page = out.addPage([612, 792]);
    const font = await out.embedFont(StandardFonts.Helvetica);
    const fontBold = await out.embedFont(StandardFonts.HelveticaBold);
    const dark = rgb(0.06, 0.09, 0.14);
    const mid = rgb(0.2, 0.23, 0.28);
    const marginX = 48;
    let y = 720;

    page.drawText('ALFT Tier Approval', { x: marginX, y, size: 18, font: fontBold, color: dark });
    y -= 28;
    page.drawText(`Member: ${args.memberName || 'Member'}`, { x: marginX, y, size: 11, font, color: dark });
    y -= 18;
    if (args.memberMrn) {
      page.drawText(`Kaiser MRN: ${args.memberMrn}`, { x: marginX, y, size: 11, font, color: dark });
      y -= 18;
    }
    y -= 10;
    page.drawRectangle({ x: marginX, y: y - 4, width: 516, height: 22, color: rgb(0.94, 0.92, 0.98) });
    page.drawText('Tier recommendation (end of packet)', {
      x: marginX + 6,
      y: y + 2,
      size: 12,
      font: fontBold,
      color: dark,
    });
    y -= 36;
    if (rnTier) {
      page.drawText(`RN recommended tier: Tier ${rnTier}`, { x: marginX, y, size: 12, font: fontBold, color: dark });
      y -= 22;
    }
    if (adminTier) {
      const by = clean(args.adminApprovedByName);
      page.drawText(
        `Admin approved tier: Tier ${adminTier}${by ? ` (approved by ${by})` : ''}`,
        { x: marginX, y, size: 12, font: fontBold, color: dark }
      );
      y -= 22;
    }
    y -= 8;
    page.drawText(
      'This page is added when the packet is approved and downloaded so tier decisions appear on the official file.',
      { x: marginX, y, size: 9, font, color: mid, maxWidth: 516 }
    );

    const bytes = await out.save();
    return Buffer.from(bytes);
  } catch {
    return packetBytes;
  }
}

/** When signature packet PDF is missing, still allow approve/download with a signed summary PDF. */
async function buildFallbackSignedSummaryPdf(args: {
  memberName: string;
  memberMrn: string;
  mswName: string;
  mswSignedAt: string;
  rnName: string;
  rnLicense: string;
  rnSignedAt: string;
  rnRecommendedTier: string;
  adminApprovedTier: string;
  adminApprovedByName: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.06, 0.09, 0.14);
  const mid = rgb(0.2, 0.23, 0.28);
  const marginX = 48;
  let y = 740;

  page.drawText('ALFT Signed Packet Summary', { x: marginX, y, size: 18, font: fontBold, color: dark });
  y -= 28;
  page.drawText(`Member: ${args.memberName || 'Member'}`, { x: marginX, y, size: 11, font, color: dark });
  y -= 18;
  if (args.memberMrn) {
    page.drawText(`Kaiser MRN: ${args.memberMrn}`, { x: marginX, y, size: 11, font, color: dark });
    y -= 18;
  }
  y -= 10;
  page.drawText('Electronic signatures', { x: marginX, y, size: 13, font: fontBold, color: dark });
  y -= 22;
  page.drawText(`MSW: ${args.mswName || '—'}`, { x: marginX, y, size: 11, font, color: dark });
  y -= 16;
  page.drawText(`MSW signed: ${args.mswSignedAt || '—'}`, { x: marginX, y, size: 10, font, color: mid });
  y -= 22;
  page.drawText(`RN: ${args.rnName || '—'}`, { x: marginX, y, size: 11, font, color: dark });
  y -= 16;
  page.drawText(`License: ${args.rnLicense || '—'}`, { x: marginX, y, size: 10, font, color: mid });
  y -= 16;
  page.drawText(`RN signed: ${args.rnSignedAt || '—'}`, { x: marginX, y, size: 10, font, color: mid });
  y -= 28;
  if (args.rnRecommendedTier) {
    page.drawText(`RN recommended tier: Tier ${args.rnRecommendedTier}`, {
      x: marginX,
      y,
      size: 12,
      font: fontBold,
      color: dark,
    });
    y -= 20;
  }
  if (args.adminApprovedTier) {
    const by = clean(args.adminApprovedByName);
    page.drawText(
      `Admin approved tier: Tier ${args.adminApprovedTier}${by ? ` (approved by ${by})` : ''}`,
      { x: marginX, y, size: 12, font: fontBold, color: dark }
    );
    y -= 20;
  }
  y -= 12;
  page.drawText(
    'Generated at approve/download because the merged signature packet PDF was not available on this intake.',
    { x: marginX, y, size: 9, font, color: mid, maxWidth: 516 }
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
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
          'X-Download-Name': clean(logData.downloadName) || fileName.replace(/\.pdf$/i, ''),
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
          rnRecommendedTier: clean(data.rnRecommendedTier),
          adminApprovedTier: clean(data.adminApprovedTier),
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
    let packetPath = clean((intake as any)?.alftSignature?.packetPdfStoragePath);
    let signaturePagePath = clean((intake as any)?.alftSignature?.signaturePagePdfStoragePath);
    const requestId = clean((intake as any)?.alftSignature?.requestId);
    // Fall back to signature request outputs when intake paths were not copied.
    if ((!packetPath || !signaturePagePath) && requestId) {
      try {
        const reqSnap = await adminDb.collection('alft_signature_requests').doc(requestId).get();
        const reqData = reqSnap.exists ? (reqSnap.data() as any) : null;
        if (!packetPath) packetPath = clean(reqData?.outputs?.packetPdfStoragePath);
        if (!signaturePagePath) signaturePagePath = clean(reqData?.outputs?.signaturePagePdfStoragePath);
      } catch {
        // best-effort
      }
    }
    const sourcePath = packetPath || signaturePagePath;

    const memberName = clean((intake as any)?.memberName) || 'Member';
    const memberMrn = clean((intake as any)?.medicalRecordNumber || (intake as any)?.kaiserMrn);
    const memberClientId = clean((intake as any)?.memberId);
    const rnRecommendedTier =
      clean((intake as any)?.alftRnTierRecommendation?.tier) ||
      clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_rn_recommended_tier);
    const adminApprovedTier =
      clean((intake as any)?.alftManagerReview?.adminApprovedTier) ||
      clean((intake as any)?.alftManagerReview?.rnRecommendedTier) ||
      clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_admin_approved_tier) ||
      (String((intake as any)?.alftManagerReview?.status || '').toLowerCase() === 'approved' ? rnRecommendedTier : '');
    const adminApprovedByName = clean((intake as any)?.alftManagerReview?.reviewedByName);
    const createdAtIso = new Date().toISOString();
    const downloadName = buildDownloadName(memberName, memberMrn, createdAtIso);

    let buffer: Buffer;
    if (sourcePath) {
      const sourceFile = adminStorage.bucket().file(sourcePath);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        return NextResponse.json({ success: false, error: 'Signed packet file is missing from storage.' }, { status: 404 });
      }
      const [rawBuffer] = await sourceFile.download();
      buffer = await appendTierStampPage(Buffer.from(rawBuffer), {
        memberName,
        memberMrn,
        rnRecommendedTier,
        adminApprovedTier,
        adminApprovedByName,
      });
    } else {
      const rnSigned =
        Boolean((intake as any)?.alftSignature?.rnSignedAt) ||
        Boolean((intake as any)?.alftForm?.rnSignedAt) ||
        Boolean(clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_rn_signed_at));
      if (!rnSigned) {
        return NextResponse.json(
          { success: false, error: 'No signed packet is available to download yet.' },
          { status: 409 }
        );
      }
      const summary = await buildFallbackSignedSummaryPdf({
        memberName,
        memberMrn,
        mswName:
          clean((intake as any)?.alftSignature?.mswSignedName) ||
          clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_print_name) ||
          clean((intake as any)?.uploaderName),
        mswSignedAt:
          clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_sw_signed_at) ||
          toIso((intake as any)?.alftSignature?.mswSignedAt),
        rnName:
          clean((intake as any)?.alftSignature?.rnSignedName) ||
          clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_rn_print_name) ||
          clean((intake as any)?.alftRnName),
        rnLicense: clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_license_number),
        rnSignedAt:
          clean((intake as any)?.alftForm?.exactPacketAnswers?.p14_rn_signed_at) ||
          toIso((intake as any)?.alftSignature?.rnSignedAt),
        rnRecommendedTier,
        adminApprovedTier,
        adminApprovedByName,
      });
      buffer = await appendTierStampPage(summary, {
        memberName,
        memberMrn,
        rnRecommendedTier,
        adminApprovedTier,
        adminApprovedByName,
      });
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
    const logRef = await adminDb.collection('alft_isp_download_logs').add({
      formType: 'alft-isp-workflow',
      downloadName,
      memberName,
      memberMrn,
      memberClientId,
      intakeId,
      signatureRequestId: requestId || null,
      packetPdfStoragePath: sourcePath || null,
      archivedStoragePath: archivePath,
      archived: true,
      archivedAt: serverTimestamp,
      rnRecommendedTier: rnRecommendedTier || null,
      adminApprovedTier: adminApprovedTier || null,
      adminApprovedByName: adminApprovedByName || null,
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
        'X-Download-Log-Id': logRef.id,
        'X-Download-Name': downloadName,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Download failed' }, { status: 500 });
  }
}
