
'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Start loading whenever the user or loading status changes.
    setAdminStatus(prev => ({ ...prev, isLoading: true }));

    if (isUserLoading) {
      // If the parent user hook is loading, we are also loading.
      return;
    }

    if (!user) {
      // If there's no user, they have no roles, and we are done loading.
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    if (!firestore) {
      // If firestore isn't ready, we can't check roles. Stop loading.
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        // Fetch both role documents in parallel.
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);

        if (isMounted) {
          const hasAdminRole = adminSnap.exists();
          const hasSuperAdminRole = superAdminSnap.exists();
          
          setAdminStatus({
            // An admin is someone with either a super admin OR a regular admin role.
            isAdmin: hasAdminRole || hasSuperAdminRole,
            isSuperAdmin: hasSuperAdminRole,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error("useAdmin: Error checking admin roles:", error);
        if (isMounted) {
          setAdminStatus({
            isAdmin: false,
            isSuperAdmin: false,
            isLoading: false,
          });
        }
      }
    };

    checkRoles();

    return () => {
      isMounted = false;
    };
    // This effect should ONLY depend on the user object and the loading state from useUser.
    // Including adminStatus in the dependency array was causing an infinite loop.
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}

