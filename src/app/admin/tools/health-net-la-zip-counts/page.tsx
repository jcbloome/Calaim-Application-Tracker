'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Download, Loader2, MapPin, RefreshCw } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { HealthNetLaZipCountRow } from '@/lib/health-net-la-zip-counts';

type SortKey = 'zip' | 'count';
type SortDirection = 'asc' | 'desc';

type ZipCountsPayload = {
  success?: boolean;
  error?: string;
  rows?: HealthNetLaZipCountRow[];
  totalAuthorizedHealthNet?: number;
  totalLosAngeles?: number;
  totalWithZip?: number;
  missingZip?: number;
  missingCounty?: number;
  zipCount?: number;
  fetchedAt?: string;
};

export default function HealthNetLaZipCountsPage() {
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const auth = useAuth();
  const [rows, setRows] = useState<HealthNetLaZipCountRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [totalAuthorizedHealthNet, setTotalAuthorizedHealthNet] = useState(0);
  const [totalLosAngeles, setTotalLosAngeles] = useState(0);
  const [totalWithZip, setTotalWithZip] = useState(0);
  const [missingZip, setMissingZip] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isExporting, setIsExporting] = useState(false);

  const getToken = useCallback(async () => {
    const user = auth?.currentUser;
    if (!user) throw new Error('Please sign in again.');
    return user.getIdToken();
  }, [auth?.currentUser]);

  const fetchCounts = useCallback(
    async (refresh = false) => {
      if (!isAdmin) return;
      setIsLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const qs = refresh ? '?refresh=true' : '';
        const res = await fetch(`/api/admin/tools/health-net-la-zip-counts${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => ({}))) as ZipCountsPayload;
        if (!res.ok || !data?.success) {
          throw new Error(String(data?.error || `Failed to load ZIP counts (HTTP ${res.status})`));
        }
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotalAuthorizedHealthNet(Number(data.totalAuthorizedHealthNet) || 0);
        setTotalLosAngeles(Number(data.totalLosAngeles) || 0);
        setTotalWithZip(Number(data.totalWithZip) || 0);
        setMissingZip(Number(data.missingZip) || 0);
        setHasLoaded(true);
        setLastRefreshedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date());
      } catch (err: unknown) {
        setRows([]);
        setHasLoaded(true);
        setError(err instanceof Error ? err.message : 'Could not load ZIP counts.');
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, isAdmin]
  );

  useEffect(() => {
    if (isAdminLoading || !isAdmin || hasLoaded || isLoading) return;
    void fetchCounts(false);
  }, [fetchCounts, hasLoaded, isAdmin, isAdminLoading, isLoading]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'count' ? 'desc' : 'asc');
  };

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      const cmp =
        sortKey === 'zip' ? a.zip.localeCompare(b.zip) : a.count - b.count;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [rows, sortDirection, sortKey]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5" />
    );
  };

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const lines = [
        'ZIP,Member Count',
        ...sortedRows.map((row) => `${row.zip},${row.count}`),
        '',
        `Total LA authorized with ZIP,${totalWithZip}`,
        `LA authorized missing ZIP,${missingZip}`,
        `All authorized Health Net,${totalAuthorizedHealthNet}`,
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `health-net-la-zip-counts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  if (isAdminLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking admin access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Admin access required</AlertTitle>
        <AlertDescription>Sign in as an admin to view this datapage.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MapPin className="h-6 w-6 text-primary" />
            Health Net LA ZIP counts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Authorized Health Net members in Los Angeles County, counted by ZIP code only. No names
            or member IDs are shown. ZIP prefers RCFE facility ZIP, then member / home ZIP.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => void fetchCounts(true)}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isExporting || sortedRows.length === 0}
            onClick={() => void exportCsv()}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ZIP codes</CardDescription>
            <CardTitle className="text-2xl">{rows.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>LA authorized with ZIP</CardDescription>
            <CardTitle className="text-2xl">{totalWithZip.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>LA authorized (all)</CardDescription>
            <CardTitle className="text-2xl">{totalLosAngeles.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>All authorized Health Net</CardDescription>
            <CardTitle className="text-2xl">{totalAuthorizedHealthNet.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {missingZip > 0 ? (
        <Alert>
          <AlertTitle>{missingZip.toLocaleString()} LA authorized member(s) missing ZIP</AlertTitle>
          <AlertDescription>
            They are included in the LA total but not in any ZIP row. Fill RCFE_Zip or Member_Zip in
            Caspio to count them.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load counts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Counts by ZIP</CardTitle>
            <CardDescription>
              {lastRefreshedAt
                ? `Last loaded ${format(lastRefreshedAt, 'MMM d, yyyy h:mm a')}`
                : 'Not loaded yet'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !hasLoaded ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading authorized Health Net members…
            </div>
          ) : sortedRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No Los Angeles ZIP counts found for authorized Health Net members.
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold"
                        onClick={() => handleSort('zip')}
                      >
                        ZIP {renderSortIcon('zip')}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-semibold"
                        onClick={() => handleSort('count')}
                      >
                        Members {renderSortIcon('count')}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => (
                    <TableRow key={row.zip}>
                      <TableCell className="font-mono font-medium">{row.zip}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.count.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
