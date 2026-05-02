import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { trackCaspioCall } from '@/lib/caspio-usage-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAdminAccess(request: NextRequest) {
  const adminSession = request.cookies.get('calaim_admin_session')?.value;
  if (adminSession) return { isAdmin: true as const };

  const authHeader = request.headers.get('authorization');
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return { isAdmin: false as const, error: 'Admin access required' };

  const adminModule = await import('@/firebase-admin');
  const adminDb = adminModule.adminDb;
  const decoded = await adminModule.default.auth().verifyIdToken(tokenMatch[1]);
  const email = decoded.email?.toLowerCase();
  const uid = decoded.uid;

  let isAdmin = isHardcodedAdminEmail(email);
  if (!isAdmin && uid) {
    const [adminDoc, superAdminDoc] = await Promise.all([
      adminDb.collection('roles_admin').doc(uid).get(),
      adminDb.collection('roles_super_admin').doc(uid).get(),
    ]);
    isAdmin = adminDoc.exists || superAdminDoc.exists;
  }
  return { isAdmin: isAdmin as boolean };
}

type SwAddressRow = {
  sw_id: string;
  county?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  address: string;
  email?: string;
  raw?: any;
};

function normalizeRow(record: any): SwAddressRow | null {
  const pick = (...values: any[]) => {
    for (const v of values) {
      const s = String(v ?? '').trim();
      if (s) return s;
    }
    return '';
  };

  const sw_id = pick(record?.SW_ID, record?.sw_id, record?.Sw_Id, record?.Social_Worker_ID, record?.User_ID2);
  if (!sw_id) return null;

  const county = pick(record?.County, record?.county, record?.Member_County);
  const phone = pick(
    record?.Cell_Phone,
    record?.cell_phone,
    record?.Phone,
    record?.phone,
    record?.Phone_Number,
    record?.Cell,
    record?.Mobile
  );
  const street = pick(record?.Street_Address, record?.street_address, record?.Address, record?.Street);
  const city = pick(record?.City, record?.city);
  const state = pick(record?.State, record?.state, 'CA');
  const zip = pick(record?.Zip, record?.zip, record?.Zip_Code, record?.Postal_Code);
  const email = pick(record?.Email, record?.email, record?.Email_Address, record?.email_address);

  const address = [street, city, state].map((p) => String(p || '').trim()).filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');

  return {
    sw_id: String(sw_id).trim(),
    county: county || undefined,
    phone: phone || undefined,
    street: street || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
    address,
    email: email || undefined,
    raw: record || null,
  };
}

const USER_REG_TABLE_CANDIDATES = [
  'connect_tbl_userregistration',
  'connect_tbl_usersregistration',
  'tbl_usersregistration',
  'usersregistration',
];
const SW_TABLE = 'CalAIM_tbl_Social_Worker';
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const SW_FIELD_FALLBACKS: Record<string, string[]> = {
  Phone_Number: ['Phone', 'Cell_Phone'],
  Phone: ['Cell_Phone', 'Phone_Number'],
  Address: ['Street_Address'],
  County: ['Member_County'],
  Zip: ['Zip_Code'],
};

