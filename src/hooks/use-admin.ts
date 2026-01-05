
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
      setIsRoleLoading(true);
      return;
    }

    if (!user) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsRoleLoading(false);
      return;
    }
    
    if (!firestore) {
      setIsRoleLoading(true);
      return;
    }
    
    const checkRoles = async () => {
      setIsRoleLoading(true);
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        // Await both promises. If security rules are correct, these will succeed.
        // If they fail due to permissions, the catch block will handle it.
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);
        
        const hasSuperAdminRole = superAdminSnap.exists();
        // A super admin is implicitly a regular admin.
        const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;
        
        setIsAdmin(hasAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);

      } catch (error: any) {
        console.error("useAdmin: Error checking roles:", error);
        // If any error occurs (including permissions), default to non-admin roles.
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
