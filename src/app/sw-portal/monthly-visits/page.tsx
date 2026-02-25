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
import { Checkbox } from '@/components/ui/checkbox';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { format } from 'date-fns';

type AssignedMember = {
  id: string;
  name: string;
  rcfeName: string;
  rcfeAddress: string;
};

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
  const [assignedMembers, setAssignedMembers] = useState<AssignedMember[]>([]);
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
  const [claims, setClaims] = useState<ClaimSubmission[]>([]);
  const [selectedDraftClaimIds, setSelectedDraftClaimIds] = useState<Record<string, boolean>>({});
  const [submittingDrafts, setSubmittingDrafts] = useState(false);

  const completedMemberKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) {
      const k = String(r.memberId || r.memberName || '').trim().toLowerCase();
      if (k) keys.add(k);
    }
    return keys;
  }, [rows]);

  const completedCount = completedMemberKeys.size;
  const pendingMembers = useMemo(
    () =>
      assignedMembers.filter((m) => {
        const k = String(m.id || m.name || '').trim().toLowerCase();
        return k ? !completedMemberKeys.has(k) : true;
      }),
    [assignedMembers, completedMemberKeys]
  );

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

  const draftClaimsForMonth = useMemo(() => {
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
    return claimsForMonth.draft
      .map((c: any) => {
        const claimDate = toDate(c?.claimDate);
        const visitCount = Number(c?.visitCount || (Array.isArray(c?.visitIds) ? c.visitIds.length : c?.memberVisits?.length || 0) || 0);
        const totalAmount = Number(c?.totalAmount || 0);
        return {
          id: String(c?.id || ''),
          claimDate,
          claimMonth: String(c?.claimMonth || ''),
          visitCount,
          totalAmount,
          memberVisits: Array.isArray(c?.memberVisits) ? c.memberVisits : [],
        };
      })
      .filter((c) => Boolean(c.id))
      .sort((a, b) => (b.claimDate?.getTime?.() || 0) - (a.claimDate?.getTime?.() || 0));
  }, [claimsForMonth.draft]);

  const selectedDraftIds = useMemo(() => Object.keys(selectedDraftClaimIds).filter((k) => selectedDraftClaimIds[k]), [selectedDraftClaimIds]);
  const allDraftSelected = useMemo(() => draftClaimsForMonth.length > 0 && selectedDraftIds.length === draftClaimsForMonth.length, [draftClaimsForMonth.length, selectedDraftIds.length]);

  const toggleAllDrafts = (next: boolean) => {
    if (!next) {
      setSelectedDraftClaimIds({});
      return;
    }
    const map: Record<string, boolean> = {};
    draftClaimsForMonth.forEach((c) => {
      map[c.id] = true;
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
  }, [auth?.currentUser, fetchClaims, selectedDraftIds, submittingDrafts, toast]);

  const remainingVisitFees = pendingMembers.length * VISIT_FEE_RATE;

  const fetchAssignedMembers = useCallback(async () => {
    const swId = user?.email || user?.displayName || user?.uid;
    const res = await fetch(`/api/sw-visits?socialWorkerId=${encodeURIComponent(String(swId || ''))}`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to load assignments');
    }
    const list: AssignedMember[] = [];
    (data?.rcfeList || []).forEach((rcfe: any) => {
      (rcfe?.members || []).forEach((m: any) => {
        list.push({
          id: String(m?.id || m?.name || '').trim(),
          name: String(m?.name || '').trim(),
          rcfeName: String(m?.rcfeName || rcfe?.name || '').trim(),
          rcfeAddress: String(m?.rcfeAddress || rcfe?.address || '').trim(),
        });
      });
    });
    setAssignedMembers(list);
  }, [user]);

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

  const fetchClaims = useCallback(async () => {
    if (!firestore || !user?.email) return;
    const q1 = query(collection(firestore, 'sw-claims'), where('socialWorkerEmail', '==', user.email), orderBy('submittedAt', 'desc'));
    const snap = await getDocs(q1);
    const next: ClaimSubmission[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setClaims(next);
  }, [firestore, user?.email]);

  const loadAll = useCallback(async () => {
    if (!isSocialWorker || swLoading) return;
    setIsLoading(true);
    try {
      await Promise.all([fetchAssignedMembers(), fetchMonthlyRows(), fetchClaims()]);
    } catch (e: any) {
      toast({
        title: 'Could not load monthly visits',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchAssignedMembers, fetchClaims, fetchMonthlyRows, isSocialWorker, swLoading, toast]);

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
          <p className="text-muted-foreground">View your visits by month and submit claims for completed visits.</p>
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
            <CardTitle className="text-sm">Pending members</CardTitle>
            <CardDescription>Assigned minus completed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingMembers.length}</div>
            <div className="text-xs text-muted-foreground">Remaining visit fees: ${remainingVisitFees}</div>
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
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]">Submit</TableHead>
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
                    const canSubmit = Boolean(claimId) && !isPaid && !isSubmitted && claimStatus === 'draft';
                    const checked = Boolean(claimId && selectedDraftClaimIds[claimId]);
                    const claimInfo = claimId ? claimsById.get(claimId) : null;
                    const claimMembers = claimInfo?.memberNames || [];
                    const claimMembersLabel =
                      claimMembers.length <= 1
                        ? ''
                        : `Includes: ${claimMembers.slice(0, 2).join(', ')}${claimMembers.length > 2 ? ` +${claimMembers.length - 2} more` : ''}`;

                    return (
                      <TableRow key={r.visitId || `${r.memberId}-${r.date}-${r.rcfeName}`}>
                        <TableCell>
                          <Checkbox
                            disabled={!canSubmit}
                            checked={checked}
                            onCheckedChange={(v) => {
                              if (!claimId) return;
                              setSelectedDraftClaimIds((prev) => ({ ...prev, [claimId]: Boolean(v) }));
                            }}
                            title={
                              !claimId
                                ? 'No linked claim found'
                                : isPaid
                                  ? 'Already paid'
                                  : isSubmitted
                                    ? 'Already submitted'
                                    : claimMembersLabel || 'Select to submit the linked daily claim'
                            }
                          />
                        </TableCell>
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit draft claims (select first)</CardTitle>
          <CardDescription>
            After visits are completed, daily draft claims are created automatically. Select the claim(s) you want to submit for this month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {draftClaimsForMonth.length === 0 ? (
            <div className="text-sm text-muted-foreground">No draft claims found for {month}.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox checked={allDraftSelected} onCheckedChange={(v) => toggleAllDrafts(Boolean(v))} />
                  <span>Select all drafts</span>
                </div>
                <Button onClick={() => void submitSelectedDraftClaims()} disabled={selectedDraftIds.length === 0 || submittingDrafts}>
                  {submittingDrafts ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Submit selected ({selectedDraftIds.length})
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[44px]"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Includes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftClaimsForMonth.map((c) => {
                      const dateLabel = c.claimDate ? format(c.claimDate, 'MMM d, yyyy') : c.claimMonth || month;
                      const includes = (Array.isArray(c.memberVisits) ? c.memberVisits : [])
                        .map((v: any) => String(v?.memberName || '').trim())
                        .filter(Boolean);
                      const includesLabel =
                        includes.length === 0 ? '—' : includes.length <= 2 ? includes.join(', ') : `${includes.slice(0, 2).join(', ')} +${includes.length - 2} more`;
                      const checked = Boolean(selectedDraftClaimIds[c.id]);
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setSelectedDraftClaimIds((prev) => ({ ...prev, [c.id]: Boolean(v) }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{dateLabel}</TableCell>
                          <TableCell className="text-right">{c.visitCount}</TableCell>
                          <TableCell className="text-right font-semibold">${Number(c.totalAmount || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground" title={includes.join('\n')}>
                            {includesLabel}
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

      <Card>
        <CardHeader>
          <CardTitle>Assigned members</CardTitle>
          <CardDescription>
            Completed members show a checkmark. Visits do not have to be exactly 1 month apart — but only one per member per month is allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>RCFE</TableHead>
                    <TableHead>Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedMembers.map((m) => {
                    const k = String(m.id || m.name || '').trim().toLowerCase();
                    const done = k ? completedMemberKeys.has(k) : false;
                    return (
                      <TableRow key={`${m.id}-${m.name}-${m.rcfeName}`}>
                        <TableCell className="whitespace-nowrap">
                          {done ? (
                            <Badge className="bg-green-600 hover:bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{m.name || '—'}</TableCell>
                        <TableCell>{m.rcfeName || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.rcfeAddress || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {assignedMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No assigned members found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

