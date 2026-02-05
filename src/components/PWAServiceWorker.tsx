'use client';

import { useEffect } from 'react';

export default function PWAServiceWorker() {
  useEffect(() => {
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
                  if ('Notification' in window && Notification.permission === 'granted') {
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
  }, []);

  return null; // This component doesn't render anything
}