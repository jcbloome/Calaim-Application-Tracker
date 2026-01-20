// Caspio Member Service
// Handles all member-related operations (fetch, sync, search)

import { CaspioAuthService } from './CaspioAuthService';
import { CASPIO_CONFIG } from '../config/constants';
import { CaspioErrorHandler } from '../utils/errorHandler';
import type { 
  CaspioMember, 
  CaspioStaff, 
  CaspioApiResponse, 
  CaspioSyncStatus,
  CaspioSyncOptions 
} from '../types';

export class CaspioMemberService {
  private authService: CaspioAuthService;
  private memberCache: Map<string, CaspioMember> = new Map();
  private staffCache: CaspioStaff[] = [];
  private lastSync: Date | null = null;
  private syncStatus: CaspioSyncStatus | null = null;

  constructor(authService: CaspioAuthService) {
    this.authService = authService;
  }

  // ==================== MEMBER OPERATIONS ====================

  /**
   * Get all members from CalAIM_tbl_Members table
   */
  async getAllMembers(options?: CaspioSyncOptions): Promise<CaspioMember[]> {
    try {
      const token = await this.authService.getValidToken();
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      
      if (options?.batchSize) {
        queryParams.set('q.limit', options.batchSize.toString());
      }
      
      if (options?.timestampFilter) {
        const timestamp = options.timestampFilter.toISOString();
        queryParams.set('q.where', `Updated_Date >= '${timestamp}'`);
      }

      const url = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records?${queryParams}`;
      
      console.log('🔍 Fetching members from Caspio...');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data: CaspioApiResponse<any> = await response.json();
      const members = data.Result.map(this.transformCaspioMember);
      
      // Update cache
      if (!options?.forceRefresh) {
        members.forEach(member => this.memberCache.set(member.id, member));
      }
      
      this.lastSync = new Date();
      console.log(`✅ Fetched ${members.length} members from Caspio`);
      
      return members;
    } catch (error) {
      console.error('❌ Failed to fetch members:', error);
      throw CaspioErrorHandler.handle(error, 'Failed to fetch members from Caspio');
    }
  }

  /**
   * Get single member by ID
   */
  async getMemberById(memberId: string): Promise<CaspioMember | null> {
    try {
      // Check cache first
      if (this.memberCache.has(memberId)) {
        return this.memberCache.get(memberId)!;
      }

      const token = await this.authService.getValidToken();
      const url = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records?q.where=Member_ID='${memberId}'`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data: CaspioApiResponse<any> = await response.json();
      
      if (data.Result.length === 0) {
        return null;
      }

      const member = this.transformCaspioMember(data.Result[0]);
      this.memberCache.set(memberId, member);
      
      return member;
    } catch (error) {
      console.error(`❌ Failed to fetch member ${memberId}:`, error);
      throw CaspioErrorHandler.handle(error, `Failed to fetch member ${memberId}`);
    }
  }

  /**
   * Search members by name
   */
  async searchMembers(query: string): Promise<CaspioMember[]> {
    try {
      const token = await this.authService.getValidToken();
      
      // Build search query for first name, last name, or full name
      const searchCondition = `First_Name LIKE '%${query}%' OR Last_Name LIKE '%${query}%' OR CONCAT(First_Name, ' ', Last_Name) LIKE '%${query}%'`;
      const url = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records?q.where=${encodeURIComponent(searchCondition)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data: CaspioApiResponse<any> = await response.json();
      const members = data.Result.map(this.transformCaspioMember);
      
      console.log(`🔍 Found ${members.length} members matching "${query}"`);
      return members;
    } catch (error) {
      console.error(`❌ Member search failed for "${query}":`, error);
      throw CaspioErrorHandler.handle(error, `Member search failed for "${query}"`);
    }
  }

  /**
   * Sync member data from connect_tbl_clients to CalAIM_tbl_Members
   */
  async syncMemberData(clientId: string): Promise<boolean> {
    try {
      const token = await this.authService.getValidToken();
      
      // First, get client data
      const clientUrl = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CLIENTS}/records?q.where=Client_ID='${clientId}'`;
      
      const clientResponse = await fetch(clientUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!clientResponse.ok) {
        throw new Error(`Failed to fetch client data: ${clientResponse.statusText}`);
      }

      const clientData: CaspioApiResponse<any> = await clientResponse.json();
      
      if (clientData.Result.length === 0) {
        throw new Error(`Client ${clientId} not found`);
      }

      const client = clientData.Result[0];
      
      // Transform client data to member format
      const memberData = this.transformClientToMember(client);
      
      // Check if member already exists
      const existingMember = await this.getMemberById(clientId);
      
      if (existingMember) {
        // Update existing member
        const updateUrl = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records?q.where=Member_ID='${clientId}'`;
        
        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(memberData),
        });

