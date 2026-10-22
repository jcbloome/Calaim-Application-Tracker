import {
  EXACT_ALFT_PAGES,
  type ExactAlftQuestion,
} from '@/lib/alft/exact-alft-pages-data';

export type AlftParsedAnswerMap = Record<string, string | string[]>;

type QuestionMeta = {
  id: string;
  type: ExactAlftQuestion['type'];
  label: string;
  pageIndex: number;
  options?: Array<{ value: string; label: string }>;
};

const questionIndex: QuestionMeta[] = EXACT_ALFT_PAGES.flatMap((page, pageIndex) =>
  page.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    pageIndex,
    options: q.options?.map((o) => ({ value: o.value, label: o.label })),
  }))
);

const questionById = new Map(questionIndex.map((q) => [q.id, q]));

const normalizeToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactId = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function listAlftParseQuestions(): QuestionMeta[] {
  return questionIndex;
}

/** Compact schema text for Gemini prompts (id + type + allowed values). */
export function buildAlftParseSchemaPrompt(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
}): string {
  const questions = selectQuestionsForPdfPages(opts);
  return questions
    .map((q) => {
      const optionPart = q.options?.length
        ? ` | values: ${q.options.map((o) => o.value).join(', ')}`
        : '';
      return `- ${q.id} (${q.type}): ${q.label}${optionPart}`;
    })
    .join('\n');
}

function logicalPageWindow(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
  pad?: number;
}): { logicalStart: number; logicalEnd: number } {
  const pageCount = Math.max(1, Number(opts?.pdfPageCount) || EXACT_ALFT_PAGES.length);
  const start = Math.max(1, Number(opts?.pdfPageStart) || 1);
  const end = Math.max(start, Number(opts?.pdfPageEnd) || pageCount);
  const logicalCount = EXACT_ALFT_PAGES.length;
  const pad = Math.max(0, Number(opts?.pad) || 0);

  const logicalStart = Math.max(
    0,
    Math.min(logicalCount - 1, Math.floor(((start - 1) / pageCount) * logicalCount) - pad)
  );
  const logicalEnd = Math.max(
    logicalStart,
    Math.min(logicalCount - 1, Math.ceil((end / pageCount) * logicalCount) + pad)
  );
  return { logicalStart, logicalEnd };
}

/**
 * Prefer fields for the PDF page window, plus:
 * - page-1 identity fields
 * - textareas / commentary / med table (merge prefers longer text)
 *
 * Do NOT include every radio/select/checkboxGroup on every batch — later batches that
 * never saw ADL/IADL pages were hallucinating those answers and overwriting correct ones.
 * Core window uses pad=1; merge treats core-window coded fields as authoritative.
 */
export function selectQuestionsForPdfPages(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
}): QuestionMeta[] {
  const { logicalStart, logicalEnd } = logicalPageWindow({ ...opts, pad: 1 });

  const inWindow = new Set(
    questionIndex
      .filter((q) => q.pageIndex === 0 || (q.pageIndex >= logicalStart && q.pageIndex <= logicalEnd))
      .map((q) => q.id)
  );

  const selected = questionIndex.filter((q) => {
    if (inWindow.has(q.id)) return true;
    if (q.type === 'textarea') return true;
    if (q.id === 'p13_commentary_section' || q.id === 'p13_medication_table') return true;
    if (q.id.includes('notes') || q.id.includes('commentary')) return true;
    return false;
  });

  return selected.length ? selected : questionIndex;
}

/** Q26/Q27 (+ DME) usually sit in the early-middle of a 14-page ALFT packet. */
function pdfBatchOverlapsAdlIadlBand(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
}): boolean {
  const pageCount = Math.max(1, Number(opts?.pdfPageCount) || EXACT_ALFT_PAGES.length);
  const start = Math.max(1, Number(opts?.pdfPageStart) || 1);
  const end = Math.max(start, Number(opts?.pdfPageEnd) || pageCount);
  const bandStart = Math.max(1, Math.round(pageCount * 0.2));
  const bandEnd = Math.max(bandStart, Math.round(pageCount * 0.45));
  return end >= bandStart && start <= bandEnd;
}

/**
 * Coded fields (radio/select/checkboxGroup) whose logical page falls in this PDF batch's
 * core window (pad=0). Schema may still ask pad=1 neighbors, but only core-window answers
 * may overwrite — so late batches cannot clobber ADL/IADL filled from the real pages.
 */
