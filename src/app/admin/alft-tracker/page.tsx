'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, UploadCloud, ExternalLink, RefreshCw, UserCheck, CheckCircle2, Send, Download, ClipboardList } from 'lucide-react';
import { ExactAlftQuestionnaire, createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  arrayUnion,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

type StandaloneUpload = {
  id: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
  toolCode?: string;
  documentType: string;
  files: Array<{ fileName: string; downloadURL: string; storagePath?: string; uploadedAtIso?: string | null }>;
  uploaderName?: string;
  uploaderEmail?: string;
  memberName: string;
  healthPlan?: string;
  medicalRecordNumber?: string | null;
  alftUploadDate?: string | null;
  alftForm?: {
    formVersion?: string;
    exactPacketAnswers?: Record<string, unknown> | null;
    facilityName?: string | null;
    priorityLevel?: string | null;
    transitionSummary?: string | null;
    barriersAndRisks?: string | null;
    requestedActions?: string | null;
    additionalNotes?: string | null;
  } | null;

  // Workflow / tracking fields (stored on the intake doc).
  alftRnUid?: string | null;
  alftRnName?: string | null;
  alftRnEmail?: string | null;
  alftRnAssignedAt?: any;
  alftRnDownloadedAt?: any;
  alftRnRevisionUploadedAt?: any;

  alftStaffUid?: string | null;
  alftStaffName?: string | null;
  alftStaffEmail?: string | null;
  alftStaffAssignedAt?: any;
  alftStaffReviewedAt?: any;

  alftSignature?: {
    requestId?: string;
    status?: string;
    requestedAt?: any;
    reviewedAt?: any;
    rnSignedAt?: any;
    mswSignedAt?: any;
    completedAt?: any;
    signaturePagePdfStoragePath?: string | null;
    packetPdfStoragePath?: string | null;
  } | null;

  alftRevisions?: Array<{
    fileName: string;
    downloadURL: string;
    storagePath?: string;
    uploadedByName?: string | null;
    uploadedByEmail?: string | null;
    uploadedAt?: any;
    note?: string | null;
  }>;
  uploaderUid?: string | null;
  alftCollaboration?: {
    allowAllPartiesEdit?: boolean;
    editableRoleKeys?: string[];
    editableUids?: string[];
    createdByUid?: string | null;
    lastEditedByUid?: string | null;
    lastEditedAt?: any;
  } | null;
  alftEditHistory?: Array<{
    editedAt?: any;
    editedAtIso?: string | null;
    editedByUid?: string | null;
    editedByName?: string | null;
    editedByEmail?: string | null;
    changedFields?: string[];
    changedExactQuestionIds?: string[];
    changedExactQuestionCount?: number;
    note?: string | null;
  }>;
  workflowEmailStatus?: {
    managerStep2Recipients?: number;
    managerStep2SentCount?: number;
    managerStep2EmailSentAt?: any;
    managerStep4Recipients?: number;
    managerStep4SentCount?: number;
    managerStep4EmailSentAt?: any;
  } | null;
  alftCompletionEmail?: {
    to?: string | null;
    sentByUid?: string | null;
    sentByEmail?: string | null;
    sentAt?: any;
  } | null;
};

type AlftAssignmentQueueRow = {
  id: string;
  memberId: string;
  memberName: string;
  memberMrn?: string | null;
  assignedSwId?: string | null;
  assignedSwName?: string | null;
  assignedSwEmail?: string | null;
  memberFirstName?: string | null;
  memberLastName?: string | null;
  birthDate?: string | null;
  memberSex?: string | null;
  memberPrimaryLanguage?: string | null;
  memberPhone?: string | null;
  alftPlanId?: string | null;
  ispCurrentAddressStreet?: string | null;
  ispCurrentAddressCity?: string | null;
  ispCurrentAddressState?: string | null;
  ispCurrentAddressZip?: string | null;
  currentLocationType?: string | null;
  assessmentSite?: string | null;
  homeAddressStreet?: string | null;
  homeAddressCity?: string | null;
  homeAddressState?: string | null;
  homeAddressZip?: string | null;
  ispFacilityName?: string | null;
  prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string | null;
  prefillPurpose?: string | null;
  prefillSourceLabel?: string | null;
  status?: string | null;
  workflowStatus?: string | null;
  workflowStage?: string | null;
  workflowInvites?: {
    swPortalPath?: string | null;
    managerWorkflowPath?: string | null;
  } | null;
  updatedAt?: any;
};

type StaffOption = { uid: string; label: string; email: string; role: 'Admin' | 'Super Admin' | 'Staff' };

const toLabel = (value: any) => String(value ?? '').trim();

const isAlft = (row: Partial<StandaloneUpload>) => {
  const toolCode = toLabel((row as any)?.toolCode).toUpperCase();
  const dtLower = toLabel((row as any)?.documentType).toLowerCase();
  return toolCode === 'ALFT' || dtLower.includes('alft');
};

const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

const fmtTimeline = (ms: number) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

const toEditHistoryMs = (entry: any): number => {
  const viaTs = toMs(entry?.editedAt);
  if (viaTs > 0) return viaTs;
  const viaIso = toMs(entry?.editedAtIso);
  return viaIso > 0 ? viaIso : 0;
};

type TimelineItem = { key: string; label: string; ms: number; by?: string };

const timelineFor = (r: StandaloneUpload): TimelineItem[] => {
  const items: TimelineItem[] = [];
  const receivedMs = toMs(r.createdAt) || 0;
  if (receivedMs) items.push({ key: 'received', label: 'Received', ms: receivedMs });

  const rnAssignedMs = toMs(r.alftRnAssignedAt);
  if (rnAssignedMs) items.push({ key: 'rnAssigned', label: 'RN assigned', ms: rnAssignedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const rnDownloadedMs = toMs(r.alftRnDownloadedAt);
  if (rnDownloadedMs) items.push({ key: 'rnDownloaded', label: 'RN downloaded', ms: rnDownloadedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const rnReuploadedMs = toMs(r.alftRnRevisionUploadedAt);
  if (rnReuploadedMs) {
    const latestRevision = (r.alftRevisions || []).slice(-1)[0] as any;
    const by = String(latestRevision?.uploadedByName || latestRevision?.uploadedByEmail || r.alftRnName || r.alftRnEmail || '').trim();
    items.push({ key: 'rnReuploaded', label: 'RN re-uploaded', ms: rnReuploadedMs, by });
  }

  const staffAssignedMs = toMs(r.alftStaffAssignedAt);
  if (staffAssignedMs) items.push({ key: 'staffAssigned', label: 'Staff assigned', ms: staffAssignedMs, by: r.alftStaffName || r.alftStaffEmail || '' });

  const sigRequestedMs = toMs((r as any)?.alftSignature?.requestedAt);
  if (sigRequestedMs) items.push({ key: 'sigRequested', label: 'Signatures requested', ms: sigRequestedMs });

  const rnSignedMs = toMs((r as any)?.alftSignature?.rnSignedAt);
  if (rnSignedMs) items.push({ key: 'rnSigned', label: 'RN signed', ms: rnSignedMs, by: r.alftRnName || r.alftRnEmail || '' });

  const mswSignedMs = toMs((r as any)?.alftSignature?.mswSignedAt);
  if (mswSignedMs) items.push({ key: 'mswSigned', label: 'MSW signed', ms: mswSignedMs, by: r.uploaderName || r.uploaderEmail || '' });

  const packetReady = Boolean((r as any)?.alftSignature?.packetPdfStoragePath);
  const completedMs = toMs((r as any)?.alftSignature?.completedAt);
  if (packetReady && completedMs) items.push({ key: 'packetReady', label: 'Packet ready', ms: completedMs });

  const managerReviewedMs = toMs((r as any)?.alftManagerReview?.reviewedAt);
  if (managerReviewedMs) {
    const by = toLabel((r as any)?.alftManagerReview?.reviewedByName || (r as any)?.alftManagerReview?.reviewedByEmail);
    items.push({ key: 'managerReviewed', label: 'Kaiser manager reviewed', ms: managerReviewedMs, by });
  }

  return items
    .filter((x) => x.ms > 0)
    .sort((a, b) => a.ms - b.ms);
};

type StageKey =
  | 'received'
  | 'returned_to_sw'
  | 'rn_assigned'
  | 'rn_downloaded'
  | 'rn_reuploaded'
  | 'staff_assigned'
  | 'sent_for_signature'
  | 'manager_review'
  | 'ready_to_send'
  | 'completed';

const computeStage = (r: StandaloneUpload): StageKey => {
  const workflowStatus = toLabel((r as any)?.workflowStatus).toLowerCase();
  const managerStatus = toLabel((r as any)?.alftManagerReview?.status).toLowerCase();
  if (workflowStatus.includes('returned_to_sw_for_revision')) return 'returned_to_sw';
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) return 'manager_review';
  if (workflowStatus.includes('completed_sent_to_jocelyn') || toLabel(r.status).toLowerCase() !== 'pending') return 'completed';
  if (managerStatus === 'approved') return 'ready_to_send';
  if (workflowStatus.includes('awaiting_kaiser_manager_final_review') || managerStatus === 'pending') return 'manager_review';
  if (toMs((r as any)?.alftSignature?.requestedAt) > 0) return 'sent_for_signature';
  if (toMs(r.alftStaffAssignedAt) > 0) return 'staff_assigned';
  if (toMs(r.alftRnRevisionUploadedAt) > 0) return 'rn_reuploaded';
  if (toMs(r.alftRnDownloadedAt) > 0) return 'rn_downloaded';
  if (toMs(r.alftRnAssignedAt) > 0) return 'rn_assigned';
  return 'received';
};

const stageBadge = (stage: StageKey) => {
  switch (stage) {
    case 'received':
      return <Badge variant="secondary">1) Received</Badge>;
    case 'returned_to_sw':
      return <Badge className="bg-red-700 text-white hover:bg-red-700">Returned to SW revision</Badge>;
    case 'rn_assigned':
      return <Badge className="bg-indigo-600 text-white hover:bg-indigo-600">1) Assigned</Badge>;
    case 'rn_downloaded':
      return <Badge className="bg-blue-600 text-white hover:bg-blue-600">2) RN downloaded</Badge>;
    case 'rn_reuploaded':
      return <Badge className="bg-purple-700 text-white hover:bg-purple-700">2) RN re-uploaded</Badge>;
    case 'staff_assigned':
      return <Badge className="bg-amber-600 text-white hover:bg-amber-600">3) Staff review</Badge>;
    case 'sent_for_signature':
      return <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">3) Signatures requested</Badge>;
    case 'manager_review':
      return <Badge className="bg-blue-700 text-white hover:bg-blue-700">4) Kaiser manager review</Badge>;
    case 'ready_to_send':
      return <Badge className="bg-violet-700 text-white hover:bg-violet-700">5) Ready to email Jocelyn</Badge>;
    case 'completed':
      return <Badge variant="outline">Complete</Badge>;
  }
};

