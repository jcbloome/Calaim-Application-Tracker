import crypto from 'crypto';

export type LatLng = { lat: number; lng: number };
export type GeocodeOk = { lat: number; lng: number; formattedAddress: string; cached: boolean };
export type GeocodeError = { status: string; errorMessage?: string };

export function haversineMiles(a: LatLng, b: LatLng) {
  const R = 3958.8; // miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function normalizeAddressKey(address: string) {
  const s = String(address || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .slice(0, 500);

  // Prefer "ca 91504" (no comma before ZIP).
  return s.replace(/,\s*([a-z]{2}),\s*(\d{5})(?:-\d{4})?\b/g, ', $1 $2');
}

export async function geocodeWithCache(params: { adminDb: any; address: string; apiKey: string }) {
  const res = await geocodeWithCacheDetailed(params);
  return res.geo;
}

export async function geocodeWithCacheDetailed(params: { adminDb: any; address: string; apiKey: string }) {
  const { adminDb, address, apiKey } = params;
  const normalized = normalizeAddressKey(address);
  if (!normalized) return { geo: null as GeocodeOk | null, error: { status: 'INVALID_REQUEST', errorMessage: 'Empty address' } };

  const key = crypto.createHash('sha1').update(normalized).digest('hex');
  const ref = adminDb.collection('geo_cache').doc(key);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as any;
    if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
      return {
        geo: {
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress || data.address || address,
        cached: true as const,
        },
        error: null as GeocodeError | null,
      };
    }
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalized)}&key=${encodeURIComponent(
    apiKey
  )}`;

  let data: any = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    data = (await res.json().catch(() => ({}))) as any;
    const status = String(data?.status || '').toUpperCase();
    if (res.ok && status === 'OK') break;

    // Retry on transient throttling / backend errors.
    if (status === 'OVER_QUERY_LIMIT' || status === 'UNKNOWN_ERROR') {
      const backoffMs = 250 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    const err: GeocodeError = { status: status || 'ERROR', errorMessage: String(data?.error_message || '').trim() || undefined };
    try {
      const adminModule = await import('@/firebase-admin');
      await ref.set(
        {
          normalized,
          lastErrorStatus: err.status,
          lastErrorMessage: err.errorMessage || null,
          lastErrorAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
          updatedAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // ignore
    }
    return { geo: null as GeocodeOk | null, error: err };
  }
  if (!data || String(data?.status || '').toUpperCase() !== 'OK') {
    const status = String(data?.status || '').toUpperCase() || 'ERROR';
    const err: GeocodeError = { status, errorMessage: String(data?.error_message || '').trim() || undefined };
    try {
      const adminModule = await import('@/firebase-admin');
      await ref.set(
        {
          normalized,
          lastErrorStatus: err.status,
          lastErrorMessage: err.errorMessage || null,
          lastErrorAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
          updatedAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // ignore
    }
    return { geo: null as GeocodeOk | null, error: err };
  }
  const result = data?.results?.[0];
  const loc = result?.geometry?.location;
  const lat = typeof loc?.lat === 'number' ? loc.lat : null;
  const lng = typeof loc?.lng === 'number' ? loc.lng : null;
  if (lat == null || lng == null) {
    return { geo: null as GeocodeOk | null, error: { status: 'NO_GEOMETRY' } };
  }

  const formattedAddress = String(result?.formatted_address || address).trim();

  try {
    const adminModule = await import('@/firebase-admin');
    await ref.set(
      {
        address: formattedAddress,
        normalized,
        lat,
        lng,
        formattedAddress,
        lastErrorStatus: null,
        lastErrorMessage: null,
        lastErrorAt: null,
        updatedAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // ignore cache write errors
  }

  return { geo: { lat, lng, formattedAddress, cached: false as const }, error: null as GeocodeError | null };
}

