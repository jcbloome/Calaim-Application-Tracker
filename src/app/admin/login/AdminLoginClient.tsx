'use client';

import React, { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
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
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
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

      await setPersistence(auth, browserSessionPersistence);

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

      // Force refresh to pick up custom claims (admin)
      await userCredential.user.getIdToken(true);

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

            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
              <Link href="/reset-password" className="text-sm text-primary hover:underline">
                Forgot your password?
              </Link>
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
