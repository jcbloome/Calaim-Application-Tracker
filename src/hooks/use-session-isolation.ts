'use client';

import { useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { isHardcodedAdminEmail } from '@/lib/admin-emails';

type SessionType = 'admin' | 'user';

/**
 * Hook to enforce session isolation between admin and user sides
 * Prevents crossover between admin and user authentication states
 * Prevents admin users from accessing the user side
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
      const isUserPath = !isAdminPath && pathname !== '/' && pathname !== '/login' && pathname !== '/signup';

      // Store the intended session type in localStorage
      const storedSessionType = safeLocalStorageGet('calaim_session_type');
      const newSessionType = isAdminPath ? 'admin' : 'user';

      // If user is logged in and trying to access user side, check if they're an admin
      if (auth.currentUser && isUserPath) {
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

      // If switching between admin and user sides, force logout
      if (storedSessionType && storedSessionType !== newSessionType && auth.currentUser) {
        // If user is switching from admin -> user, don't force a second login.
        // Clear admin-only context and record the new session type.
        if (newSessionType === 'user') {
          safeLocalStorageSet('calaim_session_type', 'user');
          safeLocalStorageRemove('calaim_admin_context');
          return;
        }

        // Switching into admin mode still requires an explicit admin login.
        safeLocalStorageRemove('calaim_session_type');
        safeLocalStorageRemove('calaim_admin_context');
        safeSessionStorageClear();

        await auth.signOut();
        router.push('/admin/login');
        return;
      }

      // Set the current session type
      if (auth.currentUser && (isAdminPath || isUserPath)) {
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