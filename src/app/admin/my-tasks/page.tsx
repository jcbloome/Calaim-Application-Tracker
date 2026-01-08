
'use client';

import React, { useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collectionGroup, getDocs, Timestamp } from 'firebase/firestore';
import type { Application, StaffTracker } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, ArrowUpDown, Calendar, CheckCircle2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isPast, differenceInDays } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'next/navigation';

type CombinedData = Application & {
    tracker?: StaffTracker;
};

type SortKey = 'memberName' | 'nextStepDate' | 'taskStatus';
type SortDirection = 'ascending' | 'descending';

const getTaskStatus = (application: Application): 'Open' | 'Closed' => {
    if (application.status === 'Completed & Submitted' || application.status === 'Approved') {
        return 'Closed';
    }
    return 'Open';
};

function MyTasksPageComponent() {
  const firestore = useFirestore();
  const { user, isLoading: isAdminLoading } = useAdmin();
  const searchParams = useSearchParams();

  const viewedUserId = searchParams.get('userId');
  const viewedUserName = searchParams.get('name');

  const targetUserId = viewedUserId || user?.uid;
  const pageTitle = viewedUserId ? `${viewedUserName}'s Tasks` : 'My Assigned Tasks';
  const pageDescription = viewedUserId 
    ? `A list of all tasks assigned to ${viewedUserName}.`
    : 'A list of all applications and tasks currently assigned to you.';

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'nextStepDate',
    direction: 'ascending',
  });

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !user) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
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

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const myTasks = useMemo(() => {
      if (!targetUserId) return [];
      return applications
        .map(app => ({ ...app, tracker: trackers.get(app.id) }))
        .filter(item => item.tracker?.assignedStaffId === targetUserId);
  }, [applications, trackers, targetUserId]);

  const sortedMyTasks: CombinedData[] = useMemo(() => {
      return [...myTasks].sort((a, b) => {
          let aValue: any;
          let bValue: any;

          switch (sortConfig.key) {
              case 'nextStepDate':
                  aValue = a.tracker?.nextStepDate?.toMillis() || 0;
                  bValue = b.tracker?.nextStepDate?.toMillis() || 0;
                  break;
              case 'taskStatus':
                  aValue = getTaskStatus(a);
                  bValue = getTaskStatus(b);
                  break;
              default: // memberName
                  aValue = `${a.memberFirstName} ${a.memberLastName}`;
                  bValue = `${b.memberFirstName} ${b.memberLastName}`;
          }

          if (aValue < bValue) {
              return sortConfig.direction === 'ascending' ? -1 : 1;
          }
          if (aValue > bValue) {
              return sortConfig.direction === 'ascending' ? 1 : -1;
          }
          return 0;
      });

  }, [myTasks, sortConfig]);

  const tasksDueTodayCount = useMemo(() => {
    return myTasks.filter(item => item.tracker?.nextStepDate && isToday(item.tracker.nextStepDate.toDate())).length;
  }, [myTasks]);


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
            <CardTitle>{pageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tasks Due Today</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{tasksDueTodayCount}</div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{myTasks.filter(t => getTaskStatus(t) === 'Open').length}</div>
                </CardContent>
            </Card>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Task List</CardTitle>
          <CardDescription>
            {pageDescription}
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
                            <TableHead>Pathway</TableHead>
                            <TableHead>
                                <Button variant="ghost" onClick={() => requestSort('taskStatus')}>
                                    Task Status <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead>Current Progress</TableHead>
                            <TableHead>Next Step</TableHead>
                            <TableHead>
                                <Button variant="ghost" onClick={() => requestSort('nextStepDate')}>
                                    Next Step Date <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedMyTasks.length > 0 ? sortedMyTasks.map(item => {
                            const dueDate = item.tracker?.nextStepDate?.toDate();
                            let dueDateStatus: 'overdue' | 'due-today' | 'due-soon' | null = null;
                            if (dueDate) {
                                if (isPast(dueDate) && !isToday(dueDate)) {
                                    dueDateStatus = 'overdue';
                                } else if (isToday(dueDate)) {
                                    dueDateStatus = 'due-today';
                                } else if (differenceInDays(dueDate, new Date()) <= 7) {
                                    dueDateStatus = 'due-soon';
                                }
                            }
                            
                            const taskStatus = getTaskStatus(item);

                            return (
                            <TableRow key={item.id} className={cn(dueDateStatus === 'due-today' && 'bg-yellow-50')}>
                                <TableCell className="font-medium">{item.memberFirstName} {item.memberLastName}</TableCell>
                                <TableCell>{item.pathway}</TableCell>
                                <TableCell>
                                     <Badge variant="outline" className={cn(
                                         taskStatus === 'Open' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                     )}>
                                        {taskStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell>{item.tracker?.status || 'N/A'}</TableCell>
                                <TableCell>{item.tracker?.nextStep || 'N/A'}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span>{dueDate ? format(dueDate, 'PPP') : 'N/A'}</span>
                                        {dueDateStatus === 'due-today' && <Badge variant="destructive">Due Today</Badge>}
                                        {dueDateStatus === 'overdue' && <Badge variant="destructive">Overdue</Badge>}
                                        {dueDateStatus === 'due-soon' && <Badge variant="outline">Due Soon</Badge>}
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
                                <TableCell colSpan={7} className="h-24 text-center">
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

export default function MyTasksPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-4">Loading...</p></div>}>
            <MyTasksPageComponent />
        </Suspense>
    )
}
