
'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { collection, Timestamp, getDocs, collectionGroup, Query, query, orderBy, setDoc, doc } from 'firebase/firestore';
import type { Application, StaffTracker, StaffMember } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Loader2, User, Calendar as CalendarIcon, Package, ChevronsUpDown, Filter, ArrowUpDown, Circle, AlertCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const healthNetSteps = [
  "Application Being Reviewed",
  "Scheduling ISP",
  "ISP Completed",
  "Locating RCFEs",
  "Submitted to Health Net",
  "Authorization Status"
];

const kaiserSteps = [
  "Pre-T2038, Compiling Docs",
  "T2038 Requested",
  "T2038 Received",
  "T2038 received, Need First Contact",
  "T2038 received, doc collection",
  "Needs RN Visit",
  "RN/MSW Scheduled",
  "RN Visit Complete",
  "Need Tier Level",
  "Tier Level Requested",
  "Tier Level Received",
  "Locating RCFEs",
  "Found RCFE",
  "R&B Requested",
  "R&B Signed",
  "RCFE/ILS for Invoicing",
  "ILS Contracted (Complete)",
  "Confirm ILS Contracted",
  "Non-active",
  "Complete",
  "Tier Level Revision Request",
  "On-Hold",
  "Tier Level Appeal",
  "T2038 email but need auth sheet",
];


