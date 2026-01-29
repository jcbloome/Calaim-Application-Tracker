import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AdminLoginClient from './AdminLoginClient';

export const metadata: Metadata = {
  title: 'Connect CalAIM Admin',
  manifest: '/manifest-user.json',
  appleWebApp: {
    title: 'Connect CalAIM',
    capable: true,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/user-android-chrome-192x192.png?v=5', sizes: '192x192', type: 'image/png' },
      { url: '/user-android-chrome-512x512.png?v=5', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/user-apple-touch-icon.png?v=5', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <AdminLoginClient />
    </Suspense>
  );
}