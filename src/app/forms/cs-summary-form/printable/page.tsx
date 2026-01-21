
'use client';

import React, { Suspense } from 'react';
import { PrintableCsSummaryForm } from '@/components/forms/PrintableCsSummaryForm';
import { useSearchParams } from 'next/navigation';

function PrintableCsSummaryContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <PrintableCsSummaryForm
      memberName={memberName}
      memberMrn={memberMrn}
      applicationId={applicationId}
      showPrintButton={true}
    />
  );
}

export default function PrintableCsSummaryFormPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <PrintableCsSummaryContent />
        </Suspense>
      </main>
    </div>
  );
}
