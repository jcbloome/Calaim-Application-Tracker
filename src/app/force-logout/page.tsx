'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LogOut, CheckCircle } from 'lucide-react';

export default function ForceLogoutPage() {
  const auth = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleForceLogout = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (auth) {
        await signOut(auth);
      }
      
      // Clear all storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear any cookies (if any)
      document.cookie.split(";").forEach(function(c) { 
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
      });
      
      setIsLoggedOut(true);
      
      // Redirect to home after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
      
    } catch (err: any) {
      setError(`Failed to logout: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-logout on page load
  useEffect(() => {
    handleForceLogout();
  }, []);

  return (
    <>
      <Header />
      <main className="flex-grow flex items-center justify-center bg-slate-50 p-4 min-h-screen">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader className="items-center text-center p-6">
            <CardTitle className="text-3xl font-bold flex items-center gap-2">
              <LogOut className="h-8 w-8" />
              Force Logout
            </CardTitle>
            <p className="text-base text-muted-foreground">
              Clearing all sessions and authentication data
            </p>
          </CardHeader>
          <CardContent className="p-6">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Logout Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoggedOut && (
              <Alert className="mb-4 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Successfully Logged Out!</AlertTitle>
                <AlertDescription className="text-green-700">
                  All sessions have been cleared. Redirecting to home page...
                </AlertDescription>
              </Alert>
            )}

            {!isLoggedOut && (
              <div className="text-center">
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span>Logging out...</span>
                  </div>
                ) : (
                  <Button onClick={handleForceLogout} className="w-full">
                    <LogOut className="mr-2 h-4 w-4" />
                    Force Logout Now
                  </Button>
                )}
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">What This Does:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Signs out from Firebase Authentication</li>
                <li>• Clears all localStorage data</li>
                <li>• Clears all sessionStorage data</li>
                <li>• Removes any authentication cookies</li>
                <li>• Forces a fresh login on next visit</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}