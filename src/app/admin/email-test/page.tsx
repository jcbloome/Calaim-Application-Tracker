'use client';

import { useAdmin } from '@/hooks/use-admin';
import EmailTestPanel from '@/components/EmailTestPanel';

export default function EmailTestPage() {
  const { isLoading, isSuperAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need Super Admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Email Test Panel</h1>
        <p className="text-muted-foreground">
          Test and verify your Resend email integration for CalAIM notifications
        </p>
      </div>

      <EmailTestPanel />
    </div>
  );
}