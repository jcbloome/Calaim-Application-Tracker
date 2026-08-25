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
        const normalizedEmail = String(userEmail || '').trim().toLowerCase();
        if (isHardcodedAdminEmail(normalizedEmail)) {
          return true;
        }

        // Token claims are authoritative once set by admin-session.
        try {
          const tokenResult = await auth.currentUser?.getIdTokenResult();
          const claims = (tokenResult?.claims || {}) as Record<string, unknown>;
          if (Boolean(claims.admin) || Boolean(claims.superAdmin)) {
            return true;
          }
        } catch {
          // fall through to Firestore / lane checks
        }

        const roleLookups = [
          getDoc(doc(firestore, 'roles_admin', userId)),
          getDoc(doc(firestore, 'roles_super_admin', userId)),
        ];
        if (normalizedEmail) {
          roleLookups.push(
            getDoc(doc(firestore, 'roles_admin', normalizedEmail)),
            getDoc(doc(firestore, 'roles_super_admin', normalizedEmail))
          );
        }
        const roleDocs = await Promise.all(roleLookups);
        if (roleDocs.some((snap) => snap.exists())) {
          return true;
        }

        // Server lane check covers staff profiles when client role docs are unreadable.
        try {
          const laneRes = await fetch('/api/auth/email-lane', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail }),
          });
          const laneData = await laneRes.json().catch(() => null);
          if (laneData?.success && (Boolean(laneData.isAdminLaneAccount) || !Boolean(laneData.isUserLaneAllowed))) {
            return String(laneData.reservedLane || '').toLowerCase() !== 'sw';
          }
        } catch {
          // ignore — treat as non-admin only when local checks also failed
        }

        return false;
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
      const isPrintableFormsPath =
        pathname.startsWith('/forms/printable-package') ||
        (pathname.startsWith('/forms/') && pathname.endsWith('/printable'));

      // Any authenticated, non-admin portal path (excluding public landing/login pages).
      const isNonAdminAuthedPath =
        !isAdminPath &&
        !isSwPath &&
        !isPrintableFormsPath &&
        pathname !== '/' &&
        pathname !== '/login' &&
        pathname !== '/signup' &&
        pathname !== '/reset-password' &&
        !pathname.startsWith('/invite/');

      // Family/user portal routes: keep the signed-in session stable for members,
      // but never allow admin/staff emails to browse My Applications here.
      if (isNonAdminAuthedPath) {
        if (!auth.currentUser) return;
        safeLocalStorageSet('calaim_session_type', 'user');
        safeLocalStorageRemove('calaim_admin_context');

        const isAdminAccount = await checkIfUserIsAdmin(
          auth.currentUser.email || '',
          auth.currentUser.uid
        );
        if (isAdminAccount) {
          safeLocalStorageRemove('calaim_session_type');
          safeSessionStorageClear();
          await auth.signOut();
          router.replace('/admin/login');
        }
        return;
      }

      // Store the intended session type in localStorage
      const storedSessionType = safeLocalStorageGet('calaim_session_type');
      const newSessionType: SessionType = isAdminPath ? 'admin' : isSwPath ? 'sw' : 'user';

      // Printable form routes are auth-neutral so staff/admin users can open
      // form tabs without being forced into a user session or logged out.
      if (isPrintableFormsPath) {
        return;
      }

      // If switching between admin/SW portals, force a fresh login when needed.
      const currentStoredSessionType = safeLocalStorageGet('calaim_session_type') || storedSessionType;
      if (currentStoredSessionType && currentStoredSessionType !== newSessionType && auth.currentUser) {
        // Allow seamless navigation back into admin routes when the currently
        // authenticated user is already an admin (e.g., leaving printable pages).
        if (newSessionType === 'admin') {
          const isAdmin = await checkIfUserIsAdmin(auth.currentUser.email || '', auth.currentUser.uid);
          if (isAdmin) {
            safeLocalStorageSet('calaim_session_type', 'admin');
            return;
          }
        }

        // If the user is on the login route for the destination portal, allow the
        // transition (they are explicitly logging in) and just record the new session type.
        const isLoginRouteForDestination =
          (newSessionType === 'admin' && pathname === '/admin/login') ||
          (newSessionType === 'sw' && pathname === '/sw-login') ||
          (newSessionType === 'user' && pathname === '/login');
        if (isLoginRouteForDestination) {
          safeLocalStorageSet('calaim_session_type', newSessionType);
          if (newSessionType !== 'admin') safeLocalStorageRemove('calaim_admin_context');
          return;
        }

        // Switching into any other portal requires an explicit login.
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