'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Printer, Search, Building2, MapPin, Users, Sparkles, RefreshCw, CheckCircle2, Circle, Pin, Clock } from 'lucide-react';
import { computeSwVisitStatusFlags } from '@/lib/sw-visit-status';

type RosterMember = {
  id: string;
  name: string;
  isNewAssignment?: boolean;
  isHoldRemoved?: boolean;
};

type RosterFacility = {
  id: string;
  name: string;
  address: string;
  city?: string;
  zip?: string;
  county?: string;
  administrator?: string | null;
  administratorPhone?: string | null;
  members: RosterMember[];
};

type MonthVisitStatus = {
  visitId: string;
  visitDay?: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
};

type MonthExportRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitId: string;
  flagged: boolean;
  signedOff: boolean;
  claimId: string;
  claimNumber: string;
  serviceLineId: string;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  dailyVisitCount: number;
  dailyVisitFees: number;
  dailyGas: number;
  dailyTotal: number;
};

type RecentMember = {
  memberId: string;
  memberName: string;
  rcfeId: string;
  rcfeName: string;
  atMs: number;
};

type DraftVisit = {
  visitId: string;
  memberId: string;
  memberName: string;
  memberRoomNumber?: string;
  rcfeId: string;
  rcfeName: string;
  rcfeAddress?: string;
  flagged?: boolean;
  updatedAt?: string;
};

const LS_PINNED_RCFES = 'swRosterPinnedRcfeIds_v1';
const LS_RECENT_MEMBERS = 'swRosterRecentMembers_v1';

const safeJsonParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const todayLocalKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const rcfeAnchorId = (rcfeId: string) => `rcfe_${encodeURIComponent(String(rcfeId || '').trim()).replace(/%/g, '_')}`;

