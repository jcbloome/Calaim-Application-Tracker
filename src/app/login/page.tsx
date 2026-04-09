'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  browserLocalPersistence,
  setPersistence,
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
  const redirectPathRaw = String(searchParams.get('redirect') || '').trim();
  const forceLogin = String(searchParams.get('forceLogin') || '').trim() === '1';
  const redirectPath = redirectPathRaw.startsWith('/') && !redirectPathRaw.startsWith('//')
    ? redirectPathRaw
    : '/applications';

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

    if (isUserLoading) return;

    const run = async () => {
      if (forceLogin) {
        setIsForcingFreshLogin(true);
        // Force a fresh credential entry for reminder-email links.
        try {
          safeLocalStorageRemove('calaim_session_type');
          safeLocalStorageRemove('calaim_admin_context');
          await fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
          if (auth?.currentUser) {
            await auth.signOut().catch(() => null);
          }
        } finally {
          setIsForcingFreshLogin(false);
        }
        return;
      }

      // If we're coming from an SW session, force a fresh user login.
      // This prevents the user portal from reusing SW credentials.
      const stored = safeLocalStorageGet('calaim_session_type');
      if (stored === 'sw' && auth?.currentUser) {
        safeLocalStorageRemove('calaim_session_type');
        // best-effort: clear SW server session cookie (if present)
        fetch('/api/auth/sw-session', { method: 'DELETE' }).catch(() => null);
        await auth.signOut().catch(() => null);
        return;
      }

      if (user) {
        // Keep /login as the user-portal entry point.
        // Admins should use /admin/login for admin workflows.
        router.push(redirectPath);
      }
    };

    void run();
  }, [user, isUserLoading, router, auth, redirectPath, forceLogin]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    console.log('🔍 User Login Debug: Sign in attempt started', { email });

    if (!auth || !firestore) {
      const errorMsg = 'Firebase services are not available.';
      console.log('🔍 User Login Debug: Firebase services check failed', { 
        authExists: !!auth, 
        firestoreExists: !!firestore 
      });
      setError(errorMsg);
      setIsLoading(false);
      return;
    }

    void (async () => {
      // Ensure session isolation doesn't sign us out right after auth state flips.
      try {
        localStorage.removeItem('calaim_session_type');
        localStorage.setItem('calaim_session_type', 'user');
        localStorage.removeItem('calaim_admin_context');
      } catch {
        // ignore
      }

      console.log('🔍 User Login Debug: Checking current user');
      if (auth.currentUser) {
        console.log('🔍 User Login Debug: Signing out current user', { currentUser: auth.currentUser.email });
        await auth.signOut();
      }
      
      console.log('🔍 User Login Debug: Setting persistent login mode');
      await setPersistence(auth, browserLocalPersistence);
      
      console.log('🔍 User Login Debug: Attempting sign in with email/password');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      console.log('🔍 User Login Debug: Sign in successful', { 
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified
      });

      // If this account has admin access, immediately establish admin session context
      // (cookie + custom claims) and switch session type to prevent portal isolation issues.
      try {
        const idToken = await userCredential.user.getIdToken();
        const sessionResponse = await fetch('/api/auth/admin-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        if (sessionResponse.ok) {
          // Force refresh and verify admin claim before redirecting to admin.
          await userCredential.user.getIdToken(true);
          const tokenResult = await userCredential.user.getIdTokenResult();
          if (Boolean((tokenResult?.claims as any)?.admin)) {
            try {
              localStorage.removeItem('calaim_session_type');
              localStorage.setItem('calaim_session_type', 'admin');
              localStorage.removeItem('calaim_admin_context');
            } catch {
              // ignore
            }
            enhancedToast.success('Admin access detected', 'Redirecting to the admin portal…');
            router.replace('/admin');
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // If the user isn't an admin, admin-session will fail. Ignore and continue as a normal user.
      }

      // Track login + online portal session.
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
      
      console.log('🔍 User Login Debug: Showing success toast');
      enhancedToast.success('Successfully signed in!', 'Redirecting to your dashboard...');
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
      setIsLoading(false);
    });
  };

  
  if (isUserLoading || isForcingFreshLogin || (user && !forceLogin)) {
      return (
          <div className="flex items-center justify-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading session...</p>
          </div>
      );
  }

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4 min-h-screen">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold">Connect CalAIM Login</CardTitle>
            <CardDescription className="text-base">
              Enter your credentials to begin a new or access existing CalAIM applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {redirectPathRaw && redirectPathRaw !== '/applications' && (
              <Alert className="mb-4 border-blue-200 bg-blue-50">
                <AlertDescription className="text-sm text-blue-800">
                  Sign in to continue, or{' '}
                  <Link href={`/signup${redirectPathRaw ? `?redirect=${encodeURIComponent(redirectPathRaw)}` : ''}`} className="font-medium underline">
                    create a free account
                  </Link>{' '}
                  if you&apos;re new.
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
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-7 h-7 w-7"
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
              <Link href="/reset-password" className="text-sm text-primary hover:underline">
                Forgot your password?
              </Link>
            </div>
            
             <div className="mt-4 p-3 rounded-lg bg-slate-50 border text-center text-sm">
              New to Connect CalAIM?{' '}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Create a free account
              </Link>
              {' '}to start your application.
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
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2">Loading session...</p>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}