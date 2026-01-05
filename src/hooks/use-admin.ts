
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
  const [adminStatus, setAdminStatus] = useState<Omit<AdminStatus, 'user' | 'isLoading'>>({
    isAdmin: false,
    isSuperAdmin: false,
  });
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    // If the main user hook is loading, then role loading is implicitly true.
    if (isUserLoading) {
      setIsRoleLoading(true);
      return;
    }

    // If there's no user, roles are known (false) and we're not loading.
    if (!user) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }

    // If firestore isn't ready, we can't check roles.
    if (!firestore) {
      console.warn("useAdmin: Firestore service not available.");
      setAdminStatus({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      // Start loading roles for the current user.
      setIsRoleLoading(true);
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);
        
        if (isMounted) {
            const hasSuperAdminRole = superAdminSnap.exists();
            // User is an admin if they have the admin OR super_admin role.
            const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;
            setAdminStatus({
                isAdmin: hasAdminRole,
                isSuperAdmin: hasSuperAdminRole,
            });
        }
      } catch (error) {
        console.error("useAdmin: Error checking admin roles:", error);
         if (isMounted) {
            setAdminStatus({
              isAdmin: false,
              isSuperAdmin: false,
            });
         }
      } finally {
        if (isMounted) {
          // Finished loading roles.
          setIsRoleLoading(false);
        }
      }
    };

    checkRoles();
    
    return () => {
        isMounted = false;
    }
  }, [user, isUserLoading, firestore]);

  // The overall loading state is true if either the user is loading OR the roles are loading.
  const isLoading = isUserLoading || isRoleLoading;

  return { ...adminStatus, user, isLoading };
}
