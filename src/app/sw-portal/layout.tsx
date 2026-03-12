'use client';

import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { useAuth, useFirestore } from '@/firebase';
import {
  LogOut,
  Loader2,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { clearStoredSwLoginDay, getTodayLocalDayKey, msUntilNextLocalMidnight, readStoredSwLoginDay, writeStoredSwLoginDay } from '@/lib/sw-daily-session';
import { SWTopNav } from '@/components/sw/SWTopNav';
import { setPortalSessionOfflineClient, trackLoginActivityClient } from '@/lib/login-activity-client';

export default function SWPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, socialWorkerData, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');

  const swName = String(
    (socialWorkerData as any)?.displayName ||
      (user as any)?.displayName ||
      (user as any)?.email ||
      'Social Worker'
  ).trim() || 'Social Worker';

  const handleSignOut = useCallback(async (target: string = '/sw-login') => {
    try {
      if (firestore && user?.uid) {
        await trackLoginActivityClient(firestore, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: 'Social Worker',
          action: 'logout',
          portal: 'sw',
        });
        await setPortalSessionOfflineClient(firestore, user.uid);
      }
    } catch {
      // best-effort only
    }
    if (auth) {
      await auth.signOut();
    }
    try {
      await fetch('/api/auth/sw-session', { method: 'DELETE' });
    } catch {
      // ignore
    }
    router.push(target);
  }, [auth, firestore, router, user?.displayName, user?.email, user?.uid]);

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
        <div className="container mx-auto px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
            <Link href="/sw-portal/roster" className="shrink-0">
              <Image
                src="/calaimlogopdf.png"
                alt="Connect CalAIM Logo"
                width={240}
                height={67}
                className="w-36 sm:w-44 h-auto object-contain"
                priority
              />
            </Link>

            <SWTopNav className="shrink-0" />

            <div className="ml-auto shrink-0 flex items-center gap-3">
              {/* Global search (SW) */}
              <div className="hidden md:block w-[280px]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = headerSearch.trim();
                    if (!q) return;
                    router.push(`/sw-portal/queue?q=${encodeURIComponent(q)}`);
                    setHeaderSearch('');
                  }}
                >
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={headerSearch}
                      onChange={(e) => setHeaderSearch(e.target.value)}
                      placeholder="Search roster…"
                      className="pl-9"
                      aria-label="Search roster"
                    />
                  </div>
                </form>
              </div>
              <div className="text-sm font-semibold text-foreground max-w-[160px] sm:max-w-[240px] truncate">
                {swName}
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
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