        if (!updateResponse.ok) {
          throw new Error(`Failed to update member: ${updateResponse.statusText}`);
        }
      } else {
        // Create new member
        const createUrl = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records`;
        
        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(memberData),
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create member: ${createResponse.statusText}`);
        }
      }

      // Clear cache for this member
      this.memberCache.delete(clientId);
      
      console.log(`✅ Successfully synced member data for ${clientId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to sync member ${clientId}:`, error);
      throw CaspioErrorHandler.handle(error, `Failed to sync member ${clientId}`);
    }
  }

  // ==================== STAFF OPERATIONS ====================

  /**
   * Get all active staff members
   */
  async getStaff(): Promise<CaspioStaff[]> {
    try {
      // Return cached staff if available and recent
      if (this.staffCache.length > 0 && this.lastSync && (Date.now() - this.lastSync.getTime()) < CASPIO_CONFIG.SYNC.CACHE_DURATION) {
        return this.staffCache;
      }

      const token = await this.authService.getValidToken();
      
      // Get unique SW_ID values from CalAIM_tbl_Members
      const membersUrl = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CALAIM_MEMBERS}/records?q.select=SW_ID&q.where=SW_ID IS NOT NULL AND SW_ID != ''&q.groupBy=SW_ID`;
      
      const membersResponse = await fetch(membersUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!membersResponse.ok) {
        throw new Error(`Failed to fetch SW_IDs: ${membersResponse.statusText}`);
      }

      const membersData: CaspioApiResponse<any> = await membersResponse.json();
      const swIds = membersData.Result.map(record => record.SW_ID).filter(Boolean);
      
      if (swIds.length === 0) {
        console.log('⚠️ No SW_IDs found in CalAIM_tbl_Members');
        return [];
      }

      // Get staff details from connect_tbl_clients
      const staffCondition = swIds.map(id => `SW_ID='${id}'`).join(' OR ');
      const staffUrl = `${CASPIO_CONFIG.BASE_URL}/tables/${CASPIO_CONFIG.TABLES.CLIENTS}/records?q.select=SW_ID,SW_First,SW_Last,SW_Email&q.where=${encodeURIComponent(staffCondition)}&q.groupBy=SW_ID,SW_First,SW_Last,SW_Email`;
      
      const staffResponse = await fetch(staffUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!staffResponse.ok) {
        throw new Error(`Failed to fetch staff details: ${staffResponse.statusText}`);
      }

      const staffData: CaspioApiResponse<any> = await staffResponse.json();
      
      this.staffCache = staffData.Result.map(this.transformCaspioStaff);
      console.log(`✅ Fetched ${this.staffCache.length} staff members`);
      
      return this.staffCache;
    } catch (error) {
      console.error('❌ Failed to fetch staff:', error);
      
      // Return fallback staff list if Caspio fails
      return this.getFallbackStaff();
    }
  }

  /**
   * Get fallback staff list when Caspio is unavailable
   */
  private getFallbackStaff(): CaspioStaff[] {
    return [
      {
        id: 'jason.bloome',
        name: 'Jason Bloome',
        email: 'jason@carehomefinders.com',
        role: 'MSW',
        isActive: true,
        workload: 0
      },
      {
        id: 'anna.bastian',
        name: 'Anna-Lisa Bastian',
        email: 'anna@carehomefinders.com',
        role: 'MSW',
        isActive: true,
        workload: 0
      }
    ];
  }

  // ==================== SYNC STATUS ====================

  /**
   * Get sync health status
   */
  async getSyncStatus(): Promise<CaspioSyncStatus> {
    const isHealthy = await this.authService.testConnection();
    
    return {
      lastSync: this.lastSync || new Date(0),
      isHealthy,
      successfulSyncs: 0, // TODO: Implement counter
      failedSyncs: 0, // TODO: Implement counter
      lastError: undefined,
      nextRetry: undefined
    };
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Transform Caspio member data to our interface
   */
  private transformCaspioMember(caspioData: any): CaspioMember {
    return {
      id: caspioData.Member_ID || caspioData.Client_ID,
      firstName: caspioData.First_Name || '',
      lastName: caspioData.Last_Name || '',
      seniorFirst: caspioData.Senior_First,
      seniorLast: caspioData.Senior_Last,
      email: caspioData.Email,
      phone: caspioData.Phone,
      address: caspioData.Address,
      city: caspioData.City,
      state: caspioData.State,
      zipCode: caspioData.Zip_Code,
      dateOfBirth: caspioData.Date_of_Birth,
      socialWorker: caspioData.SW_ID,
      rcfeName: caspioData.RCFE_Name,
      rcfeAddress: caspioData.RCFE_Address,
      status: caspioData.Status || 'Active',
      createdAt: caspioData.Created_Date || new Date().toISOString(),
      updatedAt: caspioData.Updated_Date || new Date().toISOString()
    };
  }

  /**
   * Transform client data to member format for sync
   */
  private transformClientToMember(clientData: any): any {
    return {
      Member_ID: clientData.Client_ID,
      First_Name: clientData.First_Name,
      Last_Name: clientData.Last_Name,
      Senior_First: clientData.Senior_First,
      Senior_Last: clientData.Senior_Last,
      Email: clientData.Email,
      Phone: clientData.Phone,
      Address: clientData.Address,
      City: clientData.City,
      State: clientData.State,
      Zip_Code: clientData.Zip_Code,
      Date_of_Birth: clientData.Date_of_Birth,
      SW_ID: clientData.SW_ID,
      RCFE_Name: clientData.RCFE_Name,
      RCFE_Address: clientData.RCFE_Address,
      Status: 'Active',
      Updated_Date: new Date().toISOString()
    };
  }

  /**
   * Transform Caspio staff data to our interface
   */
  private transformCaspioStaff(caspioData: any): CaspioStaff {
    return {
      id: caspioData.SW_ID,
      name: `${caspioData.SW_First || ''} ${caspioData.SW_Last || ''}`.trim(),
      email: caspioData.SW_Email || '',
      role: 'MSW', // Default role
      isActive: true,
      workload: 0 // TODO: Calculate actual workload
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.memberCache.clear();
    this.staffCache = [];
    this.lastSync = null;
    console.log('🗑️ Member service cache cleared');
  }

  /**
   * Get cache size for monitoring
   */
  getCacheSize(): number {
    return this.memberCache.size + this.staffCache.length;
  }
}