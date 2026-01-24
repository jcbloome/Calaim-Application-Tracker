// Firebase Authentication Service
// Handles user authentication, admin permissions, and user management

import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';
import { doc, getDoc, Firestore } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { FirebaseErrorHandler } from '../utils/errorHandler';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import type { FirebaseUser, AdminRole } from '../types';

export class AuthService {
  private auth: Auth;
  private firestore: Firestore;
  private currentUser: FirebaseUser | null = null;
  private authStateListeners: ((user: FirebaseUser | null) => void)[] = [];

  constructor() {
    this.auth = auth;
    this.firestore = db;
    this.initializeAuthStateListener();
  }

  /**
   * Initialize auth state listener
   */
  private initializeAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (user) => {
      if (user) {
        // Enhance user with admin permissions
        const enhancedUser = await this.enhanceUserWithPermissions(user);
        this.currentUser = enhancedUser;
      } else {
        this.currentUser = null;
      }

      // Notify all listeners
      this.authStateListeners.forEach(listener => listener(this.currentUser));
    });
  }

  /**
   * Enhance user object with admin permissions
   */
  private async enhanceUserWithPermissions(user: User): Promise<FirebaseUser> {
    try {
      const permissions = await this.checkAdminPermissions(user.uid);
      
      return {
        ...user,
        isAdmin: permissions.isAdmin,
        isSuperAdmin: permissions.isSuperAdmin,
        roles: permissions.roles.map(roleName => ({
          id: roleName,
          name: roleName as any,
          permissions: [],
          assignedAt: new Date(),
          assignedBy: 'system'
        })),
        lastLoginAt: new Date(),
        createdAt: user.metadata.creationTime ? new Date(user.metadata.creationTime) : new Date()
      } as FirebaseUser;
    } catch (error) {
      console.warn('Failed to enhance user with permissions:', error);
      return user as FirebaseUser;
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmailAndPassword(email: string, password: string): Promise<FirebaseUser> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const enhancedUser = await this.enhanceUserWithPermissions(userCredential.user);
      
      // Log the login activity
      await this.logLoginActivity(enhancedUser);
      
      return enhancedUser;
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Sign in failed');
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.currentUser = null;
    } catch (error) {
      throw FirebaseErrorHandler.handle(error, 'Sign out failed');
    }
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): FirebaseUser | null {
    return this.currentUser;
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
      // Check hardcoded admin email first
      const user = this.auth.currentUser;
      if (isHardcodedAdminEmail(user?.email)) {
        return {
          isAdmin: true,
          isSuperAdmin: true,
          roles: ['admin', 'super_admin']
        };
      }

      // Check Firestore roles
      const [adminDoc, superAdminDoc] = await Promise.all([
        getDoc(doc(this.firestore, 'roles_admin', userId)),
        getDoc(doc(this.firestore, 'roles_super_admin', userId))
      ]);

      const hasAdminRole = adminDoc.exists();
      const hasSuperAdminRole = superAdminDoc.exists();
      
      const roles: string[] = [];
      if (hasAdminRole) roles.push('admin');
      if (hasSuperAdminRole) roles.push('super_admin');

      return {
        isAdmin: hasAdminRole || hasSuperAdminRole,
        isSuperAdmin: hasSuperAdminRole,
        roles
      };
    } catch (error) {
      console.error('Error checking admin permissions:', error);
      return {
        isAdmin: false,
        isSuperAdmin: false,
        roles: []
      };
    }
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: FirebaseUser | null) => void): () => void {
    this.authStateListeners.push(callback);
    
    // Call immediately with current state
    callback(this.currentUser);
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  /**
   * Check if user is admin
   */
  isAdmin(): boolean {
    return this.currentUser?.isAdmin || false;
  }

  /**
   * Check if user is super admin
   */
  isSuperAdmin(): boolean {
    return this.currentUser?.isSuperAdmin || false;
  }

  /**
   * Get user roles
   */
  getUserRoles(): string[] {
    return this.currentUser?.roles?.map(role => role.name) || [];
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    if (!this.currentUser?.roles) return false;
    
    return this.currentUser.roles.some(role => 
      role.permissions.includes(permission)
    );
  }

  /**
   * Log login activity
   */
  private async logLoginActivity(user: FirebaseUser): Promise<void> {
    try {
      // This would integrate with your activity logging system
      console.log(`✅ User logged in: ${user.email}`);
      
      // TODO: Implement actual activity logging
      // await this.firestoreService.createDocument('loginLogs', {
      //   userId: user.uid,
      //   email: user.email,
      //   displayName: user.displayName,
      //   role: user.isAdmin ? 'Admin' : 'User',
      //   timestamp: new Date()
      // });
    } catch (error) {
      console.warn('Failed to log login activity:', error);
    }
  }

  /**
   * Refresh user permissions
   */
  async refreshPermissions(): Promise<void> {
    if (this.currentUser) {
      const permissions = await this.checkAdminPermissions(this.currentUser.uid);
      this.currentUser.isAdmin = permissions.isAdmin;
      this.currentUser.isSuperAdmin = permissions.isSuperAdmin;
      
      // Notify listeners of the update
      this.authStateListeners.forEach(listener => listener(this.currentUser));
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.auth !== null && this.firestore !== null;
  }

  /**
   * Get authentication state
   */
  getAuthState(): {
    isAuthenticated: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    user: FirebaseUser | null;
    loading: boolean;
  } {
    return {
      isAuthenticated: this.isAuthenticated(),
      isAdmin: this.isAdmin(),
      isSuperAdmin: this.isSuperAdmin(),
      user: this.currentUser,
      loading: false // Could implement actual loading state
    };
  }
}