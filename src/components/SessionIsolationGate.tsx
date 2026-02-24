'use client';

import { usePathname } from 'next/navigation';
import { useSessionIsolation } from '@/hooks/use-session-isolation';

export function SessionIsolationGate() {
  const pathname = usePathname();
  const sessionType = pathname.startsWith('/admin') ? 'admin' : 'user';

  // Always call hooks unconditionally. Disable isolation effects on login-related routes.
  const disableIsolation =
    pathname === '/admin/login' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/reset-password';
  useSessionIsolation(sessionType, { disabled: disableIsolation });

  return null;
}
