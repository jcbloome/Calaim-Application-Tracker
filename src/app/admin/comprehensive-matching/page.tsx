'use client';

import { useAdmin } from '@/hooks/use-admin';
import LegacyMemberSearch from '@/components/LegacyMemberSearch';

export default function LegacyMemberSearchPage() {
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
        <h1 className="text-3xl font-bold">Legacy CalAIM Member Search</h1>
        <p className="text-muted-foreground">
          Search and browse legacy CalAIM members stored in Google Drive folders. This system preserves the existing folder structure and provides comprehensive search capabilities for historical member records.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-amber-800 mb-2">📋 Legacy System Overview</h3>
        <div className="text-sm text-amber-700 space-y-1">
          <p>• <strong>Import All Records:</strong> Imports all CalAIM member folders from Google Drive without modification</p>
          <p>• <strong>Preserve Structure:</strong> Maintains existing folder organization and file structure</p>
          <p>• <strong>Comprehensive Search:</strong> Search by first name, last name, or Client ID across all legacy records</p>
          <p>• <strong>Plan Folder Detection:</strong> Automatically identifies Kaiser and Health Net subfolders</p>
          <p>• <strong>Direct Access:</strong> Provides direct links to Google Drive folders for document access</p>
          <p>• <strong>Separate from New System:</strong> Independent from the new CalAIM application tracker system</p>
        </div>
      </div>

      <LegacyMemberSearch />
    </div>
  );
}