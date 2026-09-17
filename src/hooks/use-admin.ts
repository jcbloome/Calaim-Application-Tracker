'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { FirebaseContext } from '@/firebase/provider';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';
import { isBlockedPortalEmail } from '@/lib/blocked-portal-emails';
import type { User } from 'firebase/auth';

interface AdminStatus {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isKaiserManager: boolean;
  isClaimsStaff: boolean;
  isIlsStaff: boolean;
  canAccessAllTools: boolean;
  canAccessIlsPackagePortal: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  user: User | null;
}

type RoleCache = {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isKaiserManager: boolean;
  isClaimsStaff: boolean;
  isIlsStaff: boolean;
  canAccessAllTools: boolean;
  canAccessIlsPackagePortal: boolean;
};

const EMPTY_ROLES: RoleCache = {
  isAdmin: false,
  isSuperAdmin: false,
  isKaiserManager: false,
  isClaimsStaff: false,
  isIlsStaff: false,
  canAccessAllTools: false,
  canAccessIlsPackagePortal: false,
};

export function useAdmin(): AdminStatus {
  const firebaseContext = useContext(FirebaseContext) as any;
  const user = (firebaseContext?.user as User | null) || null;
  const isUserLoading = Boolean(firebaseContext?.isUserLoading);
  const firestore = firebaseContext?.firestore;
  const hasFirebaseContext = firebaseContext !== undefined;
  const lastKnownRoleRef = useRef<RoleCache>({ ...EMPTY_ROLES });

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isKaiserManager, setIsKaiserManager] = useState(false);
  const [isClaimsStaff, setIsClaimsStaff] = useState(false);
  const [isIlsStaff, setIsIlsStaff] = useState(false);
  const [canAccessAllTools, setCanAccessAllTools] = useState(false);
  const [canAccessIlsPackagePortal, setCanAccessIlsPackagePortal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const safeLocalStorageGet = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const applyRoleState = (next: RoleCache) => {
    setIsAdmin(next.isAdmin);
    setIsSuperAdmin(next.isSuperAdmin);
    setIsKaiserManager(next.isKaiserManager);
    setIsClaimsStaff(next.isClaimsStaff);
    setIsIlsStaff(next.isIlsStaff);
    setCanAccessAllTools(next.canAccessAllTools);
    setCanAccessIlsPackagePortal(next.canAccessIlsPackagePortal);
    lastKnownRoleRef.current = next;
  };

  useEffect(() => {
    if (!hasFirebaseContext) {
      setIsLoading(false);
      applyRoleState({ ...EMPTY_ROLES });
      return;
    }

    if (isUserLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      setIsLoading(false);
      applyRoleState({ ...EMPTY_ROLES });
      return;
    }

    const checkAdminRoles = async () => {
      if (isBlockedPortalEmail(user.email)) {
        applyRoleState({ ...EMPTY_ROLES });
        setIsLoading(false);
        return;
      }

      const isEmailAdmin = isHardcodedAdminEmail(user.email);

      try {
        let tokenResult = await user.getIdTokenResult();
        let claims = (tokenResult?.claims || {}) as Record<string, any>;
        let hasAdminClaim = Boolean(claims.admin);
        let hasSuperAdminClaim = Boolean(claims.superAdmin);
        if (!hasAdminClaim && !hasSuperAdminClaim) {
          try {
            await user.getIdToken(true);
            tokenResult = await user.getIdTokenResult();
            claims = (tokenResult?.claims || {}) as Record<string, any>;
            hasAdminClaim = Boolean(claims.admin);
            hasSuperAdminClaim = Boolean(claims.superAdmin);
          } catch {
            // keep first-pass claims
          }
        }
        if (hasAdminClaim || hasSuperAdminClaim) {
          const nextSuper = Boolean(isEmailAdmin || hasSuperAdminClaim);
          let toolsFlag = true;
          let claimsFlag = nextSuper;
          let kaiserMgr = Boolean((claims as any)?.kaiserManager);
          let ilsStaff = nextSuper;
          let ilsPortal = nextSuper;
          if (firestore) {
            try {
              const userDoc = await getDoc(doc(firestore, 'users', user.uid));
              const userData = userDoc.exists() ? (userDoc.data() as any) : null;
              if (userData) {
                claimsFlag = Boolean(nextSuper || userData?.isClaimsStaff);
                kaiserMgr = Boolean(userData?.isKaiserManager || kaiserMgr);
                ilsStaff = Boolean(nextSuper || userData?.isIlsStaff);
                ilsPortal = Boolean(
                  nextSuper || userData?.canAccessIlsPackagePortal || userData?.isIlsStaff
                );
                toolsFlag = true;
              }
            } catch {
              // ignore
            }
          }
          applyRoleState({
            isAdmin: true,
            isSuperAdmin: nextSuper,
            isKaiserManager: kaiserMgr,
            isClaimsStaff: claimsFlag,
            isIlsStaff: ilsStaff,
            canAccessAllTools: toolsFlag,
            canAccessIlsPackagePortal: ilsPortal,
          });
          setIsLoading(false);
          return;
        }
      } catch (claimError) {
        console.warn('⚠️ useAdmin: Failed to read token claims', claimError);
      }

      if (isEmailAdmin) {
        applyRoleState({
          isAdmin: true,
          isSuperAdmin: true,
          isKaiserManager: false,
          isClaimsStaff: true,
          isIlsStaff: true,
          canAccessAllTools: true,
          canAccessIlsPackagePortal: true,
        });
        setIsLoading(false);
        return;
      }

      if (!firestore) {
        applyRoleState({ ...EMPTY_ROLES });
        setIsLoading(false);
        return;
      }

      try {
        const normalizedEmail = (user.email || '').trim().toLowerCase();
        const [adminDoc, superAdminDoc, userDoc] = await Promise.all([
          getDoc(doc(firestore, 'roles_admin', user.uid)),
          getDoc(doc(firestore, 'roles_super_admin', user.uid)),
          getDoc(doc(firestore, 'users', user.uid)),
        ]);

        let isAdminUser = isEmailAdmin || adminDoc.exists() || superAdminDoc.exists();
        let isSuperAdminUser = isEmailAdmin || superAdminDoc.exists();

        if (!isAdminUser && normalizedEmail) {
          const [emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
            getDoc(doc(firestore, 'roles_admin', normalizedEmail)),
            getDoc(doc(firestore, 'roles_super_admin', normalizedEmail)),
          ]);
          isAdminUser = emailAdminDoc.exists() || emailSuperAdminDoc.exists();
          isSuperAdminUser = isSuperAdminUser || emailSuperAdminDoc.exists();
        }

        const userData =
          userDoc && typeof userDoc?.exists === 'function' && userDoc.exists()
            ? (userDoc.data() as any)
            : null;
        const roleLabel = String(userData?.role || '').trim().toLowerCase();
        const isStaffFlag = Boolean(userData?.isStaff);
        const roleAllowsAdmin = ['staff', 'admin', 'super admin', 'super_admin'].includes(roleLabel);
        // ILS-only staff: do not auto-promote to full admin from isStaff alone.
        const isIlsOnly =
          Boolean(userData?.isIlsStaff || userData?.canAccessIlsPackagePortal) &&
          !userData?.canAccessAllTools &&
          !adminDoc.exists() &&
          !superAdminDoc.exists() &&
          roleLabel !== 'admin' &&
          roleLabel !== 'super admin' &&
          roleLabel !== 'super_admin';

        if (!isAdminUser && (isStaffFlag || roleAllowsAdmin) && !isIlsOnly) {
          isAdminUser = true;
        }
        if (!isSuperAdminUser && (roleLabel === 'super admin' || roleLabel === 'super_admin')) {
          isSuperAdminUser = true;
        }
        const nextKaiserManager = Boolean(
          userData?.isKaiserManager || roleLabel.includes('kaiser manager')
        );
        const nextClaimsStaff = Boolean(isSuperAdminUser || userData?.isClaimsStaff);
        const nextIlsStaff = Boolean(isSuperAdminUser || userData?.isIlsStaff);
        const nextCanAccessAllTools = Boolean(
          (!isIlsOnly && (isAdminUser || isSuperAdminUser)) || userData?.canAccessAllTools
        );
        const nextIlsPackagePortal = Boolean(
          isSuperAdminUser ||
            userData?.canAccessIlsPackagePortal ||
            userData?.isIlsStaff ||
            (isAdminUser && !isIlsOnly)
        );

        applyRoleState({
          isAdmin: isAdminUser && !isIlsOnly,
          isSuperAdmin: isSuperAdminUser,
          isKaiserManager: nextKaiserManager,
          isClaimsStaff: nextClaimsStaff,
          isIlsStaff: nextIlsStaff,
          canAccessAllTools: nextCanAccessAllTools,
          canAccessIlsPackagePortal: nextIlsPackagePortal,
        });
      } catch (error) {
        console.error('❌ useAdmin: Error checking admin roles', error);
        const stickyAdminSession = safeLocalStorageGet('calaim_session_type') === 'admin';
        const fallbackAllowed =
          Boolean(user?.uid) &&
          stickyAdminSession &&
          (lastKnownRoleRef.current.isAdmin ||
            lastKnownRoleRef.current.canAccessAllTools ||
            lastKnownRoleRef.current.canAccessIlsPackagePortal ||
            lastKnownRoleRef.current.isIlsStaff);
        if (fallbackAllowed) {
          applyRoleState(lastKnownRoleRef.current);
        } else {
          applyRoleState({ ...EMPTY_ROLES });
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminRoles();
  }, [user, isUserLoading, firestore, hasFirebaseContext]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isKaiserManager,
    isClaimsStaff,
    isIlsStaff,
    canAccessAllTools,
    canAccessIlsPackagePortal,
    isLoading: isUserLoading || isLoading,
    isUserLoading,
  };
}
