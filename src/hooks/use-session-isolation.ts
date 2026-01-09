'use client';

import { useEffect } from 'react';
import { useAuth } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';

type SessionType = 'admin' | 'user';

/**
 * Hook to enforce session isolation between admin and user sides
 * Prevents crossover between admin and user authentication states
 */
export function useSessionIsolation(currentSessionType: SessionType) {
  const auth = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;

    const handleSessionIsolation = async () => {
      const isAdminPath = pathname.startsWith('/admin');
      const isUserPath = !isAdminPath && pathname !== '/' && pathname !== '/login' && pathname !== '/signup';

      // Store the intended session type in localStorage
      const storedSessionType = localStorage.getItem('calaim_session_type');
      const newSessionType = isAdminPath ? 'admin' : 'user';

      // If switching between admin and user sides, force logout
      if (storedSessionType && storedSessionType !== newSessionType && auth.currentUser) {
        console.log(`Session isolation: Switching from ${storedSessionType} to ${newSessionType}, signing out`);
        
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
  }, [auth, pathname, router, currentSessionType]);

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