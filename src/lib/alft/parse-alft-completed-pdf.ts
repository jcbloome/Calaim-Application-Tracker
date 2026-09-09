import {
  EXACT_ALFT_PAGES,
  type ExactAlftQuestion,
} from '@/lib/alft/exact-alft-pages-data';

export type AlftParsedAnswerMap = Record<string, string | string[]>;

type QuestionMeta = {
  id: string;
  type: ExactAlftQuestion['type'];
  label: string;
  options?: Array<{ value: string; label: string }>;
};

const questionIndex: QuestionMeta[] = EXACT_ALFT_PAGES.flatMap((page) =>
  page.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    options: q.options?.map((o) => ({ value: o.value, label: o.label })),
  }))
);

const questionById = new Map(questionIndex.map((q) => [q.id, q]));

export function listAlftParseQuestions(): QuestionMeta[] {
  return questionIndex;
}

/** Compact schema text for Gemini prompts (id + type + allowed values). */
export function buildAlftParseSchemaPrompt(): string {
  return questionIndex
    .map((q) => {
      const optionPart = q.options?.length
        ? ` | values: ${q.options.map((o) => o.value).join(', ')}`
        : '';
      return `- ${q.id} (${q.type}): ${q.label}${optionPart}`;
    })
    .join('\n');
}

const normalizeToken = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function matchOptionValue(raw: unknown, options: Array<{ value: string; label: string }>): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const direct = options.find((o) => o.value === text);
  if (direct) return direct.value;
  const token = normalizeToken(text);
  const byValue = options.find((o) => normalizeToken(o.value) === token);
  if (byValue) return byValue.value;
  const byLabel = options.find((o) => normalizeToken(o.label) === token);
  if (byLabel) return byLabel.value;
  const includes = options.find(
    (o) => normalizeToken(o.label).includes(token) || token.includes(normalizeToken(o.label))
  );
  return includes?.value || '';
}

function sanitizeOne(question: QuestionMeta, raw: unknown): string | string[] | undefined {
  if (raw == null) return undefined;

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
    const matched = matchOptionValue(raw, question.options || []);
    return matched || undefined;
  }

  const text = String(raw).trim();
  return text || undefined;
}

/** Keep only known ALFT ids and coerce option values to schema values. */
export function sanitizeAlftExtractedAnswers(raw: unknown): {
  answers: AlftParsedAnswerMap;
  filledIds: string[];
  ignoredKeys: string[];
} {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const answers: AlftParsedAnswerMap = {};
  const filledIds: string[] = [];
  const ignoredKeys: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    const question = questionById.get(key);
    if (!question) {
      ignoredKeys.push(key);
      continue;
    }
    const sanitized = sanitizeOne(question, value);
    if (sanitized === undefined) continue;
    answers[key] = sanitized;
    filledIds.push(key);
  }

  return { answers, filledIds, ignoredKeys };
}

export function mergeAlftParsedAnswers(
  base: AlftParsedAnswerMap,
  incoming: AlftParsedAnswerMap
): AlftParsedAnswerMap {
  return { ...base, ...incoming };
}
