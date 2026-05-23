'use client';

import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';

type AnswerValue = string | string[];
type AnswerMap = Record<string, AnswerValue>;
type Question = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';
  rows?: number;
  options?: Array<{ value: string; label: string }>;
};
type SourcePage = { id: string; title: string; questions: Question[] };

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];
const MOVED_TEXT_FIELDS: Array<{
  questionId: string;
  targetPage: number;
  afterQuestionId: string;
  label: string;
}> = [
  { questionId: 'p6_notes_summary', targetPage: 3, afterQuestionId: 'p3_cognitive_problems_present', label: 'SECTION B. Notes and Summary:' },
  { questionId: 'p6_section_d_text', targetPage: 5, afterQuestionId: 'p5_dme', label: 'SECTION D. Notes and Summary:' },
  { questionId: 'p6_section_e_text', targetPage: 6, afterQuestionId: 'p6_iadl_transportation', label: 'SECTION E. Notes and Summary:' },
  { questionId: 'p6_section_f_text', targetPage: 8, afterQuestionId: 'p8_visit_duties', label: 'SECTION F. Notes and Summary:' },
  { questionId: 'p10_notes_summary', targetPage: 10, afterQuestionId: 'p10_special_diet_reason', label: 'SECTION I. Notes and Summary:' },
];
const MOVED_TEXT_FIELD_IDS = new Set(MOVED_TEXT_FIELDS.map((item) => item.questionId));
const QUESTION_BY_ID: Record<string, Question> = SOURCE.reduce<Record<string, Question>>((acc, page) => {
  page.questions.forEach((q) => {
    acc[q.id] = q;
  });
  return acc;
}, {});
const PAGE_LAYOUT: Array<{ number: number; sourceId: string; prefix: string; title: string }> = [
  { number: 1, sourceId: 'page1', prefix: 'p1_', title: 'Header Information + Demographic' },
  { number: 2, sourceId: 'page2', prefix: 'p2_', title: 'Addresses, Site, Risk, Living Situation, Income' },
  { number: 3, sourceId: 'page3', prefix: 'p3_', title: 'Memory and Cognitive Questions' },
  { number: 4, sourceId: 'page4_6', prefix: 'p4_', title: 'GENERAL HEALTH, SENSORY, AND COMMUNICATION' },
  { number: 5, sourceId: 'page4_6', prefix: 'p5_', title: 'ACTIVITIES OF DAILY LIVING' },
  { number: 6, sourceId: 'page4_6', prefix: 'p6_', title: 'INSTRUMENTAL ACTIVITIES OF DAILY LIVING' },
  { number: 7, sourceId: 'page7_8', prefix: 'p7_', title: 'HEALTH CONDITIONS AND THERAPIES' },
  { number: 8, sourceId: 'page7_8', prefix: 'p8_', title: 'Therapies + Specialty Care' },
  { number: 9, sourceId: 'page9_10', prefix: 'p9_', title: 'MENTAL HEALTH' },
  { number: 10, sourceId: 'page9_10', prefix: 'p10_', title: 'NUTRITION' },
  { number: 11, sourceId: 'page11_12', prefix: 'p11_', title: 'MEDICATION AND SUBSTANCE USE' },
  { number: 12, sourceId: 'page11_12', prefix: 'p12_', title: 'Self-Reported Health + Vision/Hearing' },
  { number: 13, sourceId: 'page13_14', prefix: 'p13_', title: 'MEDICATIONS' },
];

const asText = (v: AnswerValue | undefined) => (Array.isArray(v) ? v.join(', ') : String(v || ''));
const isLongText = (q: Question) => q.type === 'textarea' || q.label.toLowerCase().includes('notes') || q.label.toLowerCase().includes('summary');
const formatLabel = (label: string) => {
  const raw = String(label || '').trim();
  const qMatch = raw.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qMatch) return `${qMatch[1]}. ${qMatch[2]}`;
  const nMatch = raw.match(/^(\d+)\.\s*(.+)$/);
  if (nMatch) return `${nMatch[1]}. ${nMatch[2]}`;
  return raw || label;
};

function getRenderedQuestionsForPage(layoutNumber: number, baseQuestions: Question[]): Question[] {
  const pageMoves = MOVED_TEXT_FIELDS.filter((item) => item.targetPage === layoutNumber);
  const nextQuestions = baseQuestions.filter((q) => !MOVED_TEXT_FIELD_IDS.has(q.id));
  if (!pageMoves.length) return nextQuestions;

  const rendered: Question[] = [];
  const movedInserted = new Set<string>();

  nextQuestions.forEach((q) => {
    rendered.push(q);
    pageMoves
      .filter((move) => move.afterQuestionId === q.id)
      .forEach((move) => {
        const sourceQuestion = QUESTION_BY_ID[move.questionId];
        if (!sourceQuestion) return;
        rendered.push({ ...sourceQuestion, label: move.label });
        movedInserted.add(move.questionId);
      });
  });

  pageMoves.forEach((move) => {
    if (movedInserted.has(move.questionId)) return;
    const sourceQuestion = QUESTION_BY_ID[move.questionId];
    if (!sourceQuestion) return;
    rendered.push({ ...sourceQuestion, label: move.label });
  });

  return rendered;
}

