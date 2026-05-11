
'use client'; 

import React, { Suspense } from 'react';
import { PrintableWaiversForm } from '@/components/forms/PrintableWaiversForm';
import { useSearchParams } from 'next/navigation';

function PrintableWaiversContent() {
  const searchParams = useSearchParams();
  const memberName = searchParams.get('memberName') || '';
  const memberMrn = searchParams.get('memberMrn') || '';
  const applicationId = searchParams.get('applicationId') || '';
  const signerType = searchParams.get('signerType') || '';
  const signerName = searchParams.get('signerName') || '';
  const signerRelationship = searchParams.get('signerRelationship') || '';
  const signatureDate = searchParams.get('signatureDate') || '';
  const monthlyIncome = searchParams.get('monthlyIncome') || '';
  const incomeSource = searchParams.get('incomeSource') || '';
  const focChoice = searchParams.get('focChoice') || '';
  const ackHipaa = searchParams.get('ackHipaa') === '1';
  const ackLiability = searchParams.get('ackLiability') === '1';
  const ackFoc = searchParams.get('ackFoc') === '1';
  const ackRoomAndBoard = searchParams.get('ackRoomAndBoard') === '1';

  return (
    <PrintableWaiversForm
      memberName={memberName}
      memberMrn={memberMrn}
      applicationId={applicationId}
      showPrintButton={true}
      signerType={signerType}
      signerName={signerName}
      signerRelationship={signerRelationship}
      signatureDate={signatureDate}
      monthlyIncome={monthlyIncome}
      incomeSource={incomeSource}
      focChoice={focChoice}
      ackHipaa={ackHipaa}
      ackLiability={ackLiability}
      ackFoc={ackFoc}
      ackRoomAndBoard={ackRoomAndBoard}
    />
  );
}

export default function WaiverFormPage() {
  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      <main className="container mx-auto py-8 px-4 print:p-0">
        <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
          <PrintableWaiversContent />
        </Suspense>
      </main>
    </div>
  );
}
