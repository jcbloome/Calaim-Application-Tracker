'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  User,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

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

type KaiserMember = {
  id: string;
  memberName: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  birthDate?: string;
  kaiserStatus?: string;
  alftAssigned?: string;
  ispCurrentLocation?: string;
  ispContactPhone?: string;
  ispContactEmail?: string;
  ispContactConfirmDate?: string;
  // from alft_assignments Firestore doc
  assignedSwEmail?: string;
  assignedSwName?: string;
  assignmentStatus?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

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
const TOTAL_PAGES = PAGE_LAYOUT.length;

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

const MOVED_TEXT_FIELD_IDS = new Set(MOVED_TEXT_FIELDS.map((i) => i.questionId));
const HIDE_FROM_PDF_QUESTION_IDS = new Set([
  'p14_additional_details', 'p14_print_name', 'p14_date',
  'p14_license_number', 'p14_role', 'p14_signature_note',
]);

const SECTION_DIVIDERS: Record<number, Array<{ beforeQuestionId: string; label: string }>> = {
  1: [
    { beforeQuestionId: 'p1_member_name', label: 'Header Information' },
    { beforeQuestionId: 'p1_first_name', label: 'Demographic' },
  ],
  4: [{ beforeQuestionId: 'p4_adl_bathing', label: 'Activities of Daily Living' }],
  5: [{ beforeQuestionId: 'p5_iadl_heavy_chores', label: 'Instrumental Activities of Daily Living' }],
  6: [],
  13: [{ beforeQuestionId: 'p13_commentary_section', label: 'Commentary Section' }],
};

const QUESTION_BY_ID: Record<string, Question> = SOURCE.reduce<Record<string, Question>>((acc, page) => {
  page.questions.forEach((q) => { acc[q.id] = q; });
  return acc;
}, {});

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayLocalKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function buildDefaultAnswers(): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  SOURCE.forEach((page) => {
    page.questions.forEach((q) => {
      if (q.type === 'checkboxGroup') out[q.id] = [];
      else if (q.type === 'radio' || q.type === 'select') out[q.id] = q.options?.[0]?.value || '';
      else out[q.id] = '';
    });
  });
  return out;
}

function preFillFromMember(
  base: Record<string, AnswerValue>,
  member: KaiserMember,
  swName: string,
): Record<string, AnswerValue> {
  const next = { ...base };
  const fullName = member.memberName || `${member.memberFirstName || ''} ${member.memberLastName || ''}`.trim();
  next.p1_member_name = fullName;
  next.p1_assessor_name = swName;
  next.p1_assessment_date = todayLocalKey();
  next.p1_agency = 'ILS Health';
  if (member.memberFirstName) next.p1_first_name = member.memberFirstName;
  if (member.memberLastName) next.p1_last_name = member.memberLastName;
  if (member.memberMrn) next.p1_mrn = member.memberMrn;
  // Date of birth — format as YYYY-MM-DD for the date field
  if (member.birthDate) {
    const dob = String(member.birthDate).trim();
    // Convert M/D/YYYY → YYYY-MM-DD if needed
    const usFmt = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    next.p1_dob = usFmt
      ? `${usFmt[3]}-${usFmt[1].padStart(2, '0')}-${usFmt[2].padStart(2, '0')}`
      : dob;
  }
  if (member.ispContactPhone) next.p1_phone = member.ispContactPhone;
  if (member.ispCurrentLocation) next.p2_facility_name = member.ispCurrentLocation;
  if (member.ispContactConfirmDate) next.p2_assessment_site = member.ispCurrentLocation || '';
  return next;
}

