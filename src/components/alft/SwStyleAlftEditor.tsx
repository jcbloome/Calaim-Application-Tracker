'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';
import { AlftMedListUpload, type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';
import { Button } from '@/components/ui/button';
import type { IspLayoutMode } from '@/lib/isp-layout-mode';
import { normalizeAlftFieldCapitalization } from '@/lib/alft-proper-case';
import {
  ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS,
  ALFT_PAGE_MOVED_FIELD_IDS,
  ALFT_PAGE_MOVED_FIELDS,
  clearAlftCognitiveFollowupAnswers,
  isAlftCognitiveFollowupLocked,
  isAlftCognitiveScreenUnlocked,
} from '@/lib/alft-form-rules';

type AnswerValue = string | string[];
type AnswerMap = Record<string, AnswerValue>;
type Question = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';
  rows?: number;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};
type SourcePage = { id: string; title: string; questions: Question[] };

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];
const MOVED_TEXT_FIELDS = ALFT_PAGE_MOVED_FIELDS;
const MOVED_TEXT_FIELD_IDS = ALFT_PAGE_MOVED_FIELD_IDS;
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
const formatElectronicTimestamp = (raw: unknown) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) return value;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return value;
  }
};
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

const normalizeDisplayMemberName = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.includes(',')) {
    const [ln, fn] = value.split(',', 2).map((part) => String(part || '').replace(/\s+\d+$/, '').trim());
    const combined = `${fn || ''} ${ln || ''}`.trim();
    return combined || value.replace(/\s+\d+$/, '').trim();
  }
  return value.replace(/\s+\d+$/, '').trim();
};

const CASPIO_HIGHLIGHT =
  'border-green-400 bg-green-50 text-green-950 ring-1 ring-green-200';
const DEFAULT_FIELD = 'border-zinc-300 bg-white';
const LOCKED_FIELD = 'border-zinc-200 bg-zinc-100 text-zinc-600 cursor-not-allowed';

