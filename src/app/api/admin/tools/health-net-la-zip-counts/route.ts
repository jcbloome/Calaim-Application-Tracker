import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import { collectHealthNetLaZipCounts } from '@/lib/health-net-la-zip-counts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authorized Health Net members in Los Angeles County, counted by ZIP only.
 * No names or member IDs are returned.
 */
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
    const rawMembers = Array.isArray(result.rawMembers)
      ? result.rawMembers
      : (result.members as Array<Record<string, unknown>>) || [];

    const summary = collectHealthNetLaZipCounts(rawMembers as Array<Record<string, unknown>>);

    return NextResponse.json({
      success: true,
      ...summary,
      zipCount: summary.rows.length,
      fetchedAt: new Date().toISOString(),
      source: 'CalAIM_tbl_Members',
      filters: {
        healthPlan: 'Health Net',
        calaimStatus: 'Authorized',
        county: 'Los Angeles',
        zipFields: ['RCFE_Zip', 'Member_Zip', 'Normal_Housing_Zip', 'Home_Zip', 'Zip'],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load ZIP counts.';
    console.error('[health-net-la-zip-counts]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
