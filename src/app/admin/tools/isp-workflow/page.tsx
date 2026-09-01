'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { CheckCircle2, ClipboardList, Download, ExternalLink, Loader2, RefreshCw, Search, Send, Upload, User } from 'lucide-react';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth, useFirestore, useStorage, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  ISP_ALFT_LOCKED_FIELD_IDS,
  applyIspAlftLockedFieldDefaults,
  isIspAlftLockedField,
} from '@/lib/isp-alft-field-rules';

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
  { id: 'p2_facility_name', label: 'Facility / ISP Location' },
  { id: 'p2_current_street', label: 'Current Street' },
  { id: 'p2_home_street', label: 'Home Street' },
];

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
  const { toast } = useToast();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const searchParams = useSearchParams();
  const intakeIdFromQuery = clean(searchParams.get('intakeId'));

  const [members, setMembers] = useState<KaiserMember[]>([]);
  const [queryText, setQueryText] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [resolvedPreview, setResolvedPreview] = useState<Record<string, string>>({});
  const [previewMemberId, setPreviewMemberId] = useState('');
  const [lastLoadedLabel, setLastLoadedLabel] = useState('');
  const [answers, setAnswers] = useState<AnswerMap>(() => buildBlankAnswers());
  const [caspioFilledIds, setCaspioFilledIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [socialWorkerName, setSocialWorkerName] = useState('');
  const [socialWorkerEmail, setSocialWorkerEmail] = useState('');
  const [confirmedSw, setConfirmedSw] = useState(false);
  const [confirmedFirstReviewer, setConfirmedFirstReviewer] = useState(false);
  const [confirmedRn, setConfirmedRn] = useState(false);
  const [assessmentPurpose, setAssessmentPurpose] = useState<'initial' | 'change_condition' | 'review' | ''>('');
  const [confirmedPurpose, setConfirmedPurpose] = useState(false);
  const [confirmedClinicalUploads, setConfirmedClinicalUploads] = useState(false);
  const [swPortalSupportFiles, setSwPortalSupportFiles] = useState<SwPortalSupportFile[]>([]);
  const [clinicalUploadLabel, setClinicalUploadLabel] = useState('');
  const [clinicalUploadFiles, setClinicalUploadFiles] = useState<File[]>([]);
  const [clinicalUploading, setClinicalUploading] = useState(false);
  const [clinicalUploadProgress, setClinicalUploadProgress] = useState(0);
  const [formPreviewVerified, setFormPreviewVerified] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [socialWorkerCounty, setSocialWorkerCounty] = useState('');
  const [memberCounty, setMemberCounty] = useState('');
  const [routingAutosaveLabel, setRoutingAutosaveLabel] = useState('');
  const [invitePreviewOpen, setInvitePreviewOpen] = useState(false);
  const [invitePreviewBody, setInvitePreviewBody] = useState('');
  const lastAutosavedRoutingKey = useRef('');
  const [assignmentActivity, setAssignmentActivity] = useState<{
    invitedAt?: string;
    invitedTo?: string;
    viewedAt?: string;
    viewedBy?: string;
    submittedAt?: string;
    signedAt?: string;
    emailLog?: Array<{ status?: string; recipientEmail?: string; atIso?: string; isResend?: boolean }>;
  }>({});

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [rnOptions, setRnOptions] = useState<StaffOption[]>([]);
  const [firstReviewerUid, setFirstReviewerUid] = useState('');
  const [rnUid, setRnUid] = useState('');
  const [savingRouting, setSavingRouting] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [rejectReason, setRejectReason] = useState('');
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
        value: clean(resolvedPreview[field.id] || answers[field.id]),
      })),
    [resolvedPreview, answers]
  );
  const missingRequiredLabels = useMemo(
    () => requiredFieldStatuses.filter((field) => !field.value).map((field) => field.label),
    [requiredFieldStatuses]
  );
  const hasPreviewForSelection =
    Boolean(previewMemberId) &&
    previewMemberId === (selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId));
  const stepsConfirmedForPrefill =
    confirmedSw &&
    confirmedFirstReviewer &&
    confirmedRn &&
    confirmedPurpose &&
    confirmedClinicalUploads &&
    Boolean(assessmentPurpose);
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
    if (!confirmedFirstReviewer) reasons.push('Confirm first review staff (step 2)');
    if (!confirmedRn) reasons.push('Confirm RN (step 3)');
    if (!confirmedPurpose || !assessmentPurpose) reasons.push('Select and confirm purpose (step 4)');
    if (!confirmedClinicalUploads) reasons.push('Confirm member clinical uploads (step 5)');
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
    confirmedPurpose,
    confirmedRn,
    confirmedSw,
    firstReviewer,
    hasPreviewForSelection,
    isLoadingPreview,
    missingRequiredLabels,
    socialWorkerEmail,
    socialWorkerName,
  ]);

  const canVerifyFormPreview = showForm && canPrefillIspForm;
  const canSendSwInvite =
    canVerifyFormPreview &&
    formPreviewVerified &&
    Boolean(socialWorkerEmail) &&
    Boolean(firstReviewer);

  const workflowStatus = clean(activeIntake?.workflowStatus).toLowerCase();
  const canFirstReview =
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('returned_to_sw');
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
      if (data?.alftForm?.exactPacketAnswers) {
        setAnswers({ ...buildBlankAnswers(), ...(data.alftForm.exactPacketAnswers as AnswerMap) });
        setShowForm(true);
      }
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
          body: JSON.stringify({ idToken, memberId }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Could not load Caspio fields'));

        const resolved = (body.resolved || {}) as Record<string, string>;
        const source = (body.source || {}) as Record<string, unknown>;
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

        setResolvedPreview(cleanedResolved);
        setSocialWorkerName(swName);
        setSocialWorkerEmail(swEmailFromCaspio);
        setSocialWorkerCounty(swCounty);
        setMemberCounty(nextMemberCounty);

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
            const invitedAt =
              toIso(assignment?.workflowInvites?.invitedAt) ||
              toIso(assignment?.workflowStepsAt?.swInviteSentAt) ||
              '';
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
            setAssignmentActivity({
              invitedAt,
              invitedTo: clean(assignment.assignedSwEmail) || clean(emailLog.find((e) => e.status === 'sent')?.recipientEmail),
              viewedAt: toIso(assignment.swPortalLastViewedAt),
              viewedBy:
                clean(assignment.swPortalLastViewedByName) ||
                clean(assignment.swPortalLastViewedByEmail),
              submittedAt:
                toIso(assignment.submittedAt) ||
                toIso(assignment?.workflowStepsAt?.swSubmittedAt) ||
                '',
              signedAt:
                toIso(assignment?.workflowStepsAt?.swSubmittedSignedAt) ||
                toIso(assignment.swSignedAt) ||
                '',
              emailLog,
            });
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
    [firestore, getIdToken]
  );

  const selectedMemberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);

  useEffect(() => {
    if (!selectedMemberId) {
      setResolvedPreview({});
      setPreviewMemberId('');
      setPreviewError('');
      setSocialWorkerName('');
      setSocialWorkerEmail('');
      setSocialWorkerCounty('');
      setMemberCounty('');
      setConfirmedSw(false);
      setConfirmedFirstReviewer(false);
      setConfirmedRn(false);
      setAssessmentPurpose('');
      setConfirmedPurpose(false);
      setConfirmedClinicalUploads(false);
      setSwPortalSupportFiles([]);
      setClinicalUploadLabel('');
      setClinicalUploadFiles([]);
      setFormPreviewVerified(false);
      setAssignmentActivity({});
      setRoutingAutosaveLabel('');
      lastAutosavedRoutingKey.current = '';
      return;
    }
    // Selecting a member: show Caspio readiness immediately (do not open form yet).
    setShowForm(false);
    setCaspioFilledIds([]);
    setConfirmedSw(false);
    setConfirmedFirstReviewer(false);
    setConfirmedRn(false);
    setAssessmentPurpose('');
    setConfirmedPurpose(false);
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
    if (!confirmedSw || !confirmedFirstReviewer || !confirmedRn || !confirmedPurpose || !confirmedClinicalUploads || !assessmentPurpose) {
      toast({
        variant: 'destructive',
        title: 'Confirm routing first',
        description:
          'Confirm social worker, first review staff, RN, purpose, and member clinical uploads before prefilling.',
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
        body: JSON.stringify({ idToken, memberId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) throw new Error(String(body?.error || 'Prefill failed'));
      const latestResolved = (body.resolved || {}) as Record<string, string>;
      const source = (body.source || {}) as Record<string, unknown>;

      const next = buildBlankAnswers();
      const filledIds: string[] = [];
      const cleanedResolved: Record<string, string> = {};
      Object.entries(latestResolved).forEach(([key, value]) => {
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
      next.p1_other_responder = '';
      next.p1_other_responder_name = '';
      next.p1_other_responder_relationship = '';
      next.p1_assessment_date = '';
      next.p2_alwp_agency = 'N/A';
      const nextWithLocked = applyIspAlftLockedFieldDefaults(next);
      for (const lockedId of ISP_ALFT_LOCKED_FIELD_IDS) {
        if (!filledIds.includes(lockedId)) filledIds.push(lockedId);
      }
      if (!clean(nextWithLocked.p2_current_state)) nextWithLocked.p2_current_state = 'CA';
      if (clean(nextWithLocked.p1_dob)) nextWithLocked.p1_dob = toMmDdYyyy(nextWithLocked.p1_dob);
      if (!filledIds.includes('p1_purpose')) filledIds.push('p1_purpose');
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
    await setDoc(
      doc(firestore, 'alft_assignments', memberId),
      {
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
      { merge: true }
    );

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
    const ispContactName = pick('p1_other_responder_name', pick('isp_contact_name'));
    const ispContactRelationship = pick('p1_other_responder_relationship', pick('isp_contact_relationship'));
    const ispPhone = pick('isp_contact_phone');
    const ispEmail = pick('isp_contact_email');
    const signatureName = firstReviewer?.label || user?.displayName || 'ALFT Reviewer';
    const signatureEmail = firstReviewer?.email || user?.email || '';
    return [
      `Hi ${swFirstNameOf(socialWorkerName)},`,
      '',
      'We have a client who needs a Kaiser ALFT Care Assessment.',
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
      'ISP Contact:',
      `${ispContactName || 'Not provided'} (${ispContactRelationship || 'Relationship not provided'})`,
      `Tel: ${ispPhone || 'Not provided'}`,
      `Email: ${ispEmail || 'Not provided'}`,
      '',
      'Please let me know about the assessment:',
      '- When it’s scheduled',
      '- When it’s completed',
      "- Please let me know once you've submitted your invoice, so I can take the client off of your caseload list.",
      '',
      'To complete the ALFT and signature workflow, open this link:',
      '/sw-portal/alft-upload',
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
    resolvedPreview,
    selectedMember,
    socialWorkerName,
    memberCounty,
    socialWorkerCounty,
    firstReviewer,
    user?.displayName,
    user?.email,
  ]);

  const openSwInvitePreview = () => {
    if (!canSendSwInvite) {
      toast({
        variant: 'destructive',
        title: 'Complete steps 1–7 first',
        description:
          'Confirm SW, first review staff, RN, purpose, clinical uploads, prefill the form, and verify the preview.',
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
    setAssignmentActivity({
      invitedAt:
        toIso(assignment?.workflowInvites?.invitedAt) || toIso(assignment?.workflowStepsAt?.swInviteSentAt) || '',
      invitedTo: clean(assignment.assignedSwEmail) || clean(emailLog.find((e) => e.status === 'sent')?.recipientEmail),
      viewedAt: toIso(assignment.swPortalLastViewedAt),
      viewedBy: clean(assignment.swPortalLastViewedByName) || clean(assignment.swPortalLastViewedByEmail),
      submittedAt: toIso(assignment.submittedAt) || toIso(assignment?.workflowStepsAt?.swSubmittedAt) || '',
      signedAt: toIso(assignment?.workflowStepsAt?.swSubmittedSignedAt) || toIso(assignment.swSignedAt) || '',
      emailLog,
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
          const task = uploadBytesResumable(storageRef, file);
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
          uploadedAt: serverTimestamp(),
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

      const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
      const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
      const nextFiles = assignment ? parseSwPortalSupportFiles(assignment.swPortalSupportFiles) : [];
      if (nextFiles.length) setSwPortalSupportFiles(nextFiles);

      setConfirmedClinicalUploads(true);
      toast({
        title: uploadedSupportFiles.length > 1 ? 'Clinical files uploaded' : 'Clinical file uploaded',
        description: 'Uploaded to the SW portal for this member. Step 5 confirmed.',
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
        title: 'Complete steps 1–7 first',
        description:
          'Confirm SW, first review staff, RN, purpose, clinical uploads, prefill the form, and verify the preview.',
      });
      return;
    }
    if (!socialWorkerEmail) {
      toast({ variant: 'destructive', title: 'Social worker email required' });
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
            ispContactPhone: pick('isp_contact_phone'),
            ispContactName: pick('isp_contact_name') || pick('p1_other_responder_name'),
            ispContactRelationship: pick('isp_contact_relationship') || pick('p1_other_responder_relationship'),
            ispContactEmail: pick('isp_contact_email'),
            ispContactConfirmDate: pick('isp_contact_confirm_date'),
            otherResponder: pick('p1_other_responder', 'no'),
            otherResponderName: pick('p1_other_responder_name'),
            otherResponderRelationship: pick('p1_other_responder_relationship'),
            socialWorkerAssigned: socialWorkerName || pick('p1_assessor_name'),
            assignedSwEmail: socialWorkerEmail,
            prefillSourceMode: 'caspio_selected_fields',
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Invite failed (HTTP ${res.status})`));
      }

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
      await loadIntakeById(activeIntake.id);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Accept failed', description: String(error?.message || error) });
    } finally {
      setBusyAction('');
    }
  };

  const completeFinalReview = async () => {
    if (!activeIntake?.id) return;
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
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
              <div className="flex items-center gap-2 font-semibold">
                <User className="h-4 w-4" />
                Social worker on this ISP / ALFT
              </div>
              <div className="mt-1">
                {socialWorkerName || 'Name not in Caspio'}
                {socialWorkerEmail ? ` • ${socialWorkerEmail}` : ''}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void fetchMembers({ source: 'cache' })} disabled={isLoadingMembers}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingMembers ? 'animate-spin' : ''}`} />
              Load
            </Button>
            <Button variant="outline" size="sm" onClick={() => void fetchMembers({ source: 'caspio' })} disabled={isLoadingMembers}>
              Refresh from Caspio
            </Button>
            {lastLoadedLabel ? (
              <span className="text-xs text-muted-foreground">Last loaded: {lastLoadedLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Click Load to fetch Kaiser members.</span>
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
                        onClick={() => setSelectedClientId(clientId2)}
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
                <CardTitle className="text-base">Member Caspio check &amp; routing</CardTitle>
                <CardDescription>
                  Complete steps 1–8 in order above the assessment form. Green Caspio fields must be ready before
                  prefill (step 6).
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
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">Required Caspio fields for ISP / ALFT</div>
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

                      <div className={`rounded-md border bg-white p-3 ${confirmedSw ? 'border-green-300' : ''}`}>
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">1</Badge>
                          Confirm social worker
                          {confirmedSw ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
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
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">Email (invite destination)</label>
                            <Input
                              value={socialWorkerEmail}
                              onChange={(e) => {
                                setSocialWorkerEmail(e.target.value);
                                setConfirmedSw(false);
                              }}
                              placeholder="From CalAIM_tbl_Social_Worker.SW_email"
                            />
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Pulled from Caspio <span className="font-medium">CalAIM_tbl_Social_Worker.SW_email</span> (same
                              email used when activating SW portal access).
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium">SW county</label>
                            <Input
                              value={socialWorkerCounty}
                              onChange={(e) => {
                                setSocialWorkerCounty(e.target.value);
                                setConfirmedSw(false);
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
                                setConfirmedSw(false);
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
                            setConfirmedSw(true);
                            toast({
                              title: 'Social worker confirmed',
                              description: `${socialWorkerName || 'SW'} · ${socialWorkerEmail}`,
                              className: 'bg-green-100 text-green-900 border-green-200',
                            });
                          }}
                        >
                          {confirmedSw ? 'Confirmed' : 'Confirm social worker'}
                        </Button>
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
                          Select purpose — it is written into the form on prefill.
                        </p>
                        <div className="mb-2 flex flex-wrap gap-3 text-sm">
                          {[
                            { value: 'initial' as const, label: 'Initial' },
                            { value: 'change_condition' as const, label: 'Change of Condition' },
                            { value: 'review' as const, label: 'Review' },
                          ].map((opt) => (
                            <label key={opt.value} className="inline-flex items-center gap-2">
                              <input
                                type="radio"
                                name="isp-assessment-purpose"
                                checked={assessmentPurpose === opt.value}
                                disabled={!confirmedRn}
                                onChange={() => {
                                  setAssessmentPurpose(opt.value);
                                  // Selecting purpose confirms step 4 (no extra Confirm click).
                                  setConfirmedPurpose(true);
                                }}
                                className="h-4 w-4 accent-blue-700"
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        {confirmedPurpose && assessmentPurpose ? (
                          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Purpose confirmed (
                            {assessmentPurpose === 'initial'
                              ? 'Initial'
                              : assessmentPurpose === 'change_condition'
                                ? 'Change of Condition'
                                : 'Review'}
                            )
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Select a purpose to continue.</div>
                        )}
                      </div>

                      <div
                        className={`rounded-md border bg-white p-3 ${
                          confirmedClinicalUploads ? 'border-green-300' : !confirmedPurpose ? 'opacity-70' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Badge variant="outline">5</Badge>
                          Member clinical uploads
                          {confirmedClinicalUploads ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Choose 602, facesheet, and other clinical documents — they upload automatically to the SW
                          portal for this member. Labels are inferred from filenames (e.g. “602”) when left blank.
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
                              disabled={!confirmedPurpose || clinicalUploading}
                            />
                            <input
                              id="isp-clinical-upload-input"
                              type="file"
                              multiple
                              disabled={!confirmedPurpose || clinicalUploading}
                              onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                e.target.value = '';
                                if (!files.length || !confirmedPurpose) return;
                                void uploadMemberClinicalFiles(files, clinicalUploadLabel);
                              }}
                              className="text-xs"
                            />
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
                            disabled={!confirmedPurpose || clinicalUploading}
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
                          <Badge variant="outline">6</Badge>
                          Prefill ISP form
                          {showForm ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Unlocks after steps 1–5 and all required Caspio fields are ready. “Besides client answering”
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
                          <Badge variant="outline">7</Badge>
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
                          <Badge variant="outline">8</Badge>
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveFormEdits()} disabled={Boolean(busyAction)}>
                {busyAction === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Form Edits
              </Button>
              {canFirstReview ? (
                <>
                  <Button onClick={() => void acceptAndSendForSignature()} disabled={Boolean(busyAction)}>
                    {busyAction === 'accept' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {swAlreadySigned ? 'Approve → Send to RN' : 'Accept → SW Signature'}
                  </Button>
                </>
              ) : null}
              {canFinalReview || canDownloadPacket ? (
                <Button variant="outline" onClick={() => void completeFinalReview()} disabled={Boolean(busyAction)}>
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
                <Button variant="destructive" size="sm" onClick={() => void requestChanges()} disabled={Boolean(busyAction)}>
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
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>ISP / ALFT Assessment Form</CardTitle>
                <CardDescription>
                  Step 7: review this preview before sending the SW invite. Green fields are prefilled from member
                  data. Staff can edit during first review; RN can edit before signing.
                </CardDescription>
              </div>
              <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                {caspioFilledIds.length} prefilled fields
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <SwStyleAlftEditor
              answers={answers}
              onChange={(id, value) => {
                if (isIspAlftLockedField(id)) return;
                setAnswers((prev) => ({ ...prev, [id]: value }));
              }}
              memberName={clean(answers.p1_member_name)}
              memberMrn={clean(answers.p1_mrn)}
              highlightedFieldIds={caspioFilledIds}
              disabledFieldIds={ISP_ALFT_LOCKED_FIELD_IDS}
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
    </div>
  );
}
