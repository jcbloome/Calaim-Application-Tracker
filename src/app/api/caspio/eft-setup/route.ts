import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { trackCaspioCall } from '@/lib/caspio-usage-tracker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAdminAccess(request: NextRequest) {
  const adminSession = request.cookies.get('calaim_admin_session')?.value;
  if (adminSession) {
    return { isAdmin: true as const };
  }

  const authHeader = request.headers.get('authorization');
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return { isAdmin: false as const, error: 'Admin access required' };
  }

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

function normalizeEftRecord(record: any) {
  const pick = (...values: any[]) => {
    for (const v of values) {
      const s = String(v ?? '').trim();
      if (s) return s;
    }
    return '';
  };

  const staffFirst = pick(record?.User_First, record?.user_first, record?.FirstName, record?.first_name);
  const staffLast = pick(record?.User_Last, record?.user_last, record?.LastName, record?.last_name);
  const staffName = pick(record?.Staff_Name, record?.staff_name, `${staffFirst} ${staffLast}`.trim());

  const swId = pick(
    // In `Cal_AIM_EFT_Setup` the SW identifier is often stored as User_ID2.
    record?.User_ID2,
    record?.user_id2,
    record?.User_ID,
    record?.user_id,
    record?.SW_ID,
    record?.sw_id,
    record?.Sw_Id,
    record?.Social_Worker_ID,
    record?.SocialWorkerId
  );

  const county = pick(record?.County, record?.county, record?.User_County, record?.user_county);

  const street = pick(
    record?.Address,
    record?.Street,
    record?.Street_Address,
    record?.Mailing_Address,
    record?.Home_Address,
    record?.EFT_Address,
    record?.EFT_Street
  );
  const city = pick(record?.City, record?.city, record?.EFT_City);
  const state = pick(record?.State, record?.state, record?.EFT_State, 'CA');
  const zip = pick(record?.Zip, record?.zip, record?.Zip_Code, record?.Postal_Code, record?.EFT_Zip);

  const addressParts = [street, city, state, zip].map((p) => String(p || '').trim()).filter(Boolean);
  const address = addressParts.join(addressParts.length > 2 ? ', ' : ' ');

  return {
    swId,
    staffName,
    county,
    street,
    city,
    state,
    zip,
    address,
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

    // Source of truth: use the same social worker roster as the SW tracker (`/api/caspio-staff`).
    const socialWorkers = await fetchCaspioSocialWorkers(credentials, { includeAssignmentCounts: false });
    const swById = new Map<string, { swId: string; name: string; email?: string }>();
    socialWorkers.forEach((sw) => {
      const swId = String((sw as any)?.sw_id || '').trim();
      if (!swId) return;
      swById.set(swId, { swId, name: String((sw as any)?.name || `SW ${swId}`).trim(), email: String((sw as any)?.email || '').trim() || undefined });
    });

    const tableName = 'Cal_AIM_EFT_Setup';
    const pageSize = 200;
    const maxPages = 25;
    const rows: any[] = [];

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const url = `${credentials.baseUrl}/rest/v2/tables/${tableName}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });
      trackCaspioCall({ method: 'GET', kind: 'read', status: res.status, ok: res.ok, context: `eft-setup:${tableName}` });

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

    const normalizedRows = rows
      .map((r) => ({ raw: r, ...normalizeEftRecord(r) }))
      .filter((r) => !!String((r as any)?.swId || '').trim());

    const eftBySwId = new Map<string, any>();
    normalizedRows.forEach((r) => {
      const id = String((r as any)?.swId || '').trim();
      if (!id) return;
      // Prefer the first row with a non-empty address.
      const existing = eftBySwId.get(id);
      const nextHasAddress = Boolean(String((r as any)?.address || '').trim());
      const existingHasAddress = Boolean(String(existing?.address || '').trim());
      if (!existing || (!existingHasAddress && nextHasAddress)) {
        eftBySwId.set(id, r);
      }
    });

    // Return all SWs from the SW roster, joined with EFT data when present.
    const records = Array.from(swById.values()).map((sw) => {
      const eft = eftBySwId.get(sw.swId) || null;
      const address = String(eft?.address || '').trim();
      const county = String(eft?.county || '').trim();
      return {
        swId: sw.swId,
        staffName: sw.name,
        email: sw.email,
        county,
        address,
        street: String(eft?.street || '').trim() || undefined,
        city: String(eft?.city || '').trim() || undefined,
        state: String(eft?.state || '').trim() || undefined,
        zip: String(eft?.zip || '').trim() || undefined,
        hasEft: Boolean(address),
        raw: eft?.raw || null,
      };
    });

    const sampleKeys = rows.length > 0 ? Object.keys(rows[0] || {}) : [];

    return NextResponse.json({
      success: true,
      tableName,
      total: records.length,
      sampleKeys,
      records,
    });
  } catch (error: any) {
    console.error('❌ Error fetching EFT setup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch EFT setup from Caspio' },
      { status: 500 }
    );
  }
}

