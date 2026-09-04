/**
 * Proper / title-case helpers for ALFT form text values.
 * e.g. "NORTH HOLLYWOOD" → "North Hollywood", "english" → "English"
 */

const PRESERVE_UPPER = new Set([
  'n/a',
  'na',
  'ssn',
  'ssi',
  'ssdi',
  'adl',
  'iadl',
  'aps',
  'alf',
  'alwp',
  'rcfe',
  'snf',
  'poa',
  'dnr',
  'mrn',
  'ca',
  'usa',
  'us',
  'ii',
  'iii',
  'iv',
]);

/** Fields that must stay codes / identifiers / dates / money — never title-case. */
const SKIP_PROPER_CASE_FIELD_IDS = new Set([
  'p1_assessment_date',
  'p1_referral_date',
  'p1_plan_id',
  'p1_mrn',
  'p1_phone',
  'p1_dob',
  'p2_current_state',
  'p2_current_zip',
  'p2_home_state',
  'p2_home_zip',
  'p2_mail_state',
  'p2_mail_zip',
  'p2_income_ssi',
  'p2_income_retirement',
  'p2_income_ssdi',
  'p2_income_other',
  'p14_date',
  'p14_license_number',
  'p14_sw_signed_at',
  'p14_rn_signed_at',
  'p14_electronic_notice',
]);

/** Long free-text / clinical notes — do not auto-rewrite while editing. */
const SKIP_PROPER_CASE_LONG_TEXT = new Set([
  'p13_commentary_section',
  'p13_medication_table',
  'p2_previous_placement_explain',
]);

const looksLikeEmailOrUrl = (value: string) =>
  /@/.test(value) || /^https?:\/\//i.test(value) || /^\d{5}(-\d{4})?$/.test(value);

const capitalizePiece = (piece: string) => {
  const trimmed = String(piece || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (PRESERVE_UPPER.has(lower)) return lower === 'n/a' ? 'N/A' : trimmed.toUpperCase();
  // Keep pure numbers / house numbers / unit codes like 12A
  if (/^\d+[a-z]?$/i.test(trimmed)) return trimmed.toUpperCase();
  // Directional abbreviations
  if (/^(n|s|e|w|ne|nw|se|sw)$/i.test(trimmed)) return trimmed.toUpperCase();
  // Street-type abbreviations often all-caps in source
  if (/^(st|ave|blvd|rd|dr|ln|ct|pl|hwy|pkwy|apt|ste|unit)$/i.test(trimmed)) {
    const map: Record<string, string> = {
      st: 'St',
      ave: 'Ave',
      blvd: 'Blvd',
      rd: 'Rd',
      dr: 'Dr',
      ln: 'Ln',
      ct: 'Ct',
      pl: 'Pl',
      hwy: 'Hwy',
      pkwy: 'Pkwy',
      apt: 'Apt',
      ste: 'Ste',
      unit: 'Unit',
    };
    return map[lower] || trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const capitalizeWord = (word: string) =>
  String(word || '')
    .split('-')
    .map((hyphenPart) =>
      hyphenPart
        .split("'")
        .map((piece) => capitalizePiece(piece))
        .join("'")
    )
    .join('-');

/** Title-case a single ALFT text value. */
export function toAlftProperCase(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (looksLikeEmailOrUrl(value)) return value;
  const lower = value.toLowerCase();
  if (lower === 'n/a' || lower === 'na' || lower === 'n.a.') return 'N/A';

  return value
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      // Handle "SEPULVEDA," with trailing punctuation
      const match = word.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
      if (!match) return capitalizeWord(word);
      const [, lead, core, trail] = match;
      if (!core) return word;
      return `${lead}${capitalizeWord(core)}${trail}`;
    })
    .join(' ');
}

export function shouldProperCaseAlftField(fieldId: string): boolean {
  const id = String(fieldId || '').trim();
  if (!id) return false;
  if (SKIP_PROPER_CASE_FIELD_IDS.has(id)) return false;
  if (SKIP_PROPER_CASE_LONG_TEXT.has(id)) return false;
  // Signature print names — yes
  if (id.startsWith('p14_') && (id.includes('print_name') || id.includes('rn_print'))) return true;
  // Prefer demographic / address / name style text fields
  if (
    id.startsWith('p1_') ||
    id.startsWith('p2_') ||
    id.includes('name') ||
    id.includes('street') ||
    id.includes('city') ||
    id.includes('facility') ||
    id.includes('language') ||
    id.includes('ethnicity') ||
    id.includes('relationship') ||
    id.includes('agency')
  ) {
    return true;
  }
  return false;
}

export function normalizeAlftFieldCapitalization(fieldId: string, value: unknown): string {
  const raw = String(value ?? '');
  if (!shouldProperCaseAlftField(fieldId)) return raw;
  // Keep intentional mid-edit empty / whitespace
  if (!raw.trim()) return raw;
  return toAlftProperCase(raw);
}

/** Normalize all string answers in an ALFT packet (arrays left alone). */
export function normalizeAlftAnswersCapitalization<T extends Record<string, unknown>>(
  answers: T | null | undefined
): T {
  if (!answers || typeof answers !== 'object') return (answers || {}) as T;
  const next: Record<string, unknown> = { ...answers };
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === 'string') {
      next[key] = normalizeAlftFieldCapitalization(key, value);
    }
  }
  return next as T;
}
