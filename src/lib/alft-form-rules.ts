/**
 * Shared ALFT form layout / conditional rules used by SW upload,
 * SwStyleAlftEditor, and admin ALFT views.
 */

import { canonicalizeAlftCodedAnswer } from '@/lib/alft-proper-case';

export type AlftMovedField = {
  questionId: string;
  targetPage: number;
  afterQuestionId: string;
  label: string;
};

/** Fields relocated across rendered pages (keeps stable answer IDs). */
export const ALFT_PAGE_MOVED_FIELDS: AlftMovedField[] = [
  {
    questionId: 'p6_notes_summary',
    targetPage: 3,
    afterQuestionId: 'p3_cognitive_problems_present',
    label: 'SECTION B. Notes and Summary:',
  },
  {
    questionId: 'p6_section_d_text',
    targetPage: 5,
    afterQuestionId: 'p5_dme_other',
    label: 'SECTION D. Notes and Summary:',
  },
  {
    questionId: 'p6_section_e_text',
    targetPage: 6,
    afterQuestionId: 'p6_iadl_transportation',
    label: 'SECTION E. Notes and Summary:',
  },
  {
    questionId: 'p6_section_f_text',
    targetPage: 8,
    afterQuestionId: 'p8_visit_duties',
    label: 'SECTION F. Notes and Summary:',
  },
  // Q33 remainder + Q34 belong on Mental Health (page 9), not Nutrition (page 10).
  // Q35 weight-change stays on Nutrition (page 10) via p10_ prefix.
  {
    questionId: 'p10_behavior_hallucinations',
    targetPage: 9,
    afterQuestionId: 'p9_behavior_suicidal_expression',
    label: 'Q33 Hallucinates',
  },
  {
    questionId: 'p10_behavior_other',
    targetPage: 9,
    afterQuestionId: 'p10_behavior_hallucinations',
    label: 'Q33 Other problem/behavior',
  },
  {
    questionId: 'p10_supervision_needed',
    targetPage: 9,
    afterQuestionId: 'p10_behavior_other',
    label: 'Q34: ASSESSOR/CM: Does client need supervision?',
  },
  {
    questionId: 'p10_notes_summary',
    targetPage: 10,
    afterQuestionId: 'p10_special_diet_reason',
    label: 'SECTION I. Notes and Summary:',
  },
];

export const ALFT_PAGE_MOVED_FIELD_IDS = new Set(ALFT_PAGE_MOVED_FIELDS.map((m) => m.questionId));

/** Q14–Q22 memory/cognitive follow-ups — always answerable (even when Q13 is No). */
export const ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS = [
  'p3_client_not_answering',
  'p3_repeat_sock',
  'p3_repeat_blue',
  'p3_repeat_bed',
  'p3_first_attempt_score',
  'p3_year_orientation',
  'p3_month_orientation',
  'p3_day_orientation',
  'p3_recall_sock',
  'p3_recall_blue',
  'p3_recall_bed',
  'p3_recall_score',
  'p3_oriented_to',
  'p3_cognitive_problems_present',
] as const;

const COGNITIVE_FOLLOWUP_SET = new Set<string>(ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS);

export function isAlftCognitiveFollowupField(fieldId: string): boolean {
  return COGNITIVE_FOLLOWUP_SET.has(String(fieldId || '').trim());
}

/** Cognitive screen (Q14–Q22) stays unlocked regardless of Q13. */
export function isAlftCognitiveScreenUnlocked(
  _answers?: Record<string, unknown> | null
): boolean {
  return true;
}

/** Kept for callers; Q14–Q22 are no longer locked by Q13. */
export function isAlftCognitiveFollowupLocked(
  _fieldId: string,
  _answers?: Record<string, unknown> | null
): boolean {
  return false;
}

/** Clear Q14–Q22 (manual/utility only — not auto-applied when Q13 is No). */
export function clearAlftCognitiveFollowupAnswers<T extends Record<string, unknown>>(answers: T): T {
  const next: Record<string, unknown> = { ...answers };
  for (const id of ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS) {
    if (id === 'p3_oriented_to') next[id] = [];
    else next[id] = '';
  }
  return next as T;
}

