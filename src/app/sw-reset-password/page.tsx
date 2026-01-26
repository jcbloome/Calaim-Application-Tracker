'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { confirmPasswordReset, sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, CheckCircle, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

function SWResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [resetValid, setResetValid] = useState(false);
  const [error, setError] = useState('');

  const token = searchParams.get('token');
  const oobCode = searchParams.get('oobCode');
  const isResetFlow = Boolean(token || oobCode);

  useEffect(() => {
    if (!isResetFlow) return;

    const validateToken = async () => {
      setIsValidating(true);
      setError('');

      if (oobCode) {
        setResetValid(true);
        setIsValidating(false);
        return;
      }

      if (token) {
        try {
          const response = await fetch(`/api/auth/password-reset?token=${token}`);
          const data = await response.json();
          if (response.ok && data.valid) {
            setEmail(data.email || '');
            setResetValid(true);
          } else {
            setError(data.error || 'Invalid or expired reset token');
          }
        } catch (err: any) {
          setError('Failed to validate reset link. Please try again.');
        } finally {
          setIsValidating(false);
        }
      } else {
        setError('Invalid or missing reset parameters');
        setIsValidating(false);
      }
    };

    validateToken();
  }, [isResetFlow, token, oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (!auth) {
        setError('Authentication service not available');
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const actionCodeSettings = {
        url: `${origin}/sw-reset-password`,
        handleCodeInApp: true
      };

      await sendPasswordResetEmail(auth, normalizedEmail, actionCodeSettings);
      setIsSuccess(true);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your email for Social Worker reset instructions.'
      });
    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error?.message || 'Failed to send password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isResetFlow && isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <p>Validating reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isResetFlow && !resetValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
            <CardDescription>This password reset link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              {error || 'The reset link may have expired or already been used.'}
            </p>
            <Button asChild className="w-full">
              <a href="/sw-login">Return to Social Worker Login</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isResetFlow && isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-2xl text-green-600">Password Reset Successful!</CardTitle>
            <CardDescription>Your password has been updated successfully.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              You will be redirected to the Social Worker login in a few seconds...
            </p>
            <Button asChild className="w-full">
              <a href="/sw-login">Sign In Now</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isResetFlow && isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <Image
              src="/calaimlogopdf.png"
              alt="Connect CalAIM Logo"
              width={240}
              height={67}
              className="w-48 h-auto object-contain mx-auto mb-4"
              priority
            />
          </div>

          <Card className="shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2 justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Email Sent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  We've sent a password reset link to <strong>{email}</strong>. 
                  Please check your email and follow the instructions to reset your password.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setIsSuccess(false);
                      setEmail('');
                    }}
                  >
                    Try Again
                  </Button>
                  <Link href="/sw-login" className="w-full">
                    <Button variant="outline" className="w-full">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isResetFlow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome Social Worker!</CardTitle>
          <CardDescription>Set your new password below</CardDescription>
        </CardHeader>
          <CardContent>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError('');

              if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
              }
              if (password.length < 6) {
                setError('Password must be at least 6 characters long');
                return;
              }

              setIsLoading(true);
              try {
                if (oobCode) {
                  if (!auth) {
                    setError('Authentication service not available');
                    return;
                  }
                  await confirmPasswordReset(auth, oobCode, password);
                } else if (token) {
                  const response = await fetch('/api/auth/reset-password-confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword: password })
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    throw new Error(data.error || 'Failed to reset password');
                  }
                } else {
                  setError('Invalid reset method');
                  return;
                }

                setIsSuccess(true);
                toast({
                  title: 'Password Reset Successful',
                  description: 'Your password has been updated. You can now sign in.',
                });
                setTimeout(() => router.push('/sw-login'), 3000);
              } catch (err: any) {
                setError(err.message || 'Failed to reset password');
              } finally {
                setIsLoading(false);
              }
            }} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-8 w-8"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
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
          <h1 className="text-2xl font-bold text-gray-900">Social Worker Reset Password</h1>
          <p className="text-gray-600 mt-2">Enter your email to receive a Social Worker reset link</p>
        </div>

        {/* Reset Form */}
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Social Worker Forgot Password
            </CardTitle>
            <CardDescription>
              We'll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
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

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Send Reset Link
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link 
                href="/sw-login" 
                className="text-sm text-primary hover:underline flex items-center justify-center gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          <p>© 2026 Connect CalAIM. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default function SWResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin mr-3" />
            <p>Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <SWResetPasswordContent />
    </Suspense>
  );
}
