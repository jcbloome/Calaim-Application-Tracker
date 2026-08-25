import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminStorage } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

const sanitizeFileComponent = (value: string) =>
  clean(value)
    .replace(/[^\w\s.,-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: false });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const logId = clean(req.nextUrl.searchParams.get('logId'));
    const format = clean(req.nextUrl.searchParams.get('format') || 'file').toLowerCase();
    if (!logId) {
      return NextResponse.json({ success: false, error: 'logId is required' }, { status: 400 });
    }

    const logDoc = await authCheck.adminDb.collection('kaiser_isp_cover_sheet_download_logs').doc(logId).get();
    if (!logDoc.exists) {
      return NextResponse.json({ success: false, error: 'Download log not found' }, { status: 404 });
    }

    const logData = logDoc.data() || {};
    if (clean(logData.formType) !== 'kaiser-isp-cover-sheet') {
      return NextResponse.json({ success: false, error: 'Invalid form type for this log' }, { status: 400 });
    }

    const archivedStoragePath = clean(logData.archivedStoragePath);
    if (!archivedStoragePath) {
      return NextResponse.json(
        { success: false, error: 'No archived file exists for this log yet. Re-generate the ISP cover sheet to archive a copy.' },
        { status: 409 }
      );
    }

    const downloadName = sanitizeFileComponent(clean(logData.downloadName));
    const memberName = sanitizeFileComponent(clean(logData.memberName) || 'Member');
    const fileName = `${downloadName || `${memberName || 'Member'} - Kaiser ISP Cover Sheet (Archived)`}.pdf`;
    const storageFile = adminStorage.bucket().file(archivedStoragePath);
    const [exists] = await storageFile.exists();
    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'Archived file is missing from storage. Re-generate the ISP cover sheet.' },
        { status: 404 }
      );
    }

    // Stream the PDF through this API so Electron/admin clients can download without
    // relying on cross-origin signed URL navigation (often blocked).
    if (format === 'file' || format === 'view' || format === 'stream') {
      const [buffer] = await storageFile.download();
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

    const [signedUrl] = await storageFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
      responseType: 'application/pdf',
    });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      fileName,
      expiresInSeconds: 600,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to generate re-download link') },
      { status: 500 }
    );
  }
}
