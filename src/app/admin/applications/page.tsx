
'use client';

import React, { useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useFirestore, type WithId } from '@/firebase';
import { collection, doc, writeBatch, getDocs, collectionGroup, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { AdminApplicationsTable } from './components/AdminApplicationsTable';
import { Button } from '@/components/ui/button';
import { Filter, Trash2, Database, AlertTriangle, Plus } from 'lucide-react';
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
import { useSearchParams } from 'next/navigation';

function AdminApplicationsPageContent() {
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
  const [reviewFilter, setReviewFilter] = useState<'all' | 'cs' | 'docs'>('all');
  const searchParams = useSearchParams();

  const fetchAllApplications = useCallback(async () => {
    if (!firestore || !isAdmin) {
      if (!isAdminLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
      const userApps = userAppsSnapshot.docs.map((doc, index) => ({ 
        ...doc.data(), 
        id: doc.id,
        uniqueKey: `user-${doc.id}-${index}`,
        source: 'user'
      })) as WithId<Application & FormValues>[];
      const adminApps = adminAppsSnapshot.docs.map((doc, index) => ({ 
        ...doc.data(), 
        id: doc.id,
        uniqueKey: `admin-${doc.id}-${index}`,
        source: 'admin'
      })) as WithId<Application & FormValues>[];
      
      // Remove duplicates by ID and member name, preferring admin source over user source
      const appsMap = new Map<string, WithId<Application & FormValues>>();
      const memberNameMap = new Map<string, WithId<Application & FormValues>>();
      
      // Add user apps first
      userApps.forEach(app => {
        appsMap.set(app.id, app);
        
        // Also track by member name to catch duplicates with different IDs
        const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim().toLowerCase();
        if (memberName && !memberNameMap.has(memberName)) {
          memberNameMap.set(memberName, app);
        }
      });
      
      // Add admin apps (will overwrite user apps with same ID or member name)
      adminApps.forEach(app => {
        appsMap.set(app.id, app);
        
        const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim().toLowerCase();
        if (memberName) {
          // If we already have this member name, prefer the admin version if it's newer
          const existing = memberNameMap.get(memberName);
          if (!existing || (app.lastUpdated && existing.lastUpdated && 
              (app.lastUpdated as Timestamp).toMillis() > (existing.lastUpdated as Timestamp).toMillis())) {
            memberNameMap.set(memberName, app);
          }
        }
      });
      
      // Use member name map to get unique applications by member
      const uniqueApps = Array.from(memberNameMap.values());
      
      // Add back any applications that don't have member names
      appsMap.forEach(app => {
        const memberName = `${app.memberFirstName || ''} ${app.memberLastName || ''}`.trim().toLowerCase();
        if (!memberName || memberName === '') {
          uniqueApps.push(app);
        }
      });
      
      const apps = uniqueApps;
      
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

  useEffect(() => {
    const plan = (searchParams.get('plan') || '').toLowerCase();
    const review = (searchParams.get('review') || '').toLowerCase();

    if (plan) {
      if (plan.includes('kaiser')) setHealthPlanFilter('Kaiser');
      if (plan.includes('health') || plan.includes('hn')) setHealthPlanFilter('Health Net');
    }

    if (review === 'cs') setReviewFilter('cs');
    if (review === 'docs') setReviewFilter('docs');
  }, [searchParams]);

  const filteredApplications = useMemo(() => {
    return allApplications.filter(app => {
      const healthPlanMatch = healthPlanFilter === 'all' || app.healthPlan === healthPlanFilter;
      const pathwayMatch = pathwayFilter === 'all' || app.pathway === pathwayFilter;
      const statusMatch = statusFilter === 'all' || app.status === statusFilter;
      const memberMatch = !memberFilter || `${app.memberFirstName} ${app.memberLastName}`.toLowerCase().includes(memberFilter.toLowerCase());

      const forms = app.forms || [];
      const hasCompletedSummary = forms.some((form: any) =>
        (form.name === 'CS Member Summary' || form.name === 'CS Summary') && form.status === 'Completed'
      );
      const hasUnacknowledgedDocs = forms.some((form: any) => {
        const isCompleted = form.status === 'Completed';
        const isSummary = form.name === 'CS Member Summary' || form.name === 'CS Summary';
        return isCompleted && !isSummary && !form.acknowledged;
      });

      const reviewMatch =
        reviewFilter === 'all' ||
        (reviewFilter === 'cs' && hasCompletedSummary && !app.applicationChecked) ||
        (reviewFilter === 'docs' && hasUnacknowledgedDocs);

      return healthPlanMatch && pathwayMatch && statusMatch && memberMatch && reviewMatch;
    });
  }, [allApplications, healthPlanFilter, pathwayFilter, statusFilter, memberFilter, reviewFilter]);
  

  const handleSelectionChange = (id: string, checked: boolean) => {
    setSelected(prev => checked ? [...prev, id] : prev.filter(item => item !== id));
  };

  const handleDelete = async () => {
    if (!firestore || selected.length === 0) return;
    
    const batch = writeBatch(firestore);
    let deletedCount = 0;
    
    selected.forEach(id => {
      const appToDelete = allApplications?.find(app => app.id === id);
      if (!appToDelete) return;

      let didQueueDelete = false;
      const isAdminSource = appToDelete.source === 'admin' || appToDelete.id.startsWith('admin_app_');

      if (appToDelete.userId) {
        const docRef = doc(firestore, `users/${appToDelete.userId}/applications`, id);
        batch.delete(docRef);
        didQueueDelete = true;
      }

      if (isAdminSource) {
        const docRef = doc(firestore, `applications`, id);
        batch.delete(docRef);
        didQueueDelete = true;
      }

      if (didQueueDelete) {
        deletedCount++;
      }
    });

    if (deletedCount === 0) {
      toast({
        variant: 'destructive',
        title: 'No Applications to Delete',
        description: 'No valid applications found for deletion.',
      });
      return;
    }

    try {
      await batch.commit();
      toast({
        title: 'Applications Deleted',
        description: `${deletedCount} application(s) have been successfully deleted.`,
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

  const handleRemoveDuplicates = async () => {
    // Prompt user for member name
    const memberName = prompt('Enter the full name of the member to remove duplicates for:');
    if (!memberName || !memberName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Member name is required to remove duplicates.',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/remove-duplicate-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberName: memberName.trim() })
      });

      const result = await response.json();
      
      if (result.success && result.duplicates) {
        if (result.duplicates.length > 1) {
          // Keep the most recent one and remove others
          const sortedDuplicates = result.duplicates.sort((a: any, b: any) => {
            const dateA = a.lastUpdated ? new Date(a.lastUpdated.seconds * 1000) : new Date(0);
            const dateB = b.lastUpdated ? new Date(b.lastUpdated.seconds * 1000) : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });
          
          const keepApp = sortedDuplicates[0];
          
          // Confirm with user before removing duplicates
          const confirmRemoval = confirm(
            `Found ${result.duplicates.length} duplicate applications for ${memberName}.\n\n` +
            `Keep: ${keepApp.id} (${keepApp.source}, last updated: ${new Date(keepApp.lastUpdated?.seconds * 1000 || 0).toLocaleDateString()})\n\n` +
            `Remove ${result.duplicates.length - 1} other applications?\n\n` +
            `This action cannot be undone.`
          );
          
          if (!confirmRemoval) {
            return;
          }
          
          const confirmResponse = await fetch('/api/admin/remove-duplicate-applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              memberName: memberName.trim(),
              keepApplicationId: keepApp.id 
            })
          });

          const confirmResult = await confirmResponse.json();
          
          if (confirmResult.success) {
            toast({
              title: 'Duplicates Removed',
              description: `Removed ${confirmResult.removed.length} duplicate applications for ${memberName}. Kept the most recent one.`,
              className: 'bg-green-100 text-green-900 border-green-200',
            });
            
            // Refresh the applications list
            fetchAllApplications();
          } else {
            throw new Error(confirmResult.error);
          }
        } else {
          toast({
            title: 'No Duplicates Found',
            description: `No duplicate applications found for ${memberName}.`,
          });
        }
      } else {
        throw new Error(result.error || 'Failed to check for duplicates');
      }
    } catch (error: any) {
      console.error('Error removing duplicates:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to remove duplicate applications',
      });
    }
  };


  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">All Applications</h1>
            <p className="text-muted-foreground">Browse and manage all applications submitted to the platform.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/admin/applications/create">
                <Plus className="mr-2 h-4 w-4" />
                Create Application
              </Link>
            </Button>
           {selected.length > 0 && isSuperAdmin && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleRemoveDuplicates}
                  variant="outline"
                  className="text-orange-600 hover:text-orange-700 border-orange-200 hover:border-orange-300"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Remove Bob Jones Duplicates
                </Button>
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
              </div>
          )}
          </div>
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
                        showInlineTracker
                      />
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
  );
}

export default function AdminApplicationsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading applications...</div>}>
      <AdminApplicationsPageContent />
    </Suspense>
  );
}
