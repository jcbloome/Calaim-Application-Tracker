
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
  const [roles, setRoles] = useState<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    isAdmin: false,
    isSuperAdmin: false,
  });
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    if (isUserLoading) {
      // If user auth state is loading, role loading must also wait.
      setIsRoleLoading(true);
      return;
    }

    if (!user) {
      // No user, so no roles to check. Loading is finished.
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }
    
    if (!firestore) {
      // Firestore not ready, can't check roles yet.
      setIsRoleLoading(true);
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      // Start loading roles for the current user.
      if (isMounted) setIsRoleLoading(true);

      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef),
        ]);

        if (isMounted) {
          const hasSuperAdminRole = superAdminSnap.exists();
          // An admin is either in the admin role OR the super admin role.
          const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;
          
          setRoles({
            isAdmin: hasAdminRole,
            isSuperAdmin: hasSuperAdminRole,
          });
        }
      } catch (error) {
        console.error("useAdmin: Error checking admin roles:", error);
        if (isMounted) {
          setRoles({ isAdmin: false, isSuperAdmin: false });
        }
      } finally {
        // Finished checking roles.
        if (isMounted) {
          setIsRoleLoading(false);
        }
      }
    };

    checkRoles();

    return () => {
      isMounted = false;
    };
  }, [user, isUserLoading, firestore]);

  return {
    user,
    // Return final role status
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
    // The overall loading state is true if either the user is loading OR role-checking is in progress.
    isLoading: isUserLoading || isRoleLoading,
  };
}
