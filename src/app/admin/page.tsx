
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, FileText, AlertCircle } from 'lucide-react';
import { ApplicationListSkeleton } from '@/components/ui/application-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmin } from '@/hooks/use-admin';
import { useFirestore, type WithId } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './applications/components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { errorEmitter, FirestorePermissionError } from '@/firebase';

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
        // Query both user applications and admin-created applications
        const userAppsQuery = collectionGroup(firestore, 'applications');
        const adminAppsQuery = collection(firestore, 'applications');
        
        const [userAppsSnapshot, adminAppsSnapshot] = await Promise.all([
          getDocs(userAppsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' }));
            throw e;
          }),
          getDocs(adminAppsQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection)', operation: 'list' }));
            throw e;
          })
        ]);

        // Combine both user and admin applications with unique keys
        const userApps = userAppsSnapshot.docs.map(doc => ({ 
          ...doc.data(), 
          id: doc.id,
          uniqueKey: `user-${doc.id}`,
          source: 'user'
        })) as WithId<Application & FormValues>[];
        const adminApps = adminAppsSnapshot.docs.map(doc => ({ 
          ...doc.data(), 
          id: doc.id,
          uniqueKey: `admin-${doc.id}`,
          source: 'admin'
        })) as WithId<Application & FormValues>[];
        const apps = [...userApps, ...adminApps];
        
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

  const csSummaryStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      reviewed: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
      hnReviewed: 0,
      kaiserReviewed: 0,
    };

    if (!allApplications) return result;

    allApplications.forEach((app) => {
      const forms = app.forms || [];
      const hasCompletedSummary = forms.some((form: any) =>
        (form.name === 'CS Member Summary' || form.name === 'CS Summary') && form.status === 'Completed'
      );
      if (!hasCompletedSummary) return;

      result.received += 1;
      const plan = String(app.healthPlan || '').toLowerCase();
      const isKaiser = plan.includes('kaiser');
      const isHn = plan.includes('health net');

      if (app.applicationChecked) {
        result.reviewed += 1;
        if (isKaiser) result.kaiserReviewed += 1;
        if (isHn) result.hnReviewed += 1;
      } else {
        result.needsReview += 1;
        if (isKaiser) result.kaiserNeedsReview += 1;
        if (isHn) result.hnNeedsReview += 1;
      }
    });

    return result;
  }, [allApplications]);

  const documentStats = useMemo(() => {
    const result = {
      received: 0,
      needsReview: 0,
      reviewed: 0,
      hnNeedsReview: 0,
      kaiserNeedsReview: 0,
      hnReviewed: 0,
      kaiserReviewed: 0,
    };

    if (!allApplications) return result;

    allApplications.forEach((app) => {
      const forms = app.forms || [];
      forms.forEach((form: any) => {
        const isCompleted = form.status === 'Completed';
        const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
        if (!isCompleted || isSummary) return;

        result.received += 1;
        const plan = String(app.healthPlan || '').toLowerCase();
        const isKaiser = plan.includes('kaiser');
        const isHn = plan.includes('health net');

        if (form.acknowledged) {
          result.reviewed += 1;
          if (isKaiser) result.kaiserReviewed += 1;
          if (isHn) result.hnReviewed += 1;
        } else {
          result.needsReview += 1;
          if (isKaiser) result.kaiserNeedsReview += 1;
          if (isHn) result.hnNeedsReview += 1;
        }
      });
    });

    return result;
  }, [allApplications]);

  const recentApplications = useMemo(() => {
    if (!allApplications) return [];
    return [...allApplications]
      .sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
      })
      .slice(0, 10);
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <ApplicationListSkeleton />
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
      <div>
        <h1 className="text-3xl font-bold">Activity Dashboard</h1>
        <p className="text-muted-foreground">
          Daily dashboard with notifications, statistics, and recent applications.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CS Summary Needs Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/applications?review=cs"
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View CS summaries needing review"
            >
              {csSummaryStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin/applications?plan=health-net&review=cs" aria-label="View Health Net CS summaries needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(CS) {csSummaryStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href="/admin/applications?plan=kaiser&review=cs" aria-label="View Kaiser CS summaries needing review">
                <Badge
                  variant="outline"
                  className="bg-blue-100 text-blue-800 border-blue-200 cursor-pointer hover:opacity-90"
                >
                  K(CS) {csSummaryStats.kaiserNeedsReview}
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CS Summary Reviewed</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{csSummaryStats.reviewed}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                HN(CS) {csSummaryStats.hnReviewed}
              </Badge>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                K(CS) {csSummaryStats.kaiserReviewed}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents Need Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Link
              href="/admin/applications?review=docs"
              className="inline-block text-2xl font-bold hover:underline"
              aria-label="View documents needing review"
            >
              {documentStats.needsReview}
            </Link>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/admin/applications?plan=health-net&review=docs" aria-label="View Health Net documents needing review">
                <Badge
                  variant="outline"
                  className="bg-green-100 text-green-800 border-green-200 cursor-pointer hover:opacity-90"
                >
                  HN(D) {documentStats.hnNeedsReview}
                </Badge>
              </Link>
              <Link href="/admin/applications?plan=kaiser&review=docs" aria-label="View Kaiser documents needing review">
                <Badge
                  variant="outline"
                  className="bg-blue-100 text-blue-800 border-blue-200 cursor-pointer hover:opacity-90"
                >
                  K(D) {documentStats.kaiserNeedsReview}
                </Badge>
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documents Reviewed</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentStats.reviewed}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                HN(D) {documentStats.hnReviewed}
              </Badge>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                K(D) {documentStats.kaiserReviewed}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
            <div>
               <Card>
                <CardHeader className="flex items-center justify-between flex-row">
                    <div>
                      <CardTitle>Recent Applications</CardTitle>
                      <CardDescription>A list of the 10 most recently updated applications.</CardDescription>
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/admin/applications">More</Link>
                    </Button>
                </CardHeader>
                <CardContent>
                  <AdminApplicationsTable
                    applications={recentApplications}
                    isLoading={isLoadingApps}
                    showInlineTracker
                  />
                </CardContent>
              </Card>
            </div>
        </div>

    </div>
  );
}
