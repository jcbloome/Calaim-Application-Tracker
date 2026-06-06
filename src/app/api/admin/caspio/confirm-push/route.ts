import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';

const clean = (value: unknown) => String(value ?? '').trim();
const esc = (value: unknown) => clean(value).replace(/'/g, "''");
const looksLikeNumericId = (value: unknown) => /^-?\d+(?:\.\d+)?$/.test(clean(value));
const buildEqualsClause = (fieldName: string, value: unknown) => {
  const normalizedValue = clean(value);
  if (!normalizedValue) return '';
  if (/^0\d+$/.test(normalizedValue)) {
    return `${fieldName}='${esc(normalizedValue)}'`;
  }
  return looksLikeNumericId(normalizedValue)
    ? `${fieldName}=${normalizedValue}`
    : `${fieldName}='${esc(normalizedValue)}'`;
};

const MEMBERS_TABLE = 'CalAIM_tbl_Members';
const KAISER_STATUS_TABLE = 'CalAIM_Kaiser_Status';

const getRowClientId2 = (row: Record<string, any>) =>
  clean(
    row?.client_ID2 ||
      row?.Client_ID2 ||
      row?.clientId2 ||
      row?.clientid2 ||
      row?.ClientID2 ||
      row?.Record_ID
  );

const normalizeClientIdComparable = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw.toLowerCase();
};

const clientIdsMatch = (a: unknown, b: unknown) => {
  const left = normalizeClientIdComparable(a);
  const right = normalizeClientIdComparable(b);
  return Boolean(left && right && left === right);
};

