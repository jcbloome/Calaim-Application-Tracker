// Reusable Caspio Sync Hook
// Replaces scattered useEffect and API calls throughout the app

'use client';

import { useState, useEffect, useCallback } from 'react';
import { CaspioService } from '../services/CaspioService';
import type { CaspioMember, CaspioNote, CaspioSyncStatus, CaspioSyncOptions } from '../types';

interface UseCaspioSyncReturn {
  // Data
  members: CaspioMember[];
  notes: CaspioNote[];
  syncStatus: CaspioSyncStatus | null;
  
  // Loading states
  isLoading: boolean;
  isSyncing: boolean;
  
  // Error handling
  error: string | null;
  
  // Actions
  syncMembers: (options?: CaspioSyncOptions) => Promise<void>;
  syncMemberNotes: (memberId: string, options?: CaspioSyncOptions) => Promise<void>;
  performFullSync: (options?: CaspioSyncOptions) => Promise<void>;
  clearError: () => void;
  refresh: () => Promise<void>;
}

export function useCaspioSync(autoSync: boolean = false): UseCaspioSyncReturn {
  const [members, setMembers] = useState<CaspioMember[]>([]);
  const [notes, setNotes] = useState<CaspioNote[]>([]);
  const [syncStatus, setSyncStatus] = useState<CaspioSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caspioService = CaspioService.getInstance();

  // Clear error handler
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Sync members
  const syncMembers = useCallback(async (options?: CaspioSyncOptions) => {
    try {
      setIsSyncing(true);
      setError(null);
      
      const fetchedMembers = await caspioService.getMembers(options);
      setMembers(fetchedMembers);
      
      console.log(`✅ Synced ${fetchedMembers.length} members from Caspio`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync members';
      setError(errorMessage);
      console.error('❌ Member sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [caspioService]);

  // Sync notes for specific member
  const syncMemberNotes = useCallback(async (memberId: string, options?: CaspioSyncOptions) => {
    try {
      setIsSyncing(true);
      setError(null);
      
      const fetchedNotes = await caspioService.getMemberNotes(memberId, options);
      
      // Update notes state (merge with existing)
      setNotes(prevNotes => {
        const otherNotes = prevNotes.filter(note => note.memberId !== memberId);
        return [...otherNotes, ...fetchedNotes];
      });
      
      // Sync to Firestore for caching
      await caspioService.syncNotesToFirestore(memberId);
      
      console.log(`✅ Synced ${fetchedNotes.length} notes for member ${memberId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync member notes';
      setError(errorMessage);
      console.error('❌ Member notes sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [caspioService]);

  // Perform full system sync
  const performFullSync = useCallback(async (options?: CaspioSyncOptions) => {
    try {
      setIsSyncing(true);
      setError(null);
      
      const results = await caspioService.performFullSync(options);
      
      if (results.errors.length > 0) {
        setError(`Sync completed with ${results.errors.length} errors: ${results.errors.join(', ')}`);
      }
      
      console.log(`✅ Full sync completed: ${results.members} members, ${results.notes} notes`);
      
      // Refresh data after full sync
      await refresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Full sync failed';
      setError(errorMessage);
      console.error('❌ Full sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [caspioService]);

  // Refresh all data
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Get sync status
      const status = await caspioService.getSyncStatus();
      setSyncStatus(status);
      
      // Refresh members if auto-sync is enabled
      if (autoSync) {
        await syncMembers();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh data';
      setError(errorMessage);
      console.error('❌ Refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [caspioService, autoSync, syncMembers]);

  // Disabled auto-sync - only sync when user manually triggers
  // useEffect(() => {
  //   if (autoSync) {
  //     refresh();
  //   }
  // }, [autoSync, refresh]);

  // Disabled health check interval - no automatic background syncing
  // useEffect(() => {
  //   if (!autoSync) return;
  //
  //   const healthCheckInterval = setInterval(async () => {
  //     try {
  //       const status = await caspioService.getSyncStatus();
  //       setSyncStatus(status);
  //       
  //       // Auto-retry if sync is unhealthy
  //       if (!status.isHealthy && status.nextRetry && new Date() >= status.nextRetry) {
  //         console.log('🔄 Auto-retrying unhealthy sync...');
  //         await syncMembers({ forceRefresh: true });
  //       }
  //     } catch (err) {
  //       console.error('❌ Health check failed:', err);
  //     }
  //   }, 60000); // Check every minute
  //
  //   return () => clearInterval(healthCheckInterval);
  // }, [autoSync, caspioService, syncMembers]);

  return {
    // Data
    members,
    notes,
    syncStatus,
    
    // Loading states
    isLoading,
    isSyncing,
    
    // Error handling
    error,
    
    // Actions
    syncMembers,
    syncMemberNotes,
    performFullSync,
    clearError,
    refresh
  };
}