
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { WindowsNotificationContainer } from '@/components/WindowsNotification';
import { CursorNotificationContainer } from '@/components/CursorStyleNotification';
import { RealTimeNotifications } from '@/components/RealTimeNotifications';
import LoginTrackingProvider from '@/components/LoginTrackingProvider';
import { AutoLogoutProvider } from '@/components/AutoLogoutProvider';
import { SessionManager } from '@/components/SessionManager';
import { cn } from '@/lib/utils';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Inter } from 'next/font/google';
import React from 'react';
import { Loader2 } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en" className={cn('h-full antialiased', inter.className)}>
      <body className="min-h-screen flex flex-col">
        <React.Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
          <FirebaseClientProvider>
            <SessionManager>
              <LoginTrackingProvider>
                <AutoLogoutProvider>
                  {children}
                </AutoLogoutProvider>
              </LoginTrackingProvider>
            </SessionManager>
            <RealTimeNotifications />
          </FirebaseClientProvider>
        </React.Suspense>
        <Toaster />
        <WindowsNotificationContainer />
        <CursorNotificationContainer />
      </body>
    </html>
  );
}
