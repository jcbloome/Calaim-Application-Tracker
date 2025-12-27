
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
    // If the main user object is still loading, the admin status is also loading.
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    // If there's no user, they can't be an admin. We are done loading.
    if (!user) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    // If we have a user but no firestore instance, we can't check roles.
    if (!firestore) {
      console.warn("useAdmin: Firestore service not available.");
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    const checkRoles = async () => {
      try {
        const adminRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

        // Fetch both role documents in parallel for efficiency.
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);
        
        const hasSuperAdminRole = superAdminSnap.exists();
        // An admin is someone who is either in the admin role or is a super admin.
        const hasAdminRole = adminSnap.exists() || hasSuperAdminRole;

        setAdminStatus({
            isAdmin: hasAdminRole,
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
    };

    checkRoles();
  // This effect should ONLY re-run if the user's authentication state changes.
  // It does not depend on its own state. This breaks the infinite loop.
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}
