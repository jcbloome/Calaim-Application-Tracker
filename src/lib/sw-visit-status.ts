export type SwMonthVisitStatusLike = {
  visitId?: unknown;
  signedOff?: unknown;
  claimStatus?: unknown;
  claimSubmitted?: unknown;
  claimPaid?: unknown;
  claimId?: unknown;
};

export type SwVisitStatusFlags = {
  completed: boolean;
  signedOff: boolean;
  claimSubmitted: boolean;
  claimPaid: boolean;
  needsAction: boolean;
  nextAction: 'questionnaire' | 'signoff' | 'submit-claim' | 'none';
  claimId: string;
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

export function computeSwVisitStatusFlags(s?: SwMonthVisitStatusLike | null): SwVisitStatusFlags {
  const visitId = String(s?.visitId ?? '').trim();
  const completed = Boolean(visitId);

  const signedOff = Boolean(s?.signedOff);

  const claimStatus = norm(s?.claimStatus);
  const claimPaid = Boolean(s?.claimPaid) || claimStatus === 'paid';

  const claimSubmitted =
    claimPaid ||
    Boolean(s?.claimSubmitted) ||
    ['submitted', 'approved', 'rejected', 'paid'].includes(claimStatus);

  // "Needs action" should reflect tasks the SW can actually do:
  // - Complete questionnaire
  // - Get sign-off
  // - Submit claim
  const nextAction: SwVisitStatusFlags['nextAction'] = !completed
    ? 'questionnaire'
    : !signedOff
      ? 'signoff'
      : !claimSubmitted
        ? 'submit-claim'
        : 'none';

  const needsAction = nextAction !== 'none';

  return {
    completed,
    signedOff,
    claimSubmitted,
    claimPaid,
    needsAction,
    nextAction,
    claimId: String(s?.claimId ?? '').trim(),
  };
}

