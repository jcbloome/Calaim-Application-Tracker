'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { AlertTriangle, CheckCircle2, ClipboardList, Database, Download, ExternalLink, Loader2, RefreshCw, RotateCcw, Search, Send, Upload, User } from 'lucide-react';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { parseMedListAttachment, type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';
import { Badge } from '@/components/ui/badge';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth, useFirestore, useStorage, useUser } from '@/firebase';
import {
  applyIspVisitLocationFromCaspio,
  compareIspLocationToRcfe,
  formatIspContactBlockForSwEmail,
  formatIspVisitTypeForSwEmail,
  getIspLocationSnapshot,
  getRcfeLocationSnapshot,
  normalizeIspAssessmentPurpose,
  summarizeIspVisitLocationFromCaspio,
  type IspVisitLocationSource,
} from '@/lib/isp-visit-location';
import { useToast } from '@/hooks/use-toast';
import {
  ISP_ALFT_LOCKED_FIELD_IDS,
  applyIspAlftLockedFieldDefaults,
  isIspAlftLockedField,
} from '@/lib/isp-alft-field-rules';
import { SW_LOGIN_URL } from '@/lib/app-urls';
import { buildIspWorkflowActivityEntry } from '@/lib/isp-workflow-activity';
import {
  type IspLayoutMode,
  readIspLayoutMode,
  writeIspLayoutMode,
} from '@/lib/isp-layout-mode';

const toIso = (value: unknown): string => {
  if (!value) return '';
  if (typeof (value as any)?.toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return '';
    }
  }
  if (typeof (value as any)?.toMillis === 'function') {
    try {
      return new Date((value as any).toMillis()).toISOString();
    } catch {
      return '';
    }
  }
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};

const formatWhen = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

const isUsableSwEmail = (raw: unknown) => {
  const email = clean(raw).toLowerCase();
  if (!email || !email.includes('@')) return false;
  if (email.endsWith('@example.com') || email.endsWith('@example.org') || email.endsWith('@test.com')) {
    return false;
  }
  return true;
};

const formatSwEmailBodyPreviewHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');

const swFirstNameOf = (name: string) => {
  const raw = clean(name) || 'Social Worker';
  const part = raw.includes(',') ? raw.split(',', 2)[1] : raw.split(/\s+/, 2)[0];
  return clean(part).split(/\s+/, 2)[0] || 'Social Worker';
};

type AnswerValue = string | string[];
type AnswerMap = Record<string, AnswerValue>;

type KaiserMember = {
  id?: string;
  Client_ID2?: string;
  client_ID2?: string;
  memberName?: string;
  memberFirstName?: string;
  memberLastName?: string;
  memberMrn?: string;
  memberCounty?: string;
  Kaiser_Status?: string;
  CalAIM_Status?: string;
  [key: string]: unknown;
};

type StaffOption = {
  uid: string;
  email: string;
  label: string;
  role: string;
  isRn?: boolean;
  isAlftIspReviewer?: boolean;
};

type ActiveIntake = {
  id: string;
  memberName?: string;
  medicalRecordNumber?: string;
  workflowStatus?: string;
  workflowStage?: string;
  uploaderName?: string;
  uploaderEmail?: string;
  alftStaffName?: string;
  alftStaffEmail?: string;
  alftRnName?: string;
  alftRnEmail?: string;
  alftForm?: {
    exactPacketAnswers?: Record<string, AnswerValue>;
    swSignature?: string | null;
    swSignedAt?: string | null;
  };
  alftSignature?: Record<string, any>;
};

type DownloadLog = {
  id: string;
  downloadName: string;
  memberName: string;
  createdAt: string;
  staffName: string;
};

type SwPortalSupportFile = {
  id: string;
  label: string;
  fileName: string;
  downloadURL: string;
  uploadedAtLabel: string;
};

const AGENCY_NAME = 'Connections Care Home Consultants';
const DEFAULT_RN_EMAIL = 'leslie@carehomefinders.com';

const REQUIRED_CASPIO_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'p1_member_name', label: 'Member Name' },
  { id: 'p1_mrn', label: 'MRN (MCP_CIN)' },
  { id: 'p1_dob', label: 'Date of Birth' },
  { id: 'p1_assessor_name', label: 'Social Worker / Assessor' },
  { id: 'isp_facility', label: 'Facility / ISP Location' },
  { id: 'isp_address', label: 'ISP Address' },
  { id: 'isp_city', label: 'ISP City' },
  { id: 'isp_contact_name', label: 'ISP Contact Name' },
  { id: 'isp_contact_phone', label: 'ISP Contact Phone (Caspio ISP_Contact_Phone)' },
];

/** Resolve required checklist values from ISP fields, with RCFE as fallback for location. */
const resolveRequiredCaspioFieldValue = (
  fieldId: string,
  resolvedPreview: Record<string, string>,
  answers: AnswerMap,
  caspioSource: Record<string, unknown>
): string => {
  const fromResolved = (...ids: string[]) => {
    for (const id of ids) {
      const v = clean(resolvedPreview[id] || answers[id]);
      if (v) return v;
    }
    return '';
  };
  const isp = getIspLocationSnapshot(caspioSource || {});
  const rcfe = getRcfeLocationSnapshot(caspioSource || {});

  switch (fieldId) {
    case 'p1_member_name':
    case 'p1_mrn':
    case 'p1_dob':
    case 'p1_assessor_name':
      return fromResolved(fieldId);
    case 'isp_facility':
      return (
        fromResolved('p2_facility_name', 'p2_current_type_other') ||
        isp.name ||
        isp.type ||
        rcfe.name ||
        ''
      );
    case 'isp_address':
      return fromResolved('p2_current_street', 'isp_contact_street') || isp.street || rcfe.street || '';
    case 'isp_city':
      return fromResolved('p2_current_city', 'isp_contact_city') || isp.city || rcfe.city || '';
    case 'isp_contact_name': {
      const first = fromResolved('isp_contact_first');
      const last = fromResolved('isp_contact_last');
      const combined = `${first} ${last}`.trim();
      return (
        fromResolved('isp_contact_name', 'p1_other_responder_name') ||
        combined ||
        clean(caspioSource?.ISP_Contact_Name || caspioSource?.RCFE_Admin_Name) ||
        rcfe.name ||
        ''
      );
    }
    case 'isp_contact_phone':
      // Must be Caspio ISP_Contact_Phone (RCFE front-desk phone is OK once stored there).
      return fromResolved('isp_contact_phone') || clean(caspioSource?.ISP_Contact_Phone) || isp.phone || '';
    default:
      return fromResolved(fieldId);
  }
};

