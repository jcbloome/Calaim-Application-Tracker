'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { SessionIsolationGate } from '@/components/SessionIsolationGate';
import { AutoLogoutProvider } from '@/components/AutoLogoutProvider';
import PWAServiceWorker from '@/components/PWAServiceWorker';
import { Toaster } from '@/components/ui/toaster';
import { LanguageProvider } from '@/components/LanguageProvider';

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
  // Keep Firebase mounted for protected routes and during pathname hydration so
  // admin pages using useAuth/useFirestore never render outside FirebaseProvider.
  const isPublic = Boolean(pathname) && isPublicPathname(pathname);

  // For public pages, avoid pulling Firebase/Auth and notification systems.
  if (isPublic) {
    return (
      <LanguageProvider>
        <PWAServiceWorker />
        {children}
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <FirebaseClientProvider>
        <NotificationProvider>
          <AutoLogoutProvider>
            <SessionIsolationGate />
            <PWAServiceWorker />
            {children}
          </AutoLogoutProvider>
        </NotificationProvider>
      </FirebaseClientProvider>
      <Toaster />
    </LanguageProvider>
  );
}

