import { useEffect, useCallback } from 'react';
import { useAuth } from '@/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function useLoginTracking() {
  const { user } = useAuth();

  // Log user activity
  const logActivity = useCallback(async (
    action: 'login' | 'logout' | 'session_timeout' | 'forced_logout',
    options: {
      success?: boolean;
      failureReason?: string;
      sessionDuration?: number;
    } = {}
  ) => {
    if (!user) return;

    try {
      const functions = getFunctions();
      const logUserActivity = httpsCallable(functions, 'logUserActivity');
      
      // Get client info
      const ipAddress = await getClientIP();
      const userAgent = navigator.userAgent;
      
      await logUserActivity({
        action,
        ipAddress,
        userAgent,
        success: options.success ?? true,
        failureReason: options.failureReason,
        sessionDuration: options.sessionDuration
      });
      
      console.log(`✅ Logged ${action} activity`);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }, [user]);

  // Update activity (heartbeat)
  const updateActivity = useCallback(async () => {
    if (!user) return;

    try {
      const functions = getFunctions();
      const updateUserActivity = httpsCallable(functions, 'updateUserActivity');
      await updateUserActivity({});
    } catch (error) {
      console.error('Error updating activity:', error);
    }
  }, [user]);

  // Log login on mount
  useEffect(() => {
    if (user) {
      logActivity('login');
    }
  }, [user, logActivity]);

  // Set up activity heartbeat
  useEffect(() => {
    if (!user) return;

    // Update activity every 5 minutes
    const interval = setInterval(updateActivity, 5 * 60 * 1000);
    
    // Update activity on user interaction
    const handleUserActivity = () => updateActivity();
    
    // Listen for user interactions
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    let lastActivity = Date.now();
    
    const throttledHandler = () => {
      const now = Date.now();
      if (now - lastActivity > 30000) { // Throttle to every 30 seconds
        lastActivity = now;
        handleUserActivity();
      }
    };
    
    events.forEach(event => {
      document.addEventListener(event, throttledHandler, true);
    });

    // Log logout on page unload
    const handleBeforeUnload = () => {
      // Calculate session duration
      const loginTime = localStorage.getItem('loginTime');
      let sessionDuration = 0;
      
      if (loginTime) {
        sessionDuration = Math.floor((Date.now() - parseInt(loginTime)) / (1000 * 60));
      }
      
      // Use sendBeacon for reliable logout logging
      navigator.sendBeacon('/api/log-logout', JSON.stringify({
        action: 'logout',
        sessionDuration
      }));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Store login time
    localStorage.setItem('loginTime', Date.now().toString());

    return () => {
      clearInterval(interval);
      events.forEach(event => {
        document.removeEventListener(event, throttledHandler, true);
      });
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, updateActivity]);

  // Handle session timeout
  useEffect(() => {
    if (!user) return;

    let timeoutId: NodeJS.Timeout;
    
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      // Set timeout for 2 hours of inactivity
      timeoutId = setTimeout(() => {
        const loginTime = localStorage.getItem('loginTime');
        let sessionDuration = 0;
        
        if (loginTime) {
          sessionDuration = Math.floor((Date.now() - parseInt(loginTime)) / (1000 * 60));
        }
        
        logActivity('session_timeout', { sessionDuration });
        
        // Redirect to login or show timeout message
        window.location.href = '/login?reason=timeout';
      }, 2 * 60 * 60 * 1000); // 2 hours
    };

    // Reset timeout on user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, true);
    });

    resetTimeout(); // Initial timeout

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout, true);
      });
    };
  }, [user, logActivity]);

  return {
    logActivity,
    updateActivity
  };
}

// Helper function to get client IP
async function getClientIP(): Promise<string> {
  try {
    // You could use a service like ipapi.co or ipify.org
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || 'Unknown';
  } catch (error) {
    console.error('Error getting client IP:', error);
    return 'Unknown';
  }
}