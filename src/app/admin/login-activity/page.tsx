'use client';

import { useAdmin } from '@/hooks/use-admin';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import LoginActivityTracker from '@/components/LoginActivityTracker';

export default function LoginActivityPage() {
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const router = useRouter();

  if (isAdminLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          Only Super Admins can access the login activity tracker.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Login Activity Tracker</h1>
          <p className="text-muted-foreground">
            Monitor staff login/logout activity and manage active sessions
          </p>
        </div>
      </div>

      <LoginActivityTracker />
    </div>
  );
}