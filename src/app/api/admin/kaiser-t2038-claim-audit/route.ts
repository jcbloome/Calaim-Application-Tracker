import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { fetchAllCalAIMMembers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { T2038_CLAIM_SUBMIT_TABLE } from '@/lib/t2038-claims';
import {
  buildKaiserT2038ClaimAuditRows,
  indexClaimsByClientId2,
  justificationDocId,
  KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION,
  summarizeKaiserT2038ClaimAudit,
  T2038_CLAIM_DOS_FIELDS,
  type MonthJustification,
} from '@/lib/kaiser-t2038-claim-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const CLAIM_SELECT = [
  'Client_ID2',
  'Client_First',
  'Client_Last',
  ...T2038_CLAIM_DOS_FIELDS,
].join(',');

async function fetchSubmittedT2038Claims(credentials: ReturnType<typeof getCaspioCredentialsFromEnv>) {
  const token = await getCaspioToken(credentials);
  const records: Array<Record<string, unknown>> = [];
  let useSelect = true;
  for (let page = 1; page <= 50; page += 1) {
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
      throw new Error(
        `Could not read ${T2038_CLAIM_SUBMIT_TABLE} (HTTP ${response.status}). ${text.slice(0, 180)}`
      );
    }
    const json = (await response.json().catch(() => ({}))) as {
      Result?: Array<Record<string, unknown>>;
    };
    const pageRows = Array.isArray(json.Result) ? json.Result : [];
    records.push(...pageRows);
    if (pageRows.length < 1000) break;
  }
  return records;
}

async function loadJustifications(adminDb: any) {
  const snap = await adminDb
    .collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION)
    .limit(5000)
    .get();
  const byKey = new Map<string, MonthJustification>();
  snap.docs.forEach((doc) => {
    const data = (doc.data() || {}) as Record<string, unknown>;
    const clientId2 = String(data.clientId2 || '').trim();
    const monthKey = String(data.monthKey || '').trim();
    if (!clientId2 || !monthKey) return;
    byKey.set(`${clientId2}__${monthKey}`, {
      clientId2,
      monthKey,
      reason: String(data.reason || '').trim(),
      justifiedBy: String(data.justifiedBy || '').trim(),
      justifiedByEmail: String(data.justifiedByEmail || '').trim(),
      updatedAt: String(data.updatedAt || '').trim(),
    });
  });
  return byKey;
}

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const forceRefresh = String(request.nextUrl.searchParams.get('refresh') || '').trim() === 'true';
    const credentials = getCaspioCredentialsFromEnv();
    const { adminDb } = await import('@/firebase-admin');

    const [membersResult, claims, justificationsByKey] = await Promise.all([
      fetchAllCalAIMMembers(credentials, { includeRawData: true, forceRefresh }),
      fetchSubmittedT2038Claims(credentials),
      loadJustifications(adminDb),
    ]);

    const rawMembers = Array.isArray(membersResult.rawMembers)
      ? membersResult.rawMembers
      : membersResult.members || [];
    const claimsByClient = indexClaimsByClientId2(claims);
    const rows = buildKaiserT2038ClaimAuditRows({
      rawMembers: rawMembers as Array<Record<string, unknown>>,
      claimsByClient,
      justificationsByKey,
    });

    return NextResponse.json({
      success: true,
      summary: summarizeKaiserT2038ClaimAudit(rows),
      rows,
      claimRowsFetched: claims.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[kaiser-t2038-claim-audit GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to load Kaiser T2038 claim audit.'),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      clientId2?: string;
      monthKey?: string;
      reason?: string;
      clear?: boolean;
    };
    const clientId2 = String(body.clientId2 || '').trim();
    const monthKey = String(body.monthKey || '').trim();
    const reason = String(body.reason || '').trim();
    const clear = Boolean(body.clear);

    if (!clientId2 || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return NextResponse.json(
        { success: false, error: 'clientId2 and monthKey (YYYY-MM) are required.' },
        { status: 400 }
      );
    }
    if (!clear && !reason) {
      return NextResponse.json(
        { success: false, error: 'Add a short reason when justifying a missing claim month.' },
        { status: 400 }
      );
    }

    const { adminDb } = await import('@/firebase-admin');
    const docId = justificationDocId(clientId2, monthKey);
    const ref = adminDb.collection(KAISER_T2038_CLAIM_AUDIT_JUSTIFICATIONS_COLLECTION).doc(docId);

    if (clear) {
      await ref.delete().catch(async () => {
        await ref.set({ deleted: true, updatedAt: new Date().toISOString() }, { merge: true });
      });
      return NextResponse.json({ success: true, cleared: true, clientId2, monthKey });
    }

    const payload: MonthJustification = {
      clientId2,
      monthKey,
      reason,
      justifiedBy: String(authz.name || authz.email || authz.uid || 'Admin').trim(),
      justifiedByEmail: String(authz.email || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    await ref.set(
      {
        ...payload,
        uid: authz.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, justification: payload });
  } catch (error: unknown) {
    console.error('[kaiser-t2038-claim-audit POST]', error);
    return NextResponse.json(
      {
        success: false,
        error: String((error as { message?: string })?.message || 'Failed to save justification.'),
      },
      { status: 500 }
    );
  }
}