export function SwStyleAlftEditor({
  answers,
  onChange,
  memberName,
  memberMrn,
  readOnly = false,
  sectionClassName = '',
  highlightedFieldIds,
  disabledFieldIds,
  layoutMode = 'desktop',
  memberId,
  medListAttachment = null,
  onMedListAttachmentChange,
  /** Hide mid-form signature name inputs — SW signs only at the final submit panel. */
  omitSignatureInputs = false,
  /** Show signature fields as read-only electronic notice. */
  signatureReadOnly = false,
}: {
  answers: AnswerMap;
  onChange: (id: string, value: AnswerValue) => void;
  memberName?: string;
  memberMrn?: string;
  readOnly?: boolean;
  sectionClassName?: string;
  /** Field IDs filled from member data — rendered with green highlight. */
  highlightedFieldIds?: ReadonlySet<string> | string[];
  /** Field IDs that cannot be edited (e.g. ISP mailing + financial sections). */
  disabledFieldIds?: ReadonlySet<string> | string[];
  /** Mobile mode: one page at a time, larger touch targets, single column. */
  layoutMode?: IspLayoutMode;
  memberId?: string;
  medListAttachment?: AlftMedListAttachment | null;
  onMedListAttachmentChange?: (next: AlftMedListAttachment | null) => void;
  omitSignatureInputs?: boolean;
  signatureReadOnly?: boolean;
}) {
  const isMobile = layoutMode === 'mobile';
  const [mobilePage, setMobilePage] = useState(1);

  useEffect(() => {
    if (!isMobile) return;
    setMobilePage(1);
  }, [isMobile]);

  const highlightSet = (() => {
    if (!highlightedFieldIds) return null;
    if (highlightedFieldIds instanceof Set) return highlightedFieldIds;
    return new Set(highlightedFieldIds);
  })();
  const disabledSet = (() => {
    if (!disabledFieldIds) return null;
    if (disabledFieldIds instanceof Set) return disabledFieldIds;
    return new Set(disabledFieldIds);
  })();

  const cognitiveUnlocked = isAlftCognitiveScreenUnlocked(answers);
  const effectiveDisabledSet = (() => {
    const set = new Set<string>(disabledSet ? Array.from(disabledSet) : []);
    if (!cognitiveUnlocked) {
      ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS.forEach((id) => set.add(id));
    }
    return set;
  })();

  const isHighlighted = (id: string) => Boolean(highlightSet?.has(id));
  const isFieldDisabled = (id: string) =>
    readOnly || Boolean(effectiveDisabledSet.has(id)) || isAlftCognitiveFollowupLocked(id, answers);
  const textSize = isMobile ? 'text-[15px]' : 'text-[12px]';
  const labelSize = isMobile ? 'text-[15px]' : 'text-[12px]';
  const controlSize = isMobile ? 'h-5 w-5' : 'h-3.5 w-3.5';
  const inputHeight = isMobile ? 'h-11' : 'h-8';
  const fieldClass = (id: string, extra = '') => {
    const locked = Boolean(effectiveDisabledSet.has(id));
    const tone = locked
      ? LOCKED_FIELD
      : isHighlighted(id)
        ? CASPIO_HIGHLIGHT
        : DEFAULT_FIELD;
    return `mt-1 w-full rounded px-2.5 ${textSize} ${tone} ${extra}`.trim();
  };

  const onSafeChange = (id: string, value: AnswerValue) => {
    if (isFieldDisabled(id)) return;
    if (id === 'p3_memory_diagnosis') {
      onChange(id, value);
      if (String(value || '').trim().toLowerCase() !== 'yes') {
        const cleared = clearAlftCognitiveFollowupAnswers(answers);
        for (const followId of ALFT_COGNITIVE_FOLLOWUP_FIELD_IDS) {
          const nextVal = cleared[followId];
          if (answers[followId] !== nextVal) {
            onChange(followId, (nextVal ?? '') as AnswerValue);
          }
        }
      }
      return;
    }
    onChange(id, value);
  };

  const onSafeBlurText = (id: string, value: string) => {
    if (isFieldDisabled(id)) return;
    const next = normalizeAlftFieldCapitalization(id, value);
    if (next !== value) onChange(id, next);
  };

  const pagesToRender = isMobile
    ? PAGE_LAYOUT.filter((layout) => layout.number === mobilePage)
    : PAGE_LAYOUT;

  return (
    <div className={isMobile ? 'space-y-4 pb-24' : 'space-y-5'}>
      {isMobile ? (
        <div className="sticky top-0 z-20 -mx-1 rounded-md border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3"
              disabled={mobilePage <= 1}
              onClick={() => setMobilePage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <div className="text-center text-sm font-semibold text-slate-800">
              Page {mobilePage} of {PAGE_LAYOUT.length}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3"
              disabled={mobilePage >= PAGE_LAYOUT.length}
              onClick={() => setMobilePage((page) => Math.min(PAGE_LAYOUT.length, page + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <select
            value={mobilePage}
            onChange={(e) => setMobilePage(Number(e.target.value) || 1)}
            className="h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
            aria-label="Jump to ISP page"
          >
            {PAGE_LAYOUT.map((layout) => (
              <option key={layout.number} value={layout.number}>
                {layout.number}. {layout.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {pagesToRender.map((layout) => {
        const source = SOURCE.find((p) => p.id === layout.sourceId);
        const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
        const renderedQuestions = getRenderedQuestionsForPage(layout.number, questions);
        return (
          <section
            key={layout.number}
            className={`rounded border border-zinc-300 bg-white ${isMobile ? 'p-3' : 'p-4'} ${sectionClassName}`.trim()}
          >
            <div className={`mb-3 border-b border-zinc-300 ${isMobile ? 'pb-3' : 'pb-2'}`}>
              {!isMobile ? (
                <div className="flex flex-col items-center gap-1">
                  <img src="/ils-logo.png" alt="Independent Living Systems" className="h-[36px] w-auto object-contain" loading="eager" />
                  <div className="text-center text-[14px] font-semibold tracking-wide">ALF TRANSITION ASSESSMENT</div>
                </div>
              ) : (
                <div className="text-center text-base font-semibold tracking-wide">ALF TRANSITION ASSESSMENT</div>
              )}
              <div className={`mt-1.5 flex items-center justify-between text-zinc-700 ${textSize}`}>
                <span>{normalizeDisplayMemberName(memberName || '') || 'Member'} {memberMrn ? `• MRN: ${memberMrn}` : ''}</span>
                {!isMobile ? <span>Page {layout.number} of {PAGE_LAYOUT.length}</span> : null}
              </div>
              <div className={`mt-1 font-semibold uppercase tracking-wide ${isMobile ? 'text-sm' : 'text-[12px]'}`}>
                {layout.title}
              </div>
            </div>

            <div
              className={`grid grid-cols-1 ${textSize} ${
                isMobile ? 'gap-3' : renderedQuestions.length <= 14 ? 'gap-3.5 md:grid-cols-2' : 'gap-2 md:grid-cols-2'
              }`}
            >
              {renderedQuestions.map((q) => (
                <div
                  key={q.id}
                  className={`rounded-sm border ${
                    isMobile ? 'px-3 py-3' : renderedQuestions.length <= 14 ? 'px-2.5 py-3' : 'px-2.5 py-1.5'
                  } ${
                    isHighlighted(q.id) ? 'border-green-400 bg-green-50/70' : 'border-zinc-300'
                  } ${!isMobile && isLongText(q) ? 'md:col-span-2' : ''}`}
                >
                  <div className={`${labelSize} font-semibold leading-snug`}>
                    {formatLabel(q.label)}
                    {q.required && !effectiveDisabledSet.has(q.id) ? (
                      <span className="ml-1 font-semibold text-red-600" title="Required">
                        *
                      </span>
                    ) : null}
                    {disabledSet?.has(q.id) ? (
                      <span className="ml-1 font-normal text-zinc-500">(N/A — not required for ISP)</span>
                    ) : null}
                    {isAlftCognitiveFollowupLocked(q.id, answers) ? (
                      <span className="ml-1 font-normal text-zinc-500">(Skipped — no cognitive impairment)</span>
                    ) : null}
                  </div>

                  {q.type === 'text' ? (
                    <input
                      value={String(answers[q.id] || '')}
                      onChange={(e) => onSafeChange(q.id, e.target.value)}
                      onBlur={(e) => onSafeBlurText(q.id, e.target.value)}
                      readOnly={isFieldDisabled(q.id)}
                      disabled={isFieldDisabled(q.id)}
                      placeholder={q.placeholder || undefined}
                      required={Boolean(q.required)}
                      aria-required={Boolean(q.required)}
                      className={fieldClass(
                        q.id,
                        `${inputHeight} ${
                          q.id === 'p1_assessment_date' && !/^\d{2}\/\d{2}\/\d{4}$/.test(String(answers[q.id] || '').trim())
                            ? 'border-amber-400'
                            : q.required && !String(answers[q.id] || '').trim() && !isFieldDisabled(q.id)
                              ? 'border-amber-400'
                              : ''
                        }`
                      )}
                    />
                  ) : null}

                  {q.type === 'textarea' ? (
                    <textarea
                      value={String(answers[q.id] || '')}
                      onChange={(e) => onSafeChange(q.id, e.target.value)}
                      readOnly={isFieldDisabled(q.id)}
                      disabled={isFieldDisabled(q.id)}
                      rows={
                        q.id === 'p13_commentary_section'
                          ? isMobile
                            ? 12
                            : 20
                          : Math.min(Math.max(q.rows || 3, isMobile ? 4 : 3), isMobile ? 8 : 6)
                      }
                      className={fieldClass(
                        q.id,
                        `py-2 ${q.id === 'p13_commentary_section' ? (isMobile ? 'min-h-[240px]' : 'min-h-[420px]') : ''}`
                      )}
                    />
                  ) : null}

                  {q.id === 'p13_medication_table' ? (
                    <div className="mt-2 print:mt-3">
                      <AlftMedListUpload
                        memberId={memberId}
                        attachment={medListAttachment || null}
                        onChange={onMedListAttachmentChange || (() => undefined)}
                        readOnly={readOnly || !onMedListAttachmentChange}
                      />
                    </div>
                  ) : null}

                  {(q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                    <div className={`mt-1.5 ${isMobile ? 'grid grid-cols-1 gap-2' : 'flex flex-wrap gap-x-3 gap-y-1.5'}`}>
                      {q.options.map((opt) => {
                        const checked = String(answers[q.id] || '') === opt.value;
                        return (
                          <label
                            key={`${q.id}-${opt.value}`}
                            className={`inline-flex items-center gap-2 leading-snug ${labelSize} ${
                              isMobile ? 'min-h-11 rounded-md border border-zinc-200 bg-white px-3' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name={`alft-edit-${q.id}`}
                              checked={checked}
                              onChange={() => onSafeChange(q.id, opt.value)}
                              disabled={isFieldDisabled(q.id)}
                              className={`${controlSize} accent-green-700`}
                              aria-label={opt.label}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {q.type === 'checkboxGroup' && q.options?.length ? (
                    <div className={`mt-1.5 ${isMobile ? 'grid grid-cols-1 gap-2' : 'flex flex-wrap gap-x-3 gap-y-1.5'}`}>
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
                            className={`inline-flex items-center gap-2 leading-snug ${labelSize} ${
                              isMobile ? 'min-h-11 rounded-md border border-zinc-200 bg-white px-3' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={onToggle}
                              disabled={isFieldDisabled(q.id)}
                              className={`${controlSize} accent-green-700`}
                              aria-label={opt.label}
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  {!q.options?.length && q.type !== 'text' && q.type !== 'textarea' ? (
                    <div className={`mt-1 border-b border-zinc-500 pb-0.5 text-zinc-900 whitespace-pre-wrap ${textSize}`}>
                      {asText(answers[q.id]) || ' '}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {layout.number === 13 && !omitSignatureInputs ? (
              <div className={`mt-3 space-y-2 ${textSize}`}>
                <div className="rounded border border-zinc-300 p-2">
                  <div className={`mb-2 font-semibold uppercase tracking-wide ${labelSize}`}>Signature Section</div>
                  <div className={`grid grid-cols-1 gap-2 ${isMobile ? '' : 'md:grid-cols-2'}`}>
                    <div className="rounded border border-zinc-200 p-2">
                      <div className={`font-semibold text-zinc-700 ${labelSize}`}>MSW Signature</div>
                      <label className="mt-1 block text-[11px] text-zinc-600">Print Name</label>
                      <input
                        value={String(answers.p14_print_name || '')}
                        onChange={(e) => onSafeChange('p14_print_name', e.target.value)}
                        readOnly={readOnly || signatureReadOnly}
                        disabled={readOnly || signatureReadOnly}
                        className={`mt-0.5 w-full rounded border border-zinc-300 bg-white px-2.5 ${inputHeight} ${textSize}`}
                      />
                      <label className="mt-1 block text-[11px] text-zinc-600">Date</label>
                      <input
                        value={String(answers.p14_date || '')}
                        onChange={(e) => onSafeChange('p14_date', e.target.value)}
                        readOnly={readOnly || signatureReadOnly}
                        disabled={readOnly || signatureReadOnly}
                        className={`mt-0.5 w-full rounded border border-zinc-300 bg-white px-2.5 ${inputHeight} ${textSize}`}
                      />
                      <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-[11px] text-emerald-950">
                        <div className="font-medium">Electronic signature notice</div>
                        <div className="mt-0.5 text-[10px] leading-snug">
                          {String(answers.p14_electronic_notice || '').trim() ||
                            (formatElectronicTimestamp(answers.p14_sw_signed_at)
                              ? `Electronically signed on ${formatElectronicTimestamp(answers.p14_sw_signed_at)}`
                              : 'Pending — appears when MSW approves electronic signature at the end')}
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-zinc-200 p-2">
                      <div className={`font-semibold text-zinc-700 ${labelSize}`}>RN Signature</div>
                      <label className="mt-1 block text-[11px] text-zinc-600">License Number</label>
                      <input
                        value={String(answers.p14_license_number || '')}
                        onChange={(e) => onSafeChange('p14_license_number', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className={`mt-0.5 w-full rounded border border-zinc-300 bg-white px-2.5 ${inputHeight} ${textSize}`}
                      />
                      <label className="mt-1 block text-[11px] text-zinc-600">Print Name</label>
                      <input
                        value={String(answers.p14_rn_print_name || '')}
                        onChange={(e) => onSafeChange('p14_rn_print_name', e.target.value)}
                        readOnly={readOnly}
                        disabled={readOnly}
                        className={`mt-0.5 w-full rounded border border-zinc-300 bg-white px-2.5 ${inputHeight} ${textSize}`}
                      />
                      <div className="mt-2 rounded border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-[11px] text-emerald-950">
                        <div className="font-medium">Electronic timestamp</div>
                        <div className="mt-0.5 font-mono text-[10px] leading-snug">
                          {formatElectronicTimestamp(answers.p14_rn_signed_at) || 'Pending — set when RN signs and submits'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {isMobile ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={mobilePage <= 1}
              onClick={() => setMobilePage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={mobilePage >= PAGE_LAYOUT.length}
              onClick={() => setMobilePage((page) => Math.min(PAGE_LAYOUT.length, page + 1))}
            >
              Next page
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
