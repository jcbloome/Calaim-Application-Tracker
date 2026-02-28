'use client';

import { usePathname } from 'next/navigation';
import { useSessionIsolation } from '@/hooks/use-session-isolation';

export function SessionIsolationGate() {
  const pathname = usePathname();
  const isSwPath =
    pathname === '/sw-login' ||
    pathname.startsWith('/sw-portal') ||
    pathname.startsWith('/sw-visit-verification') ||
    pathname.startsWith('/sw-reset-password') ||
    pathname.startsWith('/swvisit');
  const sessionType = pathname.startsWith('/admin') ? 'admin' : isSwPath ? 'sw' : 'user';

  // Always call hooks unconditionally. Disable isolation effects on login-related routes.
  const disableIsolation =
    pathname === '/admin/login';
  useSessionIsolation(sessionType, { disabled: disableIsolation });

  return null;
}
