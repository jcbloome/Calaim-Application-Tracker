
'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile, browserLocalPersistence, setPersistence, type User } from 'firebase/auth';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { AuthError } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { LoginSupportContact } from '@/components/LoginSupportContact';
import {
  applicationIdFromRedirectPath,
  claimAdminStartedApplicationsClient,
} from '@/lib/claim-admin-started-client';

async function trackLogin(firestore: any, user: User, role: 'Admin' | 'User') {
    if (!firestore || !user) return;
    try {
        await addDoc(collection(firestore, 'loginLogs'), {
            userId: user.uid,
            email: user.email,
            displayName: user.displayName,
            role: role,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error tracking login:", error);
    }
}

function SignUpPageContent() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();
  const { user, isUserLoading } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectPathRaw = String(searchParams.get('redirect') || '').trim();
  const emailParam = String(searchParams.get('email') || '').trim();
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

  useEffect(() => {
    if (!isUserLoading && user) {
      markUserPortalSession();
      window.location.assign(redirectPath);
    }
  }, [user, isUserLoading, redirectPath]);

  useEffect(() => {
    if (!emailParam) return;
    setEmail(emailParam);
  }, [emailParam]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth || !firestore) {
      setError('Firebase services are not available.');
      setIsLoading(false);
      return;
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      const laneRes = await fetch('/api/auth/email-lane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const laneData = (await laneRes.json().catch(() => ({}))) as any;
      if (!laneRes.ok) {
        throw new Error(String(laneData?.error || 'Could not validate email role lane.'));
      }
      if (!Boolean(laneData?.isUserLaneAllowed)) {
        const reservedLane = String(laneData?.reservedLane || '').toLowerCase();
        if (reservedLane === 'sw') {
          throw new Error('This email is reserved for Social Worker login. Please use a separate user email.');
        }
        if (reservedLane === 'admin') {
          throw new Error('This email is reserved for Admin login. Please use a separate user email.');
        }
        throw new Error('This email is reserved for another portal role. Please use a separate user email.');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const newUser = userCredential.user;
      await setPersistence(auth, browserLocalPersistence);
      markUserPortalSession();
      
      const displayName = `${firstName} ${lastName}`.trim();
      
      await updateProfile(newUser, { displayName });

      const userDocRef = doc(firestore, 'users', newUser.uid);
      await setDoc(userDocRef, {
          id: newUser.uid,
          firstName,
          lastName,
          displayName,
          email: newUser.email,
      });

      // Track the signup/login event
      await trackLogin(firestore, newUser, 'User');

      // Link any backend-started applications to this family account on first signup.
      const claimApplicationId = applicationIdFromRedirectPath(redirectPath);
      const claimResult = await claimAdminStartedApplicationsClient(newUser, {
        applicationId: claimApplicationId,
      });
      const claimedCount = Number(claimResult?.claimedCount || 0);

      toast({
        title: 'Account Created!',
        description:
          claimedCount > 0
            ? `Your account is ready. ${claimedCount} application(s) were linked to your email.`
            : 'Your account is ready. Opening My Applications...',
      });
      
      markUserPortalSession();
      window.location.assign(redirectPath);

    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'An error occurred during sign up. Please try again.';
      if (authError.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use. Please try logging in instead.';
      } else if (authError.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please use at least 6 characters.';
      } else if ((err as any) instanceof Error && (err as any).message) {
        errorMessage = String((err as any).message);
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold">Create an Account</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Alert className="mb-4 border-blue-200 bg-blue-50">
              <AlertTitle className="text-blue-900">Linking your applications</AlertTitle>
              <AlertDescription className="space-y-2 text-blue-800">
                <div>
                  If Connections already started one or more applications with your email, they will all show under{' '}
                  <span className="font-medium">My Applications</span> after you create your account.
                </div>
                <div>
                  If nothing has been started yet, you can still create an account and begin a new application here.
                </div>
              </AlertDescription>
            </Alert>
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

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
                  minLength={6}
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
                  <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                </Button>
              </div>

              <div className="space-y-2 relative">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && 
                <Alert variant="destructive">
                    <AlertTitle>Sign Up Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
              }

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Creating Account...</> : 'Create Account'}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              Already have an account?{' '}
              <Link href="/login" className="underline text-primary">
                Log In
              </Link>
            </div>
            <div className="mt-2 text-center text-sm text-muted-foreground">
              Need to set a new password first?{' '}
              <Link
                href={`/reset-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
                className="underline text-primary"
              >
                Reset password
              </Link>
            </div>
            <div className="mt-4">
              <LoginSupportContact />
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <SignUpPageContent />
    </Suspense>
  );
}

    