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
  // Central Valley (down through Fresno/Kings)
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

export type KaiserRegion = 'Kaiser North' | 'Kaiser South';

export function normalizeCountyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');
}

/** Resolve Kaiser North/South from member county. Fresno is Kaiser North. */
export function getKaiserRegionFromCounty(county: unknown): KaiserRegion | '' {
  const normalized = normalizeCountyName(county);
  if (!normalized) return '';
  return KAISER_NORTH_COUNTIES.has(normalized) ? 'Kaiser North' : 'Kaiser South';
}
