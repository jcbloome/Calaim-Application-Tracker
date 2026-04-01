'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { auth, useFirestore } from '@/firebase';
import { Loader2, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clearStoredSwLoginDay, getTodayLocalDayKey, readStoredSwLoginDay, writeStoredSwLoginDay } from '@/lib/sw-daily-session';
import { useAuthState } from 'react-firebase-hooks/auth';
import { trackLoginActivityClient, setPortalSessionOnlineClient } from '@/lib/login-activity-client';


function SWLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const firestore = useFirestore();
  const [currentUser, authLoading] = useAuthState(auth);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // If we're coming from a user/admin session, force a fresh SW login.
  // This prevents the SW portal from reusing user credentials (and vice versa).
  useEffect(() => {
    const safeLocalStorageGet = (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const safeLocalStorageRemove = (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    };

    if (authLoading) return;
    if (!currentUser) return;

    const stored = safeLocalStorageGet('calaim_session_type');
    if (stored && stored !== 'sw') {
      safeLocalStorageRemove('calaim_session_type');
      clearStoredSwLoginDay();
      fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
      auth.signOut().catch(() => null);
    }
  }, [authLoading, currentUser]);

  // If already signed in and has SW claim, redirect to portal.
  // On first visit while logged out, we skip any SW verification and just show the form.
  useEffect(() => {
    if (isLoading) return;
    if (authLoading) return;
    if (!currentUser) return;

    const run = async () => {
      const today = getTodayLocalDayKey();
      const stored = readStoredSwLoginDay();
      if (stored && stored !== today) {
        // Force re-login on a new day.
        clearStoredSwLoginDay();
        await auth.signOut().catch(() => null);
        fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
        return;
      }

      try {
        const tokenResult = await currentUser.getIdTokenResult();
        const claims = (tokenResult?.claims || {}) as Record<string, any>;
        if (Boolean(claims.socialWorker)) {
          if (!stored) writeStoredSwLoginDay(today);
          router.push('/sw-portal/roster');
        }
      } catch {
        // best-effort only
      }
    };

    void run();
  }, [authLoading, currentUser, isLoading, router]);

  useEffect(() => {
    const reason = String(searchParams?.get('reason') || '').trim().toLowerCase();
    if (reason === 'daily') {
      toast({
        title: 'Daily sign-in required',
        description: 'For security, Social Workers must sign in again each day.',
      });
    }
  }, [searchParams, toast]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    void (async () => {
      const normalizedEmail = email.trim().toLowerCase();
      // Clear any stale daily marker before a fresh SW sign-in.
      // This prevents the "new day" effect from signing out immediately during first-login bootstrap.
      clearStoredSwLoginDay();

      // Ensure session isolation doesn't immediately sign us out after auth state flips.
      try {
        localStorage.removeItem('calaim_session_type');
        localStorage.setItem('calaim_session_type', 'sw');
        localStorage.removeItem('calaim_admin_context');
      } catch {
        // ignore
      }

      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);

      // Establish SW session (server-side verification + claim sync).
      const idToken = await userCredential.user.getIdToken();
      const sessionResponse = await fetch('/api/auth/sw-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!sessionResponse.ok) {
        const sessionData = await sessionResponse.json().catch(() => ({}));
        const sessionError = sessionData?.error || 'Social worker access required.';
        await auth.signOut().catch(() => null);
        setError(sessionError);
        return;
      }

      // Force refresh to pick up custom claims.
      await userCredential.user.getIdToken(true);

      // Wait briefly for the socialWorker claim to become visible.
      // This avoids a redirect loop / false "not enabled" error right after login.
      const deadline = Date.now() + 10_000;
      let hasSwClaim = false;
      while (Date.now() < deadline) {
        try {
          const tokenResult = await userCredential.user.getIdTokenResult();
          const claims = (tokenResult?.claims || {}) as Record<string, any>;
          if (Boolean(claims.socialWorker)) {
            hasSwClaim = true;
            break;
          }
        } catch {
          // ignore and retry
        }
        await userCredential.user.getIdToken(true);
        await new Promise((r) => setTimeout(r, 600));
      }

      if (!hasSwClaim) {
        await auth.signOut().catch(() => null);
        setError('This email is not enabled for Social Worker access. Please contact your administrator.');
        return;
      }

      // Record daily login marker (forces a fresh sign-in each day).
      writeStoredSwLoginDay(getTodayLocalDayKey());
      await trackLoginActivityClient(firestore, {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        role: 'Social Worker',
        action: 'login',
        portal: 'sw',
      });
      await setPortalSessionOnlineClient(firestore, {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        role: 'Social Worker',
        portal: 'sw',
        sessionType: 'sw',
      });

      toast({
        title: 'Login Successful',
        description: 'Welcome to the Social Worker Portal'
      });

      router.push('/sw-portal/roster');
    })()
      .catch((err: any) => {
        const code = String(err?.code || '').trim();
        // Avoid Next dev overlay "Unhandled Runtime Error" by not rethrowing and by
        // not passing the raw Error object directly to console.error.
        if (code) console.warn('SW login failed:', code);
        else console.warn('SW login failed');

        let errorMessage = 'Login failed. Please try again.';

        // Firebase v10+ often uses auth/invalid-credential for wrong email/password.
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
          errorMessage = 'Incorrect email or password. Please try again.';
        } else if (code === 'auth/invalid-email') {
          errorMessage = 'Please enter a valid email address.';
        } else if (code === 'auth/too-many-requests') {
          errorMessage = 'Too many failed attempts. Please try again later.';
        }

        setError(errorMessage);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white/80 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="w-40 h-auto object-contain"
              priority
            />
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
        {/* Login Form */}
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base leading-snug sm:text-xl">Hello Social Worker. Please sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full pr-10"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Login
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-3">
              <div className="text-center">
                <Link 
                  href="/reset-password" 
                  className="text-sm text-primary hover:underline flex items-center justify-center gap-1"
                >
                  <Lock className="h-4 w-4" />
                  Forgot your password?
                </Link>
              </div>
              <div className="text-center text-sm text-gray-600">
                <p>Need help accessing your account?</p>
                <p className="mt-1">
                  Contact{' '}
                  <a className="text-primary hover:underline" href="mailto:john@carehomefinders.com">
                    john@carehomefinders.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>© 2026 Connect CalAIM. All rights reserved.</p>
          <p className="mt-1">Social Worker Portal - Secure Access</p>
        </div>
        </div>
      </div>
    </div>
  );
}

export default function SWLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <SWLoginPageContent />
    </Suspense>
  );
}