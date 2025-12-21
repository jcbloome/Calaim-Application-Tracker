
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useAdmin(): AdminStatus & { user: ReturnType<typeof useUser>['user'] } {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: false,
    isSuperAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    if (!user || !firestore) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);

        const hasAdminRole = adminSnap.exists();
        const hasSuperAdminRole = superAdminSnap.exists();

        setAdminStatus({
          isAdmin: hasAdminRole || hasSuperAdminRole, // A super admin is also an admin
          isSuperAdmin: hasSuperAdminRole,
          isLoading: false,
        });

      } catch (error) {
        console.error("Error checking admin roles:", error);
        setAdminStatus({
          isAdmin: false,
          isSuperAdmin: false,
          isLoading: false,
        });
      }
    };

    checkRoles();
    
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}
