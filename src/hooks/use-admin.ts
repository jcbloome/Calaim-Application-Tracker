
'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useFirestore } from '@/firebase';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isClaimsStaff: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  user: User | null;
}

export function useAdmin(): AdminStatus {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isClaimsStaff, setIsClaimsStaff] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 useAdmin Debug:', {
      isUserLoading,
      userEmail: user?.email,
      userExists: !!user,
      timestamp: new Date().toLocaleTimeString()
    });

    if (isUserLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      console.log('🚫 useAdmin: No user found');
      setIsLoading(false);
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setIsClaimsStaff(false);
      return;
    }

    const checkAdminRoles = async () => {
      const isEmailAdmin = isHardcodedAdminEmail(user.email);

      // Fast-path: if custom claims are present, trust them (avoids Firestore-permission issues).
      // These claims are set by `/api/auth/admin-session` during login.
      try {
        const tokenResult = await user.getIdTokenResult();
        const claims = (tokenResult?.claims || {}) as Record<string, any>;
        const hasAdminClaim = Boolean(claims.admin);
        const hasSuperAdminClaim = Boolean(claims.superAdmin);
        if (hasAdminClaim || hasSuperAdminClaim) {
          setIsAdmin(true);
          const nextSuper = Boolean(isEmailAdmin || hasSuperAdminClaim);
          setIsSuperAdmin(nextSuper);
          setIsClaimsStaff(nextSuper);
          setIsLoading(false);
          return;
        }
      } catch (claimError) {
        console.warn('⚠️ useAdmin: Failed to read token claims', claimError);
      }

      // Email allow-list always wins.
      if (isEmailAdmin) {
        setIsAdmin(true);
        setIsSuperAdmin(true);
        setIsClaimsStaff(true);
        setIsLoading(false);
        return;
      }

      if (!firestore) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsClaimsStaff(false);
        setIsLoading(false);
        return;
      }

      try {
        const normalizedEmail = (user.email || '').trim().toLowerCase();
        const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', user.uid);

        const [adminDoc, superAdminDoc, userDoc] = await Promise.all([
          getDoc(adminRoleRef),
          getDoc(superAdminRoleRef),
          getDoc(doc(firestore, 'users', user.uid)).catch(() => null as any),
        ]);

        let isAdminUser = isEmailAdmin || adminDoc.exists() || superAdminDoc.exists();
        let isSuperAdminUser = isEmailAdmin || superAdminDoc.exists();

        // Backward-compat: some roles were stored by email instead of UID.
        if (!isAdminUser && normalizedEmail) {
          const [emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
            getDoc(doc(firestore, 'roles_admin', normalizedEmail)),
            getDoc(doc(firestore, 'roles_super_admin', normalizedEmail))
          ]);
          isAdminUser = emailAdminDoc.exists() || emailSuperAdminDoc.exists();
          isSuperAdminUser = isSuperAdminUser || emailSuperAdminDoc.exists();
        }

        console.log('🔍 useAdmin: Admin check result:', {
          userEmail: user.email,
          isAdminUser,
          isSuperAdminUser
        });

        setIsAdmin(isAdminUser);
        setIsSuperAdmin(isSuperAdminUser);
        // Claims access: super admins always allowed; other staff use `users/{uid}.isClaimsStaff`.
        const userData = userDoc && typeof userDoc?.exists === 'function' && userDoc.exists() ? (userDoc.data() as any) : null;
        setIsClaimsStaff(Boolean(isSuperAdminUser || userData?.isClaimsStaff));
      } catch (error) {
        console.error('❌ useAdmin: Error checking admin roles', error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setIsClaimsStaff(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminRoles();
  }, [user, isUserLoading, firestore]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isClaimsStaff,
    isLoading: isUserLoading || isLoading,
    isUserLoading,
  };
}
