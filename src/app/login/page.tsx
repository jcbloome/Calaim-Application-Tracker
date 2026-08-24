'use client';

import React, { Suspense, useState, useEffect, useRef } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
} from 'firebase/auth';
import type { AuthError, User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { trackLoginActivityClient, setPortalSessionOnlineClient } from '@/lib/login-activity-client';
import { LoginSupportContact } from '@/components/LoginSupportContact';
import {
  applicationIdFromRedirectPath,
  claimAdminStartedApplicationsClient,
} from '@/lib/claim-admin-started-client';

function LoginPageContent() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();
  const { user, isUserLoading } = useAdmin();
  // NOTE: Do not auto-route "user login" into the SW portal.
  // Social workers should use `/sw-login` explicitly; otherwise a stale/legacy `socialWorkers`
  // record can incorrectly redirect regular users after password resets.

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isForcingFreshLogin, setIsForcingFreshLogin] = useState(false);
  const [isRedirectingAfterAuth, setIsRedirectingAfterAuth] = useState(false);
  const hasAppliedFreshLoginRef = useRef(false);
  const isSigningInRef = useRef(false);
  const effectiveUser = user ?? auth?.currentUser ?? null;
  const authStillSettling = isUserLoading && !auth?.currentUser;
  const redirectPathRaw = String(searchParams.get('redirect') || '').trim();
  const emailParam = String(searchParams.get('email') || '').trim();
  const forceLogin = String(searchParams.get('forceLogin') || '').trim() === '1';
  const shouldForceFreshLogin = forceLogin;
  const redirectPath = redirectPathRaw.startsWith('/') && !redirectPathRaw.startsWith('//')
    ? redirectPathRaw
    : '/applications';

  const markUserPortalSession = () => {
    try {
      localStorage.removeItem('calaim_session_type');
      localStorage.setItem('calaim_session_type', 'user');
      localStorage.removeItem('calaim_admin_context');
    } catch {
      // ignore
    }
  };

  const waitForAuthUser = async (expectedUid: string) =>
    new Promise<void>((resolve) => {
      if (!auth) {
        resolve();
        return;
      }
      if (auth.currentUser?.uid === expectedUid) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve();
      }, 3000);
      const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        if (nextUser?.uid === expectedUid) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

  useEffect(() => {
    if (!emailParam) return;
    setEmail(emailParam);
  }, [emailParam]);

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

    if (authStillSettling) return;
    if (isSigningInRef.current) return;

    const run = async () => {
      if (shouldForceFreshLogin && !hasAppliedFreshLoginRef.current) {
        hasAppliedFreshLoginRef.current = true;
        setIsForcingFreshLogin(true);
        // Force a fresh credential entry one time for this page load.
        try {
          safeLocalStorageRemove('calaim_session_type');
          safeLocalStorageRemove('calaim_admin_context');
          await fetch('/api/auth/admin-session', { method: 'DELETE' }).catch(() => null);
          await fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
          if (auth?.currentUser) {
            await auth.signOut().catch(() => null);
          }
        } finally {
          setIsForcingFreshLogin(false);
        }
        return;
      }

      // Clear stale staff portal markers only. Do not sign out here — that races with
      // an in-flight family login and can undo a successful sign-in.
      const stored = safeLocalStorageGet('calaim_session_type');
      if (stored === 'sw' || stored === 'admin') {
        safeLocalStorageRemove('calaim_session_type');
        fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
        fetch('/api/auth/admin-session', { method: 'DELETE' }).catch(() => null);
      }
    };

    void run();
  }, [authStillSettling, router, auth, shouldForceFreshLogin]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    isSigningInRef.current = true;

    console.log('🔍 User Login Debug: Sign in attempt started', { email: normalizedEmail });

    if (!auth || !firestore) {
      const errorMsg = 'Firebase services are not available.';
      console.log('🔍 User Login Debug: Firebase services check failed', { 
        authExists: !!auth, 
        firestoreExists: !!firestore 
      });
      setError(errorMsg);
      isSigningInRef.current = false;
      setIsLoading(false);
      return;
    }

    void (async () => {
      // Ensure session isolation doesn't sign us out right after auth state flips.
      try {
        markUserPortalSession();
        await fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
        await fetch('/api/auth/admin-session', { method: 'DELETE' }).catch(() => null);
      } catch {
        // ignore
      }

      console.log('🔍 User Login Debug: Checking current user');
      const currentEmail = String(auth.currentUser?.email || '').trim().toLowerCase();
      if (auth.currentUser && currentEmail !== normalizedEmail) {
        console.log('🔍 User Login Debug: Signing out different signed-in user', {
          currentUser: auth.currentUser.email,
        });
        await auth.signOut();
      }
      
      console.log('🔍 User Login Debug: Setting persistent login mode');
      await setPersistence(auth, browserLocalPersistence);
      
      console.log('🔍 User Login Debug: Attempting sign in with email/password');
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      
      console.log('🔍 User Login Debug: Sign in successful', { 
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified
      });

      // Enforce lane separation: this portal is for end-users only.
      const tokenResult = await userCredential.user.getIdTokenResult();
      const claims = (tokenResult?.claims || {}) as Record<string, any>;
      let laneData: any = null;
      try {
        const laneResponse = await fetch('/api/auth/email-lane', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail }),
        });
        laneData = await laneResponse.json().catch(() => null);
      } catch {
        laneData = null;
      }

      if (laneData?.success) {
        if (!Boolean(laneData.isUserLaneAllowed)) {
          const reservedLane = String(laneData.reservedLane || '').trim().toLowerCase();
          await auth.signOut().catch(() => null);
          if (reservedLane === 'sw') {
            setError('This email is assigned to Social Worker login. Please sign in at /sw-login.');
          } else if (reservedLane === 'admin') {
            setError('This email is assigned to Admin login. Please sign in at /admin/login.');
          } else {
            setError('This email is reserved for another portal role. Please use a dedicated user email or contact Connections.');
          }
          return;
        }
      } else if (Boolean(claims.admin) || Boolean(claims.superAdmin)) {
        // Lane API unavailable — only block when admin claims are present.
        await auth.signOut().catch(() => null);
        setError('This email is assigned to Admin login. Please sign in at /admin/login.');
        return;
      }

      // Keep /login in the user lane; do not bootstrap admin sessions here.
      try {
        // no-op block kept for existing try/catch shape
      } catch {
        // no-op
      }

      // Track login + online portal session (non-blocking).
      try {
        await trackLoginActivityClient(firestore, {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName,
          role: 'User',
          action: 'login',
          portal: 'user',
        });
        await setPortalSessionOnlineClient(firestore, {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName,
          role: 'User',
          portal: 'user',
          sessionType: 'user',
        });
      } catch (activityError) {
        console.warn('[USER_LOGIN] Non-blocking activity tracking failure:', activityError);
      }

      console.log('🔍 User Login Debug: Showing success toast');
      const claimApplicationId = applicationIdFromRedirectPath(redirectPath);
      const claimResult = await claimAdminStartedApplicationsClient(userCredential.user, {
        applicationId: claimApplicationId,
      });
      const claimedCount = Number(claimResult?.claimedCount || 0);
      if (claimedCount > 0) {
        enhancedToast.success(
          'Successfully signed in!',
          `${claimedCount} application(s) linked to your account.`
        );
      } else {
        enhancedToast.success('Successfully signed in!', 'Redirecting to My Applications...');
      }
      markUserPortalSession();
      await waitForAuthUser(userCredential.user.uid);
      setIsRedirectingAfterAuth(true);
      // Hard navigation keeps Firebase auth + family portal session in sync after sign-in.
      window.location.assign(redirectPath);
    })().catch((err) => {
      const authError = err as AuthError;
      const code = String(authError?.code || '').trim();
      const msg = String(authError?.message || '').trim();
      // Avoid Next dev overlay by not rethrowing and not logging the full error object.
      console.warn('User login failed', code ? { code, message: msg } : undefined);
      
      let errorMessage = 'Invalid email or password. Please try again.';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (code === 'auth/too-many-requests') {
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        errorMessage = `An unexpected error occurred: ${msg || 'Unknown error'}${code ? ` (Code: ${code})` : ''}`;
      }
      console.log('🔍 User Login Debug: Setting error message', { errorMessage });
      setError(errorMessage);
    }).finally(() => {
      isSigningInRef.current = false;
      setIsLoading(false);
    });
  };

  
  if (isForcingFreshLogin || isRedirectingAfterAuth) {
      return (
          <div className="flex items-center justify-center min-h-[60vh] px-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading...</p>
          </div>
      );
  }

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-3 sm:p-4 min-h-screen">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="items-center text-center p-5 sm:p-6">
            <CardTitle className="text-2xl sm:text-3xl font-bold">Connect CalAIM Login</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Sign in with the email staff used as the primary contact on your member application.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            <Alert className="mb-4 border-blue-200 bg-blue-50">
              <AlertTitle className="text-blue-900">How this works</AlertTitle>
              <AlertDescription className="space-y-2 text-blue-800">
                <div>
                  <strong>No invitation is required.</strong> If Connections staff already started an application
                  and entered your email as the primary contact, create an account or sign in with that same email.
                  Every matching application will appear under <span className="font-medium">My Applications</span>.
                </div>
                <div>
                  If staff have not started an application for you yet, you can still create an account and start a
                  new application yourself.
                </div>
                <div>
                  Already have an account? Sign in below, or{' '}
                  <Link
                    href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                    className="font-medium underline"
                  >
                    reset your password
                  </Link>
                  .
                </div>
              </AlertDescription>
            </Alert>
            {effectiveUser && !isLoading && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <AlertDescription className="text-sm text-green-900">
                  You are signed in as <strong>{effectiveUser.email}</strong>.{' '}
                  <Link href="/applications" className="font-medium underline">
                    Go to My Applications
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {redirectPathRaw && redirectPathRaw !== '/applications' && (
              <Alert className="mb-4 border-blue-200 bg-blue-50">
                <AlertDescription className="text-sm text-blue-800">
                  Sign in to continue, or{' '}
                  <Link
                    href={`/signup${redirectPathRaw ? `?redirect=${encodeURIComponent(redirectPathRaw)}${email.trim() ? `&email=${encodeURIComponent(email.trim())}` : ''}` : ''}`}
                    className="font-medium underline"
                  >
                    create an account
                  </Link>{' '}
                  with the email on your application.
                </AlertDescription>
              </Alert>
            )}
            {forceLogin && (
              <Alert className="mb-4 border-amber-200 bg-amber-50">
                <AlertDescription className="text-sm text-amber-900">
                  For security, please sign in again to continue to this application.
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2 relative">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="pr-10"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-7 h-7 w-7"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {error && 
                <Alert variant="destructive">
                    <AlertTitle>Login Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
              }
              <AccessibleButton 
                type="submit" 
                className="w-full" 
                loading={isLoading}
                loadingText="Signing In..."
                icon={<LogIn className="h-4 w-4" />}
              >
                Sign In
              </AccessibleButton>
            </form>
            
            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <Link
                href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                className="text-sm text-primary hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            
             <div className="mt-4 p-3 rounded-lg bg-slate-50 border text-center text-sm">
              New to Connect CalAIM?{' '}
              <Link
                href={`/signup${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                className="font-semibold text-primary hover:underline"
              >
                Create an account
              </Link>
              {' '}with the email on your member application.
            </div>
            
            <div className="mt-4 text-center">
              <LoginSupportContact />
            </div>

            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
                ← Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh] px-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2">Loading...</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}