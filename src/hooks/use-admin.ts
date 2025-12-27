
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
    // The main loading state is now a combination of the user loading and the roles check.
    // If the useUser hook is still loading, we should wait.
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    // If there is no user, they cannot be an admin. We are done loading.
    if (!user) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    // If there is a user but Firestore is not ready, we can't check roles.
    // Treat as non-admin for now and stop loading.
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

        // Fetch both role documents in parallel.
        const [adminSnap, superAdminSnap] = await Promise.all([
          getDoc(adminRef),
          getDoc(superAdminRef)
        ]);

        if (isMounted) {
          const hasAdminRole = adminSnap.exists();
          const hasSuperAdminRole = superAdminSnap.exists();
          
          setAdminStatus({
            isAdmin: hasAdminRole || hasSuperAdminRole,
            isSuperAdmin: hasSuperAdminRole,
            isLoading: false, // Finished loading roles
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
  // This effect depends ONLY on the user object from useUser and the firestore instance.
  // It will re-run only if the user logs in/out or firestore becomes available.
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}
