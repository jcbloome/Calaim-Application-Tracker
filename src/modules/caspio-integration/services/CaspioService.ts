// Unified Caspio Service - Single entry point for all Caspio operations
// Replaces scattered API calls throughout the app

import { CaspioAuthService } from './CaspioAuthService';
import { CaspioMemberService } from './CaspioMemberService';
import { CaspioNotesService } from './CaspioNotesService';
import { CaspioErrorHandler } from '../utils/errorHandler';
import type { 
  CaspioMember, 
  CaspioNote, 
  CaspioStaff, 
  CaspioSyncStatus,
  CaspioSyncOptions 
} from '../types';

export class CaspioService {
  private static instance: CaspioService;
  private authService: CaspioAuthService;
  private memberService: CaspioMemberService;
  private notesService: CaspioNotesService;

  private constructor() {
    this.authService = new CaspioAuthService();
    this.memberService = new CaspioMemberService(this.authService);
    this.notesService = new CaspioNotesService(this.authService);
  }

  // Singleton pattern for consistent state
  public static getInstance(): CaspioService {
    if (!CaspioService.instance) {
      CaspioService.instance = new CaspioService();
    }
    return CaspioService.instance;
  }

  // ==================== AUTHENTICATION ====================
  
  /**
   * Get valid authentication token (handles refresh automatically)
   */
  async getAuthToken(): Promise<string> {
    try {
      return await this.authService.getValidToken();
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Authentication failed');
    }
  }

  /**
   * Test Caspio API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAuthToken();
      return true;
    } catch (error) {
      console.error('Caspio connection test failed:', error);
      return false;
    }
  }

  // ==================== MEMBERS ====================
  
  /**
   * Get all members from Caspio
   */
  async getMembers(options?: CaspioSyncOptions): Promise<CaspioMember[]> {
    try {
      return await this.memberService.getAllMembers(options);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Failed to fetch members');
    }
  }

  /**
   * Get single member by ID
   */
  async getMember(memberId: string): Promise<CaspioMember | null> {
    try {
      return await this.memberService.getMemberById(memberId);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, `Failed to fetch member ${memberId}`);
    }
  }

  /**
   * Search members by name
   */
  async searchMembers(query: string): Promise<CaspioMember[]> {
    try {
      return await this.memberService.searchMembers(query);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Member search failed');
    }
  }

  /**
   * Sync member data from Client table to CalAIM Members table
   */
  async syncMemberData(clientId: string): Promise<boolean> {
    try {
      return await this.memberService.syncMemberData(clientId);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, `Failed to sync member ${clientId}`);
    }
  }

  // ==================== STAFF ====================
  
  /**
   * Get all active staff members
   */
  async getStaff(): Promise<CaspioStaff[]> {
    try {
      return await this.memberService.getStaff();
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Failed to fetch staff');
    }
  }

  /**
   * Get available MSW staff for assignment
   */
  async getAvailableMSWStaff(): Promise<CaspioStaff[]> {
    try {
      const allStaff = await this.getStaff();
      return allStaff.filter(staff => 
        staff.role === 'MSW' && 
        staff.isActive && 
        (staff.workload || 0) < 10 // Configurable workload limit
      );
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Failed to fetch available MSW staff');
    }
  }

  // ==================== NOTES ====================
  
  /**
   * Get notes for a specific member
   */
  async getMemberNotes(memberId: string, options?: CaspioSyncOptions): Promise<CaspioNote[]> {
    try {
      return await this.notesService.getMemberNotes(memberId, options);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, `Failed to fetch notes for member ${memberId}`);
    }
  }

  /**
   * Create a new note
   */
  async createNote(note: Omit<CaspioNote, 'id' | 'createdAt'>): Promise<CaspioNote> {
    try {
      return await this.notesService.createNote(note);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Failed to create note');
    }
  }

  /**
   * Sync notes to Firestore for caching
   */
  async syncNotesToFirestore(memberId: string): Promise<void> {
    try {
      await this.notesService.syncNotesToFirestore(memberId);
    } catch (error) {
      throw CaspioErrorHandler.handle(error, `Failed to sync notes for member ${memberId}`);
    }
  }

  // ==================== SYNC & HEALTH ====================
  
  /**
   * Get overall sync health status
   */
  async getSyncStatus(): Promise<CaspioSyncStatus> {
    try {
      return await this.memberService.getSyncStatus();
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Failed to get sync status');
    }
  }

  /**
   * Perform full system sync
   */
  async performFullSync(options?: CaspioSyncOptions): Promise<{
    members: number;
    notes: number;
    errors: string[];
  }> {
    try {
      const results = {
        members: 0,
        notes: 0,
        errors: [] as string[]
      };

      // Sync members
      try {
        const members = await this.getMembers(options);
        results.members = members.length;
      } catch (error) {
        results.errors.push(`Member sync failed: ${error.message}`);
      }

      // Sync notes for each member
      if (options?.memberIds) {
        for (const memberId of options.memberIds) {
          try {
            const notes = await this.getMemberNotes(memberId, options);
            results.notes += notes.length;
            await this.syncNotesToFirestore(memberId);
          } catch (error) {
            results.errors.push(`Notes sync failed for ${memberId}: ${error.message}`);
          }
        }
      }

      return results;
    } catch (error) {
      throw CaspioErrorHandler.handle(error, 'Full sync failed');
    }
  }

  // ==================== UTILITIES ====================
  
  /**
   * Clear all cached data and force refresh
   */
  async clearCache(): Promise<void> {
    this.authService.clearCache();
    this.memberService.clearCache();
    this.notesService.clearCache();
  }

  /**
   * Get service health information
   */
  getHealthInfo(): {
    isConnected: boolean;
    lastActivity: Date | null;
    cacheSize: number;
  } {
    return {
      isConnected: this.authService.isConnected(),
      lastActivity: this.authService.getLastActivity(),
      cacheSize: this.memberService.getCacheSize() + this.notesService.getCacheSize()
    };
  }
}