/** No-op gate: keep Q14–Q22 answers even when Q13 is No. */
export function applyAlftCognitiveFollowupGate<T extends Record<string, unknown>>(answers: T): T {
  return answers;
}

/** Q29 insulin self-admin — only when Q28 Health conditions includes Diabetes. */
export function isAlftDiabetesConditionSelected(
  answers: Record<string, unknown> | null | undefined
): boolean {
  const raw = answers?.p7_conditions;
  const values = Array.isArray(raw)
    ? raw.map((v) => String(v ?? '').trim().toLowerCase())
    : String(raw ?? '')
        .split(/[,|;]/)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
  return values.some((v) => v === 'diabetes' || /(^|[^a-z])diabetes([^a-z]|$)/i.test(v));
}

/** Visibility — hide Q29 self-admin unless Diabetes is checked on Q28. */
export function isAlftQuestionVisible(
  fieldId: string,
  answers?: Record<string, unknown> | null
): boolean {
  if (String(fieldId || '').trim() === 'p8_diabetes_self_administer') {
    return isAlftDiabetesConditionSelected(answers);
  }
  return true;
}

/** Always-required ALFT packet fields (SW submit + visual *). Q29 is conditional on diabetes. */
export const ALFT_ALWAYS_REQUIRED_FIELD_IDS = [
  'p1_purpose',
  'p1_other_responder',
  'p1_race',
  'p1_primary_language',
  'p1_limited_english',
  'p1_marital_status',
  'p2_current_type',
  'p2_assessment_site',
  'p2_aps_risk',
  'p2_imminent_nursing_home_risk',
  'p2_primary_caregiver',
  'p2_living_situation',
  'p2_income_ssi',
  'p3_oriented_to',
  'p3_cognitive_problems_present',
] as const;

const ALFT_PURPOSE_VALUES = new Set(['initial', 'change_condition', 'review']);
const ALFT_YES_NO_VALUES = new Set(['yes', 'no']);
const ALFT_CURRENT_LOCATION_TYPE_VALUES = new Set([
  'private_residence',
  'alf',
  'nursing_facility',
  'hospital',
  'adult_day_care',
  'other',
]);
const ALFT_ASSESSMENT_SITE_VALUES = new Set([
  'home',
  'nursing_facility',
  'hospital',
  'alf',
  'adult_day_care',
  'other',
]);
const ALFT_APS_RISK_VALUES = new Set(['high', 'intermediate', 'low', 'not_applicable']);
const ALFT_IMMINENT_NURSING_HOME_RISK_VALUES = new Set(['yes', 'no', 'not_applicable']);
const ALFT_LIVING_SITUATION_VALUES = new Set(['with_primary_caregiver', 'with_other', 'alone']);
const ALFT_ORIENTED_TO_VALUES = new Set(['time', 'place', 'person', 'event']);
const ALFT_COGNITIVE_PROBLEMS_VALUES = new Set(['yes', 'no', 'dont_know']);
const ALFT_MARITAL_STATUS_VALUES = new Set([
  'married',
  'single',
  'divorced',
  'partnered',
  'separated',
  'widowed',
]);
const ALFT_RACE_VALUES = new Set([
  'american_indian_alaska_native',
  'asian',
  'black_african_american',
  'native_hawaiian_pacific_islander',
  'white',
  'other',
]);

const isFilledYesNo = (value: unknown) => {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  return ALFT_YES_NO_VALUES.has(s);
};

const normalizeOptionValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const hasOrientedToSelection = (value: unknown) => {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
  return values.some((entry) => ALFT_ORIENTED_TO_VALUES.has(normalizeOptionValue(entry)));
};

const hasRaceSelection = (value: unknown) => {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
  return values.some((entry) => ALFT_RACE_VALUES.has(normalizeOptionValue(entry)));
};

const raceIncludesOther = (value: unknown) => {
  const values = Array.isArray(value)
    ? value
    : String(value ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
  return values.some((entry) => normalizeOptionValue(entry) === 'other');
};

const isFilledMoneyOrAmount = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === 'n/a' || lower === 'na' || lower === 'none') return false;
  return true;
};

