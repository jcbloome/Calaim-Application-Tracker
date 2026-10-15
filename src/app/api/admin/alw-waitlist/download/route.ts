import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  buildAlwWaitlistFileName,
  buildAlwWaitlistWorkbookBuffer,
  collectAuthorizedHealthNetAlwRows,
} from '@/lib/alw-waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const credentials = getCaspioCredentialsFromEnv();
    const result = await fetchAllCalAIMMembers(credentials, {
      includeRawData: true,
      forceRefresh: String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true',
    });
    const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : result.members || [];
    const rows = collectAuthorizedHealthNetAlwRows(rawMembers as Array<Record<string, unknown>>);
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No authorized Health Net members found for the ALW waitlist sheet.' },
        { status: 400 }
      );
    }

    const fileName = buildAlwWaitlistFileName();
    const buffer = buildAlwWaitlistWorkbookBuffer(rows);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
        'X-ALW-Waitlist-Count': String(rows.length),
      },
    });
  } catch (error: any) {
    console.error('[alw-waitlist/download]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to build ALW waitlist workbook.') },
      { status: 500 }
    );
  }
}
