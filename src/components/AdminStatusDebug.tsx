'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/hooks/use-admin';
import { Shield, User, AlertCircle, CheckCircle } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export function AdminStatusDebug() {
  const { user, isAdmin, isSuperAdmin, isLoading } = useAdmin();
  const firestore = useFirestore();
  const { toast } = useToast();

  const grantSuperAdminAccess = async () => {
    if (!user || !firestore) {
      toast({
        title: "Error",
        description: "User not authenticated or Firestore not available",
        variant: "destructive"
      });
      return;
    }

    try {
      // Add user to both admin and super admin roles
      const adminRoleRef = doc(firestore, 'roles_admin', user.uid);
      const superAdminRoleRef = doc(firestore, 'roles_super_admin', user.uid);

      await Promise.all([
        setDoc(adminRoleRef, {
          email: user.email,
          displayName: user.displayName || user.email,
          grantedAt: new Date().toISOString(),
          grantedBy: 'self-service'
        }),
        setDoc(superAdminRoleRef, {
          email: user.email,
          displayName: user.displayName || user.email,
          grantedAt: new Date().toISOString(),
          grantedBy: 'self-service'
        })
      ]);

      toast({
        title: "Success",
        description: "Super admin access granted! Please refresh the page.",
      });

      // Refresh the page to reload admin status
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('Error granting super admin access:', error);
      toast({
        title: "Error",
        description: "Failed to grant super admin access",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">Checking admin status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Status Debug
        </CardTitle>
        <CardDescription>
          Current user's admin privileges and navigation access
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">User Email:</span>
            <span className="text-sm text-muted-foreground">{user?.email || 'Not logged in'}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">User ID:</span>
            <span className="text-sm text-muted-foreground font-mono text-xs">
              {user?.uid ? `${user.uid.substring(0, 8)}...` : 'N/A'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Admin Access:</span>
            <Badge variant={isAdmin ? "default" : "secondary"} className="flex items-center gap-1">
              {isAdmin ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {isAdmin ? 'Yes' : 'No'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Super Admin Access:</span>
            <Badge variant={isSuperAdmin ? "default" : "secondary"} className="flex items-center gap-1">
              {isSuperAdmin ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {isSuperAdmin ? 'Yes' : 'No'}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Super Admin Menu:</span>
            <Badge variant={isSuperAdmin ? "default" : "destructive"}>
              {isSuperAdmin ? 'Visible' : 'Hidden'}
            </Badge>
          </div>
        </div>

        {!isSuperAdmin && user && (
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground mb-3">
              Super Admin navigation is hidden because you don't have super admin privileges.
            </p>
            <Button 
              onClick={grantSuperAdminAccess}
              size="sm" 
              className="w-full"
              variant="outline"
            >
              <Shield className="mr-2 h-4 w-4" />
              Grant Super Admin Access
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This will add your user to the super admin role in Firestore.
            </p>
          </div>
        )}

        {isSuperAdmin && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Super Admin menu should be visible!</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Look for "Super Admin" in the navigation menu.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}