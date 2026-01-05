
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

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Start by assuming the user is not an admin, and we are loading.
    setIsLoading(true);
    setIsAdmin(false);
    setIsSuperAdmin(false);

    // If the main user hook is still loading, we wait.
    if (isUserLoading) {
      return;
    }

    // If there's no user, they are definitely not an admin.
    if (!user || !firestore) {
      setIsLoading(false);
      return;
    }

    // User is logged in, now check their roles from Firestore.
    const checkAdminStatus = async () => {
      try {
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminDoc, superAdminDoc] = await Promise.all([
          getDoc(adminRoleRef),
          getDoc(superAdminRoleRef)
        ]);

        const hasAdminRole = adminDoc.exists();
        const hasSuperAdminRole = superAdminDoc.exists();

        setIsAdmin(hasAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);

      } catch (error) {
        console.error("Error checking admin status:", error);
        // In case of error, default to non-admin status for security.
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        // We are done loading roles.
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, isUserLoading, firestore]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    // The overall loading state is true if the user is loading OR the roles are loading.
    isLoading: isUserLoading || isLoading,
  };
}
