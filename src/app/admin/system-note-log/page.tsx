'use client';

import { useAdmin } from '@/hooks/use-admin';
import { SystemNoteLog } from '@/components/SystemNoteLog';

export default function SystemNoteLogPage() {
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
          <p className="text-gray-600">You need Super Admin privileges to access the system note log.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <SystemNoteLog />
    </div>
  );
}