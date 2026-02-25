'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Trash2 } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';

type VisitLine = {
  id: string;
  memberName: string;
  rcfeName: string;
  visitDate?: any;
};

interface ClaimRow {
  id: string;
  socialWorkerName: string;
  socialWorkerEmail?: string;
  claimMonth?: string;
  claimDate: Date;
  visitCount: number;
  totalAmount: number;
  status: string;
  submittedAt?: Date;
  paidAt?: Date;
  memberVisits?: VisitLine[];
}

export default function SwClaimsTrackingPage(): React.JSX.Element {
  const firestore = useFirestore();
  const { isSuperAdmin, user: adminUser } = useAdmin();
  const { toast } = useToast();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [swNameByEmail, setSwNameByEmail] = useState<Record<string, string>>({});

  const [claimMonthFilter, setClaimMonthFilter] = useState('all');
  const [claimWorkerFilter, setClaimWorkerFilter] = useState('all');
  const [claimPaidFilter, setClaimPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string>('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const q = query(collection(firestore, 'sw-claims'), orderBy('claimDate', 'desc'), limit(1000));
        const snap = await getDocs(q);
        const rows: ClaimRow[] = snap.docs.map((doc) => {
          const d: any = doc.data();
          const claimDate: Date = d?.claimDate?.toDate?.() || new Date();
          const submittedAt: Date | undefined = d?.submittedAt?.toDate?.();
          const paidAt: Date | undefined = d?.paidAt?.toDate?.() || d?.paidTimestamp?.toDate?.();
          const claimMonth: string = String(d?.claimMonth || format(claimDate, 'yyyy-MM'));
          const visitCount = Number(d?.visitCount || (Array.isArray(d?.visitIds) ? d.visitIds.length : d?.memberVisits?.length || 0) || 0);
          const totalAmount = Number(d?.totalAmount || 0);
          return {
            id: doc.id,
            socialWorkerName: String(d?.socialWorkerName || d?.socialWorkerEmail || 'Social Worker'),
            socialWorkerEmail: String(d?.socialWorkerEmail || '').trim().toLowerCase() || undefined,
            claimMonth,
            claimDate,
            visitCount,
            totalAmount,
            status: String(d?.status || 'draft'),
            submittedAt,
            paidAt,
            memberVisits: Array.isArray(d?.memberVisits) ? d.memberVisits : [],
          };
        });
        if (mounted) setClaims(rows);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load().catch((e) => {
      console.error('Error loading claims:', e);
      setClaims([]);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [firestore]);

  const claimMonths = useMemo(
    () => Array.from(new Set(claims.map((claim) => claim.claimMonth).filter(Boolean))) as string[],
    [claims]
  );
  const resolveSwLabel = (c: ClaimRow) => {
    const email = String(c.socialWorkerEmail || '').trim().toLowerCase();
    const raw = String(c.socialWorkerName || '').trim();
    const mapped = email ? String(swNameByEmail[email] || '').trim() : '';
    return mapped || raw || email || 'Social Worker';
  };

  const claimsWithLabels = useMemo(() => {
    return claims.map((c) => ({ ...c, socialWorkerName: resolveSwLabel(c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, swNameByEmail]);

  const claimWorkers = useMemo(() => Array.from(new Set(claimsWithLabels.map((claim) => claim.socialWorkerName))), [claimsWithLabels]);

  const filteredClaims = useMemo(() => {
    return claimsWithLabels.filter((claim) => {
      if (claimMonthFilter !== 'all' && claim.claimMonth !== claimMonthFilter) return false;
      if (claimWorkerFilter !== 'all' && claim.socialWorkerName !== claimWorkerFilter) return false;
      const isPaid = claim.status === 'paid';
      if (claimPaidFilter === 'paid' && !isPaid) return false;
      if (claimPaidFilter === 'unpaid' && isPaid) return false;
      return true;
    });
  }, [claimsWithLabels, claimMonthFilter, claimWorkerFilter, claimPaidFilter]);

  useEffect(() => {
    // Best-effort: resolve SW display names from the synced directory when claim docs only have emails.
    if (!firestore) return;
    const looksLikeEmail = (value: string) => value.includes('@') && value.includes('.');
    const emailsToResolve = Array.from(
      new Set(
        claims
          .map((c) => String(c.socialWorkerEmail || '').trim().toLowerCase())
          .filter(Boolean)
      )
    ).filter((email) => {
      const has = Boolean(swNameByEmail[email]);
      if (has) return false;
      const anyClaim = claims.find((c) => String(c.socialWorkerEmail || '').trim().toLowerCase() === email);
      const raw = anyClaim ? String(anyClaim.socialWorkerName || '').trim() : '';
      return looksLikeEmail(raw);
    });
    if (emailsToResolve.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const pairs = await Promise.all(
          emailsToResolve.slice(0, 80).map(async (email) => {
            try {
              const qy = query(collection(firestore, 'syncedSocialWorkers'), where('email', '==', email), limit(1));
              const snap = await getDocs(qy);
              if (snap.empty) return null;
              const name = String((snap.docs[0].data() as any)?.name || '').trim();
              return name ? ({ email, name } as const) : null;
            } catch {
              return null;
            }
          })
        );
        const next: Record<string, string> = {};
        pairs.filter(Boolean).forEach((p) => {
          next[(p as any).email] = (p as any).name;
        });
        if (!cancelled && Object.keys(next).length > 0) {
          setSwNameByEmail((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [claims, firestore, swNameByEmail]);

  const formatVisitDate = (value: any): string => {
    try {
      if (!value) return '';
      const d: Date =
        typeof value?.toDate === 'function'
          ? value.toDate()
          : typeof value === 'string'
            ? parseISO(value)
            : value instanceof Date
              ? value
              : new Date(value);
      if (!d || Number.isNaN(d.getTime())) return '';
      return format(d, 'MMM d, yyyy');
    } catch {
      return '';
    }
  };

  const openDelete = useCallback((claimId: string) => {
    setDeleteTargetId(String(claimId || '').trim());
    setDeleteReason('');
    setDeleteDialogOpen(true);
  }, []);

  const deleteClaim = useCallback(async () => {
    if (!isSuperAdmin) return;
    const claimId = String(deleteTargetId || '').trim();
    const reason = String(deleteReason || '').trim();
    if (!claimId) return;
    if (!reason) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Enter a reason for deleting this claim.' });
      return;
    }
    if (!adminUser) {
      toast({ variant: 'destructive', title: 'Not signed in', description: 'Please sign in again.' });
      return;
    }
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const idToken = await adminUser.getIdToken();
      const res = await fetch('/api/admin/sw-claims/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ claimIds: [claimId], reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to delete claim');
      }

      const deleted: string[] = Array.isArray((data as any)?.deleted) ? (data as any).deleted : [];
      if (deleted.includes(claimId)) {
        setClaims((prev) => prev.filter((c) => c.id !== claimId));
      }
      toast({ title: 'Claim deleted', description: 'The claim was deleted and logged for audit.' });
      setDeleteDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: e?.message || 'Could not delete claim.' });
    } finally {
      setIsDeleting(false);
    }
  }, [adminUser, deleteReason, deleteTargetId, isDeleting, isSuperAdmin, toast]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SW Claims Tracking</h1>
        <p className="text-muted-foreground mt-2">
          Track submitted claims by month and social worker.
        </p>
        {isSuperAdmin ? (
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/sw-claims-management">Open SW Claims Management (bulk delete)</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete claim</DialogTitle>
            <DialogDescription>
              This permanently deletes the claim and logs an audit record. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              Claim ID: <span className="font-mono text-xs">{deleteTargetId || '—'}</span>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Reason</div>
              <Textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Example: Duplicate for same member/month; keeping newest."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void deleteClaim()} disabled={isDeleting || !deleteTargetId}>
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter claims by month, staff, and payment status.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3">
            <Select value={claimMonthFilter} onValueChange={setClaimMonthFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Claim Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {claimMonths.map((month) => (
                  <SelectItem key={month} value={month}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={claimWorkerFilter} onValueChange={setClaimWorkerFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Social Worker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Social Workers</SelectItem>
                {claimWorkers.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={claimPaidFilter}
              onValueChange={(value) => setClaimPaidFilter(value as 'all' | 'paid' | 'unpaid')}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claims ({filteredClaims.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading claims...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Month</TableHead>
                  <TableHead>Claim Date</TableHead>
                  <TableHead>Social Worker</TableHead>
                  <TableHead>Member / RCFE / Visit date</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Paid</TableHead>
                  {isSuperAdmin ? <TableHead>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isSuperAdmin ? 10 : 9} className="py-6 text-center text-muted-foreground">
                      No claims found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClaims.map((claim) => {
                    const isPaid = claim.status === 'paid';
                    const visits = Array.isArray(claim.memberVisits) ? claim.memberVisits : [];
                    const lines = visits
                      .map((v) => {
                        const dateLabel = formatVisitDate((v as any)?.visitDate) || String((v as any)?.visitDate || '').slice(0, 10);
                        const memberName = String((v as any)?.memberName || '').trim();
                        const rcfeName = String((v as any)?.rcfeName || '').trim();
                        return `${dateLabel || '—'} • ${memberName || '—'} • ${rcfeName || '—'}`.trim();
                      })
                      .filter(Boolean);
                    return (
                      <TableRow key={claim.id}>
                        <TableCell>{claim.claimMonth || '—'}</TableCell>
                        <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                        <TableCell>{claim.socialWorkerName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lines.length === 0 ? (
                            <span>—</span>
                          ) : (
                            <div className="space-y-1" title={lines.join('\n')}>
                              {lines.slice(0, 3).map((line, idx) => (
                                <div key={`${claim.id}-v-${idx}`} className="whitespace-nowrap">
                                  {line}
                                </div>
                              ))}
                              {lines.length > 3 ? <div className="whitespace-nowrap">+{lines.length - 3} more…</div> : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{claim.visitCount}</TableCell>
                        <TableCell className="text-right font-semibold">${claim.totalAmount}</TableCell>
                        <TableCell>
                          <Badge variant={isPaid ? 'default' : 'secondary'}>{claim.status}</Badge>
                        </TableCell>
                        <TableCell>{claim.submittedAt ? format(claim.submittedAt, 'MMM d, yyyy') : '—'}</TableCell>
                        <TableCell>
                          {isPaid ? (
                            <Badge className="bg-green-600">{claim.paidAt ? `Paid ${format(claim.paidAt, 'MMM d')}` : 'Paid'}</Badge>
                          ) : (
                            <Badge variant="outline">Unpaid</Badge>
                          )}
                        </TableCell>
                        {isSuperAdmin ? (
                          <TableCell>
                            <Button variant="destructive" size="sm" onClick={() => openDelete(claim.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
