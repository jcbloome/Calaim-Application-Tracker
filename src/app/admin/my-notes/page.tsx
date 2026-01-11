'use client';

import { useAdmin } from '@/hooks/use-admin';
import StaffNotesManager from '@/components/StaffNotesManager';
import { Loader2 } from 'lucide-react';

export default function MyNotesPage() {
  const { isLoading, isAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">My Notes</h1>
        <p className="text-muted-foreground">
          View and manage your personal notes and notifications from Caspio.
        </p>
      </div>
      
      <StaffNotesManager viewMode="personal" />
    </div>
  );
}