import type { Metadata, Viewport } from 'next';
import './globals.css';
import React from 'react';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { NotificationProvider } from '@/components/NotificationProvider';
import { RealTimeNotifications } from '@/components/RealTimeNotifications';
import { Toaster } from '@/components/ui/toaster';
import { SessionIsolationGate } from '@/components/SessionIsolationGate';

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <FirebaseClientProvider>
          <NotificationProvider>
            <SessionIsolationGate />
            <RealTimeNotifications />
            {children}
          </NotificationProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}