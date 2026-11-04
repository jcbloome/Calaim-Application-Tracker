'use client';

import { useCallback, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, Loader2, Play, RefreshCw } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  buildH2022ReauthVisitsCsv,
  isAuthorizedCalaimStatus,
  type H2022ReauthVisitRow,
  type H2022ReauthVisitSummary,
  type ReauthAuthStatus,
} from '@/lib/h2022-reauth-visits';

type FilterKey =
  | 'placed_all'
  | 't2038_valid'
  | 'charge_candidates'
  | 'likely_reauth_done'
  | 'h2022_missing'
  | 'h2022_expired';

const STATUS_LABEL: Record<ReauthAuthStatus, string> = {
  active: 'Active',
  ending_soon: 'Ending soon',
  expired: 'Expired',
  missing: 'Missing',
  not_started: 'Not started',
};

function statusBadgeClass(status: ReauthAuthStatus) {
  if (status === 'active') return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (status === 'ending_soon') return 'bg-amber-100 text-amber-900 border-amber-200';
  if (status === 'expired') return 'bg-rose-100 text-rose-900 border-rose-200';
  if (status === 'not_started') return 'bg-sky-100 text-sky-900 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatDateCell(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const parsed = new Date(raw.includes('/') ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return format(parsed, 'MMM d, yyyy');
}

const EMPTY_SUMMARY: H2022ReauthVisitSummary = {
  withRcfe: 0,
  authorized: 0,
  doNotCharge: 0,
  chargeCandidates: 0,
  likelyReauthDone: 0,
  h2022Missing: 0,
  h2022Expired: 0,
  h2022Active: 0,
  healthNet: 0,
  kaiser: 0,
};

