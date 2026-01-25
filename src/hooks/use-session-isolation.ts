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
export function useSessionIsolation(currentSessionType: SessionType) {
  const auth = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
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
      const storedSessionType = localStorage.getItem('calaim_session_type');
      const newSessionType = isAdminPath ? 'admin' : 'user';

      // If user is logged in and trying to access user side, check if they're an admin
      if (auth.currentUser && isUserPath) {
        const isAdmin = await checkIfUserIsAdmin(auth.currentUser.email || '', auth.currentUser.uid);

        if (isAdmin) {
          // Clear session data and sign out without forcing admin login.
          localStorage.removeItem('calaim_session_type');
          localStorage.removeItem('calaim_admin_context');
          sessionStorage.clear();

          await auth.signOut();
          return;
        }
      }

      // If switching between admin and user sides, force logout
      if (storedSessionType && storedSessionType !== newSessionType && auth.currentUser) {
        // Clear all session data
        localStorage.removeItem('calaim_session_type');
        localStorage.removeItem('calaim_admin_context');
        sessionStorage.clear();
        
        // Sign out current user
        await auth.signOut();
        
        // Redirect to appropriate login
        if (newSessionType === 'admin') {
          router.push('/admin/login');
        } else {
          router.push('/');
        }
        return;
      }

      // Set the current session type
      if (auth.currentUser && (isAdminPath || isUserPath)) {
        localStorage.setItem('calaim_session_type', newSessionType);
      }
    };

    handleSessionIsolation();
  }, [auth, firestore, pathname, router, currentSessionType]);

  // Utility functions for session management
  const switchToAdminMode = async () => {
    if (auth?.currentUser) {
      localStorage.removeItem('calaim_session_type');
      await auth.signOut();
    }
    router.push('/admin/login');
  };

  const switchToUserMode = async () => {
    if (auth?.currentUser) {
      localStorage.removeItem('calaim_session_type');
      await auth.signOut();
    }
    router.push('/');
  };

  const getCurrentSessionType = (): SessionType | null => {
    return localStorage.getItem('calaim_session_type') as SessionType | null;
  };

  return {
    switchToAdminMode,
    switchToUserMode,
    getCurrentSessionType,
  };
}