
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

const getAssignedStaffLabel = (app: any): string => {
  const candidates = [
    app?.assignedStaffName,
    app?.assignedStaff,
    app?.assignedToName,
    app?.assignedTo,
    app?.staffName,
  ];
  const label =
    candidates
      .map((value) => String(value ?? '').trim())
      .find((value) => value.length > 0) || '';
  return label || 'Staff unassigned';
};

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
  const [staffFilter, setStaffFilter] = useState('all');
  const [intakeFilter, setIntakeFilter] = useState('all');
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

      const normalize = (value: unknown) =>
        String(value ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');

      const toMillis = (value: unknown): number => {
        try {
          if (value && typeof (value as any).toDate === 'function') {
            return (value as any).toDate().getTime();
          }
          if (value && typeof (value as any).toMillis === 'function') {
            return Number((value as any).toMillis()) || 0;
          }
          const ms = new Date(String(value || '')).getTime();
          return Number.isFinite(ms) ? ms : 0;
        } catch {
          return 0;
        }
      };

      const getPriority = (app: any) => {
        const sourceBoost = app?.source === 'admin' || String(app?.id || '').startsWith('admin_app_') ? 1 : 0;
        return sourceBoost;
      };

      const allApps = [...userApps, ...adminApps];
      const byId = new Map<string, WithId<Application & FormValues>>();
      const aliasToCanonical = new Map<string, string>();

      const pickBetter = (
        current: WithId<Application & FormValues>,
        incoming: WithId<Application & FormValues>
      ) => {
        const currentMs = toMillis((current as any)?.lastUpdated || (current as any)?.submissionDate);
        const incomingMs = toMillis((incoming as any)?.lastUpdated || (incoming as any)?.submissionDate);
        if (incomingMs !== currentMs) return incomingMs > currentMs ? incoming : current;
        const currentPriority = getPriority(current);
        const incomingPriority = getPriority(incoming);
        if (incomingPriority !== currentPriority) return incomingPriority > currentPriority ? incoming : current;
        return current;
      };

      const getAliases = (app: any): string[] => {
        const first = normalize(app?.memberFirstName);
        const last = normalize(app?.memberLastName);
        const fullName = normalize(`${first} ${last}`);
        const dob = normalize(app?.memberDob);
        const plan = normalize(app?.healthPlan);
        const pathway = normalize(app?.pathway);
        const mrn = normalize(app?.memberMrn);
        const mediCal = normalize(app?.memberMediCalNum);
        const clientId2 = normalize((app as any)?.client_ID2 || (app as any)?.clientId2);
        const aliases = new Set<string>();
        if (mrn) aliases.add(`mrn:${mrn}`);
        if (clientId2) aliases.add(`client:${clientId2}`);
        if (mediCal) aliases.add(`medi:${mediCal}`);
        if (fullName && dob) aliases.add(`name_dob:${fullName}|${dob}`);
        if (fullName && (plan || pathway)) aliases.add(`name_plan_path:${fullName}|${plan}|${pathway}`);
        if (fullName && !mrn && !clientId2 && !mediCal) aliases.add(`name:${fullName}`);
        return Array.from(aliases);
      };

      allApps.forEach((app) => {
        const aliases = getAliases(app);
        if (aliases.length === 0) {
          byId.set(app.id, pickBetter(byId.get(app.id) || app, app));
          return;
        }

        const linkedCanonicalIds = Array.from(
          new Set(
            aliases
              .map((alias) => aliasToCanonical.get(alias))
              .filter((id): id is string => Boolean(id))
          )
        );

        let canonicalId = linkedCanonicalIds[0] || app.id;
        const existingCanonical = byId.get(canonicalId);
        if (!existingCanonical) {
          byId.set(canonicalId, app);
        } else {
          byId.set(canonicalId, pickBetter(existingCanonical, app));
        }

        // If aliases pointed at multiple canonical ids, collapse them into one.
        if (linkedCanonicalIds.length > 1) {
          linkedCanonicalIds.slice(1).forEach((otherId) => {
            const currentBest = byId.get(canonicalId);
            const otherApp = byId.get(otherId);
            if (currentBest && otherApp) {
              byId.set(canonicalId, pickBetter(currentBest, otherApp));
            }
            byId.delete(otherId);
          });
        }

        aliases.forEach((alias) => aliasToCanonical.set(alias, canonicalId));
      });

      setAllApplications(Array.from(byId.values()));
      
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
    const member = String(searchParams.get('member') || '').trim();
    const staff = String(searchParams.get('staff') || '').trim();

    if (plan) {
      if (plan.includes('kaiser')) setHealthPlanFilter('Kaiser');
      if (plan.includes('health') || plan.includes('hn')) setHealthPlanFilter('Health Net');
    }

    if (review === 'cs') setReviewFilter('cs');
    if (review === 'docs') setReviewFilter('docs');
    if (member) setMemberFilter(member);
    if (staff) setStaffFilter(staff);
  }, [searchParams]);

  const staffFilterOptions = useMemo(() => {
    const unique = new Set<string>();
    allApplications.forEach((app) => {
      unique.add(getAssignedStaffLabel(app));
    });
    return Array.from(unique).sort((a, b) => {
      if (a === 'Staff unassigned') return 1;
      if (b === 'Staff unassigned') return -1;
      return a.localeCompare(b);
    });
  }, [allApplications]);

  const filteredApplications = useMemo(() => {
    return allApplications.filter(app => {
      const healthPlanMatch = healthPlanFilter === 'all' || app.healthPlan === healthPlanFilter;
      const pathwayMatch = pathwayFilter === 'all' || app.pathway === pathwayFilter;
      const statusMatch = statusFilter === 'all' || app.status === statusFilter;
      const staffMatch = staffFilter === 'all' || getAssignedStaffLabel(app) === staffFilter;
      const query = memberFilter.toLowerCase();
      const memberMatch =
        !memberFilter ||
        `${app.memberFirstName} ${app.memberLastName}`.toLowerCase().includes(query) ||
        String((app as any)?.memberMrn || '').toLowerCase().includes(query) ||
        String((app as any)?.Authorization_Number_T038 || '').toLowerCase().includes(query) ||
        String((app as any)?.Diagnostic_Code || '').toLowerCase().includes(query) ||
        String((app as any)?.id || '').toLowerCase().includes(query);
      const isAuthReceivedIntake = Boolean(
        (app as any)?.kaiserAuthReceivedViaIls ||
        String((app as any)?.intakeType || '').trim() === 'kaiser_auth_received_via_ils' ||
        String((app as any)?.status || '').trim() === 'Authorization Received (Doc Collection)'
      );
      const intakeMatch =
        intakeFilter === 'all' ||
        (intakeFilter === 'kaiser_auth_received_via_ils' && isAuthReceivedIntake) ||
        (intakeFilter === 'standard' && !isAuthReceivedIntake);

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

      return healthPlanMatch && pathwayMatch && statusMatch && staffMatch && memberMatch && intakeMatch && reviewMatch;
    });
  }, [allApplications, healthPlanFilter, pathwayFilter, statusFilter, staffFilter, intakeFilter, memberFilter, reviewFilter]);
  

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
    setStaffFilter('all');
    setIntakeFilter('all');
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
                            placeholder="Search name, MRN, auth #, diagnostic code, app ID..."
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
                              <SelectItem value="Authorization Received (Doc Collection)">Authorization Received (Doc Collection)</SelectItem>
                              <SelectItem value="Requires Revision">Requires Revision</SelectItem>
                              <SelectItem value="Approved">Approved</SelectItem>
                              <SelectItem value="Completed & Submitted">Completed & Submitted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <Select value={staffFilter} onValueChange={setStaffFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter by Staff" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Staff Assignments</SelectItem>
                              {staffFilterOptions.map((staffName) => (
                                <SelectItem key={staffName} value={staffName}>
                                  {staffName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <Select value={intakeFilter} onValueChange={setIntakeFilter}>
                            <SelectTrigger><SelectValue placeholder="Filter by Intake Type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Intake Types</SelectItem>
                              <SelectItem value="kaiser_auth_received_via_ils">Kaiser Auth Received (via ILS)</SelectItem>
                              <SelectItem value="standard">Standard Intake</SelectItem>
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
                        onRefreshRequested={fetchAllApplications}
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
