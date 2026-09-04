import {
  alftAdminReviewQueueUrl,
  alftRnReviewActionUrl,
  swPortalAlftUrl,
} from '@/lib/alft-workflow-status';

export type IspActionRole = 'msw' | 'admin' | 'rn' | 'none';

export type IspActionNeededResult = {
  role: IspActionRole;
  stageLabel: string;
  nextAction: string;
  actionUrl: string;
  recipientEmail: string;
  recipientName: string;
};

const clean = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);

/**
 * Resolve who must act next for an ISP / ALFT member (assignment + optional intake).
 */
export function resolveIspDailyActionNeeded(opts: {
  assignment?: Record<string, unknown> | null;
  intake?: Record<string, unknown> | null;
  intakeId?: string | null;
}): IspActionNeededResult | null {
  const assignment = opts.assignment || {};
  const intake = opts.intake || null;
  const intakeId = clean(opts.intakeId || (intake as any)?.id || (assignment as any)?.latestIntakeId, 220);

  const ws = clean(
    (intake as any)?.workflowStatus || (assignment as any)?.workflowStatus || (assignment as any)?.status,
    200
  ).toLowerCase();
  const stage = clean(
    (intake as any)?.workflowStage || (assignment as any)?.workflowStage,
    200
  ).toLowerCase();

  const swEmail =
    clean((assignment as any)?.assignedSwEmail, 220).toLowerCase() ||
    clean((intake as any)?.uploaderEmail, 220).toLowerCase();
  const swName =
    clean((assignment as any)?.assignedSwName, 160) ||
    clean((intake as any)?.uploaderName, 160) ||
    'Social Worker';

  const adminEmail =
    clean((assignment as any)?.alftStaffEmail || (assignment as any)?.firstReviewerEmail, 220).toLowerCase() ||
    clean((intake as any)?.alftStaffEmail, 220).toLowerCase();
  const adminName =
    clean((assignment as any)?.alftStaffName || (assignment as any)?.firstReviewerName, 160) ||
    clean((intake as any)?.alftStaffName, 160) ||
    'ALFT Reviewer';

  const rnEmail =
    clean((assignment as any)?.alftRnEmail || (assignment as any)?.assignedRnEmail, 220).toLowerCase() ||
    clean((intake as any)?.alftRnEmail, 220).toLowerCase();
  const rnName =
    clean((assignment as any)?.alftRnName || (assignment as any)?.assignedRnName, 160) ||
    clean((intake as any)?.alftRnName, 160) ||
    'RN';

  const completed =
    ws.includes('completed') ||
    ws.includes('manager_review_complete') ||
    Boolean((intake as any)?.alftCompletedSentAt);

  if (completed || ws.includes('removed_from_isp_tracker')) {
    return null;
  }

  const returnedToSw =
    ws.includes('returned_to_sw') ||
    String((intake as any)?.alftManagerReview?.status || '')
      .toLowerCase()
      .includes('rejected_returned');

  const invitePending =
    !intake ||
    ws.includes('sw_invited') ||
    ws.includes('sw_form') ||
    stage.includes('sw_invited') ||
    Boolean((assignment as any)?.workflowSteps?.swInviteSent && !(assignment as any)?.workflowSteps?.swSubmittedSigned);

  if (returnedToSw || invitePending || ws.includes('awaiting_sw_signature')) {
    if (!swEmail) return null;
    return {
      role: 'msw',
      stageLabel: returnedToSw
        ? 'Returned to SW for resubmission'
        : ws.includes('awaiting_sw_signature')
          ? 'Awaiting SW signature'
          : 'Invited — awaiting SW submit',
      nextAction: returnedToSw
        ? 'Revise the ISP / ALFT, re-sign, and resubmit.'
        : 'Open the SW portal, complete the ISP / ALFT, sign, and submit.',
      actionUrl: swPortalAlftUrl(),
      recipientEmail: swEmail,
      recipientName: swName,
    };
  }

  if (ws.includes('awaiting_rn')) {
    if (!rnEmail) return null;
    return {
      role: 'rn',
      stageLabel: 'Awaiting RN review / signature',
      nextAction: 'Review and edit the ALFT if needed, then sign and return to admin.',
      actionUrl: intakeId ? alftRnReviewActionUrl(intakeId) : '/admin/alft-tracker?rnActions=1',
      recipientEmail: rnEmail,
      recipientName: rnName,
    };
  }

  if (
    ws.includes('awaiting_manager_review_pre_rn') ||
    ws.includes('awaiting_kaiser_manager_final') ||
    ws.includes('ready_to_send')
  ) {
    if (!adminEmail) return null;
    const final =
      ws.includes('awaiting_kaiser_manager_final') || ws.includes('ready_to_send');
    return {
      role: 'admin',
      stageLabel: final ? 'Awaiting final admin review / send' : 'Awaiting admin review',
      nextAction: final
        ? 'Complete final review and send/download the packet when ready.'
        : 'Review the submitted ISP / ALFT and approve to RN or return to SW.',
      actionUrl: intakeId
        ? `/admin/alft-tracker?managerActions=1&edit=${encodeURIComponent(intakeId)}`
        : alftAdminReviewQueueUrl(),
      recipientEmail: adminEmail,
      recipientName: adminName,
    };
  }

  // No clear status yet but assignment exists with SW — treat as SW action if invite was intended.
  if (!intake && swEmail && Boolean((assignment as any)?.assignedSwEmail)) {
    return {
      role: 'msw',
      stageLabel: 'Awaiting SW submit',
      nextAction: 'Complete and submit the ISP / ALFT from the SW portal.',
      actionUrl: swPortalAlftUrl(),
      recipientEmail: swEmail,
      recipientName: swName,
    };
  }

  return null;
}

