// Centralized TypeScript interfaces for Firebase integration
// All Firebase-related types in one place for consistency

import type { User } from 'firebase/auth';
import type { Timestamp, DocumentData, QueryConstraint, OrderByDirection, WhereFilterOp } from 'firebase/firestore';

// ==================== USER & AUTH ====================

export interface FirebaseUser extends User {
  // Extended user properties
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  roles?: AdminRole[];
  lastLoginAt?: Date;
  createdAt?: Date;
}

export interface AdminRole {
  id: string;
  name: 'admin' | 'super_admin' | 'staff' | 'viewer';
  permissions: string[];
  assignedAt: Date;
  assignedBy: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  roles: AdminRole[];
  isActive: boolean;
  lastLoginAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==================== FIRESTORE ====================

export interface FirestoreDocument<T = DocumentData> {
  id: string;
  data: T;
  exists: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreCollection<T = DocumentData> {
  docs: FirestoreDocument<T>[];
  size: number;
  empty: boolean;
  loading: boolean;
  error?: FirebaseError;
}

export interface QueryOptions {
  where?: WhereClause[];
  orderBy?: OrderByClause[];
  limit?: number;
  startAfter?: any;
  endBefore?: any;
  realtime?: boolean;
  includeMetadata?: boolean;
}

export interface WhereClause {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

export interface OrderByClause {
  field: string;
  direction?: OrderByDirection;
}

export interface DocumentOptions {
  realtime?: boolean;
  includeMetadata?: boolean;
  source?: 'default' | 'server' | 'cache';
}

// ==================== FUNCTIONS ====================

export interface FunctionCallOptions {
  timeout?: number;
  region?: string;
  retries?: number;
  retryDelay?: number;
}

export interface FunctionResult<T = any> {
  data: T;
  success: boolean;
  error?: string;
  executionTime?: number;
}

// ==================== STORAGE ====================

export interface StorageOptions {
  maxSize?: number;
  allowedTypes?: string[];
  generateThumbnail?: boolean;
  compressionQuality?: number;
}

export interface StorageFile {
  name: string;
  fullPath: string;
  bucket: string;
  size: number;
  contentType?: string;
  downloadURL?: string;
  metadata?: any;
  uploadedAt: Date;
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  state: 'running' | 'paused' | 'success' | 'canceled' | 'error';
}

// ==================== ERROR HANDLING ====================

export interface FirebaseError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  service: 'auth' | 'firestore' | 'functions' | 'storage';
  operation?: string;
}

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
}

// ==================== NOTIFICATIONS ====================

export interface NotificationDocument {
  id: string;
  title: string;
  message: string;
  recipientIds: string[];
  createdBy: string;
  createdAt: Timestamp;
  read: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: 'system' | 'member_note' | 'staff_note' | 'reminder';
  actionUrl?: string;
  metadata?: Record<string, any>;
}

// ==================== APPLICATIONS ====================

export interface ApplicationDocument {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  memberDOB: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  assignedStaff?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  formData?: Record<string, any>;
}

// ==================== MEMBER NOTES ====================

export interface MemberNoteDocument {
  id: string;
  memberId: string;
  memberName: string;
  noteText: string;
  staffMember: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: 'general' | 'medical' | 'behavioral' | 'administrative' | 'ils';
  isILSOnly: boolean;
  isRead: boolean;
  assignedStaff?: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ==================== ACTIVITY LOGS ====================

export interface ActivityLogDocument {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  timestamp: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

// ==================== BATCH OPERATIONS ====================

export interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  collection: string;
  documentId: string;
  data?: any;
}

export interface BatchResult {
  success: boolean;
  operations: number;
  errors: FirebaseError[];
  executionTime: number;
}

// ==================== PAGINATION ====================

export interface PaginationOptions {
  pageSize: number;
  startAfter?: any;
  endBefore?: any;
}

export interface PaginatedResult<T> {
  docs: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPageToken?: any;
  previousPageToken?: any;
  totalCount?: number;
}

// ==================== REAL-TIME SUBSCRIPTIONS ====================

export interface SubscriptionOptions {
  includeMetadataChanges?: boolean;
  source?: 'default' | 'server' | 'cache';
}

export interface Subscription {
  id: string;
  unsubscribe: () => void;
  isActive: boolean;
  createdAt: Date;
}