
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useCollection, WithId } from '@/firebase';
import { collectionGroup, query, Query } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function ProgressTrackerPage() {
  const firestore = useFirestore();

  const applicationsQuery = useMemo(() => {
    if (!firestore) return null;
    return query(collectionGroup(firestore, 'applications')) as Query<Application>;
  }, [firestore]);

  const { data: applications, isLoading, error } = useCollection<Application>(applicationsQuery);

  const sortedApplications = useMemo(() => {
    if (!applications) return [];
    return [...applications].sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as any).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as any).toMillis() : 0;
        return timeB - timeA;
      });
  }, [applications])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Application Progress Tracker</CardTitle>
          <CardDescription>
            A high-level overview of all applications and their completion status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-destructive">Error: {error.message}</p>}
          {isLoading ? (
             <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading application data...</p>
            </div>
          ) : (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead className="hidden sm:table-cell">Last Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedApplications.length > 0 ? sortedApplications.map(app => (
                        <TableRow key={app.id}>
                            <TableCell>
                                <div className="font-medium">{`${app.memberFirstName} ${app.memberLastName}`}</div>
                                <div className="text-xs text-muted-foreground font-mono">{app.id}</div>
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Progress value={app.progress || 0} className="w-40 h-2" />
                                    <span className="text-sm font-medium">{Math.round(app.progress || 0)}%</span>
                                </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                                {app.lastUpdated ? format(app.lastUpdated.toDate(), 'MM/dd/yyyy p') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/admin/applications/${app.id}?userId=${app.userId}`}>View Details</Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    )) : (
                         <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                No applications found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
             </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
