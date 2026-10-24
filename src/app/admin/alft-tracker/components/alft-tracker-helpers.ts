import { alftHasSentToIlsDate } from '@/lib/alft-workflow-status';
import { isAlftRnAdminOverride } from '@/lib/alft-tier-recommendation';

export const AGENCY_NAME = 'Connections Care Home Consultants';
export const DEFAULT_SIGNATURE_PHONE = '800-330-5993';
export const DEFAULT_PRE_REVIEW_MANAGER_NAME = 'John';
export const DEFAULT_PRE_REVIEW_MANAGER_EMAIL = 'john@carehomefinders.com';
export const DEFAULT_SEND_OWNER_NAME = 'Kaiser staff (ILS package)';

const ISP_PROGRESS_STEPS = [
  { key: 'sent_to_sw', label: 'Sent to SW' },
  { key: 'sw_signed', label: 'SW Signed' },
  { key: 'admin_review', label: 'Admin Review' },
  { key: 'rn_review', label: 'RN Review' },
  { key: 'final_download', label: 'Final / Download' },
  { key: 'sent_to_ils', label: 'Sent to ILS' },
] as const;

export type IspProgressState = 'done' | 'current' | 'pending' | 'returned';

/** True when RN completed electronic signature (not just name/license filled in). */
export function hasRnElectronicallySigned(row: any): boolean {
  if (!row) return false;
  if (row?.alftSignature?.rnSignedAt) return true;
  if (row?.alftForm?.rnSignedAt) return true;
  if (row?.alftForm?.exactPacketAnswers?.p14_rn_signed_at) return true;
  if (isAlftRnAdminOverride(row)) return true;
  const ws = String(row?.workflowStatus || '').toLowerCase();
  // Past RN stage in workflow implies signature was accepted.
  if (
    ws.includes('awaiting_kaiser_manager_final') ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send') ||
    (ws.includes('completed') && !ws.includes('awaiting_rn'))
  ) {
    return true;
  }
  return false;
}

export function ispProgressForUpload(row: any): Array<{ key: string; label: string; state: IspProgressState }> {
  const ws = String(row?.workflowStatus || '').toLowerCase();
  const returnedToSw = ws.includes('returned_to_sw');
  const returnedToStaff =
    ws.includes('returned_to_staff') || ws.includes('returned_to_admin') || ws.includes('waiting_staff_revision');
  const returnedToRn = ws.includes('returned_to_rn') || ws.includes('waiting_rn_revision');
  const mswSigned = Boolean(
    row?.alftSignature?.mswSignedAt ||
      row?.alftForm?.swSignedAt ||
      row?.alftForm?.swSignature ||
      row?.workflowSteps?.swSubmittedSigned ||
      ws.includes('awaiting_manager_review') ||
      ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final')
  );
  const rnSigned = hasRnElectronicallySigned(row) && !returnedToRn;
  const sentToSw =
    Boolean(row?.workflowSteps?.swInviteSent) ||
    mswSigned ||
    returnedToSw ||
    returnedToStaff ||
    returnedToRn ||
    ws.includes('awaiting_') ||
    ws.includes('manager_review') ||
    ws.includes('completed');
  const adminDone =
    !returnedToSw &&
    !returnedToStaff &&
    (ws.includes('awaiting_rn') ||
      ws.includes('awaiting_kaiser_manager_final') ||
      ws.includes('manager_review_complete') ||
      ws.includes('ready_to_send') ||
      ws.includes('completed'));
  const adminCurrent =
    !returnedToSw &&
    (returnedToStaff ||
      ws.includes('awaiting_manager_review_pre_rn') ||
      (!adminDone && mswSigned && !ws.includes('awaiting_rn') && !ws.includes('awaiting_kaiser')));
  const rnDone =
    !returnedToSw &&
    !returnedToRn &&
    (rnSigned ||
      ws.includes('awaiting_kaiser_manager_final') ||
      ws.includes('manager_review_complete') ||
      ws.includes('ready_to_send') ||
      ws.includes('completed'));
  const rnCurrent = !returnedToSw && (returnedToRn || (ws.includes('awaiting_rn') && !rnDone));
  const finalDone =
    !returnedToSw &&
    !returnedToStaff &&
    !returnedToRn &&
    // Do not treat first admin (pre-RN) approval as Final/Download complete.
    !ws.includes('awaiting_kaiser_manager_final') &&
    !ws.includes('awaiting_rn') &&
    (ws.includes('manager_review_complete') ||
      ws.includes('ready_to_send') ||
      ws.includes('completed') ||
      Boolean(row?.alftStaffDownloadedAt));
  const sentToIls = alftHasSentToIlsDate(row);

  return ISP_PROGRESS_STEPS.map((step) => {
    if (step.key === 'sent_to_sw') return { ...step, state: (sentToSw ? 'done' : 'pending') as IspProgressState };
    if (step.key === 'sw_signed') {
      if (returnedToSw) return { ...step, state: 'returned' as IspProgressState };
      return { ...step, state: (mswSigned ? 'done' : sentToSw ? 'current' : 'pending') as IspProgressState };
    }
    if (step.key === 'admin_review') {
      if (returnedToSw || returnedToStaff) return { ...step, state: 'returned' as IspProgressState };
      return { ...step, state: (adminDone ? 'done' : adminCurrent ? 'current' : 'pending') as IspProgressState };
    }
    if (step.key === 'rn_review') {
      if (returnedToRn) return { ...step, state: 'returned' as IspProgressState };
      return { ...step, state: (rnDone ? 'done' : rnCurrent ? 'current' : 'pending') as IspProgressState };
    }
    if (step.key === 'final_download') {
      return {
        ...step,
        state: (finalDone
          ? 'done'
          : rnDone || ws.includes('awaiting_kaiser_manager_final')
            ? 'current'
            : 'pending') as IspProgressState,
      };
    }
    return {
      ...step,
      state: (sentToIls ? 'done' : finalDone ? 'current' : 'pending') as IspProgressState,
    };
  });
}

