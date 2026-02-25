'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAuth } from '@/firebase';
import { cn } from '@/lib/utils';
import {
  ClipboardCheck,
  DollarSign,
  LogOut,
  UserCheck,
  FileBarChart,
  ListChecks,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { clearStoredSwLoginDay, getTodayLocalDayKey, msUntilNextLocalMidnight, readStoredSwLoginDay, writeStoredSwLoginDay } from '@/lib/sw-daily-session';

const swNavLinks = [
  { 
    href: '/sw-portal/visit-verification', 
    label: 'Visit Verification', 
    icon: ClipboardCheck 
  },
  {
    href: '/sw-portal/monthly-visits',
    label: 'Visits',
    icon: ListChecks
  },
  { 
    href: '/sw-portal/sign-off', 
    label: 'Sign Off', 
    icon: FileBarChart 
  },
  { 
    href: '/sw-portal/submit-claims', 
    label: 'Submit Claims', 
    icon: DollarSign 
  }
];

export default function SWPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleSignOut = useCallback(async (target: string = '/sw-login') => {
    if (auth) {
      await auth.signOut();
    }
    try {
      await fetch('/api/auth/sw-session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    router.push(target);
  }, [auth, router]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker && pathname !== '/sw-login' && pathname !== '/sw-reset-password') {
      setIsRedirecting(true);
      router.push('/sw-login');
    }
  }, [isLoading, isSocialWorker, pathname, router]);

  useEffect(() => {
    if (isLoading) return;
    if (!isSocialWorker) return;
    if (pathname === '/sw-login' || pathname === '/sw-reset-password') return;

    const today = getTodayLocalDayKey();
    const stored = readStoredSwLoginDay();
    if (!stored) {
      writeStoredSwLoginDay(today);
    } else if (stored !== today) {
      // New day → require fresh login.
      clearStoredSwLoginDay();
      void handleSignOut('/sw-login?reason=daily');
      return;
    }

    const timeoutMs = msUntilNextLocalMidnight() + 1000;
    const t = window.setTimeout(() => {
      clearStoredSwLoginDay();
      void handleSignOut('/sw-login?reason=daily');
    }, timeoutMs);

    return () => window.clearTimeout(t);
  }, [handleSignOut, isLoading, isSocialWorker, pathname]);

  // Show loading while checking social worker status or redirecting
  if (isLoading || isRedirecting) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading portal...</p>
        </div>
      </div>
    );
  }

  // Don't show layout on login/reset pages
  if (pathname === '/sw-login' || pathname === '/sw-reset-password') {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="container mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/sw-portal" className="shrink-0">
              <Image
                src="/calaimlogopdf.png"
                alt="Connect CalAIM Logo"
                width={240}
                height={67}
                className="w-48 h-auto object-contain"
                priority
              />
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex gap-1">
              {swNavLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <UserCheck className="h-4 w-4 text-primary" />
              <div className="leading-tight">
                <div className="font-medium text-foreground">
                  {String((user as any)?.displayName || (user as any)?.email || 'Social Worker')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {String((user as any)?.email || 'Social Worker Portal')}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow p-4 sm:p-6 md:p-8">
        {children}
      </main>
    </div>
  );
}
