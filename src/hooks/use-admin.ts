
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
  const [adminStatus, setAdminStatus] = useState<Omit<AdminStatus, 'user'>>({
    isAdmin: false,
    isSuperAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    // isLoading should be true if either the user is loading or we haven't checked roles yet.
    const combinedLoading = isUserLoading || adminStatus.isLoading;

    if (isUserLoading) {
      // If user state is loading, we are loading.
      if (!adminStatus.isLoading) {
        setAdminStatus(s => ({ ...s, isLoading: true }));
      }
      return;
    }

    if (!user) {
      // If no user, they are not an admin, and we are done loading.
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    if (!firestore) {
      console.warn("useAdmin: Firestore service not available.");
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);
        
        if (isMounted) {
            const hasSuperAdminRole = superAdminSnap.exists();
            const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;
            setAdminStatus({
                isAdmin: hasAdminRole,
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
    }
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}
