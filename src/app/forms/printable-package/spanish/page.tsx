'use client';

import React from 'react';
import { PrintableFullPackageSpanish } from '@/components/forms/PrintableFullPackageSpanish';
import { useSearchParams } from 'next/navigation';

export default function SpanishFullPackagePrintPage() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';
  const pathway = searchParams.get('pathway') as 'SNF Transition' | 'SNF Diversion' || 'SNF Transition';

  // Create application data from URL params
  const applicationData = {
    memberFirstName: memberName.split(' ')[0] || '',
    memberLastName: memberName.split(' ').slice(1).join(' ') || '',
    memberMrn: memberMrn
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <PrintableFullPackageSpanish
          applicationData={applicationData}
          applicationId={applicationId}
          pathway={pathway}
          showPrintButton={true}
        />
      </main>
    </div>
  );
}