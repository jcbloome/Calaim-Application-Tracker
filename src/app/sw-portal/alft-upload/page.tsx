'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth, useFirestore } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { EXACT_ALFT_PAGES, createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { MultiPageFilePreview } from '@/components/alft/MultiPageFilePreview';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import {
  AlftMedListUpload,
  parseMedListAttachment,
  type AlftMedListAttachment,
} from '@/components/alft/AlftMedListUpload';
import {
  ISP_ALFT_LOCKED_FIELD_DEFAULT,
  ISP_ALFT_LOCKED_FIELD_IDS,
  applyIspAlftLockedFieldDefaults,
  isIspAlftLockedField,
} from '@/lib/isp-alft-field-rules';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
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
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
};
type SourcePage = { id: string; title: string; questions: Question[] };
const AGENCY_NAME = 'Connections Care Home Consultants';
const ALFT_TEMPLATE_PATH =
  'C:/ConnectionsILOS/ALFT_Agreement.pdf';

type KaiserMember = {
  id: string;
  memberName: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  birthDate?: string;
  memberSex?: string;
  memberPrimaryLanguage?: string;
  memberPhone?: string;
  ispCurrentAddressStreet?: string;
  ispCurrentAddressCity?: string;
  ispCurrentAddressState?: string;
  ispCurrentAddressZip?: string;
  currentLocationType?: string;
  currentLocationTypeOther?: string;
  assessmentSite?: string;
  homeAddressStreet?: string;
  homeAddressCity?: string;
  homeAddressState?: string;
  homeAddressZip?: string;
  ispFacilityName?: string;
  kaiserStatus?: string;
  alftAssigned?: string;
  ispCurrentLocation?: string;
  ispContactName?: string;
  ispContactRelationship?: string;
  ispContactPhone?: string;
  ispContactEmail?: string;
  ispContact2First?: string;
  ispContact2Last?: string;
  ispContact2Relationship?: string;
  ispContact2Phone?: string;
  ispContact2Email?: string;
  ispContactConfirmDate?: string;
  assessorCmReferralDate?: string;
  // from alft_assignments Firestore doc
  assignedSwEmail?: string;
  assignedSwName?: string;
  assignmentStatus?: string;
  workflowStatus?: string;
  needsSwRevision?: boolean;
  returnedToSwReason?: string;
  latestIntakeId?: string;
  submittedAtIso?: string;
  prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string;
  prefillSourceLabel?: string;
  prefillPurpose?: string;
  alftPlanId?: string;
  expectedVisitDate?: string;
  prefillResolved?: Record<string, string>;
  swPortalSupportFiles?: Array<{
    id?: string;
    label?: string;
    fileName?: string;
    downloadURL?: string;
    uploadedAt?: any;
  }>;
  medListAttachment?: AlftMedListAttachment | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE = EXACT_ALFT_PAGES as SourcePage[];

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
  'p14_print_name', 'p14_date', 'p14_license_number', 'p14_rn_print_name',
]);

const SECTION_DIVIDERS: Record<number, Array<{ beforeQuestionId: string; label: string }>> = {
  1: [
    { beforeQuestionId: 'p1_member_name', label: 'HEADER INFORMATION' },
    { beforeQuestionId: 'p1_first_name', label: 'DEMOGRAPHIC' },
  ],
  4: [{ beforeQuestionId: 'p4_adl_bathing', label: 'ACTIVITIES OF DAILY LIVING' }],
  5: [{ beforeQuestionId: 'p5_iadl_heavy_chores', label: 'INSTRUMENTAL ACTIVITIES OF DAILY LIVING' }],
  6: [],
  13: [{ beforeQuestionId: 'p13_commentary_section', label: 'ADDITIONAL DETAILS/RN COMMENTARY:' }],
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

const parseAssignmentTimestamp = (raw: unknown): string | null => {
  if (!raw) return null;
  try {
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
      return (raw as { toDate: () => Date }).toDate().toISOString();
    }
    const text = String(raw).trim();
    if (!text) return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
};

const formatShortDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const isReturnedForRevision = (status: string, workflowStatus?: string) => {
  const hay = `${status || ''} ${workflowStatus || ''}`.trim().toLowerCase();
  return (
    hay.includes('returned_to_sw') ||
    hay.includes('rejected_returned') ||
    hay.includes('waiting_sw_revision')
  );
};

/** Extensive care-relevant commentary required on last ALFT page before SW submit. */
const MIN_COMMENTARY_CHARS = 120;
const getCommentaryText = (answers: Record<string, any>) =>
  String(answers?.p13_commentary_section || '').trim();
const hasExtensiveCommentary = (answers: Record<string, any>) =>
  getCommentaryText(answers).replace(/\s+/g, ' ').length >= MIN_COMMENTARY_CHARS;

const isSubmittedAssignment = (status: string, workflowStatus?: string) => {
  if (isReturnedForRevision(status, workflowStatus)) return false;
  const normalized = String(status || '').trim().toLowerCase();
  const hay = `${normalized} ${String(workflowStatus || '').trim().toLowerCase()}`;
  return (
    normalized === 'submitted' ||
    normalized === 'completed' ||
    normalized.includes('awaiting_manager') ||
    normalized.includes('manager_review') ||
    hay.includes('pending_staff') ||
    hay.includes('pending_rn') ||
    hay.includes('returned_to_staff') ||
    hay.includes('returned_to_rn') ||
    hay.includes('awaiting_rn') ||
    hay.includes('awaiting_kaiser')
  );
};

const toMmDdYyyyOrRaw = (value: string | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) {
    return `${isoLike[2].padStart(2, '0')}/${isoLike[3].padStart(2, '0')}/${isoLike[1]}`;
  }
  const usSlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usSlash) {
    return `${usSlash[1].padStart(2, '0')}/${usSlash[2].padStart(2, '0')}/${usSlash[3]}`;
  }
  const usDash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usDash) {
    return `${usDash[1].padStart(2, '0')}/${usDash[2].padStart(2, '0')}/${usDash[3]}`;
  }
  return raw;
};

/** Assessor/CM Referral Date uses YYYY-MM-DD (invite-sent date). */
const toYyyyMmDdFromAssignment = (...values: unknown[]) => {
  for (const value of values) {
    const raw = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    let ms = 0;
    if (value && typeof (value as any)?.toDate === 'function') {
      try {
        ms = (value as any).toDate().getTime();
      } catch {
        ms = 0;
      }
    } else if (typeof (value as any)?.seconds === 'number') {
      ms = Number((value as any).seconds) * 1000;
    } else {
      ms = Date.parse(raw);
    }
    if (Number.isFinite(ms) && ms > 0) {
      const dt = new Date(ms);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
};

/** Valid calendar date in required MSW format MM/DD/YYYY. */
const isRequiredMmDdYyyy = (value: string | undefined) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
};

const stripTrailingNumericId = (value: string) => String(value || '').replace(/\s+\d+$/, '').trim();
const normalizeStateForDisplay = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : raw;
};

const splitName = (member: KaiserMember) => {
  const first = stripTrailingNumericId(String(member.memberFirstName || '').trim());
  const last = stripTrailingNumericId(String(member.memberLastName || '').trim());
  if (first || last) return { first, last };
  const full = stripTrailingNumericId(String(member.memberName || '').trim());
  if (full.includes(',')) {
    const [ln, fn] = full.split(',', 2).map((s) => stripTrailingNumericId(s.trim()));
    return { first: fn || '', last: ln || '' };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts.slice(1).join(' '),
  };
};

function buildDefaultAnswers(): Record<string, AnswerValue> {
  const base = createInitialExactAlftAnswers() as Record<string, AnswerValue>;
  base.p1_agency = AGENCY_NAME;
  return base;
}

