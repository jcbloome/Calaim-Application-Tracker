import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { trackCaspioCall } from '@/lib/caspio-usage-tracker';
import { geocodeWithCache, haversineMiles } from '@/lib/geo/geocode-cache';
import { normalizeRcfeNameForAssignment } from '@/lib/rcfe-utils';

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

async function fetchRcfeAddressByName(params: { accessToken: string; baseUrl: string }) {
  const { accessToken, baseUrl } = params;
  const tableName = 'CalAIM_tbl_New_RCFE_Registration';
  const pageSize = 200;
  const maxPages = 25;

  const selectFields = [
    'RCFE_Name',
    'RCFE_Street',
    'RCFE_City',
    'RCFE_State',
    'RCFE_Zip',
    'RCFE_County',
    'RCFE_Registered_ID',
    'Table_ID',
  ];

  const map = new Map<string, { address: string; raw: any }>();

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const sp = new URLSearchParams();
    sp.set('q.pageSize', String(pageSize));
    sp.set('q.pageNumber', String(pageNumber));
    sp.set('q.select', selectFields.join(','));
    const url = `${baseUrl}/rest/v2/tables/${tableName}/records?${sp.toString()}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    trackCaspioCall({ method: 'GET', kind: 'read', status: res.status, ok: res.ok, context: `closest-members:${tableName}` });
    if (!res.ok) break;
    const data = (await res.json().catch(() => ({}))) as any;
    const rows = Array.isArray(data?.Result) ? data.Result : [];
    if (rows.length === 0) break;

    rows.forEach((r: any) => {
      const name = String(r?.RCFE_Name || '').trim();
      const street = String(r?.RCFE_Street || '').trim();
      const city = String(r?.RCFE_City || '').trim();
      const state = String(r?.RCFE_State || 'CA').trim();
      const zip = String(r?.RCFE_Zip || '').trim();
      const addr = [street, city, state, zip].filter(Boolean).join(', ');
      if (name && addr && !map.has(name)) {
        map.set(name, { address: addr, raw: r });
      }
    });

    if (rows.length < pageSize) break;
  }

  return map;
}

export async function GET(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.isAdmin) {
      return NextResponse.json({ success: false, error: access.error || 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const swId = String(searchParams.get('swId') || '').trim();
    const limit = Math.min(50, Math.max(5, Number(searchParams.get('limit') || 15)));
    if (!swId) {
      return NextResponse.json({ success: false, error: 'Missing swId' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Google Maps API key not configured' }, { status: 500 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    // Load EFT address for this SW_ID (from Caspio EFT table via our cached endpoint logic in Firestore if possible).
    // We read directly from Caspio for correctness.
    const credentials = getCaspioCredentialsFromEnv();
    const accessToken = await getCaspioToken(credentials);

    const eftUrl = `${credentials.baseUrl}/rest/v2/tables/Cal_AIM_EFT_Setup/records?q.where=${encodeURIComponent(
      `User_ID2='${swId}' OR SW_ID='${swId}' OR User_ID='${swId}'`
    )}&q.pageSize=50&q.pageNumber=1`;
    const eftRes = await fetch(eftUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    trackCaspioCall({ method: 'GET', kind: 'read', status: eftRes.status, ok: eftRes.ok, context: 'closest-members:eft-setup' });
    const eftData = (await eftRes.json().catch(() => ({}))) as any;
    const eftRows = Array.isArray(eftData?.Result) ? eftData.Result : [];
    const eftRow = eftRows.find((r: any) => String(r?.User_ID2 || r?.SW_ID || r?.User_ID || '').trim() === swId) || eftRows[0] || null;

    const swStreet = String(eftRow?.Street || eftRow?.Address || '').trim();
    const swCity = String(eftRow?.City || '').trim();
    const swState = String(eftRow?.State || 'CA').trim();
    const swZip = String(eftRow?.Zip || '').trim();
    const swAddress = [swStreet, swCity, swState, swZip].filter(Boolean).join(', ');
    if (!swAddress) {
      return NextResponse.json({ success: false, error: `No EFT address found for SW_ID ${swId}` }, { status: 409 });
    }

    const swGeo = await geocodeWithCache({ adminDb, address: swAddress, apiKey });
    if (!swGeo) {
      return NextResponse.json({ success: false, error: `Failed to geocode SW address for SW_ID ${swId}` }, { status: 502 });
    }

    // Load RCFE addresses (exact table).
    const rcfeByName = await fetchRcfeAddressByName({ accessToken, baseUrl: credentials.baseUrl });

    // Load all authorized members (from Firestore cache).
    const membersSnap = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_Status', '==', 'Authorized')
      .limit(5000)
      .get();
    const members = membersSnap.docs.map((d) => d.data() as any);

    // Group members by RCFE_Name.
    const groups = new Map<
      string,
      { rcfeName: string; rcfeAddress: string; members: Array<{ clientId2: string; name: string; county?: string; city?: string }> }
    >();
    members.forEach((m) => {
      const rcfeNameRaw = String(m?.RCFE_Name || '').trim();
      const rcfeName = normalizeRcfeNameForAssignment(rcfeNameRaw);
      // Only consider members with a real RCFE selected (exclude placeholders like "CalAIM_Use...").
      if (!rcfeName) return;
      const clientId2 = String(m?.Client_ID2 || m?.clientId2 || m?.client_ID2 || m?.client_ID2 || '').trim();
      const name = String(m?.memberName || '').trim() || `${String(m?.memberFirstName || '').trim()} ${String(m?.memberLastName || '').trim()}`.trim();
      const rcfeAddress = rcfeByName.get(rcfeName)?.address || String(m?.RCFE_Address || '').trim();
      if (!rcfeAddress) return;

      const g = groups.get(rcfeName) || { rcfeName, rcfeAddress, members: [] as any[] };
      g.members.push({
        clientId2,
        name: name || clientId2 || 'Member',
        county: String(m?.memberCounty || m?.Member_County || '').trim() || undefined,
        city: String(m?.MemberCity || m?.memberCity || '').trim() || undefined,
      });
      groups.set(rcfeName, g);
    });

    // Compute distances per RCFE (geocode as needed).
    const scored: Array<{ rcfeName: string; rcfeAddress: string; distanceMiles: number; memberCount: number; sampleMembers: any[] }> = [];
    for (const g of groups.values()) {
      const rcfeGeo = await geocodeWithCache({ adminDb, address: g.rcfeAddress, apiKey });
      if (!rcfeGeo) continue;
      const distanceMiles = haversineMiles({ lat: swGeo.lat, lng: swGeo.lng }, { lat: rcfeGeo.lat, lng: rcfeGeo.lng });
      scored.push({
        rcfeName: g.rcfeName,
        rcfeAddress: rcfeGeo.formattedAddress || g.rcfeAddress,
        distanceMiles,
        memberCount: g.members.length,
        sampleMembers: g.members.slice(0, 8),
      });
    }

    scored.sort((a, b) => a.distanceMiles - b.distanceMiles);

    return NextResponse.json({
      success: true,
      sw: {
        swId,
        address: swGeo.formattedAddress || swAddress,
        lat: swGeo.lat,
        lng: swGeo.lng,
      },
      closestRcfes: scored.slice(0, limit),
      totalRcfesConsidered: scored.length,
      note: 'Distances are computed between SW EFT address and RCFE address (members are grouped by RCFE).',
    });
  } catch (error: any) {
    console.error('❌ closest-members error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to compute closest members' }, { status: 500 });
  }
}

