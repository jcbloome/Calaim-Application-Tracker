// Admin Permissions Hook - Manages admin role checking and permissions

'use client';

import { useState, useEffect, useCallback } from 'react';
import { FirebaseService } from '../services/FirebaseService';
import { useFirebaseAuth } from './useFirebaseAuth';
import type { FirebaseError } from '../types';

interface UseAdminPermissionsReturn {
  // Permission state
  isAdmin: boolean;
  isSuperAdmin: boolean;
  roles: string[];
  permissions: string[];
  
  // Loading state
  isLoading: boolean;
  
  // Error handling
  error: FirebaseError | null;
  
  // Actions
  refreshPermissions: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  clearError: () => void;
}

export function useAdminPermissions(): UseAdminPermissionsReturn {
  const { user, isAuthenticated } = useFirebaseAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FirebaseError | null>(null);
  
  const firebaseService = FirebaseService.getInstance();

  // Check permissions
  const checkPermissions = useCallback(async () => {
    if (!user?.uid) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRoles([]);
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const adminCheck = await firebaseService.checkAdminPermissions(user.uid);
      
      setIsAdmin(adminCheck.isAdmin);
      setIsSuperAdmin(adminCheck.isSuperAdmin);
      setRoles(adminCheck.roles);
      
      // Set permissions based on roles
      const userPermissions: string[] = [];
      if (adminCheck.isAdmin) {
        userPermissions.push('read:applications', 'write:applications', 'access:admin');
      }
      if (adminCheck.isSuperAdmin) {
        userPermissions.push('access:super_admin', 'manage:roles', 'view:analytics');
      }
      setPermissions(userPermissions);
      
      console.log(`✅ Permissions checked for user ${user.uid}:`, {
        isAdmin: adminCheck.isAdmin,
        isSuperAdmin: adminCheck.isSuperAdmin,
        roles: adminCheck.roles
      });
    } catch (err) {
      const firebaseError = err as FirebaseError;
      setError(firebaseError);
      console.error('❌ Failed to check admin permissions:', firebaseError);
      
      // Set safe defaults on error
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRoles([]);
      setPermissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseService, user?.uid]);

  // Refresh permissions
  const refreshPermissions = useCallback(async () => {
    await checkPermissions();
  }, [checkPermissions]);

  // Check if user has specific permission
  const hasPermission = useCallback((permission: string): boolean => {
    return permissions.includes(permission);
  }, [permissions]);

  // Check if user has specific role
  const hasRole = useCallback((role: string): boolean => {
    return roles.includes(role);
  }, [roles]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check permissions when user changes
  useEffect(() => {
    if (isAuthenticated) {
      checkPermissions();
    } else {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRoles([]);
      setPermissions([]);
      setIsLoading(false);
    }
  }, [isAuthenticated, checkPermissions]);

  return {
    // Permission state
    isAdmin,
    isSuperAdmin,
    roles,
    permissions,
    
    // Loading state
    isLoading,
    
    // Error handling
    error,
    
    // Actions
    refreshPermissions,
    hasPermission,
    hasRole,
    clearError
  };
}