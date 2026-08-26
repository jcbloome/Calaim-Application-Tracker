const normalizeFormName = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();

const CS_SUMMARY_FORM_NAMES = new Set(['cs member summary', 'cs summary']);
const EXCLUDED_REVIEW_QUEUE_FORM_NAMES = new Set([
  'consolidated medical documents',
  'customer feedback survey',
]);

export const isCsSummaryFormName = (name: unknown) => CS_SUMMARY_FORM_NAMES.has(normalizeFormName(name));

export const isExcludedFromReviewQueue = (name: unknown) =>
  EXCLUDED_REVIEW_QUEUE_FORM_NAMES.has(normalizeFormName(name));

export const isPendingDocumentReview = (form: any) => {
  const isCompleted = String(form?.status || '').trim().toLowerCase() === 'completed';
  if (!isCompleted) return false;
  if (isCsSummaryFormName(form?.name)) return false;
  if (isExcludedFromReviewQueue(form?.name)) return false;
  return !Boolean(form?.acknowledged);
};

export const countPendingDocumentReviews = (forms: any[] | undefined | null) =>
  (Array.isArray(forms) ? forms : []).filter((form) => isPendingDocumentReview(form)).length;

/** True when staff still needs to review CS summary and/or uploaded documents. */
export const applicationNeedsStaffReview = (app: any) => {
  const forms = Array.isArray(app?.forms) ? app.forms : [];
  const hasCompletedCsSummary = forms.some(
    (form) =>
      isCsSummaryFormName(form?.name) && String(form?.status || '').trim().toLowerCase() === 'completed'
  );
  if (hasCompletedCsSummary && !Boolean(app?.applicationChecked)) return true;
  return countPendingDocumentReviews(forms) > 0;
};
