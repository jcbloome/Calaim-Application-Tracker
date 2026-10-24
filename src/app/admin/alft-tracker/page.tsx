'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SW_LOGIN_URL } from '@/lib/app-urls';
import { formatIspContactBlockForSwEmail, normalizeIspAssessmentPurpose } from '@/lib/isp-visit-location';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { BackToTop } from '@/components/ui/back-to-top';
import { Loader2, UploadCloud, ExternalLink, RefreshCw, Send, Download, AlertTriangle } from 'lucide-react';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { SwIspToolsLinksPanel } from '@/components/alft/SwIspToolsLinksPanel';
import { parseMedListAttachment, type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';
import { alftActionAudience, overlayAlftAssignmentWorkflow } from '@/lib/alft-workflow-status';
import {
  DEFAULT_ALFT_RN_LICENSE_NUMBER,
  isDefaultAlftRnName,
} from '@/lib/alft-rn-defaults';
import {
  isAlftRnAdminOverride,
  isAlftTierOption,
  resolveEffectiveRnRecommendedTier,
} from '@/lib/alft-tier-recommendation';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';
import { normalizeAlftAnswersCapitalization, canonicalizeAlftPacketAnswers } from '@/lib/alft-proper-case';
import { applyAlftConditionalAnswerGates, getMissingAlftRequiredFields } from '@/lib/alft-form-rules';
import { createTypedSignaturePngDataUrl } from '@/lib/typed-signature-png';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { appConfirm } from '@/components/AppDialogHost';
import {
  AGENCY_NAME,
  DEFAULT_SIGNATURE_PHONE,
  DEFAULT_PRE_REVIEW_MANAGER_NAME,
  DEFAULT_PRE_REVIEW_MANAGER_EMAIL,
  hasRnElectronicallySigned,
  ispProgressForUpload,
  alftPrintDownloadUnlocked,
  StandaloneUpload,
  AlftAssignmentQueueRow,
  StaffOption,
  toLabel,
  matchesAllTokens,
  isAlft,
  toMs,
  toIsoTimestamp,
  toMmDdYyyyOrRaw,
  fmtTimeline,
  computeStage,
  trackerCurrentStatusLabel,
  assignmentWorkflowSignals,
  assignmentStageBlock,
  toTitleCaseCity,
  REQUIRED_PREFILL_FIELDS,
  BLOCKING_REQUIRED_PREFILL_FIELDS,
  resolvePrefillSourceMode,
  getRequiredValueFromAssignmentRow,
  getRequiredValueFromResolvedOrAssignment,
  assignmentWorkflowSteps,
  workflowChecklistFor,
} from './components/alft-tracker-helpers';
import { AlftTrackerTableCard } from './components/AlftTrackerTableCard';
import { SwEmailPreviewDialog } from './components/SwEmailPreviewDialog';
import { IspTrackerProgression } from './components/IspTrackerProgression';
import { PreSubmissionWorkflowQueue } from './components/PreSubmissionWorkflowQueue';
import { EditRowSummary } from './components/EditRowSummary';
import { EditActionBar } from './components/EditActionBar';
import { RejectDialog } from './components/RejectDialog';

export default function AdminAlftTrackerPage() {
  const { isAdmin, isSuperAdmin, isLoading, user } = useAdmin();
  const firestore = useFirestore();
  const storage = useStorage();
  const auth = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<StandaloneUpload[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<AlftAssignmentQueueRow[]>([]);
  const [search, setSearch] = useState('');
  const [focusId, setFocusId] = useState('');
  const [expandedMemberId, setExpandedMemberId] = useState('');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignKind] = useState<'rn' | 'staff'>('rn');
  const [assignRow, setAssignRow] = useState<StandaloneUpload | null>(null);
  const [assignUid, setAssignUid] = useState<string>('');

  const [revOpen, setRevOpen] = useState(false);
  const [revRow, setRevRow] = useState<StandaloneUpload | null>(null);
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revNote, setRevNote] = useState('');
  const [revUploading, setRevUploading] = useState(false);
  const [revProgress, setRevProgress] = useState(0);

  const [sigRequestingId, setSigRequestingId] = useState('');
  const [routingToFinalManagerId, setRoutingToFinalManagerId] = useState('');
  const [sendingCompletedId, setSendingCompletedId] = useState('');
  const [removingFromTrackerId, setRemovingFromTrackerId] = useState('');
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendConfirmChecked, setSendConfirmChecked] = useState(false);
  const [sendConfirmRow, setSendConfirmRow] = useState<StandaloneUpload | null>(null);
  const [managerReviewingId, setManagerReviewingId] = useState('');
  const [rejectingId, setRejectingId] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRow, setRejectRow] = useState<StandaloneUpload | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<'sw' | 'staff' | 'rn'>('sw');
  const [resendRnDialogOpen, setResendRnDialogOpen] = useState(false);
  const [resendRnRow, setResendRnRow] = useState<StandaloneUpload | null>(null);
  const [resendRnNote, setResendRnNote] = useState('');
  const [approvePreviewOpen, setApprovePreviewOpen] = useState(false);
  const [approvePreviewRow, setApprovePreviewRow] = useState<StandaloneUpload | null>(null);
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigDialog, setSigDialog] = useState<{
    intakeId: string;
    requestId: string;
    rnSignUrl: string;
    mswSignUrl: string;
    rnEmailSent: boolean;
    mswEmailSent: boolean;
  } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<StandaloneUpload | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [packetDownloading, setPacketDownloading] = useState(false);
  const [ispDownloadConfirm, setIspDownloadConfirm] = useState<{
    action: 'approved' | 'rebuild';
    versionAtIso: string;
    versionLabel: string;
    answersSnapshot: Record<string, string | string[]>;
  } | null>(null);
  const [sentToIlsDialogOpen, setSentToIlsDialogOpen] = useState(false);
  const [sentToIlsDate, setSentToIlsDate] = useState('');
  const [sentToIlsConfirmChecked, setSentToIlsConfirmChecked] = useState(false);
  const [sentToIlsSaving, setSentToIlsSaving] = useState(false);
  const editSavingRef = useRef(false);
  const [editExactAnswers, setEditExactAnswers] = useState<Record<string, string | string[]>>(() =>
    createInitialExactAlftAnswers()
  );
  const [editTransitionSummary, setEditTransitionSummary] = useState('');
  const [editRequestedActions, setEditRequestedActions] = useState('');
  const [editBarriersAndRisks, setEditBarriersAndRisks] = useState('');
  const [editAdditionalNotes, setEditAdditionalNotes] = useState('');
  const [editMedListAttachment, setEditMedListAttachment] = useState<AlftMedListAttachment | null>(null);
  const [editConfirmEdits, setEditConfirmEdits] = useState(false);
  const [editRnTierAdminReviewed, setEditRnTierAdminReviewed] = useState(false);
  const [editRnTierAdminNotes, setEditRnTierAdminNotes] = useState('');
  const [rnOpeningSignLink, setRnOpeningSignLink] = useState(false);
  const [rnSuggestedTier, setRnSuggestedTier] = useState('');
  const [rnSignName, setRnSignName] = useState('');
  const [rnSignLicense, setRnSignLicense] = useState('');
  const [rnSignConsent, setRnSignConsent] = useState(false);
  const [editAutosaveAt, setEditAutosaveAt] = useState<string | null>(null);
  const [editAutosaveStatus, setEditAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const editAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipEditAutosaveRef = useRef(false);
  const [isKaiserAssignmentManager, setIsKaiserAssignmentManager] = useState(false);
  const [isKaiserStaff, setIsKaiserStaff] = useState(false);
  const [isRnStaff, setIsRnStaff] = useState(false);
  const [startingWorkflowFor, setStartingWorkflowFor] = useState('');
  const [verifyingMemberId, setVerifyingMemberId] = useState('');
  const [swEmailPreviewUseTestOverride, setSwEmailPreviewUseTestOverride] = useState(false);
  const [swEmailPreviewTestEmail, setSwEmailPreviewTestEmail] = useState('');
  const [dummySendRnEmail, setDummySendRnEmail] = useState('');
  const [dummySendManagerEmail, setDummySendManagerEmail] = useState('');
  const [dummySendCompletedEmail, setDummySendCompletedEmail] = useState('');
  const [swEmailPreviewOpen, setSwEmailPreviewOpen] = useState(false);
  const [swEmailPreviewRow, setSwEmailPreviewRow] = useState<AlftAssignmentQueueRow | null>(null);
  const [swEmailPreviewEditableBody, setSwEmailPreviewEditableBody] = useState('');
  /** Confirm before SW/RN resend emails actually leave. */
  const [confirmResendSwSendOpen, setConfirmResendSwSendOpen] = useState(false);
  const [confirmResendRnSendOpen, setConfirmResendRnSendOpen] = useState(false);
  const [swEmailById, setSwEmailById] = useState<Record<string, string>>({});
  const [swSupportUploadFiles, setSwSupportUploadFiles] = useState<File[]>([]);
  const [swSupportUploadLabel, setSwSupportUploadLabel] = useState('');
  const [swSupportUploading, setSwSupportUploading] = useState(false);
  const [swSupportUploadProgress, setSwSupportUploadProgress] = useState(0);
  const editRouteId = String(searchParams?.get('edit') || '').trim();
  const isEditRoute = Boolean(editRouteId);
  const managerActionsOnly = String(searchParams?.get('managerActions') || '').trim() === '1';
  const rnActionsOnly = String(searchParams?.get('rnActions') || '').trim() === '1';
  const actionsQueueOnly = managerActionsOnly || rnActionsOnly;
  const actionsQueueQuery = managerActionsOnly
    ? '&managerActions=1'
    : rnActionsOnly
      ? '&rnActions=1'
      : '';
  const actionsQueueListHref = managerActionsOnly
    ? '/admin/alft-tracker?managerActions=1'
    : rnActionsOnly
      ? '/admin/alft-tracker?rnActions=1'
      : '/admin/alft-tracker';

  useEffect(() => {
    const focus = String(searchParams?.get('focus') || '').trim();
    if (focus) {
      setFocusId(focus);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isAdmin && !isKaiserStaff && !isRnStaff) return;
      try {
        const res = await fetch('/api/caspio-staff', { cache: 'no-store' });
        const payload = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !payload?.success) return;
        const staff = Array.isArray(payload?.staff) ? payload.staff : [];
        const next: Record<string, string> = {};
        staff.forEach((row: any) => {
          const swId = toLabel(row?.sw_id).toLowerCase();
          const email = toLabel(row?.email).toLowerCase();
          if (swId && email && !next[swId]) next[swId] = email;
        });
        if (!cancelled) setSwEmailById(next);
      } catch {
        // best-effort only: queue still works without this fallback map.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isKaiserStaff, isRnStaff]);

  useEffect(() => {
    const run = async () => {
      if (!firestore || !user?.uid) {
        setIsKaiserAssignmentManager(false);
        setIsKaiserStaff(false);
        setIsRnStaff(false);
        return;
      }
      try {
        const meSnap = await getDoc(doc(firestore, 'users', user.uid));
        const me = meSnap.exists() ? (meSnap.data() as any) : null;
        setIsKaiserAssignmentManager(Boolean(me?.isKaiserAssignmentManager));
        setIsKaiserStaff(Boolean(me?.isKaiserStaff));
        setIsRnStaff(Boolean(me?.isRnStaff));
      } catch {
        setIsKaiserAssignmentManager(false);
        setIsKaiserStaff(false);
        setIsRnStaff(false);
      }
    };
    void run();
  }, [firestore, user?.uid]);

  useEffect(() => {
    if (!firestore || (!isAdmin && !isKaiserStaff && !isRnStaff)) return;
    const unsub = onSnapshot(
      collection(firestore, 'standalone_upload_submissions'),
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
        const mapped = next
          .map((r) => ({
            id: toLabel(r.id),
            status: toLabel(r.status || 'pending'),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            toolCode: toLabel(r.toolCode) || undefined,
            documentType: toLabel(r.documentType),
            files: Array.isArray(r.files) ? r.files : [],
            uploaderName: toLabel(r.uploaderName) || undefined,
            uploaderEmail: toLabel(r.uploaderEmail) || undefined,
            uploaderUid: toLabel(r.uploaderUid) || null,
            memberName: toLabel(r.memberName),
            healthPlan: toLabel(r.healthPlan) || undefined,
            medicalRecordNumber: r.medicalRecordNumber ?? r.kaiserMrn ?? r.mediCalNumber ?? null,
            alftUploadDate: toLabel(r.alftUploadDate) || null,
            prefillPurpose: toLabel(r.prefillPurpose) || null,
            alftForm: (r as any)?.alftForm || null,
            alftCollaboration: (r as any)?.alftCollaboration || null,

            alftRnUid: toLabel(r.alftRnUid) || null,
            alftRnName: toLabel(r.alftRnName) || null,
            alftRnEmail: toLabel(r.alftRnEmail) || null,
            alftRnAssignedAt: r.alftRnAssignedAt,
            alftRnDownloadedAt: r.alftRnDownloadedAt,
            alftRnRevisionUploadedAt: r.alftRnRevisionUploadedAt,

            alftStaffUid: toLabel(r.alftStaffUid) || null,
            alftStaffName: toLabel(r.alftStaffName) || null,
            alftStaffEmail: toLabel(r.alftStaffEmail) || null,
            alftStaffAssignedAt: r.alftStaffAssignedAt,
            alftStaffReviewedAt: r.alftStaffReviewedAt,
            alftStaffDownloadedAt: r.alftStaffDownloadedAt,
            alftLastDownloadLogId: toLabel(r.alftLastDownloadLogId) || null,
            alftLastDownloadName: toLabel(r.alftLastDownloadName) || null,
            alftLastDownloadFileName: toLabel(r.alftLastDownloadFileName) || null,
            sentToIls: Boolean(
              r.sentToIls || r.coverSheetPackageSentAt || r.coverSheetPackageSentAtIso
            ),
            sentToIlsAtIso:
              toLabel(r.sentToIlsAtIso) || toLabel(r.coverSheetPackageSentAtIso) || null,
            sentToIlsManual: Boolean(r.sentToIlsManual),
            coverSheetPackageSentAt: r.coverSheetPackageSentAt || null,
            coverSheetPackageSentAtIso: toLabel(r.coverSheetPackageSentAtIso) || null,
            alftSignature: (r as any)?.alftSignature || null,
            alftManagerReview: (r as any)?.alftManagerReview || null,
            alftManagerPreReview: (r as any)?.alftManagerPreReview || null,
            alftRnTierRecommendation: (r as any)?.alftRnTierRecommendation || null,
            alftSwTierRecommendation: (r as any)?.alftSwTierRecommendation || null,
            alftTierLevelRequest: (r as any)?.alftTierLevelRequest || null,

            alftRevisions: Array.isArray(r.alftRevisions) ? r.alftRevisions : [],
            alftEditHistory: Array.isArray((r as any)?.alftEditHistory) ? (r as any).alftEditHistory : [],
            alftStatusNotes: Array.isArray((r as any)?.alftStatusNotes) ? (r as any).alftStatusNotes : [],
            workflowStatus: toLabel(r.workflowStatus) || null,
            workflowStage: toLabel(r.workflowStage) || null,
            workflowRouting: (r as any)?.workflowRouting || null,
            workflowSteps: (r as any)?.workflowSteps || null,
            workflowStepsAt: (r as any)?.workflowStepsAt || null,
            workflowUpdatedAt: (r as any)?.workflowUpdatedAt || null,
            assignedManager: (r as any)?.assignedManager || null,
            workflowEmailStatus: (r as any)?.workflowEmailStatus || null,
            alftCompletionEmail: (r as any)?.alftCompletionEmail || null,
          }))
          .filter((r) => isAlft(r)) as StandaloneUpload[];
        setRows(mapped);
      },
      () => setRows([])
    );
    return () => unsub();
  }, [firestore, isAdmin, isKaiserStaff, isRnStaff]);

  useEffect(() => {
    if (!firestore || (!isAdmin && !isKaiserStaff && !isRnStaff)) return;
    const unsub = onSnapshot(
      collection(firestore, 'alft_assignments'),
      (snap) => {
        const mapped = snap.docs
          .map((d) => {
            const r = d.data() as any;
            return {
              id: toLabel(d.id),
              memberId: toLabel(r.memberId || d.id),
              memberName: toLabel(r.memberName),
              memberMrn: toLabel(r.memberMrn) || null,
              assignedSwId: toLabel(r.assignedSwId) || null,
              assignedSwName: toLabel(r.assignedSwName) || null,
              assignedSwEmail: toLabel(r.assignedSwEmail) || null,
              memberFirstName: toLabel(r.memberFirstName) || null,
              memberLastName: toLabel(r.memberLastName) || null,
              birthDate: toLabel(r.birthDate) || null,
              memberSex: toLabel(r.memberSex) || null,
              memberPrimaryLanguage: toLabel(r.memberPrimaryLanguage) || null,
              memberPhone: toLabel(r.memberPhone) || null,
              alftPlanId: toLabel(r.alftPlanId) || null,
              ispCurrentAddressStreet: toLabel(r.ispCurrentAddressStreet) || null,
              ispCurrentAddressCity: toTitleCaseCity(toLabel(r.ispCurrentAddressCity)) || null,
              ispCurrentAddressState: toLabel(r.ispCurrentAddressState) || null,
              ispCurrentAddressZip: toLabel(r.ispCurrentAddressZip) || null,
              currentLocationType: toLabel(r.currentLocationType) || null,
              currentLocationTypeOther: toLabel(r.currentLocationTypeOther) || null,
              assessmentSite: toLabel(r.assessmentSite) || null,
              homeAddressStreet: toLabel(r.homeAddressStreet) || null,
              homeAddressCity: toTitleCaseCity(toLabel(r.homeAddressCity)) || null,
              homeAddressState: toLabel(r.homeAddressState) || null,
              homeAddressZip: toLabel(r.homeAddressZip) || null,
              ispFacilityName: toLabel(r.ispFacilityName) || null,
              ispCurrentLocation: toLabel(r.ispCurrentLocation) || null,
              ispContactName: toLabel(r.ispContactName) || null,
              ispContactRelationship: sanitizeRelationshipLabel(toLabel(r.ispContactRelationship)) || null,
              ispContactPhone: toLabel(r.ispContactPhone) || null,
              ispContactEmail: toLabel(r.ispContactEmail) || null,
              ispContactConfirmDate: toLabel(r.ispContactConfirmDate || r.ispContactConfirmField) || null,
              prefillSourceMode: toLabel(r.prefillSourceMode) || null,
              prefillPurpose: toLabel(r.prefillPurpose) || null,
              prefillSourceLabel: toLabel(r.prefillSourceLabel) || null,
              status: toLabel(r.status) || null,
              workflowStatus: toLabel(r.workflowStatus) || null,
              workflowStage: toLabel(r.workflowStage) || null,
              workflowInvites: (r.workflowInvites || null) as any,
              workflowStepsAt: (r.workflowStepsAt || null) as any,
              workflowSteps: (r.workflowSteps || null) as any,
              alftCompletionEmail: (r.alftCompletionEmail || null) as any,
              verificationSignoff: (r.verificationSignoff || null) as any,
              swEmailDeliveryLog: (Array.isArray(r.swEmailDeliveryLog) ? r.swEmailDeliveryLog : null) as any,
              swPortalSupportFiles: (Array.isArray(r.swPortalSupportFiles) ? r.swPortalSupportFiles : null) as any,
              prefillVerification: (r.prefillVerification || null) as any,
              sentToIls: Boolean(
                r.sentToIls || r.coverSheetPackageSentAt || r.coverSheetPackageSentAtIso
              ),
              sentToIlsAtIso:
                toLabel(r.sentToIlsAtIso) || toLabel(r.coverSheetPackageSentAtIso) || null,
              sentToIlsManual: Boolean(r.sentToIlsManual),
              coverSheetPackageSentAt: r.coverSheetPackageSentAt || null,
              coverSheetPackageSentAtIso: toLabel(r.coverSheetPackageSentAtIso) || null,
              updatedAt: r.updatedAt,
            } as AlftAssignmentQueueRow;
          })
          .filter((r) => Boolean(r.memberId) && String(r.status || '').toLowerCase() !== 'completed')
          .sort((a, b) => (toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0));
        setAssignmentRows(mapped);
      },
      () => setAssignmentRows([])
    );
    return () => unsub();
  }, [firestore, isAdmin, isKaiserStaff, isRnStaff]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!firestore || (!isAdmin && !isKaiserStaff && !isRnStaff)) return;
      setStaffLoading(true);
      try {
        const [adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
          getDocs(collection(firestore, 'roles_admin')).catch(() => null),
          getDocs(collection(firestore, 'roles_super_admin')).catch(() => null),
          getDocs(collection(firestore, 'users')).catch(() => null),
        ]);
        const adminIds = new Set((adminRolesSnap?.docs || []).map((d) => d.id));
        const superAdminIds = new Set((superAdminRolesSnap?.docs || []).map((d) => d.id));
        const users = (usersSnap?.docs || []).map((d) => ({ uid: d.id, ...(d.data() as any) }));
        const options: StaffOption[] = users
          .map((u: any) => {
            const uid = toLabel(u.uid);
            const email = toLabel(u.email);
            const first = toLabel(u.firstName);
            const last = toLabel(u.lastName);
            const display = toLabel(u.displayName);
            const label = (first || last) ? `${first} ${last}`.trim() : (display || email || uid);
            const role: StaffOption['role'] = superAdminIds.has(uid) ? 'Super Admin' : adminIds.has(uid) ? 'Admin' : 'Staff';
            return { uid, email, label, role };
          })
          .filter((o) => Boolean(o.uid && o.email))
          .sort((a, b) => a.label.localeCompare(b.label));
        if (!cancelled) setStaffOptions(options);
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [firestore, isAdmin, isKaiserStaff, isRnStaff]);

  const assignmentRowsWithResolvedSwEmail = useMemo(
    () =>
      assignmentRows.map((row) => {
        if (toLabel(row.assignedSwEmail)) return row;
        const swIdKey = toLabel(row.assignedSwId).toLowerCase();
        const email = swIdKey ? toLabel(swEmailById[swIdKey]).toLowerCase() : '';
        if (!email) return row;
        return { ...row, assignedSwEmail: email };
      }),
    [assignmentRows, swEmailById]
  );

  const assignmentLookup = useMemo(() => {
    const byMrn = new Map<string, AlftAssignmentQueueRow>();
    const byName = new Map<string, AlftAssignmentQueueRow>();
    assignmentRowsWithResolvedSwEmail.forEach((row) => {
      const mrnKey = toLabel(row.memberMrn).toLowerCase();
      const nameKey = toLabel(row.memberName).toLowerCase();
      if (mrnKey && !byMrn.has(mrnKey)) byMrn.set(mrnKey, row);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row);
    });
    return { byMrn, byName };
  }, [assignmentRowsWithResolvedSwEmail]);

  const findAssignmentForUpload = useCallback(
    (row: StandaloneUpload) => {
      const mrnKey = toLabel(row.medicalRecordNumber).toLowerCase();
      if (mrnKey && assignmentLookup.byMrn.has(mrnKey)) return assignmentLookup.byMrn.get(mrnKey) || null;
      const nameKey = toLabel(row.memberName).toLowerCase();
      if (nameKey && assignmentLookup.byName.has(nameKey)) return assignmentLookup.byName.get(nameKey) || null;
      return null;
    },
    [assignmentLookup]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((r) => {
        const assignment = findAssignmentForUpload(r);
        const overlaid = overlayAlftAssignmentWorkflow(r, assignment);
        // Sent to ILS may live on intake and/or assignment — either clears admin queue.
        return {
          ...overlaid,
          sentToIls: Boolean(
            (overlaid as any)?.sentToIls ||
              (assignment as any)?.sentToIls ||
              (overlaid as any)?.coverSheetPackageSentAt ||
              (assignment as any)?.coverSheetPackageSentAt ||
              (overlaid as any)?.coverSheetPackageSentAtIso ||
              (assignment as any)?.coverSheetPackageSentAtIso
          ),
          sentToIlsAtIso:
            toLabel((overlaid as any)?.sentToIlsAtIso) ||
            toLabel((assignment as any)?.sentToIlsAtIso) ||
            toLabel((overlaid as any)?.coverSheetPackageSentAtIso) ||
            toLabel((assignment as any)?.coverSheetPackageSentAtIso) ||
            null,
          coverSheetPackageSentAt:
            (overlaid as any)?.coverSheetPackageSentAt || (assignment as any)?.coverSheetPackageSentAt || null,
          coverSheetPackageSentAtIso:
            toLabel((overlaid as any)?.coverSheetPackageSentAtIso) ||
            toLabel((assignment as any)?.coverSheetPackageSentAtIso) ||
            null,
        } as StandaloneUpload;
      })
      .filter((r) => {
        const statusLower = String((r as any)?.status || '').toLowerCase();
        const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
        if (statusLower === 'removed' || workflowStatus.includes('removed_from_tracker')) return false;
        if (
          Boolean((r as any)?.ispTrackerSoftDeleted) ||
          Boolean((r as any)?.supersededByIntakeId) ||
          workflowStatus.includes('superseded_by_sw_resubmit') ||
          Boolean((r as any)?.removedFromIspTrackerAt)
        ) {
          return false;
        }
        const audience = alftActionAudience(r);
        if (managerActionsOnly && audience !== 'admin') return false;
        if (rnActionsOnly && audience !== 'rn') return false;
        if (!s) return true;
        return matchesAllTokens(s, [
          r.id,
          r.memberName,
          r.medicalRecordNumber,
          r.uploaderName,
          r.uploaderEmail,
          r.alftRnName,
          r.alftStaffName,
        ]);
      })
      .sort((a, b) => {
        if (actionsQueueOnly) {
          const nameCmp = String(a.memberName || '').localeCompare(String(b.memberName || ''), undefined, {
            sensitivity: 'base',
          });
          if (nameCmp !== 0) return nameCmp;
        }
        const aMs = Math.max(toMs(a.updatedAt), toMs(a.createdAt));
        const bMs = Math.max(toMs(b.updatedAt), toMs(b.createdAt));
        return bMs - aMs;
      });
  }, [rows, search, managerActionsOnly, rnActionsOnly, actionsQueueOnly, findAssignmentForUpload]);

  const trackedMemberCount = filtered.length;

  const swEmailPreview = useMemo(() => {
    if (!swEmailPreviewRow) return null;
    const previewResolved =
      ((((swEmailPreviewRow as any)?.prefillVerification || {}) as any)?.resolvedFields || {}) as Record<string, unknown>;
    const pickPreview = (...keys: string[]) => {
      for (const key of keys) {
        const resolvedValue = String(previewResolved?.[key] || '').trim();
        if (resolvedValue) return resolvedValue;
        const rowValue = String((swEmailPreviewRow as any)?.[key] || '').trim();
        if (rowValue) return rowValue;
      }
      return '';
    };
    const memberName = String(swEmailPreviewRow.memberName || 'Member').trim();
    const mrn = String(swEmailPreviewRow.memberMrn || '').trim();
    const swName = String(swEmailPreviewRow.assignedSwName || 'Social Worker').trim();
    const swFirstName = String(swName.includes(',') ? swName.split(',', 2)[1] : swName.split(/\s+/, 2)[0])
      .trim()
      .split(/\s+/, 2)[0] || 'Social Worker';
    const swEmail = String(swEmailPreviewRow.assignedSwEmail || '').trim();
    const assignedByName = String((swEmailPreviewRow as any)?.assignedByName || '').trim();
    const assignedByEmail = String((swEmailPreviewRow as any)?.assignedByEmail || '').trim();
    const assignedByPhone = String((swEmailPreviewRow as any)?.assignedByPhone || '').trim();
    const signaturePhone = DEFAULT_SIGNATURE_PHONE || assignedByPhone;
    const signatureName = assignedByName || DEFAULT_PRE_REVIEW_MANAGER_NAME;
    const signatureEmail = assignedByEmail || DEFAULT_PRE_REVIEW_MANAGER_EMAIL;
    const verified = Boolean(swEmailPreviewRow.verificationSignoff?.verified);
    const contactFirst = pickPreview('isp_contact_first');
    const contactLast = pickPreview('isp_contact_last');
    const contactFromParts = [contactFirst, contactLast].filter(Boolean).join(' ').trim();
    const ispContactName = pickPreview('p1_other_responder_name', 'ispContactName') || contactFromParts;
    const ispContactRelationship = sanitizeRelationshipLabel(
      pickPreview('isp_contact_relationship', 'p1_other_responder_relationship', 'ispContactRelationship')
    );
    const ispFacilityName = pickPreview('p2_facility_name', 'isp_location_name', 'ispFacilityName', 'ispCurrentLocation');
    const ispFacilityType = pickPreview('p2_current_type', 'isp_location_type', 'currentLocationType');
    const ispAddress = [
      pickPreview('p2_current_street', 'isp_location_address', 'ispCurrentAddressStreet'),
      pickPreview('p2_current_city', 'isp_location_city', 'ispCurrentAddressCity'),
      pickPreview('p2_current_state', 'isp_location_state', 'ispCurrentAddressState'),
      pickPreview('p2_current_zip', 'isp_location_zip', 'ispCurrentAddressZip'),
    ]
      .filter(Boolean)
      .join(', ');
    const ispPhone = pickPreview('isp_contact_phone', 'ispContactPhone');
    const ispEmail = pickPreview('isp_contact_email', 'ispContactEmail');
    const ispContact2First = pickPreview('isp_contact_2_first', 'ispContact2First');
    const ispContact2Last = pickPreview('isp_contact_2_last', 'ispContact2Last');
    const ispContact2Relationship = sanitizeRelationshipLabel(
      pickPreview('isp_contact_2_relationship', 'ispContact2Relationship')
    );
    const ispContact2Phone = pickPreview('isp_contact_2_phone', 'ispContact2Phone');
    const ispContact2Email = pickPreview('isp_contact_2_email', 'ispContact2Email');
    const secondaryContactName = [ispContact2First, ispContact2Last].filter(Boolean).join(' ').trim();
    const hasSecondaryIspContact = Boolean(secondaryContactName || ispContact2Relationship || ispContact2Phone || ispContact2Email);
    const hasContactMethod = Boolean(ispPhone);
    const askCaregiverOnArrival = Boolean((swEmailPreviewRow as any)?.askCaregiverOnArrival);
    const ispContactBlock = formatIspContactBlockForSwEmail({
      contactName: ispContactName,
      contactFirst,
      contactLast,
      relationship: ispContactRelationship,
      phone: ispPhone,
      email: ispEmail,
      locationType: ispFacilityType,
      facilityName: ispFacilityName,
      visitLocationSource: String((swEmailPreviewRow as any)?.visitLocationSource || '').trim(),
      askCaregiverOnArrival,
    });
    const hasFacilityTypeOrName = Boolean(ispFacilityType || ispFacilityName);
    const missingIspFields = [
      !ispAddress ? 'ISP address' : '',
      !hasFacilityTypeOrName ? 'Facility type or facility name' : '',
      !hasContactMethod ? 'ISP contact phone' : '',
    ].filter(Boolean);
    const sentAtMs = Math.max(
      toMs((swEmailPreviewRow as any)?.workflowStepsAt?.swInviteSentAt),
      toMs((swEmailPreviewRow as any)?.workflowInvites?.invitedAt)
    );
    const sentAtLabel = sentAtMs ? fmtTimeline(sentAtMs) : '';
    const alreadySent = Boolean((swEmailPreviewRow as any)?.workflowSteps?.swInviteSent) || sentAtMs > 0;
    const logoPath = '/calaimlogopdf.png';
    return {
      to: swEmail || 'Missing email',
      subject: `ALFT assigned: ${memberName}`,
      canSend: verified && missingIspFields.length === 0,
      alreadySent,
      sentAtLabel,
      missingIspFields,
      logoPath,
      ispContactName,
      ispContactRelationship,
      ispAddress,
      ispFacilityName,
      ispFacilityType,
      ispPhone,
      ispEmail,
      body: [
        `Hi ${swFirstName},`,
        '',
        'We have a client who needs a Kaiser ALFT Care Assessment.',
        '',
        'Client:',
        `${memberName || 'Not provided'}`,
        `Medical Record Number: ${mrn || 'Not provided'}`,
        '',
        'ISP Location:',
        `${ispFacilityName || 'Not provided'}`,
        `Type: ${ispFacilityType || 'Not provided'}`,
        `Address: ${ispAddress || 'Address not provided'}`,
        '',
        ...ispContactBlock.plainLines,
        ...(hasSecondaryIspContact
          ? [
              '',
              'Secondary ISP Contact:',
              `${secondaryContactName || 'Not provided'} (${ispContact2Relationship || 'Relationship not provided'})`,
              `Tel: ${ispContact2Phone || 'Not provided'}`,
              `Email: ${ispContact2Email || 'Not provided'}`,
            ]
          : []),
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
        `${signatureName}`,
        `${signatureEmail}`,
        `${signaturePhone || 'No sender phone listed'}`,
        'Connections Care Home Consultants',
      ].join('\n'),
    };
  }, [swEmailPreviewRow]);

  // Returns true for admins / Kaiser staff only — RN staff submit with suggested tier instead of reject.
  const canKickBackToSw = useCallback(
    (_row: StandaloneUpload) => {
      if (isSuperAdmin || isAdmin || isKaiserAssignmentManager || isKaiserStaff) return true;
      return false;
    },
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager, isKaiserStaff]
  );

  const canRunManagerWorkflow = useMemo(
    () => Boolean(isSuperAdmin || isAdmin || isKaiserAssignmentManager || isKaiserStaff),
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager, isKaiserStaff]
  );
  // Step gate requested by workflow owner:
  // SW submit -> Kaiser manager pre-review -> send to Leslie (RN) -> Kaiser manager final review -> email Jocelyn.
  const canSendToRnAfterPreReview = useCallback(
    (row: StandaloneUpload) => {
      if (!canRunManagerWorkflow) return false;
      const workflowStatus = String((row as any)?.workflowStatus || '').toLowerCase();
      if (workflowStatus.includes('completed_sent_to_jocelyn') || workflowStatus.includes('awaiting_kaiser_manager_final_review')) {
        return false;
      }
      // Already routed to RN — use Resend instead of Approve.
      const sigRequested = Boolean((row as any)?.alftSignature?.requestedAt);
      const rnAlreadySigned = hasRnElectronicallySigned(row);
      if (sigRequested || rnAlreadySigned || workflowStatus.includes('awaiting_rn')) {
        return false;
      }
      const hasAlftFormContent =
        Boolean((row as any)?.alftForm?.transitionSummary) ||
        Boolean((row as any)?.alftForm?.requestedActions) ||
        (typeof (row as any)?.alftForm?.exactPacketAnswers === 'object' &&
          Object.keys(((row as any)?.alftForm?.exactPacketAnswers || {}) as Record<string, unknown>).length > 0);
      return (
        workflowStatus.includes('awaiting_manager_review_pre_rn') ||
        workflowStatus.includes('returned_to_staff') ||
        workflowStatus.includes('returned_to_admin') ||
        workflowStatus.includes('waiting_staff_revision') ||
        workflowStatus.includes('manager_review_pre_rn_complete_ready_for_rn') ||
        hasAlftFormContent
      );
    },
    [canRunManagerWorkflow]
  );

  const canResendToRn = useCallback(
    (row: StandaloneUpload) => {
      if (!canRunManagerWorkflow) return false;
      const workflowStatus = String((row as any)?.workflowStatus || '').toLowerCase();
      if (workflowStatus.includes('completed_sent_to_jocelyn')) return false;
      // Allow resend while awaiting RN, and also after RN already signed (new signature after edits).
      return (
        Boolean((row as any)?.alftSignature?.requestedAt) ||
        workflowStatus.includes('awaiting_rn') ||
        hasRnElectronicallySigned(row) ||
        workflowStatus.includes('awaiting_kaiser_manager_final') ||
        workflowStatus.includes('manager_review_complete')
      );
    },
    [canRunManagerWorkflow]
  );

  const canEditAlftRow = useCallback(
    (row: StandaloneUpload) => {
      const uid = String(user?.uid || '').trim();
      if (!uid) return false;
      // Admins and Kaiser staff/managers can always edit
      if (isAdmin || isKaiserAssignmentManager || isKaiserStaff) return true;
      const collab = (row as any)?.alftCollaboration || {};
      if (Boolean(collab?.allowAllPartiesEdit)) {
        const editableUids = Array.isArray(collab?.editableUids) ? collab.editableUids.map((x: any) => String(x || '').trim()) : [];
        if (editableUids.includes(uid)) return true;
      }
      const userEmail = String(user?.email || '').toLowerCase();
      const rnEmail = String((row as any)?.alftRnEmail || '').toLowerCase();
      const staffEmail = String((row as any)?.alftStaffEmail || '').toLowerCase();
      const uploaderEmail = String(row.uploaderEmail || '').toLowerCase();
      if (userEmail && [rnEmail, staffEmail, uploaderEmail].includes(userEmail)) return true;
      return [row.uploaderUid, row.alftRnUid, row.alftStaffUid].map((v) => String(v || '').trim()).includes(uid);
    },
    [isAdmin, isKaiserAssignmentManager, isKaiserStaff, user?.uid, user?.email]
  );

  const startWorkflowFromIntake = useCallback(
    async (
      row: AlftAssignmentQueueRow,
      opts?: { skipVerificationCheck?: boolean; overrideRecipientEmail?: string; customEmailBody?: string }
    ) => {
      if (!auth?.currentUser) {
        toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
        return;
      }
      const memberId = String(row.memberId || row.id || '').trim();
      if (!memberId) return;
      const skipVerificationCheck = Boolean(opts?.skipVerificationCheck);
      if (!skipVerificationCheck && !Boolean((row.verificationSignoff as any)?.verified)) {
        toast({
          title: 'Step 1 required',
          description: 'Open the verification tool and check the verification checkbox before sending SW notice.',
          variant: 'destructive',
        });
        return;
      }
      setStartingWorkflowFor(row.memberId || row.id);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const dummyEmail = String(opts?.overrideRecipientEmail || '').trim().toLowerCase();
        const customEmailBody = String(opts?.customEmailBody || '').trim();
        const rowPrefillPurpose = String(row.prefillPurpose || '').trim();
        const prefillPurpose =
          rowPrefillPurpose === 'initial' || rowPrefillPurpose === 'change_condition' || rowPrefillPurpose === 'review'
            ? rowPrefillPurpose
            : '';
        if (!prefillPurpose) {
          toast({
            title: 'Purpose of assessment required',
            description:
              'Set Initial, Change of Condition, or Review in ISP Workflow (step 4) before sending the SW invite.',
            variant: 'destructive',
          });
          return;
        }
        const prefillSourceMode = resolvePrefillSourceMode(row);
        let resolved: Record<string, string> = {};
        let caspioSourceRecord: Record<string, unknown> = {};
        if (prefillSourceMode === 'caspio_selected_fields') {
          const prefillRes = await fetch('/api/alft/prefill/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, memberId }),
            cache: 'no-store',
          });
          const prefillData = (await prefillRes.json().catch(() => ({}))) as any;
          if (!prefillRes.ok || !prefillData?.ok) {
            throw new Error(String(prefillData?.error || `Could not validate required prefill fields (HTTP ${prefillRes.status})`));
          }
          resolved = (prefillData?.resolved || {}) as Record<string, string>;
          caspioSourceRecord =
            prefillData?.source && typeof prefillData.source === 'object'
              ? (prefillData.source as Record<string, unknown>)
              : {};
          const missing = BLOCKING_REQUIRED_PREFILL_FIELDS.filter(
            ({ key }) => !getRequiredValueFromResolvedOrAssignment(row, key, resolved)
          );
          if (missing.length > 0) {
            const shortList = missing.slice(0, 8).map((m) => m.label).join(', ');
            throw new Error(
              `Required prefill fields are missing in Caspio (${missing.length}): ${shortList}${missing.length > 8 ? ', ...' : ''}`
            );
          }
        }
        const pick = (key: string, fallback = '') => String(resolved?.[key] || '').trim() || fallback;
        const pickCity = (key: string, fallback = '') => toTitleCaseCity(pick(key, fallback));
        const ispContactFirst = pick('isp_contact_first', '');
        const ispContactLast = pick('isp_contact_last', '');
        const ispContactNameFromParts = [ispContactFirst, ispContactLast].filter(Boolean).join(' ').trim();
        const responderName = pick('p1_other_responder_name', ispContactNameFromParts || row.ispContactName || '');
        const responderRelationship = pick('p1_other_responder_relationship', row.ispContactRelationship || '');
        const ispContactPhone = pick('isp_contact_phone', row.ispContactPhone || '');
        const ispContactEmail = pick('isp_contact_email', row.ispContactEmail || '');
        const ispContactConfirmDate = pick('isp_contact_confirm_date', row.ispContactConfirmDate || '');
        const responderFlagRaw = pick(
          'p1_other_responder',
          responderName || responderRelationship ? 'yes' : 'no'
        ).toLowerCase();
        const otherResponder = responderFlagRaw === 'yes' ? 'yes' : 'no';
        const res = await fetch('/api/alft/workflow/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            member: {
              id: memberId,
              memberName: pick('p1_member_name', String(row.memberName || '').replace(/\s+\d+$/, '').trim()),
              memberFirstName: pick('p1_first_name', row.memberFirstName || ''),
              memberLastName: pick('p1_last_name', row.memberLastName || ''),
              memberMrn: pick('p1_mrn', row.memberMrn || ''),
              birthDate: pick('p1_dob', row.birthDate || ''),
              memberSex: pick('p1_sex', row.memberSex || ''),
              memberPrimaryLanguage: pick('p1_primary_language', row.memberPrimaryLanguage || ''),
              memberPhone: pick('p1_phone', row.memberPhone || ''),
              ispCurrentAddressStreet: pick('p2_current_street', pick('isp_location_address', '')),
              ispCurrentAddressCity: pickCity('p2_current_city', pick('isp_location_city', '')),
              ispCurrentAddressState: pick('p2_current_state', pick('isp_location_state', '')),
              ispCurrentAddressZip: pick('p2_current_zip', pick('isp_location_zip', '')),
              currentLocationType: pick('p2_current_type', pick('isp_location_type', '')),
              currentLocationTypeOther: pick('p2_current_type_other', pick('isp_location_type', '')),
              assessmentSite: pick('p2_assessment_site', row.assessmentSite || ''),
              homeAddressStreet: pick('p2_home_street', row.homeAddressStreet || ''),
              homeAddressCity: pickCity('p2_home_city', row.homeAddressCity || ''),
              homeAddressState: pick('p2_home_state', row.homeAddressState || ''),
              homeAddressZip: pick('p2_home_zip', row.homeAddressZip || ''),
              ispFacilityName: pick('p2_facility_name', pick('isp_location_name', '')),
              ispCurrentLocation: pick('p2_facility_name', pick('isp_location_name', '')),
              ispContactPhone: ispContactPhone,
              ispContactName: responderName || ispContactNameFromParts || row.ispContactName || '',
              ispContactRelationship: responderRelationship,
              ispContactEmail: ispContactEmail,
              ispContactConfirmDate: ispContactConfirmDate,
              otherResponder,
              otherResponderName: responderName,
              otherResponderRelationship: responderRelationship,
              alftPlanId: pick('p1_plan_id', row.memberMrn || row.alftPlanId || ''),
              prefillSourceMode,
              caspioSourceRecord,
              swId: row.assignedSwId || '',
              socialWorkerAssigned: row.assignedSwName || '',
              assignedSwEmail: row.assignedSwEmail || '',
              ...(prefillPurpose ? { prefillPurpose } : {}),
            },
            customEmailBody: customEmailBody || undefined,
            overrideRecipientEmail: dummyEmail || undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(String(data?.error || `Failed to start workflow (HTTP ${res.status})`));
        }
        const sentTo = String(data?.sw?.swEmail || row.assignedSwEmail || '').trim();
        toast({
          title: 'Workflow notice sent',
          description: dummyEmail
            ? `${row.memberName || 'Member'} invite sent/re-sent to dummy email ${dummyEmail}.`
            : `${row.memberName || 'Member'} invite sent/re-sent to ${sentTo || 'assigned social worker email'}.`,
        });
      } catch (e: any) {
        toast({
          title: 'Could not send SW notice',
          description: e?.message || 'Try again.',
          variant: 'destructive',
        });
      } finally {
        setStartingWorkflowFor('');
      }
    },
    [auth?.currentUser, toast]
  );

  const setVerificationForMember = useCallback(
    async (row: AlftAssignmentQueueRow, checked: boolean) => {
      if (!firestore || !user?.uid) {
        toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
        return;
      }
      const memberId = String(row.memberId || row.id || '').trim();
      if (!memberId) return;
      setVerifyingMemberId(memberId);
      try {
        const actorEmail = toLabel(user.email).toLowerCase() || null;
        const actorName = toLabel((user as any)?.displayName) || actorEmail || user.uid;
        await updateDoc(doc(firestore, 'alft_assignments', memberId), {
          verificationSignoff: checked
            ? {
                verified: true,
                verifiedAt: serverTimestamp(),
                verifiedByUid: user.uid,
                verifiedByEmail: actorEmail,
                verifiedByName: actorName,
              }
            : {
                verified: false,
                verifiedAt: null,
                verifiedByUid: null,
                verifiedByEmail: null,
                verifiedByName: null,
                clearedAt: serverTimestamp(),
                clearedByUid: user.uid,
                clearedByEmail: actorEmail,
                clearedByName: actorName,
              },
          updatedAt: serverTimestamp(),
        });
      } catch (e: any) {
        toast({
          title: 'Could not update verification checkbox',
          description: e?.message || 'Please retry.',
          variant: 'destructive',
        });
      } finally {
        setVerifyingMemberId('');
      }
    },
    [firestore, toast, user]
  );

  const openEdit = useCallback((row: StandaloneUpload) => {
    const seed = createInitialExactAlftAnswers();
    const raw = row?.alftForm?.exactPacketAnswers;
    const merged: Record<string, string | string[]> = { ...seed };
    if (raw && typeof raw === 'object') {
      Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
        if (Array.isArray(v)) merged[k] = v.map((x) => String(x || ''));
        else merged[k] = String(v ?? '');
      });
    }
    // Backward compatibility after renaming the post-med list commentary field.
    if (!String(merged.p13_commentary_section || '').trim() && String((merged as any).p14_post_med_table_commentary || '').trim()) {
      merged.p13_commentary_section = String((merged as any).p14_post_med_table_commentary || '');
    }
    const assignmentRow = findAssignmentForUpload(row);
    const staffName = String((user as any)?.displayName || user?.email || '').trim();
    const applyIfBlank = (key: string, value: unknown) => {
      const nextValue = String(value ?? '').trim();
      if (!nextValue) return;
      const current = String(merged[key] ?? '').trim();
      if (!current) merged[key] = nextValue;
    };
    applyIfBlank('p1_agency', AGENCY_NAME);
    applyIfBlank('p1_member_name', String(row.memberName || '').replace(/\s+\d+$/, '').trim());
    applyIfBlank('p1_mrn', row.medicalRecordNumber || '');
    applyIfBlank('p1_plan_id', row.medicalRecordNumber || '');
    applyIfBlank('p1_assessor_name', assignmentRow?.assignedSwName || row.uploaderName || staffName);
    applyIfBlank('p2_facility_name', row?.alftForm?.facilityName || '');
    {
      const purposeFromPacket = normalizeIspAssessmentPurpose(merged.p1_purpose);
      const purposeFromRow = normalizeIspAssessmentPurpose(
        (row as any)?.prefillPurpose || assignmentRow?.prefillPurpose
      );
      const purpose = purposeFromPacket || purposeFromRow;
      if (purpose) merged.p1_purpose = purpose;
      else merged.p1_purpose = '';
    }
    if (assignmentRow) {
      REQUIRED_PREFILL_FIELDS.forEach(({ key }) => {
        const fromAssignment = getRequiredValueFromAssignmentRow(assignmentRow, key);
        applyIfBlank(key, key === 'p1_dob' ? toMmDdYyyyOrRaw(fromAssignment) : fromAssignment);
      });
      applyIfBlank('p1_plan_id', assignmentRow.memberMrn || assignmentRow.alftPlanId || '');
    }
    const forcedMrn = String(assignmentRow?.memberMrn || row.medicalRecordNumber || '').trim();
    if (forcedMrn) {
      merged.p1_mrn = forcedMrn;
      merged.p1_plan_id = forcedMrn;
    }
    const memberFirst = String(merged.p1_first_name || '').replace(/\s+\d+$/, '').trim();
    const memberLast = String(merged.p1_last_name || '').replace(/\s+\d+$/, '').trim();
    const rawMemberName = String(merged.p1_member_name || '').trim();
    if (memberFirst || memberLast) {
      merged.p1_member_name = `${memberFirst} ${memberLast}`.trim();
    } else if (rawMemberName) {
      if (rawMemberName.includes(',')) {
        const [ln, fn] = rawMemberName
          .split(',', 2)
          .map((part) => String(part || '').replace(/\s+\d+$/, '').trim());
        merged.p1_member_name = `${fn || ''} ${ln || ''}`.trim();
      } else {
        merged.p1_member_name = rawMemberName.replace(/\s+\d+$/, '').trim();
      }
    }
    const rawAssessmentDate = String(merged.p1_assessment_date || '').trim();
    const isoAssessmentDate = rawAssessmentDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoAssessmentDate) {
      merged.p1_assessment_date = `${isoAssessmentDate[2].padStart(2, '0')}-${isoAssessmentDate[3].padStart(2, '0')}-${isoAssessmentDate[1]}`;
    }
    merged.p1_agency = AGENCY_NAME;
    // Reflect actual RN e-sign timestamp on the form (name/license alone do not mean signed).
    const rnSignedIso =
      toIsoTimestamp((row as any)?.alftSignature?.rnSignedAt) ||
      toIsoTimestamp((row as any)?.alftForm?.rnSignedAt) ||
      toIsoTimestamp((row as any)?.alftForm?.exactPacketAnswers?.p14_rn_signed_at) ||
      toIsoTimestamp(merged.p14_rn_signed_at);
    if (rnSignedIso) merged.p14_rn_signed_at = rnSignedIso;
    else merged.p14_rn_signed_at = '';
    const swSignedIso =
      toIsoTimestamp((row as any)?.alftSignature?.mswSignedAt) ||
      toIsoTimestamp((row as any)?.alftForm?.swSignedAt) ||
      toIsoTimestamp(merged.p14_sw_signed_at);
    if (swSignedIso) merged.p14_sw_signed_at = swSignedIso;
    // Prefer RN name/license from signature payload when present.
    const rnName = String((row as any)?.alftSignature?.rnSignedName || merged.p14_rn_print_name || '').trim();
    const rnLicense = String((row as any)?.alftForm?.exactPacketAnswers?.p14_license_number || merged.p14_license_number || '').trim();
    if (rnName) merged.p14_rn_print_name = rnName;
    if (isDefaultAlftRnName(rnName)) merged.p14_license_number = DEFAULT_ALFT_RN_LICENSE_NUMBER;
    else if (rnLicense) merged.p14_license_number = rnLicense;
    const rnTier = String(
      resolveEffectiveRnRecommendedTier(row).tier ||
        (row as any)?.alftRnTierRecommendation?.tier ||
        (row as any)?.alftForm?.exactPacketAnswers?.p14_rn_recommended_tier ||
        merged.p14_rn_recommended_tier ||
        ''
    ).trim();
    if (rnTier) merged.p14_rn_recommended_tier = rnTier;
    const adminTier = String(
      (row as any)?.alftManagerReview?.adminApprovedTier ||
        (row as any)?.alftManagerReview?.rnRecommendedTier ||
        (row as any)?.alftForm?.exactPacketAnswers?.p14_admin_approved_tier ||
        merged.p14_admin_approved_tier ||
        ''
    ).trim();
    if (adminTier) merged.p14_admin_approved_tier = adminTier;
    skipEditAutosaveRef.current = true;
    setEditExactAnswers(
      applyAlftConditionalAnswerGates(
        canonicalizeAlftPacketAnswers(normalizeAlftAnswersCapitalization(merged))
      ) as Record<
        string,
        string | string[]
      >
    );
    setEditTransitionSummary(String(row?.alftForm?.transitionSummary || ''));
    setEditRequestedActions(String(row?.alftForm?.requestedActions || ''));
    setEditBarriersAndRisks(String(row?.alftForm?.barriersAndRisks || ''));
    setEditAdditionalNotes(String(row?.alftForm?.additionalNotes || ''));
    setEditMedListAttachment(
      parseMedListAttachment((row as any)?.alftForm?.medListAttachment) ||
        parseMedListAttachment((assignmentRow as any)?.medListAttachment) ||
        null
    );
    setEditConfirmEdits(false);
    const existingTierRec = (row as any)?.alftRnTierRecommendation || null;
    setEditRnTierAdminReviewed(Boolean(existingTierRec?.adminReviewedAtIso));
    setEditRnTierAdminNotes(String(existingTierRec?.adminNotes || '').trim());
    setEditAutosaveAt(null);
    setEditAutosaveStatus('idle');
    setEditRow(row);
    setEditOpen(true);
  }, [findAssignmentForUpload, user]);

  useEffect(() => {
    if (!editRouteId) return;
    const target = rows.find((r) => r.id === editRouteId);
    if (!target) return;
    if (editRow?.id === target.id && editOpen) return;
    openEdit(target);
  }, [editRouteId, rows, editRow?.id, editOpen, openEdit]);

  // Soft-nav back to the pending list (no ?edit=) must close the editor so list + review
  // never share one page.
  useEffect(() => {
    if (editRouteId) return;
    setEditOpen(false);
    setEditRow(null);
    setEditConfirmEdits(false);
  }, [editRouteId]);

  const sendAssignmentNotification = async (targetUid: string, payload: Record<string, any>) => {
    if (!firestore) return;
    const uid = String(targetUid || '').trim();
    if (!uid) return;
    try {
      await addDoc(collection(firestore, 'staff_notifications'), {
        userId: uid,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        priority: 'Priority',
        status: 'Open',
        isRead: false,
        timestamp: serverTimestamp(),
        actionUrl: payload.actionUrl,
        standaloneUploadId: payload.standaloneUploadId,
        memberName: payload.memberName,
        healthPlan: payload.healthPlan,
        memberClientId: payload.memberClientId,
        createdBy: user?.uid || null,
        createdByName: (user as any)?.displayName || (user as any)?.email || 'Staff',
        senderName: (user as any)?.displayName || (user as any)?.email || 'Staff',
        senderId: user?.uid || null,
        followUpRequired: Boolean(payload.followUpRequired),
        followUpDate: payload.followUpDate || null,
      });
    } catch (e) {
      console.warn('Failed to send assignment notification:', e);
    }
  };

  const saveAssignment = async () => {
    if (!firestore || !assignRow) return;
    const selected = staffOptions.find((s) => s.uid === assignUid);
    if (!selected) {
      toast({ title: 'Select a staff member', description: 'Choose who to assign this ALFT to.', variant: 'destructive' });
      return;
    }
    try {
      const base = {
        updatedAt: serverTimestamp(),
      } as Record<string, any>;
      const patch =
        assignKind === 'rn'
          ? {
              ...base,
              alftRnUid: selected.uid,
              alftRnName: selected.label,
              alftRnEmail: selected.email,
              alftRnAssignedAt: serverTimestamp(),
              'alftCollaboration.allowAllPartiesEdit': true,
              'alftCollaboration.editableRoleKeys': ['social_worker', 'staff', 'rn', 'admin', 'super_admin'],
              'alftCollaboration.editableUids': arrayUnion(selected.uid),
              'alftCollaboration.updatedAt': serverTimestamp(),
            }
          : {
              ...base,
              alftStaffUid: selected.uid,
              alftStaffName: selected.label,
              alftStaffEmail: selected.email,
              alftStaffAssignedAt: serverTimestamp(),
              'alftCollaboration.allowAllPartiesEdit': true,
              'alftCollaboration.editableRoleKeys': ['social_worker', 'staff', 'rn', 'admin', 'super_admin'],
              'alftCollaboration.editableUids': arrayUnion(selected.uid),
              'alftCollaboration.updatedAt': serverTimestamp(),
            };
      await updateDoc(doc(firestore, 'standalone_upload_submissions', assignRow.id), patch);

      await sendAssignmentNotification(selected.uid, {
        title: assignKind === 'rn' ? 'ALFT assigned (RN)' : 'ALFT assigned (Staff review)',
        message: `${assignRow.memberName || 'Member'} • MRN ${assignRow.medicalRecordNumber || '—'}\nUploaded by: ${
          assignRow.uploaderName || assignRow.uploaderEmail || 'Social Worker'
        }`,
        type: 'alft_assigned',
        actionUrl: `/admin/alft-tracker?focus=${encodeURIComponent(assignRow.id)}`,
        standaloneUploadId: assignRow.id,
        memberName: assignRow.memberName,
        healthPlan: assignRow.healthPlan || '',
        memberClientId: assignRow.medicalRecordNumber || '',
      });

      toast({
        title: 'Assigned',
        description: `${assignKind === 'rn' ? 'RN' : 'Staff'} assigned and notified via Electron/My Notifications.`,
      });
      setAssignOpen(false);
      setAssignRow(null);
    } catch (e: any) {
      toast({ title: 'Assignment failed', description: e?.message || 'Could not save assignment.', variant: 'destructive' });
    }
  };

  const uploadRevision = async () => {
    if (!revRow || !firestore || !storage) return;
    if (!revFile) {
      toast({ title: 'Select a file', description: 'Choose the revised ALFT file to upload.', variant: 'destructive' });
      return;
    }
    if (revUploading) return;
    setRevUploading(true);
    setRevProgress(0);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const safeName = revFile.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
      const storagePath = `admin_uploads/alft-revisions/${revRow.id}/${ts}_${safeName}`;
      const storageRef = ref(storage, storagePath);

      const uploaded = await new Promise<{ downloadURL: string }>((resolve, reject) => {
        const task = uploadBytesResumable(storageRef, revFile);
        task.on(
          'state_changed',
          (snap) => {
            const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
            setRevProgress(Math.max(1, Math.min(99, Math.round(pct))));
          },
          (err) => reject(err),
          async () => {
            const downloadURL = await getDownloadURL(task.snapshot.ref);
            resolve({ downloadURL });
          }
        );
      });

      const revision = {
        fileName: revFile.name,
        downloadURL: uploaded.downloadURL,
        storagePath,
        uploadedByName: toLabel((user as any)?.displayName) || null,
        uploadedByEmail: toLabel((user as any)?.email) || null,
        uploadedAt: serverTimestamp(),
        note: toLabel(revNote) || null,
      };

      await updateDoc(doc(firestore, 'standalone_upload_submissions', revRow.id), {
        alftRevisions: arrayUnion(revision as any),
        alftRnRevisionUploadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);

      toast({ title: 'Revision uploaded', description: 'Saved revised file and refreshed timestamps for notifications.' });
      setRevOpen(false);
      setRevRow(null);
    } catch (e: any) {
      console.error('ALFT revision upload failed:', e);
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload revision.', variant: 'destructive' });
    } finally {
      setRevUploading(false);
      setRevProgress(0);
    }
  };

  const uploadSwPortalSupportFile = async (row: AlftAssignmentQueueRow) => {
    if (!row || !firestore || !storage) return;
    if (!swSupportUploadFiles.length) {
      toast({ title: 'Select files', description: 'Choose one or more support files to upload (e.g., 602, facesheet).', variant: 'destructive' });
      return;
    }
    if (swSupportUploading) return;
    const memberKey = String(row.memberId || row.id || '').trim();
    if (!memberKey) {
      toast({ title: 'Missing member', description: 'Could not resolve assignment member ID.', variant: 'destructive' });
      return;
    }
    setSwSupportUploading(true);
    setSwSupportUploadProgress(0);
    try {
      const uploadedSupportFiles: Array<Record<string, unknown>> = [];
      const totalFiles = swSupportUploadFiles.length;
      for (let index = 0; index < swSupportUploadFiles.length; index += 1) {
        const file = swSupportUploadFiles[index];
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = file.name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_').slice(0, 160);
        const storagePath = `admin_uploads/alft-sw-portal-support/${memberKey}/${ts}_${safeName}`;
        const storageRef = ref(storage, storagePath);

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
                    label: toLabel(swSupportUploadLabel) || '',
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
              setSwSupportUploadProgress(Math.max(1, Math.min(99, Math.round(overall))));
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
          label: toLabel(swSupportUploadLabel) || null,
          fileName: file.name,
          downloadURL: uploaded.downloadURL,
          storagePath,
          uploadedAtIso: new Date().toISOString(),
          uploadedByName: toLabel((user as any)?.displayName) || null,
          uploadedByEmail: toLabel((user as any)?.email) || null,
        });
      }

      await updateDoc(doc(firestore, 'alft_assignments', memberKey), {
        swPortalSupportFiles: arrayUnion(...(uploadedSupportFiles as any[])),
        updatedAt: serverTimestamp(),
      } as any);

      try {
        const idToken = await auth.currentUser?.getIdToken?.();
        if (idToken) {
          await fetch('/api/alft/clinical-files-notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              memberId: memberKey,
              swEmail: toLabel(row.assignedSwEmail) || undefined,
              swName: toLabel(row.assignedSwName) || undefined,
              files: uploadedSupportFiles.map((file) => ({
                fileName: file.fileName,
                label: file.label,
              })),
            }),
          });
        }
      } catch (notifyError) {
        console.warn('Clinical file notify error:', notifyError);
      }

      toast({
        title: uploadedSupportFiles.length > 1 ? 'Support files uploaded' : 'Support file uploaded',
        description: 'These files are now visible to the social worker. Note sent when SW email is on file.',
      });
      setSwSupportUploadFiles([]);
      setSwSupportUploadLabel('');
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Could not upload support file.', variant: 'destructive' });
    } finally {
      setSwSupportUploading(false);
      setSwSupportUploadProgress(0);
    }
  };

  const markSentForSignature = (row: StandaloneUpload) => {
    if (!requireEditConfirm('approving to RN')) return;
    if (managerActionsOnly) {
      setApprovePreviewRow(row);
      setApprovePreviewOpen(true);
      return;
    }
    void requestSignatures(row);
  };

  const confirmApproveToRn = async () => {
    if (!approvePreviewRow) return;
    if (!requireEditConfirm('approving to RN')) return;
    setApprovePreviewOpen(false);
    await requestSignatures(approvePreviewRow);
    setApprovePreviewRow(null);
    setEditConfirmEdits(false);
  };

  const saveEdit = async (opts?: { silent?: boolean }): Promise<boolean> => {
    if (!editRow) return false;
    if (!auth?.currentUser) {
      if (!opts?.silent) {
        toast({ title: 'Not signed in', description: 'Please sign in again to save ALFT edits.', variant: 'destructive' });
      }
      return false;
    }
    // Wait briefly if another save/autosave is in flight so Approve isn't blocked forever.
    if (editSavingRef.current) {
      for (let i = 0; i < 40 && editSavingRef.current; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
      if (editSavingRef.current) {
        if (!opts?.silent) {
          toast({
            variant: 'destructive',
            title: 'Save still in progress',
            description: 'Wait a moment for autosave to finish, then try Approved and download again.',
          });
        }
        return false;
      }
    }
    const summary =
      String(editTransitionSummary || '').trim() ||
      String((editExactAnswers as any)?.p13_commentary_section || '').trim() ||
      'ALFT form updated by Kaiser staff.';
    const actions =
      String(editRequestedActions || '').trim() ||
      'Review digital ALFT form. RN (Leslie) adds comments/signature, John completes final review, then the packet is sent/printed to Jocelyn.';
    try {
      editSavingRef.current = true;
      setEditSaving(true);
      if (opts?.silent) setEditAutosaveStatus('saving');
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: editRow.id,
          exactPacketAnswers: { ...editExactAnswers, p1_agency: AGENCY_NAME },
          transitionSummary: summary,
          requestedActions: actions,
          barriersAndRisks: String(editBarriersAndRisks || '').trim() || null,
          additionalNotes: String(editAdditionalNotes || '').trim() || null,
          medListAttachment: editMedListAttachment || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Save failed (HTTP ${res.status})`));
      }
      setEditAutosaveAt(new Date().toISOString());
      setEditAutosaveStatus('saved');
      if (!opts?.silent) {
        toast({
          title: 'ALFT form updated',
          description: 'Changes saved to Firestore.',
        });
      }
      return true;
    } catch (e: any) {
      setEditAutosaveStatus('error');
      if (!opts?.silent) {
        toast({ title: 'Could not save ALFT form', description: e?.message || 'Save failed.', variant: 'destructive' });
      }
      return false;
    } finally {
      editSavingRef.current = false;
      setEditSaving(false);
    }
  };

  // Keep admin/RN edit progress synced to Firestore so it appears on any device.
  useEffect(() => {
    if (!editOpen || !editRow?.id) return;
    if (skipEditAutosaveRef.current) {
      skipEditAutosaveRef.current = false;
      return;
    }
    if (editAutosaveTimerRef.current) clearTimeout(editAutosaveTimerRef.current);
    editAutosaveTimerRef.current = setTimeout(() => {
      void saveEdit({ silent: true });
    }, 2000);
    return () => {
      if (editAutosaveTimerRef.current) clearTimeout(editAutosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editOpen,
    editRow?.id,
    editExactAnswers,
    editMedListAttachment,
    editTransitionSummary,
    editRequestedActions,
    editBarriersAndRisks,
    editAdditionalNotes,
  ]);

  const sendCompletedToJh = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || sendingCompletedId) return;
    setSendingCompletedId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/send-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: row.id,
          overrideRecipientEmail: String(dummySendCompletedEmail || '').trim().toLowerCase() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Send failed (HTTP ${res.status})`));
      toast({ title: 'Completed ALFT emailed', description: `Sent to ${String(data?.to || 'jocelyn@ilshealth.com')}.` });
      setSendConfirmOpen(false);
      setSendConfirmChecked(false);
      setSendConfirmRow(null);
    } catch (e: any) {
      toast({ title: 'Could not send completed email', description: e?.message || 'Send failed.', variant: 'destructive' });
    } finally {
      setSendingCompletedId('');
    }
  };

  const openSendConfirm = (row: StandaloneUpload) => {
    setSendConfirmRow(row);
    setSendConfirmChecked(false);
    setSendConfirmOpen(true);
  };

  const requireEditConfirm = (actionLabel = 'the next step') => {
    if (editConfirmEdits) return true;
    toast({
      title: 'Confirm edits required',
      description: `Check “I confirm these edits” at the bottom before ${actionLabel}.`,
      variant: 'destructive',
    });
    return false;
  };

  const markManagerFinalReview = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || managerReviewingId) return;
    if (!requireEditConfirm('final manager approval')) return;
    const liveRow = rows.find((r) => r.id === row.id) || row;
    const tierRec = (liveRow as any)?.alftRnTierRecommendation;
    const resolvedTier = resolveEffectiveRnRecommendedTier(liveRow);
    const effectiveTier = String(resolvedTier.tier || tierRec?.tier || '').trim();
    if (!effectiveTier) {
      toast({
        title: 'RN tier recommendation required',
        description: isAlftRnAdminOverride(liveRow)
          ? 'With RN override, set Tier 1–5 in the RN section (or ensure SW recommended a tier), save, then approve.'
          : 'RN must recommend a tier before final approval.',
        variant: 'destructive',
      });
      return;
    }
    if (
      !editRnTierAdminReviewed &&
      !String(tierRec?.adminReviewedAtIso || '').trim() &&
      !isAlftRnAdminOverride(liveRow)
    ) {
      toast({
        title: 'Review RN tier recommendation',
        description: 'Confirm you reviewed the RN recommended tier (needed for tier-level request).',
        variant: 'destructive',
      });
      return;
    }
    setManagerReviewingId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: row.id,
          rnTierAdminReviewed: true,
          rnTierAdminNotes: String(editRnTierAdminNotes || '').trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Final review failed (HTTP ${res.status})`));
      toast({
        title: 'Final review complete',
        description: `RN Tier ${effectiveTier} reviewed. Ready for tier-level request and send to Jocelyn.`,
      });
      setEditConfirmEdits(false);
    } catch (e: any) {
      toast({ title: 'Could not complete manager review', description: e?.message || 'Review failed.', variant: 'destructive' });
    } finally {
      setManagerReviewingId('');
    }
  };

  const routeToCsManagerFinalReview = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || routingToFinalManagerId) return;
    if (!requireEditConfirm('routing to CS Manager')) return;
    setRoutingToFinalManagerId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/route-to-final-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: row.id,
          overrideRecipientEmail: String(dummySendManagerEmail || '').trim().toLowerCase() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Route failed (HTTP ${res.status})`));
      }
      toast({
        title: 'Routed to John final review',
        description: 'This ALFT is now awaiting John for final review.',
      });
      setEditConfirmEdits(false);
    } catch (e: any) {
      toast({
        title: 'Could not route to John',
        description: e?.message || 'Route failed.',
        variant: 'destructive',
      });
    } finally {
      setRoutingToFinalManagerId('');
    }
  };

  const requestSignatures = async (
    row: StandaloneUpload,
    opts?: { isResend?: boolean; resendNote?: string }
  ) => {
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    if (!row?.id) return;
    const assignmentRow = findAssignmentForUpload(row);
    const mswEmail =
      String(row.uploaderEmail || '').trim() ||
      String(assignmentRow?.assignedSwEmail || '').trim() ||
      '';
    if (!mswEmail) {
      toast({
        title: 'Missing MSW email',
        description: 'This intake is missing the social worker email needed to route the packet.',
        variant: 'destructive',
      });
      return;
    }
    if (opts?.isResend && !String(opts?.resendNote || '').trim()) {
      toast({
        title: 'Resend note required',
        description: 'Explain why you are resending this packet to RN before continuing.',
        variant: 'destructive',
      });
      return;
    }
    if (sigRequestingId) return;
    setSigRequestingId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: row.id,
          forceDefaultRn: true,
          overrideRnEmail: String(dummySendRnEmail || '').trim().toLowerCase() || undefined,
          overrideRnName: String(dummySendRnEmail || '').trim() ? 'Dummy Recipient' : undefined,
          isResend: Boolean(opts?.isResend),
          resendNote: String(opts?.resendNote || '').trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Request failed (HTTP ${res.status})`));
      }
      const requestId = String(data?.requestId || '').trim();
      const rnSignUrl = String(data?.rn?.signUrl || '').trim();
      const mswSignUrl = String(data?.msw?.signUrl || '').trim();
      setSigDialog({
        intakeId: row.id,
        requestId,
        rnSignUrl,
        mswSignUrl,
        rnEmailSent: Boolean(data?.rn?.emailSent),
        mswEmailSent: Boolean(data?.msw?.emailSent),
      });
      setSigDialogOpen(true);
      toast({
        title: opts?.isResend ? 'Re-sent to RN' : 'Signature request sent',
        description: opts?.isResend
          ? `Leslie was re-notified with your note. RN email: ${data?.rn?.emailSent ? 'sent' : 'not sent'}.`
          : `Pre-review complete. Next: ${String(data?.rnRecipient?.name || 'RN')} updates/signs, then John final review, then send step. RN email to ${String(data?.rnRecipient?.email || 'configured RN')}: ${data?.rn?.emailSent ? 'sent' : 'not sent'} • MSW email: ${data?.testMode ? 'skipped (test mode)' : data?.msw?.emailSent ? 'sent' : 'not sent'}`,
      });
      if (managerActionsOnly) {
        window.setTimeout(() => {
          window.location.assign('/admin/alft-tracker?managerActions=1');
        }, 1200);
      }
    } catch (e: any) {
      toast({ title: 'Could not request signatures', description: e?.message || 'Request failed.', variant: 'destructive' });
    } finally {
      setSigRequestingId('');
    }
  };

  const openResendSwPreviewFromEdit = (row: StandaloneUpload) => {
    const assignmentRow = findAssignmentForUpload(row);
    if (!assignmentRow) {
      toast({
        title: 'SW assignment not found',
        description: 'This intake is missing an ALFT assignment row, so SW email cannot be resent from this view.',
        variant: 'destructive',
      });
      return;
    }
    setSwEmailPreviewRow(assignmentRow);
    setSwEmailPreviewUseTestOverride(false);
    setSwEmailPreviewTestEmail('');
    setSwEmailPreviewEditableBody('');
    setSwEmailPreviewOpen(true);
  };

  const openResendRnDialog = (row: StandaloneUpload) => {
    if (!requireEditConfirm('resending to RN')) return;
    setResendRnRow(row);
    setResendRnNote('');
    setResendRnDialogOpen(true);
  };

  const confirmResendRn = async () => {
    if (!resendRnRow?.id) return;
    const note = String(resendRnNote || '').trim();
    if (!note) {
      toast({
        title: 'Resend note required',
        description: 'Enter why you are resending this ALFT to the RN before continuing.',
        variant: 'destructive',
      });
      return;
    }
    setConfirmResendRnSendOpen(true);
  };

  const executeConfirmedResendRn = async () => {
    if (!resendRnRow?.id) return;
    const note = String(resendRnNote || '').trim();
    if (!note) return;
    setConfirmResendRnSendOpen(false);
    setResendRnDialogOpen(false);
    await requestSignatures(resendRnRow, { isResend: true, resendNote: note });
    setResendRnRow(null);
    setResendRnNote('');
  };

  const executeConfirmedResendSw = async () => {
    if (!swPreviewActionRow) return;
    setConfirmResendSwSendOpen(false);
    await startWorkflowFromIntake(swPreviewActionRow, {
      customEmailBody: swEmailPreviewRenderedBody,
      overrideRecipientEmail: swEmailPreviewUseTestOverride ? swEmailPreviewTestEmail : undefined,
    });
  };

  const resendLeslieFromEdit = (row: StandaloneUpload) => {
    openResendRnDialog(row);
  };

  const openRejectToSw = (row: StandaloneUpload) => {
    if (!requireEditConfirm('returning for edits')) return;
    setRejectRow(row);
    setRejectReason('');
    setRejectTarget('sw');
    setRejectDialogOpen(true);
  };

  const returnForEdits = async () => {
    if (!auth?.currentUser || !rejectRow?.id) return;
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      toast({
        title: 'Reason required',
        description: 'Please enter why this ALFT is being returned for edits.',
        variant: 'destructive',
      });
      return;
    }
    setRejectingId(rejectRow.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (rejectTarget === 'sw') {
        const res = await fetch('/api/alft/workflow/reject-to-sw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, intakeId: rejectRow.id, reason }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) throw new Error(String(data?.error || `Reject failed (HTTP ${res.status})`));
        toast({
          title: 'Returned to SW for resubmission',
          description: data?.swEmailSent
            ? 'Email sent. SW can edit and resubmit — not marked completed.'
            : 'Returned to SW. No SW email on file was found to send; check assignment contact.',
        });
      } else {
        const res = await fetch('/api/alft/workflow/return-for-edits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, intakeId: rejectRow.id, target: rejectTarget, reason }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) throw new Error(String(data?.error || `Return failed (HTTP ${res.status})`));
        toast({
          title: rejectTarget === 'staff' ? 'Returned to admin/staff for edits' : 'Returned to RN for edits',
          description:
            rejectTarget === 'staff'
              ? 'Staff can open and edit this packet — not marked completed.'
              : 'RN can edit and re-sign — not marked completed.',
        });
      }
      setRejectDialogOpen(false);
      setRejectRow(null);
      setRejectReason('');
      setRejectTarget('sw');
      setEditConfirmEdits(false);
      if (managerActionsOnly) {
        window.location.assign('/admin/alft-tracker?managerActions=1');
      } else if (rnActionsOnly) {
        window.location.assign('/admin/alft-tracker?rnActions=1');
      }
    } catch (e: any) {
      toast({
        title: 'Could not return for edits',
        description: e?.message || 'Return failed.',
        variant: 'destructive',
      });
    } finally {
      setRejectingId('');
    }
  };

  const removeMemberFromTracker = async (row: StandaloneUpload) => {
    if (!firestore || !row?.id || removingFromTrackerId) return;
    const proceed = await appConfirm(
      `Remove ${toLabel(row.memberName) || 'this member'} from ALFT Tracker list? You can still find the record in ALFT Log.`
    );
    if (!proceed) return;
    setRemovingFromTrackerId(row.id);
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', row.id), {
        status: 'removed',
        workflowStatus: 'removed_from_tracker',
        removedFromTrackerAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Member removed from tracker',
        description: 'This member was removed from ALFT Tracker active list.',
      });
      if (focusId === row.id) setFocusId('');
      if (expandedMemberId === row.id) setExpandedMemberId('');
    } catch (e: any) {
      toast({
        title: 'Could not remove member',
        description: e?.message || 'Update failed.',
        variant: 'destructive',
      });
    } finally {
      setRemovingFromTrackerId('');
    }
  };

  const openLiveAlftPrintable = async (opts?: { requireUnlock?: boolean }) => {
    if (!editRow?.id) return;
    const requireUnlock = opts?.requireUnlock !== false;
    if (requireUnlock && !alftPrintDownloadUnlocked(editRowLive || editRow)) {
      toast({
        title: 'Print / download locked',
        description: 'Available only after RN final review and admin final check (Final / Download step).',
        variant: 'destructive',
      });
      return;
    }
    // Persist latest edits first so printable never falls back to an old archived PDF.
    await saveEdit({ silent: true }).catch(() => false);
    const answersKey = `alft-print-${editRow.id}-${Date.now()}`;
    try {
      const payload = { ...editExactAnswers, p1_agency: AGENCY_NAME };
      const serialized = JSON.stringify(payload);
      window.localStorage.setItem(answersKey, serialized);
      window.sessionStorage.setItem(answersKey, serialized);
    } catch {
      // dummy-preview falls back to saved intake (just saved above)
    }
    const params = new URLSearchParams();
    params.set('view', 'print');
    params.set('intakeId', editRow.id);
    params.set('answersKey', answersKey);
    params.set('returnTo', `/admin/alft-tracker?edit=${encodeURIComponent(editRow.id)}`);
    const href = `/admin/alft-tracker/dummy-preview?${params.toString()}`;
    window.location.assign(href);
  };

  /** Rebuild+download ALFT packet in a hidden iframe — stay on the tracker page (no viewer). */
  const downloadAlftPacketSilent = useCallback(
    async (
      intakeId: string,
      opts?: {
        archivedAtIso?: string;
        /** Live editor answers — preferred over Firestore so downloads never use a stale snapshot. */
        answers?: Record<string, string | string[]>;
      }
    ) => {
    // Parent already authenticated — hand the iframe a short-lived token so archive
    // does not wait on Firebase hydration (and cannot bounce the parent to login).
    const tokenKey = `alft-silent-dl-token:${intakeId}`;
    const answersKey = `alft-silent-dl-answers:${intakeId}:${Date.now()}`;
    const stableAnswersKey = `alft-live-answers:${intakeId}`;
    const liveAnswersPayload =
      opts?.answers && typeof opts.answers === 'object'
        ? { ...opts.answers, p1_agency: AGENCY_NAME }
        : null;
    try {
      const idToken = await auth?.currentUser?.getIdToken();
      if (idToken) {
        window.sessionStorage.setItem(tokenKey, idToken);
      }
    } catch {
      // iframe may still pick up auth.currentUser
    }
    if (liveAnswersPayload) {
      try {
        const serialized = JSON.stringify(liveAnswersPayload);
        // Unique + stable keys. Do not rely on child deleting these (Strict Mode remount).
        window.sessionStorage.setItem(answersKey, serialized);
        window.localStorage.setItem(answersKey, serialized);
        window.sessionStorage.setItem(stableAnswersKey, serialized);
        window.localStorage.setItem(stableAnswersKey, serialized);
        // Most reliable: same-origin iframe reads this from window.parent directly.
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
        if (!logId || !auth?.currentUser) return;
        const idToken = await auth.currentUser.getIdToken();
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
          reject(
            new Error(
              'Download timed out after 90 seconds. Refresh the page and try Approved and download again.'
            )
          )
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
  },
    [auth?.currentUser]
  );

  const applyCompletedDownloadMeta = useCallback(
    (intakeId: string, meta: { downloadName: string; logId?: string; downloadedAtIso: string }) => {
      const fileName = meta.downloadName.endsWith('.pdf') ? meta.downloadName : `${meta.downloadName}.pdf`;
      const baseName = fileName.replace(/\.pdf$/i, '');
      const patch = {
        alftStaffDownloadedAt: meta.downloadedAtIso,
        alftLastDownloadName: baseName,
        alftLastDownloadFileName: fileName,
        ...(meta.logId ? { alftLastDownloadLogId: meta.logId } : {}),
      };
      setRows((prev) =>
        prev.map((r) => (r.id === intakeId ? ({ ...r, ...patch } as StandaloneUpload) : r))
      );
      setEditRow((prev) => (prev?.id === intakeId ? ({ ...prev, ...patch } as StandaloneUpload) : prev));
    },
    []
  );

  const approvedAndDownload = async (opts?: {
    archivedAtIso?: string;
    answers?: Record<string, string | string[]>;
  }) => {
    const row = editRowLive || editRow;
    if (!row?.id || !auth?.currentUser) return;
    if (!editConfirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check the confirmation box before Approved and download.',
      });
      return;
    }
    const saved = await saveEdit({ silent: false });
    if (!saved) return;

    // If RN already signed but admin final approval is not done yet, do final review then download.
    let unlockedRow = row;
    const canApproveTierNow =
      canRunManagerWorkflow &&
      hasRnElectronicallySigned(row) &&
      String((row as any)?.alftManagerReview?.status || '').toLowerCase() !== 'approved';
    if (!alftPrintDownloadUnlocked(row) && canApproveTierNow) {
      const tierRec = (row as any)?.alftRnTierRecommendation;
      const resolvedTier = resolveEffectiveRnRecommendedTier(row);
      const hasTier = Boolean(String(resolvedTier.tier || tierRec?.tier || '').trim());
      const tierReviewed =
        editRnTierAdminReviewed ||
        Boolean(String(tierRec?.adminReviewedAtIso || '').trim()) ||
        isAlftRnAdminOverride(row);
      if (!hasTier) {
        toast({
          title: 'RN recommended tier required',
          description: isAlftRnAdminOverride(row)
            ? 'RN override is on — set Tier 1–5 (or use the SW recommended tier), save edits, then approve tier + download.'
            : 'Wait for the assigned RN to recommend a tier, then approve tier + download.',
          variant: 'destructive',
        });
        return;
      }
      if (!tierReviewed) {
        toast({
          title: 'Review RN tier first',
          description: 'At the bottom, check “I reviewed the RN recommended tier”, then click Approve tier + download again.',
          variant: 'destructive',
        });
        return;
      }
      try {
        const idToken = await auth.currentUser.getIdToken();
        const fr = await fetch('/api/alft/workflow/final-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            intakeId: row.id,
            rnTierAdminReviewed: true,
            rnTierAdminNotes: String(editRnTierAdminNotes || '').trim() || null,
          }),
        });
        const frData = (await fr.json().catch(() => ({}))) as any;
        if (!fr.ok || !frData?.success) {
          throw new Error(String(frData?.error || `Final review failed (HTTP ${fr.status})`));
        }
        unlockedRow = {
          ...row,
          alftManagerReview: {
            ...((row as any)?.alftManagerReview || {}),
            status: 'approved',
            rnRecommendedTier: String(resolvedTier.tier || tierRec?.tier || '').trim(),
            adminApprovedTier: String(resolvedTier.tier || tierRec?.tier || '').trim(),
            reviewedByName: user?.displayName || user?.email || null,
          },
          workflowStatus: 'manager_review_complete_ready_to_send',
        } as any;
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'Could not complete final approval',
          description: e?.message || 'Approve tier first, then download.',
        });
        return;
      }
    }

    if (!alftPrintDownloadUnlocked(unlockedRow)) {
      toast({
        title: 'Saved — download not ready yet',
        description:
          '1) RN must electronically sign with a recommended tier. 2) Check RN tier review + Final manager approval (or use this button once those are ready). 3) Then Approved and download unlocks.',
      });
      return;
    }

    const versionAtIso = String(opts?.archivedAtIso || '').trim() || new Date().toISOString();
    const answersForPdf = opts?.answers || { ...editExactAnswers, p1_agency: AGENCY_NAME };
    setPacketDownloading(true);
    try {
      toast({
        title: 'Preparing download…',
        description: 'Building the completed ISP packet from your latest edits. Stay on this page.',
      });
      const result = await downloadAlftPacketSilent(row.id, {
        archivedAtIso: versionAtIso,
        answers: answersForPdf,
      });
      applyCompletedDownloadMeta(row.id, result);
      toast({
        title: 'Downloaded and archived',
        description: `${result.downloadName} saved on ISP Download Archive. Open the file on your computer to review.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not download packet',
        description: e?.message || 'Could not download the completed ALFT file.',
      });
    } finally {
      setPacketDownloading(false);
    }
  };

  /** View last archived packet, or rebuild+download and update ISP Download Archive. */
  const downloadCompletedFormFromLog = async (opts?: {
    view?: boolean;
    archivedAtIso?: string;
    answers?: Record<string, string | string[]>;
  }) => {
    const row = editRowLive || editRow;
    if (!row?.id || !auth?.currentUser) {
      toast({
        variant: 'destructive',
        title: 'Completed form not linked yet',
        description: 'Use Approved and download once to create and keep the completed file on ISP Download Archive.',
      });
      return;
    }

    // Download path: rebuild from current HTML so layout fixes apply, then re-archive.
    if (!opts?.view) {
      if (!alftPrintDownloadUnlocked(row)) {
        toast({
          variant: 'destructive',
          title: 'Download not unlocked',
          description: 'Complete RN sign and final approval first, then use Download completed file.',
        });
        return;
      }
      const saved = await saveEdit({ silent: false });
      if (!saved) return;
      const versionAtIso = String(opts?.archivedAtIso || '').trim() || new Date().toISOString();
      const answersForPdf = opts?.answers || { ...editExactAnswers, p1_agency: AGENCY_NAME };
      setPacketDownloading(true);
      try {
        toast({
          title: 'Preparing download…',
          description: 'Building the completed ISP packet from your latest edits. Stay on this page.',
        });
        const result = await downloadAlftPacketSilent(row.id, {
          archivedAtIso: versionAtIso,
          answers: answersForPdf,
        });
        applyCompletedDownloadMeta(row.id, result);
        toast({
          title: 'Downloaded and archived',
          description: `${result.downloadName} saved on ISP Download Archive. Open the file on your computer to review.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'Could not download completed form',
          description: e?.message || 'Try Approved and download to restore the ISP Download Archive link.',
        });
      } finally {
        setPacketDownloading(false);
      }
      return;
    }

    const logId = String((row as any)?.alftLastDownloadLogId || '').trim();
    if (!logId) {
      toast({
        variant: 'destructive',
        title: 'Completed form not linked yet',
        description: 'Use Approved and download once to create and keep the completed file on ISP Download Archive.',
      });
      return;
    }
    setEditSaving(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/alft/download-log?logId=${encodeURIComponent(logId)}&format=file`, {
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(String(body?.error || 'Completed form file not found on ISP Download Archive.'));
      }
      const blob = await res.blob();
      const headerName = String(res.headers.get('X-Download-Name') || '').trim();
      const fileBase =
        headerName ||
        String((row as any)?.alftLastDownloadName || '').trim() ||
        String((row as any)?.alftLastDownloadFileName || '')
          .trim()
          .replace(/\.pdf$/i, '') ||
        'ISP';
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast({
        title: 'Opened last archived form',
        description: `${fileBase.replace(/\.pdf$/i, '')}.pdf — use Download to rebuild with current layout.`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not open completed form',
        description: e?.message || 'Try Download completed file to rebuild and restore the ISP Download Archive link.',
      });
    } finally {
      setEditSaving(false);
    }
  };

  /** RN-only: save edits, then sign + return to admin with suggested tier (no download / reject). */
  const submitRnWithSuggestedTier = async () => {
    if (!editRowLive?.id || !auth?.currentUser) return;
    if (!editConfirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check the confirmation box before submitting with your suggested tier.',
      });
      return;
    }
    if (Boolean(editRowLive?.alftSignature?.rnSignedAt)) {
      toast({
        title: 'Already submitted',
        description: 'This packet was already signed and returned to admin.',
      });
      return;
    }
    if (!isAlftTierOption(rnSuggestedTier)) {
      toast({
        variant: 'destructive',
        title: 'Suggested tier required',
        description: 'Select Tier 1–5 before returning this to admin.',
      });
      return;
    }
    const signedName = String(rnSignName || '').trim();
    const licenseNumber = String(rnSignLicense || '').trim();
    if (!signedName) {
      toast({ variant: 'destructive', title: 'Printed name required' });
      return;
    }
    if (!licenseNumber) {
      toast({ variant: 'destructive', title: 'License number required' });
      return;
    }
    if (!rnSignConsent) {
      toast({ variant: 'destructive', title: 'Consent required', description: 'Check the attestation box to sign.' });
      return;
    }

    const signaturePngDataUrl = createTypedSignaturePngDataUrl(signedName);
    if (!signaturePngDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Signature required',
        description: 'Enter your printed name for the electronic signature.',
      });
      return;
    }

    setRnOpeningSignLink(true);
    try {
      const saved = await saveEdit({ silent: true });
      if (!saved) {
        toast({
          variant: 'destructive',
          title: 'Could not save edits',
          description: 'Fix save errors, then try again.',
        });
        return;
      }
      const idToken = await auth.currentUser.getIdToken();
      const linkRes = await fetch('/api/alft/signatures/rn-open-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: editRowLive.id }),
      });
      const linkData = (await linkRes.json().catch(() => ({}))) as any;
      const token = String(linkData?.token || '').trim();
      if (!linkRes.ok || !linkData?.success || !token) {
        throw new Error(String(linkData?.error || 'Could not open RN signature session.'));
      }

      const signRes = await fetch('/api/alft/signatures/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          token,
          signedName,
          licenseNumber,
          signaturePngDataUrl,
          consent: true,
          rnTierRecommendation: {
            tier: rnSuggestedTier,
            justification: '',
          },
        }),
      });
      const signData = (await signRes.json().catch(() => ({}))) as any;
      if (!signRes.ok || !signData?.success) {
        throw new Error(String(signData?.error || 'Could not submit RN signature.'));
      }

      toast({
        title: 'Returned to admin',
        description: 'Signed and sent back with suggested Tier ' + rnSuggestedTier + '.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      setEditConfirmEdits(false);
      setRnSignConsent(false);
      setRnSuggestedTier('');
      if (isEditRoute) {
        window.location.assign(actionsQueueOnly ? actionsQueueListHref : closeEditorHref);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not submit to admin',
        description: String(error?.message || error),
      });
    } finally {
      setRnOpeningSignLink(false);
    }
  };

  const downloadSignaturePdf = async (requestId: string, kind: 'signature' | 'packet') => {
    if (!auth?.currentUser) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(
        `/api/alft/signatures/download?requestId=${encodeURIComponent(requestId)}&kind=${encodeURIComponent(kind)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as any));
        throw new Error(String(json?.error || `Download failed (HTTP ${res.status})`));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ALFT_${kind}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not download.', variant: 'destructive' });
    }
  };

  const editRowLive = editRow?.id ? (rows.find((r) => r.id === editRow.id) || editRow) : editRow;

  // Keep RN/MSW e-sign timestamps in the open editor when Firestore updates.
  useEffect(() => {
    if (!editOpen || !editRowLive?.id) return;
    const rnIso =
      toIsoTimestamp((editRowLive as any)?.alftSignature?.rnSignedAt) ||
      toIsoTimestamp((editRowLive as any)?.alftForm?.rnSignedAt) ||
      toIsoTimestamp((editRowLive as any)?.alftRnTierRecommendation?.recommendedAtIso) ||
      toIsoTimestamp((editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_signed_at);
    const swIso =
      toIsoTimestamp((editRowLive as any)?.alftSignature?.mswSignedAt) ||
      toIsoTimestamp((editRowLive as any)?.alftForm?.swSignedAt) ||
      toIsoTimestamp((editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_sw_signed_at);
    const rnName = String(
      (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_print_name ||
        (editRowLive as any)?.alftRnName ||
        ''
    ).trim();
    const rnLicense = String(
      (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_license_number || ''
    ).trim();
    if (!rnIso && !swIso && !rnName && !rnLicense) return;
    setEditExactAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      if (rnIso && String(prev.p14_rn_signed_at || '') !== rnIso) {
        next.p14_rn_signed_at = rnIso;
        changed = true;
      }
      if (swIso && String(prev.p14_sw_signed_at || '') !== swIso) {
        next.p14_sw_signed_at = swIso;
        changed = true;
      }
      if (rnName && !String(prev.p14_rn_print_name || '').trim()) {
        next.p14_rn_print_name = rnName;
        changed = true;
      }
      if (rnLicense && !String(prev.p14_license_number || '').trim()) {
        next.p14_license_number = rnLicense;
        changed = true;
      }
      const rnTier = String(
        resolveEffectiveRnRecommendedTier(editRowLive).tier ||
          (editRowLive as any)?.alftRnTierRecommendation?.tier ||
          (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_recommended_tier ||
          ''
      ).trim();
      if (rnTier && String(prev.p14_rn_recommended_tier || '').trim() !== rnTier) {
        next.p14_rn_recommended_tier = rnTier;
        changed = true;
      }
      const adminTier = String(
        (editRowLive as any)?.alftManagerReview?.adminApprovedTier ||
          (editRowLive as any)?.alftManagerReview?.rnRecommendedTier ||
          (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_admin_approved_tier ||
          ''
      ).trim();
      if (adminTier && String(prev.p14_admin_approved_tier || '').trim() !== adminTier) {
        next.p14_admin_approved_tier = adminTier;
        changed = true;
      }
      // If RN already signed in Firestore but form answer timestamp is blank, stamp it now.
      if (rnIso && !String(prev.p14_rn_signed_at || '').trim()) {
        next.p14_rn_signed_at = rnIso;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [
    editOpen,
    editRowLive?.id,
    (editRowLive as any)?.alftSignature?.rnSignedAt,
    (editRowLive as any)?.alftSignature?.mswSignedAt,
    (editRowLive as any)?.alftForm?.rnSignedAt,
    (editRowLive as any)?.alftForm?.swSignedAt,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_signed_at,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_sw_signed_at,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_print_name,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_license_number,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_rn_recommended_tier,
    (editRowLive as any)?.alftRnTierRecommendation?.tier,
    (editRowLive as any)?.alftForm?.exactPacketAnswers?.p14_admin_approved_tier,
    (editRowLive as any)?.alftManagerReview?.adminApprovedTier,
    (editRowLive as any)?.alftManagerReview?.rnRecommendedTier,
  ]);

  const canApproveToRnFromEdit = Boolean(editRowLive && canSendToRnAfterPreReview(editRowLive));
  const canResendToRnFromEdit = Boolean(editRowLive && canResendToRn(editRowLive));
  const canRejectToSwFromEdit = Boolean(editRowLive && canKickBackToSw(editRowLive));
  const canRunFinalReviewFromEdit = Boolean(
    editRowLive &&
      canRunManagerWorkflow &&
      hasRnElectronicallySigned(editRowLive) &&
      String((editRowLive as any)?.alftManagerReview?.status || '').toLowerCase() !== 'approved'
  );
  const editEffectiveRnTier = useMemo(() => {
    const live = editRowLive || editRow;
    if (!live) return { tier: '', source: '' as const, justification: '', recommendedByName: '' };
    return resolveEffectiveRnRecommendedTier(live);
  }, [editRowLive, editRow]);
  const editRnTierReady = Boolean(String(editEffectiveRnTier.tier || '').trim());
  const editRnTierReviewed = Boolean(
    editRnTierAdminReviewed ||
      (editRowLive || editRow as any)?.alftRnTierRecommendation?.adminReviewedAtIso ||
      isAlftRnAdminOverride(editRowLive || editRow)
  );
  const canSendCompletedFromEdit = Boolean(
    editRowLive &&
      canRunManagerWorkflow &&
      hasRnElectronicallySigned(editRowLive) &&
      String((editRowLive as any)?.alftManagerReview?.status || '').toLowerCase() === 'approved'
  );
  const canRouteToCsManagerFromEdit = Boolean(
    editRowLive &&
      canRunManagerWorkflow &&
      Boolean(editRowLive?.alftSignature?.rnSignedAt) &&
      !String((editRowLive as any)?.workflowStatus || '').toLowerCase().includes('completed_sent_to_jocelyn') &&
      !String((editRowLive as any)?.workflowStatus || '').toLowerCase().includes('manager_review_complete_ready_to_send')
  );
  const canPrintOrDownloadFromEdit = alftPrintDownloadUnlocked(editRowLive || editRow);
  const isAssignedRnOnEdit = useMemo(() => {
    const row = editRowLive || editRow;
    if (!row) return false;
    const uid = String(user?.uid || '').trim();
    const email = String(user?.email || '').toLowerCase();
    const rnUid = String((row as any)?.alftRnUid || '').trim();
    const rnEmail = String((row as any)?.alftRnEmail || (row as any)?.alftSignature?.rnEmail || '').toLowerCase();
    const defaultRn = email === 'leslie@carehomefinders.com';
    return Boolean((uid && uid === rnUid) || (email && rnEmail && email === rnEmail) || defaultRn);
  }, [editRow, editRowLive, user?.email, user?.uid]);
  const editAssessorRoleIsRn = useMemo(() => {
    const row = editRowLive || editRow;
    const assignment = row ? findAssignmentForUpload(row) : null;
    const role = String(
      (assignment as any)?.assessorRole ||
        (assignment as any)?.ispAssessorType ||
        (row as any)?.assessorRole ||
        (row as any)?.ispAssessorType ||
        ''
    )
      .trim()
      .toLowerCase();
    return role === 'rn';
  }, [editRow, editRowLive, findAssignmentForUpload]);
  const packetAssessorSubmitted = useMemo(() => {
    const row = editRowLive || editRow;
    if (!row) return false;
    const assignment = findAssignmentForUpload(row);
    const ws = String(
      (row as any)?.workflowStatus || (assignment as any)?.workflowStatus || ''
    ).toLowerCase();
    return (
      Boolean((assignment as any)?.workflowSteps?.swSubmittedSigned) ||
      Boolean((row as any)?.workflowSteps?.swSubmittedSigned) ||
      Boolean((row as any)?.alftForm?.swSignedAt) ||
      Boolean((row as any)?.alftSignature?.mswSignedAt) ||
      ws.includes('awaiting_manager_review') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser') ||
      ws.includes('manager_review_complete') ||
      ws.includes('ready_to_send')
    );
  }, [editRow, editRowLive, findAssignmentForUpload]);
  const packetAwaitingRnSign = useMemo(() => {
    const row = editRowLive || editRow;
    if (!row) return false;
    if (hasRnElectronicallySigned(row)) return false;
    // RN-as-assessor override: she submits the assessment to admin first. Final RN
    // signature UI only unlocks after that submit (and usually after admin Approve → RN).
    if (editAssessorRoleIsRn && !packetAssessorSubmitted) return false;
    const ws = String((row as any)?.workflowStatus || '').toLowerCase();
    const signatureRequested = Boolean((row as any)?.alftSignature?.requestedAt);
    return (
      alftActionAudience(row) === 'rn' ||
      signatureRequested ||
      ws.includes('awaiting_rn')
    );
  }, [editAssessorRoleIsRn, editRow, editRowLive, packetAssessorSubmitted]);
  /**
   * Leslie / RN staff must never see admin Resend/Reject/Download chrome during final RN sign.
   * Do not treat RN-as-assessor (pre-submit) as final RN review — she must submit to admin first.
   */
  const isRnReviewUi =
    (rnActionsOnly || ((isAssignedRnOnEdit || isRnStaff) && packetAwaitingRnSign)) &&
    !(editAssessorRoleIsRn && !packetAssessorSubmitted);

  // If RN opened an admin/manager link by mistake, switch them to the RN review URL.
  useEffect(() => {
    if (!isEditRoute || !editRouteId) return;
    if (!isRnReviewUi) return;
    if (rnActionsOnly) return;
    if (!(isAssignedRnOnEdit || isRnStaff)) return;
    if (!packetAwaitingRnSign) return;
    window.location.replace(
      `/admin/alft-tracker?rnActions=1&edit=${encodeURIComponent(editRouteId)}`
    );
  }, [
    editRouteId,
    isAssignedRnOnEdit,
    isEditRoute,
    isRnReviewUi,
    isRnStaff,
    packetAwaitingRnSign,
    rnActionsOnly,
  ]);

  useEffect(() => {
    if (!editOpen || !isRnReviewUi) return;
    if (!String(rnSignName || '').trim()) {
      setRnSignName(String(user?.displayName || user?.email || '').trim());
    }
    if (isDefaultAlftRnName(rnSignName) || isDefaultAlftRnName(user?.displayName)) {
      if (String(rnSignLicense || '').trim() !== DEFAULT_ALFT_RN_LICENSE_NUMBER) {
        setRnSignLicense(DEFAULT_ALFT_RN_LICENSE_NUMBER);
      }
      return;
    }
    const existingLicense = String((editExactAnswers as any)?.p14_license_number || '').trim();
    if (existingLicense && !String(rnSignLicense || '').trim()) {
      setRnSignLicense(existingLicense);
    }
  }, [editOpen, isRnReviewUi, editExactAnswers, rnSignLicense, rnSignName, user?.displayName, user?.email]);

  const editAssignmentRow = editRow ? findAssignmentForUpload(editRow) : null;
  const editAssignmentMemberKey = String(editAssignmentRow?.memberId || editAssignmentRow?.id || '').trim();
  const isResendingSwFromEdit = Boolean(editAssignmentMemberKey) && startingWorkflowFor === editAssignmentMemberKey;
  const editStage = editRowLive ? computeStage(editRowLive) : 'not_started';
  const editStageLabel = editRowLive ? trackerCurrentStatusLabel(editRowLive, editStage) : 'Not started';
  const editChecklist = editRowLive ? workflowChecklistFor(editRowLive) : [];
  const editExplicitCurrentIdx = editChecklist.findIndex((step: any) => Boolean((step as any)?.current));
  const editCurrentIdx = editExplicitCurrentIdx >= 0 ? editExplicitCurrentIdx : editChecklist.findIndex((step) => !step.done);
  const editWorkflowHasStarted = editChecklist.some((step) => Boolean(step.done || step.current));
  const editCurrentStepLabel =
    !editWorkflowHasStarted
      ? 'Begin workflow'
      : editChecklist[(editCurrentIdx >= 0 ? editCurrentIdx : Math.max(editChecklist.length - 1, 0))]?.label || 'Begin workflow';
  const editCurrentStepAtLabel =
    !editWorkflowHasStarted
      ? ''
      : editChecklist[(editCurrentIdx >= 0 ? editCurrentIdx : Math.max(editChecklist.length - 1, 0))]?.atLabel || '';
  const editAssignmentSignals = editAssignmentRow ? assignmentWorkflowSignals(editAssignmentRow) : null;
  const editAssignmentStage = editAssignmentRow ? assignmentStageBlock(editAssignmentRow) : null;
  const editAssignmentSteps = editAssignmentRow ? assignmentWorkflowSteps(editAssignmentRow) : [];
  const wasSentToSwFromEdit = Boolean(
    editAssignmentSignals?.swInviteSent ||
      editAssignmentSignals?.swSubmitted ||
      editAssignmentSignals?.returnedToSw ||
      Boolean((editRowLive || editRow as any)?.workflowSteps?.swInviteSent) ||
      Boolean(toMs((editRowLive || editRow as any)?.workflowStepsAt?.swInviteSentAt)) ||
      Boolean(toMs((editRowLive || editRow as any)?.workflowInvites?.invitedAt))
  );
  const wasSentToRnFromEdit = Boolean(
    canResendToRnFromEdit ||
      Boolean((editRowLive || editRow as any)?.alftSignature?.requestedAt) ||
      hasRnElectronicallySigned(editRowLive || editRow) ||
      String((editRowLive || editRow as any)?.workflowStatus || '')
        .toLowerCase()
        .includes('awaiting_rn') ||
      String((editRowLive || editRow as any)?.workflowStatus || '')
        .toLowerCase()
        .includes('awaiting_kaiser_manager_final') ||
      String((editRowLive || editRow as any)?.workflowStatus || '')
        .toLowerCase()
        .includes('manager_review_complete') ||
      Boolean((editRowLive || editRow as any)?.alftRnResend?.resentAt)
  );
  const showBottomResendPanel = Boolean(
    !isRnReviewUi &&
      canRunManagerWorkflow &&
      editRowLive &&
      (wasSentToSwFromEdit || wasSentToRnFromEdit)
  );
  const swPreviewActionRow = useMemo(() => {
    if (isEditRoute && editAssignmentRow) return editAssignmentRow;
    if (!swEmailPreviewRow) return null;
    const memberKey = String(swEmailPreviewRow.memberId || swEmailPreviewRow.id || '').trim();
    if (!memberKey) return swEmailPreviewRow;
    return (
      assignmentRows.find(
        (row) => String(row.memberId || row.id || '').trim() === memberKey
      ) || swEmailPreviewRow
    );
  }, [assignmentRows, editAssignmentRow, isEditRoute, swEmailPreviewRow]);
  const swEmailPreviewRenderedBody = String(swEmailPreviewEditableBody || swEmailPreview?.body || '—');
  const editAssignmentDoneCount = editAssignmentSteps.filter((step) => step.done).length;
  const editVerificationDone = Boolean((editAssignmentRow as any)?.verificationSignoff?.verified);
  const editVerificationAtMs = toMs((editAssignmentRow as any)?.verificationSignoff?.verifiedAt);
  const editVerificationAtLabel = editVerificationAtMs ? fmtTimeline(editVerificationAtMs) : '';
  const editVerificationBy =
    toLabel((editAssignmentRow as any)?.verificationSignoff?.verifiedByName) ||
    toLabel((editAssignmentRow as any)?.verificationSignoff?.verifiedByEmail) ||
    '';
  const editSwEmailDeliveryLog = useMemo(() => {
    const raw = Array.isArray((editAssignmentRow as any)?.swEmailDeliveryLog)
      ? (((editAssignmentRow as any).swEmailDeliveryLog as any[]) || [])
      : [];
    return raw
      .map((entry: any) => {
        const atRaw = entry?.atIso || '';
        const atMs = toMs(atRaw);
        return {
          status: String(entry?.status || '').trim().toLowerCase(),
          recipientEmail: String(entry?.recipientEmail || '').trim(),
          atMs,
          atLabel: atMs ? fmtTimeline(atMs) : String(atRaw || '').trim(),
          triggeredBy:
            String(entry?.triggeredByName || '').trim() ||
            String(entry?.triggeredByEmail || '').trim() ||
            '',
          isResend: Boolean(entry?.isResend),
          error: String(entry?.error || '').trim(),
        };
      })
      .filter((entry) => Boolean(entry.status))
      .sort((a, b) => b.atMs - a.atMs);
  }, [editAssignmentRow]);
  const editSwPortalSupportFiles = useMemo(() => {
    const raw = Array.isArray((editAssignmentRow as any)?.swPortalSupportFiles)
      ? (((editAssignmentRow as any).swPortalSupportFiles as any[]) || [])
      : [];
    return raw
      .map((entry: any) => {
        const uploadedAtMs = toMs(entry?.uploadedAt || entry?.uploadedAtIso || null);
        return {
          id: String(entry?.id || '').trim(),
          label: String(entry?.label || '').trim(),
          fileName: String(entry?.fileName || '').trim(),
          downloadURL: String(entry?.downloadURL || '').trim(),
          uploadedAtMs,
          uploadedAtLabel: uploadedAtMs ? fmtTimeline(uploadedAtMs) : '',
        };
      })
      .filter((entry) => Boolean(entry.downloadURL))
      .sort((a, b) => b.uploadedAtMs - a.uploadedAtMs);
  }, [editAssignmentRow]);
  const verificationReturnToHref = editAssignmentRow
    ? `/admin/alft-tracker?edit=${encodeURIComponent(
        String(editAssignmentRow.id || editAssignmentRow.memberId || '').trim()
      )}${actionsQueueQuery}`
    : '/admin/alft-tracker';
  const step1VerificationHref = editAssignmentRow
    ? `/admin/alft-verification?${new URLSearchParams({
        memberId: String(editAssignmentRow.memberId || editAssignmentRow.id || '').trim(),
        member: String(editAssignmentRow.memberName || '').trim(),
        mrn: String(editAssignmentRow.memberMrn || '').trim(),
        returnTo: verificationReturnToHref,
      }).toString()}`
    : '/admin/alft-verification';
  const editWorkflowSummary =
    editAssignmentSignals?.complete
      ? 'Next: Workflow complete. Send/confirm completed ALFT PDF to Jocelyn.'
      : editAssignmentSignals?.returnedToSw
        ? 'Next: SW updates required sections, signs again, and routes back to John for re-check.'
        : editAssignmentSignals?.rnStep
          ? 'Next: RN reviews, edits if needed, and signs.'
          : editAssignmentSignals?.finalManager
            ? 'Next: Kaiser manager final review, then send completed packet.'
            : editAssignmentSignals?.swSubmitted
              ? 'Next: John first review (approve or reject with needed changes).'
              : editAssignmentSignals?.swInviteSent
                ? 'Next: SW logs in, completes prefilled ALFT, and signs.'
                : 'Next: Run Step 1 -> Step 4 in order to start workflow invite.';
  const backToQueueHref = '/admin/alft-assignment';
  const closeEditorFocusId = String(editRow?.id || editRouteId || '').trim();
  const closeEditorHref = closeEditorFocusId
    ? `/admin/alft-tracker?focus=${encodeURIComponent(closeEditorFocusId)}${actionsQueueQuery}`
    : '/admin/alft-tracker';
  const headerBackToTrackerHref = '/admin/alft-tracker';
  const workflowPageTitle = isEditRoute
    ? managerActionsOnly
      ? 'Review member ISP / ALFT'
      : rnActionsOnly
        ? 'ALFT RN review'
        : 'ALFT Workflow'
    : managerActionsOnly
      ? 'Members ready for admin review'
      : rnActionsOnly
        ? 'ALFT ready for RN'
        : 'ALFT Tracker';

  useEffect(() => {
    if (!swEmailPreviewOpen || !isEditRoute || !editAssignmentRow) return;
    const currentMemberKey = String(swEmailPreviewRow?.memberId || swEmailPreviewRow?.id || '').trim();
    const editMemberKey = String(editAssignmentRow.memberId || editAssignmentRow.id || '').trim();
    if (currentMemberKey !== editMemberKey) {
      setSwEmailPreviewRow(editAssignmentRow);
    }
  }, [editAssignmentRow, isEditRoute, swEmailPreviewOpen, swEmailPreviewRow]);
  useEffect(() => {
    if (!swEmailPreviewOpen) return;
    if (String(swEmailPreviewEditableBody || '').trim()) return;
    const baseBody = String(swEmailPreview?.body || '').trim();
    if (baseBody) setSwEmailPreviewEditableBody(baseBody);
  }, [swEmailPreviewOpen, swEmailPreview?.body, swEmailPreviewEditableBody]);

  const workflowPageDescription = isEditRoute
    ? managerActionsOnly
      ? 'Review the full ISP below. Approve to notify RN, or reject back to SW with comments (email preview first).'
      : rnActionsOnly
        ? 'Editable ALFT for this member. Review, edit if needed, then complete RN signature.'
        : 'Single-member workflow page. Complete edits and actions for this member only.'
    : managerActionsOnly
      ? 'Select a member name to review their submitted ISP / ALFT.'
      : rnActionsOnly
        ? 'Members ready for RN review/signature only. Open a name to view and edit the ALFT in ALFT Detail Tracker.'
        : 'Plan A + Plan B workflow: SW submits/signs, ALFT manager reviews, sends to Leslie for final RN changes/signature, then John final review, then send/print to Jocelyn.';

  const editIspProgress = useMemo(() => {
    const base = editRowLive || editRow;
    const assignment = editRow ? findAssignmentForUpload(editRow) : null;
    const merged = {
      ...(base || {}),
      sentToIls: Boolean(
        (base as any)?.sentToIls ||
          (base as any)?.coverSheetPackageSentAt ||
          (base as any)?.coverSheetPackageSentAtIso ||
          (assignment as any)?.sentToIls ||
          (assignment as any)?.coverSheetPackageSentAt ||
          (assignment as any)?.coverSheetPackageSentAtIso
      ),
      sentToIlsAtIso:
        toLabel((base as any)?.sentToIlsAtIso) ||
        toLabel((base as any)?.coverSheetPackageSentAtIso) ||
        toLabel((assignment as any)?.sentToIlsAtIso) ||
        toLabel((assignment as any)?.coverSheetPackageSentAtIso) ||
        null,
      sentToIlsManual: Boolean((base as any)?.sentToIlsManual || (assignment as any)?.sentToIlsManual),
    };
    return ispProgressForUpload(merged);
  }, [editRow, editRowLive, findAssignmentForUpload]);

  const sentToIlsStatusMeta = useMemo(() => {
    const base = editRowLive || editRow;
    const assignment = editRow ? findAssignmentForUpload(editRow) : null;
    const iso =
      toLabel((base as any)?.sentToIlsAtIso) ||
      toLabel((assignment as any)?.sentToIlsAtIso) ||
      toLabel((base as any)?.coverSheetPackageSentAtIso) ||
      toLabel((assignment as any)?.coverSheetPackageSentAtIso);
    const sent = Boolean(
      (base as any)?.sentToIls ||
        (assignment as any)?.sentToIls ||
        (base as any)?.coverSheetPackageSentAt ||
        (assignment as any)?.coverSheetPackageSentAt ||
        iso
    );
    const manual = Boolean((base as any)?.sentToIlsManual || (assignment as any)?.sentToIlsManual);
    let dateLabel = '';
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      } else if (iso.length >= 10) {
        dateLabel = iso.slice(0, 10);
      }
    }
    return { sent, manual, dateLabel, iso };
  }, [editRow, editRowLive, findAssignmentForUpload]);

  const openSentToIlsDialog = () => {
    const base = editRowLive || editRow;
    const assignment = editRow ? findAssignmentForUpload(editRow) : null;
    const existingIso =
      toLabel((base as any)?.sentToIlsAtIso) ||
      toLabel((assignment as any)?.sentToIlsAtIso) ||
      toLabel((base as any)?.coverSheetPackageSentAtIso) ||
      toLabel((assignment as any)?.coverSheetPackageSentAtIso);
    const alreadySent = Boolean(
      (base as any)?.sentToIls ||
        (assignment as any)?.sentToIls ||
        (base as any)?.coverSheetPackageSentAt ||
        (assignment as any)?.coverSheetPackageSentAt
    );
    setSentToIlsDate(existingIso ? existingIso.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setSentToIlsConfirmChecked(alreadySent);
    setSentToIlsDialogOpen(true);
  };

  const saveSentToIlsFromAlft = async () => {
    if (!firestore || !editRow?.id) return;
    if (!sentToIlsConfirmChecked) {
      toast({
        variant: 'destructive',
        title: 'Confirmation required',
        description: 'Check the box to confirm this ISP was sent to ILS.',
      });
      return;
    }
    const memberId =
      toLabel(findAssignmentForUpload(editRow)?.memberId) ||
      toLabel((editRow as any)?.memberId) ||
      '';
    const ymd = toLabel(sentToIlsDate) || new Date().toISOString().slice(0, 10);
    const iso = `${ymd}T12:00:00.000Z`;
    setSentToIlsSaving(true);
    try {
      const stamp = {
        sentToIls: true,
        sentToIlsAt: serverTimestamp(),
        sentToIlsAtIso: iso,
        sentToIlsManual: true,
        sentToIlsMarkedAt: serverTimestamp(),
        // Clear admin action queue — workflow is past Final / Download.
        workflowStatus: 'completed_sent_to_ils',
        updatedAt: serverTimestamp(),
      };
      if (memberId) {
        await setDoc(doc(firestore, 'alft_assignments', memberId), stamp, { merge: true });
      }
      await setDoc(doc(firestore, 'standalone_upload_submissions', editRow.id), stamp, { merge: true });
      const patch = {
        sentToIls: true,
        sentToIlsAtIso: iso,
        sentToIlsManual: true,
        workflowStatus: 'completed_sent_to_ils',
      };
      setRows((prev) => prev.map((r) => (r.id === editRow.id ? ({ ...r, ...patch } as StandaloneUpload) : r)));
      setEditRow((prev) => (prev?.id === editRow.id ? ({ ...prev, ...patch } as StandaloneUpload) : prev));
      setSentToIlsDialogOpen(false);
      toast({
        title: 'Marked Sent to ILS',
        description: `Removed from admin action queue. Status updated as of ${ymd}.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      if (managerActionsOnly) {
        window.location.assign('/admin/alft-tracker?managerActions=1');
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update Sent to ILS',
        description: String(e?.message || e),
      });
    } finally {
      setSentToIlsSaving(false);
    }
  };
  const approveRnEmail =
    String(dummySendRnEmail || '').trim() ||
    String((approvePreviewRow || editRow)?.alftRnEmail || '').trim() ||
    'leslie@carehomefinders.com';
  const approveRnName =
    String((approvePreviewRow || editRow)?.alftRnName || '').trim() ||
    (String(dummySendRnEmail || '').trim() ? 'Dummy Recipient' : 'Leslie (RN)');
  const rejectAssignment = rejectRow ? findAssignmentForUpload(rejectRow) : null;
  const rejectSwEmail =
    String(rejectRow?.uploaderEmail || '').trim() ||
    String(rejectAssignment?.assignedSwEmail || '').trim() ||
    '(no SW email on file)';
  const rejectSwName =
    String(rejectRow?.uploaderName || '').trim() ||
    String(rejectAssignment?.assignedSwName || '').trim() ||
    'Social Worker';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin && !isKaiserStaff && !isRnStaff) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Kaiser staff access required</CardTitle>
            <CardDescription>Please sign in as Kaiser staff, RN staff, or admin to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  const approveToRnDisabledReason = !editRowLive
    ? 'No ALFT loaded'
    : sigRequestingId === String(editRowLive?.id || '')
      ? 'Approval already in progress'
      : !canRunManagerWorkflow
        ? 'Kaiser manager/staff access required'
        : hasRnElectronicallySigned(editRowLive)
          ? 'RN already signed — use Resend → RN (new signature) if she must sign again'
          : canResendToRnFromEdit
            ? 'Already sent to RN — use Resend to RN below if Leslie needs another email'
            : !canApproveToRnFromEdit
              ? 'SW ALFT content is required before sending to Leslie'
              : 'Manager approval: route to Leslie (RN) and request signatures';

  const lastDownloadFileName = String(
    (editRowLive || editRow as any)?.alftLastDownloadFileName ||
      ((editRowLive || editRow as any)?.alftLastDownloadName
        ? `${String((editRowLive || editRow as any)?.alftLastDownloadName)}.pdf`
        : '') ||
      ''
  ).trim();
  const lastDownloadedAtLabel = (() => {
    const iso = toIsoTimestamp((editRowLive || editRow as any)?.alftStaffDownloadedAt);
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  })();

  const formatIspVersionLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const requestIspDownloadConfirm = (action: 'approved' | 'rebuild') => {
    if (!editConfirmEdits) {
      toast({
        variant: 'destructive',
        title: 'Confirm edits required',
        description: 'Check “I confirm these edits…” below, then download.',
      });
      return;
    }
    const versionAtIso = new Date().toISOString();
    const versionLabel = formatIspVersionLabel(versionAtIso) || versionAtIso;
    setIspDownloadConfirm({
      action,
      versionAtIso,
      versionLabel,
      answersSnapshot: { ...editExactAnswers, p1_agency: AGENCY_NAME },
    });
  };

  const confirmIspDownload = async () => {
    const pending = ispDownloadConfirm;
    if (!pending) return;
    setIspDownloadConfirm(null);
    if (pending.action === 'rebuild') {
      await downloadCompletedFormFromLog({
        archivedAtIso: pending.versionAtIso,
        answers: pending.answersSnapshot,
      });
      return;
    }
    await approvedAndDownload({
      archivedAtIso: pending.versionAtIso,
      answers: pending.answersSnapshot,
    });
  };

  const adminActionGaps = (() => {
    if (isRnReviewUi) return [] as string[];
    const gaps: string[] = [];
    if (!editConfirmEdits) {
      gaps.push('confirm edits checkbox (above) — required for Approve / Reject / Resend / Final approval / Approved and download');
    }
    if (
      !canApproveToRnFromEdit &&
      !canResendToRnFromEdit &&
      !hasRnElectronicallySigned(editRowLive)
    ) {
      gaps.push(`Approve → Send to RN blocked: ${approveToRnDisabledReason}`);
    }
    if (canRunFinalReviewFromEdit) {
      const live = editRowLive || (editRow as any);
      const resolvedTier = resolveEffectiveRnRecommendedTier(live);
      const hasTier = Boolean(String(resolvedTier.tier || '').trim());
      const tierReviewed =
        editRnTierAdminReviewed ||
        Boolean(live?.alftRnTierRecommendation?.adminReviewedAtIso) ||
        isAlftRnAdminOverride(live);
      if (!hasTier) {
        gaps.push(
          isAlftRnAdminOverride(live)
            ? 'RN recommended tier (set Tier 1–5 or use SW recommended tier — Leslie not required with RN override)'
            : 'RN recommended tier (waiting on RN signature/return)'
        );
      } else if (!tierReviewed) {
        gaps.push('check “I reviewed the RN recommended tier” at the bottom, then Approve tier + download');
      } else if (!editConfirmEdits) {
        gaps.push('then click Approve tier + download');
      }
    }
    return gaps;
  })();

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{workflowPageTitle}</h1>
          <p className="text-muted-foreground">{workflowPageDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          {managerActionsOnly ? (
            <Button variant="outline" asChild>
              <Link href={actionsQueueListHref}>{isEditRoute ? 'Back to pending members' : 'Refresh list'}</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={backToQueueHref}>Back to Queue Page</Link>
            </Button>
          )}
          {isEditRoute && !managerActionsOnly ? (
            <Button variant="outline" asChild>
              <Link href={headerBackToTrackerHref}>Back to ALFT Tracker Page</Link>
            </Button>
          ) : null}
          {!isEditRoute && !managerActionsOnly ? (
            <Badge variant={trackedMemberCount > 0 ? 'secondary' : 'outline'}>{trackedMemberCount} active ALFT members</Badge>
          ) : null}
          {!isEditRoute ? (
            <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Clear search
            </Button>
          ) : null}
        </div>
      </div>

      {!isEditRoute ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <Label htmlFor="alft-search" className="sr-only">
              Search
            </Label>
            <Input
              id="alft-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search member / MRN / uploader / assignee…"
            />
          </div>
        </div>
      ) : null}
      {managerActionsOnly ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Needs admin action ({filtered.length})
          </div>
          <div className="text-xs sm:text-sm">
            {isEditRoute
              ? canRunFinalReviewFromEdit || canSendCompletedFromEdit
                ? 'SW and RN are already done. This is the Final / Download step: review the RN tier, approve it at the bottom, then download/send. Member leaves this queue only after Sent to ILS date (package checklist or manual).'
                : 'Review the ISP progression and full form, then approve to RN or reject to SW. Emails are previewed before send.'
              : 'Open a member name to review. Includes first admin review (send to RN) and final admin check after RN signature. Cleared only when Sent to ILS has a date.'}
          </div>
        </div>
      ) : null}
      {rnActionsOnly ? (
        <div className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <div className="font-medium">RN review queue</div>
          <div className="text-xs sm:text-sm">
            Showing members ready for RN review/signature. Open a member in ALFT Detail Tracker to edit and complete RN
            sign-off.
          </div>
        </div>
      ) : null}
      {isEditRoute && editAssessorRoleIsRn && isAssignedRnOnEdit && !packetAssessorSubmitted ? (
        <div className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <div className="font-medium">RN assessor override — submit to admin first</div>
          <div className="text-xs sm:text-sm mt-1">
            You are the RN completing this assessment (not the final signature step yet). Open the{' '}
            <Link href="/sw-portal/alft-upload" className="font-semibold underline underline-offset-2">
              Social Worker portal ALFT queue
            </Link>
            , complete the form, and choose <span className="font-medium">Sign &amp; Submit to Admin</span>. After
            admin review, the packet returns here for your final RN signature.
          </div>
        </div>
      ) : null}
      {!isEditRoute && !editOpen && managerActionsOnly ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pending members</CardTitle>
            <CardDescription>
              Click a name to open that member’s review page. Members leave this list only after Sent to ILS has a date
              (ILS package checklist send, or manual checkmark + date).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">No members currently need admin review.</div>
            ) : (
              <div className="divide-y rounded-md border">
                {filtered.map((r) => {
                  const progress = ispProgressForUpload(r);
                  const current =
                    progress.find((s) => s.state === 'current') ||
                    progress.find((s) => s.state === 'returned') ||
                    progress.find((s) => s.state === 'pending');
                  const lastDone = [...progress].reverse().find((s) => s.state === 'done');
                  const statusLabel = current?.label || lastDone?.label || 'In progress';
                  const completedFile =
                    String((r as any)?.alftLastDownloadFileName || '').trim() ||
                    (String((r as any)?.alftLastDownloadName || '').trim()
                      ? `${String((r as any).alftLastDownloadName).trim()}.pdf`
                      : '');
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-amber-50"
                      onClick={() => {
                        // Dedicated review URL — never open the editor under the pending list.
                        window.location.assign(
                          `/admin/alft-tracker?managerActions=1&edit=${encodeURIComponent(String(r.id || ''))}`
                        );
                      }}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{r.memberName || 'Member'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.medicalRecordNumber || '—'}</div>
                        {completedFile ? (
                          <div className="mt-1 truncate text-[11px] font-medium text-emerald-800" title={completedFile}>
                            Completed form: {completedFile}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-medium text-amber-800">{statusLabel}</div>
                        <div className="text-[11px] text-muted-foreground">Open review →</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      <AlftTrackerTableCard
        isEditRoute={isEditRoute}
        managerActionsOnly={managerActionsOnly}
        filtered={filtered}
        rnActionsOnly={rnActionsOnly}
        actionsQueueOnly={actionsQueueOnly}
        focusId={focusId}
        findAssignmentForUpload={findAssignmentForUpload}
        startingWorkflowFor={startingWorkflowFor}
        expandedMemberId={expandedMemberId}
        actionsQueueQuery={actionsQueueQuery}
        setExpandedMemberId={setExpandedMemberId}
        canEditAlftRow={canEditAlftRow}
        removingFromTrackerId={removingFromTrackerId}
        removeMemberFromTracker={removeMemberFromTracker}
      />

      <SwEmailPreviewDialog
        swEmailPreviewOpen={swEmailPreviewOpen}
        setSwEmailPreviewOpen={setSwEmailPreviewOpen}
        setSwEmailPreviewUseTestOverride={setSwEmailPreviewUseTestOverride}
        setSwEmailPreviewTestEmail={setSwEmailPreviewTestEmail}
        setSwEmailPreviewEditableBody={setSwEmailPreviewEditableBody}
        swEmailPreview={swEmailPreview}
        swEmailPreviewRenderedBody={swEmailPreviewRenderedBody}
        swEmailPreviewEditableBody={swEmailPreviewEditableBody}
        swEmailPreviewUseTestOverride={swEmailPreviewUseTestOverride}
        swEmailPreviewTestEmail={swEmailPreviewTestEmail}
        swPreviewActionRow={swPreviewActionRow}
        isResendingSwFromEdit={isResendingSwFromEdit}
        setConfirmResendSwSendOpen={setConfirmResendSwSendOpen}
      />

      {editOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>{editRowLive?.memberName || 'Member review'}</CardTitle>
            <CardDescription>
              {isRnReviewUi
                ? `MRN ${editRowLive?.medicalRecordNumber || '—'} · Edit if needed, choose suggested tier, sign, and return to admin.`
                : managerActionsOnly
                  ? `MRN ${editRowLive?.medicalRecordNumber || '—'} · ${
                      canRunFinalReviewFromEdit || canSendCompletedFromEdit
                        ? 'Final admin check after RN — approve RN tier, then download/send.'
                        : 'Review full ISP, then approve to RN or reject to SW.'
                    }`
                  : 'Collaborative edit mode. This form remains editable by social worker, staff, RN, and admin users.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <IspTrackerProgression
              managerActionsOnly={managerActionsOnly}
              editIspProgress={editIspProgress}
              openSentToIlsDialog={openSentToIlsDialog}
              sentToIlsStatusMeta={sentToIlsStatusMeta}
              editRowLive={editRowLive}
              editRow={editRow}
              canRunFinalReviewFromEdit={canRunFinalReviewFromEdit}
            />
            <PreSubmissionWorkflowQueue
              managerActionsOnly={managerActionsOnly}
              isRnReviewUi={isRnReviewUi}
              editAssignmentRow={editAssignmentRow}
              canRunManagerWorkflow={canRunManagerWorkflow}
              editAssignmentDoneCount={editAssignmentDoneCount}
              editAssignmentSteps={editAssignmentSteps}
              editAssignmentStage={editAssignmentStage}
              editWorkflowSummary={editWorkflowSummary}
              step1VerificationHref={step1VerificationHref}
              editVerificationDone={editVerificationDone}
              setVerificationForMember={setVerificationForMember}
              verifyingMemberId={verifyingMemberId}
              editVerificationBy={editVerificationBy}
              editVerificationAtLabel={editVerificationAtLabel}
              setSwEmailPreviewRow={setSwEmailPreviewRow}
              setSwEmailPreviewUseTestOverride={setSwEmailPreviewUseTestOverride}
              setSwEmailPreviewTestEmail={setSwEmailPreviewTestEmail}
              setSwEmailPreviewEditableBody={setSwEmailPreviewEditableBody}
              swEmailPreview={swEmailPreview}
              setSwEmailPreviewOpen={setSwEmailPreviewOpen}
              editAssignmentSignals={editAssignmentSignals}
              editSwEmailDeliveryLog={editSwEmailDeliveryLog}
              swSupportUploadLabel={swSupportUploadLabel}
              setSwSupportUploadLabel={setSwSupportUploadLabel}
              setSwSupportUploadFiles={setSwSupportUploadFiles}
              swSupportUploadFiles={swSupportUploadFiles}
              swSupportUploading={swSupportUploading}
              uploadSwPortalSupportFile={uploadSwPortalSupportFile}
              swSupportUploadProgress={swSupportUploadProgress}
              editSwPortalSupportFiles={editSwPortalSupportFiles}
            />
            <EditRowSummary
              managerActionsOnly={managerActionsOnly}
              editRow={editRow}
              editStage={editStage}
              editStageLabel={editStageLabel}
              editCurrentStepLabel={editCurrentStepLabel}
              editCurrentStepAtLabel={editCurrentStepAtLabel}
              isRnReviewUi={isRnReviewUi}
              openLiveAlftPrintable={openLiveAlftPrintable}
              canPrintOrDownloadFromEdit={canPrintOrDownloadFromEdit}
              lastDownloadFileName={lastDownloadFileName}
              lastDownloadedAtLabel={lastDownloadedAtLabel}
              editSaving={editSaving}
              editConfirmEdits={editConfirmEdits}
              requestIspDownloadConfirm={requestIspDownloadConfirm}
              editRowLive={editRowLive}
              downloadCompletedFormFromLog={downloadCompletedFormFromLog}
            />
            {!isRnReviewUi ? <SwIspToolsLinksPanel preferFirestore showManageLink /> : null}
            <div className={cn(!canPrintOrDownloadFromEdit && 'print:hidden')}>
            <SwStyleAlftEditor
              answers={{
                ...editExactAnswers,
                ...(toIsoTimestamp((editRowLive as any)?.alftSignature?.rnSignedAt) ||
                toIsoTimestamp((editRowLive as any)?.alftForm?.rnSignedAt) ||
                toIsoTimestamp((editRowLive as any)?.alftRnTierRecommendation?.recommendedAtIso) ||
                toIsoTimestamp((editExactAnswers as any)?.p14_rn_signed_at)
                  ? {
                      p14_rn_signed_at:
                        toIsoTimestamp((editRowLive as any)?.alftSignature?.rnSignedAt) ||
                        toIsoTimestamp((editRowLive as any)?.alftForm?.rnSignedAt) ||
                        toIsoTimestamp((editRowLive as any)?.alftRnTierRecommendation?.recommendedAtIso) ||
                        String((editExactAnswers as any)?.p14_rn_signed_at || ''),
                    }
                  : {}),
              }}
              onChange={(id, value) => {
                const lockedPurpose =
                  normalizeIspAssessmentPurpose(editExactAnswers.p1_purpose) &&
                  normalizeIspAssessmentPurpose(
                    (editRowLive as any)?.prefillPurpose ||
                      findAssignmentForUpload(editRowLive as any)?.prefillPurpose
                  );
                if (id === 'p1_purpose' && lockedPurpose) return;
                setEditConfirmEdits(false);
                if (id === 'p1_purpose') {
                  const purpose = normalizeIspAssessmentPurpose(value);
                  setEditExactAnswers((prev) => ({
                    ...prev,
                    [id]: purpose || String(value || ''),
                  }));
                  return;
                }
                setEditExactAnswers((prev) => ({
                  ...prev,
                  [id]: value,
                }));
              }}
              memberName={editRow?.memberName || ''}
              memberMrn={editRow?.medicalRecordNumber || ''}
              memberId={editAssignmentMemberKey || undefined}
              medListAttachment={editMedListAttachment}
              onMedListAttachmentChange={(next) => {
                setEditConfirmEdits(false);
                setEditMedListAttachment(next);
              }}
              disabledFieldIds={
                normalizeIspAssessmentPurpose(editExactAnswers.p1_purpose) &&
                normalizeIspAssessmentPurpose(
                  (editRowLive as any)?.prefillPurpose ||
                    findAssignmentForUpload(editRowLive as any)?.prefillPurpose
                )
                  ? ['p1_purpose']
                  : undefined
              }
              allowAdminSignatureOverride
            />
            </div>
            {String((editRowLive || editRow as any)?.alftSwTierRecommendation?.tier || '').trim() ? (
              <div className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                <div className="font-semibold">
                  Social worker estimated tier:{' '}
                  <span className="text-base">
                    Tier {String((editRowLive || editRow as any)?.alftSwTierRecommendation?.tier || '').trim()}
                    {String((editRowLive || editRow as any)?.alftSwTierRecommendation?.levelLabel || '').trim()
                      ? ` — ${String((editRowLive || editRow as any)?.alftSwTierRecommendation?.levelLabel || '').trim()}`
                      : ''}
                  </span>
                </div>
                {String((editRowLive || editRow as any)?.alftSwTierRecommendation?.definitionSnapshot || '').trim() ? (
                  <p className="mt-2 text-xs leading-relaxed text-sky-900/90">
                    {String((editRowLive || editRow as any)?.alftSwTierRecommendation?.definitionSnapshot || '').trim()}
                  </p>
                ) : null}
                <div className="mt-1 text-[11px] text-sky-800">
                  Social worker estimates tier → Admin reviews → RN agrees or suggests another tier → Admin final
                  review. Internal only — not printed on the ISP form.
                </div>
              </div>
            ) : null}
            {(() => {
              const missingSwRequired = getMissingAlftRequiredFields(editExactAnswers as Record<string, unknown>);
              if (!missingSwRequired.length) return null;
              return (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <div className="font-semibold">Required SW fields still blank or invalid</div>
                  <div className="mt-1">
                    {missingSwRequired.map((f) => f.label).join('; ')}. Return to SW for edits if needed.
                  </div>
                </div>
              );
            })()}
            <EditActionBar
              isRnReviewUi={isRnReviewUi}
              editRnTierReady={editRnTierReady}
              editEffectiveRnTier={editEffectiveRnTier}
              editRowLive={editRowLive}
              editRow={editRow}
              editRnTierReviewed={editRnTierReviewed}
              setEditConfirmEdits={setEditConfirmEdits}
              setEditRnTierAdminReviewed={setEditRnTierAdminReviewed}
              editSaving={editSaving}
              sigRequestingId={sigRequestingId}
              rejectingId={rejectingId}
              editRnTierAdminNotes={editRnTierAdminNotes}
              setEditRnTierAdminNotes={setEditRnTierAdminNotes}
              editConfirmEdits={editConfirmEdits}
              rnSuggestedTier={rnSuggestedTier}
              setRnSuggestedTier={setRnSuggestedTier}
              rnOpeningSignLink={rnOpeningSignLink}
              rnSignName={rnSignName}
              setRnSignName={setRnSignName}
              rnSignLicense={rnSignLicense}
              setRnSignLicense={setRnSignLicense}
              rnSignConsent={rnSignConsent}
              setRnSignConsent={setRnSignConsent}
              submitRnWithSuggestedTier={submitRnWithSuggestedTier}
              isEditRoute={isEditRoute}
              actionsQueueOnly={actionsQueueOnly}
              actionsQueueListHref={actionsQueueListHref}
              closeEditorHref={closeEditorHref}
              setEditOpen={setEditOpen}
              editAutosaveStatus={editAutosaveStatus}
              editAutosaveAt={editAutosaveAt}
              resendLeslieFromEdit={resendLeslieFromEdit}
              canResendToRnFromEdit={canResendToRnFromEdit}
              managerActionsOnly={managerActionsOnly}
              markSentForSignature={markSentForSignature}
              canApproveToRnFromEdit={canApproveToRnFromEdit}
              approveToRnDisabledReason={approveToRnDisabledReason}
              openRejectToSw={openRejectToSw}
              canRejectToSwFromEdit={canRejectToSwFromEdit}
              canRunFinalReviewFromEdit={canRunFinalReviewFromEdit}
              markManagerFinalReview={markManagerFinalReview}
              managerReviewingId={managerReviewingId}
              routeToCsManagerFinalReview={routeToCsManagerFinalReview}
              canRouteToCsManagerFromEdit={canRouteToCsManagerFromEdit}
              routingToFinalManagerId={routingToFinalManagerId}
              openSendConfirm={openSendConfirm}
              canSendCompletedFromEdit={canSendCompletedFromEdit}
              sendingCompletedId={sendingCompletedId}
              requestIspDownloadConfirm={requestIspDownloadConfirm}
              packetDownloading={packetDownloading}
              canPrintOrDownloadFromEdit={canPrintOrDownloadFromEdit}
              lastDownloadFileName={lastDownloadFileName}
              lastDownloadedAtLabel={lastDownloadedAtLabel}
              adminActionGaps={adminActionGaps}
              editIspProgress={editIspProgress}
              openSentToIlsDialog={openSentToIlsDialog}
              sentToIlsStatusMeta={sentToIlsStatusMeta}
              showBottomResendPanel={showBottomResendPanel}
              wasSentToSwFromEdit={wasSentToSwFromEdit}
              isResendingSwFromEdit={isResendingSwFromEdit}
              editAssignmentRow={editAssignmentRow}
              openResendSwPreviewFromEdit={openResendSwPreviewFromEdit}
              wasSentToRnFromEdit={wasSentToRnFromEdit}
            />
            {!managerActionsOnly && !isRnReviewUi ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="rounded border bg-muted/20 p-2">
                <Label htmlFor="alft-dummy-send-rn" className="text-xs">RN stage test email (Approve → Send to Leslie)</Label>
                <Input
                  id="alft-dummy-send-rn"
                  value={dummySendRnEmail}
                  onChange={(e) => setDummySendRnEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <Label htmlFor="alft-dummy-send-manager" className="text-xs">CS Manager stage test email (Send to CS Manager for Final Review)</Label>
                <Input
                  id="alft-dummy-send-manager"
                  value={dummySendManagerEmail}
                  onChange={(e) => setDummySendManagerEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="rounded border bg-muted/20 p-2">
                <Label htmlFor="alft-dummy-send-completed" className="text-xs">Completed packet test email (Send to Jocelyn)</Label>
                <Input
                  id="alft-dummy-send-completed"
                  value={dummySendCompletedEmail}
                  onChange={(e) => setDummySendCompletedEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{assignKind === 'rn' ? 'Assign RN reviewer' : 'Assign staff reviewer'}</DialogTitle>
            <DialogDescription>
              This will save the assignment on the ALFT intake and notify the assigned person via Electron/My Notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Member</Label>
              <div className="text-sm">{assignRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">{assignRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Select value={assignUid} onValueChange={setAssignUid}>
                <SelectTrigger>
                  <SelectValue placeholder={staffLoading ? 'Loading staff…' : 'Select staff'} />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => (
                    <SelectItem key={s.uid} value={s.uid}>
                      {s.label} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveAssignment()} disabled={!assignUid}>
              Assign & notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revOpen} onOpenChange={setRevOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>RN re-upload (revised ALFT)</DialogTitle>
            <DialogDescription>
              Upload the revised ALFT file. This records who uploaded it and refreshes timestamps for notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Member</Label>
              <div className="text-sm">{revRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">{revRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="alft-rev-file">Revised file</Label>
              <Input
                id="alft-rev-file"
                type="file"
                onChange={(e) => setRevFile(e.target.files?.[0] || null)}
                disabled={revUploading}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="alft-rev-note">Note (optional)</Label>
              <Input
                id="alft-rev-note"
                value={revNote}
                onChange={(e) => setRevNote(e.target.value)}
                placeholder="What changed / what to review…"
                disabled={revUploading}
              />
            </div>
            {revUploading ? <div className="text-sm text-muted-foreground">Uploading… {revProgress}%</div> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRevOpen(false)} disabled={revUploading}>
              Cancel
            </Button>
            <Button onClick={() => void uploadRevision()} disabled={revUploading || !revFile}>
              {revUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sigDialogOpen} onOpenChange={setSigDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Signature request sent</DialogTitle>
            <DialogDescription>
              Emails were sent to the RN and MSW uploader. Signing order is Social Worker first, then final RN sign-off.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="font-semibold">Status</div>
              <div className="text-muted-foreground">
                RN email: {sigDialog?.rnEmailSent ? 'sent' : 'not sent'} • MSW email: {sigDialog?.mswEmailSent ? 'sent' : 'not sent'}
              </div>
              {sigDialog?.requestId ? <div className="text-sm text-muted-foreground">Request ID: {sigDialog.requestId}</div> : null}
            </div>

            <div className="space-y-1">
              <Label>RN signing link (Admin)</Label>
              {sigDialog?.rnSignUrl ? (
                <a className="underline text-blue-700 break-all" href={sigDialog.rnSignUrl}>
                  {sigDialog.rnSignUrl}
                </a>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>

            <div className="space-y-1">
              <Label>MSW signing link (SW Portal)</Label>
              {sigDialog?.mswSignUrl ? (
                <a className="underline text-blue-700 break-all" href={sigDialog.mswSignUrl}>
                  {sigDialog.mswSignUrl}
                </a>
              ) : (
                <div className="text-muted-foreground">—</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSigDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sentToIlsDialogOpen}
        onOpenChange={(open) => {
          if (!sentToIlsSaving) setSentToIlsDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sent to ILS</DialogTitle>
            <DialogDescription>
              Mark this ISP as Sent to ILS when it was already sent outside the ILS Member Package Checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md border border-teal-200 bg-teal-50/80 p-3">
            <label className="flex items-start gap-2 text-sm font-medium text-teal-950">
              <Checkbox
                checked={sentToIlsConfirmChecked}
                onCheckedChange={(v) => setSentToIlsConfirmChecked(Boolean(v))}
                disabled={sentToIlsSaving}
                className="mt-0.5"
              />
              <span>I confirm this ISP was sent to ILS</span>
            </label>
            <div className="space-y-1">
              <Label htmlFor="alft-sent-to-ils-date">Sent date</Label>
              <Input
                id="alft-sent-to-ils-date"
                type="date"
                value={sentToIlsDate}
                onChange={(e) => setSentToIlsDate(e.target.value)}
                disabled={sentToIlsSaving}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSentToIlsDialogOpen(false)}
              disabled={sentToIlsSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveSentToIlsFromAlft()}
              disabled={sentToIlsSaving || !sentToIlsConfirmChecked}
            >
              {sentToIlsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Sent to ILS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(ispDownloadConfirm)}
        onOpenChange={(open) => {
          if (!open && !packetDownloading) setIspDownloadConfirm(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm latest ISP download</DialogTitle>
            <DialogDescription>
              This rebuilds the PDF from your current edits (not the old archive), then saves a new version on ISP
              Download Archive with this timestamp.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3 space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-900/80">
              New version timestamp
            </div>
            <div className="text-lg font-semibold text-emerald-950">
              {ispDownloadConfirm?.versionLabel || '—'}
            </div>
            <div className="text-xs text-emerald-900/90">
              Download your latest edits now?
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIspDownloadConfirm(null)}
              disabled={packetDownloading}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmIspDownload()} disabled={packetDownloading}>
              {packetDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download latest edits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approvePreviewOpen} onOpenChange={setApprovePreviewOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Preview email before approving to RN</DialogTitle>
            <DialogDescription>
              Confirm the RN notification. Sending will email the RN and move this member out of the admin ready queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="font-medium">{approvePreviewRow?.memberName || '—'}</div>
              <div className="text-muted-foreground font-mono">{approvePreviewRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div>
                <span className="text-muted-foreground">To:</span> {approveRnName} &lt;{approveRnEmail}&gt;
              </div>
              <div>
                <span className="text-muted-foreground">Subject:</span> Ready for RN review — {approvePreviewRow?.memberName || 'Member'}
              </div>
              <div className="rounded border bg-white p-3 text-xs leading-relaxed text-slate-700">
                Hello {approveRnName} — {approvePreviewRow?.memberName || 'Member'} is ready for RN review in ALFT Detail
                Tracker. Open the RN ready queue, review/edit the ISP if needed, then complete RN signature. Admin already
                completed first review.
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setApprovePreviewOpen(false)} disabled={Boolean(sigRequestingId)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={() => void confirmApproveToRn()}
              disabled={Boolean(sigRequestingId)}
            >
              {sigRequestingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send email & approve to RN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resendRnDialogOpen}
        onOpenChange={(open) => {
          setResendRnDialogOpen(open);
          if (!open) {
            setResendRnRow(null);
            setResendRnNote('');
            setConfirmResendRnSendOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Resend to RN — confirm</DialogTitle>
            <DialogDescription>
              {hasRnElectronicallySigned(resendRnRow)
                ? 'This clears the prior RN electronic signature and emails a new signature request. Enter why you are resending, then confirm before the email is sent.'
                : 'This will email another signature request. Enter why you are resending, then confirm before the email is sent.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{resendRnRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">
                {resendRnRow?.medicalRecordNumber || '—'}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                RN:{' '}
                {String(
                  (resendRnRow as any)?.alftRnName ||
                    (resendRnRow as any)?.assignedRnName ||
                    'Assigned RN'
                ).trim()}{' '}
                {String((resendRnRow as any)?.alftRnEmail || (resendRnRow as any)?.assignedRnEmail || '')
                  .trim()
                  ? `(${String((resendRnRow as any)?.alftRnEmail || (resendRnRow as any)?.assignedRnEmail).trim()})`
                  : ''}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alft-resend-rn-note">Why are you resending? (required)</Label>
              <textarea
                id="alft-resend-rn-note"
                value={resendRnNote}
                onChange={(e) => setResendRnNote(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Signature link expired / RN has not signed yet / form was updated after prior send."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setResendRnDialogOpen(false)}
              disabled={Boolean(sigRequestingId)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmResendRn()}
              disabled={Boolean(sigRequestingId) || !String(resendRnNote).trim()}
            >
              {sigRequestingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Continue to confirm…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmResendSwSendOpen} onOpenChange={setConfirmResendSwSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {swEmailPreview?.alreadySent ? 'Confirm re-send to social worker?' : 'Confirm send to social worker?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Email will be sent to{' '}
                  <span className="font-medium text-foreground">
                    {swEmailPreviewUseTestOverride
                      ? String(swEmailPreviewTestEmail || '').trim() || 'test override address'
                      : String(swEmailPreview?.to || '').trim() || 'the assigned social worker'}
                  </span>
                  .
                </p>
                <p>
                  Member:{' '}
                  <span className="font-medium text-foreground">
                    {String(swEmailPreviewRow?.memberName || '—')}
                  </span>
                  {swEmailPreviewRow?.memberMrn
                    ? ` · MRN ${String(swEmailPreviewRow.memberMrn)}`
                    : ''}
                </p>
                <p>This does not change approval status — it only re-notifies them.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResendingSwFromEdit}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isResendingSwFromEdit || !swPreviewActionRow}
              onClick={(e) => {
                e.preventDefault();
                void executeConfirmedResendSw();
              }}
            >
              {isResendingSwFromEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : swEmailPreview?.alreadySent ? (
                'Yes, re-send email'
              ) : (
                'Yes, send email'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResendRnSendOpen} onOpenChange={setConfirmResendRnSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasRnElectronicallySigned(resendRnRow)
                ? 'Confirm new RN signature request?'
                : 'Confirm re-send to RN?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {hasRnElectronicallySigned(resendRnRow)
                    ? 'The prior RN signature will be cleared and a new signature-request email will go to '
                    : 'Another signature-request email will go to '}
                  <span className="font-medium text-foreground">
                    {String(
                      (resendRnRow as any)?.alftRnName ||
                        (resendRnRow as any)?.assignedRnName ||
                        'the assigned RN'
                    ).trim()}
                    {String((resendRnRow as any)?.alftRnEmail || (resendRnRow as any)?.assignedRnEmail || '')
                      .trim()
                      ? ` (${String(
                          (resendRnRow as any)?.alftRnEmail || (resendRnRow as any)?.assignedRnEmail
                        ).trim()})`
                      : ''}
                  </span>
                  .
                </p>
                <p>
                  Member:{' '}
                  <span className="font-medium text-foreground">{resendRnRow?.memberName || '—'}</span>
                  {resendRnRow?.medicalRecordNumber
                    ? ` · MRN ${resendRnRow.medicalRecordNumber}`
                    : ''}
                </p>
                {String(resendRnNote || '').trim() ? (
                  <p className="rounded-md border bg-muted/40 px-2 py-1.5 text-foreground">
                    Note: {String(resendRnNote).trim()}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(sigRequestingId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(sigRequestingId)}
              onClick={(e) => {
                e.preventDefault();
                void executeConfirmedResendRn();
              }}
            >
              {sigRequestingId ? (
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

      <RejectDialog
        rejectDialogOpen={rejectDialogOpen}
        setRejectDialogOpen={setRejectDialogOpen}
        rejectRow={rejectRow}
        rejectSwName={rejectSwName}
        rejectSwEmail={rejectSwEmail}
        rejectTarget={rejectTarget}
        setRejectTarget={setRejectTarget}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        rejectingId={rejectingId}
        returnForEdits={returnForEdits}
      />

      <Dialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Final preview before sending</DialogTitle>
            <DialogDescription>
              Review the final ALFT PDF packet, then confirm to email it to Jocelyn.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{sendConfirmRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">{sendConfirmRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/admin/alft-view/${encodeURIComponent(String(sendConfirmRow?.id || ''))}`} target="_blank">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open final preview
                </Link>
              </Button>
              {sendConfirmRow?.alftSignature?.requestId ? (
                <Button
                  variant="outline"
                  onClick={() => void downloadSignaturePdf(String(sendConfirmRow.alftSignature?.requestId), 'packet')}
                  disabled={!sendConfirmRow?.alftSignature?.packetPdfStoragePath}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download final PDF packet
                </Button>
              ) : null}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={sendConfirmChecked}
                onChange={(e) => setSendConfirmChecked(e.target.checked)}
              />
              I reviewed the final preview and confirm this completed ALFT should be sent as PDF.
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSendConfirmOpen(false)} disabled={Boolean(sendingCompletedId)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendConfirmRow && void sendCompletedToJh(sendConfirmRow)}
              disabled={!sendConfirmChecked || Boolean(sendingCompletedId)}
            >
              {sendingCompletedId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send completed PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <BackToTop />
    </div>
  );
}

