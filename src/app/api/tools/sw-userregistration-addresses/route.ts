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

  const street = pick(record?.Street_Address, record?.street_address, record?.Address, record?.Street);
  const city = pick(record?.City, record?.city);
  const state = pick(record?.State, record?.state, 'CA');
  const zip = pick(record?.Zip, record?.zip, record?.Zip_Code, record?.Postal_Code);
  const email = pick(record?.Email, record?.email, record?.Email_Address, record?.email_address);

  const address = [street, city, state, zip].map((p) => String(p || '').trim()).filter(Boolean).join(', ');

  return {
    sw_id: String(sw_id).trim(),
    street: street || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
    address,
    email: email || undefined,
    raw: record || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.isAdmin) {
      return NextResponse.json({ success: false, error: access.error || 'Admin access required' }, { status: 403 });
    }

    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const tableName = 'connect_tbl_usersregistration';
    const pageSize = 200;
    const maxPages = 50;
    const select = ['SW_ID', 'Street_Address', 'City', 'State', 'Zip', 'Email'].join(',');

    const rows: any[] = [];
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const url = `${credentials.baseUrl}/rest/v2/tables/${tableName}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}&q.select=${encodeURIComponent(
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
        return NextResponse.json(
          { success: false, error: `Failed to fetch ${tableName}`, details: text || `${res.status} ${res.statusText}` },
          { status: 500 }
        );
      }
      const data = (await res.json().catch(() => ({}))) as any;
      const page = Array.isArray(data?.Result) ? data.Result : [];
      if (page.length === 0) break;
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const normalized = rows.map(normalizeRow).filter(Boolean) as SwAddressRow[];

    // Prefer rows with a non-empty address per SW_ID.
    const bySwId = new Map<string, SwAddressRow>();
    for (const r of normalized) {
      const id = String(r.sw_id || '').trim();
      if (!id) continue;
      const existing = bySwId.get(id);
      const nextHasAddress = Boolean(String(r.address || '').trim());
      const existingHasAddress = Boolean(String(existing?.address || '').trim());
      if (!existing || (!existingHasAddress && nextHasAddress)) {
        bySwId.set(id, r);
      }
    }

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

