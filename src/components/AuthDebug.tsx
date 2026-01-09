'use client';

import { useUser } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';

export function AuthDebug() {
  const user = useUser();
  const auth = useAuth();
  const { isAdmin, isSuperAdmin, isLoading } = useAdmin();

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
      window.location.reload();
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-sm">🔍 Authentication Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            Admin: {isLoading ? '...' : isAdmin ? 'Yes' : 'No'}
          </Badge>
          <Badge variant={isSuperAdmin ? 'default' : 'secondary'}>
            Super Admin: {isLoading ? '...' : isSuperAdmin ? 'Yes' : 'No'}
          </Badge>
        </div>
        <div className="pt-2">
          <Button onClick={handleSignOut} variant="outline" size="sm">
            Sign Out & Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}