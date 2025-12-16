'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import { useRouter } from 'next/navigation';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

export function useAdmin(): AdminStatus & { user: ReturnType<typeof useUser>['user'] } {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: false,
    isSuperAdmin: false,
    isLoading: true,
  });

  useEffect(() => {
    if (isUserLoading) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: true });
      return;
    }

    if (!user || !firestore) {
      setAdminStatus({ isAdmin: false, isSuperAdmin: false, isLoading: false });
      return;
    }

    const adminRef = doc(firestore, 'roles_admin', user.uid);
    const superAdminRef = doc(firestore, 'roles_super_admin', user.uid);

    const unsubAdmin = onSnapshot(adminRef, (doc) => {
      setAdminStatus(prev => ({ ...prev, isAdmin: doc.exists() }));
    });

    const unsubSuperAdmin = onSnapshot(superAdminRef, (doc) => {
      setAdminStatus(prev => ({ ...prev, isSuperAdmin: doc.exists(), isLoading: false }));
    });

    return () => {
      unsubAdmin();
      unsubSuperAdmin();
    };
  }, [user, isUserLoading, firestore, router]);

  return { ...adminStatus, user };
}
