'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface SyncToCaspioButtonProps {
  memberId: string;
  memberName?: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  onSyncComplete?: (result: any) => void;
}

export function SyncToCaspioButton({
  memberId,
  memberName = 'this member',
  disabled = false,
  variant = 'default',
  size = 'default',
  className = '',
  onSyncComplete
}: SyncToCaspioButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const { toast } = useToast();

  const handleSync = async () => {
    if (!memberId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Member ID is required for sync',
      });
      return;
    }

    setIsSyncing(true);

    try {
      const functions = getFunctions();
      const syncFunction = httpsCallable(functions, 'syncMemberToCaspio');

      console.log(`🔄 Starting comprehensive sync for member: ${memberId}`);
      const result = await syncFunction({ memberId });
      const data = result.data as any;

      console.log('📥 Sync response:', data);

      if (data.success) {
        setLastSyncResult(data);
        
        toast({
          title: 'Sync Successful! 🎉',
          description: data.message,
          className: 'bg-green-100 text-green-900 border-green-200',
        });

        // Call the completion callback if provided
        if (onSyncComplete) {
          onSyncComplete(data);
        }
      } else {
        throw new Error(data.message || 'Sync failed');
      }
    } catch (error: any) {
      console.error('❌ Sync error:', error);

      // Handle specific Firebase Functions errors
      let errorMessage = 'Failed to sync member data to Caspio';
      let errorTitle = 'Sync Error';

      if (error.code === 'functions/not-found') {
        errorMessage = 'Member not found in Firestore database';
        errorTitle = 'Member Not Found';
      } else if (error.code === 'functions/unauthenticated') {
        errorMessage = 'You must be logged in to sync data';
        errorTitle = 'Authentication Required';
      } else if (error.code === 'functions/failed-precondition') {
        errorMessage = 'Caspio API credentials are not configured properly';
        errorTitle = 'Configuration Error';
      } else if (error.code === 'functions/internal') {
        errorMessage = error.message || 'Internal server error during sync';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        variant: 'destructive',
        title: errorTitle,
        description: errorMessage,
      });

      setLastSyncResult({ success: false, error: errorMessage });
    } finally {
      setIsSyncing(false);
    }
  };

  const getSyncStatus = () => {
    if (!lastSyncResult) return null;
    
    if (lastSyncResult.success) {
      return {
        icon: CheckCircle2,
        text: lastSyncResult.action === 'updated' ? 'Updated in Caspio' : 'Created in Caspio',
        className: 'text-green-600'
      };
    } else {
      return {
        icon: AlertTriangle,
        text: 'Sync Failed',
        className: 'text-red-600'
      };
    }
  };

  const syncStatus = getSyncStatus();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled || isSyncing}
          className={className}
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing to Caspio...
            </>
          ) : syncStatus ? (
            <>
              <syncStatus.icon className={`mr-2 h-4 w-4 ${syncStatus.className}`} />
              {syncStatus.text}
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Sync to Caspio
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sync Member Data to Caspio</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This will sync all 4 pages of member data for <strong>{memberName}</strong> to the Caspio database.
            </p>
            <div className="text-sm bg-blue-50 p-3 rounded-md">
              <strong>What will be synced:</strong>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• <strong>Page 1:</strong> Basic member information (name, DOB, contact info)</li>
                <li>• <strong>Page 2:</strong> Health plan & status information</li>
                <li>• <strong>Page 3:</strong> Care coordination details</li>
                <li>• <strong>Page 4:</strong> Service planning information</li>
              </ul>
            </div>
            {lastSyncResult?.success && (
              <div className="text-sm bg-green-50 p-3 rounded-md">
                <strong>Last sync:</strong> {lastSyncResult.action === 'updated' ? 'Updated existing record' : 'Created new record'} 
                {lastSyncResult.client_ID2 && ` (ID: ${lastSyncResult.client_ID2})`}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This action will create or update the member record in Caspio with the latest data from Firestore.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Sync to Caspio
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}