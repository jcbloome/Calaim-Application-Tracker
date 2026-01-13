'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface AutoLogoutConfig {
  /** Inactivity timeout in minutes (default: 30) */
  timeoutMinutes?: number;
  /** Warning time before logout in minutes (default: 5) */
  warningMinutes?: number;
  /** Whether to show warning dialog (default: true) */
  showWarning?: boolean;
  /** Custom redirect path after logout */
  redirectPath?: string;
}

/**
 * Hook to automatically log out users after a period of inactivity
 * Tracks mouse movement, keyboard input, clicks, and touch events
 */
export function useAutoLogout(config: AutoLogoutConfig = {}) {
  const {
    timeoutMinutes = 30,
    warningMinutes = 5,
    showWarning = true,
    redirectPath
  } = config;

  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);

  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = warningMinutes * 60 * 1000;

  const handleLogout = useCallback(async () => {
    if (!auth?.currentUser) return;

    try {
      // Clear all timers
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);

      // Clear session data
      localStorage.removeItem('calaim_session_type');
      localStorage.removeItem('calaim_admin_context');
      sessionStorage.clear();

      // Sign out
      await auth.signOut();

      // Show logout message
      toast({
        title: 'Session Expired',
        description: 'You have been logged out due to inactivity.',
        variant: 'destructive',
      });

      // Redirect based on current path or custom redirect
      if (redirectPath) {
        router.push(redirectPath);
      } else if (pathname.startsWith('/admin')) {
        router.push('/admin/login');
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error during auto-logout:', error);
    }
  }, [auth, router, pathname, redirectPath, toast]);

  const showWarningToast = useCallback(() => {
    if (!showWarning || warningShownRef.current) return;
    
    warningShownRef.current = true;
    
    toast({
      title: 'Session Warning',
      description: `Your session will expire in ${warningMinutes} minutes due to inactivity. Move your mouse or click anywhere to stay logged in.`,
      variant: 'default',
      duration: 10000, // Show for 10 seconds
    });
  }, [showWarning, warningMinutes, toast]);

  const resetTimer = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    warningShownRef.current = false;

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);

    // Only set timers if user is logged in
    if (!auth?.currentUser) return;

    // Set warning timer
    if (showWarning && warningMs < timeoutMs) {
      warningTimeoutRef.current = setTimeout(() => {
        showWarningToast();
      }, timeoutMs - warningMs);
    }

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      // Double-check if user is still inactive
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity >= timeoutMs) {
        handleLogout();
      }
    }, timeoutMs);
  }, [auth, timeoutMs, warningMs, showWarning, showWarningToast, handleLogout]);

  // Activity event handlers
  const handleActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    // Only activate auto-logout if user is logged in
    if (!auth?.currentUser) {
      // Clear timers if user logs out
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      return;
    }

    // List of events to track for user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown'
    ];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Initialize timer
    resetTimer();

    // Cleanup function
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, [auth?.currentUser, handleActivity, resetTimer]);

  // Utility functions
  const extendSession = useCallback(() => {
    resetTimer();
    toast({
      title: 'Session Extended',
      description: 'Your session has been extended.',
      variant: 'default',
    });
  }, [resetTimer, toast]);

  const getRemainingTime = useCallback(() => {
    if (!auth?.currentUser) return 0;
    
    const elapsed = Date.now() - lastActivityRef.current;
    const remaining = Math.max(0, timeoutMs - elapsed);
    return Math.floor(remaining / 1000 / 60); // Return minutes
  }, [auth?.currentUser, timeoutMs]);

  return {
    extendSession,
    getRemainingTime,
    isActive: !!auth?.currentUser,
  };
}