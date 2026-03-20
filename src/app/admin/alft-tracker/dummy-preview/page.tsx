'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';

type QuestionType = 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';
type AnswerValue = string | string[];
type Question = {
  id: string;
  label: string;
  type: QuestionType;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
};
type SourcePage = { id: string; title: string; questions: Question[] };

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];

const PAGE_LAYOUT: Array<{ number: number; sourceId: string; prefix: string; title: string }> = [
  { number: 1, sourceId: 'page1', prefix: 'p1_', title: 'Header Information + Demographic' },
  { number: 2, sourceId: 'page2', prefix: 'p2_', title: 'Addresses, Site, Risk, Living Situation, Income' },
  { number: 3, sourceId: 'page3', prefix: 'p3_', title: 'Memory and Cognitive Questions' },
  { number: 4, sourceId: 'page4_6', prefix: 'p4_', title: 'General Health, Sensory, and Communication' },
  { number: 5, sourceId: 'page4_6', prefix: 'p5_', title: 'Activities of Daily Living' },
  { number: 6, sourceId: 'page4_6', prefix: 'p6_', title: 'Instrumental Activities of Daily Living' },
  { number: 7, sourceId: 'page7_8', prefix: 'p7_', title: 'Health Conditions' },
  { number: 8, sourceId: 'page7_8', prefix: 'p8_', title: 'Therapies + Specialty Care' },
  { number: 9, sourceId: 'page9_10', prefix: 'p9_', title: 'Mental Health' },
  { number: 10, sourceId: 'page9_10', prefix: 'p10_', title: 'Nutrition + Behavior Follow-Up' },
  { number: 11, sourceId: 'page11_12', prefix: 'p11_', title: 'Medication + Advance Directive + Environment' },
  { number: 12, sourceId: 'page11_12', prefix: 'p12_', title: 'Self-Reported Health + Vision/Hearing' },
  { number: 13, sourceId: 'page13_14', prefix: 'p13_', title: 'Medication and Substance Use' },
  { number: 14, sourceId: 'page13_14', prefix: 'p14_', title: 'Signature Section' },
];

const MOVED_TEXT_FIELDS: Array<{
  questionId: string;
  targetPage: number;
  afterQuestionId: string;
  label: string;
}> = [
  { questionId: 'p6_notes_summary', targetPage: 3, afterQuestionId: 'p3_cognitive_problems_present', label: 'SECTION B. Notes and Summary:' },
  { questionId: 'p6_section_d_text', targetPage: 5, afterQuestionId: 'p5_adl_walking_mobility', label: 'SECTION D. Notes and Summary:' },
  { questionId: 'p6_section_e_text', targetPage: 6, afterQuestionId: 'p6_iadl_transportation', label: 'SECTION E. Notes and Summary:' },
  { questionId: 'p6_section_f_text', targetPage: 8, afterQuestionId: 'p8_visit_duties', label: 'SECTION F. Notes and Summary:' },
  { questionId: 'p10_notes_summary', targetPage: 10, afterQuestionId: 'p10_special_diet_reason', label: 'SECTION I. Notes and Summary:' },
];

const MOVED_TEXT_FIELD_IDS = new Set(MOVED_TEXT_FIELDS.map((item) => item.questionId));
const HIDE_FROM_PDF_QUESTION_IDS = new Set([
  'p14_additional_details',
  'p14_print_name',
  'p14_date',
  'p14_license_number',
  'p14_role',
  'p14_signature_note',
]);

const SECTION_DIVIDERS: Record<number, Array<{ beforeQuestionId: string; label: string }>> = {
  1: [
    { beforeQuestionId: 'p1_member_name', label: 'Header Information' },
    { beforeQuestionId: 'p1_first_name', label: 'Demographic' },
  ],
  4: [
    { beforeQuestionId: 'p4_adl_bathing', label: 'Activities of Daily Living' },
  ],
  5: [],
  6: [],
  13: [{ beforeQuestionId: 'p13_commentary_section', label: 'Commentary Section' }],
};

const QUESTION_BY_ID: Record<string, Question> = SOURCE.reduce<Record<string, Question>>((acc, page) => {
  page.questions.forEach((q) => {
    acc[q.id] = q;
  });
  return acc;
}, {});

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

function isMovedTextQuestion(questionId: string): boolean {
  return MOVED_TEXT_FIELD_IDS.has(questionId);
}

function asText(value: AnswerValue | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value || '').trim();
}

