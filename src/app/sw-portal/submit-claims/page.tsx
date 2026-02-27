'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useFirestore } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

type ClaimDoc = {
  id: string;
  socialWorkerEmail?: string;
  status?: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected' | string;
  totalAmount?: number;
  claimMonth?: string;
  claimDate?: any;
  submittedAt?: any;
  visitCount?: number;
  visitIds?: string[];
  memberVisits?: any[];
  signoffById?: Record<string, any>;
};

const VISIT_FEE_RATE = 45;
const DAILY_GAS_AMOUNT = 20;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const toDate = (value: any): Date | null => {
  try {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const money = (value: any) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '$0';
  // Most values are whole dollars in this workflow; keep it clean.
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
};

export default function SubmitClaimsPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user, isSocialWorker, canSubmitClaims, isLoading: swLoading } = useSocialWorker();

  const [month, setMonth] = useState<string>(() => monthKey(new Date()));
  const [isLoadingClaims, setIsLoadingClaims] = useState(false);
  const [claims, setClaims] = useState<ClaimDoc[]>([]);
  const [selectedDraftClaimIds, setSelectedDraftClaimIds] = useState<Record<string, boolean>>({});
  const [submittingDrafts, setSubmittingDrafts] = useState(false);

  const swEmail = String((user as any)?.email || '').trim();

  const fetchClaims = useCallback(async () => {
    if (!firestore || !swEmail) return;
    setIsLoadingClaims(true);
    try {
      // Avoid composite index requirements: filter by email only and sort client-side.
      const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', swEmail));
      const snap = await getDocs(q1);
      const next: ClaimDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

      const sortKey = (c: ClaimDoc) => {
        const s = toDate(c.submittedAt)?.getTime() || 0;
        const d = toDate(c.claimDate)?.getTime() || 0;
        return s || d || 0;
      };

      setClaims([...next].sort((a, b) => sortKey(b) - sortKey(a)));
    } catch (e: any) {
      toast({ title: 'Could not load claims', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoadingClaims(false);
    }
  }, [firestore, swEmail, toast]);

  useEffect(() => {
    if (!isSocialWorker || swLoading) return;
    void fetchClaims();
  }, [fetchClaims, isSocialWorker, swLoading]);

  const claimsForMonth = useMemo(() => {
    const inMonth = claims.filter((c) => {
      const cm = String(c.claimMonth || '').trim();
      if (cm) return cm === month;
      const d = toDate(c.claimDate);
      return d ? monthKey(d) === month : false;
    });
    const draft = inMonth.filter((c) => String(c.status || 'draft').toLowerCase() === 'draft');
    const submitted = inMonth.filter((c) => String(c.status || '').toLowerCase() !== 'draft');
    const sum = (arr: ClaimDoc[]) => arr.reduce((acc, c) => acc + Number(c.totalAmount || 0), 0);
    return { inMonth, draft, submitted, draftTotal: sum(draft), submittedTotal: sum(submitted) };
  }, [claims, month]);

  const draftRows = useMemo(() => {
    return claimsForMonth.draft
      .map((c) => {
        const visits = Array.isArray(c.memberVisits) ? c.memberVisits : [];
        const firstVisit = visits[0] || null;
        const visitDate = firstVisit ? toDate((firstVisit as any)?.visitDate) : null;

        const memberNames = Array.from(
          new Set(
            visits
              .map((v: any) => String(v?.memberName || '').trim())
              .filter(Boolean)
          )
        );
        const rcfeNames = Array.from(
          new Set(
            visits
              .map((v: any) => String(v?.rcfeName || '').trim())
              .filter(Boolean)
          )
        );
        const visitCount =
          Number(c.visitCount || 0) ||
          (Array.isArray(c.visitIds) ? c.visitIds.length : 0) ||
          visits.length;

        const visitIds = Array.isArray(c.visitIds) ? c.visitIds.map((v) => String(v || '').trim()).filter(Boolean) : [];
        const signoffs = c.signoffById && typeof c.signoffById === 'object' ? Object.values(c.signoffById) : [];
        const signedVisitIds = new Set<string>();
        const signerLabels: string[] = [];
        signoffs.forEach((s: any) => {
          const name = String(s?.signedByName || '').trim();
          const rcfe = String(s?.rcfeName || '').trim();
          if (name) signerLabels.push(rcfe ? `${name} (${rcfe})` : name);
          const vids = Array.isArray(s?.visitIds) ? s.visitIds : [];
          vids.forEach((id: any) => {
            const t = String(id || '').trim();
            if (t) signedVisitIds.add(t);
          });
        });
        const readyToSubmit = visitIds.length > 0 && visitIds.every((id) => signedVisitIds.has(id));
        const signedOffByLabel =
          signerLabels.length === 0 ? '—' : signerLabels.length === 1 ? signerLabels[0] : `${signerLabels[0]} (+${signerLabels.length - 1} more)`;

        return {
          id: String(c.id || ''),
          claimDate: toDate(c.claimDate),
          visitDate,
          memberLabel: memberNames.length === 0 ? '—' : memberNames.length === 1 ? memberNames[0] : `${memberNames[0]} (+${memberNames.length - 1} more)`,
          rcfeLabel: rcfeNames.length === 0 ? '—' : rcfeNames.length === 1 ? rcfeNames[0] : `${rcfeNames[0]} (+${rcfeNames.length - 1} more)`,
          visitCount,
          totalAmount: Number(c.totalAmount || 0),
          status: String(c.status || 'draft'),
          readyToSubmit,
          signedOffByLabel,
        };
      })
      .filter((r) => Boolean(r.id))
      .sort((a, b) => (b.claimDate?.getTime?.() || 0) - (a.claimDate?.getTime?.() || 0));
  }, [claimsForMonth.draft]);

  const selectedDraftIds = useMemo(() => Object.keys(selectedDraftClaimIds).filter((k) => selectedDraftClaimIds[k]), [selectedDraftClaimIds]);
  const allDraftSelected = useMemo(() => draftRows.length > 0 && selectedDraftIds.length === draftRows.length, [draftRows.length, selectedDraftIds.length]);

  const toggleAllDrafts = (next: boolean) => {
    if (!next) {
      setSelectedDraftClaimIds({});
      return;
    }
    const map: Record<string, boolean> = {};
    draftRows.forEach((c) => {
      if (c.readyToSubmit) map[c.id] = true;
    });
    setSelectedDraftClaimIds(map);
  };

  const submitSelectedDraftClaims = useCallback(async () => {
    if (!auth?.currentUser) {
      toast({ title: 'Please sign in again', description: 'No active session found.', variant: 'destructive' });
      return;
    }
    if (submittingDrafts) return;
    const ids = selectedDraftIds;
    if (ids.length === 0) {
      toast({ title: 'Nothing selected', description: 'Select at least one draft claim to submit.' });
      return;
    }

    setSubmittingDrafts(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      let okCount = 0;
      for (const claimId of ids) {
        const res = await fetch('/api/sw-claims/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, claimId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !(data as any)?.success) {
          throw new Error((data as any)?.error || `Failed to submit claim ${claimId}`);
        }
        okCount += 1;
      }
      toast({ title: 'Claims submitted', description: `Submitted ${okCount} claim(s).` });
      setSelectedDraftClaimIds({});
      await fetchClaims();
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e?.message || 'Could not submit selected claims.', variant: 'destructive' });
    } finally {
      setSubmittingDrafts(false);
    }
  }, [auth, fetchClaims, selectedDraftIds, submittingDrafts, toast]);

  if (swLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!isSocialWorker || !canSubmitClaims()) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Access Denied
            </CardTitle>
            <CardDescription>You are not authorized to submit claims. Please contact your administrator.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Submit Claims</h1>
          <p className="text-muted-foreground">
            Claims are created automatically from completed visit questionnaires. Select draft claims below to submit.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[180px]">
            <div className="text-xs text-muted-foreground mb-1">Month</div>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button asChild variant="outline">
            <Link href="/sw-portal/monthly-visits">View visits</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rate structure</CardTitle>
            <CardDescription>Reference</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">${VISIT_FEE_RATE} per member visit</div>
            <div className="text-sm font-semibold">${DAILY_GAS_AMOUNT} daily gas allowance</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Draft total (month)</CardTitle>
            <CardDescription>Not submitted yet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(claimsForMonth.draftTotal)}</div>
            <div className="text-xs text-muted-foreground">{draftRows.length} draft claim(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Submitted total (month)</CardTitle>
            <CardDescription>Submitted / approved / paid</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{money(claimsForMonth.submittedTotal)}</div>
            <div className="text-xs text-muted-foreground">{claimsForMonth.submitted.length} submitted claim(s)</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Draft claims (select to submit)
          </CardTitle>
          <CardDescription>
            These drafts were created from your completed visit questionnaires. You can submit once the RCFE staff/admin has signed off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingClaims ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading claims…
            </div>
          ) : draftRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No draft claims found for {month}.</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <div className="min-w-[980px]">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]">
                      <Checkbox checked={allDraftSelected} onCheckedChange={(v) => toggleAllDrafts(Boolean(v))} />
                    </TableHead>
                    <TableHead>Date visited</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Home (RCFE)</TableHead>
                    <TableHead>Signed off by</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftRows.map((r) => {
                    const checked = Boolean(selectedDraftClaimIds[r.id]);
                    const disabled = !r.readyToSubmit;
                    return (
                      <TableRow key={r.id} className={disabled ? 'opacity-60' : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            onCheckedChange={(v) => setSelectedDraftClaimIds((p) => ({ ...p, [r.id]: Boolean(v) }))}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.visitDate ? format(r.visitDate, 'MM/dd/yyyy') : r.claimDate ? format(r.claimDate, 'MM/dd/yyyy') : '—'}
                        </TableCell>
                        <TableCell className="font-medium">{r.memberLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.rcfeLabel}</TableCell>
                        <TableCell className="text-sm">
                          {r.signedOffByLabel}
                          {!r.readyToSubmit ? (
                            <div className="text-[11px] text-muted-foreground">Waiting for RCFE sign-off</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">{r.visitCount}</TableCell>
                        <TableCell className="font-semibold">{money(r.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={r.readyToSubmit ? 'secondary' : 'outline'}>{r.readyToSubmit ? 'ready' : 'pending sign-off'}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">Select one or more drafts, then click submit.</div>
            <Button onClick={() => void submitSelectedDraftClaims()} disabled={submittingDrafts || selectedDraftIds.length === 0}>
              {submittingDrafts ? 'Submitting…' : `Submit selected (${selectedDraftIds.length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submitted claims (this month)</CardTitle>
          <CardDescription>After you submit, the status will update here.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingClaims ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading claims…
            </div>
          ) : claimsForMonth.submitted.length === 0 ? (
            <div className="text-sm text-muted-foreground">No submitted claims found for {month}.</div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <div className="min-w-[560px]">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claimsForMonth.submitted.map((c) => {
                    const claimDate = toDate(c.claimDate);
                    const submittedAt = toDate(c.submittedAt);
                    const status = String(c.status || '').toLowerCase();
                    const badgeVariant =
                      status === 'paid'
                        ? 'default'
                        : status === 'approved'
                          ? 'secondary'
                          : status === 'rejected'
                            ? 'destructive'
                            : 'outline';
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">{claimDate ? format(claimDate, 'MMM d, yyyy') : '—'}</TableCell>
                        <TableCell className="font-semibold">{money(c.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant as any}>{String(c.status || 'submitted')}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{submittedAt ? format(submittedAt, 'MMM d, yyyy') : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
