export type ProofIncomeAgeStatus = 'current' | 'due-soon' | 'expired' | 'missing';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isProofIncomeDocumentDate = (value: unknown) => ISO_DATE.test(String(value || '').trim());

/** Kaiser proof of income is current for one year. Due soon starts two months before that anniversary. */
export function classifyProofIncomeDocumentDate(
  documentDate: string,
  now = new Date()
): ProofIncomeAgeStatus {
  const raw = String(documentDate || '').trim();
  if (!isProofIncomeDocumentDate(raw)) return 'missing';
  const doc = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(doc.getTime())) return 'missing';
  const expires = new Date(doc);
  expires.setFullYear(expires.getFullYear() + 1);
  const warn = new Date(expires);
  warn.setMonth(warn.getMonth() - 2);
  if (now.getTime() >= expires.getTime()) return 'expired';
  if (now.getTime() >= warn.getTime()) return 'due-soon';
  return 'current';
}

export function newestProofIncomeDocumentDate(
  files: Array<{ documentDate?: unknown }>
): string {
  const dates = files
    .map((file) => String(file?.documentDate || '').trim())
    .filter(isProofIncomeDocumentDate)
    .sort();
  return dates[dates.length - 1] || '';
}
