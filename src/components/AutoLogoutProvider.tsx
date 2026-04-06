'use client';

import { useAutoLogout } from '@/hooks/use-auto-logout';
import { usePathname } from 'next/navigation';

interface AutoLogoutProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that enables automatic logout functionality
 * Different timeout settings for admin vs user areas
 */
export function AutoLogoutProvider({ children }: AutoLogoutProviderProps) {
  const pathname = usePathname();
  
  // Different timeout settings based on user type
  const isAdminArea = pathname.startsWith('/admin');
  const isSwArea =
    pathname.startsWith('/sw-portal') ||
    pathname.startsWith('/sw-login') ||
    pathname.startsWith('/sw-visit-verification') ||
    pathname.startsWith('/swvisit');
  
  // Configure auto-logout based on area
  const config = isAdminArea 
    ? {
        timeoutMinutes: 2 * 60,  // 2 hours for admin
        warningMinutes: 10,      // 10 minute warning
        showWarning: true,
        redirectPath: '/admin/login'
      }
    : isSwArea
    ? {
        timeoutMinutes: 2 * 60,  // 2 hours for social workers
        warningMinutes: 10,
        showWarning: true,
        redirectPath: '/sw-login'
      }
    : {
        timeoutMinutes: 2 * 60,  // 2 hours for regular users
        warningMinutes: 10,      // 10 minute warning  
        showWarning: true,
        redirectPath: '/'
      };

  // Initialize auto-logout (only runs when user is logged in)
  useAutoLogout(config);

  return <>{children}</>;
}