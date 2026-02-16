import { NextRequest, NextResponse } from 'next/server';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';

export async function POST(request: NextRequest) {
  // Read-only mode: we do not push changes to Caspio from the app.
  return NextResponse.json(
    {
      success: false,
      error: 'Kaiser tracker is read-only. Status updates are disabled in the app.',
    },
    { status: 405 }
  );
}