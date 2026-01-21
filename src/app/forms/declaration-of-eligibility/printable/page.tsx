
'use client';

import React, { Suspense } from 'react';
import { PrintableDeclarationForm } from '@/components/forms/PrintableDeclarationForm';
import { useSearchParams } from 'next/navigation';

function PrintableDeclarationContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <PrintableDeclarationForm
      memberName={memberName}
      memberMrn={memberMrn}
      applicationId={applicationId}
      showPrintButton={true}
    />
  );
}

export default function PrintableDeclarationOfEligibilityPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <PrintableDeclarationContent />
        </Suspense>
      </main>
    </div>
  );
}
