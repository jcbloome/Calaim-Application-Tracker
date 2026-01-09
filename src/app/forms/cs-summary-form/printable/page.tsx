
'use client';

import React from 'react';
import { PrintableCsSummaryForm } from '@/components/forms/PrintableCsSummaryForm';
import { useSearchParams } from 'next/navigation';

export default function PrintableCsSummaryFormPage() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <PrintableCsSummaryForm
          memberName={memberName}
          memberMrn={memberMrn}
          applicationId={applicationId}
          showPrintButton={true}
        />
      </main>
    </div>
  );
}
