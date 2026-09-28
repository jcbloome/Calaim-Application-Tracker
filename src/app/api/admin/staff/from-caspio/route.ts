import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchCaspioStaffDirectory, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Super Admin: refresh Connections staff directory from Caspio for Add New Staff prefill.
 */
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAdminApiAuth(request, { requireSuperAdmin: true });
    if (!authz.ok) {
      return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const { staff, source } = await fetchCaspioStaffDirectory(credentials);

    return NextResponse.json({
      success: true,
      staff,
      source,
      count: staff.length,
      message: `Loaded ${staff.length} Staff/Admin from Caspio (${source})`,
    });
  } catch (error: any) {
    console.error('❌ Error refreshing staff from Caspio:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error?.message || 'Failed to refresh staff from Caspio'),
        staff: [],
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
