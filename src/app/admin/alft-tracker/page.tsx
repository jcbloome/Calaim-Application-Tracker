'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth, useFirestore, useStorage } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SW_LOGIN_URL, SW_PORTAL_ALFT_UPLOAD_URL } from '@/lib/app-urls';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, UploadCloud, ExternalLink, RefreshCw, CheckCircle2, Send, Download } from 'lucide-react';
import { createInitialExactAlftAnswers } from '@/components/alft/ExactAlftQuestionnaire';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
const AGENCY_NAME = 'Connections Care Home Consultants';
const DEFAULT_SIGNATURE_PHONE = '800-330-5993';
const DEFAULT_PRE_REVIEW_MANAGER_NAME = 'John';
const DEFAULT_PRE_REVIEW_MANAGER_EMAIL = 'john@carehomefinders.com';
const DEFAULT_SEND_OWNER_NAME = 'Deydry';
const DEFAULT_SEND_OWNER_EMAIL = 'deydry@carehomefinders.com';

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
  prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string | null;
  prefillSourceLabel?: string | null;
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
  alftStatusNotes?: Array<{
    message?: string | null;
    createdAt?: any;
    createdAtIso?: string | null;
    createdByUid?: string | null;
    createdByName?: string | null;
    createdByEmail?: string | null;
    createdByRole?: string | null;
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
  workflowRouting?: {
    nextStepKey?: string | null;
    nextStepLabel?: string | null;
    nextRecipientName?: string | null;
    nextRecipientEmail?: string | null;
    finalReviewOwnerName?: string | null;
    finalReviewOwnerEmail?: string | null;
  } | null;
  assignedManager?: {
    uid?: string | null;
    name?: string | null;
    email?: string | null;
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
  assignedByName?: string | null;
  assignedByEmail?: string | null;
  assignedByPhone?: string | null;
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
  currentLocationTypeOther?: string | null;
  assessmentSite?: string | null;
  homeAddressStreet?: string | null;
  homeAddressCity?: string | null;
  homeAddressState?: string | null;
  homeAddressZip?: string | null;
  ispFacilityName?: string | null;
  ispCurrentLocation?: string | null;
  ispContactName?: string | null;
  ispContactRelationship?: string | null;
  ispContactPhone?: string | null;
  ispContactEmail?: string | null;
  ispContactConfirmDate?: string | null;
  prefillSourceMode?: 'cs_summary_app' | 'caspio_selected_fields' | string | null;
  prefillPurpose?: string | null;
  prefillSourceLabel?: string | null;
  status?: string | null;
  workflowStatus?: string | null;
  workflowStage?: string | null;
  workflowInvites?: {
    swPortalPath?: string | null;
    managerWorkflowPath?: string | null;
    invitedAt?: any;
  } | null;
  workflowStepsAt?: {
    swInviteSentAt?: any;
    swSubmittedAt?: any;
    managerReviewedAt?: any;
    rnReviewedAt?: any;
    finalReadyAt?: any;
    jocelynEmailSentAt?: any;
  } | null;
  workflowSteps?: {
    swInviteSent?: boolean;
    swSubmittedSigned?: boolean;
    managerReview?: string;
    rnReviewSignature?: string;
    pdfReady?: boolean;
  } | null;
  alftCompletionEmail?: {
    sentAt?: any;
  } | null;
  verificationSignoff?: {
    verified?: boolean | null;
    verifiedAt?: any;
    verifiedByUid?: string | null;
    verifiedByEmail?: string | null;
    verifiedByName?: string | null;
  } | null;
  swEmailDeliveryLog?: Array<{
    status?: string | null;
    recipientEmail?: string | null;
    atIso?: string | null;
    triggeredByName?: string | null;
    triggeredByEmail?: string | null;
    isResend?: boolean | null;
    error?: string | null;
  }> | null;
  swPortalSupportFiles?: Array<{
    id?: string | null;
    label?: string | null;
    fileName?: string | null;
    downloadURL?: string | null;
    storagePath?: string | null;
    uploadedAt?: any;
    uploadedByName?: string | null;
    uploadedByEmail?: string | null;
  }> | null;
  prefillVerification?: {
    manualSyncAt?: any;
    manualSyncByUid?: string | null;
    manualSyncByEmail?: string | null;
    manualSyncByName?: string | null;
    resolvedFields?: Record<string, string>;
  } | null;
  updatedAt?: any;
};

type StaffOption = { uid: string; label: string; email: string; role: 'Admin' | 'Super Admin' | 'Staff' };

const toLabel = (value: any) => String(value ?? '').trim();
const searchTokens = (value: string) =>
  String(value || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
const matchesAllTokens = (queryValue: string, fields: Array<unknown>) => {
  const tokens = searchTokens(queryValue);
  if (tokens.length === 0) return true;
  const haystack = fields.map((field) => toLabel(field).toLowerCase()).join(' ');
  return tokens.every((token) => haystack.includes(token));
};
const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatSwEmailBodyPreviewHtml = (value: string) =>
  escapeHtml(String(value || ''))
    .replace(/\r?\n/g, '<br/>')
    .replace(/((?:^|<br\/>)\s*)(Client:|ISP Location:|ISP Contact:)/gi, (_, lead, label) => `${lead}<strong>${label}</strong>`);

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

const todayLocalKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toMmDdYyyyOrRaw = (value: string | undefined | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) return `${isoLike[2].padStart(2, '0')}-${isoLike[3].padStart(2, '0')}-${isoLike[1]}`;
  const usFmt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usFmt) return `${usFmt[1].padStart(2, '0')}-${usFmt[2].padStart(2, '0')}-${usFmt[3]}`;
  return raw;
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
  const mswSigned = toMs((r as any)?.alftSignature?.mswSignedAt) > 0;
  const rnSigned = toMs((r as any)?.alftSignature?.rnSignedAt) > 0;
  if (workflowStatus.includes('returned_to_sw_for_revision') || managerStatus.includes('rejected')) return 'returned_to_sw';
  if (workflowStatus.includes('completed_sent_to_jocelyn') || toLabel(r.status).toLowerCase() !== 'pending') return 'completed';
  if (mswSigned && !rnSigned && !workflowStatus.includes('awaiting_rn')) return 'manager_review';
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) return 'manager_review';
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

const stageBlockClass = (stage: StageKey) => {
  switch (stage) {
    case 'received':
      return 'border-slate-300 bg-slate-50 text-slate-900';
    case 'returned_to_sw':
      return 'border-red-300 bg-red-50 text-red-900';
    case 'rn_assigned':
      return 'border-indigo-300 bg-indigo-50 text-indigo-900';
    case 'rn_downloaded':
      return 'border-blue-300 bg-blue-50 text-blue-900';
    case 'rn_reuploaded':
      return 'border-purple-300 bg-purple-50 text-purple-900';
    case 'staff_assigned':
      return 'border-amber-300 bg-amber-50 text-amber-900';
    case 'sent_for_signature':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case 'manager_review':
      return 'border-sky-300 bg-sky-50 text-sky-900';
    case 'ready_to_send':
      return 'border-violet-300 bg-violet-50 text-violet-900';
    case 'completed':
      return 'border-green-300 bg-green-50 text-green-900';
  }
};

const trackerCurrentStatusLabel = (r: StandaloneUpload, stage: StageKey) => {
  const workflowStatus = toLabel((r as any)?.workflowStatus).toLowerCase();
  if (stage === 'returned_to_sw') return 'Sent back to social worker';
  if (workflowStatus.includes('awaiting_kaiser_manager_final_review')) return 'Sent to John for final review';
  if (workflowStatus.includes('manager_review_complete_ready_to_send')) return 'John final review complete; awaiting Deydry send step';
  if (workflowStatus.includes('awaiting_rn_revision_and_signatures') || workflowStatus.includes('awaiting_rn_final_signature')) {
    return 'Sent to Leslie for RN review/signature';
  }
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) return 'SW submitted + signed';
  if (workflowStatus.includes('sw_invited') || workflowStatus.includes('sw_form')) return 'Sent to social worker + form started';
  return toLabel((r as any)?.workflowStatus) || toLabel(r.status) || 'pending';
};

