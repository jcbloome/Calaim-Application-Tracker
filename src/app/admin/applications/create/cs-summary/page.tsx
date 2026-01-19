'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import CsSummaryFormCorePage from '@/app/forms/cs-summary-form/components/CsSummaryFormCore';

function AdminCsSummaryFormContent() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId');

  if (!applicationId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Missing Application ID</h1>
          <p className="text-gray-600 mb-6">No application ID provided for form completion.</p>
          <Button asChild>
            <Link href="/admin/applications/create">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Create Application
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <CsSummaryFormCorePage />
    </div>
  );
}

export default function AdminCsSummaryFormPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600">Loading CS Summary Form...</p>
        </div>
      </div>
    }>
      <AdminCsSummaryFormContent />
    </Suspense>
  );
}