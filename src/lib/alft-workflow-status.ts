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

/** Truly finished — only after packet sent to Jocelyn (not mid-review / revision). */
export function alftIsWorkflowCompleted(upload: any): boolean {
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
  if (alftIsWorkflowCompleted(upload)) return null;

  const ws = workflowStatusOf(upload);
  if (!ws) {
    const status = uploadStatusOf(upload);
    // Legacy pending ALFT → treat as admin review
    if (!status || status === 'pending' || status === 'signed' || status === 'submitted') return 'admin';
    return null;
  }

  if (ws.includes('returned_to_sw') || ws.includes('awaiting_sw_signature') || ws.includes('waiting_sw_revision')) {
    return null;
  }
  if (ws.includes('returned_to_staff') || ws.includes('returned_to_admin') || ws.includes('waiting_staff_revision')) {
    return 'admin';
  }
  if (ws.includes('returned_to_rn') || ws.includes('waiting_rn_revision')) {
    return 'rn';
  }
  if (
    ws.includes('awaiting_manager_review_pre_rn') ||
    ws.includes('awaiting_kaiser_manager_final') ||
    ws.includes('manager_review_complete') ||
    ws.includes('ready_to_send')
  ) {
    return 'admin';
  }
  if (ws.includes('awaiting_rn')) return 'rn';
  return null;
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
