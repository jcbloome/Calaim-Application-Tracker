'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Trash2, UserPlus, RotateCcw, AlertTriangle } from 'lucide-react';

export default function AccountManagerPage() {
  const [email, setEmail] = useState('jcbloome@gmail.com');
  const [newPassword, setNewPassword] = useState('newpassword123');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete jcbloome@gmail.com? This will remove all your mock application data permanently!')) {
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ type: 'success', message: 'Account deleted successfully! You can now create a new one.' });
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to delete account' });
      }
    } catch (error: any) {
      setResult({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForcePasswordReset = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/auth/force-password-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ type: 'success', message: `Password updated successfully! You can now login with password: ${newPassword}` });
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to update password' });
      }
    } catch (error: any) {
      setResult({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4 min-h-screen">
        <Card className="w-full max-w-2xl shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold">Account Manager</CardTitle>
            <p className="text-base text-muted-foreground">
              Manage your jcbloome@gmail.com account
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {result && (
              <Alert className={`mb-4 ${result.type === 'success' ? 'border-green-200 bg-green-50' : ''}`} 
                     variant={result.type === 'error' ? 'destructive' : undefined}>
                <AlertTitle>{result.type === 'success' ? 'Success!' : 'Error'}</AlertTitle>
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              {/* Force Password Reset */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" />
                    Force Password Reset (Recommended)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter a simple password"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use something simple like "newpassword123" for testing
                      </p>
                    </div>
                    <Button 
                      onClick={handleForcePasswordReset}
                      disabled={isLoading}
                      className="w-full"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Force Update Password
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      This will directly update your password in Firebase, bypassing the email reset process.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Delete Account */}
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                    <Trash2 className="h-5 w-5" />
                    Delete Account (Last Resort)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-red-900">Warning: This will permanently delete:</h4>
                          <ul className="text-sm text-red-800 mt-1 space-y-1">
                            <li>• Your user account and profile</li>
                            <li>• All mock application data</li>
                            <li>• Any saved progress or settings</li>
                            <li>• This action cannot be undone!</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={handleDeleteAccount}
                      disabled={isLoading}
                      variant="destructive"
                      className="w-full"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account Permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Next Steps */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Recommended Approach:</h3>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. <strong>Try Force Password Reset first</strong> - this preserves your data</li>
                  <li>2. Use the new password to log in at <code>/login</code></li>
                  <li>3. Only delete the account if password reset fails</li>
                  <li>4. After deletion, create a new account at <code>/signup</code></li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}