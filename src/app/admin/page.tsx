
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, FolderKanban, Users, Activity, FileCheck2, List, RefreshCw } from 'lucide-react';
import { ApplicationListSkeleton } from '@/components/ui/application-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, type WithId } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import { format } from 'date-fns';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './applications/components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { DailyNotificationDashboard } from '@/components/DailyNotificationDashboard';

export default function AdminDashboardPage() {
  const { user, isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const firestore = useFirestore();

  const [allApplications, setAllApplications] = useState<WithId<Application & FormValues>[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchApps = useCallback(async () => {
    if (isAdminLoading || !firestore || !isAdmin) {
        if (!isAdminLoading) setIsLoadingApps(false);
        return;
      }
      
    setIsLoadingApps(true);
    setError(null);
    try {
        const appsQuery = collectionGroup(firestore, 'applications');
        const snapshot = await getDocs(appsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' }));
            throw e;
        });
        const apps = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as WithId<Application & FormValues>[];
        setAllApplications(apps);
    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoadingApps(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const stats = useMemo(() => {
    if (!allApplications) {
      return { total: 0, revisions: 0, approved: 0 };
    }
    return {
      total: allApplications.length,
      revisions: allApplications.filter(app => app.status === 'Requires Revision').length,
      approved: allApplications.filter(app => app.status === 'Approved').length,
    };
  }, [allApplications]);

  const recentApplications = useMemo(() => {
    if (!allApplications) return [];
    return [...allApplications]
      .sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [allApplications]);
  
  const activityLog = useMemo(() => {
    if (!allApplications) return [];
    
    const allActivities = allApplications.flatMap(app => 
        app.forms
            ?.filter(form => form.status === 'Completed' && form.dateCompleted)
            .map(form => ({
                appId: app.id,
                userId: app.userId,
                appName: `${app.memberFirstName} ${app.memberLastName}`,
                referrerName: app.referrerName,
                formName: form.name,
                date: form.dateCompleted!.toDate(),
                action: form.type === 'Upload' ? 'Uploaded' : 'Completed',
            })) || []
    );

    return allActivities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5); // Get the 5 most recent activities
  }, [allApplications]);

  if (isAdminLoading || isLoadingApps) {
    return (
      <div className="space-y-6">
        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
        
        {/* Recent Applications Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <ApplicationListSkeleton />
            </CardContent>
          </Card>
          
          {/* Activity Log Skeleton */}
          <Card className="col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Overview</h1>
          <p className="text-muted-foreground">
            Daily dashboard with notifications, statistics, and recent applications.
          </p>
        </div>
        <Button 
          onClick={fetchApps} 
          disabled={isLoadingApps} 
          variant="outline" 
          size="sm"
          className="flex items-center gap-2"
        >
          {isLoadingApps ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Daily Notifications Dashboard */}
      <DailyNotificationDashboard />
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
      
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
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
            
            <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><List className="h-5 w-5" /> Recent Activity</CardTitle>
                <CardDescription>The latest documents completed across all applications.</CardDescription>
            </CardHeader>
            <CardContent>
                {activityLog.length > 0 ? (
                    <ul className="space-y-4">
                        {activityLog.map((activity, index) => (
                            <li key={`${activity.appId}-${activity.formName}-${index}`} className="flex gap-4">
                                <div className="flex-shrink-0">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                                        <FileCheck2 className="h-5 w-5 text-muted-foreground" />
                                    </span>
                                </div>
                                <div className="flex-grow">
                                    <p className="text-sm font-medium">
                                        <Link href={`/admin/applications/${activity.appId}?userId=${activity.userId}`} className="hover:underline">
                                            {activity.appName}
                                        </Link>
                                    </p>
                                    <p className="text-xs text-muted-foreground">{activity.action} "{activity.formName}" by <span className="font-semibold">{activity.referrerName}</span></p>
                                    <p className="text-xs text-muted-foreground">{format(activity.date, 'PPP p')}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-center text-muted-foreground py-4">No recent activity.</p>
                )}
            </CardContent>
          </Card>
        </div>

    </div>
  );
}