export function ispProgressSummary(row: any): string {
  const ws = String(row?.workflowStatus || '').toLowerCase();
  const rnName =
    String(row?.alftRnName || '').trim() ||
    String(row?.alftSignature?.rnSignedName || '').trim() ||
    'Leslie';
  const rnLabel = /leslie/i.test(rnName) ? 'Leslie (RN)' : `${rnName} (RN)`;
  const resendMeta = row?.alftRnResend || null;
  const resentAtMs = (() => {
    try {
      const raw = resendMeta?.resentAt;
      if (!raw) return 0;
      if (typeof raw?.toMillis === 'function') return Number(raw.toMillis()) || 0;
      if (typeof raw?.toDate === 'function') return raw.toDate().getTime() || 0;
      const ms = new Date(String(raw)).getTime();
      return Number.isFinite(ms) ? ms : 0;
    } catch {
      return 0;
    }
  })();
  const activityResend = Array.isArray(row?.ispWorkflowActivityLog)
    ? [...row.ispWorkflowActivityLog]
        .reverse()
        .find((entry: any) => String(entry?.event || '').toLowerCase() === 'resent_to_rn')
    : null;
  const wasResent = Boolean(resentAtMs > 0 || activityResend);
  const resendNote = String(resendMeta?.note || activityResend?.details || '').trim();
  const resentDateLabel = (() => {
    const iso = String(activityResend?.atIso || '').trim();
    const ms = resentAtMs || (iso ? new Date(iso).getTime() : 0);
    if (!ms || !Number.isFinite(ms)) return '';
    try {
      return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  })();
  const sentOrResentStatus = wasResent
    ? `Status: Resent to ${rnLabel}${resentDateLabel ? ` on ${resentDateLabel}` : ''}${
        resendNote ? ` — ${resendNote}` : ''
      }. Awaiting electronic signature.`
    : `Status: Sent to ${rnLabel} for RN review/signature — awaiting electronic signature.`;

  if (ws.includes('returned_to_sw')) {
    return 'Status: Sent back to SW for resubmission — awaiting SW edits, re-sign, and resubmit.';
  }
  if (ws.includes('returned_to_staff') || ws.includes('returned_to_admin') || ws.includes('waiting_staff_revision')) {
    return 'Status: Returned to admin/staff for edits — revise, save, then continue workflow.';
  }
  if (ws.includes('returned_to_rn') || ws.includes('waiting_rn_revision')) {
    return wasResent
      ? `Status: Resent to ${rnLabel} for edits${resentDateLabel ? ` on ${resentDateLabel}` : ''}${
          resendNote ? ` — ${resendNote}` : ''
        }. Revise, re-sign if needed, then continue.`
      : `Status: Returned to ${rnLabel} for edits — revise, re-sign if needed, then continue.`;
  }
  if (ws.includes('awaiting_manager_review_pre_rn')) {
    return 'Status: Admin Review — approve to RN or reject to SW for further edits.';
  }
  // RN already signed — do not keep saying "awaiting signature" just because requestedAt is still on the doc.
  if (hasRnElectronicallySigned(row) && !ws.includes('returned_to_rn')) {
    if (ws.includes('manager_review_complete') || ws.includes('ready_to_send') || ws.includes('completed')) {
      return 'Status: Final / Download — admin final check and packet send.';
    }
    return `Status: ${rnLabel} electronically signed — awaiting admin Final / Download.`;
  }
  if (
    ws.includes('awaiting_rn') ||
    Boolean(row?.alftSignature?.requestedAt) ||
    Boolean(row?.alftSignature?.rnRequestedAt)
  ) {
    return sentOrResentStatus;
  }
  if (ws.includes('awaiting_kaiser_manager_final') || ws.includes('manager_review_complete') || ws.includes('ready_to_send')) {
    return 'Status: Final / Download — admin final check and packet send.';
  }
  return 'Status: Track ISP progression below.';
}

/** Print/download only after RN review + admin final check (Final / Download stage). */
export function alftPrintDownloadUnlocked(row: any): boolean {
  if (!row) return false;
  const ws = String(row?.workflowStatus || '').toLowerCase();
  const rnDone = hasRnElectronicallySigned(row) ||
    Boolean(row?.alftSignature?.packetPdfStoragePath || row?.alftSignature?.signaturePagePdfStoragePath);
  const adminFinalDone =
    String(row?.alftManagerReview?.status || '').toLowerCase() === 'approved' ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send') ||
    ws.includes('completed_sent_to_jocelyn') ||
    (ws.includes('completed') && !ws.includes('awaiting'));
  return rnDone && adminFinalDone;
}

export type StandaloneUpload = {
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
  prefillPurpose?: string | null;
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
  alftManagerReview?: any;
  alftManagerPreReview?: any;
  alftStaffDownloadedAt?: any;
  alftLastDownloadLogId?: string | null;
  alftLastDownloadName?: string | null;
  alftLastDownloadFileName?: string | null;
  sentToIls?: boolean | null;
  sentToIlsAtIso?: string | null;
  sentToIlsManual?: boolean | null;
  coverSheetPackageSentAt?: any;
  coverSheetPackageSentAtIso?: string | null;
  alftRnTierRecommendation?: {
    tier?: string | null;
    justification?: string | null;
    recommendedByName?: string | null;
    recommendedAtIso?: string | null;
    status?: string | null;
    adminReviewedAtIso?: string | null;
    adminNotes?: string | null;
  } | null;
  alftSwTierRecommendation?: {
    tier?: string | null;
    levelLabel?: string | null;
    definitionSnapshot?: string | null;
    recommendedByName?: string | null;
    recommendedByEmail?: string | null;
    recommendedAtIso?: string | null;
  } | null;
  alftTierLevelRequest?: {
    status?: string | null;
    recommendedTier?: string | null;
  } | null;
};

export type AlftAssignmentQueueRow = {
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
  sentToIls?: boolean | null;
  sentToIlsAtIso?: string | null;
  sentToIlsManual?: boolean | null;
  coverSheetPackageSentAt?: any;
  coverSheetPackageSentAtIso?: string | null;
  updatedAt?: any;
};

export type StaffOption = { uid: string; label: string; email: string; role: 'Admin' | 'Super Admin' | 'Staff' };

export const toLabel = (value: any) => String(value ?? '').trim();
const searchTokens = (value: string) =>
  String(value || '')
    .toLowerCase()
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
export const matchesAllTokens = (queryValue: string, fields: Array<unknown>) => {
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
export const formatSwEmailBodyPreviewHtml = (value: string) =>
  escapeHtml(String(value || ''))
    .replace(/\r?\n/g, '<br/>')
    .replace(/((?:^|<br\/>)\s*)(Client:|ISP Location:|ISP Contact:)/gi, (_, lead, label) => `${lead}<strong>${label}</strong>`);

export const isAlft = (row: Partial<StandaloneUpload>) => {
  const toolCode = toLabel((row as any)?.toolCode).toUpperCase();
  const dtLower = toLabel((row as any)?.documentType).toLowerCase();
  return toolCode === 'ALFT' || dtLower.includes('alft');
};

export const toMs = (value: any): number => {
  if (!value) return 0;
  try {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value === 'object') {
      const seconds = Number(value.seconds ?? value._seconds);
      const nanos = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
      if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000 + Math.floor(nanos / 1e6);
    }
    const d = new Date(value);
    const ms = d.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

export const toIsoTimestamp = (value: any): string => {
  const ms = toMs(value);
  if (!ms) {
    const raw = String(value || '').trim();
    if (!raw || raw === '[object Object]') return '';
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed).toISOString() : raw;
  }
  return new Date(ms).toISOString();
};

export const toMmDdYyyyOrRaw = (value: string | undefined | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isoLike = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoLike) return `${isoLike[2].padStart(2, '0')}-${isoLike[3].padStart(2, '0')}-${isoLike[1]}`;
  const usFmt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usFmt) return `${usFmt[1].padStart(2, '0')}-${usFmt[2].padStart(2, '0')}-${usFmt[3]}`;
  return raw;
};

