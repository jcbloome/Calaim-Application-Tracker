'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/firebase';
import { confirmPasswordReset, sendPasswordResetEmail as sendFirebasePasswordResetEmail } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Header } from '@/components/Header';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LoginSupportContact } from '@/components/LoginSupportContact';

function ResetPasswordContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const auth = useAuth();
  const { toast } = useToast();
  
  const token = searchParams.get('token');
  const oobCode = searchParams.get('oobCode'); // Keep for backward compatibility
  const roleParam = searchParams.get('role');
  const emailParam = searchParams.get('email');
  const hasResetParams = Boolean(token || oobCode);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'sw' | 'user' | 'admin'>(
    roleParam === 'sw' ? 'sw' : roleParam === 'admin' ? 'admin' : 'user'
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const isAdminReset = role === 'admin';
  const loginPathForRole = role === 'sw' ? '/sw-login' : role === 'admin' ? '/admin/login' : '/login';

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

  // Send staff to Admin login after reset (default role=user used to dump them on member /login).
  useEffect(() => {
    if (!hasResetParams && emailParam && !email) {
      setEmail(emailParam);
    }
  }, [hasResetParams, emailParam, email]);

  useEffect(() => {
    setRole(roleParam === 'sw' ? 'sw' : roleParam === 'admin' ? 'admin' : 'user');
  }, [roleParam]);

  useEffect(() => {
    if (roleParam === 'sw' || roleParam === 'admin' || roleParam === 'user') return;
    const normalized = String(emailParam || email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/auth/email-lane', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalized }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled || !data?.success) return;
        if (data.reservedLane === 'admin' || data.isAdminLaneAccount) {
          setRole('admin');
        } else if (data.reservedLane === 'sw' || data.isSwLaneAccount) {
          setRole('sw');
        }
      } catch {
        // keep default role
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleParam, emailParam, email]);
  // No pre-validation: render the reset form immediately when `oobCode` or `token` is present.
  // The submit actions (`confirmPasswordReset` or token-confirm API) are the authoritative validators.

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
      // Prefer branded Resend email. Fall back to Firebase Auth email if Resend fails.
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, role }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const allowFirebaseFallback = Boolean(data?.allowFirebaseFallback) && Boolean(auth);
        if (allowFirebaseFallback) {
          try {
            const continueUrl =
              typeof window !== 'undefined'
                ? `${window.location.origin}${role === 'sw' ? '/sw-login' : role === 'admin' ? '/admin/login' : '/login'}`
                : undefined;
            await sendFirebasePasswordResetEmail(
              auth!,
              normalizedEmail,
              continueUrl
                ? {
                    url: continueUrl,
                    handleCodeInApp: false,
                  }
                : undefined
            );
            setRequestSuccess(true);
            toast({
              title: 'Password Reset Email Sent',
              description: 'Check your inbox and spam folder for the reset link.',
            });
            return;
          } catch (firebaseError: any) {
            const firebaseMessage = String(firebaseError?.message || '').trim();
            setDebugInfo(
              `Status ${response.status}: ${String(data?.error || '').trim() || 'Resend failed'}; Firebase fallback: ${firebaseMessage || 'failed'}`
            );
            throw new Error(
              String(data?.error || firebaseMessage || 'Failed to send password reset email')
            );
          }
        }
        const details = String(data?.error || data?.details || '').trim() || JSON.stringify(data);
        setDebugInfo(`Status ${response.status}: ${details}`);
        throw new Error(String(data?.error || 'Failed to send password reset email'));
      }

      setRequestSuccess(true);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your inbox and spam folder for the reset link.',
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
        window.location.href = loginPathForRole;
      }, 1500);

    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasResetParams) {
    return (
      <>
        {!isAdminReset ? <Header /> : null}
        <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">
                {isAdminReset ? 'Admin Forgot Password' : role === 'sw' ? 'Social Worker Forgot Password' : 'Forgot Password'}
              </CardTitle>
              <CardDescription>
                {isAdminReset
                  ? 'Enter your admin staff email and we will send a reset link.'
                  : role === 'sw'
                    ? 'Enter the email used for the Social Worker portal and we will send a reset link.'
                    : 'Enter your email and we will send you a reset link.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isAdminReset ? (
                <Alert className="mb-4 border-blue-200 bg-blue-50">
                  <AlertTitle className="text-blue-900">
                    {role === 'sw' ? 'Social Worker portal' : 'Invited users'}
                  </AlertTitle>
                  <AlertDescription className="text-blue-800">
                    {role === 'sw'
                      ? 'Use the same email your admin turned on for Portal access. First-time users can set a password here too.'
                      : 'If you were invited and do not have a password yet, use this screen to set one quickly.'}
                  </AlertDescription>
                </Alert>
              ) : null}
              {requestSuccess ? (
                <div className="text-center space-y-3">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Reset email sent to <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>.
                  </p>
                  <Alert className="text-left border-amber-200 bg-amber-50">
                    <AlertTitle className="text-amber-950">Not in your inbox?</AlertTitle>
                    <AlertDescription className="text-amber-900 space-y-1">
                      <p>Check Spam / Junk for mail from <strong>noreply@carehomefinders.com</strong>.</p>
                      <p>Wait a few minutes, then try again. If it still does not arrive, contact Connections so an admin can resend from SW User Management.</p>
                    </AlertDescription>
                  </Alert>
              <Button asChild className="w-full">
                <a href={loginPathForRole}>Return to Login</a>
              </Button>
              <div className="mt-4">
                <LoginSupportContact />
              </div>
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
              <div className="mt-4">
                <LoginSupportContact />
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  if (success) {
    return (
      <>
        {!isAdminReset ? <Header /> : null}
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
                <a href={loginPathForRole}>Return to Login</a>
              </Button>
              <div className="mt-4">
                <LoginSupportContact />
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      {!isAdminReset ? <Header /> : null}
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{isAdminReset ? 'Set New Admin Password' : 'Set New Password'}</CardTitle>
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
            <div className="mt-4">
              <LoginSupportContact />
            </div>
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