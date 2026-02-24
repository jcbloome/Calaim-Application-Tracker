import { NextRequest, NextResponse } from 'next/server';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { fetchCaspioSocialWorkers, getCaspioCredentialsFromEnv, getCaspioToken } from '@/lib/caspio-api-utils';
import { trackCaspioCall } from '@/lib/caspio-usage-tracker';
import { geocodeWithCacheDetailed, haversineMiles } from '@/lib/geo/geocode-cache';
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

const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => String(s || '').trim()).filter(Boolean)));

async function asyncPool<T, R>(limit: number, items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const workers = Array.from({ length: workerCount }).map(async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) return;
      out[idx] = await task(items[idx]);
    }
  });

  await Promise.all(workers);
  return out;
}

type SuggestBody = {
  capacityPerSw?: number;
  maxRcfes?: number;
  maxMiles?: number | null;
  includeHolds?: boolean;
};

type SwBase = {
  sw_id: string;
  name: string;
  email?: string;
  address?: string;
  geo?: { lat: number; lng: number; formattedAddress: string; cached: boolean } | null;
  currentAssignedCount: number;
};

type MemberLite = {
  clientId2: string;
  memberName: string;
  memberCounty?: string;
  memberCity?: string;
};

type RcfeGroup = {
  rcfeName: string;
  rcfeAddress: string;
  memberCount: number;
  members: MemberLite[];
  geo?: { lat: number; lng: number; formattedAddress: string; cached: boolean } | null;
  county?: string;
  city?: string;
};

