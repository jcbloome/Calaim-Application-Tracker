'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ClipboardCheck, ListChecks, FileBarChart, DollarSign, Users, Home, BookOpenText } from 'lucide-react';

const links = [
  { href: '/sw-portal', label: 'Menu', icon: Home },
  { href: '/sw-portal/instructions', label: 'Instructions', icon: BookOpenText },
  { href: '/sw-visit-verification', label: 'Monthly Questionnaire', icon: ClipboardCheck },
  { href: '/sw-portal/roster', label: 'SW Assignments', icon: Users },
  { href: '/sw-portal/monthly-visits', label: 'Visits', icon: ListChecks },
  { href: '/sw-portal/sign-off', label: 'Sign Off', icon: FileBarChart },
  { href: '/sw-portal/submit-claims', label: 'Submit Claims', icon: DollarSign },
] as const;

export function SWTopNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/';

  return (
    <nav
      className={cn('flex items-center gap-1 overflow-x-auto whitespace-nowrap py-1', className)}
      aria-label="Social Worker navigation"
    >
      {links.map((l) => {
        const active =
          l.href === '/sw-portal'
            ? pathname === '/sw-portal'
            : pathname === l.href || pathname.startsWith(`${l.href}/`) || (l.href === '/sw-visit-verification' && pathname.startsWith('/sw-portal/visit-verification'));
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
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