export function listAlftAuthoritativeFieldIdsForPdfPages(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
}): string[] {
  const { logicalStart, logicalEnd } = logicalPageWindow({ ...opts, pad: 0 });
  const allowAdlIadl = pdfBatchOverlapsAdlIadlBand(opts);
  return questionIndex
    .filter((q) => {
      if (!(q.type === 'radio' || q.type === 'select' || q.type === 'checkboxGroup')) return false;
      if (q.pageIndex < logicalStart || q.pageIndex > logicalEnd) return false;
      if (!allowAdlIadl && /_(adl|iadl|dme)(_|$)/i.test(q.id)) return false;
      return true;
    })
    .map((q) => q.id);
}

function matchYesNo(raw: unknown): string {
  const token = normalizeToken(raw);
  if (!token) return '';
  if (['yes', 'y', 'true', '1', 'checked', 'x', 'on'].includes(token)) return 'yes';
  if (['no', 'n', 'false', '0', 'unchecked', 'off'].includes(token)) return 'no';
  if (token.startsWith('yes ')) return 'yes';
  if (token.startsWith('no ')) return 'no';
  return '';
}

/** ADL/IADL 6-point scale aliases from the paper form wording / % assistance text. */
function matchAdlScaleAlias(
  token: string,
  options: Array<{ value: string; label: string }>
): string {
  const byValue = new Map(options.map((o) => [o.value, o.value]));
  if (!byValue.has('total') || !byValue.has('set_up')) return '';

  // Reject bare "assistance" / "needs assistance" — too ambiguous across moderate/substantial/total.
  if (token === 'assistance' || token === 'needs assistance' || token === 'assist') return '';

  // Percent bands from paper form parentheticals (normalizeToken strips "%").
  // Check substantial (50→100) before total (100) so "50% to less than 100%" does not become total.
  if (
    (/\bsubstantial\b/.test(token) && /\bassist/.test(token)) ||
    /50\s*%\s*to/.test(token) ||
    (/\b50\b/.test(token) && /\bto\b/.test(token) && /\b100\b/.test(token)) ||
    token === 'substantial'
  ) {
    return byValue.get('substantial') || '';
  }
  if (
    (/\bmoderate\b/.test(token) && /\bassist/.test(token)) ||
    /less\s*than\s*50/.test(token) ||
    (/\bless\s+than\s+50\b/.test(token) && /\bassist/.test(token)) ||
    token === 'moderate'
  ) {
    return byValue.get('moderate') || '';
  }
  if (
    (/\btotal\b/.test(token) && /\bassist/.test(token)) ||
    /\b100\s*%/.test(token) ||
    (/\b100\b/.test(token) && /\bassist/.test(token) && !/\b50\b/.test(token)) ||
    token === 'total'
  ) {
    return byValue.get('total') || '';
  }
  if (/\b(set[\s_-]*up|setup)\b/.test(token)) return byValue.get('set_up') || '';
  if (/\bsupervis/.test(token) || /\bcue(ing|s)?\b/.test(token)) {
    return byValue.get('supervision') || '';
  }
  if (/\bindependent\b/.test(token)) return byValue.get('independent') || '';
  return '';
}

function bestFuzzyOptionMatch(
  tryTok: string,
  options: Array<{ value: string; label: string }>
): string {
  let bestValue = '';
  let bestScore = 0;
  let tie = false;

  for (const o of options) {
    const labelTok = normalizeToken(o.label);
    const valueTok = normalizeToken(o.value);
    let score = 0;
    if (labelTok && labelTok === tryTok) score = 1000 + labelTok.length;
    else if (valueTok && valueTok === tryTok) score = 950 + valueTok.length;
    else if (labelTok && (tryTok.startsWith(labelTok) || labelTok.startsWith(tryTok))) {
      score = 500 + Math.min(labelTok.length, tryTok.length);
    } else if (labelTok && tryTok.includes(labelTok) && labelTok.length >= 5) {
      score = 200 + labelTok.length;
    } else if (labelTok && labelTok.includes(tryTok) && tryTok.length >= 5) {
      score = 120 + tryTok.length;
    } else if (valueTok && tryTok.includes(valueTok) && valueTok.length >= 5) {
      score = 100 + valueTok.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestValue = o.value;
      tie = false;
    } else if (score > 0 && score === bestScore && o.value !== bestValue) {
      tie = true;
    }
  }

  // Ambiguous substring hits (e.g. "assistance" → moderate/substantial/total) → omit.
  if (tie && bestScore < 500) return '';
  return bestScore >= 100 ? bestValue : '';
}

