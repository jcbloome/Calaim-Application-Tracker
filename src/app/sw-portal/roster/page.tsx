'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/firebase';
import { Loader2, Printer, Search, Building2, MapPin, Users, Sparkles, RefreshCw, ClipboardCheck, FileBarChart, DollarSign } from 'lucide-react';

type RosterMember = {
  id: string;
  name: string;
  isNewAssignment?: boolean;
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
  const [statusMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);

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
      // best-effort only: roster should still be usable without statuses
      setMonthStatuses({});
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth?.currentUser, auth, statusMonth]);

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

  const formatAddressLine = useCallback((f: { address?: string; city?: string; zip?: string }) => {
    const addr = String(f?.address || '').trim();
    const city = String(f?.city || '').trim();
    const zip = String(f?.zip || '').trim();
    const tail = [city, zip].filter(Boolean).join(' ');
    return [addr, tail].filter(Boolean).join(', ');
  }, []);

  const claimDayDefault = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const renderVisitStatus = (s?: MonthVisitStatus) => {
    if (!s?.visitId) return <Badge variant="outline">Not completed</Badge>;
    if (s.claimPaid || String(s.claimStatus || '').toLowerCase() === 'paid') {
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>;
    }
    const status = String(s.claimStatus || '').trim().toLowerCase();
    if (s.claimSubmitted || ['submitted', 'approved', 'rejected'].includes(status)) {
      const label = status ? status[0].toUpperCase() + status.slice(1) : 'Submitted';
      return <Badge className="bg-blue-600 hover:bg-blue-600">{label}</Badge>;
    }
    if (s.signedOff) return <Badge className="bg-green-600 hover:bg-green-600">Signed off</Badge>;
    return <Badge className="bg-amber-500 hover:bg-amber-500">Needs sign-off</Badge>;
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
          <p className="text-muted-foreground">
            A compact list of your assigned RCFEs and members, with quick status + actions.
          </p>
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
                    <TableHead className="min-w-[140px]">Visit / claim status</TableHead>
                    <TableHead className="min-w-[180px]">Claim ID</TableHead>
                    <TableHead className="min-w-[240px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFacilities.map((f) => (
                    <>
                      <TableRow key={`rcfe-${f.id}`} className="bg-slate-50">
                        <TableCell colSpan={4}>
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
                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <Button asChild size="sm">
                                <Link href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id))}`}>
                                  <ClipboardCheck className="h-4 w-4 mr-2" />
                                  Questionnaire
                                </Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link
                                  href={`/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(f.id))}&claimDay=${encodeURIComponent(
                                    claimDayDefault
                                  )}`}
                                >
                                  <FileBarChart className="h-4 w-4 mr-2" />
                                  Sign off
                                </Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href="/sw-portal/submit-claims">
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Claims
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                      {(f.members || []).map((m) => {
                        const s = monthStatuses[String(m.id || '').trim()];
                        return (
                          <TableRow key={`${f.id}-${m.id}`}>
                            <TableCell className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="min-w-0 truncate font-medium">{m.name}</span>
                                {m.isNewAssignment ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    NEW
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{renderVisitStatus(s)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {s?.claimId ? <span className="font-mono text-xs break-all">{s.claimId}</span> : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/sw-visit-verification?rcfeId=${encodeURIComponent(String(f.id))}&memberId=${encodeURIComponent(
                                      String(m.id)
                                    )}`}
                                  >
                                    Open
                                  </Link>
                                </Button>
                                <Button asChild size="sm" variant="outline">
                                  <Link
                                    href={`/sw-portal/sign-off?rcfeId=${encodeURIComponent(String(f.id))}&claimDay=${encodeURIComponent(
                                      claimDayDefault
                                    )}`}
                                  >
                                    Sign off
                                  </Link>
                                </Button>
                              </div>
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

