
'use client';

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Check,
  CheckCircle2,
  File,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  Package,
  Database,
  X,
  XCircle,
  FileText,
  Mail,
  AlertTriangle,
  User,
  List,
  Link as LinkIcon,
  Download,
  Bell,
  Eye,
  ChevronDown,
  Target,
  Wrench,
  RefreshCw,
  ClipboardPaste,
  RotateCcw,
  MessageSquareHeart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveKaiserRegion, isValidKaiserMrnForCaspioPush, stripMrnSeparators } from '@/lib/kaiser-region';
import {
  resolveReferralAuthorizedCaregiver,
  resolveReferralBestContactParams,
} from '@/lib/kaiser-referral-caregiver';
import {
  composeReferralAddressLine,
  resolveKaiserReferralCurrentLocation,
  resolveKaiserReferralMailingAddress,
} from '@/lib/kaiser-referral-addresses';
import { mergeApplicationForms } from '@/lib/merge-application-forms';
import { classifyProofIncomeDocumentDate } from '@/lib/proof-income-age';
import {
  dedupeIlsNotesBlocks,
  enrichSingleAuthAdminNotesFromApplication,
  looksLikeOriginalIlsImportNotes,
  mergeNotesAvoidingIlsDuplicate,
  resolveLaterNotesPushedToCaspio,
  resolveOriginalNotesPushedToCaspio,
  stripOriginalIlsImportNotes,
} from '@/lib/ils-admin-notes';
import {
  applicationMifServiceDeliveryNeedsRefresh,
  collectWaiversAuthorizationsPdfUrls,
  isGeneratedMifServiceRequestForm,
  isMifServiceRequestFormName,
  isMifSpreadsheetIntakeApplication,
  MIF_SERVICE_DELIVERY_FORM_NAME,
  MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
  uploadMifServiceDeliveryForm,
  uploadWaiversAuthorizationsPacket,
  WAIVERS_AUTHORIZATIONS_PACKET_FORM_NAME,
  WAIVERS_AUTHORIZATIONS_PACKET_LAYOUT_VERSION,
} from '@/lib/mif-service-delivery-form';
import type { Application, FormStatus as FormStatusType, StaffTracker } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  getDocs,
  query,
  where,
  limit,
  deleteField,
  type DocumentSnapshot,
  type FirestoreError,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getBlob, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { MultiUploadCard } from '@/components/MultiUploadCard';
import { useAdmin } from '@/hooks/use-admin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminFetch, firebaseAuthHeaders } from '@/lib/admin-fetch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogTitle, AlertDialogHeader, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import ActivityLog from '@/components/admin/ActivityLog';
import { KAISER_STATUS_PROGRESSION, getKaiserStatusesInOrder } from '@/lib/kaiser-status-progression';
import {
  KAISER_NOT_INTERESTED_COLLECTION,
  KAISER_NOT_INTERESTED_STATUS,
  buildKaiserNotInterestedDocId,
  isNotInterestedKaiserStatus,
} from '@/lib/kaiser-not-interested';
import { countPendingDocumentReviews } from '@/lib/review-queue';
import { buildMemberActionLogEntry, MEMBER_ACTION_KEYS, type MemberActionLogEntry } from '@/lib/member-action-log';
import {
  buildFirstContactAckResetFields,
  isNeedFirstContactKaiserStatus,
  isUserAssignedStaffForApp,
  shouldTrackFirstContactAck,
} from '@/lib/first-contact-ack';
import {
  SNF_RESIDENCY_NOTE,
  SNF_RESIDENCY_REQUIRED_DAYS,
  buildSnfResidencyFormFields,
  parseSnfResidencyDays,
  requiresSnfFacesheet,
} from '@/lib/snf-residency';
import {
  INACTIVE_CALAIM_STATUSES,
  applicationInactiveCalaimStatus,
  canonicalInactiveCalaimStatus,
} from '@/lib/inactive-calaim-status';
import { collectPrimaryContactCcEmails } from '@/lib/portal-access';
import {
  DEFAULT_SOCIAL_WORKER_HOLD_VALUE,
  normalizeStatusToken,
  isRequiredPrePushKaiserStatus,
  toMillisSafe,
  QaDoneMeta,
} from './components/shared';
import {
  getIntroEmailLastSentAtMs,
  type MemberPortalLoginEntry,
  getStaffAssignmentSentAtMs,
  getStaffAssignmentLogEntries,
} from './components/application-detail-helpers';
import { StaffAssignmentDropdown } from './components/StaffAssignmentDropdown';
import {
  healthNetSteps,
  resolveHealthNetStatus,
  notEligibleReasonOptions,
  STRICT_UPLOAD_REQUIRED_FOR_COMPLETION,
  ALLOW_COMPLETE_WITHOUT_UPLOAD,
  PROCESS_TRACKER_REVIEW_TARGETS,
  PROGRAM_INFO_GUIDE_URL,
  HEALTH_NET_MANAGER_SIGNATURE,
  HEALTH_NET_MANAGER_EMAIL,
  DEFAULT_COORDINATOR_EMAIL,
  CONNECT_CALAIM_WEBSITE,
  getAuthorizationTypes,
  getPathwayRequirements,
} from './components/application-status-config';
import { StatusIndicator, quickStatusItems } from './components/StaffApplicationTracker';
import { IntroductoryEmailDialog } from './components/IntroductoryEmailDialog';
import { getReminderMissingItems, AdminActions } from './components/AdminActions';
import {
  PushToCaspioDialog,
  IlsServiceStartedEmailDialog,
  ClaimsDepartmentEmailDialog,
} from './components/dynamic-dialogs';
import type { StandaloneUploadRow, PortalActivityItem, FormStatusUpdate, EligibilityScreenshotUpload, CommunicationNoteLogEntry } from './components/application-detail-types';
import { IntakeUploadPickerDialog } from './components/IntakeUploadPickerDialog';
import { RoomBoardWorkspaceDialog } from './components/RoomBoardWorkspaceDialog';
import { ApplicationProgressSummaryCard } from './components/ApplicationProgressSummaryCard';
import { DocumentPreviewDialog } from './components/DocumentPreviewDialog';
import { PathwayRequirementsGrid } from './components/PathwayRequirementsGrid';
import { MemberPortalLoginLog } from './components/MemberPortalLoginLog';
import { MemberDocumentsQuickActions } from './components/MemberDocumentsQuickActions';
import { KaiserReferralQuickAction } from './components/KaiserReferralQuickAction';
import { EligibilityCheckQuickAction } from './components/EligibilityCheckQuickAction';
import { AssignedStaffQuickAction } from './components/AssignedStaffQuickAction';
import { KaiserStatusQuickAction } from './components/KaiserStatusQuickAction';
import { CaspioReversePullQuickAction } from './components/CaspioReversePullQuickAction';
import { PrePushNotesQuickAction } from './components/PrePushNotesQuickAction';
import { EmailRemindersQuickAction } from './components/EmailRemindersQuickAction';
import { ApplicationProgressionDialog } from './components/ApplicationProgressionDialog';
import { ReminderSettingsDialog } from './components/ReminderSettingsDialog';
import { AuthorizationUploadsDialog } from './components/AuthorizationUploadsDialog';
import { IndividualServicePlansDialog } from './components/IndividualServicePlansDialog';

function ApplicationDetailPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const { isAdmin, isSuperAdmin, user: adminUser } = useAdmin();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const currentUserId = user?.uid || '';
  const { toast } = useToast();
  
  const applicationId = params?.applicationId as string;
  const appUserId = useMemo(() => {
    const raw = String(searchParams.get('userId') || '').trim();
    if (!raw) return '';
    const lowered = raw.toLowerCase();
    if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return '';
    return raw;
  }, [searchParams]);
  const quickActionTarget = String(searchParams.get('quickAction') || '').trim().toLowerCase();
  const reminderTabTarget = String(searchParams.get('reminderTab') || '').trim().toLowerCase();
  const focusRequirementTarget = String(searchParams.get('focusRequirement') || '').trim().toLowerCase();

  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [snfResidencyDaysInput, setSnfResidencyDaysInput] = useState('');
  const [isSavingSnfResidency, setIsSavingSnfResidency] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [eligibilityPasteLoading, setEligibilityPasteLoading] = useState(false);
  const [eligibilityClipboardBlocked, setEligibilityClipboardBlocked] = useState(false);
  const eligibilityScreenshotInputRef = useRef<HTMLInputElement | null>(null);
  const eligibilityPasteZoneRef = useRef<HTMLDivElement | null>(null);
  const [isResettingEligibilityUploads, setIsResettingEligibilityUploads] = useState(false);
  const authorizedCalaimBackfillRef = useRef<string>('');
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [prePushNotesDraft, setPrePushNotesDraft] = useState('');
  const [isSavingPrePushNotes, setIsSavingPrePushNotes] = useState(false);
  const [prePushNotesAutosaveState, setPrePushNotesAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [prePushNotesSavedAtIso, setPrePushNotesSavedAtIso] = useState<string>('');
  const [error, setError] = useState<Error | null>(null);
  const [intakeImportOpen, setIntakeImportOpen] = useState(false);
  const [intakeRequirementTitle, setIntakeRequirementTitle] = useState<string>('');
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string>('');
  const [intakeUploads, setIntakeUploads] = useState<StandaloneUploadRow[]>([]);
  const [intakeSearch, setIntakeSearch] = useState<string>('');
  const [intakeSelectedFileKey, setIntakeSelectedFileKey] = useState<string>(''); // `${uploadId}:${index}`
  const [staffList, setStaffList] = useState<Array<{ uid: string; name: string; email: string; role?: string }>>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [interofficeNote, setInterofficeNote] = useState<{
    recipientIds: string[];
    priority: 'Regular' | 'Priority' | 'Immediate';
    message: string;
    followUpDate?: string;
  }>({
    recipientIds: [],
    priority: 'Regular',
    message: '',
    followUpDate: ''
  });
  const [authorizationUpload, setAuthorizationUpload] = useState<{
    type: string;
    startDate: string;
    endDate: string;
    file: File | null;
  }>({
    type: '',
    startDate: '',
    endDate: '',
    file: null
  });
  const [authorizationUploading, setAuthorizationUploading] = useState(false);
  const [authorizationUploadProgress, setAuthorizationUploadProgress] = useState(0);
  const [authorizationSearch, setAuthorizationSearch] = useState('');
  const [isMemberFilesDialogOpen, setIsMemberFilesDialogOpen] = useState(false);
  const [isDownloadingAllMemberFiles, setIsDownloadingAllMemberFiles] = useState(false);
  const [memberFilesDownloadProgress, setMemberFilesDownloadProgress] = useState(0);
  const [memberFilesDownloadStatusLabel, setMemberFilesDownloadStatusLabel] = useState('');
  const [serviceDeliveryCreateDialogOpen, setServiceDeliveryCreateDialogOpen] = useState(false);
  const [serviceDeliverySourceKind, setServiceDeliverySourceKind] = useState<'mif' | 'single_auth'>('mif');
  const [isCreatingServiceDeliveryFile, setIsCreatingServiceDeliveryFile] = useState(false);
  const [isCreatingWaiversAuthorizationsPacket, setIsCreatingWaiversAuthorizationsPacket] = useState(false);
  const [memberFileResolvedUrls, setMemberFileResolvedUrls] = useState<Record<string, string>>({});
  const [memberFileUrlLoading, setMemberFileUrlLoading] = useState<Record<string, boolean>>({});
  const [documentPreview, setDocumentPreview] = useState<{ url: string; title: string } | null>(null);
  const [alftCompletionFileEntries, setAlftCompletionFileEntries] = useState<
    Array<{
      id: string;
      category: string;
      documentName: string;
      fileName: string;
      downloadURL: string;
      filePath: string;
      uploadedAtIso: string;
    }>
  >([]);
  const memberFilesDownloadCancelRef = useRef(false);
  const memberFilesDownloadAbortRef = useRef<AbortController | null>(null);
  const [ispUpload, setIspUpload] = useState<{
    planDate: string;
    file: File | null;
  }>({
    planDate: '',
    file: null
  });
  const [ispUploading, setIspUploading] = useState(false);
  const [ispUploadProgress, setIspUploadProgress] = useState(0);
  const [waiverResetOpen, setWaiverResetOpen] = useState(false);
  const [waiverResetting, setWaiverResetting] = useState(false);
  const [isConvertingSkeleton, setIsConvertingSkeleton] = useState(false);
  const [memberNotifications, setMemberNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    priority: string;
    createdAt: any;
    createdByName?: string;
    type?: string;
  }>>([]);
  const [memberPortalLoginLog, setMemberPortalLoginLog] = useState<MemberPortalLoginEntry[]>([]);
  const [isLoadingMemberPortalLoginLog, setIsLoadingMemberPortalLoginLog] = useState(false);
  const [familyPortalLoginExpanded, setFamilyPortalLoginExpanded] = useState(false);
  const [memberPortalLoginRefreshKey, setMemberPortalLoginRefreshKey] = useState(0);

  const mergeCurrentUserIntoStaff = (
    staff: Array<{ uid: string; name: string; email: string; role?: string }>
  ) => {
    if (!user) return staff;
    const currentUid = user.uid || user.email || 'current-user';
    const currentEmail = user.email || '';
    const exists = staff.some(
      (member) => member.uid === currentUid || (currentEmail && member.email === currentEmail)
    );
    if (exists) return staff;
    return [
      ...staff,
      {
        uid: currentUid,
        name: user.displayName || user.email || 'Current User',
        email: currentEmail,
        role: 'Admin'
      }
    ];
  };

  const resetWaiversStatus = async () => {
    if (!docRef || !application) return;
    setWaiverResetting(true);
    try {
      const updatedForms = (application.forms || []).map((form: any) => {
        const formName = String(form?.name || '').trim();
        const isWaiverAlias = waiverAliasNames.has(formName) || isWaiverFormName(formName);
        if (!isWaiverAlias) return form;
        return {
          ...form,
          status: 'Pending',
          dateCompleted: null,
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          // Waiver-specific fields
          signerType: null,
          signerName: '',
          signerRelationship: '',
          choice: null,
          ackHipaa: false,
          ackLiability: false,
          ackFoc: false,
          ackRoomAndBoard: false,
          ackSocDetermination: false,
          monthlyIncome: '',
          incomeSource: [],
          // Clear revision request metadata (this is a staff reset, not a rejection request)
          revisionRequestedReason: null,
          revisionRequestedAt: null,
          revisionRequestedBy: null,
          revisionRequestedByUid: null,
          revisionEmailTo: null,
          revisionEmailSentAt: null,
        };
      });

      const pendingDocReviewCount = countPendingDocumentReviews(updatedForms);

      const patch: Record<string, any> = {
        forms: updatedForms,
        lastUpdated: serverTimestamp(),
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
        // Best-effort clear any mirrored waiver fields on the application root.
        choice: null,
        ackHipaa: false,
        ackLiability: false,
        ackFoc: false,
        ackRoomAndBoard: false,
        ackSocDetermination: false,
        monthlyIncome: '',
        incomeSource: [],
      };

      await setDoc(docRef, patch, { merge: true });
      setApplication((prev: any) =>
        prev
          ? ({
              ...prev,
              ...patch,
              forms: updatedForms,
            } as any)
          : prev
      );

      toast({
        title: 'Waivers reset',
        description: 'Waivers & Authorizations set back to Pending so it can be re-completed.',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not reset waivers',
        description: String(e?.message || 'Please retry.'),
      });
    } finally {
      setWaiverResetting(false);
      setWaiverResetOpen(false);
    }
  };

  const convertSkeletonToNormalApplication = async () => {
    if (!docRef || !application) return;
    setIsConvertingSkeleton(true);
    try {
      const currentStatus = String((application as any)?.status || '').trim().toLowerCase();
      const patch: Record<string, any> = {
        createdByAdmin: false,
        allowDraftCaspioPush: false,
        lastUpdated: serverTimestamp(),
      };
      if (currentStatus === 'draft') {
        patch.status = 'In Progress';
      }
      await setDoc(docRef, patch, { merge: true });
      setApplication((prev: any) => (prev ? ({ ...prev, ...patch } as any) : prev));
      toast({
        title: 'Converted to normal application',
        description: 'Skeleton mode was turned off for this application.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Failed to convert skeleton application:', error);
      toast({
        variant: 'destructive',
        title: 'Could not convert application',
        description: 'Please try again.',
      });
    } finally {
      setIsConvertingSkeleton(false);
    }
  };

  // Autosave drafts for admin tools (interoffice note + upload wizards).
  const hydratedToolDraftsForAppId = useRef<string>('');
  useEffect(() => {
    if (!application?.id) return;
    if (hydratedToolDraftsForAppId.current === application.id) return;
    hydratedToolDraftsForAppId.current = application.id;

    const drafts = (application as any)?.toolDrafts || {};
    const io = drafts?.interoffice || {};
    const auth = drafts?.authorization || {};
    const isp = drafts?.isp || {};

    setInterofficeNote((prev) => ({
      ...prev,
      recipientIds: Array.isArray(io?.recipientIds) ? io.recipientIds.map(String) : prev.recipientIds,
      priority: (io?.priority as any) || prev.priority,
      message: typeof io?.message === 'string' ? io.message : prev.message,
      followUpDate: typeof io?.followUpDate === 'string' ? io.followUpDate : prev.followUpDate,
    }));
    setAuthorizationUpload((prev) => ({
      ...prev,
      type: typeof auth?.type === 'string' ? auth.type : prev.type,
      startDate: typeof auth?.startDate === 'string' ? auth.startDate : prev.startDate,
      endDate: typeof auth?.endDate === 'string' ? auth.endDate : prev.endDate,
      // Cannot hydrate File objects; user must reselect file after refresh.
      file: null,
    }));
    setIspUpload((prev) => ({
      ...prev,
      planDate: typeof isp?.planDate === 'string' ? isp.planDate : prev.planDate,
      file: null,
    }));
  }, [application?.id]);

  // NOTE: `docRef` is initialized later via `useMemoFirebase`. We declare it here to
  // avoid temporal-dead-zone errors in hooks that reference it.
  let docRef: any = null;

  const toolDraftWriteRef = useRef<string>('');
  useEffect(() => {
    if (!docRef || !firestore) return;
    if (!user?.uid) return;

    const hasInterofficeDraft = Boolean(
      interofficeNote.message.trim() ||
        interofficeNote.recipientIds.length > 0 ||
        String(interofficeNote.followUpDate || '').trim()
    );
    const hasAuthorizationDraft = Boolean(
      String(authorizationUpload.type || '').trim() ||
        String(authorizationUpload.startDate || '').trim() ||
        String(authorizationUpload.endDate || '').trim()
    );
    const hasIspDraft = Boolean(String(ispUpload.planDate || '').trim());

    const nextDrafts = {
      interoffice: hasInterofficeDraft
        ? {
            recipientIds: interofficeNote.recipientIds,
            priority: interofficeNote.priority,
            message: interofficeNote.message,
            followUpDate: interofficeNote.followUpDate || '',
          }
        : null,
      authorization: hasAuthorizationDraft
        ? {
            type: authorizationUpload.type,
            startDate: authorizationUpload.startDate,
            endDate: authorizationUpload.endDate,
          }
        : null,
      isp: hasIspDraft
        ? {
            planDate: ispUpload.planDate,
          }
        : null,
    };

    const snapshot = JSON.stringify(nextDrafts);
    if (snapshot === toolDraftWriteRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        toolDraftWriteRef.current = snapshot;
        const patch: any = {
          toolDraftsUpdatedAt: serverTimestamp(),
          toolDraftsUpdatedByUid: String(user?.uid || '').trim() || null,
          toolDraftsUpdatedByName: String(user?.displayName || user?.email || '').trim() || null,
        };

        // Set or delete sub-drafts explicitly to keep the doc small and avoid stale data.
        patch.toolDrafts = {
          interoffice: nextDrafts.interoffice ?? deleteField(),
          authorization: nextDrafts.authorization ?? deleteField(),
          isp: nextDrafts.isp ?? deleteField(),
        };

        await setDoc(docRef, patch, { merge: true });
      } catch (e) {
        console.warn('Tool draft autosave failed:', e);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    docRef,
    firestore,
    user?.uid,
    user?.displayName,
    user?.email,
    interofficeNote.message,
    interofficeNote.priority,
    interofficeNote.followUpDate,
    interofficeNote.recipientIds,
    authorizationUpload.type,
    authorizationUpload.startDate,
    authorizationUpload.endDate,
    ispUpload.planDate,
  ]);
  
  const [consolidatedUploadChecks, setConsolidatedUploadChecks] = useState<Record<string, boolean>>({
    'Waivers & Authorizations': false,
    'LIC 602A - Physician\'s Report': false,
    'Medicine List': false,
    'SNF Facesheet': false,
    'Declaration of Eligibility': false,
  });

  const [isUpdatingProgression, setIsUpdatingProgression] = useState(false);
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [isUpdatingCaspioStatus, setIsUpdatingCaspioStatus] = useState(false);
  const [isCheckingCaspioStatus, setIsCheckingCaspioStatus] = useState(false);
  const [isUpdatingSocialWorkerHold, setIsUpdatingSocialWorkerHold] = useState(false);
  const [isLoadingSwPortalAssignment, setIsLoadingSwPortalAssignment] = useState(false);
  const [swPortalAssignmentError, setSwPortalAssignmentError] = useState('');
  const [swPortalAssignment, setSwPortalAssignment] = useState<{
    memberId: string;
    kaiserStatus: string;
    assignedSwName: string;
    assignedSwEmail: string;
    assignmentStatus: string;
    eligible: boolean;
  } | null>(null);
  const [swPortalInviteEnabled, setSwPortalInviteEnabled] = useState(false);
  const [isSavingSwPortalInvite, setIsSavingSwPortalInvite] = useState(false);
  const [isUpdatingKaiserAuthorizationMode, setIsUpdatingKaiserAuthorizationMode] = useState(false);
  const [isSendingProofIncomeSocWarning, setIsSendingProofIncomeSocWarning] = useState(false);
  const [isSocWarningPreviewOpen, setIsSocWarningPreviewOpen] = useState(false);
  const [isUpdatingKaiserTierLevel, setIsUpdatingKaiserTierLevel] = useState(false);
  const [isGeneratingRoomBoardPreview, setIsGeneratingRoomBoardPreview] = useState(false);
  const [roomBoardPreview, setRoomBoardPreview] = useState<{
    clientId2?: string;
    memberName?: string;
    mrn?: string | null;
    authorizedRepName?: string;
    authorizedRepEmail?: string;
    rcfeName?: string;
    rcfeSignerEmailDefault?: string;
    mcoAndTier?: string;
    tierLevel?: string;
    assistedLivingDailyRate?: string;
    assistedLivingMonthlyRate?: string;
    agreedRoomBoardAmountDefault?: string;
  } | null>(null);
  const [roomBoardPreviewWarnings, setRoomBoardPreviewWarnings] = useState<string[]>([]);
  const [isSendingRoomBoardInvites, setIsSendingRoomBoardInvites] = useState(false);
  const [isSendingRoomBoardIls, setIsSendingRoomBoardIls] = useState(false);
  const [roomBoardWorkspaceOpen, setRoomBoardWorkspaceOpen] = useState(false);
  const [rcfeSignerEmailInput, setRcfeSignerEmailInput] = useState('');
  const [agreedRoomBoardAmountInput, setAgreedRoomBoardAmountInput] = useState('');
  const [isSendingEligibilityNote, setIsSendingEligibilityNote] = useState(false);
  const [eligibilityNoteSendStatus, setEligibilityNoteSendStatus] = useState<{
    state: 'idle' | 'sending' | 'success' | 'failed' | 'blocked_duplicate';
    message: string;
    atIso?: string;
  }>({ state: 'idle', message: '' });
  const [selectedEligibilityScreenshotIds, setSelectedEligibilityScreenshotIds] = useState<string[]>([]);
  const [eligibilityTemplateSelection, setEligibilityTemplateSelection] = useState<string>('none');
  const [isUpdatingReminderControls, setIsUpdatingReminderControls] = useState(false);
  const [isSendingTestReminder, setIsSendingTestReminder] = useState(false);
  const [isLoadingReminderPreview, setIsLoadingReminderPreview] = useState(false);
  const [reminderPreview, setReminderPreview] = useState<{
    recipientEmail: string;
    referrerName: string;
    memberName: string;
    subject: string;
    missingItems: string[];
  } | null>(null);
  const [isSendingStatusTestReminder, setIsSendingStatusTestReminder] = useState(false);
  const [isConfirmingCaspioPush, setIsConfirmingCaspioPush] = useState(false);
  const [isReversePullPreviewOpen, setIsReversePullPreviewOpen] = useState(false);
  const [isLoadingReversePullPreview, setIsLoadingReversePullPreview] = useState(false);
  const [isApplyingReversePullPreview, setIsApplyingReversePullPreview] = useState(false);
  const [reversePullIncludeOverwrites, setReversePullIncludeOverwrites] = useState(false);
  const [reversePullShowOnlyMissing, setReversePullShowOnlyMissing] = useState(false);
  const [reversePullShowWillUpdateOnly, setReversePullShowWillUpdateOnly] = useState(true);
  const [reversePullConfirmOverwriteOpen, setReversePullConfirmOverwriteOpen] = useState(false);
  const [isRetrievingClientId2Only, setIsRetrievingClientId2Only] = useState(false);
  const [reversePullPreview, setReversePullPreview] = useState<{
    mappingSource: string;
    summary: {
      totalMapped: number;
      missing: number;
      fillEmpty: number;
      overwrite: number;
      unchanged: number;
    };
    preview: {
      items: Array<{
        csField: string;
        targetCsField: string;
        caspioField: string;
        currentValue: string;
        incomingValue: string;
        status: 'missing' | 'fill_empty' | 'overwrite' | 'unchanged';
      }>;
      safePatch: Record<string, string>;
      fullPatch: Record<string, string>;
    };
  } | null>(null);
  const [isLoadingStatusReminderPreview, setIsLoadingStatusReminderPreview] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [statusReminderPreview, setStatusReminderPreview] = useState<{
    recipientEmail: string;
    referrerName: string;
    memberName: string;
    subject: string;
    statusText: string;
    deniedReason: string;
    message: string;
  } | null>(null);
  const [nextStepDateMissing, setNextStepDateMissing] = useState(false);
  const [isSendingFamilyStatusNow, setIsSendingFamilyStatusNow] = useState(false);
  const [rejectingByForm, setRejectingByForm] = useState<Record<string, boolean>>({});
  const [rejectDialogForm, setRejectDialogForm] = useState<string | null>(null);
  const [rejectScopeByForm, setRejectScopeByForm] = useState<Record<string, 'form' | 'info'>>({});
  const [rejectEmailBodyByForm, setRejectEmailBodyByForm] = useState<Record<string, string>>({});
  const [rejectUseSameLinkByForm, setRejectUseSameLinkByForm] = useState<Record<string, boolean>>({});
  const [rejectEmailRecipientByForm, setRejectEmailRecipientByForm] = useState<
    Record<string, 'primary' | 'creator'>
  >({});
  const [resolvedStorageUrls, setResolvedStorageUrls] = useState<Record<string, string>>({});
  const [serverFileOpening, setServerFileOpening] = useState<string | null>(null);
  const emailReminderSectionRef = useRef<HTMLDivElement | null>(null);
  const statusReminderSectionRef = useRef<HTMLDivElement | null>(null);

  const reminderFrequencyOptions = useMemo(() => [7] as const, []);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const staffTestReminderEmail = String(user?.email || '').trim();
  const currentReminderMissingItems = useMemo(() => getReminderMissingItems(application), [application]);
  const documentReminderFrequencyDays = useMemo(() => {
    const raw = Number((application as any)?.documentReminderFrequencyDays);
    if (!Number.isFinite(raw) || raw <= 0) return 7;
    return 7;
  }, [application]);
  const statusReminderFrequencyDays = useMemo(() => {
    const raw = Number((application as any)?.statusReminderFrequencyDays);
    if (!Number.isFinite(raw) || raw <= 0) return 7;
    return 7;
  }, [application]);
  const documentReminderNextAtMs = useMemo(() => {
    const ms = toMillisSafe((application as any)?.documentReminderNextAtMs ?? (application as any)?.documentReminderNextAt);
    return ms > 0 ? ms : 0;
  }, [application]);
  const statusReminderNextAtMs = useMemo(() => {
    const ms = toMillisSafe((application as any)?.statusReminderNextAtMs ?? (application as any)?.statusReminderNextAt);
    return ms > 0 ? ms : 0;
  }, [application]);
  const toDateInputValue = (ms: number): string => {
    if (!ms) return '';
    try {
      return format(new Date(ms), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };
  const fromDateInputToMs = (value: string): number | null => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const parsed = new Date(`${trimmed}T09:00:00`);
    const ms = parsed.getTime();
    return Number.isFinite(ms) ? ms : null;
  };
  const getFrequencyLabel = (days: number): string =>
    days === 7 ? 'weekly' : `every ${days} day${days === 1 ? '' : 's'}`;
  const getNextReminderLabel = (ms: number): string => {
    if (!ms) return 'Not set';
    try {
      return format(new Date(ms), 'MMM d, yyyy');
    } catch {
      return 'Not set';
    }
  };

  useEffect(() => {
    if (quickActionTarget !== 'reminders') return;
    setIsReminderDialogOpen(true);
    const quickActionsCard = document.getElementById('member-quick-actions');
    quickActionsCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [quickActionTarget]);

  useEffect(() => {
    if (!focusRequirementTarget || isLoading) return;
    const timer = window.setTimeout(() => {
      const targetCard = document.getElementById(`requirement-card-${focusRequirementTarget}`);
      targetCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusRequirementTarget, isLoading, application?.id]);

  useEffect(() => {
    if (!isReminderDialogOpen) return;
    if (reminderTabTarget !== 'email' && reminderTabTarget !== 'status') return;
    const targetRef = reminderTabTarget === 'status' ? statusReminderSectionRef : emailReminderSectionRef;
    const timer = window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isReminderDialogOpen, reminderTabTarget]);

  const updateReminderSettings = async (patch: Record<string, any>) => {
    if (!application?.id) return;
    setIsUpdatingReminderControls(true);
    try {
      const res = await fetch('/api/admin/update-notification-settings', {
        method: 'POST',
        headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          ...patch,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to update reminder settings');
      }
      setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as any) : prev));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to update reminder settings.',
      });
    } finally {
      setIsUpdatingReminderControls(false);
    }
  };

  const [isUpdatingFirstContactAck, setIsUpdatingFirstContactAck] = useState(false);
  const updateFirstContactAck = async (patch: { firstContactAcknowledged?: boolean }) => {
    if (!docRef || !application?.id) return;
    if (!isUserAssignedStaffForApp(application as any, currentUserId)) {
      const assignedName = String((application as any)?.assignedStaffName || '').trim();
      toast({
        variant: 'destructive',
        title: 'Not assigned staff',
        description: assignedName
          ? `Only ${assignedName} can acknowledge this assignment.`
          : 'Only the assigned staff member can acknowledge this assignment.',
      });
      return;
    }
    setIsUpdatingFirstContactAck(true);
    try {
      const nowIso = new Date().toISOString();
      const actorName =
        String(user?.displayName || '').trim() ||
        String(adminUser?.displayName || '').trim() ||
        String(user?.email || adminUser?.email || 'Staff').trim();
      const actorUid = String(user?.uid || adminUser?.uid || '').trim() || null;
      const next: Record<string, any> = { lastUpdated: serverTimestamp() };
      if (typeof patch.firstContactAcknowledged === 'boolean') {
        next.firstContactAcknowledged = patch.firstContactAcknowledged;
        next.firstContactAcknowledgedAt = patch.firstContactAcknowledged ? nowIso : null;
        next.firstContactAcknowledgedBy = patch.firstContactAcknowledged ? actorName : null;
        next.firstContactAcknowledgedByUid = patch.firstContactAcknowledged ? actorUid : null;
      }
      await setDoc(docRef, next, { merge: true });
      setApplication((prev) => (prev ? ({ ...(prev as any), ...next, lastUpdated: nowIso } as any) : prev));
      toast({
        title: 'Assignment acknowledgement updated',
        description: next.firstContactAcknowledged
          ? 'Assignment acknowledged. Daily first-contact reminders will stop for this member.'
          : 'Acknowledgement cleared. This member can appear on daily reminder emails again.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update assignment acknowledgement.',
      });
    } finally {
      setIsUpdatingFirstContactAck(false);
    }
  };

  const loadTestMissingDocsPreview = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
      return;
    }
    setIsLoadingReminderPreview(true);
    try {
      const response = await fetch('/api/admin/send-document-reminder', {
        method: 'POST',
        headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          overrideEmail: staffTestReminderEmail,
          previewOnly: true,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to load reminder preview');
      }
      setReminderPreview({
        recipientEmail: String(result.recipientEmail || staffTestReminderEmail),
        referrerName: String(result.referrerName || 'there'),
        memberName: String(result.memberName || 'CalAIM Member'),
        subject: String(result.subject || 'Missing Documents Reminder'),
        missingItems: Array.isArray(result.missingItems) ? result.missingItems : [],
      });
    } catch (error: any) {
      setReminderPreview(null);
      toast({
        variant: 'destructive',
        title: 'Preview Failed',
        description: error?.message || 'Could not load reminder preview.',
      });
    } finally {
      setIsLoadingReminderPreview(false);
    }
  };

  const sendTestMissingDocsReminder = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
      return;
    }
    setIsSendingTestReminder(true);
    try {
      const response = await fetch('/api/admin/send-document-reminder', {
        method: 'POST',
        headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          overrideEmail: staffTestReminderEmail,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to send test reminder');
      }
      toast({
        title: 'Test Reminder Sent',
        description: `Email sent to ${staffTestReminderEmail}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error?.message || 'Could not send test reminder.',
      });
    } finally {
      setIsSendingTestReminder(false);
    }
  };

  const loadTestStatusReminderPreview = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
      return;
    }
    if (!familyStatusProgressValue) {
      toast({
        variant: 'destructive',
        title: 'Status required',
        description: 'Select Application progress before previewing status reminder.',
      });
      return;
    }
    if (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denied reason before previewing this status update.',
      });
      return;
    }
    setIsLoadingStatusReminderPreview(true);
    try {
      const response = await fetch('/api/admin/send-family-status-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          statusValue: familyStatusProgressValue,
          deniedReason: familyStatusDeniedReason,
          trigger: 'manual',
          sentByUid: String(user?.uid || ''),
          sentByName: String(user?.displayName || user?.email || 'The Connections Team'),
          overrideEmail: staffTestReminderEmail,
          previewOnly: true,
          testOnly: true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || result?.message || 'Failed to load status reminder preview');
      }
      setStatusReminderPreview({
        recipientEmail: String(result?.recipientEmail || staffTestReminderEmail),
        referrerName: String(result?.referrerName || 'there'),
        memberName: String(result?.memberName || 'CalAIM Member'),
        subject: String(result?.subject || 'Application progress update'),
        statusText: String(result?.statusText || familyStatusProgressValue),
        deniedReason: String(result?.deniedReason || ''),
        message: String(result?.message || ''),
      });
    } catch (error: any) {
      setStatusReminderPreview(null);
      toast({
        variant: 'destructive',
        title: 'Preview Failed',
        description: error?.message || 'Could not load status reminder preview.',
      });
    } finally {
      setIsLoadingStatusReminderPreview(false);
    }
  };

  const sendTestStatusReminder = async () => {
    if (!staffTestReminderEmail || !application?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Staff email is required.' });
      return;
    }
    if (!familyStatusProgressValue) {
      toast({
        variant: 'destructive',
        title: 'Status required',
        description: 'Select Application progress before sending status reminder test.',
      });
      return;
    }
    if (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denied reason before sending this status update test.',
      });
      return;
    }
    setIsSendingStatusTestReminder(true);
    try {
      const response = await fetch('/api/admin/send-family-status-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          statusValue: familyStatusProgressValue,
          deniedReason: familyStatusDeniedReason,
          trigger: 'manual',
          sentByUid: String(user?.uid || ''),
          sentByName: String(user?.displayName || user?.email || 'The Connections Team'),
          overrideEmail: staffTestReminderEmail,
          testOnly: true,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || result?.message || 'Failed to send status reminder test');
      }
      toast({
        title: 'Status reminder test sent',
        description: `Email sent to ${staffTestReminderEmail}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error?.message || 'Could not send status reminder test.',
      });
    } finally {
      setIsSendingStatusTestReminder(false);
    }
  };
  const sendFamilyStatusUpdateEmail = async (
    statusValue: string,
    deniedReason?: string,
    trigger: 'auto' | 'manual' = 'auto'
  ) => {
    if (!application?.id) return;
    try {
      const response = await fetch('/api/admin/send-family-status-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: application.id,
          userId: (application as any)?.userId || null,
          statusValue,
          deniedReason: String(deniedReason || ''),
          trigger,
          sentByUid: String(user?.uid || ''),
          sentByName: String(user?.displayName || user?.email || 'The Connections Team'),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || result?.message || 'Failed to send status reminder');
      }
      if (result?.skippedDisabled) {
        return;
      }
      if (result?.skippedDueToDedupe) {
        if (trigger === 'manual') {
          toast({
            title: 'Recently sent',
            description: 'Same status update was sent recently. Try again in a few minutes.',
          });
        }
        return;
      }
      setApplication((prev) =>
        prev
          ? ({
              ...(prev as any),
              familyStatusLastEmail: result?.lastEmail || (prev as any)?.familyStatusLastEmail,
              familyStatusReminderHistory: result?.history || (prev as any)?.familyStatusReminderHistory,
            } as any)
          : prev
      );
      const noteSync = result?.noteSync && typeof result.noteSync === 'object' ? (result.noteSync as any) : null;
      toast({
        title: 'Status reminder sent',
        description:
          noteSync?.success
            ? `Family update sent and note pushed to Caspio for ${String((application as any)?.bestContactEmail || '').trim() || 'recipient'}.`
            : `Family update sent to ${String((application as any)?.bestContactEmail || '').trim() || 'recipient'}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      if (noteSync && !noteSync.success) {
        const reason = String(noteSync?.reason || '').trim();
        const details = String(noteSync?.error || '').trim();
        toast({
          variant: 'destructive',
          title: 'Caspio note sync failed',
          description:
            reason === 'missing-client-id2'
              ? 'Email was sent, but Caspio notes were not updated because Client_ID2 is missing.'
              : details || 'Email was sent, but Caspio notes could not be updated.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Status reminder failed',
        description: error?.message || 'Could not send family status reminder.',
      });
    }
  };

  const handleFamilyStatusProgressChange = async (value: string) => {
    if (!isKaiserPlan && value === alfaVisitCompleteStatusLabel) {
      toast({
        variant: 'destructive',
        title: 'Kaiser only status',
        description: 'ALFA visit complete status is only available for Kaiser members.',
      });
      return;
    }
    const previousStatus = familyStatusProgressValue;
    if (value === 'none') {
      await updateReminderSettings({
        familyStatusProgress: '',
        familyStatusDeniedReason: '',
      });
      return;
    }

    const needsDeniedReason = /authorization denied/i.test(value);
    const existingReason = needsDeniedReason ? familyStatusDeniedReason : '';
    if (needsDeniedReason && !String(existingReason || '').trim()) {
      setApplication((prev) =>
        prev ? ({ ...(prev as any), familyStatusProgress: value } as any) : prev
      );
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denial reason before saving Authorization Denied.',
      });
      return;
    }
    await updateReminderSettings({
      familyStatusProgress: value,
      familyStatusDeniedReason: needsDeniedReason ? existingReason : '',
    });

    // Pathway RN visit statuses → Caspio client notes (same table as note updates).
    try {
      const normalizedStatus = String(value || '').trim().toLowerCase();
      const isRnScheduled =
        normalizedStatus.includes('visit scheduled') || normalizedStatus === 'rn/msw scheduled';
      const isRnSubmitted =
        normalizedStatus.includes('visit complete') ||
        normalizedStatus.includes('visit submitted') ||
        normalizedStatus === 'rn isp complete';
      if ((isRnScheduled || isRnSubmitted) && user) {
        const idToken = await user.getIdToken();
        const clientId2 = String(
          (application as any)?.clientId2 ||
            (application as any)?.client_ID2 ||
            (application as any)?.caspioClientId2 ||
            ''
        ).trim();
        void fetch('/api/admin/caspio/append-rn-visit-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            applicationId: application?.id,
            clientId2: clientId2 || undefined,
            event: isRnScheduled ? 'rn_visit_scheduled' : 'rn_visit_submitted',
            statusLabel: value,
          }),
        }).catch(() => null);
      }
    } catch {
      // best-effort Caspio note
    }

    if (Boolean((application as any)?.statusRemindersEnabled) !== true) return;
    if (value === previousStatus) return;
    if (needsDeniedReason && !String(existingReason || '').trim()) {
      return;
    }
    await sendFamilyStatusUpdateEmail(value, existingReason);
  };

  const handleFamilyDeniedReasonBlur = async (value: string) => {
    await updateReminderSettings({
      familyStatusProgress: familyStatusProgressValue,
      familyStatusDeniedReason: value,
    });
    if (Boolean((application as any)?.statusRemindersEnabled) !== true) return;
    if (!familyProgressNeedsDeniedReason || !familyStatusProgressValue) return;
    if (!String(value || '').trim()) return;
    await sendFamilyStatusUpdateEmail(familyStatusProgressValue, value);
  };
  const handleManualFamilyStatusSend = async () => {
    if (!familyStatusProgressValue) return;
    if (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Denied reason required',
        description: 'Enter a denial reason before sending Authorization Denied.',
      });
      return;
    }
    setIsSendingFamilyStatusNow(true);
    try {
      await sendFamilyStatusUpdateEmail(familyStatusProgressValue, familyStatusDeniedReason, 'manual');
    } finally {
      setIsSendingFamilyStatusNow(false);
    }
  };
  const ensureAdminClaim = async () => {
    if (!user) return;
    try {
      const tokenResult = await user.getIdTokenResult();
      const hasAdminClaim = Boolean((tokenResult?.claims as any)?.admin);
      if (hasAdminClaim) return;

      const idToken = await user.getIdToken();
      await fetch('/api/auth/admin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      await user.getIdToken(true);
    } catch (error) {
      console.warn('Failed to refresh admin claims:', error);
    }
  };

  docRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId) return null;
    const isAdminStored = applicationId.startsWith('admin_app_') || !appUserId;
    if (isAdminStored) {
      return doc(firestore, 'applications', applicationId);
    }
    return doc(firestore, `users/${appUserId}/applications`, applicationId);
  }, [firestore, applicationId, appUserId, isUserLoading]);

  const staffTrackerRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId || !appUserId) return null;
    return doc(firestore, `users/${appUserId}/applications/${applicationId}/staffTrackers`, applicationId);
  }, [firestore, applicationId, appUserId, isUserLoading]);

  const { data: staffTracker } = useDoc<StaffTracker>(staffTrackerRef);

  const assignedStaffSettingsRef = useMemoFirebase(() => {
    const staffId = String((application as any)?.assignedStaffId || '').trim();
    if (isUserLoading || !firestore || !staffId) return null;
    return doc(firestore, 'users', staffId);
  }, [firestore, isUserLoading, (application as any)?.assignedStaffId]);

  const { data: assignedStaffSettings } = useDoc<any>(assignedStaffSettingsRef);
  // NOTE: next step date is now mandatory whenever a next step is assigned.
  // We still load staff settings in case you want to re-enable conditional behavior later.

  const nextStepDateInputValue = useMemo(() => {
    try {
      const raw: any = (staffTracker as any)?.nextStepDate;
      const d: Date | null = raw?.toDate?.() || (raw ? new Date(raw) : null);
      const ms = d?.getTime?.();
      if (!ms || Number.isNaN(ms)) return '';
      const yyyy = String(d!.getFullYear());
      const mm = String(d!.getMonth() + 1).padStart(2, '0');
      const dd = String(d!.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return '';
    }
  }, [staffTracker]);

  const NEXT_STEP_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'none', label: '— None —' },
    { value: 'contact-referrer', label: 'Contact referrer' },
    { value: 'review-documents', label: 'Review documents' },
    { value: 'schedule-isp', label: 'Schedule ISP' },
    { value: 'other', label: 'Other' },
  ];

  const planLower = String((application as any)?.healthPlan || '').toLowerCase();
  const hasKaiserAuthorizationSignals =
    Boolean(String((application as any)?.kaiserAuthorizationMode || '').trim()) ||
    Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
    String((application as any)?.status || '').trim().toLowerCase() === 'authorization received (doc collection)';
  const isKaiserPlan = planLower.includes('kaiser') || hasKaiserAuthorizationSignals;
  const isHealthNetPlan =
    planLower.includes('health net') ||
    planLower.includes('healthnet') ||
    planLower === 'hn';
  const prePushKaiserStatusOptions = [
    'T2038 Received, Need First Contact',
    'T2038 Received, doc collection',
    'T2038, Not Requested, Doc Collection',
    'T2038 Requested',
    KAISER_NOT_INTERESTED_STATUS,
  ] as const;
  const prePushKaiserStatusTokens = new Set<string>(prePushKaiserStatusOptions.map((s) => normalizeStatusToken(s)));
  const laterKaiserStatusOptions = KAISER_STATUS_PROGRESSION.filter((s) => s.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.status)
    .filter((status) => !prePushKaiserStatusTokens.has(normalizeStatusToken(status)));
  const isDraftLikeApplication =
    String((application as any)?.status || '').trim().toLowerCase() === 'draft' ||
    Boolean((application as any)?.createdByAdmin);
  const [isSavingPathway, setIsSavingPathway] = useState(false);
  const handleSetPathway = async (nextPathway: 'SNF Transition' | 'SNF Diversion') => {
    if (!docRef || isSavingPathway) return;
    if (String((application as any)?.pathway || '').trim() === nextPathway) return;
    setIsSavingPathway(true);
    try {
      await setDoc(
        docRef,
        {
          pathway: nextPathway,
          pathwaySetAtIso: new Date().toISOString(),
          pathwaySetBy: String(user?.displayName || user?.email || '').trim() || null,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      toast({ title: 'Pathway updated', description: `Set to ${nextPathway}.` });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save pathway',
        description: String(error?.message || 'Please try again.'),
      });
    } finally {
      setIsSavingPathway(false);
    }
  };
  const adminIntakeNotes = enrichSingleAuthAdminNotesFromApplication(
    String((application as any)?.adminNotes || '').trim(),
    application as any
  );
  const originalNotesPushedToCaspio = resolveOriginalNotesPushedToCaspio(application as any);
  const laterNotesPushedToCaspio = resolveLaterNotesPushedToCaspio(application as any);
  const notesAlreadyPushedToCaspio = Boolean(
    (application as any)?.caspioNotesLastPushedAt ||
      (application as any)?.caspioSent ||
      originalNotesPushedToCaspio
  );
  const showPrePushNotesSection = isKaiserPlan || isHealthNetPlan;
  const showDraftKaiserStatusSection = isDraftLikeApplication && isKaiserPlan;
  const showManualKaiserStatusSection = isKaiserPlan;
  const showKaiserAuthorizationTypeCard = isKaiserPlan || isDraftLikeApplication;
  const swPortalInviteSentAtLabel = (() => {
    const ms = toMillisSafe((application as any)?.swPortalInviteSentAt);
    if (!ms) return '';
    try {
      return format(new Date(ms), 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  })();
  const alftAssignmentStatusLabel = isLoadingSwPortalAssignment
    ? 'Loading...'
    : String(swPortalAssignment?.assignmentStatus || '').trim() || 'Not assigned';
  const hasAlftAssignmentStatus = !isLoadingSwPortalAssignment && Boolean(String(swPortalAssignment?.assignmentStatus || '').trim());
  const memberPortalUserId = useMemo(() => {
    const fromQuery = String(appUserId || '').trim();
    if (fromQuery) return fromQuery;
    return String((application as any)?.userId || '').trim();
  }, [appUserId, (application as any)?.userId]);
  const memberPortalUidCandidates = useMemo(() => {
    const uids = new Set<string>();
    const add = (value: unknown) => {
      const uid = String(value || '').trim();
      if (uid) uids.add(uid);
    };
    add(memberPortalUserId);
    add(appUserId);
    add((application as any)?.userId);
    const linked = (application as any)?.portalLinkedUids;
    if (Array.isArray(linked)) linked.forEach(add);
    return Array.from(uids).slice(0, 10);
  }, [memberPortalUserId, appUserId, application]);
  const memberPortalEmailCandidates = useMemo(() => {
    const emails = new Set<string>();
    const add = (value: unknown) => {
      const email = String(value || '').trim().toLowerCase();
      if (email && email.includes('@')) emails.add(email);
    };
    add((application as any)?.linkedToFamilyEmail);
    add((application as any)?.bestContactEmail);
    add((application as any)?.referrerEmail);
    const authorized = (application as any)?.portalAuthorizedEmails;
    if (Array.isArray(authorized)) authorized.forEach(add);
    const people = (application as any)?.portalAccessPeople;
    if (Array.isArray(people)) {
      people.forEach((person: any) => add(person?.email));
    }
    const linkedEmails = (application as any)?.portalLinkedEmails;
    if (Array.isArray(linkedEmails)) linkedEmails.forEach(add);
    return Array.from(emails).slice(0, 10);
  }, [application]);
  const familyPortalAccessSummary = useMemo(() => {
    const linkedEmail = String((application as any)?.linkedToFamilyEmail || '').trim();
    const linkedAtMs = toMillisSafe((application as any)?.linkedToFamilyAt);
    const hasLinkedAccount =
      Boolean(memberPortalUserId) ||
      memberPortalUidCandidates.length > 0 ||
      memberPortalEmailCandidates.length > 0 ||
      Boolean(linkedEmail) ||
      linkedAtMs > 0;

    const entryMs = (entry: MemberPortalLoginEntry) =>
      toMillisSafe(entry.timestamp) || toMillisSafe(entry.createdAt);

    const successfulLogins = memberPortalLoginLog
      .filter((entry) => entry.success !== false)
      .slice()
      .sort((a, b) => entryMs(a) - entryMs(b));
    const firstSuccessfulLogin = successfulLogins[0] || null;
    const latestSuccessfulLogin =
      successfulLogins.length > 0 ? successfulLogins[successfulLogins.length - 1] : null;
    const latestAnyLogin = memberPortalLoginLog[0] || null;

    const firstLoginMs = firstSuccessfulLogin ? entryMs(firstSuccessfulLogin) : 0;
    const lastSuccessMs = latestSuccessfulLogin ? entryMs(latestSuccessfulLogin) : 0;
    const lastAnyMs = latestAnyLogin ? entryMs(latestAnyLogin) : 0;
    const hasPortalLogin = lastSuccessMs > 0 || lastAnyMs > 0 || firstLoginMs > 0;

    const status = String((application as any)?.status || '').trim();
    const statusLooksSubmitted = /completed\s*&\s*submitted|^approved$/i.test(status);
    const forms = Array.isArray((application as any)?.forms)
      ? (((application as any).forms as any[]) || [])
      : [];
    const formCompletionMs = forms.reduce((max, form) => {
      const formStatus = String(form?.status || '').trim().toLowerCase();
      if (formStatus !== 'completed') return max;
      const ms = Math.max(
        toMillisSafe(form?.dateCompleted),
        toMillisSafe(form?.uploadedAt),
        toMillisSafe(form?.completedAt)
      );
      return ms > max ? ms : max;
    }, 0);
    const submittedMs = Math.max(
      toMillisSafe((application as any)?.submittedAt),
      toMillisSafe((application as any)?.dateSubmitted),
      toMillisSafe((application as any)?.applicationSubmittedAt),
      toMillisSafe((application as any)?.completedAt),
      toMillisSafe((application as any)?.statusChangedAt),
      toMillisSafe((application as any)?.csSummaryCompletedAt),
      formCompletionMs
    );

    const activityItems: PortalActivityItem[] = [];

    if (firstLoginMs > 0) {
      activityItems.push({
        id: `first-login-${firstSuccessfulLogin?.id || firstLoginMs}`,
        kind: 'first_login',
        label: 'First portal login',
        atMs: firstLoginMs,
        detail:
          String(firstSuccessfulLogin?.userEmail || firstSuccessfulLogin?.userName || '').trim() ||
          undefined,
      });
    }
    if (submittedMs > 0) {
      activityItems.push({
        id: `submitted-${submittedMs}`,
        kind: 'submitted',
        label: statusLooksSubmitted
          ? `Application submitted (${status})`
          : 'Application activity / forms submitted',
        atMs: submittedMs,
        detail: status || undefined,
      });
    } else if (statusLooksSubmitted) {
      activityItems.push({
        id: `submitted-status-only`,
        kind: 'submitted',
        label: `Application submitted (${status})`,
        atMs: 0,
        detail: 'Submission timestamp not recorded',
      });
    }

    successfulLogins.forEach((entry, index) => {
      if (index === 0) return;
      const ms = entryMs(entry);
      if (!ms) return;
      activityItems.push({
        id: `login-${entry.id}`,
        kind: 'login',
        label: 'Subsequent login',
        atMs: ms,
        detail: String(entry.userEmail || entry.userName || '').trim() || undefined,
      });
    });

    memberPortalLoginLog
      .filter((entry) => entry.success === false)
      .forEach((entry) => {
        const ms = entryMs(entry);
        if (!ms) return;
        activityItems.push({
          id: `fail-${entry.id}`,
          kind: 'login_failed',
          label: 'Failed sign-in attempt',
          atMs: ms,
          detail: String(entry.failureReason || entry.userEmail || '').trim() || undefined,
        });
      });

    forms.forEach((form, idx) => {
      const formStatus = String(form?.status || '').trim().toLowerCase();
      if (formStatus !== 'completed') return;
      const formName = String(form?.name || 'Form').trim() || 'Form';
      const uploads = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
      if (uploads.length > 0) {
        uploads.forEach((upload: any, uploadIdx: number) => {
          const ms = Math.max(
            toMillisSafe(upload?.uploadedAtIso),
            toMillisSafe(upload?.uploadedAt),
            toMillisSafe(form?.dateCompleted),
            toMillisSafe(form?.uploadedAt)
          );
          if (!ms) return;
          const by = String(
            upload?.uploadedByName ||
              upload?.uploadedByEmail ||
              form?.uploadedByName ||
              form?.uploadedByEmail ||
              ''
          ).trim();
          activityItems.push({
            id: `upload-${idx}-${uploadIdx}-${ms}`,
            kind: 'upload',
            label: `Document uploaded: ${formName}`,
            atMs: ms,
            detail: by || String(upload?.fileName || '').trim() || undefined,
          });
        });
      } else {
        const ms = Math.max(toMillisSafe(form?.dateCompleted), toMillisSafe(form?.uploadedAt));
        if (!ms) return;
        activityItems.push({
          id: `form-${idx}-${ms}`,
          kind: 'form',
          label: `Form completed: ${formName}`,
          atMs: ms,
          detail: String(form?.uploadedByName || form?.uploadedByEmail || '').trim() || undefined,
        });
      }
    });

    activityItems.sort((a, b) => {
      if (!a.atMs && b.atMs) return 1;
      if (a.atMs && !b.atMs) return -1;
      return a.atMs - b.atMs || a.label.localeCompare(b.label);
    });
    const lastActivityMs = activityItems.reduce(
      (max, item) => (item.atMs > max ? item.atMs : max),
      0
    );

    const formatLabel = (ms: number) => (ms > 0 ? format(new Date(ms), 'MMM d, yyyy h:mm a') : '');
    const accessed = hasLinkedAccount || hasPortalLogin || submittedMs > 0 || statusLooksSubmitted || activityItems.length > 0;
    const lastLoginLabel = formatLabel(lastSuccessMs);
    const firstLoginLabel = formatLabel(firstLoginMs);
    const submittedLabel =
      formatLabel(submittedMs) || (statusLooksSubmitted ? status || 'Submitted' : '');
    const lastActivityLabel = formatLabel(lastActivityMs || lastAnyMs);
    const lastAttemptLabel = formatLabel(lastAnyMs);
    const lastAttemptSuccess = latestAnyLogin ? latestAnyLogin.success !== false : null;
    const linkedAtLabel = linkedAtMs ? format(new Date(linkedAtMs), 'MMM d, yyyy h:mm a') : '';
    const contactLabel =
      linkedEmail ||
      String(latestSuccessfulLogin?.userEmail || latestAnyLogin?.userEmail || '').trim() ||
      memberPortalEmailCandidates[0] ||
      String((application as any)?.bestContactEmail || '').trim() ||
      '';
    const successCount = memberPortalLoginLog.filter((entry) => entry.success !== false).length;
    const failedCount = memberPortalLoginLog.filter((entry) => entry.success === false).length;
    const subsequentLoginCount = Math.max(0, successfulLogins.length - (firstLoginMs > 0 ? 1 : 0));

    return {
      accessed,
      hasPortalLogin,
      hasLinkedAccount,
      firstLoginLabel,
      submittedLabel,
      lastActivityLabel,
      lastLoginLabel,
      lastAttemptLabel,
      lastAttemptSuccess,
      linkedAtLabel,
      contactLabel,
      successCount,
      failedCount,
      subsequentLoginCount,
      totalAttempts: memberPortalLoginLog.length,
      activityItems,
      isLoadingLog:
        (memberPortalUidCandidates.length > 0 || memberPortalEmailCandidates.length > 0) &&
        isLoadingMemberPortalLoginLog,
    };
  }, [
    application,
    memberPortalUserId,
    memberPortalUidCandidates,
    memberPortalEmailCandidates,
    memberPortalLoginLog,
    isLoadingMemberPortalLoginLog,
  ]);

  useEffect(() => {
    setSwPortalInviteEnabled(Boolean((application as any)?.swPortalInviteEnabled));
  }, [(application as any)?.swPortalInviteEnabled]);

  useEffect(() => {
    if (!firestore || !application || !isKaiserPlan) {
      setAlftCompletionFileEntries([]);
      return;
    }

    const memberMrn = String((application as any)?.memberMrn || '').trim();
    const memberMediCalNum = String((application as any)?.memberMediCalNum || '').trim();
    const memberFirstName = String((application as any)?.memberFirstName || '').trim().toLowerCase();
    const memberLastName = String((application as any)?.memberLastName || '').trim().toLowerCase();

    const identifiers = Array.from(new Set([memberMrn, memberMediCalNum].map((v) => v.trim()).filter(Boolean)));
    if (identifiers.length === 0) {
      setAlftCompletionFileEntries([]);
      return;
    }

    const toIso = (value: unknown): string => {
      if (!value) return '';
      try {
        if (typeof (value as any)?.toDate === 'function') {
          return (value as any).toDate().toISOString();
        }
        if (typeof (value as any)?.seconds === 'number') {
          return new Date((value as any).seconds * 1000).toISOString();
        }
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
      } catch {
        return '';
      }
    };

    let cancelled = false;

    const run = async () => {
      try {
        const byId = new Map<string, any>();
        const lookups: Array<Promise<void>> = [];

        identifiers.forEach((identifier) => {
          lookups.push(
            getDocs(
              query(
                collection(firestore, 'standalone_upload_submissions'),
                where('medicalRecordNumber', '==', identifier),
                limit(40)
              )
            ).then((snap) => {
              snap.docs.forEach((d) => byId.set(d.id, d.data()));
            })
          );
          lookups.push(
            getDocs(
              query(
                collection(firestore, 'standalone_upload_submissions'),
                where('kaiserMrn', '==', identifier),
                limit(40)
              )
            ).then((snap) => {
              snap.docs.forEach((d) => byId.set(d.id, d.data()));
            })
          );
        });

        await Promise.all(lookups);

        const entries = Array.from(byId.entries())
          .flatMap(([docId, row]) => {
            const toolCode = String(row?.toolCode || '').trim().toLowerCase();
            const documentType = String(row?.documentType || '').trim().toLowerCase();
            if (toolCode !== 'alft' && !documentType.includes('alft')) return [];

            const rowFirst = String(row?.memberFirstName || '').trim().toLowerCase();
            const rowLast = String(row?.memberLastName || '').trim().toLowerCase();
            if (memberFirstName && rowFirst && memberFirstName !== rowFirst) return [];
            if (memberLastName && rowLast && memberLastName !== rowLast) return [];

            const packetPath = String(row?.alftSignature?.packetPdfStoragePath || '').trim();
            const signaturePagePath = String(row?.alftSignature?.signaturePagePdfStoragePath || '').trim();
            const completedAtIso = toIso(row?.alftSignature?.completedAt || row?.updatedAt || row?.createdAt);
            const displayMemberName =
              `${String(row?.memberFirstName || '').trim()} ${String(row?.memberLastName || '').trim()}`.trim() ||
              String(row?.memberName || '').trim() ||
              `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() ||
              'Member';

            const out: Array<{
              id: string;
              category: string;
              documentName: string;
              fileName: string;
              downloadURL: string;
              filePath: string;
              uploadedAtIso: string;
            }> = [];
            if (packetPath) {
              out.push({
                id: `alft-completed-packet-${docId}`,
                category: 'ALFT completion',
                documentName: 'ALFT Packet (Signed)',
                fileName: `${displayMemberName} - ALFT Packet (Signed).pdf`,
                downloadURL: '',
                filePath: packetPath,
                uploadedAtIso: completedAtIso,
              });
            }
            if (signaturePagePath) {
              out.push({
                id: `alft-completed-signature-${docId}`,
                category: 'ALFT completion',
                documentName: 'ALFT Signature Page',
                fileName: `${displayMemberName} - ALFT Signature Page.pdf`,
                downloadURL: '',
                filePath: signaturePagePath,
                uploadedAtIso: completedAtIso,
              });
            }
            return out;
          })
          .sort((a, b) => {
            const aMs = a.uploadedAtIso ? new Date(a.uploadedAtIso).getTime() : 0;
            const bMs = b.uploadedAtIso ? new Date(b.uploadedAtIso).getTime() : 0;
            return bMs - aMs;
          });

        if (!cancelled) setAlftCompletionFileEntries(entries);
      } catch (error) {
        console.warn('Failed to load ALFT completion files:', error);
        if (!cancelled) setAlftCompletionFileEntries([]);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    firestore,
    isKaiserPlan,
    application?.id,
    (application as any)?.memberMrn,
    (application as any)?.memberMediCalNum,
    (application as any)?.memberFirstName,
    (application as any)?.memberLastName,
  ]);

  useEffect(() => {
    if (!isKaiserPlan || !application) {
      setSwPortalAssignment(null);
      setSwPortalAssignmentError('');
      setIsLoadingSwPortalAssignment(false);
      return;
    }

    const memberMrn = String((application as any)?.memberMrn || '').trim();
    const memberMediCalNum = String((application as any)?.memberMediCalNum || '').trim();
    const memberClientId2 = String((application as any)?.clientId2 || (application as any)?.client_ID2 || '').trim();
    const memberFirstName = String((application as any)?.memberFirstName || '').trim();
    const memberLastName = String((application as any)?.memberLastName || '').trim();

    if (!memberMrn && !memberMediCalNum && !memberClientId2) {
      setSwPortalAssignment(null);
      setSwPortalAssignmentError('Missing member identifiers for social worker lookup.');
      setIsLoadingSwPortalAssignment(false);
      return;
    }

    let cancelled = false;
    setIsLoadingSwPortalAssignment(true);
    setSwPortalAssignmentError('');

    const params = new URLSearchParams({
      memberMrn,
      memberMediCalNum,
      memberClientId2,
      memberFirstName,
      memberLastName,
    });

    firebaseAuthHeaders()
      .then((headers) => fetch(`/api/pathway/sw-assignment?${params.toString()}`, { cache: 'no-store', headers }))
      .then(async (res) => {
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to load social worker assignment.');
        }
        if (cancelled) return;
        if (!data?.found) {
          setSwPortalAssignment(null);
          setSwPortalAssignmentError('No RN Visit Needed social worker assignment found yet.');
          return;
        }
        setSwPortalAssignment({
          memberId: String(data?.memberId || '').trim(),
          kaiserStatus: String(data?.kaiserStatus || '').trim(),
          assignedSwName: String(data?.assignedSwName || '').trim(),
          assignedSwEmail: String(data?.assignedSwEmail || '').trim().toLowerCase(),
          assignmentStatus: String(data?.assignmentStatus || '').trim(),
          eligible: Boolean(data?.eligible),
        });
      })
      .catch((error: any) => {
        if (cancelled) return;
        setSwPortalAssignment(null);
        setSwPortalAssignmentError(String(error?.message || 'Failed to load social worker assignment.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSwPortalAssignment(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    application?.id,
    (application as any)?.memberMrn,
    (application as any)?.memberMediCalNum,
    (application as any)?.clientId2,
    (application as any)?.client_ID2,
    (application as any)?.memberFirstName,
    (application as any)?.memberLastName,
    isKaiserPlan,
  ]);

  useEffect(() => {
    const existing = String((application as any)?.preAssessmentCareNeedsNotes || '').trim();
    const originalIlsNotesAlreadyPushed = Boolean(
      (application as any)?.caspioNotesLastPushedAt || (application as any)?.caspioSent
    );
    const merged = (() => {
      if (originalIlsNotesAlreadyPushed) {
        const cleanedExisting = stripOriginalIlsImportNotes(existing);
        if (cleanedExisting) return cleanedExisting;
        if (looksLikeOriginalIlsImportNotes(adminIntakeNotes)) return cleanedExisting || '';
        return stripOriginalIlsImportNotes(adminIntakeNotes);
      }
      if (existing && adminIntakeNotes) {
        return dedupeIlsNotesBlocks(mergeNotesAvoidingIlsDuplicate(existing, adminIntakeNotes));
      }
      return dedupeIlsNotesBlocks(existing || adminIntakeNotes);
    })();
    setPrePushNotesDraft(merged);
    setPrePushNotesAutosaveState('idle');
  }, [
    application?.id,
    (application as any)?.preAssessmentCareNeedsNotes,
    (application as any)?.caspioNotesLastPushedAt,
    (application as any)?.caspioSent,
    adminIntakeNotes,
  ]);

  useEffect(() => {
    if (!showPrePushNotesSection || !docRef || !application) return;
    const normalizedDraft = String(prePushNotesDraft || '').trim();
    const existing = String((application as any)?.preAssessmentCareNeedsNotes || '').trim();
    if (normalizedDraft === existing) {
      if (prePushNotesAutosaveState === 'saving') setPrePushNotesAutosaveState('saved');
      return;
    }
    setPrePushNotesAutosaveState('saving');
    const timeout = setTimeout(() => {
      void savePrePushNotes({ silent: true, value: prePushNotesDraft });
    }, 900);
    return () => clearTimeout(timeout);
  }, [
    showPrePushNotesSection,
    docRef,
    application,
    prePushNotesDraft,
    (application as any)?.preAssessmentCareNeedsNotes,
    prePushNotesAutosaveState,
  ]);

  useEffect(() => {
    if (!isAdmin || !firestore) {
      setMemberPortalLoginLog([]);
      return;
    }
    if (memberPortalUidCandidates.length === 0 && memberPortalEmailCandidates.length === 0) {
      setMemberPortalLoginLog([]);
      return;
    }

    setIsLoadingMemberPortalLoginLog(true);
    let cancelled = false;

    const mapDoc = (item: { id: string; data: () => any }): MemberPortalLoginEntry => {
      const data = (item.data() || {}) as any;
      return {
        id: item.id,
        userId: String(data.userId || ''),
        userName: String(data.userName || data.userEmail || 'Unknown user'),
        userEmail: String(data.userEmail || ''),
        role: String(data.userRole || data.role || 'User'),
        action: String(data.action || ''),
        success: data.success !== false,
        failureReason: String(data.failureReason || ''),
        portal: String(data.portal || ''),
        userAgent: String(data.userAgent || ''),
        timestamp: data.timestamp,
        createdAt: data.createdAt,
      };
    };

    const run = async () => {
      try {
        const byId = new Map<string, MemberPortalLoginEntry>();
        const lookups: Array<Promise<void>> = [];

        memberPortalUidCandidates.forEach((uid) => {
          lookups.push(
            getDocs(
              query(collection(firestore, 'loginLogs'), where('userId', '==', uid), limit(80))
            ).then((snap) => {
              snap.docs.forEach((d) => byId.set(d.id, mapDoc(d)));
            })
          );
          // Failed attempts logged before auth use userId = email:{address}
          // and are picked up via email queries below.
        });

        memberPortalEmailCandidates.forEach((email) => {
          lookups.push(
            getDocs(
              query(collection(firestore, 'loginLogs'), where('userEmail', '==', email), limit(80))
            ).then((snap) => {
              snap.docs.forEach((d) => byId.set(d.id, mapDoc(d)));
            })
          );
          lookups.push(
            getDocs(
              query(
                collection(firestore, 'loginLogs'),
                where('userId', '==', `email:${email}`),
                limit(40)
              )
            ).then((snap) => {
              snap.docs.forEach((d) => byId.set(d.id, mapDoc(d)));
            })
          );
        });

        await Promise.all(lookups);
        if (cancelled) return;

        const rows = Array.from(byId.values())
          .filter((entry) => {
            const portal = String(entry.portal || '').trim().toLowerCase();
            const action = String(entry.action || '').trim().toLowerCase();
            if (action && action !== 'login') return false;
            if (portal && portal !== 'user') return false;
            return true;
          })
          .sort((a, b) => {
            const bMs = toMillisSafe(b.timestamp) || toMillisSafe(b.createdAt);
            const aMs = toMillisSafe(a.timestamp) || toMillisSafe(a.createdAt);
            return bMs - aMs;
          })
          .slice(0, 60);

        setMemberPortalLoginLog(rows);
      } catch (error) {
        console.warn('Failed to load member portal login log:', error);
        if (!cancelled) setMemberPortalLoginLog([]);
      } finally {
        if (!cancelled) setIsLoadingMemberPortalLoginLog(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    isAdmin,
    firestore,
    memberPortalUidCandidates,
    memberPortalEmailCandidates,
    memberPortalLoginRefreshKey,
  ]);

  useEffect(() => {
    if (!isAdmin || !firestore || !docRef) return;
    const clientId2 = String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim();
    if (!clientId2) return;

    const cacheRef = doc(firestore, 'caspio_members_cache', clientId2);
    const unsubscribe = onSnapshot(
      cacheRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = (snap.data() || {}) as Record<string, unknown>;
        const incomingKaiserStatus = String(data.Kaiser_Status || data.kaiserStatus || '').trim();
        const incomingCalAIMStatus = String(data.CalAIM_Status || data.caspioCalAIMStatus || data.calaimStatus || '').trim();
        const currentKaiserStatus = String((application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || '').trim();
        const currentCalAIMStatus = String((application as any)?.caspioCalAIMStatus || '').trim();
        const manualLockUntilMs = Number((application as any)?.kaiserStatusManualLockUntilMs || 0);
        const isManualLockActive = Number.isFinite(manualLockUntilMs) && manualLockUntilMs > Date.now();
        const isManualPrePushKaiserStatus =
          isKaiserPlan && isRequiredPrePushKaiserStatus(currentKaiserStatus);

        const updateData: Record<string, unknown> = {
          lastUpdated: serverTimestamp(),
        };
        let shouldPersist = false;

        // Preserve manually selected pre-push Kaiser status so staff can keep
        // "T2038 Received, doc collection"
        // while preparing assignments and Caspio push.
        const shouldAutoSyncKaiserFromCache =
          isKaiserPlan && !showDraftKaiserStatusSection && !isManualPrePushKaiserStatus;
        if (
          shouldAutoSyncKaiserFromCache &&
          !isManualLockActive &&
          incomingKaiserStatus &&
          incomingKaiserStatus !== currentKaiserStatus
        ) {
          updateData.kaiserStatus = incomingKaiserStatus;
          updateData.Kaiser_Status = incomingKaiserStatus;
          updateData.kaiserStatusSyncedFromCacheAt = serverTimestamp();
          updateData.kaiserStatusSyncSource = 'caspio_members_cache_live';
          shouldPersist = true;
        }

        if (incomingCalAIMStatus && incomingCalAIMStatus !== currentCalAIMStatus) {
          updateData.caspioCalAIMStatus = incomingCalAIMStatus;
          updateData.CalAIM_Status = incomingCalAIMStatus;
          updateData.calaimStatus = incomingCalAIMStatus;
          updateData.calaimStatusSyncedFromCacheAt = serverTimestamp();
          updateData.calaimStatusSyncSource = 'caspio_members_cache_live';
          shouldPersist = true;
        }

        if (!shouldPersist) return;

        void setDoc(
          docRef,
          updateData,
          { merge: true }
        ).catch(() => {
          // Best effort live sync; webhook/scheduled sync still provide server-side propagation.
        });

        setApplication((prev) =>
          prev
            ? ({
                ...prev,
                ...(shouldAutoSyncKaiserFromCache && incomingKaiserStatus && incomingKaiserStatus !== currentKaiserStatus
                  ? { kaiserStatus: incomingKaiserStatus, Kaiser_Status: incomingKaiserStatus }
                  : {}),
                ...(incomingCalAIMStatus && incomingCalAIMStatus !== currentCalAIMStatus
                  ? {
                      caspioCalAIMStatus: incomingCalAIMStatus,
                      CalAIM_Status: incomingCalAIMStatus,
                    }
                  : {}),
              } as any)
            : prev
        );
      },
      (error) => {
        console.warn('Failed to subscribe to caspio member cache:', error);
      }
    );

    return () => unsubscribe();
  }, [
    isAdmin,
    firestore,
    docRef,
    isKaiserPlan,
    showDraftKaiserStatusSection,
    (application as any)?.client_ID2,
    (application as any)?.clientId2,
    (application as any)?.kaiserStatus,
    (application as any)?.caspioCalAIMStatus,
  ]);

  const alfaVisitCompleteStatusLabel = 'ALFA Visit Complete with Signoffs and Sent to ILS';
  const kaiserFamilyProgressOptions = useMemo(
    () => [
      'Application Received',
      'CS Summary Submitted - Processing',
      'Requesting Documents',
      'Authorization Request to MCP',
      'Authorization Received',
      'Authorization Denied',
      'RN/MSW Visit Scheduled',
      'RN/MSW Visit Complete',
      alfaVisitCompleteStatusLabel,
      'Tier Level Requested from MCP',
      'Tier Level Received',
      'Locating RCFEs',
      'RCFE Located',
      'R&B/Tier Level Commitment Sent for Signatures',
      'Member Ready for Move-In',
      'Member Moved into RCFE',
    ],
    [alfaVisitCompleteStatusLabel]
  );
  const healthNetFamilyProgressOptions = useMemo(
    () => [
      'Application Received',
      'CS Summary Submitted - Processing',
      'Requesting Documents',
      'RN ISP Scheduled',
      'RN ISP Complete',
      'Authorization Request to MCP',
      'Authorization Received',
      'Authorization Denied',
    ],
    []
  );
  const familyProgressOptions = isKaiserPlan
    ? kaiserFamilyProgressOptions
    : isHealthNetPlan
      ? healthNetFamilyProgressOptions
      : [];
  const familyStatusProgressValue = String((application as any)?.familyStatusProgress || '').trim();
  const isAlfaVisitCompleteStatusSelected = familyStatusProgressValue === alfaVisitCompleteStatusLabel;
  const familyProgressNeedsDeniedReason = /authorization denied/i.test(familyStatusProgressValue);
  const familyStatusDeniedReason = String((application as any)?.familyStatusDeniedReason || '');
  const familyStatusLastEmail = (application as any)?.familyStatusLastEmail || null;
  const familyStatusHistory = Array.isArray((application as any)?.familyStatusReminderHistory)
    ? ((application as any)?.familyStatusReminderHistory as any[])
    : [];
  const familyStatusLastSentLabel = useMemo(() => {
    const raw = familyStatusLastEmail?.sentAtMs ?? familyStatusLastEmail?.sentAtIso ?? null;
    if (!raw) return '';
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      return format(d, 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  }, [familyStatusLastEmail?.sentAtMs, familyStatusLastEmail?.sentAtIso]);
  const authorizedRepInviteEmail = useMemo(() => {
    const candidates = [
      String((application as any)?.repEmail || '').trim(),
      String((application as any)?.bestContactEmail || '').trim(),
      String((application as any)?.referrerEmail || '').trim(),
    ];
    return candidates.find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || '';
  }, [application]);
  const roomBoardAgreementMeta = (application as any)?.roomBoardTierAgreement || null;

  const kaiserCurrentStatus = (() => {
    return String((application as any)?.kaiserStatus || '').trim();
  })();
  const kaiserWorkflowOptions = useMemo(() => {
    return getKaiserStatusesInOrder()
      .filter((s) => Boolean((s as any)?.isActive))
      .map((s) => String(s.status || '').trim())
      .filter(Boolean);
  }, []);
  const kaiserNextStatus = useMemo(() => {
    if (!isKaiserPlan) return '';
    const idx = kaiserWorkflowOptions.findIndex((s) => s === kaiserCurrentStatus);
    if (idx === -1) return '';
    if (idx >= kaiserWorkflowOptions.length - 1) return '';
    return String(kaiserWorkflowOptions[idx + 1] || '').trim();
  }, [isKaiserPlan, kaiserCurrentStatus, kaiserWorkflowOptions]);

  const healthNetCurrentStatus = useMemo(() => {
    const raw = String(
      (application as any)?.Health_Net_Process_Status ||
      (application as any)?.healthNetProcessStatus ||
      (application as any)?.healthNetStatus ||
      ''
    ).trim();
    // Do not default to "On Hold (Not Interested)" when status is empty.
    // Empty means not yet set/synced from process status source.
    return resolveHealthNetStatus(raw) || '';
  }, [application]);
  const healthNetNextStatus = useMemo(() => {
    if (!isHealthNetPlan) return '';
    const idx = healthNetSteps.findIndex((s) => s === healthNetCurrentStatus);
    if (idx === -1) return '';
    if (idx >= healthNetSteps.length - 1) return '';
    return String(healthNetSteps[idx + 1] || '').trim();
  }, [isHealthNetPlan, healthNetCurrentStatus]);

  const processStatusLabel = useMemo(() => {
    if (isKaiserPlan) return String((application as any)?.kaiserStatus || '').trim();
    if (isHealthNetPlan) return String(healthNetCurrentStatus || '').trim();
    return '';
  }, [application, isKaiserPlan, isHealthNetPlan, healthNetCurrentStatus]);

  const effectiveNextStep = useMemo(() => {
    if (isKaiserPlan) return String(kaiserNextStatus || '').trim();
    if (isHealthNetPlan) return String(healthNetNextStatus || '').trim();
    return String((staffTracker as any)?.nextStep || '').trim();
  }, [isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus, staffTracker]);

  const nextStepSuggestedLabel = useMemo(() => {
    if (isKaiserPlan) return kaiserNextStatus ? `Suggested: ${kaiserNextStatus}` : 'Suggested: —';
    if (isHealthNetPlan) return healthNetNextStatus ? `Suggested: ${healthNetNextStatus}` : 'Suggested: —';
    return '';
  }, [isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus]);

  const nextStepSelectOptions = useMemo(() => {
    if (isKaiserPlan) {
      return [
        { value: 'none', label: '— None —' },
        ...kaiserWorkflowOptions.map((s) => ({ value: s, label: s })),
      ];
    }
    if (isHealthNetPlan) {
      return [
        { value: 'none', label: '— None —' },
        ...healthNetSteps.map((s) => ({ value: s, label: s })),
      ];
    }
    return NEXT_STEP_OPTIONS;
  }, [isKaiserPlan, isHealthNetPlan, kaiserWorkflowOptions]);

  const nextStepSelectValue = useMemo(() => {
    const stored = String((staffTracker as any)?.nextStep || '').trim();
    if (stored) return stored;
    if (isKaiserPlan) return String(kaiserNextStatus || '').trim() || 'none';
    if (isHealthNetPlan) return String(healthNetNextStatus || '').trim() || 'none';
    return 'none';
  }, [staffTracker, isKaiserPlan, isHealthNetPlan, kaiserNextStatus, healthNetNextStatus]);

  const updateStaffTracker = async (patch: Partial<StaffTracker>) => {
    if (!staffTrackerRef || !applicationId || !appUserId || !application) return;
    try {
      const memberName = `${(application as any)?.memberFirstName || ''} ${(application as any)?.memberLastName || ''}`.trim();
      const memberClientId = String((application as any)?.client_ID2 || '').trim();
      const base: any = {
        id: applicationId,
        applicationId,
        userId: appUserId,
        healthPlan: String((application as any)?.healthPlan || '').trim(),
        memberName,
        memberClientId,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(staffTrackerRef, { ...base, ...(patch as any) }, { merge: true });
    } catch (e) {
      // non-fatal; page can still operate without tracker updates
      console.warn('Failed to update staff tracker:', e);
    }
  };

  useEffect(() => {
    // If no next step is set yet, seed it with the suggested workflow next step.
    if (!isKaiserPlan && !isHealthNetPlan) return;
    const desired = String(effectiveNextStep || '').trim();
    if (!desired) return;
    const current = String((staffTracker as any)?.nextStep || '').trim();
    if (current) return;
    updateStaffTracker({ nextStep: desired } as any);
    if (!nextStepDateInputValue) setNextStepDateMissing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKaiserPlan, isHealthNetPlan, effectiveNextStep, staffTrackerRef]);

  const getStaffOptions = () => {
    if (staffList.length > 0) {
      return staffList.map((staff) => staff.name).filter(Boolean);
    }
    return [];
  };

  const activityLog = useMemo(() => {
    if (!application?.forms) return [];
    
    return application.forms
      .filter(form => form.status === 'Completed' && form.dateCompleted)
      .map(form => {
        const rawDate: any = form.dateCompleted;
        const date =
          typeof rawDate?.toDate === 'function'
            ? rawDate.toDate()
            : rawDate instanceof Date
              ? rawDate
              : new Date(rawDate);
        return {
          id: form.name,
          component: form.name,
          user: application.referrerName || 'User', // Placeholder
          date,
          action: form.type === 'Upload' ? `Uploaded ${form.fileName}` : 'Completed online form',
        };
      })
      .filter((entry) => entry.date instanceof Date && !Number.isNaN(entry.date.getTime()))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [application]);

  const uploadedFiles = useMemo(() => {
    if (!application?.forms) return [];
    return application.forms.filter(
        (form) => form.type === 'Upload' && form.status === 'Completed' && form.fileName
    );
  }, [application]);

  const authorizationTypes = useMemo(
    () => getAuthorizationTypes(application?.healthPlan),
    [application?.healthPlan]
  );
  const isKaiserApplication = useMemo(() => {
    const plan = String(application?.healthPlan || '').trim().toLowerCase();
    return plan.includes('kaiser');
  }, [application?.healthPlan]);

  const authorizationRecords = useMemo(() => {
    return ((application as any)?.authorizationRecords || []) as Array<{
      id?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      fileName?: string;
      downloadURL?: string;
      uploadedAt?: any;
      createdByName?: string;
      expiryNotifiedAt?: string;
    }>;
  }, [application]);
  const kaiserH2022Records = useMemo(() => {
    const records = authorizationRecords.filter((record) =>
      String(record?.type || '')
        .trim()
        .toLowerCase()
        .includes('h2022')
    );
    return records.sort((a, b) => {
      const aMs = new Date(String(a?.endDate || '')).getTime();
      const bMs = new Date(String(b?.endDate || '')).getTime();
      const safeA = Number.isFinite(aMs) ? aMs : 0;
      const safeB = Number.isFinite(bMs) ? bMs : 0;
      return safeB - safeA;
    });
  }, [authorizationRecords]);

  const ispRecords = useMemo(() => {
    return ((application as any)?.ispRecords || []) as Array<{
      id?: string;
      planDate?: string;
      fileName?: string;
      downloadURL?: string;
      uploadedAt?: any;
      createdByName?: string;
    }>;
  }, [application]);
  const latestAuthorizationRecord = useMemo(() => {
    if (!authorizationRecords.length) return null;
    return authorizationRecords.reduce((latest, record) => {
      const recordMs = toMillisSafe((record as any)?.uploadedAt);
      const latestMs = latest ? toMillisSafe((latest as any)?.uploadedAt) : 0;
      if (!latest) return record;
      return recordMs > latestMs ? record : latest;
    }, null as (typeof authorizationRecords)[number] | null);
  }, [authorizationRecords]);
  const latestAuthorizationUploadLabel = useMemo(() => {
    if (!latestAuthorizationRecord) return '';
    const uploadedAtMs = toMillisSafe((latestAuthorizationRecord as any)?.uploadedAt);
    if (!uploadedAtMs) return '';
    try {
      return format(new Date(uploadedAtMs), 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  }, [latestAuthorizationRecord]);

  const interofficeNotes = useMemo(() => {
    return ((application as any)?.interofficeNotes || []) as Array<{
      id?: string;
      message?: string;
      priority?: 'Regular' | 'Priority' | 'Immediate';
      createdAt?: string;
      createdByName?: string;
      recipientId?: string;
      recipientName?: string;
      followUpDate?: string;
      followUpNotifiedAt?: string;
    }>;
  }, [application]);

  const memberIdForNotes = useMemo(() => {
    return (application as any)?.client_ID2 || application?.id || '';
  }, [application]);

  const filteredAuthorizationRecords = useMemo(() => {
    if (!authorizationSearch.trim()) return authorizationRecords;
    const query = authorizationSearch.toLowerCase();
    return authorizationRecords.filter((record) => {
      const fields = [
        record.type,
        record.fileName,
        record.startDate,
        record.endDate,
        record.createdByName
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return fields.includes(query);
    });
  }, [authorizationRecords, authorizationSearch]);

  useEffect(() => {
    if (!docRef) {
      if (!isUserLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (docSnap: DocumentSnapshot) => {
      if (docSnap.exists()) {
        setApplication({ id: docSnap.id, ...docSnap.data() } as Application);
      } else {
        setApplication(null);
        setError(new Error("Application not found or you don't have access."));
      }
      setIsLoading(false);
    }, (err: FirestoreError) => {
      console.error(err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [docRef, isUserLoading]);

  // Family portal uploads for admin_app_* live under users/{uid}/applications/{id}.
  // Merge those forms onto the admin view (and heal the top-level doc) so staff see them.
  const portalFormsMergeKeyRef = useRef<string>('');
  useEffect(() => {
    if (!firestore || !applicationId || !application) return;
    if (!String(applicationId).startsWith('admin_app_')) return;

    const uidCandidates = new Set<string>();
    const addUid = (value: unknown) => {
      const uid = String(value || '').trim();
      if (uid) uidCandidates.add(uid);
    };
    addUid(appUserId);
    addUid((application as any)?.userId);
    const linked = (application as any)?.portalLinkedUids;
    if (Array.isArray(linked)) linked.forEach(addUid);

    let cancelled = false;
    const run = async () => {
      try {
        const refs = [
          doc(firestore, 'applications', applicationId),
          ...Array.from(uidCandidates).map((uid) => doc(firestore, `users/${uid}/applications`, applicationId)),
        ];
        const snaps = await Promise.all(refs.map((ref) => getDoc(ref)));
        if (cancelled) return;

        let mergedForms = Array.isArray((application as any)?.forms)
          ? ([...(application as any).forms] as any[])
          : [];
        snaps.forEach((snap) => {
          if (!snap.exists()) return;
          const otherForms = (snap.data() as any)?.forms;
          if (!Array.isArray(otherForms) || otherForms.length === 0) return;
          mergedForms = mergeApplicationForms(mergedForms, otherForms) as any[];
        });

        const formFingerprint = (forms: any[]) =>
          JSON.stringify(
            [...forms]
              .map((form) => ({
                name: String(form?.name || '').trim(),
                status: String(form?.status || '').trim(),
                signerName: String(form?.signerName || '').trim(),
                signerType: String(form?.signerType || '').trim(),
                choice: String(form?.choice || '').trim(),
                ackHipaa: Boolean(form?.ackHipaa),
                ackLiability: Boolean(form?.ackLiability),
                ackFoc: Boolean(form?.ackFoc),
                ackRoomAndBoard: Boolean(form?.ackRoomAndBoard),
                acknowledged: Boolean(form?.acknowledged),
                fileCount: Array.isArray(form?.uploadedFiles) ? form.uploadedFiles.length : 0,
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          );
        const currentForms = Array.isArray((application as any)?.forms) ? (application as any).forms : [];
        if (cancelled || formFingerprint(mergedForms) === formFingerprint(currentForms)) return;

        setApplication((prev) =>
          prev ? ({ ...(prev as any), forms: mergedForms } as any) : prev
        );

        try {
          await Promise.all(
            snaps
              .filter((snap) => snap.exists())
              .map((snap) =>
                setDoc(
                  snap.ref,
                  {
                    forms: mergedForms,
                    lastUpdated: serverTimestamp(),
                    pendingDocReviewCount: countPendingDocumentReviews(mergedForms),
                    pendingDocReviewUpdatedAt: serverTimestamp(),
                    portalFormsSyncedAt: serverTimestamp(),
                  },
                  { merge: true }
                )
              )
          );
        } catch (healError) {
          console.warn('Failed to heal shared application forms:', healError);
        }
      } catch (error) {
        console.warn('Failed to merge portal application forms:', error);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    firestore,
    applicationId,
    appUserId,
    application,
  ]);

  const mifServiceDeliveryBackfillRef = useRef('');
  const mifServiceDeliveryErrorToastRef = useRef('');
  const needsMifServiceDeliveryForm = Boolean(
    application && applicationMifServiceDeliveryNeedsRefresh(application)
  );
  useEffect(() => {
    if (!needsMifServiceDeliveryForm || !docRef || !applicationId || !storage) return;
    const runKey = `run:${applicationId}:v${MIF_SERVICE_DELIVERY_LAYOUT_VERSION}`;
    const doneKey = `done:${applicationId}:v${MIF_SERVICE_DELIVERY_LAYOUT_VERSION}`;
    if (
      mifServiceDeliveryBackfillRef.current === runKey ||
      mifServiceDeliveryBackfillRef.current === doneKey
    ) {
      return;
    }
    mifServiceDeliveryBackfillRef.current = runKey;
    void (async () => {
      try {
        const sourceFromNotes = String((application as any)?.adminNotes || '')
          .split('\n')
          .find((line: string) => /^source file:/i.test(String(line || '').trim()));
        const isSingleAuthIntake = !isMifSpreadsheetIntakeApplication(application);
        const singleAuthSourceForm = isSingleAuthIntake
          ? (Array.isArray((application as any)?.forms) ? (application as any).forms : []).find((form: any) => {
              const hay = `${form?.source || ''} ${form?.sourceTag || ''} ${form?.name || ''}`.toLowerCase();
              return hay.includes('single_auth') || hay.includes('authorization sheet pdf');
            })
          : null;
        const sourceFileName = isSingleAuthIntake
          ? String(singleAuthSourceForm?.fileName || 'ILS Authorization Sheet PDF').trim()
          : String(
              (application as any)?.ilsMifSourceFileName ||
                String(sourceFromNotes || '').replace(/^source file:\s*/i, '') ||
                ''
            ).trim();
        const uploaded = await uploadMifServiceDeliveryForm({
          storage,
          applicationId,
          identity: {
            memberFirstName: String((application as any)?.memberFirstName || '').trim(),
            memberLastName: String((application as any)?.memberLastName || '').trim(),
            memberMrn: String((application as any)?.memberMrn || '').trim(),
            memberMediCalNum: String((application as any)?.memberMediCalNum || '').trim(),
            memberSex: String((application as any)?.memberSex || '').trim(),
            memberDob: String((application as any)?.memberDob || '').trim(),
            memberPhone: String((application as any)?.memberPhone || '').trim(),
            memberEmail: String((application as any)?.memberEmail || '').trim(),
            memberAddress: String(
              (application as any)?.customaryAddress || (application as any)?.memberCustomaryAddress || ''
            ).trim(),
            memberCity: String(
              (application as any)?.customaryCity || (application as any)?.memberCustomaryCity || ''
            ).trim(),
            memberState: String(
              (application as any)?.customaryState || (application as any)?.memberCustomaryState || ''
            ).trim(),
            memberZip: String(
              (application as any)?.customaryZip || (application as any)?.memberCustomaryZip || ''
            ).trim(),
            memberCounty: String(
              (application as any)?.customaryCounty || (application as any)?.memberCustomaryCounty || ''
            ).trim(),
            contactPhone: String(
              (application as any)?.contactPhone || (application as any)?.bestContactPhone || ''
            ).trim(),
            contactEmail: String(
              (application as any)?.contactEmail || (application as any)?.bestContactEmail || ''
            ).trim(),
            careManagerName: String((application as any)?.careManagerName || '').trim(),
            careManagerPhone: String((application as any)?.careManagerPhone || '').trim(),
            careManagerEmail: String((application as any)?.careManagerEmail || '').trim(),
            authorizationNumberT2038: String((application as any)?.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: String((application as any)?.Authorization_Start_T2038 || '').trim(),
            authorizationEndT2038: String((application as any)?.Authorization_End_T2038 || '').trim(),
            diagnosticCode: String((application as any)?.Diagnostic_Code || '').trim(),
            kaiserStatus: String(
              (application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || ''
            ).trim(),
            sourceFileName: sourceFileName || 'MIF Spreadsheet',
            sourceType: isSingleAuthIntake ? 'single_auth_pdf' : 'spreadsheet',
          },
          extraFileNames: isSingleAuthIntake ? [] : [sourceFileName],
        });
        const latestSnap = await getDoc(docRef);
        const latestData = latestSnap.exists() ? latestSnap.data() : {};
        const existingForms = Array.isArray((latestData as any)?.forms) ? [...(latestData as any).forms] : [];
        const withoutOld = existingForms.filter(
          (form: any) => !isGeneratedMifServiceRequestForm(form)
        );
        const formRecord = JSON.parse(JSON.stringify(uploaded.formRecord));
        await setDoc(
          docRef,
          {
            forms: [formRecord, ...withoutOld],
            serviceDeliveryForm: {
              fileName: uploaded.fileName,
              filePath: uploaded.filePath,
              downloadURL: uploaded.downloadURL,
              generatedAtIso: new Date().toISOString(),
              source: 'spreadsheet_service_delivery_placeholder',
              layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
            },
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );
        mifServiceDeliveryBackfillRef.current = doneKey;
      } catch (error: any) {
        console.warn(`Failed to backfill MIF ${MIF_SERVICE_DELIVERY_FORM_NAME} into member files:`, error);
        mifServiceDeliveryBackfillRef.current = '';
        const errorKey = `${applicationId}:${String(error?.code || error?.message || 'unknown')}`;
        if (mifServiceDeliveryErrorToastRef.current !== errorKey) {
          mifServiceDeliveryErrorToastRef.current = errorKey;
          toast({
            variant: 'destructive',
            title: `${MIF_SERVICE_DELIVERY_FORM_NAME} missing`,
            description: String(error?.message || `Could not add the MIF ${MIF_SERVICE_DELIVERY_FORM_NAME} to member files.`),
          });
        }
      }
    })();
  }, [needsMifServiceDeliveryForm, applicationId, docRef, storage, isMemberFilesDialogOpen]);

  useEffect(() => {
    if (!docRef || !application) return;
    const current = String(
      (application as any)?.holdForSocialWorkerStatus ||
      (application as any)?.Hold_For_Social_Worker_Visit ||
      (application as any)?.Hold_For_Social_Worker ||
      ''
    ).trim();
    if (current) return;
    const patch = {
      holdForSocialWorkerStatus: DEFAULT_SOCIAL_WORKER_HOLD_VALUE,
      lastUpdated: serverTimestamp(),
    } as Record<string, any>;
    void setDoc(docRef, patch, { merge: true }).catch(() => undefined);
    setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as any) : prev));
  }, [docRef, application]);

  useEffect(() => {
    if (!isAdmin || !firestore || !memberIdForNotes) return;
    const notificationsQuery = query(
      collection(firestore, 'staff_notifications'),
      where('clientId2', '==', memberIdForNotes)
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            title: data.title || 'Note',
            message: data.message || '',
            priority: data.priority || 'Medium',
            createdAt: data.timestamp || data.createdAt,
            createdByName: data.createdByName || data.senderName,
            type: data.type
          };
        }).sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });
        setMemberNotifications(items);
      },
      (error) => {
        console.warn('Failed to load member notifications:', error);
        setMemberNotifications([]);
      }
    );

    return () => unsubscribe();
  }, [isAdmin, firestore, memberIdForNotes]);

  useEffect(() => {
    const STAFF_CACHE_KEY = 'interoffice_admin_staff_cache_v1';
    const STAFF_CACHE_TTL_MS = 5 * 60 * 1000;

    const readCache = () => {
      try {
        const raw = sessionStorage.getItem(STAFF_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { timestamp: number; staff: typeof staffList };
        if (!parsed?.staff?.length) return null;
        return {
          ...parsed,
          staff: mergeCurrentUserIntoStaff(parsed.staff)
        };
      } catch (error) {
        console.warn('Staff cache read failed:', error);
        return null;
      }
    };

    const writeCache = (staff: typeof staffList) => {
      try {
        sessionStorage.setItem(
          STAFF_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), staff })
        );
      } catch (error) {
        console.warn('Staff cache write failed:', error);
      }
    };

    const chunkArray = <T,>(items: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
      }
      return chunks;
    };

    const fetchStaffFromFirestore = async () => {
      if (!firestore) return [];
      try {
        const usersSnap = await getDocs(
          query(collection(firestore, 'users'), where('isStaff', '==', true))
        );
        const users: Array<{ uid: string; name: string; email: string; role: string }> = [];

        usersSnap.forEach((docItem) => {
          const data = docItem.data() as any;
          users.push({
            uid: docItem.id,
            name: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : data.email || 'Unknown Staff',
            email: data.email || '',
            role: data.role || 'Staff'
          });
        });

        return users.sort((a, b) => a.name.localeCompare(b.name));
      } catch (error) {
        console.error('Firestore staff load failed:', error);
        return [];
      }
    };

    const loadStaffMembers = async () => {
      try {
        setIsLoadingStaff(true);
        const fallback = await fetchStaffFromFirestore();
        if (fallback.length > 0) {
          const merged = mergeCurrentUserIntoStaff(fallback);
          setStaffList(merged);
          writeCache(merged);
          return;
        }
      } catch (loadError) {
        console.error('Error loading staff members:', loadError);
      } finally {
        setIsLoadingStaff(false);
      }
    };

    const cached = readCache();
    if (cached?.staff?.length) {
      setStaffList(cached.staff);
    }

    if (cached && Date.now() - cached.timestamp < STAFF_CACHE_TTL_MS) {
      setIsLoadingStaff(false);
      return;
    }

    loadStaffMembers();
  }, [user, firestore]);

  const handleSendInterofficeNote = async () => {
    if (!firestore || !application || !applicationId || !docRef) return;
    if (interofficeNote.recipientIds.length === 0 || !interofficeNote.message.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing Details',
        description: 'Select at least one staff member and enter a message.'
      });
      return;
    }

    let interofficeEnabled = true;
    let allowedRecipients: Set<string> | null = null;
    try {
      const settingsSnap = await getDoc(doc(firestore, 'system_settings', 'notifications'));
      if (settingsSnap.exists()) {
        const data = settingsSnap.data() as any;
        interofficeEnabled = Boolean(data?.interofficeElectronEnabled ?? data?.interofficeNotificationsEnabled ?? true);
        const recipientsField = (data?.recipientUids || []) as unknown;
        if (Array.isArray(recipientsField) && recipientsField.length > 0) {
          allowedRecipients = new Set(recipientsField.map((v) => String(v || '').trim()).filter(Boolean));
        }
      }
    } catch {
      // Fail-open if settings are unreadable.
    }

    if (!interofficeEnabled) {
      toast({
        variant: 'destructive',
        title: 'Interoffice Notes Disabled',
        description: 'Global interoffice note activation is currently turned off.'
      });
      return;
    }

    const memberName = `${application.memberFirstName} ${application.memberLastName}`;
    const clientId2 = (application as any)?.client_ID2 || application.id;
    const recipients = staffList.filter((staff) => {
      if (!interofficeNote.recipientIds.includes(staff.uid)) return false;
      if (!allowedRecipients) return true;
      return allowedRecipients.has(String(staff.uid || '').trim());
    });
    if (recipients.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Recipients',
        description: 'Selected staff members were not found.'
      });
      return;
    }
    const priorityValue =
      interofficeNote.priority === 'Immediate'
        ? 'Urgent'
        : interofficeNote.priority === 'Priority'
          ? 'Priority'
          : 'Low';
    const noteRecords = recipients.map((recipient) => ({
      id: `interoffice-${Date.now()}-${recipient.uid}`,
      message: interofficeNote.message.trim(),
      priority: interofficeNote.priority,
      createdAt: new Date().toISOString(),
      createdBy: user?.uid || 'system',
      createdByName: user?.displayName || user?.email || 'Admin',
      recipientId: recipient.uid,
      recipientName: recipient.name,
      followUpDate: interofficeNote.followUpDate || '',
      followUpNotifiedAt: ''
    }));

    try {
      const existingNotes = ((application as any)?.interofficeNotes || []) as Array<any>;
      await setDoc(docRef!, { interofficeNotes: [...existingNotes, ...noteRecords] }, { merge: true });

      await Promise.all(
        recipients.map((recipient) =>
          addDoc(collection(firestore, 'staff_notifications'), {
            userId: recipient.uid,
            title: `Interoffice Note: ${memberName}`,
            message: interofficeNote.message.trim(),
            memberName,
            clientId2,
            applicationId,
            type: 'interoffice_note',
            priority: priorityValue,
            status: 'Open',
            isRead: false,
            createdBy: user?.uid || 'system',
            createdByName: user?.displayName || user?.email || 'Admin',
            senderName: user?.displayName || user?.email || 'Admin',
            timestamp: serverTimestamp(),
            actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
          })
        )
      );

      // Auto-create daily calendar tasks for each recipient if a follow-up date is set
      const followUpDateStr = String(interofficeNote.followUpDate || '').trim();
      if (followUpDateStr) {
        const calendarDueDate = followUpDateStr.length === 10
          ? followUpDateStr // already YYYY-MM-DD
          : new Date(followUpDateStr).toISOString().split('T')[0];

        const senderName = String(user?.displayName || user?.email || 'Admin').trim();
        await Promise.allSettled(
          recipients.map(async (recipient) =>
            fetch('/api/daily-tasks', {
              method: 'POST',
              headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: `Follow-up: ${memberName}`,
                description: interofficeNote.message.trim(),
                memberName,
                healthPlan: String(application.healthPlan || '').trim(),
                assignedTo: recipient.uid,
                assignedToName: recipient.name,
                priority:
                  interofficeNote.priority === 'Immediate'
                    ? 'high'
                    : interofficeNote.priority === 'Priority'
                    ? 'medium'
                    : 'low',
                dueDate: calendarDueDate,
                createdBy: user?.uid || 'system',
                notes: `Assigned by ${senderName} via interoffice note.`,
                applicationId,
                applicationLink: `/admin/applications/${applicationId}`,
                source: 'interoffice_note',
              }),
            })
          )
        );
      }

      await appendCommunicationNoteLog({
        category: 'interoffice',
        channel: 'interoffice_note',
        direction: 'staff_to_staff',
        status: 'success',
        subject: `Interoffice note for ${memberName}`,
        messagePreview: interofficeNote.message.trim().slice(0, 300),
        fullMessage: interofficeNote.message.trim(),
        recipientName: recipients.map((recipient) => recipient.name).join(', '),
        requiresResponse: Boolean(followUpDateStr),
        respondedAtIso: null,
        metadata: {
          recipientCount: recipients.length,
          followUpDate: followUpDateStr || null,
          priority: interofficeNote.priority,
        },
      });

      toast({
        title: 'Interoffice Note Sent',
        description: followUpDateStr
          ? `Sent to ${recipients.length} staff member${recipients.length === 1 ? '' : 's'} · Follow-up added to calendar`
          : `Sent to ${recipients.length} staff member${recipients.length === 1 ? '' : 's'}.`,
      });

      setInterofficeNote((prev) => ({
        ...prev,
        message: '',
        recipientIds: [],
        priority: 'Regular',
        followUpDate: ''
      }));
    } catch (sendError) {
      console.error('Error sending interoffice note:', sendError);
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: 'Could not send the interoffice note.'
      });
    }
  };

  const formatAuthorizationDate = (value?: any) => {
    if (!value) return 'N/A';
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
    }
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleDateString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleDateString();
  };

  const getDaysUntil = (value?: any) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const now = new Date();
    const diffMs = parsed.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const buildServiceDeliveryIdentityFromApplication = (sourceKind: 'mif' | 'single_auth') => {
    const sourceFromNotes = String((application as any)?.adminNotes || '')
      .split('\n')
      .find((line: string) => /^source file:/i.test(String(line || '').trim()));
    const sourceFileName = String(
      (application as any)?.ilsMifSourceFileName ||
        String(sourceFromNotes || '').replace(/^source file:\s*/i, '') ||
        (sourceKind === 'single_auth' ? 'Single Auth PDF' : 'MIF Spreadsheet')
    ).trim();
    return {
      memberFirstName: String((application as any)?.memberFirstName || '').trim(),
      memberLastName: String((application as any)?.memberLastName || '').trim(),
      memberMrn: String((application as any)?.memberMrn || '').trim(),
      memberMediCalNum: String((application as any)?.memberMediCalNum || '').trim(),
      memberSex: String((application as any)?.memberSex || '').trim(),
      memberDob: String((application as any)?.memberDob || '').trim(),
      memberPhone: String((application as any)?.memberPhone || '').trim(),
      memberEmail: String((application as any)?.memberEmail || '').trim(),
      memberAddress: String(
        (application as any)?.customaryAddress ||
          (application as any)?.memberCustomaryAddress ||
          (application as any)?.currentAddress ||
          ''
      ).trim(),
      memberCity: String(
        (application as any)?.customaryCity ||
          (application as any)?.memberCustomaryCity ||
          (application as any)?.currentCity ||
          ''
      ).trim(),
      memberState: String(
        (application as any)?.customaryState ||
          (application as any)?.memberCustomaryState ||
          (application as any)?.currentState ||
          ''
      ).trim(),
      memberZip: String(
        (application as any)?.customaryZip ||
          (application as any)?.memberCustomaryZip ||
          (application as any)?.currentZip ||
          ''
      ).trim(),
      memberCounty: String(
        (application as any)?.customaryCounty ||
          (application as any)?.memberCustomaryCounty ||
          (application as any)?.memberCounty ||
          (application as any)?.currentCounty ||
          ''
      ).trim(),
      contactPhone: String(
        (application as any)?.contactPhone || (application as any)?.bestContactPhone || ''
      ).trim(),
      contactEmail: String(
        (application as any)?.contactEmail || (application as any)?.bestContactEmail || ''
      ).trim(),
      referringOrganization: String((application as any)?.referringOrganization || '').trim(),
      emergencyContactName: String((application as any)?.emergencyContactName || '').trim(),
      emergencyContactRelationship: String((application as any)?.emergencyContactRelationship || '').trim(),
      emergencyContactPhone: String((application as any)?.emergencyContactPhone || '').trim(),
      emergencyContactEmail: String((application as any)?.emergencyContactEmail || '').trim(),
      careManagerName: String((application as any)?.careManagerName || '').trim(),
      careManagerPhone: String((application as any)?.careManagerPhone || '').trim(),
      careManagerEmail: String((application as any)?.careManagerEmail || '').trim(),
      authorizationNumberT2038: String(
        (application as any)?.Authorization_Number_T038 ||
          (application as any)?.Authorization_Number_T2038 ||
          ''
      ).trim(),
      authorizationStartT2038: String((application as any)?.Authorization_Start_T2038 || '').trim(),
      authorizationEndT2038: String((application as any)?.Authorization_End_T2038 || '').trim(),
      dateReceivedRequestForAuthorization: String(
        (application as any)?.dateReceivedRequestForAuthorization || ''
      ).trim(),
      dateOfReferralAuthorizationDecision: String(
        (application as any)?.dateOfReferralAuthorizationDecision || ''
      ).trim(),
      diagnosticCode: String((application as any)?.Diagnostic_Code || '').trim() || 'R69',
      kaiserStatus: String(
        (application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || ''
      ).trim(),
      sourceFileName,
      sourceType: sourceKind === 'single_auth' ? 'single_auth_pdf' : 'spreadsheet',
      eligibilityCheckStatus: String((application as any)?.calaimTrackingStatus || '').trim(),
      caspioExists: Boolean((application as any)?.caspioSent || (application as any)?.client_ID2),
      mifMasterExists: Boolean(String((application as any)?.ilsMifSourceFileName || '').trim()),
    };
  };

  const resolveDefaultServiceDeliverySourceKind = (): 'mif' | 'single_auth' => {
    const intakeSource = String((application as any)?.intakeSource || '').trim().toLowerCase();
    if (intakeSource.includes('single_auth') || intakeSource.includes('authorization_sheet')) {
      return 'single_auth';
    }
    const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
    const hasSingleAuth = forms.some((form) => {
      const hay = `${form?.source || ''} ${form?.name || ''}`.toLowerCase();
      return hay.includes('single_auth') || hay.includes('authorization sheet pdf');
    });
    if (hasSingleAuth && !String((application as any)?.ilsMifSourceFileName || '').trim()) {
      return 'single_auth';
    }
    return 'mif';
  };

  const handleCreateMemberServiceDeliveryFile = async (sourceKind?: 'mif' | 'single_auth') => {
    if (!application || !docRef || !storage || !applicationId) {
      toast({
        variant: 'destructive',
        title: 'Create unavailable',
        description: 'Application or storage is not ready yet.',
      });
      return;
    }
    const kind = sourceKind || serviceDeliverySourceKind || resolveDefaultServiceDeliverySourceKind();
    const firstName = String((application as any)?.memberFirstName || '').trim();
    const lastName = String((application as any)?.memberLastName || '').trim();
    if (!firstName || !lastName) {
      toast({
        variant: 'destructive',
        title: 'Member name required',
        description: 'Member first and last name must be on the application before creating the Drive file.',
      });
      return;
    }

    setIsCreatingServiceDeliveryFile(true);
    try {
      const identity = buildServiceDeliveryIdentityFromApplication(kind);
      const uploaded = await uploadMifServiceDeliveryForm({
        storage,
        applicationId,
        identity,
        extraFileNames: [identity.sourceFileName],
      });
      const latestSnap = await getDoc(docRef);
      const latestData = latestSnap.exists() ? latestSnap.data() : {};
      const existingForms = Array.isArray((latestData as any)?.forms)
        ? [...(latestData as any).forms]
        : [];
      const withoutOld = existingForms.filter(
        (form: any) => !isMifServiceRequestFormName(form?.name)
      );
      const formRecord = {
        ...JSON.parse(JSON.stringify(uploaded.formRecord)),
        source:
          kind === 'single_auth'
            ? 'single_auth_service_delivery_placeholder'
            : 'spreadsheet_service_delivery_placeholder',
        notes:
          kind === 'single_auth'
            ? 'Generated from Single Auth / authorized member data for Google Drive export (Service Request Form only).'
            : 'Generated from MIF / authorized member data for Google Drive export (Service Request Form only).',
      };
      const actorName = String(user?.displayName || user?.email || 'Admin').trim();
      await setDoc(
        docRef,
        {
          forms: [formRecord, ...withoutOld],
          serviceDeliveryForm: {
            fileName: uploaded.fileName,
            filePath: uploaded.filePath,
            downloadURL: uploaded.downloadURL,
            generatedAtIso: new Date().toISOString(),
            source: formRecord.source,
            layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
            createdFrom: kind,
          },
          lastUpdated: serverTimestamp(),
          memberActionLog: arrayUnion({
            timestamp: new Date().toISOString(),
            action: 'service_delivery_file_created',
            details: `Created ${MIF_SERVICE_DELIVERY_FORM_NAME} for Drive export (${kind === 'single_auth' ? 'Single Auth' : 'MIF'}): ${uploaded.fileName}`,
            performedBy: actorName,
            performedByUid: String(user?.uid || '').trim() || null,
          }),
        },
        { merge: true }
      );
      setServiceDeliveryCreateDialogOpen(false);
      toast({
        title: 'Service Request Form created',
        description: `${uploaded.fileName} was added to Files for Google Drive export.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Failed to create Service Delivery member file:', error);
      toast({
        variant: 'destructive',
        title: 'Could not create member file',
        description: String(error?.message || 'Failed to generate the Service Request Form PDF.'),
      });
    } finally {
      setIsCreatingServiceDeliveryFile(false);
    }
  };

  const handleCreateWaiversAuthorizationsPacket = async () => {
    if (!application || !docRef || !storage || !applicationId) {
      toast({
        variant: 'destructive',
        title: 'Create unavailable',
        description: 'Application or storage is not ready yet.',
      });
      return;
    }
    const available = collectWaiversAuthorizationsPdfUrls(application);
    if (!available.length) {
      toast({
        variant: 'destructive',
        title: 'No waiver/authorization PDFs',
        description: 'Upload Waivers & Authorizations and/or authorization documents first.',
      });
      return;
    }
    setIsCreatingWaiversAuthorizationsPacket(true);
    try {
      const uploaded = await uploadWaiversAuthorizationsPacket({
        storage,
        applicationId,
        application,
        memberFirstName: String((application as any)?.memberFirstName || '').trim(),
        memberLastName: String((application as any)?.memberLastName || '').trim(),
        memberMrn: String((application as any)?.memberMrn || '').trim(),
      });
      const latestSnap = await getDoc(docRef);
      const latestData = latestSnap.exists() ? latestSnap.data() : {};
      const existingForms = Array.isArray((latestData as any)?.forms)
        ? [...(latestData as any).forms]
        : [];
      const withoutOld = existingForms.filter(
        (form: any) =>
          !String(form?.name || '')
            .toLowerCase()
            .includes('waivers & authorizations packet')
      );
      const actorName = String(user?.displayName || user?.email || 'Admin').trim();
      await setDoc(
        docRef,
        {
          forms: [uploaded.formRecord, ...withoutOld],
          waiversAuthorizationsPacket: {
            fileName: uploaded.fileName,
            filePath: uploaded.filePath,
            downloadURL: uploaded.downloadURL,
            generatedAtIso: new Date().toISOString(),
            layoutVersion: WAIVERS_AUTHORIZATIONS_PACKET_LAYOUT_VERSION,
            includedLabels: uploaded.includedLabels,
          },
          lastUpdated: serverTimestamp(),
          memberActionLog: arrayUnion({
            timestamp: new Date().toISOString(),
            action: 'waivers_authorizations_packet_created',
            details: `Created ${WAIVERS_AUTHORIZATIONS_PACKET_FORM_NAME}: ${uploaded.fileName} (${uploaded.includedLabels.length} PDF${uploaded.includedLabels.length === 1 ? '' : 's'})`,
            performedBy: actorName,
            performedByUid: String(user?.uid || '').trim() || null,
          }),
        },
        { merge: true }
      );
      toast({
        title: 'Waivers & Authorizations file created',
        description: `${uploaded.fileName} includes ${uploaded.includedLabels.length} document${uploaded.includedLabels.length === 1 ? '' : 's'} for Drive export.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not create waivers packet',
        description: String(error?.message || 'Failed to package waiver/authorization PDFs.'),
      });
    } finally {
      setIsCreatingWaiversAuthorizationsPacket(false);
    }
  };

  const handleAuthorizationUpload = async () => {
    if (!application || !docRef || !storage || !firestore) return;

    if (!authorizationUpload.type || !authorizationUpload.startDate || !authorizationUpload.endDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Details',
        description: 'Select an authorization type and enter start/end dates.'
      });
      return;
    }

    if (!authorizationUpload.file) {
      toast({
        variant: 'destructive',
        title: 'Missing File',
        description: 'Upload the authorization document.'
      });
      return;
    }

    try {
      setAuthorizationUploading(true);
      setAuthorizationUploadProgress(0);

      const file = authorizationUpload.file;
      const safeType = authorizationUpload.type.replace(/[^a-z0-9-_]/gi, '_');
      const storageOwnerId = currentUserId || appUserId || 'admin';
      const filePath = `user_uploads/${storageOwnerId}/${applicationId}/authorizations/${safeType}-${Date.now()}-${file.name}`;
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setAuthorizationUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      const existingRecords = ((application as any)?.authorizationRecords || []) as Array<any>;
      const newRecord = {
        id: `auth-${Date.now()}`,
        type: authorizationUpload.type,
        startDate: authorizationUpload.startDate,
        endDate: authorizationUpload.endDate,
        fileName: buildUniqueFileName(authorizationUpload.type, file.name),
        filePath,
        downloadURL,
        uploadedAt: Timestamp.now(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email || 'Admin'
      };

      await setDoc(docRef, { authorizationRecords: [...existingRecords, newRecord] }, { merge: true });

      toast({
        title: 'Authorization Uploaded',
        description: `${authorizationUpload.type} authorization saved.`
      });

      setAuthorizationUpload({
        type: '',
        startDate: '',
        endDate: '',
        file: null
      });
      setAuthorizationUploadProgress(0);
    } catch (uploadError: any) {
      console.error('Authorization upload failed:', uploadError);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description:
          uploadError?.message ||
          uploadError?.code ||
          'Could not upload the authorization.'
      });
    } finally {
      setAuthorizationUploading(false);
    }
  };

  const handleIspUpload = async () => {
    if (!application || !docRef || !storage || !firestore) return;

    if (!ispUpload.planDate) {
      toast({
        variant: 'destructive',
        title: 'Missing Date',
        description: 'Enter the ISP date.'
      });
      return;
    }

    if (!ispUpload.file) {
      toast({
        variant: 'destructive',
        title: 'Missing File',
        description: 'Upload the ISP document.'
      });
      return;
    }

    try {
      setIspUploading(true);
      setIspUploadProgress(0);

      const file = ispUpload.file;
      const safeDate = ispUpload.planDate.replace(/[^0-9-]/g, '');
      const storageOwnerId = currentUserId || appUserId || 'admin';
      const filePath = `user_uploads/${storageOwnerId}/${applicationId}/isps/${safeDate}-${Date.now()}-${file.name}`;
      const fileRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setIspUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });

      const existingRecords = ((application as any)?.ispRecords || []) as Array<any>;
      const newRecord = {
        id: `isp-${Date.now()}`,
        planDate: ispUpload.planDate,
        fileName: buildUniqueFileName('Individual service plans', file.name),
        filePath,
        downloadURL,
        uploadedAt: Timestamp.now(),
        createdBy: user?.uid || 'system',
        createdByName: user?.displayName || user?.email || 'Admin'
      };

      await setDoc(docRef, { ispRecords: [...existingRecords, newRecord] }, { merge: true });

      toast({
        title: 'ISP Uploaded',
        description: 'Individual Service Plan saved.'
      });

      setIspUpload({
        planDate: '',
        file: null
      });
      setIspUploadProgress(0);
    } catch (uploadError: any) {
      console.error('ISP upload failed:', uploadError);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description:
          uploadError?.message ||
          uploadError?.code ||
          'Could not upload the ISP.'
      });
    } finally {
      setIspUploading(false);
    }
  };

  useEffect(() => {
    const notifyExpiringAuthorizations = async () => {
      if (!firestore || !docRef) return;
      if (authorizationRecords.length === 0) return;

      const deydry = staffList.find((staff) =>
        staff.name?.toLowerCase().includes('deydry')
      );
      if (!deydry) return;

      const memberName = `${application?.memberFirstName} ${application?.memberLastName}`;
      const clientId2 = (application as any)?.client_ID2 || application?.id;
      const now = new Date();
      const threshold = new Date(now);
      threshold.setDate(threshold.getDate() + 30);

      let hasUpdates = false;
      const updatedRecords = authorizationRecords.map((record) => {
        if (!record.endDate || record.expiryNotifiedAt) return record;
        const endDate = new Date(record.endDate);
        if (Number.isNaN(endDate.getTime())) return record;
        if (endDate <= threshold) {
          hasUpdates = true;
          return { ...record, expiryNotifiedAt: new Date().toISOString() };
        }
        return record;
      });

      if (!hasUpdates) return;

      try {
        const expiringRecords = authorizationRecords.filter((record) => {
          if (!record.endDate || record.expiryNotifiedAt) return false;
          const endDate = new Date(record.endDate);
          if (Number.isNaN(endDate.getTime())) return false;
          return endDate <= threshold;
        });

        await Promise.all(
          expiringRecords.map((record) =>
            addDoc(collection(firestore, 'staff_notifications'), {
              userId: deydry.uid,
              title: `Authorization expiring soon: ${memberName}`,
              message: `${record.type || 'Authorization'} expires on ${formatAuthorizationDate(record.endDate)}.`,
              memberName,
              clientId2,
              type: 'authorization_expiry',
              priority: 'Urgent',
              status: 'Open',
              isRead: false,
              createdBy: user?.uid || 'system',
              createdByName: user?.displayName || user?.email || 'System',
              senderName: user?.displayName || user?.email || 'System',
              timestamp: serverTimestamp(),
              actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
            })
          )
        );

        await setDoc(docRef, { authorizationRecords: updatedRecords }, { merge: true });
      } catch (error) {
        console.error('Failed to notify expiring authorizations:', error);
      }
    };

    notifyExpiringAuthorizations();
  }, [authorizationRecords, staffList, firestore, docRef, application, appUserId, applicationId, user]);

  useEffect(() => {
    const notifyFollowUps = async () => {
      if (!firestore || !docRef || interofficeNotes.length === 0) return;
      const today = new Date();

      const pendingNotes = interofficeNotes.filter((note) => {
        if (!note.followUpDate || note.followUpNotifiedAt) return false;
        const followUp = new Date(note.followUpDate);
        if (Number.isNaN(followUp.getTime())) return false;
        return followUp <= today;
      });

      if (pendingNotes.length === 0) return;

      try {
        const memberName = `${application?.memberFirstName} ${application?.memberLastName}`;
        const clientId2 = (application as any)?.client_ID2 || application?.id;

        await Promise.all(
          pendingNotes.map((note) =>
            addDoc(collection(firestore, 'staff_notifications'), {
              userId: note.recipientId,
              title: `Follow-up due: ${memberName}`,
              message: note.message || 'Follow-up is due.',
              memberName,
              clientId2,
              type: 'interoffice_followup',
              priority: 'High',
              status: 'Open',
              isRead: false,
              createdBy: user?.uid || 'system',
              createdByName: user?.displayName || user?.email || 'System',
              senderName: user?.displayName || user?.email || 'System',
              timestamp: serverTimestamp(),
              actionUrl: `/admin/applications/${applicationId}?userId=${appUserId}`
            })
          )
        );

        const updatedNotes = interofficeNotes.map((note) => {
          if (!note.followUpDate || note.followUpNotifiedAt) return note;
          const followUp = new Date(note.followUpDate);
          if (Number.isNaN(followUp.getTime()) || followUp > today) return note;
          return { ...note, followUpNotifiedAt: new Date().toISOString() };
        });

        await setDoc(docRef, { interofficeNotes: updatedNotes }, { merge: true });
      } catch (error) {
        console.error('Failed to send follow-up reminders:', error);
      }
    };

    notifyFollowUps();
  }, [interofficeNotes, firestore, docRef, application, appUserId, applicationId, user]);

  // Auto-assign staff useEffect temporarily disabled to prevent endless looping
  // useEffect(() => {
  //   const checkAutoAssignment = async () => {
  //     if (!application || (application as any)?.assignedStaff) return;
  //     
  //     const settings = localStorage.getItem('staffAssignmentNotificationSettings');
  //     if (settings) {
  //       try {
  //         const parsedSettings = JSON.parse(settings);
  //         if (parsedSettings.enabled && parsedSettings.autoAssignmentEnabled) {
  //           console.log('🤖 Auto-assigning staff for application:', application.id);
  //           setTimeout(() => {
  //             handleStaffAssignment();
  //           }, 2000);
  //         }
  //       } catch (error) {
  //         console.error('Error parsing auto-assignment settings:', error);
  //       }
  //     }
  //   };
  //
  //   checkAutoAssignment();
  // }, [application]);

  useEffect(() => {
    const facesheet = (application?.forms || []).find((f) => f.name === 'SNF Facesheet') as FormStatusType | undefined;
    const storedDays = facesheet?.snfResidencyDaysTotal;
    if (storedDays != null && Number.isFinite(Number(storedDays))) {
      setSnfResidencyDaysInput(String(Math.floor(Number(storedDays))));
    }
  }, [application?.id, application?.forms]);
  

    /** Admin + family copies must stay in sync or merge re-adds deleted uploadedFiles. */
    const getLinkedApplicationDocRefs = () => {
      if (!firestore || !applicationId) return [] as Array<ReturnType<typeof doc>>;
      const refs: Array<ReturnType<typeof doc>> = [];
      const seen = new Set<string>();
      const addRef = (next: ReturnType<typeof doc> | null | undefined) => {
        if (!next) return;
        const path = String((next as any)?.path || '').trim();
        if (!path || seen.has(path)) return;
        seen.add(path);
        refs.push(next);
      };
      addRef(docRef);
      if (String(applicationId).startsWith('admin_app_')) {
        addRef(doc(firestore, 'applications', applicationId));
      }
      const uidCandidates = new Set<string>();
      const addUid = (value: unknown) => {
        const uid = String(value || '').trim();
        if (uid) uidCandidates.add(uid);
      };
      addUid(appUserId);
      addUid((application as any)?.userId);
      const linked = (application as any)?.portalLinkedUids;
      if (Array.isArray(linked)) linked.forEach(addUid);
      uidCandidates.forEach((uid) => {
        addRef(doc(firestore, 'users', uid, 'applications', applicationId));
      });
      return refs;
    };

    const handleFormStatusUpdate = async (updates: FormStatusUpdate[]) => {
      if (!docRef || !application) return;

      const existingForms = new Map(application.forms?.map(f => [f.name, f]) || []);
      
      updates.forEach(update => {
          const existingForm = existingForms.get(update.name!);
          if (existingForm) {
              // Staff internal uploads should not trigger "needs review" notifications.
              // Standalone intake imports MUST remain un-acknowledged so they appear in staff review queues.
              const source = String((update as any)?.source || (existingForm as any)?.source || '').trim().toLowerCase();
              const isStandalone =
                source === 'standalone_upload' ||
                Boolean((update as any)?.standaloneUploadId) ||
                Boolean((existingForm as any)?.standaloneUploadId);
              const shouldAutoAcknowledge =
                update.status === 'Completed' && Boolean(update.filePath || update.downloadURL) && !isStandalone;
              existingForms.set(update.name!, {
                ...existingForm,
                ...update,
                ...(shouldAutoAcknowledge ? { acknowledged: true } : {})
              } as FormStatusType);
          } else if (update.name) {
              const source = String((update as any)?.source || '').trim().toLowerCase();
              const isStandalone = source === 'standalone_upload' || Boolean((update as any)?.standaloneUploadId);
              const shouldAutoAcknowledge =
                update.status === 'Completed' &&
                Boolean((update as any).filePath || (update as any).downloadURL) &&
                !isStandalone;
              existingForms.set(update.name, {
                name: update.name,
                status: update.status || 'Pending',
                ...update,
                ...(shouldAutoAcknowledge ? { acknowledged: true } : {})
              } as FormStatusType);
          }
      });

      const updatedForms = Array.from(existingForms.values()).map((form) =>
        stripUndefinedDeep(form) as FormStatusType
      );
      const pendingDocReviewCount = countPendingDocumentReviews(updatedForms);
      const payload = {
        forms: updatedForms,
        lastUpdated: serverTimestamp(),
        lastDocumentUpload: serverTimestamp(),
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
        portalFormsSyncedAt: serverTimestamp(),
      };
      
      try {
          const linkedRefs = getLinkedApplicationDocRefs();
          const targets = linkedRefs.length > 0 ? linkedRefs : [docRef];
          await Promise.all(targets.map((ref) => setDoc(ref, payload, { merge: true })));
          setApplication((prev) =>
            prev ? ({ ...(prev as any), forms: updatedForms } as Application) : prev
          );
      } catch (e: any) {
          console.error("Failed to update form status:", e);
          toast({ variant: 'destructive', title: 'Update Error', description: 'Could not update form status.' });
      }
  };

  const formatMemberName = () => {
    const firstName = String(application?.memberFirstName || '').trim();
    const lastName = String(application?.memberLastName || '').trim();
    if (lastName && firstName) return `${lastName}, ${firstName}`;
    if (lastName) return lastName;
    if (firstName) return firstName;
    return 'Member';
  };

  const getDocumentLabel = (formName: string) => {
    const labels: Record<string, string> = {
      'CS Member Summary': 'CS Summary Form',
      'CS Summary': 'CS Summary Form',
      'Waivers & Authorizations': 'Waivers',
      'Room and Board Commitment': 'Room and Board Commitment',
      'Room and Board/Tier Level Agreement': 'Room and Board Tier Level Agreement',
      'Proof of Income': 'Proof of Income',
      "LIC 602A - Physician's Report": 'LIC 602A Physician Report',
      'Medicine List': 'Med List',
      'SNF Facesheet': 'SNF Facesheet',
      'Eligibility Screenshot': 'Eligibility Screenshot',
      'Declaration of Eligibility': 'Declaration of Eligibility',
      consolidated_medical: 'Medical Documents'
    };
    return labels[formName] || formName;
  };

  const getFileExtension = (fileName: string) => {
    const idx = fileName.lastIndexOf('.');
    if (idx <= 0) return '';
    return fileName.slice(idx).toLowerCase();
  };

  const sanitizeFileComponent = (value: string) =>
    value.replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, ' ');

  const getMemberFileIdentityParts = () => {
    const lastName = sanitizeFileComponent(String(application?.memberLastName || '').trim()) || 'UnknownLast';
    const firstName = sanitizeFileComponent(String(application?.memberFirstName || '').trim()) || 'UnknownFirst';
    const mrn =
      sanitizeFileComponent(
        String(
          (application as any)?.memberMrn ||
            (application as any)?.memberMRN ||
            (application as any)?.medicalRecordNumber ||
            (application as any)?.mrn ||
            (application as any)?.Member_MRN ||
            ''
        ).trim()
      ) || 'UnknownMRN';
    return { lastName, firstName, mrn, memberName: `${lastName}, ${firstName}` };
  };

  const buildStandardFileName = (
    formName: string,
    originalFileName: string,
    options?: { sequence?: number }
  ) => {
    const { memberName, mrn } = getMemberFileIdentityParts();
    const label = sanitizeFileComponent(getDocumentLabel(formName));
    const ext = getFileExtension(originalFileName);
    const sequence = Number(options?.sequence || 0);
    const sequencedLabel =
      Number.isFinite(sequence) && sequence > 0 ? `${label} ${Math.floor(sequence)}` : label;
    return `${memberName} - ${mrn} - ${sequencedLabel}${ext}`;
  };

  const buildUniqueFileName = (
    formName: string,
    originalFileName: string,
    options?: { sequence?: number }
  ) => {
    const standardFileName = buildStandardFileName(formName, originalFileName, options);
    const ext = getFileExtension(standardFileName);
    const baseName = ext ? standardFileName.slice(0, -ext.length) : standardFileName;
    // When sequence is provided (Proof of Income 1/2/3), keep that as the stable display name.
    if (Number(options?.sequence || 0) > 0) return standardFileName;
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return `${baseName} - ${uniqueSuffix}${ext}`;
  };

  const loadMemberStandaloneIntakes = async () => {
    if (!firestore || !application) return;
    const mrn = String(application.memberMrn || '').trim();
    const memberLast = String(application.memberLastName || '').trim().toLowerCase();
    const memberFirst = String(application.memberFirstName || '').trim().toLowerCase();
    const memberNeedle = `${memberFirst} ${memberLast}`.trim();

    setIntakeLoading(true);
    setIntakeError('');
    try {
      const snap = await getDocs(
        query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'), limit(250))
      );
      const rows: StandaloneUploadRow[] = snap.docs.map((d) => {
        const data = d.data() as any;
        const createdAtMs = (() => {
          const raw = data?.createdAt || data?.submittedAt || data?.updatedAt || null;
          try {
            if (raw?.toDate) return raw.toDate().getTime();
            const ms = new Date(raw).getTime();
            return Number.isNaN(ms) ? 0 : ms;
          } catch {
            return 0;
          }
        })();
        const files = Array.isArray(data?.files) ? data.files : [];
        const normalizedFiles = files
          .map((f: any) => ({
            fileName: String(f?.fileName || '').trim(),
            downloadURL: String(f?.downloadURL || '').trim(),
            storagePath: String(f?.storagePath || '').trim() || undefined,
          }))
          .filter((f: any) => Boolean(f.fileName && f.downloadURL))
          .slice(0, 15);

        return {
          id: d.id,
          status: String(data?.status || 'pending'),
          documentType: String(data?.documentType || '').trim() || undefined,
          memberName: String(data?.memberName || '').trim() || undefined,
          healthPlan: String(data?.healthPlan || '').trim() || undefined,
          medicalRecordNumber:
            String(data?.medicalRecordNumber || data?.mrn || data?.memberMrn || data?.kaiserMrn || '').trim() || undefined,
          createdAtMs,
          files: normalizedFiles,
        };
      });

      const filtered = rows
        .filter((r) => r.status === 'pending')
        .filter((r) => {
          if (mrn && r.medicalRecordNumber) return r.medicalRecordNumber === mrn;
          const name = String(r.memberName || '').toLowerCase();
          if (memberLast && name.includes(memberLast)) return true;
          if (memberNeedle && name.includes(memberNeedle)) return true;
          return false;
        })
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

      setIntakeUploads(filtered);
    } catch (e: any) {
      console.error('Failed to load standalone intakes:', e);
      setIntakeError(e?.message || 'Failed to load standalone uploads.');
      setIntakeUploads([]);
    } finally {
      setIntakeLoading(false);
    }
  };

  const importStandaloneIntoSlot = async (params: { fileKey: string; requirementTitle: string }) => {
    if (!firestore || !application || !docRef || !user?.uid) return;
    const [uploadId, idxRaw] = String(params.fileKey || '').split(':');
    const idx = Number(idxRaw);
    const row = intakeUploads.find((r) => r.id === uploadId);
    const file = row?.files?.[idx];
    if (!row || !file || !params.requirementTitle) {
      toast({ variant: 'destructive', title: 'Select a file', description: 'Choose a standalone upload file to import.' });
      return;
    }

    const standardFileName = buildUniqueFileName(params.requirementTitle, file.fileName || 'document.pdf');

    try {
      await handleFormStatusUpdate([
        {
          name: params.requirementTitle,
          status: 'Completed',
          type: 'Upload',
          fileName: standardFileName,
          filePath: file.storagePath || null,
          downloadURL: file.downloadURL || null,
          dateCompleted: Timestamp.now(),
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          source: 'standalone_upload',
          standaloneUploadId: row.id,
        } as any,
      ]);

      await setDoc(
        doc(firestore, 'standalone_upload_submissions', row.id),
        {
          status: 'assigned',
          assignedAt: serverTimestamp(),
          assignedByUid: user.uid,
          assignedApplicationId: applicationId,
          assignedApplicationUserId: appUserId || null,
          assignedRequirementTitle: params.requirementTitle,
          updatedAt: serverTimestamp(),
        } as any,
        { merge: true }
      );

      toast({
        title: 'Imported',
        description: `Standalone upload attached to "${params.requirementTitle}".`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      setIntakeImportOpen(false);
      setIntakeSelectedFileKey('');
      setIntakeSearch('');
    } catch (e: any) {
      console.error('Failed to import standalone upload:', e);
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: e?.message || 'Unable to attach standalone upload to this slot.',
      });
    }
  };

  const buildStorageFileName = (standardFileName: string) =>
    standardFileName.replace(/[^\w.-]/g, '_');

  const normalizeLooseFormName = (value: unknown) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const isWaiverFormName = (value: unknown) => {
    const normalized = normalizeLooseFormName(value);
    return normalized.includes('waiver') && normalized.includes('authoriz');
  };

  const isWaiverFormActuallyComplete = (form: any, app: any) => {
    if (!form || !app) return false;
    const signerType = (form as any)?.signerType ?? null;
    const signerName = String((form as any)?.signerName ?? '').trim();
    const signerRelationship = String((form as any)?.signerRelationship ?? '').trim();
    const choice = String((form as any)?.choice ?? '').trim();
    const ackHipaa = Boolean((form as any)?.ackHipaa);
    const ackLiability = Boolean((form as any)?.ackLiability);
    const ackFoc = Boolean((form as any)?.ackFoc);
    const ackRoomAndBoard = Boolean(
      (form as any)?.ackRoomAndBoard ??
        (app as any)?.ackRoomAndBoard ??
        (form as any)?.ackSocDetermination ??
        (app as any)?.ackSocDetermination
    );
    const monthlyIncome = String((form as any)?.monthlyIncome ?? (app as any)?.monthlyIncome ?? '').trim();
    const rawIncomeSource = (form as any)?.incomeSource ?? (app as any)?.incomeSource;
    const incomeSourceCount = Array.isArray(rawIncomeSource)
      ? rawIncomeSource.filter((v: unknown) => String(v ?? '').trim()).length
      : String(rawIncomeSource ?? '').trim()
        ? 1
        : 0;

    if (!signerType) return false;
    if (!signerName) return false;
    if (!choice) return false;
    if (!ackHipaa || !ackLiability || !ackFoc || !ackRoomAndBoard) return false;
    if (!monthlyIncome) return false;
    if (incomeSourceCount <= 0) return false;
    if (signerType === 'representative' && !signerRelationship) return false;
    return true;
  };

  const getComponentStatus = (componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const equivalentNames = (() => {
      const names = new Set<string>([componentKey]);
      if (componentKey === 'Waivers & Authorizations' || componentKey === 'Waivers') {
        names.add('Waivers');
        names.add('Waivers & Authorizations');
      }
      if (componentKey === 'Room and Board/Tier Level Agreement') {
        names.add('Room and Board/Tier Level Commitment');
        names.add('Room and Board Commitment');
      }
      return names;
    })();

    const matchingForms = (application?.forms || []).filter((f) => {
      const name = String(f?.name || '').trim();
      if (equivalentNames.has(name)) return true;
      if (componentKey === 'Waivers & Authorizations' || componentKey === 'Waivers') {
        return isWaiverFormName(name);
      }
      return false;
    });

    if (componentKey === 'Eligibility Check') {
      const hasEligibilityUpload = Boolean(
        application?.forms?.some((f) => String(f?.name || '').trim() === 'Eligibility Screenshot' && String(f?.status || '').trim() === 'Completed')
      );
      const eligibilityStatus = String((application as any)?.calaimTrackingStatus || '').trim().toLowerCase();
      const isMemberEligible = eligibilityStatus === 'calaim eligible';
      return hasEligibilityUpload && isMemberEligible ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Sent to Caspio') {
      return (application as any)?.caspioSent ? 'Completed' : 'Pending';
    }
    if (componentKey === 'ALFT Status') {
      if (!isKaiserPlan) return 'Not Applicable';
      const normalizedAlftStatus = String(swPortalAssignment?.assignmentStatus || '')
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, ' ');
      if (!normalizedAlftStatus) return 'Pending';
      const isComplete = ['complete', 'completed', 'sent to ils', 'submitted'].some((token) =>
        normalizedAlftStatus.includes(token)
      );
      return isComplete ? 'Completed' : 'Pending';
    }
    if (componentKey === 'Declaration of Eligibility' && (application?.pathway !== 'SNF Diversion' || isKaiserPlan)) {
      return 'Not Applicable';
    }
    if (
      componentKey === 'SNF Facesheet' &&
      !requiresSnfFacesheet({
        pathway: application?.pathway,
        currentLocation: (application as any)?.currentLocation,
      })
    ) {
      return 'Not Applicable';
    }

    if (componentKey === 'Waivers & Authorizations' || componentKey === 'Waivers') {
      const hasCompletedAlias = matchingForms.some(
        (form: any) => String(form?.status || '').trim().toLowerCase() === 'completed'
      );
      const hasActiveRedo = matchingForms.some((form: any) => {
        const status = String(form?.status || '').trim().toLowerCase();
        if (status === 'pending' || status === 'requires revision' || status === 'rejected') {
          return !hasCompletedAlias;
        }
        return Boolean(String(form?.revisionRequestedAt || '').trim() || String(form?.revisionRequestedReason || '').trim());
      });
      if (hasActiveRedo) return 'Pending';

      const completedCandidate =
        matchingForms.find((form: any) => String(form?.status || '').trim().toLowerCase() === 'completed') ||
        matchingForms[0] ||
        null;
      if (!completedCandidate) return 'Pending';
      const ackOnlyComplete =
        Boolean((completedCandidate as any)?.ackHipaa) &&
        Boolean((completedCandidate as any)?.ackLiability) &&
        Boolean((completedCandidate as any)?.ackFoc) &&
        Boolean((completedCandidate as any)?.ackRoomAndBoard ?? (completedCandidate as any)?.ackSocDetermination);
      return isWaiverFormActuallyComplete(completedCandidate, application) || ackOnlyComplete ? 'Completed' : 'Pending';
    }

    const statuses = matchingForms.map((f) => String(f?.status || '').trim().toLowerCase());
    const hasRevisionRequest = matchingForms.some((form: any) => {
      const status = String(form?.status || '').trim().toLowerCase();
      if (status === 'pending' || status === 'requires revision' || status === 'rejected') return true;
      const revisionRequestedAt = String(form?.revisionRequestedAt || '').trim();
      const revisionRequestedReason = String(form?.revisionRequestedReason || '').trim();
      return Boolean(revisionRequestedAt || revisionRequestedReason);
    });
    if (hasRevisionRequest) {
      return 'Pending';
    }
    const hasPendingLikeStatus = statuses.some((status) =>
      status === 'pending' || status === 'requires revision' || status === 'rejected'
    );
    if (hasPendingLikeStatus) {
      return 'Pending';
    }

    const requiresStrictUpload = STRICT_UPLOAD_REQUIRED_FOR_COMPLETION.has(componentKey);
    const hasCompleted = statuses.some((status) => status === 'completed');
    if (requiresStrictUpload && hasCompleted) {
      const hasUploadedFile = matchingForms.some((form: any) => {
        const formStatus = String(form?.status || '').trim().toLowerCase();
        if (formStatus !== 'completed') return false;
        const filePath = String(form?.filePath || '').trim();
        const fileUrl = String(form?.downloadURL || '').trim();
        return Boolean(filePath || fileUrl);
      });
      return hasUploadedFile ? 'Completed' : 'Pending';
    }
    if (hasCompleted) {
      return 'Completed';
    }

    return 'Pending';
  };

  const doUpload = async (
    files: File[],
    requirementTitle: string,
    options?: { sequenceNumber?: number }
  ) => {
      if (!storage || !applicationId || !currentUserId) {
        console.error('Upload prerequisites missing:', { storage: !!storage, applicationId, currentUserId });
        throw new Error('Upload configuration error: Missing storage, application ID, or user ID');
      }
      await ensureAdminClaim();

      const file = files[0];
      
      // Validate file
      if (!file) {
        throw new Error('No file selected');
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error('File size exceeds 10MB limit');
      }

      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif'
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(`File type "${file.type}" not supported. Please upload PDF, Word documents, or images.`);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const existingFormInfo = formStatusMap.get(requirementTitle) as FormStatusType | undefined;
      const existingUploadCount = Array.isArray((existingFormInfo as any)?.uploadedFiles)
        ? (existingFormInfo as any).uploadedFiles.length
        : 0;
      const needsSequencedName =
        requirementTitle === 'Proof of Income' ||
        requirementTitle === 'Eligibility Screenshot' ||
        requirementTitle === 'Medicine List';
      const sequence =
        Number(options?.sequenceNumber || 0) > 0
          ? Math.floor(Number(options?.sequenceNumber))
          : needsSequencedName
            ? existingUploadCount + 1
            : 0;
      const standardFileName = buildUniqueFileName(requirementTitle, file.name, {
        sequence: sequence > 0 ? sequence : undefined,
      });
      const safeFileName = buildStorageFileName(standardFileName);
      const uploadRoot = appUserId
        ? `user_uploads/${appUserId}`
        : `documents/applications/${applicationId}`;
      const storagePath = `${uploadRoot}/${requirementTitle}/${timestamp}_${safeFileName}`;
      const storageRef = ref(storage, storagePath);

      console.log('🔄 Starting file upload:', {
        fileName: file.name,
        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        fileType: file.type,
        storagePath,
        appUserId,
        applicationId
      });

      return new Promise<{ downloadURL: string, path: string, fileName: string }>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file);

          // Set timeout for upload
          const timeout = setTimeout(() => {
            console.error('❌ Upload timeout after 5 minutes');
            reject(new Error('Upload timeout - please try again with a smaller file'));
          }, 5 * 60 * 1000);

          uploadTask.on('state_changed',
              (snapshot) => {
                  const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                  console.log(`📊 Upload progress: ${progress.toFixed(1)}%`);
                  setUploadProgress(prev => ({ ...prev, [requirementTitle]: progress }));
              },
              (error) => {
                  clearTimeout(timeout);
                  console.error('❌ Upload error:', error);
                  
                  // Provide more specific error messages
                  let errorMessage = 'Upload failed';
                  if (error.code === 'storage/unauthorized') {
                    errorMessage = 'Upload permission denied. Please contact support.';
                  } else if (error.code === 'storage/canceled') {
                    errorMessage = 'Upload was canceled';
                  } else if (error.code === 'storage/unknown') {
                    errorMessage = 'Unknown upload error. Please try again.';
                  } else if (error.code === 'storage/invalid-format') {
                    errorMessage = 'Invalid file format';
                  } else if (error.code === 'storage/invalid-argument') {
                    errorMessage = 'Invalid upload parameters';
                  }
                  
                  reject(new Error(errorMessage));
              },
              async () => {
                  clearTimeout(timeout);
                  try {
                      console.log('✅ Upload completed, getting download URL...');
                      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                      console.log('✅ Download URL obtained:', downloadURL);
                      resolve({ downloadURL, path: storagePath, fileName: standardFileName });
                  } catch (error) {
                      console.error('❌ Error getting download URL:', error);
                      reject(new Error('Upload completed but failed to get download URL'));
                  }
              }
          );
      });
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    requirementTitle: string,
    replaceExistingForm?: FormStatusType
  ) => {
    if (!event.target.files?.length) return;

    if (requirementTitle === 'SNF Facesheet') {
      const days = parseSnfResidencyDays(snfResidencyDaysInput);
      if (days == null) {
        toast({
          variant: 'destructive',
          title: 'SNF residency days required',
          description: `Enter how many days the member has been at a SNF (hospital–SNF Medicare and Medi-Cal days may be combined). Minimum requirement is ${SNF_RESIDENCY_REQUIRED_DAYS} days.`,
        });
        event.target.value = '';
        return;
      }
    }

    const files = Array.from(event.target.files);
    
    setUploading(prev => ({ ...prev, [requirementTitle]: true }));
    setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
    
    try {
        const uploadResults: Array<{ downloadURL: string; path: string; fileName: string }> = [];
        const existingFormInfoForCount =
          replaceExistingForm || (formStatusMap.get(requirementTitle) as FormStatusType | undefined);
        const baseUploadCount = Array.isArray((existingFormInfoForCount as any)?.uploadedFiles)
          ? (existingFormInfoForCount as any).uploadedFiles.length
          : 0;
        const needsSequencedName =
          requirementTitle === 'Proof of Income' ||
          requirementTitle === 'Eligibility Screenshot' ||
          requirementTitle === 'Medicine List';
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const result = await doUpload([file], requirementTitle, {
            sequenceNumber: needsSequencedName ? baseUploadCount + i + 1 : undefined,
          });
          if (result) uploadResults.push(result);
        }
        if (uploadResults.length > 0) {
            const existingFormInfo =
              replaceExistingForm || (formStatusMap.get(requirementTitle) as FormStatusType | undefined);
            const preservedExistingUploads = (Array.isArray((existingFormInfo as any)?.uploadedFiles)
              ? (existingFormInfo as any).uploadedFiles
              : []
            )
              .map((entry: any) => ({
                fileName: String(entry?.fileName || '').trim(),
                filePath: String(entry?.filePath || '').trim(),
                downloadURL: String(entry?.downloadURL || '').trim() || null,
                uploadedAtIso: String(entry?.uploadedAtIso || '').trim() || null,
              }))
              .filter((entry: any) => Boolean(entry.fileName || entry.filePath));
            const uploadTimeIso = new Date().toISOString();
            // Families can read their application doc, so new uploads store only the path; staff open them via open-upload.
            const newUploads = uploadResults.map((entry) => ({
              fileName: String(entry.fileName || '').trim() || entry.path.split('/').pop() || 'Uploaded file',
              filePath: entry.path,
              downloadURL: null,
              uploadedAtIso: uploadTimeIso,
            }));
            const combinedUploads = [...preservedExistingUploads, ...newUploads];
            const primaryUpload = combinedUploads[0] || newUploads[0];
            const snfResidencyFields: Partial<ReturnType<typeof buildSnfResidencyFormFields>> =
              requirementTitle === 'SNF Facesheet'
                ? buildSnfResidencyFormFields(snfResidencyDaysInput)
                : {};
            await handleFormStatusUpdate([{
                name: requirementTitle,
                status: 'Completed',
                type: existingFormInfo?.type || 'Upload',
                fileName: combinedUploads.map((entry) => String(entry.fileName || '').trim()).filter(Boolean).join(', '),
                filePath: String((primaryUpload as any)?.filePath || '').trim() || null,
                downloadURL: (primaryUpload as any)?.downloadURL || null,
                uploadedFiles: combinedUploads,
                dateCompleted: Timestamp.now(),
                ...snfResidencyFields,
            }]);
            toast({ title: 'Upload Successful', description: `${requirementTitle} has been uploaded.` });
            if (requirementTitle === 'SNF Facesheet' && snfResidencyFields.snfResidencyNeedsStaffReview) {
              toast({
                variant: 'destructive',
                title: 'Under 60-day SNF residency',
                description: `Recorded ${snfResidencyFields.snfResidencyDaysTotal} days — flagged for staff (below ${SNF_RESIDENCY_REQUIRED_DAYS}-day requirement).`,
              });
            }
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload file.' });
    } finally {
        setUploading(prev => ({ ...prev, [requirementTitle]: false }));
        setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
        event.target.value = '';
    }
  };



  const stripUndefinedDeep = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value
        .map((item) => stripUndefinedDeep(item))
        .filter((item) => item !== undefined);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, stripUndefinedDeep(v)])
          .filter(([, v]) => v !== undefined)
      );
    }
    return value;
  };

  const getEligibilityScreenshotUploads = (): EligibilityScreenshotUpload[] => {
    const raw = (application as any)?.eligibilityScreenshotUploads;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r: any): EligibilityScreenshotUpload => ({
        id: String(r?.id || '').trim() || `elig-${Math.random().toString(16).slice(2)}`,
        fileName: String(r?.fileName || '').trim() || 'Uploaded file',
        filePath: String(r?.filePath || '').trim() || null,
        downloadURL: String(r?.downloadURL || '').trim() || null,
        assetType: String(r?.assetType || '').trim() === 'pdf_packet' ? 'pdf_packet' : 'screenshot',
        uploadedAtIso: String(r?.uploadedAtIso || '').trim(),
        uploadedByUid: String(r?.uploadedByUid || '').trim() || null,
        uploadedByName: String(r?.uploadedByName || '').trim() || null,
      }))
      .filter((r: EligibilityScreenshotUpload) => Boolean(r.fileName));
  };

  const getHealthPlanTag = (): 'H' | 'K' | '' => {
    const plan = String((application as any)?.healthPlan || '').trim().toLowerCase();
    if (plan.includes('health net') || plan.includes('healthnet')) return 'H';
    if (plan.includes('kaiser')) return 'K';
    return '';
  };

  const getCommunicationNoteLog = (): CommunicationNoteLogEntry[] => {
    const raw = (application as any)?.communicationNoteLog;
    if (!Array.isArray(raw)) return [];
    const parsed = raw
      .map((entry: any): CommunicationNoteLogEntry => ({
        id: String(entry?.id || '').trim(),
        category: String(entry?.category || '') === 'interoffice' ? 'interoffice' : 'user_staff',
        channel: String(entry?.channel || '').trim() || 'eligibility_note',
        direction:
          String(entry?.direction || '').trim() === 'user_to_staff'
            ? 'user_to_staff'
            : String(entry?.direction || '').trim() === 'staff_to_staff'
              ? 'staff_to_staff'
              : 'staff_to_user',
        healthPlanTag: (String(entry?.healthPlanTag || '').trim() === 'H'
          ? 'H'
          : String(entry?.healthPlanTag || '').trim() === 'K'
            ? 'K'
            : '') as 'H' | 'K' | '',
        status:
          String(entry?.status || '').trim() === 'failed'
            ? 'failed'
            : String(entry?.status || '').trim() === 'blocked_duplicate'
              ? 'blocked_duplicate'
              : 'success',
        subject: String(entry?.subject || '').trim() || 'Communication note',
        messagePreview: String(entry?.messagePreview || '').trim(),
        fullMessage: String(entry?.fullMessage || '').trim() || undefined,
        recipientName: String(entry?.recipientName || '').trim() || undefined,
        recipientEmail: String(entry?.recipientEmail || '').trim() || undefined,
        authorUid: String(entry?.authorUid || '').trim() || undefined,
        authorName: String(entry?.authorName || '').trim() || undefined,
        requiresResponse: Boolean(entry?.requiresResponse),
        respondedAtIso: String(entry?.respondedAtIso || '').trim() || null,
        metadata: entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined,
        createdAtIso: String(entry?.createdAtIso || '').trim(),
        timestampMs: Number(entry?.timestampMs || 0),
      }))
      .filter((entry) => Boolean(entry.id));
    parsed.sort((a, b) => {
      const aMs = Number(a.timestampMs || new Date(a.createdAtIso || '').getTime() || 0);
      const bMs = Number(b.timestampMs || new Date(b.createdAtIso || '').getTime() || 0);
      return bMs - aMs;
    });
    return parsed;
  };

  const saveCommunicationNoteLog = async (entries: CommunicationNoteLogEntry[]) => {
    if (!docRef) return;
    const next = [...entries]
      .sort((a, b) => Number(b.timestampMs || 0) - Number(a.timestampMs || 0))
      .slice(0, 300);
    const firestoreSafeLog = next.map((entry) => stripUndefinedDeep(entry) as CommunicationNoteLogEntry);
    await setDoc(
      docRef,
      {
        communicationNoteLog: firestoreSafeLog,
        lastUpdated: serverTimestamp(),
      } as any,
      { merge: true }
    );
    setApplication((prev) =>
      prev ? ({ ...(prev as any), communicationNoteLog: firestoreSafeLog } as any) : prev
    );
  };

  const appendCommunicationNoteLog = async (
    input: Omit<CommunicationNoteLogEntry, 'id' | 'createdAtIso' | 'timestampMs' | 'healthPlanTag' | 'authorUid' | 'authorName'>
  ): Promise<CommunicationNoteLogEntry | null> => {
    if (!docRef) return null;
    const now = Date.now();
    const entry: CommunicationNoteLogEntry = {
      ...input,
      id: `comm-note-${now}-${Math.random().toString(16).slice(2)}`,
      createdAtIso: new Date(now).toISOString(),
      timestampMs: now,
      healthPlanTag: getHealthPlanTag(),
      authorUid: String(user?.uid || '').trim() || null,
      authorName: String(user?.displayName || user?.email || 'Staff').trim(),
    };
    const next = [entry, ...getCommunicationNoteLog()];
    await saveCommunicationNoteLog(next);
    return entry;
  };

  useEffect(() => {
    const uploadsWithUrls = getEligibilityScreenshotUploads().filter((upload) =>
      Boolean(String(upload.downloadURL || '').trim())
    );
    const validIds = new Set(uploadsWithUrls.map((upload) => upload.id));
    setSelectedEligibilityScreenshotIds((prev) => {
      const kept = prev.filter((id) => validIds.has(id));
      if (kept.length > 0) return kept;
      if (uploadsWithUrls.length === 0) return [];
      return uploadsWithUrls.map((upload) => upload.id);
    });
  }, [(application as any)?.eligibilityScreenshotUploads]);

  useEffect(() => {
    if (!storage || !application) return;
    const pendingPaths = new Set<string>();
    const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
    forms.forEach((form) => {
      const path = String(form?.filePath || '').trim();
      const url = String(form?.downloadURL || '').trim();
      if (path && !url && !resolvedStorageUrls[path]) pendingPaths.add(path);
      const uploadedFiles = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
      uploadedFiles.forEach((entry: any) => {
        const entryPath = String(entry?.filePath || '').trim();
        const entryUrl = String(entry?.downloadURL || '').trim();
        if (entryPath && !entryUrl && !resolvedStorageUrls[entryPath]) pendingPaths.add(entryPath);
      });
    });
    getEligibilityScreenshotUploads().forEach((upload) => {
      const path = String(upload?.filePath || '').trim();
      const url = String(upload?.downloadURL || '').trim();
      if (path && !url && !resolvedStorageUrls[path]) pendingPaths.add(path);
    });
    if (pendingPaths.size === 0) return;

    let cancelled = false;
    (async () => {
      const resolved: Record<string, string> = {};
      await Promise.all(
        Array.from(pendingPaths).map(async (path) => {
          try {
            const url = await getDownloadURL(ref(storage, path));
            if (url) resolved[path] = url;
          } catch {
            // best effort; some legacy paths may no longer exist
          }
        })
      );
      if (cancelled || Object.keys(resolved).length === 0) return;
      setResolvedStorageUrls((prev) => ({ ...prev, ...resolved }));
    })();

    return () => {
      cancelled = true;
    };
  }, [application, resolvedStorageUrls, storage]);

  const getEffectiveDownloadUrl = (downloadURL?: string | null, filePath?: string | null) => {
    const direct = String(downloadURL || '').trim();
    if (direct) return direct;
    const path = String(filePath || '').trim();
    if (!path) return '';
    return String(resolvedStorageUrls[path] || '').trim();
  };

  const upsertEligibilityScreenshotUploads = async (next: EligibilityScreenshotUpload[]) => {
    if (!docRef) return;
    await setDoc(
      docRef,
      {
        eligibilityScreenshotUploads: next,
        lastUpdated: serverTimestamp(),
      } as any,
      { merge: true }
    );
    setApplication((prev) => (prev ? ({ ...(prev as any), eligibilityScreenshotUploads: next } as any) : prev));

    if (next.length > 0) {
      await handleFormStatusUpdate([
        {
          name: 'Eligibility Screenshot',
          status: 'Completed',
          type: 'Upload',
          fileName: `${next.length} file${next.length === 1 ? '' : 's'} uploaded`,
          filePath: null,
          downloadURL: null,
          dateCompleted: Timestamp.now(),
          acknowledged: true,
        } as any,
      ]);
    } else {
      await handleFormStatusUpdate([
        {
          name: 'Eligibility Screenshot',
          status: 'Pending',
          type: 'Upload',
          fileName: null,
          filePath: null,
          downloadURL: null,
          dateCompleted: null,
          acknowledged: false,
        } as any,
      ]);
    }
  };

  const uploadEligibilityScreenshotFiles = async (files: File[]) => {
    const requirementTitle = 'Eligibility Screenshot';
    if (files.length === 0) return;

    setUploading((prev) => ({ ...prev, [requirementTitle]: true }));
    setUploadProgress((prev) => ({ ...prev, [requirementTitle]: 0 }));
    try {
      const existing = getEligibilityScreenshotUploads();
      const existingPacketPdfs = existing.filter((entry) => entry.assetType === 'pdf_packet');
      const existingScreenshots = existing.filter((entry) => entry.assetType !== 'pdf_packet');
      const nowIso = new Date().toISOString();
      const uploadedByUid = String(user?.uid || '').trim() || null;
      const uploadedByName = String(user?.displayName || user?.email || '').trim() || null;

      const results: EligibilityScreenshotUpload[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const uploadResult = await doUpload([file], requirementTitle);
        results.push({
          id: `elig-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
          fileName: uploadResult.fileName,
          filePath: uploadResult.path,
          downloadURL: uploadResult.downloadURL,
          assetType: 'screenshot',
          uploadedAtIso: nowIso,
          uploadedByUid,
          uploadedByName,
        });
      }

      const next: EligibilityScreenshotUpload[] = [...existingScreenshots, ...results];

      // Keep only one generated packet PDF (latest) and regenerate it from the uploaded screenshot batch.
      for (const priorPdf of existingPacketPdfs) {
        const priorPath = String(priorPdf.filePath || '').trim();
        if (!priorPath || !storage) continue;
        await deleteObject(ref(storage, priorPath)).catch(() => undefined);
      }
      const eligibilityPacketFile = await (async () => {
        try {
          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.create();

          for (const imageFile of files) {
            const mime = String(imageFile.type || '').toLowerCase();
            const bytes = new Uint8Array(await imageFile.arrayBuffer());
            let embedded: any = null;

            if (mime.includes('png')) {
              embedded = await pdfDoc.embedPng(bytes);
            } else if (mime.includes('jpeg') || mime.includes('jpg')) {
              embedded = await pdfDoc.embedJpg(bytes);
            } else {
              // Fallback unsupported image formats to PNG via canvas.
              const bitmap = await createImageBitmap(imageFile);
              const canvas = document.createElement('canvas');
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              const context = canvas.getContext('2d');
              if (!context) {
                bitmap.close();
                continue;
              }
              context.drawImage(bitmap, 0, 0);
              bitmap.close();
              const convertedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
              if (!convertedBlob) continue;
              const convertedBytes = new Uint8Array(await convertedBlob.arrayBuffer());
              embedded = await pdfDoc.embedPng(convertedBytes);
            }

            if (!embedded) continue;
            const page = pdfDoc.addPage([embedded.width, embedded.height]);
            page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
          }

          if (pdfDoc.getPageCount() === 0) return null;
          const pdfBytes = await pdfDoc.save();
          const memberName = `${String(application?.memberFirstName || '').trim()} ${String(application?.memberLastName || '').trim()}`
            .trim()
            .replace(/[^\w\s.-]/g, '')
            .replace(/\s+/g, ' ');
          const pdfNameBase = memberName ? `${memberName} - Eligibility Screenshots` : 'Eligibility Screenshots';
          return new globalThis.File([pdfBytes], `${pdfNameBase}.pdf`, { type: 'application/pdf' });
        } catch (packetError) {
          console.warn('Failed to generate eligibility screenshot packet PDF:', packetError);
          return null;
        }
      })();

      if (eligibilityPacketFile) {
        const packetUpload = await doUpload([eligibilityPacketFile], requirementTitle);
        next.push({
          id: `elig-pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          fileName: packetUpload.fileName,
          filePath: packetUpload.path,
          downloadURL: packetUpload.downloadURL,
          assetType: 'pdf_packet',
          uploadedAtIso: nowIso,
          uploadedByUid,
          uploadedByName,
        });
      }

      await upsertEligibilityScreenshotUploads(next);
      toast({
        title: 'Upload Successful',
        description: `${results.length} eligibility screenshot${results.length === 1 ? '' : 's'} uploaded${eligibilityPacketFile ? ' and packet PDF created' : ''}.`,
      });
    } catch (e) {
      console.error('Eligibility screenshot upload failed:', e);
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: 'Could not upload eligibility screenshots.',
      });
    } finally {
      setUploading((prev) => ({ ...prev, [requirementTitle]: false }));
      setUploadProgress((prev) => ({ ...prev, [requirementTitle]: 0 }));
    }
  };

  const getImageFilesFromClipboardItems = (items?: DataTransferItemList | null): File[] => {
    if (!items) return [];
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || item.kind !== 'file' || !String(item.type || '').startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    return files;
  };

  const handleEligibilityScreenshotUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const files = Array.from(event.target.files);
    try {
      await uploadEligibilityScreenshotFiles(files);
    } finally {
      event.target.value = '';
    }
  };

  const handleEligibilityScreenshotPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = getImageFilesFromClipboardItems(event.clipboardData?.items);
    if (files.length === 0) return;
    event.preventDefault();
    await uploadEligibilityScreenshotFiles(files);
  };

  const pasteEligibilityScreenshotFromClipboard = async () => {
    const focusPasteZone = () => {
      eligibilityPasteZoneRef.current?.focus();
    };
    const openFilePickerFallback = () => {
      if (eligibilityScreenshotInputRef.current) {
        eligibilityScreenshotInputRef.current.click();
      }
    };
    if (eligibilityClipboardBlocked) {
      focusPasteZone();
      toast({
        title: 'Paste with Ctrl+V',
        description: 'Clipboard read is blocked by browser permission. Click inside the Eligibility Screenshot card and press Ctrl+V.',
      });
      return;
    }
    if (
      !navigator?.clipboard ||
      typeof navigator.clipboard.read !== 'function' ||
      typeof globalThis.File !== 'function'
    ) {
      setEligibilityClipboardBlocked(true);
      toast({
        title: 'Paste unavailable',
        description: 'Direct clipboard read is not supported here. Click inside the Eligibility Screenshot card and press Ctrl+V.',
      });
      focusPasteZone();
      return;
    }

    setEligibilityPasteLoading(true);
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i] as any;
        const types: string[] = Array.isArray(item?.types) ? item.types : [];
        const imageType = types.find((type) => String(type).startsWith('image/'));
        if (!imageType || typeof item?.getType !== 'function') continue;
        const blob = await item.getType(imageType);
        const ext = String(imageType.split('/')[1] || 'png').toLowerCase();
        files.push(
          new globalThis.File([blob], `eligibility-screenshot-${Date.now()}-${i}.${ext}`, {
            type: imageType,
          })
        );
      }

      if (files.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No image found',
          description: 'Copy a screenshot to your clipboard first, then click Paste Screenshot.',
        });
        return;
      }

      await uploadEligibilityScreenshotFiles(files);
    } catch (error: any) {
      const rawMessage = String(error?.message || '').trim();
      const normalizedMessage = rawMessage.toLowerCase();
      const isClipboardPermissionError =
        normalizedMessage.includes('read permission denied') ||
        normalizedMessage.includes('notallowederror') ||
        normalizedMessage.includes('permission denied');
      if (isClipboardPermissionError) {
        setEligibilityClipboardBlocked(true);
        focusPasteZone();
      }
      toast({
        variant: isClipboardPermissionError ? 'default' : 'destructive',
        title: isClipboardPermissionError ? 'Clipboard blocked' : 'Paste failed',
        description: isClipboardPermissionError
          ? 'Clipboard read is blocked by browser permissions. Click in the Eligibility Screenshot card and press Ctrl+V.'
          : String(error?.message || 'Could not read image from clipboard.'),
      });
    } finally {
      setEligibilityPasteLoading(false);
    }
  };

  const removeEligibilityScreenshotUpload = async (upload: EligibilityScreenshotUpload) => {
    if (!storage) return;
    const current = getEligibilityScreenshotUploads();
    const next = current.filter((u) => u.id !== upload.id);
    try {
      if (upload.filePath) {
        await deleteObject(ref(storage, upload.filePath));
      }
    } catch (e) {
      console.warn('Failed to delete eligibility screenshot from storage (continuing):', e);
    }
    await upsertEligibilityScreenshotUploads(next);
    toast({ title: 'Removed', description: 'Eligibility screenshot removed.' });
  };

  const resetEligibilityUploads = async () => {
    if (isResettingEligibilityUploads) return;
    setIsResettingEligibilityUploads(true);
    try {
      const screenshotUploads = getEligibilityScreenshotUploads();
      const screenshotDeleteTasks = screenshotUploads
        .map((upload) => String(upload.filePath || '').trim())
        .filter(Boolean)
        .map((filePath) => {
          if (!storage) return Promise.resolve();
          return deleteObject(ref(storage, filePath)).catch(() => undefined);
        });
      await Promise.all(screenshotDeleteTasks);
      await upsertEligibilityScreenshotUploads([]);

      const otherEligibilityUpdates: FormStatusUpdate[] = [];
      for (const req of eligibilityRequirements) {
        if (req.id === 'eligibility-screenshot' || req.type !== 'Upload') continue;
        const formInfo = formStatusMap.get(req.title) as any;
        if (!formInfo) continue;
        const filePath = String(formInfo?.filePath || '').trim();
        if (filePath && storage) {
          await deleteObject(ref(storage, filePath)).catch(() => undefined);
        }
        otherEligibilityUpdates.push({
          name: req.title,
          status: 'Pending',
          fileName: null,
          filePath: null,
          downloadURL: null,
          dateCompleted: null,
          acknowledged: false,
        });
      }

      if (otherEligibilityUpdates.length > 0) {
        await handleFormStatusUpdate(otherEligibilityUpdates);
      }

      toast({
        title: 'Eligibility uploads reset',
        description: 'All eligibility screenshots and uploaded files were removed. You can start over.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Reset failed',
        description: String(error?.message || 'Could not reset eligibility uploads.'),
      });
    } finally {
      setIsResettingEligibilityUploads(false);
    }
  };

  const handleConsolidatedUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    const files = Array.from(event.target.files);

    const formsToUpdate = Object.entries(consolidatedUploadChecks)
      .filter(([, isChecked]) => isChecked)
      .map(([formName]) => formName);
      
    if (formsToUpdate.length === 0) return;

    if (formsToUpdate.includes('SNF Facesheet')) {
      const days = parseSnfResidencyDays(snfResidencyDaysInput);
      if (days == null) {
        toast({
          variant: 'destructive',
          title: 'SNF residency days required',
          description: `Before uploading SNF Facesheet, enter days at SNF (combined hospital–SNF Medicare and Medi-Cal days OK). Minimum requirement is ${SNF_RESIDENCY_REQUIRED_DAYS} days.`,
        });
        event.target.value = '';
        return;
      }
    }

    const consolidatedId = 'consolidated-medical-upload';
    setUploading(prev => ({ ...prev, [consolidatedId]: true }));
    setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));

    try {
        // We'll just use the first file's name for display purposes if multiple are selected
        const file = files[0];
        const uploadResult = await doUpload(files, 'consolidated_medical');
        if (uploadResult) {
            const updates: Partial<FormStatusType>[] = formsToUpdate.map(formName => ({
                name: formName,
                status: 'Completed',
                type: 'Upload',
                fileName: buildUniqueFileName(formName, file.name),
                filePath: uploadResult.path,
                downloadURL: null,
                dateCompleted: Timestamp.now(),
                ...(formName === 'SNF Facesheet' ? buildSnfResidencyFormFields(snfResidencyDaysInput) : {}),
            }));
            updates.push({
              name: 'Consolidated Medical Documents',
              status: 'Completed',
              type: 'Upload',
              dateCompleted: Timestamp.now(),
              acknowledged: false,
              acknowledgedBy: null,
              acknowledgedByUid: null,
              acknowledgedDate: null,
            });
            await handleFormStatusUpdate(updates);
            toast({ title: 'Upload Successful', description: 'Consolidated documents have been uploaded.' });
        }
    } catch(error) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload consolidated documents.' });
    } finally {
        setUploading(prev => ({ ...prev, [consolidatedId]: false }));
        setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));
        setConsolidatedUploadChecks({
          'Waivers & Authorizations': false,
          'LIC 602A - Physician\'s Report': false,
          'Medicine List': false,
          'SNF Facesheet': false,
          'Declaration of Eligibility': false,
        });
        event.target.value = '';
    }
  };

  const handleFileRemove = async (form: FormStatusType) => {
      const uploadPaths = [
        String(form.filePath || '').trim(),
        ...((Array.isArray((form as any)?.uploadedFiles) ? (form as any).uploadedFiles : [])
          .map((entry: any) => String(entry?.filePath || '').trim())
          .filter(Boolean)),
      ].filter(Boolean);

      if (uploadPaths.length === 0) {
        await handleFormStatusUpdate([
          { name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null, uploadedFiles: [] as any }
        ]);
        return;
      }

      try {
          await Promise.all(uploadPaths.map((path) => deleteObject(ref(storage, path)).catch(() => undefined)));
          await handleFormStatusUpdate([
            { name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null, uploadedFiles: [] as any }
          ]);
          toast({ title: 'File Removed', description: `${form.fileName} has been removed.` });
      } catch (error) {
          console.error("Error removing file:", error);
          const errorCode = (error as any)?.code;
          await handleFormStatusUpdate([
            { name: form.name, status: 'Pending', fileName: null, filePath: null, downloadURL: null, uploadedFiles: [] as any }
          ]);
          if (errorCode === 'storage/unauthorized') {
            toast({ title: 'File Reset', description: 'Access denied to delete the original file. The card was reset so you can re-upload.' });
            return;
          }
          toast({ variant: 'destructive', title: 'Error', description: 'Could not remove file. It may have already been deleted.' });
      }
  };

  const removeUploadedFormFile = async (
    form: FormStatusType,
    target: { fileName?: string; filePath?: string; downloadURL?: string; index?: number }
  ) => {
    const targetPath = String(target.filePath || '').trim();
    const targetUrl = String(target.downloadURL || '').trim();
    const targetName = String(target.fileName || '').trim();
    const targetIndex = typeof target.index === 'number' && target.index >= 0 ? target.index : -1;

    const existingUploads = (
      Array.isArray((form as any)?.uploadedFiles) && (form as any).uploadedFiles.length > 0
        ? (form as any).uploadedFiles
        : [
            {
              fileName: (form as any)?.fileName || 'Uploaded file',
              filePath: (form as any)?.filePath || '',
              downloadURL: (form as any)?.downloadURL || '',
            },
          ]
    )
      .map((entry: any) => ({
        fileName: String(entry?.fileName || '').trim(),
        filePath: String(entry?.filePath || '').trim(),
        downloadURL: String(entry?.downloadURL || '').trim() || null,
        uploadedAtIso: String(entry?.uploadedAtIso || '').trim() || null,
        displayTitle: String(entry?.displayTitle || '').trim() || null,
        incomeMonth: String(entry?.incomeMonth || '').trim() || null,
        documentDate: String(entry?.documentDate || '').trim() || null,
      }))
      .filter((entry: any) => Boolean(entry.fileName || entry.filePath || entry.downloadURL));

    // Prefer explicit row index so identical Proof of Income names still delete the clicked file.
    let removeIndex =
      targetIndex >= 0 && targetIndex < existingUploads.length ? targetIndex : -1;
    if (removeIndex < 0) {
      for (let i = 0; i < existingUploads.length; i++) {
        const entry = existingUploads[i];
        if (targetPath && entry.filePath === targetPath) {
          removeIndex = i;
          break;
        }
        if (targetUrl && String(entry.downloadURL || '').trim() === targetUrl) {
          removeIndex = i;
          break;
        }
        if (targetName && entry.fileName === targetName) {
          removeIndex = i;
          break;
        }
      }
    }

    if (removeIndex < 0) {
      toast({
        variant: 'destructive',
        title: 'Could not remove file',
        description: 'The selected file was not found on this card.',
      });
      return;
    }

    const removedEntry = existingUploads[removeIndex];
    const remainingUploads = existingUploads.filter((_: any, i: number) => i !== removeIndex);

    const storagePath = String(removedEntry.filePath || targetPath || '').trim();
    if (storagePath && storage) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (error) {
        // Staff often cannot delete family user_uploads paths; clear the card entry anyway.
        console.warn('Failed to delete uploaded form file from storage (continuing):', error);
      }
    }

    if (remainingUploads.length === 0) {
      await handleFormStatusUpdate([
        {
          name: form.name,
          status: 'Pending',
          fileName: null,
          filePath: null,
          downloadURL: null,
          uploadedFiles: [] as any,
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          dateCompleted: null,
        },
      ]);
      toast({ title: 'File Removed', description: `${removedEntry.fileName || 'File'} has been removed.` });
      return;
    }

    const primaryUpload = remainingUploads[0];
    await handleFormStatusUpdate([
      {
        name: form.name,
        status: 'Completed',
        type: form.type || 'Upload',
        fileName: remainingUploads.map((entry: any) => String(entry.fileName || '').trim()).filter(Boolean).join(', '),
        filePath: String(primaryUpload?.filePath || '').trim() || null,
        downloadURL: String(primaryUpload?.downloadURL || '').trim() || null,
        uploadedFiles: remainingUploads,
        acknowledged: false,
        acknowledgedBy: null,
        acknowledgedByUid: null,
        acknowledgedDate: null,
      },
    ]);
    toast({ title: 'File Removed', description: `${removedEntry.fileName || 'File'} has been removed.` });
  };

  const getPrimaryContactDisplayName = () => {
    if (!application) return '';
    const first = String(
      (application as any)?.bestContactFirstName ||
        (application as any)?.contactFirstName ||
        (application as any)?.primaryContactFirstName ||
        ''
    ).trim();
    const last = String(
      (application as any)?.bestContactLastName ||
        (application as any)?.contactLastName ||
        (application as any)?.primaryContactLastName ||
        ''
    ).trim();
    const combined = `${first} ${last}`.trim();
    if (combined) return combined;
    return String(
      (application as any)?.bestContactName ||
        (application as any)?.primaryContactName ||
        (application as any)?.contactName ||
        ''
    ).trim();
  };

  const buildDefaultRevisionRequestBody = (formName: string, scope: 'info' | 'form' = 'info') => {
    const contactName = getPrimaryContactDisplayName() || 'there';
    if (scope === 'info') {
      return (
        `Hi ${contactName},\n\n` +
        `We need additional information for ${formName}. Please reply with or upload what we are requesting below:\n\n` +
        `• \n`
      );
    }
    return (
      `Hi ${contactName},\n\n` +
      `Please redo ${formName} in the portal so we can continue processing this application.\n\n`
    );
  };

  const openRevisionRequestDialog = (formName: string, scope: 'info' | 'form' = 'info') => {
    const looksLikeEmail = (value: unknown) => {
      const email = String(value || '').trim().toLowerCase();
      if (!email || email === 'n/a' || email === 'na' || email === 'none' || email === 'null') return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };
    const hasPrimary = [
      (application as any)?.bestContactEmail,
      (application as any)?.primaryContactEmail,
      (application as any)?.contactEmail,
      (application as any)?.linkedToFamilyEmail,
    ].some((v) => looksLikeEmail(v));
    const hasCreator = [
      (application as any)?.referrerEmail,
      (application as any)?.submittedByEmail,
      (application as any)?.createdByEmail,
      (application as any)?.submitterEmail,
    ].some((v) => looksLikeEmail(v));

    setRejectScopeByForm((prev) => ({ ...prev, [formName]: scope }));
    setRejectEmailBodyByForm((prev) => ({
      ...prev,
      [formName]: String(prev[formName] || '').trim() || buildDefaultRevisionRequestBody(formName, scope),
    }));
    setRejectUseSameLinkByForm((prev) => ({ ...prev, [formName]: prev[formName] ?? true }));
    setRejectEmailRecipientByForm((prev) => ({
      ...prev,
      [formName]: prev[formName] || (hasPrimary ? 'primary' : hasCreator ? 'creator' : 'primary'),
    }));
    setRejectDialogForm(formName);
  };

  const openProofIncomeAdditionalDocEmail = () => {
    const formName = 'Proof of Income';
    const contactName = getPrimaryContactDisplayName() || 'there';
    const defaultBody =
      `Hi ${contactName},\n\n` +
      'We still need an additional Proof of Income document for this member. Please upload another document (for example a Social Security award letter or recent bank statements) in the portal so we can continue processing.';
    setRejectEmailBodyByForm((prev) => ({
      ...prev,
      [formName]: String(prev[formName] || '').trim() || defaultBody,
    }));
    openRevisionRequestDialog(formName, 'info');
  };

  const markFormAsComplete = async (formName: string) => {
    if (!application || !applicationId) return;
    if (STRICT_UPLOAD_REQUIRED_FOR_COMPLETION.has(formName)) {
      toast({
        variant: 'destructive',
        title: 'Upload required',
        description: `${formName} cannot be marked complete without uploading the required document.`,
      });
      return;
    }

    const receivedByEmail = ALLOW_COMPLETE_WITHOUT_UPLOAD.has(formName);
    
    try {
      await handleFormStatusUpdate([{
        name: formName,
        status: 'Completed',
        fileName: receivedByEmail
          ? 'Received by email (marked complete by staff)'
          : 'Marked complete by admin',
        dateCompleted: Timestamp.now(),
        completedBy: user?.displayName || 'Admin',
        completedWithoutUpload: receivedByEmail ? true : undefined,
        receivedByEmail: receivedByEmail ? true : undefined,
      }]);
      
      toast({
        title: 'Form Marked Complete',
        description: receivedByEmail
          ? `${formName} marked complete (received by email / outside the portal).`
          : `${formName} has been marked as completed.`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
    } catch (error) {
      console.error('Error marking form as complete:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not mark form as complete. Please try again.',
      });
    }
  };

  useEffect(() => {
    if (!docRef || !application) return;
    const isKaiserPlanLocal = String((application as any)?.healthPlan || '').trim().toLowerCase().includes('kaiser');
    if (!isKaiserPlanLocal) return;
    const kaiserAuthorizationMode = String((application as any)?.kaiserAuthorizationMode || '').trim().toLowerCase();
    const isKaiserAuthReceivedIntakeLocal =
      kaiserAuthorizationMode === 'authorization_received'
        ? true
        : kaiserAuthorizationMode === 'authorization_needed'
          ? false
          : Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
            String((application as any)?.intakeType || '').trim().toLowerCase() === 'kaiser_auth_received_via_ils' ||
            String((application as any)?.status || '').trim().toLowerCase() === 'authorization received (doc collection)';
    if (!isKaiserAuthReceivedIntakeLocal) return;
    const appId = String((application as any)?.id || applicationId || '').trim();
    if (!appId) return;
    const key = `${appId}:authorized-calaim-backfill`;
    if (authorizedCalaimBackfillRef.current === key) return;
    const currentCalaimStatus = String((application as any)?.caspioCalAIMStatus || '').trim().toLowerCase();
    const needsBackfill = !currentCalaimStatus || currentCalaimStatus === 'pending';
    if (!needsBackfill) return;
    authorizedCalaimBackfillRef.current = key;
    void (async () => {
      try {
        const updateData = {
          caspioCalAIMStatus: 'Authorized',
          lastUpdated: serverTimestamp(),
        };
        await setDoc(docRef, updateData, { merge: true });
        setApplication((prev) => (prev ? ({ ...prev, ...updateData } as any) : prev));
      } catch (error) {
        console.warn('Failed to backfill Authorized CalAIM status for authorized Kaiser intake:', error);
      }
    })();
  }, [application, applicationId, docRef]);

  const reversePullWillUpdateItems = useMemo(() => {
    const items = reversePullPreview?.preview?.items || [];
    return items.filter(
      (item) =>
        item.status === 'fill_empty' ||
        (reversePullIncludeOverwrites && item.status === 'overwrite')
    );
  }, [reversePullPreview, reversePullIncludeOverwrites]);

  const reversePullOverwriteItems = useMemo(() => {
    const items = reversePullPreview?.preview?.items || [];
    return items.filter((item) => item.status === 'overwrite');
  }, [reversePullPreview]);

  const reversePullVisibleItems = useMemo(() => {
    const items = reversePullPreview?.preview?.items || [];
    if (reversePullShowOnlyMissing) {
      return items.filter((item) => item.status === 'fill_empty');
    }
    if (reversePullShowWillUpdateOnly) {
      return items.filter(
        (item) =>
          item.status === 'fill_empty' ||
          (reversePullIncludeOverwrites && item.status === 'overwrite')
      );
    }
    return items;
  }, [
    reversePullPreview,
    reversePullShowOnlyMissing,
    reversePullShowWillUpdateOnly,
    reversePullIncludeOverwrites,
  ]);

  if (isLoading || isUserLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Details...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-full">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-full">
          <p>{applicationId ? 'Application not found.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const pathwayRequirements = getPathwayRequirements(
    application.pathway as 'SNF Transition' | 'SNF Diversion',
    application.healthPlan,
    application.currentLocation
  );
  const showSnfFacesheet = requiresSnfFacesheet({
    pathway: application.pathway,
    currentLocation: application.currentLocation,
  });
  const eligibilityRequirementIds = new Set([
    'eligibility-screenshot',
    'primary-contact-screenshot',
  ]);
  const eligibilityRequirements = pathwayRequirements.filter(req => eligibilityRequirementIds.has(req.id));
  const displayedPathwayRequirements = (() => {
    const items = pathwayRequirements.filter((req) => !eligibilityRequirementIds.has(req.id));
    const roomBoardIdx = items.findIndex((req) => req.id === 'room-board-obligation');
    if (roomBoardIdx > -1) {
      const [roomBoard] = items.splice(roomBoardIdx, 1);
      items.push(roomBoard);
    }
    return items;
  })();
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f]));
  const customerFeedbackFormInfo = formStatusMap.get('Customer Feedback Survey') as any;
  const customerFeedbackRating = Number(
    customerFeedbackFormInfo?.feedbackRating ?? (application as any)?.customerFeedbackRating ?? 0
  );
  const customerFeedbackComments = String(
    customerFeedbackFormInfo?.feedbackComments ?? (application as any)?.customerFeedbackComments ?? ''
  ).trim();
  const customerFeedbackSubmittedAtMs = toMillisSafe(
    customerFeedbackFormInfo?.dateCompleted ??
      (application as any)?.customerFeedbackSubmittedAt ??
      (application as any)?.customerFeedbackSubmittedAtIso
  );
  const customerFeedbackSubmittedAtLabel = customerFeedbackSubmittedAtMs
    ? format(new Date(customerFeedbackSubmittedAtMs), 'MMM d, yyyy h:mm a')
    : '';
  const showCustomerFeedbackCard =
    Boolean(customerFeedbackFormInfo) || customerFeedbackRating > 0 || customerFeedbackComments.length > 0;
  const hasEligibilityUploadsToReset = (() => {
    if (getEligibilityScreenshotUploads().length > 0) return true;
    return eligibilityRequirements.some((req) => {
      if (req.id === 'eligibility-screenshot' || req.type !== 'Upload') return false;
      const formInfo = formStatusMap.get(req.title) as any;
      return Boolean(formInfo?.fileName || formInfo?.filePath || formInfo?.downloadURL);
    });
  })();
  const hasEligibilityUploadEvidence = hasEligibilityUploadsToReset;
  if (!formStatusMap.get('Room and Board/Tier Level Agreement') && formStatusMap.get('Room and Board/Tier Level Commitment')) {
    formStatusMap.set('Room and Board/Tier Level Agreement', formStatusMap.get('Room and Board/Tier Level Commitment') as any);
  } else if (!formStatusMap.get('Room and Board/Tier Level Agreement') && formStatusMap.get('Room and Board Commitment')) {
    formStatusMap.set('Room and Board/Tier Level Agreement', formStatusMap.get('Room and Board Commitment') as any);
  }
  if (!formStatusMap.get('Waivers & Authorizations') && formStatusMap.get('Waivers')) {
    formStatusMap.set('Waivers & Authorizations', formStatusMap.get('Waivers') as any);
  } else if (!formStatusMap.get('Waivers') && formStatusMap.get('Waivers & Authorizations')) {
    formStatusMap.set('Waivers', formStatusMap.get('Waivers & Authorizations') as any);
  }
  const waiverAliasNames = new Set(['Waivers & Authorizations', 'Waivers']);
  const waiverAliasForms = (application.forms || []).filter((form: any) => {
    const formName = String(form?.name || '').trim();
    return waiverAliasNames.has(formName) || isWaiverFormName(formName);
  }) as any[];
  const waiverAliasStatuses = waiverAliasForms.map((form) => String(form?.status || '').trim().toLowerCase());
  const waiverHasPendingLikeStatus = waiverAliasStatuses.some(
    (status) => status === 'pending' || status === 'requires revision' || status === 'rejected'
  );
  const waiverHasCompletedStatus = waiverAliasStatuses.some((status) => status === 'completed');
  const waiverHasRevisionRequest = waiverAliasForms.some((form: any) => {
    const status = String(form?.status || '').trim().toLowerCase();
    if (status === 'pending' || status === 'requires revision' || status === 'rejected') return true;
    return Boolean(String(form?.revisionRequestedAt || '').trim() || String(form?.revisionRequestedReason || '').trim());
  });
  const waiverIsCompleted = getComponentStatus('Waivers & Authorizations') === 'Completed';
  const waiverSourceForm = (() => {
    return (
      waiverAliasForms.find((form) => String(form?.status || '').trim().toLowerCase() === 'completed') ||
      waiverAliasForms.find((form) =>
        ['pending', 'requires revision', 'rejected'].includes(String(form?.status || '').trim().toLowerCase())
      ) ||
      waiverAliasForms[0] ||
      null
    );
  })();
  if (waiverSourceForm) {
    const waiverEffectiveForm = {
      ...waiverSourceForm,
      status: waiverIsCompleted ? 'Completed' : 'Pending',
      ackHipaa: Boolean((waiverSourceForm as any)?.ackHipaa),
      ackLiability: Boolean((waiverSourceForm as any)?.ackLiability),
      ackFoc: Boolean((waiverSourceForm as any)?.ackFoc),
      ackRoomAndBoard: Boolean(
        (waiverSourceForm as any)?.ackRoomAndBoard ??
          (application as any)?.ackRoomAndBoard ??
          (waiverSourceForm as any)?.ackSocDetermination ??
          (application as any)?.ackSocDetermination
      ),
      ackSocDetermination: Boolean((waiverSourceForm as any)?.ackSocDetermination),
    } as any;
    formStatusMap.set('Waivers & Authorizations', waiverEffectiveForm);
    formStatusMap.set('Waivers', waiverEffectiveForm);
  }
  const getCanonicalFormName = (raw: unknown) => {
    const name = String(raw || '').trim();
    if (name === 'Waivers') return 'Waivers & Authorizations';
    if (name === 'Room and Board/Tier Level Commitment' || name === 'Room and Board Commitment') {
      return 'Room and Board/Tier Level Agreement';
    }
    return name;
  };
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const processTrackerStatuses = quickStatusItems.map((item) => ({
    item,
    status: getComponentStatus(item.key),
  }));
  const processTrackerApplicable = processTrackerStatuses.filter((entry) => entry.status !== 'Not Applicable');
  const processTrackerCompletedCount = processTrackerApplicable.filter((entry) => entry.status === 'Completed').length;
  const processTrackerTotalCount = processTrackerApplicable.length;
  const processTrackerProgress = processTrackerTotalCount > 0 ? (processTrackerCompletedCount / processTrackerTotalCount) * 100 : 0;
  const eligibilityCompleted = getComponentStatus('Eligibility Check') === 'Completed';
  const caspioPushed = Boolean((application as any)?.caspioSent);
  const csSummaryCaspioSyncAtMs = toMillisSafe((application as any)?.csSummaryReversePullAppliedAt);
  const csSummaryCaspioSyncLabel = csSummaryCaspioSyncAtMs
    ? format(new Date(csSummaryCaspioSyncAtMs), 'MMM d, yyyy h:mm a')
    : '';
  const csSummaryCaspioSyncMode = String((application as any)?.csSummaryReversePullMode || '').trim();
  const assignedStaffName = String((application as any)?.assignedStaffName || '').trim();
  const assignedStaffId = String((application as any)?.assignedStaffId || '').trim();
  const assignedStaffEmail = String((application as any)?.assignedStaffEmail || '').trim();
  const unacknowledgedDocsCount = countPendingDocumentReviews(application.forms || []);
  const isRequiresRevision = String((application as any)?.status || '').trim().toLowerCase() === 'requires revision';
  const referralSubmission = (application as any)?.kaiserReferralSubmission || {};
  const referralStep5 = (application as any)?.kaiserReferralStep5 || {};
  const referralAlreadySent = Boolean(
    referralSubmission?.submitted ||
      referralSubmission?.submittedAt ||
      referralSubmission?.submittedAtIso ||
      referralSubmission?.providerMessageId ||
      referralStep5?.acknowledged ||
      referralStep5?.acknowledgedAt ||
      referralStep5?.acknowledgedAtIso
  );
  const hasRevisionPhase = (application.forms || []).some((form: any) => {
    const formStatus = String(form?.status || '').trim().toLowerCase();
    if (formStatus === 'requires revision') return true;
    return Boolean(String(form?.revisionRequestedAt || '').trim() || String(form?.revisionRequestedReason || '').trim());
  });
  const hasRevisionEmailSent = (application.forms || []).some((form: any) => {
    const sentAt = String(form?.revisionEmailSentAt || '').trim();
    if (sentAt) return true;
    const history = Array.isArray(form?.revisionHistory) ? form.revisionHistory : [];
    return history.some((entry: any) => Boolean(entry?.emailed));
  });
  const kaiserAuthorizationModeEarly = String((application as any)?.kaiserAuthorizationMode || '')
    .trim()
    .toLowerCase();
  const isKaiserAuthReceivedIntakeEarly =
    kaiserAuthorizationModeEarly === 'authorization_received'
      ? true
      : kaiserAuthorizationModeEarly === 'authorization_needed'
        ? false
        : Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
          String((application as any)?.intakeType || '').trim().toLowerCase() ===
            'kaiser_auth_received_via_ils' ||
          String((application as any)?.status || '').trim().toLowerCase() ===
            'authorization received (doc collection)';
  // Flag means: unacknowledged docs still need manager review, and Kaiser referral
  // has not been completed yet. Auth-already-received intakes skip the referral step.
  const kaiserManagerActionRequired =
    isKaiserPlan &&
    unacknowledgedDocsCount > 0 &&
    !isRequiresRevision &&
    !hasRevisionPhase &&
    String((application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || '')
      .trim()
      .toLowerCase() !== 'r&b sent pending ils contract' &&
    !isKaiserAuthReceivedIntakeEarly &&
    !referralAlreadySent &&
    !(isRequiresRevision && hasRevisionEmailSent);
  const staffAssigned = Boolean(
    String((application as any)?.assignedStaffId || '').trim() ||
    assignedStaffName
  );
  const caspioSentDateRaw = (application as any)?.caspioSentDate;
  const caspioSentDateLabel = caspioSentDateRaw
    ? format(
        typeof caspioSentDateRaw?.toDate === 'function'
          ? caspioSentDateRaw.toDate()
          : new Date(caspioSentDateRaw),
        'MMM d, yyyy h:mm a'
      )
    : '';
  const caspioSentByName = String(
    (application as any)?.caspioSentByName ||
    (application as any)?.caspioSentBy ||
    (application as any)?.caspioSentByEmail ||
    ''
  ).trim();
  const currentKaiserStatus = (() => {
    return String((application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || '').trim();
  })();
  const currentSocialWorkerHold = String(
    (application as any)?.holdForSocialWorkerStatus ||
    (application as any)?.Hold_For_Social_Worker_Visit ||
    (application as any)?.Hold_For_Social_Worker ||
    ''
  ).trim() || DEFAULT_SOCIAL_WORKER_HOLD_VALUE;
  const serviceStartEmailsBlockedReason =
    isKaiserPlan && normalizeStatusToken(currentKaiserStatus) === normalizeStatusToken('T2038 Requested')
      ? 'Not available while Kaiser status is T2038 Requested — wait for the T2038 authorization.'
      : undefined;
  const kaiserStatusPickerValue = currentKaiserStatus;
  const kaiserPrePushSelectionValue = isRequiredPrePushKaiserStatus(kaiserStatusPickerValue)
    ? kaiserStatusPickerValue
    : '';
  const kaiserStatusSelectedForCaspio = Boolean(kaiserPrePushSelectionValue);
  const isKaiserNotInterested = isNotInterestedKaiserStatus(kaiserStatusPickerValue);
  // Match case/punctuation-insensitively (Caspio stores e.g. "T2038 received, doc collection").
  const kaiserStatusOptionMatch = [...prePushKaiserStatusOptions, ...laterKaiserStatusOptions].find(
    (option) => normalizeStatusToken(option) === normalizeStatusToken(kaiserStatusPickerValue)
  );
  const kaiserStatusIsUnlisted = Boolean(kaiserStatusPickerValue && !kaiserStatusOptionMatch);
  const kaiserStatusSelectValue = kaiserStatusPickerValue
    ? kaiserStatusOptionMatch || kaiserStatusPickerValue
    : '__none__';
  const memberFirstNameDisplay = String(
    (application as any)?.memberFirstName ||
    (application as any)?.Member_First_Name ||
    ''
  ).trim();
  const memberLastNameDisplay = String(
    (application as any)?.memberLastName ||
    (application as any)?.Member_Last_Name ||
    ''
  ).trim();
  const memberNameDisplay = (
    memberLastNameDisplay && memberFirstNameDisplay
      ? `${memberLastNameDisplay}, ${memberFirstNameDisplay}`
      : memberLastNameDisplay || memberFirstNameDisplay
  ) ||
    String((application as any)?.memberName || '').trim() ||
    '—';
  const memberHeadingName = (() => {
    const normalizeNameForHeading = (value: unknown) =>
      String(value || '')
        .trim()
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    const first = normalizeNameForHeading((application as any)?.memberFirstName || '');
    const last = normalizeNameForHeading((application as any)?.memberLastName || '');
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    const fallback = normalizeNameForHeading((application as any)?.memberName || '');
    if (fallback.includes(',')) {
      const [lastRaw, firstRaw] = fallback.split(',', 2);
      const firstFromComma = normalizeNameForHeading(firstRaw || '');
      const lastFromComma = normalizeNameForHeading(lastRaw || '');
      return `${firstFromComma} ${lastFromComma}`.trim() || 'Member';
    }
    return fallback || 'Member';
  })();
  const memberMrnDisplay =
    stripMrnSeparators(
      (application as any)?.memberMrn ||
      (application as any)?.medicalRecordNumber ||
      (application as any)?.mrn ||
      (application as any)?.Member_MRN ||
      ''
    ) || '—';
  const healthPlanDisplay =
    String(
      (application as any)?.healthPlan ||
      (application as any)?.Health_Plan ||
      (application as any)?.health_plan ||
      ''
    ).trim() || '—';
  const pathwayDisplay =
    String(
      (application as any)?.pathway ||
      (application as any)?.Pathway ||
      ''
    ).trim() || '—';
  const memberCountyDisplay =
    String(
      (application as any)?.currentCounty ||
      (application as any)?.memberCounty ||
      (application as any)?.Member_County ||
      (application as any)?.customaryCounty ||
      ''
    ).trim() || '—';
  const memberCityDisplay = String(
    (application as any)?.memberCity ||
      (application as any)?.currentCity ||
      (application as any)?.Member_City ||
      (application as any)?.city ||
      ''
  ).trim();
  const kaiserRegionDisplay = (() => {
    const planLower = String(healthPlanDisplay || '').trim().toLowerCase();
    if (!planLower.includes('kaiser')) return '';
    // Fresno / Central Valley = Kaiser North. County "Unknown" must not default to South.
    // Fallbacks: city (e.g. Fresno), then MRN starting with 1 → North.
    return (
      resolveKaiserRegion({
        county: memberCountyDisplay !== '—' ? memberCountyDisplay : '',
        city: memberCityDisplay,
        mrn: memberMrnDisplay,
      }) || '—'
    );
  })();
  const memberDobDisplay = (() => {
    const rawDob = String(
      (application as any)?.memberDob ||
      (application as any)?.memberDOB ||
      (application as any)?.dob ||
      (application as any)?.Date_of_Birth ||
      ''
    ).trim();
    if (!rawDob) return '—';

    const mmDdYyyyMatch = rawDob.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mmDdYyyyMatch) {
      const mm = mmDdYyyyMatch[1].padStart(2, '0');
      const dd = mmDdYyyyMatch[2].padStart(2, '0');
      const yyyy = mmDdYyyyMatch[3];
      return `${mm}/${dd}/${yyyy}`;
    }

    const parsedDob = new Date(rawDob);
    return Number.isNaN(parsedDob.getTime()) ? rawDob : format(parsedDob, 'MM/dd/yyyy');
  })();
  const calaimTrackingStatus = String((application as any)?.calaimTrackingStatus || '').trim();
  const isCalaimEligible = calaimTrackingStatus === 'CalAIM Eligible';
  const isCalaimNotEligible = calaimTrackingStatus === 'Not CalAIM Eligible';
  const isCalaimPending = !isCalaimEligible && !isCalaimNotEligible;
  const t2038AuthNumberDisplay = String(
    (application as any)?.Authorization_Number_T038 ||
    (application as any)?.Authorization_Number_T2038 ||
    ''
  ).trim();
  const t2038AuthStartDisplay = String(
    (application as any)?.Authorization_Start_T2038 ||
    (application as any)?.Authorization_Start_Date_T2038 ||
    ''
  ).trim();
  const t2038AuthEndDisplay = String(
    (application as any)?.Authorization_End_T2038 ||
    (application as any)?.Authorization_End_Date_T2038 ||
    ''
  ).trim();
  const hasT2038AuthorizationSummary = Boolean(
    t2038AuthNumberDisplay || t2038AuthStartDisplay || t2038AuthEndDisplay
  );
  const buildCsSummaryPrintableSections = () => {
    const sections = [
      {
        title: 'Member',
        rows: [
          ['Member Name', `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim()],
          ['Date of Birth', memberDobDisplay],
          ['Member Phone', String((application as any)?.memberPhone || '').trim()],
          ['Member Email', String((application as any)?.memberEmail || '').trim()],
          ['Preferred Language', String((application as any)?.memberLanguage || '').trim()],
          ['MRN', String((application as any)?.memberMrn || '').trim()],
          ['Medi-Cal', String((application as any)?.memberMediCalNum || '').trim()],
          ['County', String((application as any)?.currentCounty || '').trim()],
          ['Current Status', String((application as any)?.status || '').trim()],
          ['Health Plan', String((application as any)?.healthPlan || '').trim()],
          ['Pathway', String((application as any)?.pathway || '').trim()],
        ],
      },
      {
        title: 'Submitting User',
        rows: [
          ['Referrer Name', `${String((application as any)?.referrerFirstName || '').trim()} ${String((application as any)?.referrerLastName || '').trim()}`.trim()],
          ['Referrer Email', String((application as any)?.referrerEmail || '').trim()],
          ['Referrer Phone', String((application as any)?.referrerPhone || '').trim()],
          ['Referrer Relationship', String((application as any)?.referrerRelationship || '').trim()],
          ['Agency', String((application as any)?.agency || '').trim()],
        ],
      },
      {
        title: 'Primary Contact',
        rows: [
          ['Primary Contact', `${String((application as any)?.bestContactFirstName || '').trim()} ${String((application as any)?.bestContactLastName || '').trim()}`.trim()],
          ['Primary Contact Relationship', String((application as any)?.bestContactRelationship || '').trim()],
          ['Primary Contact Phone', String((application as any)?.bestContactPhone || '').trim()],
          ['Primary Contact Email', String((application as any)?.bestContactEmail || '').trim()],
          ['Primary Contact Language', String((application as any)?.bestContactLanguage || '').trim()],
        ],
      },
      {
        title: 'Secondary Contact',
        rows: [
          ['Secondary Contact', `${String((application as any)?.secondaryContactFirstName || '').trim()} ${String((application as any)?.secondaryContactLastName || '').trim()}`.trim()],
          ['Secondary Contact Relationship', String((application as any)?.secondaryContactRelationship || '').trim()],
          ['Secondary Contact Phone', String((application as any)?.secondaryContactPhone || '').trim()],
          ['Secondary Contact Email', String((application as any)?.secondaryContactEmail || '').trim()],
          ['Secondary Contact Language', String((application as any)?.secondaryContactLanguage || '').trim()],
        ],
      },
      {
        title: 'Legal Representative',
        rows: [
          ['Legal Representative Status', String((application as any)?.hasLegalRep || '').trim()],
          ['Representative Name', `${String((application as any)?.repFirstName || '').trim()} ${String((application as any)?.repLastName || '').trim()}`.trim()],
          ['Representative Relationship', String((application as any)?.repRelationship || '').trim()],
          ['Representative Phone', String((application as any)?.repPhone || '').trim()],
          ['Representative Email', String((application as any)?.repEmail || '').trim()],
        ],
      },
      {
        title: 'Location',
        rows: [
          ['Current Location Type', String((application as any)?.currentLocation || '').trim()],
          ['Current Location Name', String((application as any)?.currentLocationName || '').trim()],
          [
            'Current Address',
            [
              String((application as any)?.currentAddress || '').trim(),
              String((application as any)?.currentCity || '').trim(),
              [String((application as any)?.currentState || '').trim(), String((application as any)?.currentZip || '').trim()].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', '),
          ],
          ['Customary Location Type', String((application as any)?.customaryLocationType || '').trim()],
          ['Customary Location Name', String((application as any)?.customaryLocationName || '').trim()],
          [
            'Customary Address',
            [
              String((application as any)?.customaryAddress || '').trim(),
              String((application as any)?.customaryCity || '').trim(),
              [String((application as any)?.customaryState || '').trim(), String((application as any)?.customaryZip || '').trim()].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', '),
          ],
        ],
      },
      {
        title: 'ISP and RCFE',
        rows: [
          ['ISP Contact', `${String((application as any)?.ispFirstName || '').trim()} ${String((application as any)?.ispLastName || '').trim()}`.trim()],
          ['ISP Phone', String((application as any)?.ispPhone || '').trim()],
          ['ISP Email', String((application as any)?.ispEmail || '').trim()],
          ['ISP Relationship', String((application as any)?.ispRelationship || '').trim()],
          ['ISP Address', [String((application as any)?.ispAddress || '').trim(), String((application as any)?.ispCity || '').trim(), String((application as any)?.ispState || '').trim(), String((application as any)?.ispZip || '').trim()].filter(Boolean).join(', ')],
          ['ISP Contact Is Member', Boolean((application as any)?.ispContactIsMember) ? 'Yes' : 'No'],
          ['ISP Contact Is Primary Contact', Boolean((application as any)?.ispContactSameAsPrimary) ? 'Yes' : 'No'],
          ['Secondary ISP Contact Is Primary Contact', Boolean((application as any)?.ispSecondaryContactSameAsPrimary) ? 'Yes' : 'No'],
          ['Secondary ISP Contact', `${String((application as any)?.ispSecondaryFirstName || '').trim()} ${String((application as any)?.ispSecondaryLastName || '').trim()}`.trim()],
          ['Secondary ISP Phone', String((application as any)?.ispSecondaryPhone || '').trim()],
          ['Secondary ISP Email', String((application as any)?.ispSecondaryEmail || '').trim()],
          ['Secondary ISP Relationship', String((application as any)?.ispSecondaryRelationship || '').trim()],
          ['On ALW Waitlist', String((application as any)?.onALWWaitlist || '').trim()],
          ['Preferred RCFE', String((application as any)?.rcfeName || '').trim()],
          ['Preferred RCFE Cities', String((application as any)?.rcfePreferredCities || '').trim()],
          ['RCFE Admin', `${String((application as any)?.rcfeAdminFirstName || '').trim()} ${String((application as any)?.rcfeAdminLastName || '').trim()}`.trim()],
          ['RCFE Admin Phone', String((application as any)?.rcfeAdminPhone || '').trim()],
          ['RCFE Admin Email', String((application as any)?.rcfeAdminEmail || '').trim()],
          ['SNF Diversion Notes', String((application as any)?.snfDiversionReason || '').trim()],
        ],
      },
      {
        title: 'Financial and Program',
        rows: [
          ['Income Source', Array.isArray((application as any)?.incomeSource) ? ((application as any).incomeSource as string[]).join(', ') : String((application as any)?.incomeSource || '').trim()],
          ['Monthly Income', String((application as any)?.monthlyIncome || '').trim()],
          ['Share of Cost', String((application as any)?.shareOfCost || '').trim()],
          ['Expected Room & Board Payment', String((application as any)?.expectedRoomBoardPayment || '').trim()],
          ['Room & Board Acknowledged', (application as any)?.ackRoomAndBoard === true ? 'Yes' : (application as any)?.ackRoomAndBoard === false ? 'No' : ''],
          ['SOC Determination Acknowledged', (application as any)?.ackSocDetermination === true ? 'Yes' : (application as any)?.ackSocDetermination === false ? 'No' : ''],
          ['CalAIM Tracking Status', String((application as any)?.calaimTrackingStatus || '').trim()],
          ['CalAIM Tracking Reason', String((application as any)?.calaimTrackingReason || '').trim()],
        ],
      },
      {
        title: 'Authorization',
        rows: [
          ['T2038 Authorization Number', t2038AuthNumberDisplay],
          ['T2038 Start', t2038AuthStartDisplay],
          ['T2038 End', t2038AuthEndDisplay],
        ],
      },
    ];

    return sections
      .map((section) => ({
        title: section.title,
        rows: section.rows
          .map(([label, value]) => ({ label, value: String(value || '').trim() }))
          .filter((row) => row.value.length > 0),
      }))
      .filter((section) => section.rows.length > 0);
  };
  const memberFileEntries = (() => {
    const toIso = (value: unknown): string => {
      if (!value) return '';
      try {
        if (typeof (value as any)?.toDate === 'function') {
          return (value as any).toDate().toISOString();
        }
        if (typeof (value as any)?.seconds === 'number') {
          return new Date((value as any).seconds * 1000).toISOString();
        }
        const raw = String(value || '').trim();
        if (!raw) return '';
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
      } catch {
        return '';
      }
    };

    const PATHWAY_UPLOAD_FORM_NAMES = new Set([
      'Proof of Income',
      "LIC 602A - Physician's Report",
      'Medicine List',
      'SNF Facesheet',
      'Waivers & Authorizations',
      'Room and Board/Tier Level Agreement',
      'Room and Board Commitment',
      'Declaration of Eligibility',
      'CS Member Summary',
      'CS Summary',
      'Eligibility Screenshot',
      'Consolidated Medical Documents',
    ]);

    const rawForms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
    const formEntries = rawForms.flatMap((form, idx) => {
      const documentName = String(form?.name || '').trim() || 'Application File';
      const category = PATHWAY_UPLOAD_FORM_NAMES.has(documentName) ? 'Pathway upload' : 'Application form';
      const uploadedAtIso = toIso(form?.dateCompleted || form?.uploadedAt || form?.createdAt);
      const perFileEntries = (Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [])
        .map((item: any, fileIdx: number) => {
          const fileName = String(item?.fileName || '').trim() || String(form?.fileName || '').trim() || `${documentName} ${fileIdx + 1}`;
          const downloadURL = String(item?.downloadURL || item?.url || item?.uploadUrl || '').trim();
          const filePath = String(item?.filePath || item?.storagePath || item?.path || '').trim();
          if (!downloadURL && !filePath) return null;
          const titledDocumentName =
            String(item?.displayTitle || '').trim() ||
            (String(item?.incomeMonth || '').trim()
              ? `Proof of Income - ${String(item.incomeMonth).trim()}`
              : '') ||
            documentName;
          return {
            id: `form-uploaded-file-${idx}-${fileIdx}-${titledDocumentName}-${fileName}`,
            category,
            documentName: titledDocumentName,
            fileName,
            downloadURL,
            filePath,
            uploadedAtIso: toIso(item?.uploadedAtIso || item?.uploadedAt || item?.createdAt) || uploadedAtIso,
          };
        })
        .filter(Boolean);

      if (perFileEntries.length > 0) {
        return perFileEntries as Array<{
          id: string;
          category: string;
          documentName: string;
          fileName: string;
          downloadURL: string;
          filePath: string;
          uploadedAtIso: string;
        }>;
      }

      const fallbackFileName = String(form?.fileName || '').trim() || documentName;
      const fallbackDownloadURL = String(form?.downloadURL || form?.uploadUrl || form?.url || '').trim();
      const fallbackFilePath = String(form?.filePath || form?.storagePath || form?.path || '').trim();
      if (!fallbackDownloadURL && !fallbackFilePath) return [];
      // Comma-joined multi-file names without uploadedFiles still expose the primary path/url.
      return [{
        id: `form-file-${idx}-${documentName}-${fallbackFileName}`,
        category,
        documentName,
        fileName: fallbackFileName.includes(',')
          ? `${documentName}${getFileExtension(fallbackFileName.split(',')[0] || '') || ''}`
          : fallbackFileName,
        downloadURL: fallbackDownloadURL,
        filePath: fallbackFilePath,
        uploadedAtIso,
      }];
    }) as Array<{
      id: string;
      category: string;
      documentName: string;
      fileName: string;
      downloadURL: string;
      filePath: string;
      uploadedAtIso: string;
    }>;

    const rawEligibility = Array.isArray((application as any)?.eligibilityScreenshotUploads)
      ? ((application as any).eligibilityScreenshotUploads as any[])
      : [];
    const eligibilityEntries = rawEligibility
      .map((upload, idx) => {
        const assetType = String(upload?.assetType || '').trim() === 'pdf_packet' ? 'pdf_packet' : 'screenshot';
        const fileName = String(upload?.fileName || '').trim() || `Eligibility Screenshot ${idx + 1}`;
        const downloadURL = String(upload?.downloadURL || upload?.url || upload?.uploadUrl || '').trim();
        const filePath = String(upload?.filePath || upload?.storagePath || upload?.path || '').trim();
        if (!downloadURL && !filePath) return null;
        return {
          id: `elig-file-${idx}-${fileName}`,
          category: 'Eligibility check',
          documentName: assetType === 'pdf_packet' ? 'Eligibility Screenshot Packet PDF' : 'Eligibility Screenshot',
          fileName,
          downloadURL,
          filePath,
          uploadedAtIso: toIso(upload?.uploadedAtIso || upload?.uploadedAt || upload?.createdAt),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      category: string;
      documentName: string;
      fileName: string;
      downloadURL: string;
      filePath: string;
      uploadedAtIso: string;
    }>;

    const rawAuthorization = Array.isArray((application as any)?.authorizationRecords)
      ? ((application as any).authorizationRecords as any[])
      : [];
    const authorizationEntries = rawAuthorization
      .map((record, idx) => {
        const fileName = String(record?.fileName || '').trim() || `Authorization ${idx + 1}`;
        const downloadURL = String(record?.downloadURL || record?.url || record?.uploadUrl || '').trim();
        const filePath = String(record?.filePath || record?.storagePath || record?.path || '').trim();
        if (!downloadURL && !filePath) return null;
        const authType = String(record?.type || '').trim() || 'Authorization';
        return {
          id: `auth-file-${idx}-${authType}-${fileName}`,
          category: 'Authorization upload',
          documentName: authType,
          fileName,
          downloadURL,
          filePath,
          uploadedAtIso: toIso(record?.uploadedAt || record?.createdAt),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      category: string;
      documentName: string;
      fileName: string;
      downloadURL: string;
      filePath: string;
      uploadedAtIso: string;
    }>;

    const rawIsp = Array.isArray((application as any)?.ispRecords)
      ? ((application as any).ispRecords as any[])
      : [];
    const ispEntries = rawIsp
      .map((record, idx) => {
        const fileName = String(record?.fileName || '').trim() || `ISP ${idx + 1}`;
        const downloadURL = String(record?.downloadURL || record?.url || record?.uploadUrl || '').trim();
        const filePath = String(record?.filePath || record?.storagePath || record?.path || '').trim();
        if (!downloadURL && !filePath) return null;
        const planDate = String(record?.planDate || '').trim();
        return {
          id: `isp-file-${idx}-${fileName}`,
          category: 'ISP upload',
          documentName: planDate ? `Individual Service Plan (${planDate})` : 'Individual Service Plan',
          fileName,
          downloadURL,
          filePath,
          uploadedAtIso: toIso(record?.uploadedAt || record?.createdAt),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      category: string;
      documentName: string;
      fileName: string;
      downloadURL: string;
      filePath: string;
      uploadedAtIso: string;
    }>;

    const authorizationRequestSheetEntry = (() => {
      if (!isKaiserPlan) return null;
      const kaiserAuthorizationModeLocal = String((application as any)?.kaiserAuthorizationMode || '').trim().toLowerCase();
      const isKaiserAuthReceivedIntakeLocal =
        kaiserAuthorizationModeLocal === 'authorization_received'
          ? true
          : kaiserAuthorizationModeLocal === 'authorization_needed'
            ? false
            : Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
              String((application as any)?.intakeType || '').trim().toLowerCase() === 'kaiser_auth_received_via_ils' ||
              String((application as any)?.status || '').trim().toLowerCase() === 'authorization received (doc collection)';
      if (isKaiserAuthReceivedIntakeLocal) return null;

      // Only list a referral file after it was actually generated/sent — never the printable HTML page.
      const referral = (application as any)?.kaiserReferralSubmission || {};
      const wasGenerated = Boolean(
        referral?.submitted ||
          referral?.submittedAt ||
          referral?.submittedAtIso ||
          referral?.providerMessageId ||
          referral?.pdfStoragePath
      );
      if (!wasGenerated) return null;

      const pdfStoragePath = String(referral?.pdfStoragePath || '').trim();
      const pdfDownloadUrl = String(referral?.pdfStorageSignedUrl || '').trim();
      const submittedIso = toIso(referral?.submittedAt || referral?.submittedAtIso);

      if (pdfStoragePath || pdfDownloadUrl) {
        return {
          id: 'kaiser-authorization-request-sheet',
          category: 'Authorization request sheet',
          documentName: 'Kaiser Referral Form',
          fileName: 'Kaiser Referral Form.pdf',
          downloadURL: pdfDownloadUrl,
          filePath: pdfStoragePath,
          uploadedAtIso: submittedIso,
        };
      }

      // Submission exists but PDF wasn't persisted — do not invent an unreadable HTML "file".
      return null;
    })();

    const serviceDeliveryRoot = (application as any)?.serviceDeliveryForm || {};
    const serviceDeliveryRootUrl = String(serviceDeliveryRoot?.downloadURL || '').trim();
    const serviceDeliveryRootPath = String(serviceDeliveryRoot?.filePath || '').trim();
    const serviceDeliveryRootEntry =
      serviceDeliveryRootUrl || serviceDeliveryRootPath
        ? {
            id: 'service-delivery-form-root',
            category: 'Application form',
            documentName: MIF_SERVICE_DELIVERY_FORM_NAME,
            fileName: String(serviceDeliveryRoot?.fileName || '').trim() || `${MIF_SERVICE_DELIVERY_FORM_NAME}.pdf`,
            downloadURL: serviceDeliveryRootUrl,
            filePath: serviceDeliveryRootPath,
            uploadedAtIso: toIso(serviceDeliveryRoot?.generatedAtIso || serviceDeliveryRoot?.dateCompleted),
          }
        : null;

    const waiversAuthorizationsFileEntry = (() => {
      const waiverForm = rawForms.find((form) => {
        const name = String(form?.name || '').trim().toLowerCase();
        return name === 'waivers & authorizations' || name === 'waivers';
      });
      if (!waiverForm) return null;
      const status = String(waiverForm?.status || '').trim().toLowerCase();
      const signerName = String(waiverForm?.signerName || '').trim();
      const signerType = String(waiverForm?.signerType || '').trim();
      const choice = String(waiverForm?.choice || '').trim();
      const ackHipaa = Boolean(waiverForm?.ackHipaa);
      const ackLiability = Boolean(waiverForm?.ackLiability);
      const ackFoc = Boolean(waiverForm?.ackFoc);
      const ackRoomAndBoard = Boolean(
        waiverForm?.ackRoomAndBoard ??
          (application as any)?.ackRoomAndBoard ??
          waiverForm?.ackSocDetermination ??
          (application as any)?.ackSocDetermination
      );
      const monthlyIncome = String(waiverForm?.monthlyIncome || (application as any)?.monthlyIncome || '').trim();
      const incomeSource = Array.isArray(waiverForm?.incomeSource)
        ? waiverForm.incomeSource.map((value: unknown) => String(value || '').trim()).filter(Boolean).join(', ')
        : String(waiverForm?.incomeSource || (application as any)?.incomeSource || '').trim();
      const isComplete =
        status === 'completed' ||
        Boolean(
          signerName &&
            signerType &&
            choice &&
            ackHipaa &&
            ackLiability &&
            ackFoc &&
            ackRoomAndBoard &&
            monthlyIncome
        );
      if (!isComplete) return null;

      const memberName = [
        String((application as any)?.memberFirstName || '').trim(),
        String((application as any)?.memberLastName || '').trim(),
      ]
        .filter(Boolean)
        .join(' ');
      const memberMrn = String(
        (application as any)?.memberMrn ||
          (application as any)?.memberMRN ||
          (application as any)?.mrn ||
          ''
      ).trim();
      const yesNo = (value: unknown) => (value ? 'Yes' : 'No');
      const choiceLabel =
        choice === 'accept' ? 'Accept Community Supports' : choice === 'decline' ? 'Decline Community Supports' : choice;

      return {
        id: 'waivers-authorizations-completed',
        category: 'Pathway upload',
        documentName: 'Waivers & Authorizations',
        fileName: 'Waivers & Authorizations.pdf',
        downloadURL: '',
        filePath: '',
        uploadedAtIso: toIso(waiverForm?.dateCompleted || (application as any)?.lastUpdated),
        inlineMode: 'waivers-pdf',
        inlineSections: [
          {
            title: 'Member',
            rows: [
              { label: 'Member Name', value: memberName },
              { label: 'MRN', value: memberMrn },
            ].filter((row) => row.value),
          },
          {
            title: 'Acknowledgments',
            rows: [
              { label: 'HIPAA Authorization', value: yesNo(ackHipaa) },
              { label: 'Liability Waiver', value: yesNo(ackLiability) },
              { label: 'Freedom of Choice', value: yesNo(ackFoc) },
              { label: 'Room & Board Commitment', value: yesNo(ackRoomAndBoard) },
              { label: 'Choice', value: choiceLabel },
            ],
          },
          {
            title: 'Income',
            rows: [
              { label: 'Monthly Income', value: monthlyIncome },
              { label: 'Income Source', value: incomeSource },
            ].filter((row) => row.value),
          },
          {
            title: 'Electronic Signature',
            rows: [
              { label: 'Signer', value: signerType === 'representative' ? 'Authorized Representative (POA)' : signerType === 'member' ? 'Member' : signerType },
              { label: 'Signature', value: signerName },
              { label: 'Relationship', value: String(waiverForm?.signerRelationship || '').trim() },
            ].filter((row) => row.value),
          },
        ],
      };
    })();

    const csSummaryPrintableEntry = (() => {
      const sections = buildCsSummaryPrintableSections();
      if (!sections.length) return null;

      const csForm = rawForms.find((form) => {
        const name = String(form?.name || '').trim().toLowerCase();
        return name === 'cs member summary' || name === 'cs summary' || name.includes('cs member summary');
      });
      const status = String(csForm?.status || '').trim().toLowerCase();
      const isCompleted =
        status === 'completed' ||
        Boolean(csForm?.dateCompleted) ||
        Boolean((application as any)?.caspioSent) ||
        Boolean((application as any)?.csSummarySubmittedAt);
      // Always offer a downloadable filled CS Summary when we have printable content.
      // Prefer completed/pushed apps, but still show when member CS data exists.
      if (!isCompleted && sections.every((section) => section.rows.length === 0)) return null;

      const appId = String(applicationId || (application as any)?.id || '').trim();
      const ownerUserId = String((application as any)?.userId || appUserId || '').trim();
      const params = new URLSearchParams({ applicationId: appId });
      if (appId && !appId.startsWith('admin_app_') && ownerUserId) {
        params.set('userId', ownerUserId);
      }

      return {
        id: 'cs-summary-completed-printable',
        category: 'Application form',
        documentName: 'CS Member Summary',
        fileName: 'CS Member Summary.pdf',
        downloadURL: `/admin/forms/cs-summary-printable?${params.toString()}`,
        filePath: '',
        uploadedAtIso: toIso(csForm?.dateCompleted || (application as any)?.lastUpdated || (application as any)?.updatedAt),
        inlineMode: 'cs-summary-pdf',
        inlineSections: sections,
      };
    })();

    const deduped = new Map<string, (typeof formEntries)[number]>();
    [
      ...(csSummaryPrintableEntry ? [csSummaryPrintableEntry as any] : []),
      ...(waiversAuthorizationsFileEntry ? [waiversAuthorizationsFileEntry as any] : []),
      ...(serviceDeliveryRootEntry ? [serviceDeliveryRootEntry] : []),
      ...formEntries,
      ...eligibilityEntries,
      ...authorizationEntries,
      ...ispEntries,
      ...alftCompletionFileEntries,
      ...(authorizationRequestSheetEntry ? [authorizationRequestSheetEntry] : []),
    ].forEach((entry) => {
      const key = `${entry.documentName}::${entry.fileName}::${entry.downloadURL || entry.filePath || entry.id || ''}`;
      if (!deduped.has(key)) deduped.set(key, entry);
    });

    return Array.from(deduped.values()).sort((a, b) => {
      const aMs = a.uploadedAtIso ? new Date(a.uploadedAtIso).getTime() : 0;
      const bMs = b.uploadedAtIso ? new Date(b.uploadedAtIso).getTime() : 0;
      return bMs - aMs;
    });
  })();
  const sanitizeMemberFileName = (name: string, fallback = 'file'): string => {
    const cleaned = String(name || '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  };
  const getMemberDownloadIdentity = () => {
    const lastName = sanitizeMemberFileName(
      String((application as any)?.memberLastName || '').trim(),
      'UnknownLast'
    );
    const firstName = sanitizeMemberFileName(
      String((application as any)?.memberFirstName || '').trim(),
      'UnknownFirst'
    );
    const mrn = sanitizeMemberFileName(
      String(
        (application as any)?.memberMrn ||
          (application as any)?.memberMRN ||
          (application as any)?.medicalRecordNumber ||
          (application as any)?.mrn ||
          (application as any)?.Member_MRN ||
          ''
      ).trim(),
      'UnknownMRN'
    );
    return { lastName, firstName, mrn, label: `${lastName}, ${firstName} - ${mrn}` };
  };
  const buildMemberLabeledDownloadName = (rawName: string, fallback = 'file'): string => {
    const { label } = getMemberDownloadIdentity();
    const base = sanitizeMemberFileName(rawName, fallback);
    const extMatch = base.match(/(\.[a-z0-9]{2,8})$/i);
    const extension = extMatch?.[1] || '';
    const stem = extension ? base.slice(0, -extension.length) : base;
    const labelLower = label.toLowerCase();
    const stemLower = stem.toLowerCase();
    if (stemLower === labelLower || stemLower.startsWith(`${labelLower} - `) || stemLower.startsWith(`${labelLower}_`)) {
      return sanitizeMemberFileName(`${stem}${extension}`, fallback);
    }
    return sanitizeMemberFileName(`${label} - ${stem}${extension}`, fallback);
  };
  const buildMemberFileEntryDownloadName = (entry: {
    documentName?: string;
    fileName?: string;
    category?: string;
  }): string => {
    const documentName = String(entry.documentName || '').trim();
    const fileName = String(entry.fileName || '').trim();
    const category = String(entry.category || '').trim().toLowerCase();
    const ext =
      getFileExtension(fileName) ||
      getFileExtension(documentName) ||
      '';
    const docLabel = sanitizeMemberFileName(
      documentName ? getDocumentLabel(documentName) : '',
      'Document'
    );
    const originalStem = sanitizeMemberFileName(
      fileName ? fileName.replace(/\.[a-z0-9]{2,8}$/i, '') : '',
      ''
    );
    const looksGenericSourceName =
      !originalStem ||
      originalStem.toLowerCase() === docLabel.toLowerCase() ||
      /^screen.?shot/i.test(originalStem) ||
      /^image\b/i.test(originalStem) ||
      /^img[_-]?\d+/i.test(originalStem) ||
      /^photo/i.test(originalStem) ||
      /^document$/i.test(originalStem);
    const preferDocumentLabel =
      category === 'pathway upload' ||
      looksGenericSourceName ||
      (Boolean(documentName) && !fileName.toLowerCase().includes(docLabel.toLowerCase().slice(0, 8)));

    let baseName = fileName || `${docLabel}${ext || ''}` || 'file';
    if (preferDocumentLabel) {
      // Keep duplicates distinct: "Proof of Income - 20260323-statements-7200-.pdf"
      baseName =
        !looksGenericSourceName && originalStem
          ? `${docLabel} - ${originalStem}${ext || ''}`
          : `${docLabel}${ext || ''}`;
    }
    return buildMemberLabeledDownloadName(baseName);
  };
  /** Number same-document uploads: Proof of Income 1.pdf, Proof of Income 2.pdf, … */
  const buildDistinctMemberFileDownloadName = (
    entry: { id?: string; documentName?: string; fileName?: string; category?: string; filePath?: string },
    allEntries: Array<{ id?: string; documentName?: string; fileName?: string; category?: string; filePath?: string }>
  ): string => {
    const documentKey = String(entry.documentName || '').trim().toLowerCase();
    const siblings = documentKey
      ? allEntries.filter((row) => String(row.documentName || '').trim().toLowerCase() === documentKey)
      : [entry];
    const sourceExt =
      getFileExtension(String(entry.fileName || '')) ||
      getFileExtension(String(entry.filePath || '').split('/').pop() || '') ||
      '.pdf';
    const docLabel = sanitizeMemberFileName(
      entry.documentName ? getDocumentLabel(String(entry.documentName)) : '',
      'Document'
    );
    const labeled =
      siblings.length > 1
        ? buildMemberFileEntryDownloadName({
            ...entry,
            // Shared document label so numbering is Proof of Income 1/2, not colliding unique stems.
            fileName: `${docLabel}${sourceExt}`,
          })
        : buildMemberFileEntryDownloadName(entry);
    if (siblings.length <= 1) {
      if (/\.[a-z0-9]{2,8}$/i.test(labeled)) return labeled;
      return `${labeled}${sourceExt}`;
    }
    const foundIdx = siblings.findIndex((row) => Boolean(entry.id) && row.id === entry.id);
    const index = foundIdx >= 0 ? foundIdx + 1 : 1;
    const extMatch = labeled.match(/(\.[a-z0-9]{2,8})$/i);
    const extension = extMatch?.[1] || sourceExt;
    const stem = extension && labeled.toLowerCase().endsWith(extension.toLowerCase())
      ? labeled.slice(0, -extension.length)
      : labeled;
    // Strip prior " 1" / "1" suffixes so Proof of Income1 and Proof of Income 1 both renumber cleanly.
    const cleanStem = stem
      .replace(/\s+\d+$/, '')
      .replace(/(Proof of Income|Med List|Eligibility Screenshot|Medicine List)\d+$/i, '$1')
      .trim();
    return `${cleanStem} ${index}${extension}`;
  };
  const parseStoragePathFromUrl = (url: string): string => {
    try {
      const input = String(url || '').trim();
      if (!input) return '';
      if (input.startsWith('gs://')) return input;
      const parsed = new URL(input, typeof window !== 'undefined' ? window.location.origin : undefined);
      if (!parsed.pathname.includes('/o/')) return '';
      const afterO = parsed.pathname.split('/o/')[1] || '';
      if (!afterO) return '';
      return decodeURIComponent(afterO);
    } catch {
      return '';
    }
  };
  const resolveMemberFileUrl = async (entry: {
    id: string;
    filePath: string;
    downloadURL: string;
  }): Promise<string> => {
    const cached = memberFileResolvedUrls[entry.id];
    if (cached) return cached;
    const rawDownloadUrl = String(entry.downloadURL || '').trim();
    if (rawDownloadUrl && !rawDownloadUrl.startsWith('gs://')) {
      setMemberFileResolvedUrls((prev) => ({ ...prev, [entry.id]: rawDownloadUrl }));
      return rawDownloadUrl;
    }
    const effectiveFromCache = getEffectiveDownloadUrl(rawDownloadUrl, entry.filePath);
    if (effectiveFromCache && !effectiveFromCache.startsWith('gs://')) {
      setMemberFileResolvedUrls((prev) => ({ ...prev, [entry.id]: effectiveFromCache }));
      return effectiveFromCache;
    }
    if (!storage) throw new Error('Storage is unavailable');
    const candidatePaths = [
      String(entry.filePath || '').trim(),
      parseStoragePathFromUrl(rawDownloadUrl),
    ].filter(Boolean);
    for (const path of candidatePaths) {
      try {
        const resolved = await getDownloadURL(ref(storage, path));
        if (resolved) {
          setMemberFileResolvedUrls((prev) => ({ ...prev, [entry.id]: resolved }));
          return resolved;
        }
      } catch {
        // continue
      }
    }
    throw new Error('File URL unavailable');
  };
  const openDocumentPreview = (url: string, title?: string) => {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;
    setDocumentPreview({
      url: safeUrl,
      title: String(title || 'Document preview').trim() || 'Document preview',
    });
  };
  const openStoredFileViaServer = async (
    filePath: string,
    fileName: string,
    downloadURL?: string | null
  ) => {
    const path = String(filePath || '').trim();
    const directUrl = String(downloadURL || '').trim();
    if ((!path && !directUrl) || !user) return;
    setServerFileOpening(path || directUrl);
    try {
      const idToken = await user.getIdToken();
      let blob: Blob | null = null;
      if (path || directUrl) {
        const res = await fetch('/api/admin/documents/open-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ filePath: path || undefined, downloadURL: directUrl || undefined }),
        });
        if (res.ok) blob = await res.blob();
      }
      if (!blob) {
        const fallback = await fetch('/api/admin/member-file-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            disposition: 'inline',
            entry: {
              documentName: fileName || 'Document',
              fileName: fileName || 'document.pdf',
              filePath: path,
              downloadURL: directUrl,
            },
          }),
        });
        if (fallback.ok) {
          const contentType = String(fallback.headers.get('content-type') || '').split(';')[0].trim();
          blob = new Blob([await fallback.arrayBuffer()], { type: contentType || 'application/pdf' });
        }
      }
      if (!blob) {
        toast({
          variant: 'destructive',
          title: 'File is not in storage',
          description: `Only the name "${fileName}" was saved; the file itself never finished uploading. Ask the family to upload it again or add it with Add File(s).`,
        });
        return;
      }
      openDocumentPreview(URL.createObjectURL(blob), fileName);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not open file', description: String(error?.message || error) });
    } finally {
      setServerFileOpening(null);
    }
  };
  const handleViewMemberFile = async (entry: {
    id: string;
    filePath: string;
    downloadURL: string;
    fileName?: string;
    documentName?: string;
  }) => {
    setMemberFileUrlLoading((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const printableCsSummary =
        String(entry.downloadURL || '').includes('/admin/forms/cs-summary-printable') ||
        String((entry as any).inlineMode || '') === 'cs-summary-pdf';
      if (printableCsSummary) {
        const href = String(entry.downloadURL || '').trim();
        if (href) {
          openDocumentPreview(href, entry.fileName || entry.documentName || 'CS Member Summary');
          return;
        }
      }
      const idToken = await user?.getIdToken?.();
      if (!idToken) throw new Error('Unable to verify admin session. Please refresh and try again.');
      const filePath = String(entry.filePath || '').trim();
      let blob: Blob | null = null;
      if ((filePath || String(entry.downloadURL || '').trim()) && !String((entry as any).inlineMode || '').trim()) {
        const opened = await fetch('/api/admin/documents/open-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            filePath: filePath || undefined,
            downloadURL: String(entry.downloadURL || '').trim() || undefined,
          }),
        });
        if (opened.ok) blob = await opened.blob();
      }
      if (!blob) {
        const response = await fetch('/api/admin/member-file-download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            disposition: 'inline',
            entry: {
              documentName: entry.documentName || 'Document',
              fileName: entry.fileName || 'document.pdf',
              filePath,
              downloadURL: String(entry.downloadURL || ''),
              inlineMode: String((entry as any).inlineMode || ''),
              inlineSections: Array.isArray((entry as any).inlineSections) ? (entry as any).inlineSections : [],
            },
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(String(payload?.error || 'Could not open this file.'));
        }
        const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim();
        const bytes = await response.arrayBuffer();
        blob = new Blob([bytes], { type: contentType || 'application/pdf' });
      }
      openDocumentPreview(URL.createObjectURL(blob), entry.fileName || entry.documentName || 'Document preview');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to open file',
        description: String(error?.message || 'Could not resolve file URL.'),
      });
    } finally {
      setMemberFileUrlLoading((prev) => ({ ...prev, [entry.id]: false }));
    }
  };
  const handleDownloadMemberFile = async (entry: {
    id: string;
    category: string;
    documentName: string;
    fileName: string;
    filePath: string;
    downloadURL: string;
  }) => {
    setMemberFileUrlLoading((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const kaiserPrintablePrefix = '/forms/kaiser-referral/printable?';
      const isKaiserPrintable = String(entry.downloadURL || '').includes(kaiserPrintablePrefix);
      if (isKaiserPrintable) {
        const raw = String(entry.downloadURL || '').trim();
        const query = raw.includes('?') ? raw.split('?')[1] : '';
        const templateDownloadUrl = `/api/forms/kaiser-referral/template?${query}${query ? '&' : ''}download=1`;
        const url = new URL(templateDownloadUrl, window.location.origin).toString();
        const link = document.createElement('a');
        link.href = url;
        link.download = buildDistinctMemberFileDownloadName(
          {
            ...entry,
            documentName: entry.documentName || 'Kaiser Authorization Request Sheet',
            fileName: entry.fileName || 'Kaiser Authorization Request Sheet.pdf',
          },
          memberFileEntries
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      const isPrintableCsSummaryOnly =
        String(entry.downloadURL || '').includes('/admin/forms/cs-summary-printable') &&
        String((entry as any).inlineMode || '') !== 'cs-summary-pdf';
      if (isPrintableCsSummaryOnly) {
        const resolvedUrl = await resolveMemberFileUrl(entry);
        openDocumentPreview(resolvedUrl, entry.fileName || entry.documentName || 'CS Summary Printable');
        toast({
          title: 'Printable opened',
          description: 'Use Print or Save as PDF from the preview window.',
        });
        return;
      }
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        throw new Error('Unable to verify admin session. Please refresh and try again.');
      }
      const labeledFileName = buildDistinctMemberFileDownloadName(entry, memberFileEntries);
      const triggerBrowserDownload = (blob: Blob, downloadName: string) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      };
      let downloaded = false;
      try {
        const response = await fetch('/api/admin/member-file-download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            entry: {
              category: String(entry.category || ''),
              documentName: String(entry.documentName || ''),
              fileName: labeledFileName,
              filePath: String(entry.filePath || ''),
              downloadURL:
                getEffectiveDownloadUrl(entry.downloadURL, entry.filePath) ||
                String(entry.downloadURL || ''),
              inlineMode: String((entry as any).inlineMode || ''),
              inlineRows: Array.isArray((entry as any).inlineRows) ? (entry as any).inlineRows : [],
              inlineSections: Array.isArray((entry as any).inlineSections) ? (entry as any).inlineSections : [],
            },
          }),
        });
        if (response.ok) {
          const blob = await response.blob();
          const contentDisposition = String(response.headers.get('content-disposition') || '');
          const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/i);
          const serverFileName = fileNameMatch?.[1] ? fileNameMatch[1] : '';
          triggerBrowserDownload(
            blob,
            buildMemberLabeledDownloadName(
              serverFileName || labeledFileName || entry.fileName || entry.documentName || 'file'
            )
          );
          downloaded = true;
        } else {
          const errorText = await response.text().catch(() => '');
          console.warn('Server member-file-download failed; trying client fallback:', errorText);
        }
      } catch (apiError) {
        console.warn('Server member-file-download error; trying client fallback:', apiError);
      }
      if (!downloaded) {
        // Prefer Storage SDK blob for path-only pathway uploads (no public downloadURL).
        const candidatePaths = [
          String(entry.filePath || '').trim(),
          parseStoragePathFromUrl(String(entry.downloadURL || '').trim()),
        ].filter(Boolean);
        if (storage && candidatePaths.length > 0) {
          for (const path of candidatePaths) {
            try {
              const blob = await getBlob(ref(storage, path));
              const withExt =
                /\.[a-z0-9]{2,8}$/i.test(labeledFileName)
                  ? labeledFileName
                  : `${labeledFileName}${getFileExtension(entry.fileName) || '.pdf'}`;
              triggerBrowserDownload(blob, buildMemberLabeledDownloadName(withExt));
              downloaded = true;
              break;
            } catch {
              // try next path / URL fallback
            }
          }
        }
      }
      if (!downloaded) {
        const resolvedUrl = await resolveMemberFileUrl(entry);
        const fallbackResponse = await fetch(resolvedUrl);
        if (!fallbackResponse.ok) {
          throw new Error(`Could not download file (${fallbackResponse.status}).`);
        }
        const blob = await fallbackResponse.blob();
        const mimeExt = (() => {
          const normalized = String(blob.type || '').trim().toLowerCase();
          if (normalized.includes('pdf')) return '.pdf';
          if (normalized.includes('png')) return '.png';
          if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
          if (normalized.includes('msword')) return '.doc';
          if (normalized.includes('officedocument.wordprocessingml.document')) return '.docx';
          return '';
        })();
        const withExt =
          /\.[a-z0-9]{2,8}$/i.test(labeledFileName)
            ? labeledFileName
            : `${labeledFileName}${mimeExt || getFileExtension(entry.fileName) || '.pdf'}`;
        triggerBrowserDownload(blob, buildMemberLabeledDownloadName(withExt));
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Unable to download file',
        description: String(error?.message || 'Could not download this file.'),
      });
    } finally {
      setMemberFileUrlLoading((prev) => ({ ...prev, [entry.id]: false }));
    }
  };
  const downloadAllMemberFiles = async () => {
    if (!memberFileEntries.length) {
      toast({ variant: 'destructive', title: 'No files', description: 'No uploaded files found yet.' });
      return;
    }
    if (!storage) {
      toast({ variant: 'destructive', title: 'Storage unavailable', description: 'Storage is not ready right now.' });
      return;
    }
    const extensionFromMime = (mime: string): string => {
      const normalized = String(mime || '').trim().toLowerCase();
      if (normalized.includes('pdf')) return '.pdf';
      if (normalized.includes('png')) return '.png';
      if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
      if (normalized.includes('msword')) return '.doc';
      if (normalized.includes('officedocument.wordprocessingml.document')) return '.docx';
      if (normalized.includes('json')) return '.json';
      if (normalized.includes('text/html')) return '.html';
      if (normalized.includes('text/plain')) return '.txt';
      return '';
    };
    const ensureExtension = (name: string, blob: Blob): string => {
      const trimmed = String(name || '').trim();
      if (/\.[a-z0-9]{2,8}$/i.test(trimmed)) return trimmed;
      const ext = extensionFromMime(blob.type);
      return `${trimmed || 'file'}${ext || '.bin'}`;
    };
    const toZipName = (): string => {
      const { lastName, firstName, mrn } = getMemberDownloadIdentity();
      return `${lastName}, ${firstName} - ${mrn}.zip`;
    };
    memberFilesDownloadCancelRef.current = false;
    setIsDownloadingAllMemberFiles(true);
    setMemberFilesDownloadProgress(5);
    setMemberFilesDownloadStatusLabel(`Preparing ${memberFileEntries.length} files...`);
    try {
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        toast({
          variant: 'destructive',
          title: 'Download failed',
          description: 'Unable to verify admin session. Please refresh and try again.',
        });
        return;
      }
      setMemberFilesDownloadProgress(40);
      setMemberFilesDownloadStatusLabel('Building the ZIP. This stays on this step until the files are ready.');

      const controller = new AbortController();
      memberFilesDownloadAbortRef.current = controller;
      const payloadEntries = memberFileEntries
        .map((entry) => ({
          category: String(entry.category || ''),
          documentName: String(entry.documentName || ''),
          fileName: String(entry.fileName || ''),
          downloadURL: String(entry.downloadURL || ''),
          filePath: String(entry.filePath || ''),
          inlineContent: String((entry as any).inlineContent || ''),
          inlineMimeType: String((entry as any).inlineMimeType || ''),
          inlineMode: String((entry as any).inlineMode || ''),
          inlineRows: Array.isArray((entry as any).inlineRows) ? (entry as any).inlineRows : [],
          inlineSections: Array.isArray((entry as any).inlineSections) ? (entry as any).inlineSections : [],
        }));
      if (!payloadEntries.length) {
        throw new Error('No downloadable binary files are available for ZIP yet.');
      }
      const response = await fetch('/api/admin/member-files-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          zipFileName: toZipName(),
          memberFirstName: String((application as any)?.memberFirstName || '').trim(),
          memberLastName: String((application as any)?.memberLastName || '').trim(),
          memberMrn: String(
            (application as any)?.memberMrn ||
              (application as any)?.memberMRN ||
              (application as any)?.medicalRecordNumber ||
              (application as any)?.mrn ||
              (application as any)?.Member_MRN ||
              ''
          ).trim(),
          entries: payloadEntries,
        }),
        signal: controller.signal,
      }).finally(() => {
        if (memberFilesDownloadAbortRef.current === controller) {
          memberFilesDownloadAbortRef.current = null;
        }
      });

      if (memberFilesDownloadCancelRef.current) {
        toast({ title: 'Download canceled', description: 'ZIP download was canceled.' });
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `ZIP request failed (${response.status})`);
      }

      setMemberFilesDownloadProgress(95);
      setMemberFilesDownloadStatusLabel('Finalizing ZIP...');
      const zipBlob = await response.blob();
      const objectUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = toZipName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      const downloadedCount = Number(response.headers.get('x-downloaded-count') || payloadEntries.length);
      const skippedCount = Number(response.headers.get('x-skipped-count') || 0);
      const failedCount = Number(response.headers.get('x-failed-count') || 0);
      toast({
        title: 'Download complete',
        description: `${downloadedCount} downloaded${skippedCount ? ` • ${skippedCount} skipped` : ''}${failedCount ? ` • ${failedCount} failed` : ''}`,
      });
    } catch (error: any) {
      if (memberFilesDownloadCancelRef.current || error?.name === 'AbortError') {
        toast({ title: 'Download canceled', description: 'ZIP download was canceled.' });
      } else {
        toast({
          variant: 'destructive',
          title: 'Download failed',
          description: String(error?.message || 'Could not create ZIP download.'),
        });
      }
    } finally {
      memberFilesDownloadCancelRef.current = false;
      if (memberFilesDownloadAbortRef.current) {
        memberFilesDownloadAbortRef.current.abort();
        memberFilesDownloadAbortRef.current = null;
      }
      setMemberFilesDownloadProgress(0);
      setMemberFilesDownloadStatusLabel('');
      setIsDownloadingAllMemberFiles(false);
    }
  };
  const cancelDownloadAllMemberFiles = () => {
    memberFilesDownloadCancelRef.current = true;
    setMemberFilesDownloadStatusLabel('Canceling...');
    if (memberFilesDownloadAbortRef.current) {
      memberFilesDownloadAbortRef.current.abort();
      memberFilesDownloadAbortRef.current = null;
    }
  };
  const MemberFilesDialog = ({
    triggerLabel,
    triggerClassName,
    triggerVariant = 'outline',
  }: {
    triggerLabel: string;
    triggerClassName?: string;
    triggerVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  }) => (
    <Dialog open={isMemberFilesDialogOpen} onOpenChange={setIsMemberFilesDialogOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName || 'w-full justify-start gap-2'}>
          <File className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Files in Application</DialogTitle>
          <DialogDescription>
            All member files in this application, including the completed CS Summary, eligibility, authorization, and ISP
            uploads.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-2">
          {isDownloadingAllMemberFiles ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={cancelDownloadAllMemberFiles}
            >
              Cancel download
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void downloadAllMemberFiles()}
            disabled={isDownloadingAllMemberFiles || memberFileEntries.length === 0}
          >
            {isDownloadingAllMemberFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download all files (ZIP)
              </>
            )}
          </Button>
        </div>
        {isDownloadingAllMemberFiles ? (
          <div className="space-y-2">
            <Progress value={memberFilesDownloadProgress} className="h-2 w-full" />
            <div className="text-xs text-muted-foreground">
              {memberFilesDownloadStatusLabel || `Preparing files... ${memberFilesDownloadProgress}%`}
            </div>
          </div>
        ) : null}
        {memberFileEntries.length === 0 ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">No uploaded files found yet.</div>
        ) : (
          <div className="space-y-2">
            {memberFileEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{entry.category}</div>
                  {entry.uploadedAtIso ? (
                    <div className="text-xs text-muted-foreground">{format(new Date(entry.uploadedAtIso), 'MMM d, yyyy h:mm a')}</div>
                  ) : null}
                </div>
                <div className="text-sm font-medium">{entry.documentName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {buildDistinctMemberFileDownloadName(entry, memberFileEntries)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleViewMemberFile(entry)}
                    disabled={Boolean(memberFileUrlLoading[entry.id])}
                  >
                    {memberFileUrlLoading[entry.id] ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-3.5 w-3.5" />
                    )}
                    View
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDownloadMemberFile(entry)}
                    disabled={Boolean(memberFileUrlLoading[entry.id])}
                  >
                    {memberFileUrlLoading[entry.id] ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-3.5 w-3.5" />
                    )}
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
  const parseCurrencyAmount = (value: unknown): number | null => {
    if (value == null) return null;
    const normalized = String(value).replace(/[^0-9.]/g, '').trim();
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const proofIncomeActualAmountRaw = String((application as any)?.proofIncomeActualAmount || '').trim();
  const proofIncomeActualAmount = parseCurrencyAmount(proofIncomeActualAmountRaw);
  const proofIncomeSocFlag = proofIncomeActualAmount != null && proofIncomeActualAmount > 1800;
  const socWarningRecipientEmail = String((application as any)?.referrerEmail || '').trim();
  const socWarningAmountLabel = proofIncomeActualAmountRaw || 'the reviewed amount';
  const socWarningMemberName =
    `${String(application?.memberFirstName || '').trim()} ${String(application?.memberLastName || '').trim()}`.trim() || 'the member';
  const socWarningSubject = `Proof of income SOC warning for ${socWarningMemberName}`;
  const socWarningMessage = [
    `We reviewed proof of income for ${socWarningMemberName}.`,
    '',
    `The amount we reviewed is ${socWarningAmountLabel}, which may trigger a Medi-Cal Share of Cost (SOC).`,
    'Please confirm with Medi-Cal that SOC is $0 and reply with confirmation.',
    '',
    'If SOC is not $0, please share next steps so we can continue processing this application.',
  ].join('\n');
  
  const waiverFormStatus = formStatusMap.get('Waivers & Authorizations') as FormStatusType | undefined;
  const servicesDeclined = waiverFormStatus?.choice === 'decline';

  // "New CS Summary" indicator: CS Summary completed in last 24h and not yet reviewed
  const csSummaryForm = (application.forms || []).find(
    (form: any) =>
      (form.name === 'CS Member Summary' || form.name === 'CS Summary') &&
      form.status === 'Completed' &&
      form.dateCompleted
  ) as any;
  const csSummaryCompletedAt: Date | null = (() => {
    const raw = csSummaryForm?.dateCompleted;
    if (!raw) return null;
    if (typeof raw?.toDate === 'function') return raw.toDate();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  const formatDateTimeValue = (value: any): string => {
    if (!value) return '';
    const parsed =
      typeof value?.toDate === 'function'
        ? value.toDate()
        : value instanceof Date
          ? value
          : new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : format(parsed, 'PPP p');
  };
  const kaiserReferralSubmission = (application as any)?.kaiserReferralSubmission || null;
  const kaiserReferralStep5 = (application as any)?.kaiserReferralStep5 || null;
  const kaiserAuthorizationMode = String((application as any)?.kaiserAuthorizationMode || '').trim().toLowerCase();
  const isKaiserAuthReceivedIntake =
    kaiserAuthorizationMode === 'authorization_received'
      ? true
      : kaiserAuthorizationMode === 'authorization_needed'
        ? false
        : Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
          String((application as any)?.intakeType || '').trim().toLowerCase() === 'kaiser_auth_received_via_ils' ||
          String((application as any)?.status || '').trim().toLowerCase() === 'authorization received (doc collection)';
  const effectiveCaspioCalAIMStatus = (() => {
    const raw = String(
      (application as any)?.caspioCalAIMStatus ||
        (application as any)?.CalAIM_Status ||
        (application as any)?.calaimStatus ||
        ''
    ).trim();
    if (/^authorized$/i.test(raw)) return 'Authorized';
    if (/^pending$/i.test(raw)) return 'Pending';
    // CalAIM Status is only Authorized or Pending — require an explicit selection.
    return '';
  })();
  const calaimStatusSelectedForCaspio = Boolean(effectiveCaspioCalAIMStatus);  const kaiserReferralSubmitted = Boolean(
    kaiserReferralSubmission?.submitted ||
      kaiserReferralSubmission?.submittedAt ||
      kaiserReferralSubmission?.submittedAtIso ||
      kaiserReferralSubmission?.providerMessageId
  );
  const kaiserStep5Required = isKaiserPlan && !isKaiserAuthReceivedIntake;
  const kaiserStep5Acknowledged = kaiserStep5Required
    ? Boolean(
        kaiserReferralStep5?.acknowledged ||
          kaiserReferralStep5?.acknowledgedAt ||
          kaiserReferralStep5?.acknowledgedAtIso ||
          kaiserReferralSubmitted
      )
    : false;
  const kaiserReferralSubmittedAtLabel =
    formatDateTimeValue(kaiserReferralSubmission?.submittedAt) ||
    formatDateTimeValue(kaiserReferralSubmission?.submittedAtIso) ||
    '';
  const kaiserReferralFormGeneratedAtLabel =
    formatDateTimeValue((application as any)?.kaiserReferralFormGeneratedAt) ||
    formatDateTimeValue((application as any)?.kaiserReferralFormGeneratedAtIso) ||
    '';
  const kaiserReferralFormGeneratedByName = String((application as any)?.kaiserReferralFormGeneratedByName || '').trim();
  const kaiserReferralFormGeneratedByEmail = String((application as any)?.kaiserReferralFormGeneratedByEmail || '').trim();
  const kaiserStep5AcknowledgedAtLabel =
    formatDateTimeValue(kaiserReferralStep5?.acknowledgedAt) ||
    formatDateTimeValue(kaiserReferralStep5?.acknowledgedAtIso) ||
    kaiserReferralSubmittedAtLabel;
  const isNewCsSummary =
    Boolean(csSummaryCompletedAt) &&
    !application.applicationChecked &&
    Date.now() - (csSummaryCompletedAt as Date).getTime() < 24 * 60 * 60 * 1000;

  const needsUrgentAttention = application.hasLegalRep === 'no_has_rep';

  const completedForms = (application.forms || []).filter((form) => form.status === 'Completed');
  const requiredPathwayFormTitles = new Set(pathwayRequirements.map((req) => req.title));
  if (requiredPathwayFormTitles.has('Room and Board/Tier Level Agreement')) {
    requiredPathwayFormTitles.add('Room and Board/Tier Level Commitment');
    requiredPathwayFormTitles.add('Room and Board Commitment');
  }
  if (requiredPathwayFormTitles.has('Waivers & Authorizations')) {
    requiredPathwayFormTitles.add('Waivers');
  }
  const pendingFormAlerts = completedForms.filter((form) => {
    const canonicalName = getCanonicalFormName(form.name);
    const isSummary = canonicalName === 'CS Member Summary' || canonicalName === 'CS Summary';
    const isRequiredForPathway = requiredPathwayFormTitles.has(canonicalName);
    if (!isSummary && !isRequiredForPathway) return false;
    if (isSummary) {
      return !application.applicationChecked;
    }
    return !form.acknowledged;
  });
  const waiverAlertExists = pendingFormAlerts.some(
    (form) => getCanonicalFormName(form.name) === 'Waivers & Authorizations'
  );
  const waiverNeedsCompletion = getComponentStatus('Waivers & Authorizations') !== 'Completed';
  const pendingFormAlertsWithWaivers = waiverAlertExists || !waiverNeedsCompletion
    ? pendingFormAlerts
    : [
        ...pendingFormAlerts,
        {
          name: 'Waivers & Authorizations',
          status: 'Pending',
          acknowledged: false,
          dateCompleted: null,
        } as any,
      ];
  const canConvertSkeletonToNormal =
    getComponentStatus('CS Member Summary') === 'Completed' || getComponentStatus('CS Summary') === 'Completed';

  const logKaiserReferralFormGenerated = async () => {
    if (!docRef) return;
    const generatedAtIso = new Date().toISOString();
    const generatedByName = String(user?.displayName || '').trim() || 'Admin';
    const generatedByEmail = String(user?.email || '').trim();
    try {
      await setDoc(
        docRef,
        {
          kaiserReferralFormGeneratedAt: serverTimestamp(),
          kaiserReferralFormGeneratedAtIso: generatedAtIso,
          kaiserReferralFormGeneratedByName: generatedByName,
          kaiserReferralFormGeneratedByEmail: generatedByEmail || null,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) =>
        prev
          ? ({
              ...prev,
              kaiserReferralFormGeneratedAt: generatedAtIso,
              kaiserReferralFormGeneratedAtIso: generatedAtIso,
              kaiserReferralFormGeneratedByName: generatedByName,
              kaiserReferralFormGeneratedByEmail: generatedByEmail || null,
            } as any)
          : prev
      );
    } catch (error) {
      console.warn('Failed to record Kaiser referral form generation timestamp:', error);
    }
  };

  const getReviewerMeta = (reqTitle: string, formInfo?: any) => {
    const isSummary = reqTitle === 'CS Member Summary' || reqTitle === 'CS Summary';
    const rawName = isSummary ? (application as any)?.applicationCheckedBy : formInfo?.acknowledgedBy;
    const rawDate = isSummary ? (application as any)?.applicationCheckedDate : formInfo?.acknowledgedDate;

    const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : '';
    const iso = typeof rawDate === 'string' && rawDate.trim() ? rawDate.trim() : '';

    let dateLabel = '';
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = format(d, 'MMM d, yyyy');
      }
    }

    return { name, dateLabel };
  };

  const handleApplicationReviewed = async (checked: boolean) => {
    try {
      const hasCompletedSummary = (application.forms || []).some((form: any) => {
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        return isSummary && form?.status === 'Completed';
      });
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const updateData = {
        applicationChecked: checked,
        applicationCheckedDate: checked ? new Date().toISOString() : null,
        applicationCheckedBy: checked ? reviewerName : null,
        applicationCheckedByUid: checked ? reviewerUid : null,
        // Derived field for staff review workflows
        pendingCsReview: !checked && hasCompletedSummary,
      };

      if (docRef) {
        await setDoc(docRef, updateData, { merge: true });
        setApplication(prev => prev ? { ...prev, ...updateData } : null);

        toast({
          title: checked ? "Application Marked as Checked" : "Application Check Removed",
          description: checked ? "Application has been marked as reviewed" : "Application check status removed",
        });
      }
    } catch (error) {
      console.error('Error updating application checked status:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update application status",
      });
    }
  };

  /** Staff filled CS Summary with family: complete the form card and mark reviewed in one action. */
  const handleCsSummaryMarkReviewed = async () => {
    if (!docRef || !application) return;
    try {
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const reviewedAt = new Date().toISOString();
      let foundSummary = false;
      const updatedForms = (application.forms || []).map((form: any) => {
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        if (!isSummary) return form;
        foundSummary = true;
        return {
          ...form,
          name: name || 'CS Member Summary',
          status: 'Completed',
          dateCompleted: form?.dateCompleted || reviewedAt,
          completedBy: form?.completedBy || reviewerName,
          completedByUid: form?.completedByUid || reviewerUid,
          completedWithFamily: true,
          acknowledged: true,
          acknowledgedBy: reviewerName,
          acknowledgedByUid: reviewerUid,
          acknowledgedDate: reviewedAt,
        };
      });
      if (!foundSummary) {
        updatedForms.push({
          name: 'CS Member Summary',
          status: 'Completed',
          type: 'online-form',
          href: '/admin/forms/review',
          dateCompleted: reviewedAt,
          completedBy: reviewerName,
          completedByUid: reviewerUid,
          completedWithFamily: true,
          acknowledged: true,
          acknowledgedBy: reviewerName,
          acknowledgedByUid: reviewerUid,
          acknowledgedDate: reviewedAt,
        } as any);
      }

      const updateData = {
        forms: updatedForms,
        applicationChecked: true,
        applicationCheckedDate: reviewedAt,
        applicationCheckedBy: reviewerName,
        applicationCheckedByUid: reviewerUid,
        pendingCsReview: false,
        csSummaryReviewedWithFamilyAt: reviewedAt,
        csSummaryReviewedWithFamilyBy: reviewerName,
      };

      await setDoc(docRef, updateData, { merge: true });
      setApplication((prev) => (prev ? { ...prev, ...updateData } : null));

      toast({
        title: 'CS Summary marked reviewed',
        description: 'Form marked Completed and Reviewed (filled with family).',
      });
    } catch (error) {
      console.error('Error marking CS Summary reviewed:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to mark CS Summary as reviewed.',
      });
    }
  };

  const handleFormReviewed = async (formName: string, checked: boolean) => {
    if (!docRef) return;
    try {
      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      let didUpdateExisting = false;
      const updatedForms = (application.forms || []).map((form) => {
        if (form.name !== formName) return form;
        didUpdateExisting = true;
        const hasStoredFile =
          Boolean(String((form as any)?.filePath || '').trim()) ||
          Boolean(String((form as any)?.downloadURL || '').trim()) ||
          (Array.isArray((form as any)?.uploadedFiles) && (form as any).uploadedFiles.length > 0);
        const hasOpenRevision = Boolean(
          String((form as any)?.revisionRequestedAt || '').trim() ||
            String((form as any)?.revisionRequestedReason || '').trim()
        );
        // Marking reviewed resolves an open "request more info" so the card can move forward.
        const resolvesRevision = checked && hasOpenRevision && hasStoredFile;
        return {
          ...form,
          ...(resolvesRevision
            ? {
                status: 'Completed' as const,
                revisionRequestedReason: null,
                revisionRequestedAt: null,
                revisionRequestedBy: null,
                revisionRequestedByUid: null,
                revisionEmailTo: null,
                revisionEmailSentAt: null,
              }
            : {}),
          acknowledged: checked,
          acknowledgedBy: checked ? reviewerName : null,
          acknowledgedByUid: checked ? reviewerUid : null,
          acknowledgedDate: checked ? new Date().toISOString() : null,
        };
      });

      if (!didUpdateExisting) {
        const existingStatus = String(formStatusMap.get(formName)?.status || '').trim();
        updatedForms.push({
          name: formName,
          status: existingStatus || 'Completed',
          acknowledged: checked,
          acknowledgedBy: checked ? reviewerName : null,
          acknowledgedByUid: checked ? reviewerUid : null,
          acknowledgedDate: checked ? new Date().toISOString() : null,
        } as FormStatusType);
      }

      const pendingDocReviewCount = countPendingDocumentReviews(updatedForms);

      await setDoc(docRef, {
        forms: updatedForms,
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
      }, { merge: true });
      setApplication(prev => prev ? { ...prev, forms: updatedForms } : null);

      toast({
        title: checked ? 'Document marked as reviewed' : 'Review removed',
        description: `${formName} ${checked ? 'acknowledged' : 'set back to pending'}.`,
      });
    } catch (error) {
      console.error('Error updating form review status:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update document review status",
      });
    }
  };

  const handleRejectFormRedo = async (
    formName: string,
    sendEmail: boolean,
    options?: {
      scope?: 'form' | 'info' | 'file';
      targetFileKey?: string;
      resetCard?: boolean;
      useSameLink?: boolean;
      emailRecipient?: 'primary' | 'creator';
    }
  ) => {
    if (!docRef || !application) return;

    const buildRevisionInstructions = (portalLoginUrl: string, portalPathUrl: string) =>
      [
        'Log in to the application portal and update this form so we can continue processing.',
        '',
        `Go directly to your application: ${portalPathUrl}`,
        `Login: ${portalLoginUrl}`,
      ].join('\n');
    const looksLikeEmail = (value: unknown) => {
      const email = String(value || '').trim().toLowerCase();
      // Reject placeholders like N/A and require a normal mailbox shape.
      if (!email || email === 'n/a' || email === 'na' || email === 'none' || email === 'null') return false;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };
    const primaryContactEmail = (() => {
      const candidates = [
        (application as any)?.bestContactEmail,
        (application as any)?.primaryContactEmail,
        (application as any)?.contactEmail,
        (application as any)?.linkedToFamilyEmail,
      ];
      for (const candidate of candidates) {
        const email = String(candidate || '').trim();
        if (looksLikeEmail(email)) return email;
      }
      return '';
    })();
    const applicationCreatorEmail = (() => {
      const candidates = [
        (application as any)?.referrerEmail,
        (application as any)?.submittedByEmail,
        (application as any)?.createdByEmail,
        (application as any)?.submitterEmail,
      ];
      for (const candidate of candidates) {
        const email = String(candidate || '').trim();
        if (looksLikeEmail(email)) return email;
      }
      return '';
    })();
    const preferredRecipient =
      options?.emailRecipient ||
      rejectEmailRecipientByForm[formName] ||
      (primaryContactEmail ? 'primary' : applicationCreatorEmail ? 'creator' : 'primary');
    const recipientType: 'primary' | 'creator' =
      preferredRecipient === 'creator' && applicationCreatorEmail
        ? 'creator'
        : preferredRecipient === 'primary' && primaryContactEmail
          ? 'primary'
          : applicationCreatorEmail
            ? 'creator'
            : 'primary';
    const recipientEmail =
      recipientType === 'creator' ? applicationCreatorEmail : primaryContactEmail || applicationCreatorEmail;
    const recipientLabel =
      recipientType === 'creator' ? 'Application creator / submitter' : 'Primary contact';
    if (sendEmail && !recipientEmail) {
      toast({
        variant: 'destructive',
        title: 'Email not available',
        description:
          'No valid primary contact or application creator email on this application. Add a real email, then try again — or reject without sending email.',
      });
      return;
    }

    const rejectScope = options?.scope === 'info' ? 'info' : options?.scope === 'file' ? 'file' : 'form';
    // Info-only requests must never wipe uploads; ignore resetCard if scope is info.
    const shouldResetCard = rejectScope !== 'info' && options?.resetCard !== false;
    const targetFileKey = String(options?.targetFileKey || '').trim();
    const targetEligibilityUploadId = targetFileKey.startsWith('eligibility:') ? targetFileKey.replace('eligibility:', '') : '';
    const targetFormFilePath = targetFileKey.startsWith('form-path:') ? targetFileKey.replace('form-path:', '') : '';
    const targetEligibilityUpload =
      rejectScope === 'file' && targetEligibilityUploadId
        ? getEligibilityScreenshotUploads().find((upload) => upload.id === targetEligibilityUploadId)
        : null;
    const focusIdByFormName: Record<string, string> = {
      'cs member summary': 'cs-summary',
      'cs summary': 'cs-summary',
      'waivers & authorizations': 'waivers',
      'proof of income': 'proof-of-income',
      "lic 602a - physician's report": 'lic-602a',
      'medicine list': 'medicine-list',
      'declaration of eligibility': 'declaration-of-eligibility',
      'snf facesheet': 'snf-facesheet',
    };
    const focusId = focusIdByFormName[String(formName || '').trim().toLowerCase()] || '';
    const latestHistoryEntry = (() => {
      const requestedName = String(formName || '').trim();
      const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];
      const matched = forms.find((form: any) => {
        const currentName = String(form?.name || '').trim();
        const isWaiversAlias =
          (currentName === 'Waivers' && requestedName === 'Waivers & Authorizations') ||
          (currentName === 'Waivers & Authorizations' && requestedName === 'Waivers') ||
          (isWaiverFormName(currentName) && isWaiverFormName(requestedName));
        return currentName === requestedName || isWaiversAlias;
      });
      if (!matched) return null;
      const history = Array.isArray((matched as any)?.revisionHistory) ? ((matched as any).revisionHistory as any[]) : [];
      return history[0] || null;
    })();
    const parseLinkFromReason = (reason: string, marker: string) => {
      const line = reason
        .split('\n')
        .map((value) => value.trim())
        .find((value) => value.toLowerCase().startsWith(marker.toLowerCase()));
      if (!line) return '';
      return String(line.slice(marker.length).trim()).replace(/[)>.,;]+$/g, '');
    };
    const previousReason = String(latestHistoryEntry?.reason || '').trim();
    const previousPortalLoginUrl =
      String(latestHistoryEntry?.portalLoginUrl || '').trim() || parseLinkFromReason(previousReason, 'Login:');
    const previousPortalPathUrl =
      String(latestHistoryEntry?.portalPathUrl || '').trim() ||
      parseLinkFromReason(previousReason, 'Go directly to your application:');
    const pathwayReturnPath = `/pathway?applicationId=${encodeURIComponent(String(applicationId || ''))}${
      focusId ? `&focus=${encodeURIComponent(focusId)}&mode=upload-missing` : ''
    }`;
    const useSameLink = Boolean(options?.useSameLink);
    const applicantPortalLoginUrl =
      useSameLink && previousPortalLoginUrl
        ? previousPortalLoginUrl
        : `https://connectcalaim.com/login?redirect=${encodeURIComponent(pathwayReturnPath)}&forceLogin=1`;
    const applicantPathwayUrl =
      useSameLink && previousPortalPathUrl ? previousPortalPathUrl : `https://connectcalaim.com${pathwayReturnPath}`;
    const customDescription = String(rejectEmailBodyByForm[formName] || '').trim();
    if (!customDescription) {
      toast({
        variant: 'destructive',
        title: 'Description required',
        description: 'Add a custom revision description before sending or resetting.',
      });
      return;
    }
    const revisionNote = [customDescription, '', buildRevisionInstructions(applicantPortalLoginUrl, applicantPathwayUrl)].join(
      '\n'
    );

    setRejectingByForm((prev) => ({ ...prev, [formName]: true }));
    try {
      const targetForms = (application.forms || []).filter(
        (form: any) => String(form?.name || '').trim() === formName
      );
      const targetFileLabel = (() => {
        if (targetEligibilityUpload) return String(targetEligibilityUpload.fileName || 'Selected file').trim();
        if (!targetFormFilePath) return '';
        for (const form of targetForms) {
          const files = Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [];
          const fromUploaded = files.find((entry: any) => String(entry?.filePath || '').trim() === targetFormFilePath);
          if (fromUploaded) return String(fromUploaded?.fileName || 'Selected file').trim();
          if (String(form?.filePath || '').trim() === targetFormFilePath) {
            return String(form?.fileName || 'Selected file').trim();
          }
        }
        return 'Selected file';
      })();
      const storagePathsToDelete = (
        rejectScope === 'file'
          ? [
              targetEligibilityUpload ? String(targetEligibilityUpload.filePath || '').trim() : '',
              targetFormFilePath ? targetFormFilePath : '',
            ]
          : targetForms.flatMap((form: any) => {
              const primary = String(form?.filePath || '').trim();
              const extra = (Array.isArray(form?.uploadedFiles) ? form.uploadedFiles : [])
                .map((entry: any) => String(entry?.filePath || '').trim())
                .filter(Boolean);
              return [primary, ...extra];
            })
      ).filter(Boolean);

      // Best-effort cleanup: remove prior uploaded file objects so the rejected component is a true reset.
      if (shouldResetCard && storagePathsToDelete.length > 0) {
        await Promise.all(
          storagePathsToDelete.map(async (path) => {
            try {
              await deleteObject(ref(storage, path));
            } catch (deleteErr: any) {
              const code = String(deleteErr?.code || '').trim();
              if (code !== 'storage/object-not-found' && code !== 'storage/unauthorized') {
                console.warn('Reject redo: failed to delete prior storage object', { formName, path, code });
              }
            }
          })
        );
      }

      const reviewerName = user?.displayName || user?.email || 'Admin';
      const reviewerUid = user?.uid || null;
      const signatureMeta = getManagerSignatureMeta();
      const isSummary = formName === 'CS Member Summary' || formName === 'CS Summary';
      const rejectedAtIso = new Date().toISOString();
      let sentAtIso: string | null = null;

      if (sendEmail) {
        const subject = `Action needed: Please redo ${formName}`;
        const emailMessage = revisionNote;
        const primaryContactName = getPrimaryContactDisplayName() || 'there';
        const creatorContactName =
          String((application as any)?.referrerName || (application as any)?.submittedByName || '').trim() ||
          'there';
        try {
          const familyCc =
            recipientType === 'primary'
              ? collectPrimaryContactCcEmails(application as unknown as Record<string, unknown>, recipientEmail)
              : [];
          const response = await fetch('/api/email/send', {
            method: 'POST',
            headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: recipientEmail,
              ...(familyCc.length ? { cc: familyCc } : {}),
              includeBcc: false,
              subject,
              memberName: recipientType === 'creator' ? creatorContactName : primaryContactName,
              staffName: signatureMeta.managerName || reviewerName,
              staffTitle: signatureMeta.managerTitle,
              staffEmail: signatureMeta.managerEmail,
              message: emailMessage,
              status: 'Requires Revision',
              portalUrl: applicantPortalLoginUrl,
              healthPlan: String(application.healthPlan || ''),
            }),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.success) {
            throw new Error(result?.message || 'Could not send redo email.');
          }
          sentAtIso = new Date().toISOString();
        } catch (emailError: any) {
          console.warn('Reject form redo: email failed, continuing with rejection save', emailError);
          toast({
            variant: 'destructive',
            title: 'Rejection will be saved, but email failed',
            description: String(emailError?.message || 'Could not send redo email to the selected recipient.'),
          });
        }
      }

      let found = false;
      const updatedForms = (application.forms || []).map((form: any) => {
        const currentName = String(form?.name || '').trim();
        const requestedName = String(formName || '').trim();
        const isWaiversAlias =
          (currentName === 'Waivers' && requestedName === 'Waivers & Authorizations') ||
          (currentName === 'Waivers & Authorizations' && requestedName === 'Waivers') ||
          (isWaiverFormName(currentName) && isWaiverFormName(requestedName));
        if (currentName !== requestedName && !isWaiversAlias) return form;
        found = true;
        const isWaiversForm = isWaiverFormName(requestedName);
        const existingHistory = Array.isArray((form as any)?.revisionHistory)
          ? ((form as any).revisionHistory as any[])
          : [];
        const historyEntry = {
          reason: revisionNote,
          rejectedAt: rejectedAtIso,
          rejectedBy: reviewerName,
          rejectedByUid: reviewerUid,
          emailed: Boolean(sentAtIso),
          emailTo: sentAtIso ? recipientEmail : null,
          emailSentAt: sentAtIso,
          emailRecipientType: sentAtIso ? recipientType : null,
          scope: rejectScope,
          targetFileKey: targetFileKey || null,
          targetFileLabel: targetFileLabel || null,
          portalLoginUrl: applicantPortalLoginUrl,
          portalPathUrl: applicantPathwayUrl,
        };
        const rawUploads = Array.isArray((form as any)?.uploadedFiles) ? (form as any).uploadedFiles : [];
        const normalizedUploads = rawUploads
          .map((entry: any) => ({
            fileName: String(entry?.fileName || '').trim(),
            filePath: String(entry?.filePath || '').trim(),
            downloadURL: String(entry?.downloadURL || '').trim() || null,
          }))
          .filter((entry: any) => Boolean(entry.fileName || entry.filePath));
        const fallbackUpload =
          String(form?.filePath || '').trim() || String(form?.fileName || '').trim()
            ? [
                {
                  fileName: String(form?.fileName || '').trim() || 'Uploaded file',
                  filePath: String(form?.filePath || '').trim(),
                  downloadURL: String(form?.downloadURL || '').trim() || null,
                },
              ]
            : [];
        const currentUploads = normalizedUploads.length > 0 ? normalizedUploads : fallbackUpload;
        const remainingUploads =
          rejectScope === 'file' && targetFormFilePath
            ? currentUploads.filter((entry: any) => String(entry?.filePath || '').trim() !== targetFormFilePath)
            : currentUploads;
        const hasRemainingUploads = remainingUploads.length > 0;
        const nextPrimaryUpload = hasRemainingUploads ? remainingUploads[0] : null;
        const shouldPreserveNonRejectedFiles = rejectScope === 'file' && hasRemainingUploads;
        if (!shouldResetCard) {
          return {
            ...form,
            revisionRequestedReason: revisionNote,
            revisionRequestedAt: rejectedAtIso,
            revisionRequestedBy: reviewerName,
            revisionRequestedByUid: reviewerUid,
            revisionEmailTo: sentAtIso ? recipientEmail : null,
            revisionEmailRecipientType: sentAtIso ? recipientType : null,
            revisionEmailSentAt: sentAtIso,
            revisionHistory: [historyEntry, ...existingHistory].slice(0, 10),
          };
        }
        return {
          ...form,
          status: shouldPreserveNonRejectedFiles ? 'Completed' : 'Pending',
          dateCompleted: shouldPreserveNonRejectedFiles ? form?.dateCompleted || null : null,
          // Reset generic completion/upload artifacts so users can resubmit cleanly.
          fileName: shouldPreserveNonRejectedFiles
            ? remainingUploads.map((entry: any) => String(entry.fileName || '').trim()).filter(Boolean).join(', ')
            : null,
          filePath: shouldPreserveNonRejectedFiles ? String(nextPrimaryUpload?.filePath || '').trim() || null : null,
          downloadURL: shouldPreserveNonRejectedFiles ? String(nextPrimaryUpload?.downloadURL || '').trim() || null : null,
          uploadedFiles: shouldPreserveNonRejectedFiles ? remainingUploads : [],
          source: null,
          standaloneUploadId: null,
          acknowledged: false,
          acknowledgedBy: null,
          acknowledgedByUid: null,
          acknowledgedDate: null,
          ...(isWaiversForm
            ? {
                signerType: null,
                signerName: '',
                signerRelationship: '',
                choice: null,
                ackHipaa: false,
                ackLiability: false,
                ackFoc: false,
                ackRoomAndBoard: false,
                ackSocDetermination: false,
                monthlyIncome: '',
                incomeSource: [],
              }
            : {}),
          revisionRequestedReason: revisionNote,
          revisionRequestedAt: rejectedAtIso,
          revisionRequestedBy: reviewerName,
          revisionRequestedByUid: reviewerUid,
          revisionEmailTo: sentAtIso ? recipientEmail : null,
          revisionEmailRecipientType: sentAtIso ? recipientType : null,
          revisionEmailSentAt: sentAtIso,
          revisionHistory: [historyEntry, ...existingHistory].slice(0, 10),
        };
      });

      if (!found) {
        throw new Error('Could not find this form on the application.');
      }

      const pendingDocReviewCount = countPendingDocumentReviews(updatedForms);

      const nextEligibilityUploads =
        shouldResetCard && rejectScope === 'file' && targetEligibilityUploadId
          ? getEligibilityScreenshotUploads().filter((upload) => upload.id !== targetEligibilityUploadId)
          : getEligibilityScreenshotUploads();

      const patch: Record<string, any> = {
        forms: updatedForms,
        status: 'Requires Revision',
        lastUpdated: serverTimestamp(),
        pendingDocReviewCount,
        pendingDocReviewUpdatedAt: serverTimestamp(),
      };
      if (rejectScope === 'file' && targetEligibilityUploadId) {
        patch.eligibilityScreenshotUploads = nextEligibilityUploads;
      }

      if (isWaiverFormName(formName)) {
        patch.choice = null;
        patch.ackHipaa = false;
        patch.ackLiability = false;
        patch.ackFoc = false;
        patch.ackRoomAndBoard = false;
        patch.ackSocDetermination = false;
        patch.monthlyIncome = '';
        patch.incomeSource = [];
      }

      if (isSummary) {
        patch.applicationChecked = false;
        patch.applicationCheckedDate = null;
        patch.applicationCheckedBy = null;
        patch.applicationCheckedByUid = null;
        patch.pendingCsReview = false;
      }

      await setDoc(docRef, patch, { merge: true });
      setApplication((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...patch,
          forms: updatedForms,
        };
      });

      setRejectEmailBodyByForm((prev) => {
        const next = { ...prev };
        delete next[formName];
        return next;
      });
      setRejectScopeByForm((prev) => ({ ...prev, [formName]: 'form' }));
      setRejectDialogForm(null);
      toast({
        title: sendEmail && sentAtIso ? 'Rejection saved and email sent' : 'Rejection saved',
        description:
          sendEmail && sentAtIso
            ? shouldResetCard
              ? `${formName} reset and revision email sent to ${recipientEmail} (${recipientLabel}).`
              : `Revision email sent to ${recipientEmail} (${recipientLabel}) and card data/files were kept.`
            : sendEmail && !sentAtIso
              ? shouldResetCard
                ? `${formName} reset. Email was not sent — update contact emails and notify them separately.`
                : `${formName} marked requires revision. Email was not sent — update contact emails and notify them separately.`
              : rejectScope === 'file'
                ? shouldResetCard
                  ? 'Selected file rejected. Remaining files were kept and applicant can upload replacements.'
                  : 'Marked requires revision without resetting the selected file.'
                : shouldResetCard
                  ? `${formName} set to pending. Applicant can now redo the form.`
                  : `${formName} marked as requires revision without resetting current card data.`,
      });
    } catch (error: any) {
      console.error('Reject form redo error:', error);
      toast({
        variant: 'destructive',
        title: 'Could not reject form',
        description: error?.message || 'Failed to process rejection.',
      });
    } finally {
      setRejectingByForm((prev) => ({ ...prev, [formName]: false }));
    }
  };

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: Boolean(waiverFormStatus?.ackHipaa) },
      { id: 'liability', label: 'Liability Waiver', completed: Boolean(waiverFormStatus?.ackLiability) },
      { id: 'foc', label: 'Freedom of Choice', completed: Boolean(waiverFormStatus?.ackFoc) },
      { id: 'rb', label: 'Room & Board Commitment', completed: Boolean((waiverFormStatus as any)?.ackRoomAndBoard) }
  ];

  const updateWaiverChecklistTask = async (
    taskId: 'hipaa' | 'liability' | 'foc' | 'rb',
    checked: boolean
  ) => {
    if (!docRef || !application) return;
    try {
      const existingForms = Array.isArray((application as any)?.forms) ? ([...(application as any).forms] as any[]) : [];
      const waiverIndex = existingForms.findIndex((form: any) => {
        const name = String(form?.name || '').trim();
        return name === 'Waivers & Authorizations' || name === 'Waivers' || isWaiverFormName(name);
      });
      const currentWaiverForm =
        waiverIndex >= 0
          ? { ...(existingForms[waiverIndex] || {}) }
          : ({
              name: 'Waivers & Authorizations',
              type: 'online-form',
              href: '/admin/forms/waivers',
              status: 'Pending',
            } as any);

      const nextWaiverForm = { ...currentWaiverForm } as any;
      if (taskId === 'hipaa') nextWaiverForm.ackHipaa = checked;
      if (taskId === 'liability') nextWaiverForm.ackLiability = checked;
      if (taskId === 'foc') nextWaiverForm.ackFoc = checked;
      if (taskId === 'rb') {
        nextWaiverForm.ackRoomAndBoard = checked;
        nextWaiverForm.ackSocDetermination = checked;
      }

      const nextAckHipaa = Boolean(nextWaiverForm.ackHipaa);
      const nextAckLiability = Boolean(nextWaiverForm.ackLiability);
      const nextAckFoc = Boolean(nextWaiverForm.ackFoc);
      const nextAckRoomAndBoard = Boolean(nextWaiverForm.ackRoomAndBoard);
      const nextAllChecked = nextAckHipaa && nextAckLiability && nextAckFoc && nextAckRoomAndBoard;

      nextWaiverForm.status = nextAllChecked ? 'Completed' : 'Pending';
      nextWaiverForm.dateCompleted = nextAllChecked ? Timestamp.now() : null;
      nextWaiverForm.lastUpdated = Timestamp.now();

      if (waiverIndex >= 0) existingForms[waiverIndex] = nextWaiverForm;
      else existingForms.push(nextWaiverForm);

      const patch = {
        forms: existingForms,
        ackHipaa: nextAckHipaa,
        ackLiability: nextAckLiability,
        ackFoc: nextAckFoc,
        ackRoomAndBoard: nextAckRoomAndBoard,
        ackSocDetermination: nextAckRoomAndBoard,
        lastUpdated: serverTimestamp(),
      } as any;

      await setDoc(docRef, patch, { merge: true });
      setApplication((prev: any) => (prev ? ({ ...prev, ...patch, forms: existingForms } as any) : prev));
    } catch (error) {
      console.error('Failed to update waiver checklist task:', error);
      toast({
        variant: 'destructive',
        title: 'Could not update waiver checklist',
        description: 'Please try again.',
      });
    }
  };
  
    const consolidatedMedicalDocuments = [
      { id: 'waivers-check', name: 'Waivers & Authorizations' },
      { id: 'lic-602a-check', name: "LIC 602A - Physician's Report" },
      { id: 'med-list-check', name: 'Medicine List' },
      { id: 'facesheet-check', name: 'SNF Facesheet' },
      { id: 'decl-elig-check', name: 'Declaration of Eligibility' },
  ].filter(doc => pathwayRequirements.some(req => req.title === doc.name));

  const persistApplicationPatch = async (patch: Record<string, any>) => {
    if (!docRef || !applicationId) return;
    const writes: Array<Promise<void>> = [setDoc(docRef, patch, { merge: true })];
    const isAdminStored = applicationId.startsWith('admin_app_') || !appUserId;
    // Keep the top-level applications doc mirror in sync for admin reporting/tracking.
    if (!isAdminStored && firestore) {
      const adminMirrorRef = doc(firestore, 'applications', applicationId);
      writes.push(setDoc(adminMirrorRef, patch, { merge: true }));
    }
    await Promise.all(writes);
  };

  // Update application progression status
  const updateProgressionStatus = async (status: string, statusType: 'kaiser' | 'healthNet') => {
    if (!docRef || !application) return;
    
    setIsUpdatingProgression(true);
    try {
      const updateData = statusType === 'kaiser' 
        ? { kaiserStatus: status }
        : { healthNetStatus: status };
      
      await persistApplicationPatch(updateData);
      
      // Update local state
      setApplication(prev => prev ? { ...prev, ...updateData } : null);

      let nextStepForCalendar = '';
      if (statusType === 'kaiser') {
        const oldSuggested = String(kaiserNextStatus || '').trim();
        const currentNext = String((staffTracker as any)?.nextStep || '').trim();
        const idx = kaiserWorkflowOptions.findIndex((s) => s === status);
        const next = idx !== -1 && idx < kaiserWorkflowOptions.length - 1 ? String(kaiserWorkflowOptions[idx + 1] || '').trim() : '';
        // Only auto-update nextStep if it was empty OR it matched the previous suggestion.
        if (next && (!currentNext || currentNext === oldSuggested)) {
          updateStaffTracker({ nextStep: next } as any);
          if (!nextStepDateInputValue) setNextStepDateMissing(true);
        }
        nextStepForCalendar = next || oldSuggested;
      } else if (statusType === 'healthNet') {
        const oldSuggested = String(healthNetNextStatus || '').trim();
        const currentNext = String((staffTracker as any)?.nextStep || '').trim();
        const idx = healthNetSteps.findIndex((s) => s === status);
        const next = idx !== -1 && idx < healthNetSteps.length - 1 ? String(healthNetSteps[idx + 1] || '').trim() : '';
        if (next && (!currentNext || currentNext === oldSuggested)) {
          updateStaffTracker({ nextStep: next } as any);
          if (!nextStepDateInputValue) setNextStepDateMissing(true);
        }
        nextStepForCalendar = next || oldSuggested;
      }

      // Create a calendar task for the assigned staff member whenever progression status changes
      const assignedStaffId = String((application as any)?.assignedStaffId || '').trim();
      const assignedStaffName = String((application as any)?.assignedStaffName || '').trim();
      const memberName = `${String(application.memberFirstName || '').trim()} ${String(application.memberLastName || '').trim()}`.trim() || 'Member';
      const planLabel = statusType === 'kaiser' ? 'Kaiser' : 'Health Net';
      const calendarSource = statusType === 'kaiser' ? 'caspio_kaiser' : 'caspio_health_net';
      const todayStr = new Date().toISOString().split('T')[0];
      try {
        await fetch('/api/daily-tasks', {
          method: 'POST',
          headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${planLabel} status update: ${memberName}`,
            description: `Status changed to "${status}"${nextStepForCalendar ? `. Next step: ${nextStepForCalendar}` : ''}.`,
            memberName,
            healthPlan: planLabel,
            assignedTo: assignedStaffId || String(user?.uid || '').trim(),
            assignedToName: assignedStaffName || String(user?.displayName || user?.email || 'Admin').trim(),
            priority: 'medium',
            dueDate: todayStr,
            createdBy: String(user?.uid || '').trim(),
            notes: nextStepForCalendar ? `Suggested next step: ${nextStepForCalendar}` : '',
            applicationId: applicationId,
            applicationLink: `/admin/applications/${applicationId}`,
            source: calendarSource,
          }),
        });
      } catch (calendarError) {
        console.warn('Failed to create calendar task for status update:', calendarError);
      }

      toast({
        title: "Status Updated",
        description: `${planLabel} progression status updated to: ${status}`,
        className: "bg-green-100 text-green-900 border-green-200",
      });
    } catch (error: any) {
      console.error('Error updating progression status:', error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update progression status. Please try again.",
      });
    } finally {
      setIsUpdatingProgression(false);
    }
  };

  const updateTrackingStatus = async (status: string) => {
    if (!docRef || !application) return;

    setIsUpdatingTracking(true);
    try {
      const isEligibilityDecision =
        status === 'CalAIM Eligible' || status === 'Not CalAIM Eligible';
      const now = new Date();
      const eligibilityCheckDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
        now.getDate()
      ).padStart(2, '0')}/${now.getFullYear()}`;
      const updateData = {
        calaimTrackingStatus: status,
        ...(isEligibilityDecision
          ? {
              lastEligibilityCheckAt: now.toISOString(),
              lastEligibilityCheckDate: eligibilityCheckDate,
              memberActionLog: arrayUnion(
                buildMemberActionLogEntry({
                  actionKey: MEMBER_ACTION_KEYS.eligibilityCheck,
                  label: `Eligibility check: ${status}`,
                  atIso: now.toISOString(),
                  byName: String(user?.displayName || '').trim() || null,
                  byEmail: String(user?.email || '').trim() || null,
                  byUid: String(user?.uid || '').trim() || null,
                  details: status,
                })
              ),
            }
          : {}),
        calaimTrackingReason:
          status === 'Not CalAIM Eligible'
            ? (application as any)?.calaimTrackingReason || ''
            : '',
        calaimNotEligibleSwitchingProviders:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleSwitchingProviders)
            : false,
        calaimNotEligibleHasSoc:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleHasSoc)
            : false,
        calaimNotEligibleOutOfCounty:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleOutOfCounty)
            : false,
        calaimNotEligibleOther:
          status === 'Not CalAIM Eligible'
            ? Boolean((application as any)?.calaimNotEligibleOther)
            : false,
        calaimNotEligibleOtherReason:
          status === 'Not CalAIM Eligible'
            ? (application as any)?.calaimNotEligibleOtherReason || ''
            : ''
      };

      await setDoc(docRef, updateData, { merge: true });
      const { memberActionLog: _omitActionLog, ...localEligibilityUpdate } = updateData as any;
      setApplication(prev => prev ? { ...prev, ...localEligibilityUpdate } : null);

      toast({
        title: 'Tracking Updated',
        description: `Application tracking set to: ${status}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error updating tracking status:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update application tracking. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const updateCaspioCalAIMStatus = async (status: string) => {
    if (!docRef || !application) return;
    setIsUpdatingCaspioStatus(true);
    const nextStatus = String(status || '').trim();
    const inactiveLabel = canonicalInactiveCalaimStatus(nextStatus);
    try {
      const updateData = {
        caspioCalAIMStatus: nextStatus,
        CalAIM_Status: nextStatus,
        calaimStatus: nextStatus,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(docRef, updateData, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...updateData } as any) : prev));
      toast({
        title: nextStatus ? 'CalAIM Status updated' : 'CalAIM Status cleared',
        description: inactiveLabel
          ? `${inactiveLabel} moves this application to Inactive. It stays in the app and is hidden from active lists and the progress tracker.`
          : nextStatus
            ? `Caspio push status set to ${nextStatus}.`
            : 'CalAIM Status is unselected. Choose Authorized or Pending before Push to Caspio.',
        className: nextStatus ? 'bg-green-100 text-green-900 border-green-200' : undefined,
      });
    } catch (error) {
      console.error('Error updating Caspio CalAIM status:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update CalAIM Status for Caspio.',
      });
    } finally {
      setIsUpdatingCaspioStatus(false);
    }
  };

  const updateSocialWorkerHoldStatus = async (status: string) => {
    if (!docRef || !application) return;
    const nextStatus = String(status || '').trim() || DEFAULT_SOCIAL_WORKER_HOLD_VALUE;
    setIsUpdatingSocialWorkerHold(true);
    try {
      const updateData = {
        holdForSocialWorkerStatus: nextStatus,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(docRef, updateData, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...updateData } as any) : prev));
      toast({
        title: 'SW hold status updated',
        description: `Social Worker hold set to ${nextStatus}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error updating Social Worker hold status:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update SW hold status.',
      });
    } finally {
      setIsUpdatingSocialWorkerHold(false);
    }
  };

  const handleSaveSwPortalInvite = async () => {
    if (!docRef || !application) return;
    if (!swPortalAssignment?.eligible) {
      toast({
        variant: 'destructive',
        title: 'Social worker assignment unavailable',
        description: 'Kaiser status must be RN Visit Needed with an assigned social worker.',
      });
      return;
    }
    if (!swPortalAssignment.assignedSwEmail) {
      toast({
        variant: 'destructive',
        title: 'Missing social worker email',
        description: 'No assigned social worker email was found for this member.',
      });
      return;
    }

    setIsSavingSwPortalInvite(true);
    try {
      const memberName =
        `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() ||
        'Member';
      const memberId =
        String(swPortalAssignment.memberId || '').trim() ||
        String((application as any)?.clientId2 || (application as any)?.client_ID2 || '').trim();
      const actorName = String(user?.displayName || user?.email || 'Staff').trim();
      const actorEmail = String(user?.email || '').trim().toLowerCase();

      if (swPortalInviteEnabled && firestore && memberId) {
        await setDoc(
          doc(firestore, 'alft_assignments', memberId),
          {
            memberId,
            memberName,
            memberFirstName: String((application as any)?.memberFirstName || '').trim(),
            memberLastName: String((application as any)?.memberLastName || '').trim(),
            memberMrn: String((application as any)?.memberMrn || '').trim(),
            birthDate: String((application as any)?.memberDob || '').trim(),
            kaiserStatus: swPortalAssignment.kaiserStatus || 'RN Visit Needed',
            assignedSwEmail: swPortalAssignment.assignedSwEmail,
            assignedSwName: swPortalAssignment.assignedSwName || swPortalAssignment.assignedSwEmail,
            assignedByEmail: actorEmail,
            assignedByName: actorName,
            assignedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'assigned',
          },
          { merge: true }
        );

        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: swPortalAssignment.assignedSwEmail,
            includeBcc: false,
            subject: `ALFT Invite: ${memberName}`,
            memberName: swPortalAssignment.assignedSwName || 'Social Worker',
            staffName: actorName,
            staffTitle: 'ALFT Assignment Coordinator',
            staffEmail: actorEmail || undefined,
            status: 'In Progress',
            healthPlan: 'Kaiser',
            portalUrl: `${window.location.origin}/sw-login`,
            message: [
              `You have been assigned to complete the ALFT workflow for ${memberName}.`,
              '',
              'Please log in to the Social Worker Portal and open ALFT Upload to continue.',
              `Portal login: ${window.location.origin}/sw-login`,
            ].join('\n'),
          }),
        });
        const result = await response.json().catch(() => ({} as any));
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'Failed to send social worker invite email.');
        }
      }

      await setDoc(
        docRef,
        {
          swPortalInviteEnabled,
          swPortalAssignedName: swPortalAssignment.assignedSwName || swPortalAssignment.assignedSwEmail,
          swPortalAssignedEmail: swPortalAssignment.assignedSwEmail,
          swPortalKaiserStatus: swPortalAssignment.kaiserStatus,
          swPortalMemberId: memberId || null,
          swPortalInviteUpdatedAt: serverTimestamp(),
          swPortalInviteUpdatedBy: actorName,
          swPortalInviteUpdatedByEmail: actorEmail || null,
          ...(swPortalInviteEnabled
            ? {
                swPortalInviteSentAt: serverTimestamp(),
                swPortalInviteSentBy: actorName,
                swPortalInviteSentByEmail: actorEmail || null,
              }
            : {}),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      setApplication((prev) =>
        prev
          ? ({
              ...prev,
              swPortalInviteEnabled,
              swPortalAssignedName: swPortalAssignment.assignedSwName || swPortalAssignment.assignedSwEmail,
              swPortalAssignedEmail: swPortalAssignment.assignedSwEmail,
              swPortalKaiserStatus: swPortalAssignment.kaiserStatus,
              swPortalMemberId: memberId || null,
            } as any)
          : prev
      );

      toast({
        title: swPortalInviteEnabled ? 'Social worker invited' : 'Social worker invite updated',
        description: swPortalInviteEnabled
          ? `${swPortalAssignment.assignedSwName || swPortalAssignment.assignedSwEmail} has been invited.`
          : 'Invite checkbox was turned off.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error saving SW portal invite:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: String(error?.message || 'Could not save social worker invite settings.'),
      });
    } finally {
      setIsSavingSwPortalInvite(false);
    }
  };

  const updateDraftKaiserStatus = async (status: string) => {
    if (!docRef || !application || !isKaiserPlan) return;
    const normalized = String(status || '').trim();
    try {
      const manualLockUntilMs = Date.now() + 5 * 60 * 1000;
      const pickedAtIso = new Date().toISOString();
      const patch: Record<string, any> = {
        kaiserStatus: normalized,
        Kaiser_Status: normalized,
        kaiserPrePushStatusPickedAt: normalized ? pickedAtIso : null,
        kaiserStatusManualLockUntilMs: normalized ? manualLockUntilMs : null,
        kaiserStatusSyncSource: normalized ? 'manual-pathway-selection' : 'manual-cleared',
        lastUpdated: serverTimestamp(),
      };
      if (isNotInterestedKaiserStatus(normalized)) {
        patch.kaiserNotInterestedAt = pickedAtIso;
        patch.kaiserNotInterestedByEmail = String(user?.email || '').trim() || null;
        patch.kaiserNotInterestedByName = String(user?.displayName || '').trim() || null;
      }
      if (normalized) {
        patch.memberActionLog = arrayUnion(
          buildMemberActionLogEntry({
            actionKey: MEMBER_ACTION_KEYS.kaiserStatusSelected,
            label: `Kaiser status: ${normalized}`,
            atIso: pickedAtIso,
            byName: String(user?.displayName || '').trim() || null,
            byEmail: String(user?.email || '').trim() || null,
            byUid: String(user?.uid || '').trim() || null,
            details: normalized,
          })
        );
      }
      const hasAssignedStaff = Boolean(
        String((application as any)?.assignedStaffId || '').trim() ||
          String((application as any)?.assignedStaffName || '').trim()
      );
      if (normalized && isNeedFirstContactKaiserStatus(normalized) && hasAssignedStaff) {
        Object.assign(patch, buildFirstContactAckResetFields());
      }
      await persistApplicationPatch(patch);

      if (firestore && isNotInterestedKaiserStatus(normalized)) {
        const logId = buildKaiserNotInterestedDocId({
          applicationId: String(applicationId || application?.id || '').trim(),
          clientId2: String(
            (application as any)?.clientId2 ||
              (application as any)?.client_ID2 ||
              (application as any)?.caspioClientId2 ||
              ''
          ).trim(),
          memberMrn: String((application as any)?.memberMrn || '').trim(),
          memberFirstName: String((application as any)?.memberFirstName || '').trim(),
          memberLastName: String((application as any)?.memberLastName || '').trim(),
        });
        await setDoc(
          doc(firestore, KAISER_NOT_INTERESTED_COLLECTION, logId),
          {
            applicationId: String(applicationId || application?.id || '').trim(),
            userId: String((application as any)?.userId || appUserId || '').trim() || null,
            memberFirstName: String((application as any)?.memberFirstName || '').trim(),
            memberLastName: String((application as any)?.memberLastName || '').trim(),
            memberMrn: String((application as any)?.memberMrn || '').trim(),
            memberMediCalNum: String((application as any)?.memberMediCalNum || '').trim(),
            clientId2: String(
              (application as any)?.clientId2 ||
                (application as any)?.client_ID2 ||
                (application as any)?.caspioClientId2 ||
                ''
            ).trim(),
            healthPlan: String((application as any)?.healthPlan || '').trim(),
            pathway: String((application as any)?.pathway || '').trim(),
            county: String((application as any)?.currentCounty || (application as any)?.memberCounty || '').trim(),
            kaiserStatus: KAISER_NOT_INTERESTED_STATUS,
            loggedAtIso: pickedAtIso,
            loggedAt: serverTimestamp(),
            loggedByEmail: String(user?.email || '').trim() || null,
            loggedByName: String(user?.displayName || '').trim() || null,
            loggedByUid: String(user?.uid || '').trim() || null,
            source: 'application_page',
          },
          { merge: true }
        );
      }

      const { memberActionLog: _omitLog, lastUpdated: _omitTs, ...localPatch } = patch;
      setApplication((prev) =>
        prev
          ? ({
              ...prev,
              ...localPatch,
            } as any)
          : prev
      );
      toast({
        title: normalized ? 'Kaiser status saved' : 'Kaiser status cleared',
        description: normalized
          ? isNotInterestedKaiserStatus(normalized)
            ? `Kaiser status set to "${normalized}" and logged to Not Interested.`
            : `Kaiser status set to "${normalized}".`
          : 'Kaiser Status is unselected. Choose a status before Push to Caspio.',
        className: normalized ? 'bg-green-100 text-green-900 border-green-200' : undefined,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: String(error?.message || 'Could not save draft Kaiser status.'),
      });
    }
  };

  const checkStatusesInCaspioNow = async () => {
    if (!docRef || !application) return;
    setIsCheckingCaspioStatus(true);
    try {
      const body = await adminFetch<{
        caspio: { kaiserStatus: string; calaimStatus: string };
        kaiser: { from: string; to: string } | null;
        calaim: { from: string; to: string } | null;
        patch: Record<string, unknown>;
        checkedAtIso: string;
      }>('/api/admin/applications/caspio-status-check', {
        method: 'POST',
        user,
        json: { docPath: docRef.path },
      });
      setApplication((prev) =>
        prev ? ({ ...prev, ...body.patch, caspioStatusCheckedAt: body.checkedAtIso } as any) : prev
      );
      const changed = [
        body.kaiser ? `Kaiser: ${body.kaiser.to}` : '',
        body.calaim ? `CalAIM: ${body.calaim.to}` : '',
      ].filter(Boolean);
      toast({
        title: changed.length ? 'Updated from Caspio' : 'Already matches Caspio',
        description: changed.length
          ? changed.join(' · ')
          : `Kaiser: ${body.caspio.kaiserStatus || '—'} · CalAIM: ${body.caspio.calaimStatus || '—'}`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Caspio check failed',
        description: String(error?.message || 'Could not check Caspio.'),
      });
    } finally {
      setIsCheckingCaspioStatus(false);
    }
  };

  const savePrePushNotes = async (options?: { silent?: boolean; value?: string }) => {
    if (!docRef || !application) return;
    const normalized = String(options?.value ?? prePushNotesDraft ?? '').trim();
    const existing = String((application as any)?.preAssessmentCareNeedsNotes || '').trim();
    if (normalized === existing) {
      setPrePushNotesAutosaveState('saved');
      return;
    }
    setIsSavingPrePushNotes(true);
    setPrePushNotesAutosaveState('saving');
    try {
      await setDoc(
        docRef,
        {
          preAssessmentCareNeedsNotes: normalized,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) =>
        prev
          ? ({
              ...prev,
              preAssessmentCareNeedsNotes: normalized,
            } as any)
          : prev
      );
      setPrePushNotesSavedAtIso(new Date().toISOString());
      setPrePushNotesAutosaveState('saved');
      if (!options?.silent) {
        toast({
          title: 'Notes saved',
          description: normalized
            ? 'These notes are sent during Caspio push (mapped member notes field when available, plus client notes log).'
            : 'Notes cleared.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      }
    } catch (error: any) {
      setPrePushNotesAutosaveState('error');
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: String(error?.message || 'Could not save notes.'),
      });
    } finally {
      setIsSavingPrePushNotes(false);
    }
  };

  const updateKaiserAuthorizationMode = async (mode: 'authorization_received' | 'authorization_needed') => {
    if (!docRef || !application) return;
    setIsUpdatingKaiserAuthorizationMode(true);
    try {
      const isAuthorized = mode === 'authorization_received';
      const currentCaspioCalAIMStatus = String((application as any)?.caspioCalAIMStatus || '').trim();
      const normalizedCurrentCaspio = currentCaspioCalAIMStatus.toLowerCase();
      const updateData = {
        healthPlan: 'Kaiser',
        kaiserAuthorizationMode: mode,
        kaiserAuthReceivedViaIls: isAuthorized,
        ...(isAuthorized
          ? { caspioCalAIMStatus: 'Authorized' }
          : { caspioCalAIMStatus: normalizedCurrentCaspio === 'authorized' || normalizedCurrentCaspio === 'pending' ? currentCaspioCalAIMStatus : 'Pending' }),
        lastUpdated: serverTimestamp(),
      };
      await setDoc(docRef, updateData, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...updateData } as any) : prev));
      toast({
        title: 'Kaiser authorization mode updated',
        description: isAuthorized
          ? 'Set to Authorized member; Kaiser referral form is not required.'
          : 'Set to Authorization needed; Kaiser referral form is required.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error) {
      console.error('Error updating Kaiser authorization mode:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update Kaiser authorization mode.',
      });
    } finally {
      setIsUpdatingKaiserAuthorizationMode(false);
    }
  };

  const confirmCaspioPushAndRetrieveClientId2 = async () => {
    if (!docRef || !application) return;
    const normalizeKaiserStatus = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[-_]+/g, ' ')
        .trim();
    const isKaiserCompletionStatus = (value: unknown) => {
      const normalized = normalizeKaiserStatus(value);
      return normalized === 'final at rfe' || normalized === 'r&b sent pending ils contract';
    };
    setIsConfirmingCaspioPush(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000);
      const existingClientId2 = String(
        (application as any)?.client_ID2 ||
        (application as any)?.clientId2 ||
        (application as any)?.caspioClientId2 ||
        ''
      ).trim();
      const alreadyMarkedPushed = Boolean((application as any)?.caspioSent);
      const res = await fetch('/api/admin/caspio/confirm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          applicationData: {
            memberFirstName: (application as any)?.memberFirstName || '',
            memberLastName: (application as any)?.memberLastName || '',
            clientId2: existingClientId2,
            caspioClientId2: existingClientId2,
            healthPlan: (application as any)?.healthPlan || '',
            memberMediCalNum:
              (application as any)?.memberMediCalNum ||
              (application as any)?.confirmMemberMediCalNum ||
              (application as any)?.MediCal_Number ||
              (application as any)?.Medical_Number ||
              '',
            memberMrn:
              (application as any)?.memberMrn ||
              (application as any)?.medicalRecordNumber ||
              (application as any)?.mrn ||
              (application as any)?.Member_MRN ||
              '',
          },
        }),
      });
      if (timeoutId) clearTimeout(timeoutId);
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Confirm failed (HTTP ${res.status})`);
      }
      const retrievedClientId2 = String(data?.member?.clientId2 || '').trim();
      const retrievedKaiserStatus = String(data?.member?.kaiserStatus || '').trim();
      if (!data?.found) {
        if (existingClientId2 && alreadyMarkedPushed) {
          const patch = {
            clientId2: existingClientId2,
            client_ID2: existingClientId2,
            caspioClientId2: existingClientId2,
            caspioSent: true,
            caspioPushLastStatus: 'confirmed',
            createdByAdmin: false,
            allowDraftCaspioPush: false,
            ...(String((application as any)?.status || '').trim().toLowerCase() === 'draft'
              ? { status: 'In Progress' }
              : {}),
            lastUpdated: serverTimestamp(),
          } as Record<string, any>;
          await setDoc(docRef, patch, { merge: true });
          setApplication((prev) =>
            prev
              ? ({
                  ...prev,
                  ...patch,
                } as any)
              : prev
          );
          toast({
            title: 'Client_ID2 already linked',
            description: `Using existing Client_ID2: ${existingClientId2}.`,
            className: 'bg-green-100 text-green-900 border-green-200',
            duration: 1500,
          });
          return;
        }
        toast({
          variant: 'destructive',
          title: 'Not found in Caspio',
          description: String(data?.message || 'No matching pushed Caspio record was found for this application yet.'),
        });
        return;
      }

      if (!retrievedClientId2) {
        if (retrievedKaiserStatus) {
          const manualLockUntilMs = Date.now() + 5 * 60 * 1000;
          const statusOnlyPatch = {
            kaiserStatus: retrievedKaiserStatus,
            Kaiser_Status: retrievedKaiserStatus,
            kaiserStatusManualLockUntilMs: manualLockUntilMs,
            kaiserStatusSyncSource: 'manual-confirm-refresh',
            lastUpdated: serverTimestamp(),
          } as Record<string, any>;
          await setDoc(docRef, statusOnlyPatch, { merge: true });
          setApplication((prev) =>
            prev
              ? ({
                  ...prev,
                  ...statusOnlyPatch,
                } as any)
              : prev
          );
          toast({
            title: 'Kaiser Status synced',
            description:
              `Matched Caspio member and updated Kaiser Status: ${retrievedKaiserStatus}. ` +
              'Client_ID2 is still missing in Caspio. Open Caspio → CS Summary precheck to review importable fields before sync.',
            className: 'bg-amber-100 text-amber-900 border-amber-200',
          });
          setIsReversePullPreviewOpen(true);
          void openReversePullPreview({
            ...(application as any),
            ...statusOnlyPatch,
          });
          return;
        }

        toast({
          variant: 'destructive',
          title: 'Client_ID2 missing in Caspio',
          description:
            String(data?.message || 'Matched Caspio member record has no client_ID2 yet. Please verify the Caspio member row.'),
        });
        return;
      }

      const shouldMarkComplete = isKaiserCompletionStatus(retrievedKaiserStatus);
      const manualLockUntilMs = Date.now() + 5 * 60 * 1000;
      const patch = {
        clientId2: retrievedClientId2,
        client_ID2: retrievedClientId2,
        caspioClientId2: retrievedClientId2,
        ...(retrievedKaiserStatus ? { kaiserStatus: retrievedKaiserStatus, Kaiser_Status: retrievedKaiserStatus } : {}),
        kaiserStatusManualLockUntilMs: manualLockUntilMs,
        kaiserStatusSyncSource: 'manual-confirm-refresh',
        ...(shouldMarkComplete ? { status: 'Completed & Submitted' } : {}),
        caspioSent: true,
        caspioPushLastStatus: 'confirmed',
        createdByAdmin: false,
        allowDraftCaspioPush: false,
        ...(String((application as any)?.status || '').trim().toLowerCase() === 'draft'
          ? { status: 'In Progress' }
          : {}),
        lastUpdated: serverTimestamp(),
      } as Record<string, any>;
      await setDoc(docRef, patch, { merge: true });
      setApplication((prev) =>
        prev
          ? ({
              ...prev,
              ...patch,
            } as any)
          : prev
      );
      toast({
        title: 'Caspio record confirmed',
        description: retrievedKaiserStatus
          ? `Retrieved Client_ID2: ${retrievedClientId2}. Kaiser Status synced: ${retrievedKaiserStatus}${
              shouldMarkComplete ? ' (marked complete)' : ''
            }. Review the Caspio → CS Summary precheck before importing fields.`
          : `Found pushed Caspio record and retrieved Client_ID2: ${retrievedClientId2}. Review the Caspio → CS Summary precheck before importing fields.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setIsReversePullPreviewOpen(true);
      void openReversePullPreview({
        ...(application as any),
        ...patch,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        toast({
          variant: 'destructive',
          title: 'Confirm timed out',
          description: 'Caspio confirmation took too long. Please retry Confirm & Push, or use Pull Client_ID2 only if the member already exists.',
        });
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Confirm failed',
        description: String(error?.message || 'Could not confirm pushed Caspio record.'),
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setIsConfirmingCaspioPush(false);
    }
  };

  const handleUpdateKaiserStatusFromCaspio = async () => {
    await confirmCaspioPushAndRetrieveClientId2();
  };

  const retrieveClientId2Only = async () => {
    if (!docRef || !application) return;
    setIsRetrievingClientId2Only(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 15000);
      const existingClientId2 = String(
        (application as any)?.client_ID2 ||
          (application as any)?.clientId2 ||
          (application as any)?.caspioClientId2 ||
          ''
      ).trim();
      const res = await fetch('/api/admin/caspio/confirm-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          clientId2Only: true,
          applicationData: {
            memberFirstName: (application as any)?.memberFirstName || '',
            memberLastName: (application as any)?.memberLastName || '',
            clientId2: existingClientId2,
            caspioClientId2: existingClientId2,
            healthPlan: (application as any)?.healthPlan || '',
            memberMediCalNum:
              (application as any)?.memberMediCalNum ||
              (application as any)?.confirmMemberMediCalNum ||
              (application as any)?.MediCal_Number ||
              (application as any)?.Medical_Number ||
              '',
            memberMrn:
              (application as any)?.memberMrn ||
              (application as any)?.medicalRecordNumber ||
              (application as any)?.mrn ||
              (application as any)?.Member_MRN ||
              '',
          },
        }),
      });
      if (timeoutId) clearTimeout(timeoutId);
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Lookup failed (HTTP ${res.status})`);
      }
      if (!data?.found) {
        toast({
          variant: 'destructive',
          title: 'Not found in Caspio',
          description: String(
            data?.message || 'No matching Caspio member was found for this application yet.'
          ),
        });
        return;
      }
      const retrievedClientId2 = String(data?.member?.clientId2 || '').trim();
      if (!retrievedClientId2) {
        toast({
          variant: 'destructive',
          title: 'Client_ID2 missing in Caspio',
          description:
            'Matched a Caspio member, but that row has no Client_ID2 yet. Check the Caspio member record.',
        });
        return;
      }
      if (existingClientId2 && existingClientId2 === retrievedClientId2) {
        toast({
          title: 'Client_ID2 already set',
          description: `This application already has Client_ID2 ${retrievedClientId2}.`,
          className: 'bg-green-100 text-green-900 border-green-200',
          duration: 1500,
        });
        return;
      }
      const patch = {
        clientId2: retrievedClientId2,
        client_ID2: retrievedClientId2,
        caspioClientId2: retrievedClientId2,
        caspioSent: true,
        caspioPushLastStatus: 'client-id2-only',
        lastUpdated: serverTimestamp(),
      } as Record<string, any>;
      await setDoc(docRef, patch, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...patch } as any) : prev));
      toast({
        title: 'Client_ID2 retrieved',
        description: `Saved Client_ID2 ${retrievedClientId2} on this application. No CS Summary fields were changed.`,
        className: 'bg-green-100 text-green-900 border-green-200',
        duration: 2500,
      });
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const aborted = String(error?.name || '').toLowerCase() === 'aborterror';
      toast({
        variant: 'destructive',
        title: 'Client_ID2 lookup failed',
        description: aborted
          ? 'Caspio lookup timed out. Try again.'
          : String(error?.message || 'Could not retrieve Client_ID2.'),
      });
    } finally {
      setIsRetrievingClientId2Only(false);
    }
  };

  const openReversePullPreview = async (applicationOverride?: Record<string, any>) => {
    const targetApplication = applicationOverride || application;
    if (!targetApplication) return;
    setIsLoadingReversePullPreview(true);
    setReversePullPreview(null);
    try {
      const response = await fetch('/api/admin/caspio/pull-cs-summary-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationData: targetApplication,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as any;
      if (!response.ok || !data?.success) {
        throw new Error(String(data?.error || data?.message || `Preview failed (HTTP ${response.status})`));
      }
      setReversePullPreview({
        mappingSource: String(data?.mappingSource || ''),
        summary: {
          totalMapped: Number(data?.summary?.totalMapped || 0),
          missing: Number(data?.summary?.missing || 0),
          fillEmpty: Number(data?.summary?.fillEmpty || 0),
          overwrite: Number(data?.summary?.overwrite || 0),
          unchanged: Number(data?.summary?.unchanged || 0),
        },
        preview: {
          items: Array.isArray(data?.preview?.items) ? data.preview.items : [],
          safePatch: (data?.preview?.safePatch && typeof data.preview.safePatch === 'object'
            ? data.preview.safePatch
            : {}) as Record<string, string>,
          fullPatch: (data?.preview?.fullPatch && typeof data.preview.fullPatch === 'object'
            ? data.preview.fullPatch
            : {}) as Record<string, string>,
        },
      });
      setReversePullIncludeOverwrites(false);
      setReversePullShowOnlyMissing(false);
      setReversePullShowWillUpdateOnly(true);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Preview failed',
        description: String(error?.message || 'Could not prepare reverse pull preview.'),
      });
    } finally {
      setIsLoadingReversePullPreview(false);
    }
  };

  const applyReversePullPreview = async (mode?: 'safe' | 'overwrite') => {
    if (!docRef || !reversePullPreview) return;
    const shouldIncludeOverwrite = mode ? mode === 'overwrite' : reversePullIncludeOverwrites;
    const selectedPatch = shouldIncludeOverwrite
      ? reversePullPreview.preview.fullPatch
      : reversePullPreview.preview.safePatch;
    const patchEntries = Object.entries(selectedPatch).filter(([key, value]) => String(key || '').trim() && String(value || '').trim());
    if (!patchEntries.length) {
      toast({
        title: 'Nothing to apply',
        description: shouldIncludeOverwrite
          ? 'No mapped Caspio values are available to apply right now.'
          : 'No empty CS Summary fields were found to fill from Caspio.',
      });
      return;
    }
    const patch = Object.fromEntries(patchEntries) as Record<string, string>;
    setIsApplyingReversePullPreview(true);
    try {
      await setDoc(
        docRef,
        {
          ...patch,
          csSummaryReversePullAppliedAt: serverTimestamp(),
          csSummaryReversePullMode: shouldIncludeOverwrite ? 'overwrite_enabled' : 'fill_empty_only',
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as any) : prev));
      toast({
        title: 'CS Summary prefill applied',
        description: `Applied ${patchEntries.length} field${patchEntries.length === 1 ? '' : 's'} from Caspio.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setIsReversePullPreviewOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Apply failed',
        description: String(error?.message || 'Could not apply reverse pull values.'),
      });
    } finally {
      setIsApplyingReversePullPreview(false);
    }
  };

  const applyReversePullWithOverwrite = async () => {
    await applyReversePullPreview('overwrite');
  };

  const updateKaiserTierLevel = async (tierLevel: string) => {
    if (!docRef || !application || !user || !isKaiserPlan) return;
    const clientId2 = String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim();
    if (!clientId2) {
      toast({
        variant: 'destructive',
        title: 'Missing Client ID',
        description: 'Cannot update Kaiser tier level because client_ID2 is missing.',
      });
      return;
    }

    setIsUpdatingKaiserTierLevel(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/kaiser-ils-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          clientId2,
          memberName: `${application.memberFirstName || ''} ${application.memberLastName || ''}`.trim(),
          tierLevel: tierLevel || '',
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to update tier level (HTTP ${response.status})`);
      }

      const localUpdate = { Kaiser_Tier_Level: tierLevel || '' } as any;
      await setDoc(docRef, localUpdate, { merge: true });
      setApplication((prev) => (prev ? ({ ...prev, ...localUpdate } as any) : prev));

      toast({
        title: 'Kaiser tier level updated',
        description: tierLevel ? `Set to Tier ${tierLevel}.` : 'Tier level cleared.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error updating Kaiser tier level:', error);
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error?.message || 'Could not update Kaiser tier level.',
      });
    } finally {
      setIsUpdatingKaiserTierLevel(false);
    }
  };

  const generateRoomBoardAgreementPreview = async () => {
    if (!user || !applicationId || !application) return;
    setIsGeneratingRoomBoardPreview(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to generate preview (HTTP ${response.status})`);
      }
      const preview = (data?.preview || {}) as any;
      const warnings = Array.isArray(data?.warnings) ? data.warnings.map((w: any) => String(w || '').trim()).filter(Boolean) : [];
      setRoomBoardPreview(preview);
      setRoomBoardPreviewWarnings(warnings);
      toast({
        title: 'Preview generated',
        description: warnings.length > 0 ? `Preview loaded with ${warnings.length} warning(s).` : 'Preview is ready for review.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error generating room board agreement preview:', error);
      toast({
        variant: 'destructive',
        title: 'Preview failed',
        description: error?.message || 'Could not generate agreement preview.',
      });
    } finally {
      setIsGeneratingRoomBoardPreview(false);
    }
  };

  const sendRoomBoardAgreementInvites = async () => {
    if (!user || !applicationId || !application) return;
    if (!roomBoardPreview) {
      toast({
        variant: 'destructive',
        title: 'Preview required',
        description: 'Generate and review the agreement preview before sending invites.',
      });
      return;
    }
    const rcfeEmail = String(rcfeSignerEmailInput || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rcfeEmail)) {
      toast({
        variant: 'destructive',
        title: 'RCFE email required',
        description: 'Enter a valid RCFE signer email before sending invites.',
      });
      return;
    }
    const agreedAmount = String(agreedRoomBoardAmountInput || '').trim();
    if (!agreedAmount) {
      toast({
        variant: 'destructive',
        title: 'Agreed amount required',
        description: 'Enter the agreed room and board amount before sending invites.',
      });
      return;
    }
    if (!authorizedRepInviteEmail) {
      toast({
        variant: 'destructive',
        title: 'Authorized rep email missing',
        description: 'No authorized representative email was found on this application.',
      });
      return;
    }

    setIsSendingRoomBoardInvites(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
          rcfeSignerEmail: rcfeEmail,
          agreedRoomBoardAmount: agreedAmount,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send invites (HTTP ${response.status})`);
      }

      setApplication((prev) =>
        prev
          ? ({
              ...(prev as any),
              roomBoardTierAgreement: {
                requestId: data.requestId,
                status: data.status || 'invited',
                memberRepEmail: data.memberRepEmail || authorizedRepInviteEmail,
                rcfeSignerEmail: data.rcfeSignerEmail || rcfeEmail,
                rcfeName: data.rcfeName || null,
                mcoAndTier: data.mcoAndTier || null,
                tierLevel: data.tierLevel || null,
                assistedLivingDailyRate: data.assistedLivingDailyRate || null,
                assistedLivingMonthlyRate: data.assistedLivingMonthlyRate || null,
                agreedRoomBoardAmount: data.agreedRoomBoardAmount || null,
                invitedAt: new Date().toISOString(),
              },
            } as any)
          : prev
      );

      toast({
        title: 'Invites sent',
        description: `Agreement invites sent to ${data.memberRepEmail || authorizedRepInviteEmail} and ${data.rcfeSignerEmail || rcfeEmail}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      console.error('Error sending room board agreement invites:', error);
      toast({
        variant: 'destructive',
        title: 'Invite failed',
        description: error?.message || 'Could not generate and send agreement invites.',
      });
    } finally {
      setIsSendingRoomBoardInvites(false);
    }
  };

  const sendRoomBoardAgreementToIls = async () => {
    if (!user || !applicationId || !application) return;
    setIsSendingRoomBoardIls(true);
    try {
      await ensureAdminClaim();
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/room-board-agreement/notify-ils', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,
          userId: appUserId || null,
        }),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to send to ILS (HTTP ${response.status})`);
      }
      const result = data?.result || {};
      const status = String(result?.status || '');
      if (status === 'sent') {
        setApplication((prev) =>
          prev
            ? ({
                ...(prev as any),
                roomBoardTierAgreement: {
                  ...((prev as any)?.roomBoardTierAgreement || {}),
                  ilsDispatch: {
                    ...(((prev as any)?.roomBoardTierAgreement || {}).ilsDispatch || {}),
                    sentAt: new Date().toISOString(),
                    recipient: 'jocelyn@ilshealth.com',
                  },
                },
              } as any)
            : prev
        );
        toast({
          title: 'Sent to ILS',
          description: 'Signed agreement and proof of income were emailed to jocelyn@ilshealth.com.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else if (status === 'already_sent') {
        toast({
          title: 'Already sent',
          description: 'These documents were already sent to ILS for this application.',
        });
      } else if (status === 'not_ready') {
        toast({
          variant: 'destructive',
          title: 'Not ready to send',
          description: String(result?.reason || 'Agreement and proof of income must be ready first.'),
        });
      } else {
        toast({
          title: 'No action taken',
          description: 'No ILS send action was performed.',
        });
      }
    } catch (error: any) {
      console.error('Error sending room board agreement to ILS:', error);
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: error?.message || 'Could not send documents to ILS.',
      });
    } finally {
      setIsSendingRoomBoardIls(false);
    }
  };

  const updateTrackingReason = async (reason: string) => {
    if (!docRef || !application) return;

    setIsUpdatingTracking(true);
    try {
      const updateData = { calaimTrackingReason: reason };
      await setDoc(docRef, updateData, { merge: true });
      setApplication(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error('Error updating tracking reason:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update eligibility reason. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const updateNotEligibleFlags = async (updates: {
    calaimNotEligibleSwitchingProviders?: boolean;
    calaimNotEligibleHasSoc?: boolean;
    calaimNotEligibleOutOfCounty?: boolean;
    calaimNotEligibleOther?: boolean;
    calaimNotEligibleReason?: string;
    calaimNotEligibleOtherReason?: string;
  }) => {
    if (!docRef || !application) return;
    setIsUpdatingTracking(true);
    try {
      const updateData = { ...updates };
      await setDoc(docRef, updateData, { merge: true });
      setApplication(prev => prev ? { ...prev, ...updateData } : null);
    } catch (error) {
      console.error('Error updating not-eligible flags:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: 'Could not update eligibility flags. Please try again.',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const getReferrerDisplayName = () => {
    const fromFullName = String((application as any)?.referrerName || '').trim();
    if (fromFullName) return fromFullName;
    const combined = `${String((application as any)?.referrerFirstName || '').trim()} ${String(
      (application as any)?.referrerLastName || ''
    ).trim()}`.trim();
    return combined || 'there';
  };

  const getManagerSignatureMeta = () => {
    const normalizedPlan = String((application as any)?.healthPlan || '').trim().toLowerCase();
    const isKaiser = normalizedPlan.includes('kaiser');
    const isHealthNet = normalizedPlan.includes('health net') || normalizedPlan.includes('healthnet');
    const managerName =
      isHealthNet
        ? HEALTH_NET_MANAGER_SIGNATURE
        : String((application as any)?.assignedStaffName || '').trim() ||
          String((application as any)?.assignedToName || '').trim() ||
          String(user?.displayName || user?.email || 'The Connections Team').trim();
    const managerEmail =
      isHealthNet
        ? HEALTH_NET_MANAGER_EMAIL
        : String((application as any)?.assignedStaffEmail || '').trim() ||
          String(user?.email || '').trim() ||
          DEFAULT_COORDINATOR_EMAIL;
    const managerTitle = isKaiser ? 'Kaiser Care Coordinator' : 'Health Net Care Coordinator';
    return { managerName, managerEmail, managerTitle, isHealthNet };
  };

  const applyEligibilityTemplate = async (templateKey: string) => {
    if (!application || !docRef) return;
    let nextMessage = '';
    const recipientName = getReferrerDisplayName();
    const normalizedPlan = String((application as any)?.healthPlan || '').trim().toLowerCase();
    const planLabel = normalizedPlan.includes('kaiser')
      ? 'Kaiser'
      : normalizedPlan.includes('health net') || normalizedPlan.includes('healthnet')
        ? 'Health Net'
        : String((application as any)?.healthPlan || 'the selected health plan').trim();
    const signatureMeta = getManagerSignatureMeta();
    const templateSignature = signatureMeta.managerName;
    if (templateKey === 'health-net-molina-switch') {
      nextMessage = [
        `Hi ${recipientName}:`,
        '',
        "Unfortunately, this member's Medi-Cal through Health Net is currently assigned to Molina.",
        'We do not work with Molina and, should you choose to work with us, you should call Health Net Member Services at 800-675-6110 and request the Medi-Cal be switched from Molina to Health Net.',
        'Any requested changes take effect at the end of the month.',
        `Please see our Program Information guide (${PROGRAM_INFO_GUIDE_URL}) for more information.`,
        '',
        'Sincerely,',
        templateSignature,
        signatureMeta.managerTitle,
        signatureMeta.managerEmail,
        `Website: ${CONNECT_CALAIM_WEBSITE}`,
      ].join('\n');
    } else if (templateKey === 'no-medi-cal-assigned-plan') {
      nextMessage = [
        `Hi ${recipientName}:`,
        '',
        `Unfortunately, this member does not currently have Medi-Cal assigned with ${planLabel}.`,
        '',
        'Sincerely,',
        templateSignature,
        signatureMeta.managerTitle,
        signatureMeta.managerEmail,
        `Website: ${CONNECT_CALAIM_WEBSITE}`,
      ].join('\n');
    }
    if (!nextMessage) return;

    setApplication((prev) => (prev ? ({ ...(prev as any), calaimTrackingReason: nextMessage } as any) : prev));
    await updateTrackingReason(nextMessage);
  };

  const markCommunicationNoteResponded = async (noteId: string) => {
    if (!noteId) return;
    const current = getCommunicationNoteLog();
    const nowIso = new Date().toISOString();
    const next = current.map((entry) =>
      entry.id === noteId
        ? {
            ...entry,
            requiresResponse: false,
            respondedAtIso: nowIso,
            metadata: {
              ...(entry.metadata || {}),
              respondedByUid: String(user?.uid || '').trim() || null,
              respondedByName: String(user?.displayName || user?.email || 'Staff').trim(),
            },
          }
        : entry
    );
    await saveCommunicationNoteLog(next);
    toast({
      title: 'Marked responded',
      description: 'This note was marked as responded.',
    });
  };

  const sendEligibilityNote = async () => {
    if (!application?.referrerEmail) {
      toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
      return;
    }
    const note = String((application as any)?.calaimTrackingReason || '').trim();
    const isNotEligible = String((application as any)?.calaimTrackingStatus || '').trim() === 'Not CalAIM Eligible';
    const notEligibleReason = String((application as any)?.calaimNotEligibleReason || '').trim();
    if (!note) {
      toast({ variant: 'destructive', title: 'Missing Note', description: 'Add a note before sending.' });
      return;
    }
    if (isNotEligible && !notEligibleReason) {
      toast({ variant: 'destructive', title: 'Missing Reason', description: 'Select a not-eligible reason before sending.' });
      return;
    }
    const selectedScreenshotIdSet = new Set(selectedEligibilityScreenshotIds);
    const screenshotLinks = getEligibilityScreenshotUploads()
      .filter((upload) => selectedScreenshotIdSet.has(upload.id))
      .map((upload) => String(upload.downloadURL || '').trim())
      .filter(Boolean);
    const noteFingerprint = JSON.stringify({
      note,
      notEligibleReason: isNotEligible ? notEligibleReason : '',
      screenshotLinks: [...screenshotLinks].sort(),
    });
    const latestSuccessFingerprint = String(
      latestEligibilitySuccessNote?.metadata && typeof latestEligibilitySuccessNote.metadata === 'object'
        ? (latestEligibilitySuccessNote.metadata as any).fingerprint || ''
        : ''
    ).trim();
    if (latestSuccessFingerprint && latestSuccessFingerprint === noteFingerprint) {
      const blockedAtIso = new Date().toISOString();
      setEligibilityNoteSendStatus({
        state: 'blocked_duplicate',
        message: 'This exact note was already sent. Update the note before sending again.',
        atIso: blockedAtIso,
      });
      await appendCommunicationNoteLog({
        category: 'user_staff',
        channel: 'eligibility_note',
        direction: 'staff_to_user',
        status: 'blocked_duplicate',
        subject: `${isNotEligible ? 'CalAIM Ineligibility Notice' : 'CalAIM Eligibility Update'} for ${application.memberFirstName} ${application.memberLastName}`,
        messagePreview: note.slice(0, 300),
        fullMessage: note,
        recipientName:
          String(application.referrerName || '').trim() ||
          `${String(application.referrerFirstName || '').trim()} ${String(application.referrerLastName || '').trim()}`.trim() ||
          'there',
        recipientEmail: String(application.referrerEmail || '').trim() || undefined,
        requiresResponse: false,
        respondedAtIso: null,
        metadata: {
          fingerprint: noteFingerprint,
          duplicateOfId: latestEligibilitySuccessNote?.id || null,
          screenshotCount: screenshotLinks.length,
        },
      });
      toast({
        variant: 'destructive',
        title: 'Duplicate note blocked',
        description: 'This note already exists in the note log and was not sent again.',
      });
      return;
    }
    const screenshotSection =
      screenshotLinks.length > 0
        ? `\n\nEligibility screenshot link(s):\n${screenshotLinks.map((url) => `- ${url}`).join('\n')}`
        : '';
    const reasonSection = isNotEligible && notEligibleReason ? `Reason: ${notEligibleReason}\n\n` : '';
    const composedMessage = `${reasonSection}${note}${screenshotSection}`.trim();
    setIsSendingEligibilityNote(true);
    setEligibilityNoteSendStatus({
      state: 'sending',
      message: 'Sending note...',
      atIso: new Date().toISOString(),
    });
    try {
      const signatureMeta = getManagerSignatureMeta();
      const subjectLine = `${isNotEligible ? 'CalAIM Ineligibility Notice' : 'CalAIM Eligibility Update'} for ${application.memberFirstName} ${application.memberLastName}`;
      const recipientName =
        String(application.referrerName || '').trim() ||
        `${String(application.referrerFirstName || '').trim()} ${String(application.referrerLastName || '').trim()}`.trim() ||
        'there';
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: application.referrerEmail,
          includeBcc: false,
          subject: subjectLine,
          memberName: recipientName,
          staffName: signatureMeta.managerName,
          staffTitle: signatureMeta.managerTitle,
          staffEmail: signatureMeta.managerEmail,
          message: composedMessage,
          status: (application.status || 'In Progress') as any,
          healthPlan: String(application.healthPlan || ''),
        })
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to send note');
      }
      await appendCommunicationNoteLog({
        category: 'user_staff',
        channel: 'eligibility_note',
        direction: 'staff_to_user',
        status: 'success',
        subject: subjectLine,
        messagePreview: composedMessage.slice(0, 300),
        fullMessage: composedMessage,
        recipientName,
        recipientEmail: String(application.referrerEmail || '').trim() || undefined,
        requiresResponse: false,
        respondedAtIso: null,
        metadata: {
          screenshotCount: screenshotLinks.length,
          fingerprint: noteFingerprint,
        },
      });
      if (isNotEligible && docRef) {
        const historyEntry = {
          status: 'On Hold',
          reason: `Auto hold after ineligibility notice. ${note}`.trim(),
          updatedBy: user?.displayName || user?.email || 'Admin',
          updatedByUid: user?.uid || null,
          updatedAtIso: new Date().toISOString(),
        };
        const holdPatch = {
          adminProcessingStatus: 'On Hold',
          adminProcessingReason: `Ineligible: ${notEligibleReason || 'No reason selected'}${note ? ` - ${note}` : ''}`.trim(),
          adminProcessingUpdatedAt: serverTimestamp(),
          adminProcessingUpdatedBy: user?.displayName || user?.email || 'Admin',
          adminProcessingUpdatedByUid: user?.uid || null,
          adminProcessingHistory: arrayUnion(historyEntry),
          lastUpdated: serverTimestamp(),
        } as Record<string, any>;
        await setDoc(docRef, holdPatch, { merge: true });
        setApplication((prev) =>
          prev
            ? ({
                ...(prev as any),
                adminProcessingStatus: 'On Hold',
                adminProcessingReason: `Ineligible: ${notEligibleReason || 'No reason selected'}${note ? ` - ${note}` : ''}`.trim(),
                adminProcessingUpdatedBy: user?.displayName || user?.email || 'Admin',
                adminProcessingUpdatedByUid: user?.uid || null,
              } as any)
            : prev
        );
      }
      toast({
        title: 'Note Sent',
        description: isNotEligible
          ? 'Ineligibility notice sent. Application has been moved to On Hold.'
          : 'Your eligibility note was sent to the referrer.',
        className: 'bg-green-100 text-green-900 border-green-200'
      });
      setEligibilityNoteSendStatus({
        state: 'success',
        message: 'Sent successfully. The note log has been updated.',
        atIso: new Date().toISOString(),
      });
    } catch (error: any) {
      const failAtIso = new Date().toISOString();
      await appendCommunicationNoteLog({
        category: 'user_staff',
        channel: 'eligibility_note',
        direction: 'staff_to_user',
        status: 'failed',
        subject: `${isNotEligible ? 'CalAIM Ineligibility Notice' : 'CalAIM Eligibility Update'} for ${application.memberFirstName} ${application.memberLastName}`,
        messagePreview: composedMessage.slice(0, 300),
        fullMessage: composedMessage,
        recipientName:
          String(application.referrerName || '').trim() ||
          `${String(application.referrerFirstName || '').trim()} ${String(application.referrerLastName || '').trim()}`.trim() ||
          'there',
        recipientEmail: String(application.referrerEmail || '').trim() || undefined,
        requiresResponse: false,
        respondedAtIso: null,
        metadata: {
          screenshotCount: screenshotLinks.length,
          errorMessage: String(error?.message || 'Unknown send error'),
          fingerprint: noteFingerprint,
        },
      });
      setEligibilityNoteSendStatus({
        state: 'failed',
        message: String(error?.message || 'Could not send the eligibility note.'),
        atIso: failAtIso,
      });
      toast({
        variant: 'destructive',
        title: 'Send Failed',
        description: error.message || 'Could not send the eligibility note.'
      });
    } finally {
      setIsSendingEligibilityNote(false);
    }
  };

  const saveProofIncomeDocumentDate = async (documentDate: string) => {
    if (!docRef) return;
    try {
      await setDoc(
        docRef,
        { proofIncomeDocumentDate: documentDate, lastUpdated: serverTimestamp() },
        { merge: true }
      );
      setApplication((prev) => (prev ? ({ ...(prev as any), proofIncomeDocumentDate: documentDate } as any) : prev));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save document date',
        description: error?.message || 'Please retry.',
      });
    }
  };

  const setProofIncomeAutoReminders = async (enabled: boolean) => {
    if (!docRef) return;
    try {
      await setDoc(
        docRef,
        { proofIncomeAutoRemindersEnabled: enabled, lastUpdated: serverTimestamp() },
        { merge: true }
      );
      setApplication((prev) =>
        prev ? ({ ...(prev as any), proofIncomeAutoRemindersEnabled: enabled } as any) : prev
      );
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update proof of income reminders',
        description: error?.message || 'Please retry.',
      });
    }
  };

  const updateProofIncomeDetails = async (patch: { proofIncomeActualAmount?: string; proofIncomeSocFlag?: boolean; monthlyIncome?: string }) => {
    if (!docRef || !application) return;
    try {
      await setDoc(
        docRef,
        {
          ...patch,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as any) : prev));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not save proof of income',
        description: error?.message || 'Please retry.',
      });
    }
  };

  const sendProofIncomeSocWarning = async () => {
    if (!application) return;
    const to = socWarningRecipientEmail;
    if (!to) {
      toast({
        variant: 'destructive',
        title: 'Family email not available',
        description: 'Please add referrer/family email before sending SOC warning.',
      });
      return;
    }
    setIsSendingProofIncomeSocWarning(true);
    try {
      const signatureMeta = getManagerSignatureMeta();
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          includeBcc: false,
          subject: socWarningSubject,
          memberName: String(application.referrerName || 'there'),
          staffName: signatureMeta.managerName,
          staffTitle: signatureMeta.managerTitle,
          staffEmail: signatureMeta.managerEmail,
          status: String(application.status || 'In Progress'),
          message: socWarningMessage,
          healthPlan: String(application.healthPlan || ''),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to send SOC warning email.');
      }
      setIsSocWarningPreviewOpen(false);
      await setDoc(
        docRef!,
        {
          proofIncomeSocWarningSentAt: serverTimestamp(),
          proofIncomeSocWarningSentBy: String(user?.displayName || user?.email || 'Staff'),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      toast({
        title: 'SOC warning sent',
        description: `Warning email sent to ${to}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not send warning',
        description: error?.message || 'Failed to send SOC warning email.',
      });
    } finally {
      setIsSendingProofIncomeSocWarning(false);
    }
  };

  // Handle staff assignment - TEMPORARILY DISABLED
  const handleStaffAssignment = async () => {
    console.log('🚫 Staff assignment is temporarily disabled to prevent looping');
    return; // Early return to disable functionality
    
    if (!docRef || !application) return;
    
    setIsUpdatingProgression(true);
    try {
      const response = await fetch('/api/staff-assignment', {
        method: 'POST',
        headers: {
          ...(await firebaseAuthHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          applicationId: application?.id,
          memberFirstName: application?.memberFirstName,
          memberLastName: application?.memberLastName,
          memberEmail: application?.memberEmail || '',
          healthPlan: application?.healthPlan,
          pathway: application?.pathway
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        const updateData = {
          assignedStaffId: data.assignedStaffId,
          assignedStaffName: data.assignedStaffName,
          assignedStaffEmail: data.assignedStaffEmail,
          assignedDate: new Date().toISOString()
        };
        
        await setDoc(docRef, updateData, { merge: true });
        
        // Update local state
        setApplication(prev => prev ? { ...prev, ...updateData } : null);
        
        toast({
          title: "Staff Assigned",
          description: `Application assigned to ${data.assignedStaffName} (${data.assignedStaffEmail})`,
          className: "bg-green-100 text-green-900 border-green-200",
        });

        // Show success notification with assignment details
        if (data.notificationSent) {
          setTimeout(() => {
            toast({
              title: "🔔 Notification Sent",
              description: `${data.assignedStaff.name} has been notified of the new assignment via email and system notifications.`,
              className: "bg-blue-100 text-blue-900 border-blue-200",
            });
          }, 1500);
        }
        
      } else {
        throw new Error(data.error || 'Failed to assign staff');
      }
    } catch (error: any) {
      console.error('Error assigning staff:', error);
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: "Could not assign staff. Please try again.",
      });
    } finally {
      setIsUpdatingProgression(false);
    }
  };

  const eligibilitySupportContacts = (() => {
    const plan = String((application as any)?.healthPlan || '').trim().toLowerCase();
    if (plan.includes('health net') || plan.includes('healthnet')) {
      return [
        { label: 'California Health Care Options', phone: '800-430-4263' },
        { label: 'Health Net Member Services', phone: '1-800-675-6110' },
      ];
    }
    if (plan.includes('kaiser')) {
      return [
        { label: 'Kaiser South Member Services', phone: '1-800-464-4000' },
        { label: 'Kaiser North Member Services', phone: '1-800-464-4000' },
      ];
    }
    return [] as Array<{ label: string; phone: string }>;
  })();
  const selectableEligibilityScreenshots = getEligibilityScreenshotUploads().filter((upload) =>
    Boolean(String(upload.downloadURL || '').trim())
  );
  const communicationNoteLog = getCommunicationNoteLog();
  const latestEligibilitySuccessNote = communicationNoteLog.find(
    (entry) => entry.channel === 'eligibility_note' && entry.direction === 'staff_to_user' && entry.status === 'success'
  );
  const pendingUserStaffResponses = communicationNoteLog.filter(
    (entry) => entry.category === 'user_staff' && entry.requiresResponse && !entry.respondedAtIso
  ).length;
  const pendingInterofficeResponses = communicationNoteLog.filter(
    (entry) => entry.category === 'interoffice' && entry.requiresResponse && !entry.respondedAtIso
  ).length;
  const currentEligibilityDraftFingerprint = JSON.stringify({
    note: String((application as any)?.calaimTrackingReason || '').trim(),
    notEligibleReason:
      String((application as any)?.calaimTrackingStatus || '').trim() === 'Not CalAIM Eligible'
        ? String((application as any)?.calaimNotEligibleReason || '').trim()
        : '',
    screenshotLinks: getEligibilityScreenshotUploads()
      .filter((upload) => selectedEligibilityScreenshotIds.includes(upload.id))
      .map((upload) => String(upload.downloadURL || '').trim())
      .filter(Boolean)
      .sort(),
  });
  const isEligibilityDraftDuplicate =
    String(
      latestEligibilitySuccessNote?.metadata && typeof latestEligibilitySuccessNote.metadata === 'object'
        ? (latestEligibilitySuccessNote.metadata as any).fingerprint || ''
        : ''
    ).trim() === currentEligibilityDraftFingerprint;
  
  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = getComponentStatus(req.title) === 'Completed';
    const isCsSummaryReq = req.id === 'cs-summary';

    const baseQueryParams = `?applicationId=${applicationId}&userId=${appUserId}`;
    let viewHref = req.href ? `${req.href}${baseQueryParams}` : '#';
    const editHref = req.editHref ? `${req.editHref}${baseQueryParams}` : viewHref;

    if (isCompleted && req.editHref) {
      viewHref = editHref; // If completed, view and edit might be the same
    }

    const isUploading = uploading[req.title];
    const currentProgress = uploadProgress[req.title];
    const isMultiple = req.title === 'Proof of Income' || req.title === 'Eligibility Screenshot';
    const proofIncomeControls =
      req.id === 'proof-of-income' ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="proof-income-actual-amount-admin">Actual proof of income amount</Label>
            <Input
              id="proof-income-actual-amount-admin"
              value={proofIncomeActualAmountRaw}
              placeholder="Enter amount from proof of income document"
              onChange={(event) =>
                setApplication((prev) =>
                  prev
                    ? ({ ...(prev as any), proofIncomeActualAmount: event.target.value } as any)
                    : prev
                )
              }
              onBlur={(event) => {
                const nextRaw = String(event.target.value || '').trim();
                const nextAmount = parseCurrencyAmount(nextRaw);
                const monthlyIncomeForCaspio = nextRaw || String((application as any)?.monthlyIncome || '').trim();
                void updateProofIncomeDetails({
                  proofIncomeActualAmount: nextRaw,
                  proofIncomeSocFlag: nextAmount != null && nextAmount > 1800,
                  monthlyIncome: monthlyIncomeForCaspio,
                });
              }}
            />
          </div>
          <div className="text-xs">
            {proofIncomeSocFlag ? (
              <span className="font-medium text-amber-700">
                SOC flag: Amount is over $1,800 and may trigger Medi-Cal SOC.
              </span>
            ) : (
              <span className="text-muted-foreground">
                SOC flag: Not triggered (enter amount above $1,800 to trigger).
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Saved amount is queued for Caspio push to <span className="font-mono">Monthly_Income</span>.
          </div>
          {isKaiserApplication ? (
            <div className="space-y-2 border-t pt-2">
              <Label htmlFor="proof-income-document-date-admin">Proof of income date</Label>
              <Input
                id="proof-income-document-date-admin"
                type="date"
                defaultValue={String((application as any)?.proofIncomeDocumentDate || '')}
                onBlur={(event) => {
                  const next = String(event.target.value || '').trim();
                  if (next === String((application as any)?.proofIncomeDocumentDate || '').trim()) return;
                  void saveProofIncomeDocumentDate(next);
                }}
              />
              <div className="text-xs text-muted-foreground">
                {(() => {
                  const documentDate = String((application as any)?.proofIncomeDocumentDate || '').trim();
                  const status = classifyProofIncomeDocumentDate(documentDate);
                  if (status === 'expired') return 'This proof of income date is older than 1 year.';
                  if (status === 'due-soon') return 'This proof of income date is within 2 months of 1 year old.';
                  if (status === 'current') return 'This proof of income date is within the last year.';
                  return 'Enter the date on the proof of income document.';
                })()}
              </div>
              {(() => {
                const contactName =
                  [String((application as any)?.bestContactFirstName || '').trim(), String((application as any)?.bestContactLastName || '').trim()]
                    .filter(Boolean)
                    .join(' ') || 'Primary contact';
                const contactEmail = String((application as any)?.bestContactEmail || '').trim();
                const remindersOn = (application as any)?.proofIncomeAutoRemindersEnabled !== false;
                const lastSent = String((application as any)?.proofIncomeReminderLastSentAt || '').trim();
                return (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">
                      The reminder says a new proof of income is needed for the authorization renewed every six months. It goes to {contactName}
                      {contactEmail ? ` (${contactEmail})` : ' (no primary contact email on file)'}.
                      {lastSent ? ` Last sent ${new Date(lastSent).toLocaleString()}.` : ' No reminder sent yet.'}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="proof-income-auto-reminders" className="text-xs">
                        Auto reminders for new proof of income
                      </Label>
                      <Switch
                        id="proof-income-auto-reminders"
                        checked={remindersOn}
                        onCheckedChange={(checked) => void setProofIncomeAutoReminders(checked)}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}
          {proofIncomeSocFlag ? (
            <AlertDialog open={isSocWarningPreviewOpen} onOpenChange={setIsSocWarningPreviewOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSendingProofIncomeSocWarning}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send SOC warning to family
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Preview SOC warning email</AlertDialogTitle>
                  <AlertDialogDescription>
                    Review this email before sending to the family contact.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <div>
                    <span className="font-medium">To:</span>{' '}
                    <span className="font-mono">{socWarningRecipientEmail || 'No family email on file'}</span>
                  </div>
                  <div>
                    <span className="font-medium">Subject:</span> {socWarningSubject}
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium">Message</div>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border bg-muted/40 p-2 text-xs">
                      {socWarningMessage}
                    </pre>
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isSendingProofIncomeSocWarning}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void sendProofIncomeSocWarning();
                    }}
                    disabled={isSendingProofIncomeSocWarning || !socWarningRecipientEmail}
                  >
                    {isSendingProofIncomeSocWarning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send email'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => openProofIncomeAdditionalDocEmail()}
          >
            <Send className="mr-2 h-4 w-4" />
            Email family for another document
          </Button>
        </div>
      ) : null;

    const recommendedFileName = buildStandardFileName(req.title, 'document.pdf');
    const isKaiserReferralReq = req.id === 'kaiser-auth-referral';

    if (isKaiserReferralReq) {
      const appSource = application as any;
      const memberAddress =
        resolveKaiserReferralMailingAddress(appSource) ||
        composeReferralAddressLine({
          street: appSource?.currentAddress,
          city: appSource?.currentCity,
          state: appSource?.currentState,
          zip: appSource?.currentZip,
        });
      const currentLiving = resolveKaiserReferralCurrentLocation(appSource);
      const referrerName = `${String((application as any)?.referrerFirstName || '').trim()} ${String(
        (application as any)?.referrerLastName || ''
      ).trim()}`.trim();
      const referralDate = (() => {
        try {
          return format(new Date(), 'yyyy-MM-dd');
        } catch {
          return '';
        }
      })();
      const referralMemberPhone =
        String((application as any)?.memberPhone || '').trim() ||
        String((application as any)?.bestContactPhone || '').trim();
      const referralMemberEmail =
        String((application as any)?.memberEmail || '').trim() ||
        String((application as any)?.bestContactEmail || '').trim();
      const referralQuery = new URLSearchParams({
        applicationId: String(applicationId || ''),
        userId: String(appUserId || ''),
        returnTo: `/admin/applications/${encodeURIComponent(String(applicationId || ''))}?userId=${encodeURIComponent(String(appUserId || ''))}`,
        memberName: `${String((application as any)?.memberFirstName || '').trim()} ${String(
          (application as any)?.memberLastName || ''
        ).trim()}`.trim(),
        memberDob: String((application as any)?.memberDob || '').trim(),
        memberPhone: referralMemberPhone,
        memberEmail: referralMemberEmail,
        memberAddress,
        memberMrn: String((application as any)?.memberMrn || '').trim(),
        memberMediCal: String((application as any)?.memberMediCalNum || '').trim(),
        caregiverName: resolveReferralAuthorizedCaregiver(application as any).name,
        caregiverContact: resolveReferralAuthorizedCaregiver(application as any).contact,
        ...resolveReferralBestContactParams(application as any),
        referralDate,
        referrerName,
        referrerOrganization: 'Connections Care Home Consultants, LLC',
        referrerNpi: '1508537325',
        referrerAddress: '1763 East Sandalwood Drive, Palm Springs, CA 92262',
        referrerEmail: 'deydry@carehomefinders.com',
        referrerPhone: '800-330-5993',
        referrerRelationship: 'Other',
        currentLocationName: currentLiving.name,
        currentLocationAddress: currentLiving.address,
        healthPlan: String((application as any)?.healthPlan || '').trim(),
        memberCounty: String((application as any)?.currentCounty || (application as any)?.memberCounty || '').trim(),
        submitterName: String(user?.displayName || '').trim(),
        submitterEmail: String(user?.email || '').trim().toLowerCase(),
        kaiserAuthAlreadyReceived: isKaiserAuthReceivedIntake ? '1' : '0',
        kaiserReferralSubmittedAtIso: String(kaiserReferralSubmission?.submittedAtIso || '').trim(),
      });

      return (
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link href={`/forms/kaiser-referral/printable?${referralQuery.toString()}`} target="_blank" rel="noopener noreferrer">
              Generate + View PDF
            </Link>
          </Button>
          <div className="text-xs text-muted-foreground">
            Uses current application data to pre-populate member and referral fields.
          </div>
        </div>
      );
    }

    switch (req.type) {
        case 'online-form':
             if (req.id === 'waivers') {
                const waiverShowReset = getComponentStatus('Waivers & Authorizations') === 'Completed';
                const waiverUploadedEntries = (
                  Array.isArray((formInfo as any)?.uploadedFiles) && (formInfo as any).uploadedFiles.length > 0
                    ? (formInfo as any).uploadedFiles
                    : ((formInfo as any)?.fileName || (formInfo as any)?.filePath || (formInfo as any)?.downloadURL
                        ? [
                            {
                              fileName: (formInfo as any)?.fileName || 'Uploaded waiver document',
                              filePath: (formInfo as any)?.filePath || '',
                              downloadURL: (formInfo as any)?.downloadURL || '',
                            },
                          ]
                        : [])
                )
                  .map((entry: any, index: number) => {
                    const fileName = String(entry?.fileName || '').trim() || `Uploaded file ${index + 1}`;
                    const filePath = String(entry?.filePath || '').trim();
                    const directUrl = String(entry?.downloadURL || '').trim();
                    return {
                      key: `${fileName}-${filePath || directUrl || index}`,
                      fileName,
                      filePath,
                      downloadURL: directUrl,
                      url: getEffectiveDownloadUrl(directUrl, filePath),
                    };
                  })
                  .filter((entry: any) => Boolean(entry.fileName));
                const hasWaiverUpload = waiverUploadedEntries.length > 0;
                // Staff can mark waiver checklist based on uploaded waiver files even when
                // in-app signed printable metadata is not present.
                const canStaffMarkWaiverChecklist = hasWaiverUpload;
                const waiversPrintableParams = new URLSearchParams();
                waiversPrintableParams.set('applicationId', String(application?.id || '').trim());
                waiversPrintableParams.set(
                  'memberName',
                  `${String(application?.memberFirstName || '').trim()} ${String(application?.memberLastName || '').trim()}`
                    .replace(/\s+/g, ' ')
                    .trim()
                );
                waiversPrintableParams.set('memberMrn', String((application as any)?.memberMrn || '').trim());
                const waiversPrintableHref = `/forms/waivers/printable?${waiversPrintableParams.toString()}`;
                return (
                    <div className="space-y-3">
                        <div className="space-y-2 rounded-md border p-3">
                            {waiverSubTasks.map(task => (
                                <div key={task.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`waiver-${task.id}`}
                                      checked={task.completed}
                                      disabled={!canStaffMarkWaiverChecklist}
                                      onCheckedChange={(next) =>
                                        void updateWaiverChecklistTask(
                                          task.id as 'hipaa' | 'liability' | 'foc' | 'rb',
                                          next === true
                                        )
                                      }
                                    />
                                    <label htmlFor={`waiver-${task.id}`} className="text-sm font-medium leading-none">
                                        {task.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Print the form, have the member or authorized representative sign it, then upload the signed copy here.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button asChild variant="secondary" className="w-full">
                            <Link href={viewHref}>View/Edit Waivers</Link>
                          </Button>
                          <Button asChild variant="outline" className="w-full">
                            <Link href={waiversPrintableHref} target="_blank" rel="noopener noreferrer">
                              <Printer className="mr-2 h-4 w-4" />
                              Print form for signature
                            </Link>
                          </Button>
                        </div>
                        {isUploading && <Progress value={currentProgress} className="h-1 w-full" />}
                        {hasWaiverUpload ? (
                          <div className="space-y-2 rounded-md border p-3">
                            <div className="text-xs font-medium text-muted-foreground">
                              Uploaded waiver document{waiverUploadedEntries.length === 1 ? '' : 's'} ({waiverUploadedEntries.length})
                            </div>
                            <div className="space-y-1">
                              {waiverUploadedEntries.map((entry: any, index: number) => (
                                <div
                                  key={`${entry.key}-${index}`}
                                  className={cn(
                                    'flex items-center justify-between gap-2 rounded-md border p-2 text-sm',
                                    entry.url || entry.filePath
                                      ? 'border-green-200 bg-green-50'
                                      : 'border-amber-200 bg-amber-50'
                                  )}
                                >
                                  {entry.url ? (
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 truncate text-left font-medium text-green-800 hover:underline"
                                      title={entry.fileName}
                                      onClick={() => openDocumentPreview(entry.url, entry.fileName)}
                                    >
                                      {entry.fileName}
                                    </button>
                                  ) : entry.filePath ? (
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 truncate text-left font-medium text-green-800 hover:underline"
                                      title={entry.fileName}
                                      onClick={() =>
                                        void openStoredFileViaServer(
                                          entry.filePath,
                                          entry.fileName,
                                          entry.downloadURL
                                        )
                                      }
                                    >
                                      {entry.fileName}
                                    </button>
                                  ) : (
                                    <span
                                      className="min-w-0 flex-1 truncate font-medium text-amber-800"
                                      title={entry.fileName}
                                    >
                                      {entry.fileName}
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
                                    title="Remove this file"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void removeUploadedFormFile(formInfo as any, {
                                        fileName: entry.fileName,
                                        filePath: entry.filePath,
                                        downloadURL: entry.downloadURL,
                                        index,
                                      });
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Remove file</span>
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <Label
                          htmlFor="waivers-upload"
                          className={cn(
                            'flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            isUploading && 'opacity-50 pointer-events-none'
                          )}
                        >
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                          <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload signed waiver'}</span>
                        </Label>
                        <Input
                          id="waivers-upload"
                          type="file"
                          className="sr-only"
                          onChange={(event) => void handleFileUpload(event, 'Waivers & Authorizations')}
                          disabled={isUploading}
                          multiple
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setIntakeRequirementTitle('Waivers & Authorizations');
                            setIntakeImportOpen(true);
                            setIntakeSelectedFileKey('');
                            setIntakeSearch('');
                            void loadMemberStandaloneIntakes();
                          }}
                          disabled={isUploading || !firestore}
                        >
                          Import from Standalone Uploads
                        </Button>
                    </div>
                );
            }
            return (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100 flex-1">
                        <Link href={viewHref}>View</Link>
                    </Button>
                    {req.editHref && (
                      <Button asChild variant="secondary" className="flex-1">
                          <Link href={editHref}>Edit</Link>
                      </Button>
                    )}
                    {isCsSummaryReq && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="secondary" className="flex-1">
                            Quick View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-xl">
                              CS Summary: {application.memberFirstName} {application.memberLastName}
                            </DialogTitle>
                            <DialogDescription>
                              Complete CS Member Summary form data • {application.healthPlan} • {application.pathway}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6 py-4 px-2">
                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Member Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">First Name</p><p className="font-semibold">{application.memberFirstName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Last Name</p><p className="font-semibold">{application.memberLastName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Date of Birth</p><p className="font-semibold">{application.memberDob ? format(new Date(String(application.memberDob)), 'PPP') : <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Age</p><p className="font-semibold">{(application as any).memberAge || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medi-Cal Number</p><p className="font-semibold">{application.memberMediCalNum || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medical Record Number (MRN)</p><p className="font-semibold">{application.memberMrn || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Preferred Language</p><p className="font-semibold">{application.memberLanguage || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">County</p><p className="font-semibold">{application.currentCounty || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Referrer Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Name</p><p className="font-semibold">{`${application.referrerFirstName || ''} ${application.referrerLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-semibold">{application.referrerEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-semibold">{application.referrerPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Relationship</p><p className="font-semibold">{application.referrerRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Agency</p><p className="font-semibold">{application.agency || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Primary Contact</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Name</p><p className="font-semibold">{`${application.bestContactFirstName || ''} ${application.bestContactLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Relationship</p><p className="font-semibold">{application.bestContactRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Phone</p><p className="font-semibold">{application.bestContactPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Email</p><p className="font-semibold">{application.bestContactEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Language</p><p className="font-semibold">{application.bestContactLanguage || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Legal Representative</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Member Has Capacity</p><p className="font-semibold">{(['notApplicable', 'capacity_has_poa', 'same_as_primary', 'same_as_submitter', 'different'].includes(String(application.hasLegalRep || '')) ? 'Yes, member has capacity' : ['no_has_rep', 'no_capacity_has_rep'].includes(String(application.hasLegalRep || '')) ? 'No, member lacks capacity' : 'Unknown')}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Legal Representative</p><p className="font-semibold">{String(application.hasLegalRep || '') || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Name</p><p className="font-semibold">{`${application.repFirstName || ''} ${application.repLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Relationship</p><p className="font-semibold">{application.repRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Phone</p><p className="font-semibold">{application.repPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Rep Email</p><p className="font-semibold">{application.repEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Location Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Current Location Type</p><p className="font-semibold">{application.currentLocation || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Current Location Name</p><p className="font-semibold">{application.currentLocationName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Current Address</p><p className="font-semibold">{[
                                  String(application.currentAddress || '').trim(),
                                  String(application.currentCity || '').trim(),
                                  [String(application.currentState || '').trim(), String(application.currentZip || '').trim()].filter(Boolean).join(' '),
                                  String(application.currentCounty || '').trim(),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Customary Residence Type</p><p className="font-semibold">{application.customaryLocationType || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Customary Location Name</p><p className="font-semibold">{application.customaryLocationName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Customary Address</p><p className="font-semibold">{[
                                  String(application.customaryAddress || '').trim(),
                                  String(application.customaryCity || '').trim(),
                                  [String(application.customaryState || '').trim(), String(application.customaryZip || '').trim()].filter(Boolean).join(' '),
                                  String(application.customaryCounty || '').trim(),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Health Plan & Pathway</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Health Plan</p><p className="font-semibold">{application.healthPlan || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Pathway</p><p className="font-semibold">{application.pathway || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                {application.pathway === 'SNF Diversion' ? (
                                  <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Reason for Diversion</p><p className="font-semibold">{application.snfDiversionReason || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                ) : null}
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">ISP Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">ISP Contact Name</p><p className="font-semibold">{`${application.ispFirstName || ''} ${application.ispLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">ISP Contact Phone</p><p className="font-semibold">{application.ispPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Also Contact Primary for ISP</p><p className="font-semibold">{application.ispSecondaryContactSameAsPrimary ? 'Yes' : 'No'}</p></div>
                                <div><p className="text-sm text-muted-foreground">Secondary ISP Contact Name</p><p className="font-semibold">{`${application.ispSecondaryFirstName || ''} ${application.ispSecondaryLastName || ''}`.trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Secondary ISP Contact Phone</p><p className="font-semibold">{application.ispSecondaryPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Secondary ISP Contact Email</p><p className="font-semibold">{application.ispSecondaryEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Secondary ISP Relationship</p><p className="font-semibold">{application.ispSecondaryRelationship || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">ISP Assessment Location</p><p className="font-semibold">{[
                                  String(application.ispAddress || '').trim(),
                                  String(application.ispCity || '').trim(),
                                  [String(application.ispState || '').trim(), String(application.ispZip || '').trim()].filter(Boolean).join(' '),
                                ].filter(Boolean).join(', ').replace(/,\s*,/g, ', ').trim() || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">RCFE Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">On ALW Waitlist?</p><p className="font-semibold">{application.onALWWaitlist || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Preferred RCFE?</p><p className="font-semibold">{application.hasPrefRCFE || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">RCFE Name</p><p className="font-semibold">{application.rcfeName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">RCFE Address</p><p className="font-semibold">{application.rcfeAddress || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Preferred RCFE Cities</p><p className="font-semibold">{application.rcfePreferredCities || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin First Name</p><p className="font-semibold">{application.rcfeAdminFirstName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Last Name</p><p className="font-semibold">{application.rcfeAdminLastName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Phone</p><p className="font-semibold">{application.rcfeAdminPhone || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">RCFE Admin Email</p><p className="font-semibold">{application.rcfeAdminEmail || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Financial Information</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Income Source</p><p className="font-semibold">{application.incomeSource || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Has Medi-Cal</p><p className="font-semibold">{application.hasMediCal ? 'Yes' : 'No'}</p></div>
                                <div><p className="text-sm text-muted-foreground">Medi-Cal Number</p><p className="font-semibold">{application.memberMediCalNum || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Share of Cost</p><p className="font-semibold">{application.shareOfCost || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Room & Board Agreement</p><p className="font-semibold">{(() => {
                                  const forms = (application as any)?.forms || [];
                                  const form = forms.find((f: any) => {
                                    const name = String(f?.name || '').trim();
                                    return name === 'Room and Board/Tier Level Agreement' || name === 'Room and Board/Tier Level Commitment' || name === 'Room and Board Commitment';
                                  });
                                  const ack = form?.ackRoomAndBoard ?? (application as any)?.ackRoomAndBoard;
                                  if (ack === true) return 'Agrees';
                                  if (ack === false) return 'Does not agree';
                                  return 'Not provided';
                                })()}</p></div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            <div>
                              <h3 className="text-lg font-semibold mb-2 text-primary">Application Status & Tracking</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                <div><p className="text-sm text-muted-foreground">Submission Status</p><p className="font-semibold">{application.status || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Submitted Date</p><p className="font-semibold">{formatDateTimeValue(application.submissionDate) || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Last Updated</p><p className="font-semibold">{formatDateTimeValue(application.lastUpdated) || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div><p className="text-sm text-muted-foreground">Submitted By</p><p className="font-semibold">{application.referrerName || <span className="font-normal text-gray-400">N/A</span>}</p></div>
                                <div className="md:col-span-2">
                                  <p className="text-sm text-muted-foreground">Application ID</p>
                                  <p className="font-semibold">{application.id || <span className="font-normal text-gray-400">N/A</span>}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Client_ID2:{' '}
                                    <span className="font-semibold text-foreground">
                                      {String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim() || 'Pending (set after Caspio push)'}
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <Separator className="my-6" />
                            </div>

                            {(application.additionalNotes || application.specialInstructions) ? (
                              <div>
                                <h3 className="text-lg font-semibold mb-2 text-primary">Additional Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                  {application.additionalNotes ? (
                                    <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Additional Notes</p><p className="font-semibold whitespace-pre-wrap">{application.additionalNotes}</p></div>
                                  ) : null}
                                  {application.specialInstructions ? (
                                    <div className="md:col-span-2"><p className="text-sm text-muted-foreground">Special Instructions</p><p className="font-semibold whitespace-pre-wrap">{application.specialInstructions}</p></div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                </div>
            );
        case 'Upload':
             if (req.id === 'eligibility-screenshot') {
              const uploads = getEligibilityScreenshotUploads();
              const canViewAny = uploads.some((u) => Boolean(getEffectiveDownloadUrl(u.downloadURL, u.filePath)));

               return (
                 <div
                   ref={eligibilityPasteZoneRef}
                   tabIndex={0}
                   className="space-y-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                   onPasteCapture={(event) => void handleEligibilityScreenshotPaste(event)}
                 >
                   {req.id === 'eligibility-screenshot' && 'links' in req && req.links ? (
                     <div className="flex flex-col space-y-1">
                       {(req.links as { name: string; url: string }[]).map((link) => (
                         <Button
                           key={link.name}
                           asChild
                           variant="link"
                           size="sm"
                           className="h-auto justify-start p-0 text-xs"
                         >
                           <Link href={link.url} target="_blank" rel="noopener noreferrer">
                             <LinkIcon className="mr-1 h-3 w-3" /> {link.name}
                           </Link>
                         </Button>
                       ))}
                     </div>
                   ) : null}
                  {req.id === 'eligibility-screenshot' && eligibilitySupportContacts.length > 0 ? (
                    <div className="rounded-md border bg-muted/30 p-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Eligibility support phone numbers
                      </div>
                      <div className="space-y-1">
                        {eligibilitySupportContacts.map((contact) => (
                          <div key={`${contact.label}-${contact.phone}`} className="text-xs">
                            <span className="font-medium">{contact.label}:</span>{' '}
                            <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="underline decoration-dotted">
                              {contact.phone}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                   {uploads.length > 0 ? (
                     <div className="space-y-2 rounded-md border p-2">
                       <div className="text-xs font-medium text-muted-foreground">
                         Uploaded screenshot{uploads.length === 1 ? '' : 's'} ({uploads.length})
                       </div>
                       <div className="space-y-1">
                        {uploads.map((u) => {
                          const effectiveUrl = getEffectiveDownloadUrl(u.downloadURL, u.filePath);
                          return (
                          <div
                            key={u.id}
                            className={cn(
                              'flex items-center justify-between gap-2 p-2 rounded-md border text-sm',
                              effectiveUrl ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                            )}
                          >
                            {effectiveUrl ? (
                               <button
                                 type="button"
                                 className="truncate flex-1 text-left text-green-800 font-medium hover:underline"
                                 title={u.fileName}
                                 onClick={() => openDocumentPreview(effectiveUrl, u.fileName)}
                               >
                                 {u.fileName}
                               </button>
                             ) : (
                               <span className="truncate flex-1 text-amber-800 font-medium" title={u.fileName}>
                                 {u.fileName}
                               </span>
                             )}
                             <Button
                               variant="ghost"
                               size="icon"
                               className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
                               onClick={() => void removeEligibilityScreenshotUpload(u)}
                             >
                               <X className="h-4 w-4" />
                               <span className="sr-only">Remove file</span>
                             </Button>
                          </div>
                        )})}
                       </div>
                       {!canViewAny ? (
                         <div className="text-xs text-muted-foreground">
                           Some items were saved without a viewable URL.
                         </div>
                       ) : null}
                     </div>
                   ) : null}

                  {isUploading && <Progress value={currentProgress} className="h-1 w-full" />}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Label
                      htmlFor={req.id}
                      className={cn(
                        'flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isUploading && 'opacity-50 pointer-events-none'
                      )}
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="mr-2 h-4 w-4" />
                      )}
                      <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload Screenshot(s)'}</span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void pasteEligibilityScreenshotFromClipboard()}
                      disabled={isUploading || eligibilityPasteLoading}
                    >
                      {eligibilityPasteLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardPaste className="mr-2 h-4 w-4" />
                      )}
                      {eligibilityClipboardBlocked ? 'Paste Screenshot (Ctrl+V)' : 'Paste Screenshot'}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {eligibilityClipboardBlocked
                      ? 'Clipboard direct-read is blocked in this browser session. Click in this card and press Ctrl+V to paste your screenshot.'
                      : 'Tip: copy a screenshot, then press Ctrl+V in this card or click Paste Screenshot.'}
                  </div>
                   <Input
                     ref={eligibilityScreenshotInputRef}
                     id={req.id}
                     type="file"
                     className="sr-only"
                     onChange={handleEligibilityScreenshotUpload}
                     disabled={isUploading}
                     multiple
                   />
                 </div>
               );
             }

             const isRoomBoardAgreementReq = req.id === 'room-board-obligation';
             const isProofIncomeReq = req.id === 'proof-of-income';
             const hasUploadedFileEvidence =
               Boolean(String((formInfo as any)?.filePath || '').trim()) ||
               Boolean(String((formInfo as any)?.downloadURL || '').trim()) ||
               Boolean(String((formInfo as any)?.fileName || '').trim()) ||
               (Array.isArray((formInfo as any)?.uploadedFiles) && (formInfo as any).uploadedFiles.length > 0);
             if (formInfo?.status === 'Completed' || hasUploadedFileEvidence) {
                const uploadedFileEntries = (
                  Array.isArray((formInfo as any)?.uploadedFiles) && (formInfo as any).uploadedFiles.length > 0
                    ? (formInfo as any).uploadedFiles
                    : [
                        {
                          fileName: (formInfo as any)?.fileName || 'Completed',
                          filePath: (formInfo as any)?.filePath || '',
                          downloadURL: (formInfo as any)?.downloadURL || '',
                        },
                      ]
                )
                  .map((entry: any, index: number) => {
                    const fileName = String(entry?.fileName || '').trim() || `Uploaded file ${index + 1}`;
                    const filePath = String(entry?.filePath || '').trim();
                    const directUrl = String(entry?.downloadURL || '').trim();
                    return {
                      key: `${fileName}-${filePath || directUrl || index}`,
                      fileName,
                      filePath,
                      downloadURL: directUrl,
                      url: getEffectiveDownloadUrl(directUrl, filePath),
                    };
                  })
                  .filter((entry: any) => Boolean(entry.fileName));
                const effectiveFormDownloadUrl = getEffectiveDownloadUrl(
                  (formInfo as any)?.downloadURL || '',
                  (formInfo as any)?.filePath || ''
                );
                const hasViewableFile =
                  Boolean(effectiveFormDownloadUrl) ||
                  uploadedFileEntries.some((entry: any) => Boolean(entry.url || entry.filePath));
                const hasNamedFileWithoutStorage = uploadedFileEntries.some(
                  (entry: any) => !entry.url && !entry.filePath && entry.fileName !== 'Completed'
                );
                const missingFileMessage = hasNamedFileWithoutStorage
                  ? 'File name was saved but no stored file is linked to it — it never finished uploading. Ask the family to upload again or use Add File(s).'
                  : 'No file available to view (this item was marked complete without an upload).';
                const renderServerOpenButton = (entry: any, className: string) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={className}
                    title="Open from secure storage"
                    disabled={
                      serverFileOpening === entry.filePath ||
                      (!!entry.downloadURL && serverFileOpening === entry.downloadURL)
                    }
                    onClick={() =>
                      void openStoredFileViaServer(entry.filePath, entry.fileName, entry.downloadURL)
                    }
                  >
                    {serverFileOpening === entry.filePath ||
                    (!!entry.downloadURL && serverFileOpening === entry.downloadURL)
                      ? 'Opening… '
                      : ''}
                    {entry.fileName}
                  </button>
                );
                 return (
                    <div className="space-y-2">
                      {proofIncomeControls}
                      <div className="space-y-2 rounded-md border p-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          {uploadedFileEntries.length} uploaded file
                          {uploadedFileEntries.length === 1 ? '' : 's'}
                        </div>
                        <div className="space-y-1">
                          {uploadedFileEntries.map((entry: any, index: number) => (
                            <div
                              key={`${entry.key}-${index}`}
                              className={cn(
                                'flex items-center justify-between gap-2 p-2 rounded-md border text-sm',
                                entry.url || entry.filePath
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-amber-50 border-amber-200'
                              )}
                            >
                              {entry.url ? (
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left text-green-800 font-medium hover:underline"
                                  onClick={() => openDocumentPreview(entry.url, entry.fileName)}
                                >
                                  {entry.fileName}
                                </button>
                              ) : entry.filePath ? (
                                renderServerOpenButton(
                                  entry,
                                  'min-w-0 flex-1 truncate text-left text-green-800 font-medium hover:underline'
                                )
                              ) : (
                                <span className="min-w-0 flex-1 truncate text-amber-800 font-medium">
                                  {entry.fileName}
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
                                title="Remove this file"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void removeUploadedFormFile(formInfo!, {
                                    fileName: entry.fileName,
                                    filePath: entry.filePath,
                                    downloadURL: entry.downloadURL,
                                    index,
                                  });
                                }}
                              >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Remove file</span>
                              </Button>
                            </div>
                          ))}
                          {!hasViewableFile ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                              {missingFileMessage}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {req.href && req.href !== '#' && (
                          <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                            <Link href={req.href} target="_blank">
                                <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                            </Link>
                        </Button>
                      )}
                      {isRoomBoardAgreementReq ? (
                        <div className="space-y-2 rounded-md border p-2 bg-muted/20">
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setRoomBoardWorkspaceOpen(true)}
                          >
                            Open Agreement Workspace
                          </Button>
                          <div className="flex flex-wrap gap-1">
                            {roomBoardAgreementMeta?.requestId ? (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                Req {String(roomBoardAgreementMeta.requestId)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal">
                                No request yet
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Status: {String(roomBoardAgreementMeta?.status || 'invited')}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                      ) : null}
                      {isUploading && (
                        <Progress value={currentProgress} className="h-1 w-full" />
                      )}
                      <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                          <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Add File(s)'}</span>
                      </Label>
                      <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title, formInfo)} disabled={isUploading} multiple={isMultiple} />
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    {proofIncomeControls}
                    {isUploading && (
                        <Progress value={currentProgress} className="h-1 w-full" />
                    )}
                    {req.href && req.href !== '#' && (
                        <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                           <Link href={req.href} target="_blank">
                               <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                           </Link>
                       </Button>
                    )}
                    {req.id === 'eligibility-screenshot' && req.links && (
                        <div className="flex flex-col space-y-1">
                            {req.links.map(link => (
                                <Button key={link.name} asChild variant="link" size="sm" className="h-auto justify-start p-0 text-xs">
                                    <Link href={link.url} target="_blank" rel="noopener noreferrer">
                                        <LinkIcon className="mr-1 h-3 w-3"/> {link.name}
                                    </Link>
                                </Button>
                            ))}
                        </div>
                    )}
                    {req.id === 'eligibility-screenshot' && eligibilitySupportContacts.length > 0 ? (
                      <div className="rounded-md border bg-muted/30 p-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                          Eligibility support phone numbers
                        </div>
                        <div className="space-y-1">
                          {eligibilitySupportContacts.map((contact) => (
                            <div key={`${contact.label}-${contact.phone}`} className="text-xs">
                              <span className="font-medium">{contact.label}:</span>{' '}
                              <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="underline decoration-dotted">
                                {contact.phone}
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {isRoomBoardAgreementReq ? (
                      <div className="space-y-2 rounded-md border p-2 bg-muted/20">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          onClick={() => setRoomBoardWorkspaceOpen(true)}
                        >
                          Open Agreement Workspace
                        </Button>
                        <div className="flex flex-wrap gap-1">
                          {roomBoardAgreementMeta?.requestId ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Req {String(roomBoardAgreementMeta.requestId)}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              No request yet
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Status: {String(roomBoardAgreementMeta?.status || 'invited')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
                          </Badge>
                        </div>
                      </div>
                    ) : null}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Add File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading} multiple={isMultiple} />
                    {req.id !== 'eligibility-screenshot' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setIntakeRequirementTitle(req.title);
                          setIntakeImportOpen(true);
                          setIntakeSelectedFileKey('');
                          setIntakeSearch('');
                          void loadMemberStandaloneIntakes();
                        }}
                        disabled={isUploading || !firestore}
                      >
                        Import from Standalone Uploads
                      </Button>
                    ) : null}
                </div>
            );
        default:
            return null;
    }
};

  const isConsolidatedUploading = uploading['consolidated-medical-upload'];
  const consolidatedProgress = uploadProgress['consolidated-medical-upload'];
  const isAnyConsolidatedChecked = Object.values(consolidatedUploadChecks).some(v => v);
  const consolidatedReviewFormInfo = formStatusMap.get('Consolidated Medical Documents') as FormStatusType | undefined;
  const canReviewConsolidatedUpload = consolidatedMedicalDocuments.some((doc) => {
    const status = String(formStatusMap.get(doc.name)?.status || '').trim().toLowerCase();
    return status === 'completed';
  });
  const isConsolidatedUploadReviewed = Boolean(consolidatedReviewFormInfo?.acknowledged);
  const adminPrimaryCardsCount =
    displayedPathwayRequirements.length + (consolidatedMedicalDocuments.length > 0 ? 1 : 0);
  const showAdminPlaceholderCard = adminPrimaryCardsCount % 2 === 1;
  const workspaceKaiserTierLevelValue = String((application as any)?.Kaiser_Tier_Level || (application as any)?.Tier_Level || '').trim();
  const hasInterofficeDraft = Boolean(
    interofficeNote.message.trim() ||
    interofficeNote.recipientIds.length > 0 ||
    String(interofficeNote.followUpDate || '').trim()
  );
  const hasAuthorizationDraft = Boolean(
    String(authorizationUpload.type || '').trim() ||
    String(authorizationUpload.startDate || '').trim() ||
    String(authorizationUpload.endDate || '').trim() ||
    authorizationUpload.file
  );
  const hasIspDraft = Boolean(String(ispUpload.planDate || '').trim() || ispUpload.file);
  const hasRoomBoardDraft = Boolean(
    String(rcfeSignerEmailInput || '').trim() || String(agreedRoomBoardAmountInput || '').trim()
  );
  const hasUnsavedDrafts = hasInterofficeDraft || hasAuthorizationDraft || hasIspDraft || hasRoomBoardDraft;
  const csEditHref = `/admin/forms/edit?applicationId=${encodeURIComponent(applicationId)}&userId=${encodeURIComponent(
    String(appUserId || '')
  )}`;
  const missingQuickFixes: Array<{ label: string; href: string }> = [];
  if (!String((application as any)?.memberMrn || '').trim()) {
    missingQuickFixes.push({ label: 'Member MRN', href: csEditHref });
  }
  if (!String((application as any)?.memberDob || '').trim()) {
    missingQuickFixes.push({ label: 'Member DOB', href: csEditHref });
  }
  if (
    !String((application as any)?.currentCounty || '').trim() &&
    !String((application as any)?.memberCustomaryCounty || '').trim()
  ) {
    missingQuickFixes.push({ label: 'Member County', href: csEditHref });
  }
  if (!String((application as any)?.healthPlan || '').trim()) {
    missingQuickFixes.push({ label: 'MCP / Health Plan', href: `/admin/applications/${applicationId}?userId=${encodeURIComponent(String(appUserId || ''))}` });
  }
  const inactiveCalaimLabel = applicationInactiveCalaimStatus(application as any);
  return (
    <div className="grid w-full min-w-0 grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-3 sticky top-2 z-30 rounded-lg border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/admin/applications')}>
              Back to Applications
            </Button>
          </div>
        </div>
        {inactiveCalaimLabel ? (
          <div className="mt-3 rounded-md border border-slate-400 bg-slate-100 px-4 py-3 text-center">
            <div className="text-4xl font-black tracking-widest text-slate-900">INACTIVE</div>
            <div className="mt-1 text-sm font-semibold text-slate-700">CalAIM status: {inactiveCalaimLabel}</div>
          </div>
        ) : null}
        {missingQuickFixes.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-amber-700">Quick fixes needed:</span>
            {missingQuickFixes.map((item) => (
              <Button key={item.label} asChild type="button" variant="outline" size="sm" className="h-7">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </div>
        )}
      </div>
      <IntakeUploadPickerDialog
        intakeImportOpen={intakeImportOpen}
        setIntakeImportOpen={setIntakeImportOpen}
        setIntakeSelectedFileKey={setIntakeSelectedFileKey}
        setIntakeSearch={setIntakeSearch}
        setIntakeError={setIntakeError}
        intakeRequirementTitle={intakeRequirementTitle}
        intakeSearch={intakeSearch}
        loadMemberStandaloneIntakes={loadMemberStandaloneIntakes}
        intakeLoading={intakeLoading}
        firestore={firestore}
        intakeError={intakeError}
        intakeUploads={intakeUploads}
        intakeSelectedFileKey={intakeSelectedFileKey}
        importStandaloneIntoSlot={importStandaloneIntoSlot}
      />
      <RoomBoardWorkspaceDialog
        roomBoardWorkspaceOpen={roomBoardWorkspaceOpen}
        setRoomBoardWorkspaceOpen={setRoomBoardWorkspaceOpen}
        roomBoardAgreementMeta={roomBoardAgreementMeta}
        authorizedRepInviteEmail={authorizedRepInviteEmail}
        isKaiserPlan={isKaiserPlan}
        isUpdatingKaiserTierLevel={isUpdatingKaiserTierLevel}
        workspaceKaiserTierLevelValue={workspaceKaiserTierLevelValue}
        updateKaiserTierLevel={updateKaiserTierLevel}
        rcfeSignerEmailInput={rcfeSignerEmailInput}
        setRcfeSignerEmailInput={setRcfeSignerEmailInput}
        isSendingRoomBoardInvites={isSendingRoomBoardInvites}
        agreedRoomBoardAmountInput={agreedRoomBoardAmountInput}
        setAgreedRoomBoardAmountInput={setAgreedRoomBoardAmountInput}
        generateRoomBoardAgreementPreview={generateRoomBoardAgreementPreview}
        isGeneratingRoomBoardPreview={isGeneratingRoomBoardPreview}
        sendRoomBoardAgreementInvites={sendRoomBoardAgreementInvites}
        roomBoardPreview={roomBoardPreview}
        roomBoardPreviewWarnings={roomBoardPreviewWarnings}
        sendRoomBoardAgreementToIls={sendRoomBoardAgreementToIls}
        isSendingRoomBoardIls={isSendingRoomBoardIls}
      />
      <div className="lg:col-span-2 min-w-0 space-y-8">
         {servicesDeclined && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Services Declined</AlertTitle>
                <AlertDescription>
                    The member or their representative has declined Community Support services in the Freedom of Choice waiver. Immediate follow-up may be required.
                </AlertDescription>
            </Alert>
        )}
        {isKaiserPlan && kaiserStep5Required && kaiserReferralSubmitted && (
          <Alert className="border-green-200 bg-green-50 text-green-900">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Kaiser referral form sent successfully</AlertTitle>
            <AlertDescription>
              Sent {kaiserReferralSubmittedAtLabel ? `on ${kaiserReferralSubmittedAtLabel}` : 'previously'}.
              {kaiserStep5AcknowledgedAtLabel ? ` Step 5 acknowledged at ${kaiserStep5AcknowledgedAtLabel}.` : ''}
              Additional sends are blocked unless override is explicitly enabled.
            </AlertDescription>
          </Alert>
        )}
        {needsUrgentAttention && (
             <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Urgent Attention Required</AlertTitle>
                <AlertDescription>
                    The member has been identified as not having the capacity to make their own decisions, and no legal representative has been assigned. This requires immediate administrative review.
                </AlertDescription>
            </Alert>
        )}
        <Card className="shadow-sm">
            <CardHeader>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Application Pathway
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary flex items-center gap-2">
                Application Pathway for {memberHeadingName}
                {(application as any)?.calaimTrackingStatus === 'CalAIM Eligible' && (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                )}
                {(application as any)?.calaimTrackingStatus === 'Not CalAIM Eligible' && (
                    <span title="Not CalAIM Eligible">
                        <CheckCircle2 className="h-6 w-6 text-red-600" />
                    </span>
                )}
            </CardTitle>
            <CardDescription className="text-sm">
              MRN: {memberMrnDisplay} | Birthdate: {memberDobDisplay}
            </CardDescription>
            <div>
              {(() => {
                const pathwayLabel = String((application as any)?.pathway || '').trim();
                const pathwayLower = pathwayLabel.toLowerCase();
                const isDiversion = pathwayLower.includes('diversion');
                const isTransition = pathwayLower.includes('transition');
                const badgeClass = isDiversion
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : isTransition
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-slate-100 border-slate-300 text-slate-900';
                const showPathwayPicker = !pathwayLabel || isDraftLikeApplication;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={badgeClass}>
                      {pathwayLabel || 'Pathway not set'}
                    </Badge>
                    {showPathwayPicker ? (
                      <Select
                        value={isDiversion ? 'SNF Diversion' : isTransition ? 'SNF Transition' : ''}
                        onValueChange={(value) =>
                          void handleSetPathway(value as 'SNF Transition' | 'SNF Diversion')
                        }
                        disabled={isSavingPathway || !docRef}
                      >
                        <SelectTrigger className="h-7 w-[190px] text-xs">
                          <SelectValue placeholder={isSavingPathway ? 'Saving…' : 'Set pathway…'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SNF Transition">SNF Transition</SelectItem>
                          <SelectItem value="SNF Diversion">SNF Diversion</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            {isDraftLikeApplication ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div>Skeleton application mode is on. You can convert to a normal application once CS Summary is complete.</div>
                {canConvertSkeletonToNormal ? (
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                      onClick={() => void convertSkeletonToNormalApplication()}
                      disabled={isConvertingSkeleton}
                    >
                      {isConvertingSkeleton ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Converting...
                        </>
                      ) : (
                        'Convert to normal application'
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardDescription>
                {(() => {
                  const name = String(application.referrerName || user?.displayName || 'User').trim();
                  const email = String((application as any)?.referrerEmail || '').trim();
                  const by = email ? `${name} (${email})` : name;
                  const submittedDate =
                    formatDateTimeValue((application as any)?.submissionDate) ||
                    formatDateTimeValue((application as any)?.createdAt) ||
                    'N/A';
                  return (
                    <>
                      Submitted By {by} | {application.pathway} ({application.healthPlan})
                      {` • Submitted Date: ${submittedDate}`}
                      {processStatusLabel ? ` • Process: ${processStatusLabel}` : ''}
                      {kaiserManagerActionRequired ? ' • Kaiser manager action required' : ''}
                    </>
                  );
                })()}
                </CardDescription>
                {isKaiserPlan ? (
                  <Button asChild type="button" variant="outline" size="sm" className="w-full sm:w-auto">
                    <Link href="/admin/alft-assignment">Open ALFT Assignment Queue</Link>
                  </Button>
                ) : null}
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="truncate">
                  <strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    Client_ID2: <span className="font-mono">{String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim() || 'Pending (set after Caspio push)'}</span>
                  </div>
                </div>
                <div><strong>Submission Status:</strong> <span className="font-semibold">{application.status}</span></div>
            </div>
            {(() => {
              const careManagerName = String(
                (application as any)?.careManagerName ||
                (application as any)?.caseManagerName ||
                (application as any)?.Care_Manager_Name ||
                (application as any)?.Care_Manager ||
                ''
              ).trim();
              const careManagerPhone = String(
                (application as any)?.careManagerPhone ||
                (application as any)?.caseManagerPhone ||
                (application as any)?.Care_Manager_Phone ||
                ''
              ).trim();
              const careManagerEmail = String(
                (application as any)?.careManagerEmail ||
                (application as any)?.caseManagerEmail ||
                (application as any)?.Care_Manager_Email ||
                ''
              ).trim();
              if (!careManagerName && !careManagerPhone && !careManagerEmail) return null;
              return (
                <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
                  <div className="text-sm font-medium text-indigo-900">ILS Care Manager</div>
                  <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                    <div><span className="font-medium">Name:</span> {careManagerName || '—'}</div>
                    <div><span className="font-medium">Phone:</span> {careManagerPhone || '—'}</div>
                    <div><span className="font-medium">Email:</span> {careManagerEmail || '—'}</div>
                  </div>
                </div>
              );
            })()}
            {isKaiserPlan && hasT2038AuthorizationSummary ? (
              <div className="rounded-md border border-sky-200 bg-sky-50/60 p-3">
                <div className="text-sm font-medium text-sky-900">Parsed T2038 Authorization</div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <span className="font-medium">Auth Number:</span> {t2038AuthNumberDisplay || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Auth Start:</span> {t2038AuthStartDisplay || '—'}
                  </div>
                  <div>
                    <span className="font-medium">Auth End:</span> {t2038AuthEndDisplay || '—'}
                  </div>
                </div>
              </div>
            ) : null}

            {showKaiserAuthorizationTypeCard ? (
              <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3">
                <div className="text-sm font-medium text-blue-900">Kaiser Authorization Type (controls referral requirement)</div>
                <div className="mt-2 flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={isKaiserAuthReceivedIntake}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          void updateKaiserAuthorizationMode('authorization_received');
                        }
                      }}
                      disabled={isUpdatingKaiserAuthorizationMode}
                    />
                    <span>Authorized member (authorization already received)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={!isKaiserAuthReceivedIntake}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          void updateKaiserAuthorizationMode('authorization_needed');
                        }
                      }}
                      disabled={isUpdatingKaiserAuthorizationMode}
                    />
                    <span>Authorization needed (Kaiser referral form required)</span>
                  </label>
                </div>
                {isUpdatingKaiserAuthorizationMode ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-blue-800">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Saving authorization type...
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* Kaiser status selector moved to Quick actions */}
            
            {/* Application Progression Field */}
            {/* Application progression moved to Quick actions */}

            <div className="space-y-2">
                <Label className="text-sm font-medium">Documents needing acknowledgement</Label>
                {pendingFormAlertsWithWaivers.length === 0 ? (
                    <div className="text-xs text-muted-foreground ml-6">No documents pending acknowledgement.</div>
                ) : (
                    <div className="space-y-1 ml-6">
                        {pendingFormAlertsWithWaivers.map((form) => (
                            <div key={`${form.name}-${form.status}-${form.dateCompleted?.seconds || form.dateCompleted || ''}`} className="flex items-center gap-2 text-sm">
                                <span className="h-2 w-2 rounded-full bg-blue-600" />
                                {getCanonicalFormName(form.name)}
                                {String(form?.status || '').trim() !== 'Completed' ? (
                                  <span className="text-xs text-amber-700">(Pending completion)</span>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Staff assignment moved to Quick actions */}
            <ApplicationProgressSummaryCard
              eligibilityCompleted={eligibilityCompleted}
              caspioPushed={caspioPushed}
              effectiveCaspioCalAIMStatus={effectiveCaspioCalAIMStatus}
              csSummaryCaspioSyncLabel={csSummaryCaspioSyncLabel}
              csSummaryCaspioSyncMode={csSummaryCaspioSyncMode}
              isKaiserPlan={isKaiserPlan}
              isKaiserNotInterested={isKaiserNotInterested}
              currentKaiserStatus={currentKaiserStatus}
              handleUpdateKaiserStatusFromCaspio={handleUpdateKaiserStatusFromCaspio}
              isConfirmingCaspioPush={isConfirmingCaspioPush}
              kaiserManagerActionRequired={kaiserManagerActionRequired}
              isKaiserAuthReceivedIntake={isKaiserAuthReceivedIntake}
              kaiserReferralSubmitted={kaiserReferralSubmitted}
              kaiserReferralSubmittedAtLabel={kaiserReferralSubmittedAtLabel}
              currentSocialWorkerHold={currentSocialWorkerHold}
              hasAlftAssignmentStatus={hasAlftAssignmentStatus}
              alftAssignmentStatusLabel={alftAssignmentStatusLabel}
              staffAssigned={staffAssigned}
              assignedStaffName={assignedStaffName}
              caspioSentByName={caspioSentByName}
              caspioSentDateLabel={caspioSentDateLabel}
              application={application}
              getFrequencyLabel={getFrequencyLabel}
              documentReminderFrequencyDays={documentReminderFrequencyDays}
              getNextReminderLabel={getNextReminderLabel}
              documentReminderNextAtMs={documentReminderNextAtMs}
              statusReminderFrequencyDays={statusReminderFrequencyDays}
              statusReminderNextAtMs={statusReminderNextAtMs}
              setIsReminderDialogOpen={setIsReminderDialogOpen}
              updateReminderSettings={updateReminderSettings}
              DAY_MS={DAY_MS}
              isUpdatingReminderControls={isUpdatingReminderControls}
              reminderFrequencyOptions={reminderFrequencyOptions}
              updateCaspioCalAIMStatus={updateCaspioCalAIMStatus}
              isUpdatingCaspioStatus={isUpdatingCaspioStatus}
              updateSocialWorkerHoldStatus={updateSocialWorkerHoldStatus}
              isUpdatingSocialWorkerHold={isUpdatingSocialWorkerHold}
              isLoadingSwPortalAssignment={isLoadingSwPortalAssignment}
              swPortalAssignment={swPortalAssignment}
              swPortalAssignmentError={swPortalAssignmentError}
              swPortalInviteEnabled={swPortalInviteEnabled}
              setSwPortalInviteEnabled={setSwPortalInviteEnabled}
              isSavingSwPortalInvite={isSavingSwPortalInvite}
              handleSaveSwPortalInvite={handleSaveSwPortalInvite}
              swPortalInviteSentAtLabel={swPortalInviteSentAtLabel}
              familyStatusLastSentLabel={familyStatusLastSentLabel}
              familyStatusLastEmail={familyStatusLastEmail}
              healthNetCurrentStatus={healthNetCurrentStatus}
              isNewCsSummary={isNewCsSummary}
              processTrackerCompletedCount={processTrackerCompletedCount}
              processTrackerTotalCount={processTrackerTotalCount}
              processTrackerProgress={processTrackerProgress}
              processTrackerStatuses={processTrackerStatuses}
            />
            </CardContent>
        </Card>

        <div className="flex justify-end">
          <MemberFilesDialog
            triggerLabel="View Files in Application"
            triggerClassName="justify-start gap-2"
          />
        </div>
        <DocumentPreviewDialog
          documentPreview={documentPreview}
          setDocumentPreview={setDocumentPreview}
        />
        <PathwayRequirementsGrid
          application={application}
          showSnfFacesheet={showSnfFacesheet}
          displayedPathwayRequirements={displayedPathwayRequirements}
          formStatusMap={formStatusMap}
          getComponentStatus={getComponentStatus}
          focusRequirementTarget={focusRequirementTarget}
          isNewCsSummary={isNewCsSummary}
          handleCsSummaryMarkReviewed={handleCsSummaryMarkReviewed}
          handleApplicationReviewed={handleApplicationReviewed}
          handleFormReviewed={handleFormReviewed}
          getReviewerMeta={getReviewerMeta}
          snfResidencyDaysInput={snfResidencyDaysInput}
          setSnfResidencyDaysInput={setSnfResidencyDaysInput}
          isSavingSnfResidency={isSavingSnfResidency}
          toast={toast}
          setIsSavingSnfResidency={setIsSavingSnfResidency}
          handleFormStatusUpdate={handleFormStatusUpdate}
          getFormAction={getFormAction}
          rejectScopeByForm={rejectScopeByForm}
          openRevisionRequestDialog={openRevisionRequestDialog}
          setRejectScopeByForm={setRejectScopeByForm}
          rejectDialogForm={rejectDialogForm}
          setRejectDialogForm={setRejectDialogForm}
          rejectEmailRecipientByForm={rejectEmailRecipientByForm}
          rejectEmailBodyByForm={rejectEmailBodyByForm}
          rejectUseSameLinkByForm={rejectUseSameLinkByForm}
          setRejectEmailRecipientByForm={setRejectEmailRecipientByForm}
          setRejectEmailBodyByForm={setRejectEmailBodyByForm}
          setRejectUseSameLinkByForm={setRejectUseSameLinkByForm}
          rejectingByForm={rejectingByForm}
          handleRejectFormRedo={handleRejectFormRedo}
          formatDateTimeValue={formatDateTimeValue}
          markFormAsComplete={markFormAsComplete}
          showCustomerFeedbackCard={showCustomerFeedbackCard}
          customerFeedbackRating={customerFeedbackRating}
          customerFeedbackSubmittedAtLabel={customerFeedbackSubmittedAtLabel}
          customerFeedbackComments={customerFeedbackComments}
          consolidatedMedicalDocuments={consolidatedMedicalDocuments}
          isConsolidatedUploadReviewed={isConsolidatedUploadReviewed}
          canReviewConsolidatedUpload={canReviewConsolidatedUpload}
          isConsolidatedUploading={isConsolidatedUploading}
          consolidatedProgress={consolidatedProgress}
          consolidatedUploadChecks={consolidatedUploadChecks}
          setConsolidatedUploadChecks={setConsolidatedUploadChecks}
          isAnyConsolidatedChecked={isAnyConsolidatedChecked}
          handleConsolidatedUpload={handleConsolidatedUpload}
          showAdminPlaceholderCard={showAdminPlaceholderCard}
          pathwayRequirements={pathwayRequirements}
        />
      </div>

      <aside className="lg:col-span-1 min-w-0 space-y-6">
        <Card id="member-quick-actions">
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>
              Workflow order: 1 Eligibility → 2 Assign staff → 3 Kaiser status → 4 CalAIM status → Push to Caspio → 5 Email ILS → 6 Email claims → 7 Email primary contact, then other tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 [&_.qa-trigger]:h-auto [&_.qa-trigger]:w-full [&_.qa-trigger]:min-w-0 [&_.qa-trigger]:justify-start [&_.qa-trigger]:gap-2 [&_.qa-trigger]:py-2 [&_.qa-trigger]:text-left [&_.qa-trigger]:whitespace-normal [&_.qa-trigger]:break-words [&_.qa-trigger_svg]:shrink-0 [&_.qa-trigger_.qa-label]:min-w-0 [&_.qa-trigger_.qa-label]:whitespace-normal [&_.qa-trigger_.qa-label]:break-words">
            <div className="order-[90]">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="qa-trigger">
                  <List className="h-4 w-4" />
                  <span className="qa-label">Application Log</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Application Log</DialogTitle>
                  <DialogDescription>
                    Full change history for this application, including document reviews, revision requests, Kaiser referral actions, and staff notes.
                  </DialogDescription>
                </DialogHeader>
                <ActivityLog embedded applicationIdFilter={String(application.id || '')} />
              </DialogContent>
            </Dialog>
            </div>
            <MemberPortalLoginLog
              familyPortalAccessSummary={familyPortalAccessSummary}
              familyPortalLoginExpanded={familyPortalLoginExpanded}
              setFamilyPortalLoginExpanded={setFamilyPortalLoginExpanded}
              setMemberPortalLoginRefreshKey={setMemberPortalLoginRefreshKey}
              isLoadingMemberPortalLoginLog={isLoadingMemberPortalLoginLog}
            />
            <MemberDocumentsQuickActions
              MemberFilesDialog={MemberFilesDialog}
              isKaiserAuthReceivedIntake={isKaiserAuthReceivedIntake}
              application={application}
              effectiveCaspioCalAIMStatus={effectiveCaspioCalAIMStatus}
              setDocumentPreview={setDocumentPreview}
              setServiceDeliverySourceKind={setServiceDeliverySourceKind}
              resolveDefaultServiceDeliverySourceKind={resolveDefaultServiceDeliverySourceKind}
              setServiceDeliveryCreateDialogOpen={setServiceDeliveryCreateDialogOpen}
              isCreatingServiceDeliveryFile={isCreatingServiceDeliveryFile}
              handleCreateWaiversAuthorizationsPacket={handleCreateWaiversAuthorizationsPacket}
              isCreatingWaiversAuthorizationsPacket={isCreatingWaiversAuthorizationsPacket}
              serviceDeliveryCreateDialogOpen={serviceDeliveryCreateDialogOpen}
              serviceDeliverySourceKind={serviceDeliverySourceKind}
              handleCreateMemberServiceDeliveryFile={handleCreateMemberServiceDeliveryFile}
            />
            <KaiserReferralQuickAction
              isKaiserPlan={isKaiserPlan}
              application={application}
              applicationId={applicationId}
              appUserId={appUserId}
              user={user}
              isKaiserAuthReceivedIntake={isKaiserAuthReceivedIntake}
              kaiserReferralSubmission={kaiserReferralSubmission}
              logKaiserReferralFormGenerated={logKaiserReferralFormGenerated}
              kaiserReferralFormGeneratedAtLabel={kaiserReferralFormGeneratedAtLabel}
              kaiserReferralFormGeneratedByName={kaiserReferralFormGeneratedByName}
              kaiserReferralFormGeneratedByEmail={kaiserReferralFormGeneratedByEmail}
              assignedStaffName={assignedStaffName}
              kaiserStep5Required={kaiserStep5Required}
              kaiserStep5Acknowledged={kaiserStep5Acknowledged}
              kaiserStep5AcknowledgedAtLabel={kaiserStep5AcknowledgedAtLabel}
            />
            <EligibilityCheckQuickAction
              isCalaimEligible={isCalaimEligible}
              isCalaimNotEligible={isCalaimNotEligible}
              isCalaimPending={isCalaimPending}
              eligibilityCompleted={eligibilityCompleted}
              application={application}
              memberNameDisplay={memberNameDisplay}
              memberMrnDisplay={memberMrnDisplay}
              healthPlanDisplay={healthPlanDisplay}
              pathwayDisplay={pathwayDisplay}
              memberCountyDisplay={memberCountyDisplay}
              kaiserRegionDisplay={kaiserRegionDisplay}
              memberDobDisplay={memberDobDisplay}
              isUpdatingTracking={isUpdatingTracking}
              updateTrackingStatus={updateTrackingStatus}
              hasEligibilityUploadEvidence={hasEligibilityUploadEvidence}
              setApplication={setApplication}
              updateNotEligibleFlags={updateNotEligibleFlags}
              eligibilityTemplateSelection={eligibilityTemplateSelection}
              setEligibilityTemplateSelection={setEligibilityTemplateSelection}
              applyEligibilityTemplate={applyEligibilityTemplate}
              updateTrackingReason={updateTrackingReason}
              latestEligibilitySuccessNote={latestEligibilitySuccessNote}
              eligibilityNoteSendStatus={eligibilityNoteSendStatus}
              isEligibilityDraftDuplicate={isEligibilityDraftDuplicate}
              selectableEligibilityScreenshots={selectableEligibilityScreenshots}
              setSelectedEligibilityScreenshotIds={setSelectedEligibilityScreenshotIds}
              selectedEligibilityScreenshotIds={selectedEligibilityScreenshotIds}
              sendEligibilityNote={sendEligibilityNote}
              isSendingEligibilityNote={isSendingEligibilityNote}
              eligibilityRequirements={eligibilityRequirements}
              resetEligibilityUploads={resetEligibilityUploads}
              isResettingEligibilityUploads={isResettingEligibilityUploads}
              hasEligibilityUploadsToReset={hasEligibilityUploadsToReset}
              formStatusMap={formStatusMap}
              getFormAction={getFormAction}
            />

            <AssignedStaffQuickAction
              assignedStaffName={assignedStaffName}
              application={application}
              setApplication={setApplication}
              updateStaffTracker={updateStaffTracker}
              isUpdatingFirstContactAck={isUpdatingFirstContactAck}
              currentUserId={currentUserId}
              updateFirstContactAck={updateFirstContactAck}
            />

            <KaiserStatusQuickAction
              isKaiserPlan={isKaiserPlan}
              kaiserStatusSelectedForCaspio={kaiserStatusSelectedForCaspio}
              caspioPushed={caspioPushed}
              kaiserStatusPickerValue={kaiserStatusPickerValue}
              application={application}
              showManualKaiserStatusSection={showManualKaiserStatusSection}
              kaiserStatusSelectValue={kaiserStatusSelectValue}
              isKaiserNotInterested={isKaiserNotInterested}
              updateDraftKaiserStatus={updateDraftKaiserStatus}
              kaiserStatusIsUnlisted={kaiserStatusIsUnlisted}
              prePushKaiserStatusOptions={prePushKaiserStatusOptions}
              laterKaiserStatusOptions={laterKaiserStatusOptions}
              isUpdatingCaspioStatus={isUpdatingCaspioStatus}
              effectiveCaspioCalAIMStatus={effectiveCaspioCalAIMStatus}
              updateCaspioCalAIMStatus={updateCaspioCalAIMStatus}
              calaimStatusSelectedForCaspio={calaimStatusSelectedForCaspio}
              checkStatusesInCaspioNow={checkStatusesInCaspioNow}
              isCheckingCaspioStatus={isCheckingCaspioStatus}
            />

            <div className="order-[4] space-y-1">
            {(() => {
              const missing: string[] = [];
              const staffDone = Boolean(String((application as any)?.assignedStaffName || '').trim() || assignedStaffId);
              const kaiserDone =
                !isKaiserPlan ||
                isRequiredPrePushKaiserStatus(
                  String((application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || '').trim()
                );
              const calAimRaw = String(
                (application as any)?.caspioCalAIMStatus ||
                  (application as any)?.CalAIM_Status ||
                  (application as any)?.calaimStatus ||
                  ''
              ).trim();
              const calAimDone = /^authorized$/i.test(calAimRaw) || /^pending$/i.test(calAimRaw);
              const mrnRaw = String(
                (application as any)?.memberMrn ||
                  (application as any)?.confirmMemberMrn ||
                  (application as any)?.medicalRecordNumber ||
                  (application as any)?.Member_MRN ||
                  (application as any)?.MCP_CIN ||
                  (application as any)?.mrn ||
                  ''
              ).trim();
              const mrnDone = !isKaiserPlan || isValidKaiserMrnForCaspioPush(mrnRaw);
              if (!staffDone) missing.push('Assigned staff');
              if (!kaiserDone) missing.push('Kaiser Status');
              if (!calAimDone) missing.push('CalAIM Status');
              if (!mrnDone) missing.push('Kaiser MRN (must start with 0 or 1)');
              if (!missing.length) return null;
              return (
                <p className="text-[11px] text-red-700 px-0.5">
                  Required before Push to Caspio: {missing.join(', ')}.
                </p>
              );
            })()}
            <PushToCaspioDialog
              application={application}
              buttonVariant="outline"
              buttonClassName="qa-trigger"
            />
            </div>
            <div className="order-[9]">
            <Button
              variant="ghost"
              className="qa-trigger -mt-1"
              onClick={() => void confirmCaspioPushAndRetrieveClientId2()}
              disabled={isConfirmingCaspioPush || isRetrievingClientId2Only}
            >
              {isConfirmingCaspioPush ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              <span className="qa-label">Update Kaiser Status + retrieve Client_ID2</span>
            </Button>
            <Button
              variant="outline"
              className="qa-trigger mt-1"
              onClick={() => void retrieveClientId2Only()}
              disabled={isConfirmingCaspioPush || isRetrievingClientId2Only}
            >
              {isRetrievingClientId2Only ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              <span className="qa-label">Pull Client_ID2 only</span>
            </Button>
            </div>
            <CaspioReversePullQuickAction
              isReversePullPreviewOpen={isReversePullPreviewOpen}
              setIsReversePullPreviewOpen={setIsReversePullPreviewOpen}
              openReversePullPreview={openReversePullPreview}
              isLoadingReversePullPreview={isLoadingReversePullPreview}
              reversePullPreview={reversePullPreview}
              reversePullWillUpdateItems={reversePullWillUpdateItems}
              reversePullIncludeOverwrites={reversePullIncludeOverwrites}
              setReversePullIncludeOverwrites={setReversePullIncludeOverwrites}
              reversePullShowWillUpdateOnly={reversePullShowWillUpdateOnly}
              setReversePullShowWillUpdateOnly={setReversePullShowWillUpdateOnly}
              setReversePullShowOnlyMissing={setReversePullShowOnlyMissing}
              reversePullShowOnlyMissing={reversePullShowOnlyMissing}
              reversePullVisibleItems={reversePullVisibleItems}
              applyReversePullPreview={applyReversePullPreview}
              isApplyingReversePullPreview={isApplyingReversePullPreview}
              setReversePullConfirmOverwriteOpen={setReversePullConfirmOverwriteOpen}
              reversePullConfirmOverwriteOpen={reversePullConfirmOverwriteOpen}
              reversePullOverwriteItems={reversePullOverwriteItems}
              applyReversePullWithOverwrite={applyReversePullWithOverwrite}
            />
            <PrePushNotesQuickAction
              showPrePushNotesSection={showPrePushNotesSection}
              originalNotesPushedToCaspio={originalNotesPushedToCaspio}
              laterNotesPushedToCaspio={laterNotesPushedToCaspio}
              adminIntakeNotes={adminIntakeNotes}
              prePushNotesDraft={prePushNotesDraft}
              setPrePushNotesDraft={setPrePushNotesDraft}
              notesAlreadyPushedToCaspio={notesAlreadyPushedToCaspio}
              isSavingPrePushNotes={isSavingPrePushNotes}
              prePushNotesAutosaveState={prePushNotesAutosaveState}
              prePushNotesSavedAtIso={prePushNotesSavedAtIso}
            />
            <div className="order-[5] space-y-2">
            <IlsServiceStartedEmailDialog
              application={application}
              buttonVariant="outline"
              buttonClassName="qa-trigger"
              buttonLabel="5. Email ILS: service started"
              disabledReason={serviceStartEmailsBlockedReason}
            />
            <ClaimsDepartmentEmailDialog
              application={application}
              buttonVariant="outline"
              buttonClassName="qa-trigger"
              buttonLabel="6. Email claims department"
              disabledReason={serviceStartEmailsBlockedReason}
            />
            <IntroductoryEmailDialog
              application={application}
              buttonVariant="outline"
              buttonClassName="qa-trigger"
              buttonLabel={
                getIntroEmailLastSentAtMs(application as any)
                  ? '7. Re-email Primary Contact'
                  : '7. Email Primary Contact'
              }
            />
            </div>
            <EmailRemindersQuickAction
              application={application}
              documentReminderFrequencyDays={documentReminderFrequencyDays}
              updateReminderSettings={updateReminderSettings}
              documentReminderNextAtMs={documentReminderNextAtMs}
              DAY_MS={DAY_MS}
              isUpdatingReminderControls={isUpdatingReminderControls}
              reminderFrequencyOptions={reminderFrequencyOptions}
              toDateInputValue={toDateInputValue}
              fromDateInputToMs={fromDateInputToMs}
            />

            <div className="order-[20] space-y-2">
            <ApplicationProgressionDialog
              application={application}
              healthNetCurrentStatus={healthNetCurrentStatus}
              isKaiserPlan={isKaiserPlan}
              isHealthNetPlan={isHealthNetPlan}
              effectiveNextStep={effectiveNextStep}
              staffTracker={staffTracker}
            />

            <ReminderSettingsDialog
              isReminderDialogOpen={isReminderDialogOpen}
              setIsReminderDialogOpen={setIsReminderDialogOpen}
              emailReminderSectionRef={emailReminderSectionRef}
              application={application}
              isUpdatingReminderControls={isUpdatingReminderControls}
              updateReminderSettings={updateReminderSettings}
              currentReminderMissingItems={currentReminderMissingItems}
              documentReminderFrequencyDays={documentReminderFrequencyDays}
              documentReminderNextAtMs={documentReminderNextAtMs}
              DAY_MS={DAY_MS}
              reminderFrequencyOptions={reminderFrequencyOptions}
              toDateInputValue={toDateInputValue}
              fromDateInputToMs={fromDateInputToMs}
              staffTestReminderEmail={staffTestReminderEmail}
              loadTestMissingDocsPreview={loadTestMissingDocsPreview}
              isLoadingReminderPreview={isLoadingReminderPreview}
              sendTestMissingDocsReminder={sendTestMissingDocsReminder}
              isSendingTestReminder={isSendingTestReminder}
              reminderPreview={reminderPreview}
              statusReminderSectionRef={statusReminderSectionRef}
              statusReminderFrequencyDays={statusReminderFrequencyDays}
              statusReminderNextAtMs={statusReminderNextAtMs}
              isKaiserPlan={isKaiserPlan}
              isAlfaVisitCompleteStatusSelected={isAlfaVisitCompleteStatusSelected}
              handleFamilyStatusProgressChange={handleFamilyStatusProgressChange}
              alfaVisitCompleteStatusLabel={alfaVisitCompleteStatusLabel}
              loadTestStatusReminderPreview={loadTestStatusReminderPreview}
              isLoadingStatusReminderPreview={isLoadingStatusReminderPreview}
              sendTestStatusReminder={sendTestStatusReminder}
              isSendingStatusTestReminder={isSendingStatusTestReminder}
              statusReminderPreview={statusReminderPreview}
              isHealthNetPlan={isHealthNetPlan}
              familyStatusProgressValue={familyStatusProgressValue}
              familyProgressOptions={familyProgressOptions}
              familyProgressNeedsDeniedReason={familyProgressNeedsDeniedReason}
              familyStatusDeniedReason={familyStatusDeniedReason}
              setApplication={setApplication}
              handleFamilyDeniedReasonBlur={handleFamilyDeniedReasonBlur}
              handleManualFamilyStatusSend={handleManualFamilyStatusSend}
              isSendingFamilyStatusNow={isSendingFamilyStatusNow}
              familyStatusHistory={familyStatusHistory}
            />

            <AuthorizationUploadsDialog
              latestAuthorizationUploadLabel={latestAuthorizationUploadLabel}
              latestAuthorizationRecord={latestAuthorizationRecord}
              isKaiserApplication={isKaiserApplication}
              kaiserH2022Records={kaiserH2022Records}
              setAuthorizationUpload={setAuthorizationUpload}
              authorizationUpload={authorizationUpload}
              authorizationTypes={authorizationTypes}
              authorizationUploading={authorizationUploading}
              authorizationUploadProgress={authorizationUploadProgress}
              handleAuthorizationUpload={handleAuthorizationUpload}
              authorizationSearch={authorizationSearch}
              setAuthorizationSearch={setAuthorizationSearch}
              getDaysUntil={getDaysUntil}
              formatAuthorizationDate={formatAuthorizationDate}
              filteredAuthorizationRecords={filteredAuthorizationRecords}
            />

            <IndividualServicePlansDialog
              ispUpload={ispUpload}
              setIspUpload={setIspUpload}
              ispUploading={ispUploading}
              ispUploadProgress={ispUploadProgress}
              handleIspUpload={handleIspUpload}
              ispRecords={ispRecords}
              formatAuthorizationDate={formatAuthorizationDate}
            />

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="qa-trigger">
                  <Wrench className="h-4 w-4" />
                  <span className="qa-label">Admin actions</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
                <DialogHeader>
                  <DialogTitle>Admin actions</DialogTitle>
                  <DialogDescription>Operational tools for this application.</DialogDescription>
                </DialogHeader>
                <AdminActions application={application} />
              </DialogContent>
            </Dialog>
            </div>

          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function AdminApplicationDetailPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application...</p>
        </div>
    }>
      <ApplicationDetailPageContent />
    </Suspense>
  );
}
