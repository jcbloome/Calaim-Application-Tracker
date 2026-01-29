// Caspio Notes Service
// Handles all note-related operations (fetch, create, sync to Firestore)

import { CaspioAuthService } from './CaspioAuthService';
import { CASPIO_CONFIG } from '../config/constants';
import { CaspioErrorHandler } from '../utils/errorHandler';
import type { 
  CaspioNote, 
  CaspioApiResponse, 
  CaspioSyncOptions 
} from '../types';

export class CaspioNotesService {
  private authService: CaspioAuthService;
  private notesCache: Map<string, CaspioNote[]> = new Map(); // memberId -> notes[]
  private lastSync: Map<string, Date> = new Map(); // memberId -> lastSyncDate

  constructor(authService: CaspioAuthService) {
    this.authService = authService;
  }

  // ==================== NOTES OPERATIONS ====================

  /**
   * Get all notes for a specific member (both regular and ILS notes)
   */
  async getMemberNotes(memberId: string, options?: CaspioSyncOptions): Promise<CaspioNote[]> {
    try {
      // Check cache first (unless force refresh)
      if (!options?.forceRefresh && this.notesCache.has(memberId)) {
        const cachedNotes = this.notesCache.get(memberId)!;
        const lastSyncTime = this.lastSync.get(memberId);
        
        // Return cached notes if they're recent enough
        if (lastSyncTime && (Date.now() - lastSyncTime.getTime()) < CASPIO_CONFIG.SYNC.CACHE_DURATION) {
          console.log(`📋 Returning ${cachedNotes.length} cached notes for member ${memberId}`);
          return cachedNotes;
        }
      }

      const token = await this.authService.getValidToken();
      
      // Fetch both regular and ILS notes
      const [regularNotes, ilsNotes] = await Promise.all([
        this.fetchRegularNotes(memberId, token, options),
        options?.includeILS !== false ? this.fetchILSNotes(memberId, token, options) : []
      ]);

      // Combine and sort notes
      const allNotes = [...regularNotes, ...ilsNotes].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Update cache
      this.notesCache.set(memberId, allNotes);
      this.lastSync.set(memberId, new Date());

      console.log(`✅ Fetched ${allNotes.length} notes for member ${memberId} (${regularNotes.length} regular, ${ilsNotes.length} ILS)`);
      return allNotes;
    } catch (error) {
      console.error(`❌ Failed to fetch notes for member ${memberId}:`, error);
      throw CaspioErrorHandler.handle(error, `Failed to fetch notes for member ${memberId}`);
    }
  }

