
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore } from '@/firebase';
import { collection, onSnapshot, Unsubscribe, Timestamp } from 'firebase/firestore';
import type { Application } from '@/lib/definitions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Circle, Filter } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAdmin } from '@/hooks/use-admin';
import { errorEmitter, FirestorePermissionError } from '@/firebase';


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
    
    // SNF Diversion specific form
    if (componentKey === 'Declaration of Eligibility' && app.pathway !== 'SNF Diversion') {
        return 'Not Applicable';
    }
    // SNF Transition specific form
    if (componentKey === 'SNF Facesheet' && app.pathway !== 'SNF Transition') {
        return 'Not Applicable';
    }

    if (form?.status === 'Completed') {
        return 'Completed';
    }
    
    return 'Pending';
};


export default function ProgressTrackerPage() {
  const firestore = useFirestore();
  const { isAdmin, isLoading: isAdminLoading } = useAdmin();
  const [filters, setFilters] = useState<string[]>([]);

  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isAdminLoading || !firestore || !isAdmin) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    const usersRef = collection(firestore, 'users');
    let applicationListeners: Unsubscribe[] = [];

    const usersListener = onSnapshot(usersRef, 
      (usersSnapshot) => {
        applicationListeners.forEach(unsub => unsub());
        applicationListeners = [];

        let allApps: Application[] = [];
        let pendingUserCollections = usersSnapshot.docs.length;
        
        if (pendingUserCollections === 0) {
          setApplications([]);
          setIsLoading(false);
          return;
        }

        const appUpdateCallback = () => {
            setApplications([...allApps]); // Create a new array reference
            // Only stop loading when all have been processed at least once
            if (pendingUserCollections === 0) {
                setIsLoading(false);
            }
        };
        
        usersSnapshot.docs.forEach((userDoc) => {
          const appsRef = collection(firestore, `users/${userDoc.id}/applications`);
          const appsListener = onSnapshot(appsRef,
            (appsSnapshot) => {
              appsSnapshot.docChanges().forEach((change) => {
                const appData = { id: change.doc.id, ...change.doc.data() } as Application;
                const index = allApps.findIndex(a => a.id === appData.id);

                if (change.type === "removed") {
                    if (index > -1) allApps.splice(index, 1);
                } else { // 'added' or 'modified'
                    if (index > -1) {
                      allApps[index] = appData;
                    } else {
                      allApps.push(appData);
                    }
                }
              });

              if(pendingUserCollections > 0) pendingUserCollections--;
              appUpdateCallback();
            },
            (err) => {
                const permissionError = new FirestorePermissionError({ path: `users/${userDoc.id}/applications`, operation: 'list' });
                setError(permissionError); // Set local error for UI
                errorEmitter.emit('permission-error', permissionError); // Emit global error
                if(pendingUserCollections > 0) pendingUserCollections--;
                if(pendingUserCollections === 0) setIsLoading(false);
            }
          );
          applicationListeners.push(appsListener);
        });
      },
      (err) => {
        const permissionError = new FirestorePermissionError({ path: 'users', operation: 'list' });
        setError(permissionError); // Set local error for UI
        errorEmitter.emit('permission-error', permissionError); // Emit global error
        setIsLoading(false);
      }
    );
    
    return () => {
      usersListener();
      applicationListeners.forEach(unsub => unsub());
    };

  }, [firestore, isAdmin, isAdminLoading]);
  
  const handleFilterChange = (componentKey: string, checked: boolean) => {
    setFilters(prev => 
        checked ? [...prev, componentKey] : prev.filter(key => key !== componentKey)
    );
  }

  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    
    const sorted = [...applications].sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
    });

    if (filters.length === 0) {
        return sorted;
    }

    return sorted.filter(app => {
        // Show app if it is missing ALL of the selected components
        return filters.every(filterKey => getComponentStatus(app, filterKey) === 'Pending');
    });

  }, [applications, filters])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Application Progress Tracker</CardTitle>
          <CardDescription>
            A detailed grid showing the status of each required component for all applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Card className="mb-6 bg-muted/50">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Filter by Missing Components
                    </CardTitle>
                    <CardDescription>Select one or more components to find applications that are missing all of the selected documents.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {trackedComponents.map(c => (
                            <div key={c.key} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={`filter-${c.key}`} 
                                    onCheckedChange={(checked) => handleFilterChange(c.key, !!checked)}
                                    checked={filters.includes(c.key)}
                                />
                                <Label htmlFor={`filter-${c.key}`} className="text-sm font-normal cursor-pointer">
                                    {c.abbreviation} - <span className="text-muted-foreground">{c.key.split(' ')[0]}</span>
                                </Label>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="p-4 border rounded-lg bg-muted/50 mb-6">
                 <h3 className="font-semibold text-sm">Legend</h3>
                 <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {trackedComponents.map(c => (
                        <span key={c.key}><strong className="font-mono">{c.abbreviation}:</strong> {c.key}</span>
                    ))}
                </div>
            </div>

          {error && <p className="text-destructive">Error: A permission error occurred while fetching data.</p>}
          {isLoading || isAdminLoading ? (
             <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading application data...</p>
            </div>
          ) : (
             <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[250px] font-semibold">Member</TableHead>
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
                        {filteredApplications.length > 0 ? filteredApplications.map(app => (
                            <TableRow key={app.id}>
                                <TableCell>
                                    <div className="font-medium">{`${app.memberFirstName} ${app.memberLastName}`}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {app.healthPlan} / {app.pathway}
                                    </div>
                                </TableCell>
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
                        )) : (
                             <TableRow>
                                <TableCell colSpan={trackedComponents.length + 2} className="h-24 text-center">
                                    No applications match the current filter.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
