'use client';

import { notFound, useParams, useSearchParams } from 'next/navigation';
import { useFirestore, useDoc } from '@/firebase';
import { ApplicationDetailClientView } from './ApplicationDetailClientView';
import type { Application } from '@/lib/definitions';
import { useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

// This is now a Client Component that fetches data.
export default function AdminApplicationDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const userId = searchParams.get('userId');
  const firestore = useFirestore();

  const applicationDocRef = useMemo(() => {
    if (!firestore || !id || !userId) return null;
    return doc(firestore, `users/${userId}/applications`, id);
  }, [firestore, id, userId]);

  const { data: applicationData, isLoading } = useDoc<Application>(applicationDocRef);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading application...</p>
      </div>
    );
  }

  if (!applicationData) {
    // If the query completes and there's no data, then the application doesn't exist.
    notFound();
  }

  // Pass the fetched data to the client view.
  return <ApplicationDetailClientView initialApplication={applicationData} />;
}
