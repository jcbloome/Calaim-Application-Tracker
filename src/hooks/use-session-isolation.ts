'use client';

import { useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type SessionType = 'admin' | 'user' | 'sw';

/**
 * Hook to enforce session isolation between admin, user, and social worker portals.
 * - Prevents crossover between authentication states across portals.
 * - Prevents admin users from accessing non-admin portals.
 */
export function useSessionIsolation(currentSessionType: SessionType, options?: { disabled?: boolean }) {
  const auth = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();
  const disabled = Boolean(options?.disabled);

  const safeLocalStorageGet = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const safeLocalStorageSet = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  };
  const safeLocalStorageRemove = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };
  const safeSessionStorageClear = () => {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (disabled) return;
    if (!auth || !firestore) return;

    const checkIfUserIsAdmin = async (userEmail: string, userId: string): Promise<boolean> => {
      try {
        // Check hardcoded admin emails
        if (isHardcodedAdminEmail(userEmail)) {
          return true;
        }

        // Check Firestore admin roles
        const adminRoleRef = doc(firestore, 'roles_admin', userId);
        const superAdminRoleRef = doc(firestore, 'roles_super_admin', userId);

        const [adminDoc, superAdminDoc] = await Promise.all([
          getDoc(adminRoleRef),
          getDoc(superAdminRoleRef)
        ]);

        return adminDoc.exists() || superAdminDoc.exists();
      } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
    };

    const handleSessionIsolation = async () => {
      const isAdminPath = pathname.startsWith('/admin');
      const isSwPath =
        pathname === '/sw-login' ||
        pathname.startsWith('/sw-portal') ||
        pathname.startsWith('/sw-visit-verification') ||
        pathname.startsWith('/sw-reset-password') ||
        pathname.startsWith('/swvisit');

      // Any authenticated, non-admin portal path (excluding public landing/login pages).
      const isNonAdminAuthedPath =
        !isAdminPath &&
        !isSwPath &&
        pathname !== '/' &&
        pathname !== '/login' &&
        pathname !== '/signup' &&
        pathname !== '/reset-password';

      // Store the intended session type in localStorage
      const storedSessionType = safeLocalStorageGet('calaim_session_type');
      const newSessionType: SessionType = isAdminPath ? 'admin' : isSwPath ? 'sw' : 'user';

      // If user is logged in and trying to access a non-admin portal, check if they're an admin.
      // Admins should not be allowed to browse user/SW portal pages while authenticated.
      if (auth.currentUser && (isNonAdminAuthedPath || isSwPath)) {
        const isAdmin = await checkIfUserIsAdmin(auth.currentUser.email || '', auth.currentUser.uid);

        if (isAdmin) {
          // Clear session data and sign out without forcing admin login.
          safeLocalStorageRemove('calaim_session_type');
          safeLocalStorageRemove('calaim_admin_context');
          safeSessionStorageClear();

          await auth.signOut();
          return;
        }
      }

      // If switching between portals, force logout (fresh login required),
      // except for admin -> user which is allowed for assist-mode flows.
      if (storedSessionType && storedSessionType !== newSessionType && auth.currentUser) {
        // If user is switching from admin -> user, don't force a second login.
        // Clear admin-only context and record the new session type.
        if (storedSessionType === 'admin' && newSessionType === 'user') {
          safeLocalStorageSet('calaim_session_type', 'user');
          safeLocalStorageRemove('calaim_admin_context');
          return;
        }

        // Switching into admin/SW mode still requires an explicit login.
        safeLocalStorageRemove('calaim_session_type');
        safeLocalStorageRemove('calaim_admin_context');
        safeSessionStorageClear();

        await auth.signOut();
        if (newSessionType === 'admin') router.push('/admin/login');
        if (newSessionType === 'sw') router.push('/sw-login');
        return;
      }

      // Set the current session type
      if (auth.currentUser && (isAdminPath || isSwPath || isNonAdminAuthedPath)) {
        safeLocalStorageSet('calaim_session_type', newSessionType);
      }
    };

    handleSessionIsolation();
  }, [auth, firestore, pathname, router, currentSessionType, disabled]);

  // Utility functions for session management
  const switchToAdminMode = async () => {
    if (auth?.currentUser) {
      safeLocalStorageRemove('calaim_session_type');
      await auth.signOut();
    }
    router.push('/admin/login');
  };

  const switchToUserMode = async () => {
    if (auth?.currentUser) {
      safeLocalStorageRemove('calaim_session_type');
      await auth.signOut();
    }
    router.push('/');
  };

  const getCurrentSessionType = (): SessionType | null => {
    return safeLocalStorageGet('calaim_session_type') as SessionType | null;
  };

  return {
    switchToAdminMode,
    switchToUserMode,
    getCurrentSessionType,
  };
}