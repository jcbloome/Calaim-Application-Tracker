'use client';

import React, { useState } from 'react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import type { AuthError } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function DebugLoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('jcbloome@gmail.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const addDebugInfo = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleDebugLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);
    setDebugInfo([]);

    addDebugInfo('🔍 Starting debug login process...');
    addDebugInfo(`📧 Email: ${email}`);
    addDebugInfo(`🔐 Password length: ${password.length} characters`);

    if (!auth) {
      addDebugInfo('❌ Firebase Auth not available');
      setError('Firebase Auth not initialized');
      setIsLoading(false);
      return;
    }

    addDebugInfo('✅ Firebase Auth is available');

    try {
      addDebugInfo('🚀 Attempting to sign in with email and password...');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      addDebugInfo('✅ Sign in successful!');
      addDebugInfo(`👤 User UID: ${userCredential.user.uid}`);
      addDebugInfo(`📧 User Email: ${userCredential.user.email}`);
      addDebugInfo(`✉️ Email Verified: ${userCredential.user.emailVerified}`);
      addDebugInfo(`👤 Display Name: ${userCredential.user.displayName || 'Not set'}`);
      addDebugInfo(`📅 Account Created: ${userCredential.user.metadata.creationTime}`);
      addDebugInfo(`🕐 Last Sign In: ${userCredential.user.metadata.lastSignInTime || 'Never'}`);
      
      setSuccess(true);
      
    } catch (err) {
      const authError = err as AuthError;
      addDebugInfo(`❌ Login failed with error code: ${authError.code}`);
      addDebugInfo(`❌ Error message: ${authError.message}`);
      
      let userFriendlyError = '';
      switch (authError.code) {
        case 'auth/user-not-found':
          userFriendlyError = 'No account found with this email address. You may need to sign up first.';
          addDebugInfo('💡 Suggestion: Try going to /signup to create an account');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          userFriendlyError = 'Invalid password. Try using the password reset feature.';
          addDebugInfo('💡 Suggestion: Use the "Forgot Password" feature on the login page');
          break;
        case 'auth/invalid-email':
          userFriendlyError = 'Invalid email format.';
          break;
        case 'auth/too-many-requests':
          userFriendlyError = 'Too many failed login attempts. Please try again later or reset your password.';
          break;
        case 'auth/network-request-failed':
          userFriendlyError = 'Network error. Check your internet connection.';
          break;
        default:
          userFriendlyError = `Unexpected error: ${authError.message}`;
      }
      
      setError(userFriendlyError);
    } finally {
      setIsLoading(false);
    }
  };

  const clearDebugInfo = () => {
    setDebugInfo([]);
    setError(null);
    setSuccess(false);
  };

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4 min-h-screen">
        <Card className="w-full max-w-2xl shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold">Debug Login Tool</CardTitle>
            <p className="text-base text-muted-foreground">
              This tool will help us debug your login issue with detailed information.
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleDebugLogin} className="space-y-4 mb-6">
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
              </div>
              
              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? 'Testing Login...' : 'Test Login'}
                </Button>
                <Button type="button" variant="outline" onClick={clearDebugInfo}>
                  Clear
                </Button>
              </div>
            </form>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Login Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <AlertTitle className="text-green-800">Login Successful!</AlertTitle>
                <AlertDescription className="text-green-700">
                  Your account exists and login works. You can now go to the regular login page.
                </AlertDescription>
              </Alert>
            )}

            {debugInfo.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Debug Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {debugInfo.join('\n')}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">What This Tool Does:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Tests Firebase Auth connection</li>
                <li>• Attempts login with detailed error reporting</li>
                <li>• Shows account information if login succeeds</li>
                <li>• Provides specific suggestions based on error type</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}