const fetchMemberCandidates = async (
  baseUrl: string,
  token: string,
  whereClause: string,
  limit = 5
) => {
  const selectCandidates = [
    // Primary projection
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_MCO,Kaiser_Status,Kaiser_ID_Status',
    // Fallback: include lowercase variant for environments that use it
    'PK_ID,client_ID2,Senior_First,Senior_Last,CalAIM_MCO,Kaiser_Status,Kaiser_ID_Status',
    // Minimal fallback to avoid hard failure on unknown columns
    'PK_ID,Client_ID2,Kaiser_Status,Kaiser_ID_Status,Senior_First,Senior_Last',
  ];

  for (const selectClause of selectCandidates) {
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.where=${encodeURIComponent(whereClause)}` +
      `&q.select=${encodeURIComponent(selectClause)}` +
      `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
      `&q.limit=${limit}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('Caspio confirm lookup failed for select-clause:', {
        status: response.status,
        whereClause,
        selectClause,
        errorPreview: clean(errorText).slice(0, 500),
      });
      continue;
    }
    const json = await response.json().catch(() => ({} as any));
    const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (rows.length > 0) return rows;
  }

  return [] as Array<Record<string, any>>;
};

const fetchMemberCandidatesByClientId2 = async (
  baseUrl: string,
  token: string,
  hintedClientId2: string
) => {
  const normalizedClientId2 = clean(hintedClientId2);
  if (!normalizedClientId2) return [] as Array<Record<string, any>>;

  const fieldCandidates = [
    'client_ID2',
    'Client_ID2',
    'clientid2',
    'ClientID2',
  ];

  const whereCandidates = new Set<string>();
  fieldCandidates.forEach((fieldName) => {
    const dynamicClause = buildEqualsClause(fieldName, normalizedClientId2);
    if (dynamicClause) whereCandidates.add(dynamicClause);
    // Always try string-equals too, because many Caspio numeric-looking IDs are stored in text columns.
    whereCandidates.add(`${fieldName}='${esc(normalizedClientId2)}'`);
    if (looksLikeNumericId(normalizedClientId2)) {
      whereCandidates.add(`${fieldName}=${normalizedClientId2}`);
    }
  });

  for (const whereClause of whereCandidates) {
    const rows = await fetchMemberCandidates(baseUrl, token, whereClause, 3);
    if (rows.length > 0) return rows;
  }

  return [] as Array<Record<string, any>>;
};

const fetchMemberByClientId2WithoutSelect = async (
  baseUrl: string,
  token: string,
  hintedClientId2: string
) => {
  const normalizedClientId2 = clean(hintedClientId2);
  if (!normalizedClientId2) return [] as Array<Record<string, any>>;

  const whereCandidates = [
    `Client_ID2='${esc(normalizedClientId2)}'`,
    `client_ID2='${esc(normalizedClientId2)}'`,
  ];
  if (looksLikeNumericId(normalizedClientId2)) {
    whereCandidates.push(`Client_ID2=${normalizedClientId2}`);
    whereCandidates.push(`client_ID2=${normalizedClientId2}`);
  }

  for (const whereClause of whereCandidates) {
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.where=${encodeURIComponent(whereClause)}` +
      `&q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
      `&q.limit=1`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const json = await response.json().catch(() => ({} as any));
    const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (rows.length > 0) return rows;
  }

  return [] as Array<Record<string, any>>;
};

const fetchMemberByClientId2ByScan = async (
  baseUrl: string,
  token: string,
  hintedClientId2: string
) => {
  const target = clean(hintedClientId2);
  if (!target) return [] as Array<Record<string, any>>;

  const pageSize = 200;
  const maxPages = 20;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const url =
      `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
      `?q.orderBy=${encodeURIComponent('PK_ID DESC')}` +
      `&q.pageSize=${pageSize}` +
      `&q.pageNumber=${pageNumber}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const json = await response.json().catch(() => ({} as any));
    const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
    if (rows.length === 0) break;

    const match = rows.find((row) => clientIdsMatch(getRowClientId2(row), target));
    if (match) return [match];
    if (rows.length < pageSize) break;
  }

  return [] as Array<Record<string, any>>;
};

const resolveKaiserStatusFromLookup = async (
  baseUrl: string,
  token: string,
  kaiserIdStatusValue: unknown
) => {
  const normalized = clean(kaiserIdStatusValue);
  if (!normalized || !looksLikeNumericId(normalized)) return '';
  const whereById = buildEqualsClause('Kaiser_ID_Status', normalized);
  if (!whereById) return '';
  const url =
    `${baseUrl}/tables/${KAISER_STATUS_TABLE}/records` +
    `?q.where=${encodeURIComponent(whereById)}` +
    `&q.select=${encodeURIComponent('Kaiser_ID_Status,Status')}` +
    `&q.limit=1`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!response.ok) return '';
  const json = await response.json().catch(() => ({} as any));
  const row = Array.isArray(json?.Result) ? json.Result[0] : null;
  return clean(row?.Status);
};

const resolvePreferredKaiserStatus = async (
  baseUrl: string,
  token: string,
  row: Record<string, any>
) => {
  const kaiserIdStatus = clean(row?.Kaiser_ID_Status);
  const kaiserStatus = clean(row?.Kaiser_Status);

  // Prefer Kaiser_ID_Status when it is already a text label.
  if (kaiserIdStatus && !looksLikeNumericId(kaiserIdStatus)) return kaiserIdStatus;

  // Fallback to Kaiser_Status if it is a text label.
  if (kaiserStatus && !looksLikeNumericId(kaiserStatus)) return kaiserStatus;

  // If Kaiser_ID_Status is numeric, resolve the label from CalAIM_Kaiser_Status.
  if (kaiserIdStatus && looksLikeNumericId(kaiserIdStatus)) {
    const resolved = await resolveKaiserStatusFromLookup(baseUrl, token, kaiserIdStatus);
    if (resolved) return resolved;
  }

  return kaiserStatus || kaiserIdStatus;
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
    const hintedMediCalNum = clean(
      applicationData?.memberMediCalNum ||
      applicationData?.confirmMemberMediCalNum ||
      applicationData?.MediCal_Number ||
      applicationData?.Medical_Number ||
      applicationData?.MCP_CIN ||
      applicationData?.cin
    );
    const hintedMrn = clean(
      applicationData?.memberMrn ||
      applicationData?.medicalRecordNumber ||
      applicationData?.mrn ||
      applicationData?.Member_MRN
    );

    const caspioConfig = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(caspioConfig);
    const baseUrl = caspioConfig.restBaseUrl;

    let candidates: Array<Record<string, any>> = [];
    if (hintedClientId2) {
      candidates = await fetchMemberCandidatesByClientId2(baseUrl, token, hintedClientId2);
      if (candidates.length === 0) {
        candidates = await fetchMemberByClientId2WithoutSelect(baseUrl, token, hintedClientId2);
      }
      if (candidates.length === 0) {
        candidates = await fetchMemberByClientId2ByScan(baseUrl, token, hintedClientId2);
      }
    }

    if (candidates.length === 0 && firstName && lastName) {
      let where = `Senior_First='${esc(firstName)}' AND Senior_Last='${esc(lastName)}'`;
      if (healthPlan.includes('kaiser')) {
        where += ` AND CalAIM_MCO='Kaiser'`;
      }
      candidates = await fetchMemberCandidates(baseUrl, token, where, 5);
    }

    if (candidates.length === 0 && hintedMediCalNum) {
      const mediCalFields = ['Medical_Number', 'MediCal_Number', 'Medi_Cal_Number', 'MCP_CIN', 'CIN'];
      for (const fieldName of mediCalFields) {
        if (candidates.length > 0) break;
        const where = buildEqualsClause(fieldName, hintedMediCalNum);
        if (!where) continue;
        candidates = await fetchMemberCandidates(baseUrl, token, where, 5);
      }
    }

    if (candidates.length === 0 && hintedMrn) {
      const mrnFields = ['MRN', 'Member_MRN', 'Medical_Record_Number', 'MedicalRecordNumber'];
      for (const fieldName of mrnFields) {
        if (candidates.length > 0) break;
        const where = buildEqualsClause(fieldName, hintedMrn);
        if (!where) continue;
        candidates = await fetchMemberCandidates(baseUrl, token, where, 5);
      }
    }

    const row = candidates.find((candidate) => getRowClientId2(candidate)) || candidates[0] || null;
    if (!row) {
      return NextResponse.json({
        success: true,
        found: false,
        message: 'No matching Caspio member record found.',
      });
    }

    const clientId2 = getRowClientId2(row);
    const preferredKaiserStatus = await resolvePreferredKaiserStatus(baseUrl, token, row);
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
        kaiserStatus: preferredKaiserStatus,
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

