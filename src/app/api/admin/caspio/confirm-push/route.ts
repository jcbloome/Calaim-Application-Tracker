import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));

const MEMBERS_TABLE = 'CalAIM_tbl_Members';

const fetchMemberCandidates = async (
  baseUrl: string,
  token: string,
  whereClause: string,
  limit = 5
) => {
  const url =
    `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
    `?q.where=${encodeURIComponent(whereClause)}` +
    `&q.select=${encodeURIComponent('PK_ID,client_ID2,Client_ID2,Senior_First,Senior_Last,CalAIM_MCO,Kaiser_Status')}` +
    `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
    `&q.limit=${limit}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Caspio lookup failed: HTTP ${response.status} ${errorText}`);
  }
  const json = await response.json().catch(() => ({} as any));
  return Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const applicationData = body?.applicationData || {};
    const firstName = clean(applicationData?.memberFirstName);
    const lastName = clean(applicationData?.memberLastName);
    const hintedClientId2 = clean(
      applicationData?.clientId2 ||
        applicationData?.client_ID2 ||
        applicationData?.Client_ID2 ||
        applicationData?.caspioClientId2
    );
    const healthPlan = clean(applicationData?.healthPlan || applicationData?.CalAIM_MCO).toLowerCase();

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;

    let candidates: Array<Record<string, any>> = [];
    if (hintedClientId2) {
      const whereByClient = looksLikeNumericId(hintedClientId2)
        ? `client_ID2=${hintedClientId2}`
        : `client_ID2='${esc(hintedClientId2)}'`;
      candidates = await fetchMemberCandidates(baseUrl, token, whereByClient, 3);
    }

    if (candidates.length === 0 && firstName && lastName) {
      let where = `Senior_First='${esc(firstName)}' AND Senior_Last='${esc(lastName)}'`;
      if (healthPlan.includes('kaiser')) {
        where += ` AND CalAIM_MCO='Kaiser'`;
      }
      candidates = await fetchMemberCandidates(baseUrl, token, where, 5);
    }

    const row = candidates[0] || null;
    if (!row) {
      return NextResponse.json({
        success: true,
        found: false,
        message: 'No matching Caspio member record found.',
      });
    }

    const clientId2 = clean(row?.client_ID2 || row?.Client_ID2);
    return NextResponse.json({
      success: true,
      found: Boolean(clientId2),
      message: clientId2
        ? 'Matching Caspio member found.'
        : 'Member record found but client_ID2 is blank.',
      member: {
        pkId: clean(row?.PK_ID),
        clientId2,
        firstName: clean(row?.Senior_First),
        lastName: clean(row?.Senior_Last),
        calaimMco: clean(row?.CalAIM_MCO),
        kaiserStatus: clean(row?.Kaiser_Status),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to confirm Caspio push status.',
        details: String(error?.message || 'Unknown error'),
      },
      { status: 500 }
    );
  }
}

