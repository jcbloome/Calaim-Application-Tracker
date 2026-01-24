'use client';

import React, { useState } from 'react';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import type { AuthError } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, X, Loader2, AlertTriangle, Mail } from 'lucide-react';

export default function LoginDebuggerPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('jcbloome@gmail.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [loginResult, setLoginResult] = useState<{
    success: boolean;
    user?: any;
    error?: any;
    needsVerification?: boolean;
  } | null>(null);

  const addDebugInfo = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleDetailedLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setDebugInfo([]);
    setLoginResult(null);

    addDebugInfo('🔍 Starting detailed login analysis...');
    addDebugInfo(`📧 Email: ${email}`);
    addDebugInfo(`🔐 Password length: ${password.length} characters`);

    if (!auth) {
      addDebugInfo('❌ Firebase Auth not available');
      setIsLoading(false);
      return;
    }

    addDebugInfo('✅ Firebase Auth is available');

    try {
      // Sign out any existing user first
      if (auth.currentUser) {
        addDebugInfo(`🔄 Signing out current user: ${auth.currentUser.email}`);
        await auth.signOut();
      }

      addDebugInfo('🚀 Attempting sign in...');
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      addDebugInfo('✅ Sign in successful!');
      addDebugInfo(`👤 User UID: ${user.uid}`);
      addDebugInfo(`📧 User Email: ${user.email}`);
      addDebugInfo(`✉️ Email Verified: ${user.emailVerified}`);
      addDebugInfo(`👤 Display Name: ${user.displayName || 'Not set'}`);
      addDebugInfo(`📅 Account Created: ${user.metadata.creationTime}`);
      addDebugInfo(`🕐 Last Sign In: ${user.metadata.lastSignInTime || 'Never'}`);
      addDebugInfo(`🔒 Provider Data: ${JSON.stringify(user.providerData)}`);
      
      // Check if email verification is required
      if (!user.emailVerified) {
        addDebugInfo('⚠️ Email is not verified - this might be blocking login');
        setLoginResult({
          success: true,
          user: user,
          needsVerification: true
        });
      } else {
        addDebugInfo('✅ Email is verified - login should work normally');
        setLoginResult({
          success: true,
          user: user
        });
      }
      
    } catch (err) {
      const authError = err as AuthError;
      addDebugInfo(`❌ Login failed with error code: ${authError.code}`);
      addDebugInfo(`❌ Error message: ${authError.message}`);
      addDebugInfo(`❌ Full error: ${JSON.stringify(authError, null, 2)}`);
      
      // Detailed error analysis
      switch (authError.code) {
        case 'auth/user-not-found':
          addDebugInfo('💡 Analysis: Account does not exist');
          break;
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          addDebugInfo('💡 Analysis: Password is incorrect');
          break;
        case 'auth/user-disabled':
          addDebugInfo('💡 Analysis: Account has been disabled');
          break;
        case 'auth/too-many-requests':
          addDebugInfo('💡 Analysis: Too many failed attempts, account temporarily locked');
          break;
        case 'auth/invalid-email':
          addDebugInfo('💡 Analysis: Email format is invalid');
          break;
        default:
          addDebugInfo(`💡 Analysis: Unexpected error (${authError.code})`);
      }
      
      setLoginResult({
        success: false,
        error: authError
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendVerification = async () => {
    if (loginResult?.user && !loginResult.user.emailVerified) {
      try {
        addDebugInfo('📧 Sending email verification...');
        await sendEmailVerification(loginResult.user);
        addDebugInfo('✅ Verification email sent successfully');
      } catch (error: any) {
        addDebugInfo(`❌ Failed to send verification email: ${error.message}`);
      }
    }
  };

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4 min-h-screen">
        <Card className="w-full max-w-4xl shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold">Comprehensive Login Debugger</CardTitle>
            <p className="text-base text-muted-foreground">
              Let's figure out exactly what's preventing your login
            </p>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Login Form */}
              <div>
                <form onSubmit={handleDetailedLogin} className="space-y-4">
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
                    <Label htmlFor="password">Password (use your new reset password)</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter the password you just reset"
                    />
                  </div>
                  
                  <Button type="submit" disabled={isLoading} className="w-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing Login...
                      </>
                    ) : (
                      'Debug Login Attempt'
                    )}
                  </Button>
                </form>

                {/* Results */}
                {loginResult && (
                  <div className="mt-4">
                    {loginResult.success ? (
                      <Alert className="border-green-200 bg-green-50">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertTitle className="text-green-800">Login Successful!</AlertTitle>
                        <AlertDescription className="text-green-700">
                          {loginResult.needsVerification ? (
                            <>
                              Your account exists and password is correct, but your email needs verification.
                              <Button 
                                onClick={handleSendVerification}
                                variant="outline" 
                                size="sm" 
                                className="mt-2 ml-2"
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                Send Verification Email
                              </Button>
                            </>
                          ) : (
                            'Your login is working perfectly! The issue might be elsewhere in the app.'
                          )}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <X className="h-4 w-4" />
                        <AlertTitle>Login Failed</AlertTitle>
                        <AlertDescription>
                          Error: {loginResult.error?.code} - {loginResult.error?.message}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>

              {/* Debug Info */}
              <div>
                {debugInfo.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Debug Information</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {debugInfo.join('\n')}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-2">Before Deleting Your Account:</h3>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    <li>• This will show us exactly what's wrong</li>
                    <li>• If it's just email verification, we can fix that easily</li>
                    <li>• Your existing applications and data will be preserved</li>
                    <li>• Deleting the account will lose all your mock application data</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}