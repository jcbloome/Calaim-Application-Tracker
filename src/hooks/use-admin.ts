
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
  isUserLoading: boolean;
}

export function useAdmin(): AdminStatus {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setIsAdmin(false);
    setIsSuperAdmin(false);

    if (isUserLoading) {
      // Don't set loading to false here, wait for auth check to complete
      return;
    }

    if (!user || !firestore) {
      setIsLoading(false);
      return;
    }

    const checkAdminStatus = async () => {
      try {
        // The primary user is hardcoded as an admin in firestore.rules
        if (user.email === 'jason@carehomefinders.com') {
            setIsAdmin(true);
            setIsSuperAdmin(true); // Treat the hardcoded admin as super admin initially
            return;
        }

        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminDoc, superAdminDoc] = await Promise.all([
          getDoc(adminRoleRef),
          getDoc(superAdminRoleRef)
        ]);

        const hasAdminRole = adminDoc.exists();
        const hasSuperAdminRole = superAdminDoc.exists();
        
        // A super admin is always a regular admin.
        setIsAdmin(hasAdminRole || hasSuperAdminRole);
        setIsSuperAdmin(hasSuperAdminRole);

      } catch (error) {
        console.error("Error checking admin status:", error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminStatus();
  }, [user, isUserLoading, firestore]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isLoading: isUserLoading || isLoading,
    isUserLoading: isUserLoading,
  };
}
