
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
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
          getDoc(adminRef),
          getDoc(superAdminRef),
        ]);
        
        const hasSuperAdminRole = superAdminSnap.exists();
        // A super admin is also an admin.
        const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;
        
        setIsAdmin(hasAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);

      } catch (error) {
        console.error("useAdmin: Error checking roles:", error);
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
