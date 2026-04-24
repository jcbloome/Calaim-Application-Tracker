'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BookOpenText,
  ChevronDown,
  ClipboardList,
  History,
  Home,
  LogOut,
  UploadCloud,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type NavCounts = {
  month: string;
  rosterNeedsAction: number;
  updatedAtIso: string;
  ok: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const currentMonthKey = () => new Date().toISOString().slice(0, 7);

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CountPill({ value }: { value: number }) {
  if (!value || value <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-800">
      {value > 99 ? '99+' : value}
    </span>
  );
}

// ── Nav link helper ────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  pathname,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  pathname: string;
}) {
  const active = isActiveHref(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        'shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="inline-flex items-center">
        {label}
        {badge !== undefined && <CountPill value={badge} />}
      </span>
    </Link>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SWTopNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/';
  const auth = useAuth();
  const { user, isSocialWorker } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const [counts, setCounts] = useState<NavCounts | null>(null);

  // ── Badge count loader ────────────────────────────────────────────────────────

  const loadCounts = useCallback(async () => {
    if (!isSocialWorker || !swEmail || !auth?.currentUser) return;

    const monthKey = (() => {
      try {
        const key = swEmail ? `swPortalStatusMonth_v1_${swEmail}` : 'swPortalStatusMonth_v1';
        const val = String(window.localStorage.getItem(key) || '').trim();
        return /^\d{4}-\d{2}$/.test(val) ? val : currentMonthKey();
      } catch {
        return currentMonthKey();
      }
    })();

    const updatedAtIso = new Date().toISOString();

    try {
      const idToken = await auth.currentUser.getIdToken();

      // 1) Roster + monthly statuses in parallel
      const [rosterRes, stRes] = await Promise.all([
        fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(swEmail)}`),
        fetch('/api/sw-visits/monthly-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ month: monthKey, dedupeByMemberMonth: true }),
        }),
      ]);

      const rosterData = await rosterRes.json().catch(() => ({} as any));
      const stData = stRes.ok ? await stRes.json().catch(() => ({} as any)) : {};

      const facilities = Array.isArray(rosterData?.rcfeList) ? rosterData.rcfeList : [];
      const memberIds: string[] = [];
      facilities.forEach((f: any) => {
        (Array.isArray(f?.members) ? f.members : []).forEach((m: any) => {
          const id = String(m?.id || '').trim();
          if (id) memberIds.push(id);
        });
      });
      const uniqueMemberIds = Array.from(new Set(memberIds));

      const rows = Array.isArray(stData?.rows) ? stData.rows : [];
      const statusByMemberId = new Map<string, any>();
      rows.forEach((r: any) => {
        const memberId = String(r?.memberId || '').trim();
        if (!memberId) return;
        statusByMemberId.set(memberId, {
          visitId: String(r?.visitId || '').trim(),
          signedOff: Boolean(r?.signedOff),
          claimStatus: String(r?.claimStatus || 'draft').trim(),
          claimSubmitted: Boolean(r?.claimSubmitted),
          claimPaid: Boolean(r?.claimPaid),
          claimId: String(r?.claimId || '').trim() || undefined,
        });
      });

      let rosterNeedsAction = 0;
      uniqueMemberIds.forEach((id) => {
        const flags = computeSwVisitStatusFlags(statusByMemberId.get(id) || null);
        if (flags.needsAction) rosterNeedsAction += 1;
      });

      setCounts({ month: monthKey, rosterNeedsAction, updatedAtIso, ok: true });
    } catch {
      setCounts((prev) =>
        prev
          ? { ...prev, updatedAtIso, ok: false }
          : { month: currentMonthKey(), rosterNeedsAction: 0, updatedAtIso, ok: false }
      );
    }
  }, [auth, isSocialWorker, swEmail]);

  useEffect(() => {
    if (!isSocialWorker) return;
    let cancelled = false;
    void (async () => {
      if (!cancelled) await loadCounts();
    })();
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadCounts();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isSocialWorker, loadCounts]);

  const moreActive = useMemo(
    () =>
      ['/sw-portal/alft-upload', '/sw-portal/instructions'].some((h) => isActiveHref(pathname, h)),
    [pathname]
  );

  const handleSignOut = useCallback(async () => {
    try {
      await auth?.signOut?.();
    } catch {
      // ignore
    }
  }, [auth]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <nav
      className={cn('flex items-center gap-1 overflow-x-auto whitespace-nowrap py-1', className)}
      aria-label="Social Worker navigation"
    >
      {/* Home */}
      <NavItem
        href="/sw-portal/home"
        icon={Home}
        label="Home"
        badge={counts?.rosterNeedsAction}
        pathname={pathname}
      />

      {/* History */}
      <NavItem
        href="/sw-portal/history"
        icon={History}
        label="History"
        pathname={pathname}
      />

      {/* More dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              moreActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label="More options"
          >
            <ClipboardList className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              More <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem asChild>
            <Link href="/sw-portal/alft-upload" className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4" /> ALFT Upload
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/sw-portal/instructions" className="flex items-center gap-2">
              <BookOpenText className="h-4 w-4" /> Instructions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 text-destructive focus:text-destructive"
            onSelect={handleSignOut}
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
