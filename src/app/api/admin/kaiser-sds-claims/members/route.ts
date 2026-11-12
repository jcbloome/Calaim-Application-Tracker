import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import {
  filterKaiserAuthorizedRows,
  withKaiserRegion,
  type KaiserSdsClaimRow,
} from '@/lib/kaiser-sds-t2038-claims';
import {
  attachLastT2038Claims,
  DEFAULT_T2038_CLAIM_SETTINGS,
  indexLastT2038Claims,
  mapCaspioMemberToT2038ClaimRow,
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

    // Map with region while we still have raw Caspio fields.
    const kaiserRows: KaiserSdsClaimRow[] = [];
    const seen = new Set<string>();
    (rawMembers as Array<Record<string, unknown>>).forEach((raw, index) => {
      const row = mapCaspioMemberToT2038ClaimRow(raw || {}, index, warningDays);
      if (!row || row.plan !== 'Kaiser') return;
      const key = `${row.clientId2 || row.memberId || row.memberName}`.toLowerCase();
      if (key && seen.has(key)) return;
      if (key) seen.add(key);
      kaiserRows.push(withKaiserRegion(row, raw));
    });

    const rows = attachLastT2038Claims(
      kaiserRows,
      indexLastT2038Claims(claims)
    ) as KaiserSdsClaimRow[];
    const summary = summarizeT2038Rows(filterKaiserAuthorizedRows(rows));

    return NextResponse.json({
      success: true,
      warningDays,
      summary,
      rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[kaiser-sds-claims/members]', error);
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Failed to load Kaiser T2038 authorizations.') },
      { status: 500 }
    );
  }
}
