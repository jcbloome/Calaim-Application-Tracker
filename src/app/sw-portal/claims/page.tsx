'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react';

type ClaimRow = {
  claimId: string;
  claimNumber?: string;
  status: string;
  reviewStatus?: string;
  paymentStatus?: string;
  claimDay?: string;
  claimMonth?: string;
  rcfeName?: string;
  totalAmount?: number;
  visitCount?: number;
  memberName?: string;
  submittedAtMs?: number;
  updatedAtMs?: number;
};

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isPaid = (c: ClaimRow) => {
  const st = normalize(c.status);
  const pay = normalize(c.paymentStatus);
  return st === 'paid' || pay === 'paid';
};

const money = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
};

export default function SWClaimsPage() {
  const { isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();

  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimRow[]>([]);

  const [claimDetailOpen, setClaimDetailOpen] = useState(false);
  const [claimDetailLoading, setClaimDetailLoading] = useState(false);
  const [claimDetailError, setClaimDetailError] = useState<string | null>(null);
  const [claimDetailResult, setClaimDetailResult] = useState<any | null>(null);

  const monthOptions = useMemo(() => {
    const start = new Date(2026, 1, 1); // Feb 2026
    const now = new Date();
    const opts: Array<{ value: string; label: string }> = [{ value: 'all', label: 'All months' }];

    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor >= start) {
      const value = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
      opts.push({ value, label });
      cursor.setMonth(cursor.getMonth() - 1);
    }

    return opts;
  }, []);

  const refresh = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const qs = new URLSearchParams();
      if (month && month !== 'all') qs.set('month', month);
      if (includeDrafts) qs.set('includeDrafts', '1');
      qs.set('limit', '1000');
      const res = await fetch(`/api/sw-claims/list?${qs.toString()}`, {
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load claims (HTTP ${res.status})`);
      setClaims(Array.isArray(data?.claims) ? (data.claims as ClaimRow[]) : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load claims.');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [auth, includeDrafts, month]);

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

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    void refresh();
  }, [isLoading, isSocialWorker, refresh]);

  const filteredClaims = useMemo(() => {
    const q = normalize(query);
    if (!q) return claims;
    return claims.filter((c) => {
      const hay = normalize([c.memberName, c.rcfeName, c.claimNumber, c.claimId, c.status, c.reviewStatus, c.paymentStatus].filter(Boolean).join(' '));
      return hay.includes(q);
    });
  }, [claims, query]);

  const totals = useMemo(() => {
    const total = filteredClaims.length;
    const paid = filteredClaims.filter(isPaid).length;
    const submitted = filteredClaims.filter((c) => normalize(c.status) !== 'draft').length;
    const amount = filteredClaims.reduce((acc, c) => (Number.isFinite(Number(c.totalAmount)) ? acc + Number(c.totalAmount) : acc), 0);
    return { total, submitted, paid, amount };
  }, [filteredClaims]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claims</h1>
          <p className="text-sm text-muted-foreground">All claims and statuses for your assigned visits.</p>
        </div>
        <Button onClick={refresh} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Filter by month, drafts, or search by client/RCFE/claim info.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">Month</div>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
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

          <div className="space-y-2">
            <div className="text-sm font-medium">Search</div>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Client, RCFE, claim #, status…" />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Include drafts</div>
            <div className="flex items-center gap-3">
              <Switch checked={includeDrafts} onCheckedChange={(v) => setIncludeDrafts(Boolean(v))} />
              <div className="text-sm text-muted-foreground">{includeDrafts ? 'Showing drafts' : 'Hiding drafts'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Couldn’t load claims</CardTitle>
            <CardDescription className="text-destructive/80">{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <CardTitle className="text-base">Claim status list</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Total: {totals.total}</Badge>
              <Badge variant="secondary">Submitted: {totals.submitted}</Badge>
              <Badge variant="secondary">Paid: {totals.paid}</Badge>
              <Badge variant="secondary">Amount: {money(totals.amount) || '$0.00'}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Day</TableHead>
                  <TableHead className="whitespace-nowrap">Client</TableHead>
                  <TableHead className="whitespace-nowrap">RCFE</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Paid</TableHead>
                  <TableHead className="whitespace-nowrap">Claim #</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClaims.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-sm text-muted-foreground">
                      {loading ? 'Loading…' : 'No claims found for the selected filters.'}
                    </TableCell>
                  </TableRow>
                )}

                {filteredClaims.map((c) => (
                  <TableRow key={c.claimId}>
                    <TableCell className="whitespace-nowrap">{c.claimDay || c.claimMonth || '—'}</TableCell>
                    <TableCell className="min-w-[160px]">{c.memberName || '—'}</TableCell>
                    <TableCell className="min-w-[180px]">{c.rcfeName || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={normalize(c.status) === 'draft' ? 'secondary' : 'default'}>{c.status || 'unknown'}</Badge>
                      {c.reviewStatus ? <div className="text-xs text-muted-foreground mt-1">Review: {c.reviewStatus}</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={isPaid(c) ? 'default' : 'secondary'}>{isPaid(c) ? 'Paid' : '—'}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{c.claimNumber || c.claimId}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{money(c.totalAmount) || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openClaimDetail({ id: c.claimId })}>
                          Open
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="gap-1">
                          <Link href={`/sw-portal/status-log`} prefetch={false}>
                            Status log <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={claimDetailOpen} onOpenChange={setClaimDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Claim detail</DialogTitle>
            <DialogDescription>View-only summary (opens from Firestore claim record).</DialogDescription>
          </DialogHeader>

          {claimDetailLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : claimDetailError ? (
            <div className="text-sm text-destructive">{claimDetailError}</div>
          ) : claimDetailResult ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>Status: {String(claimDetailResult?.status || 'unknown')}</Badge>
                {claimDetailResult?.paymentStatus ? <Badge variant="secondary">Payment: {claimDetailResult.paymentStatus}</Badge> : null}
                {claimDetailResult?.reviewStatus ? <Badge variant="secondary">Review: {claimDetailResult.reviewStatus}</Badge> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Claim #</div>
                  <div className="font-mono text-xs">{String(claimDetailResult?.claimNumber || claimDetailResult?.claimId || '')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Date</div>
                  <div>{String(claimDetailResult?.claimDay || claimDetailResult?.claimMonth || '—')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">RCFE</div>
                  <div>{String(claimDetailResult?.rcfeName || '—')}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div>{money(claimDetailResult?.totalAmount) || '—'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No claim loaded.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

