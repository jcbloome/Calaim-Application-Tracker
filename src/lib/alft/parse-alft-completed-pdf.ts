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

/**
 * Prefer fields for the PDF page window, but ALWAYS include:
 * - page-1 identity fields
 * - every radio/select/checkboxGroup (checkboxes are the main failure mode)
 * - every textarea (commentary / notes)
 * ILS scanned packets often don't align 1:1 with our logical page index.
 */
export function selectQuestionsForPdfPages(opts?: {
  pdfPageStart?: number;
  pdfPageEnd?: number;
  pdfPageCount?: number;
}): QuestionMeta[] {
  const pageCount = Math.max(1, Number(opts?.pdfPageCount) || EXACT_ALFT_PAGES.length);
  const start = Math.max(1, Number(opts?.pdfPageStart) || 1);
  const end = Math.max(start, Number(opts?.pdfPageEnd) || pageCount);
  const logicalCount = EXACT_ALFT_PAGES.length;

  const logicalStart = Math.max(
    0,
    Math.min(logicalCount - 1, Math.floor(((start - 1) / pageCount) * logicalCount) - 2)
  );
  const logicalEnd = Math.max(
    logicalStart,
    Math.min(logicalCount - 1, Math.ceil((end / pageCount) * logicalCount) + 1)
  );

  const inWindow = new Set(
    questionIndex
      .filter((q) => q.pageIndex === 0 || (q.pageIndex >= logicalStart && q.pageIndex <= logicalEnd))
      .map((q) => q.id)
  );

  const selected = questionIndex.filter((q) => {
    if (inWindow.has(q.id)) return true;
    if (q.type === 'radio' || q.type === 'select' || q.type === 'checkboxGroup') return true;
    if (q.type === 'textarea') return true;
    if (q.id === 'p13_commentary_section' || q.id === 'p13_medication_table') return true;
    if (q.id.includes('notes') || q.id.includes('commentary')) return true;
    return false;
  });

  return selected.length ? selected : questionIndex;
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
  const candidates = [text, withoutParen];

  for (const candidate of candidates) {
    const direct = options.find((o) => o.value === candidate);
    if (direct) return direct.value;
    const token = normalizeToken(candidate);
    if (!token) continue;

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
      const byStarts = options.find((o) => {
        const labelTok = normalizeToken(o.label);
        return labelTok && (tryTok.startsWith(labelTok) || labelTok.startsWith(tryTok));
      });
      if (byStarts) return byStarts.value;
      const includes = options.find(
        (o) =>
          normalizeToken(o.label).includes(tryTok) ||
          tryTok.includes(normalizeToken(o.label)) ||
          tryTok.includes(normalizeToken(o.value))
      );
      if (includes) return includes.value;
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
    // Prefer first non-empty; later batches overwrite via merge.
    answers[question.id] = sanitized;
    if (!filledIds.includes(question.id)) filledIds.push(question.id);
  }

  return { answers, filledIds, ignoredKeys };
}

export function mergeAlftParsedAnswers(
  base: AlftParsedAnswerMap,
  incoming: AlftParsedAnswerMap
): AlftParsedAnswerMap {
  return { ...base, ...incoming };
}
