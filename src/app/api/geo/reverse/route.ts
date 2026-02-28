import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReverseGeoResponse =
  | { success: true; address: string }
  | { success: false; error: string };

const toNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
};

const buildAddress = (raw: any): string => {
  const a = raw?.address || {};
  const house = String(a.house_number || '').trim();
  const road = String(a.road || a.pedestrian || a.footway || '').trim();
  const city = String(a.city || a.town || a.village || a.hamlet || '').trim();
  const state = String(a.state || '').trim();
  const postcode = String(a.postcode || '').trim();

  const line1 = [house, road].filter(Boolean).join(' ').trim();
  const line2 = [city, state].filter(Boolean).join(', ').trim();
  const line3 = postcode;

  const compact = [line1, line2, line3].filter(Boolean).join(', ').trim();
  return compact || String(raw?.display_name || '').trim();
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = toNum(searchParams.get('lat'));
    const lng = toNum(searchParams.get('lng'));

    if (lat === null || lng === null) {
      return NextResponse.json<ReverseGeoResponse>(
        { success: false, error: 'lat and lng are required numbers' },
        { status: 400 }
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json<ReverseGeoResponse>(
        { success: false, error: 'lat/lng out of range' },
        { status: 400 }
      );
    }

    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');

    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim requires a real User-Agent identifying the application.
        'User-Agent': 'Calaim-Application-Tracker/1.0 (reverse-geocode)',
        Accept: 'application/json',
      },
      // Keep this request from hanging.
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json<ReverseGeoResponse>(
        { success: false, error: `Reverse geocode failed (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const data = (await res.json().catch(() => null)) as any;
    const address = buildAddress(data);
    if (!address) {
      return NextResponse.json<ReverseGeoResponse>(
        { success: false, error: 'No address found for this location' },
        { status: 404 }
      );
    }

    return NextResponse.json<ReverseGeoResponse>({ success: true, address });
  } catch (e: any) {
    return NextResponse.json<ReverseGeoResponse>(
      { success: false, error: e?.message || 'Reverse geocode failed' },
      { status: 500 }
    );
  }
}

