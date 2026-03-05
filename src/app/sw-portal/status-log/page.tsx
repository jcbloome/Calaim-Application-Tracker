'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/firebase';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Printer, CheckCircle2, Circle, Star } from 'lucide-react';

type MonthVisitStatus = {
  visitId: string;
  signedOff: boolean;
  claimStatus: string;
  claimSubmitted: boolean;
  claimPaid: boolean;
  claimId?: string;
  claimNumber?: string;
  claimDay?: string;
  serviceLineId?: string;
};

type MonthExportRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitId: string;
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

export default function SWStatusLogPage() {
  const { isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();

  const [loadingMonthStatuses, setLoadingMonthStatuses] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [statusMonth, setStatusMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [monthStatuses, setMonthStatuses] = useState<Record<string, MonthVisitStatus>>({});
  const [monthRows, setMonthRows] = useState<MonthExportRow[]>([]);

  const [showAll, setShowAll] = useState(false);

  const [clientLookupQuery, setClientLookupQuery] = useState('');
  const [clientLookupLoading, setClientLookupLoading] = useState(false);
  const [clientLookupError, setClientLookupError] = useState<string | null>(null);
  const [clientLookupResults, setClientLookupResults] = useState<any[]>([]);

  const [monthSummaryOpen, setMonthSummaryOpen] = useState(false);
  const [monthSummaryLoading, setMonthSummaryLoading] = useState(false);
  const [monthSummaryError, setMonthSummaryError] = useState<string | null>(null);
  const [monthSummary, setMonthSummary] = useState<any | null>(null);

  const [claimDetailOpen, setClaimDetailOpen] = useState(false);
  const [claimDetailLoading, setClaimDetailLoading] = useState(false);
  const [claimDetailError, setClaimDetailError] = useState<string | null>(null);
  const [claimDetailResult, setClaimDetailResult] = useState<any | null>(null);

  const [visitDetailOpen, setVisitDetailOpen] = useState(false);
  const [visitDetailLoading, setVisitDetailLoading] = useState(false);
  const [visitDetailError, setVisitDetailError] = useState<string | null>(null);
  const [visitDetailResult, setVisitDetailResult] = useState<any | null>(null);

  const refreshMonthStatuses = useCallback(async () => {
    if (!auth?.currentUser) {
      setMonthStatuses({});
      setMonthRows([]);
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
      const rows: MonthExportRow[] = Array.isArray(data?.rows) ? (data.rows as MonthExportRow[]) : [];
      setMonthRows(rows);
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
          claimNumber: String(r?.claimNumber || '').trim() || undefined,
          claimDay: String(r?.date || '').trim() || undefined,
          serviceLineId: String(r?.serviceLineId || '').trim() || undefined,
        };
      });
      setMonthStatuses(map);
      setHasLoadedOnce(true);
    } catch {
      // best-effort only
      setMonthStatuses({});
      setMonthRows([]);
      setHasLoadedOnce(true);
    } finally {
      setLoadingMonthStatuses(false);
    }
  }, [auth?.currentUser, auth, statusMonth]);

  const searchClaimsByClient = useCallback(async () => {
    if (!auth?.currentUser) return;
    const q = String(clientLookupQuery || '').trim();
    if (!q) return;
    setClientLookupLoading(true);
    setClientLookupError(null);
    setClientLookupResults([]);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/sw-claims/search?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Search failed (HTTP ${res.status})`);
      setClientLookupResults(Array.isArray(data?.results) ? data.results : []);
    } catch (e: any) {
      setClientLookupError(e?.message || 'Search failed.');
      setClientLookupResults([]);
    } finally {
      setClientLookupLoading(false);
    }
  }, [auth, clientLookupQuery]);

  const openClaimDetail = useCallback(
    async (params: { id: string }) => {
      if (!auth?.currentUser) return;
      const id = String(params.id || '').trim();
      if (!id) return;
      setClaimDetailOpen(true);
      setClaimDetailLoading(true);
      setClaimDetailError(null);
      setClaimDetailResult(null);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`/api/sw-claims/lookup?claimId=${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) throw new Error(data?.error || `Lookup failed (HTTP ${res.status})`);
        setClaimDetailResult(data?.claim || null);
      } catch (e: any) {
        setClaimDetailError(e?.message || 'Claim lookup failed.');
        setClaimDetailResult(null);
      } finally {
        setClaimDetailLoading(false);
      }
    },
    [auth]
  );

  const openMonthSummary = useCallback(async () => {
    if (!auth?.currentUser) return;
    setMonthSummaryOpen(true);
    setMonthSummaryLoading(true);
    setMonthSummaryError(null);
    setMonthSummary(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/sw-claims/month-summary?month=${encodeURIComponent(statusMonth)}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load summary (HTTP ${res.status})`);
      setMonthSummary(data);
    } catch (e: any) {
      setMonthSummaryError(e?.message || 'Failed to load month summary.');
      setMonthSummary(null);
    } finally {
      setMonthSummaryLoading(false);
    }
  }, [auth, statusMonth]);

  const openVisitDetail = useCallback(
    async (params: { visitId: string }) => {
      if (!auth?.currentUser) return;
      const visitId = String(params.visitId || '').trim();
      if (!visitId) return;
      setVisitDetailOpen(true);
      setVisitDetailLoading(true);
      setVisitDetailError(null);
      setVisitDetailResult(null);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch(`/api/sw-visits/visit?visitId=${encodeURIComponent(visitId)}`, {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load visit (HTTP ${res.status})`);
        setVisitDetailResult(data?.visit || null);
      } catch (e: any) {
        setVisitDetailError(e?.message || 'Failed to load visit.');
        setVisitDetailResult(null);
      } finally {
        setVisitDetailLoading(false);
      }
    },
    [auth]
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refreshMonthStatuses();
  }, [isLoading, isSocialWorker, refreshMonthStatuses]);

  const monthOptions = useMemo(() => {
    // SW claims tracking begins Feb 2026 (testing); don't show earlier months.
    const start = new Date(2026, 1, 1); // Feb 2026 (local)
    const now = new Date();
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const opts: Array<{ value: string; label: string }> = [];
    if (nowKey < startKey) return opts;

    const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    for (let i = 0; i <= monthsDiff; i += 1) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = dt.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (!hasLoadedOnce) return;
    // Auto-refresh statuses periodically so claim status changes show up.
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      if (document.visibilityState !== 'visible') return;
      await refreshMonthStatuses();
    };
    const onFocus = () => void run();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(() => void run(), 90_000);
    return () => {
      stopped = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [hasLoadedOnce, isLoading, isSocialWorker, refreshMonthStatuses]);

  const activityRows = useMemo(() => {
    const rows = Array.isArray(monthRows) ? monthRows : [];
    const list = rows
      .map((r) => {
        const day = String((r as any)?.date || '').trim();
        const memberName = String((r as any)?.memberName || '').trim();
        const memberId = String((r as any)?.memberId || '').trim();
        const visitId = String((r as any)?.visitId || '').trim();
        const completed = Boolean(visitId);
        const signedOff = Boolean((r as any)?.signedOff);
        const claimId = String((r as any)?.claimId || '').trim();
        const claimNumber = String((r as any)?.claimNumber || '').trim();
        const serviceLineId = String((r as any)?.serviceLineId || '').trim();
        const claimStatus = String((r as any)?.claimStatus || '').trim() || 'draft';
        const claimSubmitted = Boolean((r as any)?.claimSubmitted) || ['submitted', 'approved', 'rejected', 'paid'].includes(claimStatus.toLowerCase());
        const claimPaid = Boolean((r as any)?.claimPaid) || claimStatus.toLowerCase() === 'paid';
        const idForOpen = claimId || claimNumber || serviceLineId || '';
        return { day, memberName, memberId, visitId, completed, signedOff, claimSubmitted, claimPaid, claimStatus, idForOpen };
      })
      .filter((r) => Boolean(r.memberName || r.memberId || r.day));

    list.sort((a, b) => (b.day || '').localeCompare(a.day || '') || (a.memberName || '').localeCompare(b.memberName || ''));
    return list;
  }, [monthRows]);

  const activityTotals = useMemo(() => {
    const count = activityRows.length;
    const completedCount = activityRows.filter((r) => r.completed).length;
    const signedOffCount = activityRows.filter((r) => r.completed && r.signedOff).length;
    const submittedCount = activityRows.filter((r) => r.completed && r.claimSubmitted).length;
    const paidCount = activityRows.filter((r) => r.completed && r.claimPaid).length;
    return { count, completedCount, signedOffCount, submittedCount, paidCount };
  }, [activityRows]);

  const visibleActivityRows = useMemo(() => {
    return showAll ? activityRows : activityRows.slice(0, 10);
  }, [activityRows, showAll]);

  const money = useCallback((value: any) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '$0';
    return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
  }, []);

  const claimDisplayNumber = useCallback((params: { day?: string; memberName?: string; memberId?: string }) => {
    const rawDay = String(params.day || '').trim();
    const m = rawDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const y = m ? Number(m[1]) : NaN;
    const mo = m ? Number(m[2]) : NaN;
    const d = m ? Number(m[3]) : NaN;
    const monthNum = m && Number.isFinite(mo) ? String(mo).padStart(2, '0') : '00';
    const dayNum = m && Number.isFinite(d) ? String(d) : (rawDay ? rawDay.replace(/-/g, '_') : '0');
    const year = m && Number.isFinite(y) ? String(y) : '0000';

    const safe = (s: string) =>
      String(s || '')
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    const memberId = safe(String(params.memberId || '').trim() || '');

    // Numeric-only style: 1_03_2026_7891
    const base = [safe(dayNum), safe(monthNum), safe(year)].filter(Boolean).join('_');
    return memberId ? `${base}_${memberId}` : base;
  }, []);

  const renderStatusIcon = (params: { on: boolean; label: string }) => {
    const Icon = params.on ? CheckCircle2 : Circle;
    const color = params.on ? 'text-emerald-600' : 'text-slate-300';
    return (
      <span className="inline-flex items-center justify-center" title={params.label} aria-label={params.label}>
        <Icon className={`h-5 w-5 ${color}`} />
      </span>
    );
  };

  const renderStars = (params: { value: number; label: string }) => {
    const value = Number.isFinite(Number(params.value)) ? Number(params.value) : 0;
    const safeValue = Math.max(0, Math.min(5, Math.floor(value)));
    const ratingLabel =
      safeValue === 0
        ? 'Not rated'
        : safeValue === 1
          ? 'Poor'
          : safeValue === 2
            ? 'Fair'
            : safeValue === 3
              ? 'Good'
              : safeValue === 4
                ? 'Very Good'
                : 'Excellent';

    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">{params.label}</div>
        <div className="flex items-center gap-1" aria-label={`${params.label}: ${ratingLabel}`}>
          {[1, 2, 3, 4, 5].map((star) => {
            const on = star <= safeValue;
            return (
              <Star key={star} className={`h-5 w-5 ${on ? 'text-yellow-400 fill-current' : 'text-slate-200'}`} />
            );
          })}
          <span className="ml-2 text-xs text-muted-foreground">{ratingLabel}</span>
        </div>
      </div>
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
          <p className="text-muted-foreground">Monthly claim status and totals. Auto-updates while open.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Month: {statusMonth}</span>
            {loadingMonthStatuses ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Month</span>
            <Select value={statusMonth} onValueChange={(v) => setStatusMonth(String(v || '').trim())}>
              <SelectTrigger className="w-[170px]" aria-label="Status month">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Past claim status lookup (by client name)</CardTitle>
          <CardDescription>
            Type a client name to find their most recent submitted claims, then open to see full status details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={clientLookupQuery}
              onChange={(e) => setClientLookupQuery(e.target.value)}
              placeholder="Search by client name (e.g., Kendrick)"
            />
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => void searchClaimsByClient()}
              disabled={!clientLookupQuery.trim() || clientLookupLoading || !auth?.currentUser}
            >
              {clientLookupLoading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {clientLookupError ? <div className="text-sm text-destructive">{clientLookupError}</div> : null}

          {clientLookupResults.length > 0 ? (
            <div className="rounded-md border bg-white">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">Client</TableHead>
                      <TableHead className="min-w-[120px]">Month</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px] text-right">Total</TableHead>
                      <TableHead className="min-w-[160px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientLookupResults.map((r, idx) => {
                      const matched = Array.isArray(r?.matchedMemberNames) ? r.matchedMemberNames : [];
                      const memberNames = Array.isArray(r?.memberNames) ? r.memberNames : [];
                      const label = matched[0] || memberNames[0] || '—';
                      const more = matched.length > 1 ? ` (+${matched.length - 1})` : '';
                      return (
                        <TableRow key={String(r?.claimId || idx)}>
                          <TableCell className="min-w-0">
                            <div className="truncate font-medium">{label}{more}</div>
                            <div className="font-mono text-[10px] text-muted-foreground break-all">{String(r?.claimNumber || r?.claimId || '')}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{String(r?.claimMonth || '—')}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{String(r?.status || 'unknown')}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{r?.totalAmount != null ? money(r.totalAmount) : '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => void openClaimDetail({ id: String(r?.claimId || '').trim() })}>
                              Open claim
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Most recent claims</CardTitle>
          <CardDescription>
            Showing the 10 most recent items for {statusMonth}. Use “Show all” to view the full month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{activityTotals.count} total</Badge>
            <Badge variant="secondary">{activityTotals.completedCount} Q complete</Badge>
            <Badge variant="secondary">{activityTotals.signedOffCount} signed off</Badge>
            <Badge variant="secondary">{activityTotals.submittedCount} claim submitted</Badge>
            <Badge variant="secondary">{activityTotals.paidCount} paid</Badge>
            <Button size="sm" variant="outline" onClick={() => void openMonthSummary()} disabled={monthSummaryLoading || !auth?.currentUser}>
              {monthSummaryLoading ? 'Loading summary…' : 'Monthly claim summary'}
            </Button>
            {activityRows.length > 10 ? (
              <Button size="sm" variant="outline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show top 10' : `Show all (${activityRows.length})`}
              </Button>
            ) : null}
          </div>

          {visibleActivityRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items found for this month yet.</div>
          ) : (
            <div className="rounded-md border bg-white">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[110px]">Day</TableHead>
                      <TableHead className="min-w-[220px]">Client</TableHead>
                      <TableHead
                        className="min-w-[72px] text-center"
                        title="Questionnaire complete"
                        aria-label="Questionnaire complete"
                      >
                        Q
                      </TableHead>
                      <TableHead className="min-w-[72px] text-center" title="Sign-off complete" aria-label="Sign-off complete">
                        S
                      </TableHead>
                      <TableHead className="min-w-[150px]">Claim status</TableHead>
                      <TableHead className="min-w-[72px] text-center">Paid</TableHead>
                      <TableHead className="min-w-[220px]">Claim #</TableHead>
                      <TableHead className="min-w-[220px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleActivityRows.map((r, idx) => (
                      <TableRow key={`${r.day}-${r.memberId}-${idx}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.day || '—'}</TableCell>
                        <TableCell className="min-w-0">
                          <div className="truncate font-medium">{r.memberName || '—'}</div>
                          {r.memberId ? <div className="font-mono text-[10px] text-muted-foreground break-all">{r.memberId}</div> : null}
                        </TableCell>
                        <TableCell className="text-center">
                          {renderStatusIcon({ on: r.completed, label: r.completed ? 'Questionnaire completed' : 'Questionnaire not completed' })}
                        </TableCell>
                        <TableCell className="text-center">
                          {renderStatusIcon({ on: r.completed && r.signedOff, label: r.signedOff ? 'Signed off' : 'Not signed off' })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{String(r.claimStatus || 'draft')}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {renderStatusIcon({ on: r.completed && r.claimPaid, label: r.claimPaid ? 'Paid' : 'Not paid' })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono break-all">{claimDisplayNumber({ day: r.day, memberName: r.memberName, memberId: r.memberId })}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {r.idForOpen ? (
                              <Button size="sm" variant="outline" onClick={() => void openClaimDetail({ id: r.idForOpen })}>
                                Open claim
                              </Button>
                            ) : null}
                            {r.visitId ? (
                              <Button size="sm" variant="outline" onClick={() => void openVisitDetail({ visitId: r.visitId })}>
                                View questionnaire
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={claimDetailOpen} onOpenChange={setClaimDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Claim details</DialogTitle>
            <DialogDescription>Read-only status details for bookkeeping and follow-up.</DialogDescription>
          </DialogHeader>
          {claimDetailLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : claimDetailError ? (
            <div className="text-sm text-destructive">{claimDetailError}</div>
          ) : claimDetailResult ? (
            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-semibold">Claim #:</span>{' '}
                <span className="font-mono break-all">{String(claimDetailResult?.claimNumber || '—')}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono break-all">{String(claimDetailResult?.claimId || '')}</div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary">Status: {String(claimDetailResult?.status || 'unknown')}</Badge>
                {claimDetailResult?.reviewStatus ? (
                  <Badge variant="secondary">Review: {String(claimDetailResult?.reviewStatus)}</Badge>
                ) : null}
                {claimDetailResult?.paymentStatus ? (
                  <Badge variant="secondary">Payment: {String(claimDetailResult?.paymentStatus)}</Badge>
                ) : null}
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-slate-900">Month:</span> {String(claimDetailResult?.claimMonth || '—')}
                {claimDetailResult?.claimDay ? <span> • Day: {String(claimDetailResult?.claimDay)}</span> : null}
              </div>
              <div className="text-muted-foreground">
                <span className="font-medium text-slate-900">RCFE:</span> {String(claimDetailResult?.rcfeName || '—')}
              </div>
              {claimDetailResult?.totalAmount != null ? (
                <div className="text-muted-foreground">
                  <span className="font-medium text-slate-900">Total:</span> ${Number(claimDetailResult?.totalAmount || 0).toFixed(2)}
                </div>
              ) : null}
              {claimDetailResult?.visitCount != null ? (
                <div className="text-muted-foreground">
                  <span className="font-medium text-slate-900">Visits:</span> {Number(claimDetailResult?.visitCount || 0)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No claim loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={monthSummaryOpen} onOpenChange={setMonthSummaryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Monthly claim summary</DialogTitle>
            <DialogDescription>Totals for {statusMonth}.</DialogDescription>
          </DialogHeader>
          {monthSummaryLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : monthSummaryError ? (
            <div className="text-sm text-destructive">{monthSummaryError}</div>
          ) : monthSummary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 text-sm">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Claims</div>
                  <div className="text-xl font-bold">{Number(monthSummary?.totals?.claimCount || 0)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Submitted</div>
                  <div className="text-xl font-bold">{Number(monthSummary?.totals?.submittedCount || 0)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="text-xl font-bold">{Number(monthSummary?.totals?.paidCount || 0)}</div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">Total amount</div>
                  <div className="text-xl font-bold">{money(monthSummary?.totals?.totalAmount || 0)}</div>
                </div>
              </div>

              {Array.isArray(monthSummary?.claims) && monthSummary.claims.length > 0 ? (
                <div className="rounded-md border bg-white">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]">Day</TableHead>
                          <TableHead className="min-w-[160px]">Status</TableHead>
                          <TableHead className="min-w-[160px]">RCFE</TableHead>
                          <TableHead className="min-w-[120px] text-right">Total</TableHead>
                          <TableHead className="min-w-[160px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthSummary.claims.slice(0, 50).map((c: any, idx: number) => (
                          <TableRow key={String(c?.claimId || idx)}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{String(c?.claimDay || '—')}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{String(c?.status || 'unknown')}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{String(c?.rcfeName || '—')}</TableCell>
                            <TableCell className="text-right">{c?.totalAmount != null ? money(c.totalAmount) : '—'}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => void openClaimDetail({ id: String(c?.claimId || '').trim() })}>
                                Open claim
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No claims found for this month.</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No summary loaded.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={visitDetailOpen} onOpenChange={setVisitDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Questionnaire (view only)</DialogTitle>
            <DialogDescription>This is the submitted visit record. Editing is disabled.</DialogDescription>
          </DialogHeader>
          {visitDetailLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : visitDetailError ? (
            <div className="text-sm text-destructive">{visitDetailError}</div>
          ) : visitDetailResult ? (
            <div className="space-y-4">
              {(() => {
                const raw = (visitDetailResult as any)?.raw || visitDetailResult || {};
                const q = raw as any;

                const yesNo = (value: any) =>
                  value === true ? 'Yes' : value === false ? 'No' : '—';

                const listSelected = (obj: any) => {
                  const entries = obj && typeof obj === 'object' ? Object.entries(obj as Record<string, any>) : [];
                  const selected = entries.filter(([, v]) => Boolean(v)).map(([k]) => k);
                  return selected.length ? selected.join(', ') : '—';
                };

                const section = (title: string, content: React.ReactNode) => (
                  <div className="rounded border p-3">
                    <div className="font-semibold">{title}</div>
                    <div className="mt-2 space-y-2 text-sm">{content}</div>
                  </div>
                );

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                      <div className="rounded border p-3">
                        <div className="text-xs text-muted-foreground">Member</div>
                        <div className="font-semibold break-words">{String((visitDetailResult as any)?.memberName || q?.memberName || '—')}</div>
                      </div>
                      <div className="rounded border p-3">
                        <div className="text-xs text-muted-foreground">RCFE</div>
                        <div className="font-semibold break-words">{String((visitDetailResult as any)?.rcfeName || q?.rcfeName || '—')}</div>
                        <div className="text-xs text-muted-foreground break-words">{String((visitDetailResult as any)?.rcfeAddress || q?.rcfeAddress || '').trim()}</div>
                      </div>
                      <div className="rounded border p-3">
                        <div className="text-xs text-muted-foreground">Visit date</div>
                        <div className="font-semibold">{String((visitDetailResult as any)?.visitDate || q?.visitDate || '').slice(0, 10) || '—'}</div>
                      </div>
                      <div className="rounded border p-3">
                        <div className="text-xs text-muted-foreground">Status</div>
                        <div className="font-semibold">{String((visitDetailResult as any)?.status || '—')}</div>
                        <div className="text-xs text-muted-foreground">
                          Signed off: {yesNo(Boolean((visitDetailResult as any)?.signedOff ?? q?.signedOff))}
                        </div>
                      </div>
                    </div>

                    {section(
                      'Meeting location',
                      <>
                        <div>
                          <div className="text-xs text-muted-foreground">Location</div>
                          <div className="font-medium">
                            {String(q?.meetingLocation?.location || '—')}
                            {String(q?.meetingLocation?.otherLocation || '').trim()
                              ? ` — ${String(q.meetingLocation.otherLocation).trim()}`
                              : ''}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="whitespace-pre-wrap break-words">{String(q?.meetingLocation?.notes || '—')}</div>
                        </div>
                      </>
                    )}

                    {section(
                      'Member wellbeing',
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {renderStars({ value: Number(q?.memberWellbeing?.physicalHealth || 0), label: 'Physical health' })}
                          {renderStars({ value: Number(q?.memberWellbeing?.mentalHealth || 0), label: 'Mental health' })}
                          {renderStars({ value: Number(q?.memberWellbeing?.socialEngagement || 0), label: 'Social engagement' })}
                          {renderStars({ value: Number(q?.memberWellbeing?.overallMood || 0), label: 'Overall mood' })}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="whitespace-pre-wrap break-words">{String(q?.memberWellbeing?.notes || '—')}</div>
                        </div>
                      </>
                    )}

                    {section(
                      'Care satisfaction',
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {renderStars({ value: Number(q?.careSatisfaction?.staffAttentiveness || 0), label: 'Staff attentiveness' })}
                          {renderStars({ value: Number(q?.careSatisfaction?.mealQuality || 0), label: 'Meal quality' })}
                          {renderStars({ value: Number(q?.careSatisfaction?.cleanlinessOfRoom || 0), label: 'Room cleanliness' })}
                          {renderStars({ value: Number(q?.careSatisfaction?.activitiesPrograms || 0), label: 'Activities/programs' })}
                          {renderStars({ value: Number(q?.careSatisfaction?.overallSatisfaction || 0), label: 'Overall satisfaction' })}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="whitespace-pre-wrap break-words">{String(q?.careSatisfaction?.notes || '—')}</div>
                        </div>
                      </>
                    )}

                    {section(
                      'Member concerns',
                      <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Any concerns?</div>
                            <div className="font-medium">{yesNo(q?.memberConcerns?.hasConcerns)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Action required</div>
                            <div className="font-medium">{yesNo(Boolean(q?.memberConcerns?.actionRequired))}</div>
                          </div>
                        </div>
                        {q?.memberConcerns?.nonResponsive ? (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                            <div className="text-sm font-medium">Member non-responsive</div>
                            <div className="text-xs text-amber-900/80">
                              {String(q?.memberConcerns?.nonResponsiveReason || '—')}
                            </div>
                            <div className="mt-2 text-sm whitespace-pre-wrap break-words">
                              {String(q?.memberConcerns?.nonResponsiveDetails || '—')}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <div className="text-xs text-muted-foreground">Concern types</div>
                          <div className="font-medium">{listSelected(q?.memberConcerns?.concernTypes)}</div>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Urgency</div>
                            <div className="font-medium">{String(q?.memberConcerns?.urgencyLevel || '—')}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Details</div>
                          <div className="whitespace-pre-wrap break-words">{String(q?.memberConcerns?.detailedConcerns || '—')}</div>
                        </div>
                      </>
                    )}

                    {section(
                      'RCFE assessment',
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {renderStars({ value: Number(q?.rcfeAssessment?.facilityCondition || 0), label: 'Facility condition' })}
                          {renderStars({ value: Number(q?.rcfeAssessment?.staffProfessionalism || 0), label: 'Staff professionalism' })}
                          {renderStars({ value: Number(q?.rcfeAssessment?.safetyCompliance || 0), label: 'Safety compliance' })}
                          {renderStars({ value: Number(q?.rcfeAssessment?.careQuality || 0), label: 'Care quality' })}
                          {renderStars({ value: Number(q?.rcfeAssessment?.overallRating || 0), label: 'Overall rating' })}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Flag for review</div>
                            <div className="font-medium">{yesNo(Boolean(q?.rcfeAssessment?.flagForReview))}</div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Notes</div>
                          <div className="whitespace-pre-wrap break-words">{String(q?.rcfeAssessment?.notes || '—')}</div>
                        </div>
                      </>
                    )}

                    {section(
                      'Visit summary',
                      <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-xs text-muted-foreground">Total score</div>
                            <div className="font-medium">{String(q?.visitSummary?.totalScore ?? (visitDetailResult as any)?.totalScore ?? '—')}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Flagged</div>
                            <div className="font-medium">{yesNo(Boolean(q?.visitSummary?.flagged ?? (visitDetailResult as any)?.flagged))}</div>
                          </div>
                        </div>
                      </>
                    )}

                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No visit loaded.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