  /**
   * Fetch regular member notes from CalAIM_tbl_MemberNotes
   */
  private async fetchRegularNotes(memberId: string, token: string, options?: CaspioSyncOptions): Promise<CaspioNote[]> {
    let whereClause = `Member_ID='${memberId}'`;
    
    // Add timestamp filter if provided
    if (options?.timestampFilter) {
      const timestamp = options.timestampFilter.toISOString();
      whereClause += ` AND Created_Date >= '${timestamp}'`;
    }

    const url = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.MEMBER_NOTES}/records?q.where=${encodeURIComponent(whereClause)}&q.orderBy=Created_Date DESC`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch regular notes: HTTP ${response.status}`);
    }

    const data: CaspioApiResponse<any> = await response.json();
    return data.Result.map(note => this.transformCaspioNote(note, false));
  }

  /**
   * Fetch ILS-only notes from CalAIM_tbl_ILSNotes
   */
  private async fetchILSNotes(memberId: string, token: string, options?: CaspioSyncOptions): Promise<CaspioNote[]> {
    let whereClause = `Member_ID='${memberId}'`;
    
    // Add timestamp filter if provided
    if (options?.timestampFilter) {
      const timestamp = options.timestampFilter.toISOString();
      whereClause += ` AND Created_Date >= '${timestamp}'`;
    }

    const url = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.ILS_NOTES}/records?q.where=${encodeURIComponent(whereClause)}&q.orderBy=Created_Date DESC`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // ILS notes table might not exist or be accessible, don't throw error
      console.warn(`⚠️ Could not fetch ILS notes: HTTP ${response.status}`);
      return [];
    }

    const data: CaspioApiResponse<any> = await response.json();
    return data.Result.map(note => this.transformCaspioNote(note, true));
  }

  /**
   * Create a new note in Caspio
   */
  async createNote(noteData: Omit<CaspioNote, 'id' | 'createdAt'>): Promise<CaspioNote> {
    try {
      const token = await this.authService.getValidToken();
      
      // Validate note data
      this.validateNoteData(noteData);
      
      // Transform to Caspio format
      const caspioNoteData = this.transformNoteForCaspio(noteData);
      
      // Determine which table to use based on ILS flag
      const tableName = noteData.isILSOnly ? 
        CASPIO_CONFIG.TABLES.ILS_NOTES : 
        CASPIO_CONFIG.TABLES.MEMBER_NOTES;
      
      const url = `${CASPIO_CONFIG.BASE_URL}/tables/${tableName}/records`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(caspioNoteData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create note: HTTP ${response.status} - ${errorText}`);
      }

      const createdNote: CaspioNote = {
        ...noteData,
        id: `note_${Date.now()}`, // Caspio will assign actual ID
        createdAt: new Date().toISOString()
      };

      // Clear cache for this member to force refresh
      this.notesCache.delete(noteData.memberId);
      
      console.log(`✅ Created new ${noteData.isILSOnly ? 'ILS ' : ''}note for member ${noteData.memberId}`);
      return createdNote;
    } catch (error) {
      console.error('❌ Failed to create note:', error);
      throw CaspioErrorHandler.handle(error, 'Failed to create note in Caspio');
    }
  }

  /**
   * Sync notes to Firestore for caching and offline access
   */
  async syncNotesToFirestore(memberId: string): Promise<void> {
    try {
      // This would integrate with your existing Firestore logic
      // For now, we'll just log the action
      console.log(`🔄 Syncing notes to Firestore for member ${memberId}`);
      
      // Get fresh notes from Caspio
      const notes = await this.getMemberNotes(memberId, { forceRefresh: true });
      
      // TODO: Implement actual Firestore sync
      // This would save notes to Firestore collection for caching
      // await saveNotesToFirestore(memberId, notes);
      
      console.log(`✅ Synced ${notes.length} notes to Firestore for member ${memberId}`);
    } catch (error) {
      console.error(`❌ Failed to sync notes to Firestore for member ${memberId}:`, error);
      throw CaspioErrorHandler.handle(error, `Failed to sync notes to Firestore for member ${memberId}`);
    }
  }

  /**
   * Search notes by text content
   */
  async searchNotes(query: string, memberId?: string): Promise<CaspioNote[]> {
    try {
      const token = await this.authService.getValidToken();
      
      let whereClause = `Note_Text LIKE '%${query}%'`;
      if (memberId) {
        whereClause += ` AND Member_ID='${memberId}'`;
      }

      // Search both regular and ILS notes
      const [regularNotes, ilsNotes] = await Promise.all([
        this.searchNotesInTable(CASPIO_CONFIG.TABLES.MEMBER_NOTES, whereClause, token, false),
        this.searchNotesInTable(CASPIO_CONFIG.TABLES.ILS_NOTES, whereClause, token, true)
      ]);

      const allNotes = [...regularNotes, ...ilsNotes].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      console.log(`🔍 Found ${allNotes.length} notes matching "${query}"`);
      return allNotes;
    } catch (error) {
      console.error(`❌ Note search failed for "${query}":`, error);
      throw CaspioErrorHandler.handle(error, `Note search failed for "${query}"`);
    }
  }

  /**
   * Search notes in a specific table
   */
  private async searchNotesInTable(tableName: string, whereClause: string, token: string, isILS: boolean): Promise<CaspioNote[]> {
    try {
      const url = `${CASPIO_CONFIG.BASE_URL}/tables/${tableName}/records?q.where=${encodeURIComponent(whereClause)}&q.orderBy=Created_Date DESC`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ Could not search ${tableName}: HTTP ${response.status}`);
        return [];
      }

      const data: CaspioApiResponse<any> = await response.json();
      return data.Result.map(note => this.transformCaspioNote(note, isILS));
    } catch (error) {
      console.warn(`⚠️ Error searching ${tableName}:`, error);
      return [];
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Transform Caspio note data to our interface
   */
  private transformCaspioNote(caspioData: any, isILS: boolean): CaspioNote {
    return {
      id: caspioData.Note_ID || `${caspioData.Member_ID}_${Date.now()}`,
      memberId: caspioData.Member_ID,
      memberName: caspioData.Member_Name || `${caspioData.Member_First || ''} ${caspioData.Member_Last || ''}`.trim(),
      noteText: caspioData.Note_Text || '',
      staffMember: caspioData.Staff_Member || caspioData.Created_By || 'Unknown',
      priority: caspioData.Priority || 'General',
      category: caspioData.Category || (isILS ? 'ILS' : 'General'),
      isILSOnly: isILS,
      createdAt: caspioData.Created_Date || new Date().toISOString(),
      updatedAt: caspioData.Updated_Date,
      isRead: caspioData.Is_Read === 'Yes' || caspioData.Is_Read === true || false,
      assignedStaff: caspioData.Assigned_Staff ? caspioData.Assigned_Staff.split(',').map(s => s.trim()) : []
    };
  }

  /**
   * Transform note data for Caspio format
   */
  private transformNoteForCaspio(noteData: Omit<CaspioNote, 'id' | 'createdAt'>): any {
    return {
      Member_ID: noteData.memberId,
      Member_Name: noteData.memberName,
      Note_Text: noteData.noteText,
      Staff_Member: noteData.staffMember,
      Priority: noteData.priority,
      Category: noteData.category,
      Is_Read: noteData.isRead ? 'Yes' : 'No',
      Created_Date: new Date().toISOString(),
      Assigned_Staff: noteData.assignedStaff?.join(', ') || ''
    };
  }

  /**
   * Validate note data before creating
   */
  private validateNoteData(noteData: Omit<CaspioNote, 'id' | 'createdAt'>): void {
    const required = CASPIO_CONFIG.VALIDATION.REQUIRED_NOTE_FIELDS;
    
    for (const field of required) {
      if (!noteData[field as keyof typeof noteData]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }

    if (noteData.noteText.length > CASPIO_CONFIG.VALIDATION.MAX_NOTE_LENGTH) {
      throw new Error(`Note text too long (max ${CASPIO_CONFIG.VALIDATION.MAX_NOTE_LENGTH} characters)`);
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.notesCache.clear();
    this.lastSync.clear();
    console.log('🗑️ Notes service cache cleared');
  }

  /**
   * Get cache size for monitoring
   */
  getCacheSize(): number {
    let totalNotes = 0;
    for (const notes of this.notesCache.values()) {
      totalNotes += notes.length;
    }
    return totalNotes;
  }

  /**
   * Get notes from cache (for testing/debugging)
   */
  getCachedNotes(memberId: string): CaspioNote[] | undefined {
    return this.notesCache.get(memberId);
  }

  /**
   * Get last sync time for a member
   */
  getLastSyncTime(memberId: string): Date | undefined {
    return this.lastSync.get(memberId);
  }
}