'use client';

import { useAdmin } from '@/hooks/use-admin';
import { DailyNotificationDashboard } from '@/components/DailyNotificationDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Calendar, Bell } from 'lucide-react';

export default function DashboardPage() {
  const { isAdmin, isUserLoading } = useAdmin();

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You need administrator privileges to access the dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor daily activity and manage notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Daily Overview</span>
        </div>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-blue-800">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">Admin Session Active</span>
            <span className="text-xs text-blue-600">• Testing mode - 2FA temporarily disabled</span>
          </div>
        </CardContent>
      </Card>

      {/* Daily Dashboard */}
      <DailyNotificationDashboard />
    </div>
  );
}