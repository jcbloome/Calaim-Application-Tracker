/**
 * Merge application `forms` arrays so family portal uploads on the user copy
 * are visible on the admin `applications/{admin_app_*}` document.
 */

export type FormLike = Record<string, unknown> & {
  name?: unknown;
  status?: unknown;
  fileName?: unknown;
  filePath?: unknown;
  downloadURL?: unknown;
  uploadedFiles?: unknown;
  dateCompleted?: unknown;
  acknowledged?: unknown;
};

const formName = (form: FormLike) => String(form?.name || '').trim();

const hasUploadEvidence = (form: FormLike) => {
  if (String(form?.filePath || '').trim()) return true;
  if (String(form?.downloadURL || '').trim()) return true;
  if (String(form?.fileName || '').trim()) return true;
  if (Array.isArray(form?.uploadedFiles) && form.uploadedFiles.length > 0) return true;
  return false;
};

const toMillis = (value: unknown): number => {
  try {
    if (!value) return 0;
    if (typeof (value as any)?.toMillis === 'function') return Number((value as any).toMillis()) || 0;
    if (typeof (value as any)?.toDate === 'function') {
      const d = (value as any).toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    }
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    const ms = new Date(String(value)).getTime();
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
};

const scoreForm = (form: FormLike): number => {
  let score = 0;
  if (hasUploadEvidence(form)) score += 1000;
  if (String(form?.status || '').trim().toLowerCase() === 'completed') score += 100;
  if (Array.isArray(form?.uploadedFiles)) score += form.uploadedFiles.length * 10;
  score += Math.min(toMillis(form?.dateCompleted) / 1_000_000, 500);
  return score;
};

/** Prefer the richer form entry (uploads / completed / newer). */
export function pickPreferredForm(a: FormLike | undefined, b: FormLike | undefined): FormLike | undefined {
  if (!a) return b;
  if (!b) return a;
  return scoreForm(b) > scoreForm(a) ? b : a;
}

export function mergeApplicationForms(
  primaryForms: unknown,
  secondaryForms: unknown
): FormLike[] {
  const map = new Map<string, FormLike>();
  const addAll = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const form = raw as FormLike;
      const name = formName(form);
      if (!name) continue;
      map.set(name, pickPreferredForm(map.get(name), form) || form);
    }
  };
  addAll(primaryForms);
  addAll(secondaryForms);
  return Array.from(map.values());
}

export function formsHaveUploadEvidence(forms: unknown): boolean {
  if (!Array.isArray(forms)) return false;
  return forms.some((form) => hasUploadEvidence(form as FormLike));
}
