import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-api-auth';
import { getCaspioServerAccessToken, getCaspioServerConfig } from '@/lib/caspio-server-auth';
import { identityTokenLookupKeys } from '@/lib/member-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);

const toIso = (value: unknown) => {
  try {
    if (!value) return '';
    if (typeof (value as any)?.toDate === 'function') {
      const date = (value as any).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  } catch {
    return '';
  }
};

const memberNameOf = (data: any) =>
  [clean(data?.memberFirstName), clean(data?.memberLastName)].filter(Boolean).join(' ') ||
  clean(data?.memberName) ||
  'Member';

export async function GET(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const q = clean(request.nextUrl.searchParams.get('q'), 120).toLowerCase();
  if (q.length < 2) {
    return NextResponse.json({ success: false, error: 'Enter a member name or MRN.' }, { status: 400 });
  }

  const { adminDb } = await import('@/firebase-admin');
  if (!adminDb) {
    return NextResponse.json({ success: false, error: 'Firebase Admin not configured' }, { status: 500 });
  }

  const snap = await adminDb.collection('applications').limit(2500).get();
  const members = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() || {};
      const name = memberNameOf(data);
      const mrn = clean(data.memberMrn || data.memberMRN || data.mrn || data.Member_MRN);
      const haystack = `${name} ${mrn}`.toLowerCase();
      if (!haystack.includes(q)) return null;
      const forms = Array.isArray(data.forms) ? data.forms : [];
      const items = [
        ...forms.map((form: any) => ({
          at: toIso(form?.dateCompleted || form?.uploadedAt || data.lastUpdated),
          item: clean(form?.name) || 'Application item',
          detail: clean(form?.status) || 'Updated',
          by: clean(form?.uploadedByName || form?.uploadedByEmail || data.referrerName),
        })),
        ...(Array.isArray(data.memberActionLog) ? data.memberActionLog : []).map((entry: any) => ({
          at: toIso(entry?.timestamp || entry?.at),
          item: clean(entry?.action) || 'Activity',
          detail: clean(entry?.details, 500),
          by: clean(entry?.performedBy),
        })),
      ]
        .filter((item) => item.item)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));

      return {
        id: docSnap.id,
        name,
        mrn,
        clientId2: clean(data.client_ID2 || data.clientId2 || data.Client_ID2 || data.caspioClientId2),
        pathway: clean(data.pathway),
        healthPlan: clean(data.healthPlan),
        status: clean(data.status),
        items,
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  return NextResponse.json({ success: true, members });
}

const esc = (value: string) => value.replace(/'/g, "''");
const looksLikeNumericId = (value: string) => /^-?\d+(?:\.\d+)?$/.test(value);

const rowValue = (row: Record<string, any> | null, ...names: string[]) => {
  if (!row) return '';
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = clean(key ? row[key] : '');
    if (value) return value;
  }
  return '';
};

const queryMemberRows = async (baseUrl: string, token: string, where: string) => {
  const selects = [
    'PK_ID,Client_ID2,Senior_First,Senior_Last,MCP_CIN,MediCal_Number,Kaiser_Status',
    'PK_ID,Client_ID2,Senior_First,Senior_Last,Kaiser_Status',
  ];
  for (const select of selects) {
    const url =
      `${baseUrl}/tables/CalAIM_tbl_Members/records` +
      `?q.where=${encodeURIComponent(where)}` +
      `&q.select=${encodeURIComponent(select)}` +
      `&q.limit=5`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const json = await response.json().catch(() => ({}));
    return (Array.isArray(json?.Result) ? json.Result : []) as Array<Record<string, any>>;
  }

  const fallbackUrl =
    `${baseUrl}/tables/CalAIM_tbl_Members/records` +
    `?q.where=${encodeURIComponent(where)}` +
    `&q.limit=1`;
  const fallback = await fetch(fallbackUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!fallback.ok) return [] as Array<Record<string, any>>;
  const json = await fallback.json().catch(() => ({}));
  return (Array.isArray(json?.Result) ? json.Result : []) as Array<Record<string, any>>;
};

const whereClausesForField = (field: string, value: string) => {
  const variants = Array.from(new Set([value, ...identityTokenLookupKeys(value)])).filter(Boolean);
  const clauses: string[] = [];
  variants.forEach((variant) => {
    clauses.push(`${field}='${esc(variant)}'`);
    if (looksLikeNumericId(variant) && !/^0\d+$/.test(variant)) {
      clauses.push(`${field}=${variant}`);
    }
  });
  return clauses;
};