function preFillFromMember(
  base: Record<string, AnswerValue>,
  member: KaiserMember,
  swName: string,
): Record<string, AnswerValue> {
  const next = { ...base };
  const resolved = (member.prefillResolved || {}) as Record<string, string>;
  const pickResolved = (...keys: string[]) => {
    for (const key of keys) {
      const value = String(resolved[key] || '').trim();
      if (value) return value;
    }
    return '';
  };
  const parsedName = splitName(member);
  const fullName =
    [parsedName.first, parsedName.last].filter(Boolean).join(' ') ||
    stripTrailingNumericId(String(member.memberName || '').trim()) ||
    `${parsedName.first} ${parsedName.last}`.trim();

  next.p1_member_name = fullName;
  next.p1_assessor_name = String(member.assignedSwName || '').trim() || swName;
  next.p1_agency = AGENCY_NAME;
  if (parsedName.first) next.p1_first_name = parsedName.first;
  if (parsedName.last) next.p1_last_name = parsedName.last;
  if (member.memberMrn) next.p1_mrn = member.memberMrn;
  if (member.memberMrn || member.alftPlanId) next.p1_plan_id = String(member.memberMrn || member.alftPlanId || '').trim();
  if (member.birthDate) next.p1_dob = toMmDdYyyyOrRaw(member.birthDate);
  // Assessor/CM Referral Date = date invite was sent to SW (not ISP contact confirm date).
  const referralFromInvite = String(member.assessorCmReferralDate || '').trim();
  if (referralFromInvite) next.p1_referral_date = referralFromInvite;
  const otherResponderName = String(member.ispContactName || '').trim();
  const otherResponderRelationship = sanitizeRelationshipLabel(member.ispContactRelationship);
  if (otherResponderName || otherResponderRelationship) next.p1_other_responder = 'yes';
  if (otherResponderName) next.p1_other_responder_name = otherResponderName;
  if (otherResponderRelationship) next.p1_other_responder_relationship = otherResponderRelationship;

  const primaryPhone = String(member.ispContactPhone || member.memberPhone || '').trim();
  if (primaryPhone) next.p1_phone = primaryPhone;
  if (member.memberSex) next.p1_sex = member.memberSex;
  if (member.memberPrimaryLanguage) next.p1_primary_language = member.memberPrimaryLanguage;

  const facilityName = String(
    pickResolved('p2_facility_name', 'isp_location_name') || member.ispFacilityName || member.ispCurrentLocation || ''
  ).trim();
  if (facilityName) next.p2_facility_name = facilityName;
  const currentType = String(pickResolved('p2_current_type', 'isp_location_type') || member.currentLocationType || '').trim();
  if (currentType) next.p2_current_type = currentType;
  const currentTypeOther = String(
    pickResolved('p2_current_type_other', 'p2_current_type', 'isp_location_type') ||
      member.currentLocationTypeOther ||
      member.currentLocationType ||
      ''
  ).trim();
  if (currentTypeOther) {
    next.p2_current_type_other = currentTypeOther;
  }
  if (member.assessmentSite) next.p2_assessment_site = member.assessmentSite;

  const currentStreet = String(pickResolved('p2_current_street', 'isp_location_address') || member.ispCurrentAddressStreet || '').trim();
  const currentCity = String(pickResolved('p2_current_city', 'isp_location_city') || member.ispCurrentAddressCity || '').trim();
  const currentState = String(pickResolved('p2_current_state', 'isp_location_state') || member.ispCurrentAddressState || '').trim();
  const currentZip = String(pickResolved('p2_current_zip', 'isp_location_zip') || member.ispCurrentAddressZip || '').trim();
  if (currentStreet) next.p2_current_street = currentStreet;
  if (currentCity) next.p2_current_city = currentCity;
  next.p2_current_state = currentState || 'CA';
  if (currentZip) next.p2_current_zip = currentZip;
  if (member.homeAddressStreet) next.p2_home_street = member.homeAddressStreet;
  if (member.homeAddressCity) next.p2_home_city = member.homeAddressCity;
  next.p2_home_state = normalizeStateForDisplay(String(member.homeAddressState || '').trim()) || 'CA';
  if (member.homeAddressZip) next.p2_home_zip = member.homeAddressZip;
  next.p2_alwp_agency = 'N/A';

  return applyIspAlftLockedFieldDefaults(next);
}

function normalizeAssessmentHeaderAnswers(input: Record<string, AnswerValue>): Record<string, AnswerValue> {
  const next = { ...input };
  const first = String(next.p1_first_name || '').replace(/\s+\d+$/, '').trim();
  const last = String(next.p1_last_name || '').replace(/\s+\d+$/, '').trim();
  const full = String(next.p1_member_name || '').trim();
  if (first || last) next.p1_member_name = `${first} ${last}`.trim();
  else if (full) {
    if (full.includes(',')) {
      const [ln, fn] = full.split(',', 2).map((part) => String(part || '').replace(/\s+\d+$/, '').trim());
      next.p1_member_name = `${fn || ''} ${ln || ''}`.trim();
    } else {
      next.p1_member_name = full.replace(/\s+\d+$/, '').trim();
    }
  }
  const rawAssessmentDate = String(next.p1_assessment_date || '').trim();
  if (rawAssessmentDate) {
    next.p1_assessment_date = toMmDdYyyyOrRaw(rawAssessmentDate);
  }
  next.p1_dob = toMmDdYyyyOrRaw(String(next.p1_dob || ''));
  return next;
}

