import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioCredentialsFromEnv, getCaspioToken, fetchCaspioRecords } from '@/lib/caspio-api-utils';

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }
  try {
    const credentials = getCaspioCredentialsFromEnv();
    const token = await getCaspioToken(credentials);

    const records = await fetchCaspioRecords(
      credentials,
      token,
      'CalAIM_tbl_New_RCFE_Registration',
      '1=1',
      1000
    );

    return NextResponse.json({
      success: true,
      records,
      count: records.length
    });
  } catch (error: any) {
    console.error('Error fetching RCFE registrations:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch RCFE registrations' },
      { status: 500 }
    );
  }
}
