'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { usePathname } from 'next/navigation';

function isPublicFormsRoute(pathname: string): boolean {
  const path = String(pathname || '').toLowerCase();
  if (!path) return false;

  if (path.startsWith('/forms/printable-package')) return true;
  if (path.endsWith('/printable')) return true;

  return false;
}

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isPublicFormsRoute(pathname)) {
    return <>{children}</>;
  }
  return <AuthGuard require2FA loginPath="/login">{children}</AuthGuard>;
}
