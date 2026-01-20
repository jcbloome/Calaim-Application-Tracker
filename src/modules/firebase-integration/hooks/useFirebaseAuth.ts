// Comprehensive Firebase Authentication Hook
// Replaces useAuth, useUser, useAdmin hooks throughout the app

'use client';

import { useState, useEffect, useCallback } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import type { FirebaseUser, FirebaseError } from '../types';

interface UseFirebaseAuthReturn {
  // User state
  user: FirebaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Admin state
  isAdmin: boolean;
  isSuperAdmin: boolean;
  roles: string[];
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  clearError: () => void;
  
  // Permissions
  hasPermission: (permission: string) => boolean;
  checkAdminAccess: () => boolean;
}

export function useFirebaseAuth(): UseFirebaseAuthReturn {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FirebaseError | null>(null);

  const firebaseService = FirebaseService.getInstance();

  // Initialize auth state listener
  useEffect(() => {
    const authService = (firebaseService as any).authService;
    
    const unsubscribe = authService.onAuthStateChange((newUser: FirebaseUser | null) => {
      setUser(newUser);
      setIsLoading(false);
      setError(null);
    });

    return unsubscribe;
  }, [firebaseService]);

  // Sign in function
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const signedInUser = await firebaseService.signIn(email, password);
      setUser(signedInUser);
      
      console.log('✅ User signed in successfully:', signedInUser.email);
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error('❌ Sign in failed:', firebaseError);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseService]);

  // Sign out function
  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await firebaseService.signOut();
      setUser(null);
      
      console.log('✅ User signed out successfully');
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error('❌ Sign out failed:', firebaseError);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseService]);

  // Refresh permissions
  const refreshPermissions = useCallback(async () => {
    if (!user) return;
    
    try {
      setError(null);
      
      const authService = (firebaseService as any).authService;
      await authService.refreshPermissions();
      
      console.log('✅ Permissions refreshed');
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error('❌ Permission refresh failed:', firebaseError);
    }
  }, [firebaseService, user]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check if user has specific permission
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user?.roles) return false;
    
    return user.roles.some(role => 
      role.permissions.includes(permission)
    );
  }, [user]);

  // Check admin access (for route protection)
  const checkAdminAccess = useCallback((): boolean => {
    return user?.isAdmin || false;
  }, [user]);

  // Derived state
  const isAuthenticated = user !== null;
  const isAdmin = user?.isAdmin || false;
  const isSuperAdmin = user?.isSuperAdmin || false;
  const roles = user?.roles?.map(role => role.name) || [];

  return {
    // User state
    user,
    isAuthenticated,
    isLoading,
    
    // Admin state
    isAdmin,
    isSuperAdmin,
    roles,
    
    // Error handling
    error,
    
    // Actions
    signIn,
    signOut,
    refreshPermissions,
    clearError,
    
    // Permissions
    hasPermission,
    checkAdminAccess
  };
}