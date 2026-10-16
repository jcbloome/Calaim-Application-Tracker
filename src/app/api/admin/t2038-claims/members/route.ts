import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import {
  attachLastT2038Claims,
  collectAuthorizedT2038Rows,
  DEFAULT_T2038_CLAIM_SETTINGS,
  indexLastT2038Claims,
  sanitizeT2038ClaimSettings,
  summarizeT2038Rows,
  T2038_CLAIM_SUBMIT_TABLE,
  T2038_CLAIMS_SETTINGS_DOC,
} from '@/lib/t2038-claims';

const CLAIM_SELECT = [
  'Client_ID2',
  'Days_of_Service_First1',
  'Days_of_Service_Last1',
  'Days_of_Service_First2',
  'Days_of_Service_Last2',
  'Days_of_Service_First3',
  'Days_of_Service_Last3',
  'Days_of_Service_First4',
  'Days_of_Service_Last4',
].join(',');

async function fetchSubmittedT2038Claims(credentials: ReturnType<typeof getCaspioCredentialsFromEnv>) {
  const token = await getCaspioToken(credentials);
  const records: Array<Record<string, unknown>> = [];
  let useSelect = true;
  for (let page = 1; page <= 40; page += 1) {
    const select = useSelect ? `&q.select=${encodeURIComponent(CLAIM_SELECT)}` : '';
    const url =
      `${credentials.baseUrl}/integrations/rest/v3/tables/${T2038_CLAIM_SUBMIT_TABLE}/records` +
      `?q.pageSize=1000&q.pageNumber=${page}${select}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok && useSelect && page === 1) {
      useSelect = false;
      page = 0;
      continue;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Could not read ${T2038_CLAIM_SUBMIT_TABLE} (HTTP ${response.status}). ${text.slice(0, 180)}`);
    }
    const json = (await response.json().catch(() => ({}))) as { Result?: Array<Record<string, unknown>> };
    const pageRows = Array.isArray(json.Result) ? json.Result : [];
    records.push(...pageRows);
    if (pageRows.length < 1000) break;
  }
  return records;
}

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
    const claims = await fetchSubmittedT2038Claims(credentials);
    const rows = attachLastT2038Claims(
      collectAuthorizedT2038Rows(rawMembers as Array<Record<string, unknown>>, warningDays),
      indexLastT2038Claims(claims)
    );

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
