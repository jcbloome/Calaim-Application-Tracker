'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';
import {
  activeSwIspTools,
  DEFAULT_SW_ISP_TOOLS,
  type SwIspToolItem,
} from '@/lib/sw-isp-tools';
import { fetchSwIspToolsMenu } from '@/lib/sw-isp-tools-client';
import { SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED } from '@/lib/sw-portal-flags';
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
  ExternalLink,
  FileText,
  History,
  Home,
  Wrench,
} from 'lucide-react';

type NavCounts = {
  month: string;
  rosterNeedsAction: number;
  updatedAtIso: string;
  ok: boolean;
};

const currentMonthKey = () => new Date().toISOString().slice(0, 7);

function isActiveHref(pathname: string, href: string) {
  if (!href.startsWith('/')) return false;
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

export function SWTopNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/';
  const auth = useAuth();
  const { user, isSocialWorker } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const [counts, setCounts] = useState<NavCounts | null>(null);
  const [ispTools, setIspTools] = useState<SwIspToolItem[]>([...DEFAULT_SW_ISP_TOOLS]);

  const loadCounts = useCallback(async () => {
    if (!SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED) return;
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

  useEffect(() => {
    if (!isSocialWorker || !auth?.currentUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await auth.currentUser!.getIdToken();
        const items = await fetchSwIspToolsMenu(idToken);
        if (!cancelled) setIspTools(items);
      } catch {
        if (!cancelled) setIspTools([...DEFAULT_SW_ISP_TOOLS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, isSocialWorker]);

  const activeIspTools = useMemo(() => activeSwIspTools(ispTools), [ispTools]);

  const ispToolsActive = useMemo(
    () =>
      activeIspTools.some((tool) => isActiveHref(pathname, tool.href)) ||
      isActiveHref(pathname, '/sw-portal/alft-upload') ||
      isActiveHref(pathname, '/sw-portal/alft-instructions') ||
      isActiveHref(pathname, '/sw-portal/instructions'),
    [activeIspTools, pathname]
  );

  return (
    <nav
      className={cn('flex items-center gap-1 overflow-x-auto whitespace-nowrap py-1', className)}
      aria-label="Social Worker navigation"
    >
      <NavItem
        href="/sw-portal/home"
        icon={Home}
        label="Home"
        badge={SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? counts?.rosterNeedsAction : undefined}
        pathname={pathname}
      />

      {SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? (
        <NavItem href="/sw-portal/history" icon={History} label="History" pathname={pathname} />
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              ispToolsActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label="ISP Tools"
          >
            <Wrench className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              ISP Tools <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {activeIspTools.map((tool) => {
            const external = /^https?:\/\//i.test(tool.href);
            return (
              <DropdownMenuItem key={tool.id} asChild>
                {external ? (
                  <a href={tool.href} target="_blank" rel="noreferrer" className="flex items-start gap-2">
                    <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block font-medium">{tool.label}</span>
                      {tool.description ? (
                        <span className="block text-[11px] text-muted-foreground">{tool.description}</span>
                      ) : null}
                    </span>
                  </a>
                ) : (
                  <Link href={tool.href} className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block font-medium">{tool.label}</span>
                      {tool.description ? (
                        <span className="block text-[11px] text-muted-foreground">{tool.description}</span>
                      ) : null}
                    </span>
                  </Link>
                )}
              </DropdownMenuItem>
            );
          })}
          {activeIspTools.length === 0 ? (
            <DropdownMenuItem disabled>No ISP tools published yet</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/sw-portal/instructions" className="flex items-start gap-2">
              <BookOpenText className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">Workflow instructions</span>
                <span className="block text-[11px] text-muted-foreground">
                  ISP assessment steps and portal guidance
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
