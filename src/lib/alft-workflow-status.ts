/** Who should act next on an ALFT / ISP upload for Action Items + emails. */
export type AlftActionAudience = 'admin' | 'rn' | null;

function workflowStatusOf(upload: any): string {
  return String(upload?.workflowStatus ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function uploadStatusOf(upload: any): string {
  return String(upload?.status ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 40);
}

function cleanField(value: unknown): string {
  return String(value ?? '').trim();
}

function hasTimestampValue(value: unknown): boolean {
  if (!value) return false;
  if (typeof (value as any)?.toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime());
    } catch {
      return false;
    }
  }
  if (typeof (value as any)?.toMillis === 'function') {
    try {
      return Number((value as any).toMillis()) > 0;
    } catch {
      return false;
    }
  }
  const raw = cleanField(value);
  if (!raw || raw === '[object Object]') return false;
  const ms = Date.parse(raw);
  return Number.isFinite(ms);
}

/**
 * Admin review queue exit criterion:
 * - ILS package checklist / cover-sheet package send (has send date), OR
 * - Manual Sent to ILS checkmark + entered date
 * Download alone does not clear the queue.
 */
export function alftHasSentToIlsDate(upload: any): boolean {
  // Package checklist / cover sheet package send
  if (hasTimestampValue(upload?.coverSheetPackageSentAt) || cleanField(upload?.coverSheetPackageSentAtIso)) {
    return true;
  }
  // Manual: checkmark + date required together
  const manualChecked = Boolean(upload?.sentToIls);
  const manualDate =
    cleanField(upload?.sentToIlsAtIso) ||
    (hasTimestampValue(upload?.sentToIlsAt) ? '1' : '') ||
    (hasTimestampValue(upload?.sentToIlsMarkedAt) ? '1' : '');
  if (manualChecked && manualDate) return true;
  return false;
}

/** Truly finished packet lifecycle (Jocelyn send / completed status). */
export function alftIsWorkflowCompleted(upload: any): boolean {
  // Prefer explicit Sent to ILS date as the business “done” for ISP admin queue.
  if (alftHasSentToIlsDate(upload)) return true;
  const ws = workflowStatusOf(upload);
  if (ws.includes('completed_sent') || ws === 'completed') return true;
  const status = uploadStatusOf(upload);
  // Never treat revision / in-progress statuses as completed.
  if (
    status.includes('returned') ||
    status.includes('revision') ||
    status === 'pending' ||
    status === 'signed' ||
    status === 'submitted' ||
    !status
  ) {
    return false;
  }
  return status === 'completed';
}

export function alftActionAudience(upload: any): AlftActionAudience {
  // Only leave admin review after Sent to ILS date (manual+checkmark or package checklist).
  if (alftHasSentToIlsDate(upload)) return null;

  const ws = workflowStatusOf(upload);
  if (!ws) {
    const status = uploadStatusOf(upload);
    // Legacy pending ALFT → treat as admin review
    if (!status || status === 'pending' || status === 'signed' || status === 'submitted') return 'admin';
    return null;
  }

  if (ws.includes('awaiting_sw_signature')) {
    return null;
  }
  // Only hide from admin when still truly waiting on SW revision.
  if (ws.includes('returned_to_sw') || ws.includes('waiting_sw_revision')) {
    return null;
  }
  if (ws.includes('returned_to_staff') || ws.includes('returned_to_admin') || ws.includes('waiting_staff_revision')) {
    return 'admin';
  }
  if (ws.includes('returned_to_rn') || ws.includes('waiting_rn_revision')) {
    return 'rn';
  }
  if (ws.includes('awaiting_rn')) return 'rn';

  // First admin review (pre-RN) and final admin stages stay until Sent to ILS date above.
  if (
    ws.includes('awaiting_manager_review_pre_rn') ||
    ws.includes('awaiting_kaiser_manager_final') ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send') ||
    ws.includes('completed')
  ) {
    return 'admin';
  }

  // Downloaded / approved packet but no Sent to ILS date yet → still needs admin.
  if (Boolean(upload?.alftStaffDownloadedAt) || Boolean(upload?.alftLastDownloadLogId)) {
    return 'admin';
  }

  return null;
}

