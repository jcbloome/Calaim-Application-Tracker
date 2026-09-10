'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EXACT_ALFT_PAGES } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { PdfPreviewLayout } from '@/components/pdf/PdfPreviewLayout';
import { ALFT_PAGE_MOVED_FIELD_IDS, ALFT_PAGE_MOVED_FIELDS } from '@/lib/alft-form-rules';
import { formatAlftElectronicSignedAt, toAlftMmDdYyyy } from '@/lib/alft-dates';
import { useToast } from '@/hooks/use-toast';
import {
  ALFT_PAGE_LAYOUT,
  ALFT_SECTION_DIVIDERS,
  keepAlftOnlyQuestionIds,
  selectAlftQuestionsForLayout,
} from '@/lib/alft/alft-page-layout';

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

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];

const PAGE_LAYOUT = ALFT_PAGE_LAYOUT;
const TOTAL_PAGES = PAGE_LAYOUT.length;

const MOVED_TEXT_FIELDS = ALFT_PAGE_MOVED_FIELDS;

const MOVED_TEXT_FIELD_IDS = ALFT_PAGE_MOVED_FIELD_IDS;
const HIDE_FROM_PDF_QUESTION_IDS = new Set([
  'p14_print_name',
  'p14_date',
  'p14_license_number',
  'p14_rn_print_name',
  'p14_rn_recommended_tier',
  'p14_admin_approved_tier',
  'p14_rn_signed_at',
  'p14_sw_signed_at',
]);