function matchOptionValue(raw: unknown, options: Array<{ value: string; label: string }>): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';

  // Boolean / Yes-No first when options are yes/no.
  const hasYesNo = options.some((o) => o.value === 'yes' || o.value === 'no');
  if (hasYesNo) {
    const yn = matchYesNo(text);
    if (yn && options.some((o) => o.value === yn)) return yn;
  }

  // Strip parentheticals like "Total Assistance (Needs assistance with 100%...)"
  const withoutParen = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parenOnly = (text.match(/\(([^)]*)\)/g) || [])
    .map((part) => part.replace(/[()]/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  const candidates = [text, withoutParen, parenOnly].filter(Boolean);

  for (const candidate of candidates) {
    const direct = options.find((o) => o.value === candidate);
    if (direct) return direct.value;
    const token = normalizeToken(candidate);
    if (!token) continue;

    const adlAlias = matchAdlScaleAlias(token, options);
    if (adlAlias) return adlAlias;

    // "ten pounds or more" ↔ "10 pounds or more"
    const tokenNumWords = token
      .replace(/\bten\b/g, '10')
      .replace(/\bfive\b/g, '5')
      .replace(/\bone\b/g, '1');

    for (const tryTok of [token, tokenNumWords]) {
      const byValue = options.find((o) => normalizeToken(o.value) === tryTok);
      if (byValue) return byValue.value;
      const byLabel = options.find((o) => normalizeToken(o.label) === tryTok);
      if (byLabel) return byLabel.value;
      const fuzzy = bestFuzzyOptionMatch(tryTok, options);
      if (fuzzy) return fuzzy;
    }
  }

  // Frequency short forms: "not at all" → not_at_all
  const compact = compactId(text);
  for (const o of options) {
    if (compactId(o.value) === compact || compactId(o.label) === compact) return o.value;
  }
  return '';
}

function sanitizeOne(question: QuestionMeta, raw: unknown): string | string[] | undefined {
  if (raw == null) return undefined;

  // Models sometimes wrap a single choice in an array.
  const scalarFromArray = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;

  if (question.type === 'checkboxGroup') {
    const list = Array.isArray(raw)
      ? raw
      : String(raw)
          .split(/[,;|]/)
          .map((part) => part.trim())
          .filter(Boolean);
    const options = question.options || [];
    const matched = Array.from(
      new Set(list.map((item) => matchOptionValue(item, options)).filter(Boolean))
    );
    return matched.length ? matched : undefined;
  }

  if (question.type === 'radio' || question.type === 'select') {
    const matched = matchOptionValue(scalarFromArray, question.options || []);
    // Only keep schema values — free-text like "Yes" will not light up radio/select UI.
    return matched || undefined;
  }

  const text = String(Array.isArray(raw) ? raw.join('\n') : raw).trim();
  return text || undefined;
}

/** Models often wrap the map under answers/fields/data. */
export function unwrapAlftExtractedObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  let current = raw as Record<string, unknown>;
  for (let depth = 0; depth < 4; depth += 1) {
    const nestedKeys = ['answers', 'fields', 'exactPacketAnswers', 'data', 'result', 'extracted'];
    let next: Record<string, unknown> | null = null;
    for (const key of nestedKeys) {
      const candidate = current[key];
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const entries = Object.keys(candidate as object);
        if (entries.length > 0) {
          next = candidate as Record<string, unknown>;
          break;
        }
      }
    }
    if (!next) break;
    current = next;
  }
  return current;
}

function resolveQuestion(key: string): QuestionMeta | undefined {
  const direct = questionById.get(key);
  if (direct) return direct;

  const compactKey = compactId(key);
  if (compactKey) {
    for (const q of questionIndex) {
      if (compactId(q.id) === compactKey) return q;
    }
  }

  // Common model aliases for commentary / notes.
  const aliasMap: Record<string, string> = {
    commentary: 'p13_commentary_section',
    rncommentary: 'p13_commentary_section',
    mswcommentary: 'p13_commentary_section',
    additionaldetails: 'p13_commentary_section',
    additionaldetailsrncommentary: 'p13_commentary_section',
    notesandsummary: 'p10_notes_summary',
    sectioninotes: 'p10_notes_summary',
  };
  const aliasId = aliasMap[compactKey];
  if (aliasId && questionById.has(aliasId)) return questionById.get(aliasId);

  const tokenKey = normalizeToken(key);
  if (tokenKey.length < 4) return undefined;

  // Prefer commentary when the key mentions commentary / additional details.
  if (
    (tokenKey.includes('commentary') || tokenKey.includes('additional details')) &&
    questionById.has('p13_commentary_section')
  ) {
    return questionById.get('p13_commentary_section');
  }

  for (const q of questionIndex) {
    if (normalizeToken(q.label) === tokenKey) return q;
  }
  for (const q of questionIndex) {
    const labelTok = normalizeToken(q.label);
    if (labelTok.includes(tokenKey) || tokenKey.includes(labelTok)) return q;
  }
  return undefined;
}

