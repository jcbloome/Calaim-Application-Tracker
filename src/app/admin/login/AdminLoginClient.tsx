'use client';

import React, { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  type User
} from 'firebase/auth';
import type { AuthError } from 'firebase/auth';
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
import { Eye, EyeOff, Loader2, LogIn, Mail } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import Image from 'next/image';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
    console.error('Error tracking login:', error);
  }
}

export default function AdminLoginClient() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth || !firestore) {
      const errorMsg = 'Firebase services are not available.';
      setError(errorMsg);
      setIsLoading(false);
      return;
    }

    try {
      if (auth.currentUser) {
        await auth.signOut();
      }

      await setPersistence(auth, browserLocalPersistence);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      const idToken = await userCredential.user.getIdToken();
      const sessionResponse = await fetch('/api/auth/admin-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!sessionResponse.ok) {
        const sessionData = await sessionResponse.json().catch(() => ({}));
        const sessionError = sessionData?.error || 'Admin access not granted.';
        await auth.signOut();
        setError(sessionError);
        setIsLoading(false);
        return;
      }

      await trackLogin(firestore, userCredential.user, 'Admin');

      toast({
        title: 'Sign In Successful!',
        description: 'Redirecting to admin panel...',
      });

      const redirectTo = searchParams.get('redirect');
      const safeRedirect = redirectTo && redirectTo.startsWith('/')
        ? redirectTo
        : '/admin';
      router.replace(safeRedirect);

      setIsLoading(false);
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'An unexpected error occurred.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
        errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        errorMessage = `${errorMessage} (Error: ${authError.code || 'unknown'})`;
      }

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast({
        variant: 'destructive',
        title: 'Email Required',
        description: 'Please enter your email address to reset your password.',
      });
      return;
    }

    if (!auth) {
      toast({
        variant: 'destructive',
        title: 'Service Unavailable',
        description: 'Firebase authentication is not available.',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Password Reset Email Sent',
          description: 'Check your email for a password reset link from the Connections CalAIM Application Portal.',
          className: 'bg-green-100 text-green-900 border-green-200'
        });
        setResetEmail('');
        return;
      } else {
        throw new Error(data.error || 'Failed to send password reset email');
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      let errorMessage = 'Failed to send password reset email. Please try again.';

      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Too many password reset attempts. Please try again later.';
      }

      toast({
        variant: 'destructive',
        title: 'Password Reset Failed',
        description: errorMessage,
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/calaimlogopdf.png"
            alt="Connect CalAIM Logo"
            width={300}
            height={84}
            className="w-64 h-auto object-contain mx-auto"
            priority
          />
        </div>
        <Card className="shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-2xl font-bold">Admin Portal</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
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
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing In...</> : <><LogIn className="mr-2 h-4 w-4" />Sign In</>}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-3">Forgot your password?</p>
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  disabled={isResettingPassword}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={isResettingPassword}
                >
                  {isResettingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Reset Email...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Password Reset Email
                    </>
                  )}
                </Button>
              </form>
            </div>

            <div className="mt-4 text-center text-sm">
              <Link href="/" className="underline text-primary">
                Return to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
