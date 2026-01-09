
'use client';

import React from 'react';
import { PrintableDeclarationForm } from '@/components/forms/PrintableDeclarationForm';
import { useSearchParams } from 'next/navigation';

export default function PrintableDeclarationOfEligibilityPage() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <PrintableDeclarationForm
          memberName={memberName}
          memberMrn={memberMrn}
          applicationId={applicationId}
          showPrintButton={true}
        />
      </main>
    </div>
  );
}
