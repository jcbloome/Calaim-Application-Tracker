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

type HoldPreviewRow = {
  pkId: string;
  clientId2: string;
  memberName: string;
  currentHold: string;
  needsUpdate: boolean;
};

type PreviewState = {
  holdValue: string;
  holdFields: string[];
  totalMembers: number;
  alreadyHold: number;
  needingUpdate: number;
  sampleNeedingUpdate: HoldPreviewRow[];
};

export default function SwHoldBackfillPage() {
  const { isSuperAdmin, isLoading } = useAdmin();
  const router = useRouter();
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [lastResult, setLastResult] = useState<{ updated: number; failed: number } | null>(null);

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.push('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  const canApply = useMemo(
    () => Boolean(preview && preview.totalMembers > 0 && !isPreviewLoading && !isApplying),
    [preview, isPreviewLoading, isApplying]
  );

  const previewHoldStatus = async () => {
    setIsPreviewLoading(true);
    try {
      const res = await fetch('/api/admin/caspio/sw-hold-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Preview failed (HTTP ${res.status})`);
      }
      setPreview({
        holdValue: String(data.holdValue || '🔴 Hold'),
        holdFields: Array.isArray(data.holdFields) ? data.holdFields.map(String) : [],
        totalMembers: Number(data.totalMembers || 0),
        alreadyHold: Number(data.alreadyHold || 0),
        needingUpdate: Number(data.needingUpdate || 0),
        sampleNeedingUpdate: Array.isArray(data.sampleNeedingUpdate)
          ? (data.sampleNeedingUpdate as HoldPreviewRow[])
          : [],
      });
      setLastResult(null);
      toast({
        title: 'Preview loaded',
        description: `Found ${Number(data.totalMembers || 0)} member(s) in CalAIM_tbl_Members. ${Number(
          data.needingUpdate || 0
        )} need ${String(data.holdValue || '🔴 Hold')}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Preview failed',
        description: String(error?.message || 'Could not load member hold statuses.'),
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const applyHoldToAll = async () => {
    if (!canApply || !preview) return;
    const confirmed = window.confirm(
      `Set ${preview.holdValue} on ALL ${preview.totalMembers} member(s) in CalAIM_tbl_Members?\n\nFields: ${preview.holdFields.join(
        ', '
      )}\n\nThis matches the coding used when applications are pushed to Caspio.`
    );
    if (!confirmed) return;

    setIsApplying(true);
    try {
      const res = await fetch('/api/admin/caspio/sw-hold-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.details || `Apply failed (HTTP ${res.status})`);
      }
      const updated = Number(data?.updated || 0);
      const failed = Number(data?.failedCount || (Array.isArray(data?.failed) ? data.failed.length : 0));
      setLastResult({ updated, failed });
      toast({
        title: 'Social worker hold backfill complete',
        description: `Updated ${updated} member(s) to ${String(data.holdValue || '🔴 Hold')}. Failed: ${failed}.`,
      });
      await previewHoldStatus();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Backfill failed',
        description: String(error?.message || 'Could not apply social worker hold to all members.'),
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
            <Database className="h-5 w-5 text-rose-600" />
            Social Worker Hold Backfill (All Members)
          </CardTitle>
          <CardDescription>
            Set every member in Caspio <code>CalAIM_tbl_Members</code> (Client_ID2 search/report source) to the same SW
            hold coding used on Create Application → Caspio push: <strong>🔴 Hold</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void previewHoldStatus()}
              disabled={isPreviewLoading || isApplying}
            >
              {isPreviewLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Preview Current Hold Status
            </Button>
            <Button type="button" onClick={() => void applyHoldToAll()} disabled={!canApply}>
              {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apply 🔴 Hold to All Members
            </Button>
          </div>

          {!preview ? (
            <Alert>
              <AlertTitle>Preview required</AlertTitle>
              <AlertDescription>
                Run preview first to confirm total members, detected Caspio hold field name(s), and how many already have
                a hold value before bulk update.
              </AlertDescription>
            </Alert>
          ) : null}

          {preview ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">Total members: {preview.totalMembers}</Badge>
              <Badge variant="outline">Already hold: {preview.alreadyHold}</Badge>
              <Badge variant="outline">Need update: {preview.needingUpdate}</Badge>
              <Badge variant="outline">Value: {preview.holdValue}</Badge>
              {preview.holdFields.map((field) => (
                <Badge key={field} variant="secondary">
                  Field: {field}
                </Badge>
              ))}
              {lastResult ? (
                <Badge variant="outline">
                  Last apply: updated {lastResult.updated}, failed {lastResult.failed}
                </Badge>
              ) : null}
            </div>
          ) : null}

          {preview ? (
            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="px-3 py-2">Member Name</th>
                    <th className="px-3 py-2">Client_ID2</th>
                    <th className="px-3 py-2">Current hold</th>
                    <th className="px-3 py-2">PK_ID</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleNeedingUpdate.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                        All loaded members already have a hold value (or none need updating). Apply will still set{' '}
                        {preview.holdValue} on every member for consistency with Caspio push.
                      </td>
                    </tr>
                  ) : (
                    preview.sampleNeedingUpdate.map((row) => (
                      <tr key={row.pkId || row.clientId2 || row.memberName} className="border-t">
                        <td className="px-3 py-2">{row.memberName || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.clientId2 || '—'}</td>
                        <td className="px-3 py-2">{row.currentHold || '—'}</td>
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
