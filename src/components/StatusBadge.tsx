import React from 'react';
import { cn } from '@/lib/utils';
import { getStatusColor as getKaiserStatusColor } from '@/app/admin/kaiser-tracker/components/shared';

export type StatusDomain = 'kaiser' | 'application' | 'calaim' | 'generic';

const NEUTRAL = 'bg-gray-50 text-gray-700 border-gray-200';

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Completed & Submitted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Application in Review': 'bg-purple-50 text-purple-700 border-purple-200',
  'Requires Revision': 'bg-amber-50 text-amber-800 border-amber-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  'Authorization Requested': 'bg-violet-50 text-violet-700 border-violet-200',
  'Authorization Received (Doc Collection)': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Deleted: 'bg-red-50 text-red-700 border-red-200',
};

const CALAIM_STATUS_COLORS: Record<string, string> = {
  authorized: 'bg-green-50 text-green-700 border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'pending to switch': 'bg-orange-50 text-orange-700 border-orange-200',
  denied: 'bg-red-50 text-red-700 border-red-200',
  'non-active': 'bg-gray-50 text-gray-700 border-gray-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
};

/** Keyword fallback so unknown statuses still get a sensible tone. */
function genericStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(denied|declined|failed|error|expired|rejected|deleted|overdue)/.test(s)) return 'bg-red-50 text-red-700 border-red-200';
  if (/(revision|hold|warning|needed|missing|appeal)/.test(s)) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (/(pending|requested|waiting|scheduled|review)/.test(s)) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  if (/(complete|approved|authorized|received|confirmed|signed|sent|done|active)/.test(s)) return 'bg-green-50 text-green-700 border-green-200';
  if (/(progress|open|new)/.test(s)) return 'bg-blue-50 text-blue-700 border-blue-200';
  return NEUTRAL;
}

export function getStatusBadgeClass(status: string | null | undefined, domain: StatusDomain = 'generic'): string {
  const value = String(status ?? '').trim();
  if (!value) return NEUTRAL;
  if (domain === 'kaiser') return getKaiserStatusColor(value);
  if (domain === 'application') return APPLICATION_STATUS_COLORS[value] || genericStatusColor(value);
  if (domain === 'calaim') return CALAIM_STATUS_COLORS[value.toLowerCase()] || genericStatusColor(value);
  return genericStatusColor(value);
}

export type StatusBadgeProps = {
  status: string | null | undefined;
  domain?: StatusDomain;
  /** Shown when status is empty. */
  emptyLabel?: string;
  className?: string;
};

export function StatusBadge({ status, domain = 'generic', emptyLabel = '—', className }: StatusBadgeProps) {
  const value = String(status ?? '').trim();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        getStatusBadgeClass(value, domain),
        className
      )}
    >
      {value || emptyLabel}
    </span>
  );
}
