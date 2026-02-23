import crypto from 'crypto';

export type LatLng = { lat: number; lng: number };

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
  return String(address || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/,\s*/g, ', ')
    .slice(0, 500);
}

export async function geocodeWithCache(params: { adminDb: any; address: string; apiKey: string }) {
  const { adminDb, address, apiKey } = params;
  const normalized = normalizeAddressKey(address);
  if (!normalized) return null;

  const key = crypto.createHash('sha1').update(normalized).digest('hex');
  const ref = adminDb.collection('geo_cache').doc(key);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as any;
    if (typeof data?.lat === 'number' && typeof data?.lng === 'number') {
      return {
        lat: data.lat,
        lng: data.lng,
        formattedAddress: data.formattedAddress || data.address || address,
        cached: true as const,
      };
    }
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    normalized
  )}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { method: 'GET', cache: 'no-store' });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || data?.status !== 'OK') {
    return null;
  }
  const result = data?.results?.[0];
  const loc = result?.geometry?.location;
  const lat = typeof loc?.lat === 'number' ? loc.lat : null;
  const lng = typeof loc?.lng === 'number' ? loc.lng : null;
  if (lat == null || lng == null) return null;

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
        updatedAt: adminModule.default.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // ignore cache write errors
  }

  return { lat, lng, formattedAddress, cached: false as const };
}

