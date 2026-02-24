'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isRealDesktop } from '@/lib/is-real-desktop';
import { WEB_NOTIFICATIONS_MOTHBALLED } from '@/lib/notification-utils';

export default function PWAServiceWorker() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    if (isRealDesktop()) {
      // Electron manages updates/notifications; don't register SW inside the desktop shell.
      return;
    }

    // Admin/SW experiences are sensitive to stale cached JS chunks after deploys.
    // Avoid registering a SW on these routes; proactively unregister if one exists.
    const disableOnThisRoute =
      pathname.startsWith('/admin') ||
      pathname.startsWith('/sw-portal') ||
      pathname.startsWith('/sw-login') ||
      pathname.startsWith('/sw-visit-verification');
    if (disableOnThisRoute) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => registration.unregister());
        });
      }
      return;
    }

    if (typeof window !== 'undefined') {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (process.env.NODE_ENV !== 'production' || isLocalhost) {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            registrations.forEach((registration) => registration.unregister());
          });
        }
        return;
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('🚀 Service Worker registered successfully:', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('🔄 New version of the app is available');
                  
                  // Optionally show update notification
                  if (!WEB_NOTIFICATIONS_MOTHBALLED && 'Notification' in window && Notification.permission === 'granted') {
                    new Notification('📱 App Update Available', {
                      body: 'A new version of CalAIM Tracker is ready. Refresh to update.',
                      icon: '/favicon.ico',
                      tag: 'app-update'
                    });
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    }
  }, [pathname]);

  return null; // This component doesn't render anything
}