/**
 * Q28 health-condition cleanup after vision extract.
 * Models often infer Alzheimer's from Memory Impairment, or bleed an X onto Hospice from a
 * nearby Incontinence "Both" mark. Only keep conditions with strong marks.
 */
export function refineAlftHealthConditionAnswers(answers: AlftParsedAnswerMap): AlftParsedAnswerMap {
  const next: AlftParsedAnswerMap = { ...answers };
  const raw = next.p7_conditions;
  if (!Array.isArray(raw) || raw.length === 0) return next;

  const conditions = new Set(raw.map((item) => String(item || '').trim()).filter(Boolean));
  const dementiaSeverity = String(next.p7_dementia_severity || '')
    .trim()
    .toLowerCase();
  const judgementSeverity = String(next.p7_judgement_severity || '')
    .trim()
    .toLowerCase();
  const hasSeverity = (value: string) =>
    Boolean(value) && ['intact', 'mild', 'moderate', 'severe'].includes(value);

  const hadAlzheimers = conditions.has('alzheimers_dementia');

  // Memory impairment ≠ Alzheimer's. Drop Alzheimer's unless the Alzheimer's severity row
  // (Intact/Mild/Moderate/Severe) was also extracted — that is how the paper form marks it.
  if (conditions.has('alzheimers_dementia') && !hasSeverity(dementiaSeverity)) {
    conditions.delete('alzheimers_dementia');
  }

  // Hospice must be its own checked line. Common vision bleed: Alzheimer's + Memory + Hospice +
  // Incontinence Both when only Memory + Incontinence (and Judgement severity) were marked.
  // Drop hospice only when that over-mark pattern is present and palliative/pain are absent
  // (real hospice cases usually also show palliative or stand alone without the Alzheimer's FP).
  const droppedAlzheimersAsFalsePositive = hadAlzheimers && !conditions.has('alzheimers_dementia');
  if (
    conditions.has('hospice') &&
    droppedAlzheimersAsFalsePositive &&
    conditions.has('memory_impairment') &&
    (conditions.has('incontinence_both') ||
      conditions.has('incontinence_urine') ||
      conditions.has('incontinence_stool')) &&
    !conditions.has('palliative') &&
    !conditions.has('pain_management')
  ) {
    conditions.delete('hospice');
  }

  // Severity rows imply their parent condition on the paper form.
  if (hasSeverity(dementiaSeverity)) conditions.add('alzheimers_dementia');
  if (hasSeverity(judgementSeverity)) conditions.add('judgement_impairment');

  // Mutually exclusive incontinence options — prefer "both" when present.
  if (conditions.has('incontinence_both')) {
    conditions.delete('incontinence_urine');
    conditions.delete('incontinence_stool');
  }

  next.p7_conditions = Array.from(conditions);
  return next;
}

/**
 * Q29/Q30 cleanup: vision often copies printed sub-labels (e.g. "Nasal Cannula") into
 * detail fields even when the parent Oxygen checkbox is empty. Drop dependent details
 * unless the parent service/mark is present — never invent the parent from the detail.
 */
export function refineAlftTherapiesServicesAnswers(answers: AlftParsedAnswerMap): AlftParsedAnswerMap {
  const next: AlftParsedAnswerMap = { ...answers };
  const servicesRaw = next.p8_services;
  const services = new Set(
    (Array.isArray(servicesRaw) ? servicesRaw : String(servicesRaw || '').split(/[,;|]/))
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  );

  // Never keep oxygen details without the Oxygen service checkbox.
  // Models often copy the printed "Nasal Cannula" / "Mask" labels into p8_oxygen_type.
  if (!services.has('oxygen')) {
    delete next.p8_oxygen_type;
    delete next.p8_oxygen_liters;
  }

  if (!services.has('wound_care')) {
    delete next.p8_wound_stage;
    delete next.p8_wound_location;
  }

  const homeHealthApplicable = String(next.p8_home_health_applicable || '')
    .trim()
    .toLowerCase();
  const hasHomeHealthOrSn =
    services.has('home_health') ||
    services.has('skilled_nursing') ||
    homeHealthApplicable === 'yes';
  if (!hasHomeHealthOrSn) {
    delete next.p8_visit_frequency;
    delete next.p8_visit_duties;
  }

  // Catheter frequency only when a real catheter type is selected.
  const catheterType = String(next.p8_catheter_type || '')
    .trim()
    .toLowerCase();
  if (!catheterType || catheterType === 'na_none') {
    delete next.p8_catheter_frequency;
  }

  if (services.size > 0) {
    next.p8_services = Array.from(services);
  } else {
    delete next.p8_services;
  }

  return next;
}