/**
 * Missing required fields for MSW ISP/ALFT submit.
 * Core required set includes assessment site, APS risk, imminent nursing-home risk,
 * primary caregiver, living situation, race, primary language, limited English, marital status,
 * Q12 Social Security (SSI), Q21 oriented-to, Q22 cognitive problems present,
 * someone besides client answering, current location type,
 * and Q29 diabetes self-admin only when Diabetes is checked on Q28.
 */
export function getMissingAlftRequiredFields(
  answers: Record<string, unknown> | null | undefined
): Array<{ id: string; label: string }> {
  const missing: Array<{ id: string; label: string }> = [];
  const labels: Record<string, string> = {
    p1_purpose: 'Purpose of this assessment',
    p1_other_responder: 'Is someone besides client answering? (Yes or No)',
    p1_other_responder_name: 'If someone besides client is answering — name',
    p1_other_responder_relationship: 'If someone besides client is answering — relationship',
    p1_race: 'Race (select at least one)',
    p1_race_other: 'Race — Other detail',
    p1_primary_language: 'Primary Language',
    p1_limited_english:
      'Q1: Does client have limited ability to reading, writing, speaking, or understanding English? (Yes or No)',
    p1_marital_status: 'Q2: Marital Status',
    p2_current_type: 'Q3 Current Physical Location Type',
    p2_current_type_other: 'Q3 Current Physical Location Type — Other detail',
    p2_assessment_site: 'Q6 Assessor/CM assessment site',
    p2_assessment_site_other: 'Q6 Assessment site — Other detail',
    p2_aps_risk: 'Q6 APS Risk Level',
    p2_imminent_nursing_home_risk: 'Q7 Imminent risk of nursing home placement',
    p2_primary_caregiver: 'Q10 Is there a primary caregiver? (Yes or No)',
    p2_living_situation: 'Q11 Living situation',
    p2_living_situation_other: 'Q11 Living situation — With other (specify)',
    p2_income_ssi: 'Q12 Social Security (SSI) $/Mo',
    p3_oriented_to: 'Q21 Member is alert and oriented to (select at least one)',
    p3_cognitive_problems_present: 'Q22 In your opinion, are cognitive problems present?',
    p8_diabetes_self_administer: 'Q29 Can member self-administer diabetes medication / insulin? (Yes or No)',
  };

  const purpose = normalizeOptionValue(answers?.p1_purpose);
  if (!ALFT_PURPOSE_VALUES.has(purpose)) {
    missing.push({ id: 'p1_purpose', label: labels.p1_purpose });
  }

  const otherResponder = normalizeOptionValue(answers?.p1_other_responder);
  if (!isFilledYesNo(otherResponder)) {
    missing.push({ id: 'p1_other_responder', label: labels.p1_other_responder });
  } else if (otherResponder === 'yes') {
    if (!String(answers?.p1_other_responder_name ?? '').trim()) {
      missing.push({ id: 'p1_other_responder_name', label: labels.p1_other_responder_name });
    }
    if (!String(answers?.p1_other_responder_relationship ?? '').trim()) {
      missing.push({
        id: 'p1_other_responder_relationship',
        label: labels.p1_other_responder_relationship,
      });
    }
  }

  if (!hasRaceSelection(answers?.p1_race)) {
    missing.push({ id: 'p1_race', label: labels.p1_race });
  } else if (raceIncludesOther(answers?.p1_race) && !String(answers?.p1_race_other ?? '').trim()) {
    missing.push({ id: 'p1_race_other', label: labels.p1_race_other });
  }

  if (!String(answers?.p1_primary_language ?? '').trim()) {
    missing.push({ id: 'p1_primary_language', label: labels.p1_primary_language });
  }

  if (!isFilledYesNo(answers?.p1_limited_english)) {
    missing.push({ id: 'p1_limited_english', label: labels.p1_limited_english });
  }

  const maritalStatus = normalizeOptionValue(answers?.p1_marital_status);
  if (!ALFT_MARITAL_STATUS_VALUES.has(maritalStatus)) {
    missing.push({ id: 'p1_marital_status', label: labels.p1_marital_status });
  }

  const currentTypeRaw = answers?.p2_current_type;
  const currentType =
    canonicalizeAlftCodedAnswer('p2_current_type', currentTypeRaw) ||
    normalizeOptionValue(currentTypeRaw);
  if (!ALFT_CURRENT_LOCATION_TYPE_VALUES.has(currentType)) {
    missing.push({ id: 'p2_current_type', label: labels.p2_current_type });
  } else if (currentType === 'other' && !String(answers?.p2_current_type_other ?? '').trim()) {
    missing.push({ id: 'p2_current_type_other', label: labels.p2_current_type_other });
  }

  const assessmentSite = normalizeOptionValue(answers?.p2_assessment_site);
  if (!ALFT_ASSESSMENT_SITE_VALUES.has(assessmentSite)) {
    missing.push({ id: 'p2_assessment_site', label: labels.p2_assessment_site });
  } else if (assessmentSite === 'other' && !String(answers?.p2_assessment_site_other ?? '').trim()) {
    missing.push({ id: 'p2_assessment_site_other', label: labels.p2_assessment_site_other });
  }

  const apsRisk = normalizeOptionValue(answers?.p2_aps_risk);
  if (!ALFT_APS_RISK_VALUES.has(apsRisk)) {
    missing.push({ id: 'p2_aps_risk', label: labels.p2_aps_risk });
  }

  const imminentNursingHomeRisk = normalizeOptionValue(answers?.p2_imminent_nursing_home_risk);
  if (!ALFT_IMMINENT_NURSING_HOME_RISK_VALUES.has(imminentNursingHomeRisk)) {
    missing.push({
      id: 'p2_imminent_nursing_home_risk',
      label: labels.p2_imminent_nursing_home_risk,
    });
  }

  if (!isFilledYesNo(answers?.p2_primary_caregiver)) {
    missing.push({ id: 'p2_primary_caregiver', label: labels.p2_primary_caregiver });
  }

  const livingSituation = normalizeOptionValue(answers?.p2_living_situation);
  if (!ALFT_LIVING_SITUATION_VALUES.has(livingSituation)) {
    missing.push({ id: 'p2_living_situation', label: labels.p2_living_situation });
  } else if (livingSituation === 'with_other' && !String(answers?.p2_living_situation_other ?? '').trim()) {
    missing.push({ id: 'p2_living_situation_other', label: labels.p2_living_situation_other });
  }

  if (!isFilledMoneyOrAmount(answers?.p2_income_ssi)) {
    missing.push({ id: 'p2_income_ssi', label: labels.p2_income_ssi });
  }

  if (!hasOrientedToSelection(answers?.p3_oriented_to)) {
    missing.push({ id: 'p3_oriented_to', label: labels.p3_oriented_to });
  }

  const cognitiveProblems = normalizeOptionValue(answers?.p3_cognitive_problems_present);
  if (!ALFT_COGNITIVE_PROBLEMS_VALUES.has(cognitiveProblems)) {
    missing.push({
      id: 'p3_cognitive_problems_present',
      label: labels.p3_cognitive_problems_present,
    });
  }

  // Q29 required only when Diabetes is selected on Q28 health conditions.
  if (
    isAlftDiabetesConditionSelected(answers) &&
    !isFilledYesNo(answers?.p8_diabetes_self_administer)
  ) {
    missing.push({
      id: 'p8_diabetes_self_administer',
      label: labels.p8_diabetes_self_administer,
    });
  }

  return missing;
}

/** Clear Q29 self-admin when Diabetes is not checked on Q28. */
export function applyAlftDiabetesFollowupGate<T extends Record<string, unknown>>(answers: T): T {
  if (isAlftDiabetesConditionSelected(answers)) return answers;
  if (!String((answers as any)?.p8_diabetes_self_administer ?? '').trim()) return answers;
  return { ...answers, p8_diabetes_self_administer: '' };
}

/** Apply all answer gates (cognitive + diabetes) before save/submit. */
export function applyAlftConditionalAnswerGates<T extends Record<string, unknown>>(answers: T): T {
  return applyAlftDiabetesFollowupGate(applyAlftCognitiveFollowupGate(answers));
}

