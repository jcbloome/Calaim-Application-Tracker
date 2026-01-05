
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
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAdmin } from '@/hooks/use-admin';

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
  const [isReady, setIsReady] = useState(false);


  useEffect(() => {
    // This effect ensures any existing user is logged out when they visit this page.
    if (auth && user) {
        signOut(auth).then(() => {
            // After sign-out, the auth state will change, and the component will re-render.
            // We can now show the login form.
            setIsReady(true);
        });
    } else if (!user) {
        // If there's no user to begin with, the form is ready.
        setIsReady(true);
    }
  }, [auth, user]);


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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // After successful sign-in, manually trigger the admin role check and redirect.
      // This is more reliable than relying on the useEffect hook.
      const adminUser = userCredential.user;
      
      // We must check the roles again after logging in.
      // The `useAdmin` hook will eventually catch up, but a direct check is faster.
      // For now, redirecting and letting the layout handle it is the cleanest approach.
      router.push('/admin');

      toast({
        title: `Signed in as ${email}`,
        description: 'Redirecting to the dashboard...',
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
  
  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Preparing login page...</p>
      </div>
    );
  }

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
