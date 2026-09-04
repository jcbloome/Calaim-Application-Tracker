/**
 * Shared ALFT form layout / conditional rules used by SW upload,
 * SwStyleAlftEditor, and admin ALFT views.
 */

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
    afterQuestionId: 'p5_dme',
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

/** Q14–Q22 — only fillable when Q13 indicates cognitive impairment (Yes). */
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

/** Cognitive screen (Q14–Q22) unlocks only when Q13 is Yes. */
export function isAlftCognitiveScreenUnlocked(answers: Record<string, unknown> | null | undefined): boolean {
  return String(answers?.p3_memory_diagnosis ?? '')
    .trim()
    .toLowerCase() === 'yes';
}

export function isAlftCognitiveFollowupLocked(
  fieldId: string,
  answers: Record<string, unknown> | null | undefined
): boolean {
  return isAlftCognitiveFollowupField(fieldId) && !isAlftCognitiveScreenUnlocked(answers);
}

/** Clear Q14–Q22 when Q13 is not Yes (avoids stale answers on submit). */
export function clearAlftCognitiveFollowupAnswers<T extends Record<string, unknown>>(answers: T): T {
  const next: Record<string, unknown> = { ...answers };
  for (const id of ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS) {
    if (id === 'p3_oriented_to') next[id] = [];
    else next[id] = '';
  }
  return next as T;
}

/** Apply gate: if Q13 is not Yes, wipe Q14–Q22. */
export function applyAlftCognitiveFollowupGate<T extends Record<string, unknown>>(answers: T): T {
  if (isAlftCognitiveScreenUnlocked(answers)) return answers;
  return clearAlftCognitiveFollowupAnswers(answers);
}
