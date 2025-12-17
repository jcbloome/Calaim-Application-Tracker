
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useAdmin(): AdminStatus & { user: ReturnType<typeof useUser>['user'] } {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: false,
    isSuperAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    if (isUserLoading || !user || !firestore) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: isUserLoading });
      return;
    }

    const adminRef = doc(firestore, 'roles_admin', user.uid);
    const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

    let isAdmin = false;
    let isSuperAdmin = false;
    let adminCheckDone = false;
    let superAdminCheckDone = false;

    const checkCompletion = () => {
        if (adminCheckDone && superAdminCheckDone) {
            setAdminStatus({ isAdmin, isSuperAdmin, isLoading: false });
        }
    }

    const unsubAdmin = onSnapshot(adminRef, (doc) => {
        isAdmin = doc.exists();
        adminCheckDone = true;
        checkCompletion();
    });

    const unsubSuperAdmin = onSnapshot(superAdminRef, (doc) => {
        isSuperAdmin = doc.exists();
        superAdminCheckDone = true;
        checkCompletion();
    });

    return () => {
      unsubAdmin();
      unsubSuperAdmin();
    };
  }, [user, isUserLoading, firestore]);

  return { ...adminStatus, user };
}