const DUMMY_OVERRIDES: Record<string, AnswerValue> = {
  p1_agency: 'ILS Health',
  p1_assessment_date: '2026-03-04',
  p1_plan_id: 'PLAN-ALFT-1022',
  p1_member_name: 'Leo Lara',
  p1_assessor_name: 'Social Worker Example',
  p1_referral_date: '2026-03-01',
  p1_first_name: 'Leo',
  p1_middle_name: 'A',
  p1_last_name: 'Lara',
  p1_mrn: '000045678',
  p1_phone: '(555) 555-1212',
  p1_dob: '1950-07-21',
  p1_sex: 'Male',
  p2_current_street: '123 Main St',
  p2_current_city: 'Los Angeles',
  p2_current_state: 'CA',
  p2_current_zip: '90012',
  p2_facility_name: 'Example RCFE',
  p13_medication_table:
    'Amlodipine | 5mg | Daily | Y | Oral | Dr. Nguyen\nMetformin | 500mg | BID | Y | Oral | Dr. Nguyen\nVitamin D | 1000 IU | Daily | Y | Oral | Dr. Patel',
  p13_commentary_section:
    'Member medication response, adherence notes, side effects observed, transition risks, family concerns, and follow-up plan details are documented here for clinical handoff.',
  p14_additional_details: 'Member appropriate for transition support plan. Family support available. Safety plan reviewed.',
  p14_print_name: 'RN Example',
  p14_date: '2026-03-04',
  p14_license_number: 'RN-123456',
  p14_signature_note: 'Dummy preview packet - training/output demo for ILS.',
};

const optionLabel = (q: Question, value: string) => q.options?.find((opt) => opt.value === value)?.label || value;

const formatPromptLabel = (label: string) => {
  const qMatch = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qMatch) return `${qMatch[1]}. ${qMatch[2]}`;
  const nMatch = label.match(/^(\d+)\.\s*(.+)$/);
  if (nMatch) return `${nMatch[1]}. ${nMatch[2]}`;
  return label;
};

function toDefaultValue(q: Question): AnswerValue {
  if (q.type === 'checkboxGroup') return q.options?.slice(0, 1).map((opt) => opt.value) || [];
  if (q.type === 'radio' || q.type === 'select') return q.options?.[0]?.value || '';
  if (q.id.includes('date')) return '2026-03-04';
  if (q.id.includes('name')) return 'Sample';
  if (q.id.includes('phone')) return '(555) 555-1212';
  if (q.id.includes('city')) return 'Los Angeles';
  if (q.id.includes('state')) return 'CA';
  if (q.id.includes('zip')) return '90000';
  if (q.id.includes('mrn')) return '000045678';
  if (q.type === 'textarea') return 'Documented for dummy packet preview.';
  return 'N/A';
}

function isOptionQuestion(q: Question) {
  return q.type === 'radio' || q.type === 'select' || q.type === 'checkboxGroup';
}

function isLongTextQuestion(q: Question) {
  return q.type === 'textarea' || q.label.toLowerCase().includes('notes') || q.label.toLowerCase().includes('summary');
}

function isLargeCommentaryQuestion(q: Question) {
  return q.id === 'p13_commentary_section';
}

function Dot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-700 align-middle bg-white"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-zinc-800' : 'bg-transparent'}`} />
    </span>
  );
}