/**
 * When SW resubmits, assignment may advance to awaiting_manager while the intake
 * doc is still marked returned_to_sw (signature cleared). Overlay assignment so
 * admin ready-queue / action audience use the live assignment state.
 */
export function overlayAlftAssignmentWorkflow(upload: any, assignment: any | null | undefined): any {
  if (!upload || !assignment) return upload;
  const intakeWs = workflowStatusOf(upload);
  const assignmentWs = workflowStatusOf(assignment);
  const needsSwRevision = Boolean((assignment as any)?.needsSwRevision);
  const swSubmittedSigned = Boolean((assignment as any)?.workflowSteps?.swSubmittedSigned);
  const assignmentAhead =
    !needsSwRevision &&
    (assignmentWs.includes('awaiting_manager_review') ||
      assignmentWs.includes('awaiting_rn') ||
      assignmentWs.includes('awaiting_kaiser') ||
      assignmentWs.includes('ready_to_send') ||
      assignmentWs.includes('manager_review_complete') ||
      swSubmittedSigned) &&
    (intakeWs.includes('returned_to_sw') ||
      intakeWs.includes('waiting_sw_revision') ||
      (!String(upload?.alftSignature?.mswSignedAt || '').trim() &&
        assignmentWs.includes('awaiting_manager_review')));

  if (!assignmentAhead) return upload;

  return {
    ...upload,
    workflowStatus: (assignment as any)?.workflowStatus || upload.workflowStatus,
    workflowStage: (assignment as any)?.workflowStage || upload.workflowStage,
    workflowSteps: {
      ...((upload as any)?.workflowSteps || {}),
      ...((assignment as any)?.workflowSteps || {}),
      swSubmittedSigned: true,
    },
    alftManagerReview: {
      ...((upload as any)?.alftManagerReview || {}),
      status: 'pending',
      rejectionReason: null,
    },
    alftSignature: {
      ...((upload as any)?.alftSignature || {}),
      mswSignedAt:
        (upload as any)?.alftSignature?.mswSignedAt ||
        (assignment as any)?.workflowStepsAt?.swSubmittedAt ||
        (assignment as any)?.submittedAt ||
        new Date().toISOString(),
      status: 'msw_signed_awaiting_manager_review',
    },
  };
}

/** Workflow statuses that should appear on ALFT Action Items for staff. */
export function alftNeedsStaffActionItem(upload: any): boolean {
  return alftActionAudience(upload) !== null;
}

export function alftNeedsAdminActionItem(upload: any): boolean {
  return alftActionAudience(upload) === 'admin';
}

export function alftNeedsRnActionItem(upload: any): boolean {
  return alftActionAudience(upload) === 'rn';
}

/** ISP / ALFT admin review deep link after SW submit (ready queue + editable form). */
export function ispWorkflowActionUrl(intakeId: string): string {
  const id = encodeURIComponent(String(intakeId || '').trim());
  return `/admin/alft-tracker?managerActions=1&edit=${id}`;
}

/** Ready-for-admin-review queue (no Caspio routing roster). */
export function alftAdminReviewQueueUrl(): string {
  return '/admin/alft-tracker?managerActions=1';
}

/** RN review queue + open member ALFT in ALFT Detail Tracker. */
export function alftRnReviewActionUrl(intakeId: string): string {
  const id = encodeURIComponent(String(intakeId || '').trim());
  return `/admin/alft-tracker?rnActions=1&edit=${id}`;
}

/** Ready-for-RN-review queue. */
export function alftRnReviewQueueUrl(): string {
  return '/admin/alft-tracker?rnActions=1';
}

export function swPortalAlftUrl(): string {
  return '/sw-portal/alft-upload';
}
