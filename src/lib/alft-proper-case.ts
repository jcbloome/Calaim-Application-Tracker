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
  'p1_purpose',
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
  'p14_rn_date',
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

/** Radio / select / checkbox option codes — must stay lowercase values (yes, alf, …). */
const SKIP_CODED_OPTION_FIELD_IDS = new Set([
  'p1_purpose',
  'p1_other_responder',
  'p1_ethnicity_hispanic',
  'p1_limited_english',
  'p1_race',
  'p2_current_type',
  'p2_assessment_site',
  'p2_fall_risk',
  'p2_aps_risk',
  'p2_imminent_nursing_home_risk',
  'p2_alwp_waitlist',
  'p2_previous_unsuccessful_placements',
  'p2_primary_caregiver',
  'p2_living_situation',
  'p8_diabetes_self_administer',
  'p14_admin_override_msw',
  'p14_admin_override_rn',
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
  // Never title-case radio/select/checkbox codes. Turning "yes"→"Yes" or "alf"→"ALF"
  // made required answers look blank in the editor while still passing submit validation.
  if (SKIP_CODED_OPTION_FIELD_IDS.has(id)) return false;
  if (
    /_(type|site|situation|responder|caregiver|purpose|risk|waitlist|placements|administer|diabetes|cognitive|hispanic|english|override|tier|frequency|scale|adl|iadl|phq|race|sex|marital_status)(_|$)/i.test(
      id
    )
  ) {
    return false;
  }
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

/** Display-label → option-code maps for fields that often arrive as free text from Caspio/prefill. */
const ALFT_CODED_LABEL_ALIASES: Record<string, Record<string, string>> = {
  p2_current_type: {
    private_residence: 'private_residence',
    'private residence': 'private_residence',
    alf: 'alf',
    'assisted living facility': 'alf',
    'assisted living facility (alf)': 'alf',
    assisted_living_facility: 'alf',
    nursing_facility: 'nursing_facility',
    'nursing facility': 'nursing_facility',
    snf: 'nursing_facility',
    hospital: 'hospital',
    adult_day_care: 'adult_day_care',
    'adult day care': 'adult_day_care',
    other: 'other',
  },
  p2_assessment_site: {
    home: 'home',
    nursing_facility: 'nursing_facility',
    'nursing facility': 'nursing_facility',
    hospital: 'hospital',
    alf: 'alf',
    adult_day_care: 'adult_day_care',
    'adult day care': 'adult_day_care',
    other: 'other',
  },
};

/** Sex display: M/F single letters uppercase; Male/Female title case. */
export function formatAlftSexValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'm' || lower === 'male') return lower === 'm' ? 'M' : 'Male';
  if (lower === 'f' || lower === 'female') return lower === 'f' ? 'F' : 'Female';
  if (lower === 'x' || lower === 'u' || lower === 'o') return raw.toUpperCase();
  if (/^[mf]$/i.test(raw)) return raw.toUpperCase();
  return toAlftProperCase(raw);
}

/** Keep option codes lowercase so radios/selects stay selected after save/submit. */
export function canonicalizeAlftCodedAnswer(fieldId: string, value: unknown): string {
  const id = String(fieldId || '').trim();
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (id === 'p1_sex') return formatAlftSexValue(raw);
  const isCodedField =
    SKIP_CODED_OPTION_FIELD_IDS.has(id) ||
    /_(type|site|situation|responder|caregiver|purpose|risk|waitlist|placements|administer|diabetes|cognitive|hispanic|english|override|tier|frequency|scale|adl|iadl|phq|race|marital_status)(_|$)/i.test(
      id
    );
  if (!isCodedField) return raw;
  if (/^(yes|no)$/i.test(raw)) return raw.toLowerCase();
  const aliasMap = ALFT_CODED_LABEL_ALIASES[id];
  if (aliasMap) {
    const key = raw.toLowerCase().replace(/\s+/g, ' ').trim();
    const snakeKey = key.replace(/\s+/g, '_');
    if (aliasMap[key]) return aliasMap[key];
    if (aliasMap[snakeKey]) return aliasMap[snakeKey];
  }
  // snake_case / single-token option codes (private_residence, alf, home, …)
  if (/^[a-z0-9]+(?:_[a-z0-9]+)*$/i.test(raw) && !/\s/.test(raw)) {
    return raw.toLowerCase();
  }
  return raw;
}

/** Compare stored answer to a radio/select option code (tolerates labels / casing). */
export function alftOptionValueMatches(
  fieldId: string,
  stored: unknown,
  optionValue: string
): boolean {
  const canonical = canonicalizeAlftCodedAnswer(fieldId, stored);
  const normalizedLeft = String(canonical || stored || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const normalizedRight = String(optionValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

export function normalizeAlftFieldCapitalization(fieldId: string, value: unknown): string {
  const raw = String(value ?? '');
  if (fieldId === 'p1_sex') return formatAlftSexValue(raw);
  if (!shouldProperCaseAlftField(fieldId)) {
    return canonicalizeAlftCodedAnswer(fieldId, raw) || raw;
  }
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
    } else if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        typeof item === 'string' ? canonicalizeAlftCodedAnswer(key, item) || item : item
      );
    }
  }
  return next as T;
}

/** Repair already-saved Title-Case option values so the form shows SW selections. */
export function canonicalizeAlftPacketAnswers<T extends Record<string, unknown>>(
  answers: T | null | undefined
): T {
  if (!answers || typeof answers !== 'object') return (answers || {}) as T;
  const next: Record<string, unknown> = { ...answers };
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === 'string') {
      next[key] = canonicalizeAlftCodedAnswer(key, value) || value;
    } else if (Array.isArray(value)) {
      next[key] = value.map((item) =>
        typeof item === 'string' ? canonicalizeAlftCodedAnswer(key, item) || item : item
      );
    }
  }
  return next as T;
}
