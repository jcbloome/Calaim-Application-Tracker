
'use client';

import React, { Suspense } from 'react';
import { PrintableGlossaryForm } from '@/components/forms/PrintableGlossaryForm';
import { useSearchParams } from 'next/navigation';

function PrintableGlossaryContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <PrintableGlossaryForm
      memberName={memberName}
      memberMrn={memberMrn}
      applicationId={applicationId}
      showPrintButton={true}
    />
  );
}

export default function PrintableGlossaryPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <PrintableGlossaryContent />
        </Suspense>
      </main>
    </div>
  );
}
