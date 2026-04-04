'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { SessionIsolationGate } from '@/components/SessionIsolationGate';
import PWAServiceWorker from '@/components/PWAServiceWorker';
import { Toaster } from '@/components/ui/toaster';

function isPublicPathname(pathname: string) {
  if (!pathname) return true;
  if (pathname === '/') return true;
  return (
    pathname.startsWith('/info') ||
    pathname.startsWith('/faq') ||
    pathname.startsWith('/eligibility-check') ||
    pathname.startsWith('/contact')
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Treat unresolved path as protected so Firebase context is always available
  // during client hydration on admin/staff pages.
  const isPublic = pathname ? isPublicPathname(pathname) : false;

  // For public pages, avoid pulling Firebase/Auth and notification systems.
  if (isPublic) {
    return (
      <>
        <PWAServiceWorker />
        {children}
      </>
    );
  }

  return (
    <>
      <FirebaseClientProvider>
        <NotificationProvider>
          <SessionIsolationGate />
          <PWAServiceWorker />
          {children}
        </NotificationProvider>
      </FirebaseClientProvider>
      <Toaster />
    </>
  );
}

