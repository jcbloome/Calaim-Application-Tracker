'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, Search, Building2, MapPin, Users, Sparkles, RefreshCw, CheckCircle2, Circle } from 'lucide-react';
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
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
};

export default function SWRosterPage() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [facilities, setFacilities] = useState<RosterFacility[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [monthStatusesLoaded, setMonthStatusesLoaded] = useState(false);
  const [monthStatusesFailed, setMonthStatusesFailed] = useState(false);

  const refreshRoster = useCallback(async () => {
    if (!user?.email) return;
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
    } catch (e: any) {
      setError(e?.message || 'Failed to load roster.');
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  const statusMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const refreshMonthStatuses = useCallback(async () => {
    if (!auth?.currentUser) {
      setMonthStatuses({});
      setMonthStatusesLoaded(false);
      setMonthStatusesFailed(false);
      return;
    }
    setLoadingMonthStatuses(true);
    setMonthStatusesLoaded(false);
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
      const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
      const map: Record<string, MonthVisitStatus> = {};
      rows.forEach((r) => {
        const memberId = String(r?.memberId || '').trim();
        if (!memberId) return;
        map[memberId] = {
          visitId: String(r?.visitId || '').trim(),
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
    } catch {
      // best-effort: roster should still work without statuses
      setMonthStatuses({});
      setMonthStatusesLoaded(false);
      setMonthStatusesFailed(true);
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth, auth?.currentUser, statusMonth]);

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

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (hasLoadedOnce) return;
    if (loading) return;
    void refreshRoster();
  }, [hasLoadedOnce, isLoading, isSocialWorker, loading, refreshRoster]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (!hasLoadedOnce) return;
    void refreshMonthStatuses();
  }, [hasLoadedOnce, isLoading, isSocialWorker, refreshMonthStatuses]);

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

  const filteredFacilities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return facilities;

    return facilities
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
      .filter(Boolean) as RosterFacility[];
  }, [facilities, query]);

  const totals = useMemo(() => {
    const facilityCount = facilities.length;
    const memberCount = facilities.reduce((sum, f) => sum + (Array.isArray(f.members) ? f.members.length : 0), 0);
    return { facilityCount, memberCount };
  }, [facilities]);

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
            <span>• Status month: {statusMonth}</span>
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
            {loadingMonthStatuses ? 'Refreshing…' : 'Refresh statuses'}
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search</CardTitle>
          <CardDescription>Filter by home name, address, or member name.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to search…" />
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
            <div className="text-sm text-muted-foreground">
              Monthly status couldn’t be loaded right now. You can still use the roster below, or open the{' '}
              <Link className="underline underline-offset-2" href="/sw-visit-verification">
                Monthly Questionnaire
              </Link>{' '}
              page.
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
          {filteredFacilities.map((f) => (
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
        {filteredFacilities.length > 0 ? (
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
                  {filteredFacilities.map((f) => (
                    <React.Fragment key={`group-${f.id}`}>
                      <TableRow key={`rcfe-${f.id}`} className="bg-slate-50">
                        <TableCell colSpan={2}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold truncate max-w-full">{f.name}</div>
                                <Badge variant="secondary">{(f.members || []).length} member(s)</Badge>
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
                        const s = monthStatuses[String(m.id || '').trim()];
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
                                <span className="min-w-0 truncate font-medium">{m.name}</span>
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
                                {flags.nextAction === 'questionnaire' ? (
                                  <Button asChild size="sm" variant="outline" className="ml-2 shrink-0">
                                    <Link
                                      href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id || '').trim())}&memberId=${encodeURIComponent(String(m.id || '').trim())}`}
                                    >
                                      Questionnaire
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground min-w-0">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900">{f.name}</div>
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

