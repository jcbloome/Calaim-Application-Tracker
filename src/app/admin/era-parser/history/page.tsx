'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type EraSummary = {
  total_rows?: number;
  t2038?: { rows?: number; members?: number; total_paid?: number };
  h2022?: { rows?: number; members?: number; total_paid?: number };
  era_grand_total?: number | null;
  parser_total?: number | null;
  variance?: number | null;
};

type EraCacheHistoryItem = {
  cacheKey: string;
  fileName: string;
  sourceMode: string;
  totalRows: number;
  payer?: string;
  summary?: EraSummary | null;
  totalsVerified?: boolean;
  totalsVerifiedAt?: { _seconds?: number; seconds?: number } | string | null;
  updatedAt?: { _seconds?: number; seconds?: number } | string | null;
};

const formatCacheTimestamp = (value: EraCacheHistoryItem['updatedAt']) => {
  if (!value) return 'Unknown date';
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
  }
  const seconds = Number((value as any)?._seconds ?? (value as any)?.seconds ?? NaN);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown date';
  return new Date(seconds * 1000).toLocaleString();
};

export default function EraParserHistoryPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading } = useAdmin();
  const auth = useAuth();
  const [history, setHistory] = useState<EraCacheHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!auth?.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/era/parse?limit=100', {
        method: 'GET',
        headers: { authorization: `Bearer ${idToken}` },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load parsed ERA history (HTTP ${res.status})`);
      }
      setHistory(Array.isArray(data?.history) ? (data.history as EraCacheHistoryItem[]) : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load parsed ERA history.');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) router.replace('/admin');
  }, [isLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (!auth?.currentUser) return;
    fetchHistory().catch(() => undefined);
  }, [auth?.currentUser, fetchHistory]);

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Parsed ERA tracker</CardTitle>
          <CardDescription>Quickly review saved ERA card totals and open any file in the parser.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/era-parser')}>
            Back to ERA parser
          </Button>
          <Button variant="outline" onClick={() => fetchHistory()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      {history.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {loading ? 'Loading parsed ERA files...' : 'No parsed ERA files saved yet.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.map((item) => {
            const parserTotal = Number(item.summary?.parser_total || 0);
            const eraTotal = typeof item.summary?.era_grand_total === 'number' ? Number(item.summary?.era_grand_total) : null;
            const offsetAdj = typeof eraTotal === 'number' ? Number((eraTotal - parserTotal).toFixed(2)) : null;
            return (
              <Card key={item.cacheKey}>
                <CardContent className="pt-6 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium flex flex-wrap items-center gap-2">
                        <span>{item.fileName || 'ERA PDF'}</span>
                        {item.totalsVerified ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                            Totals verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Review pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.totalRows || 0} rows • {item.sourceMode || 'unknown'} • {item.payer || 'Health Net'} •{' '}
                        {formatCacheTimestamp(item.updatedAt)}
                      </div>
                      {item.summary ? (
                        <div className="text-[11px] text-muted-foreground">
                          T2038 ${Number(item.summary?.t2038?.total_paid || 0).toFixed(2)} • H2022 $
                          {Number(item.summary?.h2022?.total_paid || 0).toFixed(2)} • Subtotal ${parserTotal.toFixed(2)} • ERA total{' '}
                          {typeof eraTotal === 'number' ? `$${eraTotal.toFixed(2)}` : '—'} • Offset/adj{' '}
                          {typeof offsetAdj === 'number' ? `$${offsetAdj.toFixed(2)}` : '—'}
                        </div>
                      ) : null}
                    </div>
                    <Button variant="outline" onClick={() => router.push(`/admin/era-parser?cacheKey=${encodeURIComponent(item.cacheKey)}`)}>
                      Open in parser
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

