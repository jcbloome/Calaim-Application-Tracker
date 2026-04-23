'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Loader2, TrendingDown, TrendingUp, Minus, Calendar } from 'lucide-react';

type WeeklyCounts = {
  totalInQueues: number;
  t2038AuthOnly: number;
  t2038Requested: number;
  t2038ReceivedUnreachable: number;
  tierRequested: number;
  tierAppeals: number;
  rbPendingIlsContract: number;
  h2022AuthDatesWith: number;
  h2022AuthDatesWithout: number;
  finalAtRcfeWithDates: number;
  finalAtRcfeWithoutDates: number;
  h2022EndingWithin1Month: number;
};

type Snapshot = {
  id: string;
  weekStartYmd: string;
  weekLabel?: string;
  capturedAtIso?: string;
  capturedByEmail?: string;
  counts: WeeklyCounts;
};

const DELTA_ICON = (delta: number) => {
  if (delta < 0) return <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />;
  if (delta > 0) return <TrendingUp className="h-3.5 w-3.5 text-red-600" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
};

export default function IlsLogTrackerPage() {
  const auth = useAuth();
  const { isLoading: isAdminLoading } = useAdmin();
  const [accessLoading, setAccessLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  const loadSnapshots = async () => {
    if (!auth?.currentUser) return;
    setIsLoading(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-weekly-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'list', limit: 26 }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to load (HTTP ${res.status})`);
      setSnapshots(Array.isArray(data.snapshots) ? (data.snapshots as Snapshot[]) : []);
    } finally {
      setIsLoading(false);
    }
  };

  const captureSnapshot = async () => {
    if (!auth?.currentUser) return;
    setIsCapturing(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/ils-weekly-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'capture', limit: 26 }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) throw new Error(data?.error || `Failed to capture (HTTP ${res.status})`);
      setSnapshots(Array.isArray(data.snapshots) ? (data.snapshots as Snapshot[]) : []);
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    const checkAccess = async () => {
      if (!auth?.currentUser) {
        setCanAccess(false);
        setAccessLoading(false);
        return;
      }
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/admin/ils-member-access', {
          headers: { authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({} as any));
        setCanAccess(Boolean(res.ok && data?.success && data?.canAccessIlsMembersPage));
      } finally {
        setAccessLoading(false);
      }
    };
    if (!isAdminLoading) checkAccess().catch(() => setAccessLoading(false));
  }, [auth?.currentUser, isAdminLoading]);

  useEffect(() => {
    if (!accessLoading && canAccess) {
      loadSnapshots().catch(() => {});
    }
  }, [accessLoading, canAccess]);

  const rowsWithDelta = useMemo(() => {
    return snapshots.map((row, index) => {
      const prev = snapshots[index + 1];
      const prevTotal = Number(prev?.counts?.totalInQueues || 0);
      const currTotal = Number(row?.counts?.totalInQueues || 0);
      return {
        ...row,
        totalDelta: currTotal - prevTotal,
      };
    });
  }, [snapshots]);

  if (isAdminLoading || accessLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need ILS tools access to view weekly tracker trends.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ILS Log Tracker</h1>
          <p className="text-muted-foreground">Weekly category counts to monitor whether queues are decreasing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadSnapshots()} disabled={isLoading || isCapturing}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={() => captureSnapshot()} disabled={isLoading || isCapturing}>
            {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Capture This Week
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Trend Table</CardTitle>
          <CardDescription>
            Easier weekly view: focus on core risk buckets first, then open details as needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rowsWithDelta.length === 0 ? (
            <div className="text-sm text-muted-foreground">No snapshots yet. Click "Capture This Week" to start tracking.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Delta logic: negative is good (queue reduced), positive means queue grew.
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left">
                      <th className="py-2 px-3">Week</th>
                      <th className="py-2 px-3">Total in Queues</th>
                      <th className="py-2 px-3">Week-over-Week Delta</th>
                      <th className="py-2 px-3">T2038 Requested</th>
                      <th className="py-2 px-3">Tier Level Requested</th>
                      <th className="py-2 px-3">Tier Level Appeal</th>
                      <th className="py-2 px-3">H2022 Without Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsWithDelta.map((row, idx) => (
                      <tr key={row.id} className={`border-t align-top ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                        <td className="py-2 px-3">
                          <div className="font-medium">{row.weekLabel || row.weekStartYmd}</div>
                          <div className="text-xs text-muted-foreground">{row.capturedAtIso ? new Date(row.capturedAtIso).toLocaleString() : '-'}</div>
                          <div className="text-xs text-muted-foreground">{row.capturedByEmail || '-'}</div>
                        </td>
                        <td className="py-2 px-3 font-semibold">{row.counts.totalInQueues}</td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="gap-1">
                            {DELTA_ICON(row.totalDelta)}
                            {row.totalDelta > 0 ? `+${row.totalDelta}` : row.totalDelta}
                          </Badge>
                        </td>
                        <td className="py-2 px-3">{row.counts.t2038Requested}</td>
                        <td className="py-2 px-3">{row.counts.tierRequested}</td>
                        <td className="py-2 px-3">{row.counts.tierAppeals}</td>
                        <td className="py-2 px-3">{row.counts.h2022AuthDatesWithout}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Show detailed queue counts</summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3">Week</th>
                        <th className="py-2 pr-3">T2038 Auth Email</th>
                        <th className="py-2 pr-3">T2038 Requested</th>
                        <th className="py-2 pr-3">T2038 Unreachable</th>
                        <th className="py-2 pr-3">Tier Requested</th>
                        <th className="py-2 pr-3">Tier Appeals</th>
                        <th className="py-2 pr-3">H2022 With</th>
                        <th className="py-2 pr-3">Final RCFE With</th>
                        <th className="py-2 pr-3">Final RCFE Without</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsWithDelta.map((row) => (
                        <tr key={`detail-${row.id}`} className="border-b">
                          <td className="py-2 pr-3">{row.weekLabel || row.weekStartYmd}</td>
                          <td className="py-2 pr-3">{row.counts.t2038AuthOnly}</td>
                          <td className="py-2 pr-3">{row.counts.t2038Requested}</td>
                          <td className="py-2 pr-3">{row.counts.t2038ReceivedUnreachable}</td>
                          <td className="py-2 pr-3">{row.counts.tierRequested}</td>
                          <td className="py-2 pr-3">{row.counts.tierAppeals}</td>
                          <td className="py-2 pr-3">{row.counts.h2022AuthDatesWith}</td>
                          <td className="py-2 pr-3">{row.counts.finalAtRcfeWithDates}</td>
                          <td className="py-2 pr-3">{row.counts.finalAtRcfeWithoutDates}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

