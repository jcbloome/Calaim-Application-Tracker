'use client';

import { useAdmin } from '@/hooks/use-admin';
import SuperAdminNoteLog from '@/components/SuperAdminNoteLog';
import { Loader2 } from 'lucide-react';

export default function SuperAdminNotesPage() {
  const { isLoading, isSuperAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
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
        <h1 className="text-3xl font-bold">Complete Note Log</h1>
        <p className="text-muted-foreground">
          Comprehensive view of all notes, notifications, and communications across the system.
        </p>
      </div>
      
      <SuperAdminNoteLog />
    </div>
  );
}