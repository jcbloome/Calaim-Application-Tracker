'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';

type MissingTierRow = {
  pkId: string;
  memberName: string;
  calaimMco: string;
  mcoAndTier: string;
};

export default function KaiserTierBackfillPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState<MissingTierRow[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [hasPreviewLoaded, setHasPreviewLoaded] = useState(false);
  const [lastResult, setLastResult] = useState<{ updated: number; failed: number } | null>(null);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  const canApply = useMemo(() => hasPreviewLoaded && rows.length > 0 && !isPreviewLoading && !isApplying, [hasPreviewLoaded, rows.length, isPreviewLoading, isApplying]);

  const previewMissing = async () => {
    setIsPreviewLoading(true);
    try {
      const res = await fetch('/api/admin/caspio/kaiser-tier-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Preview failed (HTTP ${res.status})`);
      }
      const nextRows = Array.isArray(data?.rows) ? (data.rows as MissingTierRow[]) : [];
      setRows(nextRows);
      setHasPreviewLoaded(true);
      setLastResult(null);
      toast({
        title: 'Preview loaded',
        description: `Found ${nextRows.length} Kaiser member(s) with blank MCO_and_Tier.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Preview failed',
        description: String(error?.message || 'Could not load Kaiser members missing tier.'),
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const applyBackfill = async () => {
    if (!canApply) return;
    setIsApplying(true);
    try {
      const res = await fetch('/api/admin/caspio/kaiser-tier-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Apply failed (HTTP ${res.status})`);
      }
      const updated = Number(data?.updated || 0);
      const failed = Array.isArray(data?.failed) ? data.failed.length : 0;
      setLastResult({ updated, failed });
      toast({
        title: 'Kaiser-0 backfill complete',
        description: `Updated ${updated} member(s). Failed: ${failed}.`,
      });
      // Reload preview list after apply, should generally become empty.
      await previewMissing();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Backfill failed',
        description: String(error?.message || 'Could not apply Kaiser-0 backfill.'),
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!isSuperAdmin) return null;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" asChild>
          <Link href="/admin/data-integration">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Data & Integration Tools
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-600" />
            Kaiser Tier Backfill (Preview First)
          </CardTitle>
          <CardDescription>
            Find all Caspio members where `CalAIM_MCO = Kaiser` and `MCO_and_Tier` is blank, review the list, then bulk set `MCO_and_Tier = Kaiser-0`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void previewMissing()} disabled={isPreviewLoading || isApplying}>
              {isPreviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preview Missing Kaiser Tiers
            </Button>
            <Button type="button" onClick={() => void applyBackfill()} disabled={!canApply}>
              {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply Kaiser-0 to Previewed Missing Rows
            </Button>
          </div>

          {!hasPreviewLoaded ? (
            <Alert>
              <AlertTitle>Preview required</AlertTitle>
              <AlertDescription>Run preview first to inspect member names, current tier, and CalAIM_MCO before bulk update.</AlertDescription>
            </Alert>
          ) : null}

          {hasPreviewLoaded ? (
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline">Rows: {rows.length}</Badge>
              {lastResult ? (
                <Badge variant="outline">Last apply: updated {lastResult.updated}, failed {lastResult.failed}</Badge>
              ) : null}
            </div>
          ) : null}

          {hasPreviewLoaded ? (
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="px-3 py-2">Member Name</th>
                    <th className="px-3 py-2">Current MCO_and_Tier</th>
                    <th className="px-3 py-2">CalAIM_MCO</th>
                    <th className="px-3 py-2">PK_ID</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                        No Kaiser members currently missing MCO_and_Tier.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.pkId || row.memberName} className="border-t">
                        <td className="px-3 py-2">{row.memberName || '—'}</td>
                        <td className="px-3 py-2">{row.mcoAndTier || '—'}</td>
                        <td className="px-3 py-2">{row.calaimMco || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.pkId || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

