'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';
import { PdfPreviewLayout } from '@/components/pdf/PdfPreviewLayout';

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
const AGENCY_NAME = 'Connections Care Home Consultants';
const ALFT_TEMPLATE_PATH =
  'C:/Users/Jason.Jason-PC/AppData/Roaming/Cursor/User/workspaceStorage/2871420c389bbb745bfd4b95a2ccaf63/pdfs/dd55d23e-d594-449d-b000-00a43d8f47d5/ALFT_Agreement (2).pdf';

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
  5: [{ beforeQuestionId: 'p5_iadl_heavy_chores', label: 'Instrumental Activities of Daily Living' }],
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

const formatPromptLabel = (label: string) => {
  const qMatch = label.match(/^Q(\d+)\s*:?\s*(.+)$/i);
  if (qMatch) return `${qMatch[1]}. ${qMatch[2]}`;
  const nMatch = label.match(/^(\d+)\.\s*(.+)$/);
  if (nMatch) return `${nMatch[1]}. ${nMatch[2]}`;
  return label;
};

function toDefaultValue(q: Question): AnswerValue {
  if (q.type === 'checkboxGroup') return [];
  return '';
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

type PathwayMember = {
  id: string;
  memberName: string;
  memberFirstName: string;
  memberLastName: string;
  memberMrn: string;
  birthDate: string;
  memberSex: string;
  memberPrimaryLanguage: string;
  memberPhone: string;
  ispCurrentAddressStreet: string;
  ispCurrentAddressCity: string;
  ispCurrentAddressState: string;
  ispCurrentAddressZip: string;
  homeAddressStreet: string;
  homeAddressCity: string;
  homeAddressState: string;
  homeAddressZip: string;
  ispFacilityName: string;
  currentLocationType: string;
  assessmentSite: string;
  pathway: string;
  source: string;
};

const hasCsSummaryOnApplication = (app: Record<string, any>): boolean => {
  if (Boolean(app?.csSummaryComplete)) return true;
  const forms = Array.isArray(app?.forms) ? app.forms : [];
  return forms.some((form: any) => {
    const name = String(form?.name || form?.type || '').toLowerCase();
    return name.includes('cs summary') || name.includes('cs member summary');
  });
};

const pickAppValue = (app: Record<string, any>, keys: string[]) => {
  const sources = [app, app?.formData || {}, app?.csSummaryData || {}, app?.csSummary || {}];
  for (const source of sources) {
    for (const key of keys) {
      const value = String(source?.[key] ?? '').trim();
      if (value) return value;
    }
  }
  return '';
};

const todayLocalKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toYmdOrRaw = (value: string | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const usFmt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usFmt) return `${usFmt[3]}-${usFmt[1].padStart(2, '0')}-${usFmt[2].padStart(2, '0')}`;
  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2].padStart(2, '0')}-${isoLike[3].padStart(2, '0')}`;
  return raw;
};

const splitMemberName = (member: PathwayMember) => {
  const first = String(member.memberFirstName || '').trim();
  const last = String(member.memberLastName || '').trim();
  if (first || last) return { first, last };
  const full = String(member.memberName || '').trim();
  if (full.includes(',')) {
    const [ln, fn] = full.split(',', 2).map((s) => s.trim());
    return { first: fn || '', last: ln || '' };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
};

function applyMemberPrefill(base: Record<string, AnswerValue>, member: PathwayMember): Record<string, AnswerValue> {
  const next = { ...base };
  const parsedName = splitMemberName(member);
  const fullName =
    member.memberName ||
    [parsedName.last, parsedName.first].filter(Boolean).join(', ') ||
    `${parsedName.first} ${parsedName.last}`.trim();
  next.p1_member_name = fullName;
  next.p1_agency = AGENCY_NAME;
  next.p1_assessment_date = todayLocalKey();
  if (parsedName.first) next.p1_first_name = parsedName.first;
  if (parsedName.last) next.p1_last_name = parsedName.last;
  if (member.memberMrn) {
    next.p1_mrn = member.memberMrn;
    next.p1_plan_id = member.memberMrn;
  }
  if (member.birthDate) next.p1_dob = toYmdOrRaw(member.birthDate);
  if (member.memberPhone) next.p1_phone = member.memberPhone;
  if (member.memberSex) next.p1_sex = member.memberSex;
  if (member.memberPrimaryLanguage) next.p1_primary_language = member.memberPrimaryLanguage;
  if (member.ispFacilityName) next.p2_facility_name = member.ispFacilityName;
  if (member.currentLocationType) next.p2_current_type = member.currentLocationType;
  if (member.assessmentSite) next.p2_assessment_site = member.assessmentSite;
  if (member.ispCurrentAddressStreet) next.p2_current_street = member.ispCurrentAddressStreet;
  if (member.ispCurrentAddressCity) next.p2_current_city = member.ispCurrentAddressCity;
  next.p2_current_state = String(member.ispCurrentAddressState || '').trim() || 'CA';
  if (member.ispCurrentAddressZip) next.p2_current_zip = member.ispCurrentAddressZip;
  if (member.homeAddressStreet) next.p2_home_street = member.homeAddressStreet;
  if (member.homeAddressCity) next.p2_home_city = member.homeAddressCity;
  next.p2_home_state = String(member.homeAddressState || '').trim() || 'CA';
  if (member.homeAddressZip) next.p2_home_zip = member.homeAddressZip;
  return next;
}

export default function AdminAlftDummyPreviewPage() {
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const isPdfView = String(searchParams.get('view') || '').toLowerCase() === 'pdf';
  const logoSrc = '/ils-logo.png';
  const captureRef = useRef<HTMLDivElement>(null);

  const initialAnswers = useMemo<Record<string, AnswerValue>>(() => {
    const next: Record<string, AnswerValue> = {};
    SOURCE.forEach((page) => {
      page.questions.forEach((q) => {
        next[q.id] = toDefaultValue(q);
      });
    });
    next.p1_agency = AGENCY_NAME;
    return next;
  }, []);

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers);
  const [members, setMembers] = useState<PathwayMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [pdfTemplateMode, setPdfTemplateMode] = useState('');

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

  const loadApplicationMembers = useCallback(async () => {
    if (!firestore) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const snap = await getDocs(query(collection(firestore, 'applications'), limit(5000)));
      const mapped: PathwayMember[] = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, any>) }))
        .filter((app) => hasCsSummaryOnApplication(app))
        .map((app: any) => {
          const first = pickAppValue(app, ['memberFirstName', 'member_first_name', 'firstName']);
          const last = pickAppValue(app, ['memberLastName', 'member_last_name', 'lastName']);
          const combined = [first, last].filter(Boolean).join(' ').trim();
          const fallbackName = pickAppValue(app, ['memberName', 'fullName', 'applicantName']);
          return {
            id: String(app?.id || '').trim(),
            memberName: combined || fallbackName || 'Member',
            memberFirstName: first,
            memberLastName: last,
            memberMrn: pickAppValue(app, ['memberMrn', 'MCP_CIN', 'member_mrn', 'mrn']),
            birthDate: pickAppValue(app, ['memberDob', 'birthDate', 'dob']),
            memberSex: pickAppValue(app, ['memberSex', 'sex', 'gender']),
            memberPrimaryLanguage: pickAppValue(app, ['memberPrimaryLanguage', 'memberLanguage', 'primaryLanguage']),
            memberPhone: pickAppValue(app, ['contactPhone', 'memberPhone', 'bestContactPhone', 'phone']),
            ispCurrentAddressStreet: pickAppValue(app, ['currentAddress', 'currentLocationAddress', 'ispCurrentAddressStreet']),
            ispCurrentAddressCity: pickAppValue(app, ['currentCity', 'currentLocationCity', 'ispCurrentAddressCity']),
            ispCurrentAddressState: pickAppValue(app, ['currentState', 'currentLocationState', 'ispCurrentAddressState']),
            ispCurrentAddressZip: pickAppValue(app, ['currentZip', 'currentLocationZip', 'ispCurrentAddressZip']),
            homeAddressStreet: pickAppValue(app, ['customaryAddress', 'homeAddressStreet']),
            homeAddressCity: pickAppValue(app, ['customaryCity', 'homeAddressCity']),
            homeAddressState: pickAppValue(app, ['customaryState', 'homeAddressState']),
            homeAddressZip: pickAppValue(app, ['customaryZip', 'homeAddressZip']),
            ispFacilityName: pickAppValue(app, ['currentLocationName', 'ispFacilityName', 'rcfeName', 'facilityName']),
            currentLocationType: pickAppValue(app, ['currentLocation', 'currentLocationType']),
            assessmentSite: pickAppValue(app, ['assessmentSite']),
            pathway: pickAppValue(app, ['pathway']),
            source: 'applications',
          };
        })
        .filter((m) => Boolean(m.id) && Boolean(m.memberName))
        .sort((a, b) => a.memberName.localeCompare(b.memberName));
      setMembers(mapped);
    } catch {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [firestore]);

  useEffect(() => {
    if (isPdfView) return;
    void loadApplicationMembers();
  }, [isPdfView, loadApplicationMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      return (
        m.memberName.toLowerCase().includes(q) ||
        m.memberMrn.toLowerCase().includes(q) ||
        m.pathway.toLowerCase().includes(q)
      );
    });
  }, [memberSearch, members]);

  const headerMemberName = String(answers.p1_member_name || '').trim();
  const headerMemberMrn = String(answers.p1_mrn || '').trim();

  const pullSelectedMember = () => {
    const selected = members.find((m) => m.id === selectedMemberId);
    if (!selected) return;
    setAnswers(applyMemberPrefill(initialAnswers, selected));
  };

  const generatePreviewPdf = useCallback(async () => {
    setPdfLoading(true);
    setPdfError('');
    try {
      const templateRes = await fetch('/api/alft/template-fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templatePath: ALFT_TEMPLATE_PATH, answers }),
      });
      if (templateRes.ok) {
        setPdfTemplateMode(String(templateRes.headers.get('x-alft-template-fill-mode') || '').trim());
        const blob = await templateRes.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        return;
      }
      const err = await templateRes.json().catch(() => ({} as any));
      setPdfError(String(err?.error || 'Template-based PDF preview failed.'));
      setPdfTemplateMode('');
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } catch (e: any) {
      setPdfError(String(e?.message || 'Could not generate PDF preview.'));
      setPdfTemplateMode('');
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } finally {
      setPdfLoading(false);
    }
  }, [answers]);

  useEffect(() => {
    if (!isPdfView) return;
    void generatePreviewPdf();
  }, [answers, generatePreviewPdf, isPdfView]);

  useEffect(() => {
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  const viewerHref = '/admin/alft-tracker/dummy-preview?view=pdf';

  const packetContent = (
    <div className="alft-dummy-preview mx-auto max-w-[8.5in] px-2 py-4 print:max-w-none print:px-0 print:py-0">
      {!isPdfView ? (
        <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
          <Button variant="outline" asChild>
            <Link href={viewerHref}>View PDF layout</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={viewerHref}>Print / Save PDF</Link>
          </Button>
        </div>
      ) : null}

      {!isPdfView ? (
        <div className="mb-4 rounded-md border border-zinc-300 bg-white p-3 print:hidden">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search application member"
              className="md:col-span-3"
            />
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="h-10 rounded border border-zinc-300 bg-white px-2 text-sm md:col-span-3"
            >
              <option value="">Select member to prefill</option>
              {filteredMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.memberName}{m.memberMrn ? ` • MRN ${m.memberMrn}` : ''}
                </option>
              ))}
            </select>
            <Button onClick={pullSelectedMember} variant="outline" disabled={!selectedMemberId} className="w-full md:col-span-2">
              Pull from application
            </Button>
            <div className="flex flex-wrap gap-2 md:col-span-4">
              <Button onClick={() => void loadApplicationMembers()} variant="outline" disabled={loadingMembers} className="w-full sm:w-auto">
                {loadingMembers ? 'Loading...' : 'Refresh members'}
              </Button>
              <Button onClick={() => setAnswers(initialAnswers)} variant="outline" className="w-full sm:w-auto">
                Reset demo values
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="printable-package-section space-y-4 print:space-y-0">
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
                  <span>{headerMemberName || 'Member'}{headerMemberMrn ? ` • MRN: ${headerMemberMrn}` : ''}</span>
                  <span>Page {layout.number} of {TOTAL_PAGES}</span>
                </div>
                <div className="alft-section-title mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  {layout.title}
                </div>
              </div>
              <div className="alft-question-grid grid grid-cols-1 gap-1 text-[10px] md:grid-cols-2">
                {renderedQuestions.map((q) => (
                  <div key={q.id} className="contents">
                    {(SECTION_DIVIDERS[layout.number] || [])
                      .filter((divider) => divider.beforeQuestionId === q.id)
                      .map((divider) => (
                        <div
                          key={`${layout.number}-${divider.beforeQuestionId}-divider`}
                          className="alft-subsection-title md:col-span-2 alft-col-span-2"
                        >
                          {divider.label}
                        </div>
                      ))}
                  <div
                    className={`question-block rounded-sm border border-zinc-300 px-2 py-1 ${
                      isLongTextQuestion(q) ? 'md:col-span-2 alft-col-span-2' : ''
                    }`}
                  >
                    <div className="font-semibold leading-tight">
                      {formatPromptLabel(q.label)}
                    </div>
                    {!isPdfView && q.type === 'text' ? (
                      <input
                        value={String(answers[q.id] || '')}
                        onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                        className="mt-1 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                      />
                    ) : null}
                    {!isPdfView && q.type === 'textarea' ? (
                      <textarea
                        value={String(answers[q.id] || '')}
                        onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                        rows={isLargeCommentaryQuestion(q) ? 12 : Math.min(Math.max(q.rows || 3, 3), 6)}
                        className={`mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] ${isLargeCommentaryQuestion(q) ? 'min-h-[220px]' : ''}`}
                      />
                    ) : null}
                    {!isPdfView && (q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                        {q.options.map((opt) => (
                          <label key={`edit-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                            <input
                              type="radio"
                              name={`preview-edit-${q.id}`}
                              checked={String(answers[q.id] || '') === opt.value}
                              onChange={() => setSingleAnswer(q.id, opt.value)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {!isPdfView && q.type === 'checkboxGroup' && q.options?.length ? (
                      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                        {q.options.map((opt) => {
                          const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
                          return (
                            <label key={`edit-check-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                              <input type="checkbox" checked={selected} onChange={() => toggleMultiAnswer(q.id, opt.value)} />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                    {isPdfView && isOptionQuestion(q) && q.options?.length ? (
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                        {q.options.map((opt) => {
                          const selected =
                            q.type === 'checkboxGroup'
                              ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                              : String(answers[q.id] || '') === opt.value;
                          return (
                            <div
                              key={`output-opt-${q.id}-${opt.value}`}
                              className="inline-flex min-h-[14px] items-center gap-1.5 text-[9.5px] leading-tight"
                            >
                              <Dot selected={selected} />
                              <span className={`${selected ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}>{opt.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : isPdfView ? (
                      <div
                        className={`answer-line mt-1 pb-0.5 text-zinc-900 whitespace-pre-wrap ${
                          isMovedTextQuestion(q.id) ? 'section-notes-answer' : 'border-b border-zinc-500'
                        } ${
                          isLargeCommentaryQuestion(q) ? 'large-commentary-box' : ''
                        }`}
                      >
                        {String(answers[q.id] || '').trim() || ' '}
                      </div>
                    ) : null}
                  </div>
                  </div>
                ))}
              </div>
              {layout.number === 13 ? (
                <div className="signature-section mt-3 space-y-2 text-[10px]">
                  <div className="alft-subsection-title">Signature Section</div>
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
              ) : null}

              <div className="mt-4 border-t border-zinc-300 pt-2 text-right text-[10px] text-zinc-600">
                ALF Transition Assessment - Page {layout.number} of {TOTAL_PAGES}
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
        .signature-section,
        .signature-block {
          break-inside: avoid;
          page-break-inside: avoid;
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
          min-height: 240px;
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
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
          .alft-question-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .alft-col-span-2 {
            grid-column: span 2 / span 2 !important;
          }
        }
      `}</style>
    </div>
  );

  if (!isPdfView) {
    return packetContent;
  }

  return (
    <PdfPreviewLayout
      isPdfView={isPdfView}
      viewPdfHref={viewerHref}
      backToEditorHref="/admin/alft-tracker/dummy-preview"
      backButtonLabel="Back to editor"
      showBackButtonInHtmlView={false}
      printHref={viewerHref}
      captureRef={captureRef}
      captureContent={packetContent}
      htmlContent={packetContent}
      pdfUrl={pdfUrl}
      pdfLoading={pdfLoading}
      pdfError={pdfError}
      previewTitle={`ALFT dummy PDF preview${pdfTemplateMode ? ` (${pdfTemplateMode})` : ''}`}
      loadingText={pdfLoading ? 'Generating PDF preview…' : 'PDF preview not available yet.'}
      wrapperClassName="mx-auto w-full max-w-6xl space-y-3 p-4"
      htmlWrapperClassName="mx-auto w-full max-w-[8.5in] space-y-3 p-2"
      captureWidthPx={1120}
    />
  );
}
