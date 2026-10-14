import { findCountyByCity } from '@/lib/california-cities';

/** Kaiser Northern California counties used for region detection. */
export const KAISER_NORTH_COUNTIES = new Set([
  // Bay Area
  'alameda',
  'contracosta',
  'marin',
  'napa',
  'sanfrancisco',
  'sanmateo',
  'santaclara',
  'solano',
  'sonoma',
  // Sacramento region
  'sacramento',
  'yolo',
  'placer',
  'eldorado',
  'sutter',
  'yuba',
  'amador',
  'nevada',
  // Central Valley (down through Fresno/Kings) — Fresno is Kaiser North
  'sanjoaquin',
  'stanislaus',
  'merced',
  'madera',
  'fresno',
  'kings',
  // Northern California
  'butte',
  'shasta',
  'tehama',
  'glenn',
  'colusa',
  'humboldt',
  'delnorte',
  'siskiyou',
  'trinity',
  'mendocino',
  'lake',
  'lassen',
  'modoc',
  'plumas',
]);

const UNKNOWN_COUNTY_TOKENS = new Set([
  '',
  'unknown',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'tbd',
  'notprovided',
  'notlisted',
]);

export type KaiserRegion = 'Kaiser North' | 'Kaiser South';

export const KAISER_NORTH_PROVIDER_PORTAL_URL =
  'https://healthy.kaiserpermanente.org/northern-california/community-providers';
export const KAISER_SOUTH_PROVIDER_PORTAL_URL =
  'https://healthy.kaiserpermanente.org/southern-california/community-providers';

export function getKaiserProviderPortal(region: unknown): { label: string; url: string } {
  return String(region || '').toLowerCase().includes('north')
    ? { label: 'NCAL - Provider Portal', url: KAISER_NORTH_PROVIDER_PORTAL_URL }
    : { label: 'SCal Provider Portal', url: KAISER_SOUTH_PROVIDER_PORTAL_URL };
}

export function normalizeCountyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');
}

function isUnknownCountyToken(normalized: string): boolean {
  return !normalized || UNKNOWN_COUNTY_TOKENS.has(normalized);
}

/**
 * Resolve Kaiser North/South from member county.
 * Fresno (and other Central Valley north counties) are Kaiser North.
 * Unknown / blank counties return '' — they must not default to South.
 */
export function getKaiserRegionFromCounty(county: unknown): KaiserRegion | '' {
  const normalized = normalizeCountyName(county);
  if (isUnknownCountyToken(normalized)) return '';
  return KAISER_NORTH_COUNTIES.has(normalized) ? 'Kaiser North' : 'Kaiser South';
}

/** Kaiser MRNs that begin with 1 are typically Northern California. */
export function getKaiserRegionFromMrn(mrn: unknown): KaiserRegion | '' {
  const digits = String(mrn || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('1')) return 'Kaiser North';
  if (digits.startsWith('0') || digits.startsWith('2') || digits.startsWith('3')) {
    return 'Kaiser South';
  }
  return '';
}

/**
 * Caspio push gate: Kaiser member MRNs must start with 0 or 1.
 * Digits-only check so formatting (spaces/dashes) does not bypass validation.
 */
/** MRNs are stored and pushed without hyphens or spaces (e.g. "00-0026942029" → "000026942029"). */
export function stripMrnSeparators(mrn: unknown): string {
  return String(mrn ?? '').replace(/[\s\-\u2010-\u2015]+/g, '');
}

export function isValidKaiserMrnForCaspioPush(mrn: unknown): boolean {
  const digits = String(mrn ?? '').replace(/\D/g, '');
  if (!digits) return false;
  return digits.startsWith('0') || digits.startsWith('1');
}

export const KAISER_MRN_CASPIO_PUSH_HELP =
  'Kaiser MRN must start with 0 or 1 before pushing to Caspio.';

export function getKaiserRegionFromCity(city: unknown): KaiserRegion | '' {
  const raw = String(city || '').trim();
  if (!raw) return '';
  // Direct Fresno / Clovis-area city names even if city map misses them.
  const cityNorm = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (
    cityNorm === 'fresno' ||
    cityNorm === 'clovis' ||
    cityNorm === 'sanger' ||
    cityNorm === 'selma' ||
    cityNorm === 'reedley' ||
    cityNorm === 'kerman' ||
    cityNorm === 'coalinga' ||
    cityNorm === 'hanford' ||
    cityNorm === 'lemoore'
  ) {
    return 'Kaiser North';
  }
  const county = findCountyByCity(raw);
  return getKaiserRegionFromCounty(county || '');
}

/**
 * Best-effort region from a free-text mailing / current address.
 * Prefer "X County" and "City, ST ZIP" — never match short North county tokens
 * (lake, kings, glenn, etc.) inside street names, which falsely flags SoCal as North.
 */
export function getKaiserRegionFromAddress(address: unknown): KaiserRegion | '' {
  const raw = String(address || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();

  const countyMatch = lower.match(/\b([a-z][a-z.\s'-]+?)\s+county\b/);
  if (countyMatch?.[1]) {
    const fromCounty = getKaiserRegionFromCounty(countyMatch[1]);
    if (fromCounty) return fromCounty;
  }

  const cityStateZip = raw.match(/([A-Za-z][A-Za-z.\s'-]+?),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\b/);
  if (cityStateZip?.[1]) {
    const fromCity = getKaiserRegionFromCity(cityStateZip[1]);
    if (fromCity) return fromCity;
  }

  // Fallback: last comma-separated token before state/zip often is the city.
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const maybeCity = parts[parts.length - 2];
    const fromCity = getKaiserRegionFromCity(maybeCity);
    if (fromCity) return fromCity;
  }

  return '';
}

/**
 * Best-effort Kaiser region for eligibility / referrals.
 * Priority: county → city → MRN first digit (1 = North).
 */
export function resolveKaiserRegion(opts: {
  county?: unknown;
  city?: unknown;
  mrn?: unknown;
}): KaiserRegion | '' {
  const fromCounty = getKaiserRegionFromCounty(opts.county);
  if (fromCounty) return fromCounty;
  const fromCity = getKaiserRegionFromCity(opts.city);
  if (fromCity) return fromCity;
  return getKaiserRegionFromMrn(opts.mrn);
}
