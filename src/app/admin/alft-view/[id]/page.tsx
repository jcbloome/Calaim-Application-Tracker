'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Printer, ExternalLink, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';

// ─── Types (mirrored from dummy-preview) ──────────────────────────────────────

type QuestionType = 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';
type AnswerValue = string | string[];
type Question = { id: string; label: string; type: QuestionType; options?: Array<{ value: string; label: string }> };
type SourcePage = { id: string; title: string; questions: Question[] };

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];
const DEFAULT_ALFT_MANAGER_EMAIL = 'jason@carehomefinders.com';
const ALFT_TEMPLATE_PATH =
  'C:/Users/Jason.Jason-PC/AppData/Roaming/Cursor/User/workspaceStorage/2871420c389bbb745bfd4b95a2ccaf63/pdfs/dd55d23e-d594-449d-b000-00a43d8f47d5/ALFT_Agreement (2).pdf';
const FORCE_FILLED_HTML_PRINTABLE = false;

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
];

const MOVED_TEXT_FIELDS: Array<{ questionId: string; targetPage: number; afterQuestionId: string; label: string }> = [
  { questionId: 'p6_notes_summary', targetPage: 3, afterQuestionId: 'p3_cognitive_problems_present', label: 'SECTION B. Notes and Summary:' },
  { questionId: 'p6_section_d_text', targetPage: 5, afterQuestionId: 'p5_dme', label: 'SECTION D. Notes and Summary:' },
  { questionId: 'p6_section_e_text', targetPage: 6, afterQuestionId: 'p6_iadl_transportation', label: 'SECTION E. Notes and Summary:' },
  { questionId: 'p6_section_f_text', targetPage: 8, afterQuestionId: 'p8_visit_duties', label: 'SECTION F. Notes and Summary:' },
  { questionId: 'p10_notes_summary', targetPage: 10, afterQuestionId: 'p10_special_diet_reason', label: 'SECTION I. Notes and Summary:' },
];

const MOVED_TEXT_FIELD_IDS = new Set(MOVED_TEXT_FIELDS.map((m) => m.questionId));
const HIDE_IDS = new Set<string>();

const QUESTION_BY_ID: Record<string, Question> = SOURCE.reduce<Record<string, Question>>((acc, page) => {
  page.questions.forEach((q) => { acc[q.id] = q; });
  return acc;
}, {});

function getRenderedQuestionsForPage(layoutNumber: number, baseQuestions: Question[]): Question[] {
  const pageMoves = MOVED_TEXT_FIELDS.filter((m) => m.targetPage === layoutNumber);
  const filtered = baseQuestions.filter((q) => !MOVED_TEXT_FIELD_IDS.has(q.id));
  if (!pageMoves.length) return filtered;
  const rendered: Question[] = [];
  const inserted = new Set<string>();
  filtered.forEach((q) => {
    rendered.push(q);
    pageMoves.filter((m) => m.afterQuestionId === q.id).forEach((m) => {
      const src = QUESTION_BY_ID[m.questionId];
      if (!src) return;
      rendered.push({ ...src, label: m.label });
      inserted.add(m.questionId);
    });
  });
  pageMoves.forEach((m) => {
    if (inserted.has(m.questionId)) return;
    const src = QUESTION_BY_ID[m.questionId];
    if (src) rendered.push({ ...src, label: m.label });
  });
  return rendered;
}

