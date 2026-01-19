'use client';

import { useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';

type SessionType = 'admin' | 'user';

/**
 * Hook to manage session isolation between admin and user sides
 * 
 * Behavior:
 * - Admin users can switch freely between admin and user sides without logout
 * - Non-admin users are forced to logout when switching between sides
 * - This allows staff to help users fill out forms and test the complete user journey
 */
export function useSessionIsolation(currentSessionType: SessionType) {
  const auth = useAuth();
  const firestore = useFirestore();
  const pathname = usePathname();
  const router = useRouter();

  const checkIfUserIsAdmin = async (user: any) => {
    if (!firestore) return false;
    
    try {
      // Check hardcoded admin email
      if (user.email === 'jason@carehomefinders.com') {
        return true;
      }

      // Check admin roles in Firestore
      const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
      const superAdminRoleRef = doc(firestore, 'roles_super_admin', user.uid);

      const [adminDoc, superAdminDoc] = await Promise.all([
        getDoc(adminRoleRef),
        getDoc(superAdminRoleRef)
      ]);

      return adminDoc.exists() || superAdminDoc.exists();
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  };

  useEffect(() => {
    if (!auth || !firestore) return;

    const handleSessionIsolation = async () => {
      const isAdminPath = pathname.startsWith('/admin');
      const isUserPath = !isAdminPath && pathname !== '/' && pathname !== '/login' && pathname !== '/signup';

      // Store the intended session type in localStorage
      const storedSessionType = localStorage.getItem('calaim_session_type');
      const newSessionType = isAdminPath ? 'admin' : 'user';

      // If switching between admin and user sides
      if (storedSessionType && storedSessionType !== newSessionType && auth.currentUser) {
        // Check if current user is an admin
        const isAdmin = await checkIfUserIsAdmin(auth.currentUser);
        
        if (isAdmin) {
          // Admin users can switch freely - just update session type
          console.log(`Admin user switching from ${storedSessionType} to ${newSessionType} - allowing seamless transition`);
          localStorage.setItem('calaim_session_type', newSessionType);
          return;
        } else {
          // Non-admin users still get forced logout
          console.log(`Non-admin user switching from ${storedSessionType} to ${newSessionType}, signing out`);
          
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
    if (auth?.currentUser && firestore) {
      const isAdmin = await checkIfUserIsAdmin(auth.currentUser);
      if (isAdmin) {
        // Admin can switch directly
        localStorage.setItem('calaim_session_type', 'admin');
        router.push('/admin');
        return;
      } else {
        // Non-admin needs to log out and log back in
        localStorage.removeItem('calaim_session_type');
        await auth.signOut();
      }
    }
    router.push('/admin/login');
  };

  const switchToUserMode = async () => {
    if (auth?.currentUser && firestore) {
      const isAdmin = await checkIfUserIsAdmin(auth.currentUser);
      if (isAdmin) {
        // Admin can switch directly
        localStorage.setItem('calaim_session_type', 'user');
        router.push('/');
        return;
      } else {
        // Non-admin needs to log out and log back in
        localStorage.removeItem('calaim_session_type');
        await auth.signOut();
      }
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