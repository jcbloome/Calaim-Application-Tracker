'use client';

import { useAdmin } from '@/hooks/use-admin';
import ComprehensiveDriveMatching from '@/components/ComprehensiveDriveMatching';

export default function ComprehensiveMatchingPage() {
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
        <h1 className="text-3xl font-bold">Comprehensive Drive-Caspio Matching</h1>
        <p className="text-muted-foreground">
          Advanced system to match 800+ Google Drive folders with 1000+ Caspio member records using intelligent algorithms
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-2">🎯 System Overview</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• <strong>Comprehensive Scanning:</strong> Analyzes all CalAIM Members folders and extracts member names</p>
          <p>• <strong>Intelligent Matching:</strong> Uses advanced algorithms to match Drive folders with Caspio records</p>
          <p>• <strong>Manual Review:</strong> Allows confirmation of uncertain matches before applying</p>
          <p>• <strong>Automated Updates:</strong> Updates Caspio with Drive folder IDs for seamless integration</p>
          <p>• <strong>Time Savings:</strong> Eliminates need to manually add Client_ID2 to each folder name</p>
        </div>
      </div>

      <ComprehensiveDriveMatching />
    </div>
  );
}