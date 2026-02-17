'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/Header';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const auth = useAuth();
  const { toast } = useToast();
  
  const token = searchParams.get('token');
  const oobCode = searchParams.get('oobCode'); // Keep for backward compatibility
  const roleParam = searchParams.get('role');
  const emailParam = searchParams.get('email');
  const hasResetParams = Boolean(token || oobCode);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'sw' | 'user'>(roleParam === 'sw' ? 'sw' : 'user');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [resetValid, setResetValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let t: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          t = setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    } finally {
      if (t) clearTimeout(t);
    }
  };

  useEffect(() => {
    if (!hasResetParams && emailParam && !email) {
      setEmail(emailParam);
    }
  }, [hasResetParams, emailParam, email]);

  useEffect(() => {
    setRole(roleParam === 'sw' ? 'sw' : 'user');
  }, [roleParam]);

  useEffect(() => {
    const validateToken = async () => {
      if (!hasResetParams) {
        setIsValidating(false);
        setResetValid(false);
        setError(null);
        return;
      }

      if (oobCode) {
        if (!auth) {
          setError('Authentication service not available');
          setIsValidating(false);
          return;
        }
        try {
          const resetEmail = await withTimeout(
            verifyPasswordResetCode(auth, oobCode),
            12000,
            'Reset link validation timed out. Please refresh and try again, or request a new reset email.'
          );
          setEmail(resetEmail || '');
          setResetValid(true);
        } catch (verifyError: any) {
          const message = String(verifyError?.message || '');
          const isTimeout = message.toLowerCase().includes('timed out');
          const isNetwork = message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch');

          // If validation fails due to timeout/network, don't trap the user in an "invalid link" state.
          // Let them proceed to set a new password; the final `confirmPasswordReset` call will still validate the code.
          if (isTimeout || isNetwork) {
            setDebugInfo(message || 'Reset link validation failed due to network issues. You can still try setting a new password.');
            setResetValid(true);
            // Try to keep any email hint if present in query params.
            if (emailParam && !email) setEmail(emailParam);
          } else {
            setError(message || 'Invalid or expired reset link');
          }
        } finally {
          setIsValidating(false);
        }
        return;
      }
      
      if (token) {
        // Custom token - validate it
        try {
          console.log('🔍 Validating token:', token.substring(0, 8) + '...');
          console.log('🔍 Full token:', token);
          console.log('🔍 Token length:', token.length);
          
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(`/api/auth/password-reset?token=${token}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          console.log('📡 API Response status:', response.status);
          
          const data = await response.json();
          console.log('📄 API Response data:', data);
          
          if (response.ok && data.valid) {
            setEmail(data.email);
            if (data.role === 'sw') {
              setRole('sw');
            }
            setResetValid(true);
            console.log('✅ Token validation successful');
          } else {
            console.log('❌ Token validation failed:', data.error);
            setError(data.error || 'Invalid or expired reset token');
          }
        } catch (error: any) {
          console.error('❌ Token validation error:', error);
          if (error.name === 'AbortError') {
            setError('Request timed out. Please try again or request a new reset link.');
          } else {
            setError('Failed to validate reset token. Please try again.');
          }
        }
      }
      
      setIsValidating(false);
    };

    validateToken();
  }, [token, oobCode, auth, hasResetParams]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebugInfo(null);
    setRequestSuccess(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Please enter your email address');
      return;
    }

    setIsRequesting(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = data?.error || data?.details || JSON.stringify(data);
        setDebugInfo(`Status ${response.status}: ${details}`);
        throw new Error(data?.error || 'Failed to send password reset email');
      }
      setRequestSuccess(true);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your email for a reset link to continue.',
      });
    } catch (requestError: any) {
      console.error('Password reset request error:', requestError);
      setError(requestError?.message || 'Failed to send password reset email');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

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
        // Firebase reset flow (backward compatibility)
        if (!auth) {
          setError('Authentication service not available');
          return;
        }

        await withTimeout(
          confirmPasswordReset(auth, oobCode, password),
          12000,
          'Password reset timed out. Please refresh and try again.'
        );
      } else if (token) {
        // Custom token reset flow
        const response = await fetch('/api/auth/reset-password-confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            newPassword: password,
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to reset password');
        }
      } else {
        setError('Invalid reset method');
        return;
      }

      setSuccess(true);
      toast({
        title: 'Password Reset Successful',
        description: 'Your password has been updated. You can now sign in with your new password.',
      });

      // Send user to login after reset
      setTimeout(() => {
        window.location.href = role === 'sw' ? '/sw-login' : '/login';
      }, 1500);

    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <>
        <Header />
        <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardContent className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin mr-3" />
              <p>Validating reset link...</p>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (hasResetParams && (!resetValid || error)) {
    return (
      <>
        <Header />
        <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {error || 'The reset link may have expired or already been used.'}
              </p>
              <Button asChild className="w-full">
                <a href={role === 'sw' ? '/sw-login' : '/login'}>Return to Login</a>
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (!hasResetParams) {
    return (
      <>
        <Header />
        <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Forgot Password</CardTitle>
              <CardDescription>
                Enter your email and we will send you a reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requestSuccess ? (
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Reset email sent. Please check your inbox.
                  </p>
                  <Button asChild className="w-full">
                    <a href={role === 'sw' ? '/sw-login' : '/login'}>Return to Login</a>
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  {debugInfo && (
                    <Alert>
                      <AlertTitle>Debug</AlertTitle>
                      <AlertDescription>
                        <span className="block break-words text-xs text-muted-foreground">{debugInfo}</span>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={isRequesting}>
                    {isRequesting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Reset Email...
                      </>
                    ) : (
                      'Send Reset Email'
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (success) {
    return (
      <>
        <Header />
        <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <CardTitle className="text-2xl text-green-600">Password Reset Successful!</CardTitle>
              <CardDescription>
                Your password has been updated successfully.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Redirecting to the login page...
              </p>
              <Button asChild className="w-full">
                <a href={role === 'sw' ? '/sw-login' : '/login'}>Return to Login</a>
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Set New Password</CardTitle>
            <CardDescription>
              Enter your new password below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
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
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
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

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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
      </main>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading...</p>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}