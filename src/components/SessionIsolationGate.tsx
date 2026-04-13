'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSessionIsolation } from '@/hooks/use-session-isolation';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export function SessionIsolationGate() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  const blockedRef = useRef(false);

  const isSwPath =
    pathname === '/sw-login' ||
    pathname.startsWith('/sw-portal') ||
    pathname.startsWith('/sw-visit-verification') ||
    pathname.startsWith('/sw-reset-password') ||
    pathname.startsWith('/swvisit');
  const sessionType = pathname.startsWith('/admin') ? 'admin' : isSwPath ? 'sw' : 'user';

  // Always call hooks unconditionally. Disable isolation effects on login-related routes.
  const disableIsolation =
    pathname === '/admin/login' ||
    pathname === '/login' ||
    pathname === '/sw-login' ||
    pathname === '/signup' ||
    pathname === '/reset-password' ||
    pathname === '/sw-reset-password';
  useSessionIsolation(sessionType, { disabled: disableIsolation });

  // Global master access switch: blocks ALL users except Jason.
  // Stored at `system_settings/app_access` with boolean `enabled`.
  useEffect(() => {
    // Pre-login user pages should not poll the app-access switch.
    // We only enforce this control when an authenticated user exists.
    if (isUserLoading) return;
    if (!user) return;

    const enforce = async (enabled: boolean, message: string) => {
      if (enabled) {
        blockedRef.current = false;
        return;
      }
      const email = String(auth?.currentUser?.email || '').trim().toLowerCase();
      const allow = email === 'jason@carehomefinders.com';
      if (allow) return;
      if (!auth?.currentUser) return;
      if (blockedRef.current) return;
      blockedRef.current = true;
      try {
        localStorage.removeItem('calaim_session_type');
        localStorage.removeItem('calaim_admin_context');
        sessionStorage.clear();
      } catch {
        // ignore
      }
      await auth.signOut().catch(() => null);
      toast({
        title: 'Access temporarily disabled',
        description: message || 'Please contact an administrator.',
        variant: 'destructive',
      });
      router.replace('/');
    };

    let stopped = false;
    let interval: any = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch('/api/auth/app-access', { cache: 'no-store' });
        const data = await res.json().catch(() => ({} as any));
        if (!data?.success) return;
        await enforce(Boolean(data?.enabled ?? true), String(data?.message || '').trim());
      } catch {
        // ignore (fail-open)
      }
    };

    // Always poll as a fallback (covers cases where Firestore rules deny reading system_settings).
    void poll();
    interval = setInterval(() => void poll(), 30_000);

    if (!firestore) {
      return () => {
        stopped = true;
        if (interval) clearInterval(interval);
      };
    }
    const ref = doc(firestore, 'system_settings', 'app_access');
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const enabled = snap.exists() ? Boolean((snap.data() as any)?.enabled ?? true) : true;
        const message = snap.exists() ? String((snap.data() as any)?.message || '').trim() : '';
        await enforce(enabled, message);
      },
      () => {
        // If settings read fails, do nothing (fail-open).
      }
    );
    return () => unsub();
  }, [auth, firestore, isUserLoading, router, toast, user]);

  return null;
}
