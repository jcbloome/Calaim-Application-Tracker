'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  Loader2, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Clock,
  Database,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';

interface SyncStatus {
  needsSync: boolean;
  lastSynced?: Date;
  lastModified?: Date;
  changedFields: string[];
  syncInProgress: boolean;
  hasConflicts: boolean;
  caspioStatus: 'synced' | 'pending' | 'error' | 'never';
}

interface SyncStatusIndicatorProps {
  applicationId: string;
  clientId?: string;
  memberData: any;
  onSyncComplete?: () => void;
  className?: string;
}

export function SyncStatusIndicator({ 
  applicationId, 
  clientId, 
  memberData, 
  onSyncComplete,
  className = '' 
}: SyncStatusIndicatorProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    needsSync: false,
    changedFields: [],
    syncInProgress: false,
    hasConflicts: false,
    caspioStatus: 'never'
  });
  const [isChecking, setIsChecking] = useState(false);
  const { toast } = useToast();

  const checkSyncStatus = async () => {
    if (!clientId || !applicationId) return;
    
    setIsChecking(true);
    
    try {
      const functions = getFunctions();
      const checkSync = httpsCallable(functions, 'checkSyncStatus');
      
      const result = await checkSync({ 
        applicationId, 
        clientId,
        memberData 
      });
      const data = result.data as any;
      
      if (data.success) {
        setSyncStatus(data.syncStatus);
      }
    } catch (error: any) {
      console.error('Error checking sync status:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const performManualSync = async () => {
    if (!clientId || !applicationId) return;
    
    setSyncStatus(prev => ({ ...prev, syncInProgress: true }));
    
    try {
      const functions = getFunctions();
      const manualSync = httpsCallable(functions, 'performManualSync');
      
      const result = await manualSync({ 
        applicationId, 
        clientId,
        memberData,
        changedFields: syncStatus.changedFields
      });
      const data = result.data as any;
      
      if (data.success) {
        setSyncStatus({
          needsSync: false,
          lastSynced: new Date(),
          changedFields: [],
          syncInProgress: false,
          hasConflicts: false,
          caspioStatus: 'synced'
        });
        
        toast({
          title: 'Sync Complete',
          description: `Successfully synced ${syncStatus.changedFields.length} changed fields`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        if (onSyncComplete) onSyncComplete();
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: error.message || 'Failed to sync with Caspio',
      });
      
      setSyncStatus(prev => ({ 
        ...prev, 
        syncInProgress: false,
        caspioStatus: 'error'
      }));
    }
  };

  useEffect(() => {
    checkSyncStatus();
  }, [applicationId, clientId, memberData]);

  const getSyncStatusBadge = () => {
    if (syncStatus.syncInProgress) {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Syncing...
        </Badge>
      );
    }
    
    if (syncStatus.hasConflicts) {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="mr-1 h-3 w-3" />
          Conflicts
        </Badge>
      );
    }
    
    if (syncStatus.needsSync) {
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="mr-1 h-3 w-3" />
          Needs Sync
        </Badge>
      );
    }
    
    if (syncStatus.caspioStatus === 'synced') {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Synced
        </Badge>
      );
    }
    
    if (syncStatus.caspioStatus === 'error') {
      return (
        <Badge variant="destructive">
          <WifiOff className="mr-1 h-3 w-3" />
          Sync Error
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
        <Database className="mr-1 h-3 w-3" />
        Never Synced
      </Badge>
    );
  };

  const getConnectionStatus = () => {
    switch (syncStatus.caspioStatus) {
      case 'synced':
        return <Wifi className="h-4 w-4 text-green-600" />;
      case 'error':
        return <WifiOff className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Database className="h-4 w-4 text-gray-400" />;
    }
  };

  if (!clientId) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getConnectionStatus()}
          <span className="text-sm font-medium">Caspio Sync</span>
          {getSyncStatusBadge()}
        </div>
        
        <Button
          size="sm"
          variant="outline"
          onClick={checkSyncStatus}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {/* Sync Details */}
      {syncStatus.lastSynced && (
        <div className="text-xs text-muted-foreground">
          Last synced: {format(syncStatus.lastSynced, 'MMM dd, yyyy HH:mm')}
        </div>
      )}

      {/* Changed Fields Alert */}
      {syncStatus.needsSync && syncStatus.changedFields.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="space-y-2">
              <p className="font-medium">
                {syncStatus.changedFields.length} field(s) changed since last sync:
              </p>
              <div className="flex flex-wrap gap-1">
                {syncStatus.changedFields.map(field => (
                  <Badge key={field} variant="outline" className="text-xs">
                    {field}
                  </Badge>
                ))}
              </div>
              <Button
                size="sm"
                onClick={performManualSync}
                disabled={syncStatus.syncInProgress}
                className="mt-2"
              >
                {syncStatus.syncInProgress ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-3 w-3" />
                    Sync to Caspio
                  </>
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Conflicts Alert */}
      {syncStatus.hasConflicts && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">Sync conflicts detected</p>
            <p className="text-sm">Data has been modified in both systems. Manual resolution required.</p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}