
'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useAdmin(): AdminStatus & { user: User | null } {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: false,
    isSuperAdmin: false,
    isLoading: true,
  });

  const checkRoles = useCallback(async (userToCheck: User) => {
    if (!firestore) {
      console.log('useAdmin: Firestore not available, cannot check roles.');
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }
    
    console.log(`useAdmin: Checking roles for user ${userToCheck.uid}`);
    setAdminStatus(prev => ({ ...prev, isLoading: true }));

    try {
      const adminRef = doc(firestore, 'roles_admin', userToCheck.uid);
      const superAdminRef = doc(firestore, 'roles_super_admin', userToCheck.uid);

      const [adminSnap, superAdminSnap] = await Promise.all([
        getDoc(adminRef),
        getDoc(superAdminRef)
      ]);

      const hasAdminRole = adminSnap.exists();
      const hasSuperAdminRole = superAdminSnap.exists();
      
      console.log(`useAdmin: Admin role: ${hasAdminRole}, Super Admin role: ${hasSuperAdminRole}`);

      setAdminStatus({
        isAdmin: hasAdminRole || hasSuperAdminRole, // Super admin is also an admin
        isSuperAdmin: hasSuperAdminRole,
        isLoading: false,
      });

    } catch (error) {
      console.error("useAdmin: Error checking admin roles:", error);
      setAdminStatus({
        isAdmin: false,
        isSuperAdmin: false,
        isLoading: false,
      });
    }
  }, [firestore]);


  useEffect(() => {
    // Show loading state while the user object is being loaded.
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    // If loading is done and there is a user, check their roles.
    if (user) {
      checkRoles(user);
    } else {
      // If loading is done and there is no user, they are not an admin.
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
    }
    
  }, [user, isUserLoading, checkRoles]);

  return { ...adminStatus, user };
}
