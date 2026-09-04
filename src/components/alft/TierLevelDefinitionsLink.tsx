'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import {
  ALFT_TIER_DEFINITIONS_PATH,
  SW_TIER_DEFINITIONS_PATH,
} from '@/lib/alft-tier-recommendation';
import { cn } from '@/lib/utils';

type Audience = 'admin' | 'sw' | 'auto';

export function TierLevelDefinitionsLink({
  audience = 'auto',
  className,
  label = 'Tier Level Definitions',
}: {
  audience?: Audience;
  className?: string;
  label?: string;
}) {
  const pathname = usePathname() || '';
  const href =
    audience === 'sw'
      ? SW_TIER_DEFINITIONS_PATH
      : audience === 'admin'
        ? ALFT_TIER_DEFINITIONS_PATH
        : pathname.startsWith('/sw-portal')
          ? SW_TIER_DEFINITIONS_PATH
          : ALFT_TIER_DEFINITIONS_PATH;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-sm font-medium text-violet-800 hover:underline',
        className
      )}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
