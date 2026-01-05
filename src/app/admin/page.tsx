
'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FolderKanban, Users, Activity, FileCheck2 } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, type WithId } from '@/firebase';
import { collection, onSnapshot, Unsubscribe, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './applications/components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { errorEmitter, FirestorePermissionError } from '@/firebase/error-emitter';

export default function AdminDashboardPage() {
  const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();

  const [allApplications, setAllApplications] = useState<(Application & FormValues)[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isAdminLoading || !firestore || !isAdmin) {
      if (!isAdminLoading) setIsLoadingApps(false);
      return;
    }
    
    setIsLoadingApps(true);
    const usersRef = collection(firestore, 'users');
    let applicationListeners: Unsubscribe[] = [];

    const usersListener = onSnapshot(usersRef,
      (usersSnapshot) => {
        applicationListeners.forEach(unsub => unsub());
        applicationListeners = [];

        let allApps: (Application & FormValues)[] = [];
        let pendingUserCollections = usersSnapshot.docs.length;
        
        if (pendingUserCollections === 0) {
          setAllApplications([]);
          setIsLoadingApps(false);
          return;
        }

        const appUpdateCallback = () => {
            setAllApplications([...allApps]); // Create a new array reference
            // Only stop loading when all have been processed at least once
            if (pendingUserCollections === 0) {
                setIsLoadingApps(false);
            }
        };

        usersSnapshot.docs.forEach(userDoc => {
          const appsRef = collection(firestore, `users/${userDoc.id}/applications`);
          const appsListener = onSnapshot(appsRef, 
            (appsSnapshot) => {
              appsSnapshot.docChanges().forEach((change) => {
                const appData = { id: change.doc.id, ...change.doc.data() } as Application & FormValues;
                const index = allApps.findIndex(a => a.id === appData.id);

                if (change.type === "removed") {
                    if (index > -1) allApps.splice(index, 1);
                } else { // 'added' or 'modified'
                    if (index > -1) {
                      allApps[index] = appData;
                    } else {
                      allApps.push(appData);
                    }
                }
              });

              if(pendingUserCollections > 0) pendingUserCollections--;
              appUpdateCallback();
            },
            (err) => {
              const permissionError = new FirestorePermissionError({ path: `users/${userDoc.id}/applications`, operation: 'list' });
              setError(permissionError); // Set local error for UI
              errorEmitter.emit('permission-error', permissionError); // Emit global error
              if(pendingUserCollections > 0) pendingUserCollections--;
              if(pendingUserCollections === 0) setIsLoadingApps(false);
            }
          );
          applicationListeners.push(appsListener);
        });
      },
      (err) => {
        const permissionError = new FirestorePermissionError({ path: 'users', operation: 'list' });
        setError(permissionError); // Set local error for UI
        errorEmitter.emit('permission-error', permissionError); // Emit global error
        setIsLoadingApps(false);
      }
    );

    return () => {
      usersListener();
      applicationListeners.forEach(unsub => unsub());
    };
  }, [firestore, isAdmin, isAdminLoading]);

  const stats = React.useMemo(() => {
    if (!allApplications) {
      return { total: 0, revisions: 0, approved: 0 };
    }
    return {
      total: allApplications.length,
      revisions: allApplications.filter(app => app.status === 'Requires Revision').length,
      approved: allApplications.filter(app => app.status === 'Approved').length,
    };
  }, [allApplications]);

  const recentApplications = React.useMemo(() => {
    if (!allApplications) return [];
    return [...allApplications]
      .sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [allApplications]);

  if (isAdminLoading || isLoadingApps) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading dashboard data...</p>
      </div>
    );
  }

   if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Failed to load application data: A permission error occurred.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.displayName || 'Admin'}. Here's an overview of all applications.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Applications
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-yellow-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Revisions
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.revisions}</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approvals</CardTitle>
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.approved}</div>
          </CardContent>
        </Card>
      </div>
       <Card>
        <CardHeader className="flex items-center justify-between flex-row">
            <div>
              <CardTitle>Recent Applications</CardTitle>
              <CardDescription>A list of the 5 most recently updated applications.</CardDescription>
            </div>
            <Button asChild variant="outline">
                <Link href="/admin/applications">View All</Link>
            </Button>
        </CardHeader>
        <CardContent>
           <AdminApplicationsTable applications={recentApplications} isLoading={isLoadingApps} />
        </CardContent>
      </Card>
    </div>
  );
}
