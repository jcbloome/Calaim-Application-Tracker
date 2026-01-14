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
  
  // Configure auto-logout based on area
  const config = isAdminArea 
    ? {
        timeoutMinutes: 30,      // 30 minutes for admin (more sensitive data)
        warningMinutes: 5,       // 5 minute warning
        showWarning: true,
        redirectPath: '/admin/login'
      }
    : {
        timeoutMinutes: 60,      // 1 hour for regular users
        warningMinutes: 10,      // 10 minute warning  
        showWarning: true,
        redirectPath: '/'
      };

  // Initialize auto-logout (only runs when user is logged in)
  useAutoLogout(config);

  return <>{children}</>;
}