const asText = (v: AnswerValue | undefined): string => Array.isArray(v) ? v.join(', ') : String(v ?? '').trim();
const optionLabel = (q: Question, value: string) => q.options?.find((o) => o.value === value)?.label || value;
const resolveTemplateUrlFromIntake = (intake: any): string => {
  const fromOfficial = String(intake?.officialPdfTemplateUrl || '').trim();
  if (/^https?:\/\//i.test(fromOfficial)) return fromOfficial;

  const files = Array.isArray(intake?.files) ? intake.files : [];
  for (const f of files) {
    const url = String(f?.downloadURL || '').trim();
    const name = String(f?.fileName || '').trim();
    if (!url) continue;
    if (/\.pdf(\?|$)/i.test(url) || /\.pdf(\?|$)/i.test(name)) return url;
  }

  const revisions = Array.isArray(intake?.alftRevisions) ? intake.alftRevisions : [];
  for (let i = revisions.length - 1; i >= 0; i -= 1) {
    const url = String(revisions[i]?.downloadURL || '').trim();
    const name = String(revisions[i]?.fileName || '').trim();
    if (!url) continue;
    if (/\.pdf(\?|$)/i.test(url) || /\.pdf(\?|$)/i.test(name)) return url;
  }

  return '';
};
const formatPromptLabel = (label: string) => {
  const m = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (m) return `${m[1]}. ${m[2]}`;
  const n = label.match(/^(\d+)\.\s*(.+)$/);
  if (n) return `${n[1]}. ${n[2]}`;
  return label;
};

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

// ─── Read-only field renderer ──────────────────────────────────────────────────

function ReadField({ q, value }: { q: Question; value: AnswerValue | undefined }) {
  const text = asText(value);
  const isEmpty = !text;

  if (q.type === 'radio' || q.type === 'select') {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
        {(q.options ?? []).map((opt) => {
          const selected = text === opt.value;
          return (
            <label key={opt.value} className={`flex items-center gap-1.5 text-sm ${selected ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}>
              <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${selected ? 'border-zinc-800 bg-zinc-800' : 'border-zinc-300 bg-white'}`}>
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              {opt.label}
            </label>
          );
        })}
        {isEmpty && <span className="text-xs text-zinc-400 italic">—</span>}
      </div>
    );
  }

  if (q.type === 'checkboxGroup') {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
        {(q.options ?? []).map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <label key={opt.value} className={`flex items-center gap-1.5 text-sm ${checked ? 'font-medium text-zinc-900' : 'text-zinc-400'}`}>
              <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${checked ? 'border-zinc-800 bg-zinc-800' : 'border-zinc-300 bg-white'}`}>
                {checked && <span className="text-white text-[8px] leading-none">✓</span>}
              </span>
              {opt.label}
            </label>
          );
        })}
        {isEmpty && <span className="text-xs text-zinc-400 italic">—</span>}
      </div>
    );
  }

  // text / textarea
  if (q.type === 'textarea' || q.label.toLowerCase().includes('notes') || q.label.toLowerCase().includes('summary')) {
    return (
      <div className="min-h-[2.5rem] whitespace-pre-wrap rounded border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-sm text-zinc-800">
        {isEmpty ? <span className="italic text-zinc-400">—</span> : text}
      </div>
    );
  }

  return (
    <p className={`text-sm ${isEmpty ? 'italic text-zinc-400' : 'font-medium text-zinc-900'}`}>
      {isEmpty ? '—' : text}
    </p>
  );
}

// ─── Signature summary block ───────────────────────────────────────────────────

function SignatureSummary({ intake }: { intake: any }) {
  const sig = intake?.alftSignature;
  const mr = intake?.alftManagerReview;
  if (!sig && !mr) return null;

  const fmtTs = (ms: number | null) => ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-3 print:break-before-page">
      <h3 className="font-semibold text-zinc-800 text-sm flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Signature & John Approval Status
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">MSW Signed</p>
          <p className="font-medium">{sig?.mswSignedAt ? fmtTs(sig.mswSignedAt) : <span className="text-zinc-400">Pending</span>}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">RN Signed</p>
          <p className="font-medium">{sig?.rnSignedAt ? fmtTs(sig.rnSignedAt) : <span className="text-zinc-400">Pending</span>}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">John Manager Review</p>
          <p className="font-medium">
            {mr?.status === 'approved'
              ? <span className="text-green-700">Approved — {fmtTs(mr.reviewedAt)}</span>
              : mr?.status === 'rejected_returned_to_sw'
                ? <span className="text-red-600">Returned to SW</span>
                : <span className="text-zinc-400">Pending</span>}
          </p>
        </div>
        {mr?.status === 'rejected_returned_to_sw' && mr?.rejectionReason && (
          <div className="sm:col-span-2 rounded border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
            <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
            <strong>Revision reason:</strong> {mr.rejectionReason}
          </div>
        )}
        {(sig?.packetPdfStoragePath || sig?.signaturePagePdfStoragePath) && (
          <div className="sm:col-span-2 flex gap-2 flex-wrap pt-1">
            {sig.packetPdfStoragePath && (
              <Badge variant="outline" className="text-green-700 border-green-300">
                <FileText className="h-3 w-3 mr-1" /> Signed packet PDF ready
              </Badge>
            )}
            {sig.signaturePagePdfStoragePath && (
              <Badge variant="outline" className="text-blue-700 border-blue-300">
                <FileText className="h-3 w-3 mr-1" /> Signature page PDF ready
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AlftViewPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const intakeId = params?.id ?? '';
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [templatePdfUrl, setTemplatePdfUrl] = useState('');
  const [templatePdfLoading, setTemplatePdfLoading] = useState(false);
  const [templatePdfError, setTemplatePdfError] = useState('');
  const [templatePdfMode, setTemplatePdfMode] = useState('');
  const [fallbackPdfLoading, setFallbackPdfLoading] = useState(false);
  const [fallbackPdfUrl, setFallbackPdfUrl] = useState('');
  const fallbackPrintableRef = useRef<HTMLDivElement>(null);
  const isPdfView = String(searchParams?.get('view') || '').toLowerCase() === 'pdf';
  const managerEmail = useMemo(() => {
    return (
      String(intake?.workflowRouting?.finalReviewOwnerEmail || '').trim() ||
      String(intake?.assignedManager?.email || '').trim() ||
      DEFAULT_ALFT_MANAGER_EMAIL
    );
  }, [intake]);

  useEffect(() => {
    if (isUserLoading || !user || !intakeId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const idToken = await auth.currentUser!.getIdToken();
        const res = await fetch('/api/alft/view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, intakeId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) throw new Error(json?.error || `Load failed (HTTP ${res.status})`);
        if (!cancelled) setIntake(json.intake);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load ALFT form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isUserLoading, user?.uid, intakeId]);

  // Build answers from exactPacketAnswers
  const answers = useMemo<Record<string, AnswerValue>>(() => {
    const raw = intake?.alftForm?.exactPacketAnswers ?? {};
    const out: Record<string, AnswerValue> = {};
    Object.entries(raw).forEach(([k, v]) => {
      out[k] = Array.isArray(v) ? v.map(String) : String(v ?? '');
    });
    return out;
  }, [intake]);

  const generateTemplatePreview = useCallback(async () => {
    if (!intake) return;
    setTemplatePdfLoading(true);
    setTemplatePdfError('');
    try {
      const res = await fetch('/api/alft/template-fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templatePath: ALFT_TEMPLATE_PATH,
          templateUrl: resolveTemplateUrlFromIntake(intake),
          answers,
          preferLocalTemplate: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        throw new Error(String(err?.error || `Template preview failed (HTTP ${res.status})`));
      }
      setTemplatePdfMode(String(res.headers.get('x-alft-template-fill-mode') || '').trim());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setTemplatePdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (e: any) {
      setTemplatePdfError(String(e?.message || 'Could not generate template preview.'));
      setTemplatePdfMode('');
      setTemplatePdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } finally {
      setTemplatePdfLoading(false);
    }
  }, [answers, intake]);

  useEffect(() => {
    void generateTemplatePreview();
  }, [generateTemplatePreview]);

  useEffect(() => {
    return () => {
      setTemplatePdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setFallbackPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  const useHtmlPrintableFallback =
    FORCE_FILLED_HTML_PRINTABLE ||
    !templatePdfUrl ||
    templatePdfMode === 'passthrough-no-form' ||
    templatePdfMode === 'passthrough-save-error';
  const openPrintablePdf = useCallback(() => {
    window.location.assign(`/admin/alft-view/${encodeURIComponent(String(intakeId || ''))}?view=pdf`);
  }, [intakeId]);

  const buildFallbackPages = useCallback(() => {
    return PAGE_LAYOUT.map((layout) => {
      const source = SOURCE.find((s) => s.id === layout.sourceId);
      if (!source) return null;
      const questions = source.questions.filter((q) => q.id.startsWith(layout.prefix));
      const renderedQuestions = getRenderedQuestionsForPage(layout.number, questions).filter((q) => !HIDE_IDS.has(q.id));

      return (
        <section key={layout.number} className="alft-page border border-zinc-300 bg-white p-5">
          <div className="mb-2 border-b border-zinc-400 pb-1.5">
            <div className="flex flex-col items-center gap-1">
              <img
                src="/ils-logo.png"
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
              <span>{intake.memberName} {intake.medicalRecordNumber ? `• MRN: ${intake.medicalRecordNumber}` : ''}</span>
              <span>Page {layout.number} of {PAGE_LAYOUT.length}</span>
            </div>
            <div className="alft-section-title mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
              {layout.title}
            </div>
          </div>

          <div className="alft-question-grid grid grid-cols-1 gap-1 text-[10px] md:grid-cols-2">
            {renderedQuestions.map((q) => (
              <div key={q.id} className="contents">
                <div className={`question-block rounded-sm border border-zinc-300 px-2 py-1 ${q.type === 'textarea' || q.label.toLowerCase().includes('notes') || q.label.toLowerCase().includes('summary') ? 'md:col-span-2 alft-col-span-2' : ''}`}>
                  <div className="font-semibold leading-tight">{formatPromptLabel(q.label)}</div>
                  {q.options?.length && (q.type === 'radio' || q.type === 'select' || q.type === 'checkboxGroup') ? (
                    <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                      {q.options.map((opt) => {
                        const selected =
                          q.type === 'checkboxGroup'
                            ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                            : String(answers[q.id] || '') === opt.value;
                        return (
                          <div key={`view-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                            <Dot selected={selected} />
                            <span className={`${selected ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}>{opt.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={`answer-line mt-1 pb-0.5 text-zinc-900 whitespace-pre-wrap ${q.type === 'textarea' ? 'large-commentary-box' : 'border-b border-zinc-500'}`}>
                      {asText(answers[q.id]) || ' '}
                    </div>
                  )}
                  {q.type === 'select' && q.options?.length ? (
                    <div className="mt-0.5 text-[9px] text-zinc-600">Selected: {optionLabel(q, String(answers[q.id] || ''))}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    });
  }, [answers, intake]);

  useEffect(() => {
    if (!isPdfView || !intake || !useHtmlPrintableFallback) return;
    if (!fallbackPrintableRef.current) return;
    let cancelled = false;
    const run = async () => {
      setFallbackPdfLoading(true);
      setTemplatePdfError('');
      try {
        const sections = Array.from(
          fallbackPrintableRef.current!.querySelectorAll('.alft-page')
        ) as HTMLElement[];
        if (!sections.length) throw new Error('Printable ALFT pages were not found.');
        const bytes = await generatePdfFromHtmlSections(sections, {
          stampPageNumbers: true,
          headerText: 'ALFT Transition Assessment',
          options: {
            marginIn: 0.2,
            scale: 3,
            format: 'letter',
            orientation: 'portrait',
            treatEachSectionAsSinglePage: true,
            imageFormat: 'png',
            fitSafetyScale: 0.999,
          },
        });
        if (cancelled) return;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setFallbackPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: any) {
        if (cancelled) return;
        setTemplatePdfError(String(e?.message || 'Could not generate printable PDF.'));
        setFallbackPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return '';
        });
      } finally {
        if (!cancelled) setFallbackPdfLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isPdfView, intake, useHtmlPrintableFallback, answers]);

  if (isUserLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader><CardTitle>Sign in required</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Please sign in to view this ALFT form.</p></CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card>
          <CardHeader><CardTitle className="text-red-700">Cannot view form</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-red-700">{error}</p></CardContent>
        </Card>
      </div>
    );
  }

  if (!intake) return null;

  if (isPdfView) {
    const pdfPreviewUrl = useHtmlPrintableFallback ? fallbackPdfUrl : templatePdfUrl;
    return (
      <div className="mx-auto w-full max-w-6xl space-y-3 p-4">
        <div className="mb-2 rounded-md border bg-white p-3 print:hidden">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/alft-view/${encodeURIComponent(String(intakeId || ''))}`}>Back to printable</Link>
            </Button>
            <Button variant="outline" asChild disabled={!pdfPreviewUrl || fallbackPdfLoading || templatePdfLoading}>
              <a href={pdfPreviewUrl || '#'} download={`${String(intake?.memberName || 'ALFT').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_')}_ALFT_Printable.pdf`}>
                <Printer className="mr-2 h-4 w-4" />
                Download PDF
              </a>
            </Button>
          </div>
        </div>

        {useHtmlPrintableFallback ? (
          <div className="fixed left-[-100000px] top-0" style={{ width: '1120px' }}>
            <div ref={fallbackPrintableRef}>{buildFallbackPages()}</div>
          </div>
        ) : null}

        {templatePdfError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{templatePdfError}</div> : null}

        {pdfPreviewUrl ? (
          <div className="rounded-md border bg-white">
            <iframe title="ALFT printable PDF preview" src={pdfPreviewUrl} className="h-[85vh] w-full" />
          </div>
        ) : (
          <div className="rounded-md border bg-white p-6 text-sm text-muted-foreground">
            {fallbackPdfLoading || templatePdfLoading ? 'Generating PDF preview…' : 'PDF preview not available yet.'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="alft-view mx-auto max-w-[8.5in] px-3 py-4 print:max-w-none print:px-0 print:py-0">

      {/* Toolbar — hidden when printing */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3 shadow-sm print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-1">
            <Link href="/admin/alft-tracker">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to tracker
            </Link>
          </Button>
          <div>
            <p className="font-semibold text-sm">{intake.memberName || 'ALFT Form'}</p>
            <p className="text-xs text-muted-foreground">MRN: {intake.medicalRecordNumber || '—'} · SW: {intake.uploaderName || '—'} · RN: {intake.alftRnName || '—'}</p>
            <p className="text-xs text-muted-foreground">ALFT manager: {managerEmail}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/alft-tracker?focus=${encodeURIComponent(String(intake.id || ''))}`}>
              <FileText className="h-3.5 w-3.5 mr-1" /> Edit ALFT Form
            </Link>
          </Button>
          {(intake.files ?? []).map((f: any, i: number) => (
            <Button key={i} variant="outline" size="sm" asChild>
              <a href={f.downloadURL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Original file
              </a>
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={templatePdfLoading || fallbackPdfLoading}
            onClick={() => void openPrintablePdf()}
          >
            {fallbackPdfLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Printer className="h-4 w-4 mr-1.5" />}
            Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Signature & review status banner */}
      <div className="mb-4 print:hidden">
        <SignatureSummary intake={intake} />
      </div>

      <div className="mb-4 rounded-md border bg-white p-3 print:hidden">
        <div className="mb-2 flex items-center gap-2 text-xs text-zinc-600">
          <span>ALFT printable preview (filled from saved ALFT form answers).</span>
          {!FORCE_FILLED_HTML_PRINTABLE && templatePdfMode ? <Badge variant="outline">Mode: {templatePdfMode}</Badge> : null}
        </div>
        {templatePdfError ? (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{templatePdfError}</div>
        ) : null}
        {!templatePdfLoading && !templatePdfError && useHtmlPrintableFallback ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Showing the filled printable form below.
          </div>
        ) : null}
        {templatePdfLoading ? (
          <div className="flex h-[70vh] items-center justify-center text-sm text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating template preview...
          </div>
        ) : null}
        {!templatePdfLoading && !useHtmlPrintableFallback && templatePdfUrl ? (
          <iframe
            src={templatePdfUrl}
            title="ALFT template preview"
            className="h-[75vh] w-full rounded border"
          />
        ) : null}
      </div>

      {/* ALFT form pages — exact packet format (fallback when template unavailable) */}
      {useHtmlPrintableFallback ? <div ref={fallbackPrintableRef}>{buildFallbackPages()}</div> : null}

      {/* Signature summary at end of print */}
      <div className="print:block hidden">
        <SignatureSummary intake={intake} />
      </div>

      {/* Print footer */}
      {useHtmlPrintableFallback ? (
        <div className="print:block hidden mt-4 text-center text-xs text-zinc-400">
          ALFT · {intake.memberName} · MRN {intake.medicalRecordNumber || '—'} · Printed {new Date().toLocaleString()}
        </div>
      ) : null}

      <style jsx global>{`
        .alft-view { color: #18181b; }
        .alft-page {
          min-height: 10.45in;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          font-family: Arial, Helvetica, sans-serif;
          letter-spacing: 0.01em;
        }
        .alft-logo { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .alft-section-title {
          background: #0f8bb5; border: 1px solid #0f8bb5; color: #ffffff;
          padding: 2px 6px;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .question-block { background: #fff; }
        .answer-line { min-height: 0.7rem; }
        .large-commentary-box {
          min-height: 420px;
          border: 1px solid #71717a;
          padding: 6px;
          background: #fafafa;
        }
      `}</style>
    </div>
  );
}
