
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence, signOut } from 'firebase/auth';
import type { AuthError } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, LogOut } from 'lucide-react';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAdmin } from '@/hooks/use-admin';
import Link from 'next/link';

export default function AdminLoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // This effect will redirect a user if they are ALREADY an admin
  useEffect(() => {
    if (!isAdminLoading && (isAdmin || isSuperAdmin)) {
      router.push('/admin');
    }
  }, [isAdmin, isSuperAdmin, isAdminLoading, router]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setError(null);

    if (!auth) {
      const errorMsg = "Firebase services are not available. Please try again later.";
      setError(errorMsg);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMsg,
      });
      setIsSigningIn(false);
      return;
    }

    try {
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      
      // IMPORTANT: The redirect is now handled by the useEffect hook above
      // and the main admin layout. This allows the useAdmin hook time to
      // get the new user's roles.
      toast({
        title: `Signed in as ${email}`,
        description: 'Checking permissions and redirecting...',
      });

    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'An error occurred. Please try again.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
        errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        errorMessage = `An unexpected error occurred: ${authError.message}`;
      }
      setError(errorMessage);
       setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
      // The useAdmin hook will update and the component will re-render
    }
  };
  
  // While loading auth state, show a loader
  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Checking authentication status...</p>
      </div>
    );
  }

  // If a user is logged in, but is NOT an admin, show the access denied message.
  if (user && !isAdmin && !isSuperAdmin) {
     return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-md shadow-2xl">
                 <CardHeader className="items-center text-center p-6">
                    <CardTitle className="text-2xl font-bold">Access Denied</CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <p>
                        The user <span className="font-semibold">{user.email}</span> does not have administrator permissions.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        If you have another account with admin rights, please sign out and sign in again.
                    </p>
                    <Button onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </CardContent>
            </Card>
        </main>
     );
  }

  // If no user is logged in, or if an admin is logged in (but hasn't been redirected yet), show the login form.
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md space-y-4">
             <div className="flex justify-center mb-6">
                 <Image 
                    src="/calaimlogopdf.png"
                    alt="Connect CalAIM Logo"
                    width={240}
                    height={67}
                    className="w-64 h-auto object-contain"
                    priority
                />
            </div>
          <Card className="shadow-2xl">
            <CardHeader className="items-center text-center p-6">
              <CardTitle className="text-3xl font-bold">
                Admin Portal
              </CardTitle>
              <CardDescription className="text-base">
                Please sign in to access the administrator dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2 relative">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-7 h-7 w-7"
                    onClick={() => setShowPassword(prev => !prev)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                  </Button>
                </div>
                
                <Button type="submit" className="w-full" disabled={isSigningIn}>
                  {isSigningIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Signing In...</> : 'Sign In'}
                </Button>
              </form>
               <div className="mt-4 text-center text-sm">
                  <Link href="/" className="underline text-primary">
                    Return to Main Portal Selection
                </Link>
                </div>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive" className="mt-4">
                <AlertTitle>Login Error</AlertTitle>
                <AlertDescription>
                    {error}
                </AlertDescription>
            </Alert>
          )}
      </div>
    </main>
  );
}
