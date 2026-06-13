const normalizeFormName = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase();

const CS_SUMMARY_FORM_NAMES = new Set(['cs member summary', 'cs summary']);
const EXCLUDED_REVIEW_QUEUE_FORM_NAMES = new Set(['consolidated medical documents']);

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
