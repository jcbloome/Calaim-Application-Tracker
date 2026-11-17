'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  summarizeKaiserT2038ClaimAudit,
  type KaiserT2038ClaimAuditRow,
  type KaiserT2038ClaimAuditRunMode,
} from '@/lib/kaiser-t2038-claim-audit';
import { isAuthorizedCalaimStatus } from '@/lib/t2038-claims';
import { AlertTriangle, ChevronDown, ChevronRight, Database, Loader2, RefreshCw } from 'lucide-react';

type CoverageFilter = 'all' | 'incomplete' | 'complete' | 'no_claims_yet';
type AuthFilter = 'all' | 'open' | 'ended' | 'missing_dates';
/** `all` | `Authorized` | exact CalAIM_Status label from data (e.g. Member Died). */
type StatusFilter = 'all' | 'Authorized' | string;

const normalizeStatus = (value: unknown) =>
  clean(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const COMMON_CALAIM_STATUSES = [
  'Authorized',
  'Authorized On Hold',
  'Authorization Ended',
  'Member Died',
  'Not Interested',
  'Non_Active',
  'Non-Active',
  'Inactive',
] as const;

type Summary = {
  total: number;
  openAuth: number;
  authEnded: number;
  missingDates: number;
  noClaimsYet: number;
  incomplete: number;
  complete: number;
  openMissingMonths: number;
};

const clean = (value: unknown) => String(value || '').trim();

const windowBadge = (row: KaiserT2038ClaimAuditRow) => {
  if (row.window === 'missing_dates') return { label: 'Missing auth dates', className: 'bg-slate-100 text-slate-800' };
  if (row.window === 'not_started') return { label: 'Not started', className: 'bg-blue-100 text-blue-900' };
  if (row.window === 'ending_soon') return { label: 'Ending soon', className: 'bg-amber-100 text-amber-950' };
  if (row.window === 'expired') return { label: 'Auth ended', className: 'bg-rose-100 text-rose-900' };
  return { label: 'Open auth', className: 'bg-emerald-100 text-emerald-900' };
};

export default function KaiserT2038ClaimAuditPage() {
  const auth = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const { toast } = useToast();
  const [rows, setRows] = useState<KaiserT2038ClaimAuditRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [fetchedAt, setFetchedAt] = useState('');
  const [runMode, setRunMode] = useState<KaiserT2038ClaimAuditRunMode | ''>('');
  const [runId, setRunId] = useState('');
  const [hasSavedRun, setHasSavedRun] = useState(false);
  const [claimStats, setClaimStats] = useState<{
    live: number;
    cached: number;
    targeted: number;
    newClaims: number;
    total: number;
    clients: number;
  }>({
    live: 0,
    cached: 0,
    targeted: 0,
    newClaims: 0,
    total: 0,
    clients: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<KaiserT2038ClaimAuditRunMode | ''>('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('incomplete');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Authorized');
  const [expandedId, setExpandedId] = useState('');
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState('');

  const applyAuditResponse = useCallback((body: Record<string, unknown>) => {
    setRows(Array.isArray(body.rows) ? (body.rows as KaiserT2038ClaimAuditRow[]) : []);
    setSummary((body.summary as Summary) || null);
    setFetchedAt(String(body.fetchedAt || ''));
    setRunMode((String(body.mode || '') as KaiserT2038ClaimAuditRunMode) || '');
    setRunId(String(body.runId || ''));
    setHasSavedRun(Boolean(body.hasSavedRun));
    setClaimStats({
      live: Number(body.claimRowsLive || 0) || 0,
      cached: Number(body.claimRowsCached || 0) || 0,
      targeted: Number(body.claimRowsTargeted || 0) || 0,
      newClaims: Number(body.claimRowsNew || 0) || 0,
      total: Number(body.claimRowsFetched || 0) || 0,
      clients: Number(body.claimClientsIndexed || 0) || 0,
    });
  }, []);

  const load = useCallback(
    async (mode: KaiserT2038ClaimAuditRunMode) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return;
      }
      setIsLoading(true);
      setLoadingMode(mode);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/admin/kaiser-t2038-claim-audit?mode=${mode}`, {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        applyAuditResponse(body);
        if (mode === 'incremental') {
          toast({
            title: 'Claims updated',
            description: `${Number(body.claimRowsNew || 0) || 0} new claim row(s) merged · gaps recalculated`,
          });
        } else if (mode === 'full') {
          toast({
            title: 'Full rebuild saved',
            description: `${Number(body.claimRowsFetched || 0) || 0} claim rows · run stored in Firestore`,
          });
        }
      } catch (err: unknown) {
        setError(String((err as { message?: string })?.message || 'Could not load claim audit.'));
      } finally {
        setIsLoading(false);
        setLoadingMode('');
      }
    },
    [auth, applyAuditResponse, toast]
  );

  useEffect(() => {
    if (!isAdminLoading && isAdmin) void load('saved');
  }, [isAdmin, isAdminLoading, load]);

  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const label = clean(row.calaimStatus) || '(blank)';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    // Ensure common CalAIM_Status values appear even if count is 0 in this run.
    for (const status of COMMON_CALAIM_STATUSES) {
      if (![...counts.keys()].some((key) => normalizeStatus(key) === normalizeStatus(status))) {
        counts.set(status, 0);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    });
  }, [rows]);

  const matchesStatusAndAuth = useCallback(
    (row: KaiserT2038ClaimAuditRow) => {
      if (authFilter === 'open' && !(row.window === 'in_window' || row.window === 'ending_soon')) return false;
      if (authFilter === 'ended' && !row.authEnded) return false;
      if (authFilter === 'missing_dates' && row.window !== 'missing_dates') return false;
      if (statusFilter === 'all') return true;
      const wantStatus = normalizeStatus(statusFilter);
      if (wantStatus === 'authorized') return isAuthorizedCalaimStatus(row.calaimStatus);
      if (wantStatus === 'non active' || wantStatus === 'nonactive' || wantStatus === 'inactive') {
        const got = normalizeStatus(row.calaimStatus);
        return got === 'non active' || got === 'nonactive' || got === 'inactive';
      }
      return normalizeStatus(row.calaimStatus) === wantStatus;
    },
    [authFilter, statusFilter]
  );

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesStatusAndAuth(row)) return false;
      if (coverageFilter === 'incomplete' && row.openMissingMonthCount <= 0 && !row.noClaimsYet) return false;
      if (coverageFilter === 'complete' && !row.claimsComplete) return false;
      if (coverageFilter === 'no_claims_yet' && !row.noClaimsYet) return false;
      if (!needle) return true;
      const haystack = [
        row.memberName,
        row.memberFirstName,
        row.memberLastName,
        row.clientId2,
        row.authorizationNumber,
        row.calaimStatus,
        row.kaiserStatus,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, query, coverageFilter, matchesStatusAndAuth]);

  /** Top-of-page work summary for current CalAIM_Status + Authorization filters. */
  const queueSummary = useMemo(() => {
    const scoped = rows.filter(matchesStatusAndAuth);
    const noClaimsMembers = scoped
      .filter((row) => row.noClaimsYet)
      .map((row) => ({
        id: row.id,
        name: row.memberName || row.clientId2 || 'Member',
        clientId2: row.clientId2,
      }));
    const gapMembers = scoped
      .filter((row) => !row.noClaimsYet && row.openMissingMonthCount > 0)
      .map((row) => {
        const months = (row.months || [])
          .filter((month) => month.status === 'missing')
          .map((month) => ({ key: month.monthKey, label: month.label || month.monthKey }));
        return {
          id: row.id,
          name: row.memberName || row.clientId2 || 'Member',
          clientId2: row.clientId2,
          openGaps: row.openMissingMonthCount,
          months,
        };
      });
    const monthRollup = new Map<string, { key: string; label: string; count: number }>();
    for (const member of gapMembers) {
      for (const month of member.months) {
        const existing = monthRollup.get(month.key);
        if (existing) existing.count += 1;
        else monthRollup.set(month.key, { key: month.key, label: month.label, count: 1 });
      }
    }
    const gapMonthsByMonth = Array.from(monthRollup.values()).sort((a, b) => a.key.localeCompare(b.key));
    return {
      scopedCount: scoped.length,
      noClaimsMembers,
      gapMembers,
      gapMonthsByMonth,
      totalOpenGapMonths: gapMembers.reduce((sum, member) => sum + member.openGaps, 0),
    };
  }, [rows, matchesStatusAndAuth]);

  const saveJustification = async (row: KaiserT2038ClaimAuditRow, monthKey: string, clear = false) => {
    const user = auth.currentUser;
    if (!user) return;
    const draftKey = `${row.clientId2}__${monthKey}`;
    const reason = clean(draftReasons[draftKey] || row.months.find((m) => m.monthKey === monthKey)?.justificationReason);
    if (!clear && !reason) {
      toast({
        variant: 'destructive',
        title: 'Reason required',
        description: 'Enter why this month was not claimed (e.g. not eligible / on hold).',
      });
      return;
    }
    setSavingKey(draftKey);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/admin/kaiser-t2038-claim-audit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId2: row.clientId2,
          monthKey,
          reason: clear ? '' : reason,
          clear,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `HTTP ${response.status}`));
      }
      toast({
        title: clear ? 'Justification cleared' : 'Month justified',
        description: `${row.memberName} · ${monthKey}`,
      });
      // Patch local state only — do not re-hit Caspio after a justification save.
      setRows((prev) => {
        const next = prev.map((item) => {
          if (item.clientId2 !== row.clientId2) return item;
          const months = item.months.map((month) => {
            if (month.monthKey !== monthKey) return month;
            if (clear) {
              return {
                ...month,
                status: month.claimDates.length > 0 ? ('claimed' as const) : ('missing' as const),
                justificationReason: '',
                justifiedBy: '',
                justifiedAt: '',
              };
            }
            return {
              ...month,
              status: 'justified' as const,
              justificationReason: reason,
              justifiedBy: String(body?.justification?.justifiedBy || user.displayName || user.email || 'Admin'),
              justifiedAt: String(body?.justification?.updatedAt || new Date().toISOString()),
            };
          });
          const openMissingFromGrid = months.filter((m) => m.status === 'missing').length;
          const justifiedMonthCount = months.filter((m) => m.status === 'justified').length;
          const claimedMonthCount = months.filter((m) => m.status === 'claimed').length;
          return {
            ...item,
            months,
            claimedMonthCount,
            justifiedMonthCount,
            missingMonthCount: item.noClaimsYet ? 1 : openMissingFromGrid + justifiedMonthCount,
            openMissingMonthCount: item.noClaimsYet ? 1 : openMissingFromGrid,
            claimsComplete: !item.noClaimsYet && months.length > 0 && openMissingFromGrid === 0,
          };
        });
        setSummary(summarizeKaiserT2038ClaimAudit(next) as Summary);
        return next;
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: String((err as { message?: string })?.message || 'Save failed'),
      });
    } finally {
      setSavingKey('');
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking access
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>Sign in as an admin to audit Kaiser T2038 claim months.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kaiser T2038 Claim Audit</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Authorized Kaiser members (including ended authorizations) vs{' '}
            <span className="font-medium">Kaiser-only</span>{' '}
            <code className="text-xs">CalAIM_Claim_Submit_T2038</code> rows (<code className="text-xs">MCP</code>). Gap
            months start at the <span className="font-medium">first submitted claim</span> (not Caspio auth start —
            ILS may release later) through auth end / today. Also flags new auths with{' '}
            <span className="font-medium">no claims yet</span>.
          </p>
          {fetchedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last run: {new Date(fetchedAt).toLocaleString()}
              {runMode ? ` · ${runMode}` : ''}
              {runId ? ` · ${runId.slice(0, 8)}…` : ''} · claims {claimStats.total}
              {claimStats.newClaims ? ` (+${claimStats.newClaims} new)` : ''}
              {claimStats.targeted ? ` · targeted ${claimStats.targeted}` : ''} · {claimStats.clients} Client_ID2 keys
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load('saved')} disabled={isLoading}>
            {isLoading && loadingMode === 'saved' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-2 h-4 w-4" />
            )}
            Load saved
          </Button>
          <Button onClick={() => void load('incremental')} disabled={isLoading || !hasSavedRun}>
            {isLoading && loadingMode === 'incremental' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Update new claims
          </Button>
          <Button variant="secondary" onClick={() => void load('full')} disabled={isLoading}>
            {isLoading && loadingMode === 'full' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Full rebuild
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load audit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasSavedRun && !isLoading && !error ? (
        <Alert>
          <AlertTitle>No saved audit yet</AlertTitle>
          <AlertDescription>
            Caspio is not pulled on page open. Run <span className="font-medium">Full rebuild</span> once to store the
            member/claim snapshot in Firestore. After that, use <span className="font-medium">Update new claims</span>{' '}
            to pull only new claim rows and recalculate gaps.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Kaiser members in scope</CardDescription>
            <CardTitle>{summary?.total ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Open auth {summary?.openAuth ?? 0} · Ended {summary?.authEnded ?? 0}
          </CardContent>
        </Card>
        <Card className={summary?.incomplete ? 'border-amber-400' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Incomplete claims
            </CardDescription>
            <CardTitle>{summary?.incomplete ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {summary?.openMissingMonths ?? 0} gap month{summary?.openMissingMonths === 1 ? '' : 's'} after first claim ·{' '}
            {summary?.noClaimsYet ?? 0} with no claims yet
          </CardContent>
        </Card>
        <Card className={summary?.noClaimsYet ? 'border-sky-300' : undefined}>
          <CardHeader className="pb-2">
            <CardDescription>No claims yet</CardDescription>
            <CardTitle>{summary?.noClaimsYet ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Auth on file, zero rows in CalAIM_Claim_Submit_T2038
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claims complete</CardDescription>
            <CardTitle>{summary?.complete ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Every month from first claim → auth end/today claimed or justified
          </CardContent>
        </Card>
      </div>

      {hasSavedRun ? (
        <Card className="border-amber-200/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Gap months &amp; no claims yet</CardTitle>
            <CardDescription>
              For current filters
              {statusFilter !== 'all' ? ` · CalAIM_Status ${statusFilter}` : ''}
              {authFilter !== 'all' ? ` · auth ${authFilter}` : ''} · {queueSummary.scopedCount} members ·{' '}
              {queueSummary.totalOpenGapMonths} open gap month
              {queueSummary.totalOpenGapMonths === 1 ? '' : 's'} · {queueSummary.noClaimsMembers.length} no claims yet
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-amber-950">Gap months (by month)</div>
              {queueSummary.gapMonthsByMonth.length === 0 ? (
                <p className="text-xs text-muted-foreground">No open gap months in this filter set.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {queueSummary.gapMonthsByMonth.map((month) => (
                    <Badge
                      key={month.key}
                      variant="outline"
                      className="bg-amber-50 text-amber-950 border-amber-300 font-normal"
                    >
                      {month.label}
                      <span className="ml-1 text-amber-800/80">· {month.count}</span>
                    </Badge>
                  ))}
                </div>
              )}
              {queueSummary.gapMembers.length > 0 ? (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded border bg-white p-2 text-xs">
                  {queueSummary.gapMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-1 py-0.5 text-left hover:bg-amber-50"
                      onClick={() => {
                        setCoverageFilter('incomplete');
                        setQuery(member.clientId2 || member.name);
                        setExpandedId(member.id);
                      }}
                    >
                      <span className="font-medium">{member.name}</span>
                      <span className="text-muted-foreground">
                        {member.months.map((month) => month.label).join(', ') || `${member.openGaps} gaps`}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-sky-950">No claims yet (members)</div>
              {queueSummary.noClaimsMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members awaiting a first claim in this filter set.</p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-sky-200 bg-sky-50/50 p-2 text-xs">
                  {queueSummary.noClaimsMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-sky-100/80"
                      onClick={() => {
                        setCoverageFilter('no_claims_yet');
                        setQuery(member.clientId2 || member.name);
                        setExpandedId(member.id);
                      }}
                    >
                      <span className="font-medium">{member.name}</span>
                      <span className="text-muted-foreground">Client_ID2 {member.clientId2 || '—'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Default shows open gaps after the first claim, plus new auths with no claims submitted yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Search</span>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, Client_ID2, auth #"
              className="w-64"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Claim coverage</span>
            <select
              className="block h-10 rounded-md border bg-white px-3 text-sm"
              value={coverageFilter}
              onChange={(event) => setCoverageFilter(event.target.value as CoverageFilter)}
            >
              <option value="incomplete">Gaps + no claims yet</option>
              <option value="no_claims_yet">No claims yet only</option>
              <option value="complete">Complete / justified</option>
              <option value="all">All members</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">Authorization</span>
            <select
              className="block h-10 rounded-md border bg-white px-3 text-sm"
              value={authFilter}
              onChange={(event) => setAuthFilter(event.target.value as AuthFilter)}
            >
              <option value="all">Open + ended</option>
              <option value="open">Open auth only</option>
              <option value="ended">Auth ended only</option>
              <option value="missing_dates">Missing auth dates</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">CalAIM_Status</span>
            <select
              className="block h-10 min-w-[12rem] rounded-md border bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="Authorized">Authorized</option>
              {statusOptions
                .filter(([label]) => normalizeStatus(label) !== 'authorized')
                .map(([label, count]) => (
                  <option key={label} value={label}>
                    {label}
                    {count ? ` (${count})` : ''}
                  </option>
                ))}
            </select>
          </label>
          <div className="text-sm text-muted-foreground pb-2">
            Showing {filteredRows.length} of {rows.length}
            {statusFilter !== 'all' ? ` · ${statusFilter}` : ''}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Expand a row for the month grid, Caspio claim dates, and justify checkoffs after your deep dive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && rows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading Kaiser members and T2038 claims…
            </div>
          ) : null}
          {!isLoading && filteredRows.length === 0 ? (
            <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
              No members match these filters.
            </div>
          ) : null}
          {filteredRows.map((row) => {
            const badge = windowBadge(row);
            const expanded = expandedId === row.id;
            const gapMonths = (row.months || []).filter((month) => month.status === 'missing');
            const gapMonthLabels = gapMonths.map((month) => month.label || month.monthKey);
            return (
              <div key={row.id} className="rounded border">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted/40"
                  onClick={() => setExpandedId(expanded ? '' : row.id)}
                >
                  <span className="mt-0.5 text-muted-foreground">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.memberName || row.clientId2}</span>
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                      {row.noClaimsYet ? (
                        <Badge variant="outline" className="bg-sky-50 text-sky-950 border-sky-300">
                          No claims yet
                        </Badge>
                      ) : row.openMissingMonthCount > 0 ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-950 border-amber-300">
                          {row.openMissingMonthCount} gap month{row.openMissingMonthCount === 1 ? '' : 's'}
                        </Badge>
                      ) : row.claimsComplete ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-900 border-emerald-300">
                          Claims complete
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Client_ID2 {row.clientId2 || '—'} · Auth {row.authorizationStart || '—'} →{' '}
                      {row.authorizationEnd || '—'}
                      {row.authorizationNumber ? ` · #${row.authorizationNumber}` : ''} · Status{' '}
                      {row.calaimStatus || '—'}
                    </div>
                    <div className="text-xs">
                      {row.noClaimsYet
                        ? 'New / unused auth — no CalAIM_Claim_Submit_T2038 rows yet'
                        : `First claim ${row.firstClaimDate || '—'} (${row.firstClaimMonthKey || '—'}) · Gap window ${
                            row.gapStartMonthKey || '—'
                          } → auth end/today · Claimed ${row.claimedMonthCount} · Justified ${
                            row.justifiedMonthCount
                          } · Open gaps ${row.openMissingMonthCount}`}
                    </div>
                    {!row.noClaimsYet && gapMonthLabels.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[11px] font-medium text-amber-900">Gaps:</span>
                        {gapMonthLabels.map((label) => (
                          <Badge
                            key={`${row.id}-${label}`}
                            variant="outline"
                            className="bg-amber-50 text-amber-950 border-amber-300 text-[11px] font-normal"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-4 border-t bg-slate-50/60 px-3 py-3">
                    <div>
                      <div className="mb-2 text-sm font-medium">
                        {row.noClaimsYet
                          ? 'No claim months yet'
                          : `Month coverage (first claim → auth end or today)`}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {row.noClaimsYet ? (
                          <div className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 rounded border border-sky-200 bg-sky-50/80 p-3">
                            Authorization is on file but no claims have been submitted in{' '}
                            <code>CalAIM_Claim_Submit_T2038</code> for this Client_ID2. Submit the first claim, then
                            gaps will be measured from that month forward while the auth remains active.
                          </div>
                        ) : null}
                        {!row.noClaimsYet && row.months.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            No gap months to show — add T2038 authorization dates or confirm claim DOS fields.
                          </div>
                        ) : null}
                        {row.months.map((month) => {
                          const draftKey = `${row.clientId2}__${month.monthKey}`;
                          const isSaving = savingKey === draftKey;
                          return (
                            <div
                              key={month.monthKey}
                              className={`rounded border bg-white p-2 text-xs ${
                                month.status === 'missing'
                                  ? 'border-amber-300'
                                  : month.status === 'justified'
                                    ? 'border-sky-300'
                                    : 'border-emerald-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{month.label}</span>
                                <Badge
                                  variant="outline"
                                  className={
                                    month.status === 'claimed'
                                      ? 'bg-emerald-50 text-emerald-900'
                                      : month.status === 'justified'
                                        ? 'bg-sky-50 text-sky-900'
                                        : 'bg-amber-50 text-amber-950'
                                  }
                                >
                                  {month.status}
                                </Badge>
                              </div>
                              {month.claimDates.length > 0 ? (
                                <div className="mt-1 text-muted-foreground">
                                  DOS: {month.claimDates.join(', ')}
                                </div>
                              ) : null}
                              {month.status !== 'claimed' ? (
                                <div className="mt-2 space-y-2">
                                  <label className="flex items-start gap-2">
                                    <Checkbox
                                      checked={month.status === 'justified'}
                                      disabled={isSaving}
                                      onCheckedChange={(checked) => {
                                        if (checked === true) void saveJustification(row, month.monthKey, false);
                                        else void saveJustification(row, month.monthKey, true);
                                      }}
                                    />
                                    <span>Justify no claim (not eligible / on hold / other)</span>
                                  </label>
                                  <Input
                                    value={draftReasons[draftKey] ?? month.justificationReason}
                                    onChange={(event) =>
                                      setDraftReasons((prev) => ({ ...prev, [draftKey]: event.target.value }))
                                    }
                                    placeholder="Reason after Caspio deep dive"
                                    className="h-8 text-xs"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={isSaving}
                                      onClick={() => void saveJustification(row, month.monthKey, false)}
                                    >
                                      {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                      Save reason
                                    </Button>
                                    {month.status === 'justified' ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={isSaving}
                                        onClick={() => void saveJustification(row, month.monthKey, true)}
                                      >
                                        Clear
                                      </Button>
                                    ) : null}
                                  </div>
                                  {month.justifiedBy ? (
                                    <div className="text-[11px] text-muted-foreground">
                                      {month.justifiedBy}
                                      {month.justifiedAt
                                        ? ` · ${new Date(month.justifiedAt).toLocaleString()}`
                                        : ''}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium">
                        Caspio claims on file ({row.submittedClaims.length})
                      </div>
                      {row.submittedClaims.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          No rows in CalAIM_Claim_Submit_T2038 for this Client_ID2.
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-auto rounded border bg-white">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 text-left">
                              <tr>
                                <th className="px-2 py-1.5">Date_of_Service</th>
                                <th className="px-2 py-1.5">Client_First</th>
                                <th className="px-2 py-1.5">Client_Last</th>
                                <th className="px-2 py-1.5">Month</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.submittedClaims.map((claim, index) => (
                                <tr key={`${claim.dateOfServiceIso}-${index}`} className="border-t">
                                  <td className="px-2 py-1.5">{claim.dateOfService}</td>
                                  <td className="px-2 py-1.5">{claim.clientFirst || '—'}</td>
                                  <td className="px-2 py-1.5">{claim.clientLast || '—'}</td>
                                  <td className="px-2 py-1.5">{claim.monthKey}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
