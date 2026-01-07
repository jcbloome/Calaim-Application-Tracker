'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collectionGroup, getDocs } from 'firebase/firestore';
import type { Application, StaffTracker, StaffMember } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type CombinedData = Application & {
    tracker?: StaffTracker;
    assignedStaff?: StaffMember;
};

export default function MyTasksPage() {
  const firestore = useFirestore();
  const { user, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !user) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        // These queries are allowed for admins, which all staff members are.
        const [appsSnap, trackersSnap] = await Promise.all([
            getDocs(collectionGroup(firestore, 'applications')),
            getDocs(collectionGroup(firestore, 'staffTrackers')),
        ]);

        const apps = appsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Application[];
        const trackersMap = new Map(trackersSnap.docs.map(doc => [doc.data().applicationId, doc.data() as StaffTracker]));
        
        setApplications(apps);
        setTrackers(trackersMap);

    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, isAdminLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const myTasks: CombinedData[] = useMemo(() => {
      if (!user) return [];

      return applications
        .map(app => ({ ...app, tracker: trackers.get(app.id) }))
        .filter(item => item.tracker?.assignedStaffId === user.uid)
        .sort((a, b) => {
            const dateA = a.tracker?.nextStepDate?.toMillis() || 0;
            const dateB = b.tracker?.nextStepDate?.toMillis() || 0;
            return dateA - dateB; // Sort by due date ascending
        });

  }, [applications, trackers, user]);

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Your Tasks...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Error: A permission error occurred while fetching data.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Assigned Tasks</CardTitle>
          <CardDescription>
            A list of all applications and tasks currently assigned to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Member</TableHead>
                            <TableHead>Pathway</TableHead>
                            <TableHead>Current Progress</TableHead>
                            <TableHead>Next Step</TableHead>
                            <TableHead>Next Step Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {myTasks.length > 0 ? myTasks.map(item => {
                            const dueDate = item.tracker?.nextStepDate?.toDate();
                            const isDueToday = dueDate && isToday(dueDate);
                            
                            return (
                            <TableRow key={item.id} className={cn(isDueToday && 'bg-yellow-50')}>
                                <TableCell className="font-medium">{item.memberFirstName} {item.memberLastName}</TableCell>
                                <TableCell>{item.pathway}</TableCell>
                                <TableCell>{item.tracker?.status || 'N/A'}</TableCell>
                                <TableCell>{item.tracker?.nextStep || 'N/A'}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span>{dueDate ? format(dueDate, 'PPP') : 'N/A'}</span>
                                        {isDueToday && <Badge variant="destructive">Due Today</Badge>}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/admin/applications/${item.id}?userId=${item.userId}`}>View Details</Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                            )
                        }) : (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    You have no assigned tasks.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
