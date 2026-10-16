import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv } from '@/lib/caspio-api-utils';
import {
  collectAuthorizedT2038Rows,
  DEFAULT_T2038_CLAIM_SETTINGS,
  sanitizeT2038ClaimSettings,
  summarizeT2038Rows,
  T2038_CLAIMS_SETTINGS_DOC,
} from '@/lib/t2038-claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const forceRefresh = String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true';
    let warningDays = DEFAULT_T2038_CLAIM_SETTINGS.warningDays;
    try {
      const { adminDb } = await import('@/firebase-admin');
      const snap = await adminDb.doc(T2038_CLAIMS_SETTINGS_DOC).get();
      if (snap.exists) warningDays = sanitizeT2038ClaimSettings(snap.data()).warningDays;
    } catch {
      warningDays = DEFAULT_T2038_CLAIM_SETTINGS.warningDays;
    }

    const credentials = getCaspioCredentialsFromEnv();
    const result = await fetchAllCalAIMMembers(credentials, {
      includeRawData: true,
      forceRefresh,
    });
    const rawMembers = Array.isArray(result.rawMembers) ? result.rawMembers : result.members || [];
    const rows = collectAuthorizedT2038Rows(rawMembers as Array<Record<string, unknown>>, warningDays);

    return NextResponse.json({
      success: true,
      warningDays,
      summary: summarizeT2038Rows(rows),
      rows,
      claimMdConfigured: Boolean(String(process.env.CLAIMMD_ACCOUNT_KEY || '').trim()),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[t2038-claims/members]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load T2038 authorizations.') },
      { status: 500 }
    );
  }
}