/**
 * Build a reminder for a forced role (manual re-send from ISP Tracker).
 * Uses current workflow status for stage copy when available.
 */
export function buildIspForcedActionReminder(opts: {
  role: 'msw' | 'rn';
  assignment?: Record<string, unknown> | null;
  intake?: Record<string, unknown> | null;
  intakeId?: string | null;
}): IspActionNeededResult | null {
  const auto = resolveIspDailyActionNeeded(opts);
  const assignment = opts.assignment || {};
  const intake = opts.intake || null;
  const intakeId = clean(opts.intakeId || (intake as any)?.id || (assignment as any)?.latestIntakeId, 220);

  const swEmail =
    clean((assignment as any)?.assignedSwEmail, 220).toLowerCase() ||
    clean((intake as any)?.uploaderEmail, 220).toLowerCase();
  const swName =
    clean((assignment as any)?.assignedSwName, 160) ||
    clean((intake as any)?.uploaderName, 160) ||
    'Social Worker';
  const rnEmail =
    clean((assignment as any)?.alftRnEmail || (assignment as any)?.assignedRnEmail, 220).toLowerCase() ||
    clean((intake as any)?.alftRnEmail, 220).toLowerCase();
  const rnName =
    clean((assignment as any)?.alftRnName || (assignment as any)?.assignedRnName, 160) ||
    clean((intake as any)?.alftRnName, 160) ||
    'RN';

  if (opts.role === 'msw') {
    if (!swEmail) return null;
    if (auto?.role === 'msw') return auto;
    return {
      role: 'msw',
      stageLabel: auto?.stageLabel || 'Action needed — social worker',
      nextAction:
        auto?.role === 'msw'
          ? auto.nextAction
          : 'Please open the SW portal and complete any outstanding ISP / ALFT steps for this member.',
      actionUrl: swPortalAlftUrl(),
      recipientEmail: swEmail,
      recipientName: swName,
    };
  }

  if (!rnEmail) return null;
  if (auto?.role === 'rn') return auto;
  return {
    role: 'rn',
    stageLabel: auto?.stageLabel || 'Action needed — RN',
    nextAction:
      auto?.role === 'rn'
        ? auto.nextAction
        : 'Please open ALFT Detail Tracker, review this packet, and complete RN signature if still pending.',
    actionUrl: intakeId ? alftRnReviewActionUrl(intakeId) : '/admin/alft-tracker?rnActions=1',
    recipientEmail: rnEmail,
    recipientName: rnName,
  };
}
