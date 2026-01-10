'use client';

import { useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

interface AutoSyncOptions {
  applicationId: string;
  clientId?: string;
  memberData: any;
  watchFields?: string[];
  onSyncComplete?: (result: any) => void;
  onSyncError?: (error: any) => void;
  debounceMs?: number;
}

export function useAutoSync({
  applicationId,
  clientId,
  memberData,
  watchFields = ['Kaiser_Status', 'CalAIM_Status', 'kaiser_user_assignment'],
  onSyncComplete,
  onSyncError,
  debounceMs = 2000
}: AutoSyncOptions) {
  const { toast } = useToast();
  const previousData = useRef<any>(null);
  const syncTimeout = useRef<NodeJS.Timeout | null>(null);
  const isSyncing = useRef(false);

  const performAutoSync = async (changedFields: string[]) => {
    if (!clientId || !applicationId || isSyncing.current) return;
    
    isSyncing.current = true;
    
    try {
      console.log(`🔄 Auto-syncing changed fields: ${changedFields.join(', ')}`);
      
      const functions = getFunctions();
      const autoSync = httpsCallable(functions, 'performAutoSync');
      
      const result = await autoSync({
        applicationId,
        clientId,
        memberData,
        changedFields,
        triggerType: 'field_change'
      });
      
      const data = result.data as any;
      
      if (data.success) {
        console.log(`✅ Auto-sync completed: ${changedFields.join(', ')}`);
        
        // Show subtle success notification
        toast({
          title: 'Auto-synced to Caspio',
          description: `Updated ${changedFields.join(', ')}`,
          className: 'bg-green-100 text-green-900 border-green-200',
          duration: 3000,
        });
        
        if (onSyncComplete) onSyncComplete(data);
      }
    } catch (error: any) {
      console.error('❌ Auto-sync failed:', error);
      
      toast({
        variant: 'destructive',
        title: 'Auto-sync Failed',
        description: `Could not sync ${changedFields.join(', ')} to Caspio`,
        duration: 5000,
      });
      
      if (onSyncError) onSyncError(error);
    } finally {
      isSyncing.current = false;
    }
  };

  useEffect(() => {
    if (!memberData || !previousData.current) {
      previousData.current = memberData;
      return;
    }

    // Detect changes in watched fields
    const changedFields: string[] = [];
    
    watchFields.forEach(field => {
      const currentValue = memberData[field];
      const previousValue = previousData.current[field];
      
      if (currentValue !== previousValue && currentValue !== undefined) {
        changedFields.push(field);
      }
    });

    if (changedFields.length > 0) {
      console.log(`🔍 Detected changes in: ${changedFields.join(', ')}`);
      
      // Clear existing timeout
      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }
      
      // Debounce the sync to avoid rapid-fire updates
      syncTimeout.current = setTimeout(() => {
        performAutoSync(changedFields);
      }, debounceMs);
    }

    previousData.current = memberData;
  }, [memberData, watchFields, debounceMs]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (syncTimeout.current) {
        clearTimeout(syncTimeout.current);
      }
    };
  }, []);

  return {
    isSyncing: isSyncing.current
  };
}