const clean = (value: unknown) => String(value || '').trim();
const clientIdOf = (member: KaiserMember) => clean(member.Client_ID2 || member.client_ID2);
const toName = (member: KaiserMember) => {
  const first = clean(member.memberFirstName);
  const last = clean(member.memberLastName);
  if (first || last) return `${first} ${last}`.trim();
  return clean(member.memberName) || 'Member';
};
/** Normalize DOB / dates to MM-DD-YYYY (handles ISO datetimes from member data). */
const toMmDdYyyy = (value: unknown) => {
  const raw = clean(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}-${iso[1]}`;
  const us = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (us) return `${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}-${us[3]}`;
  return raw;
};
const buildBlankAnswers = (): AnswerMap => {
  const next = createInitialExactAlftAnswers() as AnswerMap;
  next.p1_agency = AGENCY_NAME;
  return next;
};

const parseSwPortalSupportFiles = (raw: unknown): SwPortalSupportFile[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      const uploadedAtIso = toIso(entry?.uploadedAt || entry?.uploadedAtIso || '');
      return {
        id: clean(entry?.id),
        label: clean(entry?.label),
        fileName: clean(entry?.fileName),
        downloadURL: clean(entry?.downloadURL),
        uploadedAtLabel: uploadedAtIso ? formatWhen(uploadedAtIso) : '',
      };
    })
    .filter((entry) => Boolean(entry.downloadURL));
};

type PriorSwInviteInfo = {
  memberId: string;
  memberName: string;
  invitedAt: string;
  invitedTo: string;
  statusLabel: string;
  hasSubmission: boolean;
};

const workflowStatusLabel = (ws: string, status: string) => {
  const raw = `${ws} ${status}`.toLowerCase();
  if (raw.includes('returned_to_sw')) return 'Returned to SW for resubmission';
  if (raw.includes('returned_to_staff') || raw.includes('returned_to_admin') || raw.includes('waiting_staff')) {
    return 'Returned to admin/staff for edits';
  }
  if (raw.includes('returned_to_rn') || raw.includes('waiting_rn_revision')) {
    return 'Returned to RN for edits';
  }
  if (raw.includes('completed') || raw.includes('manager_review_complete') || raw.includes('ready_to_send')) {
    return 'Completed / ready to send';
  }
  if (raw.includes('awaiting_rn')) return 'Awaiting RN';
  if (raw.includes('awaiting_kaiser_manager_final')) return 'Awaiting final review';
  if (raw.includes('awaiting_manager') || raw.includes('awaiting_sw_signature')) return 'In admin review';
  if (raw.includes('sw_form')) return 'SW form in progress';
  if (raw.includes('sw_invited')) return 'Invited — awaiting SW submit';
  return ws.replace(/_/g, ' ') || status.replace(/_/g, ' ') || 'Already in ISP workflow';
};

const detectPriorSwInvite = (data: Record<string, unknown> | null | undefined): Omit<
  PriorSwInviteInfo,
  'memberId' | 'memberName'
> | null => {
  if (!data) return null;
  const ws = clean(data.workflowStatus);
  const status = clean(data.status);
  const invitedAt =
    toIso((data as any)?.workflowInvites?.invitedAt) ||
    toIso((data as any)?.workflowStepsAt?.swInviteSentAt) ||
    '';
  const emailLog = Array.isArray((data as any)?.swEmailDeliveryLog)
    ? ((data as any).swEmailDeliveryLog as any[])
    : [];
  const sentLog = emailLog.find((entry) => clean(entry?.status).toLowerCase() === 'sent');
  const inviteSent =
    Boolean((data as any)?.workflowSteps?.swInviteSent) ||
    Boolean(invitedAt) ||
    Boolean(sentLog) ||
    ws.toLowerCase().includes('sw_invited') ||
    ws.toLowerCase().includes('sw_form') ||
    status.toLowerCase().includes('sw_invited');
  if (!inviteSent) return null;
  const invitedTo =
    clean((data as any)?.assignedSwEmail) ||
    clean(sentLog?.recipientEmail) ||
    '';
  const hasSubmission = Boolean(
    toIso((data as any)?.submittedAt) ||
      toIso((data as any)?.workflowStepsAt?.swSubmittedAt) ||
      toIso((data as any)?.workflowStepsAt?.swSubmittedSignedAt) ||
      Boolean((data as any)?.workflowSteps?.swSubmittedSigned)
  );
  return {
    invitedAt: invitedAt || clean(sentLog?.atIso) || '',
    invitedTo,
    statusLabel: workflowStatusLabel(ws, status),
    hasSubmission,
  };
};

type AssignmentInviteActivity = {
  invitedAt?: string;
  lastInvitedAt?: string;
  inviteSendCount?: number;
  invitedTo?: string;
  viewedAt?: string;
  viewedBy?: string;
  submittedAt?: string;
  signedAt?: string;
  emailLog?: Array<{ status?: string; recipientEmail?: string; atIso?: string; isResend?: boolean }>;
};

const buildAssignmentInviteActivity = (assignment: Record<string, any> | null | undefined): AssignmentInviteActivity => {
  if (!assignment) return {};
  const emailLog = Array.isArray(assignment?.swEmailDeliveryLog)
    ? (assignment.swEmailDeliveryLog as any[])
        .map((entry) => ({
          status: clean(entry?.status),
          recipientEmail: clean(entry?.recipientEmail),
          atIso: clean(entry?.atIso) || toIso(entry?.at) || '',
          isResend: Boolean(entry?.isResend),
        }))
        .filter((entry) => entry.atIso || entry.status)
    : [];
  const sentEntries = emailLog
    .filter((entry) => clean(entry.status).toLowerCase() === 'sent')
    .slice()
    .sort((a, b) => Date.parse(a.atIso || '') - Date.parse(b.atIso || ''));
  const firstSentAt = sentEntries[0]?.atIso || '';
  const lastSentAt = sentEntries[sentEntries.length - 1]?.atIso || '';
  const invitedAt =
    toIso(assignment?.workflowInvites?.firstInvitedAt) ||
    toIso(assignment?.workflowInvites?.invitedAt) ||
    firstSentAt ||
    toIso(assignment?.workflowStepsAt?.swInviteSentAt) ||
    '';
  const lastInvitedAt =
    toIso(assignment?.workflowInvites?.lastInvitedAt) ||
    lastSentAt ||
    toIso(assignment?.workflowStepsAt?.swInviteSentAt) ||
    invitedAt;
  const inviteSendCountRaw = Number(assignment?.workflowInvites?.inviteSendCount);
  const inviteSendCount =
    Number.isFinite(inviteSendCountRaw) && inviteSendCountRaw > 0
      ? inviteSendCountRaw
      : Math.max(sentEntries.length, invitedAt ? 1 : 0);
  return {
    invitedAt,
    lastInvitedAt: lastInvitedAt || invitedAt,
    inviteSendCount,
    invitedTo:
      clean(assignment.assignedSwEmail) ||
      clean(sentEntries[sentEntries.length - 1]?.recipientEmail) ||
      clean(emailLog.find((e) => e.status === 'sent')?.recipientEmail),
    viewedAt: toIso(assignment.swPortalLastViewedAt),
    viewedBy: clean(assignment.swPortalLastViewedByName) || clean(assignment.swPortalLastViewedByEmail),
    submittedAt: toIso(assignment.submittedAt) || toIso(assignment?.workflowStepsAt?.swSubmittedAt) || '',
    signedAt: toIso(assignment?.workflowStepsAt?.swSubmittedSignedAt) || toIso(assignment.swSignedAt) || '',
    emailLog,
  };
};

const inferClinicalFileLabel = (fileName: string, explicitLabel?: string) => {
  const label = clean(explicitLabel);
  if (label) return label;
  const lower = clean(fileName).toLowerCase();
  if (/\b602\b/.test(lower)) return '602';
  if (lower.includes('facesheet') || lower.includes('face sheet') || lower.includes('face-sheet')) {
    return 'Facesheet';
  }
  if (lower.includes('h&p') || lower.includes('h and p') || lower.includes('history and physical')) {
    return 'H&P';
  }
  if (lower.includes('mar')) return 'MAR';
  return '';
};

export default function IspWorkflowToolsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading ISP Workflow…
        </div>
      }
    >
      <IspWorkflowToolsPageInner />
    </Suspense>
  );
}

function IspWorkflowToolsPageInner() {
  const { toast } = useToast();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const intakeIdFromQuery = clean(searchParams.get('intakeId'));
  const memberIdFromQuery = clean(searchParams.get('memberId'));
  const keepRouting = clean(searchParams.get('keepRouting')) === '1';

  // Email / Action Item deep links for submitted ALFTs open the ready-review queue (not Caspio routing).
  useEffect(() => {
    if (!intakeIdFromQuery || keepRouting) return;
    router.replace(
      `/admin/alft-tracker?managerActions=1&edit=${encodeURIComponent(intakeIdFromQuery)}`
    );
  }, [intakeIdFromQuery, keepRouting, router]);

  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [queryText, setQueryText] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSyncingMembersCache, setIsSyncingMembersCache] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [resolvedPreview, setResolvedPreview] = useState<Record<string, string>>({});
  const [previewMemberId, setPreviewMemberId] = useState('');
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');
  const [answers, setAnswers] = useState<AnswerMap>(() => buildBlankAnswers());
  const [medListAttachment, setMedListAttachment] = useState<AlftMedListAttachment | null>(null);
  const [caspioFilledIds, setCaspioFilledIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [socialWorkerName, setSocialWorkerName] = useState('');
  const [socialWorkerEmail, setSocialWorkerEmail] = useState('');
  const [confirmedSw, setConfirmedSw] = useState(false);
  const [swPortalActive, setSwPortalActive] = useState<boolean | null>(null);
  const [checkingSwPortal, setCheckingSwPortal] = useState(false);
  const [confirmedFirstReviewer, setConfirmedFirstReviewer] = useState(false);
  const [confirmedRn, setConfirmedRn] = useState(false);
  const [assessmentPurpose, setAssessmentPurpose] = useState<'initial' | 'change_condition' | 'review' | ''>('');
  const [confirmedPurpose, setConfirmedPurpose] = useState(false);
  const [visitLocationSource, setVisitLocationSource] = useState<IspVisitLocationSource | ''>('');
  const [askCaregiverOnArrival, setAskCaregiverOnArrival] = useState(false);
  const [caspioSourcePreview, setCaspioSourcePreview] = useState<Record<string, unknown>>({});
  const [confirmedIspLocation, setConfirmedIspLocation] = useState(false);
  const [ispLocationUpdating, setIspLocationUpdating] = useState(false);
  const [confirmedClinicalUploads, setConfirmedClinicalUploads] = useState(false);
  const [swPortalSupportFiles, setSwPortalSupportFiles] = useState<SwPortalSupportFile[]>([]);
  const [clinicalUploadLabel, setClinicalUploadLabel] = useState('');
  const [clinicalUploadFiles, setClinicalUploadFiles] = useState<File[]>([]);
  const [clinicalUploading, setClinicalUploading] = useState(false);
  const [clinicalUploadProgress, setClinicalUploadProgress] = useState(0);
  const [formPreviewVerified, setFormPreviewVerified] = useState(false);
  const [ispLayoutMode, setIspLayoutMode] = useState<IspLayoutMode>('desktop');

  useEffect(() => {
    setIspLayoutMode(readIspLayoutMode());
  }, []);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [socialWorkerCounty, setSocialWorkerCounty] = useState('');
  const [memberCounty, setMemberCounty] = useState('');
  const [routingAutosaveLabel, setRoutingAutosaveLabel] = useState('');
  const [invitePreviewOpen, setInvitePreviewOpen] = useState(false);
  const [invitePreviewBody, setInvitePreviewBody] = useState('');
  const lastAutosavedRoutingKey = useRef('');
  const visitLocationSourceRef = useRef(visitLocationSource);
  const assessmentPurposeRef = useRef(assessmentPurpose);
  visitLocationSourceRef.current = visitLocationSource;
  assessmentPurposeRef.current = assessmentPurpose;

  // Keep form purpose in sync with step-4 selection (never leave blank / N/A).
  useEffect(() => {
    const purpose = normalizeIspAssessmentPurpose(assessmentPurpose);
    if (!purpose) return;
    setAnswers((prev) => {
      if (normalizeIspAssessmentPurpose(prev.p1_purpose) === purpose) return prev;
      return { ...prev, p1_purpose: purpose };
    });
  }, [assessmentPurpose]);

  const [assignmentActivity, setAssignmentActivity] = useState<AssignmentInviteActivity>({});
  const [priorInvitePrompt, setPriorInvitePrompt] = useState<PriorSwInviteInfo | null>(null);
  const [priorInviteBanner, setPriorInviteBanner] = useState<PriorSwInviteInfo | null>(null);
  const [restartFromBeginning, setRestartFromBeginning] = useState(false);
  const [startOverConfirmOpen, setStartOverConfirmOpen] = useState(false);
  const [checkingPriorInvite, setCheckingPriorInvite] = useState(false);
  const acknowledgedPriorMemberRef = useRef<string>('');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [rnOptions, setRnOptions] = useState<StaffOption[]>([]);
  const [firstReviewerUid, setFirstReviewerUid] = useState('');
  const [rnUid, setRnUid] = useState('');
  const [savingRouting, setSavingRouting] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [confirmEdits, setConfirmEdits] = useState(false);
  const [activeIntake, setActiveIntake] = useState<ActiveIntake | null>(null);
  const [downloadLogs, setDownloadLogs] = useState<DownloadLog[]>([]);

  const filteredMembers = useMemo(() => {
    const needle = clean(queryText).toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [toName(member), clientIdOf(member), clean(member.memberMrn), clean(member.memberCounty)]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [members, queryText]);

  const selectedMember = useMemo(
    () =>
      filteredMembers.find((member) => clientIdOf(member) === clean(selectedClientId)) ||
      filteredMembers[0] ||
      null,
    [filteredMembers, selectedClientId]
  );

  const firstReviewer = useMemo(
    () => staffOptions.find((s) => s.uid === firstReviewerUid) || null,
    [staffOptions, firstReviewerUid]
  );
  const assignedRn = useMemo(() => {
    const fromList = rnOptions.find((s) => s.uid === rnUid) || staffOptions.find((s) => s.uid === rnUid);
    if (fromList) return fromList;
    return {
      uid: '',
      email: DEFAULT_RN_EMAIL,
      label: 'Leslie',
      role: 'RN',
      isRn: true,
    } as StaffOption;
  }, [rnOptions, staffOptions, rnUid]);

  const requiredFieldStatuses = useMemo(
    () =>
      REQUIRED_CASPIO_FIELDS.map((field) => ({
        ...field,
        value: resolveRequiredCaspioFieldValue(
          field.id,
          resolvedPreview,
          answers,
          caspioSourcePreview || {}
        ),
      })),
    [resolvedPreview, answers, caspioSourcePreview]
  );
  const missingRequiredLabels = useMemo(
    () => requiredFieldStatuses.filter((field) => !field.value).map((field) => field.label),
    [requiredFieldStatuses]
  );
  const hasPreviewForSelection =
    Boolean(previewMemberId) &&
    previewMemberId === (selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId));
  const needsVisitLocationChoice =
    assessmentPurpose === 'review' || assessmentPurpose === 'initial';
  const visitLocationReady = !needsVisitLocationChoice || Boolean(visitLocationSource);
  const ispLocationSnapshot = useMemo(
    () => getIspLocationSnapshot(caspioSourcePreview || {}),
    [caspioSourcePreview]
  );
  const rcfeLocationSnapshot = useMemo(
    () => getRcfeLocationSnapshot(caspioSourcePreview || {}),
    [caspioSourcePreview]
  );
  const ispRcfeComparison = useMemo(
    () => compareIspLocationToRcfe(caspioSourcePreview || {}),
    [caspioSourcePreview]
  );
  /** At RCFE with RCFE_Name filled: soft mismatch only — RCFE is the default; staff can accept it without a hard block. */
  const ispRcfeSoftMismatch =
    visitLocationSource === 'rcfe' &&
    Boolean(rcfeLocationSnapshot.name) &&
    !ispRcfeComparison.matches;
  const canConfirmIspLocationStep = Boolean(assessmentPurpose) && visitLocationReady;
  const stepsConfirmedForPrefill =
    confirmedSw &&
    confirmedFirstReviewer &&
    confirmedRn &&
    confirmedPurpose &&
    confirmedIspLocation &&
    confirmedClinicalUploads &&
    Boolean(assessmentPurpose) &&
    visitLocationReady;
  const canPrefillIspForm =
    hasPreviewForSelection &&
    !isLoadingPreview &&
    missingRequiredLabels.length === 0 &&
    stepsConfirmedForPrefill &&
    Boolean(firstReviewer) &&
    Boolean(socialWorkerName || socialWorkerEmail);

  const prefillBlockedReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!hasPreviewForSelection || isLoadingPreview) reasons.push('Wait for Caspio field check to finish');
    if (!confirmedSw) reasons.push('Confirm social worker (step 1)');
    if (swPortalActive !== true) {
      reasons.push('Enable SW portal access in SW User Management, then confirm the social worker');
    }
    if (!confirmedFirstReviewer) reasons.push('Confirm first review staff (step 2)');
    if (!confirmedRn) reasons.push('Confirm RN (step 3)');
    if (!confirmedPurpose || !assessmentPurpose) reasons.push('Select and confirm purpose (step 4)');
    if (needsVisitLocationChoice && !visitLocationSource) {
      reasons.push(
        assessmentPurpose === 'review'
          ? 'Choose whether member is at RCFE or ISP location (reassessment)'
          : 'Choose whether member is already at RCFE or another ISP location (initial)'
      );
    }
    if (!confirmedIspLocation) {
      reasons.push(
        ispRcfeSoftMismatch
          ? 'Accept RCFE as default (or confirm ISP location) in step 5'
          : 'Verify ISP location (step 5)'
      );
    }
    if (!confirmedClinicalUploads) reasons.push('Confirm member clinical uploads (step 6)');
    if (missingRequiredLabels.length > 0) {
      reasons.push(`Missing Caspio fields: ${missingRequiredLabels.join(', ')}`);
    }
    if (!firstReviewer) reasons.push('Choose first review staff');
    if (!socialWorkerName && !socialWorkerEmail) reasons.push('Social worker name or email required');
    return reasons;
  }, [
    assessmentPurpose,
    confirmedClinicalUploads,
    confirmedFirstReviewer,
    confirmedIspLocation,
    confirmedPurpose,
    confirmedRn,
    confirmedSw,
    firstReviewer,
    hasPreviewForSelection,
    isLoadingPreview,
    missingRequiredLabels,
    needsVisitLocationChoice,
    ispRcfeSoftMismatch,
    socialWorkerEmail,
    socialWorkerName,
    swPortalActive,
    visitLocationSource,
  ]);

  const visitLocationSummary = useMemo(() => {
    if (!visitLocationSource || !Object.keys(caspioSourcePreview).length) return null;
    return summarizeIspVisitLocationFromCaspio(caspioSourcePreview, visitLocationSource);
  }, [caspioSourcePreview, visitLocationSource]);

  const applyVisitLocationToPreview = useCallback(
    (
      baseResolved: Record<string, string>,
      source: Record<string, unknown>,
      _locationSource?: IspVisitLocationSource | '',
      _purpose?: string
    ) => {
      // Form/tool always uses Caspio ISP_Contact_* current location.
      return applyIspVisitLocationFromCaspio(baseResolved, source, 'isp_location');
    },
    []
  );

  /** Clinical uploads unlock after ISP location is verified. */
  const canUploadClinical = confirmedIspLocation && !clinicalUploading;

  const canVerifyFormPreview = showForm && canPrefillIspForm;
  const canSendSwInvite =
    canVerifyFormPreview &&
    formPreviewVerified &&
    Boolean(socialWorkerEmail) &&
    Boolean(firstReviewer);

  const workflowStatus = clean(activeIntake?.workflowStatus).toLowerCase();
  const canFirstReview =
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('returned_to_sw') ||
    workflowStatus.includes('returned_to_staff') ||
    workflowStatus.includes('returned_to_admin') ||
    workflowStatus.includes('waiting_staff_revision');
  const swAlreadySigned = Boolean(
    clean(activeIntake?.alftForm?.swSignature) ||
      clean(activeIntake?.alftForm?.exactPacketAnswers?.p14_print_name) ||
      clean(answers?.p14_print_name)
  );
  const canFinalReview =
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('manager_review_complete');
  const canDownloadPacket = Boolean(
    clean(activeIntake?.alftSignature?.packetPdfStoragePath) ||
      clean(activeIntake?.alftSignature?.signaturePagePdfStoragePath)
  );

  const getIdToken = useCallback(async () => {
    const tokenUser = user || auth?.currentUser;
    if (!tokenUser) throw new Error('Sign in required');
    return tokenUser.getIdToken();
  }, [auth?.currentUser, user]);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    const loadStaff = async () => {
      try {
        const [adminRolesSnap, superAdminRolesSnap, usersSnap, reviewSettingsSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')).catch(() => null),
          getDocs(collection(firestore, 'roles_super_admin')).catch(() => null),
          getDocs(collection(firestore, 'users')).catch(() => null),
          getDoc(doc(firestore, 'system_settings', 'review_notifications')).catch(() => null),
        ]);
        const adminIds = new Set((adminRolesSnap?.docs || []).map((d) => d.id));
        const superAdminIds = new Set((superAdminRolesSnap?.docs || []).map((d) => d.id));
        const users = (usersSnap?.docs || []).map((d) => ({ uid: d.id, ...(d.data() as any) }));
        const reviewRecipients = ((reviewSettingsSnap?.exists() ? reviewSettingsSnap.data()?.recipients : {}) ||
          {}) as Record<string, any>;

        const isAlftIspReviewer = (uid: string, email: string) => {
          const keys = [uid, uid.toLowerCase(), email, email.toLowerCase()].filter(Boolean);
          for (const key of keys) {
            const rec = reviewRecipients[key];
            if (!rec) continue;
            if (Boolean(rec.alftReviewer || rec.alft)) return true;
          }
          return false;
        };

        const options: StaffOption[] = users
          .map((u: any) => {
            const uid = clean(u.uid) || clean(u.id);
            const email = clean(u.email).toLowerCase();
            const first = clean(u.firstName);
            const last = clean(u.lastName);
            const display = clean(u.displayName);
            const label = first || last ? `${first} ${last}`.trim() : display || email || uid;
            const role = superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
            return {
              uid,
              email,
              label,
              role,
              isRn: Boolean(u.isRnStaff) || email === DEFAULT_RN_EMAIL,
              isAlftIspReviewer: isAlftIspReviewer(uid, email),
            };
          })
          .filter((o) => Boolean(o.uid && o.email))
          .sort((a, b) => a.label.localeCompare(b.label));
        if (cancelled) return;

        const ispReviewers = options.filter((o) => o.isAlftIspReviewer);
        // First-review dropdown: only staff flagged ALFT ISP Reviewer in Staff Management.
        setStaffOptions(ispReviewers);
        const rns = options.filter((o) => o.isRn);
        setRnOptions(rns.length ? rns : options.filter((o) => o.email === DEFAULT_RN_EMAIL));
        const leslie = options.find((o) => o.email === DEFAULT_RN_EMAIL);
        if (leslie) setRnUid((prev) => prev || leslie.uid);
        const preferredReviewer =
          ispReviewers.find((o) => o.uid === user?.uid) ||
          ispReviewers[0] ||
          null;
        if (preferredReviewer) setFirstReviewerUid((prev) => prev || preferredReviewer.uid);
      } catch {
        // ignore
      }
    };
    void loadStaff();
    return () => {
      cancelled = true;
    };
  }, [firestore, user?.uid]);

  const loadIntakeById = useCallback(
    async (intakeId: string) => {
      if (!firestore || !intakeId) return;
      const snap = await getDoc(doc(firestore, 'standalone_upload_submissions', intakeId));
      if (!snap.exists()) return;
      const data = snap.data() as any;
      const intake: ActiveIntake = { id: snap.id, ...data };
      setActiveIntake(intake);
      setConfirmEdits(false);
      if (data?.alftForm?.exactPacketAnswers) {
        setAnswers({ ...buildBlankAnswers(), ...(data.alftForm.exactPacketAnswers as AnswerMap) });
        setShowForm(true);
      }
      setMedListAttachment(parseMedListAttachment(data?.alftForm?.medListAttachment));
      if (clean(data?.uploaderName)) setSocialWorkerName(clean(data.uploaderName));
      if (clean(data?.uploaderEmail)) setSocialWorkerEmail(clean(data.uploaderEmail));
      if (clean(data?.memberId)) setSelectedClientId(clean(data.memberId));
      if (clean(data?.alftStaffUid)) setFirstReviewerUid(clean(data.alftStaffUid));
      if (clean(data?.alftRnUid)) setRnUid(clean(data.alftRnUid));
    },
    [firestore]
  );

  const loadIntakeForMember = useCallback(
    async (memberId: string) => {
      if (!firestore || !memberId) {
        setActiveIntake(null);
        return;
      }
      const snap = await getDocs(
        query(
          collection(firestore, 'standalone_upload_submissions'),
          where('memberId', '==', memberId),
          where('toolCode', '==', 'ALFT'),
          limit(10)
        )
      ).catch(() => null);
      const docs = snap?.docs || [];
      if (!docs.length) {
        setActiveIntake(null);
        return;
      }
      const sorted = [...docs].sort((a, b) => {
        const aMs = Number((a.data() as any)?.updatedAt?.toMillis?.() || 0);
        const bMs = Number((b.data() as any)?.updatedAt?.toMillis?.() || 0);
        return bMs - aMs;
      });
      await loadIntakeById(sorted[0].id);
    },
    [firestore, loadIntakeById]
  );

  const loadDownloadLogs = useCallback(
    async (opts?: { intakeId?: string; memberId?: string }) => {
      try {
        const token = await getIdToken();
        const params = new URLSearchParams({ limit: '20' });
        if (opts?.intakeId) params.set('intakeId', opts.intakeId);
        if (opts?.memberId) params.set('memberId', opts.memberId);
        const res = await fetch(`/api/alft/download-log?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.success) setDownloadLogs(Array.isArray(body.logs) ? body.logs : []);
      } catch {
        setDownloadLogs([]);
      }
    },
    [getIdToken]
  );

  useEffect(() => {
    if (intakeIdFromQuery) void loadIntakeById(intakeIdFromQuery);
  }, [intakeIdFromQuery, loadIntakeById]);

  useEffect(() => {
    const memberId = selectedMember ? clientIdOf(selectedMember) : '';
    if (memberId) void loadIntakeForMember(memberId);
  }, [selectedMember, loadIntakeForMember]);

  useEffect(() => {
    void loadDownloadLogs({
      intakeId: activeIntake?.id,
      memberId: selectedMember ? clientIdOf(selectedMember) : undefined,
    });
  }, [activeIntake?.id, selectedMember, loadDownloadLogs]);

  const fetchMembers = async (opts?: { clientId2?: string; source?: 'cache' | 'caspio' }) => {
    const requestedClientId2 = clean(opts?.clientId2);
    const source = opts?.source || (requestedClientId2 ? 'caspio' : 'cache');
    setIsLoadingMembers(true);
    try {
      const params = new URLSearchParams();
      if (source === 'caspio') {
        params.set('source', 'caspio');
        params.set('refresh', '1');
      } else params.set('source', 'cache');
      if (requestedClientId2) params.set('clientId2', requestedClientId2);
      const response = await fetch(`/api/kaiser-members?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(String(data?.error || 'Failed to load members'));
      const loadedMembers = Array.isArray(data.members) ? (data.members as KaiserMember[]) : [];
      setMembers((prev) => {
        if (!requestedClientId2) return loadedMembers;
        const next = [...prev];
        loadedMembers.forEach((incoming) => {
          const id = clientIdOf(incoming);
          const idx = next.findIndex((m) => clientIdOf(m) === id);
          if (idx >= 0) next[idx] = incoming;
          else next.push(incoming);
        });
        return next;
      });
      setLastLoadedLabel(new Date().toLocaleString());
      if (loadedMembers[0]) setSelectedClientId((prev) => prev || clientIdOf(loadedMembers[0]));
      toast({
        title: 'Kaiser members loaded',
        description: `${loadedMembers.length} members from ${source === 'caspio' ? 'Caspio' : 'cache'}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Unable to load members', description: String(error?.message || error) });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const syncMembersCacheFromCaspio = async () => {
    try {
      setIsSyncingMembersCache(true);
      const idToken = await getIdToken();
      const response = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'full', mcoFilter: ['Kaiser'] }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
      }
      toast({
        title: 'Firestore cache updated',
        description: `Fetched ${Number(data?.fetched || 0)} Kaiser records, updated ${Number(
          data?.upserted || 0
        )} cache records. Loading from Firestore…`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await fetchMembers({ source: 'cache' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Caspio sync failed',
        description: String(error?.message || 'Could not update Firestore cache from Caspio.'),
      });
    } finally {
      setIsSyncingMembersCache(false);
    }
  };

  const loadCaspioFieldPreview = useCallback(
    async (memberIdRaw: string, memberOverride?: KaiserMember | null) => {
      const memberId = clean(memberIdRaw);
      if (!memberId) return;
      setIsLoadingPreview(true);
      setPreviewError('');
      setPreviewMemberId(memberId);
      try {
        const idToken = await getIdToken();
        const response = await fetch('/api/alft/prefill/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              memberId,
              ...(visitLocationSourceRef.current
                ? { visitLocationSource: visitLocationSourceRef.current }
                : {}),
              ...(assessmentPurposeRef.current
                ? { assessmentPurpose: assessmentPurposeRef.current }
                : {}),
            }),
          });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Could not load Caspio fields'));

        const resolved = (body.resolved || {}) as Record<string, string>;
        const source = (body.source || {}) as Record<string, unknown>;
        setCaspioSourcePreview(source);
        const socialWorker = (body.socialWorker || {}) as {
          name?: string | null;
          email?: string | null;
          swId?: string | null;
          county?: string | null;
          memberCounty?: string | null;
          portalActive?: boolean;
          emailSource?: string | null;
        };
        const cleanedResolved: Record<string, string> = {};
        Object.entries(resolved).forEach(([key, value]) => {
          const cleaned = clean(value);
          if (!cleaned) return;
          cleanedResolved[key] = cleaned;
        });
        if (!cleanedResolved.p1_member_name && memberOverride) {
          cleanedResolved.p1_member_name = toName(memberOverride);
        }

        const swName =
          clean(socialWorker.name) ||
          clean(cleanedResolved.p1_assessor_name) ||
          clean(source.Social_Worker_Assigned) ||
          clean(source.social_worker_assigned);
        // Invite destination comes from CalAIM_tbl_Social_Worker.SW_email (via resolve).
        const swEmailFromCaspio =
          (isUsableSwEmail(socialWorker.email) && clean(socialWorker.email)) ||
          (isUsableSwEmail(source.SW_email) && clean(source.SW_email)) ||
          (isUsableSwEmail(source.SW_Email) && clean(source.SW_Email)) ||
          (isUsableSwEmail(source.Social_Worker_Email) && clean(source.Social_Worker_Email)) ||
          '';
        const swCounty =
          clean(socialWorker.county) ||
          clean(source.assignedSwCounty) ||
          clean(source.SW_County) ||
          '';
        const nextMemberCounty =
          clean(body.memberCounty) ||
          clean(socialWorker.memberCounty) ||
          clean(source.Member_County) ||
          clean(source.memberCounty) ||
          (memberOverride ? clean(memberOverride.memberCounty) : '') ||
          '';

        // Keep Social Worker / Assessor green in the Caspio checklist when Caspio returns SW.
        if (swName && !cleanedResolved.p1_assessor_name) {
          cleanedResolved.p1_assessor_name = swName;
        }
        if (memberOverride && !cleanedResolved.p1_mrn && clean(memberOverride.memberMrn)) {
          cleanedResolved.p1_mrn = clean(memberOverride.memberMrn);
        }

        const previewForUi = applyVisitLocationToPreview(
          cleanedResolved,
          source,
          visitLocationSourceRef.current,
          assessmentPurposeRef.current
        );
        setResolvedPreview(previewForUi);
        // Preserve name/email when Caspio returns blanks so a clinical refresh
        // does not wipe a confirmed SW or force re-confirm.
        if (swName) setSocialWorkerName(swName);
        if (swEmailFromCaspio) {
          setSocialWorkerEmail((prev) => {
            const prevNorm = clean(prev).toLowerCase();
            const nextNorm = swEmailFromCaspio.toLowerCase();
            if (prevNorm && nextNorm && prevNorm !== nextNorm) {
              setConfirmedSw(false);
            }
            return swEmailFromCaspio;
          });
        }
        if (swCounty) setSocialWorkerCounty(swCounty);
        setMemberCounty(nextMemberCounty);
        setSwPortalActive(
          typeof socialWorker.portalActive === 'boolean' ? socialWorker.portalActive : null
        );

        // Show ALFT tool immediately with Caspio-ready fields highlighted in green.
        const filledIds = Object.keys(previewForUi).filter((key) => Boolean(clean(previewForUi[key])));
        setAnswers((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(previewForUi)) {
            const cleaned = clean(value);
            if (!cleaned) continue;
            next[key] = key === 'p1_dob' ? toMmDdYyyy(cleaned) : cleaned;
          }
          if (swName) next.p1_assessor_name = swName;
          return applyIspAlftLockedFieldDefaults(next);
        });
        setCaspioFilledIds(filledIds);
        setShowForm(true);

        if (firestore) {
          const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
          const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
          if (assignment) {
            // Only fall back to assignment email when Caspio SW_email is missing and saved email is real.
            if (!swEmailFromCaspio && isUsableSwEmail(assignment.assignedSwEmail)) {
              setSocialWorkerEmail(clean(assignment.assignedSwEmail));
            }
            if (clean(assignment.assignedSwName) && !swName) setSocialWorkerName(clean(assignment.assignedSwName));
            if (clean(assignment.alftStaffUid)) setFirstReviewerUid((prev) => prev || clean(assignment.alftStaffUid));
            if (clean(assignment.alftRnUid)) setRnUid((prev) => prev || clean(assignment.alftRnUid));
            setSwPortalSupportFiles(parseSwPortalSupportFiles(assignment.swPortalSupportFiles));
            if (parseSwPortalSupportFiles(assignment.swPortalSupportFiles).length > 0) {
              setConfirmedClinicalUploads(true);
            }
            const assignmentMed = parseMedListAttachment(assignment.medListAttachment);
            if (assignmentMed) {
              setMedListAttachment((prev) => prev || assignmentMed);
            }
            setAssignmentActivity(buildAssignmentInviteActivity(assignment));
          } else {
            setAssignmentActivity({});
            setSwPortalSupportFiles([]);
          }
        }
      } catch (error: any) {
        setResolvedPreview({});
        setPreviewError(String(error?.message || 'Failed to load Caspio fields'));
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [applyVisitLocationToPreview, firestore, getIdToken]
  );

  const verifySwPortalAccess = useCallback(
    async (emailRaw: string): Promise<boolean> => {
      const email = clean(emailRaw).toLowerCase();
      if (!firestore || !isUsableSwEmail(email)) {
        setSwPortalActive(false);
        return false;
      }
      setCheckingSwPortal(true);
      try {
        const snap = await getDocs(
          query(collection(firestore, 'socialWorkers'), where('email', '==', email), limit(1))
        );
        if (snap.empty) {
          setSwPortalActive(false);
          return false;
        }
        const active = Boolean(snap.docs[0].data()?.isActive);
        setSwPortalActive(active);
        return active;
      } catch {
        setSwPortalActive(false);
        return false;
      } finally {
        setCheckingSwPortal(false);
      }
    },
    [firestore]
  );

  const applyMemberSelection = useCallback(
    (memberId: string, opts?: { restart?: boolean; prior?: PriorSwInviteInfo | null }) => {
      const id = clean(memberId);
      if (!id) return;
      acknowledgedPriorMemberRef.current = id;
      setRestartFromBeginning(Boolean(opts?.restart));
      setPriorInviteBanner(opts?.prior || null);
      setPriorInvitePrompt(null);
      if (opts?.restart) {
        setConfirmedSw(false);
        setConfirmedFirstReviewer(false);
        setConfirmedRn(false);
        setAssessmentPurpose('');
        setConfirmedPurpose(false);
        setVisitLocationSource('');
        setAskCaregiverOnArrival(false);
        setConfirmedIspLocation(false);
        setConfirmedClinicalUploads(false);
        setFormPreviewVerified(false);
        setShowForm(false);
        setCaspioFilledIds([]);
        setAnswers(buildBlankAnswers());
        setMedListAttachment(null);
      }
      setSelectedClientId(id);
    },
    []
  );

  const beginStartOverForResend = useCallback(() => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    const prior: PriorSwInviteInfo = {
      memberId,
      memberName: member ? toName(member) : memberId,
      invitedAt: assignmentActivity.invitedAt || '',
      invitedTo: assignmentActivity.invitedTo || socialWorkerEmail || '',
      statusLabel:
        (assignmentActivity.inviteSendCount || 0) > 1
          ? `Prior invite on file (${assignmentActivity.inviteSendCount} sends)`
          : 'Prior invite on file',
      hasSubmission: Boolean(assignmentActivity.submittedAt || assignmentActivity.signedAt),
    };
    applyMemberSelection(memberId, { restart: true, prior });
    setStartOverConfirmOpen(false);
    void loadCaspioFieldPreview(memberId, member);
    if (firestore) {
      void setDoc(
        doc(firestore, 'alft_assignments', memberId),
        {
          ispWorkflowActivityLog: arrayUnion(
            buildIspWorkflowActivityEntry({
              event: 'workflow_restart_for_resend',
              byName: clean(user?.displayName) || null,
              byEmail: clean(user?.email) || null,
              recipientEmail: assignmentActivity.invitedTo || socialWorkerEmail || null,
              details: assignmentActivity.invitedAt
                ? `Prior invite retained (first sent ${assignmentActivity.invitedAt}).`
                : 'Prior invite history retained.',
            })
          ),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {
        // best-effort audit trail
      });
    }
    toast({
      title: 'Starting over for re-send',
      description:
        'Prior invite history stays at the top and in the activity log. Complete steps 1–8 again, then send a new invite.',
      className: 'bg-amber-100 text-amber-950 border-amber-200',
    });
  }, [
    applyMemberSelection,
    assignmentActivity.inviteSendCount,
    assignmentActivity.invitedAt,
    assignmentActivity.invitedTo,
    assignmentActivity.signedAt,
    assignmentActivity.submittedAt,
    firestore,
    loadCaspioFieldPreview,
    selectedClientId,
    selectedMember,
    socialWorkerEmail,
    toast,
    user?.displayName,
    user?.email,
  ]);

  const requestSelectMember = useCallback(
    async (member: KaiserMember) => {
      const memberId = clientIdOf(member);
      if (!memberId || !firestore) {
        setSelectedClientId(memberId);
        return;
      }
      if (memberId === clean(selectedClientId) || memberId === acknowledgedPriorMemberRef.current) {
        setSelectedClientId(memberId);
        return;
      }
      setCheckingPriorInvite(true);
      try {
        const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId));
        const assignment = assignmentSnap.exists() ? (assignmentSnap.data() as Record<string, unknown>) : null;
        const prior = detectPriorSwInvite(assignment);
        if (!prior) {
          applyMemberSelection(memberId, { restart: false, prior: null });
          return;
        }
        setPriorInvitePrompt({
          memberId,
          memberName: toName(member),
          ...prior,
        });
      } catch {
        applyMemberSelection(memberId, { restart: false, prior: null });
      } finally {
        setCheckingPriorInvite(false);
      }
    },
    [applyMemberSelection, firestore, selectedClientId]
  );

  const selectedMemberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
  const previousSelectedMemberIdRef = useRef<string>('');

  useEffect(() => {
    const memberChanged = previousSelectedMemberIdRef.current !== selectedMemberId;
    previousSelectedMemberIdRef.current = selectedMemberId;

    if (!selectedMemberId) {
      setResolvedPreview({});
      setPreviewMemberId('');
      setPreviewError('');
      setSocialWorkerName('');
      setSocialWorkerEmail('');
      setSocialWorkerCounty('');
      setMemberCounty('');
      setSwPortalActive(null);
      setConfirmedSw(false);
      setConfirmedFirstReviewer(false);
      setConfirmedRn(false);
      setAssessmentPurpose('');
      setConfirmedPurpose(false);
      setVisitLocationSource('');
      setAskCaregiverOnArrival(false);
      setCaspioSourcePreview({});
      setConfirmedIspLocation(false);
      setConfirmedClinicalUploads(false);
      setSwPortalSupportFiles([]);
      setClinicalUploadLabel('');
      setClinicalUploadFiles([]);
      setFormPreviewVerified(false);
      setPriorInviteBanner(null);
      setRestartFromBeginning(false);
      acknowledgedPriorMemberRef.current = '';
      setAssignmentActivity({});
      setRoutingAutosaveLabel('');
      lastAutosavedRoutingKey.current = '';
      return;
    }

    // Only reset routing confirms when the selected member actually changes —
    // not when loadCaspioFieldPreview identity changes (e.g. after purpose pick).
    if (memberChanged) {
      setShowForm(false);
      setCaspioFilledIds([]);
      setConfirmedSw(false);
      setConfirmedFirstReviewer(false);
      setConfirmedRn(false);
      setAssessmentPurpose('');
      setConfirmedPurpose(false);
      setVisitLocationSource('');
      setAskCaregiverOnArrival(false);
      setCaspioSourcePreview({});
      setConfirmedIspLocation(false);
      setConfirmedClinicalUploads(false);
      setSwPortalSupportFiles([]);
      setClinicalUploadLabel('');
      setClinicalUploadFiles([]);
      setFormPreviewVerified(false);
      setSocialWorkerCounty('');
      setMemberCounty('');
      setRoutingAutosaveLabel('');
      lastAutosavedRoutingKey.current = '';
      void loadCaspioFieldPreview(selectedMemberId, selectedMember);
      void refreshAssignmentActivity(selectedMemberId);
    }
    // selectedMember object identity changes often; key off member id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, loadCaspioFieldPreview]);

  const prefillIspForm = async () => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!confirmedSw || !confirmedFirstReviewer || !confirmedRn || !confirmedPurpose || !confirmedIspLocation || !confirmedClinicalUploads || !assessmentPurpose) {
      toast({
        variant: 'destructive',
        title: 'Confirm routing first',
        description:
          'Confirm social worker, first review staff, RN, purpose, ISP location, and member clinical uploads before prefilling.',
      });
      return;
    }
    if ((assessmentPurpose === 'review' || assessmentPurpose === 'initial') && !visitLocationSource) {
      toast({
        variant: 'destructive',
        title: 'Choose visit location',
        description:
          assessmentPurpose === 'review'
            ? 'For reassessment, select whether the member is at an RCFE or at the ISP location.'
            : 'For an initial visit, select whether the member is already at an RCFE or at another ISP location.',
      });
      return;
    }
    if (!hasPreviewForSelection) {
      toast({
        variant: 'destructive',
        title: 'Caspio fields still loading',
        description: 'Wait for the green field check, then try again.',
      });
      return;
    }
    if (missingRequiredLabels.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Missing required Caspio fields',
        description: `Please complete in Caspio: ${missingRequiredLabels.join(', ')}`,
      });
      return;
    }

    setIsPrefilling(true);
    setFormPreviewVerified(false);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/alft/prefill/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          memberId,
          ...(visitLocationSource ? { visitLocationSource } : {}),
          ...(assessmentPurpose ? { assessmentPurpose } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Prefill failed'));
      const latestResolved = (body.resolved || {}) as Record<string, string>;
      const source = (body.source || {}) as Record<string, unknown>;
      setCaspioSourcePreview(source);
      const locationAdjusted = applyVisitLocationToPreview(
        latestResolved,
        source,
        visitLocationSource,
        assessmentPurpose
      );

      const next = buildBlankAnswers();
      const filledIds: string[] = [];
      const cleanedResolved: Record<string, string> = {};
      Object.entries(locationAdjusted).forEach(([key, value]) => {
        const cleaned = clean(value);
        if (!cleaned) return;
        cleanedResolved[key] = cleaned;
        if (!/^p\d+_/.test(key)) return;
        // Never prefill "besides client answering" — staff/SW answers on form.
        if (
          key === 'p1_other_responder' ||
          key === 'p1_other_responder_name' ||
          key === 'p1_other_responder_relationship'
        ) {
          return;
        }
        // Assessment date is when SW does the visit — leave blank for them to fill.
        if (key === 'p1_assessment_date') return;
        // Mailing address, financial income, and ALWP agency default to N/A for ISP workflow.
        if (
          isIspAlftLockedField(key) ||
          key === 'p2_alwp_agency'
        ) {
          return;
        }
        next[key] = cleaned;
        filledIds.push(key);
      });
      next.p1_agency = AGENCY_NAME;
      next.p1_purpose = assessmentPurpose;
      if (!normalizeIspAssessmentPurpose(next.p1_purpose)) {
        next.p1_purpose = '';
      }
      next.p1_other_responder = '';
      next.p1_other_responder_name = '';
      next.p1_other_responder_relationship = '';
      next.p1_assessment_date = '';
      // Assessor/CM Referral Date = date sent to SW (or today if invite not sent yet).
      {
        const fromInvite = assignmentActivity.invitedAt
          ? (() => {
              const ms = Date.parse(assignmentActivity.invitedAt);
              if (!Number.isFinite(ms) || ms <= 0) return '';
              const dt = new Date(ms);
              return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            })()
          : '';
        const now = new Date();
        const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        next.p1_referral_date = fromInvite || todayYmd;
      }
      next.p2_alwp_agency = 'N/A';
      const nextWithLocked = applyIspAlftLockedFieldDefaults(next);
      for (const lockedId of ISP_ALFT_LOCKED_FIELD_IDS) {
        if (!filledIds.includes(lockedId)) filledIds.push(lockedId);
      }
      if (!clean(nextWithLocked.p2_current_state)) nextWithLocked.p2_current_state = 'CA';
      if (clean(nextWithLocked.p1_dob)) nextWithLocked.p1_dob = toMmDdYyyy(nextWithLocked.p1_dob);
      if (!filledIds.includes('p1_purpose')) filledIds.push('p1_purpose');
      if (!filledIds.includes('p1_referral_date')) filledIds.push('p1_referral_date');
      if (!clean(nextWithLocked.p1_member_name) && member) nextWithLocked.p1_member_name = toName(member);

      const swName =
        clean(nextWithLocked.p1_assessor_name) ||
        clean(source.Social_Worker_Assigned) ||
        socialWorkerName;
      const socialWorker = (body.socialWorker || {}) as { email?: string | null; name?: string | null };
      const swEmail =
        (isUsableSwEmail(socialWorker.email) && clean(socialWorker.email)) ||
        (isUsableSwEmail(source.SW_email) && clean(source.SW_email)) ||
        (isUsableSwEmail(source.SW_Email) && clean(source.SW_Email)) ||
        (isUsableSwEmail(source.Social_Worker_Email) && clean(source.Social_Worker_Email)) ||
        (isUsableSwEmail(socialWorkerEmail) ? socialWorkerEmail : '');

      setResolvedPreview(cleanedResolved);
      setAnswers(nextWithLocked);
      setCaspioFilledIds(filledIds);
      setSocialWorkerName(clean(socialWorker.name) || swName);
      setSocialWorkerEmail(swEmail);
      setShowForm(true);
      setSelectedClientId(memberId);

      toast({
        title: 'ISP form prefilled',
        description: `${filledIds.length} member fields applied (highlighted in green).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Prefill ISP form failed', description: String(error?.message || error) });
    } finally {
      setIsPrefilling(false);
    }
  };

  const persistWorkflowRouting = async (opts?: { quiet?: boolean }): Promise<boolean> => {
    const quiet = Boolean(opts?.quiet);
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!firestore || !memberId) {
      if (!quiet) toast({ variant: 'destructive', title: 'Select a member first' });
      return false;
    }
    if (!firstReviewer) {
      if (!quiet) toast({ variant: 'destructive', title: 'Choose first-review staff' });
      return false;
    }
    if (quiet) setRoutingAutosaveLabel('Saving routing…');
    const existingSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
    const existingData = existingSnap?.exists() ? existingSnap.data() || {} : {};
    const trackedPayload: Record<string, unknown> = {
      memberId,
      memberName: selectedMember ? toName(selectedMember) : clean(answers.p1_member_name),
      memberMrn: selectedMember ? clean(selectedMember.memberMrn) : clean(answers.p1_mrn),
      memberCounty: memberCounty || null,
      assignedSwName: socialWorkerName || clean(answers.p1_assessor_name) || null,
      assignedSwEmail: socialWorkerEmail || null,
      assignedSwCounty: socialWorkerCounty || null,
      alftStaffUid: firstReviewer.uid,
      alftStaffName: firstReviewer.label,
      alftStaffEmail: firstReviewer.email,
      firstReviewerUid: firstReviewer.uid,
      firstReviewerName: firstReviewer.label,
      firstReviewerEmail: firstReviewer.email,
      alftRnUid: assignedRn.uid || null,
      alftRnName: assignedRn.label,
      alftRnEmail: assignedRn.email,
      assignedRnUid: assignedRn.uid || null,
      assignedRnName: assignedRn.label,
      assignedRnEmail: assignedRn.email,
      ...(assessmentPurpose
        ? {
            prefillPurpose: assessmentPurpose,
            visitLocationSource: visitLocationSource || null,
            askCaregiverOnArrival: Boolean(askCaregiverOnArrival && visitLocationSource === 'rcfe'),
          }
        : {}),
      workflowRouting: {
        nextStepKey: 'manager_review',
        nextStepLabel: 'Connections Staff First Review',
        nextRecipientName: firstReviewer.label,
        nextRecipientEmail: firstReviewer.email,
        finalReviewOwnerName: firstReviewer.label,
        finalReviewOwnerEmail: firstReviewer.email,
        rnName: assignedRn.label,
        rnEmail: assignedRn.email,
      },
      updatedAt: serverTimestamp(),
    };
    // ISP Assignment roster only tracks members assigned through this app workflow.
    if (isUsableSwEmail(socialWorkerEmail) || clean(socialWorkerName)) {
      trackedPayload.ispAssignmentTracked = true;
      if (!existingData.ispAssignmentTrackedAt) {
        trackedPayload.ispAssignmentTrackedAt = serverTimestamp();
      }
      trackedPayload.ispAssignmentTrackedSource = 'isp_workflow_routing';
      if (!existingData.assignedAt) {
        trackedPayload.assignedAt = serverTimestamp();
      }
    }
    await setDoc(doc(firestore, 'alft_assignments', memberId), trackedPayload, { merge: true });

    if (activeIntake?.id) {
      await setDoc(
        doc(firestore, 'standalone_upload_submissions', activeIntake.id),
        {
          alftStaffUid: firstReviewer.uid,
          alftStaffName: firstReviewer.label,
          alftStaffEmail: firstReviewer.email,
          alftStaffAssignedAt: serverTimestamp(),
          alftRnUid: assignedRn.uid || null,
          alftRnName: assignedRn.label,
          alftRnEmail: assignedRn.email,
          alftRnAssignedAt: serverTimestamp(),
          memberCounty: memberCounty || null,
          assignedSwCounty: socialWorkerCounty || null,
          workflowRouting: {
            nextStepKey: 'manager_review',
            nextStepLabel: 'Connections Staff First Review',
            nextRecipientName: firstReviewer.label,
            nextRecipientEmail: firstReviewer.email,
            finalReviewOwnerName: firstReviewer.label,
            finalReviewOwnerEmail: firstReviewer.email,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await loadIntakeById(activeIntake.id);
    }
    if (quiet) setRoutingAutosaveLabel(`Routing autosaved ${new Date().toLocaleTimeString()}`);
    return true;
  };

  const saveWorkflowRouting = async () => {
    setSavingRouting(true);
    try {
      const ok = await persistWorkflowRouting();
      if (!ok) return;
      const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
      lastAutosavedRoutingKey.current = [
        memberId,
        socialWorkerEmail,
        socialWorkerName,
        socialWorkerCounty,
        memberCounty,
        firstReviewerUid,
        rnUid,
      ].join('|');
      toast({
        title: 'Workflow routing updated',
        description: `After SW submit → ${firstReviewer?.label}. After SW signature → ${assignedRn.label} (${assignedRn.email}).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save routing', description: String(error?.message || error) });
    } finally {
      setSavingRouting(false);
    }
  };

  useEffect(() => {
    if (!confirmedSw || !confirmedFirstReviewer || !confirmedRn || !firstReviewer) return;
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!memberId) return;
    const key = [
      memberId,
      socialWorkerEmail,
      socialWorkerName,
      socialWorkerCounty,
      memberCounty,
      firstReviewerUid,
      rnUid,
      assessmentPurpose,
      visitLocationSource,
      askCaregiverOnArrival ? '1' : '0',
    ].join('|');
    if (key === lastAutosavedRoutingKey.current) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const ok = await persistWorkflowRouting({ quiet: true });
          if (ok) lastAutosavedRoutingKey.current = key;
        } catch {
          setRoutingAutosaveLabel('Routing autosave failed — use Update routing');
        }
      })();
    }, 700);
    return () => clearTimeout(timer);
    // persistWorkflowRouting closes over current values; key deps drive the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    confirmedSw,
    confirmedFirstReviewer,
    confirmedRn,
    firstReviewerUid,
    rnUid,
    socialWorkerEmail,
    socialWorkerName,
    socialWorkerCounty,
    memberCounty,
    selectedMemberId,
    assessmentPurpose,
    visitLocationSource,
    askCaregiverOnArrival,
  ]);

  const buildDefaultSwInviteBody = useCallback(() => {
    const pick = (key: string, fallback = '') =>
      clean(answers[key]) || clean(resolvedPreview[key]) || fallback;
    const memberName =
      pick('p1_member_name') || (selectedMember ? toName(selectedMember) : '') || 'Member';
    const mrn = pick('p1_mrn', selectedMember ? clean(selectedMember.memberMrn) : '');
    const ispFacilityName = pick('p2_facility_name', pick('isp_location_name'));
    const ispFacilityType = pick('p2_current_type', pick('isp_location_type'));
    const ispAddress = [
      pick('p2_current_street', pick('isp_location_address')),
      pick('p2_current_city', pick('isp_location_city')),
      pick('p2_current_state', pick('isp_location_state')),
      pick('p2_current_zip', pick('isp_location_zip')),
    ]
      .filter(Boolean)
      .join(', ');
    const ispContactFirst = pick('isp_contact_first');
    const ispContactLast = pick('isp_contact_last');
    const ispContactName =
      pick('isp_contact_name') ||
      [ispContactFirst, ispContactLast].filter(Boolean).join(' ').trim() ||
      pick('p1_other_responder_name');
    const ispContactRelationship = sanitizeRelationshipLabel(
      pick('isp_contact_relationship') || pick('p1_other_responder_relationship')
    );
    const ispPhone =
      pick('isp_contact_phone') ||
      clean(caspioSourcePreview?.ISP_Contact_Phone) ||
      getRcfeLocationSnapshot(caspioSourcePreview || {}).phone ||
      '';
    const ispEmail =
      pick('isp_contact_email') || clean(caspioSourcePreview?.ISP_Contact_Email) || '';
    const signatureName = firstReviewer?.label || user?.displayName || 'ALFT Reviewer';
    const signatureEmail = firstReviewer?.email || user?.email || '';
    const visitType = formatIspVisitTypeForSwEmail({
      purpose: assessmentPurpose,
      visitLocationSource,
      facilityType: ispFacilityType,
      facilityName: ispFacilityName,
      askCaregiverOnArrival: askCaregiverOnArrival && visitLocationSource === 'rcfe',
    });
    const ispContactBlock = formatIspContactBlockForSwEmail({
      contactName: ispContactName,
      contactFirst: ispContactFirst,
      contactLast: ispContactLast,
      relationship: ispContactRelationship,
      phone: ispPhone,
      email: ispEmail,
      locationType: ispFacilityType || clean(caspioSourcePreview?.ISP_Location_Type),
      facilityName: ispFacilityName,
      visitLocationSource,
      askCaregiverOnArrival: askCaregiverOnArrival && visitLocationSource === 'rcfe',
    });
    return [
      `Hi ${swFirstNameOf(socialWorkerName)},`,
      '',
      'We have a client who needs a Kaiser ALFT Care Assessment.',
      '',
      visitType.headline,
      ...visitType.detailLines,
      '',
      'Client:',
      memberName,
      `Medical Record Number: ${mrn || 'Not provided'}`,
      memberCounty ? `Member County: ${memberCounty}` : '',
      socialWorkerCounty ? `Assigned SW County: ${socialWorkerCounty}` : '',
      '',
      'ISP Location:',
      ispFacilityName || 'Not provided',
      `Type: ${ispFacilityType || 'Not provided'}`,
      `Address: ${ispAddress || 'Address not provided'}`,
      '',
      ...ispContactBlock.plainLines,
      '',
      'Please call the ISP contact to confirm the member is still at the RCFE before you visit.',
      '',
      'Please let me know about the assessment:',
      '- When it’s scheduled',
      '- When it’s completed',
      '',
      'After you submit the ALFT in the portal, it goes to Connections admin for review. It may be returned to you for additional edits. If approved, it goes to the RN at Connections for final sign-off and final approval.',
      '',
      'Each ALFT requires extensive commentary on the last page of the tool (Additional Details / Commentary). Include only information that is directly relevant to care needs and tier-level decisions — not general or non-clinical remarks. You must confirm this before you can submit.',
      '',
      'After you receive an email that this ALFT has final approval, log into Caspio and submit your claim for this visit.',
      '',
      'To complete the ALFT and signature workflow, sign in here:',
      SW_LOGIN_URL,
      '',
      'Regards,',
      '—',
      signatureName,
      signatureEmail,
      'Connections Care Home Consultants',
    ]
      .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
      .join('\n');
  }, [
    answers,
    assessmentPurpose,
    askCaregiverOnArrival,
    caspioSourcePreview,
    resolvedPreview,
    selectedMember,
    socialWorkerName,
    memberCounty,
    socialWorkerCounty,
    firstReviewer,
    user?.displayName,
    user?.email,
    visitLocationSource,
  ]);

  const openSwInvitePreview = () => {
    if (!canSendSwInvite) {
      toast({
        variant: 'destructive',
        title: 'Complete steps 1–8 first',
        description:
          'Confirm SW, first review staff, RN, purpose, ISP location, clinical uploads, prefill the form, and verify the preview.',
      });
      return;
    }
    if (!isUsableSwEmail(socialWorkerEmail)) {
      toast({ variant: 'destructive', title: 'Social worker email required' });
      return;
    }
    setInvitePreviewBody(buildDefaultSwInviteBody());
    setInvitePreviewOpen(true);
  };

  const refreshAssignmentActivity = async (memberIdRaw: string) => {
    if (!firestore) return;
    const memberId = clean(memberIdRaw);
    if (!memberId) return;
    const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
    const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
    if (!assignment) {
      setAssignmentActivity({});
      setSwPortalSupportFiles([]);
      return;
    }
    setSwPortalSupportFiles(parseSwPortalSupportFiles(assignment.swPortalSupportFiles));
    if (parseSwPortalSupportFiles(assignment.swPortalSupportFiles).length > 0) {
      setConfirmedClinicalUploads(true);
    }
    setAssignmentActivity(buildAssignmentInviteActivity(assignment));

    // Restore purpose / visit location from prior ISP setup so it carries across steps.
    if (!restartFromBeginning) {
      const savedPurpose = normalizeIspAssessmentPurpose(assignment.prefillPurpose);
      if (savedPurpose) {
        setAssessmentPurpose(savedPurpose);
        setConfirmedPurpose(true);
      }
      const savedVisit =
        String(assignment.visitLocationSource || '').trim().toLowerCase() === 'rcfe' ||
        String(assignment.visitLocationSource || '').trim().toLowerCase() === 'isp_location'
          ? (String(assignment.visitLocationSource || '').trim().toLowerCase() as 'rcfe' | 'isp_location')
          : '';
      if (savedVisit) {
        setVisitLocationSource(savedVisit);
        setAskCaregiverOnArrival(Boolean(assignment.askCaregiverOnArrival));
        if (savedPurpose === 'review' || savedPurpose === 'initial') {
          setConfirmedIspLocation(true);
        }
      } else if (savedPurpose === 'change_condition') {
        setConfirmedIspLocation(true);
      }
    }
  };

  useEffect(() => {
    if (!memberIdFromQuery || intakeIdFromQuery) return;
    setSelectedClientId(memberIdFromQuery);
    void loadIntakeForMember(memberIdFromQuery);
    void refreshAssignmentActivity(memberIdFromQuery);
    void fetchMembers({ clientId2: memberIdFromQuery, source: 'cache' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link bootstrap once per query memberId
  }, [memberIdFromQuery, intakeIdFromQuery, firestore, loadIntakeForMember]);

  const syncIspLocationFromRcfe = async (options?: { quiet?: boolean }) => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return false;
    }
    if (ispLocationUpdating) return false;
    setIspLocationUpdating(true);
    setConfirmedIspLocation(false);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/alft/isp-location/sync-from-rcfe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, memberId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        throw new Error(String(body?.error || 'Failed to update Caspio ISP location'));
      }
      await loadCaspioFieldPreview(memberId, member);
      if (!options?.quiet) {
        toast({
          title: 'Caspio updated',
          description: 'ISP location refreshed from RCFE. Confirm it looks correct below.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
      return true;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update Caspio',
        description: String(error?.message || error),
      });
      return false;
    } finally {
      setIspLocationUpdating(false);
    }
  };

  const acceptRcfeAsDefaultIspLocation = async () => {
    const synced = await syncIspLocationFromRcfe({ quiet: true });
    if (!synced) return;
    setConfirmedIspLocation(true);
    toast({
      title: 'RCFE accepted as default',
      description: 'ISP location set from RCFE and verified. You can continue to clinical uploads.',
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  const refreshIspLocationFromCaspio = async () => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    setConfirmedIspLocation(false);
    await loadCaspioFieldPreview(memberId, member);
    toast({
      title: 'Refreshed',
      description: 'ISP location reloaded from Caspio.',
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  const uploadMemberClinicalFiles = async (filesOverride?: File[], labelOverride?: string) => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    const filesToUpload = filesOverride?.length ? filesOverride : clinicalUploadFiles;
    const sharedLabel = labelOverride ?? clinicalUploadLabel;
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return false;
    }
    if (!firestore || !storage) {
      toast({ variant: 'destructive', title: 'Storage unavailable', description: 'Sign in and try again.' });
      return false;
    }
    if (!filesToUpload.length) {
      toast({
        variant: 'destructive',
        title: 'Select files',
        description: 'Choose one or more clinical files to upload (e.g., 602, facesheet).',
      });
      return false;
    }
    if (clinicalUploading) return false;

    setClinicalUploadFiles(filesToUpload);
    setClinicalUploading(true);
    setClinicalUploadProgress(0);
    try {
      const uploadedSupportFiles: Array<Record<string, unknown>> = [];
      const totalFiles = filesToUpload.length;
      for (let index = 0; index < filesToUpload.length; index += 1) {
        const file = filesToUpload[index];
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = file.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
        const storagePath = `admin_uploads/alft-sw-portal-support/${memberId}/${ts}_${safeName}`;
        const storageRef = ref(storage, storagePath);
        const fileLabel = inferClinicalFileLabel(file.name, sharedLabel);

        const uploaded = await new Promise<{ downloadURL: string }>((resolve, reject) => {
          const contentType =
            String(file.type || '').trim() || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
          const task = uploadBytesResumable(
            storageRef,
            file,
            contentType
              ? {
                  contentType,
                  customMetadata: {
                    label: fileLabel || '',
                    originalFileName: file.name.slice(0, 180),
                  },
                }
              : undefined
          );
          task.on(
            'state_changed',
            (snap) => {
              const pct = snap.totalBytes > 0 ? (snap.bytesTransferred / snap.totalBytes) * 100 : 0;
              const overall = ((index + pct / 100) / totalFiles) * 100;
              setClinicalUploadProgress(Math.max(1, Math.min(99, Math.round(overall))));
            },
            (err) => reject(err),
            async () => {
              const downloadURL = await getDownloadURL(task.snapshot.ref);
              resolve({ downloadURL });
            }
          );
        });

        uploadedSupportFiles.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: fileLabel || null,
          fileName: file.name,
          downloadURL: uploaded.downloadURL,
          storagePath,
          uploadedAtIso: new Date().toISOString(),
          uploadedByName: clean(user?.displayName) || null,
          uploadedByEmail: clean(user?.email) || null,
        });
      }

      await setDoc(
        doc(firestore, 'alft_assignments', memberId),
        {
          memberId,
          swPortalSupportFiles: arrayUnion(...(uploadedSupportFiles as any[])),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      try {
        const idToken = await getIdToken();
        if (idToken) {
          const notifyRes = await fetch('/api/alft/clinical-files-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              memberId,
              swEmail: socialWorkerEmail || undefined,
              swName: socialWorkerName || undefined,
              files: uploadedSupportFiles.map((file) => ({
                fileName: file.fileName,
                label: file.label,
              })),
            }),
          });
          const notifyBody = await notifyRes.json().catch(() => ({}));
          if (!notifyRes.ok || !notifyBody?.success) {
            console.warn('Clinical file notify failed:', notifyBody?.error || notifyRes.status);
          }
        }
      } catch (notifyError) {
        console.warn('Clinical file notify error:', notifyError);
      }

      const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
      const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
      const nextFiles = assignment ? parseSwPortalSupportFiles(assignment.swPortalSupportFiles) : [];
      if (nextFiles.length) setSwPortalSupportFiles(nextFiles);

      setConfirmedClinicalUploads(true);
      toast({
        title: uploadedSupportFiles.length > 1 ? 'Clinical files uploaded' : 'Clinical file uploaded',
        description: 'Uploaded to the SW portal and logged. SW was notified when an email is on file.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setClinicalUploadFiles([]);
      setClinicalUploadLabel('');
      return true;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: String(error?.message || error),
      });
      return false;
    } finally {
      setClinicalUploading(false);
      setClinicalUploadProgress(0);
    }
  };

  const sendSocialWorkerInvite = async (opts?: { customEmailBody?: string }) => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!canSendSwInvite) {
      toast({
        variant: 'destructive',
        title: 'Complete steps 1–8 first',
        description:
          'Confirm SW, first review staff, RN, purpose, ISP location, clinical uploads, prefill the form, and verify the preview.',
      });
      return;
    }
    if (!socialWorkerEmail) {
      toast({ variant: 'destructive', title: 'Social worker email required' });
      return;
    }
    const portalOk = await verifySwPortalAccess(socialWorkerEmail);
    if (!portalOk) {
      toast({
        variant: 'destructive',
        title: 'SW portal access required',
        description:
          'Turn on Portal access for this social worker in Admin → SW User Management before sending the invite.',
      });
      return;
    }

    setIsSendingInvite(true);
    try {
      const routed = await persistWorkflowRouting({ quiet: true });
      if (!routed) return;

      const idToken = await getIdToken();
      const pick = (key: string, fallback = '') =>
        clean(answers[key]) || clean(resolvedPreview[key]) || fallback;
      const memberName =
        pick('p1_member_name') || (member ? toName(member) : '') || 'Member';
      const customEmailBody = clean(opts?.customEmailBody || invitePreviewBody);
      const res = await fetch('/api/alft/workflow/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          customEmailBody: customEmailBody || undefined,
          member: {
            id: memberId,
            memberName,
            memberFirstName: pick('p1_first_name'),
            memberLastName: pick('p1_last_name'),
            memberMrn: pick('p1_mrn', member ? clean(member.memberMrn) : ''),
            birthDate: pick('p1_dob'),
            memberSex: pick('p1_sex'),
            memberPrimaryLanguage: pick('p1_primary_language'),
            memberPhone: pick('p1_phone'),
            ispCurrentAddressStreet: pick('p2_current_street'),
            ispCurrentAddressCity: pick('p2_current_city'),
            ispCurrentAddressState: pick('p2_current_state', 'CA'),
            ispCurrentAddressZip: pick('p2_current_zip'),
            currentLocationType: pick('p2_current_type'),
            currentLocationTypeOther: pick('p2_current_type_other'),
            assessmentSite: pick('p2_assessment_site'),
            homeAddressStreet: pick('p2_home_street'),
            homeAddressCity: pick('p2_home_city'),
            homeAddressState: pick('p2_home_state', 'CA'),
            homeAddressZip: pick('p2_home_zip'),
            ispFacilityName: pick('p2_facility_name'),
            ispCurrentLocation: pick('p2_facility_name'),
            ispContactPhone:
              pick('isp_contact_phone') ||
              clean(caspioSourcePreview?.ISP_Contact_Phone) ||
              getRcfeLocationSnapshot(caspioSourcePreview || {}).phone ||
              '',
            ispContactName:
              pick('isp_contact_name') ||
              [pick('isp_contact_first'), pick('isp_contact_last')].filter(Boolean).join(' ').trim() ||
              pick('p1_other_responder_name'),
            ispContactRelationship: sanitizeRelationshipLabel(
              pick('isp_contact_relationship') || pick('p1_other_responder_relationship')
            ),
            ispContactEmail: pick('isp_contact_email') || clean(caspioSourcePreview?.ISP_Contact_Email) || '',
            ispContactConfirmDate: pick('isp_contact_confirm_date'),
            otherResponder: pick('p1_other_responder', 'no'),
            otherResponderName: pick('p1_other_responder_name'),
            otherResponderRelationship: pick('p1_other_responder_relationship'),
            socialWorkerAssigned: socialWorkerName || pick('p1_assessor_name'),
            assignedSwEmail: socialWorkerEmail,
            prefillSourceMode: 'caspio_selected_fields',
            prefillPurpose: assessmentPurpose || undefined,
            visitLocationSource: visitLocationSource || undefined,
            askCaregiverOnArrival: askCaregiverOnArrival || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Invite failed (HTTP ${res.status})`));
      }

      const inviteDateYmd = (() => {
        const fromActivity = assignmentActivity.invitedAt
          ? (() => {
              const ms = Date.parse(assignmentActivity.invitedAt);
              if (!Number.isFinite(ms) || ms <= 0) return '';
              const dt = new Date(ms);
              return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            })()
          : '';
        if (fromActivity) return fromActivity;
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      })();
      setAnswers((prev) => ({ ...prev, p1_referral_date: inviteDateYmd }));

      await refreshAssignmentActivity(memberId);
      setInvitePreviewOpen(false);
      toast({
        title: 'Social worker invite sent',
        description: `${socialWorkerName || 'Social worker'} (${socialWorkerEmail}) can open SW Portal to complete the assessment. After they submit/sign, ${firstReviewer?.label || 'first review staff'} is emailed and gets an Action Item.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not send SW invite',
        description: String(error?.message || error),
      });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const saveFormEdits = async () => {
    if (!activeIntake?.id) {
      toast({ variant: 'destructive', title: 'No active intake', description: 'Wait for SW submit, or open an existing intake.' });
      return;
    }
    setBusyAction('save');
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          exactPacketAnswers: answers,
          transitionSummary: clean(answers.p13_commentary_section) || 'Staff edits from ISP Workflow.',
          requestedActions: 'Continue ISP workflow review.',
          medListAttachment: medListAttachment || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) throw new Error(String(body?.error || 'Save failed'));
      toast({ title: 'Form saved', className: 'bg-green-100 text-green-900 border-green-200' });
      await loadIntakeById(activeIntake.id);
      return true;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: String(error?.message || error) });
      return false;
    } finally {
      setBusyAction('');
    }
  };

  const requestChanges = async () => {
    if (!activeIntake?.id) return;
    if (!confirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” before returning to SW.',
      });
      return;
    }
    if (!clean(rejectReason)) {
      toast({ variant: 'destructive', title: 'Add a change request reason' });
      return;
    }
    setBusyAction('reject');
    try {
      const saved = await saveFormEdits();
      if (!saved) return;
      setBusyAction('reject');
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/workflow/reject-to-sw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: activeIntake.id, reason: rejectReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Return to SW failed'));
      setRejectReason('');
      setConfirmEdits(false);
      toast({
        title: 'Returned to social worker',
        description: 'SW was emailed to make changes, re-sign, and re-submit.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await loadIntakeById(activeIntake.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Request changes failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const acceptAndSendForSignature = async () => {
    if (!activeIntake?.id) return;
    if (!confirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” before submitting to the next step.',
      });
      return;
    }
    if (!firstReviewer) {
      toast({ variant: 'destructive', title: 'Choose first-review staff before accepting' });
      return;
    }
    if (!assignedRn?.email) {
      toast({ variant: 'destructive', title: 'Choose an RN before approving' });
      return;
    }
    setBusyAction('accept');
    try {
      await saveWorkflowRouting();
      setBusyAction('accept');
      const saved = await saveFormEdits();
      if (!saved) return;
      setBusyAction('accept');
      const idToken = await getIdToken();
      // SW already signed on submit → approve straight to RN (no re-sign email).
      // Only request SW signature again when the form was never signed (legacy / incomplete).
      const skipMsw = swAlreadySigned;
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          overrideRnEmail: assignedRn.email,
          overrideRnName: assignedRn.label,
          deferRnEmail: !skipMsw,
          skipMswSignature: skipMsw,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Signature request failed'));
      toast({
        title: skipMsw ? 'Approved — sent to RN' : 'Sent to social worker for signature',
        description: skipMsw
          ? `${assignedRn.label} (${assignedRn.email}) was notified. SW signature from submit was kept.`
          : `After SW signs, ${assignedRn.label} (${assignedRn.email}) will be emailed for RN review.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setConfirmEdits(false);
      await loadIntakeById(activeIntake.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Accept failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const completeFinalReview = async () => {
    if (!activeIntake?.id) return;
    if (!confirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” before completing final review.',
      });
      return;
    }
    setBusyAction('final');
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/workflow/final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: activeIntake.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Final review failed'));
      toast({
        title: 'Final review complete',
        description: 'You can download and archive the signed packet below.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setConfirmEdits(false);
      await loadIntakeById(activeIntake.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Final review failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const downloadAndLog = async () => {
    if (!activeIntake?.id) return;
    setBusyAction('download');
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/download-log', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ intakeId: activeIntake.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(String(body?.error || 'Download failed'));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${clean(activeIntake.memberName) || 'Member'} - ALFT ISP Packet.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: 'Downloaded & logged',
        description: 'Saved to Firestore download log for future re-downloads.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await loadDownloadLogs({ intakeId: activeIntake.id });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const redownloadLog = async (logId: string) => {
    try {
      const idToken = await getIdToken();
      const res = await fetch(`/api/alft/download-log?logId=${encodeURIComponent(logId)}&format=file`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(String(body?.error || 'Re-download failed'));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ALFT-ISP-Packet.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Re-download failed', description: String(error?.message || error) });
    }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>ISP Workflow</CardTitle>
                <Badge variant="outline">Tools / Kaiser</Badge>
              </div>
              <CardDescription className="mt-1.5">
                Confirm social worker → first review staff → RN → upload clinical files for SW, then prefill, verify
                the form preview, and send the SW invite. Flow selections stay above the assessment form. After SW
                submits/signs, first review staff is emailed and gets an Action Item.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-downloads">
                  <Download className="mr-2 h-4 w-4" />
                  ISP Downloads
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-tracker">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  ISP Tracker
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-assignment">SW ISP Assignments</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/admin/tools/isp-sw-tools">
                  <Upload className="mr-2 h-4 w-4" />
                  SW ISP Tools
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(socialWorkerName || socialWorkerEmail) && (
            <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-950">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Social worker on this ISP / ALFT (from Caspio)
              </div>
              <div className="mt-1">
                {socialWorkerName || 'Name not in Caspio'}
                {socialWorkerEmail ? ` • ${socialWorkerEmail}` : ''}
                {socialWorkerCounty ? ` • ${socialWorkerCounty}` : ''}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchMembers({ source: 'cache' })}
              disabled={isLoadingMembers || isSyncingMembersCache}
              title="Fast load from Firestore cache"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers && !isSyncingMembersCache ? 'animate-spin' : ''}`} />
              Load
            </Button>
            <Button
              size="sm"
              onClick={() => void syncMembersCacheFromCaspio()}
              disabled={isLoadingMembers || isSyncingMembersCache}
              title="Pull Kaiser members from Caspio into Firestore, then reload the list"
            >
              {isSyncingMembersCache ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {isSyncingMembersCache ? 'Syncing…' : 'Sync from Caspio'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchMembers({ source: 'caspio' })}
              disabled={isLoadingMembers || isSyncingMembersCache}
              title="Live Caspio read for this session only (does not update Firestore)"
            >
              Refresh from Caspio
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Load = Firestore (fast). Sync from Caspio = update Firestore, then load.
              </span>
            )}
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search by member name, MRN, Client_ID2..."
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Members</CardTitle>
                <CardDescription>{filteredMembers.length} results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {filteredMembers.map((member, index) => {
                    const clientId2 = clientIdOf(member);
                    const isSelected = clientId2 === clean(selectedClientId);
                    return (
                      <button
                        type="button"
                        key={`${clientId2}-${index}`}
                        onClick={() => void requestSelectMember(member)}
                        disabled={checkingPriorInvite}
                        className={`w-full rounded-md border p-3 text-left transition ${
                          isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-medium">{toName(member)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {clientId2 || 'No Client_ID2'} · MRN {clean(member.memberMrn) || 'N/A'}
                        </div>
                      </button>
                    );
                  })}
                  {filteredMembers.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      {members.length === 0 ? 'Click Load to start.' : 'No members match this search.'}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">Member Caspio check &amp; routing</CardTitle>
                  {selectedMember && assignmentActivity.invitedAt ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      Sent to SW · {formatWhen(assignmentActivity.invitedAt)}
                      {(assignmentActivity.inviteSendCount || 0) > 1 && assignmentActivity.lastInvitedAt
                        ? ` · Resent ${formatWhen(assignmentActivity.lastInvitedAt)} (${assignmentActivity.inviteSendCount})`
                        : ''}
                    </Badge>
                  ) : null}
                  {selectedMember && assignmentActivity.invitedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                      onClick={() => setStartOverConfirmOpen(true)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Start over &amp; re-send
                    </Button>
                  ) : null}
                </div>
                <CardDescription>
                  Complete steps 1–9 in order above the assessment form. Required fields are ISP location / contact
                  (RCFE used as fallback). Home address is not required. If the member is at RCFE, confirm or sync ISP
                  location in step 5.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedMember ? (
                  <>
                    <div className="rounded-md border p-3 text-sm">
                      <div><span className="font-medium">Member:</span> {toName(selectedMember)}</div>
                      <div><span className="font-medium">Client_ID2:</span> {clientIdOf(selectedMember)}</div>
                      <div><span className="font-medium">MRN:</span> {clean(selectedMember.memberMrn) || 'N/A'}</div>
                      <div><span className="font-medium">Member county:</span> {memberCounty || clean(selectedMember.memberCounty) || '—'}</div>
                      {(socialWorkerName || socialWorkerEmail) ? (
                        <div className="mt-1 border-t pt-1 text-xs text-muted-foreground">
                          SW assignment: {socialWorkerName || '—'}
                          {socialWorkerCounty ? ` · ${socialWorkerCounty}` : ''}
                          {socialWorkerEmail ? ` · ${socialWorkerEmail}` : ''}
                        </div>
                      ) : null}
                      {assignmentActivity.invitedAt ? (
                        <div className="mt-1 space-y-0.5 border-t pt-1 text-xs font-medium text-emerald-800">
                          <div>
                            Sent to SW
                            {assignmentActivity.invitedTo ? ` → ${assignmentActivity.invitedTo}` : ''}
                            {` · first ${formatWhen(assignmentActivity.invitedAt)}`}
                          </div>
                          {(assignmentActivity.inviteSendCount || 0) > 1 && assignmentActivity.lastInvitedAt ? (
                            <div>
                              {assignmentActivity.inviteSendCount} total sends · latest{' '}
                              {formatWhen(assignmentActivity.lastInvitedAt)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {priorInviteBanner ? (
                      <div
                        className={`rounded-md border p-3 text-sm ${
                          restartFromBeginning
                            ? 'border-amber-300 bg-amber-50 text-amber-950'
                            : 'border-orange-300 bg-orange-50 text-orange-950'
                        }`}
                      >
                        <div className="flex items-start gap-2 font-semibold">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          {restartFromBeginning
                            ? 'Restarting from beginning — prior SW invite exists'
                            : 'Already sent to social worker'}
                        </div>
                        <div className="mt-1 text-xs">
                          {priorInviteBanner.statusLabel}
                          {priorInviteBanner.invitedAt
                            ? ` · Invited ${formatWhen(priorInviteBanner.invitedAt)}`
                            : ''}
                          {priorInviteBanner.invitedTo ? ` → ${priorInviteBanner.invitedTo}` : ''}
                          {priorInviteBanner.hasSubmission ? ' · SW already submitted' : ''}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">Required Caspio ISP fields</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void loadCaspioFieldPreview(clientIdOf(selectedMember), selectedMember)}
                          disabled={isLoadingPreview}
                        >
                          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                          Refresh Selected Member
                        </Button>
                      </div>
                      {isLoadingPreview ? (
                        <div className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading Caspio field status…
                        </div>
                      ) : previewError ? (
                        <div className="mt-2 text-xs text-red-700">{previewError}</div>
                      ) : missingRequiredLabels.length > 0 ? (
                        <div className="mt-2 text-xs text-red-700">
                          Missing required data in Caspio: {missingRequiredLabels.join(', ')}.
                        </div>
                      ) : hasPreviewForSelection ? (
                        <div className="mt-2 text-xs text-green-700">All required fields are present.</div>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">Select a member to check Caspio fields.</div>
                      )}
                      {hasPreviewForSelection && !isLoadingPreview ? (
                        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                          {requiredFieldStatuses.map((field) => {
                            const ready = Boolean(field.value);
                            return (
                              <div key={field.id} className={ready ? 'text-green-700' : 'text-red-700'}>
                                {field.label}: {ready ? `Ready (${field.value})` : 'Missing'}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-3">
                      <div className="text-sm font-semibold text-slate-900">Setup steps (above assessment form)</div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedSw ? 'border-green-300' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">1</Badge>
                          Confirm social worker
                          {confirmedSw ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : null}
                          {socialWorkerName || socialWorkerEmail ? (
                            <Badge className="bg-green-100 text-green-900 hover:bg-green-100">From Caspio</Badge>
                          ) : null}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-medium">Name</label>
                            <Input
                              value={socialWorkerName}
                              onChange={(e) => {
                                setSocialWorkerName(e.target.value);
                                setConfirmedSw(false);
                              }}
                              placeholder="Social worker name"
                              className={socialWorkerName ? 'border-green-400 bg-green-50/50' : undefined}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Email (invite destination)</label>
                            <Input
                              value={socialWorkerEmail}
                              onChange={(e) => {
                                setSocialWorkerEmail(e.target.value);
                                setConfirmedSw(false);
                                setSwPortalActive(null);
                              }}
                              onBlur={() => {
                                if (isUsableSwEmail(socialWorkerEmail)) {
                                  void verifySwPortalAccess(socialWorkerEmail);
                                }
                              }}
                              placeholder="From CalAIM_tbl_Social_Worker.SW_email"
                              className={
                                isUsableSwEmail(socialWorkerEmail) ? 'border-green-400 bg-green-50/50' : undefined
                              }
                            />
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Pulled from Caspio <span className="font-medium">CalAIM_tbl_Social_Worker.SW_email</span> (same
                              email used when activating SW portal access).
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {checkingSwPortal ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Checking SW User Management portal access…
                                </span>
                              ) : swPortalActive === true ? (
                                <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                                  Portal On (SW User Management)
                                </Badge>
                              ) : swPortalActive === false ? (
                                <Badge variant="destructive">Portal Off — enable in SW User Management</Badge>
                              ) : (
                                <Badge variant="outline">Portal access not verified yet</Badge>
                              )}
                              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                                <Link href="/admin/sw-user-management" target="_blank">
                                  Open SW User Management
                                </Link>
                              </Button>
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">SW county</label>
                            <Input
                              value={socialWorkerCounty}
                              onChange={(e) => {
                                setSocialWorkerCounty(e.target.value);
                              }}
                              placeholder="From CalAIM_tbl_Social_Worker.County"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Member county</label>
                            <Input
                              value={memberCounty}
                              onChange={(e) => {
                                setMemberCounty(e.target.value);
                              }}
                              placeholder="From CalAIM_tbl_Members.Member_County"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          variant={confirmedSw ? 'outline' : 'default'}
                          onClick={() => {
                            void (async () => {
                              if (!clean(socialWorkerName) && !clean(socialWorkerEmail)) {
                                toast({
                                  variant: 'destructive',
                                  title: 'Social worker required',
                                  description: 'Enter the social worker name and email, then confirm.',
                                });
                                return;
                              }
                              if (!clean(socialWorkerEmail) || !socialWorkerEmail.includes('@')) {
                                toast({
                                  variant: 'destructive',
                                  title: 'Valid SW email required',
                                  description: 'Invite needs a real social worker email address.',
                                });
                                return;
                              }
                              const portalOk = await verifySwPortalAccess(socialWorkerEmail);
                              if (!portalOk) {
                                toast({
                                  variant: 'destructive',
                                  title: 'SW portal access required',
                                  description:
                                    'Turn on Portal access for this social worker in Admin → SW User Management before confirming.',
                                });
                                return;
                              }
                              setConfirmedSw(true);
                              toast({
                                title: 'Social worker confirmed',
                                description: `${socialWorkerName || 'SW'} · ${socialWorkerEmail} · Portal On`,
                                className: 'bg-green-100 text-green-900 border-green-200',
                              });
                            })();
                          }}
                          disabled={checkingSwPortal}
                        >
                          {checkingSwPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {confirmedSw ? 'Confirmed' : 'Confirm social worker'}
                        </Button>
                        {swPortalActive === false ? (
                          <p className="mt-2 text-xs text-red-700">
                            This SW does not have portal access in{' '}
                            <Link href="/admin/sw-user-management" className="underline underline-offset-2">
                              SW User Management
                            </Link>
                            . Enable Portal access there, then confirm again.
                          </p>
                        ) : null}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedFirstReviewer ? 'border-green-300' : !confirmedSw ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">2</Badge>
                          Confirm first review staff
                          {confirmedFirstReviewer ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <label className="mb-1 block text-xs font-medium">
                          First review staff (ALFT ISP Reviewers)
                        </label>
                        <select
                          className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
                          value={firstReviewerUid}
                          disabled={!confirmedSw}
                          onChange={(e) => {
                            setFirstReviewerUid(e.target.value);
                            setConfirmedFirstReviewer(false);
                          }}
                        >
                          <option value="">Select ALFT ISP Reviewer…</option>
                          {staffOptions.map((s) => (
                            <option key={s.uid} value={s.uid}>
                              {s.label} ({s.email}) · {s.role}
                            </option>
                          ))}
                        </select>
                        {staffOptions.length === 0 ? (
                          <div className="mt-1 text-[11px] text-amber-700">
                            No ALFT ISP Reviewers yet. Enable <span className="font-medium">ALFT ISP Reviewer</span> in
                            Staff Management, then refresh this page.
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          variant={confirmedFirstReviewer ? 'outline' : 'default'}
                          disabled={!confirmedSw || !firstReviewer}
                          onClick={() => {
                            if (!firstReviewer) {
                              toast({ variant: 'destructive', title: 'Select first review staff' });
                              return;
                            }
                            setConfirmedFirstReviewer(true);
                            toast({
                              title: 'First review staff confirmed',
                              description: `${firstReviewer.label} · ${firstReviewer.email}`,
                              className: 'bg-green-100 text-green-900 border-green-200',
                            });
                          }}
                        >
                          {confirmedFirstReviewer ? 'Confirmed' : 'Confirm first review staff'}
                        </Button>
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedRn ? 'border-green-300' : !confirmedFirstReviewer ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">3</Badge>
                          Confirm RN
                          {confirmedRn ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <label className="mb-1 block text-xs font-medium">Assigned RN (after SW signature)</label>
                        <select
                          className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
                          value={rnUid}
                          disabled={!confirmedFirstReviewer}
                          onChange={(e) => {
                            setRnUid(e.target.value);
                            setConfirmedRn(false);
                          }}
                        >
                          {(rnOptions.length ? rnOptions : staffOptions).map((s) => (
                            <option key={s.uid} value={s.uid}>
                              {s.label} ({s.email})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-muted-foreground">Default: leslie@carehomefinders.com</div>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          variant={confirmedRn ? 'outline' : 'default'}
                          disabled={!confirmedFirstReviewer}
                          onClick={() => {
                            setConfirmedRn(true);
                            toast({
                              title: 'RN confirmed',
                              description: `${assignedRn.label} · ${assignedRn.email}`,
                              className: 'bg-green-100 text-green-900 border-green-200',
                            });
                          }}
                        >
                          {confirmedRn ? 'Confirmed' : 'Confirm RN'}
                        </Button>
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedPurpose ? 'border-green-300' : !confirmedRn ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">4</Badge>
                          Purpose of this assessment
                          {confirmedPurpose ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Required — written into the ALFT form and carried through SW, staff, and RN steps.
                        </p>
                        <div className="mb-2 flex flex-wrap gap-3 text-sm">
                          {[
                            { value: 'initial' as const, label: 'Initial' },
                            { value: 'change_condition' as const, label: 'Change of Condition' },
                            { value: 'review' as const, label: 'Review (reassessment)' },
                          ].map((opt) => (
                            <label key={opt.value} className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name="isp-assessment-purpose"
                                checked={assessmentPurpose === opt.value}
                                disabled={!confirmedRn}
                                onChange={() => {
                                  setAssessmentPurpose(opt.value);
                                  setConfirmedPurpose(true);
                                  setConfirmedIspLocation(false);
                                  if (opt.value !== 'review' && opt.value !== 'initial') {
                                    setVisitLocationSource('');
                                    setAskCaregiverOnArrival(false);
                                    // Restore ISP-location preview defaults when leaving visit-location flow.
                                    if (Object.keys(caspioSourcePreview).length) {
                                      setResolvedPreview((prev) =>
                                        applyVisitLocationToPreview(
                                          prev,
                                          caspioSourcePreview,
                                          'isp_location',
                                          opt.value
                                        )
                                      );
                                    }
                                  } else if (
                                    visitLocationSource &&
                                    Object.keys(caspioSourcePreview).length
                                  ) {
                                    setResolvedPreview((prev) =>
                                      applyVisitLocationToPreview(
                                        prev,
                                        caspioSourcePreview,
                                        visitLocationSource,
                                        opt.value
                                      )
                                    );
                                  }
                                }}
                                className="h-4 w-4 accent-blue-700"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        {assessmentPurpose === 'review' || assessmentPurpose === 'initial' ? (
                          <div className="mt-3 space-y-2 rounded border border-sky-200 bg-sky-50/60 p-3">
                            <div className="text-xs font-medium text-sky-950">
                              {assessmentPurpose === 'initial'
                                ? 'Initial visit — is the member already at an RCFE, or at another ISP location (home, SNF, etc.)?'
                                : 'Reassessment / reauthorization visit — is the member at an RCFE, or still at home / SNF / another ISP location?'}
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm">
                              {[
                                {
                                  value: 'rcfe' as const,
                                  label:
                                    assessmentPurpose === 'initial' ? 'Already at RCFE' : 'At RCFE',
                                },
                                {
                                  value: 'isp_location' as const,
                                  label:
                                    assessmentPurpose === 'initial'
                                      ? 'Other ISP location (home, SNF, etc.)'
                                      : 'Still at home / SNF / other ISP location',
                                },
                              ].map((opt) => (
                                <label key={opt.value} className="inline-flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="isp-visit-location"
                                    checked={visitLocationSource === opt.value}
                                    onChange={() => {
                                      setVisitLocationSource(opt.value);
                                      if (opt.value !== 'rcfe') setAskCaregiverOnArrival(false);
                                      setConfirmedIspLocation(false);
                                      if (Object.keys(caspioSourcePreview).length) {
                                        setResolvedPreview((prev) =>
                                          applyVisitLocationToPreview(
                                            prev,
                                            caspioSourcePreview,
                                            opt.value,
                                            assessmentPurpose
                                          )
                                        );
                                      }
                                    }}
                                    className="h-4 w-4 accent-blue-700"
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                            {visitLocationSource === 'rcfe' ? (
                              <div className="space-y-2">
                                <p className="text-[11px] text-sky-900">
                                  Form uses Caspio ISP location. If RCFE_Name is filled and does not match, step 5 will
                                  ask you to update Caspio and refresh.
                                  {assessmentPurpose === 'initial'
                                    ? ' SW email: Initial assessment — already at an RCFE.'
                                    : ' SW email: Reassessment — at an RCFE.'}
                                </p>
                                <label className="flex items-start gap-2 rounded border border-sky-200 bg-white/80 px-2 py-1.5 text-[11px] text-slate-800">
                                  <Checkbox
                                    checked={askCaregiverOnArrival}
                                    onCheckedChange={(checked) => setAskCaregiverOnArrival(checked === true)}
                                    className="mt-0.5"
                                  />
                                  <span>
                                    Ask for caregiver assigned to member when arrive at RCFE
                                    <span className="mt-0.5 block text-muted-foreground">
                                      SW invite will also tell them to ask for the assigned caregiver on arrival. ISP
                                      Contact Phone is still required (RCFE phone is OK).
                                    </span>
                                  </span>
                                </label>
                              </div>
                            ) : null}
                            {visitLocationSource === 'isp_location' ? (
                              <p className="text-[11px] text-sky-900">
                                Form uses Caspio ISP location — verify it in step 5.
                                {assessmentPurpose === 'review'
                                  ? ' SW email: may still be at home, SNF, or another ISP location.'
                                  : ' SW email: member not yet at an RCFE for this initial visit.'}
                              </p>
                            ) : null}
                            {visitLocationSummary ? (
                              <div className="rounded border bg-white px-2 py-1.5 text-[11px] text-slate-700">
                                Preview ({visitLocationSummary.label}):{' '}
                                {[
                                  visitLocationSummary.name,
                                  visitLocationSummary.street,
                                  visitLocationSummary.city,
                                  visitLocationSummary.phone,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'No values found in Caspio yet'}
                              </div>
                            ) : null}
                            {!visitLocationSource ? (
                              <p className="text-[11px] text-amber-800">
                                Select RCFE or ISP location so the SW email includes the correct visit type.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {confirmedPurpose && assessmentPurpose ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Purpose confirmed (
                            {assessmentPurpose === 'initial'
                              ? 'Initial'
                              : assessmentPurpose === 'change_condition'
                                ? 'Change of Condition'
                                : 'Review / reauthorization'}
                            )
                            {(assessmentPurpose === 'review' || assessmentPurpose === 'initial') &&
                            visitLocationSource
                              ? ` · ${
                                  visitLocationSource === 'rcfe'
                                    ? assessmentPurpose === 'initial'
                                      ? 'Already at RCFE'
                                      : 'At RCFE'
                                    : 'Home / SNF / other ISP location'
                                }`
                              : ''}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Select a purpose to continue.</div>
                        )}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedIspLocation
                            ? 'border-green-300'
                            : !confirmedPurpose || !visitLocationReady
                              ? 'opacity-70'
                              : ispRcfeSoftMismatch
                                ? 'border-amber-400'
                                : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">5</Badge>
                          Verify ISP location
                          {confirmedIspLocation ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                          {ispRcfeSoftMismatch && !confirmedIspLocation ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          ) : null}
                        </div>

                        {!confirmedPurpose || !visitLocationReady ? (
                          <div className="text-[11px] text-amber-800">
                            Finish step 4 (purpose
                            {needsVisitLocationChoice ? ' + RCFE / ISP location' : ''}) first.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="rounded border bg-muted/20 px-2 py-1.5 text-[11px] text-slate-800">
                              <div className="font-medium text-slate-900">ISP location</div>
                              <div>
                                {[
                                  ispLocationSnapshot.name,
                                  ispLocationSnapshot.street,
                                  ispLocationSnapshot.city,
                                  ispLocationSnapshot.state,
                                  ispLocationSnapshot.zip,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'No ISP location in Caspio yet'}
                              </div>
                            </div>

                            {ispRcfeSoftMismatch && !confirmedIspLocation ? (
                              <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
                                <div className="flex items-start gap-1.5 font-medium">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  Name/address differs from RCFE — RCFE is the default when plugged in
                                </div>
                                <div>
                                  RCFE (default): {rcfeLocationSnapshot.name}
                                  {rcfeLocationSnapshot.street ? ` · ${rcfeLocationSnapshot.street}` : ''}
                                  {rcfeLocationSnapshot.city ? ` · ${rcfeLocationSnapshot.city}` : ''}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={ispLocationUpdating || isLoadingPreview}
                                    onClick={() => void acceptRcfeAsDefaultIspLocation()}
                                  >
                                    {ispLocationUpdating ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : null}
                                    Accept RCFE as default
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={ispLocationUpdating || isLoadingPreview}
                                    onClick={() => void refreshIspLocationFromCaspio()}
                                  >
                                    {isLoadingPreview ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    Refresh
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {confirmedIspLocation ? (
                              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                ISP location verified
                                {visitLocationSource === 'rcfe' && rcfeLocationSnapshot.name
                                  ? ' (RCFE)'
                                  : ''}
                              </div>
                            ) : !ispRcfeSoftMismatch ? (
                              <Button
                                type="button"
                                size="sm"
                                variant={canConfirmIspLocationStep ? 'default' : 'outline'}
                                disabled={!canConfirmIspLocationStep || ispLocationUpdating}
                                onClick={() => {
                                  setConfirmedIspLocation(true);
                                  toast({
                                    title: 'ISP location verified',
                                    description: 'You can continue to clinical uploads.',
                                    className: 'bg-green-100 text-green-900 border-green-200',
                                  });
                                }}
                              >
                                Confirm ISP location verified
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedClinicalUploads
                            ? 'border-green-300'
                            : !confirmedIspLocation
                              ? 'opacity-70'
                              : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">6</Badge>
                          Member clinical uploads
                          {confirmedClinicalUploads ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Choose 602, facesheet, and other clinical documents — they upload automatically to the SW
                          portal for this member. Labels are inferred from filenames (e.g. “602”) when left blank.
                          Unlocks after ISP location is verified (step 5).
                        </p>
                        <div className="space-y-2 rounded border bg-muted/20 p-2">
                          <div className="space-y-1">
                            <Label htmlFor="isp-clinical-upload-label" className="text-[11px]">
                              File label (optional — applies to next upload)
                            </Label>
                            <Input
                              id="isp-clinical-upload-label"
                              value={clinicalUploadLabel}
                              onChange={(e) => setClinicalUploadLabel(e.target.value)}
                              placeholder="Example: 602 or Facesheet"
                              className="h-8 text-xs"
                              disabled={!canUploadClinical}
                            />
                            <input
                              id="isp-clinical-upload-input"
                              type="file"
                              multiple
                              disabled={!canUploadClinical}
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.target.value = '';
                                if (!files.length || !confirmedIspLocation) return;
                                void uploadMemberClinicalFiles(files, clinicalUploadLabel);
                              }}
                              className="text-xs"
                            />
                            {!confirmedIspLocation ? (
                              <div className="text-[11px] text-amber-800">Verify ISP location (step 5) to enable clinical uploads.</div>
                            ) : null}
                            {clinicalUploading ? (
                              <div className="flex items-center gap-2 text-[11px] text-blue-800">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Uploading to SW portal
                                {clinicalUploadProgress ? ` (${clinicalUploadProgress}%)` : '…'}
                              </div>
                            ) : clinicalUploadFiles.length ? (
                              <div className="text-[11px] text-muted-foreground">
                                Selected {clinicalUploadFiles.length} file
                                {clinicalUploadFiles.length > 1 ? 's' : ''}:{' '}
                                {clinicalUploadFiles
                                  .slice(0, 2)
                                  .map((f) => f.name)
                                  .join(', ')}
                                {clinicalUploadFiles.length > 2 ? ` +${clinicalUploadFiles.length - 2} more` : ''}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground">
                                Files upload as soon as you choose them.
                              </div>
                            )}
                          </div>
                          {swPortalSupportFiles.length ? (
                            <div className="space-y-1 border-t pt-2">
                              <div className="text-[11px] font-medium text-slate-800">Uploaded for this member</div>
                              {swPortalSupportFiles.slice(0, 8).map((file, idx) => (
                                <div key={file.id || `${file.fileName}-${idx}`} className="text-[11px] text-muted-foreground">
                                  <a
                                    href={file.downloadURL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-blue-700 hover:underline"
                                  >
                                    {file.label || file.fileName || 'Clinical file'}
                                  </a>
                                  {file.label && file.fileName && file.label !== file.fileName
                                    ? ` (${file.fileName})`
                                    : ''}
                                  {file.uploadedAtLabel ? ` · uploaded ${file.uploadedAtLabel}` : ''}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="border-t pt-2 text-[11px] text-muted-foreground">
                              No clinical files uploaded for this member yet.
                            </div>
                          )}
                        </div>
                        {!confirmedClinicalUploads ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            disabled={!canUploadClinical}
                            onClick={() => {
                              setConfirmedClinicalUploads(true);
                              toast({
                                title: 'Continuing without clinical files',
                                description: 'You can upload later from ALFT Tracker or by choosing files above.',
                                className: 'bg-green-100 text-green-900 border-green-200',
                              });
                            }}
                          >
                            Continue without clinical files
                          </Button>
                        ) : null}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          showForm ? 'border-green-300' : !confirmedClinicalUploads ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">7</Badge>
                          Prefill ISP form
                          {showForm ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Unlocks after steps 1–6 and all required Caspio fields are ready. “Besides client answering”
                          stays blank for the SW to complete.
                        </p>
                        <Button
                          onClick={() => void prefillIspForm()}
                          disabled={isPrefilling || isLoadingPreview || !canPrefillIspForm}
                        >
                          {isPrefilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Prefill ISP Form
                        </Button>
                        {!canPrefillIspForm && prefillBlockedReasons.length > 0 ? (
                          <div className="mt-2 space-y-0.5 text-xs text-amber-800">
                            <div className="font-medium">Still needed to unlock prefill:</div>
                            {prefillBlockedReasons.map((reason) => (
                              <div key={reason}>• {reason}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          formPreviewVerified ? 'border-green-300' : !showForm ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">8</Badge>
                          Verify form preview
                          {formPreviewVerified ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <label className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={formPreviewVerified}
                            disabled={!canVerifyFormPreview}
                            onCheckedChange={(checked) => setFormPreviewVerified(checked === true)}
                            className="mt-0.5"
                          />
                          <span>
                            I reviewed the assessment form preview below and confirm prefilled member data looks
                            correct before inviting the social worker.
                          </span>
                        </label>
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          assignmentActivity.invitedAt ? 'border-green-300' : !formPreviewVerified ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">9</Badge>
                          Send social worker invite
                          {assignmentActivity.invitedAt ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Preview the invite, edit a custom message, then send. When they submit/sign,{' '}
                          <span className="font-medium">{firstReviewer?.label || 'first review staff'}</span> is
                          notified by email and Action Items.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => openSwInvitePreview()}
                            disabled={isSendingInvite || !canSendSwInvite}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            {assignmentActivity.invitedAt ? 'Preview & re-send invite' : 'Preview & send SW invite'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => void saveWorkflowRouting()}
                            disabled={savingRouting || !firstReviewer}
                          >
                            {savingRouting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Update routing
                          </Button>
                          {routingAutosaveLabel ? (
                            <span className="text-[11px] text-muted-foreground">{routingAutosaveLabel}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              Routing autosaves after steps 1–3 are confirmed.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">SW invite / assessment activity log</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void refreshAssignmentActivity(clientIdOf(selectedMember))}
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Refresh log
                        </Button>
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                        <li>
                          <span className="font-medium">Invite sent:</span>{' '}
                          {assignmentActivity.invitedAt
                            ? `${formatWhen(assignmentActivity.invitedAt)}${
                                assignmentActivity.invitedTo ? ` → ${assignmentActivity.invitedTo}` : ''
                              }${
                                (assignmentActivity.inviteSendCount || 0) > 1
                                  ? ` · ${assignmentActivity.inviteSendCount} sends (latest ${formatWhen(
                                      assignmentActivity.lastInvitedAt || assignmentActivity.invitedAt
                                    )})`
                                  : ''
                              }`
                            : 'Not sent yet'}
                        </li>
                        <li>
                          <span className="font-medium">SW viewed portal:</span>{' '}
                          {assignmentActivity.viewedAt
                            ? `${formatWhen(assignmentActivity.viewedAt)}${
                                assignmentActivity.viewedBy ? ` · ${assignmentActivity.viewedBy}` : ''
                              }`
                            : 'Not viewed yet'}
                        </li>
                        <li>
                          <span className="font-medium">SW submitted / signed:</span>{' '}
                          {assignmentActivity.signedAt || assignmentActivity.submittedAt
                            ? formatWhen(assignmentActivity.signedAt || assignmentActivity.submittedAt)
                            : 'Not submitted yet'}
                        </li>
                        <li>
                          <span className="font-medium">Next after SW submit:</span> email + Action Item for{' '}
                          {firstReviewer?.label || 'first review staff'} (members needing review)
                        </li>
                      </ul>
                      {assignmentActivity.emailLog && assignmentActivity.emailLog.length > 0 ? (
                        <div className="mt-2 border-t pt-2">
                          <div className="text-xs font-medium text-slate-800">Email delivery history</div>
                          <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-600">
                            {[...assignmentActivity.emailLog]
                              .slice()
                              .reverse()
                              .map((entry, idx) => (
                                <div key={`${entry.atIso}-${idx}`}>
                                  {entry.status || '—'}
                                  {entry.recipientEmail ? ` · ${entry.recipientEmail}` : ''}
                                  {entry.atIso ? ` · ${formatWhen(entry.atIso)}` : ''}
                                  {entry.isResend ? ' · re-send' : ''}
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                      <div className="font-medium text-sm text-slate-900">Flow after invite</div>
                      <ol className="mt-2 list-decimal space-y-1 pl-4">
                        <li>
                          SW completes assessment in portal, signs, and submits → notify{' '}
                          <span className="font-medium">{firstReviewer?.label || 'selected staff'}</span> (email +
                          Action Items)
                        </li>
                        <li>
                          Staff reviews: edit as needed and <span className="font-medium">Approve → RN</span>, or{' '}
                          <span className="font-medium">Send back</span> to SW with comments (SW revises and re-signs)
                        </li>
                        <li>
                          On approve (SW already signed) → email to{' '}
                          <span className="font-medium">{assignedRn.label}</span> for RN edits/signature
                        </li>
                        <li>
                          RN edits/signs → back to{' '}
                          <span className="font-medium">{firstReviewer?.label || 'selected staff'}</span> for final
                          review + download
                        </li>
                      </ol>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" asChild>
                        <Link href="/admin/tools/isp-downloads">
                          <Download className="mr-2 h-4 w-4" />
                          ISP Downloads Log
                        </Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href="/admin/tools/isp-tracker">
                          <ClipboardList className="mr-2 h-4 w-4" />
                          ISP Tracker (status)
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Load and select a Kaiser member to begin.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {activeIntake ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active intake review</CardTitle>
            <CardDescription>
              {activeIntake.memberName || 'Member'} · Status:{' '}
              <span className="font-medium">{activeIntake.workflowStatus || '—'}</span>
              {activeIntake.alftStaffEmail ? ` · Staff: ${activeIntake.alftStaffName || activeIntake.alftStaffEmail}` : ''}
              {activeIntake.alftRnEmail ? ` · RN: ${activeIntake.alftRnName || activeIntake.alftRnEmail}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
              <Checkbox
                id="isp-workflow-confirm-edits"
                checked={confirmEdits}
                onCheckedChange={(v) => setConfirmEdits(Boolean(v))}
                disabled={Boolean(busyAction)}
              />
              <Label htmlFor="isp-workflow-confirm-edits" className="text-sm leading-relaxed">
                I confirm these edits are complete and accurate before submitting to the next step.
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveFormEdits()} disabled={Boolean(busyAction)}>
                {busyAction === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Form Edits
              </Button>
              {canFirstReview ? (
                <>
                  <Button
                    onClick={() => void acceptAndSendForSignature()}
                    disabled={!confirmEdits || Boolean(busyAction)}
                  >
                    {busyAction === 'accept' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {swAlreadySigned ? 'Approve → Send to RN' : 'Accept → SW Signature'}
                  </Button>
                </>
              ) : null}
              {canFinalReview || canDownloadPacket ? (
                <Button
                  variant="outline"
                  onClick={() => void completeFinalReview()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                >
                  {busyAction === 'final' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Complete Final Review
                </Button>
              ) : null}
              {canDownloadPacket ? (
                <Button onClick={() => void downloadAndLog()} disabled={Boolean(busyAction)}>
                  {busyAction === 'download' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download &amp; Log
                </Button>
              ) : null}
            </div>

            {canFirstReview ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-sm font-medium">Request changes (return to SW)</div>
                <p className="text-xs text-muted-foreground">
                  {swAlreadySigned
                    ? 'SW already signed on submit. Use Approve → Send to RN if the form is good (or after your edits). Only send back when the SW must revise and re-sign.'
                    : 'Return with comments so the SW can revise, sign, and re-submit.'}
                </p>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Describe what the social worker needs to fix…"
                  rows={3}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void requestChanges()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                >
                  {busyAction === 'reject' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send Back to Social Worker
                </Button>
              </div>
            ) : null}

            {downloadLogs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Recent download log (this intake)</div>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <Link href="/admin/tools/isp-downloads">
                      View all ISP downloads
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="space-y-1">
                  {downloadLogs.map((log) => (
                    <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <div>
                        <div className="font-medium">{log.downloadName || 'ALFT packet'}</div>
                        <div className="text-muted-foreground">
                          {log.staffName || 'Staff'}
                          {log.createdAt ? ` · ${new Date(log.createdAt).toLocaleString()}` : ''}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void redownloadLog(log.id)}>
                        Re-download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No downloads logged for this intake yet.{' '}
                <Link href="/admin/tools/isp-downloads" className="underline underline-offset-2">
                  Open ISP Downloads data page
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showForm ? (
        <Card className={ispLayoutMode === 'mobile' ? 'max-w-xl mx-auto' : undefined}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>ISP / ALFT Assessment Form</CardTitle>
                <CardDescription>
                  ALFT tool preview for the selected member. Green fields come from Caspio. Complete steps 1–7 and
                  Prefill to finalize before the SW invite. Use Mobile to preview the SW phone-friendly layout.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IspLayoutModeToggle
                  mode={ispLayoutMode}
                  onChange={(mode) => {
                    setIspLayoutMode(mode);
                    writeIspLayoutMode(mode);
                  }}
                />
                <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                  {caspioFilledIds.length} prefilled fields
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <SwStyleAlftEditor
              answers={answers}
              onChange={(id, value) => {
                if (isIspAlftLockedField(id)) return;
                if (
                  id === 'p1_purpose' &&
                  normalizeIspAssessmentPurpose(assessmentPurpose) &&
                  normalizeIspAssessmentPurpose(answers.p1_purpose)
                ) {
                  return;
                }
                if (id === 'p1_purpose') {
                  const purpose = normalizeIspAssessmentPurpose(value);
                  setAnswers((prev) => ({ ...prev, [id]: purpose || String(value || '') }));
                  return;
                }
                setAnswers((prev) => ({ ...prev, [id]: value }));
              }}
              memberName={clean(answers.p1_member_name)}
              memberMrn={clean(answers.p1_mrn)}
              highlightedFieldIds={caspioFilledIds}
              disabledFieldIds={
                normalizeIspAssessmentPurpose(assessmentPurpose) &&
                normalizeIspAssessmentPurpose(answers.p1_purpose)
                  ? [...ISP_ALFT_LOCKED_FIELD_IDS, 'p1_purpose']
                  : ISP_ALFT_LOCKED_FIELD_IDS
              }
              layoutMode={ispLayoutMode}
              memberId={selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId) || undefined}
              medListAttachment={medListAttachment}
              onMedListAttachmentChange={setMedListAttachment}
            />
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={invitePreviewOpen} onOpenChange={setInvitePreviewOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Social worker invite preview</DialogTitle>
            <DialogDescription>
              Edit the email body before sending. Recipient uses CalAIM_tbl_Social_Worker.SW_email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto pr-1 text-sm">
            <div>
              <span className="font-medium">To:</span> {socialWorkerEmail || '—'}
            </div>
            <div>
              <span className="font-medium">Subject:</span>{' '}
              {`ALFT assigned: ${clean(answers.p1_member_name) || (selectedMember ? toName(selectedMember) : 'Member')}`}
            </div>
            <div className="text-xs text-muted-foreground">
              SW county: {socialWorkerCounty || '—'} · Member county: {memberCounty || '—'}
            </div>
            <div>
              <div className="mb-1 font-medium">Preview</div>
              <div
                className="rounded border bg-muted/20 p-2 text-xs leading-5"
                dangerouslySetInnerHTML={{ __html: formatSwEmailBodyPreviewHtml(invitePreviewBody) }}
              />
            </div>
            <div className="space-y-1 rounded border bg-muted/20 p-2">
              <label className="text-[11px] font-medium" htmlFor="isp-sw-invite-body">
                Custom email message
              </label>
              <Textarea
                id="isp-sw-invite-body"
                value={invitePreviewBody}
                onChange={(e) => setInvitePreviewBody(e.target.value)}
                rows={12}
                className="text-xs"
                placeholder="Edit the full invite email body before sending."
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-3">
            <Button variant="outline" onClick={() => setInvitePreviewOpen(false)} disabled={isSendingInvite}>
              Close
            </Button>
            <Button
              onClick={() => void sendSocialWorkerInvite({ customEmailBody: invitePreviewBody })}
              disabled={isSendingInvite || !isUsableSwEmail(socialWorkerEmail)}
            >
              {isSendingInvite ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {assignmentActivity.invitedAt ? 'Re-send invite' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(priorInvitePrompt)}
        onOpenChange={(open) => {
          if (!open) setPriorInvitePrompt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already sent to social worker</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">
                    {priorInvitePrompt?.memberName || 'This member'}
                  </span>{' '}
                  was already invited through the app
                  {priorInvitePrompt?.invitedAt ? ` on ${formatWhen(priorInvitePrompt.invitedAt)}` : ''}
                  {priorInvitePrompt?.invitedTo ? ` → ${priorInvitePrompt.invitedTo}` : ''}.
                </p>
                <p>
                  Current status:{' '}
                  <span className="font-medium text-foreground">
                    {priorInvitePrompt?.statusLabel || 'In process'}
                  </span>
                  {priorInvitePrompt?.hasSubmission ? ' (SW already submitted).' : '.'}
                </p>
                <p>Continue with the existing process, or restart from the beginning and re-send?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!priorInvitePrompt) return;
                applyMemberSelection(priorInvitePrompt.memberId, {
                  restart: false,
                  prior: priorInvitePrompt,
                });
              }}
            >
              Continue existing
            </Button>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                if (!priorInvitePrompt) return;
                applyMemberSelection(priorInvitePrompt.memberId, {
                  restart: true,
                  prior: priorInvitePrompt,
                });
              }}
            >
              Restart from beginning
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={startOverConfirmOpen} onOpenChange={setStartOverConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over and re-send invite?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This resets setup steps 1–8 so you can walk through them again and send a new invite.
                </p>
                <p>
                  Prior invite history stays on this form and in the activity / email log
                  {assignmentActivity.invitedAt
                    ? ` (first sent ${formatWhen(assignmentActivity.invitedAt)}${
                        assignmentActivity.invitedTo ? ` → ${assignmentActivity.invitedTo}` : ''
                      })`
                    : ''}
                  .
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => beginStartOverForResend()}
            >
              Start over &amp; re-send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
