'use client';

import { useAdmin } from '@/hooks/use-admin';
import { 
  Activity,
  AlertTriangle,
} from 'lucide-react';

export default function LoginActivityTracker() {
  // Temporary simplified version to avoid React errors
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  
  if (isAdminLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin permissions...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold text-red-600 mb-2">Access Denied</h3>
        <p className="text-muted-foreground">Only Super Admins can view login logs</p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <Activity className="h-12 w-12 mx-auto mb-4 text-blue-500" />
      <h3 className="text-lg font-semibold mb-2">Login Activity Tracker</h3>
      <p className="text-muted-foreground">Temporarily simplified - under maintenance</p>
    </div>
  );
}