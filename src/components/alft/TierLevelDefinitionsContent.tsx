'use client';

import Link from 'next/link';
import { ALFT_TIER_DEFINITIONS } from '@/lib/alft-tier-recommendation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';

export function TierLevelDefinitionsContent({
  showBackLink = true,
  backHref = '/admin/tools/kaiser-alft',
}: {
  showBackLink?: boolean;
  backHref?: string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="h-5 w-5 text-violet-700" />
            <CardTitle>Tier Level Definitions</CardTitle>
            <Badge variant="outline">Five-tier definitions</Badge>
          </div>
          <CardDescription>
            Official wording for Kaiser ALFT / assisted-living tier recommendations. Use these definitions when
            selecting a suggested tier and writing care-need justification.
          </CardDescription>
          {showBackLink ? (
            <div>
              <Button asChild variant="outline" size="sm">
                <Link href={backHref}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back
                </Link>
              </Button>
            </div>
          ) : null}
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {ALFT_TIER_DEFINITIONS.map((row) => (
          <Card key={row.tier} className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                Tier {row.tier}: {row.levelLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-slate-800">
              <div>
                <div className="font-semibold text-slate-900">Definition</div>
                <p className="mt-1 whitespace-pre-wrap">{row.definition}</p>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Primary Indicators</div>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {row.primaryIndicators.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Placement / Review Notes</div>
                <p className="mt-1 whitespace-pre-wrap">{row.placementReviewNotes}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