export function SwStyleAlftEditor({
  answers,
  onChange,
  memberName,
  memberMrn,
  readOnly = false,
  sectionClassName = '',
}: {
  answers: AnswerMap;
  onChange: (id: string, value: AnswerValue) => void;
  memberName?: string;
  memberMrn?: string;
  readOnly?: boolean;
  sectionClassName?: string;
}) {
  const onSafeChange = (id: string, value: AnswerValue) => {
    if (readOnly) return;
    onChange(id, value);
  };

  return (
    <div className="space-y-4">
      {PAGE_LAYOUT.map((layout) => {
        const source = SOURCE.find((p) => p.id === layout.sourceId);
        const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
        const renderedQuestions = getRenderedQuestionsForPage(layout.number, questions);
        return (
          <section key={layout.number} className={`rounded border border-zinc-300 bg-white p-4 ${sectionClassName}`.trim()}>
            <div className="mb-2 border-b border-zinc-300 pb-1.5">
              <div className="flex flex-col items-center gap-1">
                <img src="/ils-logo.png" alt="Independent Living Systems" className="h-[36px] w-auto object-contain" loading="eager" />
                <div className="text-center text-[12px] font-semibold tracking-wide">ALF TRANSITION ASSESSMENT</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-700">
                <span>{memberName || 'Member'} {memberMrn ? `• MRN: ${memberMrn}` : ''}</span>
                <span>Page {layout.number} of {PAGE_LAYOUT.length}</span>
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide">{layout.title}</div>
            </div>

            <div className="grid grid-cols-1 gap-1 text-[10px] md:grid-cols-2">
              {renderedQuestions.map((q) => (
                <div key={q.id} className={`rounded-sm border border-zinc-300 px-2 py-1 ${isLongText(q) ? 'md:col-span-2' : ''}`}>
                  <div className="font-semibold leading-tight">{formatLabel(q.label)}</div>

                  {q.type === 'text' ? (
                    <input
                      value={String(answers[q.id] || '')}
                      onChange={(e) => onSafeChange(q.id, e.target.value)}
                      readOnly={readOnly}
                      disabled={readOnly}
                      className="mt-1 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                    />
                  ) : null}

                  {q.type === 'textarea' ? (
                    <textarea
                      value={String(answers[q.id] || '')}
                      onChange={(e) => onSafeChange(q.id, e.target.value)}
                      readOnly={readOnly}
                      disabled={readOnly}
                      rows={q.id === 'p13_commentary_section' ? 20 : Math.min(Math.max(q.rows || 3, 3), 6)}
                      className={`mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] ${
                        q.id === 'p13_commentary_section' ? 'min-h-[420px]' : ''
                      }`}
                    />
                  ) : null}

                  {(q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {q.options.map((opt) => {
                        const checked = String(answers[q.id] || '') === opt.value;
                        return (
                          <label
                            key={`${q.id}-${opt.value}`}
                            className="inline-flex items-center gap-1 text-[10px] leading-tight"
                          >
                            <input
                              type="radio"
                              name={`alft-edit-${q.id}`}
                              checked={checked}
                              onChange={() => onSafeChange(q.id, opt.value)}
                              disabled={readOnly}
                              className="h-3 w-3 accent-zinc-700"
                              aria-label={opt.label}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {q.type === 'checkboxGroup' && q.options?.length ? (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {q.options.map((opt) => {
                        const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
                        const onToggle = () => {
                          const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                          const next = current.includes(opt.value) ? current.filter((v) => v !== opt.value) : [...current, opt.value];
                          onSafeChange(q.id, next);
                        };
                        return (
                          <label
                            key={`${q.id}-${opt.value}`}
                            className="inline-flex items-center gap-1 text-[10px] leading-tight"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={onToggle}
                              disabled={readOnly}
                              className="h-3 w-3 accent-zinc-700"
                              aria-label={opt.label}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {!q.options?.length && q.type !== 'text' && q.type !== 'textarea' ? (
                    <div className="mt-1 border-b border-zinc-500 pb-0.5 text-zinc-900 whitespace-pre-wrap">
                      {asText(answers[q.id]) || ' '}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {layout.number === 13 ? (
              <div className="mt-3 space-y-2 text-[10px]">
                <div className="rounded border border-zinc-300 p-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide">Signature Section</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div className="rounded border border-zinc-200 p-2">
                      <div className="text-[10px] font-semibold text-zinc-700">MSW Signature</div>
                      <label className="mt-1 block text-[9px] text-zinc-600">Print Name</label>
                      <input
                        value={String(answers.p14_print_name || '')}
                        onChange={(e) => onSafeChange('p14_print_name', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                      />
                      <label className="mt-1 block text-[9px] text-zinc-600">Date</label>
                      <input
                        value={String(answers.p14_date || '')}
                        onChange={(e) => onSafeChange('p14_date', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                      />
                    </div>

                    <div className="rounded border border-zinc-200 p-2">
                      <div className="text-[10px] font-semibold text-zinc-700">RN Signature</div>
                      <label className="mt-1 block text-[9px] text-zinc-600">License Number</label>
                      <input
                        value={String(answers.p14_license_number || '')}
                        onChange={(e) => onSafeChange('p14_license_number', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                      />
                      <label className="mt-1 block text-[9px] text-zinc-600">Print Name</label>
                      <input
                        value={String(answers.p14_rn_print_name || '')}
                        onChange={(e) => onSafeChange('p14_rn_print_name', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className="mt-0.5 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

    </div>
  );
}

