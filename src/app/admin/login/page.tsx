
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import { signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';
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

export default function AdminLoginPage() {
  const [logs, setLogs] = useState<string[]>([]);

  // Using React.useCallback to memoize the function, ensuring it's stable
  const addLog = React.useCallback((message: string) => {
    const timestampedMessage = `[${new Date().toISOString()}] ${message}`;
    console.log(timestampedMessage); // Keep for server/browser console visibility
    setLogs(prev => [...prev, timestampedMessage]);
  }, []);

  useEffect(() => {
    addLog("AdminLoginPage: Component is mounting.");
  }, [addLog]);

  const auth = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    addLog(`AdminLoginPage useEffect: Running. isUserLoading: ${isUserLoading}, user exists: ${!!user}`);
    if (!isUserLoading && user) {
      addLog("AdminLoginPage useEffect: User is already logged in. Redirecting to /admin.");
      router.push('/admin');
    }
    addLog("AdminLoginPage useEffect: Finished.");
  }, [user, isUserLoading, router, addLog]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog("handleSignIn: Starting sign-in process.");
    setIsLoading(true);
    setError(null);

    if (!auth) {
      const errorMsg = "Firebase services are not available. Please try again later.";
      addLog(`handleSignIn: Auth service not available.`);
      setError(errorMsg);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMsg,
      });
      setIsLoading(false);
      return;
    }

    try {
      addLog("handleSignIn: Setting persistence.");
      await setPersistence(auth, browserSessionPersistence);
      addLog("handleSignIn: Persistence set. Calling signInWithEmailAndPassword.");
      await signInWithEmailAndPassword(auth, email, password);
      addLog("handleSignIn: Sign-in successful.");
      toast({
        title: 'Successfully signed in!',
        description: 'Redirecting to your dashboard...',
        duration: 2000,
      });
      router.push('/admin');
    } catch (err) {
      const authError = err as AuthError;
      let errorMessage = 'Invalid email or password. Please try again.';
      if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else {
        errorMessage = `An unexpected error occurred: ${authError.message}`;
      }
      addLog(`handleSignIn: Error - ${errorMessage}`);
      setError(errorMessage);
    } finally {
      addLog("handleSignIn: Finished sign-in attempt.");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    addLog("AdminLoginPage: Returning JSX.");
  }, [addLog]);

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
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Signing In...</> : 'Sign In'}
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

          <Alert variant="default" className="mt-6">
            <AlertTitle>Live Diagnostic Log</AlertTitle>
            <AlertDescription asChild>
                <pre className="mt-2 h-48 overflow-y-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
                    {logs.join('\n')}
                </pre>
            </AlertDescription>
          </Alert>

      </div>
    </main>
  );
}
