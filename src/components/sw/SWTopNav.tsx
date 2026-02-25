'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ClipboardCheck, ListChecks, FileBarChart, DollarSign } from 'lucide-react';

const links = [
  { href: '/sw-visit-verification', label: 'Visit Verification', icon: ClipboardCheck },
  { href: '/sw-portal/monthly-visits', label: 'Visits', icon: ListChecks },
  { href: '/sw-portal/sign-off', label: 'Sign Off', icon: FileBarChart },
  { href: '/sw-portal/submit-claims', label: 'Submit Claims', icon: DollarSign },
] as const;

export function SWTopNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/';

  return (
    <nav className={cn('flex flex-wrap items-center gap-1', className)}>
      {links.map((l) => {
        const active = pathname === l.href;
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