export default function AdminAlftDummyPreviewPage() {
  const searchParams = useSearchParams();
  const isPdfView = String(searchParams.get('view') || '').toLowerCase() === 'pdf';
  const logoSrc = '/ils-logo.png';

  const initialAnswers = useMemo<Record<string, AnswerValue>>(() => {
    const next: Record<string, AnswerValue> = {};
    SOURCE.forEach((page) => {
      page.questions.forEach((q) => {
        next[q.id] = DUMMY_OVERRIDES[q.id] ?? toDefaultValue(q);
      });
    });
    return next;
  }, []);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers);

  const setSingleAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMultiAnswer = (id: string, value: string) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [id]: next };
    });
  };

  return (
    <div className="alft-dummy-preview mx-auto max-w-[8.5in] px-2 py-4 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex items-center justify-end gap-2 rounded-md border border-zinc-300 bg-white p-3 print:hidden">
        {!isPdfView ? (
          <Button variant="outline" asChild>
            <Link href="/admin/alft-tracker/dummy-preview?view=pdf">
              View PDF layout
            </Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/admin/alft-tracker/dummy-preview">Back to editor</Link>
          </Button>
        )}
        <Button onClick={() => window.print()} variant="outline">
          Print / Save PDF
        </Button>
      </div>

      {!isPdfView ? (
        <div className="mb-4 space-y-3 rounded-md border border-zinc-300 bg-white p-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">ALFT Dummy Editor (Admin)</div>
            <div className="text-xs text-zinc-600">Update choices here. Preview below updates immediately and prints as full 14-page packet.</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setAnswers(initialAnswers)} variant="outline">
              Reset demo values
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {PAGE_LAYOUT.map((layout) => {
            const source = SOURCE.find((p) => p.id === layout.sourceId);
            const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
            return (
              <details key={`editor-${layout.number}`} className="rounded border border-zinc-200 p-2">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-700">
                  Page {layout.number}: {layout.title}
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {questions.map((q) => (
                    <div
                      key={`editor-field-${q.id}`}
                      className={`rounded border border-zinc-100 bg-zinc-50 p-2 ${isLongTextQuestion(q) ? 'xl:col-span-2' : ''}`}
                    >
                      <div className="mb-1 text-[11px] font-medium leading-tight text-zinc-800">{formatPromptLabel(q.label)}</div>

                      {q.type === 'text' ? (
                        <input
                          value={String(answers[q.id] || '')}
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          className="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-xs"
                        />
                      ) : null}

                      {q.type === 'textarea' ? (
                        <textarea
                          value={String(answers[q.id] || '')}
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          rows={Math.min(Math.max(q.rows || 3, 3), 6)}
                          className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                        />
                      ) : null}

                      {(q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => (
                            <label key={`editor-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[11px]">
                              <input
                                type="radio"
                                name={`edit-${q.id}`}
                                checked={String(answers[q.id] || '') === opt.value}
                                onChange={() => setSingleAnswer(q.id, opt.value)}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {q.type === 'checkboxGroup' && q.options?.length ? (
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => {
                            const selected = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).includes(opt.value) : false;
                            return (
                              <label key={`editor-check-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[11px]">
                                <input type="checkbox" checked={selected} onChange={() => toggleMultiAnswer(q.id, opt.value)} />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
        </div>
      ) : null}

      <div className="space-y-4 print:space-y-0">
        {PAGE_LAYOUT.map((layout) => {
          const source = SOURCE.find((p) => p.id === layout.sourceId);
          const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
          const renderedQuestions = getRenderedQuestionsForPage(layout.number, questions).filter(
            (q) => !HIDE_FROM_PDF_QUESTION_IDS.has(q.id)
          );
          const rnName = asText(answers.p14_print_name);
          const rnDate = asText(answers.p14_date);
          const rnLicense = asText(answers.p14_license_number);
          const mswName = asText(answers.p1_assessor_name);
          const mswDate = asText(answers.p14_date);
          return (
            <section key={layout.number} className="alft-page border border-zinc-300 bg-white p-5">
              <div className="mb-2 border-b border-zinc-400 pb-1.5">
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={logoSrc}
                    alt="Independent Living Systems"
                    width={260}
                    height={72}
                    loading="eager"
                    decoding="sync"
                    className="alft-logo h-[36px] w-auto object-contain"
                  />
                  <div className="text-center text-[12px] font-semibold tracking-wide">ALF TRANSITION ASSESSMENT</div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-700">
                  <span>Dummy Packet (ILS - Leo Lara)</span>
                  <span>Page {layout.number} of 14</span>
                </div>
                <div className="alft-section-title mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  {layout.title}
                </div>
              </div>

              {layout.number === 14 ? (
                <div className="space-y-3 text-[10px]">
                  <div className="signature-block">
                    <div className="signature-title">MSW Signature</div>
                    <div className="signature-grid">
                      <div>
                        <div className="signature-label">Name</div>
                        <div className="signature-line">{mswName || ' '}</div>
                      </div>
                      <div>
                        <div className="signature-label">Date</div>
                        <div className="signature-line">{mswDate || ' '}</div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="signature-label">Signature</div>
                        <div className="signature-line">{' '}</div>
                      </div>
                    </div>
                  </div>

                  <div className="signature-block">
                    <div className="signature-title">RN Signature</div>
                    <div className="signature-grid">
                      <div>
                        <div className="signature-label">Name</div>
                        <div className="signature-line">{rnName || ' '}</div>
                      </div>
                      <div>
                        <div className="signature-label">Date</div>
                        <div className="signature-line">{rnDate || ' '}</div>
                      </div>
                      <div>
                        <div className="signature-label">License Number</div>
                        <div className="signature-line">{rnLicense || ' '}</div>
                      </div>
                      <div>
                        <div className="signature-label">Signature</div>
                        <div className="signature-line">{' '}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-1 gap-1 text-[10px] md:grid-cols-2">
                {renderedQuestions.map((q) => (
                  <div key={q.id} className="contents">
                    {(SECTION_DIVIDERS[layout.number] || [])
                      .filter((divider) => divider.beforeQuestionId === q.id)
                      .map((divider) => (
                        <div
                          key={`${layout.number}-${divider.beforeQuestionId}-divider`}
                          className="alft-subsection-title md:col-span-2"
                        >
                          {divider.label}
                        </div>
                      ))}
                  <div className={`question-block rounded-sm border border-zinc-300 px-2 py-1 ${isLongTextQuestion(q) ? 'md:col-span-2' : ''}`}>
                    <div className="font-semibold leading-tight">
                      {formatPromptLabel(q.label)}
                    </div>
                    {isOptionQuestion(q) && q.options?.length ? (
                      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                        {q.options.map((opt) => {
                          const selected =
                            q.type === 'checkboxGroup'
                              ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                              : String(answers[q.id] || '') === opt.value;
                          return (
                            <div key={`output-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                              <Dot selected={selected} />
                              <span className={`${selected ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}>{opt.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div
                        className={`answer-line mt-1 pb-0.5 text-zinc-900 whitespace-pre-wrap ${
                          isMovedTextQuestion(q.id) ? 'section-notes-answer' : 'border-b border-zinc-500'
                        } ${
                          isLargeCommentaryQuestion(q) ? 'large-commentary-box' : ''
                        }`}
                      >
                        {String(answers[q.id] || '').trim() || ' '}
                      </div>
                    )}
                    {q.type === 'select' && q.options?.length ? (
                      <div className="mt-0.5 text-[9px] text-zinc-600">Selected: {optionLabel(q, String(answers[q.id] || ''))}</div>
                    ) : null}
                  </div>
                  </div>
                ))}
              </div>
              )}

              <div className="mt-4 border-t border-zinc-300 pt-2 text-right text-[10px] text-zinc-600">
                ALF Transition Assessment - Page {layout.number} of 14
              </div>
            </section>
          );
        })}
      </div>

      <style jsx global>{`
        body {
          background: #f5f5f5;
        }
        .alft-dummy-preview {
          color: #18181b;
        }
        .alft-page {
          min-height: 10.45in;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          font-family: Arial, Helvetica, sans-serif;
          letter-spacing: 0.01em;
        }
        .alft-logo {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .alft-section-title {
          background: #0f8bb5;
          border: 1px solid #0f8bb5;
          color: #ffffff;
          padding: 2px 6px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .alft-subsection-title {
          background: #0f8bb5;
          border: 1px solid #0f8bb5;
          color: #ffffff;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .question-block {
          background: #fff;
        }
        .answer-line {
          min-height: 0.7rem;
        }
        .section-notes-answer {
          min-height: 54px;
          border: none;
          font-size: 11px;
          line-height: 1.35;
          padding-top: 4px;
        }
        .signature-block {
          border: 1px solid #d4d4d8;
          padding: 8px;
          background: #fff;
        }
        .signature-title {
          font-size: 11px;
          font-weight: 700;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .signature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .signature-label {
          font-size: 9px;
          color: #52525b;
          margin-bottom: 2px;
          text-transform: uppercase;
        }
        .signature-line {
          border-bottom: 1px solid #3f3f46;
          min-height: 16px;
          font-size: 11px;
        }
        .large-commentary-box {
          min-height: 120px;
          border: 1px solid #71717a;
          padding: 6px;
          background: #fafafa;
        }
        @media print {
          @page {
            size: letter;
            margin: 0.5in;
          }
          body * {
            visibility: hidden !important;
          }
          .alft-dummy-preview,
          .alft-dummy-preview * {
            visibility: visible !important;
          }
          .alft-dummy-preview {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
          }
          body {
            background: #fff !important;
          }
          .alft-dummy-preview {
            margin: 0 !important;
            padding: 0 !important;
          }
          .alft-page {
            min-height: auto !important;
            box-shadow: none !important;
            padding: 0.25in 0.2in 0.15in !important;
            border-color: #a1a1aa !important;
            page-break-after: always;
            break-after: page;
          }
          .alft-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}
