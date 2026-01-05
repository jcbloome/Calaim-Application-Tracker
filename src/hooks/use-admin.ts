
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
    // If the main user hook is loading, we can't check roles yet.
    if (isUserLoading) {
      return;
    }

    // If there's no user, roles are definitively false and role loading is done.
    if (!user) {
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }

    // If firestore isn't ready, we can't check.
    if (!firestore) {
      console.warn("useAdmin: Firestore service not available, cannot check roles.");
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }

    // User and Firestore are ready, start the role check.
    setIsRoleLoading(true);
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

  // The final, consolidated loading state. It's loading if the user is loading OR the roles are loading.
  const isLoading = isUserLoading || isRoleLoading;

  return { 
    user, 
    isLoading,
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
  };
}
