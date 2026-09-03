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

export function alftActionAudience(upload: any): AlftActionAudience {
  const status = uploadStatusOf(upload);
  if (status && status !== 'pending' && status !== 'signed' && status !== 'submitted') return null;

  const ws = workflowStatusOf(upload);
  if (!ws) return 'admin'; // legacy pending ALFT → treat as admin review

  if (ws.includes('returned_to_sw') || ws.includes('awaiting_sw_signature')) {
    return null;
  }
  // Finished packet send — not an open admin queue item.
  if (ws.includes('completed_sent') || ws === 'completed') {
    return null;
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
