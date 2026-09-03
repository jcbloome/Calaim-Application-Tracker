/** Kaiser / ALFT assisted-living care tiers (1–5). */
export const ALFT_TIER_OPTIONS = ['1', '2', '3', '4', '5'] as const;
export type AlftTierOption = (typeof ALFT_TIER_OPTIONS)[number];

export type AlftRnTierRecommendation = {
  tier: string;
  justification: string;
  recommendedByName?: string | null;
  recommendedByEmail?: string | null;
  recommendedByUid?: string | null;
  recommendedAtIso?: string | null;
  status?: 'pending_admin_review' | 'admin_reviewed' | string;
  adminReviewedAtIso?: string | null;
  adminReviewedByName?: string | null;
  adminReviewedByEmail?: string | null;
  adminReviewedByUid?: string | null;
  adminNotes?: string | null;
};

/** Short care-need wording RN should use when recommending a tier. */
export const ALFT_TIER_RATE_WORDING: Array<{ tier: AlftTierOption; label: string; wording: string }> = [
  {
    tier: '1',
    label: 'Tier 1 — Lower intensity',
    wording:
      'Limited ADL/IADL cueing or intermittent assistance; member largely independent with routine supports; no continuous supervision or overnight awake staffing required.',
  },
  {
    tier: '2',
    label: 'Tier 2 — Moderate supports',
    wording:
      'Regular hands-on help with several ADLs/IADLs; intermittent redirection or check-ins; needs are present most days but not constant 1:1 supervision.',
  },
  {
    tier: '3',
    label: 'Tier 3 — Higher supports',
    wording:
      'Frequent hands-on care and/or substantial supervision for safety (falls, wandering, cognition); needs evaluated on the member’s worst day, not best day.',
  },
  {
    tier: '4',
    label: 'Tier 4 — High acuity / intensive',
    wording:
      'Extensive care needs such as dementia with constant supervision/redirecting, complex transfers, or need for awake overnight staff; high safety risk if understaffed.',
  },
  {
    tier: '5',
    label: 'Tier 5 — Highest intensity',
    wording:
      'Near-continuous skilled observation/support beyond typical RCFE staffing; extreme ADL dependence and/or behavioral/safety needs that justify the highest assisted-living rate tier.',
  },
];

export const MIN_ALFT_TIER_JUSTIFICATION_CHARS = 80;

export function isAlftTierOption(value: unknown): value is AlftTierOption {
  return ALFT_TIER_OPTIONS.includes(String(value || '').trim() as AlftTierOption);
}

export function sanitizeAlftTierRecommendation(raw: unknown): AlftRnTierRecommendation | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const tier = String(obj.tier || '').trim();
  const justification = String(obj.justification || '').trim();
  if (!isAlftTierOption(tier) || !justification) return null;
  return {
    tier,
    justification,
    recommendedByName: String(obj.recommendedByName || '').trim() || null,
    recommendedByEmail: String(obj.recommendedByEmail || '').trim() || null,
    recommendedByUid: String(obj.recommendedByUid || '').trim() || null,
    recommendedAtIso: String(obj.recommendedAtIso || '').trim() || null,
    status: String(obj.status || '').trim() || 'pending_admin_review',
    adminReviewedAtIso: String(obj.adminReviewedAtIso || '').trim() || null,
    adminReviewedByName: String(obj.adminReviewedByName || '').trim() || null,
    adminReviewedByEmail: String(obj.adminReviewedByEmail || '').trim() || null,
    adminReviewedByUid: String(obj.adminReviewedByUid || '').trim() || null,
    adminNotes: String(obj.adminNotes || '').trim() || null,
  };
}

export function hasExtensiveTierJustification(text: unknown): boolean {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ').length >= MIN_ALFT_TIER_JUSTIFICATION_CHARS;
}

export function formatRnTierRecommendationForMessage(rec: AlftRnTierRecommendation | null | undefined): string {
  if (!rec?.tier || !rec?.justification) return '';
  return `RN recommended Tier ${rec.tier} for tier-level request.\nJustification: ${rec.justification}`;
}
