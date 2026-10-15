import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  ALW_WAITLIST_CCA_NAME,
  ALW_WAITLIST_TO_EMAIL,
  collectAuthorizedHealthNetAlwRows,
} from '@/lib/alw-waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const forceRefresh = String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true';
    const credentials = getCaspioCredentialsFromEnv();
    const result = await fetchAllCalAIMMembers(credentials, {
      includeRawData: true,
      forceRefresh,
    });
    const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : result.members || [];
    const rows = collectAuthorizedHealthNetAlwRows(rawMembers as Array<Record<string, unknown>>);

    return NextResponse.json({
      success: true,
      count: rows.length,
      ccaName: ALW_WAITLIST_CCA_NAME,
      toEmail: ALW_WAITLIST_TO_EMAIL,
      rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[alw-waitlist/members]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load ALW waitlist members.') },
      { status: 500 }
    );
  }
}
