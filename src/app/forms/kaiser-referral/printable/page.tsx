'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PrintableKaiserReferralForm } from '@/components/forms/PrintableKaiserReferralForm';

function KaiserReferralPrintableContent() {
  const searchParams = useSearchParams();

  return (
    <PrintableKaiserReferralForm
      applicationId={searchParams.get('applicationId') || ''}
      memberName={searchParams.get('memberName') || ''}
      memberDob={searchParams.get('memberDob') || ''}
      memberPhone={searchParams.get('memberPhone') || ''}
      memberAddress={searchParams.get('memberAddress') || ''}
      memberMrn={searchParams.get('memberMrn') || ''}
      memberMediCal={searchParams.get('memberMediCal') || ''}
      caregiverName={searchParams.get('caregiverName') || ''}
      caregiverContact={searchParams.get('caregiverContact') || ''}
      referralDate={searchParams.get('referralDate') || ''}
      referrerName={searchParams.get('referrerName') || ''}
      referrerOrganization={searchParams.get('referrerOrganization') || ''}
      referrerNpi={searchParams.get('referrerNpi') || ''}
      referrerAddress={searchParams.get('referrerAddress') || ''}
      referrerEmail={searchParams.get('referrerEmail') || ''}
      referrerPhone={searchParams.get('referrerPhone') || ''}
      referrerRelationship={searchParams.get('referrerRelationship') || ''}
      currentLocationName={searchParams.get('currentLocationName') || ''}
      currentLocationAddress={searchParams.get('currentLocationAddress') || ''}
      healthPlan={searchParams.get('healthPlan') || ''}
      memberCounty={searchParams.get('memberCounty') || ''}
      showPrintButton={true}
    />
  );
}

export default function KaiserReferralPrintablePage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}>
          <KaiserReferralPrintableContent />
        </Suspense>
      </main>
    </div>
  );
}

