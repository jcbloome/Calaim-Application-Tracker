'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Database, Loader2, RefreshCw, RotateCcw, Search, Send, Upload } from 'lucide-react';
import { parseMedListAttachment, type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';
import { Badge } from '@/components/ui/badge';
import { BackToTop, scrollAdminPageToTop } from '@/components/ui/back-to-top';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';
import { normalizeAlftAnswersCapitalization, formatAlftSexValue } from '@/lib/alft-proper-case';
import {
  listAlftAuthoritativeFieldIdsForPdfPages,
  mergeAlftParsedAnswers,
  refineAlftTherapiesServicesAnswers,
  type AlftParsedAnswerMap,
} from '@/lib/alft/parse-alft-completed-pdf';
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
  evaluateIspLocationReadiness,
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
  applyAlftPlanIdFromMrn,
  applyIspAlftLockedFieldDefaults,
  isIspAlftLockedField,
} from '@/lib/isp-alft-field-rules';
import { SW_LOGIN_URL } from '@/lib/app-urls';
import { buildIspWorkflowActivityEntry } from '@/lib/isp-workflow-activity';
import {
  type IspLayoutMode,
  readIspLayoutMode,
} from '@/lib/isp-layout-mode';
import { formatKaiserMembersFetchError } from '@/lib/fetch-kaiser-members';
import { buildH2022EndWarning } from '@/lib/h2022-end-warning';
import { resolveEffectiveRnRecommendedTier } from '@/lib/alft-tier-recommendation';
import {
  buildSwAssignmentHistoryEntry,
  swEmailsDiffer,
} from '@/lib/sw-assignment-history';
import { appConfirm } from '@/components/AppDialogHost';
import { firebaseAuthHeaders } from '@/lib/admin-fetch';
import {
  isFirestoreWriteRateLimited,
  setDocWithBackoff,
} from '@/lib/firestore-batch-throttle';
import {
  formatWhen,
  isUsableSwEmail,
  formatSwEmailBodyPreviewHtml,
  swFirstNameOf,
  AnswerMap,
  KaiserMember,
  StaffOption,
  CaspioAssessorRoleInfo,
  ActiveIntake,
  DownloadLog,
  SwPortalSupportFile,
  ApplicationClinicalFile,
  extractApplicationClinicalFiles,
  AGENCY_NAME,
  DEFAULT_RN_EMAIL,
  REQUIRED_CASPIO_FIELDS,
  resolveRequiredCaspioFieldValue,
  clean,
  clientIdOf,
  isMembersCacheStale,
  toName,
  lastNameOf,
  resolveKaiserStatusValue,
  isRnVisitNeededStatus,
  toMmDdYyyy,
  buildBlankAnswers,
  CASPIO_REFRESHABLE_FIELD_IDS,
  renderPdfPagesToBlobs,
  parseSwPortalSupportFiles,
  PriorSwInviteInfo,
  detectPriorSwInvite,
  AssignmentInviteActivity,
  buildAssignmentInviteActivity,
  inferClinicalFileLabel,
} from './components/isp-workflow-helpers';
import { MemberListCard } from './components/MemberListCard';
import { RequiredCaspioFieldsPanel } from './components/RequiredCaspioFieldsPanel';
import { ConfirmAssessorStep } from './components/ConfirmAssessorStep';
import { ConfirmRnStep } from './components/ConfirmRnStep';
import { RcfeDetailsStep } from './components/RcfeDetailsStep';
import { IspLocationStep } from './components/IspLocationStep';
import { MemberUploadsStep } from './components/MemberUploadsStep';
import { CaspioPrefillStep } from './components/CaspioPrefillStep';
import { SwInviteActivityLog } from './components/SwInviteActivityLog';
import { SentToIlsPanel } from './components/SentToIlsPanel';
import { ActiveIntakeReviewCard } from './components/ActiveIntakeReviewCard';
import { IspAssessmentFormCard } from './components/IspAssessmentFormCard';
import { ResendReasonDialog } from './components/ResendReasonDialog';

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
  const searchParams = useSearchParams() ?? new URLSearchParams();
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'rn_visit_needed'>('all');
  const [memberSortDir, setMemberSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSyncingMembersCache, setIsSyncingMembersCache] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [isRefreshingCaspioFields, setIsRefreshingCaspioFields] = useState(false);
  const [isParsingCompletedPdf, setIsParsingCompletedPdf] = useState(false);
  const [completedPdfParseProgress, setCompletedPdfParseProgress] = useState('');
  const [completedPdfFileName, setCompletedPdfFileName] = useState('');
  /** True after a successful completed-PDF import — Caspio Prefill must not wipe those answers. */
  const [completedPdfImportDone, setCompletedPdfImportDone] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [refreshingSwRnContacts, setRefreshingSwRnContacts] = useState(false);
  const [resolvedPreview, setResolvedPreview] = useState<Record<string, string>>({});
  const [previewMemberId, setPreviewMemberId] = useState('');
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');
  const [answers, setAnswers] = useState<AnswerMap>(() => buildBlankAnswers());
  const [medListAttachment, setMedListAttachment] = useState<AlftMedListAttachment | null>(null);
  const [caspioFilledIds, setCaspioFilledIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [socialWorkerName, setSocialWorkerName] = useState('');
  const [socialWorkerEmail, setSocialWorkerEmail] = useState('');
  const [socialWorkerSwId, setSocialWorkerSwId] = useState('');
  /** Caspio MSW vs RN table classification for the assessor being confirmed. */
  const [assessorCaspioRole, setAssessorCaspioRole] = useState<CaspioAssessorRoleInfo | null>(null);
  /** Departed SW already completed/signed the ISP — confirm by name only, skip portal, import PDF. */
  const [formerSwImportMode, setFormerSwImportMode] = useState(false);
  const [confirmedSw, setConfirmedSw] = useState(false);
  const [swPortalActive, setSwPortalActive] = useState<boolean | null>(null);
  const [checkingSwPortal, setCheckingSwPortal] = useState(false);
  const [confirmedFirstReviewer, setConfirmedFirstReviewer] = useState(false);
  const [confirmedRn, setConfirmedRn] = useState(false);
  const [assessmentPurpose, setAssessmentPurpose] = useState<'initial' | 'change_condition' | 'review' | ''>('');
  const [confirmedPurpose, setConfirmedPurpose] = useState(false);
  const [visitLocationSource, setVisitLocationSource] = useState<IspVisitLocationSource | ''>('');
  const [askCaregiverOnArrival, setAskCaregiverOnArrival] = useState(false);
  /** Allow prefill when ISP Contact Phone is missing (caregiver / front desk at RCFE). */
  const [overrideIspContactPhone, setOverrideIspContactPhone] = useState(false);
  const [deletingClinicalFileId, setDeletingClinicalFileId] = useState('');
  const [caspioSourcePreview, setCaspioSourcePreview] = useState<Record<string, unknown>>({});
  const [prefillDataSource, setPrefillDataSource] = useState('');
  const [confirmedIspLocation, setConfirmedIspLocation] = useState(false);
  const [ispLocationUpdating, setIspLocationUpdating] = useState(false);
  const [confirmedClinicalUploads, setConfirmedClinicalUploads] = useState(false);
  const [swPortalSupportFiles, setSwPortalSupportFiles] = useState<SwPortalSupportFile[]>([]);
  const [applicationClinicalFiles, setApplicationClinicalFiles] = useState<ApplicationClinicalFile[]>([]);
  const [applicationClinicalSourceLabel, setApplicationClinicalSourceLabel] = useState('');
  const [loadingApplicationClinical, setLoadingApplicationClinical] = useState(false);
  const [pullingApplicationClinical, setPullingApplicationClinical] = useState(false);
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
  const routingPersistInFlightRef = useRef(false);
  const routingWriteCooldownUntilRef = useRef(0);
  const visitLocationSourceRef = useRef(visitLocationSource);
  const assessmentPurposeRef = useRef(assessmentPurpose);
  const autoStaleSyncInFlightRef = useRef(false);
  const syncMembersCacheFromCaspioRef = useRef<() => Promise<void>>(async () => undefined);
  const formWorkInProgressRef = useRef(false);
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
  const [sentToIlsManual, setSentToIlsManual] = useState(false);
  const [sentToIlsDate, setSentToIlsDate] = useState('');
  const [sentToIlsSaving, setSentToIlsSaving] = useState(false);
  const [sentToIlsSource, setSentToIlsSource] = useState('');
  /** Staff who verified Sent to ILS (dropdown). */
  const [sentToIlsVerifierUid, setSentToIlsVerifierUid] = useState('');
  const [sentToIlsVerifiedAtIso, setSentToIlsVerifiedAtIso] = useState('');
  const [sentToIlsVerifiedByName, setSentToIlsVerifiedByName] = useState('');
  const [sentToIlsVerifiedByEmail, setSentToIlsVerifiedByEmail] = useState('');
  const [priorInvitePrompt, setPriorInvitePrompt] = useState<PriorSwInviteInfo | null>(null);
  const [priorInviteBanner, setPriorInviteBanner] = useState<PriorSwInviteInfo | null>(null);
  const [restartFromBeginning, setRestartFromBeginning] = useState(false);
  const [startOverConfirmOpen, setStartOverConfirmOpen] = useState(false);
  const [cancelInviteConfirmOpen, setCancelInviteConfirmOpen] = useState(false);
  const [cancelInviteNotifySw, setCancelInviteNotifySw] = useState(true);
  const [cancelInviteReason, setCancelInviteReason] = useState('');
  const [cancellingSwInvite, setCancellingSwInvite] = useState(false);
  const [differentSwInviteWarn, setDifferentSwInviteWarn] = useState<{
    priorEmail: string;
    nextEmail: string;
    priorAt?: string;
  } | null>(null);
  const [checkingPriorInvite, setCheckingPriorInvite] = useState(false);
  const acknowledgedPriorMemberRef = useRef<string>('');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  /** All admin/staff for Sent to ILS verifier dropdown (broader than ISP reviewers). */
  const [ilsVerifierStaffOptions, setIlsVerifierStaffOptions] = useState<StaffOption[]>([]);
  const [rnOptions, setRnOptions] = useState<StaffOption[]>([]);
  const [assessorType, setAssessorType] = useState<'msw' | 'rn'>('msw');
  const [firstReviewerUid, setFirstReviewerUid] = useState('');
  const [rnUid, setRnUid] = useState('');
  const [savingRouting, setSavingRouting] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [ispDownloadConfirm, setIspDownloadConfirm] = useState<{
    versionAtIso: string;
    versionLabel: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmEdits, setConfirmEdits] = useState(false);
  const [resendRnDialogOpen, setResendRnDialogOpen] = useState(false);
  const [resendRnNote, setResendRnNote] = useState('');
  const [confirmResendRnSendOpen, setConfirmResendRnSendOpen] = useState(false);
  const [activeIntake, setActiveIntake] = useState<ActiveIntake | null>(null);
  formWorkInProgressRef.current = Boolean(showForm || activeIntake?.id);
  const [downloadLogs, setDownloadLogs] = useState<DownloadLog[]>([]);
  const [lastDownloadName, setLastDownloadName] = useState('');
  const [lastDownloadedAt, setLastDownloadedAt] = useState('');

  const rnVisitNeededCount = useMemo(
    () => members.filter((member) => isRnVisitNeededStatus(resolveKaiserStatusValue(member))).length,
    [members]
  );

  const filteredMembers = useMemo(() => {
    const needle = clean(queryText).toLowerCase();
    const list = members.filter((member) => {
      if (statusFilter === 'rn_visit_needed' && !isRnVisitNeededStatus(resolveKaiserStatusValue(member))) {
        return false;
      }
      if (!needle) return true;
      return [toName(member), clientIdOf(member), clean(member.memberMrn), clean(member.memberCounty), resolveKaiserStatusValue(member)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    const dir = memberSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const byLast =
        dir *
        lastNameOf(a).localeCompare(lastNameOf(b), undefined, { sensitivity: 'base' });
      if (byLast) return byLast;
      return (
        dir *
          clean(a.memberFirstName).localeCompare(clean(b.memberFirstName), undefined, {
            sensitivity: 'base',
          }) || clientIdOf(a).localeCompare(clientIdOf(b))
      );
    });
    return list;
  }, [members, queryText, statusFilter, memberSortDir]);

  const selectedMember = useMemo(
    () =>
      filteredMembers.find((member) => clientIdOf(member) === clean(selectedClientId)) ||
      filteredMembers[0] ||
      null,
    [filteredMembers, selectedClientId]
  );

  // Kaiser rule: Plan ID always mirrors MRN (member MCP_CIN / form MRN).
  useEffect(() => {
    const fallback =
      clean(selectedMember?.memberMrn) || clean(activeIntake?.medicalRecordNumber) || '';
    setAnswers((prev) => {
      const next = applyAlftPlanIdFromMrn(prev, fallback);
      if (clean(next.p1_mrn) === clean(prev.p1_mrn) && clean(next.p1_plan_id) === clean(prev.p1_plan_id)) {
        return prev;
      }
      return next as AnswerMap;
    });
    if (fallback) {
      setCaspioFilledIds((prev) => {
        const next = new Set(prev);
        next.add('p1_mrn');
        next.add('p1_plan_id');
        return Array.from(next);
      });
    }
  }, [selectedMember?.memberMrn, activeIntake?.medicalRecordNumber, activeIntake?.id]);

  /** Reauth only: warn when member H2022 authorization end is approaching or past. */
  const reauthH2022Warning = useMemo(() => {
    if (assessmentPurpose !== 'review' || !selectedMember) return null;
    const plan =
      clean(selectedMember.CalAIM_MCO) ||
      clean((selectedMember as any).healthPlan) ||
      clean((selectedMember as any).Health_Plan) ||
      'Kaiser';
    const endRaw =
      (selectedMember as any).Authorization_End_Date_H2022 ||
      (selectedMember as any).Auth_End_Date_H2022 ||
      (selectedMember as any).H2022_End_Date ||
      '';
    const warn = buildH2022EndWarning(plan, endRaw);
    return warn.h2022EndWarning ? warn : null;
  }, [assessmentPurpose, selectedMember]);

  const firstReviewer = useMemo(
    () => staffOptions.find((s) => s.uid === firstReviewerUid) || null,
    [staffOptions, firstReviewerUid]
  );
  const assignedRn = useMemo(() => {
    const fromList = rnOptions.find((s) => s.uid === rnUid) || staffOptions.find((s) => s.uid === rnUid);
    if (fromList) return fromList;
    // RN-as-assessor: fall back to the confirmed assessor email when they are also the signing RN.
    if (assessorType === 'rn' && isUsableSwEmail(socialWorkerEmail)) {
      return {
        uid: rnUid || '',
        email: clean(socialWorkerEmail).toLowerCase(),
        label: clean(socialWorkerName) || 'Assigned RN',
        role: 'RN',
        isRn: true,
      } as StaffOption;
    }
    return {
      uid: '',
      email: DEFAULT_RN_EMAIL,
      label: 'Leslie',
      role: 'RN',
      isRn: true,
    } as StaffOption;
  }, [rnOptions, staffOptions, rnUid, assessorType, socialWorkerEmail, socialWorkerName]);

  /** Large RCFE / ALF: no single ISP contact person — SW asks for staff on arrival instead. */
  const waiveIspContactName =
    visitLocationSource === 'rcfe' && Boolean(askCaregiverOnArrival);
  const waiveIspContactPhone =
    Boolean(overrideIspContactPhone) ||
    (visitLocationSource === 'rcfe' && Boolean(askCaregiverOnArrival));

  const requiredFieldStatuses = useMemo(
    () =>
      REQUIRED_CASPIO_FIELDS.map((field) => {
        const value = resolveRequiredCaspioFieldValue(
          field.id,
          resolvedPreview,
          answers,
          caspioSourcePreview || {},
          {
            assessorType,
            socialWorkerName,
            socialWorkerEmail,
          }
        );
        const waived =
          (field.id === 'isp_contact_name' && waiveIspContactName) ||
          (field.id === 'isp_contact_phone' && waiveIspContactPhone);
        const label =
          field.id === 'p1_assessor_name'
            ? assessorType === 'rn'
              ? 'RN Assessor'
              : 'Social Worker / Assessor'
            : field.label;
        return {
          ...field,
          label,
          value,
          waived,
          ready: Boolean(value) || waived,
        };
      }),
    [
      resolvedPreview,
      answers,
      caspioSourcePreview,
      waiveIspContactName,
      waiveIspContactPhone,
      assessorType,
      socialWorkerName,
      socialWorkerEmail,
    ]
  );
  const missingRequiredLabels = useMemo(
    () =>
      requiredFieldStatuses
        .filter((field) => !field.ready)
        .map((field) => field.label),
    [requiredFieldStatuses]
  );
  /** Phone empty in Caspio — staff may override when contact is caregiver / RCFE front desk. */
  const ispContactPhoneEmpty = useMemo(() => {
    const phone = requiredFieldStatuses.find((field) => field.id === 'isp_contact_phone');
    return Boolean(phone && !phone.value);
  }, [requiredFieldStatuses]);
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
  const ispLocationReadiness = useMemo(
    () => evaluateIspLocationReadiness(caspioSourcePreview || {}, visitLocationSource),
    [caspioSourcePreview, visitLocationSource]
  );
  /** At RCFE: ISP fields must match RCFE with a recent ISP_Contact_Confirm_Date before step 5 can be verified. */
  const ispRcfeSoftMismatch = visitLocationSource === 'rcfe' && !ispLocationReadiness.ok;
  const canConfirmIspLocationStep =
    Boolean(assessmentPurpose) && visitLocationReady && ispLocationReadiness.ok;
  // Saved setups restore step 5 as verified; re-check against live Caspio once the preview loads.
  useEffect(() => {
    if (!confirmedIspLocation || !hasPreviewForSelection || isLoadingPreview) return;
    if (visitLocationSource === 'rcfe' && !ispLocationReadiness.ok) {
      setConfirmedIspLocation(false);
    }
  }, [
    confirmedIspLocation,
    hasPreviewForSelection,
    isLoadingPreview,
    visitLocationSource,
    ispLocationReadiness.ok,
  ]);
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
    Boolean(socialWorkerName || socialWorkerEmail) &&
    (formerSwImportMode || swPortalActive === true);

  /** Completed PDF import satisfies step 7 — do not allow Caspio Prefill to wipe parsed answers. */
  const prefillLockedByCompletedPdf = completedPdfImportDone;

  const prefillBlockedReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!hasPreviewForSelection || isLoadingPreview) reasons.push('Wait for Caspio field check to finish');
    if (!confirmedSw) {
      reasons.push(
        assessorType === 'rn' ? 'Confirm RN assessor (step 1)' : 'Confirm social worker (step 1)'
      );
    }
    if (!formerSwImportMode && swPortalActive !== true) {
      reasons.push(
        assessorType === 'rn'
          ? 'Enable RN portal access in RN User Management, then confirm the RN assessor'
          : 'Enable SW portal access in SW User Management, then confirm the social worker'
      );
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
          ? `Fix ISP location in step 5 — ${ispLocationReadiness.reasons.join('; ')}`
          : 'Verify ISP location (step 5)'
      );
    }
    if (!confirmedClinicalUploads) reasons.push('Confirm member clinical uploads (step 6)');
    if (missingRequiredLabels.length > 0) {
      reasons.push(`Missing Caspio fields: ${missingRequiredLabels.join(', ')}`);
    }
    if (!firstReviewer) reasons.push('Choose first review staff');
    if (!socialWorkerName && !socialWorkerEmail) {
      reasons.push(
        formerSwImportMode
          ? 'Enter the social worker name who completed the assessment'
          : assessorType === 'rn'
            ? 'RN assessor name or email required'
            : 'Social worker name or email required'
      );
    }
    return reasons;
  }, [
    assessmentPurpose,
    assessorType,
    confirmedClinicalUploads,
    confirmedFirstReviewer,
    confirmedIspLocation,
    confirmedPurpose,
    confirmedRn,
    confirmedSw,
    firstReviewer,
    formerSwImportMode,
    hasPreviewForSelection,
    isLoadingPreview,
    missingRequiredLabels,
    needsVisitLocationChoice,
    ispRcfeSoftMismatch,
    ispLocationReadiness,
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
      locationSource?: IspVisitLocationSource | '',
      _purpose?: string
    ) => {
      // When staff picks RCFE, pull ISP Address from RCFE_Name / RCFE_Address / RCFE_City / RCFE_State / RCFE_Zip.
      const sourceKey =
        locationSource === 'rcfe' || locationSource === 'isp_location' ? locationSource : 'isp_location';
      return applyIspVisitLocationFromCaspio(baseResolved, source, sourceKey);
    },
    []
  );

  /** Clinical uploads unlock after ISP location is verified. */
  const canUploadClinical = confirmedIspLocation && !clinicalUploading;

  const canVerifyFormPreview = showForm && (canPrefillIspForm || completedPdfImportDone);
  const canSendSwInvite =
    canVerifyFormPreview &&
    formPreviewVerified &&
    Boolean(socialWorkerEmail) &&
    Boolean(firstReviewer);

  const isOverrideYes = (value: unknown) => {
    const raw = clean(value).toLowerCase();
    return raw === 'yes' || raw === 'true' || raw === '1';
  };
  /** Stamp MSW admin override so imported/completed ISPs can Approve → RN without a new SW e-sign. */
  const applyMswAdminOverrideToAnswers = (base: AnswerMap, opts?: { printName?: string }): AnswerMap => {
    const next = { ...base };
    const printName =
      clean(opts?.printName) ||
      clean(next.p14_print_name) ||
      clean(next.p1_assessor_name) ||
      clean(socialWorkerName) ||
      'MSW';
    const signedAt = clean(next.p14_sw_signed_at) || new Date().toISOString();
    next.p14_print_name = printName;
    next.p14_admin_override_msw = 'yes';
    next.p14_sw_signed_at = signedAt;
    if (!clean(next.p14_date)) {
      try {
        const d = new Date(signedAt);
        if (!Number.isNaN(d.getTime())) {
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const yyyy = String(d.getFullYear());
          next.p14_date = `${mm}-${dd}-${yyyy}`;
        }
      } catch {
        // keep blank
      }
    }
    if (!clean(next.p14_electronic_notice) || !String(next.p14_electronic_notice).includes('admin override')) {
      try {
        next.p14_electronic_notice = `Electronically signed on ${new Date(signedAt).toLocaleString()} (admin override — completed ISP)`;
      } catch {
        next.p14_electronic_notice = `Electronically signed (admin override — completed ISP)`;
      }
    }
    return next;
  };
  const workflowStatus = clean(activeIntake?.workflowStatus).toLowerCase();
  const adminOverrideMsw = isOverrideYes(answers?.p14_admin_override_msw);
  const adminOverrideRn = isOverrideYes(answers?.p14_admin_override_rn);
  const importedCompletedIsp = Boolean(
    formerSwImportMode ||
      completedPdfImportDone ||
      clean(activeIntake?.sourceLabel).toLowerCase().includes('completed pdf') ||
      clean(activeIntake?.sourceLabel).toLowerCase().includes('departed sw') ||
      Boolean(activeIntake?.formerSwImportMode) ||
      Boolean(activeIntake?.departedSwCompletedIsp)
  );
  const rnAlreadySigned = Boolean(
    clean((activeIntake as any)?.alftSignature?.rnSignedAt) ||
      clean((activeIntake as any)?.alftForm?.rnSignedAt) ||
      clean(answers?.p14_rn_signed_at) ||
      adminOverrideRn
  );
  const awaitingRnSignature = Boolean(
    activeIntake?.id &&
      !rnAlreadySigned &&
      (workflowStatus.includes('awaiting_rn') ||
        workflowStatus.includes('sent_to_rn') ||
        workflowStatus.includes('awaiting_leslie'))
  );
  const canFirstReview =
    Boolean(activeIntake?.id) &&
    !rnAlreadySigned &&
    !awaitingRnSignature &&
    (workflowStatus.includes('awaiting_manager_review_pre_rn') ||
      workflowStatus.includes('returned_to_sw') ||
      workflowStatus.includes('returned_to_staff') ||
      workflowStatus.includes('returned_to_admin') ||
      workflowStatus.includes('waiting_staff_revision') ||
      // Imported completed ISP / MSW admin override unlocks Approve → RN while still pre-RN.
      ((adminOverrideMsw || importedCompletedIsp) &&
        !workflowStatus.includes('awaiting_kaiser_manager_final') &&
        !workflowStatus.includes('manager_review_complete') &&
        !workflowStatus.includes('completed')));
  const swAlreadySigned = Boolean(
    clean(activeIntake?.alftForm?.swSignature) ||
      clean(activeIntake?.alftForm?.exactPacketAnswers?.p14_print_name) ||
      clean(answers?.p14_print_name) ||
      clean((activeIntake as any)?.alftSignature?.mswSignedAt) ||
      clean(answers?.p14_sw_signed_at) ||
      Boolean((activeIntake as any)?.alftSignature?.mswAdminOverride) ||
      adminOverrideMsw ||
      (importedCompletedIsp &&
        Boolean(clean(answers?.p1_assessor_name) || clean(socialWorkerName)))
  );
  const canFinalReview =
    Boolean(activeIntake?.id) &&
    (workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
      workflowStatus.includes('manager_review_complete') ||
      (rnAlreadySigned && (adminOverrideRn || adminOverrideMsw)));
  /** Old/completed ISP import — edit + download without new SW/RN signature cycle. */
  const canBypassRnSignaturesForDownload = Boolean(
    activeIntake?.id &&
      (formerSwImportMode ||
        completedPdfImportDone ||
        clean(activeIntake?.sourceLabel).toLowerCase().includes('completed pdf') ||
        clean(activeIntake?.sourceLabel).toLowerCase().includes('departed sw') ||
        Boolean(activeIntake?.formerSwImportMode) ||
        Boolean(activeIntake?.departedSwCompletedIsp))
  );
  const canDownloadPacket = Boolean(
    activeIntake?.id &&
      (clean(activeIntake?.alftSignature?.packetPdfStoragePath) ||
        clean(activeIntake?.alftSignature?.signaturePagePdfStoragePath) ||
        canFinalReview ||
        rnAlreadySigned ||
        canBypassRnSignaturesForDownload)
  );
  const sentToRnLabel = (() => {
    const rnName =
      clean(activeIntake?.alftRnName) ||
      clean((activeIntake as any)?.alftSignature?.rnSignedName) ||
      clean(assignedRn?.label) ||
      'RN';
    const rnEmail = clean(activeIntake?.alftRnEmail) || clean(assignedRn?.email);
    return rnEmail ? `Sent to RN (${rnName})` : `Sent to RN — ${rnName}`;
  })();
  /** Resend / new RN signature — available after first send, while awaiting, or after RN already signed. */
  const canResendToRnForNewSignature = Boolean(
    activeIntake?.id &&
      !workflowStatus.includes('completed_sent_to_jocelyn') &&
      (awaitingRnSignature ||
        rnAlreadySigned ||
        Boolean((activeIntake as any)?.alftSignature?.requestedAt) ||
        Boolean((activeIntake as any)?.alftRnResend?.resentAt) ||
        workflowStatus.includes('awaiting_kaiser_manager_final') ||
        workflowStatus.includes('manager_review_complete') ||
        canFinalReview)
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
        setIlsVerifierStaffOptions(options);
        const rns = options.filter((o) => o.isRn);
        setRnOptions(rns.length ? rns : options.filter((o) => o.email === DEFAULT_RN_EMAIL));
        const leslie = options.find((o) => o.email === DEFAULT_RN_EMAIL);
        if (leslie) setRnUid((prev) => prev || leslie.uid);
        const preferredReviewer =
          ispReviewers.find((o) => o.uid === user?.uid) ||
          ispReviewers[0] ||
          null;
        if (preferredReviewer) setFirstReviewerUid((prev) => prev || preferredReviewer.uid);
        const self = options.find((o) => o.uid === user?.uid);
        if (self) setSentToIlsVerifierUid((prev) => prev || self.uid);
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
      if (Boolean(data?.formerSwImportMode || data?.departedSwCompletedIsp)) {
        setFormerSwImportMode(true);
      }
      const sourceLabelLower = clean(data?.sourceLabel).toLowerCase();
      if (
        sourceLabelLower.includes('completed pdf') ||
        sourceLabelLower.includes('departed sw')
      ) {
        setCompletedPdfImportDone(true);
      }
      const lastName =
        clean((data as any)?.alftLastDownloadFileName) ||
        clean((data as any)?.alftLastDownloadName);
      const lastAt =
        clean((data as any)?.alftStaffDownloadedAt) ||
        (typeof (data as any)?.alftStaffDownloadedAt?.toDate === 'function'
          ? (data as any).alftStaffDownloadedAt.toDate().toISOString()
          : '');
      if (lastName) setLastDownloadName(lastName.endsWith('.pdf') ? lastName : `${lastName}.pdf`);
      if (lastAt) setLastDownloadedAt(lastAt);
      if (data?.alftForm?.exactPacketAnswers) {
        setAnswers(
          applyAlftPlanIdFromMrn(
            { ...buildBlankAnswers(), ...(data.alftForm.exactPacketAnswers as AnswerMap) },
            clean(data?.medicalRecordNumber) || clean(selectedMember?.memberMrn)
          ) as AnswerMap
        );
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
        const params = new URLSearchParams({ limit: '50' });
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

  const fetchMembers = async (opts?: {
    clientId2?: string;
    source?: 'cache' | 'caspio';
    skipStaleCheck?: boolean;
    quiet?: boolean;
  }) => {
    const requestedClientId2 = clean(opts?.clientId2);
    const source = opts?.source || (requestedClientId2 ? 'caspio' : 'cache');

    // Avoid serving a stale Firestore cache (Chrome bfcache / old tab / skipped sync).
    if (source === 'cache' && !opts?.skipStaleCheck) {
      const { stale, lastSyncAt } = await isMembersCacheStale();
      if (stale) {
        if (autoStaleSyncInFlightRef.current) return;
        autoStaleSyncInFlightRef.current = true;
        try {
          toast({
            title: 'Members cache is stale',
            description: lastSyncAt
              ? `Last sync ${new Date(lastSyncAt).toLocaleString()}. Refreshing from Caspio…`
              : 'No recent sync found. Refreshing from Caspio…',
          });
          await syncMembersCacheFromCaspioRef.current();
        } finally {
          autoStaleSyncInFlightRef.current = false;
        }
        return;
      }
    }

    setIsLoadingMembers(true);
    const controller = new AbortController();
    const timeoutId =
      typeof window !== 'undefined'
        ? window.setTimeout(() => controller.abort(), source === 'caspio' ? 120_000 : 45_000)
        : undefined;
    try {
      const params = new URLSearchParams();
      if (source === 'caspio') {
        params.set('source', 'caspio');
        params.set('refresh', '1');
      } else params.set('source', 'cache');
      if (requestedClientId2) params.set('clientId2', requestedClientId2);
      // Bust Chrome HTTP cache even when Cache-Control is ignored on soft navigations.
      params.set('_', String(Date.now()));
      const response = await fetch(`/api/kaiser-members?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        signal: controller.signal,
      });
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
      if (!opts?.quiet) {
        toast({
          title: 'Kaiser members loaded',
          description: `${loadedMembers.length} members from ${source === 'caspio' ? 'Caspio' : 'cache'}.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Unable to load members',
        description: formatKaiserMembersFetchError(error, {
          context: source === 'caspio' ? 'live Caspio members' : 'Kaiser members cache',
          retryAction:
            source === 'caspio'
              ? 'click Sync from Caspio again, and confirm npm run dev is running'
              : 'click Load, Sync from Caspio, or restart npm run dev if the page cannot reach the API',
        }),
      });
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setIsLoadingMembers(false);
    }
  };

  const syncMembersCacheFromCaspio = async () => {
    try {
      setIsSyncingMembersCache(true);
      const idToken = await getIdToken();
      const response = await fetch(`/api/caspio/members-cache/sync?_=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
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
      await fetchMembers({ source: 'cache', skipStaleCheck: true });
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
  syncMembersCacheFromCaspioRef.current = syncMembersCacheFromCaspio;

  const loadCaspioFieldPreview = useCallback(
    async (
      memberIdRaw: string,
      memberOverride?: KaiserMember | null,
      options?: { preferLive?: boolean; assessorTypeOverride?: 'msw' | 'rn' }
    ) => {
      const memberId = clean(memberIdRaw);
      if (!memberId) return;
      setIsLoadingPreview(true);
      setPreviewError('');
      // ISP Workflow must use live Caspio by default — Firestore caspio_members_cache
      // often lags behind Caspio edits and falsely blocks prefill on "missing" fields.
      const preferLive = options?.preferLive !== false;
      const effectiveAssessorType = options?.assessorTypeOverride || assessorType;
      const controller = new AbortController();
      const timeoutId =
        typeof window !== 'undefined'
          ? window.setTimeout(() => controller.abort(), preferLive ? 90_000 : 45_000)
          : undefined;
      try {
        const idToken = await getIdToken();
        const response = await fetch('/api/alft/prefill/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            idToken,
            memberId,
            preferLive,
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
        const dataSource = clean(body.dataSource) || clean((source as any).__dataSource);
        setPrefillDataSource(dataSource);
        setPreviewMemberId(memberId);
        setCaspioSourcePreview(source);
        const socialWorker = (body.socialWorker || {}) as {
          name?: string | null;
          email?: string | null;
          swId?: string | null;
          county?: string | null;
          memberCounty?: string | null;
          portalActive?: boolean;
          emailSource?: string | null;
          inMswTable?: boolean;
          inRnTable?: boolean;
          caspioRole?: 'msw' | 'rn' | 'both' | 'unknown';
          caspioRoleLabel?: string;
          caspioTableLabel?: string;
        };
        const assignedRnFromCaspio = (body.assignedRn || {}) as {
          name?: string | null;
          email?: string | null;
          rnId?: string | null;
          county?: string | null;
          portalActive?: boolean;
          inMswTable?: boolean;
          inRnTable?: boolean;
          caspioRole?: 'msw' | 'rn' | 'both' | 'unknown';
          caspioRoleLabel?: string;
          caspioTableLabel?: string;
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

        const useRnAssessor = effectiveAssessorType === 'rn';
        const swName = useRnAssessor
          ? clean(assignedRnFromCaspio.name) ||
            clean(source.RN_Assigned) ||
            clean(source.RN_Name) ||
            clean(source.assignedRnName) ||
            ''
          : clean(socialWorker.name) ||
            clean(cleanedResolved.p1_assessor_name) ||
            clean(source.Social_Worker_Assigned) ||
            clean(source.social_worker_assigned);
        // Invite destination: SW_email for MSW, RN roster / portal email for RN override.
        const swEmailFromCaspio = useRnAssessor
          ? (isUsableSwEmail(assignedRnFromCaspio.email) && clean(assignedRnFromCaspio.email)) ||
            (isUsableSwEmail(source.RN_email) && clean(source.RN_email)) ||
            (isUsableSwEmail(source.assignedRnEmail) && clean(source.assignedRnEmail)) ||
            ''
          : (isUsableSwEmail(socialWorker.email) && clean(socialWorker.email)) ||
            (isUsableSwEmail(source.SW_email) && clean(source.SW_email)) ||
            (isUsableSwEmail(source.SW_Email) && clean(source.SW_Email)) ||
            (isUsableSwEmail(source.Social_Worker_Email) && clean(source.Social_Worker_Email)) ||
            '';
        const swCounty = useRnAssessor
          ? clean(assignedRnFromCaspio.county) || clean(source.assignedRnCounty) || ''
          : clean(socialWorker.county) ||
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

        // Keep Social Worker / Assessor green in the Caspio checklist when Caspio returns SW/RN.
        if (swName && !cleanedResolved.p1_assessor_name) {
          cleanedResolved.p1_assessor_name = swName;
        }
        if (memberOverride && !cleanedResolved.p1_mrn && clean(memberOverride.memberMrn)) {
          cleanedResolved.p1_mrn = clean(memberOverride.memberMrn);
        }
        Object.assign(
          cleanedResolved,
          applyAlftPlanIdFromMrn(cleanedResolved, memberOverride ? clean(memberOverride.memberMrn) : '')
        );

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
        setSocialWorkerSwId(
          clean(useRnAssessor ? assignedRnFromCaspio.rnId : socialWorker.swId) || ''
        );
        if (swCounty) setSocialWorkerCounty(swCounty);
        setMemberCounty(nextMemberCounty);
        setSwPortalActive(
          useRnAssessor
            ? typeof assignedRnFromCaspio.portalActive === 'boolean'
              ? assignedRnFromCaspio.portalActive
              : null
            : typeof socialWorker.portalActive === 'boolean'
              ? socialWorker.portalActive
              : null
        );

        const roleSource = useRnAssessor ? assignedRnFromCaspio : socialWorker;
        const roleName = useRnAssessor
          ? clean(assignedRnFromCaspio.name) || swName
          : clean(socialWorker.name) || swName;
        const roleEmail = useRnAssessor
          ? (isUsableSwEmail(assignedRnFromCaspio.email) && clean(assignedRnFromCaspio.email)) ||
            swEmailFromCaspio
          : (isUsableSwEmail(socialWorker.email) && clean(socialWorker.email)) || swEmailFromCaspio;
        if (roleName || roleEmail || roleSource.caspioRole) {
          setAssessorCaspioRole({
            name: roleName,
            email: roleEmail,
            inMswTable: Boolean(roleSource.inMswTable),
            inRnTable: Boolean(roleSource.inRnTable),
            caspioRole: roleSource.caspioRole || 'unknown',
            caspioRoleLabel: clean(roleSource.caspioRoleLabel) || 'Unknown',
            caspioTableLabel:
              clean(roleSource.caspioTableLabel) || 'Not found in Caspio MSW/RN tables',
          });
        } else {
          setAssessorCaspioRole(null);
        }

        // Show ALFT tool immediately with Caspio-ready fields highlighted in green.
        const filledIds = Object.keys(previewForUi).filter((key) => Boolean(clean(previewForUi[key])));
        setAnswers((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(previewForUi)) {
            const cleaned = clean(value);
            if (!cleaned) continue;
            if (key === 'p1_dob' || key === 'p1_referral_date') {
              next[key] = toMmDdYyyy(cleaned);
            } else if (key === 'p1_sex') {
              next[key] = formatAlftSexValue(cleaned);
            } else {
              next[key] = cleaned;
            }
          }
          if (swName) next.p1_assessor_name = swName;
          return applyAlftPlanIdFromMrn(
            applyIspAlftLockedFieldDefaults(next),
            memberOverride ? clean(memberOverride.memberMrn) : ''
          );
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
            const savedAssessor =
              clean(assignment.assessorRole || assignment.ispAssessorType).toLowerCase() === 'rn'
                ? 'rn'
                : 'msw';
            // Never re-force RN from a prior Firestore assignment when the user (or refresh)
            // explicitly asked for MSW — that was wiping Caspio Social_Worker / SW_email.
            const userChoseMsw = options?.assessorTypeOverride === 'msw';
            const userChoseRn = options?.assessorTypeOverride === 'rn';
            if (savedAssessor === 'rn' && !userChoseMsw) {
              setAssessorType('rn');
              const rnName =
                clean(assignedRnFromCaspio.name) ||
                clean(assignment.assignedSwName) ||
                clean(assignment.alftRnName);
              const rnEmail =
                (isUsableSwEmail(assignedRnFromCaspio.email) && clean(assignedRnFromCaspio.email)) ||
                (isUsableSwEmail(assignment.assignedSwEmail) && clean(assignment.assignedSwEmail)) ||
                (isUsableSwEmail(assignment.alftRnEmail) && clean(assignment.alftRnEmail)) ||
                '';
              if (rnName) setSocialWorkerName(rnName);
              if (rnEmail) setSocialWorkerEmail(rnEmail);
              if (typeof assignedRnFromCaspio.portalActive === 'boolean') {
                setSwPortalActive(assignedRnFromCaspio.portalActive);
              }
              if (rnEmail) {
                const match =
                  rnOptions.find((r) => clean(r.email).toLowerCase() === rnEmail.toLowerCase()) || null;
                if (match) setRnUid(match.uid);
              }
            }
            // Persist explicit MSW/RN choice so the next open/refresh does not flip back.
            if ((userChoseMsw && savedAssessor === 'rn') || (userChoseRn && savedAssessor === 'msw')) {
              void setDoc(
                doc(firestore, 'alft_assignments', memberId),
                {
                  assessorRole: userChoseMsw ? 'msw' : 'rn',
                  ispAssessorType: userChoseMsw ? 'msw' : 'rn',
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => null);
            }
            if (Boolean(assignment.formerSwImportMode || assignment.departedSwCompletedIsp)) {
              setFormerSwImportMode(true);
            } else {
              setFormerSwImportMode(false);
            }
            setSwPortalSupportFiles(parseSwPortalSupportFiles(assignment.swPortalSupportFiles));
            if (parseSwPortalSupportFiles(assignment.swPortalSupportFiles).length > 0) {
              setConfirmedClinicalUploads(true);
            }
            const assignmentMed = parseMedListAttachment(assignment.medListAttachment);
            if (assignmentMed) {
              setMedListAttachment((prev) => prev || assignmentMed);
            }
            setAssignmentActivity(buildAssignmentInviteActivity(assignment));
            const sent =
              Boolean(assignment.sentToIls) ||
              Boolean(assignment.coverSheetPackageSentAt) ||
              Boolean(assignment.coverSheetPackageSentAtIso);
            setSentToIlsManual(sent);
            const sentIso = clean(
              assignment.sentToIlsAtIso ||
                assignment.coverSheetPackageSentAtIso ||
                (typeof assignment.sentToIlsAt === 'string' ? assignment.sentToIlsAt : '')
            );
            if (sentIso) {
              const d = new Date(sentIso);
              if (!Number.isNaN(d.getTime())) {
                setSentToIlsDate(d.toISOString().slice(0, 10));
              } else if (/^\d{4}-\d{2}-\d{2}/.test(sentIso)) {
                setSentToIlsDate(sentIso.slice(0, 10));
              }
            } else {
              setSentToIlsDate('');
            }
            setSentToIlsSource(
              assignment.coverSheetPackageSentAtIso || assignment.coverSheetPackageId
                ? 'cover_package'
                : sent
                  ? 'manual'
                  : ''
            );
            setSentToIlsVerifierUid(clean(assignment.sentToIlsVerifiedByUid));
            setSentToIlsVerifiedByName(clean(assignment.sentToIlsVerifiedByName));
            setSentToIlsVerifiedByEmail(clean(assignment.sentToIlsVerifiedByEmail));
            setSentToIlsVerifiedAtIso(
              clean(assignment.sentToIlsVerifiedAtIso) ||
                (sent ? clean(assignment.sentToIlsAtIso) : '')
            );
          } else {
            setAssignmentActivity({});
            setSwPortalSupportFiles([]);
            setFormerSwImportMode(false);
            setSentToIlsManual(false);
            setSentToIlsDate('');
            setSentToIlsSource('');
            setSentToIlsVerifierUid('');
            setSentToIlsVerifiedByName('');
            setSentToIlsVerifiedByEmail('');
            setSentToIlsVerifiedAtIso('');
          }
        }
      } catch (error: unknown) {
        setPreviewMemberId('');
        setResolvedPreview({});
        setCaspioSourcePreview({});
        setPrefillDataSource('');
        setPreviewError(
          formatKaiserMembersFetchError(error, {
            context: 'Caspio ISP fields',
            retryAction: 'click Refresh Selected Member',
          })
        );
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        setIsLoadingPreview(false);
      }
    },
    [applyVisitLocationToPreview, assessorType, firestore, getIdToken]
  );

  const verifySwPortalAccess = useCallback(
    async (emailRaw: string, swIdRaw?: string): Promise<boolean> => {
      const email = clean(emailRaw).toLowerCase();
      const swId = clean(swIdRaw || '');
      if (!isUsableSwEmail(email) && !swId) {
        setSwPortalActive(false);
        return false;
      }
      setCheckingSwPortal(true);
      try {
        const token = await getIdToken();
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (swId) params.set('swId', swId);
        const res = await fetch(`/api/admin/sw-portal/check-access?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || data?.success === false) {
          // Fall back to direct Firestore reads if the API is unavailable.
          if (firestore && email) {
            const emailDoc = await getDoc(doc(firestore, 'socialWorkers', email));
            if (emailDoc.exists() && Boolean(emailDoc.data()?.isActive)) {
              setSwPortalActive(true);
              return true;
            }
            const snap = await getDocs(
              query(collection(firestore, 'socialWorkers'), where('email', '==', email), limit(10))
            );
            const active = snap.docs.some((d) => Boolean(d.data()?.isActive));
            setSwPortalActive(active);
            return active;
          }
          setSwPortalActive(false);
          return false;
        }
        const active = Boolean(data?.active);
        setSwPortalActive(active);
        return active;
      } catch {
        setSwPortalActive(false);
        return false;
      } finally {
        setCheckingSwPortal(false);
      }
    },
    [firestore, getIdToken]
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
        setAssessorType('msw');
        setAssessmentPurpose('');
        setConfirmedPurpose(false);
        setVisitLocationSource('');
        setAskCaregiverOnArrival(false);
        setOverrideIspContactPhone(false);
        setConfirmedIspLocation(false);
        setConfirmedClinicalUploads(false);
        setFormPreviewVerified(false);
        setShowForm(false);
        setCaspioFilledIds([]);
        setAnswers(buildBlankAnswers());
        setMedListAttachment(null);
        setCompletedPdfFileName('');
        setCompletedPdfImportDone(false);
        setFormerSwImportMode(false);
      } else if (id !== clean(selectedClientId)) {
        setCompletedPdfFileName('');
        setCompletedPdfImportDone(false);
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

  const cancelSocialWorkerInvite = useCallback(async () => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (assignmentActivity.submittedAt || assignmentActivity.signedAt) {
      toast({
        variant: 'destructive',
        title: 'Cannot cancel after SW submit',
        description:
          'This ISP already has an SW submission. Use ISP Tracker to return for edits or delete & start over.',
      });
      return;
    }
    setCancellingSwInvite(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Sign in again to cancel this request.');
      const response = await fetch('/api/alft/assignment/cancel-sw-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberId,
          reason: clean(cancelInviteReason) || undefined,
          notifySw: cancelInviteNotifySw,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || 'Cancel failed'));
      }
      setAssignmentActivity({});
      setPriorInviteBanner(null);
      setRestartFromBeginning(false);
      setCancelInviteConfirmOpen(false);
      setCancelInviteReason('');
      setCancelInviteNotifySw(true);
      toast({
        title: 'ISP request cancelled',
        description:
          String(body?.message || '') ||
          'Social worker will no longer see this member in their portal. You can send a new invite later.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not cancel ISP request',
        description: String(error?.message || error),
      });
    } finally {
      setCancellingSwInvite(false);
    }
  }, [
    assignmentActivity.signedAt,
    assignmentActivity.submittedAt,
    cancelInviteNotifySw,
    cancelInviteReason,
    getIdToken,
    selectedClientId,
    selectedMember,
    toast,
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
      setSocialWorkerSwId('');
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
      setOverrideIspContactPhone(false);
      setCaspioSourcePreview({});
      setConfirmedIspLocation(false);
      setConfirmedClinicalUploads(false);
      setSwPortalSupportFiles([]);
      setApplicationClinicalFiles([]);
      setApplicationClinicalSourceLabel('');
      setClinicalUploadLabel('');
      setClinicalUploadFiles([]);
      setFormPreviewVerified(false);
      setPriorInviteBanner(null);
      setRestartFromBeginning(false);
      acknowledgedPriorMemberRef.current = '';
      setAssignmentActivity({});
      setRoutingAutosaveLabel('');
      lastAutosavedRoutingKey.current = '';
      setSentToIlsManual(false);
      setSentToIlsDate('');
      setSentToIlsSource('');
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
      setOverrideIspContactPhone(false);
      setCaspioSourcePreview({});
      setConfirmedIspLocation(false);
      setConfirmedClinicalUploads(false);
      setSwPortalSupportFiles([]);
      setApplicationClinicalFiles([]);
      setApplicationClinicalSourceLabel('');
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
    if (completedPdfImportDone) {
      toast({
        variant: 'destructive',
        title: 'Prefill locked',
        description:
          'A completed ALFT PDF was already imported for this member. Prefill is disabled so it does not erase parsed answers. Choose another member or Start over to use Caspio Prefill instead.',
      });
      return;
    }
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
          assessorType === 'rn'
            ? 'Confirm RN assessor, first review staff, RN, purpose, ISP location, and member clinical uploads before prefilling.'
            : 'Confirm social worker, first review staff, RN, purpose, ISP location, and member clinical uploads before prefilling.',
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
          preferLive: true,
          ...(visitLocationSource ? { visitLocationSource } : {}),
          ...(assessmentPurpose ? { assessmentPurpose } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Prefill failed'));
      const latestResolved = (body.resolved || {}) as Record<string, string>;
      const source = (body.source || {}) as Record<string, unknown>;
      setPrefillDataSource(clean(body.dataSource) || clean((source as any).__dataSource));
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
        // ALWP agency defaults to N/A for ISP workflow (mailing address is prefilled from Caspio).
        if (isIspAlftLockedField(key) || key === 'p2_alwp_agency') {
          return;
        }
        next[key] =
          key === 'p1_dob' || key === 'p1_referral_date'
            ? toMmDdYyyy(cleaned)
            : key === 'p1_sex'
              ? formatAlftSexValue(cleaned)
              : cleaned;
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
      // Assessor/CM Referral Date = date sent to SW (or today if invite not sent yet). MM-DD-YYYY.
      {
        const fromInvite = assignmentActivity.invitedAt
          ? toMmDdYyyy(assignmentActivity.invitedAt)
          : '';
        const todayYmd = toMmDdYyyy(new Date().toISOString().slice(0, 10));
        next.p1_referral_date = fromInvite || todayYmd;
      }
      next.p2_alwp_agency = 'N/A';
      // Editable ISP defaults — staff can change Yes/No on the form.
      next.p2_alwp_waitlist = 'no';
      next.p2_previous_unsuccessful_placements = 'no';
      const nextWithLocked = applyAlftPlanIdFromMrn(
        applyIspAlftLockedFieldDefaults(next),
        member ? clean(member.memberMrn) : ''
      );
      for (const lockedId of ISP_ALFT_LOCKED_FIELD_IDS) {
        if (!filledIds.includes(lockedId)) filledIds.push(lockedId);
      }
      if (!clean(nextWithLocked.p2_current_state)) nextWithLocked.p2_current_state = 'CA';
      if (clean(nextWithLocked.p1_dob)) nextWithLocked.p1_dob = toMmDdYyyy(nextWithLocked.p1_dob);
      if (clean(nextWithLocked.p1_sex)) nextWithLocked.p1_sex = formatAlftSexValue(nextWithLocked.p1_sex);
      if (clean(nextWithLocked.p1_referral_date)) {
        nextWithLocked.p1_referral_date = toMmDdYyyy(nextWithLocked.p1_referral_date);
      }
      if (!filledIds.includes('p1_purpose')) filledIds.push('p1_purpose');
      if (!filledIds.includes('p1_referral_date')) filledIds.push('p1_referral_date');
      if (clean(nextWithLocked.p1_plan_id) && !filledIds.includes('p1_plan_id')) {
        filledIds.push('p1_plan_id');
      }
      if (clean(nextWithLocked.p1_mrn) && !filledIds.includes('p1_mrn')) {
        filledIds.push('p1_mrn');
      }
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

  /**
   * After a completed ALFT PDF import, pull fresh Caspio demographics/address/ISP location
   * onto the form without wiping clinical answers from the PDF.
   */
  const refreshCaspioFieldsOntoExistingIsp = async () => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!showForm || !completedPdfImportDone) {
      toast({
        variant: 'destructive',
        title: 'Import a completed ALFT PDF first',
        description: 'Refresh Caspio fields is for keeping the existing ISP while updating address/contact data from Caspio.',
      });
      return;
    }

    setIsRefreshingCaspioFields(true);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/alft/prefill/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          memberId,
          preferLive: true,
          ...(visitLocationSource ? { visitLocationSource } : {}),
          ...(assessmentPurpose ? { assessmentPurpose } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Caspio refresh failed'));
      const latestResolved = (body.resolved || {}) as Record<string, string>;
      const source = (body.source || {}) as Record<string, unknown>;
      setPrefillDataSource(clean(body.dataSource) || clean((source as any).__dataSource));
      setCaspioSourcePreview(source);
      const locationAdjusted = applyVisitLocationToPreview(
        latestResolved,
        source,
        visitLocationSource,
        assessmentPurpose
      );

      const cleanedResolved: Record<string, string> = {};
      const refreshedIds: string[] = [];
      const patch: AnswerMap = {};

      Object.entries(locationAdjusted).forEach(([key, value]) => {
        const cleaned = clean(value);
        if (!cleaned) return;
        cleanedResolved[key] = cleaned;
        if (!CASPIO_REFRESHABLE_FIELD_IDS.has(key)) return;
        if (!/^p\d+_/.test(key) && !key.startsWith('isp_')) return;
        patch[key] =
          key === 'p1_dob' || key === 'isp_contact_confirm_date'
            ? toMmDdYyyy(cleaned)
            : key === 'p1_sex'
              ? formatAlftSexValue(cleaned)
              : cleaned;
        refreshedIds.push(key);
      });

      if (refreshedIds.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No Caspio fields to refresh',
          description: 'Live Caspio data did not return home address / contact fields for this member.',
        });
        return;
      }

      setResolvedPreview((prev) => ({ ...prev, ...cleanedResolved }));
      setAnswers((prev) => {
        const next = { ...prev, ...patch };
        next.p1_agency = AGENCY_NAME;
        if (assessmentPurpose) next.p1_purpose = assessmentPurpose;
        if (clean(next.p1_dob)) next.p1_dob = toMmDdYyyy(next.p1_dob);
        if (clean(next.p1_sex)) next.p1_sex = formatAlftSexValue(next.p1_sex);
        if (!clean(next.p2_current_state)) next.p2_current_state = 'CA';
        if (!clean(next.p1_member_name) && member) next.p1_member_name = toName(member);
        return applyAlftPlanIdFromMrn(
          applyIspAlftLockedFieldDefaults(next),
          member ? clean(member.memberMrn) : ''
        );
      });
      setCaspioFilledIds((prev) => Array.from(new Set([...prev, ...refreshedIds])));
      setFormPreviewVerified(false);

      toast({
        title: 'Caspio fields refreshed',
        description: `Updated ${refreshedIds.length} field(s) (home address, contact, etc.) — existing ISP answers kept.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Caspio refresh failed',
        description: String(error?.message || error),
      });
    } finally {
      setIsRefreshingCaspioFields(false);
    }
  };

  const importCompletedAlftPdf = async (file: File) => {
    if (!selectedMemberId && !clean(selectedClientId)) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!String(file?.name || '').toLowerCase().endsWith('.pdf')) {
      toast({ variant: 'destructive', title: 'PDF required', description: 'Upload a completed ALFT form as a PDF.' });
      return;
    }

    setIsParsingCompletedPdf(true);
    setCompletedPdfParseProgress('Rendering PDF pages…');
    setCompletedPdfFileName(file.name);
    setFormPreviewVerified(false);

    try {
      const pageBlobs = await renderPdfPagesToBlobs(file, 2.1);
      if (!pageBlobs.length) throw new Error('No pages found in that PDF.');

      const parseBatches = async (blobs: Blob[]) => {
        const batchSize = 2;
        let mergedLocal: AlftParsedAnswerMap = {};
        const filledLocal = new Set<string>();
        let ignored = 0;

        for (let start = 0; start < blobs.length; start += batchSize) {
          const end = Math.min(start + batchSize, blobs.length);
          setCompletedPdfParseProgress(`Reading pages ${start + 1}–${end} of ${blobs.length}…`);
          const formData = new FormData();
          formData.append('batchLabel', `PDF pages ${start + 1}-${end}`);
          formData.append('pdfPageStart', String(start + 1));
          formData.append('pdfPageEnd', String(end));
          formData.append('pdfPageCount', String(blobs.length));
          blobs.slice(start, end).forEach((blob, idx) => {
            formData.append('images', blob, `page-${start + idx + 1}.png`);
          });

          const response = await fetch('/api/alft/parse-completed-pdf', {
            method: 'POST',
            headers: await firebaseAuthHeaders(),
            body: formData,
          });
          const body = await response.json().catch(() => ({} as any));
          if (!response.ok || !body?.ok) {
            throw new Error(String(body?.error || `Parse failed for pages ${start + 1}–${end}`));
          }
          const batchAnswers = (body.answers || {}) as AlftParsedAnswerMap;
          const authoritativeIds = listAlftAuthoritativeFieldIdsForPdfPages({
            pdfPageStart: start + 1,
            pdfPageEnd: end,
            pdfPageCount: blobs.length,
          });
          mergedLocal = mergeAlftParsedAnswers(mergedLocal, batchAnswers, { authoritativeIds });
          (Array.isArray(body.filledIds) ? body.filledIds : Object.keys(batchAnswers)).forEach((id: string) => {
            if (clean(id)) filledLocal.add(String(id));
          });
          ignored += Array.isArray(body.ignoredKeys) ? body.ignoredKeys.length : 0;
        }
        return { merged: mergedLocal, filled: filledLocal, ignored };
      };

      let { merged, filled, ignored } = await parseBatches(pageBlobs);

      // One retry at higher render scale if almost nothing came back (common on dense checkbox pages).
      if (filled.size < 8) {
        setCompletedPdfParseProgress('Low field count — retrying with sharper page images…');
        const sharper = await renderPdfPagesToBlobs(file, 2.6);
        const retry = await parseBatches(sharper);
        if (retry.filled.size > filled.size) {
          merged = retry.merged;
          filled = retry.filled;
          ignored = retry.ignored;
        }
      }

      // Final pass: drop oxygen/wound/visit details that lack a parent checkbox (anti-hallucination).
      merged = refineAlftTherapiesServicesAnswers(merged);
      for (const id of [
        'p8_oxygen_type',
        'p8_oxygen_liters',
        'p8_wound_stage',
        'p8_wound_location',
        'p8_visit_frequency',
        'p8_visit_duties',
        'p8_catheter_frequency',
        'p8_services',
      ]) {
        if (!clean(merged[id])) filled.delete(id);
      }

      const parsedCount = filled.size;
      if (parsedCount < 3) {
        throw new Error(
          `Could not read enough answers from that PDF (only ${parsedCount} fields). Try a clearer scan, or Prefill from Caspio and enter remaining fields manually.`
        );
      }

      const memberMrnFallback =
        clean(selectedMember?.memberMrn) ||
        clean(activeIntake?.medicalRecordNumber) ||
        '';
      let next = normalizeAlftAnswersCapitalization(
        applyIspAlftLockedFieldDefaults({
          ...buildBlankAnswers(),
          ...merged,
          p1_agency: AGENCY_NAME,
        })
      ) as AnswerMap;
      // Prefer Caspio/member MRN over a mis-read Plan ID from the scanned PDF.
      if (memberMrnFallback) {
        next.p1_mrn = memberMrnFallback;
      }
      next = applyAlftPlanIdFromMrn(next, memberMrnFallback) as AnswerMap;

      if (assessmentPurpose) next.p1_purpose = assessmentPurpose;
      if (clean(next.p1_dob)) next.p1_dob = toMmDdYyyy(next.p1_dob);
      if (!clean(next.p2_current_state)) next.p2_current_state = 'CA';
      if (!clean(next.p1_member_name) && selectedMember) next.p1_member_name = toName(selectedMember);
      const assessorName = clean(socialWorkerName);
      if (assessorName) {
        if (!clean(next.p1_assessor_name)) next.p1_assessor_name = assessorName;
        if (!clean(next.p14_print_name)) next.p14_print_name = assessorName;
      }
      // Imported completed ISP already has SW signature on the paper/PDF — stamp admin override
      // so Approve → Send to RN does not ask the SW to e-sign again.
      const withOverride = applyMswAdminOverrideToAnswers(next, { printName: assessorName });

      setAnswers(withOverride);
      if (clean(withOverride.p1_plan_id)) filled.add('p1_plan_id');
      if (clean(withOverride.p1_mrn)) filled.add('p1_mrn');
      setCaspioFilledIds(Array.from(filled));
      setShowForm(true);
      setCompletedPdfImportDone(true);
      setFormPreviewVerified(false);

      toast({
        title: 'Completed ALFT PDF imported',
        description: `Filled ${parsedCount} fields from ${file.name}${ignored ? ` (${ignored} unrecognized keys ignored)` : ''}. MSW admin override is on so you can Approve → Send to RN without a new SW signature.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'ALFT PDF import failed',
        description: String(error?.message || error),
      });
    } finally {
      setIsParsingCompletedPdf(false);
      setCompletedPdfParseProgress('');
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
    if (routingPersistInFlightRef.current) {
      if (quiet) setRoutingAutosaveLabel('Routing save already in progress…');
      return false;
    }
    if (Date.now() < routingWriteCooldownUntilRef.current) {
      if (quiet) {
        setRoutingAutosaveLabel('Firestore write limit — waiting before next routing save');
      } else {
        toast({
          variant: 'destructive',
          title: 'Firestore is busy',
          description: 'Write rate limit hit. Wait about a minute, then try Update routing again.',
        });
      }
      return false;
    }
    routingPersistInFlightRef.current = true;
    if (quiet) setRoutingAutosaveLabel('Saving routing…');
    try {
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
      assessorRole: assessorType,
      ispAssessorType: assessorType,
      formerSwImportMode: Boolean(formerSwImportMode),
      departedSwCompletedIsp: Boolean(formerSwImportMode),
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
    // Stamp tracker-visible status before SW invite so ISP Tracker lists the member immediately.
    const existingWs = clean(existingData.workflowStatus).toLowerCase();
    const inviteAlreadySent =
      Boolean(existingData?.workflowSteps?.swInviteSent) ||
      existingWs.includes('sw_invited') ||
      existingWs.includes('sw_form') ||
      existingWs.includes('awaiting_') ||
      existingWs.includes('submitted') ||
      existingWs.includes('completed');
    if (!inviteAlreadySent && !existingWs.includes('removed_from_isp_tracker')) {
      if (!existingWs || existingWs.includes('prefill_ready') || existingWs.includes('routing')) {
        trackedPayload.status = clean(existingData.status) || 'prefill_ready';
        trackedPayload.workflowStatus =
          clean(existingData.workflowStatus) || 'prefill_ready_pending_sw_invite';
        trackedPayload.workflowStage =
          clean(existingData.workflowStage) || 'routing_confirmed_awaiting_invite';
      }
    }
    const nextSwEmail = clean(socialWorkerEmail).toLowerCase();
    const prevSwEmail = clean(existingData.assignedSwEmail).toLowerCase();
    const historyEntry =
      nextSwEmail && prevSwEmail && swEmailsDiffer(prevSwEmail, nextSwEmail)
        ? buildSwAssignmentHistoryEntry({
            fromEmail: prevSwEmail,
            fromName: clean(existingData.assignedSwName) || null,
            toEmail: nextSwEmail,
            toName: socialWorkerName || clean(answers.p1_assessor_name) || null,
            byEmail: user?.email || null,
            byName: user?.displayName || user?.email || null,
            reason: 'routing_change',
            inviteSent: false,
          })
        : null;
    if (historyEntry) {
      trackedPayload.swAssignmentHistory = arrayUnion(historyEntry);
      trackedPayload.ispWorkflowActivityLog = arrayUnion(
        buildIspWorkflowActivityEntry({
          event: 'sw_reassigned',
          byName: user?.displayName || user?.email || null,
          byEmail: user?.email || null,
          recipientEmail: nextSwEmail,
          details: `${prevSwEmail} → ${nextSwEmail}`,
          atIso: historyEntry.atIso,
        })
      );
    }
    await setDocWithBackoff(
      doc(firestore, 'alft_assignments', memberId),
      trackedPayload,
      { merge: true, firestore, maxRetries: quiet ? 3 : 5 }
    );

    if (activeIntake?.id) {
      await setDocWithBackoff(
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
          assessorRole: assessorType,
          ispAssessorType: assessorType,
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
        },
        { merge: true, firestore, maxRetries: quiet ? 3 : 5 }
      );
      // Quiet autosave: skip reload so we do not thrash reads/writes while editing.
      if (!quiet) await loadIntakeById(activeIntake.id);
    }
    if (quiet) setRoutingAutosaveLabel(`Routing autosaved ${new Date().toLocaleTimeString()}`);
    return true;
    } catch (error: any) {
      if (isFirestoreWriteRateLimited(error)) {
        routingWriteCooldownUntilRef.current = Date.now() + 60_000;
        // Prevent the autosave effect from immediately retrying the same key.
        lastAutosavedRoutingKey.current = [
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
        setRoutingAutosaveLabel('Firestore write limit — paused routing autosave for 1 min');
        if (!quiet) {
          toast({
            variant: 'destructive',
            title: 'Firestore write rate limit',
            description:
              'Too many writes in a short time. Wait about a minute, then use Update routing or continue editing.',
          });
        }
        return false;
      }
      if (quiet) setRoutingAutosaveLabel('Routing autosave failed — use Update routing');
      else {
        toast({
          variant: 'destructive',
          title: 'Could not save routing',
          description: String(error?.message || error),
        });
      }
      return false;
    } finally {
      routingPersistInFlightRef.current = false;
    }
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

  const saveSentToIlsManual = async (nextChecked: boolean, nextDateYmd?: string) => {
    if (!firestore) return;
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!memberId) {
      toast({
        variant: 'destructive',
        title: 'Select a member first',
        description: 'Load a Kaiser member before marking Sent to ILS.',
      });
      return;
    }

    const verifier =
      ilsVerifierStaffOptions.find((s) => s.uid === sentToIlsVerifierUid) ||
      ilsVerifierStaffOptions.find((s) => s.uid === user?.uid) ||
      null;

    if (nextChecked && !verifier) {
      toast({
        variant: 'destructive',
        title: 'Select verifying staff',
        description: 'Choose which staff member is verifying Sent to ILS.',
      });
      return;
    }

    const ymd =
      clean(nextDateYmd || sentToIlsDate) ||
      (nextChecked ? new Date().toISOString().slice(0, 10) : '');
    setSentToIlsSaving(true);
    try {
      if (nextChecked) {
        const iso = ymd ? `${ymd}T12:00:00.000Z` : new Date().toISOString();
        const verifiedAtIso = new Date().toISOString();
        const stamp = {
          sentToIls: true,
          sentToIlsAt: serverTimestamp(),
          sentToIlsAtIso: iso,
          sentToIlsManual: true,
          sentToIlsMarkedAt: serverTimestamp(),
          sentToIlsVerifiedByUid: verifier!.uid,
          sentToIlsVerifiedByName: verifier!.label,
          sentToIlsVerifiedByEmail: verifier!.email,
          sentToIlsVerifiedAt: serverTimestamp(),
          sentToIlsVerifiedAtIso: verifiedAtIso,
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(firestore, 'alft_assignments', memberId), stamp, { merge: true });
        if (activeIntake?.id) {
          await setDoc(doc(firestore, 'standalone_upload_submissions', activeIntake.id), stamp, {
            merge: true,
          });
        }
        setSentToIlsManual(true);
        setSentToIlsDate(ymd || new Date().toISOString().slice(0, 10));
        setSentToIlsSource((prev) => (prev === 'cover_package' ? prev : 'manual'));
        setSentToIlsVerifierUid(verifier!.uid);
        setSentToIlsVerifiedByName(verifier!.label);
        setSentToIlsVerifiedByEmail(verifier!.email);
        setSentToIlsVerifiedAtIso(verifiedAtIso);
        toast({
          title: 'Marked Sent to ILS',
          description: `Verified by ${verifier!.label} · ${new Date(verifiedAtIso).toLocaleString()}${
            ymd ? ` · sent ${ymd}` : ''
          }.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        scrollAdminPageToTop();
      } else {
        const clearStamp = {
          sentToIls: false,
          sentToIlsAt: null,
          sentToIlsAtIso: null,
          sentToIlsManual: false,
          sentToIlsVerifiedByUid: null,
          sentToIlsVerifiedByName: null,
          sentToIlsVerifiedByEmail: null,
          sentToIlsVerifiedAt: null,
          sentToIlsVerifiedAtIso: null,
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(firestore, 'alft_assignments', memberId), clearStamp, { merge: true });
        if (activeIntake?.id) {
          await setDoc(doc(firestore, 'standalone_upload_submissions', activeIntake.id), clearStamp, {
            merge: true,
          });
        }
        const snap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
        const data = snap?.exists() ? (snap.data() as any) : null;
        const stillSent = Boolean(data?.coverSheetPackageSentAt || data?.coverSheetPackageSentAtIso);
        setSentToIlsManual(stillSent);
        if (stillSent) {
          const sentIso = clean(data?.coverSheetPackageSentAtIso || '');
          setSentToIlsDate(sentIso ? sentIso.slice(0, 10) : '');
          setSentToIlsSource('cover_package');
          setSentToIlsVerifierUid(clean(data?.sentToIlsVerifiedByUid));
          setSentToIlsVerifiedByName(clean(data?.sentToIlsVerifiedByName));
          setSentToIlsVerifiedByEmail(clean(data?.sentToIlsVerifiedByEmail));
          setSentToIlsVerifiedAtIso(clean(data?.sentToIlsVerifiedAtIso));
          toast({
            title: 'Manual mark cleared',
            description: 'Cover sheet package send is still on file — Sent to ILS stays checked.',
          });
        } else {
          setSentToIlsDate('');
          setSentToIlsSource('');
          setSentToIlsVerifierUid('');
          setSentToIlsVerifiedByName('');
          setSentToIlsVerifiedByEmail('');
          setSentToIlsVerifiedAtIso('');
          toast({ title: 'Cleared Sent to ILS', description: 'Removed manual Sent to ILS mark.' });
        }
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update Sent to ILS',
        description: String(error?.message || error),
      });
    } finally {
      setSentToIlsSaving(false);
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
    if (Date.now() < routingWriteCooldownUntilRef.current) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const ok = await persistWorkflowRouting({ quiet: true });
          if (ok) lastAutosavedRoutingKey.current = key;
        } catch {
          setRoutingAutosaveLabel('Routing autosave failed — use Update routing');
        }
      })();
    }, 1200);
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
    formerSwImportMode,
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
      'After you log into the Social Worker Portal and open this member, please enter the Expected visit date for the scheduled assessment. That date is shared with Connections staff on the ISP Tracker so we know the visit is scheduled.',
      '- Log in → open this member → enter Expected visit date (you can Save Draft right away)',
      '- Complete and submit the ALFT after the visit',
      '',
      assessorType === 'rn'
        ? 'After you submit the ALFT in the portal, it goes to Connections admin for review. It may be returned to you for additional edits. After admin approves, it comes back to you (same RN) for final signature and suggested tier.'
        : 'After you submit the ALFT in the portal, it goes to Connections admin for review. It may be returned to you for additional edits. If approved, it goes to the RN at Connections for final sign-off and final approval.',
      '',
      assessorType === 'rn'
        ? 'The last page MSW & RN Commentary is for clinical notes only (care needs). Enter an estimated tier rate for admin review (not printed on the form). Path: RN assessor submits → Admin reviews → same RN final signature with suggested tier → Admin final review.'
        : 'The last page MSW & RN Commentary is for MSW and RN clinical notes only (care needs). MSW also enters an estimated tier rate separately for admin/RN review (not printed on the form). Path: MSW estimates tier → Admin reviews → RN agrees or suggests another tier from the definitions → Admin final review.',
      '',
      'After you receive an email that this ALFT has final approval, log into Caspio and submit your claim for this visit.',
      '',
      'To complete the ALFT and signature workflow, sign in here:',
      SW_LOGIN_URL,
      '',
      'First time using the Social Worker Portal? On the login page, choose Forgot password with this email address to set your password and activate your account. Then sign in and open the ALFT queue.',
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
    assessorType,
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

  const openSwInvitePreview = (opts?: { skipDifferentSwWarn?: boolean }) => {
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
    const priorInvitedEmail = clean(assignmentActivity.invitedTo).toLowerCase();
    const nextEmail = clean(socialWorkerEmail).toLowerCase();
    const hadPriorInvite =
      Boolean(assignmentActivity.invitedAt) ||
      Number(assignmentActivity.inviteSendCount || 0) > 0 ||
      (assignmentActivity.emailLog || []).some((e) => clean(e.status).toLowerCase() === 'sent');
    if (
      !opts?.skipDifferentSwWarn &&
      hadPriorInvite &&
      priorInvitedEmail &&
      swEmailsDiffer(priorInvitedEmail, nextEmail)
    ) {
      setDifferentSwInviteWarn({
        priorEmail: priorInvitedEmail,
        nextEmail,
        priorAt: assignmentActivity.lastInvitedAt || assignmentActivity.invitedAt,
      });
      return;
    }
    setDifferentSwInviteWarn(null);
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
    void fetchMembers({ clientId2: memberIdFromQuery, source: 'cache', skipStaleCheck: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link bootstrap once per query memberId
  }, [memberIdFromQuery, intakeIdFromQuery, firestore, loadIntakeForMember]);

  // Chrome often restores this page from bfcache with a stale in-memory member list.
  // Re-check cache age on restore / long background — but never interrupt in-progress form work.
  useEffect(() => {
    const maybeRefreshStaleList = () => {
      if (autoStaleSyncInFlightRef.current || isSyncingMembersCache || isLoadingMembers) return;
      if (formWorkInProgressRef.current) return;
      void (async () => {
        const { stale } = await isMembersCacheStale();
        if (!stale) return;
        autoStaleSyncInFlightRef.current = true;
        try {
          toast({
            title: 'Members cache is stale',
            description: 'Tab restored with old data — refreshing from Caspio…',
          });
          await syncMembersCacheFromCaspioRef.current();
        } finally {
          autoStaleSyncInFlightRef.current = false;
        }
      })();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) maybeRefreshStaleList();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeRefreshStaleList();
    };

    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoadingMembers, isSyncingMembersCache, toast]);

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
      description:
        'ISP location set from RCFE and ISP confirm date set to today in Caspio. You can continue to clinical uploads.',
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
    await loadCaspioFieldPreview(memberId, member, {
      preferLive: true,
      assessorTypeOverride: assessorType,
    });
    toast({
      title: 'Refreshed',
      description: 'ISP location reloaded from Caspio.',
      className: 'bg-green-100 text-green-900 border-green-200',
    });
  };

  const refreshSwRnContactsFromCaspio = async () => {
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    setRefreshingSwRnContacts(true);
    try {
      const idToken = await getIdToken();
      const prevSwEmail = clean(socialWorkerEmail).toLowerCase();
      const prevRnEmail = clean(assignedRn?.email).toLowerCase();

      const res = await fetch('/api/alft/refresh-sw-contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || 'Failed to refresh SW/RN contacts'));
      }

      const update = Array.isArray(data.updates) ? data.updates[0] : null;
      const nextSwEmail = clean(update?.newSwEmail).toLowerCase();
      const nextSwName = clean(update?.newSwName);
      const nextRnEmail = clean(update?.newRnEmail).toLowerCase();
      const nextRnName = clean(update?.newRnName);

      if (nextSwName) setSocialWorkerName(nextSwName);
      if (nextSwEmail) {
        setSocialWorkerEmail(nextSwEmail);
        if (prevSwEmail && nextSwEmail !== prevSwEmail) {
          setConfirmedSw(false);
        }
      }

      if (nextRnEmail) {
        const match =
          rnOptions.find((r) => clean(r.email).toLowerCase() === nextRnEmail) || null;
        if (match) {
          setRnUid(match.uid);
          if (prevRnEmail && nextRnEmail !== prevRnEmail) {
            setConfirmedRn(false);
          }
        }
      }

      // Also refresh live Caspio field preview so assessor / checklist stay in sync.
      await loadCaspioFieldPreview(memberId, selectedMember, {
        preferLive: true,
        assessorTypeOverride: assessorType,
      });

      const swChanged = Boolean(update?.swEmailChanged);
      const rnChanged = Boolean(update?.rnEmailChanged);
      toast({
        title: swChanged || rnChanged ? 'SW/RN email updated from Caspio' : 'SW/RN contacts checked',
        description: swChanged
          ? `SW: ${update?.previousSwEmail || '—'} → ${nextSwEmail}${
              rnChanged ? ` · RN: ${update?.previousRnEmail || '—'} → ${nextRnEmail}` : ''
            }${nextSwName ? ` · ${nextSwName}` : ''}`
          : rnChanged
            ? `RN: ${update?.previousRnEmail || '—'} → ${nextRnEmail}${
                nextRnName ? ` · ${nextRnName}` : ''
              }`
            : String(data.message || 'Emails already match Caspio.'),
        className:
          swChanged || rnChanged
            ? 'bg-blue-50 text-blue-950 border-blue-200'
            : 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not refresh SW/RN from Caspio',
        description: String(e?.message || e),
      });
    } finally {
      setRefreshingSwRnContacts(false);
    }
  };

  const loadApplicationClinicalDocs = useCallback(
    async (memberOverride?: KaiserMember | null, existingSupport?: SwPortalSupportFile[]) => {
      const member = memberOverride || selectedMember;
      if (!firestore || !member) {
        setApplicationClinicalFiles([]);
        setApplicationClinicalSourceLabel('');
        return;
      }
      const memberId = clientIdOf(member);
      const mrn = clean(member.memberMrn) || clean(resolvedPreview.p1_mrn);
      const supportFiles = existingSupport || [];

      setLoadingApplicationClinical(true);
      try {
        type AppCandidate = { id: string; data: Record<string, unknown>; updatedMs: number };
        const byKey = new Map<string, AppCandidate>();
        const addSnap = (snap: Awaited<ReturnType<typeof getDocs>> | Awaited<ReturnType<typeof getDoc>>) => {
          const docs =
            'docs' in snap
              ? snap.docs
              : snap.exists()
                ? [snap]
                : [];
          docs.forEach((d: any) => {
            const data = (d.data?.() || {}) as Record<string, unknown>;
            const updatedMs =
              Number((data as any)?.lastUpdated?.toMillis?.()) ||
              Number((data as any)?.updatedAt?.toMillis?.()) ||
              Number(Date.parse(String((data as any)?.lastUpdatedIso || (data as any)?.updatedAtIso || ''))) ||
              0;
            const prev = byKey.get(d.id);
            if (!prev || updatedMs >= prev.updatedMs) {
              byKey.set(d.id, { id: d.id, data, updatedMs });
            }
          });
        };

        // Direct doc id often matches Client_ID2 for apps created in this tracker.
        if (memberId) {
          try {
            addSnap(await getDoc(doc(firestore, 'applications', memberId)));
          } catch {
            /* ignore */
          }
        }

        if (mrn) {
          try {
            addSnap(
              await getDocs(
                query(collection(firestore, 'applications'), where('memberMrn', '==', mrn), limit(25))
              )
            );
          } catch {
            /* ignore */
          }
          try {
            addSnap(
              await getDocs(
                query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', mrn), limit(25))
              )
            );
          } catch {
            /* collection group index may be missing — admin apps query above is enough */
          }
        }

        if (memberId) {
          for (const field of ['clientId2', 'caspioMatchedClientId2']) {
            try {
              addSnap(
                await getDocs(
                  query(collection(firestore, 'applications'), where(field, '==', memberId), limit(10))
                )
              );
            } catch {
              /* field may not be indexed — skip */
            }
          }
        }

        const apps = Array.from(byKey.values()).sort((a, b) => b.updatedMs - a.updatedMs);
        let bestFiles: ApplicationClinicalFile[] = [];
        let sourceLabel = '';
        for (const app of apps) {
          const files = extractApplicationClinicalFiles(app.id, (app.data as any)?.forms, supportFiles);
          if (!files.length) continue;
          // Prefer newest application that has Medicine List / 602 uploads.
          bestFiles = files;
          const name =
            `${clean((app.data as any)?.memberFirstName)} ${clean((app.data as any)?.memberLastName)}`.trim() ||
            clean((app.data as any)?.memberName) ||
            app.id;
          sourceLabel = `Application ${app.id}${name ? ` · ${name}` : ''}`;
          break;
        }

        setApplicationClinicalFiles(bestFiles);
        setApplicationClinicalSourceLabel(bestFiles.length ? sourceLabel : '');
      } catch (error) {
        console.warn('Application clinical lookup failed:', error);
        setApplicationClinicalFiles([]);
        setApplicationClinicalSourceLabel('');
      } finally {
        setLoadingApplicationClinical(false);
      }
    },
    [firestore, resolvedPreview.p1_mrn, selectedMember]
  );

  // After Caspio/assignment load settles, offer Medicine List + 602 from the member's application portal if present.
  useEffect(() => {
    if (!selectedMemberId || !firestore || !selectedMember) return;
    const timer = window.setTimeout(() => {
      void loadApplicationClinicalDocs(selectedMember, swPortalSupportFiles);
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedMemberId,
    firestore,
    selectedMember?.memberMrn,
    resolvedPreview.p1_mrn,
    swPortalSupportFiles.length,
    loadApplicationClinicalDocs,
  ]);

  const pullApplicationClinicalFilesIntoSwPortal = async () => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId || !firestore || !storage) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    const toPull = applicationClinicalFiles.filter((f) => !f.alreadyPulled);
    if (!toPull.length) {
      toast({
        title: 'Nothing to pull',
        description: 'Medicine List / 602 from the application are already on the SW portal, or none were found.',
      });
      return;
    }
    if (pullingApplicationClinical) return;

    setPullingApplicationClinical(true);
    try {
      const uploadedSupportFiles: Array<Record<string, unknown>> = [];
      let medListForForm: AlftMedListAttachment | null = null;

      for (const file of toPull) {
        let downloadURL = clean(file.downloadURL);
        if (!downloadURL && file.filePath) {
          try {
            downloadURL = await getDownloadURL(ref(storage, file.filePath));
          } catch (err: any) {
            console.warn('Could not resolve application file URL:', file.filePath, err);
            toast({
              variant: 'destructive',
              title: `Could not open ${file.label}`,
              description: String(err?.message || 'Storage path not readable'),
            });
            continue;
          }
        }
        if (!downloadURL) continue;

        const entry = {
          id: `app_${file.applicationId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: file.label,
          fileName: file.fileName,
          downloadURL,
          storagePath: file.filePath || null,
          source: 'application_portal',
          sourceApplicationId: file.applicationId,
          sourceFormName: file.formName,
          uploadedAtIso: new Date().toISOString(),
          uploadedByName: clean(user?.displayName) || null,
          uploadedByEmail: clean(user?.email) || null,
        };
        uploadedSupportFiles.push(entry);

        if (file.label === 'Medicine List' && !medListForForm) {
          medListForForm = {
            id: entry.id,
            fileName: file.fileName,
            downloadURL,
            storagePath: file.filePath || undefined,
            uploadedAtIso: entry.uploadedAtIso,
            uploadedByName: entry.uploadedByName,
            uploadedByEmail: entry.uploadedByEmail,
          };
        }
      }

      if (!uploadedSupportFiles.length) {
        toast({
          variant: 'destructive',
          title: 'Pull failed',
          description: 'Could not resolve download links for application clinical files.',
        });
        return;
      }

      const assignmentPayload: Record<string, unknown> = {
        memberId,
        swPortalSupportFiles: arrayUnion(...(uploadedSupportFiles as any[])),
        updatedAt: serverTimestamp(),
      };
      if (medListForForm && !medListAttachment) {
        assignmentPayload.medListAttachment = medListForForm;
        setMedListAttachment(medListForForm);
      }

      await setDoc(doc(firestore, 'alft_assignments', memberId), assignmentPayload, { merge: true });

      try {
        const idToken = await getIdToken();
        if (idToken) {
          await fetch('/api/alft/clinical-files-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              memberId,
              swEmail: socialWorkerEmail || undefined,
              swName: socialWorkerName || undefined,
              files: uploadedSupportFiles.map((f) => ({
                fileName: f.fileName,
                label: f.label,
              })),
            }),
          });
        }
      } catch (notifyError) {
        console.warn('Clinical file notify error:', notifyError);
      }

      const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
      const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
      const nextFiles = assignment ? parseSwPortalSupportFiles(assignment.swPortalSupportFiles) : [];
      if (nextFiles.length) setSwPortalSupportFiles(nextFiles);
      setConfirmedClinicalUploads(true);
      setApplicationClinicalFiles((prev) =>
        prev.map((f) => ({
          ...f,
          alreadyPulled: true,
        }))
      );

      toast({
        title: 'Pulled from application portal',
        description: `${uploadedSupportFiles.length} file(s) (Medicine List / 602) added to the SW portal.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Pull failed',
        description: String(error?.message || error),
      });
    } finally {
      setPullingApplicationClinical(false);
    }
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

  const deleteSwPortalClinicalFile = async (file: SwPortalSupportFile) => {
    const member = selectedMember;
    const memberId = member ? clientIdOf(member) : clean(selectedClientId);
    if (!memberId || !firestore) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!(await appConfirm(`Delete clinical file “${file.label || file.fileName || 'file'}”?`))) return;
    setDeletingClinicalFileId(file.id);
    try {
      if (storage && file.storagePath) {
        try {
          await deleteObject(ref(storage, file.storagePath));
        } catch (storageError: any) {
          // Still remove Firestore entry if the storage object is already gone.
          const code = String(storageError?.code || '');
          if (code !== 'storage/object-not-found') {
            console.warn('Clinical file storage delete:', storageError);
          }
        }
      }
      const assignmentRef = doc(firestore, 'alft_assignments', memberId);
      const snap = await getDoc(assignmentRef);
      const existing = snap.exists() ? parseSwPortalSupportFiles((snap.data() as any)?.swPortalSupportFiles) : [];
      const nextRaw = existing
        .filter((entry) => {
          if (file.id && entry.id && entry.id === file.id) return false;
          if (file.downloadURL && entry.downloadURL === file.downloadURL) return false;
          if (file.storagePath && entry.storagePath && entry.storagePath === file.storagePath) return false;
          return true;
        })
        .map((entry) => entry.raw);
      await setDoc(
        assignmentRef,
        {
          memberId,
          swPortalSupportFiles: nextRaw,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSwPortalSupportFiles(parseSwPortalSupportFiles(nextRaw));
      toast({
        title: 'Clinical file deleted',
        description: file.label || file.fileName || 'Removed from SW portal uploads.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not delete clinical file',
        description: String(error?.message || error),
      });
    } finally {
      setDeletingClinicalFileId('');
    }
  };

  const clearCompletedAlftPdfImport = async () => {
    if (!completedPdfImportDone && !completedPdfFileName) return;
    if (
      !await appConfirm(
        'Remove the completed ALFT PDF import? Prefill will unlock again (form answers stay until you Prefill or re-upload).'
      )
    ) {
      return;
    }
    setCompletedPdfImportDone(false);
    setCompletedPdfFileName('');
    setCompletedPdfParseProgress('');
    setFormPreviewVerified(false);
    toast({
      title: 'Completed PDF import cleared',
      description: 'You can Prefill from Caspio or upload another completed ALFT PDF.',
    });
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
      toast({
        variant: 'destructive',
        title: 'Social worker email required',
      });
      return;
    }
    const portalOk = await verifySwPortalAccess(socialWorkerEmail, socialWorkerSwId);
    if (!portalOk) {
      toast({
        variant: 'destructive',
        title: 'SW portal access required',
        description: `Turn on Portal access for ${clean(socialWorkerEmail) || 'this social worker'} in Admin → SW User Management before sending the invite.`,
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
            assessorRole: assessorType,
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
          ? toMmDdYyyy(assignmentActivity.invitedAt)
          : '';
        if (fromActivity) return fromActivity;
        return toMmDdYyyy(new Date().toISOString().slice(0, 10));
      })();
      setAnswers((prev) => ({ ...prev, p1_referral_date: inviteDateYmd }));

      await refreshAssignmentActivity(memberId);
      setInvitePreviewOpen(false);
      const noteOk = Boolean((data as any)?.caspioNoteSync?.success);
      toast({
        title: assessorType === 'rn' ? 'RN invite sent' : 'Social worker invite sent',
        description: noteOk
          ? `${socialWorkerName || (assessorType === 'rn' ? 'RN' : 'Social worker')} (${socialWorkerEmail}) can open the portal. Caspio client note was added.`
          : `${socialWorkerName || (assessorType === 'rn' ? 'RN' : 'Social worker')} (${socialWorkerEmail}) can open the portal. Caspio client note did not save — check Caspio credentials / Client_ID2 ${memberId}.`,
        className: noteOk
          ? 'bg-green-100 text-green-900 border-green-200'
          : 'bg-amber-100 text-amber-950 border-amber-300',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: assessorType === 'rn' ? 'Could not send RN invite' : 'Could not send SW invite',
        description: String(error?.message || error),
      });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const saveFormEdits = async (opts?: {
    quiet?: boolean;
    preserveBusy?: boolean;
    exactPacketAnswers?: AnswerMap;
  }) => {
    if (!activeIntake?.id) {
      toast({ variant: 'destructive', title: 'No active intake', description: 'Wait for SW submit, or open an existing intake.' });
      return false;
    }
    if (!opts?.preserveBusy) setBusyAction('save');
    try {
      const packetAnswers = opts?.exactPacketAnswers || answers;
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          exactPacketAnswers: packetAnswers,
          transitionSummary: clean(packetAnswers.p13_commentary_section) || 'Staff edits from ISP Workflow.',
          requestedActions: 'Continue ISP workflow review.',
          medListAttachment: medListAttachment || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) throw new Error(String(body?.error || 'Save failed'));
      if (!opts?.quiet) {
        toast({ title: 'Form saved', className: 'bg-green-100 text-green-900 border-green-200' });
      }
      await loadIntakeById(activeIntake.id);
      return true;
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: String(error?.message || error) });
      return false;
    } finally {
      if (!opts?.preserveBusy) setBusyAction('');
    }
  };

  const createIntakeFromForm = async () => {
    if (activeIntake?.id) {
      toast({ title: 'Intake already linked', description: 'Use Save Form Edits and the review actions below.' });
      return;
    }
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!memberId && !clean(answers.p1_member_name)) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!firstReviewer) {
      toast({ variant: 'destructive', title: 'Choose first-review staff before creating the intake' });
      return;
    }
    setBusyAction('create-intake');
    try {
      await persistWorkflowRouting({ quiet: true }).catch(() => false);
      const idToken = await getIdToken();
      let packetAnswers = answers;
      if (
        (formerSwImportMode || completedPdfImportDone) &&
        !isOverrideYes(answers?.p14_admin_override_msw)
      ) {
        packetAnswers = applyMswAdminOverrideToAnswers(answers);
        setAnswers(packetAnswers);
      }
      const res = await fetch('/api/alft/intake/create-from-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          idToken,
          exactPacketAnswers: packetAnswers,
          medListAttachment: medListAttachment || null,
          sourceLabel: completedPdfFileName
            ? `Completed PDF import: ${completedPdfFileName}`
            : formerSwImportMode
              ? 'Departed SW / completed ISP import'
              : 'ISP Workflow admin form',
          formerSwImportMode: Boolean(formerSwImportMode),
          departedSwCompletedIsp: Boolean(formerSwImportMode),
          member: {
            id: memberId,
            name: selectedMember ? toName(selectedMember) : clean(answers.p1_member_name),
            firstName: selectedMember ? clean(selectedMember.memberFirstName) : '',
            lastName: selectedMember ? clean(selectedMember.memberLastName) : '',
            medicalRecordNumber: selectedMember
              ? clean(selectedMember.memberMrn)
              : clean(answers.p1_mrn),
            healthPlan: 'Kaiser',
            prefillPurpose: assessmentPurpose || undefined,
          },
          firstReviewer: {
            uid: firstReviewer.uid,
            name: firstReviewer.label,
            email: firstReviewer.email,
          },
          assignedRn: {
            uid: assignedRn?.uid,
            name: assignedRn?.label || 'Leslie',
            email: assignedRn?.email || 'leslie@carehomefinders.com',
          },
          socialWorker: {
            name: socialWorkerName || clean(answers.p1_assessor_name) || undefined,
            email: socialWorkerEmail || undefined,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Could not create intake'));
      toast({
        title: 'ISP intake created',
        description: body?.rnOverride
          ? 'MSW/RN admin overrides applied — use Final Review / Download below.'
          : body?.mswOverride
            ? 'MSW override applied — Approve → Send to RN when ready.'
            : 'Use the review actions below to continue.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await loadIntakeById(String(body.intakeId));
      setConfirmEdits(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Create intake failed',
        description: String(error?.message || error),
      });
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
      const saved = await saveFormEdits({ preserveBusy: true });
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
      // Imported completed ISP / MSW override: keep SW signature and go straight to RN.
      const skipMsw =
        swAlreadySigned ||
        adminOverrideMsw ||
        importedCompletedIsp ||
        isOverrideYes(answers?.p14_admin_override_msw);
      let packetForSave = answers;
      if (skipMsw && !isOverrideYes(answers?.p14_admin_override_msw)) {
        packetForSave = applyMswAdminOverrideToAnswers(answers);
        setAnswers(packetForSave);
      }
      const saved = await saveFormEdits({
        quiet: true,
        preserveBusy: true,
        exactPacketAnswers: packetForSave,
      });
      if (!saved) return;
      const idToken = await getIdToken();
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
          ? `${assignedRn.label} (${assignedRn.email}) was notified. SW signature was kept (submit or admin override).`
          : `After SW signs, ${assignedRn.label} (${assignedRn.email}) will be emailed for RN review.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setConfirmEdits(false);
      await loadIntakeById(activeIntake.id);
      scrollAdminPageToTop();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Accept failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const openResendRnDialog = () => {
    if (!activeIntake?.id) return;
    if (!confirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits” before resending to RN.',
      });
      return;
    }
    if (!assignedRn?.email && !clean(activeIntake?.alftRnEmail)) {
      toast({ variant: 'destructive', title: 'Choose an RN before resending' });
      return;
    }
    setResendRnNote('');
    setResendRnDialogOpen(true);
  };

  const executeResendToRnForNewSignature = async () => {
    if (!activeIntake?.id) return;
    const note = clean(resendRnNote);
    if (!note) {
      toast({
        variant: 'destructive',
        title: 'Resend note required',
        description: 'Explain why you are requesting a new RN signature.',
      });
      return;
    }
    const rnEmail = clean(assignedRn?.email) || clean(activeIntake?.alftRnEmail);
    const rnName = clean(assignedRn?.label) || clean(activeIntake?.alftRnName) || 'RN';
    if (!rnEmail) {
      toast({ variant: 'destructive', title: 'Choose an RN before resending' });
      return;
    }
    setConfirmResendRnSendOpen(false);
    setResendRnDialogOpen(false);
    setBusyAction('resend-rn');
    try {
      await saveWorkflowRouting();
      const skipMsw =
        swAlreadySigned ||
        adminOverrideMsw ||
        importedCompletedIsp ||
        isOverrideYes(answers?.p14_admin_override_msw);
      let packetForSave = answers;
      if (skipMsw && !isOverrideYes(answers?.p14_admin_override_msw)) {
        packetForSave = applyMswAdminOverrideToAnswers(answers);
        setAnswers(packetForSave);
      }
      // Drop local RN signature fields so the editor matches the cleared server state.
      packetForSave = {
        ...packetForSave,
        p14_rn_signed_at: '',
        p14_rn_print_name: '',
        p14_admin_override_rn: '',
        p14_rn_electronic_notice: '',
      };
      setAnswers(packetForSave);
      const saved = await saveFormEdits({
        quiet: true,
        preserveBusy: true,
        exactPacketAnswers: packetForSave,
      });
      if (!saved) return;
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          overrideRnEmail: rnEmail,
          overrideRnName: rnName,
          deferRnEmail: false,
          skipMswSignature: true,
          isResend: true,
          resendNote: note,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Resend to RN failed'));
      toast({
        title: rnAlreadySigned ? 'New RN signature requested' : 'Re-sent to RN',
        description: rnAlreadySigned
          ? `Prior RN signature cleared. ${rnName} (${rnEmail}) was emailed a new signature link.`
          : `${rnName} (${rnEmail}) was re-notified with your note.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setResendRnNote('');
      setConfirmEdits(false);
      await loadIntakeById(activeIntake.id);
      scrollAdminPageToTop();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Resend to RN failed',
        description: String(error?.message || error),
      });
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
    const resolved = resolveEffectiveRnRecommendedTier({
      ...activeIntake,
      alftForm: { ...(activeIntake as any)?.alftForm, exactPacketAnswers: answers },
    });
    const rnTier = clean(resolved.tier) || clean(answers?.p14_rn_recommended_tier);
    if (!/^[1-5]$/.test(rnTier)) {
      toast({
        variant: 'destructive',
        title: 'RN recommended tier required',
        description: adminOverrideRn
          ? 'With RN override, select Tier 1–5 or ensure the SW recommended a tier, then Save Form Edits.'
          : 'Select Tier 1–5 in the RN signature section, then Save Form Edits before final review.',
      });
      return;
    }
    setBusyAction('final');
    try {
      const saved = await saveFormEdits({ quiet: true, preserveBusy: true });
      if (!saved) return;
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/workflow/final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          rnTierAdminReviewed: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Final review failed'));
      toast({
        title: 'Final review complete',
        description: `Admin approved tier ${rnTier}. You can download and archive the signed packet below.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setConfirmEdits(false);
      await loadIntakeById(activeIntake.id);
      scrollAdminPageToTop();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Final review failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const downloadAlftPacketSilent = useCallback(
    async (
      intakeId: string,
      opts?: {
        archivedAtIso?: string;
        answers?: Record<string, string | string[]>;
      }
    ) => {
    const tokenKey = `alft-silent-dl-token:${intakeId}`;
    const answersKey = `alft-silent-dl-answers:${intakeId}:${Date.now()}`;
    const stableAnswersKey = `alft-live-answers:${intakeId}`;
    const liveAnswersPayload =
      opts?.answers && typeof opts.answers === 'object'
        ? { ...opts.answers, p1_agency: AGENCY_NAME }
        : null;
    try {
      const idToken = await getIdToken();
      if (idToken) {
        window.sessionStorage.setItem(tokenKey, idToken);
      }
    } catch {
      // iframe may still pick up auth.currentUser
    }
    if (liveAnswersPayload) {
      try {
        const serialized = JSON.stringify(liveAnswersPayload);
        window.sessionStorage.setItem(answersKey, serialized);
        window.localStorage.setItem(answersKey, serialized);
        window.sessionStorage.setItem(stableAnswersKey, serialized);
        window.localStorage.setItem(stableAnswersKey, serialized);
        (window as any).__ALFT_SILENT_DOWNLOAD_PAYLOAD__ = {
          intakeId,
          answers: liveAnswersPayload,
          archivedAtIso: String(opts?.archivedAtIso || '').trim() || new Date().toISOString(),
        };
      } catch {
        // Fall back to Firestore intake answers in the iframe.
      }
    }

    return await new Promise<{
      downloadName: string;
      logId?: string;
      downloadedAtIso: string;
    }>((resolve, reject) => {
      const params = new URLSearchParams();
      params.set('view', 'pdf');
      params.set('intakeId', intakeId);
      params.set('autoDownload', '1');
      params.set('archive', '1');
      params.set('silent', '1');
      if (liveAnswersPayload) params.set('answersKey', answersKey);
      const archivedAtIso = String(opts?.archivedAtIso || '').trim();
      if (archivedAtIso) params.set('archivedAt', archivedAtIso);

      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.title = 'ALFT silent download';
      iframe.style.cssText =
        'position:fixed;left:-12000px;top:0;width:1120px;height:1600px;border:0;opacity:0;pointer-events:none;';

      let settled = false;
      const pushLiveAnswers = () => {
        if (!liveAnswersPayload) return;
        try {
          (window as any).__ALFT_SILENT_DOWNLOAD_PAYLOAD__ = {
            intakeId,
            answers: liveAnswersPayload,
            archivedAtIso: archivedAtIso || new Date().toISOString(),
          };
          iframe.contentWindow?.postMessage(
            {
              type: 'alft-push-live-answers',
              intakeId,
              answers: liveAnswersPayload,
            },
            window.location.origin
          );
        } catch {
          // ignore
        }
      };

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage);
        try {
          window.sessionStorage.removeItem(tokenKey);
          window.sessionStorage.removeItem(answersKey);
          window.localStorage.removeItem(answersKey);
          window.sessionStorage.removeItem(stableAnswersKey);
          window.localStorage.removeItem(stableAnswersKey);
          if ((window as any).__ALFT_SILENT_DOWNLOAD_PAYLOAD__?.intakeId === intakeId) {
            delete (window as any).__ALFT_SILENT_DOWNLOAD_PAYLOAD__;
          }
        } catch {
          // ignore
        }
        try {
          iframe.remove();
        } catch {
          // ignore
        }
      };

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const triggerBrowserDownload = async (downloadName: string, logId?: string) => {
        const fileName = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`;
        if (!logId) return;
        const idToken = await getIdToken();
        const res = await fetch(`/api/alft/download-log?logId=${encodeURIComponent(logId)}&format=file`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(String(body?.error || 'Could not fetch archived PDF for download.'));
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as any;
        if (!data) return;
        if (data.type === 'alft-silent-ready' && String(data.intakeId || '') === intakeId) {
          pushLiveAnswers();
          return;
        }
        if (data.type !== 'alft-silent-download') return;
        if (String(data.intakeId || '') !== intakeId) return;
        if (data.ok) {
          const downloadName = String(data.downloadName || 'ISP.pdf').trim() || 'ISP.pdf';
          const downloadedAtIso =
            String(data.downloadedAtIso || '').trim() || new Date().toISOString();
          const logId = String(data.logId || '').trim() || undefined;
          void (async () => {
            try {
              if (data.pdfBuffer) {
                const blob = new Blob([data.pdfBuffer], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } else if (logId) {
                await triggerBrowserDownload(downloadName, logId);
              } else {
                throw new Error('Packet archived without a download link. Open ISP Download Archive to retrieve the file.');
              }
              finish(() => resolve({ downloadName, logId, downloadedAtIso }));
            } catch (e: any) {
              finish(() =>
                reject(new Error(String(e?.message || 'Could not download the completed ALFT file.')))
              );
            }
          })();
          return;
        }
        finish(() => reject(new Error(String(data.error || 'Could not download the completed ALFT file.'))));
      };

      const timeoutId = window.setTimeout(() => {
        finish(() =>
          reject(new Error('Download timed out after 90 seconds. Please try again.'))
        );
      }, 90_000);

      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', () => {
        pushLiveAnswers();
        window.setTimeout(pushLiveAnswers, 250);
        window.setTimeout(pushLiveAnswers, 800);
      });
      iframe.src = `/admin/alft-tracker/dummy-preview?${params.toString()}`;
      document.body.appendChild(iframe);
    });
  }, [getIdToken]);

  const downloadAndLog = async (opts?: { archivedAtIso?: string }) => {
    if (!activeIntake?.id) return;
    setBusyAction('download');
    try {
      // Persist latest form answers before building the packet (stay on this page).
      const saved = await saveFormEdits({ quiet: true, preserveBusy: true });
      if (!saved) return;
      setBusyAction('download');
      const versionAtIso = String(opts?.archivedAtIso || '').trim() || new Date().toISOString();
      const result = await downloadAlftPacketSilent(activeIntake.id, {
        archivedAtIso: versionAtIso,
        answers: { ...answers, p1_agency: AGENCY_NAME },
      });
      const fileName = result.downloadName.endsWith('.pdf')
        ? result.downloadName
        : `${result.downloadName}.pdf`;
      setLastDownloadName(fileName);
      setLastDownloadedAt(result.downloadedAtIso);
      toast({
        title: 'Downloaded and archived',
        description: `${fileName} saved on ISP Download Archive. File should appear in your downloads folder.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      await loadDownloadLogs({
        intakeId: activeIntake.id,
        memberId: selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId) || undefined,
      });
      await loadIntakeById(activeIntake.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const requestIspDownloadConfirm = () => {
    const versionAtIso = new Date().toISOString();
    const d = new Date(versionAtIso);
    const versionLabel = Number.isNaN(d.getTime())
      ? versionAtIso
      : d.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    setIspDownloadConfirm({ versionAtIso, versionLabel });
  };

  const confirmIspDownload = async () => {
    const pending = ispDownloadConfirm;
    if (!pending) return;
    setIspDownloadConfirm(null);
    await downloadAndLog({ archivedAtIso: pending.versionAtIso });
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
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/tools/isp-downloads"
                className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
              >
                ISP Download Archive
              </Link>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Social worker on this ISP / ALFT (from Caspio)
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100"
                  disabled={refreshingSwRnContacts || isLoadingPreview || !selectedMemberId}
                  onClick={() => void refreshSwRnContactsFromCaspio()}
                  title="Pull latest SW and RN email/name from Caspio"
                >
                  {refreshingSwRnContacts ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Refresh SW/RN email
                </Button>
              </div>
              <div className="mt-1">
                {socialWorkerName || 'Name not in Caspio'}
                {socialWorkerEmail ? ` • ${socialWorkerEmail}` : ''}
                {socialWorkerCounty ? ` • ${socialWorkerCounty}` : ''}
              </div>
              {assignedRn?.email ? (
                <div className="mt-1 text-xs text-green-900/80">
                  RN on workflow: {assignedRn.label || 'RN'} · {assignedRn.email}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchMembers({ source: 'cache', skipStaleCheck: true })}
              disabled={isLoadingMembers || isSyncingMembersCache}
              title="Fast load from Firestore — resume saved routing / form work without Caspio sync"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers && !isSyncingMembersCache ? 'animate-spin' : ''}`} />
              Load
            </Button>
            <Button
              size="sm"
              onClick={() => void syncMembersCacheFromCaspio()}
              disabled={isLoadingMembers || isSyncingMembersCache}
              title="Pull Kaiser members from Caspio into Firestore, then load the list"
            >
              {isSyncingMembersCache ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Database className="mr-2 h-4 w-4" />
              )}
              {isSyncingMembersCache ? 'Syncing…' : 'Sync from Caspio'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100"
              disabled={refreshingSwRnContacts || !selectedMemberId}
              onClick={() => void refreshSwRnContactsFromCaspio()}
              title="Pull latest social worker and RN emails from Caspio for the selected member"
            >
              {refreshingSwRnContacts ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh SW/RN emails
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Load = Firestore (resume saved work). Sync = refresh from Caspio, then load.
              </span>
            )}
          </div>

          <div className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search by member name, MRN, Client_ID2..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                className="h-9"
                onClick={() => setStatusFilter('all')}
              >
                All
                {members.length > 0 ? ` (${members.length})` : ''}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === 'rn_visit_needed' ? 'default' : 'outline'}
                className={
                  statusFilter === 'rn_visit_needed'
                    ? 'h-9 bg-red-700 hover:bg-red-800'
                    : 'h-9 border-red-200 text-red-800 hover:bg-red-50'
                }
                onClick={() => setStatusFilter('rn_visit_needed')}
                title='Kaiser Status = "RN Visit Needed"'
              >
                RN Visit Needed
                {members.length > 0 ? ` (${rnVisitNeededCount})` : ''}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MemberListCard
              filteredMembers={filteredMembers}
              statusFilter={statusFilter}
              setMemberSortDir={setMemberSortDir}
              memberSortDir={memberSortDir}
              selectedClientId={selectedClientId}
              requestSelectMember={requestSelectMember}
              checkingPriorInvite={checkingPriorInvite}
              members={members}
            />

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
                  {selectedMember &&
                  assignmentActivity.invitedAt &&
                  !assignmentActivity.submittedAt &&
                  !assignmentActivity.signedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
                      disabled={cancellingSwInvite}
                      onClick={() => setCancelInviteConfirmOpen(true)}
                    >
                      {cancellingSwInvite ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Ban className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Cancel SW request
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

                    <RequiredCaspioFieldsPanel
                      loadCaspioFieldPreview={loadCaspioFieldPreview}
                      selectedMember={selectedMember}
                      isLoadingPreview={isLoadingPreview}
                      prefillDataSource={prefillDataSource}
                      previewError={previewError}
                      missingRequiredLabels={missingRequiredLabels}
                      hasPreviewForSelection={hasPreviewForSelection}
                      ispContactPhoneEmpty={ispContactPhoneEmpty}
                      overrideIspContactPhone={overrideIspContactPhone}
                      setOverrideIspContactPhone={setOverrideIspContactPhone}
                      requiredFieldStatuses={requiredFieldStatuses}
                      assessorType={assessorType}
                    />

                    <div className="space-y-3 rounded-md border border-blue-200 bg-blue-50/40 p-3">
                      <div className="text-sm font-semibold text-slate-900">Setup steps (above assessment form)</div>

                      <ConfirmAssessorStep
                        confirmedSw={confirmedSw}
                        assessorType={assessorType}
                        formerSwImportMode={formerSwImportMode}
                        assessorCaspioRole={assessorCaspioRole}
                        socialWorkerName={socialWorkerName}
                        socialWorkerEmail={socialWorkerEmail}
                        setAssessorType={setAssessorType}
                        setConfirmedSw={setConfirmedSw}
                        setConfirmedRn={setConfirmedRn}
                        setFormerSwImportMode={setFormerSwImportMode}
                        setAssessorCaspioRole={setAssessorCaspioRole}
                        selectedMember={selectedMember}
                        selectedClientId={selectedClientId}
                        loadCaspioFieldPreview={loadCaspioFieldPreview}
                        rnOptions={rnOptions}
                        setRnUid={setRnUid}
                        setSwPortalActive={setSwPortalActive}
                        setAnswers={setAnswers}
                        applyMswAdminOverrideToAnswers={applyMswAdminOverrideToAnswers}
                        setSocialWorkerName={setSocialWorkerName}
                        setSocialWorkerEmail={setSocialWorkerEmail}
                        verifySwPortalAccess={verifySwPortalAccess}
                        socialWorkerSwId={socialWorkerSwId}
                        checkingSwPortal={checkingSwPortal}
                        swPortalActive={swPortalActive}
                        socialWorkerCounty={socialWorkerCounty}
                        setSocialWorkerCounty={setSocialWorkerCounty}
                        memberCounty={memberCounty}
                        setMemberCounty={setMemberCounty}
                        toast={toast}
                        setResolvedPreview={setResolvedPreview}
                      />

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

                      <ConfirmRnStep
                        confirmedRn={confirmedRn}
                        confirmedFirstReviewer={confirmedFirstReviewer}
                        assessorType={assessorType}
                        assignedRn={assignedRn}
                        rnUid={rnUid}
                        setRnUid={setRnUid}
                        setConfirmedRn={setConfirmedRn}
                        rnOptions={rnOptions}
                        staffOptions={staffOptions}
                        socialWorkerEmail={socialWorkerEmail}
                        toast={toast}
                      />

                      <RcfeDetailsStep
                        confirmedPurpose={confirmedPurpose}
                        confirmedRn={confirmedRn}
                        assessmentPurpose={assessmentPurpose}
                        setAssessmentPurpose={setAssessmentPurpose}
                        setConfirmedPurpose={setConfirmedPurpose}
                        setConfirmedIspLocation={setConfirmedIspLocation}
                        setVisitLocationSource={setVisitLocationSource}
                        setAskCaregiverOnArrival={setAskCaregiverOnArrival}
                        setOverrideIspContactPhone={setOverrideIspContactPhone}
                        caspioSourcePreview={caspioSourcePreview}
                        setResolvedPreview={setResolvedPreview}
                        applyVisitLocationToPreview={applyVisitLocationToPreview}
                        visitLocationSource={visitLocationSource}
                        reauthH2022Warning={reauthH2022Warning}
                        resolvedPreview={resolvedPreview}
                        setAnswers={setAnswers}
                        setCaspioFilledIds={setCaspioFilledIds}
                        askCaregiverOnArrival={askCaregiverOnArrival}
                        visitLocationSummary={visitLocationSummary}
                      />

                      <IspLocationStep
                        confirmedIspLocation={confirmedIspLocation}
                        confirmedPurpose={confirmedPurpose}
                        visitLocationReady={visitLocationReady}
                        ispRcfeSoftMismatch={ispRcfeSoftMismatch}
                        ispLocationReadiness={ispLocationReadiness}
                        needsVisitLocationChoice={needsVisitLocationChoice}
                        ispLocationSnapshot={ispLocationSnapshot}
                        rcfeLocationSnapshot={rcfeLocationSnapshot}
                        ispLocationUpdating={ispLocationUpdating}
                        isLoadingPreview={isLoadingPreview}
                        acceptRcfeAsDefaultIspLocation={acceptRcfeAsDefaultIspLocation}
                        refreshIspLocationFromCaspio={refreshIspLocationFromCaspio}
                        visitLocationSource={visitLocationSource}
                        canConfirmIspLocationStep={canConfirmIspLocationStep}
                        setConfirmedIspLocation={setConfirmedIspLocation}
                        toast={toast}
                      />

                      <MemberUploadsStep
                        confirmedClinicalUploads={confirmedClinicalUploads}
                        confirmedIspLocation={confirmedIspLocation}
                        loadingApplicationClinical={loadingApplicationClinical}
                        applicationClinicalFiles={applicationClinicalFiles}
                        applicationClinicalSourceLabel={applicationClinicalSourceLabel}
                        storage={storage}
                        toast={toast}
                        canUploadClinical={canUploadClinical}
                        pullingApplicationClinical={pullingApplicationClinical}
                        pullApplicationClinicalFilesIntoSwPortal={pullApplicationClinicalFilesIntoSwPortal}
                        selectedMember={selectedMember}
                        clinicalUploadLabel={clinicalUploadLabel}
                        setClinicalUploadLabel={setClinicalUploadLabel}
                        uploadMemberClinicalFiles={uploadMemberClinicalFiles}
                        clinicalUploading={clinicalUploading}
                        clinicalUploadProgress={clinicalUploadProgress}
                        clinicalUploadFiles={clinicalUploadFiles}
                        swPortalSupportFiles={swPortalSupportFiles}
                        deletingClinicalFileId={deletingClinicalFileId}
                        deleteSwPortalClinicalFile={deleteSwPortalClinicalFile}
                        setConfirmedClinicalUploads={setConfirmedClinicalUploads}
                      />

                      <CaspioPrefillStep
                        showForm={showForm}
                        confirmedClinicalUploads={confirmedClinicalUploads}
                        completedPdfImportDone={completedPdfImportDone}
                        formerSwImportMode={formerSwImportMode}
                        prefillIspForm={prefillIspForm}
                        prefillLockedByCompletedPdf={prefillLockedByCompletedPdf}
                        isPrefilling={isPrefilling}
                        isRefreshingCaspioFields={isRefreshingCaspioFields}
                        isParsingCompletedPdf={isParsingCompletedPdf}
                        isLoadingPreview={isLoadingPreview}
                        canPrefillIspForm={canPrefillIspForm}
                        refreshCaspioFieldsOntoExistingIsp={refreshCaspioFieldsOntoExistingIsp}
                        selectedMember={selectedMember}
                        selectedClientId={selectedClientId}
                        importCompletedAlftPdf={importCompletedAlftPdf}
                        completedPdfFileName={completedPdfFileName}
                        clearCompletedAlftPdfImport={clearCompletedAlftPdfImport}
                        completedPdfParseProgress={completedPdfParseProgress}
                        prefillBlockedReasons={prefillBlockedReasons}
                        ispContactPhoneEmpty={ispContactPhoneEmpty}
                        overrideIspContactPhone={overrideIspContactPhone}
                        setOverrideIspContactPhone={setOverrideIspContactPhone}
                      />

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
                          {formerSwImportMode ? 'Continue without SW invite' : 'Send social worker invite'}
                          {assignmentActivity.invitedAt ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                          {formerSwImportMode ? (
                            <Badge className="bg-amber-100 text-amber-950 hover:bg-amber-100">Departed SW</Badge>
                          ) : null}
                        </div>
                        {formerSwImportMode ? (
                          <p className="mb-2 text-xs text-muted-foreground">
                            SW invite is skipped. After you upload/parse the completed ALFT PDF and verify the form,
                            scroll to <span className="font-medium">Save as ISP intake &amp; unlock actions</span>. You
                            can <span className="font-medium">Download &amp; Log</span> after edits without new
                            signatures, or continue Approve → Send to RN if needed. Assessor on the form:{' '}
                            <span className="font-medium">{clean(socialWorkerName) || '—'}</span>.
                          </p>
                        ) : (
                          <p className="mb-2 text-xs text-muted-foreground">
                            Preview the invite, edit a custom message, then send. When they submit/sign,{' '}
                            <span className="font-medium">{firstReviewer?.label || 'first review staff'}</span> is
                            notified by email and Action Items.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {!formerSwImportMode ? (
                            <Button
                              onClick={() => openSwInvitePreview()}
                              disabled={isSendingInvite || !canSendSwInvite}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              {assignmentActivity.invitedAt ? 'Preview & re-send invite' : 'Preview & send SW invite'}
                            </Button>
                          ) : null}
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

                    <SwInviteActivityLog
                      refreshAssignmentActivity={refreshAssignmentActivity}
                      selectedMember={selectedMember}
                      assignmentActivity={assignmentActivity}
                      firstReviewer={firstReviewer}
                    />

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
                        <li>
                          After Final download → complete the{' '}
                          <span className="font-medium">ILS Member Package Checklist</span> (ISP, cover page, room &amp;
                          board; RCFE W-9 / license / insurance on initial) and send to Veronica
                        </li>
                      </ol>
                    </div>

                    <SentToIlsPanel
                      sentToIlsSource={sentToIlsSource}
                      sentToIlsManual={sentToIlsManual}
                      sentToIlsVerifierUid={sentToIlsVerifierUid}
                      sentToIlsSaving={sentToIlsSaving}
                      selectedMember={selectedMember}
                      setSentToIlsVerifierUid={setSentToIlsVerifierUid}
                      ilsVerifierStaffOptions={ilsVerifierStaffOptions}
                      saveSentToIlsManual={saveSentToIlsManual}
                      sentToIlsDate={sentToIlsDate}
                      setSentToIlsDate={setSentToIlsDate}
                      sentToIlsVerifiedByName={sentToIlsVerifiedByName}
                      sentToIlsVerifiedAtIso={sentToIlsVerifiedAtIso}
                      sentToIlsVerifiedByEmail={sentToIlsVerifiedByEmail}
                    />

                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href="/admin/tools/isp-downloads"
                        className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
                      >
                        ISP Download Archive
                      </Link>
                      <Button variant="outline" asChild>
                        <Link href="/admin/tools/isp-tracker">
                          <ClipboardList className="mr-2 h-4 w-4" />
                          ISP Tracker (status)
                        </Link>
                      </Button>
                      <Button variant="outline" asChild>
                        <Link
                          href={
                            selectedMember
                              ? `/admin/tools/alft-cover-sheet-package?memberClientId=${encodeURIComponent(
                                  clientIdOf(selectedMember)
                                )}`
                              : '/admin/tools/alft-cover-sheet-package'
                          }
                        >
                          <Send className="mr-2 h-4 w-4" />
                          ILS package checklist → Veronica
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

      <ActiveIntakeReviewCard
        activeIntake={activeIntake}
        importedCompletedIsp={importedCompletedIsp}
        adminOverrideMsw={adminOverrideMsw}
        saveFormEdits={saveFormEdits}
        busyAction={busyAction}
        canFirstReview={canFirstReview}
        acceptAndSendForSignature={acceptAndSendForSignature}
        confirmEdits={confirmEdits}
        swAlreadySigned={swAlreadySigned}
        awaitingRnSignature={awaitingRnSignature}
        sentToRnLabel={sentToRnLabel}
        rnAlreadySigned={rnAlreadySigned}
        adminOverrideRn={adminOverrideRn}
        canResendToRnForNewSignature={canResendToRnForNewSignature}
        openResendRnDialog={openResendRnDialog}
        canFinalReview={canFinalReview}
        canDownloadPacket={canDownloadPacket}
        completeFinalReview={completeFinalReview}
        downloadAndLog={downloadAndLog}
        lastDownloadName={lastDownloadName}
        lastDownloadedAt={lastDownloadedAt}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        requestChanges={requestChanges}
        downloadLogs={downloadLogs}
        redownloadLog={redownloadLog}
      />

      <IspAssessmentFormCard
        showForm={showForm}
        ispLayoutMode={ispLayoutMode}
        assessmentPurpose={assessmentPurpose}
        reauthH2022Warning={reauthH2022Warning}
        setIspLayoutMode={setIspLayoutMode}
        caspioFilledIds={caspioFilledIds}
        answers={answers}
        setConfirmEdits={setConfirmEdits}
        setAnswers={setAnswers}
        selectedMember={selectedMember}
        activeIntake={activeIntake}
        selectedClientId={selectedClientId}
        medListAttachment={medListAttachment}
        setMedListAttachment={setMedListAttachment}
        formerSwImportMode={formerSwImportMode}
        socialWorkerName={socialWorkerName}
        createIntakeFromForm={createIntakeFromForm}
        busyAction={busyAction}
        adminOverrideMsw={adminOverrideMsw}
        adminOverrideRn={adminOverrideRn}
        canFinalReview={canFinalReview}
        awaitingRnSignature={awaitingRnSignature}
        sentToRnLabel={sentToRnLabel}
        assignedRn={assignedRn}
        confirmEdits={confirmEdits}
        saveFormEdits={saveFormEdits}
        canFirstReview={canFirstReview}
        acceptAndSendForSignature={acceptAndSendForSignature}
        swAlreadySigned={swAlreadySigned}
        rnAlreadySigned={rnAlreadySigned}
        canResendToRnForNewSignature={canResendToRnForNewSignature}
        openResendRnDialog={openResendRnDialog}
        completeFinalReview={completeFinalReview}
        canDownloadPacket={canDownloadPacket}
        requestIspDownloadConfirm={requestIspDownloadConfirm}
        lastDownloadName={lastDownloadName}
        canBypassRnSignaturesForDownload={canBypassRnSignaturesForDownload}
        lastDownloadedAt={lastDownloadedAt}
        downloadLogs={downloadLogs}
        redownloadLog={redownloadLog}
      />

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

      <ResendReasonDialog
        resendRnDialogOpen={resendRnDialogOpen}
        setResendRnDialogOpen={setResendRnDialogOpen}
        setResendRnNote={setResendRnNote}
        setConfirmResendRnSendOpen={setConfirmResendRnSendOpen}
        rnAlreadySigned={rnAlreadySigned}
        activeIntake={activeIntake}
        answers={answers}
        assignedRn={assignedRn}
        resendRnNote={resendRnNote}
        busyAction={busyAction}
        toast={toast}
      />

      <AlertDialog open={confirmResendRnSendOpen} onOpenChange={setConfirmResendRnSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rnAlreadySigned ? 'Confirm new RN signature request?' : 'Confirm re-send to RN?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {rnAlreadySigned
                    ? 'The prior RN signature will be cleared and a new signature-request email will go to '
                    : 'Another signature-request email will go to '}
                  <span className="font-medium text-foreground">
                    {clean(assignedRn?.label) || clean(activeIntake?.alftRnName) || 'the RN'}
                    {clean(assignedRn?.email) || clean(activeIntake?.alftRnEmail)
                      ? ` (${clean(assignedRn?.email) || clean(activeIntake?.alftRnEmail)})`
                      : ''}
                  </span>
                  .
                </p>
                {clean(resendRnNote) ? (
                  <p className="rounded-md border bg-muted/40 px-2 py-1.5 text-foreground">
                    Note: {clean(resendRnNote)}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyAction)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busyAction)}
              onClick={(e) => {
                e.preventDefault();
                void executeResendToRnForNewSignature();
              }}
            >
              {busyAction === 'resend-rn' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Yes, resend to RN'
              )}
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

      <AlertDialog
        open={Boolean(differentSwInviteWarn)}
        onOpenChange={(open) => {
          if (!open) setDifferentSwInviteWarn(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite already sent to a different social worker</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  An invitation was already sent
                  {differentSwInviteWarn?.priorAt ? ` on ${formatWhen(differentSwInviteWarn.priorAt)}` : ''} to{' '}
                  <span className="font-medium text-foreground">
                    {differentSwInviteWarn?.priorEmail || 'another social worker'}
                  </span>
                  .
                </p>
                <p>
                  You are about to send to{' '}
                  <span className="font-medium text-foreground">
                    {differentSwInviteWarn?.nextEmail || 'a new social worker'}
                  </span>
                  . Consider cancelling the prior request first so the previous social worker is not left with an
                  active portal item.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => openSwInvitePreview({ skipDifferentSwWarn: true })}
            >
              Continue &amp; preview invite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelInviteConfirmOpen} onOpenChange={setCancelInviteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel ISP request for social worker?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  This cancels the outstanding invite
                  {assignmentActivity.invitedTo ? ` to ${assignmentActivity.invitedTo}` : ''}. The social worker
                  will no longer see this member in their SW portal queue.
                </p>
                <p>
                  Routing, clinical uploads, and activity history stay on file. You can send a new invite later after
                  completing the setup steps again.
                </p>
                <div className="space-y-2 rounded border bg-slate-50 p-3 text-left">
                  <label className="flex items-start gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={cancelInviteNotifySw}
                      onCheckedChange={(checked) => setCancelInviteNotifySw(Boolean(checked))}
                      disabled={cancellingSwInvite}
                    />
                    <span>Email cancellation notice to the social worker</span>
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="cancel-invite-reason">Optional note for cancellation email</Label>
                    <Textarea
                      id="cancel-invite-reason"
                      value={cancelInviteReason}
                      onChange={(e) => setCancelInviteReason(e.target.value)}
                      disabled={cancellingSwInvite || !cancelInviteNotifySw}
                      placeholder="e.g. Reassigned to another social worker"
                      className="min-h-[72px]"
                    />
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingSwInvite}>Keep request</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={cancellingSwInvite}
              onClick={(e) => {
                e.preventDefault();
                void cancelSocialWorkerInvite();
              }}
            >
              {cancellingSwInvite ? 'Cancelling…' : 'Cancel SW request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="text-sm text-muted-foreground">
            Browse every archived ISP version, re-download, or delete old copies.
          </div>
          <Link
            href="/admin/tools/isp-downloads"
            className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800"
          >
            ISP Download Archive
          </Link>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(ispDownloadConfirm)}
        onOpenChange={(open) => {
          if (!open && busyAction !== 'download') setIspDownloadConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm ISP download</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Review the version timestamp before downloading. This stamp is saved on ISP Download Archive.</p>
                <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 text-emerald-950">
                  <div className="text-xs font-medium uppercase tracking-wide text-emerald-900/80">
                    Version timestamp
                  </div>
                  <div className="mt-1 text-lg font-semibold text-foreground">
                    {ispDownloadConfirm?.versionLabel || '—'}
                  </div>
                  <div className="mt-1 text-xs text-emerald-900">
                    Download this timestamped ISP version now?
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction === 'download'}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyAction === 'download'}
              onClick={(e) => {
                e.preventDefault();
                void confirmIspDownload();
              }}
            >
              {busyAction === 'download' ? 'Downloading…' : 'Download this version'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BackToTop variant="both" />
    </div>
  );
}
