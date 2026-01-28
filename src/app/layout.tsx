import type { Metadata, Viewport } from 'next';
import './globals.css';
import React from 'react';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { RealTimeNotifications } from '@/components/RealTimeNotifications';
import { Toaster } from '@/components/ui/toaster';
import { SessionIsolationGate } from '@/components/SessionIsolationGate';
import PWAServiceWorker from '@/components/PWAServiceWorker';

export const metadata: Metadata = {
  title: 'Connect CalAIM',
  description: 'A portal for the CalAIM Community Support for Assisted Transitions for Health Net and Kaiser.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" href="/user-android-chrome-192x192.png" type="image/png" sizes="192x192" />
        <link rel="icon" href="/user-android-chrome-512x512.png" type="image/png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/user-apple-touch-icon.png" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <FirebaseClientProvider>
          <NotificationProvider>
            <SessionIsolationGate />
            <PWAServiceWorker />
            <RealTimeNotifications />
            {children}
          </NotificationProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}