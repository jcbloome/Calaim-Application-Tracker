'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAuth } from 'firebase/auth';
import { Loader2, Database, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck, Clock3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type SyncMode = 'incremental' | 'full';

interface SyncSummary {
  fetched?: number;
  upserted?: number;
  skippedMissingId?: number;
  pruned?: number;
}

interface MembersCacheSyncStatus {
  lastSyncAt?: string | null;
  lastRunAt?: string | null;
  lastRunTrigger?: 'auto' | 'manual' | string;
  lastMode?: SyncMode | string;
  lastAutoSyncAt?: string | null;
  lastManualSyncAt?: string | null;
  lastRunSummary?: SyncSummary;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

export function BatchSyncManager() {
  const [status, setStatus] = useState<MembersCacheSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [runningMode, setRunningMode] = useState<SyncMode | null>(null);
  const { toast } = useToast();

  const loadSyncStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/caspio/members-cache/status', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load members cache sync status');
      }
      setStatus((data?.settings || {}) as MembersCacheSyncStatus);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Status Load Failed',
        description: error?.message || 'Could not load members cache sync status.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runMembersCacheSync = async (mode: SyncMode) => {
    setRunningMode(mode);
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        throw new Error('You must be signed in to run members cache sync.');
      }

      const idToken = await auth.currentUser.getIdToken();
      const syncRes = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode }),
      });
      const syncData = await syncRes.json().catch(() => ({}));
      if (!syncRes.ok || !syncData?.success) {
        throw new Error(syncData?.error || 'Members cache sync failed');
      }

      toast({
        title: mode === 'full' ? 'Full Reconcile Complete' : 'Incremental Refresh Complete',
        description: `Fetched ${syncData?.fetched || 0}, upserted ${syncData?.upserted || 0}, pruned ${syncData?.pruned || 0}.`,
      });

      await loadSyncStatus();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: error?.message || 'Could not run members cache sync.',
      });
    } finally {
      setRunningMode(null);
    }
  };

  useEffect(() => {
    loadSyncStatus();
    const interval = setInterval(loadSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const summary = status?.lastRunSummary || {};
  const isSyncing = Boolean(runningMode);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{summary.fetched || 0}</p>
                <p className="text-xs text-muted-foreground">Last fetched</p>
              </div>
              <Database className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{summary.upserted || 0}</p>
                <p className="text-xs text-muted-foreground">Last upserted</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-amber-600">{summary.skippedMissingId || 0}</p>
                <p className="text-xs text-muted-foreground">Skipped missing ID</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{summary.pruned || 0}</p>
                <p className="text-xs text-muted-foreground">Pruned stale docs</p>
              </div>
              <ShieldCheck className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Members Cache Reconcile
          </CardTitle>
          <CardDescription>
            Caspio is source of truth. Use manual runs to refresh or fully reconcile the Firebase cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => runMembersCacheSync('incremental')}
              disabled={isSyncing}
            >
              {runningMode === 'incremental' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Incremental...
                </>
              ) : (
                <>
                  <Clock3 className="mr-2 h-4 w-4" />
                  Run Incremental Refresh
                </>
              )}
            </Button>
            <Button
              onClick={() => runMembersCacheSync('full')}
              disabled={isSyncing}
            >
              {runningMode === 'full' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Full...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Run Full Reconcile
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={loadSyncStatus}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync Run Status</CardTitle>
          <CardDescription>
            Last successful run metadata from `admin-settings/caspio-members-sync`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Last mode:</span>
            <Badge variant="outline">{String(status?.lastMode || 'not recorded')}</Badge>
            <span className="text-muted-foreground">Trigger:</span>
            <Badge variant="outline">{String(status?.lastRunTrigger || 'not recorded')}</Badge>
          </div>
          <div className="text-muted-foreground">
            Last run: {formatDateTime(status?.lastRunAt || status?.lastSyncAt)}
          </div>
          <div className="text-muted-foreground">
            Last auto sync: {formatDateTime(status?.lastAutoSyncAt)}
          </div>
          <div className="text-muted-foreground">
            Last manual sync: {formatDateTime(status?.lastManualSyncAt)}
          </div>
          <Alert>
            <AlertDescription>
              Manual sync is now a cache reconcile tool only. Field-level app-to-Caspio queue syncing has been retired.
            </AlertDescription>
          </Alert>
          {isSyncing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Running {runningMode === 'full' ? 'full reconcile' : 'incremental refresh'}...
              </span>
            </div>
          )}
        </CardContent>        
      </Card>
    </div>
  );
}