const caspioEscape = (value: string) => String(value || '').replace(/'/g, "''");

async function fetchTableRows(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  accessToken: string,
  tableName: string,
  select: string
) {
  const rows: any[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const url = `${credentials.baseUrl}/integrations/rest/v3/tables/${tableName}/records?q.pageSize=${PAGE_SIZE}&q.pageNumber=${pageNumber}&q.select=${encodeURIComponent(
      select
    )}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    trackCaspioCall({ method: 'GET', kind: 'read', status: res.status, ok: res.ok, context: `sw-userregistration-addresses:${tableName}` });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    const page = Array.isArray(data?.Result) ? data.Result : [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function extractInvalidColumnName(errorText: string): string | null {
  const m = String(errorText || '').match(/Invalid column name '([^']+)'/i);
  return m?.[1] ? String(m[1]).trim() : null;
}

async function updateSocialWorkerRowWithFallback(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  accessToken: string,
  swId: string,
  payload: Record<string, string>
) {
  let attemptPayload: Record<string, string> = { ...payload };
  let tries = 0;

  while (tries < 10) {
    tries += 1;
    if (Object.keys(attemptPayload).length === 0) {
      return { ok: true, responseText: '', usedPayload: attemptPayload };
    }

    const where = encodeURIComponent(`SW_ID='${caspioEscape(swId)}'`);
    const updateUrl = `${credentials.baseUrl}/integrations/rest/v3/tables/${SW_TABLE}/records?q.where=${where}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(attemptPayload),
    });
    const responseText = await updateRes.text().catch(() => '');
    trackCaspioCall({ method: 'PUT', kind: 'write', status: updateRes.status, ok: updateRes.ok, context: `sw-userregistration-addresses:${SW_TABLE}` });

    if (updateRes.ok) {
      return { ok: true, responseText, usedPayload: attemptPayload };
    }

    const invalidColumn = extractInvalidColumnName(responseText);
    if (!invalidColumn) {
      return { ok: false, responseText: responseText || `${updateRes.status} ${updateRes.statusText}`, usedPayload: attemptPayload };
    }

    // Remap or drop invalid fields and retry.
    if (Object.prototype.hasOwnProperty.call(attemptPayload, invalidColumn)) {
      const value = attemptPayload[invalidColumn];
      delete attemptPayload[invalidColumn];
      const fallbacks = SW_FIELD_FALLBACKS[invalidColumn] || [];
      for (const fallbackField of fallbacks) {
        if (!Object.prototype.hasOwnProperty.call(attemptPayload, fallbackField)) {
          attemptPayload[fallbackField] = value;
          break;
        }
      }
      continue;
    }

    return { ok: false, responseText: responseText || `${updateRes.status} ${updateRes.statusText}`, usedPayload: attemptPayload };
  }

  return { ok: false, responseText: 'Exceeded retry limit while remapping target columns.', usedPayload: attemptPayload };
}

async function fetchUserRegistrationRows(
  credentials: ReturnType<typeof getCaspioCredentialsFromEnv>,
  accessToken: string
) {
  const selectCandidates = [
    // Schema reported by user table
    ['SW_ID', 'County', 'Cell_Phone', 'Street_Address', 'City', 'State', 'Zip', 'Email'],
    // Most complete shape (newer schemas)
    ['SW_ID', 'County', 'Phone', 'Street_Address', 'Address', 'City', 'State', 'Zip', 'Email'],
    // Common legacy shape without Address
    ['SW_ID', 'County', 'Phone', 'Street_Address', 'City', 'State', 'Zip', 'Email'],
    // Common legacy shape without Phone
    ['SW_ID', 'County', 'Street_Address', 'Address', 'City', 'State', 'Zip', 'Email'],
    // Very conservative
    ['SW_ID', 'County', 'Street_Address', 'City', 'State', 'Zip', 'Email'],
    ['SW_ID', 'Street_Address', 'City', 'State', 'Zip', 'Email'],
    // Minimal required fallback
    ['SW_ID', 'City', 'Zip', 'Email'],
    ['SW_ID', 'Email'],
  ];
  const errors: string[] = [];

  for (const tableName of USER_REG_TABLE_CANDIDATES) {
    let tableHadInvalidColumnError = false;
    for (const selectParts of selectCandidates) {
      const select = selectParts.join(',');
      try {
        const rows = await fetchTableRows(credentials, accessToken, tableName, select);
        return { tableName, rows };
      } catch (error: any) {
        const message = String(error?.message || error);
        const lower = message.toLowerCase();
        if (lower.includes('invalid column name')) {
          tableHadInvalidColumnError = true;
          continue; // try narrower projection on the same table
        }
        if (lower.includes('tablenotfound') || lower.includes('do not exist')) {
          // table alias does not exist; move to next table candidate
          errors.push(`${tableName}: table not found`);
          tableHadInvalidColumnError = false;
          break;
        }
        errors.push(`${tableName}: ${message}`);
        // unknown failure for this table, move on
        tableHadInvalidColumnError = false;
        break;
      }
    }
    if (tableHadInvalidColumnError) {
      errors.push(`${tableName}: table exists but available columns differ from expected SW projection`);
    }
  }
  throw new Error(
    `Could not read users registration data with a compatible table/column set. Tried: ${errors.join(' | ')}`
  );
}