function applyLatestCriticalPrefill(input: Record<string, AnswerValue>, member: KaiserMember): Record<string, AnswerValue> {
  const next = normalizeAssessmentHeaderAnswers(input);
  const resolved = (member.prefillResolved || {}) as Record<string, string>;
  const pickResolved = (...keys: string[]) => {
    for (const key of keys) {
      const value = String(resolved[key] || '').trim();
      if (value) return value;
    }
    return '';
  };
  const mrn = String(member.memberMrn || '').trim();
  if (mrn) {
    next.p1_mrn = mrn;
    next.p1_plan_id = mrn;
  }
  if (member.birthDate) next.p1_dob = toMmDdYyyyOrRaw(member.birthDate);
  const parsedName = splitName(member);
  if (parsedName.first) next.p1_first_name = parsedName.first;
  if (parsedName.last) next.p1_last_name = parsedName.last;
  next.p1_member_name = [parsedName.first, parsedName.last].filter(Boolean).join(' ').trim() || String(next.p1_member_name || '');

  // Always refresh ALFT #3 location fields from latest assignment-prefill values,
  // even when restoring an older local draft.
  const latestFacilityName = String(
    pickResolved('p2_facility_name', 'isp_location_name') || member.ispFacilityName || member.ispCurrentLocation || ''
  ).trim();
  if (latestFacilityName) next.p2_facility_name = latestFacilityName;
  const latestType = String(pickResolved('p2_current_type', 'isp_location_type') || member.currentLocationType || '').trim();
  if (latestType) next.p2_current_type = latestType;
  const latestTypeOther = String(
    pickResolved('p2_current_type_other', 'p2_current_type', 'isp_location_type') ||
      member.currentLocationTypeOther ||
      member.currentLocationType ||
      ''
  ).trim();
  if (latestTypeOther) {
    next.p2_current_type_other = latestTypeOther;
  }
  const latestStreet = String(pickResolved('p2_current_street', 'isp_location_address') || member.ispCurrentAddressStreet || '').trim();
  const latestCity = String(pickResolved('p2_current_city', 'isp_location_city') || member.ispCurrentAddressCity || '').trim();
  const latestState = String(pickResolved('p2_current_state', 'isp_location_state') || member.ispCurrentAddressState || '').trim();
  const latestZip = String(pickResolved('p2_current_zip', 'isp_location_zip') || member.ispCurrentAddressZip || '').trim();
  if (latestStreet) next.p2_current_street = latestStreet;
  if (latestCity) next.p2_current_city = latestCity;
  next.p2_current_state = latestState || 'CA';
  if (latestZip) next.p2_current_zip = latestZip;
  next.p2_alwp_agency = 'N/A';

  const referralFromInvite = String(member.assessorCmReferralDate || '').trim();
  if (referralFromInvite) next.p1_referral_date = referralFromInvite;

  return applyIspAlftLockedFieldDefaults(normalizeAssessmentHeaderAnswers(next));
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

// ── Draft storage (local cache + cloud sync) ───────────────────────────────────

const DRAFT_KEY = (memberId: string) => `swAlftDraft_v1_${memberId}`;

type LocalDraftPayload = {
  answers: Record<string, AnswerValue>;
  savedAt: string;
  medListAttachment?: AlftMedListAttachment | null;
  expectedVisitDate?: string;
};

function saveDraftLocally(
  memberId: string,
  answers: Record<string, AnswerValue>,
  extras?: { medListAttachment?: AlftMedListAttachment | null; expectedVisitDate?: string }
) {
  try {
    const payload: LocalDraftPayload = {
      answers,
      savedAt: new Date().toISOString(),
      medListAttachment: extras?.medListAttachment ?? null,
      expectedVisitDate: extras?.expectedVisitDate || '',
    };
    localStorage.setItem(DRAFT_KEY(memberId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
function loadDraftLocally(memberId: string): LocalDraftPayload | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(memberId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.answers) return null;
    return {
      answers: parsed.answers,
      savedAt: String(parsed.savedAt || ''),
      medListAttachment: parseMedListAttachment(parsed.medListAttachment) || null,
      expectedVisitDate: String(parsed.expectedVisitDate || ''),
    };
  } catch {
    return null;
  }
}
function clearDraftLocally(memberId: string) {
  try {
    localStorage.removeItem(DRAFT_KEY(memberId));
  } catch {
    /* ignore */
  }
}

async function fetchCloudDraft(idToken: string, memberId: string) {
  const res = await fetch(`/api/alft/sw-draft?memberId=${encodeURIComponent(memberId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data?.success) return null;
  if (!data?.draft?.answers) return null;
  return {
    answers: data.draft.answers as Record<string, AnswerValue>,
    savedAt: String(data.draft.savedAt || ''),
    medListAttachment: parseMedListAttachment(data.draft.medListAttachment) || null,
    expectedVisitDate: String(data.draft.expectedVisitDate || ''),
  } satisfies LocalDraftPayload;
}

async function saveCloudDraft(
  idToken: string,
  memberId: string,
  answers: Record<string, AnswerValue>,
  extras?: { medListAttachment?: AlftMedListAttachment | null; expectedVisitDate?: string; clear?: boolean }
) {
  const res = await fetch('/api/alft/sw-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      memberId,
      answers,
      medListAttachment: extras?.medListAttachment ?? null,
      expectedVisitDate: extras?.expectedVisitDate || '',
      clear: Boolean(extras?.clear),
    }),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || !data?.success) {
    throw new Error(String(data?.error || 'Cloud draft save failed'));
  }
  return String(data?.savedAt || new Date().toISOString());
}

function pickNewerDraft(a: LocalDraftPayload | null, b: LocalDraftPayload | null): LocalDraftPayload | null {
  if (!a) return b;
  if (!b) return a;
  const aMs = Date.parse(a.savedAt || '') || 0;
  const bMs = Date.parse(b.savedAt || '') || 0;
  return bMs > aMs ? b : a;
}

function SwAlftInstructionBox() {
  return (
    <Alert className="print:hidden border-blue-200 bg-blue-50">
      <AlertDescription className="space-y-3 text-blue-950">
        <div className="font-semibold">ALFT guidance (SW portal)</div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Complete all ALFT sections before submitting. Do not leave required clinical sections blank.</li>
          <li>
            Each report requires <strong>extensive commentary on the last page</strong> (Additional Details /
            Commentary). Include only information that is <strong>directly relevant to care needs</strong> and
            tier-level decisions — you must verify this before submit.
          </li>
          <li>For level-of-care scoring, evaluate the member on their worst day, not their best day, because needs fluctuate.</li>
          <li>In the ALFT commentary section, include only pertinent health-care information that supports tier-level decisions.</li>
          <li>
            Commentary must accurately reflect observed conditions and supervision needs (for example: dementia with constant
            supervision/redirecting needs, or need for awake overnight staff).
          </li>
          <li>Avoid non-clinical commentary (for example, "member seems happy") unless it directly affects care needs or safety.</li>
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
  const swId = String(
    (socialWorkerData as any)?.sw_id ||
    (socialWorkerData as any)?.SW_ID ||
    ''
  ).trim().toLowerCase();
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
  const [ispLayoutMode, setIspLayoutMode] = useState<IspLayoutMode>('desktop');
  const [submitting, setSubmitting] = useState(false);
  const [refreshingPrefill, setRefreshingPrefill] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [confirmEdits, setConfirmEdits] = useState(false);
  const [confirmCommentary, setConfirmCommentary] = useState(false);
  const [medListAttachment, setMedListAttachment] = useState<AlftMedListAttachment | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [swSignature, setSwSignature] = useState(''); // typed/auto name for electronic signature
  const [approveElectronicSignature, setApproveElectronicSignature] = useState(false);
  const [expectedVisitDate, setExpectedVisitDate] = useState('');
  const draftAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const [templatePdfUrl, setTemplatePdfUrl] = useState('');
  const [templatePdfLoading, setTemplatePdfLoading] = useState(false);
  const [templatePdfError, setTemplatePdfError] = useState('');
  const [templatePdfMode, setTemplatePdfMode] = useState('');
  const [supportPreviewOpen, setSupportPreviewOpen] = useState(false);
  const [supportPreview, setSupportPreview] = useState<{ url: string; name: string } | null>(null);
  const facilityNameFromMember = (member: KaiserMember | null | undefined) =>
    String(
      member?.prefillResolved?.p2_facility_name ||
        member?.prefillResolved?.isp_location_name ||
        member?.ispFacilityName ||
        member?.ispCurrentLocation ||
        ''
    ).trim();

  // ── Load assigned members from Firestore alft_assignments ─────────────────────

  const loadMembers = useCallback(async () => {
    if (!firestore || (!swEmail && !swId)) return;
    setLoadingMembers(true);
    try {
      const snaps = await Promise.all([
        swEmail
          ? getDocs(query(collection(firestore, 'alft_assignments'), where('assignedSwEmail', '==', swEmail)))
          : Promise.resolve(null as any),
        swId
          ? getDocs(query(collection(firestore, 'alft_assignments'), where('assignedSwId', '==', swId)))
          : Promise.resolve(null as any),
      ]);
      const docs = [...(snaps[0]?.docs || []), ...(snaps[1]?.docs || [])];
      if (docs.length > 0) {
        const byMemberId = new Map<string, KaiserMember>();
        docs.forEach((d: any) => {
          const data = d.data() as any;
          const resolved = (((data?.prefillVerification || {}) as any)?.resolvedFields || {}) as Record<string, unknown>;
          const pickPrefill = (...keys: string[]) => {
            for (const key of keys) {
              const value = String(resolved?.[key] || '').trim();
              if (value) return value;
            }
            return '';
          };
          const row: KaiserMember = {
            id: String(data.memberId || d.id).trim(),
            memberName: String(data.memberName || '').trim(),
            memberFirstName: String(data.memberFirstName || '').trim(),
            memberLastName: String(data.memberLastName || '').trim(),
            memberMrn: String(data.memberMrn || '').trim(),
            birthDate: pickPrefill('p1_dob') || String(data.birthDate || '').trim(),
            memberSex: String(data.memberSex || '').trim(),
            memberPrimaryLanguage: String(data.memberPrimaryLanguage || '').trim(),
            memberPhone: String(data.memberPhone || '').trim(),
            ispCurrentAddressStreet: pickPrefill('p2_current_street', 'isp_location_address') || String(data.ispCurrentAddressStreet || '').trim(),
            ispCurrentAddressCity: pickPrefill('p2_current_city', 'isp_location_city') || String(data.ispCurrentAddressCity || '').trim(),
            ispCurrentAddressState: pickPrefill('p2_current_state', 'isp_location_state') || String(data.ispCurrentAddressState || '').trim(),
            ispCurrentAddressZip: pickPrefill('p2_current_zip', 'isp_location_zip') || String(data.ispCurrentAddressZip || '').trim(),
            currentLocationType: pickPrefill('p2_current_type', 'isp_location_type') || String(data.currentLocationType || '').trim(),
            currentLocationTypeOther:
              pickPrefill('p2_current_type_other', 'p2_current_type', 'isp_location_type') ||
              String(data.currentLocationTypeOther || '').trim(),
            assessmentSite: String(data.assessmentSite || '').trim(),
            homeAddressStreet: String(data.homeAddressStreet || '').trim(),
            homeAddressCity: String(data.homeAddressCity || '').trim(),
            homeAddressState: String(data.homeAddressState || '').trim(),
            homeAddressZip: String(data.homeAddressZip || '').trim(),
            ispFacilityName: pickPrefill('p2_facility_name', 'isp_location_name') || String(data.ispFacilityName || '').trim(),
            ispCurrentLocation: pickPrefill('p2_facility_name', 'isp_location_name') || String(data.ispCurrentLocation || '').trim(),
            ispContactName: String(data.ispContactName || '').trim(),
            ispContactRelationship: sanitizeRelationshipLabel(data.ispContactRelationship),
            ispContactPhone: String(data.ispContactPhone || '').trim(),
            ispContactEmail: String(data.ispContactEmail || '').trim(),
            ispContact2First:
              pickPrefill('isp_contact_2_first') || String(data.ispContact2First || '').trim(),
            ispContact2Last:
              pickPrefill('isp_contact_2_last') || String(data.ispContact2Last || '').trim(),
            ispContact2Relationship:
              pickPrefill('isp_contact_2_relationship') || String(data.ispContact2Relationship || '').trim(),
            ispContact2Phone:
              pickPrefill('isp_contact_2_phone') || String(data.ispContact2Phone || '').trim(),
            ispContact2Email:
              pickPrefill('isp_contact_2_email') || String(data.ispContact2Email || '').trim(),
            ispContactConfirmDate: String(data.ispContactConfirmDate || '').trim(),
            assessorCmReferralDate: toYyyyMmDdFromAssignment(
              data.assessorCmReferralDate,
              data?.workflowInvites?.referralDateYmd,
              data?.workflowInvites?.invitedAt,
              data?.workflowStepsAt?.swInviteSentAt,
              data.assignedAt
            ),
            kaiserStatus: String(data.kaiserStatus || '').trim(),
            assignedSwEmail: String(data.assignedSwEmail || '').trim(),
            assignedSwName: String(data.assignedSwName || '').trim(),
            assignmentStatus: String(data.status || 'assigned').trim(),
            workflowStatus: String(data.workflowStatus || data.workflowStage || '').trim(),
            needsSwRevision: Boolean(data.needsSwRevision) || isReturnedForRevision(String(data.status || ''), String(data.workflowStatus || data.workflowStage || '')),
            returnedToSwReason: String(data.returnedToSwReason || '').trim(),
            latestIntakeId: String(data.latestIntakeId || '').trim(),
            submittedAtIso:
              parseAssignmentTimestamp(data.submittedAt) ||
              parseAssignmentTimestamp(data?.workflowStepsAt?.swSubmittedAt) ||
              parseAssignmentTimestamp(data?.workflowStepsAt?.swSubmittedSignedAt) ||
              undefined,
            prefillSourceMode: String(data.prefillSourceMode || '').trim(),
            prefillSourceLabel: String(data.prefillSourceLabel || '').trim(),
            prefillPurpose: String(data.prefillPurpose || '').trim(),
            alftPlanId: String(data.alftPlanId || '').trim(),
            expectedVisitDate: String(data.expectedVisitDate || data.alftExpectedVisitDate || '').trim(),
            swPortalSupportFiles: Array.isArray(data.swPortalSupportFiles) ? data.swPortalSupportFiles : [],
            medListAttachment: parseMedListAttachment(data.medListAttachment),
            prefillResolved: Object.fromEntries(
              Object.entries(resolved).map(([k, v]) => [k, String(v ?? '').trim()])
            ) as Record<string, string>,
          };
          if (
            row.id &&
            (row.assignmentStatus !== 'completed' ||
              isReturnedForRevision(row.assignmentStatus || '', row.workflowStatus))
          ) {
            byMemberId.set(row.id, row);
          }
        });
        const assigned = Array.from(byMemberId.values()).sort((a, b) => a.memberName.localeCompare(b.memberName));
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
  }, [firestore, swEmail, swId, toast]);

  const hydrateMemberFromLatestAssignment = useCallback(async (member: KaiserMember): Promise<KaiserMember> => {
    if (!firestore || !member?.id) return member;
    try {
      const snap = await getDoc(doc(firestore, 'alft_assignments', member.id));
      if (!snap.exists()) return member;
      const data = snap.data() as any;
      const resolved = (((data?.prefillVerification || {}) as any)?.resolvedFields || {}) as Record<string, unknown>;
      const pickPrefill = (...keys: string[]) => {
        for (const key of keys) {
          const value = String(resolved?.[key] || '').trim();
          if (value) return value;
        }
        return '';
      };
      return {
        ...member,
        birthDate: pickPrefill('p1_dob') || String(data.birthDate || member.birthDate || '').trim(),
        ispCurrentAddressStreet:
          pickPrefill('p2_current_street', 'isp_location_address') ||
          String(data.ispCurrentAddressStreet || member.ispCurrentAddressStreet || '').trim(),
        ispCurrentAddressCity:
          pickPrefill('p2_current_city', 'isp_location_city') ||
          String(data.ispCurrentAddressCity || member.ispCurrentAddressCity || '').trim(),
        ispCurrentAddressState:
          pickPrefill('p2_current_state', 'isp_location_state') ||
          String(data.ispCurrentAddressState || member.ispCurrentAddressState || '').trim(),
        ispCurrentAddressZip:
          pickPrefill('p2_current_zip', 'isp_location_zip') ||
          String(data.ispCurrentAddressZip || member.ispCurrentAddressZip || '').trim(),
        currentLocationType:
          pickPrefill('p2_current_type', 'isp_location_type') ||
          String(data.currentLocationType || member.currentLocationType || '').trim(),
        currentLocationTypeOther:
          pickPrefill('p2_current_type_other', 'p2_current_type', 'isp_location_type') ||
          String(data.currentLocationTypeOther || member.currentLocationTypeOther || '').trim(),
        ispFacilityName:
          pickPrefill('p2_facility_name', 'isp_location_name') ||
          String(data.ispFacilityName || member.ispFacilityName || '').trim(),
        ispCurrentLocation:
          pickPrefill('p2_facility_name', 'isp_location_name') ||
          String(data.ispCurrentLocation || member.ispCurrentLocation || '').trim(),
        ispContact2First:
          pickPrefill('isp_contact_2_first') ||
          String(data.ispContact2First || member.ispContact2First || '').trim(),
        ispContact2Last:
          pickPrefill('isp_contact_2_last') ||
          String(data.ispContact2Last || member.ispContact2Last || '').trim(),
        ispContact2Relationship:
          pickPrefill('isp_contact_2_relationship') ||
          String(data.ispContact2Relationship || member.ispContact2Relationship || '').trim(),
        ispContact2Phone:
          pickPrefill('isp_contact_2_phone') ||
          String(data.ispContact2Phone || member.ispContact2Phone || '').trim(),
        ispContact2Email:
          pickPrefill('isp_contact_2_email') ||
          String(data.ispContact2Email || member.ispContact2Email || '').trim(),
        assessorCmReferralDate:
          toYyyyMmDdFromAssignment(
            data.assessorCmReferralDate,
            data?.workflowInvites?.referralDateYmd,
            data?.workflowInvites?.invitedAt,
            data?.workflowStepsAt?.swInviteSentAt,
            data.assignedAt
          ) || member.assessorCmReferralDate,
        swPortalSupportFiles: Array.isArray(data.swPortalSupportFiles) ? data.swPortalSupportFiles : member.swPortalSupportFiles || [],
        medListAttachment: parseMedListAttachment(data.medListAttachment) || member.medListAttachment || null,
        assignmentStatus: String(data.status || member.assignmentStatus || 'assigned').trim(),
        workflowStatus: String(data.workflowStatus || data.workflowStage || member.workflowStatus || '').trim(),
        needsSwRevision:
          Boolean(data.needsSwRevision) ||
          isReturnedForRevision(
            String(data.status || member.assignmentStatus || ''),
            String(data.workflowStatus || data.workflowStage || member.workflowStatus || '')
          ),
        returnedToSwReason: String(data.returnedToSwReason || member.returnedToSwReason || '').trim(),
        latestIntakeId: String(data.latestIntakeId || member.latestIntakeId || '').trim(),
        prefillResolved: Object.fromEntries(
          Object.entries(resolved).map(([k, v]) => [k, String(v ?? '').trim()])
        ) as Record<string, string>,
      };
    } catch {
      return member;
    }
  }, [firestore]);

  useEffect(() => {
    if (swLoading || !isSocialWorker) return;
    void loadMembers();
  }, [isSocialWorker, loadMembers, swLoading]);

  useEffect(() => {
    setIspLayoutMode(readIspLayoutMode());
  }, []);

  useEffect(() => {
    if (!selectedMember) return;
    const facilityFromPrefill = facilityNameFromMember(selectedMember);
    if (!facilityFromPrefill) return;
    setAnswers((prev) => {
      const existing = String(prev.p2_facility_name || '').trim();
      if (existing) return prev;
      return { ...prev, p2_facility_name: facilityFromPrefill };
    });
  }, [
    selectedMember,
    selectedMember?.prefillResolved?.p2_facility_name,
    selectedMember?.prefillResolved?.isp_location_name,
    selectedMember?.ispFacilityName,
    selectedMember?.ispCurrentLocation,
  ]);

  // ── Select member ─────────────────────────────────────────────────────────────

  const selectMember = useCallback((m: KaiserMember) => {
    void (async () => {
      const latestMember = await hydrateMemberFromLatestAssignment(m);
      setSelectedMember(latestMember);
      setSubmitted(false);
      setMode('edit');
      setMedListAttachment(parseMedListAttachment(latestMember.medListAttachment) || null);
      setExpectedVisitDate(String(latestMember.expectedVisitDate || '').trim());
      setApproveElectronicSignature(false);
      const autoName =
        String(latestMember.assignedSwName || '').trim() || swName;
      setSwSignature(autoName);
      const base = buildDefaultAnswers();
      const localDraft = loadDraftLocally(latestMember.id);
      let cloudDraft: LocalDraftPayload | null = null;
      try {
        const idToken = (await auth?.currentUser?.getIdToken?.()) || '';
        if (idToken) cloudDraft = await fetchCloudDraft(idToken, latestMember.id);
      } catch {
        cloudDraft = null;
      }
      const draft = pickNewerDraft(localDraft, cloudDraft);

      // When returned for revision, prefer prior submitted answers over blank prefill.
      let priorAnswers: Record<string, string> | null = null;
      const needsRevision =
        Boolean(latestMember.needsSwRevision) ||
        isReturnedForRevision(latestMember.assignmentStatus || '', latestMember.workflowStatus);
      if (!draft && needsRevision && firestore && latestMember.latestIntakeId) {
        try {
          const intakeSnap = await getDoc(
            doc(firestore, 'standalone_upload_submissions', latestMember.latestIntakeId)
          );
          if (intakeSnap.exists()) {
            const intake = intakeSnap.data() as any;
            const packet =
              intake?.alftForm?.exactPacketAnswers ||
              intake?.exactPacketAnswers ||
              null;
            if (packet && typeof packet === 'object') {
              priorAnswers = Object.fromEntries(
                Object.entries(packet).map(([k, v]) => [k, String(v ?? '')])
              );
            }
          }
        } catch {
          // best-effort — fall back to prefill
        }
      }

      skipNextAutosaveRef.current = true;
      if (draft) {
        setAnswers(applyLatestCriticalPrefill(draft.answers, latestMember));
        if (draft.medListAttachment) setMedListAttachment(draft.medListAttachment);
        if (draft.expectedVisitDate) setExpectedVisitDate(draft.expectedVisitDate);
        setDraftSavedAt(draft.savedAt || null);
        // Keep local cache aligned with whichever draft won (phone ↔ computer).
        saveDraftLocally(latestMember.id, draft.answers, {
          medListAttachment: draft.medListAttachment,
          expectedVisitDate: draft.expectedVisitDate,
        });
        toast({
          title: 'Draft restored',
          description: cloudDraft && draft === cloudDraft
            ? 'Loaded your saved draft from the cloud (available on any device).'
            : 'Your saved draft has been loaded.',
        });
      } else if (priorAnswers) {
        setAnswers(
          applyLatestCriticalPrefill(
            { ...preFillFromMember(base, latestMember, swName), ...priorAnswers },
            latestMember
          )
        );
        setDraftSavedAt(null);
        toast({
          title: 'Revision loaded',
          description: latestMember.returnedToSwReason
            ? `Staff notes: ${latestMember.returnedToSwReason}`
            : 'Your previous answers were loaded. Edit, approve electronic signature, and resubmit.',
        });
      } else {
        setAnswers(applyLatestCriticalPrefill(preFillFromMember(base, latestMember, swName), latestMember));
        setDraftSavedAt(null);
        if (needsRevision) {
          toast({
            title: 'Needs revision',
            description: latestMember.returnedToSwReason
              ? `Staff notes: ${latestMember.returnedToSwReason}`
              : 'Please revise, approve electronic signature, and resubmit.',
          });
        }
      }
    })();
  }, [auth, firestore, hydrateMemberFromLatestAssignment, swName, toast]);

  const markMemberViewed = useCallback(async (memberId: string) => {
    if (!auth?.currentUser || !memberId) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      await fetch('/api/alft/workflow/sw-member-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, memberId }),
      }).catch(() => null);
    } catch {
      // best effort
    }
  }, [auth]);

  const refreshFromPrefill = useCallback(async () => {
    if (!selectedMember) return;
    setRefreshingPrefill(true);
    try {
      const latestMember = await hydrateMemberFromLatestAssignment(selectedMember);
      setSelectedMember(latestMember);
      setAnswers((prev) => {
        const merged = preFillFromMember({ ...prev }, latestMember, swName);
        return applyLatestCriticalPrefill(merged, latestMember);
      });
      const street = String(
        latestMember.prefillResolved?.p2_current_street ||
          latestMember.prefillResolved?.isp_location_address ||
          latestMember.ispCurrentAddressStreet ||
          ''
      ).trim();
      toast({
        title: 'Prefill refreshed',
        description: street
          ? `ALFT #3 now uses latest prefill values (street: ${street}).`
          : 'Latest prefill values pulled from assignment.',
      });
    } catch (e: any) {
      toast({
        title: 'Prefill refresh failed',
        description: e?.message || 'Could not refresh latest prefill values.',
        variant: 'destructive',
      });
    } finally {
      setRefreshingPrefill(false);
    }
  }, [hydrateMemberFromLatestAssignment, selectedMember, swName, toast]);

  // ── Answer helpers (dummy-preview identical editor behavior) ─────────────────

  const setSingleAnswer = (id: string, value: string) => {
    if (isIspAlftLockedField(id)) return;
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const toggleMultiAnswer = (id: string, value: string) => {
    if (isIspAlftLockedField(id)) return;
    setAnswers((prev) => {
      const current = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [id]: next };
    });
  };

  // ── Save draft ────────────────────────────────────────────────────────────────

  const saveDraft = useCallback(async (opts?: { silent?: boolean }) => {
    if (!selectedMember) return;
    const silent = Boolean(opts?.silent);
    saveDraftLocally(selectedMember.id, answers, { medListAttachment, expectedVisitDate });
    setDraftSaving(true);
    try {
      const idToken = (await auth?.currentUser?.getIdToken?.()) || '';
      if (!idToken) throw new Error('Sign in required to sync draft across devices.');
      const savedAt = await saveCloudDraft(idToken, selectedMember.id, answers, {
        medListAttachment,
        expectedVisitDate,
      });
      setDraftSavedAt(savedAt);
      if (!silent) {
        toast({
          title: 'Draft saved',
          description: 'Progress synced to the cloud — available on phone and computer.',
        });
      }
    } catch (e: any) {
      const now = new Date().toISOString();
      setDraftSavedAt(now);
      if (!silent) {
        toast({
          title: 'Draft saved on this device',
          description: e?.message
            ? `${e.message} Local copy kept; try Save Draft again when online.`
            : 'Saved locally. Cloud sync failed — try again when online.',
          variant: 'destructive',
        });
      }
    } finally {
      setDraftSaving(false);
    }
  }, [answers, auth, expectedVisitDate, medListAttachment, selectedMember, toast]);

  // Autosave to cloud so phone drafts appear on computer (and vice versa).
  useEffect(() => {
    if (!selectedMember?.id || submitted) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (draftAutosaveTimerRef.current) clearTimeout(draftAutosaveTimerRef.current);
    draftAutosaveTimerRef.current = setTimeout(() => {
      void saveDraft({ silent: true });
    }, 2500);
    return () => {
      if (draftAutosaveTimerRef.current) clearTimeout(draftAutosaveTimerRef.current);
    };
  }, [answers, medListAttachment, expectedVisitDate, saveDraft, selectedMember?.id, submitted]);

  const generateTemplatePreview = useCallback(async () => {
    if (mode !== 'preview' || !selectedMember) return;
    setTemplatePdfLoading(true);
    setTemplatePdfError('');
    try {
      const previewAnswers = applyLatestCriticalPrefill({ ...answers }, selectedMember);
      if (!String(previewAnswers.p2_facility_name || '').trim()) {
        previewAnswers.p2_facility_name = facilityNameFromMember(selectedMember);
      }
      const res = await fetch('/api/alft/template-fill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templatePath: ALFT_TEMPLATE_PATH, answers: previewAnswers }),
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
  }, [answers, mode, selectedMember]);

  useEffect(() => {
    void generateTemplatePreview();
  }, [generateTemplatePreview]);

  useEffect(() => {
    return () => {
      setTemplatePdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setConfirmEdits(false);
    setConfirmCommentary(false);
    setApproveElectronicSignature(false);
    const autoName =
      String(selectedMember?.assignedSwName || '').trim() || swName;
    if (autoName) setSwSignature(autoName);
  }, [selectedMember?.id, selectedMember?.assignedSwName, swName]);

  const handleSubmit = useCallback(async () => {
    if (!selectedMember || !auth?.currentUser) return;
    const assessmentDateRaw = String(answers.p1_assessment_date || '').trim();
    const assessmentDate = toMmDdYyyyOrRaw(assessmentDateRaw);
    if (!isRequiredMmDdYyyy(assessmentDate)) {
      toast({
        title: 'Assessment date required',
        description: 'Enter the ISP Assessment Date as MM/DD/YYYY before submitting.',
        variant: 'destructive',
      });
      return;
    }
    const signerName = swSignature.trim() || swName;
    if (!signerName) {
      toast({
        title: 'Signature name required',
        description: 'Your name is needed for the electronic signature notice.',
        variant: 'destructive',
      });
      return;
    }
    if (!approveElectronicSignature) {
      toast({
        title: 'Electronic signature required',
        description: 'Approve the electronic signature notice before submitting to admin review.',
        variant: 'destructive',
      });
      return;
    }
    if (!confirmEdits) {
      toast({
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” at the bottom before submitting to admin.',
        variant: 'destructive',
      });
      return;
    }
    if (!hasExtensiveCommentary(answers)) {
      toast({
        title: 'Extensive commentary required',
        description:
          'Complete the last-page Additional Details / Commentary with extensive notes that are directly relevant to care needs before submitting.',
        variant: 'destructive',
      });
      return;
    }
    if (!confirmCommentary) {
      toast({
        title: 'Commentary confirmation required',
        description:
          'Confirm that you included extensive commentary that is only directly relevant to care needs.',
        variant: 'destructive',
      });
      return;
    }
    const typedMeds = String(answers.p13_medication_table || '').trim();
    if (!typedMeds && !medListAttachment?.downloadURL) {
      toast({
        title: 'Medication list required',
        description: 'Type medications in the table and/or upload a med list PDF/image before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const firstName = String(selectedMember.memberFirstName || selectedMember.memberName.split(' ')[0] || '').trim();
      const lastName = String(selectedMember.memberLastName || selectedMember.memberName.split(' ').slice(1).join(' ') || '').trim();
      const signedAtIso = new Date().toISOString();
      const signedAtLabel = (() => {
        try {
          return new Date(signedAtIso).toLocaleString();
        } catch {
          return signedAtIso;
        }
      })();
      const electronicNotice = `Electronically signed by ${signerName} on ${signedAtLabel}`;

      // Keep assessor aligned to assigned SW; signature name only at end.
      const finalAnswers = {
        ...answers,
        p1_agency: AGENCY_NAME,
        p1_assessment_date: assessmentDate,
        p1_assessor_name:
          String(answers.p1_assessor_name || '').trim() ||
          String(selectedMember.assignedSwName || '').trim() ||
          swName,
        p14_print_name: signerName,
        p14_date: todayLocalKey(),
        p14_sw_signed_at: signedAtIso,
        p14_electronic_notice: electronicNotice,
      };
      if (!String(finalAnswers.p2_facility_name || '').trim()) {
        finalAnswers.p2_facility_name = facilityNameFromMember(selectedMember);
      }

      const body = {
        idToken,
        submissionMode: 'digital_form',
        uploadDate: todayLocalKey(),
        uploader: { displayName: swName, email: swEmail },
        member: {
          id: selectedMember.id,
          name: selectedMember.memberName,
          firstName,
          lastName,
          healthPlan: 'Kaiser',
          kaiserMrn: selectedMember.memberMrn || '',
          prefillSourceMode: selectedMember.prefillSourceMode || '',
          prefillSourceLabel: selectedMember.prefillSourceLabel || '',
          expectedVisitDate: expectedVisitDate || '',
        },
        alftForm: {
          formVersion: 'digital-v1',
          stage: 'digital',
          exactPacketAnswers: finalAnswers,
          transitionSummary: String(finalAnswers.p13_commentary_section || 'Digital ALFT form submitted by social worker.'),
          requestedActions: 'Review digital ALFT form. RN (Leslie) to add comments and sign. Manager (Deydry) to review and save as PDF for Jocelyn.',
          facilityName: String(finalAnswers.p2_facility_name || selectedMember.ispCurrentLocation || ''),
          priorityLevel: 'Routine',
          swSignature: signerName,
          swSignedAt: signedAtIso,
          swElectronicSignatureApproved: true,
          swSignatureMethod: 'electronic_attestation',
          medListAttachment: medListAttachment || null,
        },
        files: [], // digital form — no file upload required
      };

      const memberAtSubmit = selectedMember;
      setSubmitPending(true);

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
      try {
        await saveCloudDraft(idToken, memberAtSubmit.id, answers, { clear: true });
      } catch {
        // best-effort
      }
      setSubmitted(true);
      const nextName = String((data as any)?.nextInLine?.name || '').trim();
      const nextEmail = String((data as any)?.nextInLine?.email || '').trim();
      const nextRecipient = [nextName, nextEmail].filter(Boolean).join(' • ');
      toast({
        title: 'ALFT submitted',
        description: nextRecipient
          ? `${electronicNotice}. Sent to admin review (${nextRecipient}).`
          : `${electronicNotice}. Sent to admin review.`,
      });
    } catch (e: any) {
      setSubmitted(false);
      toast({ title: 'Submission failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setSubmitPending(false);
    }
  }, [
    answers,
    approveElectronicSignature,
    auth,
    confirmCommentary,
    confirmEdits,
    expectedVisitDate,
    firestore,
    medListAttachment,
    selectedMember,
    swEmail,
    swName,
    swSignature,
    toast,
  ]);

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

  const rnName = asText(answers.p14_rn_print_name);
  const rnDate = asText(answers.p14_rn_signed_at) || asText(answers.p14_date);
  const rnLicense = asText(answers.p14_license_number);
  const mswName = asText(answers.p14_print_name) || swSignature.trim() || asText(answers.p1_assessor_name) || swName;
  const mswDate = asText(answers.p14_sw_signed_at) || asText(answers.p14_date) || todayLocalKey();
  const mswElectronicTs = asText(answers.p14_sw_signed_at);
  const rnElectronicTs = asText(answers.p14_rn_signed_at);
  const selectedResolved = (selectedMember?.prefillResolved || {}) as Record<string, string>;
  const primaryIspContactFirst = String(selectedResolved.isp_contact_first || '').trim();
  const primaryIspContactLast = String(selectedResolved.isp_contact_last || '').trim();
  const primaryIspContactName =
    String(selectedMember?.ispContactName || '').trim() ||
    [primaryIspContactFirst, primaryIspContactLast].filter(Boolean).join(' ').trim();
  const primaryIspContactRelationship =
    sanitizeRelationshipLabel(selectedMember?.ispContactRelationship) ||
    sanitizeRelationshipLabel(selectedResolved.p1_other_responder_relationship);
  const primaryIspContactPhone =
    String(selectedMember?.ispContactPhone || '').trim() ||
    String(selectedResolved.isp_contact_phone || '').trim();
  const primaryIspContactEmail =
    String(selectedMember?.ispContactEmail || '').trim() ||
    String(selectedResolved.isp_contact_email || '').trim();
  const primaryIspContactLastVerified =
    String(selectedMember?.ispContactConfirmDate || '').trim() ||
    String(selectedResolved.isp_contact_confirm_date || '').trim();
  const hasPrimaryIspContact = Boolean(
    primaryIspContactName ||
      primaryIspContactRelationship ||
      primaryIspContactPhone ||
      primaryIspContactEmail ||
      primaryIspContactLastVerified
  );
  const secondaryIspContactName = [
    String(selectedMember?.ispContact2First || '').trim(),
    String(selectedMember?.ispContact2Last || '').trim(),
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  const hasSecondaryIspContact = Boolean(
    secondaryIspContactName ||
      String(selectedMember?.ispContact2Relationship || '').trim() ||
      String(selectedMember?.ispContact2Phone || '').trim() ||
      String(selectedMember?.ispContact2Email || '').trim()
  );
  const swPortalSupportFiles = Array.isArray(selectedMember?.swPortalSupportFiles)
    ? (selectedMember?.swPortalSupportFiles || [])
        .map((entry: any) => {
          const atMs = (() => {
            try {
              if (!entry?.uploadedAt) return 0;
              if (typeof entry.uploadedAt?.toMillis === 'function') return entry.uploadedAt.toMillis();
              if (typeof entry.uploadedAt?.toDate === 'function') return entry.uploadedAt.toDate().getTime();
              const t = new Date(String(entry.uploadedAt || '')).getTime();
              return Number.isNaN(t) ? 0 : t;
            } catch {
              return 0;
            }
          })();
          return {
            id: String(entry?.id || '').trim(),
            label: String(entry?.label || '').trim(),
            fileName: String(entry?.fileName || '').trim(),
            downloadURL: String(entry?.downloadURL || '').trim(),
            uploadedAtLabel: atMs ? new Date(atMs).toLocaleString() : '',
            atMs,
          };
        })
        .filter((entry) => Boolean(entry.downloadURL))
        .sort((a, b) => b.atMs - a.atMs)
    : [];
  const openSupportPreview = useCallback((url: string, name: string) => {
    if (!url) return;
    setSupportPreview({ url, name: name || 'Reference file' });
    setSupportPreviewOpen(true);
  }, []);

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
          <Button asChild variant="outline">
            <Link href="/sw-portal/home">Back to portal home</Link>
          </Button>
          <Button onClick={() => { setSelectedMember(null); setSubmitted(false); void loadMembers(); }}>
            Start Another
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
              Your ALFT manager team (led by Deydry) will assign Kaiser members to you once they are ready for assessment. Check back soon.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {filteredMembers.map((m) => {
            const hasDraft = Boolean(loadDraftLocally(m.id));
            const needsRevision =
              Boolean(m.needsSwRevision) ||
              isReturnedForRevision(m.assignmentStatus || '', m.workflowStatus);
            const submitted = isSubmittedAssignment(m.assignmentStatus || '', m.workflowStatus);
            const submittedLabel = formatShortDate(m.submittedAtIso);
            return (
              <div key={m.id} className="space-y-1">
                <div className="flex justify-end">
                  <Link
                    href="/sw-portal/alft-instructions"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    ALFT guidance for this application
                  </Link>
                </div>
                {submitted ? (
                  <div className="flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-semibold text-sm">
                      {m.memberName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.memberName}</span>
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Submitted{submittedLabel ? ` · ${submittedLabel}` : ''}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-emerald-800">
                        Sent to staff for review. No further action needed from you.
                      </div>
                    </div>
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      selectMember(m);
                      void markMemberViewed(m.id);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted ${
                      needsRevision
                        ? 'border-amber-300 bg-amber-50/80'
                        : 'bg-card'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold text-sm ${
                        needsRevision
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {m.memberName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.memberName}</span>
                        {needsRevision ? (
                          <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                            Needs revision — edit &amp; resubmit
                          </Badge>
                        ) : hasDraft ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300">
                            Draft saved
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                        {needsRevision && m.returnedToSwReason ? (
                          <span className="text-amber-900">Staff notes: {m.returnedToSwReason}</span>
                        ) : null}
                        {m.memberMrn && <span>MRN: {m.memberMrn}</span>}
                        {m.ispCurrentLocation && <span>{m.ispCurrentLocation}</span>}
                        {m.kaiserStatus && <span>Status: {m.kaiserStatus}</span>}
                        {m.expectedVisitDate && <span>Expected visit: {m.expectedVisitDate}</span>}
                      </div>
                    </div>
                    <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── ALFT form (edit + preview) ────────────────────────────────────────────────

  return (
    <div
      className={`alft-sw-tool mx-auto px-2 py-4 print:max-w-none print:px-0 print:py-0 ${
        ispLayoutMode === 'mobile' ? 'max-w-xl pb-8' : 'max-w-[8.5in]'
      }`}
    >
      {/* ── Toolbar ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3 print:hidden">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{selectedMember.memberName}</div>
          <div className="text-xs text-zinc-500 flex flex-wrap gap-2 mt-0.5">
            {selectedMember.memberMrn && <span>MRN: {selectedMember.memberMrn}</span>}
            {selectedMember.ispCurrentLocation && <span>• {selectedMember.ispCurrentLocation}</span>}
            {selectedMember.prefillSourceLabel && <span>• Prefill: {selectedMember.prefillSourceLabel}</span>}
            {draftSavedAt && (
              <span className="text-amber-600">
                • Draft synced{' '}
                {new Date(draftSavedAt).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
          {hasSecondaryIspContact ? (
            <div className="mt-1.5 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-900">
              ISP Contact 2: {secondaryIspContactName || '—'}
              {selectedMember.ispContact2Relationship ? ` • ${selectedMember.ispContact2Relationship}` : ''}
              {selectedMember.ispContact2Phone ? ` • ${selectedMember.ispContact2Phone}` : ''}
              {selectedMember.ispContact2Email ? ` • ${selectedMember.ispContact2Email}` : ''}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IspLayoutModeToggle
            mode={ispLayoutMode}
            onChange={(nextMode) => {
              setIspLayoutMode(nextMode);
              writeIspLayoutMode(nextMode);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setSelectedMember(null)}>
            ← Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refreshFromPrefill()} disabled={refreshingPrefill}>
            {refreshingPrefill ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh Prefill
          </Button>
          <Button variant="outline" size="sm" onClick={() => void saveDraft()} disabled={draftSaving}>
            {draftSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save Draft
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 print:hidden">
        <div className="text-sm font-semibold text-blue-950">ISP Contact Directory (Prefill)</div>
        <div className="text-xs text-blue-900 mt-0.5">
          Use these contacts when setting up ISP calls/visits. This block is informational and separate from ALFT form fields.
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded border bg-white p-2">
            <div className="text-xs font-semibold text-slate-800">Primary ISP Contact</div>
            <div className="mt-1 text-xs text-slate-700">
              <div>Name: <span className="font-medium">{primaryIspContactName || '—'}</span></div>
              <div>Relationship: <span className="font-medium">{primaryIspContactRelationship || '—'}</span></div>
              <div>Phone: <span className="font-medium">{primaryIspContactPhone || '—'}</span></div>
              <div>Email: <span className="font-medium">{primaryIspContactEmail || '—'}</span></div>
              <div>Last Verified: <span className="font-medium">{toMmDdYyyyOrRaw(primaryIspContactLastVerified) || '—'}</span></div>
            </div>
          </div>
          <div className="rounded border bg-white p-2">
            <div className="text-xs font-semibold text-slate-800">Secondary ISP Contact</div>
            <div className="mt-1 text-xs text-slate-700">
              <div>Name: <span className="font-medium">{secondaryIspContactName || '—'}</span></div>
              <div>
                Relationship:{' '}
                <span className="font-medium">
                  {sanitizeRelationshipLabel(selectedMember.ispContact2Relationship) || '—'}
                </span>
              </div>
              <div>Phone: <span className="font-medium">{selectedMember.ispContact2Phone || '—'}</span></div>
              <div>Email: <span className="font-medium">{selectedMember.ispContact2Email || '—'}</span></div>
            </div>
          </div>
        </div>
        {!hasPrimaryIspContact && !hasSecondaryIspContact ? (
          <div className="mt-2 text-xs text-amber-800">
            No ISP contacts were prefilled yet. Ask your ALFT manager to run prefill sync again.
          </div>
        ) : null}
      </div>

      <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 print:hidden">
        <div className="text-sm font-semibold text-emerald-950">Workflow Reference Files</div>
        <div className="text-xs text-emerald-900 mt-0.5">
          Files uploaded by your ALFT workflow team (e.g., 602, facesheet) for this member.
        </div>
        {swPortalSupportFiles.length ? (
          <div className="mt-2 space-y-1">
            {swPortalSupportFiles.map((f, idx) => (
              <div key={f.id || `${f.fileName}-${idx}`} className="flex flex-wrap items-center gap-2 text-xs text-emerald-900">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => openSupportPreview(f.downloadURL, f.label || f.fileName || 'Reference file')}
                >
                  View
                </Button>
                <span className="font-medium">{f.label || f.fileName || 'Reference file'}</span>
                {f.label && f.fileName && f.label !== f.fileName ? <span>({f.fileName})</span> : null}
                {f.uploadedAtLabel ? <span>• uploaded {f.uploadedAtLabel}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-amber-800">
            No workflow reference files uploaded yet.
          </div>
        )}
      </div>

      {/* ── Unified packet view: edit/preview in exact ALFT format ── */}
      {ispLayoutMode === 'mobile' ? (
        <div className="print:hidden">
          <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Mobile layout: one page at a time with larger tap targets. Switch back to Desktop anytime for the full
            letter-page view.
          </div>
          <SwStyleAlftEditor
            answers={answers}
            onChange={(id, value) => {
              if (isIspAlftLockedField(id)) return;
              setAnswers((prev) => ({ ...prev, [id]: value }));
            }}
            memberName={String(selectedMember.memberName || answers.p1_member_name || '').trim()}
            memberMrn={String(selectedMember.memberMrn || answers.p1_mrn || '').trim()}
            disabledFieldIds={ISP_ALFT_LOCKED_FIELD_IDS}
            layoutMode="mobile"
            memberId={selectedMember.id}
            medListAttachment={medListAttachment}
            onMedListAttachmentChange={setMedListAttachment}
            omitSignatureInputs
          />
        </div>
      ) : (
      <div className="space-y-4 print:space-y-0">
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
                    <div className={`question-block rounded-sm border border-zinc-300 px-2 py-1 ${isLongText(q) ? 'md:col-span-2 alft-col-span-2' : ''} ${isIspAlftLockedField(q.id) ? 'border-zinc-200 bg-zinc-50' : ''}`}>
                      <div className="font-semibold leading-tight">
                        {formatLabel(q.label)}
                        {q.required && !isIspAlftLockedField(q.id) ? (
                          <span className="ml-1 font-semibold text-red-600" title="Required">
                            *
                          </span>
                        ) : null}
                        {isIspAlftLockedField(q.id) ? (
                          <span className="ml-1 font-normal text-zinc-500">(N/A — not required for ISP)</span>
                        ) : null}
                      </div>
                      {mode === 'edit' && isIspAlftLockedField(q.id) ? (
                        <div className="mt-1 rounded border border-zinc-200 bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600">
                          {ISP_ALFT_LOCKED_FIELD_DEFAULT}
                        </div>
                      ) : null}
                      {mode === 'edit' && !isIspAlftLockedField(q.id) && q.type === 'text' ? (
                        <input
                          value={
                            q.id === 'p2_facility_name'
                              ? String(answers[q.id] || facilityNameFromMember(selectedMember) || '')
                              : String(answers[q.id] || '')
                          }
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          placeholder={q.placeholder || undefined}
                          required={Boolean(q.required)}
                          aria-required={Boolean(q.required)}
                          className={`mt-1 h-7 w-full rounded border bg-white px-2 text-[10px] ${
                            q.id === 'p1_assessment_date' &&
                            !isRequiredMmDdYyyy(toMmDdYyyyOrRaw(String(answers[q.id] || '')))
                              ? 'border-amber-400'
                              : q.required && !String(answers[q.id] || '').trim()
                                ? 'border-amber-400'
                                : 'border-zinc-300'
                          }`}
                        />
                      ) : null}
                      {mode === 'edit' && !isIspAlftLockedField(q.id) && q.type === 'textarea' ? (
                        <textarea
                          value={String(answers[q.id] || '')}
                          onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                          rows={isLargeCommentary(q) ? 20 : Math.min(Math.max(q.rows || 3, 3), 6)}
                          className={`mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-[10px] ${isLargeCommentary(q) ? 'min-h-[420px]' : ''}`}
                        />
                      ) : null}
                      {q.id === 'p13_medication_table' ? (
                        <div className="mt-2 print:mt-3">
                          <AlftMedListUpload
                            memberId={selectedMember.id}
                            attachment={medListAttachment}
                            onChange={setMedListAttachment}
                            readOnly={mode !== 'edit'}
                          />
                        </div>
                      ) : null}
                      {mode === 'edit' && !isIspAlftLockedField(q.id) && (q.type === 'radio' || q.type === 'select') && q.options?.length ? (
                        <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => (
                            <label key={`sw-edit-opt-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                              <input
                                type="radio"
                                name={`sw-edit-${q.id}`}
                                checked={String(answers[q.id] || '') === opt.value}
                                onChange={() => setSingleAnswer(q.id, opt.value)}
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                      {mode === 'edit' && !isIspAlftLockedField(q.id) && q.type === 'checkboxGroup' && q.options?.length ? (
                        <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
                          {q.options.map((opt) => {
                            const selected = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value);
                            return (
                              <label key={`sw-edit-check-${q.id}-${opt.value}`} className="inline-flex items-center gap-1.5 text-[9.5px]">
                                <input type="checkbox" checked={selected} onChange={() => toggleMultiAnswer(q.id, opt.value)} />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                      {mode === 'preview' && isOptionQ(q) && q.options?.length ? (
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
                      ) : mode === 'preview' ? (
                        <div className={`answer-line mt-1 pb-0.5 text-zinc-900 whitespace-pre-wrap ${isMovedTextQuestion(q.id) ? 'section-notes-answer' : 'border-b border-zinc-500'} ${isLargeCommentary(q) ? 'large-commentary-box' : ''}`}>
                          {q.id === 'p2_facility_name'
                            ? asText(answers[q.id]) || facilityNameFromMember(selectedMember) || ' '
                            : asText(answers[q.id]) || ' '}
                        </div>
                      ) : null}
                      {mode === 'preview' && q.type === 'select' && q.options?.length ? (
                        <div className="mt-0.5 text-[9px] text-zinc-600">Selected: {optionLabel(q, String(answers[q.id] || ''))}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Signature section on last page only */}
              {layout.number === 13 && (
                <div className="signature-section mt-3 space-y-2 text-[10px]">
                  <div className="alft-subsection-title">Signature Section</div>
                  <div className="signature-block">
                    <div className="signature-title">MSW Signature</div>
                    <div className="signature-grid">
                      <div><div className="signature-label">Name</div><div className="signature-line">{mswName || ' '}</div></div>
                      <div><div className="signature-label">Date</div><div className="signature-line">{mswDate || ' '}</div></div>
                      <div className="md:col-span-2">
                        <div className="signature-label">Electronic signature notice</div>
                        <div className="signature-line">
                          {asText(answers.p14_electronic_notice) ||
                            (mswElectronicTs
                              ? (() => {
                                  const ms = Date.parse(mswElectronicTs);
                                  return Number.isFinite(ms)
                                    ? `Electronically signed on ${new Date(ms).toLocaleString()}`
                                    : `Electronically signed on ${mswElectronicTs}`;
                                })()
                              : 'Pending — approve electronic signature below to submit')}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="signature-block">
                    <div className="signature-title">RN Signature</div>
                    <div className="signature-grid">
                      <div><div className="signature-label">Name</div><div className="signature-line">{rnName || ' '}</div></div>
                      <div><div className="signature-label">Date</div><div className="signature-line">{rnDate || ' '}</div></div>
                      <div><div className="signature-label">License Number</div><div className="signature-line">{rnLicense || ' '}</div></div>
                      <div className="md:col-span-2">
                        <div className="signature-label">Electronic timestamp</div>
                        <div className="signature-line">
                          {rnElectronicTs
                            ? (() => {
                                const ms = Date.parse(rnElectronicTs);
                                return Number.isFinite(ms) ? new Date(ms).toLocaleString() : rnElectronicTs;
                              })()
                            : 'Pending'}
                        </div>
                      </div>
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
        {medListAttachment?.downloadURL ? (
          <section className="alft-page border border-zinc-300 bg-white p-5">
            <div className="mb-2 border-b border-zinc-400 pb-1.5 text-center text-sm font-semibold">
              Attached medication list
            </div>
            <p className="text-xs text-zinc-700">
              A medication list file was uploaded and is attached at the end of this ALFT.
            </p>
            <a
              href={medListAttachment.downloadURL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
            >
              <FileText className="h-4 w-4" />
              {medListAttachment.fileName || 'Open medication list'}
            </a>
          </section>
        ) : null}
      </div>
      )}

      {/* ── Dedicated E-sign + submit section (end only) ───────────────────────── */}
      <div className={`mt-4 rounded-md border bg-white p-4 print:hidden ${ispLayoutMode === 'mobile' ? 'pb-28' : ''}`}>
        <div className="mb-3">
          <div className="text-sm font-semibold">Electronic signature (end of form)</div>
          <div className="text-xs text-zinc-500">
            Your name is filled in automatically. Approve the electronic signature notice below to submit to admin
            review — no drawing pad required.
          </div>
        </div>
        <div className={`grid grid-cols-1 gap-3 ${ispLayoutMode === 'mobile' ? '' : 'md:grid-cols-2'}`}>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">Expected visit date</label>
            <input
              type="date"
              value={expectedVisitDate}
              onChange={(e) => setExpectedVisitDate(e.target.value)}
              className={`w-full rounded border border-zinc-300 bg-white px-2 ${
                ispLayoutMode === 'mobile' ? 'h-11 text-base' : 'h-9 text-sm'
              }`}
              title="Expected visit date (required for RN Visit Assigner reminders)"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-700">Printed name (auto-filled)</label>
            <input
              type="text"
              value={swSignature}
              onChange={(e) => setSwSignature(e.target.value)}
              placeholder="Your full legal name…"
              className={`w-full rounded border border-zinc-300 bg-white px-2 placeholder:text-zinc-400 ${
                ispLayoutMode === 'mobile' ? 'h-11 text-base' : 'h-9 text-sm'
              }`}
              title="Confirm your name for the electronic signature"
            />
          </div>
        </div>
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
          <div className="font-semibold">Electronic signature notice</div>
          <div className="mt-1 text-xs leading-relaxed">
            {swSignature.trim() || swName
              ? `Electronically signed by ${swSignature.trim() || swName} (timestamp applied on submit)`
              : 'Your name will appear here when loaded.'}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50/70 px-3 py-2">
          <Checkbox
            id="sw-approve-esign"
            checked={approveElectronicSignature}
            onCheckedChange={(v) => setApproveElectronicSignature(Boolean(v))}
            disabled={submitting}
          />
          <Label htmlFor="sw-approve-esign" className="text-sm leading-relaxed text-zinc-800">
            I approve this electronic signature. Submitting records that I electronically signed this ALFT under the
            name shown above.
          </Label>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
          <Checkbox
            id="sw-confirm-edits"
            checked={confirmEdits}
            onCheckedChange={(v) => setConfirmEdits(Boolean(v))}
            disabled={submitting}
          />
          <Label htmlFor="sw-confirm-edits" className="text-sm leading-relaxed text-zinc-800">
            I confirm these edits are complete and accurate before submitting to the next step (admin review).
          </Label>
        </div>
        <div className="mt-2 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-2">
          <Checkbox
            id="sw-confirm-commentary"
            checked={confirmCommentary}
            onCheckedChange={(v) => setConfirmCommentary(Boolean(v))}
            disabled={submitting || !hasExtensiveCommentary(answers)}
          />
          <Label htmlFor="sw-confirm-commentary" className="text-sm leading-relaxed text-zinc-800">
            I verify I included <span className="font-semibold">extensive commentary</span> on the last page of the
            ALFT (Additional Details / Commentary) that is <span className="font-semibold">only directly relevant to
            care needs</span> and tier-level decisions.
            {!hasExtensiveCommentary(answers) ? (
              <span className="mt-1 block text-xs text-amber-800">
                Commentary looks too short — expand the last-page notes before confirming.
              </span>
            ) : null}
          </Label>
        </div>
        <div className={`mt-3 flex gap-2 ${ispLayoutMode === 'mobile' ? 'flex-col' : 'items-center justify-between'}`}>
          <div className="text-xs text-zinc-500">
            Next step after signature: ALFT manager review queue.
            {!isRequiredMmDdYyyy(toMmDdYyyyOrRaw(String(answers.p1_assessment_date || ''))) ? (
              <span className="ml-1 text-amber-700">Assessment Date required: MM/DD/YYYY.</span>
            ) : null}
            {!hasExtensiveCommentary(answers) ? (
              <span className="ml-1 text-amber-700">Extensive last-page commentary required.</span>
            ) : null}
            {!String(answers.p13_medication_table || '').trim() && !medListAttachment?.downloadURL ? (
              <span className="ml-1 text-amber-700">Type meds and/or upload med list.</span>
            ) : null}
            {!approveElectronicSignature ? (
              <span className="ml-1 text-amber-700">Approve electronic signature required.</span>
            ) : null}
            {!confirmEdits ? <span className="ml-1 text-amber-700">Confirm edits required.</span> : null}
            {!confirmCommentary ? <span className="ml-1 text-amber-700">Confirm commentary required.</span> : null}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !confirmEdits ||
              !confirmCommentary ||
              !approveElectronicSignature ||
              !hasExtensiveCommentary(answers) ||
              (!String(answers.p13_medication_table || '').trim() && !medListAttachment?.downloadURL) ||
              !(swSignature.trim() || swName) ||
              !isRequiredMmDdYyyy(toMmDdYyyyOrRaw(String(answers.p1_assessment_date || '')))
            }
            className={`bg-green-600 hover:bg-green-700 text-white ${ispLayoutMode === 'mobile' ? 'h-11 w-full' : ''}`}
          >
            {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            {submitting ? 'Submitting…' : 'Sign & Submit to Admin'}
          </Button>
        </div>
      </div>

      {/* ── Print/PDF styles ── */}
      <Dialog open={supportPreviewOpen} onOpenChange={setSupportPreviewOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{supportPreview?.name || 'Reference file'}</DialogTitle>
          </DialogHeader>
          {supportPreview?.url ? (
            <MultiPageFilePreview url={supportPreview.url} name={supportPreview.name} />
          ) : null}
        </DialogContent>
      </Dialog>
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
        .large-commentary-box { min-height: 420px; border: 1px solid #71717a; padding: 6px; background: #fafafa; }
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
