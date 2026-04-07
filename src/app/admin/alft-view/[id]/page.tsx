'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth, useUser } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Printer, ExternalLink, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';

// ─── Types (mirrored from dummy-preview) ──────────────────────────────────────

type QuestionType = 'text' | 'textarea' | 'radio' | 'select' | 'checkboxGroup';
type AnswerValue = string | string[];
type Question = { id: string; label: string; type: QuestionType; options?: Array<{ value: string; label: string }> };
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
];

const MOVED_TEXT_FIELDS: Array<{ questionId: string; targetPage: number; afterQuestionId: string; label: string }> = [
  { questionId: 'p6_notes_summary', targetPage: 3, afterQuestionId: 'p3_cognitive_problems_present', label: 'SECTION B. Notes and Summary:' },
  { questionId: 'p6_section_d_text', targetPage: 5, afterQuestionId: 'p5_dme', label: 'SECTION D. Notes and Summary:' },
  { questionId: 'p6_section_e_text', targetPage: 6, afterQuestionId: 'p6_iadl_transportation', label: 'SECTION E. Notes and Summary:' },
  { questionId: 'p6_section_f_text', targetPage: 8, afterQuestionId: 'p8_visit_duties', label: 'SECTION F. Notes and Summary:' },
  { questionId: 'p10_notes_summary', targetPage: 10, afterQuestionId: 'p10_special_diet_reason', label: 'SECTION I. Notes and Summary:' },
];

const MOVED_TEXT_FIELD_IDS = new Set(MOVED_TEXT_FIELDS.map((m) => m.questionId));
const HIDE_IDS = new Set(['p14_additional_details', 'p14_print_name', 'p14_date', 'p14_license_number', 'p14_role', 'p14_signature_note']);

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
const formatPromptLabel = (label: string) => {
  const m = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (m) return `${m[1]}. ${m[2]}`;
  const n = label.match(/^(\d+)\.\s*(.+)$/);
  if (n) return `${n[1]}. ${n[2]}`;
  return label;
};

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
        <CheckCircle2 className="h-4 w-4 text-green-600" /> Signature & Review Status
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
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Kaiser Manager Review</p>
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
  const intakeId = params?.id ?? '';
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const [intake, setIntake] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          </div>
        </div>
        <div className="flex gap-2">
          {(intake.files ?? []).map((f: any, i: number) => (
            <Button key={i} variant="outline" size="sm" asChild>
              <a href={f.downloadURL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Original file
              </a>
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Signature & review status banner */}
      <div className="mb-4 print:hidden">
        <SignatureSummary intake={intake} />
      </div>

      {/* ALFT form pages — read-only */}
      {PAGE_LAYOUT.map((layout) => {
        const source = SOURCE.find((s) => s.id === layout.sourceId);
        if (!source) return null;
        const baseQuestions = source.questions.filter((q) => q.id.startsWith(layout.prefix) && !HIDE_IDS.has(q.id));
        const rendered = getRenderedQuestionsForPage(layout.number, baseQuestions);
        if (rendered.length === 0) return null;

        return (
          <div
            key={layout.number}
            className="mb-6 print:mb-0 print:break-before-page rounded-lg border border-zinc-200 bg-white shadow-sm print:border-0 print:shadow-none"
          >
            {/* Page header */}
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 print:bg-white">
              <div>
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Page {layout.number}</span>
                <h2 className="text-sm font-semibold text-zinc-800">{layout.title}</h2>
              </div>
              <div className="text-right print:block hidden">
                <p className="text-xs text-zinc-500">ALFT — {intake.memberName}</p>
                <p className="text-xs text-zinc-400">MRN: {intake.medicalRecordNumber || '—'}</p>
              </div>
            </div>

            {/* Questions */}
            <div className="divide-y divide-zinc-100">
              {rendered.map((q) => {
                const val = answers[q.id];
                const isSection = q.label.toUpperCase() === q.label || q.label.startsWith('SECTION');
                if (isSection) {
                  return (
                    <div key={q.id} className="bg-zinc-100 px-4 py-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">{q.label}</p>
                    </div>
                  );
                }
                return (
                  <div key={q.id} className="grid grid-cols-[1fr_2fr] gap-x-4 px-4 py-2.5 print:grid-cols-[1fr_2fr]">
                    <p className="text-xs font-medium text-zinc-500 leading-relaxed pt-0.5 pr-2">{formatPromptLabel(q.label)}</p>
                    <ReadField q={q} value={val} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Signature summary at end of print */}
      <div className="print:block hidden">
        <SignatureSummary intake={intake} />
      </div>

      {/* Print footer */}
      <div className="print:block hidden mt-4 text-center text-xs text-zinc-400">
        ALFT · {intake.memberName} · MRN {intake.medicalRecordNumber || '—'} · Printed {new Date().toLocaleString()}
      </div>
    </div>
  );
}
