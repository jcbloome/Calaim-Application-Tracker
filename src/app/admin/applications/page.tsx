'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useFirestore, type WithId } from '@/firebase';
import { collection, doc, writeBatch, getDocs, collectionGroup, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import { Filter, Trash2, List, FileCheck2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAdmin } from '@/hooks/use-admin';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { format } from 'date-fns';

export default function AdminApplicationsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isAdmin, isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const [selected, setSelected] = useState<string[]>([]);
  const [allApplications, setAllApplications] = useState<WithId<Application & FormValues>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filter states
  const [healthPlanFilter, setHealthPlanFilter] = useState('all');
  const [pathwayFilter, setPathwayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('');

  const fetchAllApplications = useCallback(async () => {
    if (!firestore || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [firestore, isAdmin, isAdminLoading]);

  useEffect(() => {
    fetchAllApplications();
  }, [fetchAllApplications]);

  const filteredApplications = useMemo(() => {
    return allApplications.filter(app => {
      const healthPlanMatch = healthPlanFilter === 'all' || app.healthPlan === healthPlanFilter;
      const pathwayMatch = pathwayFilter === 'all' || app.pathway === pathwayFilter;
      const statusMatch = statusFilter === 'all' || app.status === statusFilter;
      const memberMatch = !memberFilter || `${app.memberFirstName} ${app.memberLastName}`.toLowerCase().includes(memberFilter.toLowerCase());

      return healthPlanMatch && pathwayMatch && statusMatch && memberMatch;
    });
  }, [allApplications, healthPlanFilter, pathwayFilter, statusFilter, memberFilter]);
  
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
      .slice(0, 10); // Get the 10 most recent activities
  }, [allApplications]);

  const handleSelectionChange = (id: string, checked: boolean) => {
    setSelected(prev => checked ? [...prev, id] : prev.filter(item => item !== id));
  };

  const handleDelete = async () => {
    if (!firestore || selected.length === 0) return;
    
    const batch = writeBatch(firestore);
    
    selected.forEach(id => {
      const appToDelete = allApplications?.find(app => app.id === id);
      if (appToDelete?.userId) {
          const docRef = doc(firestore, `users/${appToDelete.userId}/applications`, id);
          batch.delete(docRef);
      }
    });

    try {
      await batch.commit();
      toast({
        title: 'Applications Deleted',
        description: `${selected.length} application(s) have been successfully deleted.`,
      });
      // Refetch data
       setAllApplications(prev => prev.filter(app => !selected.includes(app.id)));
      setSelected([]);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Could not delete applications: ${error.message}`,
      });
    }
  };

  const clearFilters = () => {
    setHealthPlanFilter('all');
    setPathwayFilter('all');
    setStatusFilter('all');
    setMemberFilter('');
  };


  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">All Applications</h1>
            <p className="text-muted-foreground">Browse and manage all applications submitted to the platform.</p>
          </div>
           {selected.length > 0 && isSuperAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete ({selected.length})
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete {selected.length} application(s).
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        Continue
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
                 <Card>
                    <CardHeader>
                        <CardTitle>Application Filters</CardTitle>
                        <CardDescription>Refine the list of applications using the filters below.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col sm:flex-row gap-4 mb-4 p-4 border rounded-lg bg-muted/50">
                        <div className="flex-1 min-w-[150px]">
                          <Input
                            placeholder="Filter by member name..."
                            value={memberFilter}
                            onChange={(e) => setMemberFilter(e.target.value)}
                          />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <Select value={healthPlanFilter} onValueChange={setHealthPlanFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter by Health Plan" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Health Plans</SelectItem>
                              <SelectItem value="Kaiser">Kaiser</SelectItem>
                              <SelectItem value="Health Net">Health Net</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                         <div className="flex-1 min-w-[150px]">
                          <Select value={pathwayFilter} onValueChange={setPathwayFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter by Pathway" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Pathways</SelectItem>
                              <SelectItem value="SNF Transition">SNF Transition</SelectItem>
                              <SelectItem value="SNF Diversion">SNF Diversion</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter by Status" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Statuses</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Requires Revision">Requires Revision</SelectItem>
                              <SelectItem value="Approved">Approved</SelectItem>
                              <SelectItem value="Completed & Submitted">Completed & Submitted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="ghost" onClick={clearFilters}>Clear</Button>
                      </div>
                      {error && <p className="text-destructive">Error loading applications: A permission error occurred while fetching data.</p>}
                      <AdminApplicationsTable 
                        applications={filteredApplications} 
                        isLoading={isLoading || isAdminLoading}
                        onSelectionChange={isSuperAdmin ? handleSelectionChange : undefined}
                        selected={isSuperAdmin ? selected : undefined}
                      />
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><List className="h-5 w-5" /> Recent Activity Log</CardTitle>
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
                <CardFooter>
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/admin/progress-tracker">View Full Progress Tracker</Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>
    </div>
  );
}
