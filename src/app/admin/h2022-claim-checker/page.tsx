'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type PlanBucket = 'kaiser' | 'health_net' | 'other';
type PlanScope = 'all' | 'kaiser' | 'health_net';
type SortKey =
  | 'member'
  | 'plan'
  | 'h2022_start'
  | 'h2022_end'
  | 't2038_end'
  | 'next_auth_end'
  | 'rcfe'
  | 'status';

type MemberH2022Row = {
  clientId2: string;
  memberFirst: string;
  memberLast: string;
  memberName: string;
  mcpCin?: string;
  mrn?: string;
  mco?: string;
  plan: PlanBucket;
  calaimStatus?: string;
  kaiserStatus?: string;
  county?: string;
  rcfeName?: string;
  authorizationStartH2022?: string | null;
  authorizationEndH2022?: string | null;
  nextAuthStartH2022?: string | null;
  nextAuthEndH2022?: string | null;
  h2022StartDate?: string | null;
  h2022EndDate?: string | null;
  h2022EndSource?: 'authorization' | 'next_auth' | null;
  authorizationStartT2038?: string | null;
  authorizationEndT2038?: string | null;
  nextAuthStartT2038?: string | null;
  nextAuthEndT2038?: string | null;
  t2038StartDate?: string | null;
  t2038EndDate?: string | null;
  missingH2022Dates?: boolean;
  h2022EndWarning?: boolean;
  h2022DaysUntilEnd?: number | null;
  h2022WarningLabel?: string | null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const dateSortMs = (value: string | null | undefined) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(`${value}T00:00:00`);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

const statusSortRank = (row: MemberH2022Row) => {
  if (row.missingH2022Dates) return 3;
  if (row.h2022EndWarning && (row.h2022DaysUntilEnd ?? 0) < 0) return 0;
  if (row.h2022EndWarning) return 1;
  return 2;
};

export default function H2022ClaimCheckerPage() {
  const auth = useAuth();
  const { isAdmin, isSuperAdmin, isLoading: adminLoading, user: adminUser, canAccessAllTools } = useAdmin();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MemberH2022Row[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    withDates: number;
    missingDates: number;
    endingSoonKaiser: number;
    endingSoonHealthNet: number;
    ended: number;
  } | null>(null);
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [pullPlanScope, setPullPlanScope] = useState<PlanScope>('all');
  const [planFilter, setPlanFilter] = useState<PlanScope>('all');
  const [endFilter, setEndFilter] = useState<'all' | 'ending_soon' | 'ended' | 'missing'>('all');
  const [lastNameQuery, setLastNameQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('h2022_end');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(key);
    setSortDirection('asc');
  };

  const displayedRows = useMemo(() => {
    const q = lastNameQuery.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (planFilter === 'kaiser' && row.plan !== 'kaiser') return false;
      if (planFilter === 'health_net' && row.plan !== 'health_net') return false;
      if (endFilter === 'ending_soon') {
        if (!row.h2022EndWarning || (row.h2022DaysUntilEnd ?? -1) < 0) return false;
      }
      if (endFilter === 'ended') {
        if (!row.h2022EndWarning || (row.h2022DaysUntilEnd ?? 0) >= 0) return false;
      }
      if (endFilter === 'missing') {
        if (!row.missingH2022Dates) return false;
      }
      if (q) {
        const hay = `${row.memberLast} ${row.memberFirst} ${row.memberName} ${row.clientId2}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'member') {
        cmp = a.memberLast.localeCompare(b.memberLast) || a.memberFirst.localeCompare(b.memberFirst);
      } else if (sortBy === 'plan') {
        cmp = a.plan.localeCompare(b.plan) || a.memberLast.localeCompare(b.memberLast);
      } else if (sortBy === 'rcfe') {
        cmp = String(a.rcfeName || '').localeCompare(String(b.rcfeName || ''));
      } else if (sortBy === 'h2022_start') {
        cmp = dateSortMs(a.h2022StartDate) - dateSortMs(b.h2022StartDate);
      } else if (sortBy === 't2038_end') {
        cmp = dateSortMs(a.t2038EndDate) - dateSortMs(b.t2038EndDate);
      } else if (sortBy === 'next_auth_end') {
        cmp = dateSortMs(a.nextAuthEndH2022) - dateSortMs(b.nextAuthEndH2022);
      } else if (sortBy === 'status') {
        cmp = statusSortRank(a) - statusSortRank(b);
      } else {
        cmp = dateSortMs(a.h2022EndDate) - dateSortMs(b.h2022EndDate);
      }
      if (cmp === 0) {
        cmp = a.memberLast.localeCompare(b.memberLast) || a.memberFirst.localeCompare(b.memberFirst);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, planFilter, endFilter, lastNameQuery, sortBy, sortDirection]);

  const SortableHead = ({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => {
    const active = sortBy === sortKey;
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TableHead className={cn('whitespace-nowrap', className)}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 font-medium hover:text-foreground',
            active ? 'text-foreground' : 'text-muted-foreground'
          )}
          onClick={() => toggleSort(sortKey)}
        >
          <span>{label}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </button>
      </TableHead>
    );
  };

  const summaryCards = useMemo(() => {
    if (summary) return summary;
    return {
      total: rows.length,
      withDates: rows.filter((r) => !r.missingH2022Dates).length,
      missingDates: rows.filter((r) => r.missingH2022Dates).length,
      endingSoonKaiser: rows.filter(
        (r) => r.plan === 'kaiser' && r.h2022EndWarning && (r.h2022DaysUntilEnd ?? -1) >= 0
      ).length,
      endingSoonHealthNet: rows.filter(
        (r) => r.plan === 'health_net' && r.h2022EndWarning && (r.h2022DaysUntilEnd ?? -1) >= 0
      ).length,
      ended: rows.filter((r) => r.h2022EndWarning && (r.h2022DaysUntilEnd ?? 0) < 0).length,
    };
  }, [rows, summary]);

  if (adminLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Checking access...
        </div>
      </div>
    );
  }

  if (!isAdmin && !isSuperAdmin && !canAccessAllTools && !adminUser) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              Sign in with an admin or Full Tools staff account to use H2022 Status.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const getIdTokenFresh = async () => {
    const current = auth?.currentUser;
    if (!current) return null;
    try {
      return await current.getIdToken(true);
    } catch {
      return await current.getIdToken();
    }
  };

  const pullH2022Dates = async () => {
    setLoading(true);
    try {
      const idToken = await getIdTokenFresh();
      if (!idToken) {
        throw new Error('Please log in with an admin account before pulling H2022 dates.');
      }

      const res = await fetch('/api/admin/h2022-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: 'pull_h2022_dates',
          planScope: pullPlanScope,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        pulledAt?: string;
        planScope?: PlanScope;
        summary?: {
          total: number;
          withDates: number;
          missingDates: number;
          endingSoonKaiser: number;
          endingSoonHealthNet: number;
          ended: number;
        };
        rows?: MemberH2022Row[];
      };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Pull failed (HTTP ${res.status})`);
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(
        data.summary || {
          total: 0,
          withDates: 0,
          missingDates: 0,
          endingSoonKaiser: 0,
          endingSoonHealthNet: 0,
          ended: 0,
        }
      );
      setPulledAt(data.pulledAt || new Date().toISOString());
      setPlanFilter(pullPlanScope);
      setEndFilter('all');

      const scopeLabel =
        pullPlanScope === 'kaiser' ? 'Kaiser' : pullPlanScope === 'health_net' ? 'Health Net' : 'Kaiser + Health Net';
      toast({
        title: 'H2022 dates pulled',
        description: `Loaded ${data.summary?.total || 0} ${scopeLabel} member(s) from Caspio.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to pull H2022 dates.';
      toast({
        title: 'Pull failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">H2022 Status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pull H2022 authorization start and end dates for Kaiser and Health Net members from Caspio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pull H2022 Dates</CardTitle>
          <CardDescription>
            Loads current Authorization_Start/End_Date_H2022 from Caspio. For Health Net, also checks
            Next_Auth_Start_H2022 and Next_Auth_End_H2022.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Pull members for</div>
              <select
                value={pullPlanScope}
                onChange={(e) => setPullPlanScope(e.target.value as PlanScope)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
                disabled={loading}
              >
                <option value="all">Kaiser + Health Net</option>
                <option value="kaiser">Kaiser only</option>
                <option value="health_net">Health Net only</option>
              </select>
            </div>
            <Button type="button" disabled={loading} onClick={() => void pullH2022Dates()}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Pull H2022 Dates from Caspio
            </Button>
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium text-foreground">Kaiser:</span> only members with CalAIM_Status{' '}
              <span className="font-mono">Authorized</span> or <span className="font-mono">H2022</span>. Uses
              Authorization_Start/End_Date_H2022. Ending-soon window is 1 month.
            </div>
            <div>
              <span className="font-medium text-foreground">Health Net:</span> uses Authorization dates and also
              Next_Auth_Start_H2022 / Next_Auth_End_H2022. Ending-soon window is 2 weeks.
            </div>
          </div>
          {pulledAt ? (
            <div className="text-xs text-muted-foreground">
              Last pull: {new Date(pulledAt).toLocaleString()} · {summaryCards.total} member(s)
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Choose a plan scope, then pull to load the latest H2022 dates from Caspio.
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 || summary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card
            className={`cursor-pointer transition-colors ${
              planFilter === 'all' && endFilter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-muted/40'
            }`}
            onClick={() => {
              setPlanFilter('all');
              setEndFilter('all');
            }}
          >
            <CardHeader className="pb-2">
              <CardDescription>Total members</CardDescription>
              <CardTitle className="text-2xl">{summaryCards.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${endFilter === 'missing' ? 'ring-2 ring-slate-500' : 'hover:bg-muted/40'}`}
            onClick={() => setEndFilter('missing')}
          >
            <CardHeader className="pb-2">
              <CardDescription>Missing dates</CardDescription>
              <CardTitle className="text-2xl">{summaryCards.missingDates}</CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              planFilter === 'kaiser' && endFilter === 'ending_soon' ? 'ring-2 ring-amber-500' : 'hover:bg-muted/40'
            }`}
            onClick={() => {
              setPlanFilter('kaiser');
              setEndFilter('ending_soon');
            }}
          >
            <CardHeader className="pb-2">
              <CardDescription>Kaiser ending soon</CardDescription>
              <CardTitle className="text-2xl text-amber-700">{summaryCards.endingSoonKaiser}</CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${
              planFilter === 'health_net' && endFilter === 'ending_soon' ? 'ring-2 ring-orange-500' : 'hover:bg-muted/40'
            }`}
            onClick={() => {
              setPlanFilter('health_net');
              setEndFilter('ending_soon');
            }}
          >
            <CardHeader className="pb-2">
              <CardDescription>Health Net ending soon</CardDescription>
              <CardTitle className="text-2xl text-orange-700">{summaryCards.endingSoonHealthNet}</CardTitle>
            </CardHeader>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${endFilter === 'ended' ? 'ring-2 ring-red-500' : 'hover:bg-muted/40'}`}
            onClick={() => setEndFilter('ended')}
          >
            <CardHeader className="pb-2">
              <CardDescription>Already ended</CardDescription>
              <CardTitle className="text-2xl text-red-700">{summaryCards.ended}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>With dates</CardDescription>
              <CardTitle className="text-2xl text-emerald-700">{summaryCards.withDates}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>H2022 / T2038 Authorization Dates</CardTitle>
          <CardDescription>
            Click column headers to sort. Kaiser warning within 1 month · Health Net warning within 2 weeks
            (includes Next_Auth_End_H2022). T2038 end dates are shown alongside H2022.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Plan</div>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as PlanScope)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All plans</option>
                <option value="kaiser">Kaiser</option>
                <option value="health_net">Health Net</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">H2022 end status</div>
              <select
                value={endFilter}
                onChange={(e) => setEndFilter(e.target.value as 'all' | 'ending_soon' | 'ended' | 'missing')}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="ending_soon">Ending soon</option>
                <option value="ended">Already ended</option>
                <option value="missing">Missing dates</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Member last name</div>
              <Input
                value={lastNameQuery}
                onChange={(e) => setLastNameQuery(e.target.value)}
                placeholder="Search last name..."
                className="h-9 w-[200px]"
              />
            </div>
            <div className="text-xs text-muted-foreground pb-1">
              {displayedRows.length} shown · click column headers to sort
              {sortBy ? ` · ${sortBy.replace(/_/g, ' ')} ${sortDirection}` : ''}
            </div>
          </div>

          {displayedRows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              {rows.length === 0
                ? 'No members loaded yet. Pull H2022 dates from Caspio to begin.'
                : 'No matching members for the selected filter.'}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Member" sortKey="member" />
                    <SortableHead label="Plan" sortKey="plan" />
                    <SortableHead label="H2022 Start" sortKey="h2022_start" />
                    <SortableHead label="H2022 End" sortKey="h2022_end" />
                    <SortableHead label="T2038 End" sortKey="t2038_end" />
                    <SortableHead label="HN Next Auth End" sortKey="next_auth_end" />
                    <SortableHead label="RCFE / County" sortKey="rcfe" />
                    <SortableHead label="Status" sortKey="status" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedRows.map((row) => (
                    <TableRow key={`${row.clientId2}-${row.plan}-${row.memberName}`}>
                      <TableCell className="align-top">
                        <div className="text-sm font-medium whitespace-nowrap">{row.memberName}</div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          ID2: {row.clientId2 || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          MCP/MRN: {row.mcpCin || row.mrn || 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        <div className="text-sm font-medium">
                          {row.plan === 'kaiser'
                            ? 'Kaiser'
                            : row.plan === 'health_net'
                              ? 'Health Net'
                              : row.mco || 'Other'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm whitespace-nowrap font-mono tabular-nums">
                        {formatDate(row.h2022StartDate)}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        <div className="text-sm font-mono tabular-nums">{formatDate(row.h2022EndDate)}</div>
                        {row.h2022EndSource === 'next_auth' ? (
                          <div className="text-[11px] text-muted-foreground">next auth</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        <div className="text-sm font-mono tabular-nums">{formatDate(row.t2038EndDate)}</div>
                        {row.t2038StartDate ? (
                          <div className="text-[11px] text-muted-foreground">
                            start {formatDate(row.t2038StartDate)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        {row.plan === 'health_net' ? (
                          <div className="text-sm font-mono tabular-nums">
                            {formatDate(row.nextAuthEndH2022)}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="text-sm max-w-[180px] truncate" title={row.rcfeName || ''}>
                          {row.rcfeName || 'N/A'}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {row.county || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        {row.missingH2022Dates ? (
                          <Badge variant="outline">Missing dates</Badge>
                        ) : row.h2022EndWarning ? (
                          <Badge
                            className={
                              (row.h2022DaysUntilEnd ?? 0) < 0
                                ? 'bg-red-700'
                                : row.plan === 'kaiser'
                                  ? 'bg-amber-600'
                                  : 'bg-orange-600'
                            }
                          >
                            {row.h2022WarningLabel || 'Ending soon'}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