const findMemberByField = async (baseUrl: string, token: string, field: string, value: string) => {
  for (const where of whereClausesForField(field, value)) {
    const rows = await queryMemberRows(baseUrl, token, where);
    if (rows[0]) return rows[0];
  }
  return null;
};

const resolveKaiserStatusLabel = async (baseUrl: string, token: string, rawValue: string) => {
  if (!rawValue || !looksLikeNumericId(rawValue)) return rawValue;
  const id = rawValue.replace(/\.0+$/, '');
  const where = `Kaiser_ID_Status=${id}`;
  const url =
    `${baseUrl}/tables/CalAIM_Kaiser_Status/records` +
    `?q.where=${encodeURIComponent(where)}` +
    `&q.select=${encodeURIComponent('Kaiser_ID_Status,Status')}` +
    `&q.limit=1`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return '';
  const json = await response.json().catch(() => ({}));
  const row = Array.isArray(json?.Result) ? json.Result[0] : null;
  return clean(row?.Status);
};

const preferredKaiserStatus = async (baseUrl: string, token: string, row: Record<string, any>) => {
  const label = rowValue(row, 'Kaiser_Status');
  const idValue = rowValue(row, 'Kaiser_ID_Status');
  if (label && !looksLikeNumericId(label)) return label;
  if (idValue && !looksLikeNumericId(idValue)) return idValue;
  const resolved = await resolveKaiserStatusLabel(baseUrl, token, idValue || label);
  return resolved || label || idValue;
};

export async function POST(request: NextRequest) {
  const authz = await requireAdminApiAuth(request, { requireTwoFactor: false });
  if (!authz.ok) {
    return NextResponse.json({ success: false, error: authz.error }, { status: authz.status });
  }

  const body = await request.json().catch(() => ({}));
  const mrn = clean(body?.mrn, 40);
  const name = clean(body?.name, 120);
  const clientId2 = clean(body?.clientId2, 40);
  if (!mrn && !name && !clientId2) {
    return NextResponse.json({ success: false, error: 'A member MRN or name is required.' }, { status: 400 });
  }

  try {
    const config = getCaspioServerConfig();
    const token = await getCaspioServerAccessToken(config);
    const baseUrl = config.restBaseUrl;
    let row: Record<string, any> | null = null;

    if (clientId2) {
      row = await findMemberByField(baseUrl, token, 'Client_ID2', clientId2);
    }

    if (!row && mrn) {
      for (const field of ['MCP_CIN', 'MediCal_Number']) {
        row = await findMemberByField(baseUrl, token, field, mrn);
        if (row) break;
      }
    }

    if (!row && name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const first = parts[0] || '';
      const last = parts.length > 1 ? parts[parts.length - 1] : '';
      if (first && last) {
        const where = `Senior_First='${esc(first)}' AND Senior_Last='${esc(last)}'`;
        const rows = await queryMemberRows(baseUrl, token, where);
        row = rows[0] || null;
      }
    }

    if (!row) {
      return NextResponse.json({
        success: true,
        found: false,
        kaiserStatus: 'Member was not found in Caspio',
        memberName: name,
        mrn,
      });
    }

    const clientId = rowValue(row, 'Client_ID2', 'client_ID2');
    const pkId = rowValue(row, 'PK_ID');
    let status = await preferredKaiserStatus(baseUrl, token, row);
    if (!status && (clientId || pkId)) {
      const where = clientId ? `Client_ID2='${esc(clientId)}'` : `PK_ID=${pkId}`;
      const fullUrl =
        `${baseUrl}/tables/CalAIM_tbl_Members/records` +
        `?q.where=${encodeURIComponent(where)}` +
        `&q.limit=1`;
      const fullResponse = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (fullResponse.ok) {
        const fullJson = await fullResponse.json().catch(() => ({}));
        const full = Array.isArray(fullJson?.Result) ? fullJson.Result[0] : null;
        if (full) status = await preferredKaiserStatus(baseUrl, token, full);
      }
    }

    return NextResponse.json({
      success: true,
      found: true,
      kaiserStatus: status || 'No Kaiser_Status on the Caspio record',
      memberName: [rowValue(row, 'Senior_First'), rowValue(row, 'Senior_Last')].filter(Boolean).join(' ') || name,
      mrn: rowValue(row, 'MCP_CIN', 'MediCal_Number') || mrn,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: String(error?.message || 'Could not pull Kaiser_Status') },
      { status: 500 }
    );
  }
}
