
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, useAdmin, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, Timestamp, getDocs, collectionGroup, Query, query, orderBy, setDoc, doc } from 'firebase/firestore';
import type { Application, StaffTracker, StaffMember } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, User, Calendar as CalendarIcon, Package, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const healthNetSteps = [
  "Application Being Reviewed",
  "Scheduling ISP",
  "ISP Completed",
  "Locating RCFEs",
  "Submitted to Health Net",
  "Authorization Status"
];

const kaiserSteps = [
  "Initial Authorization Received or Authorization Requested",
  "Collecting Documents",
  "RN Visit Scheduled",
  "RN Visit Completed",
  "Tiered Level Request to Kaiser",
  "Tier Level Received",
  "Locating RCFEs",
  "RCFE Selected",
  "RCFE Sent to ILS for Contracting/Member Move-In"
];


function StaffApplicationTracker({ application, initialTracker, staffList, onUpdate }: { application: Application, initialTracker?: StaffTracker, staffList: StaffMember[], onUpdate: () => void }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [tracker, setTracker] = useState<StaffTracker | undefined>(initialTracker);
    
    useEffect(() => {
        setTracker(initialTracker);
    }, [initialTracker]);

    const steps = application.healthPlan?.toLowerCase().includes('kaiser') ? kaiserSteps : healthNetSteps;

    const handleTrackerUpdate = async (field: keyof StaffTracker, value: any) => {
        if (!firestore || !application.userId || !application.id) return;

        const trackerDocRef = doc(firestore, `users/${application.userId}/applications/${application.id}/staffTrackers`, application.id);
        
        const dataToUpdate: Partial<StaffTracker> = {
            [field]: value,
            lastUpdated: Timestamp.now(),
        };

        if (!tracker) {
            dataToUpdate.id = application.id;
            dataToUpdate.applicationId = application.id;
            dataToUpdate.userId = application.userId;
            dataToUpdate.healthPlan = application.healthPlan as any;
        }
        
        try {
            await setDoc(trackerDocRef, dataToUpdate, { merge: true });
            toast({
                title: "Tracker Updated",
                description: `Progress for ${application.memberFirstName} ${application.memberLastName} has been saved.`,
            });
            onUpdate(); // Trigger refetch in parent
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not update tracker.",
            });
            console.error("Error updating tracker:", error);
        }
    };
    
    return (
        <Card className="bg-muted/30">
            <CardHeader className="p-4">
                <CardTitle className="text-base">Internal Progress Tracker</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={`staff-assignment-${application.id}`} className="text-xs">Assigned Staff</Label>
                        <Select
                            value={tracker?.assignedStaffId}
                            onValueChange={(value) => handleTrackerUpdate('assignedStaffId', value)}
                        >
                            <SelectTrigger id={`staff-assignment-${application.id}`}>
                                <SelectValue placeholder="Assign a staff member..." />
                            </SelectTrigger>
                            <SelectContent>
                                {staffList.map(staff => (
                                    <SelectItem key={staff.uid} value={staff.uid}>
                                        {staff.firstName} {staff.lastName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`next-step-${application.id}`} className="text-xs">Next Step</Label>
                         <Select
                            value={tracker?.nextStep}
                            onValueChange={(value) => handleTrackerUpdate('nextStep', value)}
                        >
                            <SelectTrigger id={`next-step-${application.id}`}>
                                <SelectValue placeholder="Select next step..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="contact-referrer">Contact Referrer</SelectItem>
                                <SelectItem value="review-documents">Review Documents</SelectItem>
                                <SelectItem value="schedule-isp">Schedule ISP</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor={`next-step-date-${application.id}`} className="text-xs">Next Step Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id={`next-step-date-${application.id}`}
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal bg-background", !tracker?.nextStepDate && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {tracker?.nextStepDate ? format(tracker.nextStepDate.toDate(), "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={tracker?.nextStepDate?.toDate()}
                                    onSelect={(date) => handleTrackerUpdate('nextStepDate', date ? Timestamp.fromDate(date) : null)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
                
                <RadioGroup
                    value={tracker?.status}
                    onValueChange={(value) => handleTrackerUpdate('status', value)}
                    className="space-y-2 pt-4 border-t"
                >
                    <Label className="text-xs">Current Status</Label>
                    {steps.map((step, index) => (
                        <div key={step} className="flex items-center space-x-2">
                             <RadioGroupItem value={step} id={`step-${application.id}-${index}`} />
                             <Label htmlFor={`step-${application.id}-${index}`} className="text-sm font-normal">{step}</Label>
                        </div>
                    ))}
                </RadioGroup>
            </CardContent>
        </Card>
    );
}

export default function ManagerialOverviewPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const sortedApplications = useMemo(() => {
    return [...applications].sort((a, b) => {
        const timeA = a.lastUpdated ? (a.lastUpdated as Timestamp).toMillis() : 0;
        const timeB = b.lastUpdated ? (b.lastUpdated as Timestamp).toMillis() : 0;
        return timeB - timeA;
    });
  }, [applications]);

  const fetchData = useCallback(async () => {
    if (isAdminLoading || !firestore || !isSuperAdmin) {
        if (!isAdminLoading) setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    try {
        const [appsSnap, trackersSnap, adminRolesSnap, superAdminRolesSnap, usersSnap] = await Promise.all([
            getDocs(collectionGroup(firestore, 'applications')).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'applications (collection group)', operation: 'list' })); throw e; }),
            getDocs(collectionGroup(firestore, 'staffTrackers')).catch(e => { errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'staffTrackers (collection group)', operation: 'list' })); throw e; }),
            getDocs(collection(firestore, 'roles_admin')),
            getDocs(collection(firestore, 'roles_super_admin')),
            getDocs(collection(firestore, 'users')),
        ]);

        const apps = appsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Application[];
        const trackersMap = new Map(trackersSnap.docs.map(doc => [doc.data().applicationId, doc.data() as StaffTracker]));
        
        const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
        const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));
        const allStaffIds = Array.from(new Set([...adminIds, ...superAdminIds]));

        const usersData = new Map(usersSnap.docs.map(d => [d.id, d.data()]));
        const staffResult: StaffMember[] = allStaffIds.map(id => {
            const userData = usersData.get(id) || {};
            return {
                uid: id,
                firstName: userData.firstName || 'Unknown',
                lastName: userData.lastName || 'User',
                email: userData.email || 'N/A',
                role: superAdminIds.has(id) ? 'Super Admin' : 'Admin',
            };
        }).sort((a,b) => a.lastName.localeCompare(b.lastName));

        setApplications(apps);
        setTrackers(trackersMap);
        setStaffList(staffResult);

    } catch (err: any) {
        setError(err);
    } finally {
        setIsLoading(false);
    }
  }, [firestore, isSuperAdmin, isAdminLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


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
            An overview of all applications and their internal progress. Click on an application to expand its tracker.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {sortedApplications.length > 0 ? sortedApplications.map(app => (
            <Collapsible key={app.id} asChild>
                 <Card>
                    <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 rounded-lg">
                           <div className="flex-1">
                             <p className="font-semibold">{app.memberFirstName} {app.memberLastName}</p>
                             <p className="text-sm text-muted-foreground">{app.healthPlan} / {app.pathway}</p>
                           </div>
                           <Button variant="ghost" size="sm" className="w-9 p-0">
                                <ChevronsUpDown className="h-4 w-4" />
                                <span className="sr-only">Toggle</span>
                            </Button>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="p-4 border-t">
                            <StaffApplicationTracker 
                                application={app}
                                initialTracker={trackers.get(app.id)}
                                staffList={staffList}
                                onUpdate={fetchData}
                            />
                        </div>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        )) : (
            <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                    No applications found.
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
    

    