function getRenderedQuestionsForPage(layoutNumber: number, baseQuestions: Question[]): Question[] {
  const pageMoves = MOVED_TEXT_FIELDS.filter((m) => m.targetPage === layoutNumber);
  const nextQuestions = baseQuestions.filter((q) => !MOVED_TEXT_FIELD_IDS.has(q.id));
  if (!pageMoves.length) return nextQuestions;

  const rendered: Question[] = [];
  const movedInserted = new Set<string>();
  nextQuestions.forEach((q) => {
    rendered.push(q);
    pageMoves
      .filter((move) => move.afterQuestionId === q.id)
      .forEach((move) => {
        const src = QUESTION_BY_ID[move.questionId];
        if (!src) return;
        rendered.push({ ...src, label: move.label });
        movedInserted.add(move.questionId);
      });
  });
  pageMoves.forEach((move) => {
    if (movedInserted.has(move.questionId)) return;
    const src = QUESTION_BY_ID[move.questionId];
    if (!src) return;
    rendered.push({ ...src, label: move.label });
  });
  return rendered;
}

const isMovedTextQuestion = (id: string) => MOVED_TEXT_FIELD_IDS.has(id);
const asText = (v: AnswerValue | undefined) => (Array.isArray(v) ? v.join(', ') : String(v || '').trim());
const optionLabel = (q: Question, value: string) => q.options?.find((o) => o.value === value)?.label || value;
const isLongText = (q: Question) => q.type === 'textarea' || q.label.toLowerCase().includes('notes') || q.label.toLowerCase().includes('summary');
const isLargeCommentary = (q: Question) => q.id === 'p13_commentary_section';
const isOptionQ = (q: Question) => q.type === 'radio' || q.type === 'select' || q.type === 'checkboxGroup';

const formatLabel = (label: string) => {
  const qm = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qm) return `${qm[1]}. ${qm[2]}`;
  const nm = label.match(/^(\d+)\.\s*(.+)$/);
  if (nm) return `${nm[1]}. ${nm[2]}`;
  return label;
};

function Dot({ selected }: { selected: boolean }) {
  return (
    <span aria-hidden className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-700 align-middle bg-white">
      <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-zinc-800' : 'bg-transparent'}`} />
    </span>
  );
}

// ── Draft storage (localStorage) ───────────────────────────────────────────────

const DRAFT_KEY = (memberId: string) => `swAlftDraft_v1_${memberId}`;

function saveDraftLocally(memberId: string, answers: Record<string, AnswerValue>) {
  try { localStorage.setItem(DRAFT_KEY(memberId), JSON.stringify({ answers, savedAt: new Date().toISOString() })); } catch { /* ignore */ }
}
function loadDraftLocally(memberId: string): Record<string, AnswerValue> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(memberId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.answers || null;
  } catch { return null; }
}
function clearDraftLocally(memberId: string) {
  try { localStorage.removeItem(DRAFT_KEY(memberId)); } catch { /* ignore */ }
}

