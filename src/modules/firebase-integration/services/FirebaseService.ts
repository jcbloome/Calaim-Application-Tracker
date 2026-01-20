// Unified Firebase Service - Single entry point for all Firebase operations
// Replaces scattered Firebase usage throughout the app

import { AuthService } from './AuthService';
import { FirestoreService } from './FirestoreService';
import { FunctionsService } from './FunctionsService';
import { StorageService } from './StorageService';
import { FirebaseErrorHandler } from '../utils/errorHandler';
import type { 
  FirebaseUser, 
  FirestoreDocument, 
  FirestoreCollection,
  QueryOptions,
  DocumentOptions,
  FunctionCallOptions,
  StorageOptions,
  BatchOperation,
  BatchResult
} from '../types';

export class FirebaseService {
  private static instance: FirebaseService;
  private authService: AuthService;
  private firestoreService: FirestoreService;
  private functionsService: FunctionsService;
  private storageService: StorageService;

  private constructor() {
    this.authService = new AuthService();
    this.firestoreService = new FirestoreService();
    this.functionsService = new FunctionsService();
    this.storageService = new StorageService();
  }

  // Singleton pattern for consistent state
  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  // ==================== AUTHENTICATION ====================
  
  /**
   * Get current authenticated user
   */
  getCurrentUser(): FirebaseUser | null {
    return this.authService.getCurrentUser();
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<FirebaseUser> {
    try {
      return await this.authService.signInWithEmailAndPassword(email, password);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Sign in failed');
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Sign out failed');
    }
  }

  /**
   * Check if user has admin permissions
   */
  async checkAdminPermissions(userId: string): Promise<{
    isAdmin: boolean;
    isSuperAdmin: boolean;
    roles: string[];
  }> {
    try {
      return await this.authService.checkAdminPermissions(userId);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Admin permission check failed');
    }
  }

  // ==================== FIRESTORE DOCUMENTS ====================
  
  /**
   * Get a single document
   */
  async getDocument<T>(
    collection: string, 
    documentId: string, 
    options?: DocumentOptions
  ): Promise<FirestoreDocument<T> | null> {
    try {
      return await this.firestoreService.getDocument<T>(collection, documentId, options);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to get document ${collection}/${documentId}`);
    }
  }

  /**
   * Create a new document
   */
  async createDocument<T>(
    collection: string, 
    data: T, 
    documentId?: string
  ): Promise<string> {
    try {
      return await this.firestoreService.createDocument(collection, data, documentId);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to create document in ${collection}`);
    }
  }

