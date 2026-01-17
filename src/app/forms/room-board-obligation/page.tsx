'use client';

import React from 'react';
import { PrintableRoomBoardObligationForm } from '@/components/forms/PrintableRoomBoardObligationForm';
import { useSearchParams } from 'next/navigation';

export default function RoomBoardObligationPage() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const memberDob = searchParams.get('memberDob') || '';
  const applicationId = searchParams.get('applicationId') || '';

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <PrintableRoomBoardObligationForm
          memberName={memberName}
          memberMrn={memberMrn}
          memberDob={memberDob}
          applicationId={applicationId}
          showPrintButton={true}
        />
      </main>
    </div>
  );
}