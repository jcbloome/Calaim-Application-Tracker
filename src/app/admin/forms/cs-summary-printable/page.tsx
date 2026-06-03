'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useDoc, useFirestore, useMemoFirebase, useUser } from '@/firebase';
import { PrintableCsSummaryForm } from '@/components/forms/PrintableCsSummaryForm';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

function AdminCsSummaryPrintableContent() {
  const searchParams = useSearchParams();
  const { isUserLoading } = useUser();
  const firestore = useFirestore();
  const applicationId = String(searchParams.get('applicationId') || '').trim();
  const userId = String(searchParams.get('userId') || '').trim();

  const applicationRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId) return null;
    if (applicationId.startsWith('admin_app_') || !userId) {
      return doc(firestore, 'applications', applicationId);
    }
    return doc(firestore, `users/${userId}/applications`, applicationId);
  }, [applicationId, firestore, isUserLoading, userId]);

  const { data: application, isLoading } = useDoc<Application & FormValues>(applicationRef);

  if (isLoading || isUserLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading printable form...</span>
      </div>
    );
  }

  if (!application || !applicationId) {
    return (
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        CS Summary data could not be loaded for this application.
      </div>
    );
  }

  return (
    <PrintableCsSummaryForm
      data={application}
      applicationId={applicationId}
      showPrintButton={true}
    />
  );
}

export default function AdminCsSummaryPrintablePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading printable form...</span>
        </div>
      }
    >
      <AdminCsSummaryPrintableContent />
    </Suspense>
  );
}
