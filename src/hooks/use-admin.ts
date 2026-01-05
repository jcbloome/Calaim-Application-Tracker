
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
    // If the main user hook is still loading, we are also loading.
    if (isUserLoading) {
      setIsRoleLoading(true);
      return;
    }

    // If there is no user, they have no roles. Stop loading.
    if (!user) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsRoleLoading(false);
      return;
    }
    
    // If firestore isn't ready, we can't check roles yet.
    if (!firestore) {
      setIsRoleLoading(true); // Remain in loading state
      return;
    }
    
    const checkRoles = async () => {
      setIsRoleLoading(true);
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        // Await both promises. This is safe because the rules allow reads.
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
        // If any error occurs (including permissions), default to non-admin roles for security.
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
