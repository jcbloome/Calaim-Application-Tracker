
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
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }
    
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
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    if (user) {
      checkRoles(user);
    } else {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
    }
    
  }, [user, isUserLoading, checkRoles]);

  return { ...adminStatus, user };
}
