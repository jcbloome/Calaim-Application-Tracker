'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const FirebaseClientProvider = dynamic(
  () => import('@/firebase/client-provider').then((m) => m.FirebaseClientProvider),
  { ssr: false }
);
const NotificationProvider = dynamic(
  () => import('@/components/NotificationProvider').then((m) => m.NotificationProvider),
  { ssr: false }
);
const SessionIsolationGate = dynamic(
  () => import('@/components/SessionIsolationGate').then((m) => m.SessionIsolationGate),
  { ssr: false }
);
const PWAServiceWorker = dynamic(() => import('@/components/PWAServiceWorker').then((m) => m.default), {
  ssr: false,
});
const Toaster = dynamic(() => import('@/components/ui/toaster').then((m) => m.Toaster), { ssr: false });

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
  const pathname = usePathname() || '/';
  const isPublic = isPublicPathname(pathname);

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