function StaffApplicationTrackerDialog({ application, initialTracker, staffList, onUpdate }: { application: Application, initialTracker?: StaffTracker, staffList: StaffMember[], onUpdate: () => void }) {
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
            onUpdate();
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
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>Progress for {application.memberFirstName} {application.memberLastName}</DialogTitle>
                <DialogDescription>
                    Update the internal tracking status for this application.
                </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto px-2">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor={`staff-assignment-${application.id}`} className="text-sm">Assigned Staff</Label>
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
                        <Label htmlFor={`next-step-${application.id}`} className="text-sm">Next Step</Label>
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
                        <Label htmlFor={`next-step-date-${application.id}`} className="text-sm">Next Step Date</Label>
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

                    <div className="flex items-center space-x-2 pt-4">
                        <Switch
                            id={`priority-switch-${application.id}`}
                            checked={tracker?.isPriority}
                            onCheckedChange={(checked) => handleTrackerUpdate('isPriority', checked)}
                        />
                        <Label htmlFor={`priority-switch-${application.id}`} className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-400"/>
                            Mark as Priority Task
                        </Label>
                    </div>
                </div>
                
                 <RadioGroup
                    value={tracker?.status}
                    onValueChange={(value) => handleTrackerUpdate('status', value)}
                    className="space-y-2 pt-6 border-t md:border-t-0 md:pt-0 md:pl-6 md:border-l"
                >
                    <Label className="text-sm">Current Status</Label>
                    {steps.map((step, index) => (
                        <div key={step} className="flex items-center space-x-2">
                             <RadioGroupItem value={step} id={`step-${application.id}-${index}`} />
                             <Label htmlFor={`step-${application.id}-${index}`} className="text-sm font-normal">{step}</Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>
        </DialogContent>
    );
}

type CombinedData = Application & {
    tracker?: StaffTracker;
    assignedStaff?: StaffMember;
};
type SortKey = 'memberName' | 'assignedStaff' | 'status' | 'nextStep' | 'nextStepDate' | 'taskStatus';

type TaskStatus = 'Overdue' | 'Due Soon' | 'On Track' | 'No Action';

const getTaskStatus = (tracker?: StaffTracker): TaskStatus => {
    if (!tracker?.nextStepDate) return 'No Action';
    const dueDate = tracker.nextStepDate.toDate();
    if (isPast(dueDate) && !isToday(dueDate)) return 'Overdue';
    if (differenceInDays(dueDate, new Date()) <= 7) return 'Due Soon';
    return 'On Track';
};

const TaskStatusBadge = ({ status }: { status: TaskStatus }) => {
    const variants: Record<TaskStatus, string> = {
        'Overdue': 'bg-red-100 text-red-800 border-red-200',
        'Due Soon': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'On Track': 'bg-blue-100 text-blue-800 border-blue-200',
        'No Action': 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return <Badge variant="outline" className={cn('gap-1.5 pl-1.5', variants[status])}><Circle className="h-2 w-2 -translate-x-1" fill="currentColor" /> {status}</Badge>;
}

export default function ManagerialOverviewPage() {
  const firestore = useFirestore();
  const { isSuperAdmin, isLoading: isAdminLoading } = useAdmin();

  const [applications, setApplications] = useState<Application[]>([]);
  const [trackers, setTrackers] = useState<Map<string, StaffTracker>>(new Map());
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [memberFilter, setMemberFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'taskStatus', direction: 'ascending' });
  const [currentDialogItem, setCurrentDialogItem] = useState<CombinedData | null>(null);

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
            const role: 'Admin' | 'Super Admin' = superAdminIds.has(id) ? 'Super Admin' : 'Admin';
            return {
                uid: id,
                firstName: userData.firstName || 'Unknown',
                lastName: userData.lastName || 'User',
                email: userData.email || 'N/A',
                role,
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

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getApplicationStatus = (application: Application): 'Open' | 'Closed' => {
      if (application.status === 'Completed & Submitted' || application.status === 'Approved') {
          return 'Closed';
      }
      return 'Open';
  };
  
  const staffMap = useMemo(() => new Map(staffList.map(s => [s.uid, s])), [staffList]);

  const staffStats = useMemo(() => {
      if (staffList.length === 0 || applications.length === 0) return [];
      
      const appMap = new Map(applications.map(app => [app.id, app]));

      return staffList.map(staff => {
          let openCount = 0;
          let overdueCount = 0;
          let dueTodayCount = 0;

          for (const tracker of trackers.values()) {
              if (tracker.assignedStaffId === staff.uid) {
                  const app = appMap.get(tracker.applicationId);
                  if (app && getApplicationStatus(app) === 'Open') {
                      openCount++;
                      if (tracker.nextStepDate) {
                        const dueDate = tracker.nextStepDate.toDate();
                        if (isPast(dueDate) && !isToday(dueDate)) {
                            overdueCount++;
                        } else if (isToday(dueDate)) {
                            dueTodayCount++;
                        }
                      }
                  }
              }
          }
          return { ...staff, openCount, overdueCount, dueTodayCount };
      });
  }, [staffList, applications, trackers]);

  const priorityTasks = useMemo(() => {
      return Array.from(trackers.values())
        .filter(tracker => tracker.isPriority && getApplicationStatus(applications.find(a => a.id === tracker.applicationId)!) === 'Open')
        .map(tracker => {
            const application = applications.find(a => a.id === tracker.applicationId);
            const assignedStaff = tracker.assignedStaffId ? staffMap.get(tracker.assignedStaffId) : null;
            return { ...application, tracker, assignedStaff };
        }) as CombinedData[];
  }, [trackers, applications, staffMap]);
  
  const sortedAndFilteredData: CombinedData[] = useMemo(() => {
      let combined = applications.map(app => {
          const tracker = trackers.get(app.id);
          const assignedStaff = tracker?.assignedStaffId ? staffMap.get(tracker.assignedStaffId) : undefined;
          return { ...app, tracker, assignedStaff };
      });

      if (memberFilter) {
          combined = combined.filter(item => 
              `${item.memberFirstName} ${item.memberLastName}`.toLowerCase().includes(memberFilter.toLowerCase())
          );
      }

      if (staffFilter !== 'all') {
          combined = combined.filter(item => item.tracker?.assignedStaffId === staffFilter);
      }
      
      const statusOrder: Record<TaskStatus, number> = { 'Overdue': 1, 'Due Soon': 2, 'On Track': 3, 'No Action': 4 };

      return [...combined].sort((a, b) => {
          let aValue: any = '';
          let bValue: any = '';

          switch (sortConfig.key) {
              case 'memberName':
                  aValue = `${a.memberFirstName} ${a.memberLastName}`;
                  bValue = `${b.memberFirstName} ${b.memberLastName}`;
                  break;
              case 'assignedStaff':
                  aValue = a.assignedStaff ? `${a.assignedStaff.firstName} ${a.assignedStaff.lastName}` : 'Z'; // Unassigned at the end
                  bValue = b.assignedStaff ? `${b.assignedStaff.firstName} ${b.assignedStaff.lastName}` : 'Z';
                  break;
              case 'nextStepDate':
                  aValue = a.tracker?.nextStepDate?.toMillis() || 0;
                  bValue = b.tracker?.nextStepDate?.toMillis() || 0;
                  break;
              case 'taskStatus':
                  aValue = statusOrder[getTaskStatus(a.tracker)];
                  bValue = statusOrder[getTaskStatus(b.tracker)];
                  break;
              default:
                  aValue = a.tracker?.[sortConfig.key] || '';
                  bValue = b.tracker?.[sortConfig.key] || '';
          }

          if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
      });

  }, [applications, trackers, staffMap, memberFilter, staffFilter, sortConfig]);

  const kaiserPipelineStats = useMemo(() => {
    const kaiserApps = applications.filter(app => app.healthPlan === 'Kaiser');
    const pipelineCounts = new Map<string, number>();

    kaiserSteps.forEach(step => pipelineCounts.set(step, 0));

    kaiserApps.forEach(app => {
        const tracker = trackers.get(app.id);
        if (tracker?.status) {
            pipelineCounts.set(tracker.status, (pipelineCounts.get(tracker.status) || 0) + 1);
        }
    });
    
    return Array.from(pipelineCounts.entries())
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0);

  }, [applications, trackers]);

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
    <Dialog onOpenChange={(open) => !open && setCurrentDialogItem(null)}>
        <div className="space-y-6">
        <Card>
            <CardHeader>
            <CardTitle>Managerial Overview</CardTitle>
            <CardDescription>
                A high-level overview of your team's workload and a detailed, filterable table of all applications.
            </CardDescription>
            </CardHeader>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 border-t-4 border-blue-500">
                <CardHeader>
                    <CardTitle className="text-lg">Staff Workload Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {staffStats.length > 0 ? staffStats.map((staff, index) => (
                        <React.Fragment key={staff.uid}>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <Link href={`/admin/my-tasks?userId=${staff.uid}&name=${staff.firstName}%20${staff.lastName}`} className="font-semibold hover:underline">
                                {staff.firstName} {staff.lastName}
                            </Link>
                            <div className="flex items-center gap-4 text-sm">
                                <div>
                                    <span className="font-bold text-lg">{staff.openCount}</span>
                                    <span className="text-muted-foreground"> Open</span>
                                </div>
                                {staff.overdueCount > 0 && (
                                    <div className="flex items-center gap-1.5 text-destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <span className="font-semibold">{staff.overdueCount} Overdue</span>
                                    </div>
                                )}
                                    {staff.dueTodayCount > 0 && (
                                    <div className="flex items-center gap-1.5 text-yellow-600">
                                        <CalendarIcon className="h-4 w-4" />
                                        <span className="font-semibold">{staff.dueTodayCount} Due Today</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        {index < staffStats.length - 1 && <Separator />}
                        </React.Fragment>
                    )) : <p className="text-sm text-muted-foreground text-center">No staff found.</p>}
                </CardContent>
            </Card>

            <Card className="border-t-4 border-yellow-500">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Star className="h-5 w-5 text-yellow-400" />
                        Today's Priorities
                    </CardTitle>
                    <CardDescription>{format(new Date(), 'eeee, MMMM do')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {priorityTasks.length > 0 ? (
                         <div className="space-y-3">
                            {priorityTasks.map(task => (
                                <div key={task.id} className="flex items-center justify-between p-2 rounded-md border bg-background">
                                    <div>
                                        <p className="font-medium text-sm">{task.memberFirstName} {task.memberLastName}</p>
                                        <p className="text-xs text-muted-foreground">Assigned to: {task.assignedStaff?.firstName || 'N/A'}</p>
                                    </div>
                                    <Button asChild variant="secondary" size="sm">
                                        <Link href={`/admin/applications/${task.id}?userId=${task.userId}`}>View</Link>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No priority tasks for today.</p>
                    )}
                </CardContent>
            </Card>
            
            <Card className="border-t-4 border-red-500">
                <CardHeader>
                    <CardTitle className="text-lg">Kaiser Pipeline Status</CardTitle>
                    <CardDescription>Member count at each stage.</CardDescription>
                </CardHeader>
                <CardContent>
                    {kaiserPipelineStats.length > 0 ? (
                        <div className="space-y-2">
                        {kaiserPipelineStats.map(item => (
                             <div key={item.name} className="flex items-center justify-between text-sm p-1">
                                <span className="text-muted-foreground">{item.name}</span>
                                <span className="font-semibold">{item.value}</span>
                            </div>
                        ))}
                        </div>
                    ) : (
                         <p className="text-sm text-muted-foreground text-center py-4">No members in the Kaiser pipeline.</p>
                    )}
                </CardContent>
            </Card>

        </div>

        <Card>
            <CardHeader>
                 <CardTitle>All Application Tasks</CardTitle>
            </CardHeader>
             <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="member-filter">Filter by Member</Label>
                        <Input 
                            id="member-filter"
                            placeholder="Type member name..."
                            value={memberFilter}
                            onChange={(e) => setMemberFilter(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 space-y-2">
                        <Label htmlFor="staff-filter">Filter by Staff</Label>
                        <Select
                          value={staffFilter}
                          onValueChange={(value) => setStaffFilter(value)}
                        >
                            <SelectTrigger id="staff-filter">
                                <SelectValue placeholder="All Staff" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Staff</SelectItem>
                                {staffList.map(staff => (
                                    <SelectItem key={staff.uid} value={staff.uid}>
                                        {staff.firstName} {staff.lastName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('memberName')}>Member <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('assignedStaff')}>Assigned To <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('taskStatus')}>Task Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('nextStep')}>Next Step <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('nextStepDate')}>Due Date <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Progress Status<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedAndFilteredData.length > 0 ? sortedAndFilteredData.map(item => {
                                const taskStatus = getTaskStatus(item.tracker);
                                return (
                                <TableRow key={item.id} className={cn(item.tracker?.isPriority && 'bg-yellow-50')}>
                                    <TableCell className="font-medium flex items-center gap-2">
                                        {item.tracker?.isPriority && <Star className="h-4 w-4 text-yellow-400" />}
                                        {item.memberFirstName} {item.memberLastName}
                                    </TableCell>
                                    <TableCell>{item.assignedStaff ? `${item.assignedStaff.firstName} ${item.assignedStaff.lastName}` : <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                                    <TableCell><TaskStatusBadge status={taskStatus} /></TableCell>
                                    <TableCell>{item.tracker?.nextStep || 'N/A'}</TableCell>
                                    <TableCell>{item.tracker?.nextStepDate ? format(item.tracker.nextStepDate.toDate(), 'PPP') : 'N/A'}</TableCell>
                                    <TableCell>{item.tracker?.status || 'N/A'}</TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" onClick={() => setCurrentDialogItem(item)}>View Progress</Button>
                                        </DialogTrigger>
                                        <Button asChild variant="secondary" size="sm"><Link href={`/admin/applications/${item.id}?userId=${item.userId}`}>Details</Link></Button>
                                    </TableCell>
                                </TableRow>
                                )}) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No applications match the current filters.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
        </div>
        {currentDialogItem && (
            <StaffApplicationTrackerDialog 
                application={currentDialogItem}
                initialTracker={currentDialogItem.tracker}
                staffList={staffList}
                onUpdate={fetchData}
            />
        )}
    </Dialog>
  );
}

    
