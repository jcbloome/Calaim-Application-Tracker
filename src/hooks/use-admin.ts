
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  user: User | null;
}

export function useAdmin(): AdminStatus {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    if (isUserLoading) {
      // If user is still loading, we can't check roles yet.
      setIsRoleLoading(true);
      return;
    }

    if (!user) {
      // No user, so no admin roles.
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsRoleLoading(false);
      return;
    }
    
    if (!firestore) {
      // Firestore not ready, wait.
      setIsRoleLoading(true);
      return;
    }
    
    // For all other users, check Firestore.
    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef).catch(err => {
            // If we get a permission error reading the admin role, it means the user is not an admin.
            // We can treat this as a non-fatal condition and assume the document doesn't exist for this user.
            if (err.code === 'permission-denied') {
              return null; // Return null to indicate non-existence due to permissions
            }
            // For other errors, re-throw them.
            throw err;
          }),
          getDoc(superAdminRef).catch(err => {
            // Same logic for super admin role
            if (err.code === 'permission-denied') {
              return null;
            }
            throw err;
          })
        ]);
        
        const hasSuperAdminRole = superAdminSnap?.exists() ?? false;
        // A super admin is also an admin.
        const hasAdminRole = (adminSnap?.exists() ?? false) || hasSuperAdminRole;
        
        setIsAdmin(hasAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);

      } catch (error: any) {
        // This will now only catch unexpected errors, not permission-denied ones.
        // If a real error happens (e.g., network), we should log it but not necessarily block the UI.
        console.error("useAdmin: Error checking roles:", error);
        // We can still create a contextual error if needed, but for now, we'll just fail gracefully.
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        setIsRoleLoading(false);
      }
    };

    checkRoles();
    
  }, [user, isUserLoading, firestore]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isLoading: isUserLoading || isRoleLoading,
  };
}
