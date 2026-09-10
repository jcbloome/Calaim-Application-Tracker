/**
 * Shared ALFT printable / editor page layout.
 * Pages 4–6 use explicit question lists so ADL and IADL blocks stay intact
 * (prefix-only splitting mixed them across pages and columns).
 */

export type AlftPageLayoutEntry = {
  number: number;
  sourceId: string;
  prefix: string;
  title: string;
  /** When set, only these question ids (in this order) are shown — prefix is ignored. */
  onlyQuestionIds?: string[];
};

/** Q23–Q25 only — no ADL items. */
export const ALFT_GENERAL_HEALTH_QUESTION_IDS = [
  'p4_falls_6_months',
  'p4_fall_risk',
  'p4_fall_risk_reason',
  'p4_er_hospital_60_days',
  'p4_er_count',
  'p4_hospital_count',
] as const;

/** All Q26 ADL items + DME (+ Section D notes id for post-move keep). */
export const ALFT_ADL_QUESTION_IDS = [
  'p4_adl_bathing',
  'p4_adl_dressing',
  'p4_adl_eating',
  'p4_adl_bathroom',
  'p5_adl_transferring',
  'p5_adl_walking_mobility',
  'p5_dme',
  'p5_dme_other',
  'p6_section_d_text',
] as const;

/** All Q27 IADL items (+ Section E notes id for post-move keep). */
export const ALFT_IADL_QUESTION_IDS = [
  'p5_iadl_heavy_chores',
  'p5_iadl_light_housekeeping',
  'p6_iadl_telephone',
  'p6_iadl_money',
  'p6_iadl_meals',
  'p6_iadl_shopping',
  'p6_iadl_medications',
  'p6_iadl_transportation',
  'p6_section_e_text',
] as const;

export const ALFT_PAGE_LAYOUT: AlftPageLayoutEntry[] = [
  { number: 1, sourceId: 'page1', prefix: 'p1_', title: 'Header Information + Demographic' },
  { number: 2, sourceId: 'page2', prefix: 'p2_', title: 'Addresses, Site, Risk, Living Situation, Income' },
  { number: 3, sourceId: 'page3', prefix: 'p3_', title: 'Memory and Cognitive Questions' },
  {
    number: 4,
    sourceId: 'page4_6',
    prefix: 'p4_',
    title: 'GENERAL HEALTH, SENSORY, AND COMMUNICATION',
    onlyQuestionIds: [...ALFT_GENERAL_HEALTH_QUESTION_IDS],
  },
  {
    number: 5,
    sourceId: 'page4_6',
    prefix: 'p5_',
    title: 'ACTIVITIES OF DAILY LIVING',
    onlyQuestionIds: [...ALFT_ADL_QUESTION_IDS],
  },
  {
    number: 6,
    sourceId: 'page4_6',
    prefix: 'p6_',
    title: 'INSTRUMENTAL ACTIVITIES OF DAILY LIVING',
    onlyQuestionIds: [...ALFT_IADL_QUESTION_IDS],
  },
  { number: 7, sourceId: 'page7_8', prefix: 'p7_', title: 'HEALTH CONDITIONS AND THERAPIES' },
  { number: 8, sourceId: 'page7_8', prefix: 'p8_', title: 'Therapies + Specialty Care' },
  { number: 9, sourceId: 'page9_10', prefix: 'p9_', title: 'MENTAL HEALTH' },
  { number: 10, sourceId: 'page9_10', prefix: 'p10_', title: 'NUTRITION' },
  { number: 11, sourceId: 'page11_12', prefix: 'p11_', title: 'MEDICATION AND SUBSTANCE USE' },
  { number: 12, sourceId: 'page11_12', prefix: 'p12_', title: 'Self-Reported Health + Vision/Hearing' },
  {
    number: 13,
    sourceId: 'page13_14',
    prefix: 'p13_',
    title: 'MEDICATIONS',
    onlyQuestionIds: ['p13_medication_table'],
  },
  {
    number: 14,
    sourceId: 'page13_14',
    prefix: 'p13_',
    title: 'ADDITIONAL DETAILS / MSW & RN COMMENTARY',
    onlyQuestionIds: ['p13_commentary_section'],
  },
];

/** Teal section banners inserted before a question on a rendered page.
 * Skip when the banner would duplicate the page `title` already shown above. */
export const ALFT_SECTION_DIVIDERS: Record<number, Array<{ beforeQuestionId: string; label: string }>> = {
  1: [
    { beforeQuestionId: 'p1_member_name', label: 'HEADER INFORMATION' },
    { beforeQuestionId: 'p1_first_name', label: 'DEMOGRAPHIC' },
  ],
  // Pages 5–6 / 14 titles already match the section name — no duplicate banner.
  13: [],
};

/** Pick questions for a layout page; honors onlyQuestionIds order when set. */
export function selectAlftQuestionsForLayout<T extends { id: string }>(
  sourceQuestions: T[],
  layout: Pick<AlftPageLayoutEntry, 'prefix' | 'onlyQuestionIds'>
): T[] {
  if (layout.onlyQuestionIds?.length) {
    const order = new Map(layout.onlyQuestionIds.map((id, i) => [id, i]));
    return sourceQuestions
      .filter((q) => order.has(q.id))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  return sourceQuestions.filter((q) => q.id.startsWith(layout.prefix));
}

/** After move insertion, keep onlyQuestionIds pages from picking up stray fields. */
export function keepAlftOnlyQuestionIds<T extends { id: string }>(
  questions: T[],
  layout: Pick<AlftPageLayoutEntry, 'onlyQuestionIds'>
): T[] {
  if (!layout.onlyQuestionIds?.length) return questions;
  const allowed = new Set(layout.onlyQuestionIds);
  return questions.filter((q) => allowed.has(q.id));
}
