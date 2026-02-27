'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAuth, useFirestore } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, Download, Printer, CheckCircle, AlertTriangle } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { format } from 'date-fns';

type MonthlyRow = {
  date: string;
  memberId: string;
  memberName: string;
  rcfeName: string;
  rcfeAddress: string;
  visitId: string;
  flagged: boolean;
  signedOff: boolean;
  claimId?: string;
  claimStatus?: string;
  claimSubmitted?: boolean;
  claimPaid?: boolean;
  dailyVisitCount: number;
  dailyVisitFees: number;
  dailyGas: number;
  dailyTotal: number;
};

type DuplicateInfo = { key: string; count: number; visitIds: string[]; memberName: string };

type ClaimSubmission = {
  id: string;
  claimMonth?: string;
  socialWorkerEmail: string;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected';
  totalAmount?: number;
  submittedAt?: any;
  claimDate?: any;
};

const VISIT_FEE_RATE = 45;
const DAILY_GAS_AMOUNT = 20;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function SWMonthlyVisitsPage() {
  const { user, isSocialWorker, isLoading: swLoading } = useSocialWorker();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [month, setMonth] = useState<string>(() => monthKey(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [claims, setClaims] = useState<ClaimSubmission[]>([]);

  const completedMemberKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      const k = String(r.memberId || r.memberName || '').trim().toLowerCase();
      if (k) keys.add(k);
    }
    return keys;
  }, [rows]);

  const completedCount = completedMemberKeys.size;

  const completedDays = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const day = String(r.date || '').slice(0, 10);
      if (day) s.add(day);
    });
    return s;
  }, [rows]);

  const claimsById = useMemo(() => {
    const m = new Map<string, { count: number; memberNames: string[] }>();
    rows.forEach((r) => {
      const claimId = String((r as any)?.claimId || '').trim();
      if (!claimId) return;
      const cur = m.get(claimId) || { count: 0, memberNames: [] };
      cur.count += 1;
      const mn = String(r.memberName || '').trim();
      if (mn) cur.memberNames.push(mn);
      m.set(claimId, cur);
    });
    return m;
  }, [rows]);

  const invoiceTotals = useMemo(() => {
    const visitFees = completedCount * VISIT_FEE_RATE;
    const gasDays = completedDays.size;
    const gasTotal = gasDays * DAILY_GAS_AMOUNT;
    const total = visitFees + gasTotal;
    return { visitFees, gasDays, gasTotal, total };
  }, [completedCount, completedDays.size]);

  const claimsForMonth = useMemo(() => {
    const inMonth = claims.filter((c) => {
      const cm = String(c.claimMonth || '').trim();
      if (cm) return cm === month;
      const d = c.claimDate?.toDate ? c.claimDate.toDate() : c.claimDate ? new Date(c.claimDate) : null;
      return d ? monthKey(d) === month : false;
    });
    const submitted = inMonth.filter((c) => c.status !== 'draft');
    const draft = inMonth.filter((c) => c.status === 'draft');
    const sum = (arr: ClaimSubmission[]) => arr.reduce((acc, c) => acc + Number(c.totalAmount || 0), 0);
    return { inMonth, submitted, draft, submittedTotal: sum(submitted), draftTotal: sum(draft) };
  }, [claims, month]);

  const fetchClaims = useCallback(async () => {
    if (!firestore || !user?.email) return;
    const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', user.email));
    const snap = await getDocs(q1);
    const next: ClaimSubmission[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    // Avoid requiring a composite Firestore index by sorting client-side.
    const sortKey = (c: any) => {
      const s = c?.submittedAt?.toDate ? c.submittedAt.toDate().getTime() : (c?.submittedAt instanceof Date ? c.submittedAt.getTime() : 0);
      const d = c?.claimDate?.toDate ? c.claimDate.toDate().getTime() : (c?.claimDate instanceof Date ? c.claimDate.getTime() : 0);
      return s || d || 0;
    };
    setClaims([...next].sort((a, b) => sortKey(b) - sortKey(a)));
  }, [firestore, user?.email]);

  const fetchMonthlyRows = useCallback(async () => {
    if (!auth?.currentUser) return;
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch('/api/sw-visits/monthly-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ month, dedupeByMemberMonth: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to load monthly visits');
    }
    setRows(Array.isArray(data?.rows) ? data.rows : []);
    setDuplicates(Array.isArray(data?.duplicates) ? data.duplicates : []);
  }, [auth?.currentUser, month]);

  const loadAll = useCallback(async () => {
    if (!isSocialWorker || swLoading) return;
    setIsLoading(true);
    try {
      await Promise.all([fetchMonthlyRows(), fetchClaims()]);
    } catch (e: any) {
      toast({
        title: 'Could not load monthly visits',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchClaims, fetchMonthlyRows, isSocialWorker, swLoading, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const downloadCsv = useCallback(async () => {
    try {
      const header = [
        'Date',
        'Member',
        'RCFE',
        'RCFE Address',
        'Visit ID',
        'Flagged',
        'Signed Off',
        'Daily Visit Count',
        'Daily Visit Fees',
        'Daily Gas',
        'Daily Total',
      ];
      const escape = (value: any) => {
        const raw = String(value ?? '');
        if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) return `"${raw.replace(/"/g, '""')}"`;
        return raw;
      };
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.date,
            r.memberName,
            r.rcfeName,
            r.rcfeAddress,
            r.visitId,
            r.flagged ? 'Yes' : 'No',
            r.signedOff ? 'Yes' : 'No',
            r.dailyVisitCount,
            r.dailyVisitFees,
            r.dailyGas,
            r.dailyTotal,
          ]
            .map(escape)
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sw-monthly-visits-${month}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not download CSV.', variant: 'destructive' });
    }
  }, [month, rows, toast]);

  if (swLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visits</h1>
          <p className="text-muted-foreground">View your visits by month.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[180px]">
            <div className="text-xs text-muted-foreground mb-1">Month</div>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            PDF / Print
          </Button>
          <Button onClick={() => void downloadCsv()} disabled={rows.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Excel (CSV)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Completed members</CardTitle>
            <CardDescription>{month}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
            <div className="text-xs text-muted-foreground">1 visit per member per month</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Invoice total (from visits)</CardTitle>
            <CardDescription>${VISIT_FEE_RATE}/member + ${DAILY_GAS_AMOUNT}/visit-day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${invoiceTotals.total}</div>
            <div className="text-xs text-muted-foreground">
              Fees: ${invoiceTotals.visitFees} • Gas days: {invoiceTotals.gasDays} (${invoiceTotals.gasTotal})
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Claims submitted</CardTitle>
            <CardDescription>From Submit Claims</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${claimsForMonth.submittedTotal.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">
              Drafts: ${claimsForMonth.draftTotal.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completed visits (this month)</CardTitle>
          <CardDescription>
            One visit per member per month is allowed. Each row shows the member visit, RCFE, and the linked daily claim status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No completed visits found for {month}.</div>
          ) : (
          <div className="rounded-lg border overflow-x-auto">
            <div className="min-w-[920px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>RCFE</TableHead>
                    <TableHead>Claim</TableHead>
                    <TableHead>Signed off</TableHead>
                    <TableHead>Flagged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const claimId = String((r as any)?.claimId || '').trim();
                    const claimStatus = String((r as any)?.claimStatus || 'draft').trim().toLowerCase();
                    const isPaid = Boolean((r as any)?.claimPaid) || claimStatus === 'paid';
                    const isSubmitted = Boolean((r as any)?.claimSubmitted) || claimStatus === 'submitted' || claimStatus === 'approved';
                    const claimInfo = claimId ? claimsById.get(claimId) : null;
                    const claimMembers = claimInfo?.memberNames || [];
                    const claimMembersLabel =
                      claimMembers.length <= 1
                        ? ''
                        : `Includes: ${claimMembers.slice(0, 2).join(', ')}${claimMembers.length > 2 ? ` +${claimMembers.length - 2} more` : ''}`;

                    return (
                      <TableRow key={r.visitId || `${r.memberId}-${r.date}-${r.rcfeName}`}>
                        <TableCell className="whitespace-nowrap">{r.date || '—'}</TableCell>
                        <TableCell className="font-medium">{r.memberName || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.rcfeName || '—'}</TableCell>
                        <TableCell>
                          {isPaid ? (
                            <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>
                          ) : isSubmitted ? (
                            <Badge className="bg-blue-600 hover:bg-blue-600">Submitted</Badge>
                          ) : (
                            <Badge variant="secondary">Draft</Badge>
                          )}
                          {claimMembersLabel ? (
                            <div className="text-xs text-muted-foreground mt-1" title={claimMembers.join('\n')}>
                              {claimMembersLabel}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {r.signedOff ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Yes</Badge> : <Badge variant="outline">No</Badge>}
                        </TableCell>
                        <TableCell>
                          {r.flagged ? <Badge className="bg-amber-500 hover:bg-amber-500">Flagged</Badge> : <Badge variant="outline">No</Badge>}
                        </TableCell>
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

      {duplicates.length > 0 ? (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Duplicate visits detected
            </CardTitle>
            <CardDescription>
              This month contains multiple visit records for the same member. New submissions are now blocked at 1/member/month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {duplicates.slice(0, 6).map((d) => (
                <li key={d.key} className="flex items-center justify-between rounded-md border bg-amber-50 px-3 py-2">
                  <div className="text-sm font-medium">{d.memberName || d.key}</div>
                  <Badge variant="secondary">{d.count} records</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}

