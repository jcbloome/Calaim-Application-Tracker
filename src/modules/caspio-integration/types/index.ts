// Centralized TypeScript interfaces for Caspio integration
// All Caspio-related types in one place for consistency

export interface CaspioMember {
  id: string;
  firstName: string;
  lastName: string;
  seniorFirst?: string;
  seniorLast?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfBirth?: string;
  socialWorker?: string;
  rcfeName?: string;
  rcfeAddress?: string;
  status: 'Active' | 'Inactive' | 'Pending';
  createdAt: string;
  updatedAt: string;
}

export interface CaspioNote {
  id: string;
  memberId: string;
  memberName: string;
  noteText: string;
  staffMember: string;
  priority: 'General' | 'Priority' | 'Urgent';
  category: 'General' | 'Medical' | 'Behavioral' | 'Administrative' | 'ILS';
  isILSOnly: boolean;
  createdAt: string;
  updatedAt?: string;
  isRead: boolean;
  assignedStaff?: string[];
}

export interface CaspioStaff {
  id: string;
  name: string;
  email: string;
  role: 'MSW' | 'Case Manager' | 'Supervisor' | 'Admin';
  isActive: boolean;
  workload?: number;
  specialties?: string[];
}

export interface CaspioAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  scope?: string;
}

export interface CaspioSyncStatus {
  lastSync: Date;
  isHealthy: boolean;
  successfulSyncs: number;
  failedSyncs: number;
  lastError?: string;
  nextRetry?: Date;
}

export interface CaspioApiResponse<T = any> {
  Result: T[];
  Status: number;
  Message?: string;
}

export interface CaspioError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  endpoint?: string;
}

export interface CaspioSyncOptions {
  forceRefresh?: boolean;
  batchSize?: number;
  includeILS?: boolean;
  memberIds?: string[];
  timestampFilter?: Date;
}

export interface CaspioFieldMapping {
  caspioField: string;
  appField: string;
  transform?: (value: any) => any;
  required?: boolean;
}