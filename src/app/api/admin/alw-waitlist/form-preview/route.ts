import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import type { AlwWaitlistMemberRow } from '@/lib/alw-waitlist';
import { alwWaitlistFormFileName, buildAlwWaitlistFormPdfBytes } from '@/lib/alw-waitlist-form-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const row = (body.row || body) as AlwWaitlistMemberRow;
    if (!String(row?.memberName || '').trim() && !String(row?.mediCalNumber || '').trim()) {
      return NextResponse.json(
        { success: false, error: 'Select a member to preview the filled form.' },
        { status: 400 }
      );
    }

    const bytes = await buildAlwWaitlistFormPdfBytes(row);
    const fileName = alwWaitlistFormFileName(row);
    const asBase64 = Boolean(body.asBase64);

    if (asBase64) {
      return NextResponse.json({
        success: true,
        fileName,
        source: 'generated',
        pdfBase64: Buffer.from(bytes).toString('base64'),
      });
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store',
        'X-ALW-Form-Source': 'generated',
      },
    });
  } catch (error: any) {
    console.error('[alw-waitlist/form-preview]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to build form preview.') },
      { status: 500 }
    );
  }
}