export default function H2022ReauthVisitsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const [rows, setRows] = useState<H2022ReauthVisitRow[]>([]);
  const [summary, setSummary] = useState<H2022ReauthVisitSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedIso, setLastSyncedIso] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<FilterKey>('placed_all');
  const [authorizedOnly, setAuthorizedOnly] = useState(true);
  const [search, setSearch] = useState('');

  const placedCount = useMemo(() => {
    if (!authorizedOnly) return summary.withRcfe;
    return rows.filter((row) => isAuthorizedCalaimStatus(row.calaimStatus)).length;
  }, [authorizedOnly, rows, summary.withRcfe]);

  const t2038ValidCount = useMemo(() => {
    return rows.filter((row) => {
      if (authorizedOnly && !isAuthorizedCalaimStatus(row.calaimStatus)) return false;
      return row.doNotCharge;
    }).length;
  }, [authorizedOnly, rows]);

  const getToken = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Please sign in again.');
    return user.getIdToken();
  }, [auth?.currentUser]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/h2022-reauth-visits', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        rows?: H2022ReauthVisitRow[];
        summary?: H2022ReauthVisitSummary;
        lastSyncedIso?: string | null;
      };
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load (HTTP ${res.status})`);
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary || EMPTY_SUMMARY);
      setLastSyncedIso(data.lastSyncedIso || null);
      setLastRefreshedAt(new Date());
      setHasLoaded(true);
    } catch (err: any) {
      setError(String(err?.message || 'Could not load H2022 reauth visits.'));
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isAdmin]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (authorizedOnly && !isAuthorizedCalaimStatus(row.calaimStatus)) return false;
      if (filter === 'placed_all') {
        // all real-RCFE Kaiser rows (already filtered by API)
      } else if (filter === 't2038_valid' && !row.doNotCharge) {
        return false;
      } else if (filter === 'charge_candidates' && !row.chargeCandidate) {
        return false;
      } else if (filter === 'likely_reauth_done' && !row.likelyReauthDone) {
        return false;
      } else if (filter === 'h2022_missing' && row.h2022Status !== 'missing') {
        return false;
      } else if (filter === 'h2022_expired' && row.h2022Status !== 'expired') {
        return false;
      }
      if (!q) return true;
      const hay = [
        row.memberName,
        row.memberFirstName,
        row.memberLastName,
        row.rcfeName,
        row.mrn,
        row.mediCal,
        row.clientId2,
        row.h2022Number,
        row.county,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [authorizedOnly, filter, rows, search]);

  const downloadCsv = () => {
    const csv = buildH2022ReauthVisitsCsv(visibleRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `H2022-reauth-visits-Kaiser-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>Sign in as an admin to view H2022 reauth visits.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">H2022 Reauth Visits</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Kaiser members with a real RCFE attached only (Health Net excluded; placeholder “CalAIM Use” RCFEs
            excluded). If T2038 is still open we do not charge. When T2038 has expired, use H2022 dates to see who
            already had a reauth visit that may need payment — and who is missing or past an H2022 end date.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : hasLoaded ? (
              <RefreshCw className="mr-2 h-4 w-4" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {hasLoaded ? 'Reload Kaiser list' : 'Load Kaiser list'}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!visibleRows.length}>
            <Download className="mr-2 h-4 w-4" />
            CSV ({visibleRows.length})
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasLoaded && !isLoading ? (
        <Alert>
          <AlertTitle>Ready when you are</AlertTitle>
          <AlertDescription>
            Press <strong>Load Kaiser list</strong> to pull RCFE-placed Kaiser members from the members cache.
            Nothing loads automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasLoaded || isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            className="text-left"
            onClick={() => setFilter('placed_all')}
            disabled={!hasLoaded}
          >
            <Card className={cn(filter === 'placed_all' && hasLoaded && 'ring-2 ring-primary')}>
              <CardHeader className="pb-2">
                <CardDescription>Placed at RCFE</CardDescription>
                <CardTitle className="text-2xl">{hasLoaded ? placedCount : '—'}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Kaiser with a real facility
                {hasLoaded && !authorizedOnly ? ` · ${summary.authorized} authorized` : null}
                {hasLoaded && authorizedOnly ? ' · authorized only' : null}
              </CardContent>
            </Card>
          </button>
          <button
            type="button"
            className="text-left"
            onClick={() => setFilter('t2038_valid')}
            disabled={!hasLoaded}
          >
            <Card className={cn(filter === 't2038_valid' && hasLoaded && 'ring-2 ring-primary')}>
              <CardHeader className="pb-2">
                <CardDescription>T2038 still valid</CardDescription>
                <CardTitle className="text-2xl">{hasLoaded ? t2038ValidCount : '—'}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Do not charge for reauth visit
              </CardContent>
            </Card>
          </button>
          <button
            type="button"
            className="text-left"
            onClick={() => setFilter('charge_candidates')}
            disabled={!hasLoaded}
          >
            <Card className={cn(filter === 'charge_candidates' && hasLoaded && 'ring-2 ring-primary')}>
              <CardHeader className="pb-2">
                <CardDescription>Charge candidates</CardDescription>
                <CardTitle className="text-2xl">
                  {hasLoaded
                    ? rows.filter(
                        (r) =>
                          r.chargeCandidate &&
                          (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                      ).length
                    : '—'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                T2038 expired/missing · likely reauth done{' '}
                {rows.filter(
                  (r) =>
                    r.likelyReauthDone &&
                    (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                ).length}
              </CardContent>
            </Card>
          </button>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>H2022 attention</CardDescription>
              <CardTitle className="text-2xl">
                {hasLoaded
                  ? rows.filter(
                      (r) =>
                        (r.h2022Status === 'missing' || r.h2022Status === 'expired') &&
                        (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                    ).length
                  : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Missing {summary.h2022Missing} · Expired {summary.h2022Expired} · Active {summary.h2022Active}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {hasLoaded ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>
              Default shows everyone placed. Use <strong>T2038 still valid</strong> for members we do not charge
              yet, or charge-candidate filters for payment review.
              {lastSyncedIso
                ? ` Cache synced ${format(new Date(lastSyncedIso), 'MMM d, yyyy h:mm a')}.`
                : null}
              {lastRefreshedAt ? ` Loaded ${format(lastRefreshedAt, 'h:mm a')}.` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['placed_all', `Placed (${placedCount})`],
                  ['t2038_valid', `T2038 still valid (${t2038ValidCount})`],
                  [
                    'charge_candidates',
                    `Charge candidates (${rows.filter(
                      (r) =>
                        r.chargeCandidate &&
                        (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                    ).length})`,
                  ],
                  [
                    'likely_reauth_done',
                    `Likely reauth done (${rows.filter(
                      (r) =>
                        r.likelyReauthDone &&
                        (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                    ).length})`,
                  ],
                  [
                    'h2022_missing',
                    `H2022 missing (${rows.filter(
                      (r) =>
                        r.h2022Status === 'missing' &&
                        (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                    ).length})`,
                  ],
                  [
                    'h2022_expired',
                    `H2022 expired (${rows.filter(
                      (r) =>
                        r.h2022Status === 'expired' &&
                        (!authorizedOnly || isAuthorizedCalaimStatus(r.calaimStatus))
                    ).length})`,
                  ],
                ] as Array<[FilterKey, string]>
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? 'default' : 'outline'}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={authorizedOnly ? 'secondary' : 'ghost'}
                onClick={() => setAuthorizedOnly((v) => !v)}
              >
                {authorizedOnly ? 'Authorized only' : 'Any status'}
              </Button>
              <Input
                className="ml-auto max-w-xs"
                placeholder="Search name, RCFE, MRN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {hasLoaded
              ? filter === 'placed_all'
                ? `Placed at RCFE (${visibleRows.length})`
                : filter === 't2038_valid'
                  ? `T2038 still valid (${visibleRows.length})`
                  : `Kaiser members (${visibleRows.length})`
              : 'Kaiser members'}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading Kaiser members from cache…
            </div>
          ) : !hasLoaded ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Press <strong>Load Kaiser list</strong> to run the report.
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No members match these filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>RCFE</TableHead>
                  <TableHead>T2038</TableHead>
                  <TableHead>H2022</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.id} className={cn(row.likelyReauthDone && 'bg-amber-50/40')}>
                    <TableCell className="align-top">
                      <div className="font-medium">{row.memberName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.mrn ? `MRN ${row.mrn}` : row.mediCal ? `CIN ${row.mediCal}` : row.clientId2}
                        {row.calaimStatus ? ` · ${row.calaimStatus}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="max-w-[220px] text-sm">{row.rcfeName}</div>
                      {row.county ? (
                        <div className="text-xs text-muted-foreground">{row.county}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={cn('mb-1', statusBadgeClass(row.t2038Status))}>
                        {STATUS_LABEL[row.t2038Status]}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {formatDateCell(row.t2038Start)} – {formatDateCell(row.t2038End)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant="outline" className={cn('mb-1', statusBadgeClass(row.h2022Status))}>
                        {STATUS_LABEL[row.h2022Status]}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {row.h2022Number ? `#${row.h2022Number} · ` : ''}
                        {formatDateCell(row.h2022Start)} – {formatDateCell(row.h2022End)}
                      </div>
                      {row.h2022NeedsAttention ? (
                        <div className="mt-1 text-xs font-medium text-rose-700">Needs attention</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      {row.doNotCharge ? (
                        <Badge variant="secondary">Do not charge</Badge>
                      ) : row.likelyReauthDone ? (
                        <Badge className="bg-amber-600 hover:bg-amber-600">Likely reauth — review pay</Badge>
                      ) : (
                        <Badge variant="outline">T2038 ended · no H2022 dates</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