const nextStepForAssignment = (row: AlftAssignmentQueueRow) => {
  const status = String(row?.status || '').toLowerCase();
  const workflowStatus = String(row?.workflowStatus || '').toLowerCase();
  if (workflowStatus.includes('sw_invited') || status === 'sw_form_in_progress') {
    return 'Next: SW logs into portal, completes prepopulated ALFT, and submits with signature.';
  }
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return 'Next: ALFT manager reviews; return to SW for corrections or advance to RN/signature step.';
  }
  if (workflowStatus.includes('returned_to_sw_for_revision')) {
    return 'Next: SW applies corrections, re-signs, and resubmits for manager review.';
  }
  if (workflowStatus.includes('awaiting_rn_revision_and_signatures') || workflowStatus.includes('awaiting_rn_final_signature')) {
    return 'Next: RN reviews/edits and signs; then manager is notified for final review.';
  }
  if (workflowStatus.includes('awaiting_kaiser_manager_final_review')) {
    return 'Next: Manager final review, then PDF packet is ready for download/send.';
  }
  return 'Next: Preview prefilled pages, then send workflow notice to SW.';
};

const asAnswer = (value: unknown) => String(value ?? '').trim();

const REQUIRED_PREFILL_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'p1_plan_id', label: 'Plan ID' },
  { key: 'p1_mrn', label: 'MRN Number' },
  { key: 'p1_member_name', label: 'Member Name' },
  { key: 'p1_assessor_name', label: 'Assessor Name' },
  { key: 'p2_first_name', label: 'First Name' },
  { key: 'p2_last_name', label: 'Last Name' },
  { key: 'p1_phone', label: 'Phone Number' },
  { key: 'p2_dob', label: 'Date of Birth' },
  { key: 'p2_sex', label: 'Sex' },
  { key: 'p1_primary_language', label: 'Primary Language' },
  { key: 'p2_current_street', label: 'Current Location Street' },
  { key: 'p2_current_city', label: 'Current Location City' },
  { key: 'p2_current_state', label: 'Current Location State' },
  { key: 'p2_current_zip', label: 'Current Location Zip' },
  { key: 'p2_current_type', label: 'Current Location Type' },
  { key: 'p2_assessment_site', label: 'Assessment Site' },
  { key: 'p2_home_street', label: 'Home Address Street' },
  { key: 'p2_home_city', label: 'Home Address City' },
  { key: 'p2_home_state', label: 'Home Address State' },
  { key: 'p2_home_zip', label: 'Home Address Zip' },
];

const resolvePrefillSourceMode = (row: AlftAssignmentQueueRow): 'cs_summary_app' | 'caspio_selected_fields' => {
  const mode = String(row.prefillSourceMode || '').trim().toLowerCase();
  if (mode === 'cs_summary_app') return 'cs_summary_app';
  if (mode === 'caspio_selected_fields') return 'caspio_selected_fields';
  const label = String(row.prefillSourceLabel || '').trim().toLowerCase();
  return label.includes('app cs summary') ? 'cs_summary_app' : 'caspio_selected_fields';
};

const prefillSourceBadgeLabel = (row: AlftAssignmentQueueRow) => {
  const mode = resolvePrefillSourceMode(row);
  return mode === 'cs_summary_app' ? 'Source: App' : 'Source: Caspio';
};

const assignmentWorkflowSteps = (row: AlftAssignmentQueueRow) => {
  const workflow = String(row.workflowStatus || '').toLowerCase();
  const status = String(row.status || '').toLowerCase();
  const hasInvite = workflow.includes('sw_invited') || status === 'sw_form_in_progress';
  const swSubmitted = workflow.includes('awaiting_manager_review_pre_rn');
  const managerLoop = workflow.includes('returned_to_sw_for_revision') || workflow.includes('awaiting_manager_review_pre_rn');
  const rnStep = workflow.includes('awaiting_rn') || workflow.includes('awaiting_rn_revision_and_signatures') || workflow.includes('awaiting_rn_final_signature');
  const finalManager = workflow.includes('awaiting_kaiser_manager_final_review');
  const complete = workflow.includes('completed_sent_to_jocelyn') || status === 'completed';

  return [
    { step: 1, label: 'ALFT prefill prepared (Page 1-2)', done: true, current: !hasInvite },
    { step: 2, label: 'SW notice sent + portal access enabled', done: hasInvite, current: hasInvite && !swSubmitted },
    { step: 3, label: 'SW completes/signs ALFT form in SW Portal', done: swSubmitted, current: hasInvite && !swSubmitted },
    { step: 4, label: 'ALFT manager review (return loop if needed)', done: managerLoop, current: swSubmitted && !rnStep },
    { step: 5, label: 'RN review/edits/signs final clinical packet', done: rnStep || finalManager || complete, current: rnStep && !finalManager },
    { step: 6, label: 'Kaiser manager final review + send PDF', done: finalManager || complete, current: finalManager && !complete },
  ];
};

