'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  Sync, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Database,
  RefreshCw,
  Trash2,
  Info
} from 'lucide-react';
import { useMemberNotesSync } from '@/lib/member-notes-sync';
import { format } from 'date-fns';

export default function SyncStatusDashboard() {
  const [processing, setProcessing] = useState(false);
  const { 
    syncStats, 
    refreshStats, 
    processPendingSyncs, 
    clearSyncData 
  } = useMemberNotesSync();
  const { toast } = useToast();

  // Auto-refresh stats every 10 seconds
  useEffect(() => {
    const interval = setInterval(refreshStats, 10000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  const handleProcessPendingSyncs = async () => {
    setProcessing(true);
    try {
      const result = await processPendingSyncs();
      
      toast({
        title: "Sync Complete",
        description: `Processed ${result.processed} notes, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default"
      });
      
      refreshStats();
    } catch (error: any) {
      toast({
        title: "Sync Error",
        description: error.message || "Failed to process pending syncs",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleClearSyncData = () => {
    if (confirm('Are you sure you want to clear all sync data? This will force re-sync of all members.')) {
      clearSyncData();
      refreshStats();
      toast({
        title: "Sync Data Cleared",
        description: "All sync data has been reset",
      });
    }
  };

  const getSyncHealthStatus = () => {
    if (syncStats.failedSyncs > 0) {
      return { status: 'error', color: 'text-red-600', icon: AlertCircle };
    }
    if (syncStats.pendingSyncs > 0) {
      return { status: 'warning', color: 'text-yellow-600', icon: Clock };
    }
    return { status: 'healthy', color: 'text-green-600', icon: CheckCircle };
  };

  const healthStatus = getSyncHealthStatus();
  const HealthIcon = healthStatus.icon;
  const syncProgress = syncStats.totalMembers > 0 
    ? (syncStats.syncedMembers / syncStats.totalMembers) * 100 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">🔄 Notes Sync Status</h2>
          <p className="text-muted-foreground">
            Monitor and manage client notes synchronization
          </p>
        </div>
        <Button onClick={refreshStats} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overall Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <HealthIcon className={`w-5 h-5 ${healthStatus.color}`} />
            <span>Sync Health Status</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {syncStats.totalMembers}
              </div>
              <p className="text-sm text-muted-foreground">Total Members</p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {syncStats.syncedMembers}
              </div>
              <p className="text-sm text-muted-foreground">Synced Members</p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {syncStats.pendingSyncs}
              </div>
              <p className="text-sm text-muted-foreground">Pending Syncs</p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {syncStats.failedSyncs}
              </div>
              <p className="text-sm text-muted-foreground">Failed Syncs</p>
            </div>
          </div>

          {/* Sync Progress */}
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Sync Progress</span>
              <span className="text-sm text-muted-foreground">
                {Math.round(syncProgress)}%
              </span>
            </div>
            <Progress value={syncProgress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sync className="w-5 h-5" />
              <span>Sync Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleProcessPendingSyncs}
              disabled={processing || syncStats.pendingSyncs === 0}
              className="w-full"
            >
              {processing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sync className="w-4 h-4 mr-2" />
              )}
              Process Pending Syncs ({syncStats.pendingSyncs})
            </Button>

            <Button
              onClick={handleClearSyncData}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Sync Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="w-5 h-5" />
              <span>Sync Information</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>Sync Strategy:</span>
                <Badge variant="outline">Smart Incremental</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Storage:</span>
                <Badge variant="outline">Local + Caspio</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Auto-sync:</span>
                <Badge variant="outline">On Member Selection</Badge>
              </div>
              
              <div className="flex justify-between">
                <span>Retry Policy:</span>
                <Badge variant="outline">3 Attempts</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Alerts */}
      {syncStats.failedSyncs > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sync Issues Detected:</strong> {syncStats.failedSyncs} notes failed to sync after 3 attempts. 
            Check your internet connection and try processing pending syncs again.
          </AlertDescription>
        </Alert>
      )}

      {syncStats.pendingSyncs > 0 && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>Pending Syncs:</strong> {syncStats.pendingSyncs} notes are waiting to be synced to Caspio. 
            Click "Process Pending Syncs" to sync them now.
          </AlertDescription>
        </Alert>
      )}

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Info className="w-5 h-5" />
            <span>How Smart Sync Works</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-blue-600">1</span>
              </div>
              <div>
                <h4 className="font-medium">First Member Selection</h4>
                <p className="text-muted-foreground">
                  When you select a member for the first time, all existing notes are loaded from Caspio
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-green-600">2</span>
              </div>
              <div>
                <h4 className="font-medium">Incremental Updates</h4>
                <p className="text-muted-foreground">
                  Subsequent selections only load new/updated notes since last sync
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-purple-600">3</span>
              </div>
              <div>
                <h4 className="font-medium">Bidirectional Sync</h4>
                <p className="text-muted-foreground">
                  New notes created in the app are automatically pushed back to Caspio
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-orange-600">4</span>
              </div>
              <div>
                <h4 className="font-medium">Offline Support</h4>
                <p className="text-muted-foreground">
                  Notes are saved locally and synced when connection is restored
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}