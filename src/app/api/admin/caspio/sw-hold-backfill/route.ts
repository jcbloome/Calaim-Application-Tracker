import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const HOLD_VALUE = '🔴 Hold';
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const HOLD_FIELD_CANDIDATES = [
  'Hold_For_Social_Worker_Visit',
  'Hold_For_Social_Worker',
];

type MemberHoldRow = {
  pkId: string;
  clientId2: string;
  memberName: string;
  currentHold: string;
  needsUpdate: boolean;
};

const isAlreadyHoldValue = (value: unknown) => {
  const v = clean(value).toLowerCase();
  if (!v) return false;
  return v.includes('hold');
};

const resolveHoldFields = async (baseUrl: string, token: string) => {
  const resolved: string[] = [];
  for (const candidate of HOLD_FIELD_CANDIDATES) {
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.select=${encodeURIComponent(`PK_ID,${candidate}`)}` +
      `&q.pageSize=1&q.pageNumber=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      resolved.push(candidate);
    }
  }
  if (!resolved.length) {
    // Same primary field used when applications are pushed to Caspio.
    return ['Hold_For_Social_Worker_Visit'];
  }
  return resolved;
};

const fetchAllMemberHoldRows = async (
  baseUrl: string,
  token: string,
  holdFields: string[]
): Promise<MemberHoldRow[]> => {
  const selectFields = Array.from(
    new Set(['PK_ID', 'Client_ID2', 'Senior_First', 'Senior_Last', ...holdFields])
  );
  const byPkId = new Map<string, Record<string, any>>();

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.select=${encodeURIComponent(selectFields.join(','))}` +
      `&q.orderBy=${encodeURIComponent('PK_ID ASC')}` +
      `&q.pageSize=${PAGE_SIZE}` +
      `&q.pageNumber=${pageNumber}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed loading CalAIM members: HTTP ${response.status} ${errorText}`);
    }
    const json = await response.json().catch(() => ({} as any));
    const pageRows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (!pageRows.length) break;

    let newOnPage = 0;
    for (const row of pageRows) {
      const pkId = clean(row?.PK_ID || row?.pk_id);
      const key = pkId || `row-${byPkId.size + 1}`;
      if (!byPkId.has(key)) {
        byPkId.set(key, row);
        newOnPage += 1;
      }
    }

    // Caspio ignored pagination and returned the same page again.
    if (newOnPage === 0) break;
    if (pageRows.length < PAGE_SIZE) break;
  }

  return Array.from(byPkId.values()).map((row) => {
    const first = clean(row?.Senior_First);
    const last = clean(row?.Senior_Last);
    const currentHold =
      holdFields.map((field) => clean(row?.[field])).find(Boolean) ||
      clean(row?.Hold_For_Social_Worker_Visit) ||
      clean(row?.Hold_For_Social_Worker) ||
      '';
    return {
      pkId: clean(row?.PK_ID || row?.pk_id),
      clientId2: clean(row?.Client_ID2 || row?.client_ID2 || row?.clientId2),
      memberName: `${first} ${last}`.trim() || `PK_ID ${clean(row?.PK_ID || row?.pk_id)}`,
      currentHold,
      needsUpdate: currentHold !== HOLD_VALUE,
    };
  });
};

const applyHoldToAllMembers = async (
  baseUrl: string,
  token: string,
  holdFields: string[],
  rows: MemberHoldRow[]
): Promise<{ updated: number; failed: Array<{ pkId: string; clientId2: string; reason: string }> }> => {
  const payload: Record<string, string> = {};
  holdFields.forEach((field) => {
    payload[field] = HOLD_VALUE;
  });

  // Prefer one Caspio bulk update for every record with a PK.
  try {
    const bulkUrl = `${baseUrl}/tables/${MEMBERS_TABLE}/records?q.where=${encodeURIComponent('PK_ID>0')}`;
    const bulkResponse = await fetch(bulkUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (bulkResponse.ok) {
      return { updated: rows.length, failed: [] };
    }
    const bulkError = await bulkResponse.text().catch(() => 'Bulk update failed');
    console.warn('SW hold bulk update failed; falling back to per-row updates:', bulkError);
  } catch (error) {
    console.warn('SW hold bulk update threw; falling back to per-row updates:', error);
  }

  let updated = 0;
  const failed: Array<{ pkId: string; clientId2: string; reason: string }> = [];
  for (const row of rows) {
    const pkId = clean(row.pkId);
    if (!pkId) {
      failed.push({ pkId: '', clientId2: row.clientId2, reason: 'Missing PK_ID' });
      continue;
    }
    const updateWhere = `PK_ID=${esc(pkId)}`;
    const url = `${baseUrl}/tables/${MEMBERS_TABLE}/records?q.where=${encodeURIComponent(updateWhere)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const reason = await response.text().catch(() => 'Update failed');
      failed.push({ pkId, clientId2: row.clientId2, reason });
      continue;
    }
    updated += 1;
  }
  return { updated, failed };
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const action = clean(body?.action).toLowerCase();
    if (!action || (action !== 'preview' && action !== 'apply')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Action is required. Use "preview" or "apply".',
        },
        { status: 400 }
      );
    }

    if (action === 'apply' && isCaspioWriteReadOnly()) {
      return NextResponse.json(caspioWriteBlockedResponse(), { status: 423 });
    }

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;
    const holdFields = await resolveHoldFields(baseUrl, token);
    const rows = await fetchAllMemberHoldRows(baseUrl, token, holdFields);
    const needingUpdate = rows.filter((row) => row.needsUpdate);

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        holdValue: HOLD_VALUE,
        holdFields,
        totalMembers: rows.length,
        alreadyHold: rows.length - needingUpdate.length,
        needingUpdate: needingUpdate.length,
        sampleNeedingUpdate: needingUpdate.slice(0, 50),
      });
    }

    const result = await applyHoldToAllMembers(baseUrl, token, holdFields, rows);
    return NextResponse.json({
      success: true,
      mode: 'apply',
      holdValue: HOLD_VALUE,
      holdFields,
      totalMembers: rows.length,
      updated: result.updated,
      failed: result.failed,
      failedCount: result.failed.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process social-worker hold backfill request.',
        details: String(error?.message || 'Unknown error'),
      },
      { status: 500 }
    );
  }
}
