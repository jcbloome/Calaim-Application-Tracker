'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, Search, Building2, Users, RefreshCw, ClipboardCheck, CheckCircle2, Circle } from 'lucide-react';
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

export default function SWStatusLogPage() {
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [facilities, setFacilities] = useState<RosterFacility[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [statusMonth, setStatusMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});

  const [claimLookupId, setClaimLookupId] = useState('');
  const [claimLookupLoading, setClaimLookupLoading] = useState(false);
  const [claimLookupError, setClaimLookupError] = useState<string | null>(null);
  const [claimLookupResult, setClaimLookupResult] = useState<any | null>(null);

  const refreshRoster = useCallback(async () => {
    if (!user?.email) return;
    setLoadingRoster(true);
    setError(null);
    try {
      const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(user.email)}`);
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load roster (HTTP ${res.status})`);
      const nextFacilities = Array.isArray(data?.rcfeList) ? (data.rcfeList as RosterFacility[]) : [];
      setFacilities(nextFacilities);
      setHasLoadedOnce(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to load roster.');
      setHasLoadedOnce(true);
    } finally {
      setLoadingRoster(false);
    }
  }, [user?.email]);

  const refreshMonthStatuses = useCallback(async () => {
    if (!auth?.currentUser) {
      setMonthStatuses({});
      return;
    }
    setLoadingMonthStatuses(true);
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
    } catch {
      // best-effort only
      setMonthStatuses({});
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth?.currentUser, auth, statusMonth]);

  const lookupClaim = useCallback(async () => {
    if (!auth?.currentUser) return;
    const id = String(claimLookupId || '').trim();
    if (!id) return;
    setClaimLookupLoading(true);
    setClaimLookupError(null);
    setClaimLookupResult(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/sw-claims/lookup?claimId=${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Lookup failed (HTTP ${res.status})`);
      setClaimLookupResult(data?.claim || null);
    } catch (e: any) {
      setClaimLookupError(e?.message || 'Claim lookup failed.');
      setClaimLookupResult(null);
    } finally {
      setClaimLookupLoading(false);
    }
  }, [auth?.currentUser, auth, claimLookupId]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (!hasLoadedOnce) return;
    void refreshMonthStatuses();
  }, [hasLoadedOnce, isLoading, isSocialWorker, refreshMonthStatuses]);

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

  const renderStatusIcon = (params: { on: boolean; label: string }) => {
    const Icon = params.on ? CheckCircle2 : Circle;
    const color = params.on ? 'text-emerald-600' : 'text-slate-300';
    return (
      <span className="inline-flex items-center justify-center" title={params.label} aria-label={params.label}>
        <Icon className={`h-5 w-5 ${color}`} />
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading status log…</p>
        </div>
      </div>
    );
  }

  if (!isSocialWorker) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Status Log</CardTitle>
            <CardDescription>Sign in as a social worker to view status history.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Status Log</h1>
          <p className="text-muted-foreground">Month-based status icons for questionnaires, sign-offs, and claims.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <Building2 className="h-3.5 w-3.5" />
              {totals.facilityCount} RCFE{totals.facilityCount === 1 ? '' : 's'}
            </Badge>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              {totals.memberCount} member{totals.memberCount === 1 ? '' : 's'}
            </Badge>
            <span>• Month: {statusMonth}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Month</span>
            <Input
              className="w-[140px]"
              type="month"
              value={statusMonth}
              onChange={(e) => setStatusMonth(String(e.target.value || '').trim())}
              aria-label="Status month"
            />
          </div>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refreshRoster()} disabled={loadingRoster}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {loadingRoster ? 'Refreshing…' : 'Refresh roster'}
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
          <CardTitle className="text-base">Past claim status lookup</CardTitle>
          <CardDescription>Search any past claim by Claim ID to see its current status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={claimLookupId}
              onChange={(e) => setClaimLookupId(e.target.value)}
              placeholder="Enter Claim ID (e.g., swClaim_...)"
            />
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => void lookupClaim()}
              disabled={!claimLookupId.trim() || claimLookupLoading || !auth?.currentUser}
            >
              {claimLookupLoading ? 'Looking up…' : 'Lookup claim'}
            </Button>
          </div>
          {claimLookupError ? <div className="text-sm text-destructive">{claimLookupError}</div> : null}
          {claimLookupResult ? (
            <div className="rounded-md border bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Status:</span>
                <Badge variant="secondary">{String(claimLookupResult?.status || 'unknown')}</Badge>
                {claimLookupResult?.paymentStatus ? (
                  <Badge variant="secondary">Payment: {String(claimLookupResult?.paymentStatus)}</Badge>
                ) : null}
                {claimLookupResult?.reviewStatus ? (
                  <Badge variant="secondary">Review: {String(claimLookupResult?.reviewStatus)}</Badge>
                ) : null}
              </div>
              <div className="mt-2 grid gap-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-slate-900">Claim:</span>{' '}
                  <span className="font-mono break-all">{String(claimLookupResult?.claimId || '')}</span>
                </div>
                <div>
                  <span className="font-medium text-slate-900">Month:</span> {String(claimLookupResult?.claimMonth || '—')}
                  {claimLookupResult?.claimDay ? <span> • Day: {String(claimLookupResult?.claimDay)}</span> : null}
                </div>
                <div>
                  <span className="font-medium text-slate-900">RCFE:</span> {String(claimLookupResult?.rcfeName || '—')}
                </div>
                {claimLookupResult?.totalAmount != null ? (
                  <div>
                    <span className="font-medium text-slate-900">Total:</span> ${Number(claimLookupResult?.totalAmount || 0).toFixed(2)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Could not load status log</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="space-y-4">
        {!hasLoadedOnce && !loadingRoster ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Load your roster</CardTitle>
              <CardDescription>
                Tap <span className="font-semibold">Refresh roster</span> to load your assigned members.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {hasLoadedOnce && filteredFacilities.length === 0 && !loadingRoster && !error ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No assignments found</CardTitle>
              <CardDescription>If this seems wrong, your assignments may not be set yet or the cache hasn’t refreshed.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {filteredFacilities.length > 0 ? (
          <div className="rounded-lg border bg-white print:hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Member</TableHead>
                    <TableHead className="min-w-[92px] text-center">Questionnaire</TableHead>
                    <TableHead className="min-w-[92px] text-center">Signed off</TableHead>
                    <TableHead className="min-w-[110px] text-center">Claim submitted</TableHead>
                    <TableHead className="min-w-[80px] text-center">Paid</TableHead>
                    <TableHead className="min-w-[180px]">Claim ID</TableHead>
                    <TableHead className="min-w-[120px] text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacilities.map((f) => (
                    <>
                      <TableRow key={`rcfe-${f.id}`} className="bg-slate-50">
                        <TableCell colSpan={7}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{f.name}</div>
                              <div className="text-xs text-muted-foreground break-words">{String(f.address || '').trim() || '—'}</div>
                            </div>
                            <Badge variant="secondary">{(f.members || []).length} member(s)</Badge>
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
                                  <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-transparent" aria-hidden="true" />
                                )}
                                <span className="min-w-0 truncate font-medium">{m.name}</span>
                                {m.isNewAssignment ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    NEW
                                  </span>
                                ) : null}
                                {m.isHoldRemoved ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                    HOLD REMOVED
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {renderStatusIcon({ on: flags.completed, label: flags.completed ? 'Questionnaire completed' : 'Questionnaire not completed' })}
                            </TableCell>
                            <TableCell className="text-center">
                              {renderStatusIcon({
                                on: flags.completed && flags.signedOff,
                                label: flags.completed && flags.signedOff ? 'Signed off' : 'Not signed off',
                              })}
                            </TableCell>
                            <TableCell className="text-center">
                              {renderStatusIcon({
                                on: flags.completed && flags.claimSubmitted,
                                label: flags.completed && flags.claimSubmitted ? 'Claim submitted' : 'Claim not submitted',
                              })}
                            </TableCell>
                            <TableCell className="text-center">
                              {renderStatusIcon({ on: flags.completed && flags.claimPaid, label: flags.completed && flags.claimPaid ? 'Claim paid' : 'Not paid' })}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {flags.claimId ? <span className="font-mono text-xs break-all">{flags.claimId}</span> : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id))}&memberId=${encodeURIComponent(
                                    String(m.id)
                                  )}`}
                                >
                                  <ClipboardCheck className="h-4 w-4 mr-2" />
                                  Open
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
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

