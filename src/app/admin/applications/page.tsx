'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { AdminApplicationsTable } from './components/AdminApplicationsTable';

export default function AdminApplicationsPage() {
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore) return null;
    // Use a collection group query to get all applications across all users.
    // This requires a Firestore index.
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>All Applications</CardTitle>
          <CardDescription>Browse and manage all applications submitted to the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-destructive">Error loading applications: {error.message}</p>}
          <AdminApplicationsTable applications={applications || []} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