/** Keep known ALFT ids and coerce option values; accept label keys / nested payloads. */
export function sanitizeAlftExtractedAnswers(raw: unknown): {
  answers: AlftParsedAnswerMap;
  filledIds: string[];
  ignoredKeys: string[];
} {
  const source = unwrapAlftExtractedObject(raw);
  const answers: AlftParsedAnswerMap = {};
  const filledIds: string[] = [];
  const ignoredKeys: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    const question = resolveQuestion(key);
    if (!question) {
      ignoredKeys.push(key);
      continue;
    }
    const sanitized = sanitizeOne(question, value);
    if (sanitized === undefined) continue;
    answers[question.id] = sanitized;
    if (!filledIds.includes(question.id)) filledIds.push(question.id);
  }

  let refined = refineAlftHealthConditionAnswers(answers);
  refined = refineAlftTherapiesServicesAnswers(refined);

  if (Array.isArray(refined.p7_conditions) && refined.p7_conditions.length > 0) {
    if (!filledIds.includes('p7_conditions')) filledIds.push('p7_conditions');
  } else if (Object.prototype.hasOwnProperty.call(refined, 'p7_conditions')) {
    delete refined.p7_conditions;
  }

  // Drop ids cleared by therapies/services refine so filledIds stay accurate.
  for (const id of [
    'p8_oxygen_type',
    'p8_oxygen_liters',
    'p8_wound_stage',
    'p8_wound_location',
    'p8_visit_frequency',
    'p8_visit_duties',
    'p8_catheter_frequency',
    'p8_services',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(refined, id) || !isFilledAlftAnswer(refined[id])) {
      const idx = filledIds.indexOf(id);
      if (idx >= 0) filledIds.splice(idx, 1);
    } else if (!filledIds.includes(id) && isFilledAlftAnswer(refined[id])) {
      filledIds.push(id);
    }
  }

  return { answers: refined, filledIds, ignoredKeys };
}

function isFilledAlftAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim());
  return Boolean(String(value ?? '').trim());
}

/**
 * Merge batch extracts.
 * - Empty → take incoming
 * - Checkbox groups → union
 * - Authoritative coded fields (this batch's page window) → overwrite (real ADL page beats hallucination)
 * - Long text → keep longer
 * - Otherwise first non-empty wins (late batches cannot clobber ADL with guesses)
 */
export function mergeAlftParsedAnswers(
  base: AlftParsedAnswerMap,
  incoming: AlftParsedAnswerMap,
  opts?: { authoritativeIds?: Iterable<string> }
): AlftParsedAnswerMap {
  const authoritative = opts?.authoritativeIds ? new Set(opts.authoritativeIds) : null;
  const next: AlftParsedAnswerMap = { ...base };
  for (const [key, incomingValue] of Object.entries(incoming || {})) {
    if (!isFilledAlftAnswer(incomingValue)) continue;
    const existing = next[key];
    if (!isFilledAlftAnswer(existing)) {
      next[key] = incomingValue;
      continue;
    }
    if (Array.isArray(existing) || Array.isArray(incomingValue)) {
      const left = Array.isArray(existing) ? existing : [String(existing)];
      const right = Array.isArray(incomingValue) ? incomingValue : [String(incomingValue)];
      const merged = Array.from(
        new Set([...left, ...right].map((item) => String(item || '').trim()).filter(Boolean))
      );
      // Authoritative checkbox batch replaces (avoids keeping hallucinated extras), else union.
      next[key] = authoritative?.has(key) ? (Array.isArray(incomingValue) ? [...new Set(right)] : merged) : merged;
      continue;
    }
    if (authoritative?.has(key)) {
      next[key] = incomingValue;
      continue;
    }
    const leftText = String(existing);
    const rightText = String(incomingValue);
    const looksLikeLongText =
      key.includes('notes') ||
      key.includes('commentary') ||
      key.includes('medication') ||
      key.includes('text') ||
      leftText.length > 80 ||
      rightText.length > 80;
    if (looksLikeLongText && rightText.trim().length > leftText.trim().length) {
      next[key] = incomingValue;
    }
  }
  return next;
}
