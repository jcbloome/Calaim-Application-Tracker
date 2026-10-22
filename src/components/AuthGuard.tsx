'use client';

import { useState, useEffect } from 'react';
import { TwoFactorAuth } from './TwoFactorAuth';
import { useAuth, useUser } from '@/firebase';
import { fetch2faStatusViaApi } from '@/lib/client-2fa';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
  require2FA?: boolean;
  loginPath?: string;
}

export function AuthGuard({ children, require2FA = false, loginPath }: AuthGuardProps) {
  const [is2FAVerified, setIs2FAVerified] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const effectiveUser = user ?? auth.currentUser ?? null;
  const authStillSettling = isUserLoading && !auth.currentUser;

  useEffect(() => {
    if (authStillSettling) return;
    if (!effectiveUser) {
      // Auth check finished and no session exists.
      // Do not keep the guard in a perpetual loading state.
      setIsChecking(false);
      setIs2FAVerified(false);
      return;
    }

    let cancelled = false;

    const check2FAStatus = async () => {
      if (!require2FA) {
        if (!cancelled) {
          setIs2FAVerified(true);
          setIsChecking(false);
        }
        return;
      }

      try {
        // Same-origin API avoids Firebase callable CORS (status 0 → "internal").
        const data = await fetch2faStatusViaApi(effectiveUser);
        if (!cancelled) {
          setIs2FAVerified(Boolean(data.isVerified));
        }
      } catch (error: any) {
        // Soft-fail to the 2FA UI. Avoid console.error(Error) — Next.js dev overlay
        // treats that as an unhandled runtime error.
        console.warn(
          'Error checking 2FA status:',
          String(error?.code || ''),
          String(error?.message || error || 'unknown')
        );
        if (!cancelled) setIs2FAVerified(false);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    };

    void check2FAStatus();
    return () => {
      cancelled = true;
    };
  }, [effectiveUser, authStillSettling, require2FA]);

  useEffect(() => {
    if (authStillSettling || isChecking) return;
    if (effectiveUser) {
      setIsRedirecting(false);
      return;
    }
    if (!loginPath) return;

    const timeout = window.setTimeout(() => {
      if (auth.currentUser) return;
      setIsRedirecting(true);
      router.replace(loginPath);
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [auth, authStillSettling, effectiveUser, isChecking, loginPath, router]);

  if (authStillSettling || isChecking || isRedirecting) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{isRedirecting ? 'Redirecting to login...' : 'Loading...'}</span>
        </div>
      </div>
    );
  }

  if (!effectiveUser) {
    if (loginPath) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>{isRedirecting ? 'Redirecting to login...' : 'Checking sign-in...'}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please sign in to continue</p>
        </div>
      </div>
    );
  }

  if (require2FA && !is2FAVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <TwoFactorAuth
          onVerificationComplete={() => setIs2FAVerified(true)}
          required={require2FA}
        />
      </div>
    );
  }

  return <>{children}</>;
}
