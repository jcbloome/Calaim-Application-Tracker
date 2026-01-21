'use client';

import React, { Suspense } from 'react';
import { PrintableRoomBoardObligationForm } from '@/components/forms/PrintableRoomBoardObligationForm';
import { useSearchParams } from 'next/navigation';

function RoomBoardObligationContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const memberDob = searchParams.get('memberDob') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <PrintableRoomBoardObligationForm
      memberName={memberName}
      memberMrn={memberMrn}
      memberDob={memberDob}
      applicationId={applicationId}
      showPrintButton={true}
    />
  );
}

export default function RoomBoardObligationPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <RoomBoardObligationContent />
        </Suspense>
      </main>
    </div>
  );
}