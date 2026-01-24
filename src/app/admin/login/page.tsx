
'use client';

import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, LogIn, ShieldAlert, LogOut, Mail, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
// import { useAdmin } from '@/hooks/use-admin';
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
        console.error("Error tracking login:", error);
    }
}


export default function AdminLoginPage() {
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  // Removed useAdmin hook to prevent loading issues
  // const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [debugInfo, setDebugInfo] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  // Add debug logging function
  const addDebugLog = (message: string, data?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    console.log(`🔍 Admin Login Debug: ${message}`, data);
    setDebugInfo(prev => [...prev.slice(-9), logEntry]); // Keep last 10 entries
  };

  // Debug Firebase state on component mount
  useEffect(() => {
    addDebugLog('Component mounted');
    addDebugLog('Auth state', { 
      authExists: !!auth, 
      firestoreExists: !!firestore,
      currentUser: auth?.currentUser?.email || 'none'
    });
  }, [auth, firestore]);

  // Disabled automatic redirect to prevent conflicts with admin layout
  // useEffect(() => {
  //   if (!isAdminLoading && (isAdmin || isSuperAdmin)) {
  //     // Use setTimeout to prevent hot reload issues
  //     const timer = setTimeout(() => {
  //       if (typeof window !== 'undefined') {
  //         window.location.href = '/admin';
  //       }
  //     }, 100);
  //     
  //     return () => clearTimeout(timer);
  //   }
  // }, [isAdmin, isSuperAdmin, isAdminLoading]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    addDebugLog('Sign in attempt started', { email });

    if (!auth || !firestore) {
      const errorMsg = 'Firebase services are not available.';
      addDebugLog('Firebase services check failed', { 
        authExists: !!auth, 
        firestoreExists: !!firestore 
      });
      setError(errorMsg);
      setIsLoading(false);
      return;
    }

    try {
      addDebugLog('Checking current user');
      if (auth.currentUser) {
        addDebugLog('Signing out current user', { currentUser: auth.currentUser.email });
        await auth.signOut();
      }
      
      addDebugLog('Setting persistence');
      await setPersistence(auth, browserLocalPersistence);
      
      addDebugLog('Attempting sign in with email/password');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      addDebugLog('Sign in successful', { 
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified
      });

      // Track the login event
      addDebugLog('Tracking login event');
      await trackLogin(firestore, userCredential.user, 'Admin');
      
      addDebugLog('Showing success toast');
      toast({
        title: 'Sign In Successful!',
        description: 'Redirecting to admin panel...',
      });

      addDebugLog('Login successful - admin layout will handle redirect');
      // Let the admin layout handle the redirect automatically
      setIsLoading(false);

    } catch (err) {
      const authError = err as AuthError;
      addDebugLog('Sign in error caught', { 
        code: authError.code,
        message: authError.message,
        fullError: authError
      });
      
      let errorMessage = 'An unexpected error occurred.';
       if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (authError.code === 'auth/too-many-requests') {
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.';
      } else {
        // Include the actual error for debugging
        errorMessage = `${errorMessage} (Error: ${authError.code || 'unknown'})`;
      }
      
      addDebugLog('Setting error message', { errorMessage });
      setError(errorMessage);
      setIsLoading(false); // Only set loading to false on error.
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
      // Use our custom password reset API exclusively - no more ugly Firebase emails!
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

  // Don't show loading screen - let users always access login page
  // if (isAdminLoading) {
  //   return (
  //     <div className="flex items-center justify-center h-screen">
  //       <Loader2 className="h-8 w-8 animate-spin" />
  //       <p className="ml-2">Loading session...</p>
  //     </div>
  //   );
  // }

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
            
            {/* Forgot Password Section */}
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

        {/* Debug Panel */}
        <Card className="mt-4 shadow-lg border-orange-200">
          <CardHeader className="pb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDebug(!showDebug)}
              className="w-full justify-between"
            >
              <div className="flex items-center">
                <Bug className="mr-2 h-4 w-4" />
                Debug Information
              </div>
              {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CardHeader>
          {showDebug && (
            <CardContent className="pt-0">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <div className="text-sm font-medium text-gray-700">
                  Firebase Status:
                </div>
                <div className="text-xs bg-gray-50 p-2 rounded">
                  <div>Auth: {auth ? '✅ Connected' : '❌ Not Available'}</div>
                  <div>Firestore: {firestore ? '✅ Connected' : '❌ Not Available'}</div>
                  <div>Current User: {auth?.currentUser?.email || 'None'}</div>
                </div>
                
                <div className="text-sm font-medium text-gray-700 mt-4">
                  Recent Debug Logs:
                </div>
                <div className="space-y-1">
                  {debugInfo.length === 0 ? (
                    <div className="text-xs text-gray-500 italic">No debug logs yet</div>
                  ) : (
                    debugInfo.map((log, index) => (
                      <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                        <div className="font-mono text-gray-600">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="font-medium">{log.message}</div>
                        {log.data && (
                          <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                            {log.data}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDebugInfo([])}
                  className="w-full mt-2"
                >
                  Clear Debug Logs
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}

    