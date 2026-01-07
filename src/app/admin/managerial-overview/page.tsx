
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup, Query, query, orderBy } from 'firebase/firestore';
import type { Application, StaffTracker, StaffMember } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, ArrowUpDown, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { errorEmitter, FirestorePermissionError } from '@/firebase';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SortKey = 'memberName' | 'assignedStaff' | 'nextStepDate';

const trackedComponents = [
  { key: 'CS Member Summary', abbreviation: 'CS' },
  { key: 'Waivers & Authorizations', abbreviation: 'Waivers' },
  { key: "LIC 602A - Physician's Report", abbreviation: '602' },
  { key: 'Medicine List', abbreviation: 'Meds' },
  { key: 'Proof of Income', abbreviation: 'POI' },
  { key: 'Declaration of Eligibility', abbreviation: 'DE' },
  { key: 'SNF Facesheet', abbreviation: 'SNF' },
];

const StatusIndicator = ({ status, formName }: { status: 'Completed' | 'Pending' | 'Not Applicable', formName: string }) => {
    const statusConfig = {
        Completed: { Icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
        Pending: { Icon: XCircle, color: 'text-orange-500', label: 'Pending' },
        'Not Applicable': { Icon: Circle, color: 'text-gray-300', label: 'Not Applicable' },
    };
    
    const { Icon, color, label } = statusConfig[status];

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <Icon className={`h-5 w-5 ${color}`} />
                </TooltipTrigger>
                <TooltipContent>
                    <p>{formName}: {label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};

const getComponentStatus = (app: Application, componentKey: string): 'Completed' | 'Pending' | 'Not Applicable' => {
    const form = app.forms?.find(f => f.name === componentKey);
    
    if (componentKey === 'Declaration of Eligibility' && app.pathway !== 'SNF Diversion') {
        return 'Not Applicable';
    }
    if (componentKey === 'SNF Facesheet' && app.pathway !== 'SNF Transition') {
        return 'Not Applicable';
    }

    if (form?.status === 'Completed') {
        return 'Completed';
    }
    
    return 'Pending';
};


export default function ManagerialOverviewPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();
  const router = useRouter();

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [staff, setStaff] = useState<Map<string, StaffMember>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'nextStepDate', direction: 'descending' });

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !isSuperAdmin) {
        if (!isAdminLoading && !isSuperAdmin) {
            router.push('/admin'); // Redirect non-super-admins
        }
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        const appsQuery = collectionGroup(firestore, 'applications');
        const trackersQuery = collectionGroup(firestore, 'staffTrackers');
        const adminRolesQuery = collection(firestore, 'roles_admin');
        const superAdminRolesQuery = collection(firestore, 'roles_super_admin');
        const usersQuery = collection(firestore, 'users');

        const [appsSnap, trackersSnap, adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
            getDocs(appsQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' })); throw e; }),
            getDocs(trackersQuery).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'staffTrackers (collection group)', operation: 'list' })); throw e; }),
            getDocs(adminRolesQuery),
            getDocs(superAdminRolesQuery),
            getDocs(usersQuery),
        ]);

        const apps = appsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Application[];
        const trackersMap = new Map(trackersSnap.docs.map(doc => [doc.data().applicationId, doc.data() as StaffTracker]));
        
        const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));
        const staffMap = new Map();
        usersSnap.docs.forEach(doc => {
            const uid = doc.id;
            if (adminIds.has(uid) || superAdminIds.has(uid)) {
                 staffMap.set(uid, { uid, ...doc.data() } as StaffMember);
            }
        });

        setApplications(apps);
        setTrackers(trackersMap);
        setStaff(staffMap);

    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, isSuperAdmin, isAdminLoading, router]);

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

  const sortedData = useMemo(() => {
    const dataWithTrackers = applications.map(app => {
        const tracker = trackers.get(app.id);
        const assignedStaffMember = tracker?.assignedStaffId ? staff.get(tracker.assignedStaffId) : null;
        return {
            ...app,
            tracker,
            assignedStaffName: assignedStaffMember ? `${assignedStaffMember.firstName} ${assignedStaffMember.lastName}` : 'Unassigned',
        }
    });

    return [...dataWithTrackers].sort((a, b) => {
        let aValue, bValue;

        if (sortConfig.key === 'memberName') {
            aValue = `${a.memberFirstName} ${a.memberLastName}`;
            bValue = `${b.memberFirstName} ${b.memberLastName}`;
        } else if (sortConfig.key === 'assignedStaff') {
            aValue = a.assignedStaffName;
            bValue = b.assignedStaffName;
        } else if (sortConfig.key === 'nextStepDate') {
            aValue = a.tracker?.nextStepDate?.toMillis() || 0;
            bValue = b.tracker?.nextStepDate?.toMillis() || 0;
        } else {
             aValue = a.tracker?.[sortConfig.key as keyof StaffTracker] || '';
             bValue = b.tracker?.[sortConfig.key as keyof StaffTracker] || '';
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });
  }, [applications, trackers, staff, sortConfig]);

  if (isLoading || isAdminLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Managerial Overview...</p>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Error: A permission error occurred while fetching data. Please ensure your account has the necessary roles.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Managerial Overview</CardTitle>
          <CardDescription>
            A sortable overview of all applications and their current next steps.
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
                     <Button variant="ghost" onClick={() => requestSort('assignedStaff')}>
                      Assigned Staff <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Next Step</TableHead>
                  <TableHead>
                     <Button variant="ghost" onClick={() => requestSort('nextStepDate')}>
                      Next Step Date <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Current Status</TableHead>
                   {trackedComponents.map(c => (
                        <TableHead key={c.key} className="text-center w-[70px] p-2">
                                <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger className="cursor-help font-mono text-xs">{c.abbreviation}</TooltipTrigger>
                                    <TooltipContent><p>{c.key}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </TableHead>
                    ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length > 0 ? sortedData.map(app => {
                    const tracker = app.tracker;
                    const assignedStaff = tracker?.assignedStaffId ? staff.get(tracker.assignedStaffId) : null;
                    return (
                        <TableRow key={app.id}>
                            <TableCell className="font-medium">{`${app.memberFirstName} ${app.memberLastName}`}</TableCell>
                            <TableCell>{assignedStaff ? `${assignedStaff.firstName} ${assignedStaff.lastName}` : 'Unassigned'}</TableCell>
                            <TableCell>{tracker?.nextStep || 'N/A'}</TableCell>
                            <TableCell>{tracker?.nextStepDate ? format(tracker.nextStepDate.toDate(), 'PPP') : 'N/A'}</TableCell>
                            <TableCell>{tracker?.status || 'N/A'}</TableCell>
                            {trackedComponents.map(c => (
                                <TableCell key={c.key} className="text-center">
                                    <StatusIndicator 
                                        status={getComponentStatus(app, c.key)}
                                        formName={c.key}
                                    />
                                </TableCell>
                            ))}
                            <TableCell className="text-right">
                                <Button asChild variant="outline" size="sm">
                                    <Link href={`/admin/applications/${app.id}?userId=${app.userId}`}>View</Link>
                                </Button>
                            </TableCell>
                        </TableRow>
                    )
                }) : (
                    <TableRow>
                        <TableCell colSpan={6 + trackedComponents.length} className="h-24 text-center">
                            No application data available.
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

    