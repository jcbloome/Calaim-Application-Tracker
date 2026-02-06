'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/firebase';
import { useSocialWorker } from '@/hooks/use-social-worker';
import { Loader2, UserCheck, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function SWLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { isSocialWorker, isLoading: swLoading, status: swStatus } = useSocialWorker();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginAttempted, setLoginAttempted] = useState(false);

  // Redirect if already logged in as social worker
  useEffect(() => {
    if (!swLoading && isSocialWorker) {
      router.push('/sw-portal/submit-claims');
    }
  }, [isSocialWorker, swLoading, router]);

  useEffect(() => {
    if (!loginAttempted || swLoading) return;

    if (isSocialWorker) {
      setIsLoading(false);
      setError('');
      return;
    }

    let message = 'Access denied. You are not authorized to access the Social Worker portal.';
    if (swStatus === 'inactive') {
      message = 'Your Social Worker account is inactive. Please contact your administrator to enable access.';
    } else if (swStatus === 'not-found') {
      message = 'This email is not enabled for Social Worker access. Please contact your administrator.';
    } else if (swStatus === 'error') {
      message = 'We could not verify your Social Worker access. Please try again or contact support.';
    }

    setError(message);
    setIsLoading(false);
    auth.signOut().catch(() => null);
  }, [loginAttempted, swLoading, isSocialWorker, swStatus]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      
      setLoginAttempted(true);
      
      toast({
        title: 'Login Successful',
        description: 'Welcome to the Social Worker Portal'
      });

    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      
      setLoginAttempted(false);
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // Show loading while checking social worker status
  if (swLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Image
            src="/calaimlogopdf.png"
            alt="Connect CalAIM Logo"
            width={240}
            height={67}
            className="w-48 h-auto object-contain mx-auto mb-4"
            priority
          />
          <h1 className="text-2xl font-bold text-gray-900">Social Worker Portal</h1>
          <p className="text-gray-600 mt-2">Sign in to access your dashboard</p>
        </div>

        {/* Login Form */}
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Sign In
            </CardTitle>
            <CardDescription>
              Enter your credentials to access the Social Worker portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full pr-10"
                    autoComplete="current-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Sign In
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-3">
              <div className="text-center">
                <Link 
                  href="/reset-password" 
                  className="text-sm text-primary hover:underline flex items-center justify-center gap-1"
                >
                  <Lock className="h-4 w-4" />
                  Forgot your password?
                </Link>
              </div>
              <div className="text-center text-sm text-gray-600">
                <p>Need help accessing your account?</p>
                <p className="mt-1">Contact your administrator for assistance.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>© 2026 Connect CalAIM. All rights reserved.</p>
          <p className="mt-1">Social Worker Portal - Secure Access</p>
        </div>
      </div>
    </div>
  );
}