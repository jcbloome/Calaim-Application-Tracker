'use client';

import { usePathname } from 'next/navigation';
import { useSessionIsolation } from '@/hooks/use-session-isolation';

export function SessionIsolationGate() {
  const pathname = usePathname();
  const sessionType = pathname.startsWith('/admin') ? 'admin' : 'user';

  useSessionIsolation(sessionType);

  return null;
}
