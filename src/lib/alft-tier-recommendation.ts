/** Kaiser / ALFT assisted-living care tiers (1–5). */
export const ALFT_TIER_OPTIONS = ['1', '2', '3', '4', '5'] as const;
export type AlftTierOption = (typeof ALFT_TIER_OPTIONS)[number];

export const ALFT_TIER_DEFINITIONS_PATH = '/admin/tools/tier-level-definitions';
export const SW_TIER_DEFINITIONS_PATH = '/sw-portal/tier-level-definitions';

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

/** Official five-tier definitions used for RN recommendation + tier-level request wording. */
export type AlftTierDefinition = {
  tier: AlftTierOption;
  levelLabel: string;
  definition: string;
  primaryIndicators: string[];
  placementReviewNotes: string;
};

export const ALFT_TIER_DEFINITIONS: AlftTierDefinition[] = [
  {
    tier: '1',
    levelLabel: 'Independent / Minimal 1:1 support',
    definition:
      'Meets ALF-A level of care criteria with minimal ADL/IADL assistance needs and limited medical, cognitive, or behavioral complexity. Member is generally stable, can participate in routine care planning, and typically needs intermittent cueing, reminders, setup help, or brief one-to-one support rather than continuous hands-on assistance. Appropriate when routine ALF services, medication oversight, meals, transportation, and periodic care coordination are sufficient to maintain safety, dignity, and independence.',
    primaryIndicators: [
      'Mostly independent or minimal assistance',
      'Stable medical conditions',
      'Limited behavioral complexity',
    ],
    placementReviewNotes:
      'Place when routine ALF supports can meet needs with only intermittent one-to-one assistance. Review if ADL needs, medical instability, or supervision needs increase.',
  },
  {
    tier: '2',
    levelLabel: 'Moderate Assistance / Limited 1:1 assistance',
    definition:
      'Requires consistent assistance with selected ADLs/IADLs while medical conditions remain stable and behavioral or cognitive supervision needs are limited and manageable. Member may need scheduled hands-on help, repeated reminders, medication oversight, or closer monitoring to remain safely housed, but does not show an intensive nursing pattern or unpredictable safety needs. Appropriate when the support plan can reliably meet predictable daily needs through routine ALF staffing and care coordination.',
    primaryIndicators: [
      'Consistent support for selected ADLs/IADLs',
      'No intensive nursing pattern',
      'Behavioral risk limited or manageable',
    ],
    placementReviewNotes:
      'Place when the support plan can address predictable ADL/IADL assistance and routine monitoring. Review if assistance becomes frequent across multiple domains or supervision needs rise.',
  },
  {
    tier: '3',
    levelLabel: 'High Assistance / Extensive 1:1 assistance',
    definition:
      'Requires extensive assistance with multiple ADLs/IADLs or moderate cognitive/behavioral supervision, creating higher daily service intensity and increased care coordination needs. Member may need frequent hands-on support for transfers, toileting, bathing, dressing, medication follow-through, or safety monitoring, but needs remain manageable within ALF scope when staffing is consistent. Appropriate when risks are active enough to require structured oversight, regular review, and clear escalation planning.',
    primaryIndicators: [
      'Multiple ADL assistance needs',
      'Moderate cognitive or behavioral supervision',
      'Higher coordination needs',
    ],
    placementReviewNotes:
      'Place when extensive daily assistance or moderate supervision is needed but remains manageable within ALF scope. Review care coordination, staffing consistency, and any change in cognitive or behavioral risk.',
  },
  {
    tier: '4',
    levelLabel: 'Very High Assistance / Total 1:1 dependence',
    definition:
      "Requires very high assistance across multiple ADL domains, significant cognitive impairment, substantial supervision needs, or frequent support to prevent safety concerns. Member may be unable to complete key self-care tasks without ongoing one-to-one assistance and may need close observation for wandering, falls, medication safety, behavioral escalation, or medical instability. Appropriate only when the ALF can safely deliver the required intensity without exceeding facility scope, staffing capacity, or the member's care plan limits.",
    primaryIndicators: [
      'Extensive multi-domain assistance',
      'Significant cognitive impairment',
      'Substantial supervision needs',
    ],
    placementReviewNotes:
      'Place only when very high assistance or substantial supervision can be delivered safely in the ALF setting. Review frequently for safety, staffing capacity, and whether needs exceed ALF scope.',
  },
  {
    tier: '5',
    levelLabel: 'Exceptional Cases / Highest level of 1:1 support',
    definition:
      'Reserved for exceptional highest-support cases requiring the most intensive one-to-one assistance and coordination within the ALF setting. Member needs may include traumatic brain injury, very high ADL dependency, significant cognitive impairment, complex behavioral/safety risk, or extensive supervision that is rare and clinically urgent. Appropriate only after confirming specialized needs, safety risks, staffing capability, authorization requirements, and whether a higher level of care may be more clinically appropriate.',
    primaryIndicators: [
      'Specialized criteria',
      'High ADL dependency',
      'Significant cognitive impairment',
      'Extensive assistance/supervision',
    ],
    placementReviewNotes:
      'Use for exceptional highest-support cases after confirming specialized needs can be safely managed in ALF. Review eligibility, safety risk, staffing capability, and whether a higher level of care is indicated.',
  },
];

/** Compact wording shown inline on RN sign / justification prompts. */
export const ALFT_TIER_RATE_WORDING: Array<{ tier: AlftTierOption; label: string; wording: string }> =
  ALFT_TIER_DEFINITIONS.map((row) => ({
    tier: row.tier,
    label: `Tier ${row.tier} — ${row.levelLabel}`,
    wording: row.definition,
  }));

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