async function fetchRcfeAddressByName(params: { accessToken: string; baseUrl: string }) {
  const { accessToken, baseUrl } = params;
  const tableName = 'CalAIM_tbl_New_RCFE_Registration';
  const pageSize = 200;
  const maxPages = 25;
  const selectFields = ['RCFE_Name', 'RCFE_Street', 'RCFE_City', 'RCFE_State', 'RCFE_Zip', 'RCFE_County'].join(',');

  const map = new Map<string, { address: string; city?: string; county?: string }>();
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const url = `${baseUrl}/rest/v2/tables/${tableName}/records?q.pageSize=${pageSize}&q.pageNumber=${pageNumber}&q.select=${encodeURIComponent(
      selectFields
    )}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    trackCaspioCall({ method: 'GET', kind: 'read', status: res.status, ok: res.ok, context: `sw-geo-assign:rcfe:${tableName}` });
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
      const county = String(r?.RCFE_County || '').trim();
      const addr = [street, city, state].filter(Boolean).join(', ') + (zip ? ` ${zip}` : '');
      if (name && addr && !map.has(name)) map.set(name, { address: addr, city: city || undefined, county: county || undefined });
    });
    if (rows.length < pageSize) break;
  }
  return map;
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyAdminAccess(request);
    if (!access.isAdmin) {
      return NextResponse.json({ success: false, error: access.error || 'Admin access required' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as SuggestBody;
    const capacityPerSw = Math.min(100, Math.max(5, Math.floor(Number(body.capacityPerSw || 30))));
    const maxRcfes = Math.min(3000, Math.max(50, Math.floor(Number(body.maxRcfes || 800))));
    const maxMilesRaw = body.maxMiles == null ? null : Number(body.maxMiles);
    const maxMiles = maxMilesRaw != null && Number.isFinite(maxMilesRaw) ? Math.max(1, maxMilesRaw) : null;
    const includeHolds = Boolean(body.includeHolds);

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Google Maps API key not configured' }, { status: 500 });
    }

    const adminModule = await import('@/firebase-admin');
    const adminDb = adminModule.adminDb;

    const credentials = getCaspioCredentialsFromEnv();
    const [swRoster, addrRes] = await Promise.all([
      fetchCaspioSocialWorkers(credentials, { includeAssignmentCounts: true }),
      (async () => {
        // Call our own route to reuse admin auth + normalization.
        const url = new URL(request.url);
        url.pathname = '/api/tools/sw-userregistration-addresses';
        const headers: Record<string, string> = {};
        const authHeader = request.headers.get('authorization');
        if (authHeader) headers.authorization = authHeader;
        const cookie = request.headers.get('cookie');
        if (cookie) headers.cookie = cookie;
        const res = await fetch(url.toString(), { method: 'GET', headers, cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Failed to load SW addresses (HTTP ${res.status})`);
        }
        return Array.isArray(data.records) ? (data.records as any[]) : [];
      })(),
    ]);

    const addressBySwId = new Map<string, string>();
    addrRes.forEach((r: any) => {
      const id = String(r?.sw_id || r?.swId || '').trim();
      const addr = String(r?.address || '').trim();
      if (id && addr && !addressBySwId.has(id)) addressBySwId.set(id, addr);
    });

    const swBases: SwBase[] = swRoster.map((sw) => {
      const swId = String((sw as any)?.sw_id || '').trim();
      const addr = swId ? addressBySwId.get(swId) || '' : '';
      return {
        sw_id: swId,
        name: String((sw as any)?.name || `SW ${swId}`).trim(),
        email: String((sw as any)?.email || '').trim() || undefined,
        address: addr || undefined,
        geo: null,
        currentAssignedCount: Number((sw as any)?.assignedMemberCount || 0),
      };
    });

    // Geocode SW bases
    const swWithGeo = await asyncPool(5, swBases, async (sw) => {
      if (!sw.address) return sw;
      const r = await geocodeWithCacheDetailed({ adminDb, address: sw.address, apiKey });
      const geo = r.geo;
      return {
        ...sw,
        geo,
        ...(r.error ? { geocodeError: r.error } : {}),
      } as any;
    });

    // Load members from Firestore cache
    const membersSnap = await adminDb
      .collection('caspio_members_cache')
      .where('CalAIM_Status', '==', 'Authorized')
      .limit(5000)
      .get();
    const rawMembers = membersSnap.docs.map((d) => d.data() as any);

    const isHold = (value: any) => {
      const v = String(value ?? '').trim().toLowerCase();
      if (!v) return false;
      return v.includes('hold') || v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'x';
    };

    const filteredMembers = includeHolds ? rawMembers : rawMembers.filter((m) => !isHold(m?.Hold_For_Social_Worker_Visit ?? m?.Hold_For_Social_Worker));

    // RCFE canonical addresses (best-effort)
    const accessToken = await getCaspioToken(credentials);
    const rcfeByName = await fetchRcfeAddressByName({ accessToken, baseUrl: credentials.baseUrl });

    const groups = new Map<string, RcfeGroup>();
    for (const m of filteredMembers) {
      const rcfeNameRaw = String(m?.RCFE_Name || '').trim();
      const rcfeName = normalizeRcfeNameForAssignment(rcfeNameRaw);
      // Only consider members that have a real RCFE selected (exclude placeholders like "CalAIM_Use...").
      if (!rcfeName) continue;
      const clientId2 = String(m?.Client_ID2 || m?.clientId2 || '').trim();
      const memberName =
        String(m?.memberName || '').trim() ||
        `${String(m?.memberFirstName || '').trim()} ${String(m?.memberLastName || '').trim()}`.trim() ||
        clientId2 ||
        'Member';

      const canonical = rcfeByName.get(rcfeName) || null;
      const rcfeAddress = String(canonical?.address || m?.RCFE_Address || '').trim();
      if (!rcfeAddress) continue;

      const county = String(canonical?.county || m?.RCFE_County || m?.memberCounty || m?.Member_County || '').trim() || undefined;
      const city = String(canonical?.city || m?.RCFE_City || m?.MemberCity || m?.memberCity || '').trim() || undefined;

      const key = rcfeName;
      const g = groups.get(key) || {
        rcfeName,
        rcfeAddress,
        memberCount: 0,
        members: [],
        geo: null,
        county,
        city,
      };
      g.memberCount += 1;
      g.members.push({
        clientId2,
        memberName,
        memberCounty: county,
        memberCity: city,
      });
      groups.set(key, g);
    }

    const rcfeGroups = Array.from(groups.values())
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, maxRcfes);

    const rcfeWithGeo = await asyncPool(5, rcfeGroups, async (g) => {
      const r = await geocodeWithCacheDetailed({ adminDb, address: g.rcfeAddress, apiKey });
      const geo = r.geo;
      return {
        ...g,
        geo,
        ...(r.error ? { geocodeError: r.error } : {}),
      } as any;
    });

    const swCandidates = swWithGeo.filter((sw) => !!sw.geo && !!sw.sw_id);
    const capacities = new Map<string, { cap: number; used: number }>();
    swCandidates.forEach((sw) => capacities.set(sw.sw_id, { cap: capacityPerSw, used: 0 }));

    type AssignedRcfe = RcfeGroup & { assignedSwId: string; assignedSwName: string; distanceMiles: number };
    const assigned: AssignedRcfe[] = [];
    const overflow: Array<RcfeGroup & { reason: string }> = [];

    for (const g of rcfeWithGeo) {
      if (!g.geo) {
        const err = (g as any)?.geocodeError as any;
        const status = String(err?.status || '').trim();
        const msg = String(err?.errorMessage || '').trim();
        overflow.push({ ...g, reason: status ? `RCFE geocode failed (${status}${msg ? `: ${msg}` : ''})` : 'RCFE geocode failed' });
        continue;
      }

      let best: { sw: SwBase; distance: number } | null = null;
      for (const sw of swCandidates) {
        const cap = capacities.get(sw.sw_id);
        if (!cap) continue;
        if (cap.used + g.memberCount > cap.cap) continue;
        const dist = haversineMiles({ lat: sw.geo!.lat, lng: sw.geo!.lng }, { lat: g.geo.lat, lng: g.geo.lng });
        if (maxMiles != null && dist > maxMiles) continue;
        if (!best || dist < best.distance) best = { sw, distance: dist };
      }

      if (!best) {
        overflow.push({ ...g, reason: 'No SW capacity available (or maxMiles constraint)' });
        continue;
      }

      const cap = capacities.get(best.sw.sw_id)!;
      cap.used += g.memberCount;
      capacities.set(best.sw.sw_id, cap);
      assigned.push({
        ...g,
        assignedSwId: best.sw.sw_id,
        assignedSwName: best.sw.name,
        distanceMiles: Math.round(best.distance * 10) / 10,
      });
    }

    const assignedBySw = new Map<string, AssignedRcfe[]>();
    assigned.forEach((a) => {
      assignedBySw.set(a.assignedSwId, [...(assignedBySw.get(a.assignedSwId) || []), a]);
    });

    const swById = new Map<string, { sw_id: string; name: string; email?: string }>();
    swWithGeo.forEach((sw) => swById.set(sw.sw_id, { sw_id: sw.sw_id, name: sw.name, email: sw.email }));

    const swSummary = swWithGeo.map((sw) => {
      const list = assignedBySw.get(sw.sw_id) || [];
      const suggestedMemberCount = list.reduce((sum, r) => sum + r.memberCount, 0);
      const countyBreakdown: Record<string, number> = {};
      const cityBreakdown: Record<string, number> = {};
      list.forEach((r) => {
        const county = String(r.county || 'Unknown').trim() || 'Unknown';
        const city = String(r.city || 'Unknown').trim() || 'Unknown';
        countyBreakdown[county] = (countyBreakdown[county] || 0) + r.memberCount;
        cityBreakdown[city] = (cityBreakdown[city] || 0) + r.memberCount;
      });
      return {
        ...sw,
        suggestedMemberCount,
        remainingCapacity: capacityPerSw - suggestedMemberCount,
        countyBreakdown,
        cityBreakdown,
        assignedRcfes: list
          .slice()
          .sort((a, b) => a.distanceMiles - b.distanceMiles)
          .map((r) => ({
            rcfeName: r.rcfeName,
            rcfeAddress: r.rcfeAddress,
            memberCount: r.memberCount,
            distanceMiles: r.distanceMiles,
            county: r.county || null,
            city: r.city || null,
            geo: r.geo || null,
            membersSample: r.members.slice(0, 10),
          })),
      };
    });

    const missingSwAddresses = swSummary.filter((s) => !s.address).map((s) => s.sw_id);
    const swGeocodeFailed = swSummary.filter((s) => s.address && !s.geo).map((s) => s.sw_id);

    const memberAssignments = assigned.flatMap((r) => {
      const sw = swById.get(r.assignedSwId) || null;
      return r.members.map((m) => ({
        clientId2: m.clientId2,
        memberName: m.memberName,
        memberCounty: m.memberCounty || null,
        memberCity: m.memberCity || null,
        rcfeName: r.rcfeName,
        rcfeAddress: r.rcfeAddress,
        rcfeCounty: r.county || null,
        rcfeCity: r.city || null,
        suggestedSwId: r.assignedSwId,
        suggestedSwName: sw?.name || r.assignedSwName,
        suggestedSwEmail: sw?.email || null,
        distanceMiles: r.distanceMiles,
      }));
    });

    return NextResponse.json({
      success: true,
      capacityPerSw,
      maxRcfes,
      maxMiles,
      includeHolds,
      stats: {
        swTotal: swSummary.length,
        swWithGeo: swSummary.filter((s) => !!s.geo).length,
        rcfeTotal: rcfeGroups.length,
        rcfeGeocoded: rcfeWithGeo.filter((r) => !!r.geo).length,
        assignedRcfes: assigned.length,
        overflowRcfes: overflow.length,
        assignedMembers: assigned.reduce((sum, r) => sum + r.memberCount, 0),
        overflowMembers: overflow.reduce((sum, r) => sum + r.memberCount, 0),
        missingSwAddresses: missingSwAddresses.length,
        swGeocodeFailed: swGeocodeFailed.length,
      },
      sw: swSummary,
      memberAssignments,
      overflow: overflow
        .slice()
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 200)
        .map((r) => ({
          rcfeName: r.rcfeName,
          rcfeAddress: r.rcfeAddress,
          memberCount: r.memberCount,
          county: r.county || null,
          city: r.city || null,
          reason: (r as any).reason || 'Unassigned',
        })),
    });
  } catch (error: any) {
    console.error('❌ Error suggesting SW geo assignments:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to suggest geo assignments' },
      { status: 500 }
    );
  }
}

