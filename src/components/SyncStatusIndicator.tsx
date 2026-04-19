'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getAuth } from 'firebase/auth';
import { Loader2, RefreshCw, Clock, Database, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';

type SyncMode = 'incremental' | 'full';

interface CacheSettings {
  lastRunAt?: string | null;
  lastSyncAt?: string | null;
  lastRunTrigger?: string | null;
  lastMode?: string | null;
  lastManualSyncAt?: string | null;
  lastRunSummary?: {
    fetched?: number;
    upserted?: number;
    pruned?: number;
  };
}

interface SyncStatusIndicatorProps {
  applicationId: string;
  clientId?: string;
  memberData: any;
  onSyncComplete?: () => void;
  className?: string;
}

export function SyncStatusIndicator({ 
  applicationId: _applicationId, 
  clientId, 
  memberData: _memberData, 
  onSyncComplete,
  className = '' 
}: SyncStatusIndicatorProps) {
  const [settings, setSettings] = useState<CacheSettings | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [runningMode, setRunningMode] = useState<SyncMode | null>(null);
  const { toast } = useToast();

  const checkCacheStatus = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/caspio/members-cache/status', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load cache status');
      }
      setSettings((data?.settings || {}) as CacheSettings);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Status check failed',
        description: error?.message || 'Could not load members cache sync status.',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const runSync = async (mode: SyncMode) => {
    if (!clientId) return;
    setRunningMode(mode);
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        throw new Error('You must be signed in to run manual sync.');
      }

      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/caspio/members-cache/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Members cache sync failed');
      }

      toast({
        title: mode === 'full' ? 'Full Reconcile Complete' : 'Incremental Refresh Complete',
        description: `Fetched ${data?.fetched || 0}, upserted ${data?.upserted || 0}, pruned ${data?.pruned || 0}.`,
      });
      await checkCacheStatus();
      if (onSyncComplete) onSyncComplete();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: error?.message || 'Failed to refresh members cache from Caspio.',
      });
    } finally {
      setRunningMode(null);
    }
  };

  useEffect(() => {
    checkCacheStatus();
  }, [clientId]);

  const lastRunRaw = settings?.lastRunAt || settings?.lastSyncAt || null;
  const lastRun = lastRunRaw ? new Date(lastRunRaw) : null;
  const isSyncing = Boolean(runningMode);

  if (!clientId) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Members Cache Sync</span>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Caspio source of truth
          </Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={checkCacheStatus}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {lastRun && !Number.isNaN(lastRun.getTime()) && (
        <div className="text-xs text-muted-foreground">
          Last cache run: {format(lastRun, 'MMM dd, yyyy HH:mm')} {settings?.lastRunTrigger ? `(${settings.lastRunTrigger})` : ''}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => runSync('incremental')}
          disabled={isSyncing}
        >
          {runningMode === 'incremental' ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Running Incremental...
            </>
          ) : (
            <>
              <Clock className="mr-2 h-3 w-3" />
              Refresh Cache
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runSync('full')}
          disabled={isSyncing}
        >
          {runningMode === 'full' ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Running Full...
            </>
          ) : (
            <>
              <Database className="mr-2 h-3 w-3" />
              Full Reconcile
            </>
          )}
        </Button>
      </div>

      <Alert>
        <AlertDescription>
          This control reconciles Firebase cache from Caspio. Field-level manual push queues are retired.
        </AlertDescription>
      </Alert>
    </div>
  );
}