const nextFlowForRow = (r: StandaloneUpload) => {
  const workflowStatus = toLabel((r as any)?.workflowStatus).toLowerCase();
  const signatureStatus = toLabel((r as any)?.alftSignature?.status).toLowerCase();
  const mswSigned = toMs((r as any)?.alftSignature?.mswSignedAt) > 0;
  const rnSigned = toMs((r as any)?.alftSignature?.rnSignedAt) > 0;
  const managerName = toLabel(
    (r as any)?.workflowRouting?.nextRecipientName ||
      (r as any)?.assignedManager?.name ||
      (r as any)?.workflowRouting?.finalReviewOwnerName ||
      (r as any)?.alftManagerReview?.reviewedByName
  ) || DEFAULT_PRE_REVIEW_MANAGER_NAME;
  const managerEmail = toLabel(
    (r as any)?.workflowRouting?.nextRecipientEmail ||
      (r as any)?.assignedManager?.email ||
      (r as any)?.workflowRouting?.finalReviewOwnerEmail ||
      (r as any)?.alftManagerReview?.reviewedByEmail
  ) || DEFAULT_PRE_REVIEW_MANAGER_EMAIL;
  const swName = toLabel(r.uploaderName) || 'Social Worker';
  const swEmail = toLabel(r.uploaderEmail);
  const rnName = toLabel(r.alftRnName) || 'Assigned RN';
  const rnEmail = toLabel(r.alftRnEmail);

  if (workflowStatus.includes('completed_sent_to_jocelyn') || toLabel(r.status).toLowerCase() !== 'pending') {
    return { label: 'Completed', name: 'Jocelyn', email: toLabel((r as any)?.alftCompletionEmail?.to), color: 'border-green-300 bg-green-50 text-green-900' };
  }
  if (workflowStatus.includes('returned_to_sw_for_revision')) {
    return { label: 'SW revision needed', name: swName, email: swEmail, color: 'border-red-300 bg-red-50 text-red-900' };
  }
  if (
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature') ||
    signatureStatus.includes('awaiting_rn')
  ) {
    return { label: 'RN review/signature', name: rnName, email: rnEmail, color: 'border-violet-300 bg-violet-50 text-violet-900' };
  }
  if (mswSigned && !rnSigned) {
    return { label: 'Manager pre-review', name: managerName, email: managerEmail, color: 'border-sky-300 bg-sky-50 text-sky-900' };
  }
  if (workflowStatus.includes('awaiting_kaiser_manager_final_review')) {
    return { label: 'Final manager review', name: managerName, email: managerEmail, color: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900' };
  }
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return { label: 'Manager pre-review', name: managerName, email: managerEmail, color: 'border-sky-300 bg-sky-50 text-sky-900' };
  }
  if (workflowStatus.includes('sw_invited') || workflowStatus.includes('sw_form')) {
    return { label: 'SW complete + submit', name: swName, email: swEmail, color: 'border-emerald-300 bg-emerald-50 text-emerald-900' };
  }
  return { label: 'Start workflow', name: swName, email: swEmail, color: 'border-slate-300 bg-slate-50 text-slate-900' };
};

const prefillSourceFlowLabel = (r: StandaloneUpload) => {
  const mode = toLabel((r as any)?.prefillSourceMode).toLowerCase();
  const label = toLabel((r as any)?.prefillSourceLabel);
  if (mode === 'cs_summary_app') return 'Member info source: App';
  if (mode === 'caspio_selected_fields') return 'Member info source: Caspio';
  if (label) return `Member info source: ${label}`;
  return 'Member info source: Not captured';
};

const prefillSourceFlowClass = (r: StandaloneUpload) => {
  const mode = toLabel((r as any)?.prefillSourceMode).toLowerCase();
  if (mode === 'cs_summary_app') return 'border-green-300 bg-green-50 text-green-900';
  if (mode === 'caspio_selected_fields') return 'border-blue-300 bg-blue-50 text-blue-900';
  return 'border-slate-300 bg-slate-50 text-slate-800';
};

const assignmentWorkflowSignals = (row: AlftAssignmentQueueRow) => {
  const status = String(row?.status || '').toLowerCase();
  const workflowStatus = String(row?.workflowStatus || '').toLowerCase();
  const swInviteSent =
    workflowStatus.includes('sw_invited') ||
    status === 'sw_form_in_progress' ||
    Boolean(row?.workflowSteps?.swInviteSent) ||
    Boolean(toMs(row?.workflowStepsAt?.swInviteSentAt));
  const swSubmitted =
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('returned_to_sw_for_revision') ||
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature') ||
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('completed_sent_to_jocelyn') ||
    Boolean(row?.workflowSteps?.swSubmittedSigned) ||
    Boolean(toMs(row?.workflowStepsAt?.swSubmittedAt));
  const returnedToSw = workflowStatus.includes('returned_to_sw_for_revision');
  const rnStep =
    workflowStatus.includes('awaiting_rn') ||
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature');
  const finalManager = workflowStatus.includes('awaiting_kaiser_manager_final_review');
  const readyToSend = workflowStatus.includes('manager_review_complete_ready_to_send');
  const complete = workflowStatus.includes('completed_sent_to_jocelyn') || status === 'completed';
  return { status, workflowStatus, swInviteSent, swSubmitted, returnedToSw, rnStep, finalManager, readyToSend, complete };
};

const nextStepForAssignment = (row: AlftAssignmentQueueRow) => {
  const { workflowStatus, swInviteSent, swSubmitted, returnedToSw, rnStep, finalManager, readyToSend, complete } =
    assignmentWorkflowSignals(row);
  if (complete) {
    return 'Next: Workflow complete. Send/confirm completed ALFT PDF to Jocelyn.';
  }
  if (returnedToSw) {
    return 'Next: SW applies requested changes, signs again, and routes back to John for re-check.';
  }
  if (rnStep) {
    return 'Next: RN reviews, edits as needed, and signs; then packet routes to John for final review.';
  }
  if (finalManager) {
    return 'Next: John completes final review, then routes to Deydry for send/print to Jocelyn.';
  }
  if (readyToSend) {
    return 'Next: Deydry sends or prints the completed ALFT packet to Jocelyn.';
  }
  if (swSubmitted || workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return 'Next: John (ALTA manager) does first review and either rejects for SW changes or approves to send to RN.';
  }
  if (swInviteSent) {
    return 'Next: SW logs into portal, completes prepopulated ALFT, and submits with signature.';
  }
  return 'Next: Preview prefilled pages, then send workflow notice to SW.';
};

const assignmentStageBlock = (row: AlftAssignmentQueueRow) => {
  const { workflowStatus, swSubmitted, returnedToSw, rnStep, finalManager, readyToSend, complete } =
    assignmentWorkflowSignals(row);
  if (complete) {
    return { label: 'Completed', color: 'border-green-300 bg-green-50 text-green-900' };
  }
  if (returnedToSw) {
    return { label: 'Returned to SW', color: 'border-red-300 bg-red-50 text-red-900' };
  }
  if (rnStep) {
    return { label: 'RN review/signature', color: 'border-violet-300 bg-violet-50 text-violet-900' };
  }
  if (finalManager) {
    return { label: 'John final review', color: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900' };
  }
  if (readyToSend) {
    return { label: 'Deydry send/print step', color: 'border-purple-300 bg-purple-50 text-purple-900' };
  }
  if (swSubmitted || workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return { label: 'Manager pre-review', color: 'border-sky-300 bg-sky-50 text-sky-900' };
  }
  if (workflowStatus.includes('sw_invited')) {
    return { label: 'SW invited/submitting', color: 'border-emerald-300 bg-emerald-50 text-emerald-900' };
  }
  return { label: 'Prefill ready', color: 'border-slate-300 bg-slate-50 text-slate-900' };
};

const assignmentNextRecipientBlock = (row: AlftAssignmentQueueRow) => {
  const { workflowStatus, swSubmitted, returnedToSw, rnStep, finalManager, readyToSend, complete } = assignmentWorkflowSignals(row);
  const swName = toLabel(row.assignedSwName) || 'Social Worker';
  const swEmail = toLabel(row.assignedSwEmail);
  const managerName = toLabel(
    (row as any)?.alftManagerName ||
    (row as any)?.assignedManagerName ||
    (row as any)?.assignedByName
  ) || DEFAULT_PRE_REVIEW_MANAGER_NAME;
  const managerEmail = toLabel(
    (row as any)?.alftManagerEmail ||
    (row as any)?.assignedManagerEmail ||
    (row as any)?.assignedByEmail
  ) || DEFAULT_PRE_REVIEW_MANAGER_EMAIL;
  const sendOwnerName =
    toLabel((row as any)?.workflowRouting?.nextRecipientName) ||
    DEFAULT_SEND_OWNER_NAME;
  const sendOwnerEmail =
    toLabel((row as any)?.workflowRouting?.nextRecipientEmail) ||
    DEFAULT_SEND_OWNER_EMAIL;

  if (returnedToSw) {
    return { label: 'SW revision needed', name: swName, email: swEmail, color: 'border-red-300 bg-red-50 text-red-900' };
  }
  if (complete) {
    return { label: 'Completed', name: 'Workflow complete', email: '', color: 'border-slate-300 bg-slate-50 text-slate-900' };
  }
  if (rnStep) {
    return { label: 'RN review/signature', name: 'Leslie (RN)', email: 'rn@carehomefinders.com', color: 'border-violet-300 bg-violet-50 text-violet-900' };
  }
  if (finalManager || swSubmitted || workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return { label: finalManager ? 'John final review' : 'Manager review', name: managerName, email: managerEmail, color: 'border-sky-300 bg-sky-50 text-sky-900' };
  }
  if (readyToSend) {
    return { label: 'Deydry send step', name: sendOwnerName, email: sendOwnerEmail, color: 'border-purple-300 bg-purple-50 text-purple-900' };
  }
  if (workflowStatus.includes('sw_invited') || workflowStatus.includes('sw_form')) {
    return { label: 'SW invited/submitting', name: swName, email: swEmail, color: 'border-emerald-300 bg-emerald-50 text-emerald-900' };
  }
  return { label: 'Start workflow', name: swName, email: swEmail, color: 'border-blue-300 bg-blue-50 text-blue-900' };
};

const assignmentSourceBlock = (row: AlftAssignmentQueueRow) => {
  const mode = resolvePrefillSourceMode(row);
  if (mode === 'cs_summary_app') {
    return { label: 'Member info source: App', value: 'cs_summary_app', color: 'border-green-300 bg-green-50 text-green-900' };
  }
  return { label: 'Member info source: Caspio', value: 'caspio_selected_fields', color: 'border-blue-300 bg-blue-50 text-blue-900' };
};

const asAnswer = (value: unknown) => String(value ?? '').trim();
const toTitleCaseCity = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
};

