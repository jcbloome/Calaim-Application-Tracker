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