function SwAlftInstructionBox() {
  return (
    <Alert className="print:hidden border-blue-200 bg-blue-50">
      <AlertDescription className="space-y-3 text-blue-950">
        <div className="font-semibold">ALFT guidance (SW portal)</div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Complete all ALFT sections before submitting. Do not leave required clinical sections blank.</li>
          <li>For level-of-care scoring, evaluate the member on their worst day, not their best day, because needs fluctuate.</li>
          <li>In the ALFT commentary section, include only pertinent health-care information that supports tier-level decisions.</li>
          <li>Avoid non-clinical commentary (for example, "member seems happy") unless it directly affects care needs or safety.</li>
          <li>Do not escalate minor infractions alone unless they create a clear member safety risk.</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SwKaiserAlftPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, socialWorkerData, isSocialWorker, isLoading: swLoading } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const swName = String(
    (socialWorkerData as any)?.displayName || (user as any)?.displayName || ''
  ).trim() || swEmail.split('@')[0];

  // ── State ─────────────────────────────────────────────────────────────────────

  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<KaiserMember | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(buildDefaultAnswers);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [swSignature, setSwSignature] = useState(''); // typed signature before submit

  // ── Load assigned members from Firestore alft_assignments ─────────────────────

  const loadMembers = useCallback(async () => {
    if (!firestore || !swEmail) return;
    setLoadingMembers(true);
    try {
      // Primary: Firestore assignments for this SW
      const snap = await getDocs(
        query(collection(firestore, 'alft_assignments'), where('assignedSwEmail', '==', swEmail))
      );
      if (!snap.empty) {
        const assigned: KaiserMember[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return {
              id: String(data.memberId || d.id).trim(),
              memberName: String(data.memberName || '').trim(),
              memberFirstName: String(data.memberFirstName || '').trim(),
              memberLastName: String(data.memberLastName || '').trim(),
              memberMrn: String(data.memberMrn || '').trim(),
              birthDate: String(data.birthDate || '').trim(),
              ispCurrentLocation: String(data.ispCurrentLocation || '').trim(),
              ispContactPhone: String(data.ispContactPhone || '').trim(),
              ispContactEmail: String(data.ispContactEmail || '').trim(),
              ispContactConfirmDate: String(data.ispContactConfirmDate || '').trim(),
              kaiserStatus: String(data.kaiserStatus || '').trim(),
              assignedSwEmail: String(data.assignedSwEmail || '').trim(),
              assignedSwName: String(data.assignedSwName || '').trim(),
              assignmentStatus: String(data.status || 'assigned').trim(),
            };
          })
          .filter((m) => Boolean(m.id) && m.assignmentStatus !== 'completed')
          .sort((a, b) => a.memberName.localeCompare(b.memberName));
        setMembers(assigned);
        setLoadingMembers(false);
        return;
      }
      // Fallback: no assignments yet → show empty state with a clear message
      setMembers([]);
    } catch (e: any) {
      toast({ title: 'Could not load assignments', description: e?.message || 'Retry in a moment.', variant: 'destructive' });
    } finally {
      setLoadingMembers(false);
    }
  }, [firestore, swEmail, toast]);

  useEffect(() => {
    if (swLoading || !isSocialWorker) return;
    void loadMembers();
  }, [isSocialWorker, loadMembers, swLoading]);

  // ── Select member ─────────────────────────────────────────────────────────────

  const selectMember = useCallback((m: KaiserMember) => {
    setSelectedMember(m);
    setSubmitted(false);
    setMode('edit');
    const base = buildDefaultAnswers();
    const draft = loadDraftLocally(m.id);
    if (draft) {
      setAnswers(draft);
      setDraftSavedAt(localStorage.getItem(DRAFT_KEY(m.id)) ? JSON.parse(localStorage.getItem(DRAFT_KEY(m.id))!).savedAt : null);
      toast({ title: 'Draft restored', description: 'Your saved draft has been loaded.' });
    } else {
      setAnswers(preFillFromMember(base, m, swName));
      setDraftSavedAt(null);
    }
  }, [swName, toast]);

  // ── Answer helpers ────────────────────────────────────────────────────────────

  const setSingle = (id: string, value: string) => setAnswers((p) => ({ ...p, [id]: value }));
  const toggleMulti = (id: string, value: string) =>
    setAnswers((p) => {
      const cur = Array.isArray(p[id]) ? (p[id] as string[]) : [];
      return { ...p, [id]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });

  // ── Save draft ────────────────────────────────────────────────────────────────

  const saveDraft = useCallback(() => {
    if (!selectedMember) return;
    saveDraftLocally(selectedMember.id, answers);
    const now = new Date().toISOString();
    setDraftSavedAt(now);
    toast({ title: 'Draft saved', description: 'Progress saved locally on this device.' });
  }, [answers, selectedMember, toast]);

  // ── Submit ────────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!selectedMember || !auth?.currentUser) return;
    if (!swSignature.trim()) {
      toast({ title: 'Signature required', description: 'Please type your full name as your signature before submitting.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const firstName = String(selectedMember.memberFirstName || selectedMember.memberName.split(' ')[0] || '').trim();
      const lastName = String(selectedMember.memberLastName || selectedMember.memberName.split(' ').slice(1).join(' ') || '').trim();

      // Embed SW signature into the answers as the assessor fields
      const finalAnswers = {
        ...answers,
        p1_assessor_name: swSignature.trim() || swName,
        p14_print_name: swSignature.trim() || swName,
        p14_date: todayLocalKey(),
      };

      const body = {
        idToken,
        submissionMode: 'digital_form',
        uploadDate: todayLocalKey(),
        uploader: { displayName: swName, email: swEmail },
        member: {
          name: selectedMember.memberName,
          firstName,
          lastName,
          healthPlan: 'Kaiser',
          kaiserMrn: selectedMember.memberMrn || '',
        },
        alftForm: {
          formVersion: 'digital-v1',
          stage: 'digital',
          exactPacketAnswers: finalAnswers,
          transitionSummary: String(finalAnswers.p13_commentary_section || 'Digital ALFT form submitted by social worker.'),
          requestedActions: 'Review digital ALFT form. RN (Leslie) to add comments and sign. Manager (Deydry) to review and save as PDF for Jocelyn.',
          facilityName: String(finalAnswers.p2_facility_name || selectedMember.ispCurrentLocation || ''),
          priorityLevel: 'Routine',
          swSignature: swSignature.trim(),
          swSignedAt: new Date().toISOString(),
        },
        files: [], // digital form — no file upload required
      };

      // Optimistic UX: show success immediately while server save finalizes.
      const memberAtSubmit = selectedMember;
      setSubmitted(true);
      setSubmitPending(true);
      toast({ title: 'Submission received', description: 'Finalizing your ALFT in the background...' });

      const persistSubmission = async () => {
        const res = await fetch('/api/alft/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `Submission failed (HTTP ${res.status})`);
        }

        // Update the Firestore assignment status to 'submitted'
        if (firestore && memberAtSubmit.id) {
          try {
            await updateDoc(doc(firestore, 'alft_assignments', memberAtSubmit.id), {
              status: 'submitted',
              submittedAt: new Date().toISOString(),
              intakeId: data.id || null,
            });
          } catch {
            // best-effort
          }
        }

        clearDraftLocally(memberAtSubmit.id);
        toast({ title: 'ALFT submitted', description: `${memberAtSubmit.memberName}'s assessment has been sent to the admin team for RN review.` });
      };

      await persistSubmission();
    } catch (e: any) {
      setSubmitted(false);
      toast({ title: 'Submission failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setSubmitPending(false);
    }
  }, [answers, auth, firestore, selectedMember, swEmail, swName, swSignature, toast]);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.memberName.toLowerCase().includes(q) ||
        String(m.memberMrn || '').toLowerCase().includes(q) ||
        String(m.ispCurrentLocation || '').toLowerCase().includes(q)
    );
  }, [memberSearch, members]);

  const rnName = asText(answers.p14_print_name);
  const rnDate = asText(answers.p14_date);
  const rnLicense = asText(answers.p14_license_number);
  const mswName = asText(answers.p1_assessor_name);
  const mswDate = asText(answers.p14_date) || todayLocalKey();

  // ── Auth guard ────────────────────────────────────────────────────────────────

  if (swLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────────

  if (submitted && selectedMember) {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-4 py-12 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
        <h1 className="text-2xl font-bold">ALFT Submitted</h1>
        <p className="text-muted-foreground">
          {submitPending
            ? `${selectedMember.memberName}'s assessment is being finalized now.`
            : `${selectedMember.memberName}'s assessment has been sent to the admin team for review.`}
        </p>
        {submitPending && (
          <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving in the background. You can stay on this page while we finish.
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => { setSelectedMember(null); setSubmitted(false); }}>
            Start Another
          </Button>
          <Button variant="outline" onClick={() => { setMode('preview'); setSubmitted(false); }}>
            View Form
          </Button>
        </div>
      </div>
    );
  }

  // ── Member selection ──────────────────────────────────────────────────────────

  if (!selectedMember) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <FileText className="h-6 w-6" />
              Kaiser ALFT Assessment
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a member to begin their ALF Transition Assessment form.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={loadMembers} disabled={loadingMembers}>
            {loadingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <SwAlftInstructionBox />

        <div className="relative">
          <input
            type="text"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search by name, MRN, or location…"
            className="w-full rounded-md border px-3 py-2 pl-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {loadingMembers && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loadingMembers && filteredMembers.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <User className="h-10 w-10" />
            <p className="font-medium">No ALFT assessments assigned to you</p>
            <p className="max-w-xs text-sm">
              Your ALFT manager (John) will assign Kaiser members to you once they are ready for assessment. Check back soon.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {filteredMembers.map((m) => {
            const hasDraft = Boolean(loadDraftLocally(m.id));
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMember(m)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                  {m.memberName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.memberName}</span>
                    {hasDraft && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300">
                        Draft saved
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                    {m.memberMrn && <span>MRN: {m.memberMrn}</span>}
                    {m.ispCurrentLocation && <span>{m.ispCurrentLocation}</span>}
                    {m.kaiserStatus && <span>Status: {m.kaiserStatus}</span>}
                  </div>
                </div>
                <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── ALFT form (edit + preview) ────────────────────────────────────────────────

  return (
    <div className="alft-sw-tool mx-auto max-w-[8.5in] px-2 py-4 print:max-w-none print:px-0 print:py-0">
      <SwAlftInstructionBox />

      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3 print:hidden">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{selectedMember.memberName}</div>
          <div className="text-xs text-zinc-500 flex flex-wrap gap-2 mt-0.5">
            {selectedMember.memberMrn && <span>MRN: {selectedMember.memberMrn}</span>}
            {selectedMember.ispCurrentLocation && <span>• {selectedMember.ispCurrentLocation}</span>}
            {draftSavedAt && (
              <span className="text-amber-600">
                • Draft saved {new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelectedMember(null)}>
            ← Back
          </Button>
          <Button
            variant={mode === 'edit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('edit')}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant={mode === 'preview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('preview')}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={saveDraft}>
            Save Draft
          </Button>
          {mode === 'preview' && (
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Print / PDF
            </Button>
          )}
          {/* SW signature before submit */}
          <div className="flex items-center gap-1.5 border rounded-md px-2 bg-white">
            <span className="text-[10px] text-zinc-500 whitespace-nowrap">Sign:</span>
            <input
              type="text"
              value={swSignature}
              onChange={(e) => setSwSignature(e.target.value)}
              placeholder="Type your full name…"
              className="h-7 w-40 bg-transparent text-xs focus:outline-none border-b border-zinc-400 placeholder:text-zinc-400"
              title="Type your full name as your MSW signature"
            />
          </div>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !swSignature.trim()}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            {submitting ? 'Submitting…' : 'Sign & Submit'}
          </Button>
        </div>
      </div>

      {/* ── Edit mode: collapsible per-page editor ── */}
      {mode === 'edit' && (
        <div className="mb-4 space-y-3 rounded-md border border-zinc-200 bg-white p-3 print:hidden">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">ALFT Form — {selectedMember.memberName}</div>
              <div className="text-xs text-zinc-500">Fill in each section. Use Preview to check formatting before submitting.</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {PAGE_LAYOUT.map((layout) => {
              const source = SOURCE.find((p) => p.id === layout.sourceId);
              const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
              return (
                <details key={`editor-${layout.number}`} className="rounded border border-zinc-200 p-2" open={layout.number === 1}>
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-700 select-none">
                    Page {layout.number}: {layout.title}
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
                    {questions.map((q) => (
                      <div
                        key={`ef-${q.id}`}
                        className={`rounded border border-zinc-100 bg-zinc-50 p-2 ${isLongText(q) ? 'xl:col-span-2' : ''}`}
                      >
                        <div className="mb-1 text-[11px] font-medium leading-tight text-zinc-800">{formatLabel(q.label)}</div>

                        {q.type === 'text' && (
                          <input
                            value={String(answers[q.id] || '')}
                            onChange={(e) => setSingle(q.id, e.target.value)}
                            className="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-xs"
                          />
                        )}

                        {q.type === 'textarea' && (
                          <textarea
                            value={String(answers[q.id] || '')}
                            onChange={(e) => setSingle(q.id, e.target.value)}
                            rows={isLargeCommentary(q) ? 10 : Math.min(Math.max(q.rows || 3, 3), 6)}
                            className={`w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs ${isLargeCommentary(q) ? 'min-h-[180px]' : ''}`}
                          />
                        )}

                        {(q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                            {q.options.map((opt) => (
                              <label key={opt.value} className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                                <input
                                  type="radio"
                                  name={`sw-alft-${q.id}`}
                                  checked={String(answers[q.id] || '') === opt.value}
                                  onChange={() => setSingle(q.id, opt.value)}
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        ) : null}

                        {q.type === 'checkboxGroup' && q.options?.length ? (
                          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
                            {q.options.map((opt) => {
                              const checked = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
                              return (
                                <label key={opt.value} className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                                  <input type="checkbox" checked={checked} onChange={() => toggleMulti(q.id, opt.value)} />
                                  {opt.label}
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
      )}

      {/* ── Preview mode: print-ready PDF layout ── */}
      <div className={`space-y-4 print:space-y-0 ${mode === 'edit' ? 'hidden print:block' : ''}`}>
        {PAGE_LAYOUT.map((layout) => {
          const source = SOURCE.find((p) => p.id === layout.sourceId);
          const questions = (source?.questions || []).filter((q) => q.id.startsWith(layout.prefix));
          const renderedQuestions = getRenderedQuestionsForPage(layout.number, questions).filter(
            (q) => !HIDE_FROM_PDF_QUESTION_IDS.has(q.id)
          );
          return (
            <section key={layout.number} className="alft-page border border-zinc-300 bg-white p-5">
              {/* Page header */}
              <div className="mb-2 border-b border-zinc-400 pb-1.5">
                <div className="flex flex-col items-center gap-1">
                  <img src="/ils-logo.png" alt="Independent Living Systems" className="alft-logo h-[36px] w-auto object-contain" loading="eager" />
                  <div className="text-center text-[12px] font-semibold tracking-wide">ALF TRANSITION ASSESSMENT</div>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-700">
                  <span>{selectedMember.memberName} {selectedMember.memberMrn ? `• MRN: ${selectedMember.memberMrn}` : ''}</span>
                  <span>Page {layout.number} of {TOTAL_PAGES}</span>
                </div>
                <div className="alft-section-title mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  {layout.title}
                </div>
              </div>

              {/* Questions grid */}
              <div className="alft-question-grid grid grid-cols-1 gap-1 text-[10px] md:grid-cols-2">
                {renderedQuestions.map((q) => (
                  <div key={q.id} className="contents">
                    {(SECTION_DIVIDERS[layout.number] || [])
                      .filter((d) => d.beforeQuestionId === q.id)
                      .map((d) => (
                        <div key={`${layout.number}-${d.beforeQuestionId}-divider`} className="alft-subsection-title md:col-span-2 alft-col-span-2">
                          {d.label}
                        </div>
                      ))}
                    <div className={`question-block rounded-sm border border-zinc-300 px-2 py-1 ${isLongText(q) ? 'md:col-span-2 alft-col-span-2' : ''}`}>
                      <div className="font-semibold leading-tight">{formatLabel(q.label)}</div>
                      {isOptionQ(q) && q.options?.length ? (
                        <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => {
                            const selected = q.type === 'checkboxGroup'
                              ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                              : String(answers[q.id] || '') === opt.value;
                            return (
                              <div key={opt.value} className="inline-flex items-center gap-1.5 text-[9.5px]">
                                <Dot selected={selected} />
                                <span className={selected ? 'font-semibold text-zinc-900' : 'text-zinc-600'}>{opt.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={`answer-line mt-1 pb-0.5 text-zinc-900 whitespace-pre-wrap ${isMovedTextQuestion(q.id) ? 'section-notes-answer' : 'border-b border-zinc-500'} ${isLargeCommentary(q) ? 'large-commentary-box' : ''}`}>
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

              {/* Signature section on last page */}
              {layout.number === 13 && (
                <div className="signature-section mt-3 space-y-2 text-[10px]">
                  <div className="alft-subsection-title">Signature Section</div>
                  <div className="signature-block">
                    <div className="signature-title">MSW Signature</div>
                    <div className="signature-grid">
                      <div><div className="signature-label">Name</div><div className="signature-line">{mswName || ' '}</div></div>
                      <div><div className="signature-label">Date</div><div className="signature-line">{mswDate || ' '}</div></div>
                      <div className="md:col-span-2"><div className="signature-label">Signature</div><div className="signature-line">{' '}</div></div>
                    </div>
                  </div>
                  <div className="signature-block">
                    <div className="signature-title">RN Signature</div>
                    <div className="signature-grid">
                      <div><div className="signature-label">Name</div><div className="signature-line">{rnName || ' '}</div></div>
                      <div><div className="signature-label">Date</div><div className="signature-line">{rnDate || ' '}</div></div>
                      <div><div className="signature-label">License Number</div><div className="signature-line">{rnLicense || ' '}</div></div>
                      <div><div className="signature-label">Signature</div><div className="signature-line">{' '}</div></div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-zinc-300 pt-2 text-right text-[10px] text-zinc-600">
                ALF Transition Assessment — Page {layout.number} of {TOTAL_PAGES}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Print/PDF styles ── */}
      <style jsx global>{`
        body { background: #f5f5f5; }
        .alft-sw-tool { color: #18181b; }
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
        .alft-subsection-title {
          background: #0f8bb5; border: 1px solid #0f8bb5; color: #ffffff;
          padding: 2px 6px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .question-block { background: #fff; }
        .answer-line { min-height: 0.7rem; }
        .section-notes-answer { min-height: 54px; border: none; font-size: 11px; line-height: 1.35; padding-top: 4px; }
        .large-commentary-box { min-height: 240px; border: 1px solid #71717a; padding: 6px; background: #fafafa; }
        .signature-block { border: 1px solid #d4d4d8; padding: 8px; background: #fff; }
        .signature-section, .signature-block { break-inside: avoid; page-break-inside: avoid; }
        .signature-title { font-size: 11px; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; }
        .signature-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .signature-label { font-size: 9px; color: #52525b; margin-bottom: 2px; text-transform: uppercase; }
        .signature-line { border-bottom: 1px solid #3f3f46; min-height: 16px; font-size: 11px; }
        @media print {
          @page { size: letter; margin: 0.5in; }
          body * { visibility: hidden !important; }
          .alft-sw-tool, .alft-sw-tool * { visibility: visible !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .alft-sw-tool { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: none !important; }
          body { background: #fff !important; }
          .alft-sw-tool { margin: 0 !important; padding: 0 !important; }
          .alft-page { min-height: auto !important; box-shadow: none !important; padding: 0.25in 0.2in 0.15in !important; border-color: #a1a1aa !important; page-break-after: always; break-after: page; }
          .alft-page:last-child { page-break-after: auto; break-after: auto; }
          .alft-question-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .alft-col-span-2 { grid-column: span 2 / span 2 !important; }
        }
      `}</style>
    </div>
  );
}