const REQUIRED_PREFILL_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'p1_plan_id', label: 'Plan ID' },
  { key: 'p1_mrn', label: 'MRN Number' },
  { key: 'p1_member_name', label: 'Member Name' },
  { key: 'p1_assessor_name', label: 'Assessor Name' },
  { key: 'p1_first_name', label: 'First Name' },
  { key: 'p1_last_name', label: 'Last Name' },
  { key: 'p1_phone', label: 'Phone Number' },
  { key: 'p1_dob', label: 'Date of Birth' },
  { key: 'p1_sex', label: 'Sex' },
  { key: 'p1_primary_language', label: 'Primary Language' },
  { key: 'p1_other_responder_name', label: 'If yes, name' },
  { key: 'p1_other_responder_relationship', label: 'If yes, relationship' },
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

const NON_BLOCKING_PREFILL_FIELD_KEYS = new Set([
  'p1_phone',
  'p1_primary_language',
  'p1_other_responder_name',
  'p1_other_responder_relationship',
]);
const BLOCKING_REQUIRED_PREFILL_FIELDS = REQUIRED_PREFILL_FIELDS.filter(
  ({ key }) => !NON_BLOCKING_PREFILL_FIELD_KEYS.has(key)
);

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

const getRequiredValueFromAssignmentRow = (row: AlftAssignmentQueueRow, key: string) => {
  switch (key) {
    case 'p1_plan_id':
      return toLabel(row.alftPlanId || row.memberMrn);
    case 'p1_mrn':
      return toLabel(row.memberMrn);
    case 'p1_member_name':
      return toLabel(row.memberName);
    case 'p1_assessor_name':
      return toLabel(row.assignedSwName);
    case 'p1_first_name':
      return toLabel(row.memberFirstName);
    case 'p1_last_name':
      return toLabel(row.memberLastName);
    case 'p1_phone':
      return toLabel(row.memberPhone);
    case 'p1_dob':
      return toLabel(row.birthDate);
    case 'p1_sex':
      return toLabel(row.memberSex);
    case 'p1_primary_language':
      return toLabel(row.memberPrimaryLanguage);
    case 'p1_other_responder_name':
      return toLabel(row.ispContactName);
    case 'p1_other_responder_relationship':
      return toLabel(row.ispContactRelationship);
    case 'p2_current_street':
      return toLabel(row.ispCurrentAddressStreet);
    case 'p2_current_city':
      return toTitleCaseCity(toLabel(row.ispCurrentAddressCity));
    case 'p2_current_state':
      return toLabel(row.ispCurrentAddressState);
    case 'p2_current_zip':
      return toLabel(row.ispCurrentAddressZip);
    case 'p2_current_type':
      return toLabel(row.currentLocationType);
    case 'p2_current_type_other':
      return toLabel(row.currentLocationTypeOther || row.currentLocationType);
    case 'p2_assessment_site':
      return toLabel(row.assessmentSite);
    case 'p2_home_street':
      return toLabel(row.homeAddressStreet);
    case 'p2_home_city':
      return toTitleCaseCity(toLabel(row.homeAddressCity));
    case 'p2_home_state':
      return toLabel(row.homeAddressState);
    case 'p2_home_zip':
      return toLabel(row.homeAddressZip);
    default:
      return '';
  }
};

const getRequiredValueFromResolvedOrAssignment = (
  row: AlftAssignmentQueueRow,
  key: string,
  resolved: Record<string, string>
) => {
  const fromResolved = String(resolved?.[key] || '').trim();
  if (fromResolved) return fromResolved;
  return String(getRequiredValueFromAssignmentRow(row, key) || '').trim();
};

const assignmentWorkflowSteps = (row: AlftAssignmentQueueRow) => {
  const { swInviteSent, swSubmitted, returnedToSw, rnStep, finalManager, complete } = assignmentWorkflowSignals(row);

  return [
    { step: 1, chip: 'Verify Prefill', label: 'Staff verifies required ALFT prefill fields', done: swInviteSent || swSubmitted, current: !swInviteSent },
    { step: 2, chip: 'Verify Checkbox', label: 'Staff verification checkbox sign-off with timestamp', done: swInviteSent || swSubmitted, current: false },
    { step: 3, chip: 'SW Email Sent', label: 'Preview/send SW email notice with timestamp', done: swInviteSent || swSubmitted, current: !swInviteSent },
    { step: 4, chip: 'SW Signed', label: 'SW completes and signs ALFT packet', done: swSubmitted, current: swInviteSent && !swSubmitted },
    { step: 5, chip: 'John First Review', label: 'John approves or rejects with needed changes', done: swSubmitted, current: swSubmitted && !returnedToSw && !rnStep },
    { step: 6, chip: 'Return + Re-check', label: 'If rejected, SW updates and John re-checks before RN', done: returnedToSw || rnStep || finalManager || complete, current: returnedToSw },
    { step: 7, chip: 'RN Review + Sign', label: 'RN reviews, edits as needed, and signs', done: rnStep || finalManager || complete, current: rnStep && !finalManager },
    { step: 8, chip: 'Final + Jocelyn', label: 'John final review, then Deydry send/print to Jocelyn', done: finalManager || complete, current: finalManager && !complete },
  ];
};

const stepChipClass = (step: { done: boolean; current: boolean }) => {
  if (step.done) return 'border-slate-300 bg-white text-green-700';
  if (step.current) return 'border-slate-300 bg-white text-slate-900';
  return 'border-slate-200 bg-white text-slate-500';
};

const stepDotClass = (step: { done: boolean; current: boolean }) => {
  if (step.done) return 'bg-emerald-500';
  if (step.current) return 'bg-blue-500';
  return 'bg-slate-300';
};

type WorkflowChecklistStep = {
  id: string;
  label: string;
  done: boolean;
  current?: boolean;
  atMs?: number;
  atLabel?: string;
};

