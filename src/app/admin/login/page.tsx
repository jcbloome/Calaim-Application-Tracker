
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
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
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, LogIn, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import Image from 'next/image';

export default function AdminLoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect already logged-in admins
  useEffect(() => {
    if (!isAdminLoading && user && (isAdmin || isSuperAdmin)) {
      router.push('/admin');
    }
  }, [user, isAdmin, isSuperAdmin, isAdminLoading, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!auth) {
      setError('Firebase services are not available.');
      setIsLoading(false);
      return;
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      // The useEffect will handle redirection.
      toast({
        title: 'Sign In Successful!',
        description: 'Redirecting to the admin dashboard...',
      });
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'An unexpected error occurred.';
       if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (auth) {
      await auth.signOut();
      // Force a full reload to clear all state
      window.location.reload();
    }
  };

  // While checking auth state, show a loader
  if (isUserLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // If a user is logged in but is NOT an admin, show Access Denied
  if (user && !isAdmin && !isSuperAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="items-center text-center p-6">
             <ShieldAlert className="h-12 w-12 text-destructive" />
            <CardTitle className="text-2xl font-bold mt-4">Access Denied</CardTitle>
            <CardDescription>
              The account <span className="font-semibold">{user.email}</span> does not have admin privileges.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Button onClick={handleSignOut} className="w-full">
                <LogOut className="mr-2 h-4 w-4" /> Sign Out and Try Again
            </Button>
            <Link href="/" className="text-sm text-primary hover:underline">
                Go to Home Page
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  // If no user is logged in, or the user is an admin but somehow on this page, show login form.
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
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Signing In...</> : <><LogIn className="mr-2 h-4 w-4" />Sign In</>}
              </Button>
            </form>
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