  /**
   * Update an existing document
   */
  async updateDocument<T>(
    collection: string, 
    documentId: string, 
    data: Partial<T>
  ): Promise<void> {
    try {
      await this.firestoreService.updateDocument(collection, documentId, data);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to update document ${collection}/${documentId}`);
    }
  }

  /**
   * Delete a document
   */
  async deleteDocument(collection: string, documentId: string): Promise<void> {
    try {
      await this.firestoreService.deleteDocument(collection, documentId);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to delete document ${collection}/${documentId}`);
    }
  }

  // ==================== FIRESTORE COLLECTIONS ====================
  
  /**
   * Get documents from a collection
   */
  async getCollection<T>(
    collection: string, 
    options?: QueryOptions
  ): Promise<FirestoreCollection<T>> {
    try {
      return await this.firestoreService.getCollection<T>(collection, options);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to get collection ${collection}`);
    }
  }

  /**
   * Query documents with advanced filtering
   */
  async queryDocuments<T>(
    collection: string, 
    options: QueryOptions
  ): Promise<FirestoreDocument<T>[]> {
    try {
      return await this.firestoreService.queryDocuments<T>(collection, options);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to query collection ${collection}`);
    }
  }

  /**
   * Subscribe to real-time updates
   */
  subscribeToCollection<T>(
    collection: string, 
    options: QueryOptions,
    callback: (docs: FirestoreDocument<T>[]) => void
  ): () => void {
    return this.firestoreService.subscribeToCollection<T>(collection, options, callback);
  }

  /**
   * Subscribe to document changes
   */
  subscribeToDocument<T>(
    collection: string, 
    documentId: string,
    callback: (doc: FirestoreDocument<T> | null) => void,
    options?: DocumentOptions
  ): () => void {
    return this.firestoreService.subscribeToDocument<T>(collection, documentId, callback, options);
  }

  // ==================== BATCH OPERATIONS ====================
  
  /**
   * Execute multiple operations in a batch
   */
  async executeBatch(operations: BatchOperation[]): Promise<BatchResult> {
    try {
      return await this.firestoreService.executeBatch(operations);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Batch operation failed');
    }
  }

  // ==================== FIREBASE FUNCTIONS ====================
  
  /**
   * Call a Firebase Function
   */
  async callFunction<T, R>(
    functionName: string, 
    data?: T, 
    options?: FunctionCallOptions
  ): Promise<R> {
    try {
      return await this.functionsService.callFunction<T, R>(functionName, data, options);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Function call failed: ${functionName}`);
    }
  }

  // ==================== STORAGE ====================
  
  /**
   * Upload a file to Firebase Storage
   */
  async uploadFile(
    path: string, 
    file: File, 
    options?: StorageOptions,
    onProgress?: (progress: number) => void
  ): Promise<{
    downloadURL: string;
    fullPath: string;
    size: number;
  }> {
    try {
      return await this.storageService.uploadFile(path, file, options, onProgress);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `File upload failed: ${path}`);
    }
  }

  /**
   * Delete a file from Firebase Storage
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await this.storageService.deleteFile(path);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `File deletion failed: ${path}`);
    }
  }

  /**
   * Get download URL for a file
   */
  async getDownloadURL(path: string): Promise<string> {
    try {
      return await this.storageService.getDownloadURL(path);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, `Failed to get download URL: ${path}`);
    }
  }

  // ==================== COMMON OPERATIONS ====================
  
  /**
   * Create a notification
   */
  async createNotification(notification: {
    title: string;
    message: string;
    recipientIds: string[];
    priority: 'low' | 'medium' | 'high' | 'urgent';
    type: 'system' | 'member_note' | 'staff_note' | 'reminder';
    actionUrl?: string;
    createdBy: string;
  }): Promise<string> {
    try {
      const notificationData = {
        ...notification,
        createdAt: new Date(),
        read: false,
        metadata: {}
      };

      return await this.createDocument('notifications', notificationData);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Failed to create notification');
    }
  }

  /**
   * Log user activity
   */
  async logActivity(activity: {
    userId: string;
    userEmail: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
  }): Promise<void> {
    try {
      const activityData = {
        ...activity,
        timestamp: new Date(),
        ipAddress: undefined, // Could be populated from request
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      };

      await this.createDocument('activityLogs', activityData);
    } catch (error) {
      // Don't throw on activity logging failures
      console.warn('Failed to log activity:', error);
    }
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<FirestoreDocument<any>[]> {
    try {
      const queryOptions: QueryOptions = {
        where: [
          { field: 'recipientIds', operator: 'array-contains', value: userId }
        ],
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        limit: options?.limit || 50
      };

      if (options?.unreadOnly) {
        queryOptions.where!.push({ field: 'read', operator: '==', value: false });
      }

      return await this.queryDocuments('notifications', queryOptions);
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Failed to get user notifications');
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      await this.updateDocument('notifications', notificationId, { read: true });
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Failed to mark notification as read');
    }
  }

  // ==================== HEALTH & MONITORING ====================
  
  /**
   * Test Firebase connectivity
   */
  async testConnectivity(): Promise<{
    auth: boolean;
    firestore: boolean;
    functions: boolean;
    storage: boolean;
  }> {
    const results = {
      auth: false,
      firestore: false,
      functions: false,
      storage: false
    };

    try {
      // Test Auth
      results.auth = this.authService.isInitialized();
      
      // Test Firestore
      await this.firestoreService.testConnection();
      results.firestore = true;
      
      // Test Functions
      results.functions = this.functionsService.isAvailable();
      
      // Test Storage
      results.storage = this.storageService.isAvailable();
      
    } catch (error) {
      console.warn('Firebase connectivity test failed:', error);
    }

    return results;
  }

  /**
   * Get service health information
   */
  getHealthInfo(): {
    isConnected: boolean;
    services: string[];
    lastActivity: Date | null;
  } {
    return {
      isConnected: this.authService.isInitialized(),
      services: ['auth', 'firestore', 'functions', 'storage'],
      lastActivity: new Date() // Could track actual last activity
    };
  }
}