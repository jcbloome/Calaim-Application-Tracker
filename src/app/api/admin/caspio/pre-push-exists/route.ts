import { NextRequest, NextResponse } from 'next/server';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { identityTokenLookupKeys } from '@/lib/member-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Auth mirrors push-cs-summary / pull-cs-summary-preview (admin UI only; no Bearer required).

const MEMBERS_TABLE = 'CalAIM_tbl_Members';

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

/** Include leading-zero strip/pad variants used elsewhere for Caspio identity matching. */
const identifierVariants = (raw: unknown) => {
  const value = clean(raw);
  if (!value) return [];
  const compact = value.replace(/[\s-]/g, '');
  const digits = value.replace(/\D/g, '');
  const keys = [
    value,
    compact,
    digits,
    ...identityTokenLookupKeys(value),
    ...identityTokenLookupKeys(compact),
    ...identityTokenLookupKeys(digits),
  ];
  return Array.from(new Set(keys.filter((item) => item && item.length >= 4)));
};

const MRN_FIELDS = [
  'Kaiser_MRN',
  'Member_MRN',
  'MRN',
  'Medical_Record_Number',
  'Medical_Record_Number_MRN',
  'MCP_CIN',
] as const;

const MEDICAL_NUMBER_FIELDS = [
  'Medical_Number',
  'MediCal_Number',
  'Medi_Cal_Number',
  'MCP_CIN',
  'CIN',
] as const;

const CLIENT_ID2_FIELDS = ['Client_ID2', 'client_ID2'] as const;

const pickRowSummary = (row: Record<string, unknown> | null) => {
  if (!row) return null;
  const clientId2 = clean(row.Client_ID2 || row.client_ID2 || row.clientId2);
  const first = clean(row.Senior_First || row.Client_First || row.First_Name);
  const last = clean(row.Senior_Last || row.Client_Last || row.Last_Name);
  const mrn = clean(row.Kaiser_MRN || row.Member_MRN || row.MRN || row.MCP_CIN);
  const mediCal = clean(row.Medical_Number || row.MediCal_Number || row.MCP_CIN);
  return {
    clientId2,
    memberName: [last, first].filter(Boolean).join(', ') || [first, last].filter(Boolean).join(' '),
    memberFirstName: first,
    memberLastName: last,
    mrn,
    mediCal,
    calaimStatus: clean(row.CalAIM_Status),
    kaiserStatus: clean(row.Kaiser_Status),
    mco: clean(row.CalAIM_MCO || row.MCP || row.MCO_Name),
  };
};

async function searchMember(
  baseUrl: string,
  token: string,
  whereClause: string
): Promise<Record<string, unknown> | null> {
  if (!whereClause) return null;
  const url =
    `${baseUrl}/tables/${MEMBERS_TABLE}/records` +
    `?q.where=${encodeURIComponent(whereClause)}` +
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
  const json = await response.json().catch(() => ({} as Record<string, unknown>));
  const rows = Array.isArray(json?.Result) ? (json.Result as Record<string, unknown>[]) : [];
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const applicationData = (body.applicationData || body.application || body) as Record<string, unknown>;

    const clientId2 = clean(
      applicationData.clientId2 ||
        applicationData.client_ID2 ||
        applicationData.Client_ID2 ||
        applicationData.caspioClientId2 ||
        body.clientId2
    );
    const mrn = clean(
      applicationData.memberMrn ||
        applicationData.medicalRecordNumber ||
        applicationData.mrn ||
        applicationData.Member_MRN ||
        applicationData.Kaiser_MRN ||
        body.mrn
    );
    const mediCal = clean(
      applicationData.memberMediCalNum ||
        applicationData.Medical_Number ||
        applicationData.MediCal_Number ||
        applicationData.confirmMemberMediCalNum ||
        body.mediCal ||
        body.medicalNumber
    );

    if (!clientId2 && !mrn && !mediCal) {
      return NextResponse.json(
        {
          success: true,
          exists: false,
          matchedBy: null,
          message: 'No Client_ID2, MRN, or Medi-Cal number to look up.',
        },
        { status: 200 }
      );
    }

    const { restBaseUrl } = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken();
    const baseUrl = String(restBaseUrl || '').replace(/\/$/, '');

    let matchedBy: 'client_id2' | 'mrn' | 'medi_cal' | null = null;
    let row: Record<string, unknown> | null = null;

    if (clientId2) {
      for (const field of CLIENT_ID2_FIELDS) {
        for (const candidate of identifierVariants(clientId2)) {
          const clause = buildEqualsClause(field, candidate);
          row = await searchMember(baseUrl, token, clause);
          if (row) {
            matchedBy = 'client_id2';
            break;
          }
          row = await searchMember(baseUrl, token, `${field}='${esc(candidate)}'`);
          if (row) {
            matchedBy = 'client_id2';
            break;
          }
        }
        if (row) break;
      }
    }

    if (!row && mrn) {
      for (const field of MRN_FIELDS) {
        for (const candidate of identifierVariants(mrn)) {
          const clause = buildEqualsClause(field, candidate);
          row = await searchMember(baseUrl, token, clause);
          if (row) {
            matchedBy = 'mrn';
            break;
          }
          row = await searchMember(baseUrl, token, `${field}='${esc(candidate)}'`);
          if (row) {
            matchedBy = 'mrn';
            break;
          }
        }
        if (row) break;
      }
    }

    if (!row && mediCal) {
      for (const field of MEDICAL_NUMBER_FIELDS) {
        for (const candidate of identifierVariants(mediCal)) {
          const clause = buildEqualsClause(field, candidate);
          row = await searchMember(baseUrl, token, clause);
          if (row) {
            matchedBy = 'medi_cal';
            break;
          }
          row = await searchMember(baseUrl, token, `${field}='${esc(candidate)}'`);
          if (row) {
            matchedBy = 'medi_cal';
            break;
          }
        }
        if (row) break;
      }
    }

    const match = pickRowSummary(row);
    const matchedByLabel =
      matchedBy === 'client_id2'
        ? 'Client_ID2'
        : matchedBy === 'mrn'
          ? 'MRN'
          : matchedBy === 'medi_cal'
            ? 'Medi-Cal Number'
            : null;

    return NextResponse.json({
      success: true,
      exists: Boolean(row),
      matchedBy,
      matchedByLabel,
      match,
      message: row
        ? `Already in Caspio (matched by ${matchedByLabel}). Confirming push will update the existing profile — no new member row.`
        : 'No matching Caspio member found by Client_ID2, MRN, or Medi-Cal Number.',
    });
  } catch (err: unknown) {
    console.error('[pre-push-exists]', err);
    return NextResponse.json(
      {
        success: false,
        error: String((err as { message?: string })?.message || err),
      },
      { status: 500 }
    );
  }
}