export const fmtTimeline = (ms: number) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
};

export type StageKey =
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

export const computeStage = (r: StandaloneUpload): StageKey => {
  const workflowStatus = toLabel((r as any)?.workflowStatus).toLowerCase();
  const managerStatus = toLabel((r as any)?.alftManagerReview?.status).toLowerCase();
  const docStatus = toLabel(r.status).toLowerCase();
  const mswSigned = toMs((r as any)?.alftSignature?.mswSignedAt) > 0;
  const rnSigned = toMs((r as any)?.alftSignature?.rnSignedAt) > 0;
  if (
    workflowStatus.includes('returned_to_sw') ||
    managerStatus.includes('rejected') ||
    docStatus.includes('returned_to_sw')
  ) {
    return 'returned_to_sw';
  }
  // Only true completion — never treat mid-review / revision statuses as done.
  if (workflowStatus.includes('completed_sent_to_jocelyn') || docStatus === 'completed') return 'completed';
  if (workflowStatus.includes('returned_to_rn') || workflowStatus.includes('waiting_rn_revision')) {
    return 'sent_for_signature';
  }
  if (
    workflowStatus.includes('returned_to_staff') ||
    workflowStatus.includes('returned_to_admin') ||
    workflowStatus.includes('waiting_staff_revision')
  ) {
    return 'manager_review';
  }
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

export const stageBlockClass = (stage: StageKey | 'not_started') => {
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

export const trackerCurrentStatusLabel = (r: StandaloneUpload, stage: StageKey | 'not_started') => {
  const workflowStatus = toLabel((r as any)?.workflowStatus).toLowerCase();
  if (stage === 'returned_to_sw') return 'Sent back to social worker';
  if (workflowStatus.includes('awaiting_kaiser_manager_final_review')) return 'Sent to John for final review';
  if (workflowStatus.includes('manager_review_complete_ready_to_send')) return 'John final review complete; awaiting send step';
  if (workflowStatus.includes('awaiting_rn_revision_and_signatures') || workflowStatus.includes('awaiting_rn_final_signature')) {
    return 'Sent to Leslie for RN review/signature';
  }
  if (workflowStatus.includes('awaiting_manager_review_pre_rn')) return 'SW submitted + signed';
  if (workflowStatus.includes('sw_invited') || workflowStatus.includes('sw_form')) return 'Sent to social worker + form started';
  return toLabel((r as any)?.workflowStatus) || toLabel(r.status) || 'pending';
};

export const assignmentWorkflowSignals = (row: AlftAssignmentQueueRow) => {
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

export const assignmentStageBlock = (row: AlftAssignmentQueueRow) => {
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
    return { label: 'Send/print step', color: 'border-purple-300 bg-purple-50 text-purple-900' };
  }
  if (swSubmitted || workflowStatus.includes('awaiting_manager_review_pre_rn')) {
    return { label: 'Manager pre-review', color: 'border-sky-300 bg-sky-50 text-sky-900' };
  }
  if (workflowStatus.includes('sw_invited')) {
    return { label: 'SW invited/submitting', color: 'border-emerald-300 bg-emerald-50 text-emerald-900' };
  }
  return { label: 'Prefill ready', color: 'border-slate-300 bg-slate-50 text-slate-900' };
};
export const toTitleCaseCity = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase());
};

