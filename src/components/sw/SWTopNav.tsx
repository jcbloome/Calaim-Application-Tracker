'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  ClipboardCheck,
  FileBarChart,
  Users,
  BookOpenText,
  CheckCircle2,
  ReceiptText,
  ListTodo,
  UploadCloud,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';

const links = [
  { href: '/sw-portal/queue', label: 'Queue', icon: ListTodo },
  { href: '/sw-portal/roster', label: 'Roster', icon: Users },
  { href: '/sw-portal/status-log', label: 'Status Log', icon: CheckCircle2 },
  { href: '/sw-portal/alft-upload', label: 'ALFT Upload', icon: UploadCloud },
  { href: '/sw-portal/claims', label: 'Claims', icon: ReceiptText },
  { href: '/sw-portal/sign-off', label: 'Sign Off', icon: FileBarChart },
  { href: '/sw-portal/ccl-checks', label: 'CCL Checks', icon: ShieldCheck },
  { href: '/sw-portal/end-of-day', label: 'End of day', icon: ClipboardList },
  { href: '/sw-visit-verification', label: 'Questionnaire', icon: ClipboardCheck },
  { href: '/sw-portal/instructions', label: 'Instructions', icon: BookOpenText },
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
          pathname === l.href ||
          pathname.startsWith(`${l.href}/`) ||
          (l.href === '/sw-visit-verification' && pathname.startsWith('/sw-portal/visit-verification'));
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

