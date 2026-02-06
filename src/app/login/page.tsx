'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  browserSessionPersistence,
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
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { AccessibleButton } from '@/components/ui/accessible-button';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useSocialWorker } from '@/hooks/use-social-worker';
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
        console.error("Error tracking login:", error);
    }
}

export default function LoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();
  const { user, isUserLoading, isAdmin } = useAdmin();
  const { isSocialWorker, isLoading: isSocialWorkerLoading } = useSocialWorker();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isUserLoading || isSocialWorkerLoading) {
      return;
    }
    if (user) {
      if (isAdmin) {
        router.push('/admin');
      } else if (isSocialWorker) {
        router.push('/sw-portal');
      } else {
        router.push('/applications');
      }
    }
  }, [user, isUserLoading, isSocialWorkerLoading, isAdmin, isSocialWorker, router]);

  const handleSignIn = async (e: React.FormEvent) => {
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

    try {
      console.log('🔍 User Login Debug: Checking current user');
      if (auth.currentUser) {
        console.log('🔍 User Login Debug: Signing out current user', { currentUser: auth.currentUser.email });
        await auth.signOut();
      }
      
      console.log('🔍 User Login Debug: Setting session-only persistence');
      await setPersistence(auth, browserSessionPersistence);
      
      console.log('🔍 User Login Debug: Attempting sign in with email/password');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      console.log('🔍 User Login Debug: Sign in successful', { 
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified
      });

      // Track the login event
      console.log('🔍 User Login Debug: Tracking login event');
      await trackLogin(firestore, userCredential.user, 'User');
      
      console.log('🔍 User Login Debug: Showing success toast');
      enhancedToast.success('Successfully signed in!', 'Redirecting to your dashboard...');
    } catch (err) {
      const authError = err as AuthError;
      console.log('🔍 User Login Debug: Sign in error caught', { 
        code: authError.code,
        message: authError.message,
        fullError: authError
      });
      
      let errorMessage = 'Invalid email or password. Please try again.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        errorMessage = `An unexpected error occurred: ${authError.message} (Code: ${authError.code})`;
      }
      console.log('🔍 User Login Debug: Setting error message', { errorMessage });
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  
  if (isUserLoading || user) {
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
            
             <div className="mt-4 text-center text-sm">
              Don't have an account?{' '}
              <Link href="/signup" className="underline text-primary">
                Sign Up
              </Link>
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