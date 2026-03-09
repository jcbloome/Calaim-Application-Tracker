'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  ChevronDown,
} from 'lucide-react';

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const primaryLinks: readonly NavLink[] = [
  { href: '/sw-portal/queue', label: 'Queue', icon: ListTodo },
  { href: '/sw-portal/roster', label: 'Roster', icon: Users },
] as const;

const tasksLinks: readonly NavLink[] = [
  { href: '/sw-visit-verification', label: 'Questionnaire', icon: ClipboardCheck },
  { href: '/sw-portal/sign-off', label: 'Sign Off', icon: FileBarChart },
  { href: '/sw-portal/claims', label: 'Claims', icon: ReceiptText },
  { href: '/sw-portal/ccl-checks', label: 'CCL Checks', icon: ShieldCheck },
] as const;

const moreLinks: readonly NavLink[] = [
  { href: '/sw-portal/end-of-day', label: 'End of day', icon: ClipboardList },
  { href: '/sw-portal/status-log', label: 'Status Log', icon: CheckCircle2 },
  { href: '/sw-portal/alft-upload', label: 'ALFT Upload', icon: UploadCloud },
  { href: '/sw-portal/instructions', label: 'Instructions', icon: BookOpenText },
] as const;

type NavCounts = {
  month: string;
  rosterNeedsAction: number;
  questionnaire: number;
  signoff: number;
  submitClaim: number;
  cclChecksMissing: number;
  updatedAtIso: string;
  ok: boolean;
};

const currentMonthKey = () => new Date().toISOString().slice(0, 7);

function CountPill({ value }: { value: number }) {
  if (!value || value <= 0) return null;
  return (
    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
      {value > 99 ? '99+' : value}
    </span>
  );
}

function isActiveHref(pathname: string, href: string) {
  return (
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === '/sw-visit-verification' && pathname.startsWith('/sw-portal/visit-verification'))
  );
}

