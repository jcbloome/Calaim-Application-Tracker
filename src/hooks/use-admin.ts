
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
  canAccessAllTools: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  user: User | null;
}

type RoleCache = {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isKaiserManager: boolean;
  isClaimsStaff: boolean;
  canAccessAllTools: boolean;
};

export function useAdmin(): AdminStatus {
  const firebaseContext = useContext(FirebaseContext);
  const user = firebaseContext?.user || null;
  const isUserLoading = firebaseContext?.isUserLoading ?? true;
  const firestore = firebaseContext?.firestore || null;
  const hasFirebaseContext = firebaseContext !== undefined;
  const lastKnownRoleRef = useRef<RoleCache>({
    isAdmin: false,
    isSuperAdmin: false,
    isKaiserManager: false,
    isClaimsStaff: false,
    canAccessAllTools: false,
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isKaiserManager, setIsKaiserManager] = useState(false);
  const [isClaimsStaff, setIsClaimsStaff] = useState(false);
  const [canAccessAllTools, setCanAccessAllTools] = useState(false);
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
    setCanAccessAllTools(next.canAccessAllTools);
    lastKnownRoleRef.current = next;
  };

  useEffect(() => {
    if (!hasFirebaseContext) {
      // Defensive fallback so admin screens do not crash when provider is temporarily unavailable.
      setIsLoading(false);
      applyRoleState({
        isAdmin: false,
        isSuperAdmin: false,
        isKaiserManager: false,
        isClaimsStaff: false,
        canAccessAllTools: false,
      });
      return;
    }

    if (isUserLoading) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      console.log('🚫 useAdmin: No user found');
      setIsLoading(false);
      applyRoleState({
        isAdmin: false,
        isSuperAdmin: false,
        isKaiserManager: false,
        isClaimsStaff: false,
        canAccessAllTools: false,
      });
      return;
    }

    const checkAdminRoles = async () => {
      if (isBlockedPortalEmail(user.email)) {
        applyRoleState({
          isAdmin: false,
          isSuperAdmin: false,
          isKaiserManager: false,
          isClaimsStaff: false,
          canAccessAllTools: false,
        });
        setIsLoading(false);
        return;
      }

      const isEmailAdmin = isHardcodedAdminEmail(user.email);

      // Fast-path: if custom claims are present, trust them (avoids Firestore-permission issues).
      // These claims are set by `/api/auth/admin-session` during login.
      // After forgot-password / first staff login, claims can land a moment after auth.state —
      // force one token refresh before falling through to Firestore.
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
          // Admins already see full Tools; still read staff flag for limited-claim users if present.
          let toolsFlag = true;
          let claimsFlag = nextSuper;
          let kaiserMgr = Boolean((claims as any)?.kaiserManager);
          if (firestore) {
            try {
              const userDoc = await getDoc(doc(firestore, 'users', user.uid));
              const userData = userDoc.exists() ? (userDoc.data() as any) : null;
              if (userData) {
                claimsFlag = Boolean(nextSuper || userData?.isClaimsStaff);
                kaiserMgr = Boolean(userData?.isKaiserManager || kaiserMgr);
                // Admin claim already implies full tools; keep true.
                toolsFlag = true;
              }
            } catch {
              // ignore — admin claim path still grants full tools
            }
          }
          applyRoleState({
            isAdmin: true,
            isSuperAdmin: nextSuper,
            isKaiserManager: kaiserMgr,
            isClaimsStaff: claimsFlag,
            canAccessAllTools: toolsFlag,
          });
          setIsLoading(false);
          return;
        }
      } catch (claimError) {
        console.warn('⚠️ useAdmin: Failed to read token claims', claimError);
      }

      // Email allow-list always wins.
      if (isEmailAdmin) {
        applyRoleState({
          isAdmin: true,
          isSuperAdmin: true,
          isKaiserManager: false,
          isClaimsStaff: true,
          canAccessAllTools: true,
        });
        setIsLoading(false);
        return;
      }

      if (!firestore) {
        applyRoleState({
          isAdmin: false,
          isSuperAdmin: false,
          isKaiserManager: false,
          isClaimsStaff: false,
          canAccessAllTools: false,
        });
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
          getDoc(doc(firestore, 'users', user.uid)),
        ]);

        let isAdminUser = isEmailAdmin || adminDoc.exists() || superAdminDoc.exists();
        let isSuperAdminUser = isEmailAdmin || superAdminDoc.exists();

        // Backward-compat: some roles were stored by email instead of UID.
        if (!isAdminUser && normalizedEmail) {
          const [emailAdminDoc, emailSuperAdminDoc] = await Promise.all([
            getDoc(doc(firestore, 'roles_admin', normalizedEmail)),
            getDoc(doc(firestore, 'roles_super_admin', normalizedEmail)),
          ]);
          isAdminUser = emailAdminDoc.exists() || emailSuperAdminDoc.exists();
          isSuperAdminUser = isSuperAdminUser || emailSuperAdminDoc.exists();
        }

        const userData = userDoc && typeof userDoc?.exists === 'function' && userDoc.exists() ? (userDoc.data() as any) : null;
        const roleLabel = String(userData?.role || '').trim().toLowerCase();
        const isStaffFlag = Boolean(userData?.isStaff);
        const roleAllowsAdmin = ['staff', 'admin', 'super admin', 'super_admin'].includes(roleLabel);
        if (!isAdminUser && (isStaffFlag || roleAllowsAdmin)) {
          isAdminUser = true;
        }
        if (!isSuperAdminUser && (roleLabel === 'super admin' || roleLabel === 'super_admin')) {
          isSuperAdminUser = true;
        }
        const nextKaiserManager = Boolean(userData?.isKaiserManager || roleLabel.includes('kaiser manager'));
        // Claims access: super admins always allowed; other staff use `users/{uid}.isClaimsStaff`.
        const nextClaimsStaff = Boolean(isSuperAdminUser || userData?.isClaimsStaff);
        // Full Tools: admins always; limited staff when explicitly flagged.
        const nextCanAccessAllTools = Boolean(
          isAdminUser || isSuperAdminUser || userData?.canAccessAllTools
        );
        applyRoleState({
          isAdmin: isAdminUser,
          isSuperAdmin: isSuperAdminUser,
          isKaiserManager: nextKaiserManager,
          isClaimsStaff: nextClaimsStaff,
          canAccessAllTools: nextCanAccessAllTools,
        });
      } catch (error) {
        console.error('❌ useAdmin: Error checking admin roles', error);
        // Resilience: avoid kicking staff out on transient lookup/network failures.
        // If this browser session is in admin mode and we previously confirmed admin,
        // keep the last known role state until the next successful check.
        const stickyAdminSession = safeLocalStorageGet('calaim_session_type') === 'admin';
        const fallbackAllowed =
          Boolean(user?.uid) &&
          stickyAdminSession &&
          (lastKnownRoleRef.current.isAdmin || lastKnownRoleRef.current.canAccessAllTools);
        if (fallbackAllowed) {
          applyRoleState(lastKnownRoleRef.current);
        } else {
          applyRoleState({
            isAdmin: false,
            isSuperAdmin: false,
            isKaiserManager: false,
            isClaimsStaff: false,
            canAccessAllTools: false,
          });
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
    canAccessAllTools,
    isLoading: isUserLoading || isLoading,
    isUserLoading,
  };
}
