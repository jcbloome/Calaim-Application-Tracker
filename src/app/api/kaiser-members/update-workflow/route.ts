import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }
  // Read-only mode: we do not push changes to Caspio from the app.
  return NextResponse.json(
    {
      success: false,
      error: 'Kaiser tracker is read-only. Workflow updates are disabled in the app.',
    },
    { status: 405 }
  );
}