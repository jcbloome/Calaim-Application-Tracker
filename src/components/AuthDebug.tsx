'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '@/firebase';

export function AuthDebug() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const [authState, setAuthState] = useState<string>('Checking...');

  useEffect(() => {
    if (!auth) {
      setAuthState('No Auth Instance');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthState(`Logged in as: ${user.email}`);
      } else {
        setAuthState('Not logged in');
      }
    });

    return unsubscribe;
  }, [auth]);

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const handleForceLogin = () => {
    window.location.href = '/';
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-sm">🔍 Authentication Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <strong>Auth State:</strong> {authState}
        </div>
        <div>
          <strong>User Loading:</strong> {isUserLoading ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Admin Loading:</strong> {isAdminLoading ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Email:</strong> {user?.email || 'Not logged in'}
        </div>
        <div>
          <strong>UID:</strong> {user?.uid || 'N/A'}
        </div>
        <div>
          <strong>Display Name:</strong> {user?.displayName || 'N/A'}
        </div>
        <div className="flex gap-2">
          <Badge variant={isAdmin ? 'default' : 'secondary'}>
            Admin: {isAdminLoading ? '...' : isAdmin ? 'Yes' : 'No'}
          </Badge>
          <Badge variant={isSuperAdmin ? 'default' : 'secondary'}>
            Super Admin: {isAdminLoading ? '...' : isSuperAdmin ? 'Yes' : 'No'}
          </Badge>
        </div>
        <div className="pt-2 space-y-2">
          <Button onClick={handleSignOut} variant="outline" size="sm" className="w-full">
            Sign Out & Refresh
          </Button>
          <Button onClick={handleForceLogin} variant="default" size="sm" className="w-full">
            Go to Login Page
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}