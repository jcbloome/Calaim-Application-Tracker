'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VisitClaim {
  id: string;
  socialWorkerName: string;
  memberName: string;
  rcfeName: string;
  claimMonth?: string;
  claimSubmitted: boolean;
  claimPaid?: boolean;
  claimSubmittedAt?: string;
  claimPaidAt?: string;
}

const mockClaims: VisitClaim[] = [
  {
    id: 'claim-1',
    socialWorkerName: 'Billy Buckhalter',
    memberName: 'Mike Kirby',
    rcfeName: 'Highland Manor Assisted Living',
    claimMonth: '2025-01',
    claimSubmitted: true,
    claimPaid: true,
    claimSubmittedAt: '2025-01-23',
    claimPaidAt: '2025-02-05'
  },
  {
    id: 'claim-2',
    socialWorkerName: 'Billy Buckhalter',
    memberName: 'Robert Chen',
    rcfeName: 'Savant of Santa Monica',
    claimMonth: '2025-01',
    claimSubmitted: true,
    claimPaid: false,
    claimSubmittedAt: '2025-01-24'
  }
];

export default function SwClaimsTrackingPage(): React.JSX.Element {
  const [claimMonthFilter, setClaimMonthFilter] = useState('all');
  const [claimWorkerFilter, setClaimWorkerFilter] = useState('all');
  const [claimPaidFilter, setClaimPaidFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  const claimMonths = useMemo(
    () => Array.from(new Set(mockClaims.map((claim) => claim.claimMonth).filter(Boolean))) as string[],
    []
  );
  const claimWorkers = useMemo(
    () => Array.from(new Set(mockClaims.map((claim) => claim.socialWorkerName))),
    []
  );

  const filteredClaims = useMemo(() => {
    return mockClaims.filter((claim) => {
      if (!claim.claimSubmitted) return false;
      if (claimMonthFilter !== 'all' && claim.claimMonth !== claimMonthFilter) return false;
      if (claimWorkerFilter !== 'all' && claim.socialWorkerName !== claimWorkerFilter) return false;
      if (claimPaidFilter === 'paid' && !claim.claimPaid) return false;
      if (claimPaidFilter === 'unpaid' && claim.claimPaid) return false;
      return true;
    });
  }, [claimMonthFilter, claimWorkerFilter, claimPaidFilter]);

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Claim Month</th>
                  <th className="py-2">Social Worker</th>
                  <th className="py-2">Member</th>
                  <th className="py-2">Location</th>
                  <th className="py-2">Submitted</th>
                  <th className="py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted-foreground">
                      No claims found
                    </td>
                  </tr>
                ) : (
                  filteredClaims.map((claim) => (
                    <tr key={claim.id} className="border-b">
                      <td className="py-2">{claim.claimMonth || '—'}</td>
                      <td className="py-2">{claim.socialWorkerName}</td>
                      <td className="py-2">{claim.memberName}</td>
                      <td className="py-2">{claim.rcfeName}</td>
                      <td className="py-2">{claim.claimSubmittedAt || '—'}</td>
                      <td className="py-2">
                        {claim.claimPaid ? (
                          <Badge className="bg-green-600">Paid {claim.claimPaidAt || ''}</Badge>
                        ) : (
                          <Badge variant="outline">Unpaid</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