const SECTION_DIVIDERS = ALFT_SECTION_DIVIDERS;

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
  const auth = useAuth();
  const { toast } = useToast();
  const viewParam = String(searchParams.get('view') || '').toLowerCase();
  const isPdfView = viewParam === 'pdf';
  const isPrintView = viewParam === 'print';
  const intakeId = String(searchParams.get('intakeId') || '').trim();
  const answersKey = String(searchParams.get('answersKey') || '').trim();
  const returnToParam = String(searchParams.get('returnTo') || '').trim();
  const returnToHref = returnToParam.startsWith('/admin/') ? returnToParam : '/admin/alft-tracker';
  const embedMode = String(searchParams.get('embed') || '').trim() === '1';
  const autoDownload = String(searchParams.get('autoDownload') || '').trim() === '1';
  const archiveAfterDownload = String(searchParams.get('archive') || '').trim() === '1';
  /** Hidden iframe download from ALFT tracker — no viewer UI, notify parent when done. */
  const silentDownload = String(searchParams.get('silent') || '').trim() === '1';
  const logoSrc = '/ils-logo.png';
  const captureRef = useRef<HTMLDivElement>(null);
  const autoDownloadRanRef = useRef(false);
  const notifySilentParent = useCallback(
    (payload: {
      ok: boolean;
      downloadName?: string;
      error?: string;
      pdfBuffer?: ArrayBuffer;
      logId?: string;
      downloadedAtIso?: string;
    }) => {
      if (!silentDownload || typeof window === 'undefined') return;
      const message = {
        type: 'alft-silent-download',
        intakeId,
        ok: payload.ok,
        downloadName: payload.downloadName,
        error: payload.error,
        logId: payload.logId,
        downloadedAtIso: payload.downloadedAtIso,
      };
      // Prefer metadata-only notify. Large PDF ArrayBuffers often fail Structured Clone /
      // transfer and were previously swallowed, leaving the parent spinner stuck forever.
      try {
        window.parent?.postMessage(message, window.location.origin);
        return;
      } catch {
        // fall through
      }
      try {
        window.parent?.postMessage(
          {
            ...message,
            // last-resort tiny payload
            error: payload.error || (payload.ok ? undefined : 'Could not notify parent window'),
          },
          window.location.origin
        );
      } catch {
        // Parent timeout will surface the failure.
      }
    },
    [intakeId, silentDownload]
  );
  const handleReturnToEdit = useCallback(() => {
    // Print view now opens in the same tab as editor.
    window.location.assign(returnToHref);
  }, [returnToHref]);

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
  // Silent / intake-only PDF downloads pass intakeId without answersKey. Do not mark ready
  // until Firestore answers merge — otherwise HTML capture runs with empty defaults (Agency only).
  const [answersReady, setAnswersReady] = useState<boolean>(!(answersKey || intakeId));
  const [printDownloadLocked, setPrintDownloadLocked] = useState(false);
  /** True once answersKey localStorage/session parse has finished (or there is no answersKey). */
  const [answersKeySettled, setAnswersKeySettled] = useState<boolean>(!answersKey);
  /** Bumps when answers are loaded/merged so PDF view regenerates after async intake fetch. */
  const [answersLoadToken, setAnswersLoadToken] = useState(0);
  const intakeAnswersLoadedForRef = useRef('');

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
    if (intakeId) return;
    void loadApplicationMembers();
  }, [isPdfView, intakeId, loadApplicationMembers]);

  useEffect(() => {
    if (!answersKey) {
      // Intake-only loads gate readiness in the Firestore effect below.
      if (!intakeId) setAnswersReady(true);
      setAnswersKeySettled(true);
      return;
    }
    try {
      // For new-tab print flow, read from localStorage first (cross-tab),
      // then fall back to sessionStorage for same-tab preview flows.
      const raw = window.localStorage.getItem(answersKey) || window.sessionStorage.getItem(answersKey);
      if (!raw) {
        // Wait for intake merge when available; otherwise unblock blank preview.
        if (!intakeId) {
          setAnswersReady(true);
          setAnswersLoadToken((n) => n + 1);
        }
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged: Record<string, AnswerValue> = { ...initialAnswers };
      Object.entries(parsed).forEach(([k, v]) => {
        if (Array.isArray(v)) merged[k] = v.map((x) => String(x || ''));
        else merged[k] = String(v ?? '');
      });
      merged.p1_agency = String(merged.p1_agency || AGENCY_NAME);
      setAnswers(merged);
      setAnswersLoadToken((n) => n + 1);
      // One-time transfer; avoid stale storage buildup.
      window.localStorage.removeItem(answersKey);
      window.sessionStorage.removeItem(answersKey);
    } catch {
      // fallback to saved-intake answers
    } finally {
      setAnswersKeySettled(true);
      // If intakeId is also present, keep waiting until Firestore merge finishes so PDF
      // capture does not race ahead of the authoritative saved packet answers.
      if (!intakeId) setAnswersReady(true);
    }
  }, [answersKey, intakeId, initialAnswers]);

  useEffect(() => {
    if (!intakeId) return;
    if (!firestore) return;
    if (answersKey && !answersKeySettled) return;
    if (intakeAnswersLoadedForRef.current === intakeId) return;
    let cancelled = false;
    const markAnswersReady = () => {
      if (cancelled) return;
      intakeAnswersLoadedForRef.current = intakeId;
      setAnswersReady(true);
      setAnswersLoadToken((n) => n + 1);
    };
    const loadFromIntake = async () => {
      try {
        const snap = await getDoc(doc(firestore, 'standalone_upload_submissions', intakeId));
        if (cancelled) return;
        if (!snap.exists()) {
          markAnswersReady();
          return;
        }
        const row = snap.data() as any;
        if (isPrintView || isPdfView) {
          const ws = String(row?.workflowStatus || '').toLowerCase();
          const rnDone = Boolean(
          row?.alftSignature?.rnSignedAt ||
            row?.alftForm?.rnSignedAt ||
            row?.alftForm?.exactPacketAnswers?.p14_rn_signed_at ||
            row?.alftSignature?.packetPdfStoragePath ||
            row?.alftSignature?.signaturePagePdfStoragePath ||
            row?.alftSignature?.rnAdminOverride ||
            String(row?.alftForm?.exactPacketAnswers?.p14_admin_override_rn || '')
              .trim()
              .toLowerCase() === 'yes'
        );
        const adminFinalDone =
          String(row?.alftManagerReview?.status || '').toLowerCase() === 'approved' ||
          ws.includes('manager_review_complete') ||
          ws.includes('ready_to_send') ||
          ws.includes('completed_sent_to_jocelyn') ||
          ws.includes('awaiting_kaiser_manager_final') ||
          Boolean(row?.alftStaffDownloadedAt) ||
          (ws.includes('completed') && !ws.includes('awaiting'));
        // Embedded / auto-download from ISP Workflow are intentional staff actions.
        // Admin RN override / final-review status also unlocks packet generation.
        const staffDownloadIntent = embedMode || autoDownload || archiveAfterDownload;
        if (!staffDownloadIntent && !(rnDone && adminFinalDone)) {
          if (!cancelled) {
            setPrintDownloadLocked(true);
            markAnswersReady();
          }
          return;
        }
        if (!cancelled) setPrintDownloadLocked(false);
        }
        const merged: Record<string, AnswerValue> = { ...initialAnswers };
        const raw = row?.alftForm?.exactPacketAnswers;
        if (raw && typeof raw === 'object') {
          Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
            if (Array.isArray(v)) merged[k] = v.map((x) => String(x || ''));
            else merged[k] = String(v ?? '');
          });
        }
        if (!String(merged.p1_member_name || '').trim()) {
          merged.p1_member_name = String(row?.memberName || '').trim();
        }
        if (!String(merged.p1_mrn || '').trim()) {
          merged.p1_mrn = String(row?.medicalRecordNumber || '').trim();
        }
        if (!String(merged.p1_plan_id || '').trim()) {
          merged.p1_plan_id = String(row?.medicalRecordNumber || '').trim();
        }
        if (!String(merged.p1_assessor_name || '').trim()) {
          merged.p1_assessor_name = String(row?.uploaderName || row?.uploaderEmail || '').trim();
        }
        merged.p1_agency = AGENCY_NAME;
        const toSignedIso = (value: unknown) => {
          const ms = (() => {
            try {
              if (typeof (value as any)?.toDate === 'function') return (value as any).toDate().getTime();
              if (typeof (value as any)?.toMillis === 'function') return (value as any).toMillis();
            } catch {
              // ignore
            }
            const raw = String(value || '').trim();
            if (!raw || raw === '[object Object]') return 0;
            const parsed = Date.parse(raw);
            return Number.isFinite(parsed) ? parsed : 0;
          })();
          return ms ? new Date(ms).toISOString() : '';
        };
        const mswSignedIso =
          String(merged.p14_sw_signed_at || '').trim() ||
          toSignedIso(row?.alftSignature?.mswSignedAt) ||
          toSignedIso(row?.alftForm?.swSignedAt);
        if (mswSignedIso) merged.p14_sw_signed_at = mswSignedIso;
        const rnSignedIso =
          String(merged.p14_rn_signed_at || '').trim() ||
          toSignedIso(row?.alftSignature?.rnSignedAt) ||
          toSignedIso(row?.alftForm?.rnSignedAt);
        if (rnSignedIso) merged.p14_rn_signed_at = rnSignedIso;
        if (!String(merged.p14_print_name || '').trim()) {
          merged.p14_print_name = String(
            row?.alftSignature?.mswSignedName || row?.uploaderName || merged.p1_assessor_name || ''
          ).trim();
        }
        if (!String(merged.p14_rn_print_name || '').trim()) {
          merged.p14_rn_print_name = String(
            row?.alftSignature?.rnSignedName || row?.alftRnName || ''
          ).trim();
        }
        const rnTier = String(
          (row as any)?.alftRnTierRecommendation?.tier || merged.p14_rn_recommended_tier || ''
        ).trim();
        if (rnTier) merged.p14_rn_recommended_tier = rnTier;
        const adminTier = String(
          (row as any)?.alftManagerReview?.adminApprovedTier ||
            (row as any)?.alftManagerReview?.rnRecommendedTier ||
            merged.p14_admin_approved_tier ||
            ''
        ).trim();
        if (adminTier) merged.p14_admin_approved_tier = adminTier;
        if (!cancelled) {
          setAnswers(merged);
          markAnswersReady();
        }
      } catch {
        // best effort prefill only — still unblock PDF so download does not hang forever
        markAnswersReady();
      }
    };
    void loadFromIntake();
    return () => {
      cancelled = true;
    };
  }, [firestore, intakeId, answersKey, answersKeySettled, initialAnswers, isPrintView, isPdfView, embedMode, autoDownload, archiveAfterDownload]);

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
    setPdfTemplateMode('');
    try {
      // Native preview pipeline: render the in-app ALFT form to PDF.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 800));
      });

      const container = captureRef.current;
      if (!container) throw new Error('Capture container not ready — please try again.');
      // Ensure every page is fully expanded before capture (avoids mid-sentence clipping).
      const sections = Array.from(container.querySelectorAll('.alft-page')) as HTMLElement[];
      sections.forEach((section) => {
        section.style.height = 'auto';
        section.style.maxHeight = 'none';
        section.style.overflow = 'visible';
      });
      if (!sections.length) throw new Error('No ALFT pages found in capture container.');

      const { generatePdfFromHtmlSections } = await import('@/lib/pdf/generatePdfFromHtmlSections');
      const pdfBytes = await generatePdfFromHtmlSections(sections, {
        stampPageNumbers: false,
        options: {
          scale: 2,
          marginIn: 0.45,
          treatEachSectionAsSinglePage: false,
          imageFormat: 'png',
          fitSafetyScale: 0.97,
        },
      });
      const templateUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return templateUrl;
      });
      setPdfTemplateMode('html-render');
    } catch (e: any) {
      setPdfError(String(e?.message || 'Could not generate PDF preview.'));
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    } finally {
      setPdfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPdfView) return;
    if (!answersReady) return;
    if (printDownloadLocked) return;
    // Reset so a late answers merge can archive the filled PDF, not an earlier empty capture.
    autoDownloadRanRef.current = false;
    void generatePreviewPdf();
  }, [answersReady, answersLoadToken, generatePreviewPdf, isPdfView, printDownloadLocked]);

  useEffect(() => {
    if (!isPdfView || !autoDownload || !pdfUrl || pdfLoading || autoDownloadRanRef.current) return;
    if (printDownloadLocked) return;
    autoDownloadRanRef.current = true;
    const run = async () => {
      try {
        const member = String(answers.p1_member_name || 'Member').trim() || 'Member';
        const mrn = String(answers.p1_mrn || '').trim() || 'N/A';
        const now = new Date();
        const day = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}`;
        const downloadNameFallback = `ISP, ${member}, ${mrn}, ${day}`;
        const pdfRes = await fetch(pdfUrl);
        const buf = await pdfRes.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let archivedName = downloadNameFallback;
        let logId = '';
        const downloadedAtIso = new Date().toISOString();

        const needsArchive = archiveAfterDownload || silentDownload;
        if (needsArchive && intakeId) {
          // Silent parent download depends on archive logId — wait briefly for auth in iframe.
          let tokenUser = auth?.currentUser || null;
          for (let i = 0; i < 20 && !tokenUser; i += 1) {
            await new Promise((r) => setTimeout(r, 250));
            tokenUser = auth?.currentUser || null;
          }
          if (!tokenUser) {
            throw new Error('Sign-in required in download window. Refresh and try Approved and download again.');
          }
          const idToken = await tokenUser.getIdToken();
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const pdfBase64 = btoa(binary);
          const archiveController = new AbortController();
          const archiveTimeout = window.setTimeout(() => archiveController.abort(), 90_000);
          let archiveRes: Response;
          try {
            archiveRes = await fetch('/api/alft/download-log', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ intakeId, pdfBase64 }),
              signal: archiveController.signal,
            });
          } finally {
            window.clearTimeout(archiveTimeout);
          }
          if (!archiveRes.ok) {
            const body = await archiveRes.json().catch(() => ({}));
            throw new Error(String(body?.error || 'Could not archive download log'));
          }
          const headerName = String(archiveRes.headers.get('X-Download-Name') || '').trim();
          logId = String(archiveRes.headers.get('X-Download-Log-Id') || '').trim();
          if (headerName) archivedName = headerName.replace(/\.pdf$/i, '');
          if (silentDownload && !logId) {
            throw new Error('Archive succeeded but no download log id was returned.');
          }
        }

        const fileName = `${archivedName.replace(/\.pdf$/i, '')}.pdf`;

        if (silentDownload) {
          // Parent downloads via logId (or rebuilds). Do not postMessage the PDF bytes —
          // large buffers hang/fail Structured Clone and left Approve stuck spinning.
          notifySilentParent({
            ok: true,
            downloadName: fileName,
            logId: logId || undefined,
            downloadedAtIso,
          });
        } else {
          const a = document.createElement('a');
          a.href = pdfUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          if (archiveAfterDownload) {
            toast({
              title: 'Downloaded and archived',
              description: `${fileName} saved on ISP Downloads Data Page.`,
              className: 'bg-green-100 text-green-900 border-green-200',
            });
          } else {
            toast({
              title: 'Download started',
              description: fileName,
            });
          }
        }
      } catch (e: any) {
        const message =
          e?.name === 'AbortError'
            ? 'Archiving the PDF timed out. Please try Approved and download again.'
            : String(e?.message || e);
        notifySilentParent({ ok: false, error: message });
        if (!silentDownload) {
          toast({
            variant: 'destructive',
            title: 'Download failed',
            description: message,
          });
        }
      }
    };
    void run();
  }, [
    answers.p1_member_name,
    answers.p1_mrn,
    archiveAfterDownload,
    auth,
    autoDownload,
    intakeId,
    isPdfView,
    notifySilentParent,
    pdfLoading,
    pdfUrl,
    printDownloadLocked,
    silentDownload,
    toast,
  ]);

  useEffect(() => {
    if (!silentDownload || !pdfError) return;
    notifySilentParent({ ok: false, error: pdfError });
  }, [notifySilentParent, pdfError, silentDownload]);

  // If silent download stays locked with no PDF, fail fast instead of spinning forever.
  useEffect(() => {
    if (!silentDownload || !autoDownload || !printDownloadLocked) return;
    notifySilentParent({
      ok: false,
      error: 'Download is locked until RN signs and admin final approval completes.',
    });
  }, [autoDownload, notifySilentParent, printDownloadLocked, silentDownload]);

  useEffect(() => {
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  const viewerHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set('view', 'pdf');
    if (intakeId) params.set('intakeId', intakeId);
    if (answersKey) params.set('answersKey', answersKey);
    return `/admin/alft-tracker/dummy-preview?${params.toString()}`;
  }, [intakeId, answersKey]);
  const editorHref = useMemo(() => {
    const params = new URLSearchParams();
    if (intakeId) params.set('intakeId', intakeId);
    const query = params.toString();
    return query ? `/admin/alft-tracker/dummy-preview?${query}` : '/admin/alft-tracker/dummy-preview';
  }, [intakeId]);

  const downloadLockedUi =
    (isPrintView || isPdfView) && printDownloadLocked && !embedMode ? (
      <div className="mx-auto max-w-xl p-6">
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="font-semibold">Print / download locked</div>
          <p className="mt-2 text-sm">
            This ALFT can be printed or downloaded only after RN final review and admin final check (Final / Download
            step).
          </p>
          <Button className="mt-4" variant="outline" onClick={handleReturnToEdit}>
            Back to review
          </Button>
        </div>
      </div>
    ) : null;

  // Must run after all hooks — never early-return before hooks above.
  if (downloadLockedUi) {
    return downloadLockedUi;
  }

  const isReadOnlyView = isPdfView || isPrintView;
  // Kaiser/app printable layout for both print and downloadable PDF (not the plain editor chrome).
  const useEditorPrintableLayout = !isPrintView && !isPdfView;

  const packetContent = (
    <div className="alft-dummy-preview mx-auto w-full max-w-[8.5in] px-2 py-4 print:max-w-none print:px-0 print:py-0">
      {isPrintView && !embedMode ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-md border bg-white p-3 print:hidden">
          <div className="text-sm text-zinc-700">
            <div className="font-semibold">ALFT printable preview</div>
            <div className="text-xs text-zinc-500">
              Use your browser&apos;s print dialog to save as PDF or send to a printer.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReturnToEdit}>
              Back to Edit ALFT
            </Button>
            <Button onClick={() => window.print()} size="lg">
              Print / Save as PDF
            </Button>
          </div>
        </div>
      ) : !isPdfView && !embedMode ? (
        <div className="mb-2 flex items-center justify-end gap-2 rounded-md border bg-white p-3 print:hidden">
          <Button variant="outline" asChild>
            <Link href={viewerHref}>View PDF layout</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={viewerHref}>Print / Save PDF</Link>
          </Button>
        </div>
      ) : null}

      {!isReadOnlyView && !intakeId ? (
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
      {!isReadOnlyView && intakeId ? (
        <div className="mb-4 rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-700 print:hidden">
          Using saved ALFT intake answers for printable preview.
        </div>
      ) : null}

      {useEditorPrintableLayout ? (
        <div className="printable-package-section space-y-4 print:space-y-0">
          <SwStyleAlftEditor
            answers={answers}
            onChange={() => {}}
            memberName={headerMemberName}
            memberMrn={headerMemberMrn}
            readOnly
            sectionClassName="alft-page"
          />
        </div>
      ) : (
      <div className="printable-package-section space-y-4 print:space-y-0">
        {PAGE_LAYOUT.map((layout) => {
          const source = SOURCE.find((p) => p.id === layout.sourceId);
          const questions = selectAlftQuestionsForLayout(source?.questions || [], layout);
          const renderedQuestions = keepAlftOnlyQuestionIds(
            getRenderedQuestionsForPage(layout.number, questions).filter(
              (q) => !HIDE_FROM_PDF_QUESTION_IDS.has(q.id)
            ),
            layout
          );
          const rnName = asText(answers.p14_rn_print_name);
          const rnLicense = asText(answers.p14_license_number);
          const mswName = asText(answers.p14_print_name) || asText(answers.p1_assessor_name);
          const mswSignedAt = formatAlftElectronicSignedAt(answers.p14_sw_signed_at);
          const rnSignedAt = formatAlftElectronicSignedAt(answers.p14_rn_signed_at);
          const mswDate =
            toAlftMmDdYyyy(answers.p14_date) ||
            (mswSignedAt ? mswSignedAt.split(',')[0] : '') ||
            asText(answers.p14_date);
          const rnDate =
            (rnSignedAt ? rnSignedAt.split(',')[0] : '') ||
            toAlftMmDdYyyy(answers.p14_date) ||
            asText(answers.p14_date);
          const mswSignatureNotice = mswSignedAt
            ? `Electronic signature verified — electronically signed on ${mswSignedAt}`
            : asText(answers.p14_electronic_notice) || '';
          const rnSignatureNotice = rnSignedAt
            ? `Electronic signature verified — electronically signed on ${rnSignedAt}`
            : '';
          return (
            <section
              key={layout.number}
              className={`alft-page border border-zinc-300 bg-white p-5 ${
                layout.number === 14 ? 'alft-page-commentary' : 'alft-page-letter'
              }`}
            >
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
                <div className="mt-1.5 text-[13px] font-semibold uppercase tracking-wide text-zinc-900 alft-section-title">
                  {layout.title}
                </div>
              </div>
              <div>
                <div
                  className={`alft-question-grid grid grid-cols-1 gap-3.5 text-[12px] ${
                    layout.number === 13 || layout.number === 14 ? '' : 'md:grid-cols-2'
                  }`}
                >
                  {renderedQuestions.map((q) => (
                    <div key={q.id} className="contents">
                      {(SECTION_DIVIDERS[layout.number] || [])
                        .filter((divider) => divider.beforeQuestionId === q.id)
                        .map((divider) => (
                          <div
                            key={`${layout.number}-${divider.beforeQuestionId}-divider`}
                            className="alft-subsection-title alft-col-span-2 md:col-span-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-900"
                          >
                            {divider.label}
                          </div>
                        ))}
                    <div
                      className={`min-w-0 space-y-1 ${
                        isLongTextQuestion(q) || layout.number === 13 || layout.number === 14
                          ? 'md:col-span-2 alft-col-span-2'
                          : ''
                      }`}
                    >
                    <div
                      className="question-block min-w-0 rounded-sm border border-zinc-300 px-2.5 py-3"
                    >
                      <div className="font-semibold leading-tight">
                        {formatPromptLabel(q.label)}
                      </div>
                      {!isReadOnlyView && q.type === 'text' ? (
                        <input
                          value={String(answers[q.id] || '')}
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          className="mt-1 h-7 w-full rounded border border-zinc-300 bg-white px-2 text-[10px]"
                        />
                      ) : null}
                      {!isReadOnlyView && q.type === 'textarea' ? (
                        <textarea
                          value={String(answers[q.id] || '')}
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          rows={isLargeCommentaryQuestion(q) ? 12 : Math.min(Math.max(q.rows || 3, 3), 6)}
                          className={`mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] ${isLargeCommentaryQuestion(q) ? 'min-h-[220px]' : ''}`}
                        />
                      ) : null}
                      {!isReadOnlyView && (q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                        <div className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => (
                            <label key={`edit-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[11px]">
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
                      {!isReadOnlyView && q.type === 'checkboxGroup' && q.options?.length ? (
                        <div className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => {
                            const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
                            return (
                              <label key={`edit-check-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[11px]">
                                <input type="checkbox" checked={selected} onChange={() => toggleMultiAnswer(q.id, opt.value)} />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                      {isReadOnlyView && isOptionQuestion(q) && q.options?.length ? (
                        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {q.options.map((opt) => {
                            const selected =
                              q.type === 'checkboxGroup'
                                ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                                : String(answers[q.id] || '') === opt.value;
                            return (
                              <div
                                key={`output-opt-${q.id}-${opt.value}`}
                                className="inline-flex min-h-[16px] items-center gap-1.5 text-[11px] leading-snug"
                              >
                                <Dot selected={selected} />
                                <span className={`${selected ? 'font-semibold text-zinc-900' : 'text-zinc-600'}`}>{opt.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : isReadOnlyView ? (
                        <div
                          className={`answer-line mt-2 pb-2 text-zinc-900 whitespace-pre-wrap ${
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
                    </div>
                  ))}
                </div>
                {layout.number === 14 ? (
                  <div className="signature-section mt-3 space-y-2 text-[10px]" data-keep-together>
                  <div className="alft-subsection-title text-[13px] font-semibold uppercase tracking-wide text-zinc-900">
                    Signature Section
                  </div>
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
                        <div className={`signature-line ${mswSignatureNotice ? 'signature-verified' : ''}`}>
                          {mswSignatureNotice || ' '}
                        </div>
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
                        <div className={`signature-line ${rnSignatureNotice ? 'signature-verified' : ''}`}>
                          {rnSignatureNotice || ' '}
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 border-t border-zinc-300 pt-2 text-right text-[11px] text-zinc-600">
                ALF Transition Assessment - Page {layout.number} of {TOTAL_PAGES}
              </div>
            </section>
          );
        })}
      </div>
      )}

      <style jsx global>{`
        body {
          background: #f5f5f5;
        }
        .alft-dummy-preview {
          color: #18181b;
          width: 100%;
          max-width: 8.5in;
          box-sizing: border-box;
          overflow-x: visible;
        }
        .alft-page {
          width: 100% !important;
          max-width: 8.5in !important;
          box-sizing: border-box !important;
          min-height: 0 !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          overflow-wrap: anywhere;
          word-break: break-word;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
          font-family: Arial, Helvetica, sans-serif;
          letter-spacing: 0.01em;
        }
        .alft-page.alft-page-letter {
          min-height: 10.5in;
        }
        .alft-page.alft-page-commentary {
          min-height: 0;
        }
        .alft-logo {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .alft-section-title {
          background: transparent;
          border: none;
          color: #18181b;
          padding: 2px 0;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .alft-subsection-title {
          background: transparent;
          border: none;
          color: #18181b;
          padding: 6px 0 2px;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          text-align: left;
          width: 100%;
          box-sizing: border-box;
        }
        .alft-question-grid {
          width: 100%;
          min-width: 0;
          row-gap: 0.875rem;
          column-gap: 0.875rem;
        }
        .question-block {
          background: #fff;
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .question-block .font-semibold {
          font-size: 12px;
          line-height: 1.35;
        }
        .answer-line {
          min-height: 0.85rem;
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: pre-wrap;
          font-size: 12px;
          line-height: 1.4;
          padding-top: 2px;
          padding-bottom: 8px;
        }
        .section-notes-answer {
          min-height: 64px;
          border: none;
          font-size: 12px;
          line-height: 1.4;
          padding-top: 6px;
          padding-bottom: 4px;
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
          min-height: 18px;
          font-size: 11px;
          padding-bottom: 2px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .signature-line.signature-verified {
          color: #065f46;
          font-weight: 600;
          border-bottom-color: #059669;
        }
        .large-commentary-box {
          min-height: 240px !important;
          height: auto !important;
          max-height: none !important;
          max-width: 100% !important;
          overflow: visible !important;
          border: 1px solid #71717a;
          padding: 8px;
          background: #fafafa;
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
          break-inside: auto;
          page-break-inside: auto;
        }
        .large-commentary-box,
        .question-block:has(.large-commentary-box) {
          break-inside: auto;
          page-break-inside: auto;
        }
        @media print {
          @page {
            size: letter;
            margin: 0.35in;
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
            margin: 0 !important;
            padding: 0 !important;
          }
          body {
            background: #fff !important;
          }
          .alft-page {
            width: 100% !important;
            max-width: none !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            padding: 0.12in 0.12in 0.08in !important;
            border-color: #a1a1aa !important;
            page-break-before: always;
            break-before: page;
            page-break-inside: auto;
            break-inside: auto;
          }
          .alft-section-title,
          .alft-subsection-title {
            text-align: left !important;
            background: transparent !important;
            color: #18181b !important;
            border: none !important;
          }
          .question-block {
            padding-top: 10px !important;
            padding-bottom: 10px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
          }
          .large-commentary-box {
            min-height: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }
          .alft-question-grid {
            row-gap: 12px !important;
            column-gap: 12px !important;
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .alft-page:not(.alft-page-commentary) .alft-question-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .alft-page-commentary .alft-question-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
          .answer-line {
            min-height: 0.85rem !important;
            padding-bottom: 8px !important;
          }
          .alft-page:first-child {
            page-break-before: auto;
            break-before: auto;
          }
          .alft-page:last-child {
            page-break-after: auto;
            break-after: auto;
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

  // Silent background download (iframe from ALFT tracker): render capture only, no viewer chrome.
  if (silentDownload) {
    return (
      <div
        className="fixed left-[-100000px] top-0 overflow-visible"
        style={{ width: '1120px', height: 'auto', maxHeight: 'none' }}
        aria-hidden
      >
        <div ref={captureRef} className="overflow-visible" style={{ height: 'auto', maxHeight: 'none' }}>
          {packetContent}
        </div>
      </div>
    );
  }

  return (
    <PdfPreviewLayout
      isPdfView={isPdfView}
      viewPdfHref={viewerHref}
      backToEditorHref={editorHref}
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
