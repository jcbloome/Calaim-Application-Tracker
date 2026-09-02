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

const normalizeText = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const valuesMatch = (a: unknown, b: unknown) => {
  const left = normalizeText(a);
  const right = normalizeText(b);
  return Boolean(left && right && left === right);
};

const fetchMemberCandidates = async (
  baseUrl: string,
  token: string,
  whereClause: string,
  limit = 5
) => {
  const selectCandidates = [
    // Prefer known-good columns only. Invalid columns make Caspio reject the whole query.
    'PK_ID,Client_ID2,Senior_First,Senior_Last,CalAIM_MCO,Kaiser_Status',
    'PK_ID,Client_ID2,Senior_First,Senior_Last,Kaiser_Status',
    'PK_ID,Client_ID2,Senior_First,Senior_Last',
    'PK_ID,Client_ID2',
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

  const fieldCandidates = ['Client_ID2', 'client_ID2'];

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

const extractCandidateFieldValues = (row: Record<string, any>, mode: 'mrn' | 'medical') => {
  const entries = Object.entries(row || {});
  return entries
    .filter(([key]) => {
      const normalizedKey = normalizeText(key).replace(/[_\s-]+/g, '');
      if (mode === 'mrn') {
        return normalizedKey.includes('mrn') || normalizedKey.includes('medicalrecord');
      }
      return (
        normalizedKey.includes('medicalnumber') ||
        normalizedKey.includes('medicalnum') ||
        normalizedKey.includes('medical') ||
        normalizedKey.includes('medical') ||
        normalizedKey.includes('medcal') ||
        normalizedKey.includes('medi') ||
        normalizedKey.includes('mcpcin') ||
        normalizedKey === 'cin'
      );
    })
    .map(([, value]) => clean(value))
    .filter(Boolean);
};

const rowMatchesPlan = (row: Record<string, any>, expectedHealthPlan: string) => {
  const expected = normalizeText(expectedHealthPlan);
  if (!expected.includes('kaiser')) return true;

  const planCandidates = [
    row?.CalAIM_MCO,
    row?.healthPlan,
    row?.HealthPlan,
    row?.plan,
    row?.Plan,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (planCandidates.length === 0) return true;
  return planCandidates.some((value) => value.includes('kaiser'));
};

const pickFirstPopulated = (row: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = clean(row?.[key]);
    if (value) return value;
  }
  return '';
};

const normalizePhoneForForm = (value: unknown) => {
  const digits = clean(value).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
};

const normalizeDateForForm = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-');
    return `${month}/${day}/${year}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = String(parsed.getFullYear());
  return `${month}/${day}/${year}`;
};

const normalizeSexForForm = (value: unknown) => {
  const normalized = clean(value).toLowerCase();
  if (normalized.startsWith('m')) return 'Male';
  if (normalized.startsWith('f')) return 'Female';
  return '';
};

const splitName = (fullName: unknown) => {
  const raw = clean(fullName).replace(/\s+/g, ' ');
  if (!raw) return { firstName: '', lastName: '' };
  const parts = raw.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(''),
  };
};

const buildCsSummaryPrefill = (row: Record<string, any>) => {
  const memberFirstName = pickFirstPopulated(row, ['Senior_First', 'memberFirstName', 'First_Name']);
  const memberLastName = pickFirstPopulated(row, ['Senior_Last', 'memberLastName', 'Last_Name']);
  const memberMediCalNum = pickFirstPopulated(row, [
    'Medical_Number',
    'MediCal_Number',
    'Medi_Cal_Number',
    'MCP_CIN',
    'CIN',
  ]);
  const memberMrn = pickFirstPopulated(row, ['Member_MRN', 'MRN', 'Medical_Record_Number', 'MedicalRecordNumber', 'MCP_CIN']);
  const authorizedFirst = pickFirstPopulated(row, ['Authorized_Party_First']);
  const authorizedLast = pickFirstPopulated(row, ['Authorized_Party_Last']);
  const authorizedPhone = pickFirstPopulated(row, ['Authorized_Party_Phone']);
  const authorizedEmail = pickFirstPopulated(row, ['Authorized_Party_Email']);
  const authorizedRelationship = pickFirstPopulated(row, ['Authorized_Party_Relationship']);
  const ispContactName = pickFirstPopulated(row, ['ISP_Contact_Name', 'Contact_Name', 'RCFE_Admin_Name']);
  const ispContactSplit = splitName(ispContactName);
  const rcfeAdminName = pickFirstPopulated(row, ['RCFE_Admin_Name', 'RCFE_Administrator', 'RCFE_Admin']);
  const rcfeAdminSplit = splitName(rcfeAdminName);
  const currentAddress = pickFirstPopulated(row, ['Normal_Housing_Street', 'Normal_Housing_Address', 'Home_Address', 'Member_Address']);
  const currentCity = pickFirstPopulated(row, ['Normal_Housing_City', 'Member_City', 'City']);
  const currentState = pickFirstPopulated(row, ['Normal_Housing_State', 'Member_State', 'State']);
  const currentZip = pickFirstPopulated(row, ['Normal_Housing_Zip', 'Member_Zip', 'Zip']);
  const memberCounty = pickFirstPopulated(row, ['Member_County', 'County']);
  const ispAddress = pickFirstPopulated(row, ['RCFE_Address', 'ISP_Current_Address', 'Member_Address', 'Address']);
  const ispCity = pickFirstPopulated(row, ['RCFE_City', 'ISP_Current_City', 'Member_City', 'City']);
  const ispState = pickFirstPopulated(row, ['RCFE_State', 'ISP_Current_State', 'Member_State', 'State']);
  const ispZip = pickFirstPopulated(row, ['RCFE_Zip', 'ISP_Current_Zip', 'Member_Zip', 'Zip']);
  const prefill = {
    memberFirstName,
    memberLastName,
    memberMrn,
    confirmMemberMrn: memberMrn,
    memberMediCalNum,
    confirmMemberMediCalNum: memberMediCalNum,
    memberDob: normalizeDateForForm(pickFirstPopulated(row, ['Birth_Date', 'DOB', 'Date_of_Birth'])),
    sex: normalizeSexForForm(pickFirstPopulated(row, ['Sex', 'Gender', 'Member_Gender', 'Senior_Gender'])),
    memberLanguage: pickFirstPopulated(row, ['Primary_Language', 'Member_Language', 'Language']),
    memberPhone: normalizePhoneForForm(
      pickFirstPopulated(row, ['Best_Contact_Phone', 'Best_Contact_Number', 'Best_Phone', 'Member_Phone', 'Phone_Number'])
    ),
    memberEmail: pickFirstPopulated(row, ['Senior_Email', 'Member_Email', 'memberEmail', 'Email']),
    bestContactFirstName: authorizedFirst,
    bestContactLastName: authorizedLast,
    bestContactRelationship: authorizedRelationship,
    bestContactPhone: normalizePhoneForForm(authorizedPhone),
    bestContactEmail: authorizedEmail,
    repFirstName: authorizedFirst,
    repLastName: authorizedLast,
    repRelationship: authorizedRelationship,
    repPhone: normalizePhoneForForm(authorizedPhone),
    repEmail: authorizedEmail,
    currentAddress,
    currentCity,
    currentState,
    currentZip,
    currentCounty: memberCounty,
    customaryAddress: currentAddress,
    customaryCity: currentCity,
    customaryState: currentState,
    customaryZip: currentZip,
    customaryCounty: memberCounty,
    ispFirstName: pickFirstPopulated(row, ['ISP_Contact_First']) || ispContactSplit.firstName || authorizedFirst,
    ispLastName: pickFirstPopulated(row, ['ISP_Contact_Last']) || ispContactSplit.lastName || authorizedLast,
    ispRelationship: authorizedRelationship,
    ispPhone: normalizePhoneForForm(
      pickFirstPopulated(row, ['ISP_Contact_Phone', 'Best_Contact_Phone', 'Best_Contact_Number', 'Member_Phone'])
    ),
    ispEmail: pickFirstPopulated(row, ['ISP_Contact_Email', 'Authorized_Party_Email', 'Senior_Email', 'Member_Email']),
    ispLocationType: pickFirstPopulated(row, ['ISP_Location_Type', 'Where_Living', 'Current_Living_Situation']),
    ispFacilityName: pickFirstPopulated(row, ['RCFE_Name', 'ISP_Current_Location', 'Facility_Name']),
    ispAddress,
    ispCity,
    ispState,
    ispZip,
    rcfeName: pickFirstPopulated(row, ['RCFE_Name']),
    rcfeAddress: ispAddress,
    rcfeAdminFirstName: pickFirstPopulated(row, ['RCFE_Admin_First']) || rcfeAdminSplit.firstName,
    rcfeAdminLastName: pickFirstPopulated(row, ['RCFE_Admin_Last']) || rcfeAdminSplit.lastName,
    rcfeAdminPhone: normalizePhoneForForm(
      pickFirstPopulated(row, [
        'RCFE_Owner_Phone',
        'RCFE_Admin_RCFE_Owner_Phone',
        'RCFE_Admin_Phone',
        'RCFE_Administrator_Phone',
      ])
    ),
    rcfeAdminEmail: pickFirstPopulated(row, ['RCFE_Admin_Email', 'RCFE_Administrator_Email']),
    preAssessmentCareNeedsNotes: pickFirstPopulated(row, [
      'Describe_Member_Living_Situation',
      'Current_Living_Situation',
    ]),
    monthlyIncome: pickFirstPopulated(row, ['Monthly_Income']),
    expectedRoomBoardPayment: pickFirstPopulated(row, ['Room_and_Board_Amount']),
  } as Record<string, string>;

  return Object.entries(prefill).reduce((acc, [key, value]) => {
    if (clean(value)) acc[key] = clean(value);
    return acc;
  }, {} as Record<string, string>);
};

const fetchMemberByPkId = async (baseUrl: string, token: string, pkId: string) => {
  const whereClause = buildEqualsClause('PK_ID', pkId);
  if (!whereClause) return null;
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
  if (!response.ok) return null;
  const json = await response.json().catch(() => ({} as any));
  const rows = Array.isArray(json?.Result) ? (json.Result as Array<Record<string, any>>) : [];
  return rows[0] || null;
};

const fetchMemberCandidatesByHintScan = async (
  baseUrl: string,
  token: string,
  hints: {
    firstName: string;
    lastName: string;
    healthPlan: string;
    mediCalNum: string;
    mrn: string;
  }
) => {
  const pageSize = 200;
  const maxPages = 25;

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

    const match = rows.find((row) => {
      if (!rowMatchesPlan(row, hints.healthPlan)) return false;

      const rowFirst = clean(row?.Senior_First || row?.memberFirstName || row?.First_Name || row?.firstName);
      const rowLast = clean(row?.Senior_Last || row?.memberLastName || row?.Last_Name || row?.lastName);
      const nameMatch = valuesMatch(rowFirst, hints.firstName) && valuesMatch(rowLast, hints.lastName);

      const rowMrnCandidates = extractCandidateFieldValues(row, 'mrn');
      const mrnMatch =
        Boolean(hints.mrn) &&
        rowMrnCandidates.some((value) => valuesMatch(value, hints.mrn));

      const rowMedicalCandidates = extractCandidateFieldValues(row, 'medical');
      const medicalMatch =
        Boolean(hints.mediCalNum) &&
        rowMedicalCandidates.some((value) => valuesMatch(value, hints.mediCalNum));

      return nameMatch || mrnMatch || medicalMatch;
    });

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

    if (
      candidates.length === 0 &&
      (Boolean(hintedMrn) || Boolean(hintedMediCalNum) || (Boolean(firstName) && Boolean(lastName)))
    ) {
      candidates = await fetchMemberCandidatesByHintScan(baseUrl, token, {
        firstName,
        lastName,
        healthPlan,
        mediCalNum: hintedMediCalNum,
        mrn: hintedMrn,
      });
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
    const fullRow = (await fetchMemberByPkId(baseUrl, token, clean(row?.PK_ID))) || row;
    const csSummaryPrefill = buildCsSummaryPrefill(fullRow);
    return NextResponse.json({
      success: true,
      found: true,
      hasClientId2: Boolean(clientId2),
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
        csSummaryPrefill,
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

