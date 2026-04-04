import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { caspioWriteBlockedResponse, isCaspioWriteReadOnly } from '@/lib/caspio-write-guard';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");

type MissingTierRow = {
  pkId: string;
  memberName: string;
  calaimMco: string;
  mcoAndTier: string;
};

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const DEFAULT_TIER = 'Kaiser-0';
const PAGE_SIZE = 1000;

const toMissingTierRows = (rows: Array<Record<string, any>>): MissingTierRow[] =>
  rows.map((row) => {
    const first = clean(row?.Senior_First || row?.memberFirstName);
    const last = clean(row?.Senior_Last || row?.memberLastName);
    const memberName = `${first} ${last}`.trim() || `PK_ID ${clean(row?.PK_ID || row?.pk_id)}`;
    return {
      pkId: clean(row?.PK_ID || row?.pk_id),
      memberName,
      calaimMco: clean(row?.CalAIM_MCO || row?.healthPlan || row?.MCO),
      mcoAndTier: clean(row?.MCO_and_Tier),
    };
  });

const fetchMissingKaiserTierRows = async (baseUrl: string, token: string) => {
  const collected: Array<Record<string, any>> = [];
  for (let skip = 0; skip < 10000; skip += PAGE_SIZE) {
    const where = "CalAIM_MCO='Kaiser'";
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.where=${encodeURIComponent(where)}` +
      `&q.select=${encodeURIComponent('PK_ID,Senior_First,Senior_Last,CalAIM_MCO,MCO_and_Tier')}` +
      `&q.orderBy=${encodeURIComponent('PK_ID ASC')}` +
      `&q.skip=${skip}` +
      `&q.limit=${PAGE_SIZE}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed loading Kaiser members: HTTP ${response.status} ${errorText}`);
    }
    const json = await response.json().catch(() => ({} as any));
    const pageRows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (pageRows.length === 0) break;
    collected.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }

  return collected.filter((row) => clean(row?.MCO_and_Tier) === '');
};

const applyKaiserZeroTier = async (
  baseUrl: string,
  token: string,
  rows: MissingTierRow[]
): Promise<{ updated: number; failed: Array<{ pkId: string; reason: string }> }> => {
  let updated = 0;
  const failed: Array<{ pkId: string; reason: string }> = [];

  for (const row of rows) {
    const pkId = clean(row.pkId);
    if (!pkId) continue;
    const updateWhere = `PK_ID=${esc(pkId)}`;
    const url = `${baseUrl}/tables/${MEMBERS_TABLE}/records?q.where=${encodeURIComponent(updateWhere)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        MCO_and_Tier: DEFAULT_TIER,
      }),
    });
    if (!response.ok) {
      const reason = await response.text().catch(() => 'Update failed');
      failed.push({ pkId, reason });
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

    const missingRows = toMissingTierRows(await fetchMissingKaiserTierRows(baseUrl, token));

    if (action === 'preview') {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        totalMissing: missingRows.length,
        rows: missingRows,
      });
    }

    const result = await applyKaiserZeroTier(baseUrl, token, missingRows);
    return NextResponse.json({
      success: true,
      mode: 'apply',
      totalMissing: missingRows.length,
      updated: result.updated,
      failed: result.failed,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to process Kaiser tier backfill request.',
        details: String(error?.message || 'Unknown error'),
      },
      { status: 500 }
    );
  }
}

