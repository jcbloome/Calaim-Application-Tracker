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
      // If the user object itself is loading, we must wait.
      // Set role loading to true as well, as we can't check roles without a user.
      setIsRoleLoading(true);
      return;
    }

    if (!user) {
      // If there is no user, they definitely have no roles. We are done loading.
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }
    
    if (!firestore) {
      // If firestore isn't ready, we also can't proceed.
      // This might happen on initial load.
      setIsRoleLoading(false); // Can't load roles, so stop loading.
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      // Start the role checking process, so set loading to true.
      setIsRoleLoading(true);
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        // Fetch both role documents concurrently.
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
        // No matter the outcome, role checking is complete.
        if (isMounted) {
          setIsRoleLoading(false);
        }
      }
    };

    checkRoles();

    return () => {
      // Cleanup function to prevent state updates on an unmounted component.
      isMounted = false;
    };
  }, [user, isUserLoading, firestore]);

  return {
    user,
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
    // The overall loading state is true if either the user is loading OR the roles are loading.
    isLoading: isUserLoading || isRoleLoading,
  };
}