const workflowChecklistFor = (r: StandaloneUpload): WorkflowChecklistStep[] => {
  const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
  const managerStatus = String((r as any)?.alftManagerReview?.status || '').toLowerCase();
  const workflowStepsAt = (r as any)?.workflowStepsAt || {};
  const workflowInvites = (r as any)?.workflowInvites || {};
  const signature = (r as any)?.alftSignature || {};
  const managerReview = (r as any)?.alftManagerReview || {};
  const workflowEmailStatus = (r as any)?.workflowEmailStatus || {};
  const completionEmail = (r as any)?.alftCompletionEmail || {};
  const swInvited =
    workflowStatus.includes('sw_invited') ||
    workflowStatus.includes('sw_form') ||
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature') ||
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('manager_review_complete_ready_to_send') ||
    workflowStatus.includes('completed_sent_to_jocelyn');
  const currentlyReturnedToSw = workflowStatus.includes('returned_to_sw_for_revision');
  const wasReturnedToSw = currentlyReturnedToSw || managerStatus.includes('rejected');
  const swSubmittedSigned =
    workflowStatus.includes('awaiting_manager_review_pre_rn') ||
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature') ||
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('manager_review_complete_ready_to_send') ||
    workflowStatus.includes('completed_sent_to_jocelyn') ||
    Boolean((r as any)?.alftSignature?.mswSignedAt);
  const sentToLeslie =
    workflowStatus.includes('awaiting_rn_revision_and_signatures') ||
    workflowStatus.includes('awaiting_rn_final_signature') ||
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('manager_review_complete_ready_to_send') ||
    workflowStatus.includes('completed_sent_to_jocelyn') ||
    Boolean((r as any)?.alftSignature?.requestedAt);
  const rnSigned = Boolean((r as any)?.alftSignature?.rnSignedAt);
  const sentToManagerForFinalReview =
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
    workflowStatus.includes('manager_review_complete_ready_to_send') ||
    workflowStatus.includes('completed_sent_to_jocelyn') ||
    managerStatus === 'pending' ||
    managerStatus === 'approved';
  const sentToJocelyn = workflowStatus.includes('completed_sent_to_jocelyn');
  const sentToSwAtMs = Math.max(toMs(workflowStepsAt?.swInviteSentAt), toMs(workflowInvites?.invitedAt), toMs(r.createdAt));
  const sentBackToSwAtMs = Math.max(toMs(managerReview?.rejectedAt), toMs(managerReview?.returnedAt));
  const swSubmittedSignedAtMs = Math.max(toMs(workflowStepsAt?.swSubmittedAt), toMs(signature?.mswSignedAt));
  const sentToLeslieAtMs = Math.max(toMs(signature?.requestedAt), toMs(workflowEmailStatus?.managerStep2EmailSentAt));
  const sentToCsManagerAtMs = Math.max(
    toMs(managerReview?.routedAt),
    toMs(workflowEmailStatus?.managerStep4EmailSentAt),
    workflowStatus.includes('awaiting_kaiser_manager_final_review') ? toMs((r as any)?.workflowUpdatedAt) : 0
  );
  const managerApprovedAtMs = toMs(managerReview?.reviewedAt);
  const sentToJocelynAtMs = Math.max(toMs(completionEmail?.sentAt), toMs(workflowStepsAt?.jocelynEmailSentAt));

  const steps: WorkflowChecklistStep[] = [
    {
      id: 'sent_to_sw',
      label: '1) Workflow started (sent to social worker + form started)',
      done: swInvited,
      atMs: sentToSwAtMs || undefined,
    },
    {
      id: 'sent_back_to_sw',
      label: '2) Sent back to social worker',
      done: wasReturnedToSw,
      current: currentlyReturnedToSw,
      atMs: sentBackToSwAtMs || undefined,
    },
    {
      id: 'sw_submitted_signed',
      label: wasReturnedToSw ? '3) SW resubmitted + signed' : '3) SW submitted + signed',
      done: swSubmittedSigned,
      atMs: swSubmittedSignedAtMs || undefined,
    },
    {
      id: 'sent_to_rn',
      label: '4) Sent to Leslie + RN review/signature',
      done: sentToLeslie && rnSigned,
      current: sentToLeslie && !rnSigned && !sentToManagerForFinalReview,
      atMs: sentToLeslieAtMs || undefined,
    },
    {
      id: 'sent_to_cs_manager',
      label: '5) Sent to John for final review',
      done: sentToManagerForFinalReview,
      current: workflowStatus.includes('awaiting_kaiser_manager_final_review'),
      atMs: sentToCsManagerAtMs || undefined,
    },
    {
      id: 'sent_to_jocelyn',
      label: '6) Manager final approval + sent to Jocelyn',
      done: sentToJocelyn,
      current:
        (workflowStatus.includes('manager_review_complete_ready_to_send') ||
          (managerStatus === 'approved' &&
            Boolean((r as any)?.alftSignature?.packetPdfStoragePath || (r as any)?.alftSignature?.signaturePagePdfStoragePath))) &&
        !sentToJocelyn,
      atMs: (sentToJocelynAtMs || managerApprovedAtMs) || undefined,
    },
  ];
  return steps.map((step) => ({
    ...step,
    atLabel: step.atMs ? fmtTimeline(step.atMs) : '',
  }));
};

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
  const [isKaiserStaff, setIsKaiserStaff] = useState(false);
  const [isRnStaff, setIsRnStaff] = useState(false);
  const [startingWorkflowFor, setStartingWorkflowFor] = useState('');
  const [verifyingMemberId, setVerifyingMemberId] = useState('');
  const [pullingIspForMemberId, setPullingIspForMemberId] = useState('');
  const [swEmailPreviewUseTestOverride, setSwEmailPreviewUseTestOverride] = useState(false);
  const [swEmailPreviewTestEmail, setSwEmailPreviewTestEmail] = useState('');
  const [dummySendRnEmail, setDummySendRnEmail] = useState('');
  const [dummySendManagerEmail, setDummySendManagerEmail] = useState('');
  const [dummySendCompletedEmail, setDummySendCompletedEmail] = useState('');
  const [swEmailPreviewOpen, setSwEmailPreviewOpen] = useState(false);
  const [swEmailPreviewRow, setSwEmailPreviewRow] = useState<AlftAssignmentQueueRow | null>(null);
  const [swEmailPreviewEditableBody, setSwEmailPreviewEditableBody] = useState('');
  const [swEmailById, setSwEmailById] = useState<Record<string, string>>({});
  const [swSupportUploadFiles, setSwSupportUploadFiles] = useState<File[]>([]);
  const [swSupportUploadLabel, setSwSupportUploadLabel] = useState('');
  const [swSupportUploading, setSwSupportUploading] = useState(false);
  const [swSupportUploadProgress, setSwSupportUploadProgress] = useState(0);
  const editRouteId = String(searchParams?.get('edit') || '').trim();
  const isEditRoute = Boolean(editRouteId);
  const managerActionsOnly = String(searchParams?.get('managerActions') || '').trim() === '1';

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
            alftStatusNotes: Array.isArray((r as any)?.alftStatusNotes) ? (r as any).alftStatusNotes : [],
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
              ispContactRelationship: toLabel(r.ispContactRelationship) || null,
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

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const isManagerActionStatus = (row: StandaloneUpload) => {
      const workflowStatus = String((row as any)?.workflowStatus || '').toLowerCase();
      return (
        workflowStatus.includes('awaiting_manager_review_pre_rn') ||
        workflowStatus.includes('awaiting_kaiser_manager_final_review') ||
        workflowStatus.includes('manager_review_complete_ready_to_send')
      );
    };
    return rows
      .filter((r) => {
        const statusLower = String((r as any)?.status || '').toLowerCase();
        const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
        if (statusLower === 'removed' || workflowStatus.includes('removed_from_tracker')) return false;
        if (managerActionsOnly && !isManagerActionStatus(r)) return false;
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
        const aMs = Math.max(toMs(a.updatedAt), toMs(a.createdAt));
        const bMs = Math.max(toMs(b.updatedAt), toMs(b.createdAt));
        return bMs - aMs;
      });
  }, [rows, search, managerActionsOnly]);

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
    const ispContactRelationship = pickPreview('p1_other_responder_relationship', 'ispContactRelationship');
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
    const ispContact2Relationship = pickPreview('isp_contact_2_relationship', 'ispContact2Relationship');
    const ispContact2Phone = pickPreview('isp_contact_2_phone', 'ispContact2Phone');
    const ispContact2Email = pickPreview('isp_contact_2_email', 'ispContact2Email');
    const secondaryContactName = [ispContact2First, ispContact2Last].filter(Boolean).join(' ').trim();
    const hasSecondaryIspContact = Boolean(secondaryContactName || ispContact2Relationship || ispContact2Phone || ispContact2Email);
    const hasContactMethod = Boolean(ispPhone || ispEmail);
    const hasFacilityTypeOrName = Boolean(ispFacilityType || ispFacilityName);
    const missingIspFields = [
      !ispAddress ? 'ISP address' : '',
      !hasFacilityTypeOrName ? 'Facility type or facility name' : '',
      !hasContactMethod ? 'ISP contact phone or email' : '',
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
        'ISP Contact:',
        `${ispContactName || 'Not provided'} (${ispContactRelationship || 'Relationship not provided'})`,
        `Tel: ${ispPhone || 'Not provided'}`,
        `Email: ${ispEmail || 'Not provided'}`,
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
        'Please let me know about the assessment:',
        '- When it’s scheduled',
        '- When it’s completed',
        "- Please let me know once you've submitted your invoice, so I can take the client off of your caseload list.",
        '',
        'To complete the ALFT and signature workflow, sign in and open this link:',
        SW_PORTAL_ALFT_UPLOAD_URL,
        `Social worker login (if needed): ${SW_LOGIN_URL}`,
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

  const openAssign = useCallback((row: StandaloneUpload, kind: 'rn' | 'staff') => {
    setAssignRow(row);
    setAssignKind(kind);
    setAssignUid('');
    setAssignOpen(true);
  }, []);

  // Returns true for any user allowed to kick a form back to the SW for revision:
  // admins, Kaiser staff/managers, and the assigned RN for the intake.
  const canKickBackToSw = useCallback(
    (row: StandaloneUpload) => {
      if (isSuperAdmin || isAdmin || isKaiserAssignmentManager || isKaiserStaff) return true;
      const uid = String(user?.uid || '').trim();
      const email = String(user?.email || '').toLowerCase();
      const rnUid = String((row as any)?.alftRnUid || '').trim();
      const rnEmail = String((row as any)?.alftRnEmail || '').toLowerCase();
      return (uid && uid === rnUid) || (email && email === rnEmail);
    },
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager, isKaiserStaff, user?.uid, user?.email]
  );

  const canRunManagerWorkflow = useMemo(
    () => Boolean(isSuperAdmin || isAdmin || isKaiserAssignmentManager || isKaiserStaff || isRnStaff),
    [isSuperAdmin, isAdmin, isKaiserAssignmentManager, isKaiserStaff, isRnStaff]
  );
  // Step gate requested by workflow owner:
  // SW submit -> Kaiser manager pre-review -> send to Leslie (RN) -> Kaiser manager final review -> email Jocelyn.
  const canSendToRnAfterPreReview = useCallback(
    (row: StandaloneUpload) => {
      if (!canRunManagerWorkflow) return false;
      const sigRequested = Boolean((row as any)?.alftSignature?.requestedAt);
      if (sigRequested) return false;
      const workflowStatus = String((row as any)?.workflowStatus || '').toLowerCase();
      const hasAlftFormContent =
        Boolean((row as any)?.alftForm?.transitionSummary) ||
        Boolean((row as any)?.alftForm?.requestedActions) ||
        (typeof (row as any)?.alftForm?.exactPacketAnswers === 'object' &&
          Object.keys(((row as any)?.alftForm?.exactPacketAnswers || {}) as Record<string, unknown>).length > 0);
      if (workflowStatus.includes('completed_sent_to_jocelyn') || workflowStatus.includes('awaiting_kaiser_manager_final_review')) {
        return false;
      }
      return (
        workflowStatus.includes('awaiting_manager_review_pre_rn') ||
        workflowStatus.includes('returned_to_sw_for_revision') ||
        workflowStatus.includes('manager_review_pre_rn_complete_ready_for_rn') ||
        hasAlftFormContent
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

  const pullIspInfoFromCaspio = useCallback(
    async (row: AlftAssignmentQueueRow) => {
      if (!firestore) return;
      const memberId = String(row.memberId || row.id || '').trim();
      if (!memberId || pullingIspForMemberId) return;
      setPullingIspForMemberId(memberId);
      try {
        const res = await fetch('/api/kaiser-members?refresh=1&source=caspio', { cache: 'no-store' });
        const payload = (await res.json().catch(() => ({}))) as any;
        if (!res.ok || !payload?.success) {
          throw new Error(String(payload?.error || `Could not pull Caspio members (HTTP ${res.status})`));
        }
        const members = Array.isArray(payload?.members) ? payload.members : [];
        const memberIdLower = memberId.toLowerCase();
        const memberMrn = String(row.memberMrn || '').trim().toLowerCase();
        const memberName = String(row.memberName || '').trim().toLowerCase();
        const hit =
          members.find((m: any) => String(m?.Client_ID2 || m?.client_ID2 || m?.id || '').trim().toLowerCase() === memberIdLower) ||
          (memberMrn
            ? members.find((m: any) =>
                String(m?.memberMrn || m?.MCP_CIN || m?.Member_MRN || '').trim().toLowerCase() === memberMrn
              )
            : null) ||
          (memberName
            ? members.find((m: any) => String(m?.memberName || m?.Senior_Last_First_ID || '').trim().toLowerCase() === memberName)
            : null);
        if (!hit) throw new Error('Member not found in Caspio pull.');

        const contactFirst = toLabel(hit?.ISP_Contact_First || hit?.Contact_First);
        const contactLast = toLabel(hit?.ISP_Contact_Last || hit?.Contact_Last);
        const combinedContactName = `${contactFirst} ${contactLast}`.trim();
        const patch = {
          ispCurrentLocation: toLabel(hit?.ISP_Contact_Location),
          ispFacilityName: toLabel(hit?.ISP_Contact_Location),
          currentLocationType: toLabel(hit?.ISP_Location_Type),
          currentLocationTypeOther: toLabel(hit?.ISP_Location_Type),
          ispCurrentAddressStreet: toLabel(hit?.ISP_Contact_Address),
          ispCurrentAddressCity: toTitleCaseCity(toLabel(hit?.ISP_Contact_City)),
          ispCurrentAddressState: toLabel(hit?.ISP_Contact_State),
          ispCurrentAddressZip: toLabel(hit?.ISP_Contact_Zip),
          ispContactName: toLabel(combinedContactName || hit?.ISP_Contact_Name || hit?.ispContactName || hit?.RCFE_Admin_Name || hit?.Contact_Name),
          ispContactRelationship: toLabel(hit?.ISP_Contact_Relationship || hit?.ispContactRelationship || hit?.Contact_Relationship),
          ispContactPhone: toLabel(hit?.ISP_Contact_Phone || hit?.ispContactPhone || hit?.Member_Phone || hit?.memberPhone),
          ispContactEmail: toLabel(hit?.ISP_Contact_Email || hit?.ispContactEmail || hit?.Member_Email || hit?.memberEmail).toLowerCase(),
          ispContactConfirmDate: toLabel(
            hit?.ISP_Contact_Confirm_Field || hit?.ISP_Contact_Confirm_Date || hit?.ISP_Contact_Confirm || hit?.ISP_Confirm_Date
          ),
        };

        await updateDoc(doc(firestore, 'alft_assignments', memberId), {
          ...patch,
          updatedAt: serverTimestamp(),
        });

        setSwEmailPreviewRow((prev) =>
          prev && String(prev.memberId || prev.id || '').trim() === memberId
            ? ({ ...prev, ...patch } as AlftAssignmentQueueRow)
            : prev
        );

        toast({
          title: 'ISP info refreshed from Caspio',
          description: 'SW email preview now uses the latest ISP contact fields.',
        });
      } catch (e: any) {
        toast({
          title: 'Could not pull ISP info',
          description: e?.message || 'Please retry.',
          variant: 'destructive',
        });
      } finally {
        setPullingIspForMemberId('');
      }
    },
    [firestore, pullingIspForMemberId, toast]
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
    setEditExactAnswers(merged);
    setEditTransitionSummary(String(row?.alftForm?.transitionSummary || ''));
    setEditRequestedActions(String(row?.alftForm?.requestedActions || ''));
    setEditBarriersAndRisks(String(row?.alftForm?.barriersAndRisks || ''));
    setEditAdditionalNotes(String(row?.alftForm?.additionalNotes || ''));
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
          const task = uploadBytesResumable(storageRef, file);
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

      toast({
        title: uploadedSupportFiles.length > 1 ? 'Support files uploaded' : 'Support file uploaded',
        description: 'These files are now visible to the social worker in the ALFT portal.',
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
    void requestSignatures(row);
  };

  const saveEdit = async () => {
    if (!editRow || editSaving) return;
    if (!auth?.currentUser) {
      toast({ title: 'Not signed in', description: 'Please sign in again to save ALFT edits.', variant: 'destructive' });
      return;
    }
    const summary =
      String(editTransitionSummary || '').trim() ||
      String((editExactAnswers as any)?.p13_commentary_section || '').trim() ||
      'ALFT form updated by Kaiser staff.';
    const actions =
      String(editRequestedActions || '').trim() ||
      'Review digital ALFT form. RN (Leslie) adds comments/signature, John completes final review, then Deydry sends/prints to Jocelyn.';
    try {
      setEditSaving(true);
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
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(String(data?.error || `Save failed (HTTP ${res.status})`));
      }
      toast({
        title: 'ALFT form updated',
        description: 'Changes saved. You can now approve or reject from this same page.',
      });
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

  const routeToCsManagerFinalReview = async (row: StandaloneUpload) => {
    if (!auth?.currentUser) return;
    if (!row?.id || routingToFinalManagerId) return;
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
        body: JSON.stringify({
          idToken,
          intakeId: row.id,
          forceDefaultRn: true,
          overrideRnEmail: String(dummySendRnEmail || '').trim().toLowerCase() || undefined,
          overrideRnName: String(dummySendRnEmail || '').trim() ? 'Dummy Recipient' : undefined,
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
        title: 'Signature request sent',
        description: `Pre-review complete. Next: ${String(data?.rnRecipient?.name || 'RN')} updates/signs, then John final review, then Deydry send step. RN email to ${String(data?.rnRecipient?.email || 'configured RN')}: ${data?.rn?.emailSent ? 'sent' : 'not sent'} • MSW email: ${data?.testMode ? 'skipped (test mode)' : data?.msw?.emailSent ? 'sent' : 'not sent'}`,
      });
    } catch (e: any) {
      toast({ title: 'Could not request signatures', description: e?.message || 'Request failed.', variant: 'destructive' });
    } finally {
      setSigRequestingId('');
    }
  };

  const resendSwNoticeFromEdit = async (row: StandaloneUpload) => {
    const assignmentRow = findAssignmentForUpload(row);
    if (!assignmentRow) {
      toast({
        title: 'SW assignment not found',
        description: 'This intake is missing an ALFT assignment row, so SW email cannot be resent from this view.',
        variant: 'destructive',
      });
      return;
    }
    const proceed = window.confirm('Re-send ALFT workflow email to the assigned social worker now?');
    if (!proceed) return;
    await startWorkflowFromIntake(assignmentRow, { skipVerificationCheck: true });
  };

  const resendLeslieFromEdit = (row: StandaloneUpload) => {
    const proceed = window.confirm('Re-send the RN/Leslie workflow email now?');
    if (!proceed) return;
    void requestSignatures(row);
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

  const removeMemberFromTracker = async (row: StandaloneUpload) => {
    if (!firestore || !row?.id || removingFromTrackerId) return;
    const proceed = window.confirm(
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

  const resolveTemplateUrlFromUpload = (row: StandaloneUpload | null) => {
    if (!row) return '';
    const files = Array.isArray((row as any)?.files) ? (row as any).files : [];
    for (const file of files) {
      const url = String((file as any)?.downloadURL || '').trim();
      const name = String((file as any)?.fileName || '').trim();
      if (!url) continue;
      if (/\.pdf(\?|$)/i.test(url) || /\.pdf(\?|$)/i.test(name)) return url;
    }
    const revisions = Array.isArray((row as any)?.alftRevisions) ? (row as any).alftRevisions : [];
    for (let i = revisions.length - 1; i >= 0; i -= 1) {
      const url = String((revisions[i] as any)?.downloadURL || '').trim();
      const name = String((revisions[i] as any)?.fileName || '').trim();
      if (!url) continue;
      if (/\.pdf(\?|$)/i.test(url) || /\.pdf(\?|$)/i.test(name)) return url;
    }
    return '';
  };

  const printCurrentEditPdf = () => {
    if (!editRow?.id) return;
    const answersKey = `alft-print-${editRow.id}-${Date.now()}`;
    try {
      const payload = { ...editExactAnswers, p1_agency: AGENCY_NAME };
      const serialized = JSON.stringify(payload);
      // New tab printable view cannot read sessionStorage from this tab,
      // so we store in localStorage for cross-tab handoff.
      window.localStorage.setItem(answersKey, serialized);
      // Keep sessionStorage too for backward compatibility with same-tab flows.
      window.sessionStorage.setItem(answersKey, serialized);
    } catch {
      // If browser storage fails, dummy-preview falls back to saved intake data.
    }
    const params = new URLSearchParams();
    params.set('view', 'print');
    params.set('intakeId', editRow.id);
    params.set('answersKey', answersKey);
    params.set('returnTo', `/admin/alft-tracker?edit=${encodeURIComponent(editRow.id)}`);
    const href = `/admin/alft-tracker/dummy-preview?${params.toString()}`;
    window.location.assign(href);
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

  const canApproveToRnFromEdit = Boolean(editRow && canSendToRnAfterPreReview(editRow));
  const canRejectToSwFromEdit = Boolean(editRow && canKickBackToSw(editRow));
  const canRunFinalReviewFromEdit = Boolean(
    editRow &&
      canRunManagerWorkflow &&
      Boolean(editRow?.alftSignature?.packetPdfStoragePath || editRow?.alftSignature?.signaturePagePdfStoragePath) &&
      String((editRow as any)?.alftManagerReview?.status || '').toLowerCase() !== 'approved'
  );
  const canSendCompletedFromEdit = Boolean(
    editRow &&
      canRunManagerWorkflow &&
      Boolean(editRow?.alftSignature?.packetPdfStoragePath || editRow?.alftSignature?.signaturePagePdfStoragePath) &&
      String((editRow as any)?.alftManagerReview?.status || '').toLowerCase() === 'approved'
  );
  const canRouteToCsManagerFromEdit = Boolean(
    editRow &&
      (isRnStaff || canRunManagerWorkflow) &&
      !String((editRow as any)?.workflowStatus || '').toLowerCase().includes('completed_sent_to_jocelyn') &&
      !String((editRow as any)?.workflowStatus || '').toLowerCase().includes('manager_review_complete_ready_to_send')
  );
  const editRowLive = editRow?.id ? (rows.find((r) => r.id === editRow.id) || editRow) : editRow;
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
      )}${managerActionsOnly ? '&managerActions=1' : ''}`
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
    ? `/admin/alft-tracker?focus=${encodeURIComponent(closeEditorFocusId)}${managerActionsOnly ? '&managerActions=1' : ''}`
    : '/admin/alft-tracker';
  const headerBackToTrackerHref = '/admin/alft-tracker';
  const workflowPageTitle = isEditRoute ? 'ALFT Workflow' : 'ALFT Tracker';

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
    ? 'Single-member workflow page. Complete edits and actions for this member only.'
    : 'Plan A + Plan B workflow: SW submits/signs, ALFT manager reviews, sends to Leslie for final RN changes/signature, then John final review routes to Deydry for send/print to Jocelyn.';

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
  const approveToRnDisabledReason = !editRow
    ? 'No ALFT loaded'
    : sigRequestingId === String(editRow?.id || '')
      ? 'Approval already in progress'
      : !canRunManagerWorkflow
        ? 'Kaiser manager/staff access required'
        : Boolean(editRow?.alftSignature?.requestedAt)
          ? 'Already sent to Leslie for RN signature'
          : !canApproveToRnFromEdit
            ? 'SW ALFT content is required before sending to Leslie'
            : 'Manager approval: route to Leslie (RN) and request signatures';

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{workflowPageTitle}</h1>
          <p className="text-muted-foreground">{workflowPageDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={backToQueueHref}>Back to Queue Page</Link>
          </Button>
          {isEditRoute ? (
            <Button variant="outline" asChild>
              <Link href={headerBackToTrackerHref}>Back to ALFT Tracker Page</Link>
            </Button>
          ) : null}
          {!isEditRoute ? (
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
          Showing only Kaiser Manager Actions. Review highlighted members, complete John final review, then route to Deydry for final send/print to Jocelyn.
        </div>
      ) : null}
      {!isEditRoute ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ALFT Tracker</CardTitle>
          <CardDescription>
            Step 4 begins here after Queue push: open each member workflow, then use Open details for progress and status checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="space-y-3 py-4">
              <div className="text-sm text-muted-foreground">No ALFT members found for the current filters.</div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const focused = focusId && r.id === focusId;
                    const stage = computeStage(r);
                    const assignmentForRow = findAssignmentForUpload(r);
                    const socialWorkerName = toLabel(assignmentForRow?.assignedSwName) || 'Not assigned';
                    const assignmentWorkflowKey = String(assignmentForRow?.memberId || assignmentForRow?.id || '').trim();
                    const assignmentSignals = assignmentForRow ? assignmentWorkflowSignals(assignmentForRow) : null;
                    const workflowAlreadyStarted = Boolean(
                      assignmentSignals && (assignmentSignals.swInviteSent || assignmentSignals.swSubmitted || assignmentSignals.rnStep || assignmentSignals.finalManager || assignmentSignals.complete)
                    );
                    const isStartingWorkflow = Boolean(assignmentWorkflowKey) && startingWorkflowFor === assignmentWorkflowKey;
                    const checklist = workflowChecklistFor(r);
                    const explicitCurrentChecklistIdx = checklist.findIndex((step: any) => Boolean((step as any)?.current));
                    const currentChecklistIdx =
                      explicitCurrentChecklistIdx >= 0 ? explicitCurrentChecklistIdx : checklist.findIndex((step) => !step.done);
                    const statusLabel = trackerCurrentStatusLabel(r, stage);
                    const currentStep =
                      checklist[(currentChecklistIdx >= 0 ? currentChecklistIdx : Math.max(checklist.length - 1, 0))];
                    const workflowHasStarted = checklist.some((step) => Boolean(step.done || step.current));
                    const currentStepLabel = workflowHasStarted ? (currentStep?.label || 'Begin workflow') : 'Begin workflow';
                    const currentStepAtLabel = workflowHasStarted ? (currentStep?.atLabel || '') : '';
                    const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
                    const managerActionRequired = workflowStatus.includes('awaiting_kaiser_manager_final_review');
                    const isExpanded = expandedMemberId === r.id;
                    const trackerUpdatedAtMs = Math.max(toMs((r as any)?.updatedAt), toMs((r as any)?.createdAt));
                    const trackerUpdatedAtLabel = trackerUpdatedAtMs ? fmtTimeline(trackerUpdatedAtMs) : '';
                    const finalReviewerName =
                      toLabel((r as any)?.workflowRouting?.finalReviewOwnerName) || DEFAULT_PRE_REVIEW_MANAGER_NAME;
                    const sendOwnerName =
                      toLabel((r as any)?.workflowRouting?.nextRecipientName) || DEFAULT_SEND_OWNER_NAME;

                    return [
                      <TableRow key={`row-${r.id}`} className={cn(focused ? 'bg-amber-50/30' : '')}>
                        <TableCell colSpan={3}>
                          <div className="font-semibold truncate">{r.memberName || '—'}</div>
                          <div className="text-sm text-muted-foreground break-words">
                            Social worker: {socialWorkerName}
                          </div>
                          <div className="text-sm text-muted-foreground break-words">
                            MRN: {r.medicalRecordNumber || '—'} • {r.healthPlan || '—'}
                          </div>
                          <div className="text-sm text-muted-foreground break-words">
                            Uploaded {r.alftUploadDate || (toMs(r.createdAt) ? new Date(toMs(r.createdAt)).toLocaleDateString() : '—')}
                            {r.uploaderName ? ` • By: ${r.uploaderName}` : ''}
                          </div>
                          {trackerUpdatedAtLabel ? (
                            <div className="text-sm text-muted-foreground break-words">
                              Tracker updated: {trackerUpdatedAtLabel}
                            </div>
                          ) : null}
                          <div className="mt-1 text-sm">
                            Current step: <span className="font-medium">{currentStepLabel}</span>
                            <span className="text-muted-foreground"> • {currentStepAtLabel || 'No timestamp yet'}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Checklist progress: {checklist.filter((step) => step.done).length}/{checklist.length} complete
                          </div>
                          <div className="mt-2 space-y-2 text-sm">
                            <div className={cn('rounded-md border px-2 py-1.5', stageBlockClass(stage))}>
                              <span className="font-medium">Status:</span> {statusLabel}
                            </div>
                            {managerActionRequired ? (
                              <div className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 py-1.5 text-fuchsia-800 font-medium">
                                Manager action required
                              </div>
                            ) : null}
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-blue-900">
                              <span className="font-medium">Assigned social worker:</span> {socialWorkerName}
                            </div>
                            <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900">
                              <span className="font-medium">ALFT Reviewer:</span> {finalReviewerName}
                            </div>
                            <div className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5 text-purple-900">
                              <span className="font-medium">ALFTA Manager:</span> {sendOwnerName}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              variant={!workflowAlreadyStarted ? 'default' : 'outline'}
                              className={!workflowAlreadyStarted ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                              disabled={!r?.id || isStartingWorkflow}
                              onClick={() => {
                                if (!r?.id) return;
                                window.location.assign(`/admin/alft-tracker?edit=${encodeURIComponent(String(r.id || ''))}`);
                              }}
                              title={workflowAlreadyStarted ? 'Open workflow page for this member' : 'Step 4: open workflow page for this member'}
                            >
                              {workflowAlreadyStarted ? 'Open Workflow Page' : 'Step 4: Start Workflow'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setExpandedMemberId((prev) => (prev === r.id ? '' : r.id))}
                            >
                              {isExpanded ? 'Hide details' : 'Open details'}
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              disabled={!canEditAlftRow(r)}
                              title={!canEditAlftRow(r) ? 'No edit permission for this intake' : 'View member ALFT'}
                            >
                              <Link href={`/admin/alft-tracker?edit=${encodeURIComponent(String(r.id || ''))}`}>
                                View
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              disabled={removingFromTrackerId === String(r.id || '')}
                              onClick={() => void removeMemberFromTracker(r)}
                              title="Remove member from ALFT Tracker active list"
                            >
                              {removingFromTrackerId === String(r.id || '') ? 'Removing…' : 'Remove'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>,
                      isExpanded ? (
                        <TableRow key={`details-${r.id}`} className={cn(focused ? 'bg-amber-50/20' : '')}>
                          <TableCell colSpan={3} className="p-3">
                            <div className="grid grid-cols-1 gap-3 rounded-md border bg-white p-3">
                              <div className="space-y-2.5">
                                <div className="text-sm font-semibold">Workflow progress</div>
                                <div className="rounded border bg-muted/20 p-3 text-sm space-y-1.5">
                                  {checklist.map((step, idx) => {
                                    const isCurrent =
                                      explicitCurrentChecklistIdx >= 0 ? idx === explicitCurrentChecklistIdx : idx === currentChecklistIdx && !step.done;
                                    return (
                                      <div key={step.id} className="flex items-start gap-2">
                                        {step.done ? (
                                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                                        ) : (
                                          <span className="mt-0.5 h-4 w-4 shrink-0" />
                                        )}
                                        <div className={step.done ? 'text-foreground' : isCurrent ? 'text-amber-700' : 'text-muted-foreground'}>
                                          <div>{step.label}</div>
                                          {step.atLabel ? <div className="text-xs text-muted-foreground">{step.atLabel}</div> : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="text-sm text-muted-foreground">RN: {r.alftRnName || '—'}</div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}

      <Dialog
        open={swEmailPreviewOpen}
        onOpenChange={(open) => {
          setSwEmailPreviewOpen(open);
          if (!open) {
            setSwEmailPreviewUseTestOverride(false);
            setSwEmailPreviewTestEmail('');
            setSwEmailPreviewEditableBody('');
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Social Worker email preview</DialogTitle>
            <DialogDescription>
              Preview the workflow notice email that will be sent for portal login and ALFT completion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm overflow-y-auto pr-1">
            <div>
              <span className="font-medium">To:</span> {swEmailPreview?.to || '—'}
            </div>
            <div>
              <span className="font-medium">Subject:</span> {swEmailPreview?.subject || '—'}
            </div>
            <div>
              <span className="font-medium">Status:</span>{' '}
              {swEmailPreview?.alreadySent
                ? `Already sent${swEmailPreview?.sentAtLabel ? ` at ${swEmailPreview.sentAtLabel}` : ''}`
                : 'Not sent yet'}
            </div>
            <div>
              <span className="font-medium">Body:</span>
              <div
                className="mt-1 whitespace-pre-wrap rounded border bg-muted/20 p-2 text-xs leading-5"
                dangerouslySetInnerHTML={{ __html: formatSwEmailBodyPreviewHtml(swEmailPreviewRenderedBody) }}
              />
              {swEmailPreview?.logoPath ? (
                <div className="mt-2">
                  <img src={swEmailPreview.logoPath} alt="Connections logo" className="h-10 w-auto object-contain" />
                </div>
              ) : null}
            </div>
            {swEmailPreview?.missingIspFields?.length ? (
              <div className="rounded border bg-amber-50 p-2 text-xs text-amber-800">
                Missing required fields: {swEmailPreview.missingIspFields.join(', ')}
              </div>
            ) : null}
            <div className="rounded border bg-muted/20 p-2 space-y-1">
              <Label htmlFor="sw-email-editable-body" className="text-[11px] font-medium">
                Editable SW email body
              </Label>
              <textarea
                id="sw-email-editable-body"
                value={swEmailPreviewEditableBody}
                onChange={(e) => setSwEmailPreviewEditableBody(e.target.value)}
                placeholder="Edit the full email body before sending."
                rows={10}
                className="w-full rounded border bg-background px-2 py-1.5 text-xs"
              />
            </div>
            <div className="rounded border bg-muted/20 p-2 space-y-2">
              <div className="font-medium text-xs">Test override</div>
              <div className="flex items-center gap-2 text-xs">
                <Label htmlFor="sw-email-test-override-mode">Use test override:</Label>
                <select
                  id="sw-email-test-override-mode"
                  value={swEmailPreviewUseTestOverride ? 'yes' : 'no'}
                  onChange={(e) => setSwEmailPreviewUseTestOverride(e.target.value === 'yes')}
                  className="h-8 rounded border bg-background px-2"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              {swEmailPreviewUseTestOverride ? (
                <div>
                  <Label htmlFor="sw-email-test-override-address" className="text-[11px]">
                    Test email
                  </Label>
                  <Input
                    id="sw-email-test-override-address"
                    value={swEmailPreviewTestEmail}
                    onChange={(e) => setSwEmailPreviewTestEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-3">
            {swPreviewActionRow ? (
              <Button
                variant={swEmailPreview?.canSend ? 'default' : 'outline'}
                className={swEmailPreview?.canSend ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''}
                disabled={
                  !swEmailPreview?.canSend ||
                  isResendingSwFromEdit ||
                  (swEmailPreviewUseTestOverride && !String(swEmailPreviewTestEmail || '').trim())
                }
                onClick={() =>
                  void startWorkflowFromIntake(swPreviewActionRow, {
                    customEmailBody: swEmailPreviewRenderedBody,
                    overrideRecipientEmail: swEmailPreviewUseTestOverride ? swEmailPreviewTestEmail : undefined,
                  })
                }
              >
                {isResendingSwFromEdit
                  ? 'Sending...'
                  : swEmailPreview?.alreadySent
                    ? 'Re-send SW Email (timestamped)'
                    : 'Send SW Email (timestamped)'}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setSwEmailPreviewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>{editRowLive?.memberName || 'Member Workflow Page'}</CardTitle>
            <CardDescription>
              Collaborative edit mode. This form remains editable by social worker, staff, RN, and admin users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {editAssignmentRow && canRunManagerWorkflow ? (
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-semibold">Pre-submission ALFT workflow queue</div>
                  <div className="text-sm text-muted-foreground">
                    Progress: {editAssignmentDoneCount}/{editAssignmentSteps.length} steps completed
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Current status:{' '}
                  <span className="font-medium text-foreground">{editAssignmentStage?.label || 'Not started'}</span>
                </div>
                <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">{editWorkflowSummary}</div>
                <div className="flex flex-wrap gap-1.5">
                  {editAssignmentSteps.map((step) => (
                    <Badge key={`edit-assign-chip-${step.step}`} variant="outline" className={cn('text-xs px-2 py-1', stepChipClass(step))}>
                      {step.done ? `✓ ${step.chip}` : `${step.step}. ${step.chip}`}
                    </Badge>
                  ))}
                </div>
                <div className="rounded border p-3 text-sm space-y-2.5">
                  <div className="font-semibold">Ordered steps (click to run)</div>
                  <Button variant="outline" className="w-full justify-start text-sm" asChild>
                    <Link href={step1VerificationHref}>1) Open verification tool (manual sync + prefill review)</Link>
                  </Button>
                  <label className="flex items-start gap-2 rounded border p-2">
                    <Checkbox
                      checked={editVerificationDone}
                      onCheckedChange={(checked) => void setVerificationForMember(editAssignmentRow, Boolean(checked))}
                      disabled={verifyingMemberId === String(editAssignmentRow.memberId || editAssignmentRow.id || '')}
                    />
                    <div>
                      <div>2) Verification checkbox with staff name + timestamp (required before Step 3 send/re-send)</div>
                      {editVerificationDone ? (
                        <div className="text-xs text-emerald-700">
                          Verified{editVerificationBy ? ` by ${editVerificationBy}` : ''}{editVerificationAtLabel ? ` at ${editVerificationAtLabel}` : ''}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700">Not verified yet</div>
                      )}
                    </div>
                  </label>
                    <Button
                    variant="link"
                    className="h-auto w-auto justify-start p-0 text-sm"
                    disabled={!editVerificationDone}
                    onClick={() => {
                      setSwEmailPreviewRow(editAssignmentRow);
                      setSwEmailPreviewUseTestOverride(false);
                      setSwEmailPreviewTestEmail('');
                      setSwEmailPreviewEditableBody(String(swEmailPreview?.body || ''));
                      setSwEmailPreviewOpen(true);
                    }}
                  >
                    3) Preview SW email + Send/Re-send with timestamp
                  </Button>
                  {editAssignmentSignals?.swInviteSent ? (
                    <div className="text-xs text-muted-foreground">SW email already sent. Step 3 lets you preview and re-send if needed.</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">SW email has not been sent yet. Use Step 3 to preview and send.</div>
                  )}
                  {editSwEmailDeliveryLog.length ? (
                    <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                      <div className="font-medium text-foreground">SW email send log</div>
                      {editSwEmailDeliveryLog.slice(0, 5).map((entry, idx) => (
                        <div key={`sw-email-log-${idx}`} className="text-muted-foreground">
                          {entry.status === 'sent' ? 'Sent' : entry.status === 'failed' ? 'Failed' : 'Missing recipient'} to{' '}
                          <span className="font-medium text-foreground">{entry.recipientEmail || 'no recipient email'}</span>
                          {entry.atLabel ? ` at ${entry.atLabel}` : ''}
                          {entry.isResend ? ' (re-send)' : ''}
                          {entry.triggeredBy ? ` by ${entry.triggeredBy}` : ''}
                          {entry.error ? ` — ${entry.error}` : ''}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded border bg-muted/20 px-2 py-2 text-xs space-y-2">
                    <div className="font-medium text-foreground">Workflow files for SW portal (602, facesheet, etc.)</div>
                    <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                      <div className="space-y-1">
                        <Label htmlFor="sw-support-file-label" className="text-[11px]">File label (optional)</Label>
                        <Input
                          id="sw-support-file-label"
                          value={swSupportUploadLabel}
                          onChange={(e) => setSwSupportUploadLabel(e.target.value)}
                          placeholder="Example: 602 or Facesheet"
                          className="h-8 text-xs"
                        />
                        <input
                          type="file"
                          multiple
                          onChange={(e) => setSwSupportUploadFiles(Array.from(e.target.files || []))}
                          className="text-xs"
                        />
                        {swSupportUploadFiles.length ? (
                          <div className="text-[11px] text-muted-foreground">
                            Selected {swSupportUploadFiles.length} file{swSupportUploadFiles.length > 1 ? 's' : ''}:{' '}
                            {swSupportUploadFiles.slice(0, 2).map((f) => f.name).join(', ')}
                            {swSupportUploadFiles.length > 2 ? ` +${swSupportUploadFiles.length - 2} more` : ''}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        className="h-8"
                        disabled={!editAssignmentRow || !swSupportUploadFiles.length || swSupportUploading}
                        onClick={() => editAssignmentRow && void uploadSwPortalSupportFile(editAssignmentRow)}
                      >
                        {swSupportUploading
                          ? `Uploading${swSupportUploadProgress ? ` (${swSupportUploadProgress}%)` : '...'}`
                          : 'Upload for SW portal'}
                      </Button>
                    </div>
                    {editSwPortalSupportFiles.length ? (
                      <div className="space-y-1">
                        {editSwPortalSupportFiles.slice(0, 8).map((f, idx) => (
                          <div key={f.id || `${f.fileName}-${idx}`} className="text-muted-foreground">
                            <a href={f.downloadURL} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
                              {f.label || f.fileName || 'Support file'}
                            </a>
                            {f.label && f.fileName && f.label !== f.fileName ? ` (${f.fileName})` : ''}
                            {f.uploadedAtLabel ? ` • uploaded ${f.uploadedAtLabel}` : ''}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">No workflow files uploaded for this member yet.</div>
                    )}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">4) SW Signed</span>{' '}
                    <span className={editAssignmentSignals?.swSubmitted ? 'text-emerald-700' : 'text-muted-foreground'}>
                      {editAssignmentSignals?.swSubmitted ? 'completed' : 'waiting for SW submission/signature'}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-md border p-3">
              <div className="text-base font-semibold">{editRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">{editRow?.medicalRecordNumber || '—'}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn(stageBlockClass(editStage), 'text-sm px-2 py-1')}>
                  {editStageLabel}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Current step: <span className="font-medium text-foreground">{editCurrentStepLabel}</span>
                  {editCurrentStepAtLabel ? <span className="ml-1">({editCurrentStepAtLabel})</span> : null}
                </span>
              </div>
              {editRow?.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => printCurrentEditPdf()}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    View/Print current ALFT
                  </Button>
                </div>
              ) : null}
            </div>
            <SwStyleAlftEditor
              answers={editExactAnswers}
              onChange={(id, value) =>
                setEditExactAnswers((prev) => ({
                  ...prev,
                  [id]: value,
                }))
              }
              memberName={editRow?.memberName || ''}
              memberMrn={editRow?.medicalRecordNumber || ''}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => editRow && markSentForSignature(editRow)}
                disabled={!canApproveToRnFromEdit || sigRequestingId === String(editRow?.id || '')}
                title={approveToRnDisabledReason}
              >
                {sigRequestingId === String(editRow?.id || '') ? 'Approving…' : 'Approve → Send to Leslie'}
              </Button>
              <Button
                variant="outline"
                onClick={() => editRow && void routeToCsManagerFinalReview(editRow)}
                disabled={!canRouteToCsManagerFromEdit || routingToFinalManagerId === String(editRow?.id || '')}
                title="After RN review/edits, route to John for final review"
              >
                {routingToFinalManagerId === String(editRow?.id || '') ? 'Routing…' : 'Send to CS Manager for Final Review'}
              </Button>
              <Button
                variant="outline"
                onClick={() => editRow && openRejectToSw(editRow)}
                disabled={!canRejectToSwFromEdit || rejectingId === String(editRow?.id || '')}
                title="Reject and return to social worker with required commentary"
              >
                Reject → Send back to SW
              </Button>
              <Button
                variant="outline"
                onClick={() => editRow && void markManagerFinalReview(editRow)}
                disabled={!canRunFinalReviewFromEdit || managerReviewingId === String(editRow?.id || '')}
                title="Final manager approval after RN updates/signature"
              >
                {managerReviewingId === String(editRow?.id || '') ? 'Final approving…' : 'Final manager approval'}
              </Button>
              <Button
                variant="outline"
                onClick={() => editRow && openSendConfirm(editRow)}
                disabled={!canSendCompletedFromEdit || sendingCompletedId === String(editRow?.id || '')}
                title="Send approved packet to Jocelyn"
              >
                Send to Jocelyn
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (isEditRoute) {
                    window.location.assign(closeEditorHref);
                    return;
                  }
                  setEditOpen(false);
                }}
                disabled={editSaving}
              >
                Close editor
              </Button>
              <Button onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save ALFT form
              </Button>
            </div>
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

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Return ALFT to SW for revision</DialogTitle>
            <DialogDescription>
              This sends the ALFT back to the social worker, invalidates the current signature request, and requires a new SW signature. The SW is notified to log into the SW portal, update the form, and resubmit for manager review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{rejectRow?.memberName || '—'}</div>
              <div className="text-sm text-muted-foreground font-mono">{rejectRow?.medicalRecordNumber || '—'}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Social worker: {toLabel(rejectRow?.uploaderName) || '—'} {toLabel(rejectRow?.uploaderEmail) ? `(${toLabel(rejectRow?.uploaderEmail)})` : ''}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alft-reject-reason">Revision reason</Label>
              <textarea
                id="alft-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Required commentary: describe what changes must be made before SW resubmits."
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
    </div>
  );
}

