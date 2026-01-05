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
    // Reset loading state whenever the user changes.
    setIsRoleLoading(true);

    if (isUserLoading) {
      // If the user object is still loading, we can't proceed.
      return;
    }

    if (!user) {
      // If there is no user, they have no roles. Loading is complete.
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }
    
    if (!firestore) {
      // If firestore isn't ready, we also can't proceed.
      setIsRoleLoading(false);
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef),
        ]);

        if (isMounted) {
          const hasSuperAdminRole = superAdminSnap.exists();
          // An admin is someone in either roles_admin or roles_super_admin.
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
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
    isLoading: isUserLoading || isRoleLoading,
  };
}
