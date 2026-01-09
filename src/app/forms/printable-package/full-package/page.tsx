
'use client';

import React from 'react';
import { PrintableFullPackage } from '@/components/forms/PrintableFullPackage';
import { useSearchParams } from 'next/navigation';

export default function FullPackagePrintPage() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <PrintableFullPackage
          memberName={memberName}
          memberMrn={memberMrn}
          applicationId={applicationId}
          showPrintButton={true}
          autoTriggerPrint={true}
        />
      </main>
    </div>
  );
}
