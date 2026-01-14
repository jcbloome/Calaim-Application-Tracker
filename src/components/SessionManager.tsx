'use client';

import { useEffect } from 'react';
import { getAuth, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';

interface SessionManagerProps {
  children: React.ReactNode;
}

/**
 * SessionManager ensures that users must log in explicitly each time they visit the site.
 * This preserves admin vs user integrity by preventing automatic login.
 */
export function SessionManager({ children }: SessionManagerProps) {
  useEffect(() => {
    const auth = getAuth();
    
    // Set persistence to session-only (clears on browser close)
    setPersistence(auth, browserSessionPersistence)
      .then(() => {
        console.log('🔒 Firebase Auth persistence set to session-only');
      })
      .catch((error) => {
        console.error('❌ Failed to set Firebase Auth persistence:', error);
      });

    // Check if this is a fresh page load (not a navigation within the app)
    const isPageRefresh = performance.getEntriesByType('navigation')[0]?.type === 'reload';
    const isNewSession = !sessionStorage.getItem('auth_session_active');
    
    if (isPageRefresh || isNewSession) {
      console.log('🔄 Fresh page load detected - clearing auth state');
      
      // Sign out any existing user to force explicit login
      if (auth.currentUser) {
        signOut(auth)
          .then(() => {
            console.log('✅ User signed out - explicit login required');
          })
          .catch((error) => {
            console.error('❌ Failed to sign out user:', error);
          });
      }
      
      // Clear any existing session markers
      sessionStorage.removeItem('auth_session_active');
      localStorage.removeItem('firebase:authUser:' + auth.config.apiKey + ':[DEFAULT]');
    }
    
    // Listen for successful logins to mark session as active
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // Mark session as active when user logs in
        sessionStorage.setItem('auth_session_active', 'true');
        console.log('✅ User authenticated - session marked as active');
      } else {
        // Clear session marker when user logs out
        sessionStorage.removeItem('auth_session_active');
        console.log('🔓 User signed out - session cleared');
      }
    });

    return () => unsubscribe();
  }, []);

  return <>{children}</>;
}