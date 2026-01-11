'use client';

import { useAdmin } from '@/hooks/use-admin';
import { StaffNotificationSettings } from '@/components/StaffNotificationSettings';

export default function NotificationSettingsPage() {
  const { isLoading, isAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin access to configure notification settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold">Notification Settings</h1>
        <p className="text-muted-foreground">
          Configure how you receive notifications when other staff members send you notes or assign tasks.
        </p>
      </div>

      <StaffNotificationSettings />
    </div>
  );
}