export default function SWRosterPage() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [facilities, setFacilities] = useState<RosterFacility[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [monthRows, setMonthRows] = useState<MonthExportRow[]>([]);
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [monthStatusesLoaded, setMonthStatusesLoaded] = useState(false);
  const [monthStatusesFailed, setMonthStatusesFailed] = useState(false);
  const [monthStatusesMonth, setMonthStatusesMonth] = useState<string | null>(null);
  const [statusIconsLastRefreshAt, setStatusIconsLastRefreshAt] = useState<string | null>(null);
  const [statusIconsLastRefreshOk, setStatusIconsLastRefreshOk] = useState<boolean | null>(null);

  const [pinnedRcfeIds, setPinnedRcfeIds] = useState<string[]>([]);
  const [recentMembers, setRecentMembers] = useState<RecentMember[]>([]);

  const [needsActionOnly, setNeedsActionOnly] = useState(false);

  const [draftsToday, setDraftsToday] = useState<DraftVisit[]>([]);
  const [loadingDraftsToday, setLoadingDraftsToday] = useState(false);
  const [rosterLastRefreshAt, setRosterLastRefreshAt] = useState<string | null>(null);
  const [rosterLastRefreshOk, setRosterLastRefreshOk] = useState<boolean | null>(null);
  const [draftsLastRefreshAt, setDraftsLastRefreshAt] = useState<string | null>(null);
  const [draftsLastRefreshOk, setDraftsLastRefreshOk] = useState<boolean | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const refreshRoster = useCallback(async () => {
    if (!user?.email) return;
    const startedAt = new Date().toISOString();
    setLoading(true);
    setError(null);
    try {
      // Use the SW assignments endpoint that resolves SW_ID/name from cache.
      // This is more reliable than exact-email matching in Caspio fields.
      const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(user.email)}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load roster (HTTP ${res.status})`);
      }

      const nextFacilities = Array.isArray(data?.rcfeList) ? (data.rcfeList as RosterFacility[]) : [];
      setFacilities(nextFacilities);
      setHasLoadedOnce(true);
      setRosterLastRefreshAt(startedAt);
      setRosterLastRefreshOk(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to load roster.');
      setHasLoadedOnce(true);
      setRosterLastRefreshAt(startedAt);
      setRosterLastRefreshOk(false);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  const [statusMonth, setStatusMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [facilitySort, setFacilitySort] = useState<'assigned' | 'rcfe-az' | 'rcfe-za'>('assigned');

  const monthOptions = useMemo(() => {
    // SW claims/visit tracking begins Feb 2026 (testing); don't show earlier months.
    const start = new Date(2026, 1, 1); // Feb 2026 (local)
    const now = new Date();

    const opts: Array<{ value: string; label: string }> = [];
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor >= start) {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      opts.push({ value, label });
      cursor.setMonth(cursor.getMonth() - 1);
    }

    return opts;
  }, []);

  const refreshMonthStatuses = useCallback(async () => {
    if (!auth?.currentUser) {
      setMonthStatuses({});
      setMonthRows([]);
      setMonthStatusesLoaded(false);
      setMonthStatusesFailed(false);
      setMonthStatusesMonth(null);
      setStatusIconsLastRefreshAt(null);
      setStatusIconsLastRefreshOk(null);
      return;
    }
    const startedAt = new Date().toISOString();
    setLoadingMonthStatuses(true);
    setMonthStatusesFailed(false);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/sw-visits/monthly-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ month: statusMonth, dedupeByMemberMonth: true }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load monthly statuses (${res.status})`);
      const rows: MonthExportRow[] = Array.isArray(data?.rows) ? (data.rows as MonthExportRow[]) : [];
      setMonthRows(rows);
      const map: Record<string, MonthVisitStatus> = {};
      rows.forEach((r) => {
        const memberId = String(r?.memberId || '').trim();
        if (!memberId) return;
        map[memberId] = {
          visitId: String(r?.visitId || '').trim(),
          visitDay: String(r?.date || '').trim() || undefined,
          signedOff: Boolean(r?.signedOff),
          claimStatus: String(r?.claimStatus || 'draft').trim(),
          claimSubmitted: Boolean(r?.claimSubmitted),
          claimPaid: Boolean(r?.claimPaid),
          claimId: String(r?.claimId || '').trim() || undefined,
        };
      });
      setMonthStatuses(map);
      setMonthStatusesLoaded(true);
      setMonthStatusesFailed(false);
      setMonthStatusesMonth(statusMonth);
      setStatusIconsLastRefreshAt(startedAt);
      setStatusIconsLastRefreshOk(true);
    } catch (e: any) {
      // Best-effort: keep last-known icons if we have them.
      setMonthStatusesFailed(true);
      setStatusIconsLastRefreshAt(startedAt);
      setStatusIconsLastRefreshOk(false);
      toast({
        title: 'Couldn’t load status icons',
        description:
          e?.message ||
          (monthStatusesLoaded ? 'Using last known status icons. You can retry from the roster.' : 'Status icons failed to load. You can retry from the roster.'),
        variant: 'destructive',
      });
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth, auth?.currentUser, monthStatusesLoaded, statusMonth, toast]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const res = await fetch('/api/caspio/members-cache/status');
        const data = await res.json().catch(() => ({} as any));
        const ts =
          data?.settings?.lastSuccessAt ||
          data?.settings?.lastRunAt ||
          data?.settings?.lastSyncAt ||
          null;
        if (!cancelled) setLastSync(ts ? String(ts) : null);
      } catch {
        // ignore
      }
    };

    if (isLoading) return;
    if (!isSocialWorker) return;

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [isLoading, isSocialWorker, user]);

  // Load pinned/recent preferences (client-only).
  useEffect(() => {
    try {
      const pinned = safeJsonParse<string[]>(window.localStorage.getItem(LS_PINNED_RCFES), []);
      const recent = safeJsonParse<RecentMember[]>(window.localStorage.getItem(LS_RECENT_MEMBERS), []);
      setPinnedRcfeIds(Array.isArray(pinned) ? pinned.map((s) => String(s).trim()).filter(Boolean) : []);
      setRecentMembers(Array.isArray(recent) ? recent.filter(Boolean).slice(0, 10) : []);
    } catch {
      // ignore
    }
  }, []);

  const togglePinnedRcfe = useCallback((rcfeId: string) => {
    const id = String(rcfeId || '').trim();
    if (!id) return;
    setPinnedRcfeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      try {
        window.localStorage.setItem(LS_PINNED_RCFES, JSON.stringify(next.slice(0, 20)));
      } catch {
        // ignore
      }
      return next.slice(0, 20);
    });
  }, []);

  const trackRecentMember = useCallback((m: { memberId: string; memberName: string; rcfeId: string; rcfeName: string }) => {
    const memberId = String(m.memberId || '').trim();
    if (!memberId) return;
    const item: RecentMember = {
      memberId,
      memberName: String(m.memberName || '').trim() || 'Member',
      rcfeId: String(m.rcfeId || '').trim() || '',
      rcfeName: String(m.rcfeName || '').trim() || 'RCFE',
      atMs: Date.now(),
    };
    setRecentMembers((prev) => {
      const without = prev.filter((x) => String(x?.memberId || '').trim() !== memberId);
      const next = [item, ...without].slice(0, 10);
      try {
        window.localStorage.setItem(LS_RECENT_MEMBERS, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (hasLoadedOnce) return;
    if (loading) return;
    void refreshRoster();
  }, [hasLoadedOnce, isLoading, isSocialWorker, loading, refreshRoster]);

  // Hydrate search query from URL (used by header global search).
  useEffect(() => {
    const q = String(searchParams?.get('q') || '').trim();
    if (!q) return;
    setQuery(q);
  }, [searchParams]);

  // Persist roster preferences per SW (month/sort/search/needs-action).
  const prefsKey = useMemo(() => {
    const email = String((user as any)?.email || '').trim().toLowerCase();
    return email ? `swRosterPrefs_v2_${email}` : 'swRosterPrefs_v2';
  }, [user]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    try {
      const raw = window.localStorage.getItem(prefsKey);
      const prefs = safeJsonParse<any>(raw, null);
      if (!prefs) return;

      const urlQ = String(searchParams?.get('q') || '').trim();
      if (!urlQ && typeof prefs.query === 'string') setQuery(prefs.query);
      if (typeof prefs.statusMonth === 'string' && /^\d{4}-\d{2}$/.test(prefs.statusMonth)) setStatusMonth(prefs.statusMonth);
      if (prefs.facilitySort === 'assigned' || prefs.facilitySort === 'rcfe-az' || prefs.facilitySort === 'rcfe-za') setFacilitySort(prefs.facilitySort);
      if (typeof prefs.needsActionOnly === 'boolean') setNeedsActionOnly(prefs.needsActionOnly);
    } catch {
      // ignore
    }
    // run once per key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey, isLoading, isSocialWorker]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    try {
      window.localStorage.setItem(
        prefsKey,
        JSON.stringify({
          statusMonth,
          facilitySort,
          query,
          needsActionOnly,
          updatedAt: new Date().toISOString(),
        })
      );
      const email = String((user as any)?.email || '').trim().toLowerCase();
      const monthKey = email ? `swPortalStatusMonth_v1_${email}` : 'swPortalStatusMonth_v1';
      window.localStorage.setItem(monthKey, String(statusMonth));
    } catch {
      // ignore
    }
  }, [facilitySort, isLoading, isSocialWorker, needsActionOnly, prefsKey, query, statusMonth, user]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (!hasLoadedOnce) return;
    void refreshMonthStatuses();
  }, [hasLoadedOnce, isLoading, isSocialWorker, refreshMonthStatuses]);

  // Changing month should prompt a fresh status refresh for that month.
  useEffect(() => {
    setStatusIconsLastRefreshAt(null);
    setStatusIconsLastRefreshOk(null);
    setMonthStatusesMonth(null);
    if (!hasLoadedOnce) return;
    void refreshMonthStatuses();
  }, [hasLoadedOnce, refreshMonthStatuses, statusMonth]);

  // Auto-refresh status icons while roster is open.
  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (!hasLoadedOnce) return;

    const intervalMs = 60_000;
    const t = window.setInterval(() => {
      // Avoid hammering in background tabs.
      if (typeof document !== 'undefined' && document.hidden) return;
      void refreshMonthStatuses();
    }, intervalMs);

    return () => window.clearInterval(t);
  }, [hasLoadedOnce, isLoading, isSocialWorker, refreshMonthStatuses]);

  const refreshDraftsToday = useCallback(async () => {
    if (!auth?.currentUser) {
      setDraftsToday([]);
      return;
    }
    const startedAt = new Date().toISOString();
    setLoadingDraftsToday(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const claimDay = todayLocalKey();
      const res = await fetch(`/api/sw-visits/drafts?claimDay=${encodeURIComponent(claimDay)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load drafts (HTTP ${res.status})`);
      const visits = Array.isArray(data?.visits) ? (data.visits as DraftVisit[]) : [];
      setDraftsToday(visits.slice(0, 50));
      setDraftsLastRefreshAt(startedAt);
      setDraftsLastRefreshOk(true);
    } catch {
      // best-effort only
      setDraftsToday([]);
      setDraftsLastRefreshAt(startedAt);
      setDraftsLastRefreshOk(false);
    } finally {
      setLoadingDraftsToday(false);
    }
  }, [auth]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refreshDraftsToday();
  }, [isLoading, isSocialWorker, refreshDraftsToday]);

  const needsQuestionnaire = useMemo(() => {
    if (!monthStatusesLoaded) return [];
    const rows: Array<{ memberId: string; memberName: string; rcfeId: string; rcfeName: string }> = [];
    for (const f of facilities) {
      for (const m of f.members || []) {
        const s = monthStatuses[String(m.id || '').trim()];
        const flags = computeSwVisitStatusFlags(s);
        if (flags.nextAction === 'questionnaire') {
          rows.push({
            memberId: String(m.id || '').trim(),
            memberName: String(m.name || '').trim(),
            rcfeId: String(f.id || '').trim(),
            rcfeName: String(f.name || '').trim(),
          });
        }
      }
    }
    rows.sort((a, b) => (a.rcfeName || '').localeCompare(b.rcfeName || '') || (a.memberName || '').localeCompare(b.memberName || ''));
    return rows;
  }, [facilities, monthStatuses, monthStatusesLoaded]);

  const nextQuestionnaire = useMemo(() => {
    if (!needsQuestionnaire || needsQuestionnaire.length === 0) return null;
    return needsQuestionnaire[0];
  }, [needsQuestionnaire]);

  // Keyboard shortcuts for speed:
  // - / focus search
  // - N start next questionnaire
  // - R refresh all
  // - P print
  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (target as any)?.isContentEditable) return;

      const key = String(e.key || '');
      if (key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus?.();
        return;
      }
      if (key === 'r' || key === 'R') {
        e.preventDefault();
        void refreshAll();
        return;
      }
      if (key === 'p' || key === 'P') {
        e.preventDefault();
        window.print();
        return;
      }
      if (key === 'n' || key === 'N') {
        e.preventDefault();
        const next = nextQuestionnaire;
        if (!next) return;
        router.push(`/sw-visit-verification?rcfeId=${encodeURIComponent(next.rcfeId)}&memberId=${encodeURIComponent(next.memberId)}`);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLoading, isSocialWorker, nextQuestionnaire, refreshAll, router]);

  const pinnedFacilities = useMemo(() => {
    if (!pinnedRcfeIds || pinnedRcfeIds.length === 0) return [];
    const byId = new Map<string, RosterFacility>();
    for (const f of facilities) byId.set(String(f.id || '').trim(), f);
    return pinnedRcfeIds.map((id) => byId.get(String(id || '').trim())).filter(Boolean) as RosterFacility[];
  }, [facilities, pinnedRcfeIds]);

  const statusIconsReady = monthStatusesLoaded && monthStatusesMonth === statusMonth;

  const filteredFacilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searched = !q
      ? facilities
      : (facilities
          .map((f) => {
            const members = Array.isArray(f.members) ? f.members : [];
            const matchedMembers = members.filter((m) => String(m?.name || '').toLowerCase().includes(q));
            const facilityHit =
              String(f.name || '').toLowerCase().includes(q) ||
              String(f.address || '').toLowerCase().includes(q) ||
              String(f.city || '').toLowerCase().includes(q) ||
              String(f.zip || '').toLowerCase().includes(q) ||
              String(f.county || '').toLowerCase().includes(q);
            if (facilityHit) return f;
            if (matchedMembers.length === 0) return null;
            return { ...f, members: matchedMembers };
          })
          .filter(Boolean) as RosterFacility[]);

    if (!needsActionOnly) return searched;
    if (!statusIconsReady) return searched;

    const out: RosterFacility[] = [];
    for (const f of searched) {
      const members = Array.isArray(f.members) ? f.members : [];
      const keep = members.filter((m) => {
        const s = monthStatuses[String(m.id || '').trim()];
        const flags = computeSwVisitStatusFlags(s);
        return Boolean(flags.needsAction);
      });
      if (keep.length > 0) out.push({ ...f, members: keep });
    }
    return out;
  }, [facilities, monthStatuses, needsActionOnly, query, statusIconsReady]);

  const sortFacilities = useCallback((list: RosterFacility[]) => {
    if (facilitySort === 'assigned') return list;
    const dir = facilitySort === 'rcfe-za' ? -1 : 1;
    return list
      .slice()
      .sort(
        (a, b) =>
          dir * (String(a?.name || '').localeCompare(String(b?.name || '')) || String(a?.address || '').localeCompare(String(b?.address || '')))
      );
  }, [facilitySort]);

  const displayFacilities = useMemo(() => sortFacilities(filteredFacilities), [filteredFacilities, sortFacilities]);

  const printFacilities = useMemo(() => sortFacilities(filteredFacilities), [filteredFacilities, sortFacilities]);

  const totals = useMemo(() => {
    const facilityCount = facilities.length;
    const memberCount = facilities.reduce((sum, f) => sum + (Array.isArray(f.members) ? f.members.length : 0), 0);
    return { facilityCount, memberCount };
  }, [facilities]);

  const statusIconsLastRefreshLabel = useMemo(() => {
    if (!statusIconsLastRefreshAt) return '';
    try {
      return new Date(statusIconsLastRefreshAt).toLocaleString();
    } catch {
      return String(statusIconsLastRefreshAt);
    }
  }, [statusIconsLastRefreshAt]);

  const rosterLastRefreshLabel = useMemo(() => {
    if (!rosterLastRefreshAt) return '';
    try {
      return new Date(rosterLastRefreshAt).toLocaleString();
    } catch {
      return String(rosterLastRefreshAt);
    }
  }, [rosterLastRefreshAt]);

  const draftsLastRefreshLabel = useMemo(() => {
    if (!draftsLastRefreshAt) return '';
    try {
      return new Date(draftsLastRefreshAt).toLocaleString();
    } catch {
      return String(draftsLastRefreshAt);
    }
  }, [draftsLastRefreshAt]);

  // statusIconsReady is declared above filteredFacilities (used there).

  const refreshAll = useCallback(async () => {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      await refreshRoster();
      await refreshMonthStatuses();
      await refreshDraftsToday();
    } finally {
      setRefreshingAll(false);
    }
  }, [refreshDraftsToday, refreshMonthStatuses, refreshRoster, refreshingAll]);

  const draftsByMemberId = useMemo(() => {
    const map = new Map<string, DraftVisit>();
    draftsToday.forEach((d) => {
      const memberId = String(d?.memberId || '').trim();
      if (!memberId) return;
      if (!map.has(memberId)) map.set(memberId, d);
    });
    return map;
  }, [draftsToday]);

  const formatAddressLine = useCallback((f: { address?: string; city?: string; zip?: string }) => {
    const addr = String(f?.address || '').trim();
    const city = String(f?.city || '').trim();
    const zip = String(f?.zip || '').trim();
    const tail = [city, zip].filter(Boolean).join(' ');
    return [addr, tail].filter(Boolean).join(', ');
  }, []);

  const renderStatusIcon = (params: { on: boolean; label: string }) => {
    const Icon = params.on ? CheckCircle2 : Circle;
    const color = params.on ? 'text-emerald-600' : 'text-slate-300';
    return (
      <span className="inline-flex items-center justify-center" title={params.label} aria-label={params.label}>
        <Icon className={`h-4 w-4 ${color}`} />
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading roster…</p>
        </div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
            <CardDescription>Sign in as a social worker to view your weekly roster.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Weekly Roster</h1>
          <p className="text-muted-foreground">Your current assigned RCFEs and members.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {totals.facilityCount} RCFE{totals.facilityCount === 1 ? '' : 's'}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              {totals.memberCount} member{totals.memberCount === 1 ? '' : 's'}
            </Badge>
            {lastSync ? (
              <span>Cache last updated: {lastSync}</span>
            ) : null}
            <span className="inline-flex items-center gap-2">
              <span>• Roster:</span>
              <span>
                {rosterLastRefreshLabel
                  ? `Last refresh ${rosterLastRefreshLabel}${rosterLastRefreshOk === false ? ' (failed)' : ''}`
                  : 'Not loaded yet'}
              </span>
              <span className="text-muted-foreground">(If your roster is missing, refresh it here.)</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span>• Status icons:</span>
              <span>
                {statusIconsLastRefreshLabel
                  ? `Last refresh ${statusIconsLastRefreshLabel}${statusIconsLastRefreshOk === false ? ' (failed)' : ''}`
                  : 'Not loaded yet'}
              </span>
              <span className="text-muted-foreground">(Auto-updates while open; if icons are missing, refresh here.)</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span>• Month:</span>
              <Select value={statusMonth} onValueChange={setStatusMonth}>
                <SelectTrigger className="h-7 w-[190px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
            <span className="inline-flex items-center gap-2">
              <span>• Sort:</span>
              <Select value={facilitySort} onValueChange={(v) => setFacilitySort(v as any)}>
                <SelectTrigger className="h-7 w-[160px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned order</SelectItem>
                  <SelectItem value="rcfe-az">RCFE A–Z</SelectItem>
                  <SelectItem value="rcfe-za">RCFE Z–A</SelectItem>
                </SelectContent>
              </Select>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-slate-900">Icons:</span>
            <span className="inline-flex items-center gap-1">
              {renderStatusIcon({ on: true, label: 'Questionnaire completed' })} Q
            </span>
            <span className="inline-flex items-center gap-1">
              {renderStatusIcon({ on: true, label: 'Signed off' })} S
            </span>
            <span className="inline-flex items-center gap-1">
              {renderStatusIcon({ on: true, label: 'Claim submitted' })} C
            </span>
            <span className="inline-flex items-center gap-1">
              {renderStatusIcon({ on: true, label: 'Claim paid' })} P
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-rose-500"
                aria-label="Needs action indicator"
                title="Needs action"
              />
              Needs action
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button className="w-full sm:w-auto" onClick={() => void refreshAll()} disabled={refreshingAll || loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshingAll ? 'animate-spin' : ''}`} />
            {refreshingAll ? 'Refreshing…' : 'Refresh all'}
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refreshRoster()} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loading ? 'Refreshing…' : 'Refresh list'}
          </Button>
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => void refreshMonthStatuses()}
            disabled={loadingMonthStatuses || !hasLoadedOnce}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {loadingMonthStatuses ? 'Refreshing…' : 'Refresh status icons'}
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      {(nextQuestionnaire || loadingDraftsToday || draftsToday.length > 0 || pinnedFacilities.length > 0 || recentMembers.length > 0) ? (
        <div className="grid gap-4 print:hidden lg:grid-cols-2">
          {loadingDraftsToday || draftsToday.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resume draft questionnaires (today)</CardTitle>
                <CardDescription>
                  {loadingDraftsToday
                    ? 'Checking for draft questionnaires saved today…'
                    : `You have ${draftsToday.length} draft${draftsToday.length === 1 ? '' : 's'} saved for today (${todayLocalKey()}).`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingDraftsToday ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking drafts…
                  </div>
                ) : (
                  draftsToday.slice(0, 5).map((d) => (
                    <div key={d.visitId} className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.memberName || 'Member'}</div>
                        <div className="truncate text-xs text-muted-foreground">{d.rcfeName || 'RCFE'}</div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link
                          href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(d.rcfeId || '').trim())}&memberId=${encodeURIComponent(String(d.memberId || '').trim())}`}
                        >
                          Resume
                        </Link>
                      </Button>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="ghost" size="sm" className="gap-2" onClick={() => void refreshDraftsToday()}>
                    <RefreshCw className={`h-4 w-4 ${loadingDraftsToday ? 'animate-spin' : ''}`} />
                    Refresh drafts
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : nextQuestionnaire ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Start next questionnaire</CardTitle>
                <CardDescription>Jump straight into the next member who needs a questionnaire.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{nextQuestionnaire.memberName}</div>
                  <div className="truncate text-xs text-muted-foreground">{nextQuestionnaire.rcfeName}</div>
                </div>
                <Button asChild className="shrink-0">
                  <Link
                    href={`/sw-visit-verification?rcfeId=${encodeURIComponent(nextQuestionnaire.rcfeId)}&memberId=${encodeURIComponent(nextQuestionnaire.memberId)}`}
                  >
                    Open questionnaire
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {pinnedFacilities.length > 0 || recentMembers.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pinned & recent</CardTitle>
                <CardDescription>Shortcuts to the homes and members you use most.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pinnedFacilities.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900">Pinned RCFEs</div>
                    <div className="flex flex-wrap gap-2">
                      {pinnedFacilities.map((f) => (
                        <Button key={`pin-${f.id}`} asChild variant="outline" size="sm" className="gap-2">
                          <Link href={`/sw-portal/roster#${rcfeAnchorId(f.id)}`}>
                            <Pin className="h-3.5 w-3.5" />
                            <span className="max-w-[220px] truncate">{f.name}</span>
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {recentMembers.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-900">Recently opened</div>
                    <div className="space-y-2">
                      {recentMembers.slice(0, 5).map((r) => (
                        <div key={`recent-${r.memberId}`} className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{r.memberName}</div>
                            <div className="truncate text-xs text-muted-foreground">{r.rcfeName}</div>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() =>
                              trackRecentMember({
                                memberId: r.memberId,
                                memberName: r.memberName,
                                rcfeId: r.rcfeId,
                                rcfeName: r.rcfeName,
                              })
                            }
                          >
                            <Link
                              href={`/sw-visit-verification?rcfeId=${encodeURIComponent(r.rcfeId)}&memberId=${encodeURIComponent(r.memberId)}`}
                            >
                              Open
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
          <CardDescription>Filter by home name, address, or member name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to search…" />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={needsActionOnly}
                onCheckedChange={(v) => setNeedsActionOnly(Boolean(v))}
                disabled={!statusIconsReady}
              />
              <span className="text-sm text-muted-foreground">Needs action only</span>
            </div>

            {!statusIconsReady ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void refreshMonthStatuses()}
                disabled={loadingMonthStatuses || !hasLoadedOnce}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loadingMonthStatuses ? 'animate-spin' : ''}`} />
                Load status icons
              </Button>
            ) : null}
          </div>

          {!statusIconsReady ? (
            <div className="text-xs text-muted-foreground">
              The “Needs action” filter requires status icons for the selected month. Click “Load status icons” above.
            </div>
          ) : statusIconsLastRefreshLabel ? (
            <div className="text-xs text-muted-foreground">
              Status icons last refreshed: {statusIconsLastRefreshLabel}
              {statusIconsLastRefreshOk === false ? ' (failed)' : ''}. Auto-updates while open.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Members needing questionnaires</CardTitle>
          <CardDescription>
            Direct links into this month’s questionnaire for anyone not yet completed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingMonthStatuses ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading monthly statuses…
            </div>
          ) : monthStatusesFailed ? (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div>
                Monthly status couldn’t be loaded right now. You can still use the roster below, or open the{' '}
                <Link className="underline underline-offset-2" href="/sw-visit-verification">
                  Monthly Questionnaire
                </Link>{' '}
                page.
              </div>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshMonthStatuses()} disabled={loadingMonthStatuses}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingMonthStatuses ? 'animate-spin' : ''}`} />
                  Retry statuses
                </Button>
              </div>
            </div>
          ) : !monthStatusesLoaded ? (
            <div className="text-sm text-muted-foreground">
              Load your roster to populate this list, then refresh statuses if needed.
            </div>
          ) : needsQuestionnaire.length === 0 ? (
            <div className="text-sm text-muted-foreground">No members currently show as needing a questionnaire for {statusMonth}.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{needsQuestionnaire.length} member(s)</Badge>
                <span className="text-xs text-muted-foreground">Month: {statusMonth}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {needsQuestionnaire.slice(0, 50).map((r) => (
                  <div key={`${r.rcfeId}-${r.memberId}`} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.memberName}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.rcfeName}</div>
                    </div>
                    <Button asChild size="sm" className="shrink-0">
                      <Link href={`/sw-visit-verification?rcfeId=${encodeURIComponent(r.rcfeId)}&memberId=${encodeURIComponent(r.memberId)}`}>
                        Open
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
              {needsQuestionnaire.length > 50 ? (
                <div className="text-xs text-muted-foreground">
                  Showing first 50. Use Search below to find specific members/homes.
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Completed questionnaires (selected month)</CardTitle>
          <CardDescription>
            Shows questionnaires you completed in {statusMonth}, even if the member is no longer in your current assignments list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!monthStatusesLoaded ? (
            <div className="text-sm text-muted-foreground">Load status icons to view completed questionnaires for this month.</div>
          ) : monthRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No completed questionnaires found for {statusMonth}.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{monthRows.length} completed</Badge>
                <span className="text-xs text-muted-foreground">Month: {statusMonth}</span>
                <span className="text-xs text-muted-foreground">Auto-updates while open</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {monthRows
                  .slice()
                  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.memberName || '').localeCompare(String(b.memberName || '')))
                  .slice(0, 50)
                  .map((r) => (
                    <div key={`done-${r.visitId || r.memberId}`} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.memberName || 'Member'}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.rcfeName || 'RCFE'} • {String(r.date || '').slice(0, 10) || '—'}</div>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() =>
                          trackRecentMember({
                            memberId: String(r.memberId || '').trim(),
                            memberName: String(r.memberName || '').trim(),
                            rcfeId: '',
                            rcfeName: String(r.rcfeName || '').trim(),
                          })
                        }
                      >
                        <Link href={`/sw-visit-verification?memberId=${encodeURIComponent(String(r.memberId || '').trim())}`}>
                          Open
                        </Link>
                      </Button>
                    </div>
                  ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Could not load roster</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : null}

      <div className="space-y-4">
        {!hasLoadedOnce && !loading ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Load your roster</CardTitle>
              <CardDescription>
                Tap <span className="font-semibold">Refresh list</span> to load your assigned members from the weekly cache.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {hasLoadedOnce && filteredFacilities.length === 0 && !loading && !error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No assignments found</CardTitle>
              <CardDescription>
                If this seems wrong, your assignments may not be set yet or the weekly cache hasn’t refreshed.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {/* Print-only: always render the compact list for clean PDF output */}
        <div className="hidden print:block space-y-4">
          <div className="text-center">
            <div className="text-xl font-bold">Weekly Roster</div>
            {lastSync ? <div className="text-xs text-muted-foreground">Cache last updated: {lastSync}</div> : null}
          </div>
          {printFacilities.map((f) => (
            <div key={`print-${f.id}`} className="break-inside-avoid">
              <div className="font-semibold">{f.name}</div>
              <div className="text-xs text-muted-foreground">{formatAddressLine(f) || '—'}</div>
              <div className="mt-2 columns-2 gap-6 text-sm">
                {(f.members || []).map((m) => (
                  <div key={`print-${f.id}-${m.id}`} className="break-inside-avoid py-0.5">
                    {m.name}
                    {m.isNewAssignment ? ' (NEW)' : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Screen: compact roster table */}
        {displayFacilities.length > 0 ? (
          <div className="rounded-lg border bg-white print:hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Member</TableHead>
                    <TableHead className="min-w-[240px]">RCFE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayFacilities.map((f) => (
                    <React.Fragment key={`group-${f.id}`}>
                      <TableRow key={`rcfe-${f.id}`} id={rcfeAnchorId(String(f.id || '').trim())} className="bg-slate-50">
                        <TableCell colSpan={2}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  className="font-semibold truncate max-w-full hover:underline underline-offset-2"
                                  href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id || '').trim())}`}
                                >
                                  {f.name}
                                </Link>
                                <Badge variant="secondary">{(f.members || []).length} member(s)</Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={pinnedRcfeIds.includes(String(f.id || '').trim()) ? 'default' : 'outline'}
                                  className="h-7 px-2 gap-1"
                                  onClick={() => togglePinnedRcfe(String(f.id || '').trim())}
                                  title={pinnedRcfeIds.includes(String(f.id || '').trim()) ? 'Unpin RCFE' : 'Pin RCFE'}
                                >
                                  <Pin className="h-3.5 w-3.5" />
                                  <span className="text-xs">{pinnedRcfeIds.includes(String(f.id || '').trim()) ? 'Pinned' : 'Pin'}</span>
                                </Button>
                              </div>
                              <div className="mt-1 flex items-start gap-2 text-xs text-muted-foreground min-w-0">
                                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span className="min-w-0 break-words">{formatAddressLine(f) || f.address || '—'}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Admin: {String(f.administrator || '—')}{' '}
                                {f.administratorPhone ? (
                                  <span className="ml-1">
                                    •{' '}
                                    <a className="underline-offset-2 hover:underline" href={`tel:${String(f.administratorPhone).replace(/[^\d+]/g, '')}`}>
                                      {String(f.administratorPhone)}
                                    </a>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {(f.members || []).map((m) => {
                        const draft = draftsByMemberId.get(String(m.id || '').trim());
                        const s = statusIconsReady ? monthStatuses[String(m.id || '').trim()] : undefined;
                        const flags = computeSwVisitStatusFlags(s);
                        return (
                          <TableRow key={`${f.id}-${m.id}`}>
                            <TableCell className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                {flags.needsAction ? (
                                  <span
                                    className="inline-flex h-2 w-2 shrink-0 rounded-full bg-rose-500"
                                    aria-label="Needs action"
                                    title={`Needs action: ${flags.nextAction === 'questionnaire' ? 'Complete questionnaire' : flags.nextAction === 'signoff' ? 'Get sign-off' : 'Submit claim'}`}
                                  />
                                ) : (
                                  <span
                                    className="inline-flex h-2 w-2 shrink-0 rounded-full bg-transparent"
                                    aria-hidden="true"
                                  />
                                )}
                                <Link
                                  className="min-w-0 truncate font-medium hover:underline underline-offset-2"
                                  href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id || '').trim())}&memberId=${encodeURIComponent(String(m.id || '').trim())}`}
                                  onClick={() =>
                                    trackRecentMember({
                                      memberId: String(m.id || '').trim(),
                                      memberName: String(m.name || '').trim(),
                                      rcfeId: String(f.id || '').trim(),
                                      rcfeName: String(f.name || '').trim(),
                                    })
                                  }
                                >
                                  {m.name}
                                </Link>
                                {m.isNewAssignment ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    NEW
                                  </span>
                                ) : null}
                                {m.isHoldRemoved ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                    HOLD REMOVED
                                  </span>
                                ) : null}
                                {draft ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                    Draft
                                  </span>
                                ) : null}
                                <span className="ml-1 inline-flex shrink-0 items-center gap-2">
                                  <span className="inline-flex items-center gap-1">
                                    {renderStatusIcon({
                                      on: flags.completed,
                                      label: flags.completed ? 'Questionnaire completed' : 'Questionnaire not completed',
                                    })}
                                    <span className="text-[10px] text-muted-foreground">Q</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    {renderStatusIcon({
                                      on: flags.completed && flags.signedOff,
                                      label: flags.completed && flags.signedOff ? 'Signed off' : 'Not signed off',
                                    })}
                                    <span className="text-[10px] text-muted-foreground">S</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    {renderStatusIcon({
                                      on: flags.completed && flags.claimSubmitted,
                                      label: flags.completed && flags.claimSubmitted ? 'Claim submitted' : 'Claim not submitted',
                                    })}
                                    <span className="text-[10px] text-muted-foreground">C</span>
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    {renderStatusIcon({
                                      on: flags.completed && flags.claimPaid,
                                      label: flags.completed && flags.claimPaid ? 'Claim paid' : 'Not paid',
                                    })}
                                    <span className="text-[10px] text-muted-foreground">P</span>
                                  </span>
                                </span>
                                {draft ? (
                                  <Button asChild size="sm" variant="outline" className="ml-2 shrink-0">
                                    <Link
                                      href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(draft.rcfeId || f.id || '').trim())}&memberId=${encodeURIComponent(String(m.id || '').trim())}`}
                                      onClick={() =>
                                        trackRecentMember({
                                          memberId: String(m.id || '').trim(),
                                          memberName: String(m.name || '').trim(),
                                          rcfeId: String(f.id || '').trim(),
                                          rcfeName: String(f.name || '').trim(),
                                        })
                                      }
                                    >
                                      Resume draft
                                    </Link>
                                  </Button>
                                ) : flags.nextAction === 'questionnaire' ? (
                                  <Button asChild size="sm" variant="outline" className="ml-2 shrink-0">
                                    <Link
                                      href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id || '').trim())}&memberId=${encodeURIComponent(String(m.id || '').trim())}`}
                                      onClick={() =>
                                        trackRecentMember({
                                          memberId: String(m.id || '').trim(),
                                          memberName: String(m.name || '').trim(),
                                          rcfeId: String(f.id || '').trim(),
                                          rcfeName: String(f.name || '').trim(),
                                        })
                                      }
                                    >
                                      Questionnaire
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                              {statusIconsReady && s?.visitDay ? (
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>This month: {String(s.visitDay).slice(0, 10)}</span>
                                  {flags.needsAction ? (
                                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                                      Next: {flags.nextAction === 'questionnaire' ? 'Questionnaire' : flags.nextAction === 'signoff' ? 'Sign off' : 'Claim'}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">Up to date</span>
                                  )}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground min-w-0">
                              <div className="min-w-0">
                                <Link
                                  className="truncate font-medium text-slate-900 hover:underline underline-offset-2"
                                  href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id || '').trim())}`}
                                >
                                  {f.name}
                                </Link>
                                <div className="text-xs break-words">{formatAddressLine(f) || f.address || '—'}</div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

