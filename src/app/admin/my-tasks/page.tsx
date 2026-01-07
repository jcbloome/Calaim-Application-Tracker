
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup, query, where, Query } from 'firebase/firestore';
import type { Application, StaffTracker } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, ArrowUpDown } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { format } from 'date-fns';

type SortKey = 'memberName' | 'nextStep' | 'nextStepDate' | 'status';

export default function MyTasksPage() {
  const firestore = useFirestore();
  const { user, isAdmin, isLoading: isAdminLoading } = useAdmin();

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<StaffTracker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'nextStepDate', direction: 'ascending' });

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !user) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        const trackersQuery = query(
            collectionGroup(firestore, 'staffTrackers'),
            where('assignedStaffId', '==', user.uid)
        );

        const trackersSnap = await getDocs(trackersQuery).catch(e => {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'staffTrackers (collection group)', operation: 'list' }));
            throw e;
        });

        const myTrackers = trackersSnap.docs.map(doc => doc.data() as StaffTracker);
        setTrackers(myTrackers);

        if (myTrackers.length > 0) {
            const appIds = myTrackers.map(t => t.applicationId);
            const appsQuery = query(
                collectionGroup(firestore, 'applications'),
                where('id', 'in', appIds)
            );
            const appsSnap = await getDocs(appsQuery);
            const myApps = appsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Application));
            setApplications(myApps);
        } else {
            setApplications([]);
        }

    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, user, isAdminLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedTasks = useMemo(() => {
    const appMap = new Map(applications.map(app => [app.id, app]));
    const tasks = trackers.map(tracker => ({
        ...tracker,
        member: appMap.get(tracker.applicationId),
    }));

    return [...tasks].sort((a, b) => {
        let aValue, bValue;

        if (sortConfig.key === 'memberName') {
            aValue = a.member ? `${a.member.memberFirstName} ${a.member.memberLastName}` : '';
            bValue = b.member ? `${b.member.memberFirstName} ${b.member.memberLastName}` : '';
        } else if (sortConfig.key === 'nextStepDate') {
            aValue = a.nextStepDate?.toMillis() || 0;
            bValue = b.nextStepDate?.toMillis() || 0;
        } else {
             aValue = a[sortConfig.key] || '';
             bValue = b[sortConfig.key] || '';
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });

  }, [applications, trackers, sortConfig]);

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading your assigned tasks...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Error: A permission error occurred while fetching your tasks.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My Tasks</CardTitle>
          <CardDescription>
            A list of all applications and tasks assigned to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('memberName')}>
                            Member <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('nextStep')}>
                            Next Step <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('nextStepDate')}>
                            Due Date <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead>
                         <Button variant="ghost" onClick={() => requestSort('status')}>
                            Current Status <ArrowUpDown className="ml-2 h-4 w-4" />
                        </Button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTasks.length > 0 ? sortedTasks.map(task => (
                    <TableRow key={task.id}>
                        <TableCell className="font-medium">
                            {task.member ? `${task.member.memberFirstName} ${task.member.memberLastName}` : 'Loading...'}
                        </TableCell>
                        <TableCell>{task.nextStep || 'N/A'}</TableCell>
                        <TableCell>{task.nextStepDate ? format(task.nextStepDate.toDate(), 'PPP') : 'N/A'}</TableCell>
                        <TableCell>{task.status || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                             <Button asChild variant="outline" size="sm">
                                <Link href={`/admin/applications/${task.applicationId}?userId=${task.userId}`}>View Application</Link>
                            </Button>
                        </TableCell>
                    </TableRow>
                )) : (
                    <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
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