const workflowChecklistFor = (r: StandaloneUpload) => {
  const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
  const managerStatus = String((r as any)?.alftManagerReview?.status || '').toLowerCase();
  const steps = [
    {
      label: '1) SW invited + form started',
      done: workflowStatus.includes('sw_invited') || workflowStatus.includes('awaiting_manager_review_pre_rn') || Boolean(toMs(r.createdAt)),
    },
    {
      label: '2) SW submitted + signed',
      done: workflowStatus.includes('awaiting_manager_review_pre_rn') || Boolean((r as any)?.alftSignature?.mswSignedAt),
    },
    {
      label: '3) Manager review (with return loop)',
      done: workflowStatus.includes('returned_to_sw_for_revision') || workflowStatus.includes('manager_review_pre_rn_complete_ready_for_rn'),
    },
    {
      label: '4) RN review + signature',
      done: Boolean((r as any)?.alftSignature?.rnSignedAt),
    },
    {
      label: '5) Manager final + PDF ready',
      done:
        managerStatus === 'approved' &&
        Boolean((r as any)?.alftSignature?.packetPdfStoragePath || (r as any)?.alftSignature?.signaturePagePdfStoragePath),
    },
  ];
  return steps;
};

const toIsoToday = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AdminAlftTrackerPage() {
  const { isAdmin, isSuperAdmin, isLoading, user } = useAdmin();
  const router = useRouter();
  const firestore = useFirestore();
  const storage = useStorage();
  const auth = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<StandaloneUpload[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<AlftAssignmentQueueRow[]>([]);
  const [search, setSearch] = useState('');
  const [focusId, setFocusId] = useState('');

  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignKind, setAssignKind] = useState<'rn' | 'staff'>('rn');
  const [assignRow, setAssignRow] = useState<StandaloneUpload | null>(null);
  const [assignUid, setAssignUid] = useState<string>('');

  const [revOpen, setRevOpen] = useState(false);
  const [revRow, setRevRow] = useState<StandaloneUpload | null>(null);
  const [revFile, setRevFile] = useState<File | null>(null);
  const [revNote, setRevNote] = useState('');
  const [revUploading, setRevUploading] = useState(false);
  const [revProgress, setRevProgress] = useState(0);

  const [sigRequestingId, setSigRequestingId] = useState('');
  const [sendingCompletedId, setSendingCompletedId] = useState('');
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendConfirmChecked, setSendConfirmChecked] = useState(false);
  const [sendConfirmRow, setSendConfirmRow] = useState<StandaloneUpload | null>(null);
  const [managerReviewingId, setManagerReviewingId] = useState('');
  const [rejectingId, setRejectingId] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRow, setRejectRow] = useState<StandaloneUpload | null>(null);
  const [rejectReason, setRejectReason] = useState('');
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
  const [editExactAnswers, setEditExactAnswers] = useState<Record<string, string | string[]>>(() =>
    createInitialExactAlftAnswers()
  );
  const [editTransitionSummary, setEditTransitionSummary] = useState('');
  const [editRequestedActions, setEditRequestedActions] = useState('');
  const [editBarriersAndRisks, setEditBarriersAndRisks] = useState('');
  const [editAdditionalNotes, setEditAdditionalNotes] = useState('');
  const [isKaiserAssignmentManager, setIsKaiserAssignmentManager] = useState(false);
  const [prefillPreviewOpen, setPrefillPreviewOpen] = useState(false);
  const [prefillPreviewRow, setPrefillPreviewRow] = useState<AlftAssignmentQueueRow | null>(null);
  const [prefillPurpose, setPrefillPurpose] = useState('review');
  const [prefillPreviewResolved, setPrefillPreviewResolved] = useState<Record<string, string>>({});
  const [prefillPreviewLoading, setPrefillPreviewLoading] = useState(false);
  const [importingPrefillId, setImportingPrefillId] = useState('');
  const [startingWorkflowFor, setStartingWorkflowFor] = useState('');
  const [assignmentQueueIndex, setAssignmentQueueIndex] = useState(0);

  useEffect(() => {
    const focus = String(searchParams?.get('focus') || '').trim();
    if (focus) setFocusId(focus);
  }, [searchParams]);

  useEffect(() => {
    if (!prefillPreviewRow) return;
    const fromRow = String(prefillPreviewRow.prefillPurpose || '').trim();
    if (fromRow === 'initial' || fromRow === 'change_condition' || fromRow === 'review') {
      setPrefillPurpose(fromRow);
    } else {
      setPrefillPurpose('review');
    }
  }, [prefillPreviewRow]);

  useEffect(() => {
    if (!prefillPreviewOpen || !prefillPreviewRow) {
      setPrefillPreviewResolved({});
      return;
    }
    let cancelled = false;
    void (async () => {
      setPrefillPreviewLoading(true);
      try {
        if (!user) throw new Error('Sign in required.');
        const idToken = await user.getIdToken();
        const targetId = String(prefillPreviewRow.memberId || prefillPreviewRow.id).trim();
        const liveRes = await fetch('/api/alft/prefill/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, memberId: targetId }),
          cache: 'no-store',
        });
        const liveData = (await liveRes.json().catch(() => ({}))) as any;
        if (!liveRes.ok || !liveData?.ok) {
          throw new Error(String(liveData?.error || `Live Caspio prefill failed (HTTP ${liveRes.status})`));
        }
        const resolved = (liveData?.resolved || {}) as Record<string, string>;
        const pickMapped = (alftField: string) => String(resolved[alftField] || '').trim();

        const next: Record<string, string> = {
          alftPlanId: pickMapped('p1_plan_id'),
          memberMrn: pickMapped('p1_mrn'),
          memberName: pickMapped('p1_member_name'),
          assessorName: pickMapped('p1_assessor_name'),
          currentStreet: pickMapped('p2_current_street'),
          currentCity: pickMapped('p2_current_city'),
          currentState: pickMapped('p2_current_state'),
          currentZip: pickMapped('p2_current_zip'),
          currentType: pickMapped('p2_current_type'),
          assessmentSite: pickMapped('p2_assessment_site'),
          homeStreet: pickMapped('p2_home_street'),
          homeCity: pickMapped('p2_home_city'),
          homeState: pickMapped('p2_home_state'),
          homeZip: pickMapped('p2_home_zip'),
          facilityName: pickMapped('p2_facility_name'),
          primaryLanguage: pickMapped('p1_primary_language'),
          phone: pickMapped('p1_phone'),
        };

        if (!cancelled) setPrefillPreviewResolved(next);
      } catch (e: any) {
        if (!cancelled) {
          setPrefillPreviewResolved({});
          toast({
            title: 'Live Caspio pull required',
            description: e?.message || 'Could not pull live Caspio member record.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setPrefillPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillPreviewOpen, prefillPreviewRow, user]);

  useEffect(() => {
    const memberQuery = String(searchParams?.get('member') || '').trim();
    if (memberQuery) setSearch(memberQuery);
  }, [searchParams]);

  useEffect(() => {
    const run = async () => {
      if (!firestore || !user?.uid) {
        setIsKaiserAssignmentManager(false);
        return;
      }
      try {
        const meSnap = await getDoc(doc(firestore, 'users', user.uid));
        const me = meSnap.exists() ? (meSnap.data() as any) : null;
        setIsKaiserAssignmentManager(Boolean(me?.isKaiserAssignmentManager));
      } catch {
        setIsKaiserAssignmentManager(false);
      }
    };
    void run();
  }, [firestore, user?.uid]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
    const qy = query(collection(firestore, 'standalone_upload_submissions'), where('status', '==', 'pending'));
    const unsub = onSnapshot(
      qy,
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
            alftSignature: (r as any)?.alftSignature || null,

            alftRevisions: Array.isArray(r.alftRevisions) ? r.alftRevisions : [],
            alftEditHistory: Array.isArray((r as any)?.alftEditHistory) ? (r as any).alftEditHistory : [],
            workflowEmailStatus: (r as any)?.workflowEmailStatus || null,
            alftCompletionEmail: (r as any)?.alftCompletionEmail || null,
          }))
          .filter((r) => isAlft(r)) as StandaloneUpload[];
        setRows(mapped);
      },
      () => setRows([])
    );
    return () => unsub();
  }, [firestore, isAdmin]);

  useEffect(() => {
    if (!firestore || !isAdmin) return;
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
              ispCurrentAddressCity: toLabel(r.ispCurrentAddressCity) || null,
              ispCurrentAddressState: toLabel(r.ispCurrentAddressState) || null,
              ispCurrentAddressZip: toLabel(r.ispCurrentAddressZip) || null,
              currentLocationType: toLabel(r.currentLocationType) || null,
              assessmentSite: toLabel(r.assessmentSite) || null,
              homeAddressStreet: toLabel(r.homeAddressStreet) || null,
              homeAddressCity: toLabel(r.homeAddressCity) || null,
              homeAddressState: toLabel(r.homeAddressState) || null,
              homeAddressZip: toLabel(r.homeAddressZip) || null,
              ispFacilityName: toLabel(r.ispFacilityName) || null,
              prefillSourceMode: toLabel(r.prefillSourceMode) || null,
              prefillPurpose: toLabel(r.prefillPurpose) || null,
              prefillSourceLabel: toLabel(r.prefillSourceLabel) || null,
              status: toLabel(r.status) || null,
              workflowStatus: toLabel(r.workflowStatus) || null,
              workflowStage: toLabel(r.workflowStage) || null,
              workflowInvites: (r.workflowInvites || null) as any,
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
  }, [firestore, isAdmin]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!firestore || !isAdmin) return;
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
  }, [firestore, isAdmin]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!s) return true;
        return (
          toLabel(r.memberName).toLowerCase().includes(s) ||
          toLabel(r.medicalRecordNumber).toLowerCase().includes(s) ||
          toLabel(r.uploaderName).toLowerCase().includes(s) ||
          toLabel(r.uploaderEmail).toLowerCase().includes(s) ||
          toLabel(r.alftRnName).toLowerCase().includes(s) ||
          toLabel(r.alftStaffName).toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        const aMs = Math.max(toMs(a.updatedAt), toMs(a.createdAt));
        const bMs = Math.max(toMs(b.updatedAt), toMs(b.createdAt));
        return bMs - aMs;
      });
  }, [rows, search]);

  const filteredAssignments = useMemo(() => {
    const s = search.trim().toLowerCase();
    return assignmentRows.filter((r) => {
      if (!s) return true;
      return (
        toLabel(r.memberName).toLowerCase().includes(s) ||
        toLabel(r.memberMrn).toLowerCase().includes(s) ||
        toLabel(r.assignedSwName).toLowerCase().includes(s) ||
        toLabel(r.assignedSwEmail).toLowerCase().includes(s)
      );
    });
  }, [assignmentRows, search]);

  useEffect(() => {
    if (filteredAssignments.length === 0) {
      setAssignmentQueueIndex(0);
      return;
    }
    setAssignmentQueueIndex((prev) => Math.min(Math.max(prev, 0), filteredAssignments.length - 1));
  }, [filteredAssignments.length]);

  const prefillPreviewFields = useMemo(() => {
    const row = prefillPreviewRow;
    if (!row) return [] as Array<{ label: string; value: string }>;
    return [
      { label: 'Agency', value: 'Connections Care Home Consultants' },
      { label: 'Plan ID', value: asAnswer(prefillPreviewResolved.alftPlanId) },
      { label: 'MRN Number', value: asAnswer(prefillPreviewResolved.memberMrn) },
      { label: 'Member Name', value: asAnswer(prefillPreviewResolved.memberName) },
      { label: 'Assessor Name', value: asAnswer(prefillPreviewResolved.assessorName) },
      { label: 'Purpose of assessment', value: prefillPurpose },
      { label: 'Current Location Street', value: asAnswer(prefillPreviewResolved.currentStreet) },
      { label: 'Current Location City', value: asAnswer(prefillPreviewResolved.currentCity) },
      { label: 'Current Location State', value: asAnswer(prefillPreviewResolved.currentState) },
      { label: 'Current Location Zip', value: asAnswer(prefillPreviewResolved.currentZip) },
      { label: 'Current Location Type', value: asAnswer(prefillPreviewResolved.currentType) },
      { label: 'Assessment Site', value: asAnswer(prefillPreviewResolved.assessmentSite) },
      { label: 'Home Address Street', value: asAnswer(prefillPreviewResolved.homeStreet) },
      { label: 'Home Address City', value: asAnswer(prefillPreviewResolved.homeCity) },
      { label: 'Home Address State', value: asAnswer(prefillPreviewResolved.homeState) },
      { label: 'Home Address Zip', value: asAnswer(prefillPreviewResolved.homeZip) },
      { label: 'Facility Name', value: asAnswer(prefillPreviewResolved.facilityName) },
      { label: 'Primary Language', value: asAnswer(prefillPreviewResolved.primaryLanguage) },
      { label: 'Phone Number', value: asAnswer(prefillPreviewResolved.phone) },
    ];
  }, [prefillPreviewResolved, prefillPreviewRow, prefillPurpose]);

  const openAssign = useCallback((row: StandaloneUpload, kind: 'rn' | 'staff') => {
    setAssignRow(row);
    setAssignKind(kind);
    setAssignUid('');
    setAssignOpen(true);
  }, []);

  // Returns true for any user allowed to kick a form back to the SW for revision:
  // admins, Kaiser managers (isKaiserAssignmentManager), and the assigned RN for the intake.
  const canKickBackToSw = useCallback(
    (row: StandaloneUpload) => {
      if (isSuperAdmin || isAdmin || isKaiserAssignmentManager) return true;
      const uid = String(user?.uid || '').trim();
      const email = String(user?.email || '').toLowerCase();
      const rnUid = String((row as any)?.alftRnUid || '').trim();
      const rnEmail = String((row as any)?.alftRnEmail || '').toLowerCase();
      return (uid && uid === rnUid) || (email && email === rnEmail);
    },
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager, user?.uid, user?.email]
  );

  const canRunManagerWorkflow = useMemo(
    () => Boolean(isSuperAdmin || isAdmin || isKaiserAssignmentManager),
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager]
  );

  // Step gate requested by workflow owner:
  // SW submit -> Kaiser manager pre-review -> send to Leslie (RN) -> Kaiser manager final review -> email Jocelyn.
  const canSendToRnAfterPreReview = useCallback(
    (row: StandaloneUpload) => {
      if (!canRunManagerWorkflow) return false;
      const sigRequested = Boolean((row as any)?.alftSignature?.requestedAt);
      if (sigRequested) return false;
      const workflowStatus = String((row as any)?.workflowStatus || '').toLowerCase();
      return (
        workflowStatus.includes('awaiting_manager_review_pre_rn') ||
        workflowStatus.includes('returned_to_sw_for_revision') ||
        workflowStatus.includes('manager_review_pre_rn_complete_ready_for_rn')
      );
    },
    [canRunManagerWorkflow]
  );

  const canEditAlftRow = useCallback(
    (row: StandaloneUpload) => {
      const uid = String(user?.uid || '').trim();
      if (!uid) return false;
      // Admins and Kaiser assignment managers (Leslie, Deydry, etc.) can always edit
      if (isAdmin || isKaiserAssignmentManager) return true;
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
    [isAdmin, isKaiserAssignmentManager, user?.uid, user?.email]
  );

  const startWorkflowFromIntake = useCallback(
    async (row: AlftAssignmentQueueRow) => {
      if (!auth?.currentUser) {
        toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
        return;
      }
      setStartingWorkflowFor(row.memberId || row.id);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const memberId = String(row.memberId || row.id || '').trim();
        const prefillSourceMode = resolvePrefillSourceMode(row);
        let resolved: Record<string, string> = {};
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
          const missing = REQUIRED_PREFILL_FIELDS.filter(({ key }) => !String(resolved?.[key] || '').trim());
          if (missing.length > 0) {
            const shortList = missing.slice(0, 8).map((m) => m.label).join(', ');
            throw new Error(
              `Required prefill fields are missing in Caspio (${missing.length}): ${shortList}${missing.length > 8 ? ', ...' : ''}`
            );
          }
        }
        const pick = (key: string, fallback = '') => String(resolved?.[key] || '').trim() || fallback;
        const res = await fetch('/api/alft/workflow/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken,
            member: {
              id: memberId,
              memberName: pick('p1_member_name', row.memberName || ''),
              memberFirstName: pick('p2_first_name', row.memberFirstName || ''),
              memberLastName: pick('p2_last_name', row.memberLastName || ''),
              memberMrn: pick('p1_mrn', row.memberMrn || ''),
              birthDate: pick('p2_dob', row.birthDate || ''),
              memberSex: pick('p2_sex', row.memberSex || ''),
              memberPrimaryLanguage: pick('p1_primary_language', row.memberPrimaryLanguage || ''),
              memberPhone: pick('p1_phone', row.memberPhone || ''),
              ispCurrentAddressStreet: pick('p2_current_street', row.ispCurrentAddressStreet || ''),
              ispCurrentAddressCity: pick('p2_current_city', row.ispCurrentAddressCity || ''),
              ispCurrentAddressState: pick('p2_current_state', row.ispCurrentAddressState || ''),
              ispCurrentAddressZip: pick('p2_current_zip', row.ispCurrentAddressZip || ''),
              currentLocationType: pick('p2_current_type', row.currentLocationType || ''),
              assessmentSite: pick('p2_assessment_site', row.assessmentSite || ''),
              homeAddressStreet: pick('p2_home_street', row.homeAddressStreet || ''),
              homeAddressCity: pick('p2_home_city', row.homeAddressCity || ''),
              homeAddressState: pick('p2_home_state', row.homeAddressState || ''),
              homeAddressZip: pick('p2_home_zip', row.homeAddressZip || ''),
              ispFacilityName: pick('p2_facility_name', row.ispFacilityName || ''),
              ispCurrentLocation: pick('p2_facility_name', row.ispFacilityName || ''),
              ispContactPhone: pick('p1_phone', row.memberPhone || ''),
              alftPlanId: pick('p1_plan_id', row.alftPlanId || row.memberMrn || ''),
              prefillSourceMode,
              swId: row.assignedSwId || '',
              socialWorkerAssigned: row.assignedSwName || '',
              prefillPurpose,
            },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !data?.success) {
          throw new Error(String(data?.error || `Failed to start workflow (HTTP ${res.status})`));
        }
        toast({
          title: 'Workflow notice sent',
          description: `${row.memberName || 'Member'} invite sent/re-sent to assigned social worker.`,
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
    [auth?.currentUser, prefillPurpose, toast]
  );

  const importMappedMemberPrefill = useCallback(
    async (row: AlftAssignmentQueueRow) => {
      if (!firestore) {
        toast({ title: 'Firestore unavailable', description: 'Could not import mapped values.', variant: 'destructive' });
        return;
      }
      const id = String(row.memberId || row.id || '').trim();
      if (!id) return;
      setImportingPrefillId(id);
      try {
        const mappedName = asAnswer(prefillPreviewResolved.memberName || row.memberName);
        const inferredFirst = mappedName.includes(',') ? mappedName.split(',', 2)[1]?.trim() || '' : '';
        const inferredLast = mappedName.includes(',') ? mappedName.split(',', 2)[0]?.trim() || '' : '';

        await updateDoc(doc(firestore, 'alft_assignments', id), {
          alftPlanId: asAnswer(prefillPreviewResolved.alftPlanId || row.alftPlanId || row.memberMrn),
          memberMrn: asAnswer(prefillPreviewResolved.memberMrn || row.memberMrn),
          memberName: mappedName || row.memberName || '',
          memberFirstName: asAnswer(row.memberFirstName) || inferredFirst,
          memberLastName: asAnswer(row.memberLastName) || inferredLast,
          memberPrimaryLanguage: asAnswer(prefillPreviewResolved.primaryLanguage || row.memberPrimaryLanguage),
          memberPhone: asAnswer(prefillPreviewResolved.phone || row.memberPhone),
          ispCurrentAddressStreet: asAnswer(prefillPreviewResolved.currentStreet || row.ispCurrentAddressStreet),
          ispCurrentAddressCity: asAnswer(prefillPreviewResolved.currentCity || row.ispCurrentAddressCity),
          ispCurrentAddressState: asAnswer(prefillPreviewResolved.currentState || row.ispCurrentAddressState || 'CA'),
          ispCurrentAddressZip: asAnswer(prefillPreviewResolved.currentZip || row.ispCurrentAddressZip),
          currentLocationType: asAnswer(prefillPreviewResolved.currentType || row.currentLocationType),
          assessmentSite: asAnswer(prefillPreviewResolved.assessmentSite || row.assessmentSite),
          homeAddressStreet: asAnswer(prefillPreviewResolved.homeStreet || row.homeAddressStreet),
          homeAddressCity: asAnswer(prefillPreviewResolved.homeCity || row.homeAddressCity),
          homeAddressState: asAnswer(prefillPreviewResolved.homeState || row.homeAddressState || 'CA'),
          homeAddressZip: asAnswer(prefillPreviewResolved.homeZip || row.homeAddressZip),
          ispFacilityName: asAnswer(prefillPreviewResolved.facilityName || row.ispFacilityName),
          prefillPurpose,
          prefillImportedAt: serverTimestamp(),
          prefillImportedBy: String(user?.email || user?.uid || '').trim(),
          updatedAt: serverTimestamp(),
        });

        toast({
          title: 'Member fields imported',
          description: `${row.memberName || 'Member'} mapped values imported into ALFT assignment.`,
        });
      } catch (e: any) {
        toast({
          title: 'Import failed',
          description: e?.message || 'Could not import member fields.',
          variant: 'destructive',
        });
      } finally {
        setImportingPrefillId('');
      }
    },
    [firestore, prefillPreviewResolved, prefillPurpose, toast, user?.email, user?.uid]
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
    setEditExactAnswers(merged);
    setEditTransitionSummary(String(row?.alftForm?.transitionSummary || ''));
    setEditRequestedActions(String(row?.alftForm?.requestedActions || ''));
    setEditBarriersAndRisks(String(row?.alftForm?.barriersAndRisks || ''));
    setEditAdditionalNotes(String(row?.alftForm?.additionalNotes || ''));
    setEditRow(row);
    setEditOpen(true);
  }, []);

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

  const markRnDownloaded = async (row: StandaloneUpload) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', row.id), {
        alftRnDownloadedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
      toast({ title: 'Marked downloaded', description: 'Saved RN download timestamp.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update.', variant: 'destructive' });
    }
  };

  const openRevision = (row: StandaloneUpload) => {
    setRevRow(row);
    setRevFile(null);
    setRevNote('');
    setRevProgress(0);
    setRevOpen(true);
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

  const markSentForSignature = (row: StandaloneUpload) => {
    void requestSignatures(row);
  };

  const saveEdit = async () => {
    if (!editRow || editSaving) return;
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please sign in again to save ALFT edits.', variant: 'destructive' });
      return;
    }
    const summary = String(editTransitionSummary || '').trim();
    const actions = String(editRequestedActions || '').trim();
    if (!summary || !actions) {
      toast({
        title: 'Missing required fields',
        description: 'Transition summary and requested actions are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setEditSaving(true);
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          intakeId: editRow.id,
          exactPacketAnswers: editExactAnswers,
          transitionSummary: summary,
          requestedActions: actions,
          barriersAndRisks: String(editBarriersAndRisks || '').trim() || null,
          additionalNotes: String(editAdditionalNotes || '').trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Save failed (HTTP ${res.status})`));
      }
      toast({
        title: 'ALFT form updated',
        description: 'Changes saved. This intake stays editable for SW, staff, RN, and admin users.',
      });
      setEditOpen(false);
      setEditRow(null);
    } catch (e: any) {
      toast({ title: 'Could not save ALFT form', description: e?.message || 'Save failed.', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  const sendCompletedToJh = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || sendingCompletedId) return;
    setSendingCompletedId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/send-completed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: row.id }),
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

  const markManagerFinalReview = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || managerReviewingId) return;
    setManagerReviewingId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/final-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: row.id }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Final review failed (HTTP ${res.status})`));
      toast({ title: 'Final review complete', description: 'Kaiser manager final review approved. Ready to send to Jocelyn.' });
    } catch (e: any) {
      toast({ title: 'Could not complete manager review', description: e?.message || 'Review failed.', variant: 'destructive' });
    } finally {
      setManagerReviewingId('');
    }
  };

  const requestSignatures = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }
    if (!row?.id) return;
    if (!row.uploaderEmail) {
      toast({ title: 'Missing MSW email', description: 'This intake is missing the uploader email for MSW signature.', variant: 'destructive' });
      return;
    }
    if (sigRequestingId) return;
    setSigRequestingId(row.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/signatures/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: row.id, forceDefaultRn: true }),
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
        title: 'Signature request sent',
        description: `Pre-review complete. Next: Leslie updates/signs, then Deydry final review. RN email: ${data?.rn?.emailSent ? 'sent' : 'not sent'} • MSW email: ${data?.msw?.emailSent ? 'sent' : 'not sent'}`,
      });
    } catch (e: any) {
      toast({ title: 'Could not request signatures', description: e?.message || 'Request failed.', variant: 'destructive' });
    } finally {
      setSigRequestingId('');
    }
  };

  const openRejectToSw = (row: StandaloneUpload) => {
    setRejectRow(row);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const rejectToSw = async () => {
    if (!auth?.currentUser || !rejectRow?.id) return;
    const reason = String(rejectReason || '').trim();
    if (!reason) {
      toast({ title: 'Reason required', description: 'Please enter why this ALFT is being sent back to SW.', variant: 'destructive' });
      return;
    }
    setRejectingId(rejectRow.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/alft/workflow/reject-to-sw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intakeId: rejectRow.id, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) throw new Error(String(data?.error || `Reject failed (HTTP ${res.status})`));
      toast({
        title: 'Returned to SW',
        description: 'ALFT sent back to social worker for revision. A new SW signature is now required.',
      });
      setRejectDialogOpen(false);
      setRejectRow(null);
      setRejectReason('');
    } catch (e: any) {
      toast({ title: 'Could not return to SW', description: e?.message || 'Reject failed.', variant: 'destructive' });
    } finally {
      setRejectingId('');
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

  const markCompleted = async (row: StandaloneUpload) => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'standalone_upload_submissions', row.id), {
        status: 'processed',
        processedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);
      toast({ title: 'Completed', description: 'Removed from pending intake queue.' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message || 'Could not update.', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>Please sign in as an admin to continue.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">ALFT Workflow Intake</h1>
          <p className="text-muted-foreground">
            Plan A + Plan B workflow: SW submits/signs, ALFT manager reviews, sends to Leslie for final RN changes/signature, Kaiser manager does final review, then completed packet is sent to Jocelyn.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={filtered.length > 0 ? 'secondary' : 'outline'}>{filtered.length} pending</Badge>
          <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear search
          </Button>
        </div>
      </div>

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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ALFT intake queue</CardTitle>
          <CardDescription>All items shown here are pending ALFT uploads (from `standalone_upload_submissions`).</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="space-y-3 py-4">
              <div className="text-sm text-muted-foreground">No pending ALFT uploads found.</div>
              {filteredAssignments.length > 0 ? (
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Pre-submission ALFT workflow queue</div>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                      <Link href="/admin/alft-assignment">Back to Assignment Queue</Link>
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    These members are in workflow before upload appears in intake. No file upload is needed to start.
                  </div>
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing {Math.min(assignmentQueueIndex + 1, filteredAssignments.length)} of {filteredAssignments.length}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setAssignmentQueueIndex((i) => Math.max(0, i - 1))}
                        disabled={assignmentQueueIndex <= 0}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setAssignmentQueueIndex((i) => Math.min(filteredAssignments.length - 1, i + 1))}
                        disabled={assignmentQueueIndex >= filteredAssignments.length - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {filteredAssignments[assignmentQueueIndex] ? (
                      (() => {
                        const row = filteredAssignments[assignmentQueueIndex];
                        return (
                      <div key={row.id} className="rounded border bg-background p-2">
                        <div className="text-sm font-medium">{row.memberName || 'Member'}</div>
                        <div className="text-xs text-muted-foreground">
                          MRN: {row.memberMrn || '—'} • SW: {row.assignedSwName || row.assignedSwEmail || row.assignedSwId || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Status: {row.workflowStatus || row.status || 'not started'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">
                            {prefillSourceBadgeLabel(row)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ALFT form location: <span className="font-medium">SW Portal → ALFT Upload</span>
                        </div>
                        <div className="mt-1 rounded border bg-muted/20 p-2 text-[11px]">
                          {assignmentWorkflowSteps(row).map((step) => (
                            <div key={`${row.id}-step-${step.step}`} className="flex items-center gap-1.5">
                              <span className={step.done ? 'text-green-700' : step.current ? 'text-blue-700' : 'text-muted-foreground'}>
                                {step.done ? '✓' : step.current ? '→' : '○'}
                              </span>
                              <span className={step.done ? 'text-foreground' : step.current ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                                {step.step}) {step.label}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs">{nextStepForAssignment(row)}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              const memberId = encodeURIComponent(String(row.memberId || row.id || '').trim());
                              router.push(`/admin/alft-caspio-mapping?memberId=${memberId}&from=alft-intake`);
                            }}
                          >
                            Pull prefilled fields
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={
                              startingWorkflowFor === (row.memberId || row.id) ||
                              (!row.assignedSwId && !row.assignedSwName)
                            }
                            onClick={() => void startWorkflowFromIntake(row)}
                          >
                            {startingWorkflowFor === (row.memberId || row.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : null}
                            {String(row.workflowStatus || '').toLowerCase().includes('sw_invited') ? 'Re-send SW notice' : 'Send SW notice'}
                          </Button>
                        </div>
                      </div>
                        );
                      })()
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>MRN</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>SW uploader</TableHead>
                  <TableHead>RN</TableHead>
                  <TableHead>Files</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const focused = focusId && r.id === focusId;
                  const stage = computeStage(r);
                  const latestRevision = (r.alftRevisions || []).slice(-1)[0];
                  const recentEdits = (r.alftEditHistory || [])
                    .slice()
                    .sort((a: any, b: any) => toEditHistoryMs(b) - toEditHistoryMs(a))
                    .slice(0, 3);
                  const sw = r.uploaderName || r.uploaderEmail || 'Social Worker';
                  return (
                    <TableRow key={r.id} className={focused ? 'bg-amber-50' : ''}>
                      <TableCell className="min-w-[220px]">
                        <div className="font-medium truncate">{r.memberName || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.healthPlan || '—'} • Uploaded {r.alftUploadDate || (toMs(r.createdAt) ? new Date(toMs(r.createdAt)).toLocaleDateString() : '—')}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{r.medicalRecordNumber || '—'}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="space-y-2">
                          <div>{stageBadge(stage)}</div>
                          <div className="rounded border bg-muted/20 p-2 text-[11px]">
                            {workflowChecklistFor(r).map((step) => (
                              <div key={step.label} className="flex items-center gap-1.5">
                                <span className={step.done ? 'text-green-700' : 'text-muted-foreground'}>{step.done ? '✓' : '○'}</span>
                                <span className={step.done ? 'text-foreground' : 'text-muted-foreground'}>{step.label}</span>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1 text-[11px] text-muted-foreground">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                Manager step2 email: {toMs((r as any)?.workflowEmailStatus?.managerStep2EmailSentAt) > 0 ? 'sent' : 'pending'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Manager step4 email: {toMs((r as any)?.workflowEmailStatus?.managerStep4EmailSentAt) > 0 ? 'sent' : 'pending'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                Final PDF email: {toMs((r as any)?.alftCompletionEmail?.sentAt) > 0 ? 'sent' : 'pending'}
                              </Badge>
                            </div>
                            {timelineFor(r)
                              .slice(-6)
                              .map((t) => (
                                <div key={t.key} className="flex items-start gap-2">
                                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                                  <div className="min-w-0">
                                    <div className="truncate">
                                      <span className="font-medium text-foreground/80">{t.label}</span>
                                      {t.by ? <span className="text-muted-foreground"> — {t.by}</span> : null}
                                    </div>
                                    <div className="text-muted-foreground">{fmtTimeline(t.ms) || '—'}</div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="truncate">{sw}</div>
                        {r.uploaderEmail ? <div className="text-xs text-muted-foreground truncate">{r.uploaderEmail}</div> : null}
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <div className="truncate">{r.alftRnName || '—'}</div>
                        {r.alftRnEmail ? <div className="text-xs text-muted-foreground truncate">{r.alftRnEmail}</div> : null}
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="space-y-1">
                          {r.alftForm?.transitionSummary ? (
                            <div className="rounded border bg-muted/30 p-2 text-[11px]">
                              <div className="font-semibold">SW placeholder form</div>
                              <div className="truncate">
                                {r.alftForm?.facilityName ? `${r.alftForm.facilityName} • ` : ''}
                                {r.alftForm?.priorityLevel || 'Routine'}
                              </div>
                              <div className="line-clamp-2 text-muted-foreground">{r.alftForm.transitionSummary}</div>
                            </div>
                          ) : null}
                          {(r.files || []).slice(0, 2).map((f) => (
                            <a
                              key={f.downloadURL}
                              className="underline text-blue-600 block truncate"
                              href={f.downloadURL}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f.fileName || 'Download'}
                            </a>
                          ))}
                          {(r.files || []).slice(0, 2).map((f) => (
                            <div key={`${f.downloadURL}-ts`} className="text-[11px] text-muted-foreground truncate">
                              Uploaded: {toLabel(f.uploadedAtIso) ? fmtTimeline(toMs(f.uploadedAtIso)) || toLabel(f.uploadedAtIso) : '—'}
                            </div>
                          ))}
                          {(r.files || []).length > 2 ? (
                            <div className="text-xs text-muted-foreground">+{(r.files || []).length - 2} more</div>
                          ) : null}
                          {latestRevision?.downloadURL ? (
                            <div className="pt-1">
                              <div className="text-xs font-semibold">Latest revision</div>
                              <a
                                className="underline text-blue-700 block truncate"
                                href={latestRevision.downloadURL}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {latestRevision.fileName || 'Download revision'}
                              </a>
                              <div className="text-[11px] text-muted-foreground truncate">
                                {toLabel(latestRevision.uploadedByName || latestRevision.uploadedByEmail) || '—'}
                              </div>
                            </div>
                          ) : null}
                          {recentEdits.length > 0 ? (
                            <div className="pt-1">
                              <div className="text-xs font-semibold">Edit history</div>
                              <div className="space-y-1">
                                {recentEdits.map((h: any, idx: number) => {
                                  const who = toLabel(h?.editedByName || h?.editedByEmail) || 'User';
                                  const when = fmtTimeline(toEditHistoryMs(h)) || toLabel(h?.editedAtIso) || '—';
                                  const fieldList = Array.isArray(h?.changedFields) ? h.changedFields : [];
                                  const exactCount = Number(h?.changedExactQuestionCount || 0);
                                  return (
                                    <div key={`${who}-${when}-${idx}`} className="rounded border bg-muted/20 px-2 py-1 text-[11px]">
                                      <div className="truncate">
                                        <span className="font-medium">{who}</span>
                                        <span className="text-muted-foreground"> • {when}</span>
                                      </div>
                                      <div className="text-muted-foreground truncate">
                                        {fieldList.length > 0 ? fieldList.join(', ') : 'no field changes'}
                                        {exactCount > 0 ? ` • exact questions: ${exactCount}` : ''}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex flex-col gap-2 items-end">
                          <div className="flex flex-wrap justify-end gap-2">
                            {/* View button — visible to all parties (admin, Kaiser manager, RN, SW uploader) */}
                            <Button size="sm" variant="outline" asChild title="View full ALFT form (read-only, printable)">
                              <Link href={`/admin/alft-view/${encodeURIComponent(r.id)}`} target="_blank">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View ALFT
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(r)}
                              disabled={!canEditAlftRow(r)}
                              title={!canEditAlftRow(r) ? 'No edit permission for this intake' : 'Edit ALFT form'}
                            >
                              Edit ALFT form
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openAssign(r, 'rn')} disabled={staffLoading}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Assign RN
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void markRnDownloaded(r)}
                              disabled={!r.alftRnUid}
                              title={!r.alftRnUid ? 'Assign RN first' : 'Mark RN downloaded'}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              RN downloaded
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openRevision(r)} disabled={!r.alftRnUid}>
                              <UploadCloud className="h-4 w-4 mr-2" />
                              RN re-upload
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markSentForSignature(r)}
                              disabled={
                                !canSendToRnAfterPreReview(r) ||
                                Boolean(sigRequestingId && sigRequestingId === r.id)
                              }
                              title={
                                Boolean((r as any)?.alftSignature?.requestedAt)
                                  ? 'Signatures already requested'
                                  : !canRunManagerWorkflow
                                    ? 'Kaiser manager or admin pre-review is required'
                                    : 'Kaiser manager pre-review complete: send to Leslie (RN) + SW signatures'
                              }
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {sigRequestingId === r.id ? 'Requesting…' : 'Manager pre-review → Send to Leslie (RN)'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRejectToSw(r)}
                              disabled={rejectingId === r.id || !canKickBackToSw(r)}
                              title={
                                !canKickBackToSw(r)
                                  ? 'Kaiser manager or assigned RN access required'
                                  : 'Return to social worker for revision and require new SW signature'
                              }
                            >
                              {rejectingId === r.id ? 'Returning…' : 'Return to SW for revision'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void markManagerFinalReview(r)}
                              disabled={
                                managerReviewingId === r.id ||
                                !Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath) ||
                                !canRunManagerWorkflow ||
                                String((r as any)?.alftManagerReview?.status || '').toLowerCase() === 'approved'
                              }
                              title={
                                !Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath)
                                  ? 'Complete signatures first'
                                  : !canRunManagerWorkflow
                                    ? 'Kaiser manager or admin access required'
                                    : String((r as any)?.alftManagerReview?.status || '').toLowerCase() === 'approved'
                                      ? 'Final review already completed'
                                      : 'Complete final Kaiser manager review'
                              }
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              {managerReviewingId === r.id ? 'Reviewing…' : 'Kaiser manager final review'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openSendConfirm(r)}
                              disabled={
                                sendingCompletedId === r.id ||
                                !canRunManagerWorkflow ||
                                !Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath) ||
                                String((r as any)?.alftManagerReview?.status || '').toLowerCase() !== 'approved'
                              }
                              title={
                                !canRunManagerWorkflow
                                  ? 'Kaiser manager or admin access required'
                                  : !Boolean(r?.alftSignature?.packetPdfStoragePath || r?.alftSignature?.signaturePagePdfStoragePath)
                                  ? 'Complete signatures first'
                                  : String((r as any)?.alftManagerReview?.status || '').toLowerCase() !== 'approved'
                                    ? 'Kaiser manager final review is required first'
                                    : 'Send completed form + attachments via email'
                              }
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {sendingCompletedId === r.id ? 'Sending…' : 'Preview + email completed PDF'}
                            </Button>
                            <Button size="sm" onClick={() => void markCompleted(r)}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Complete
                            </Button>
                          </div>
                          {r?.alftSignature?.requestId ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void downloadSignaturePdf(String(r.alftSignature?.requestId), 'signature')}
                                disabled={!r?.alftSignature?.signaturePagePdfStoragePath}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Signature page
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void downloadSignaturePdf(String(r.alftSignature?.requestId), 'packet')}
                                disabled={!r?.alftSignature?.packetPdfStoragePath}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Full packet
                              </Button>
                            </div>
                          ) : null}
                          <Button asChild size="sm" variant="secondary">
                            <Link href={`/admin/standalone-uploads?focus=${encodeURIComponent(r.id)}&filter=alft`}>
                              Open in intake <ExternalLink className="h-4 w-4 ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={prefillPreviewOpen} onOpenChange={setPrefillPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prefilled ALFT preview (Page 1-2)</DialogTitle>
            <DialogDescription>
              Review these prefilled values, then send or re-send notice to the assigned social worker to complete the ALFT tool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{prefillPreviewRow?.memberName || 'Member'}</div>
              <div className="text-xs text-muted-foreground">
                MRN: {prefillPreviewRow?.memberMrn || '—'} • SW: {prefillPreviewRow?.assignedSwName || prefillPreviewRow?.assignedSwEmail || '—'}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Purpose of assessment</Label>
              <Select value={prefillPurpose} onValueChange={setPrefillPurpose}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Initial</SelectItem>
                  <SelectItem value="change_condition">Change of Condition</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {prefillPreviewLoading ? (
              <div className="inline-flex items-center gap-2 rounded border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Pulling member directly from Caspio + applying current mapping...
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Preview values resolved from live Caspio member data using latest ALFT mapping.
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {prefillPreviewFields.map((f) => (
                <div key={f.label} className="rounded border bg-muted/20 p-2">
                  <div className="text-[11px] text-muted-foreground">{f.label}</div>
                  <div className="text-sm">{f.value || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPrefillPreviewOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => (prefillPreviewRow ? void importMappedMemberPrefill(prefillPreviewRow) : undefined)}
              disabled={
                !prefillPreviewRow ||
                prefillPreviewLoading ||
                importingPrefillId === (prefillPreviewRow?.memberId || prefillPreviewRow?.id)
              }
            >
              {importingPrefillId === (prefillPreviewRow?.memberId || prefillPreviewRow?.id) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Import member mapped fields
            </Button>
            <Button
              onClick={() => (prefillPreviewRow ? void startWorkflowFromIntake(prefillPreviewRow) : undefined)}
              disabled={
                !prefillPreviewRow ||
                startingWorkflowFor === (prefillPreviewRow?.memberId || prefillPreviewRow?.id) ||
                (!prefillPreviewRow?.assignedSwId && !prefillPreviewRow?.assignedSwName)
              }
            >
              {startingWorkflowFor === (prefillPreviewRow?.memberId || prefillPreviewRow?.id) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Send SW notice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit ALFT form</DialogTitle>
            <DialogDescription>
              Collaborative edit mode. This form remains editable by social worker, staff, RN, and admin users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{editRow?.memberName || '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{editRow?.medicalRecordNumber || '—'}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-transition-summary">Transition summary</Label>
              <textarea
                id="edit-transition-summary"
                value={editTransitionSummary}
                onChange={(e) => setEditTransitionSummary(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-requested-actions">Requested actions</Label>
              <textarea
                id="edit-requested-actions"
                value={editRequestedActions}
                onChange={(e) => setEditRequestedActions(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-barriers">Barriers / risks</Label>
              <textarea
                id="edit-barriers"
                value={editBarriersAndRisks}
                onChange={(e) => setEditBarriersAndRisks(e.target.value)}
                className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Additional notes</Label>
              <textarea
                id="edit-notes"
                value={editAdditionalNotes}
                onChange={(e) => setEditAdditionalNotes(e.target.value)}
                className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <ExactAlftQuestionnaire
              answers={editExactAnswers}
              onChange={(id, value) =>
                setEditExactAnswers((prev) => ({
                  ...prev,
                  [id]: value,
                }))
              }
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save ALFT form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="text-xs text-muted-foreground font-mono">{assignRow?.medicalRecordNumber || '—'}</div>
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
              <div className="text-xs text-muted-foreground font-mono">{revRow?.medicalRecordNumber || '—'}</div>
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
            {revUploading ? <div className="text-xs text-muted-foreground">Uploading… {revProgress}%</div> : null}
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
              {sigDialog?.requestId ? <div className="text-xs text-muted-foreground">Request ID: {sigDialog.requestId}</div> : null}
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

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Return ALFT to SW for revision</DialogTitle>
            <DialogDescription>
              This sends the ALFT back to the social worker, invalidates the current signature request, and requires a new SW signature.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{rejectRow?.memberName || '—'}</div>
              <div className="text-xs text-muted-foreground font-mono">{rejectRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alft-reject-reason">Revision reason</Label>
              <textarea
                id="alft-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Describe what needs to be corrected before requesting signatures again."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={Boolean(rejectingId)}>
              Cancel
            </Button>
            <Button onClick={() => void rejectToSw()} disabled={Boolean(rejectingId) || !String(rejectReason).trim()}>
              {rejectingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Return to SW
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <div className="text-xs text-muted-foreground font-mono">{sendConfirmRow?.medicalRecordNumber || '—'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/alft-view/${encodeURIComponent(String(sendConfirmRow?.id || ''))}`} target="_blank">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open final preview
                </Link>
              </Button>
              {sendConfirmRow?.alftSignature?.requestId ? (
                <Button
                  size="sm"
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
    </div>
  );
}

