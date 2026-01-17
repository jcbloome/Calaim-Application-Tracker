// Smart sync system for member notes
// Handles initial bulk upload and incremental updates

interface MemberSyncStatus {
  clientId2: string;
  lastSyncTimestamp: string;
  initialSyncCompleted: boolean;
  totalNotesCount: number;
  lastNoteId?: string;
}

interface NoteSync {
  noteId: string;
  clientId2: string;
  action: 'create' | 'update' | 'delete';
  timestamp: string;
  synced: boolean;
  syncAttempts: number;
  lastError?: string;
}

class MemberNotesSync {
  private syncStatusKey = 'member-notes-sync-status';
  private pendingSyncKey = 'pending-note-syncs';

  // Get sync status for a member
  getMemberSyncStatus(clientId2: string): MemberSyncStatus | null {
    try {
      const allStatus = this.getAllSyncStatus();
      return allStatus[clientId2] || null;
    } catch (error) {
      console.error('Error getting sync status:', error);
      return null;
    }
  }

  // Get all sync statuses
  getAllSyncStatus(): { [clientId2: string]: MemberSyncStatus } {
    try {
      const stored = localStorage.getItem(this.syncStatusKey);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error parsing sync status:', error);
      return {};
    }
  }

  // Update sync status for a member
  updateMemberSyncStatus(status: MemberSyncStatus): void {
    try {
      const allStatus = this.getAllSyncStatus();
      allStatus[status.clientId2] = {
        ...status,
        lastSyncTimestamp: new Date().toISOString()
      };
      localStorage.setItem(this.syncStatusKey, JSON.stringify(allStatus));
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }

  // Check if member needs initial sync
  needsInitialSync(clientId2: string): boolean {
    const status = this.getMemberSyncStatus(clientId2);
    return !status || !status.initialSyncCompleted;
  }

  // Perform initial bulk sync for a member
  async performInitialSync(clientId2: string): Promise<{ success: boolean; notesCount: number; error?: string }> {
    try {
      console.log(`🔄 Starting initial sync for member: ${clientId2}`);

      // Fetch all existing notes from Caspio for this member
      const response = await fetch(`/api/client-notes?clientId2=${clientId2}&includeAll=true`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch notes: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch notes');
      }

      const notes = data.data.notes || [];
      console.log(`📥 Retrieved ${notes.length} existing notes for ${clientId2}`);

      // Update sync status
      this.updateMemberSyncStatus({
        clientId2,
        lastSyncTimestamp: new Date().toISOString(),
        initialSyncCompleted: true,
        totalNotesCount: notes.length,
        lastNoteId: notes.length > 0 ? notes[0].noteId : undefined
      });

      console.log(`✅ Initial sync completed for ${clientId2}: ${notes.length} notes`);

      return {
        success: true,
        notesCount: notes.length
      };

    } catch (error: any) {
      console.error(`❌ Initial sync failed for ${clientId2}:`, error);
      
      return {
        success: false,
        notesCount: 0,
        error: error.message
      };
    }
  }

  // Get pending syncs
  getPendingSyncs(): NoteSync[] {
    try {
      const stored = localStorage.getItem(this.pendingSyncKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting pending syncs:', error);
      return [];
    }
  }

  // Add note to pending sync queue
  addToPendingSync(noteSync: Omit<NoteSync, 'timestamp' | 'synced' | 'syncAttempts'>): void {
    try {
      const pending = this.getPendingSyncs();
      const newSync: NoteSync = {
        ...noteSync,
        timestamp: new Date().toISOString(),
        synced: false,
        syncAttempts: 0
      };

      // Remove any existing sync for the same note
      const filtered = pending.filter(sync => sync.noteId !== noteSync.noteId);
      filtered.push(newSync);

      localStorage.setItem(this.pendingSyncKey, JSON.stringify(filtered));
      console.log(`📝 Added note ${noteSync.noteId} to pending sync queue (${noteSync.action})`);
    } catch (error) {
      console.error('Error adding to pending sync:', error);
    }
  }

  // Process pending syncs
  async processPendingSyncs(): Promise<{ processed: number; failed: number }> {
    const pending = this.getPendingSyncs();
    const unsynced = pending.filter(sync => !sync.synced && sync.syncAttempts < 3);
    
    if (unsynced.length === 0) {
      return { processed: 0, failed: 0 };
    }

    console.log(`🔄 Processing ${unsynced.length} pending note syncs...`);

    let processed = 0;
    let failed = 0;

    for (const sync of unsynced) {
      try {
        const success = await this.syncNoteToServer(sync);
        
        if (success) {
          sync.synced = true;
          processed++;
          console.log(`✅ Synced note ${sync.noteId} to server`);
        } else {
          sync.syncAttempts++;
          failed++;
          console.log(`❌ Failed to sync note ${sync.noteId} (attempt ${sync.syncAttempts})`);
        }
      } catch (error: any) {
        sync.syncAttempts++;
        sync.lastError = error.message;
        failed++;
        console.error(`❌ Error syncing note ${sync.noteId}:`, error);
      }
    }

    // Update pending syncs
    localStorage.setItem(this.pendingSyncKey, JSON.stringify(pending));

    console.log(`📊 Sync results: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  // Sync individual note to server
  private async syncNoteToServer(sync: NoteSync): Promise<boolean> {
    try {
      let endpoint = '/api/client-notes';
      let method = 'POST';
      
      if (sync.action === 'update') {
        endpoint = `/api/client-notes/${sync.noteId}`;
        method = 'PUT';
      } else if (sync.action === 'delete') {
        endpoint = `/api/client-notes/${sync.noteId}`;
        method = 'DELETE';
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: sync.action !== 'delete' ? JSON.stringify({
          noteId: sync.noteId,
          clientId2: sync.clientId2,
          timestamp: sync.timestamp
        }) : undefined,
      });

      return response.ok;
    } catch (error) {
      console.error('Error syncing note to server:', error);
      return false;
    }
  }

  // Check for new notes since last sync
  async checkForNewNotes(clientId2: string): Promise<{ newNotes: any[]; updatedNotes: any[] }> {
    const status = this.getMemberSyncStatus(clientId2);
    
    if (!status || !status.initialSyncCompleted) {
      return { newNotes: [], updatedNotes: [] };
    }

    try {
      // Fetch notes since last sync
      const response = await fetch(
        `/api/client-notes?clientId2=${clientId2}&since=${status.lastSyncTimestamp}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to check for new notes');
      }

      const data = await response.json();
      const notes = data.data.notes || [];

      // Separate new notes from updated notes
      const newNotes = notes.filter((note: any) => 
        new Date(note.timeStamp) > new Date(status.lastSyncTimestamp)
      );

      const updatedNotes = notes.filter((note: any) => 
        note.lastModified && new Date(note.lastModified) > new Date(status.lastSyncTimestamp)
      );

      if (newNotes.length > 0 || updatedNotes.length > 0) {
        // Update sync status
        this.updateMemberSyncStatus({
          ...status,
          totalNotesCount: status.totalNotesCount + newNotes.length,
          lastNoteId: newNotes.length > 0 ? newNotes[0].noteId : status.lastNoteId
        });
      }

      return { newNotes, updatedNotes };
    } catch (error) {
      console.error('Error checking for new notes:', error);
      return { newNotes: [], updatedNotes: [] };
    }
  }

  // Clear sync data (for testing/reset)
  clearSyncData(): void {
    localStorage.removeItem(this.syncStatusKey);
    localStorage.removeItem(this.pendingSyncKey);
    console.log('🗑️ Cleared all sync data');
  }

  // Get sync statistics
  getSyncStats(): {
    totalMembers: number;
    syncedMembers: number;
    pendingSyncs: number;
    failedSyncs: number;
  } {
    const allStatus = this.getAllSyncStatus();
    const pending = this.getPendingSyncs();

    return {
      totalMembers: Object.keys(allStatus).length,
      syncedMembers: Object.values(allStatus).filter(s => s.initialSyncCompleted).length,
      pendingSyncs: pending.filter(s => !s.synced && s.syncAttempts < 3).length,
      failedSyncs: pending.filter(s => !s.synced && s.syncAttempts >= 3).length
    };
  }
}

// Export singleton instance
export const memberNotesSync = new MemberNotesSync();

// Hook for using sync in React components
export function useMemberNotesSync() {
  const [syncStats, setSyncStats] = React.useState(memberNotesSync.getSyncStats());

  const refreshStats = React.useCallback(() => {
    setSyncStats(memberNotesSync.getSyncStats());
  }, []);

  React.useEffect(() => {
    // Refresh stats periodically
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  return {
    syncStats,
    refreshStats,
    needsInitialSync: memberNotesSync.needsInitialSync.bind(memberNotesSync),
    performInitialSync: memberNotesSync.performInitialSync.bind(memberNotesSync),
    addToPendingSync: memberNotesSync.addToPendingSync.bind(memberNotesSync),
    processPendingSyncs: memberNotesSync.processPendingSyncs.bind(memberNotesSync),
    checkForNewNotes: memberNotesSync.checkForNewNotes.bind(memberNotesSync),
    clearSyncData: memberNotesSync.clearSyncData.bind(memberNotesSync)
  };
}

// Add React import for the hook
import React from 'react';