export const REQUIRED_PREFILL_FIELDS: Array<{ key: string; label: string }> = [
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
export const BLOCKING_REQUIRED_PREFILL_FIELDS = REQUIRED_PREFILL_FIELDS.filter(
  ({ key }) => !NON_BLOCKING_PREFILL_FIELD_KEYS.has(key)
);

export const resolvePrefillSourceMode = (row: AlftAssignmentQueueRow): 'cs_summary_app' | 'caspio_selected_fields' => {
  const mode = String(row.prefillSourceMode || '').trim().toLowerCase();
  if (mode === 'cs_summary_app') return 'cs_summary_app';
  if (mode === 'caspio_selected_fields') return 'caspio_selected_fields';
  const label = String(row.prefillSourceLabel || '').trim().toLowerCase();
  return label.includes('app cs summary') ? 'cs_summary_app' : 'caspio_selected_fields';
};

export const getRequiredValueFromAssignmentRow = (row: AlftAssignmentQueueRow, key: string) => {
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

export const getRequiredValueFromResolvedOrAssignment = (
  row: AlftAssignmentQueueRow,
  key: string,
  resolved: Record<string, string>
) => {
  const fromResolved = String(resolved?.[key] || '').trim();
  if (fromResolved) return fromResolved;
  return String(getRequiredValueFromAssignmentRow(row, key) || '').trim();
};

export const assignmentWorkflowSteps = (row: AlftAssignmentQueueRow) => {
  const { swInviteSent, swSubmitted, returnedToSw, rnStep, finalManager, complete } = assignmentWorkflowSignals(row);

  return [
    { step: 1, chip: 'Verify Prefill', label: 'Staff verifies required ALFT prefill fields', done: swInviteSent || swSubmitted, current: !swInviteSent },
    { step: 2, chip: 'Verify Checkbox', label: 'Staff verification checkbox sign-off with timestamp', done: swInviteSent || swSubmitted, current: false },
    { step: 3, chip: 'SW Email Sent', label: 'Preview/send SW email notice with timestamp', done: swInviteSent || swSubmitted, current: !swInviteSent },
    { step: 4, chip: 'SW Signed', label: 'SW completes and signs ALFT packet', done: swSubmitted, current: swInviteSent && !swSubmitted },
    { step: 5, chip: 'John First Review', label: 'John approves or rejects with needed changes', done: swSubmitted, current: swSubmitted && !returnedToSw && !rnStep },
    { step: 6, chip: 'Return + Re-check', label: 'If rejected, SW updates and John re-checks before RN', done: returnedToSw || rnStep || finalManager || complete, current: returnedToSw },
    { step: 7, chip: 'RN Review + Sign', label: 'RN reviews, edits as needed, and signs', done: rnStep || finalManager || complete, current: rnStep && !finalManager },
    { step: 8, chip: 'Final + Jocelyn', label: 'John final review, then send/print to Jocelyn', done: finalManager || complete, current: finalManager && !complete },
  ];
};

export const stepChipClass = (step: { done: boolean; current: boolean }) => {
  if (step.done) return 'border-slate-300 bg-white text-green-700';
  if (step.current) return 'border-slate-300 bg-white text-slate-900';
  return 'border-slate-200 bg-white text-slate-500';
};

type WorkflowChecklistStep = {
  id: string;
  label: string;
  done: boolean;
  current?: boolean;
  atMs?: number;
  atLabel?: string;
};

export const workflowChecklistFor = (r: StandaloneUpload): WorkflowChecklistStep[] => {
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
