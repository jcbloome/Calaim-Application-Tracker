'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FolderKanban, Users, Activity, FileCheck2 } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, useCollection, type WithId, useMemoFirebase } from '@/firebase';
import { collectionGroup, query, Query, where } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './applications/components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { user, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();

  const applicationsQuery = useMemoFirebase(() => {
    // CRITICAL: Do not create the query until auth/admin state is fully resolved.
    if (isAdminLoading || !firestore) {
      return null;
    }
    return query(collectionGroup(firestore, 'applications')) as Query<Application & FormValues>;
  }, [firestore, isAdminLoading]);

  const { data: applications, isLoading: isLoadingApps, error } = useCollection<Application & FormValues>(applicationsQuery);

  const stats = useMemo(() => {
    if (!applications) {
      return { total: 0, revisions: 0, approved: 0 };
    }
    return {
      total: applications.length,
      revisions: applications.filter(app => app.status === 'Requires Revision').length,
      approved: applications.filter(app => app.status === 'Approved').length,
    };
  }, [applications]);

  const recentApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications]
      .sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as any).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as any).toMillis() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [applications]);

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
          <p className="text-destructive">Failed to load application data: {error.message}</p>
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
