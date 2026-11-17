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
import type { KaiserT2038ClaimAuditRow } from '@/lib/kaiser-t2038-claim-audit';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

type CoverageFilter = 'all' | 'incomplete' | 'complete';
type AuthFilter = 'all' | 'open' | 'ended' | 'missing_dates';

type Summary = {
  total: number;
  openAuth: number;
  authEnded: number;
  missingDates: number;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('incomplete');
  const [authFilter, setAuthFilter] = useState<AuthFilter>('all');
  const [expandedId, setExpandedId] = useState('');
  const [draftReasons, setDraftReasons] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState('');

  const load = useCallback(
    async (refresh = false) => {
      const user = auth.currentUser;
      if (!user) {
        setError('Sign in required.');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/admin/kaiser-t2038-claim-audit${refresh ? '?refresh=true' : ''}`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
          }
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.success) {
          throw new Error(String(body?.error || `HTTP ${response.status}`));
        }
        setRows(Array.isArray(body.rows) ? body.rows : []);
        setSummary(body.summary || null);
        setFetchedAt(String(body.fetchedAt || ''));
      } catch (err: unknown) {
        setError(String((err as { message?: string })?.message || 'Could not load claim audit.'));
      } finally {
        setIsLoading(false);
      }
    },
    [auth]
  );

  useEffect(() => {
    if (!isAdminLoading && isAdmin) void load(false);
  }, [isAdmin, isAdminLoading, load]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (coverageFilter === 'incomplete' && row.openMissingMonthCount <= 0) return false;
      if (coverageFilter === 'complete' && !row.claimsComplete) return false;
      if (authFilter === 'open' && !(row.window === 'in_window' || row.window === 'ending_soon')) return false;
      if (authFilter === 'ended' && !row.authEnded) return false;
      if (authFilter === 'missing_dates' && row.window !== 'missing_dates') return false;
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
  }, [rows, query, coverageFilter, authFilter]);

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
      await load(false);
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
            Authorized Kaiser members (including ended authorizations) compared month-by-month against{' '}
            <code className="text-xs">CalAIM_Claim_Submit_T2038</code> (<code className="text-xs">Client_ID2</code>,{' '}
            <code className="text-xs">Client_First</code>, <code className="text-xs">Client_Last</code>,{' '}
            <code className="text-xs">Date_of_Service</code>). Flag missing months, justify gaps after Caspio review, and
            focus the list on members still needing claims.
          </p>
          {fetchedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last pull: {new Date(fetchedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => void load(true)} disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh from Caspio
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load audit</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
            {summary?.openMissingMonths ?? 0} open missing month{summary?.openMissingMonths === 1 ? '' : 's'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claims complete</CardDescription>
            <CardTitle>{summary?.complete ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Every expected month claimed or justified
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing auth dates</CardDescription>
            <CardTitle>{summary?.missingDates ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">No T2038 start/end in Caspio</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Default shows members with open missing claim months — including ended authorizations.
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
              <option value="incomplete">Missing claims (open gaps)</option>
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
          <div className="text-sm text-muted-foreground pb-2">
            Showing {filteredRows.length} of {rows.length}
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
                      {row.openMissingMonthCount > 0 ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-950 border-amber-300">
                          {row.openMissingMonthCount} missing month{row.openMissingMonthCount === 1 ? '' : 's'}
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
                      Expected {row.expectedMonthCount} mo · Claimed {row.claimedMonthCount} · Justified{' '}
                      {row.justifiedMonthCount} · Open gaps {row.openMissingMonthCount}
                    </div>
                  </div>
                </button>

                {expanded ? (
                  <div className="space-y-4 border-t bg-slate-50/60 px-3 py-3">
                    <div>
                      <div className="mb-2 text-sm font-medium">Month coverage (auth start → end or today)</div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {row.months.length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            No expected months — add T2038 authorization dates in Caspio.
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
