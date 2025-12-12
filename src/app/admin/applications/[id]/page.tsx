
'use client';

import { notFound, useParams } from 'next/navigation';
import { useFirestore, useCollection } from '@/firebase';
import { ApplicationDetailClientView } from './ApplicationDetailClientView';
import type { Application } from '@/lib/definitions';
import { useMemo } from 'react';
import { collectionGroup, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

// This is now a Client Component again to resolve server-side auth issues.
export default function AdminApplicationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore || !id) return null;
    // Query the collection group to find the application by its ID, regardless of the user.
    return query(collectionGroup(firestore, 'applications'), where('id', '==', id));
  }, [firestore, id]);

  const { data: applications, isLoading } = useCollection<Application>(applicationsQuery);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading application...</p>
      </div>
    );
  }

  const applicationData = applications?.[0];

  if (!applicationData) {
    // If the query completes and there's no data, then the application doesn't exist.
    notFound();
  }

  // Pass the fetched data to the client view.
  return <ApplicationDetailClientView initialApplication={applicationData} />;
}
