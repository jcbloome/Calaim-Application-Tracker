'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
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
import { ClipboardList, Download, Loader2, RefreshCw, Search, Send, User } from 'lucide-react';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';

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
  alftForm?: { exactPacketAnswers?: Record<string, AnswerValue> };
  alftSignature?: Record<string, any>;
};

type DownloadLog = {
  id: string;
  downloadName: string;
  memberName: string;
  createdAt: string;
  staffName: string;
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
const todayLocalKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const buildBlankAnswers = (): AnswerMap => {
  const next = createInitialExactAlftAnswers() as AnswerMap;
  next.p1_agency = AGENCY_NAME;
  return next;
};

export default function IspWorkflowToolsPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();
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
  const canPrefillIspForm =
    hasPreviewForSelection && !isLoadingPreview && missingRequiredLabels.length === 0;

  const workflowStatus = clean(activeIntake?.workflowStatus).toLowerCase();
  const canFirstReview =
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('returned_to_sw');
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
          clean(cleanedResolved.p1_assessor_name) ||
          clean(source.Social_Worker_Assigned) ||
          clean(source.social_worker_assigned);
        const swEmail =
          clean(source.Social_Worker_Email) ||
          clean(source.SW_Email) ||
          clean(source.assignedSwEmail);

        setResolvedPreview(cleanedResolved);
        setSocialWorkerName(swName);
        setSocialWorkerEmail(swEmail);

        if (firestore) {
          const assignmentSnap = await getDoc(doc(firestore, 'alft_assignments', memberId)).catch(() => null);
          const assignment = assignmentSnap?.exists() ? (assignmentSnap.data() as any) : null;
          if (assignment) {
            if (clean(assignment.assignedSwEmail)) setSocialWorkerEmail(clean(assignment.assignedSwEmail));
            if (clean(assignment.assignedSwName) && !swName) setSocialWorkerName(clean(assignment.assignedSwName));
            if (clean(assignment.alftStaffUid)) setFirstReviewerUid((prev) => prev || clean(assignment.alftStaffUid));
            if (clean(assignment.alftRnUid)) setRnUid((prev) => prev || clean(assignment.alftRnUid));
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
      return;
    }
    // Selecting a member: show Caspio readiness immediately (do not open form yet).
    setShowForm(false);
    setCaspioFilledIds([]);
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
        next[key] = cleaned;
        filledIds.push(key);
      });
      next.p1_agency = AGENCY_NAME;
      if (!clean(next.p1_assessment_date)) next.p1_assessment_date = todayLocalKey();
      if (!clean(next.p1_member_name) && member) next.p1_member_name = toName(member);

      const swName =
        clean(next.p1_assessor_name) ||
        clean(source.Social_Worker_Assigned) ||
        socialWorkerName;
      const swEmail =
        clean(source.Social_Worker_Email) ||
        clean(source.SW_Email) ||
        socialWorkerEmail;

      setResolvedPreview(cleanedResolved);
      setAnswers(next);
      setCaspioFilledIds(filledIds);
      setSocialWorkerName(swName);
      setSocialWorkerEmail(swEmail);
      setShowForm(true);
      setSelectedClientId(memberId);

      toast({
        title: 'ISP form prefilled',
        description: `${filledIds.length} Caspio fields applied (highlighted in green).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Prefill ISP form failed', description: String(error?.message || error) });
    } finally {
      setIsPrefilling(false);
    }
  };

  const saveWorkflowRouting = async () => {
    const memberId = selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId);
    if (!firestore || !memberId) {
      toast({ variant: 'destructive', title: 'Select a member first' });
      return;
    }
    if (!firstReviewer) {
      toast({ variant: 'destructive', title: 'Choose first-review staff' });
      return;
    }
    setSavingRouting(true);
    try {
      await setDoc(
        doc(firestore, 'alft_assignments', memberId),
        {
          memberId,
          memberName: selectedMember ? toName(selectedMember) : clean(answers.p1_member_name),
          memberMrn: selectedMember ? clean(selectedMember.memberMrn) : clean(answers.p1_mrn),
          assignedSwName: socialWorkerName || clean(answers.p1_assessor_name) || null,
          assignedSwEmail: socialWorkerEmail || null,
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

      toast({
        title: 'Workflow routing saved',
        description: `After SW submit → ${firstReviewer.label}. After SW signature → ${assignedRn.label} (${assignedRn.email}).`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Could not save routing', description: String(error?.message || error) });
    } finally {
      setSavingRouting(false);
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
        description: 'SW was emailed to make changes and re-submit.',
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
    setBusyAction('accept');
    try {
      await saveWorkflowRouting();
      setBusyAction('accept');
      const saved = await saveFormEdits();
      if (!saved) return;
      setBusyAction('accept');
      const idToken = await getIdToken();
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: activeIntake.id,
          overrideRnEmail: assignedRn.email,
          overrideRnName: assignedRn.label,
          deferRnEmail: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) throw new Error(String(body?.error || 'Signature request failed'));
      toast({
        title: 'Sent to social worker for signature',
        description: `After SW signs, ${assignedRn.label} (${assignedRn.email}) will be emailed for RN review.`,
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
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>ISP Workflow</CardTitle>
            <Badge variant="outline">Tools / Kaiser</Badge>
          </div>
          <CardDescription>
            Select a member to auto-check Caspio fields (green = ready). Prefill ISP Form when ready, then route
            SW submit → staff review → SW signature → RN → final download.
          </CardDescription>
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
                  Select a member to auto-check required Caspio fields (green = ready). When everything looks good,
                  Prefill ISP Form — same pattern as the Cover Sheet Generator.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedMember ? (
                  <>
                    <div className="rounded-md border p-3 text-sm">
                      <div><span className="font-medium">Member:</span> {toName(selectedMember)}</div>
                      <div><span className="font-medium">Client_ID2:</span> {clientIdOf(selectedMember)}</div>
                      <div><span className="font-medium">MRN:</span> {clean(selectedMember.memberMrn) || 'N/A'}</div>
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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium">
                          First review staff (ALFT ISP Reviewers)
                        </label>
                        <select
                          className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
                          value={firstReviewerUid}
                          onChange={(e) => setFirstReviewerUid(e.target.value)}
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
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Assigned RN (after SW signature)</label>
                        <select
                          className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
                          value={rnUid}
                          onChange={(e) => setRnUid(e.target.value)}
                        >
                          {(rnOptions.length ? rnOptions : staffOptions).map((s) => (
                            <option key={s.uid} value={s.uid}>
                              {s.label} ({s.email})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-muted-foreground">Default: leslie@carehomefinders.com</div>
                      </div>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                      <div className="font-medium text-sm text-slate-900">Flow</div>
                      <ol className="mt-2 list-decimal space-y-1 pl-4">
                        <li>SW submits → <span className="font-medium">{firstReviewer?.label || 'selected staff'}</span></li>
                        <li>Staff edits, then Accept (SW signature) or Request changes</li>
                        <li>SW signs → email to <span className="font-medium">{assignedRn.label}</span></li>
                        <li>RN edits/signs → back to <span className="font-medium">{firstReviewer?.label || 'selected staff'}</span> for final review + download</li>
                      </ol>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => void prefillIspForm()}
                        disabled={isPrefilling || isLoadingPreview || !canPrefillIspForm}
                      >
                        {isPrefilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Prefill ISP Form
                      </Button>
                      <Button variant="outline" onClick={() => void saveWorkflowRouting()} disabled={savingRouting || !firstReviewer}>
                        {savingRouting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Workflow Routing
                      </Button>
                      <Button variant="outline" asChild>
                        <Link href="/admin/alft-tracker">
                          <ClipboardList className="mr-2 h-4 w-4" />
                          ALFT Tracker
                        </Link>
                      </Button>
                    </div>
                    {!canPrefillIspForm && hasPreviewForSelection && missingRequiredLabels.length > 0 ? (
                      <div className="text-xs text-amber-700">
                        Prefill ISP Form unlocks after all required Caspio fields are ready (green).
                      </div>
                    ) : null}
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
                    Accept → SW Signature
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
                <div className="text-sm font-medium">Firestore download log</div>
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
            ) : null}
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
                  Green fields came from Caspio. Staff can edit during first review; RN can edit before signing.
                </CardDescription>
              </div>
              <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                {caspioFilledIds.length} Caspio fields
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <SwStyleAlftEditor
              answers={answers}
              onChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
              memberName={clean(answers.p1_member_name)}
              memberMrn={clean(answers.p1_mrn)}
              highlightedFieldIds={caspioFilledIds}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