export function SWTopNav({ className }: { className?: string }) {
  const pathname = usePathname() || '/';
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isSocialWorker } = useSocialWorker();

  const swEmail = String((user as any)?.email || '').trim().toLowerCase();
  const [counts, setCounts] = useState<NavCounts | null>(null);

  const loadCounts = useCallback(async () => {
    if (!isSocialWorker) return;
    if (!swEmail) return;
    if (!auth?.currentUser) return;

    const monthKey = (() => {
      try {
        const key = swEmail ? `swPortalStatusMonth_v1_${swEmail}` : 'swPortalStatusMonth_v1';
        const fromLs = String(window.localStorage.getItem(key) || '').trim();
        return /^\d{4}-\d{2}$/.test(fromLs) ? fromLs : currentMonthKey();
      } catch {
        return currentMonthKey();
      }
    })();

    const updatedAtIso = new Date().toISOString();

    try {
      // 1) Roster list (assigned members)
      const rosterRes = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(swEmail)}`);
      const rosterData = await rosterRes.json().catch(() => ({} as any));
      const facilities = Array.isArray(rosterData?.rcfeList) ? rosterData.rcfeList : [];
      const memberIds: string[] = [];
      facilities.forEach((f: any) => {
        (Array.isArray(f?.members) ? f.members : []).forEach((m: any) => {
          const id = String(m?.id || '').trim();
          if (id) memberIds.push(id);
        });
      });
      const uniqueMemberIds = Array.from(new Set(memberIds));

      // 2) Monthly statuses
      const idToken = await auth.currentUser.getIdToken();
      const stRes = await fetch('/api/sw-visits/monthly-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ month: monthKey, dedupeByMemberMonth: true }),
      });
      const stData = await stRes.json().catch(() => ({} as any));
      if (!stRes.ok || !stData?.success) throw new Error(stData?.error || `Status refresh failed (HTTP ${stRes.status})`);
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
          claimNumber: String(r?.claimNumber || '').trim() || '',
        });
      });

      let rosterNeedsAction = 0;
      let questionnaire = 0;
      let signoff = 0;
      let submitClaim = 0;

      uniqueMemberIds.forEach((id) => {
        const flags = computeSwVisitStatusFlags(statusByMemberId.get(id) || null);
        if (flags.needsAction) rosterNeedsAction += 1;
        if (flags.nextAction === 'questionnaire') questionnaire += 1;
        else if (flags.nextAction === 'signoff') signoff += 1;
        else if (flags.nextAction === 'submit-claim') submitClaim += 1;
      });

      // 3) Missing CCL checks for draft claims in this month.
      let cclChecksMissing = 0;
      if (firestore) {
        // Avoid composite indexes: query by SW email only; filter locally.
        const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', swEmail));
        const snap = await getDocs(q1);
        const claims = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
        const drafts = claims.filter((c) => String(c?.status || 'draft').toLowerCase() === 'draft');
        const groups = new Map<string, { rcfeId: string; month: string }>();
        drafts.forEach((c) => {
          const rcfeId = String(c?.rcfeId || '').trim();
          const m = String(c?.claimMonth || '').trim();
          if (!rcfeId || !m) return;
          if (m !== monthKey) return;
          groups.set(`${rcfeId}_${m}`, { rcfeId, month: m });
        });

        const groupList = Array.from(groups.values()).slice(0, 50);
        const checks = await Promise.all(
          groupList.map(async (g) => {
            const qs = new URLSearchParams({ rcfeId: g.rcfeId, month: g.month });
            const res = await fetch(`/api/sw-visits/rcfe-ccl-check?${qs.toString()}`, {
              headers: { authorization: `Bearer ${idToken}` },
            });
            const data = await res.json().catch(() => ({} as any));
            return Boolean(res.ok && data?.success && data?.check);
          })
        );
        cclChecksMissing = checks.filter((ok) => !ok).length;
      }

      setCounts({
        month: monthKey,
        rosterNeedsAction,
        questionnaire,
        signoff,
        submitClaim,
        cclChecksMissing,
        updatedAtIso,
        ok: true,
      });
    } catch {
      setCounts((prev) =>
        prev
          ? { ...prev, updatedAtIso, ok: false }
          : {
              month: currentMonthKey(),
              rosterNeedsAction: 0,
              questionnaire: 0,
              signoff: 0,
              submitClaim: 0,
              cclChecksMissing: 0,
              updatedAtIso,
              ok: false,
            }
      );
    }
  }, [auth, firestore, isSocialWorker, swEmail]);

  useEffect(() => {
    if (!isSocialWorker) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await loadCounts();
    };
    void run();

    const intervalMs = 60_000;
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadCounts();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isSocialWorker, loadCounts]);

  const pillsByHref = useMemo(() => {
    if (!counts) return {} as Record<string, number>;
    return {
      '/sw-portal/roster': counts.rosterNeedsAction,
      '/sw-visit-verification': counts.questionnaire,
      '/sw-portal/sign-off': counts.signoff,
      '/sw-portal/claims': counts.submitClaim,
      '/sw-portal/ccl-checks': counts.cclChecksMissing,
    } as Record<string, number>;
  }, [counts]);

  const tasksActive = useMemo(() => tasksLinks.some((l) => isActiveHref(pathname, l.href)), [pathname]);
  const moreActive = useMemo(() => moreLinks.some((l) => isActiveHref(pathname, l.href)), [pathname]);

  return (
    <nav
      className={cn('flex items-center gap-1 overflow-x-auto whitespace-nowrap py-1', className)}
      aria-label="Social Worker navigation"
    >
      {primaryLinks.map((l) => {
        const active = isActiveHref(pathname, l.href);
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
            <span className="inline-flex items-center">
              {l.label}
              <CountPill value={pillsByHref[l.href] || 0} />
            </span>
          </Link>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              tasksActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label="Tasks menu"
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              Tasks <ChevronDown className="h-4 w-4 opacity-80" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {tasksLinks.map((l) => {
            const active = isActiveHref(pathname, l.href);
            const Icon = l.icon;
            return (
              <DropdownMenuItem
                key={l.href}
                asChild
                className={cn(active && 'bg-accent text-accent-foreground')}
              >
                <Link href={l.href} className="inline-flex w-full items-center">
                  <Icon className="h-4 w-4" />
                  <span className="inline-flex items-center">
                    {l.label}
                    <CountPill value={pillsByHref[l.href] || 0} />
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

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
            aria-label="More menu"
          >
            <BookOpenText className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              More <ChevronDown className="h-4 w-4 opacity-80" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {moreLinks.map((l, idx) => {
            const active = isActiveHref(pathname, l.href);
            const Icon = l.icon;
            const item = (
              <DropdownMenuItem
                key={l.href}
                asChild
                className={cn(active && 'bg-accent text-accent-foreground')}
              >
                <Link href={l.href} className="inline-flex w-full items-center">
                  <Icon className="h-4 w-4" />
                  <span className="inline-flex items-center">
                    {l.label}
                    <CountPill value={pillsByHref[l.href] || 0} />
                  </span>
                </Link>
              </DropdownMenuItem>
            );
            if (idx === 1) {
              return (
                <React.Fragment key={l.href}>
                  <DropdownMenuSeparator />
                  {item}
                </React.Fragment>
              );
            }
            return item;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