function pickBetterRow(current: SwAddressRow | undefined, incoming: SwAddressRow): SwAddressRow {
  if (!current) return incoming;
  const score = (r: SwAddressRow) =>
    [r.county, r.phone, r.address, r.city, r.zip, r.email]
      .map((v) => String(v || '').trim())
      .filter(Boolean).length;
  return score(incoming) > score(current) ? incoming : current;
}

function buildBySwId(rows: SwAddressRow[]) {
  const map = new Map<string, SwAddressRow>();
  for (const row of rows) {
    const id = String(row.sw_id || '').trim();
    if (!id) continue;
    map.set(id, pickBetterRow(map.get(id), row));
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.isAdmin) {
      return NextResponse.json({ success: false, error: access.error || 'Admin access required' }, { status: 403 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const { tableName, rows } = await fetchUserRegistrationRows(credentials, accessToken);

    const normalized = rows.map(normalizeRow).filter(Boolean) as SwAddressRow[];

    const bySwId = buildBySwId(normalized);
    const records = Array.from(bySwId.values());

    return NextResponse.json({
      success: true,
      tableName,
      total: records.length,
      records,
    });
  } catch (error: any) {
    console.error('❌ Error fetching SW user registration addresses:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch SW user registration addresses' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.isAdmin) {
      return NextResponse.json({ success: false, error: access.error || 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
    const dryRun = Boolean(body?.dryRun);
    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const { tableName: sourceTable, rows: sourceRowsRaw } = await fetchUserRegistrationRows(credentials, accessToken);
    const sourceRows = Array.from(buildBySwId(sourceRowsRaw.map(normalizeRow).filter(Boolean) as SwAddressRow[]).values());

    const swSelect = ['SW_ID'].join(',');
    const swRowsRaw = await fetchTableRows(credentials, accessToken, SW_TABLE, swSelect);
    const swRowsById = new Map<string, any>();
    for (const row of swRowsRaw) {
      const id = String(row?.SW_ID || '').trim();
      if (!id) continue;
      swRowsById.set(id, row);
    }

    let matched = 0;
    let unchanged = 0;
    let updated = 0;
    let notFound = 0;
    const failures: Array<{ sw_id: string; error: string }> = [];

    for (const src of sourceRows) {
      const swId = String(src.sw_id || '').trim();
      if (!swId) continue;
      const target = swRowsById.get(swId);
      if (!target) {
        notFound += 1;
        continue;
      }
      matched += 1;

      const payload: Record<string, string> = {};
      const updates: Array<[string, string]> = [
        ['County', String(src.county || '').trim()],
        ['Phone_Number', String(src.phone || '').trim()],
        ['Address', String(src.address || '').trim()],
        ['City', String(src.city || '').trim()],
        ['Zip', String(src.zip || '').trim()],
      ];
      for (const [field, nextValue] of updates) {
        if (!nextValue) continue;
        payload[field] = nextValue;
      }

      if (Object.keys(payload).length === 0) {
        unchanged += 1;
        continue;
      }

      if (dryRun) {
        updated += 1;
        continue;
      }

      const updateResult = await updateSocialWorkerRowWithFallback(credentials, accessToken, swId, payload);
      if (!updateResult.ok) {
        failures.push({ sw_id: swId, error: updateResult.responseText || 'Unknown Caspio update error' });
        continue;
      }
      updated += 1;
    }

    return NextResponse.json({
      success: failures.length === 0,
      dryRun,
      sourceTable,
      targetTable: SW_TABLE,
      sourceRows: sourceRows.length,
      targetRows: swRowsById.size,
      matched,
      updated,
      unchanged,
      notFound,
      failures: failures.slice(0, 25),
    });
  } catch (error: any) {
    console.error('❌ Error backfilling SW contact fields:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to backfill social worker contact fields' },
      { status: 500 }
    );
  }
}

