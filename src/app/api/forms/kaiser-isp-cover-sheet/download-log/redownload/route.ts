import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { adminStorage } from '@/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

const sanitizeFileComponent = (value: string) =>
  clean(value)
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function GET(req: NextRequest) {
  try {
    const authCheck = await requireAdminApiAuth(req, { requireTwoFactor: true });
    if (!authCheck.ok) {
      return NextResponse.json({ success: false, error: authCheck.error }, { status: authCheck.status });
    }

    const logId = clean(req.nextUrl.searchParams.get('logId'));
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
      return NextResponse.json({ success: false, error: 'No archived file exists for this log yet' }, { status: 409 });
    }

    const memberName = sanitizeFileComponent(clean(logData.memberName) || 'Member');
    const fileName = `${memberName || 'Member'} - Kaiser ISP Cover Sheet (Archived).pdf`;
    const [signedUrl] = await adminStorage
      .bucket()
      .file(archivedStoragePath)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 10 * 60 * 1000,
        responseDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
        responseType: 'application/pdf',
      });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expiresInSeconds: 600,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to generate re-download link') },
      { status: 500 }
    );
  }
}
