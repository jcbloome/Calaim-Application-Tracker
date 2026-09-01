'use client';

import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { SocialWorkerProvider, useSocialWorker } from '@/hooks/use-social-worker';
import { useAuth, useFirestore } from '@/firebase';
import {
  LogOut,
  Loader2,
  Search,
  Menu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Image from 'next/image';
import { clearStoredSwLoginDay, getTodayLocalDayKey, msUntilNextLocalMidnight, readStoredSwLoginDay, writeStoredSwLoginDay } from '@/lib/sw-daily-session';
import { SWTopNav } from '@/components/sw/SWTopNav';
import { setPortalSessionOfflineClient, trackLoginActivityClient } from '@/lib/login-activity-client';
import { AuthGuard } from '@/components/AuthGuard';
import {
  activeSwIspTools,
  DEFAULT_SW_ISP_TOOLS,
  normalizeSwIspToolsList,
  SW_ISP_TOOLS_SETTINGS_DOC,
  type SwIspToolItem,
} from '@/lib/sw-isp-tools';
import { SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED } from '@/lib/sw-portal-flags';

export default function SWPortalLayout({ children }: { children: ReactNode }) {
  return (
    <SocialWorkerProvider>
      <SWPortalLayoutInner>{children}</SWPortalLayoutInner>
    </SocialWorkerProvider>
  );
}

function SWPortalLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, socialWorkerData, isSocialWorker, isLoading } = useSocialWorker();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [headerSearch, setHeaderSearch] = useState('');
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const [ispTools, setIspTools] = useState<SwIspToolItem[]>([...DEFAULT_SW_ISP_TOOLS]);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(firestore, 'admin-settings', SW_ISP_TOOLS_SETTINGS_DOC));
        if (cancelled) return;
        if (!snap.exists()) {
          setIspTools([...DEFAULT_SW_ISP_TOOLS]);
          return;
        }
        setIspTools(normalizeSwIspToolsList((snap.data() as any)?.items));
      } catch {
        if (!cancelled) setIspTools([...DEFAULT_SW_ISP_TOOLS]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firestore]);

  const mobileNavLinks = useMemo(() => {
    const tools = activeSwIspTools(ispTools).map((tool) => ({
      href: tool.href,
      label: `ISP: ${tool.label}`,
      external: /^https?:\/\//i.test(tool.href),
    }));
    if (!SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED) {
      return [
        { href: '/sw-portal/home', label: 'Home', external: false },
        ...tools,
        { href: '/sw-portal/instructions', label: 'Instructions', external: false },
      ];
    }
    return [
      { href: '/sw-portal/home', label: 'Home', external: false },
      { href: '/sw-portal/history', label: 'History', external: false },
      { href: '/sw-portal/wrap-up', label: 'Wrap Up', external: false },
      ...tools,
      { href: '/sw-portal/instructions', label: 'Instructions', external: false },
    ];
  }, [ispTools]);

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

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isMobileNavOpen]);

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
    <AuthGuard loginPath="/sw-login">
      <div className="flex flex-col min-h-screen bg-slate-50/50">
        {/* Header */}
        <div className="bg-card border-b sticky top-0 z-40">
          <div className="container mx-auto px-4 py-2 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/sw-portal/home" className="shrink-0">
                <Image
                  src="/api/assets/connections-logo"
                  alt="Connect CalAIM Logo"
                  width={240}
                  height={67}
                  className="w-36 sm:w-44 h-auto object-contain"
                  priority
                />
              </Link>

              <SWTopNav className="hidden md:flex shrink-0" />

              <div className="ml-auto shrink-0 flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="md:hidden"
                  onClick={() => setMobileNavOpen((prev) => !prev)}
                  aria-expanded={isMobileNavOpen}
                  aria-controls="sw-mobile-nav"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
                {/* Global search (SW) */}
                <div className="hidden md:block w-[280px]">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const q = headerSearch.trim();
                      if (!q) return;
                      router.push(`/sw-portal/home?q=${encodeURIComponent(q)}`);
                      setHeaderSearch('');
                    }}
                  >
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={headerSearch}
                        onChange={(e) => setHeaderSearch(e.target.value)}
                        placeholder={
                          SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? 'Search roster…' : 'Search members…'
                        }
                        className="pl-9"
                        aria-label={
                          SW_HN_MONTHLY_QUESTIONNAIRES_ENABLED ? 'Search roster' : 'Search members'
                        }
                      />
                    </div>
                  </form>
                </div>
                <div className="hidden md:block text-sm font-semibold text-foreground max-w-[160px] sm:max-w-[240px] truncate">
                  {swName}
                </div>
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden md:inline-flex">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
            {isMobileNavOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close social worker menu overlay"
                  className="fixed inset-0 z-40 bg-black/40 md:hidden"
                  onClick={() => setMobileNavOpen(false)}
                />
                <div
                  id="sw-mobile-nav"
                  className="absolute left-0 right-0 top-full z-50 border-t bg-card px-4 pb-5 pt-4 shadow-lg md:hidden"
                >
                  <div className="space-y-2">
                    {mobileNavLinks.map((item) =>
                      item.external ? (
                        <a
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMobileNavOpen(false)}
                          className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <Link
                          key={`${item.href}-${item.label}`}
                          href={item.href}
                          onClick={() => setMobileNavOpen(false)}
                          className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                        >
                          {item.label}
                        </Link>
                      )
                    )}
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 text-sm font-semibold text-foreground truncate">{swName}</div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        void handleSignOut();
                        setMobileNavOpen(false);
                      }}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-grow p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
