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
  
  const isAdminArea = pathname.startsWith('/admin');
  const isSwArea =
    pathname.startsWith('/sw-portal') ||
    pathname.startsWith('/sw-login') ||
    pathname.startsWith('/sw-visit-verification') ||
    pathname.startsWith('/swvisit') ||
    pathname.startsWith('/sw-reset-password');
  const isAuthPath =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/reset-password';
  const shouldEnableUserIdleLogout = !isAdminArea && !isSwArea && !isAuthPath;
  
  // Keep users signed in while they are active.
  // Only log out after 60 minutes of no interaction.
  const config = {
    enabled: shouldEnableUserIdleLogout,
    timeoutMinutes: 60,
    warningMinutes: 10,
    showWarning: true,
    redirectPath: '/login?fresh=1',
  };

  // Initialize user idle-logout only in user app areas.
  useAutoLogout(config);

  return <>{children}</>;
}