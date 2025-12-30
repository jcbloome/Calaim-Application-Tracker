
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
    if (isUserLoading) {
      setAdminStatus(s => ({ ...s, isLoading: true }));
      return;
    }

    if (!user) {
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
      // Ensure we don't run this check unnecessarily if component unmounts
      if (!isMounted) return;

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
