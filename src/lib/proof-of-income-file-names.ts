/** Unique Proof of Income labels for multi-upload (portal + Files view). */

export function isProofOfIncomeFormName(name: unknown): boolean {
  return /^proof\s+of\s+income\b/i.test(String(name || '').trim());
}

/** Pull a date/month token from a title, incomeMonth field, or filename. */
export function extractProofOfIncomeMonth(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const stripped = raw
    .replace(/^proof\s+of\s+income\s*\d*\s*[-–—:]?\s*/i, '')
    .replace(/\.[a-z0-9]{2,8}$/i, '')
    .trim();
  return stripped && stripped.toLowerCase() !== 'proof of income' ? stripped : '';
}

/**
 * Human-readable title shown in Files / pathway.
 * Multiple uploads: "Proof of Income 1 - 2026-10-15", "Proof of Income 2 - …"
 * Single upload keeps "Proof of Income - 2026-10-15" (no number) unless forceSequence.
 */
export function buildProofOfIncomeDisplayTitle(opts: {
  sequence: number;
  incomeMonth?: string | null;
  totalCount?: number;
  forceSequence?: boolean;
}): string {
  const seq = Math.max(1, Math.floor(Number(opts.sequence) || 1));
  const month = String(opts.incomeMonth || '').trim();
  const total = Math.max(0, Math.floor(Number(opts.totalCount || 0)));
  const numbered = Boolean(opts.forceSequence) || total > 1 || seq > 1;
  if (numbered) {
    return month ? `Proof of Income ${seq} - ${month}` : `Proof of Income ${seq}`;
  }
  return month ? `Proof of Income - ${month}` : 'Proof of Income';
}

/** Document label fragment used inside storage/download filenames (before member prefix). */
export function buildProofOfIncomeFileLabel(opts: {
  sequence: number;
  incomeMonth?: string | null;
}): string {
  const seq = Math.max(1, Math.floor(Number(opts.sequence) || 1));
  const month = String(opts.incomeMonth || '').trim();
  return month ? `Proof of Income ${seq} - ${month}` : `Proof of Income ${seq}`;
}

export type ProofIncomeUploadLike = {
  displayTitle?: string | null;
  incomeMonth?: string | null;
  documentDate?: string | null;
  fileName?: string | null;
};

/** Ensure each Proof of Income row in Files has a distinct display title. */
export function uniquifyProofOfIncomeDisplayTitles<T extends ProofIncomeUploadLike>(
  items: T[]
): Array<T & { displayTitle: string }> {
  const total = items.length;
  return items.map((item, idx) => {
    const month =
      String(item.incomeMonth || item.documentDate || '').trim() ||
      extractProofOfIncomeMonth(item.displayTitle) ||
      extractProofOfIncomeMonth(item.fileName);
    return {
      ...item,
      displayTitle: buildProofOfIncomeDisplayTitle({
        sequence: idx + 1,
        incomeMonth: month || undefined,
        totalCount: total,
        forceSequence: total > 1,
      }),
    };
  });
}
