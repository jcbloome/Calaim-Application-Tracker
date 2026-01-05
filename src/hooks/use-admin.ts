
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
      setIsRoleLoading(true);
      return;
    }

    if (!user) {
      setRoles({ isAdmin: false, isSuperAdmin: false });
      setIsRoleLoading(false);
      return;
    }
    
    // --- TEMPORARY HARDCODE ---
    if (user.email === 'jason@carehomefinders.com') {
        setRoles({ isAdmin: true, isSuperAdmin: true });
        setIsRoleLoading(false);
        return;
    }
    // --- END TEMPORARY HARDCODE ---
    
    if (!firestore) {
      setIsRoleLoading(false); 
      return;
    }

    let isMounted = true;
    const checkRoles = async () => {
      setIsRoleLoading(true);
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

  // --- TEMPORARY HARDCODE FOR RETURN ---
  if (user?.email === 'jason@carehomefinders.com') {
    return {
        user,
        isAdmin: true,
        isSuperAdmin: true,
        isLoading: false,
    }
  }
  // --- END TEMPORARY HARDCODE ---

  return {
    user,
    isAdmin: roles.isAdmin,
    isSuperAdmin: roles.isSuperAdmin,
    isLoading: isUserLoading || isRoleLoading,
  };
}
