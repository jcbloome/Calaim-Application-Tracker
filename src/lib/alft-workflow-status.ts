/** Workflow statuses that should appear on ALFT Action Items for staff. */
export function alftNeedsStaffActionItem(upload: any): boolean {
  const status = String(upload?.status ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 40);
  if (status && status !== 'pending' && status !== 'signed') return false;

  const ws = String(upload?.workflowStatus ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!ws) return true; // legacy pending ALFT

  if (ws.includes('returned_to_sw') || ws.includes('completed') || ws.includes('awaiting_sw_signature')) {
    return false;
  }
  if (ws.includes('awaiting_manager_review_pre_rn')) return true;
  if (ws.includes('awaiting_kaiser_manager_final')) return true;
  if (ws.includes('manager_review_complete') || ws.includes('ready_to_send')) return true;
  // Staff may still track RN-awaiting items; keep on Action Items when pending.
  if (ws.includes('awaiting_rn')) return true;
  return false;
}

/** ISP Workflow deep link for staff review of an ALFT intake. */
export function ispWorkflowActionUrl(intakeId: string): string {
  return `/admin/tools/isp-workflow?intakeId=${encodeURIComponent(String(intakeId || '').trim())}`;
}

export function swPortalAlftUrl(): string {
  return '/sw-portal/alft-upload';
}
