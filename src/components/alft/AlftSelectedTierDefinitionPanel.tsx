'use client';

import { useMemo } from 'react';
import {
  getAlftTierDefinition,
  isAlftTierOption,
  type AlftTierOption,
} from '@/lib/alft-tier-recommendation';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle } from 'lucide-react';

function tokenizeForMatch(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

/** True when commentary likely references this indicator phrase. */
function commentaryMentionsIndicator(commentary: string, indicator: string): boolean {
  const hay = String(commentary || '').toLowerCase();
  if (!hay.trim() || !indicator.trim()) return false;
  const phrase = indicator.toLowerCase().trim();
  if (hay.includes(phrase)) return true;
  // Fall back: most meaningful tokens from the indicator appear in commentary.
  const tokens = tokenizeForMatch(phrase).filter(
    (t) => !['with', 'from', 'that', 'this', 'when', 'needs', 'need'].includes(t)
  );
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.min(2, tokens.length) || (tokens.length === 1 && hits === 1);
}

export function AlftSelectedTierDefinitionPanel({
  tier,
  commentary,
  className = '',
  titlePrefix = 'Selected tier definition',
}: {
  tier: string;
  /** Optional MSW/RN commentary — used to show which definition indicators appear in the notes. */
  commentary?: string;
  className?: string;
  titlePrefix?: string;
}) {
  const def = useMemo(() => getAlftTierDefinition(tier), [tier]);
  const commentaryText = String(commentary || '');

  const indicatorMatches = useMemo(() => {
    if (!def) return [] as Array<{ indicator: string; matched: boolean }>;
    return def.primaryIndicators.map((indicator) => ({
      indicator,
      matched: commentaryMentionsIndicator(commentaryText, indicator),
    }));
  }, [commentaryText, def]);

  if (!isAlftTierOption(tier) || !def) return null;

  const matchedCount = indicatorMatches.filter((row) => row.matched).length;

  return (
    <div
      className={`rounded-md border-2 border-amber-400 bg-amber-50 shadow-sm ring-2 ring-amber-300/60 ${className}`}
      role="region"
      aria-label={`Tier ${def.tier} definition`}
    >
      <div className="border-b border-amber-300 bg-amber-100/80 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-amber-600 text-white hover:bg-amber-600">Highlighted</Badge>
          <span className="text-sm font-semibold text-amber-950">
            {titlePrefix}: Tier {def.tier as AlftTierOption} — {def.levelLabel}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-amber-900/90">
          Compare this official wording with the MSW &amp; RN Commentary. Indicators below light up when your notes
          use matching language.
        </p>
      </div>

      <div className="space-y-3 px-3 py-3 text-sm text-amber-950">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">Definition</div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{def.definition}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
              Primary indicators
            </div>
            {commentaryText.trim() ? (
              <span className="text-[11px] text-amber-900/80">
                {matchedCount}/{indicatorMatches.length} reflected in commentary
              </span>
            ) : (
              <span className="text-[11px] text-amber-900/70">Add commentary to check wording match</span>
            )}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {indicatorMatches.map(({ indicator, matched }) => (
              <li
                key={indicator}
                className={`flex items-start gap-2 rounded border px-2 py-1.5 text-xs leading-snug ${
                  matched
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                    : 'border-amber-200/80 bg-white/70 text-amber-950'
                }`}
              >
                {matched ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                )}
                <span>{indicator}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Placement / review notes
          </div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-amber-950/95">{def.placementReviewNotes}</p>
        </div>
      </div>
    </div>
  );
}
