'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  Loader2, 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Users,
  RefreshCw,
  Play,
  Pause,
  RotateCcw
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

interface PendingSyncItem {
  id: string;
  clientId: string;
  memberName: string;
  changedFields: string[];
  lastModified: Date;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  error?: string;
}

interface BatchSyncStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  inProgress: number;
}

export function BatchSyncManager() {
  const [pendingItems, setPendingItems] = useState<PendingSyncItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [batchStats, setBatchStats] = useState<BatchSyncStats>({
    total: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    inProgress: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const { toast } = useToast();

  const loadPendingSyncs = async () => {
    setIsLoading(true);
    
    try {
      const functions = getFunctions();
      const getPendingSyncs = httpsCallable(functions, 'getPendingSyncs');
      
      const result = await getPendingSyncs({});
      const data = result.data as any;
      
      if (data.success) {
        setPendingItems(data.pendingItems);
        setBatchStats(data.stats);
      }
    } catch (error: any) {
      console.error('Error loading pending syncs:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Load',
        description: 'Could not load pending sync items',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performBatchSync = async (itemIds?: string[]) => {
    const syncIds = itemIds || Array.from(selectedItems);
    
    if (syncIds.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Items Selected',
        description: 'Please select items to sync',
      });
      return;
    }

    setIsBatchSyncing(true);
    setBatchProgress(0);
    
    try {
      const functions = getFunctions();
      const batchSync = httpsCallable(functions, 'performBatchSync');
      
      const result = await batchSync({
        itemIds: syncIds,
        batchSize: 5 // Process 5 items at a time
      });
      
      const data = result.data as any;
      
      if (data.success) {
        toast({
          title: 'Batch Sync Complete',
          description: `Successfully synced ${data.successCount}/${syncIds.length} items`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        
        // Refresh the pending items list
        await loadPendingSyncs();
        setSelectedItems(new Set());
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Batch Sync Failed',
        description: error.message || 'Batch sync operation failed',
      });
    } finally {
      setIsBatchSyncing(false);
      setBatchProgress(0);
    }
  };

  const retryFailedSyncs = async () => {
    const failedIds = pendingItems
      .filter(item => item.status === 'failed')
      .map(item => item.id);
    
    if (failedIds.length > 0) {
      await performBatchSync(failedIds);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const selectAllPending = () => {
    const pendingIds = pendingItems
      .filter(item => item.status === 'pending')
      .map(item => item.id);
    setSelectedItems(new Set(pendingIds));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Database className="h-4 w-4 text-blue-600" />;
      case 'syncing': return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Database className="h-4 w-4 text-gray-400" />;
    }
  };

  useEffect(() => {
    loadPendingSyncs();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadPendingSyncs, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{batchStats.total}</p>
                <p className="text-xs text-muted-foreground">Total Items</p>
              </div>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{batchStats.pending}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <Database className="h-4 w-4 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-yellow-600">{batchStats.inProgress}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <Loader2 className="h-4 w-4 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{batchStats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-red-600">{batchStats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Batch Sync Manager
          </CardTitle>
          <CardDescription>
            Manage and sync multiple member records to Caspio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => performBatchSync()}
              disabled={selectedItems.size === 0 || isBatchSyncing}
            >
              {isBatchSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Sync Selected ({selectedItems.size})
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={selectAllPending}
              disabled={batchStats.pending === 0}
            >
              Select All Pending
            </Button>
            
            <Button
              variant="outline"
              onClick={clearSelection}
              disabled={selectedItems.size === 0}
            >
              Clear Selection
            </Button>
            
            <Button
              variant="outline"
              onClick={retryFailedSyncs}
              disabled={batchStats.failed === 0 || isBatchSyncing}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry Failed ({batchStats.failed})
            </Button>
            
            <Button
              variant="outline"
              onClick={loadPendingSyncs}
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

          {/* Progress Bar */}
          {isBatchSyncing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Batch Sync Progress</span>
                <span>{Math.round(batchProgress)}%</span>
              </div>
              <Progress value={batchProgress} className="w-full" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Items List */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Sync Items</CardTitle>
          <CardDescription>
            Items waiting to be synchronized with Caspio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading pending syncs...</span>
            </div>
          ) : pendingItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No pending sync items</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onCheckedChange={() => toggleItemSelection(item.id)}
                    disabled={item.status !== 'pending'}
                  />
                  
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.memberName}</span>
                      <Badge variant="outline" className="text-xs">
                        {item.clientId}
                      </Badge>
                      <Badge className={getPriorityColor(item.priority)}>
                        {item.priority}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Changed fields:</span>
                      {item.changedFields.map(field => (
                        <Badge key={field} variant="outline" className="text-xs">
                          {field}
                        </Badge>
                      ))}
                    </div>
                    
                    {item.error && (
                      <Alert className="mt-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {item.error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className="text-sm capitalize">{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}