'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFirestore } from '@/firebase';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { format } from 'date-fns';

interface ClaimRow {
  id: string;
  socialWorkerName: string;
  claimMonth?: string;
  claimDate: Date;
  visitCount: number;
  totalAmount: number;
  status: string;
  submittedAt?: Date;
  paidAt?: Date;
}

export default function SwClaimsTrackingPage(): React.JSX.Element {
  const firestore = useFirestore();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [claimMonthFilter, setClaimMonthFilter] = useState('all');
  const [claimWorkerFilter, setClaimWorkerFilter] = useState('all');
  const [claimPaidFilter, setClaimPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

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
            claimMonth,
            claimDate,
            visitCount,
            totalAmount,
            status: String(d?.status || 'draft'),
            submittedAt,
            paidAt,
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
  const claimWorkers = useMemo(
    () => Array.from(new Set(claims.map((claim) => claim.socialWorkerName))),
    [claims]
  );

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      if (claimMonthFilter !== 'all' && claim.claimMonth !== claimMonthFilter) return false;
      if (claimWorkerFilter !== 'all' && claim.socialWorkerName !== claimWorkerFilter) return false;
      const isPaid = claim.status === 'paid';
      if (claimPaidFilter === 'paid' && !isPaid) return false;
      if (claimPaidFilter === 'unpaid' && isPaid) return false;
      return true;
    });
  }, [claims, claimMonthFilter, claimWorkerFilter, claimPaidFilter]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">SW Claims Tracking</h1>
        <p className="text-muted-foreground mt-2">
          Track submitted claims by month and social worker.
        </p>
      </div>

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
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                      No claims found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClaims.map((claim) => {
                    const isPaid = claim.status === 'paid';
                    return (
                      <TableRow key={claim.id}>
                        <TableCell>{claim.claimMonth || '—'}</TableCell>
                        <TableCell>{format(claim.claimDate, 'MMM d, yyyy')}</TableCell>
                        <TableCell>{claim.socialWorkerName}</TableCell>
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
