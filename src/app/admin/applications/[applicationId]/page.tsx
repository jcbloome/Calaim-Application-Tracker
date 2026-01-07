'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  File,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  Package,
  X,
  FileText,
  Lock,
  Edit,
  Mail,
  AlertTriangle,
  User,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType, StaffTracker, StaffMember } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogTitle, AlertDialogHeader, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

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


const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/admin/forms/review', editHref: '/admin/forms/edit', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, and Freedom of Choice waiver form.', type: 'online-form', href: '/admin/forms/waivers', icon: FileText },
    { id: 'proof-of-income', title: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
  ];
  
  if (pathway === 'SNF Diversion') {
    return [
      ...commonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: 'Download the form, have it signed by a PCP, and upload it here.', type: 'Upload', icon: Printer, href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  
  // SNF Transition
  return [
      ...commonRequirements,
      { id: 'snf-facesheet', title: 'SNF Facesheet', description: "Upload the resident's facesheet from the Skilled Nursing Facility.", type: 'Upload', icon: UploadCloud, href: '#' },
  ];
};

function StatusIndicator({ status }: { status: FormStatusType['status'] }) {
    const isCompleted = status === 'Completed';
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm font-medium",
        isCompleted ? 'text-green-600' : 'text-orange-500'
      )}>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <div className="h-5 w-5 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full border-2 border-current" />
          </div>
        )}
        <span>{isCompleted ? 'Completed' : 'Pending'}</span>
      </div>
    );
}

function StaffApplicationTracker({ application }: { application: Application }) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

    const trackerDocRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications/${application.id}/staffTrackers`, application.id);
    }, [firestore, application.id, application.userId]);

    const { data: tracker, isLoading: isLoadingTracker } = useDoc<StaffTracker>(trackerDocRef);

    const steps = application.healthPlan?.toLowerCase().includes('kaiser') ? kaiserSteps : healthNetSteps;

    useEffect(() => {
        const fetchStaff = async () => {
            if (!firestore) return;
            setIsLoadingStaff(true);
             try {
                const adminRolesSnap = await getDocs(collection(firestore, 'roles_admin'));
                const superAdminRolesSnap = await getDocs(collection(firestore, 'roles_super_admin'));
                const adminIds = new Set(adminRolesSnap.docs.map(d => d.id));
                const superAdminIds = new Set(superAdminRolesSnap.docs.map(d => d.id));
                const allStaffIds = Array.from(new Set([...adminIds, ...superAdminIds]));

                if (allStaffIds.length === 0) {
                    setStaffList([]);
                    return;
                }
                
                const usersSnap = await getDocs(collection(firestore, 'users'));
                const usersData = new Map(usersSnap.docs.map(d => [d.id, d.data()]));

                const staff: StaffMember[] = allStaffIds.map(id => {
                    const userData = usersData.get(id) || {};
                    const role: 'Admin' | 'Super Admin' = superAdminIds.has(id) ? 'Super Admin' : 'Admin';
                    return {
                        uid: id,
                        firstName: userData.firstName || 'Unknown',
                        lastName: userData.lastName || 'User',
                        email: userData.email || 'N/A',
                        role: role,
                    };
                }).sort((a,b) => a.lastName.localeCompare(b.lastName));
                setStaffList(staff);
            } catch (error) {
                console.error("Error fetching staff list:", error);
            } finally {
                setIsLoadingStaff(false);
            }
        };
        fetchStaff();
    }, [firestore]);


    const handleTrackerUpdate = async (field: keyof StaffTracker, value: any) => {
        if (!trackerDocRef || !user || !application.userId) return;

        const dataToUpdate: Partial<StaffTracker> = {
            [field]: value,
            lastUpdated: Timestamp.now(),
        };

        // Ensure base data exists if creating a new tracker
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
                description: "The application tracker has been updated.",
            });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not update tracker.",
            });
            console.error("Error updating tracker:", error);
        }
    };
    
    if (isLoadingTracker || isLoadingStaff) {
        return (
            <Card>
                <CardContent className="p-4 text-center">
                    <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Dialog>
            <Card>
                <DialogTrigger asChild>
                    <div className="cursor-pointer">
                        <CardHeader>
                            <CardTitle>Staff Application Tracker</CardTitle>
                            <CardDescription>Internal progress for the {application.healthPlan} pathway.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full">View/Edit Progress</Button>
                        </CardContent>
                    </div>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Staff Application Tracker</DialogTitle>
                        <DialogDescription>Internal progress for the {application.healthPlan} pathway.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="staff-assignment">Assigned Staff</Label>
                                <Select
                                    value={tracker?.assignedStaffId}
                                    onValueChange={(value) => handleTrackerUpdate('assignedStaffId', value)}
                                >
                                    <SelectTrigger id="staff-assignment">
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
                                <Label htmlFor="next-step">Next Step</Label>
                                <Select
                                    value={tracker?.nextStep}
                                    onValueChange={(value) => handleTrackerUpdate('nextStep', value)}
                                >
                                    <SelectTrigger id="next-step">
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
                                <Label htmlFor="next-step-date">Next Step Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="next-step-date"
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !tracker?.nextStepDate && "text-muted-foreground")}
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
                        <Separator />
                        <RadioGroup
                            value={tracker?.status}
                            onValueChange={(value) => handleTrackerUpdate('status', value)}
                            className="space-y-2"
                        >
                            {steps.map((step, index) => (
                                <div key={step} className="flex items-center space-x-2">
                                    <RadioGroupItem value={step} id={`step-${index}`} />
                                    <Label htmlFor={`step-${index}`}>{step}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>
                </DialogContent>
            </Card>
        </Dialog>
    );
}

function AdminActions({ application }: { application: Application }) {
    const { isAdmin, isSuperAdmin } = useAdmin();
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<Application['status'] | ''>('');
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const firestore = useFirestore();
    const docRef = useMemoFirebase(() => {
        if (!firestore || !application.userId || !application.id) return null;
        return doc(firestore, `users/${application.userId}/applications`, application.id);
    }, [firestore, application.id, application.userId]);

    if (!isAdmin && !isSuperAdmin) {
        return null;
    }
    
    const sendEmailAndUpdateStatus = async () => {
        if (!status) {
             toast({ variant: 'destructive', title: 'Error', description: 'Please select a status before sending.' });
            return;
        }

        if (status === 'Requires Revision' && !notes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Notes are required when requesting a revision.' });
            return;
        }
        
        if (!application.referrerEmail) {
            toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
            return;
        }

        setIsSending(true);

        try {
            await sendApplicationStatusEmail({
                to: application.referrerEmail,
                subject: `Update on CalAIM Application for ${application.memberFirstName} ${application.memberLastName}`,
                memberName: application.referrerName || 'there',
                staffName: "The Connections Team",
                message: notes || 'Your application status has been updated. Please log in to your dashboard for more details.',
                status: status as any, // Cast because we know it's valid
            });
            
            if (docRef) {
                 await setDoc(docRef, { status: status, lastUpdated: serverTimestamp() }, { merge: true });
            }

            toast({
                title: 'Success!',
                description: `Application status set to "${status}" and an email has been sent.`,
                className: 'bg-green-100 text-green-900',
            });
            setNotes('');
            setStatus('');

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Email Error',
                description: `Could not send email: ${error.message}`,
            });
        } finally {
            setIsSending(false);
        }
    };


    return (
        <Dialog>
            <Card>
                 <DialogTrigger asChild>
                    <div className="cursor-pointer">
                        <CardHeader>
                            <CardTitle>Admin Actions</CardTitle>
                            <CardDescription>Update status and notify the referrer.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="outline" className="w-full">Update Status</Button>
                        </CardContent>
                    </div>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Admin Actions</DialogTitle>
                        <DialogDescription>Update status and notify the referrer.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="status-select">Application Status</Label>
                            <Select value={status} onValueChange={(value) => setStatus(value as Application['status'])}>
                                <SelectTrigger id="status-select">
                                    <SelectValue placeholder="Select new status..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="In Progress">In Progress</SelectItem>
                                    <SelectItem value="Requires Revision">Requires Revision</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Completed & Submitted">Completed & Submitted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status-notes">Notes for Referrer (Optional)</Label>
                            <Textarea
                                id="status-notes"
                                placeholder="e.g., 'Congratulations! The application is approved.' or 'Please upload a clearer copy of the Proof of Income document.'"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={4}
                            />
                            <p className="text-xs text-muted-foreground">This message will be sent in the email to the referrer.</p>
                        </div>
                        <Button className="w-full" onClick={sendEmailAndUpdateStatus} disabled={isSending || !status}>
                            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                            Send Status Update
                        </Button>
                    </div>
                </DialogContent>
            </Card>
        </Dialog>
    )
}

function ApplicationDetailPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const applicationId = params.applicationId as string;
  const appUserId = searchParams.get('userId'); 
  
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const docRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !applicationId || !appUserId) return null;
    return doc(firestore, `users/${appUserId}/applications`, applicationId);
  }, [firestore, applicationId, appUserId, isUserLoading]);

  useEffect(() => {
    if (!docRef) {
      if (!isUserLoading) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setApplication({ id: docSnap.id, ...docSnap.data() } as Application);
      } else {
        setApplication(null);
        setError(new Error("Application not found or you don't have access."));
      }
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [docRef, isUserLoading]);
  
    const handleFormStatusUpdate = async (formNames: string[], newStatus: 'Completed' | 'Pending', fileName?: string | null) => {
      if (!docRef || !application) return;

      const existingForms = application.forms || [];
      const updatedForms = existingForms.map(form => {
          if (formNames.includes(form.name)) {
            const update: Partial<FormStatusType> = { status: newStatus };
             if (newStatus === 'Completed') {
                update.dateCompleted = Timestamp.now();
            }
             if (fileName !== undefined) {
                update.fileName = fileName;
            } else if (newStatus === 'Pending') {
                update.fileName = null;
            }
            return { ...form, ...update };
          }
          return form;
      });
      
      try {
          await setDoc(docRef, {
              forms: updatedForms,
              lastUpdated: serverTimestamp(),
          }, { merge: true });
      } catch (e: any) {
          console.error("Failed to update form status:", e);
      }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length) return;
    const files = Array.from(event.target.files);
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    
    // Simulate upload time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const fileNames = files.map(f => f.name).join(', ');
    await handleFormStatusUpdate([requirementTitle], 'Completed', fileNames);

    setUploading(prev => ({...prev, [requirementTitle]: false}));
    
    // Clear the input value to allow re-uploading the same file
    event.target.value = '';
  };
  
  const handleFileRemove = async (requirementTitle: string) => {
    await handleFormStatusUpdate([requirementTitle], 'Pending', null);
  };


  if (isLoading || isUserLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Details...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-full">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-full">
          <p>{applicationId ? 'Application not found.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const pathwayRequirements = getPathwayRequirements(application.pathway as 'SNF Transition' | 'SNF Diversion');
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f]));
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  const waiverFormStatus = formStatusMap.get('Waivers & Authorizations') as FormStatusType | undefined;
  const servicesDeclined = waiverFormStatus?.choice === 'decline';

  const needsUrgentAttention = application.hasLegalRep === 'no_has_rep';

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: !!waiverFormStatus?.ackHipaa },
      { id: 'liability', label: 'Liability Waiver', completed: !!waiverFormStatus?.ackLiability },
      { id: 'foc', label: 'Freedom of Choice', completed: !!waiverFormStatus?.ackFoc },
      { id: 'room-board', label: 'Room & Board Acknowledgment', completed: !!waiverFormStatus?.ackRoomAndBoard }
  ];


  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed';

    let baseQueryParams = `?applicationId=${applicationId}&userId=${appUserId}`;
    let viewHref = req.href ? `${req.href}${baseQueryParams}` : '#';
    let editHref = req.editHref ? `${req.editHref}${baseQueryParams}` : viewHref;

    if (isCompleted && req.editHref) {
      viewHref = editHref; // If completed, view and edit might be the same
    }

    const isUploading = uploading[req.title];
    const isMultiple = req.title === 'Proof of Income';

    switch (req.type) {
        case 'online-form':
             if (req.id === 'waivers') {
                return (
                    <div className="space-y-3">
                        <div className="space-y-2 rounded-md border p-3">
                            {waiverSubTasks.map(task => (
                                <div key={task.id} className="flex items-center space-x-2">
                                    <Checkbox id={`waiver-${task.id}`} checked={task.completed} disabled />
                                    <label htmlFor={`waiver-${task.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {task.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                        <Button asChild variant="secondary" className="w-full">
                          <Link href={viewHref}>View/Edit Waivers</Link>
                      </Button>
                    </div>
                );
            }
            return (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100 flex-1">
                        <Link href={viewHref}>View</Link>
                    </Button>
                    {req.editHref && (
                      <Button asChild variant="secondary" className="flex-1">
                          <Link href={editHref}>Edit</Link>
                      </Button>
                    )}
                </div>
            );
        case 'Upload':
             if (formInfo?.status === 'Completed') {
                 return (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        <span className="truncate flex-1 text-green-800 font-medium">{formInfo?.fileName || 'Completed'}</span>
                         <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleFileRemove(req.title)}>
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove file</span>
                        </Button>
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    {req.href && req.href !== '#' && (
                        <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                           <Link href={req.href} target="_blank">
                               <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                           </Link>
                       </Button>
                    )}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", isUploading && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? 'Uploading...' : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading} multiple={isMultiple} />
                </div>
            );
        default:
            return null;
    }
};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
         {servicesDeclined && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Services Declined</AlertTitle>
                <AlertDescription>
                    The member or their representative has declined Community Support services in the Freedom of Choice waiver. Immediate follow-up may be required.
                </AlertDescription>
            </Alert>
        )}
        {needsUrgentAttention && (
             <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Urgent Attention Required</AlertTitle>
                <AlertDescription>
                    The member has been identified as not having the capacity to make their own decisions, and no legal representative has been assigned. This requires immediate administrative review.
                </AlertDescription>
            </Alert>
        )}
        <Card className="shadow-sm">
            <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                Application for {application.memberFirstName} {application.memberLastName}
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardDescription>
                Submitted by {application.referrerName || user?.displayName} | {application.pathway} ({application.healthPlan})
                </CardDescription>
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="truncate"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                <div><strong>Status:</strong> <span className="font-semibold">{application.status}</span></div>
            </div>
            <div>
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span className="font-medium">User-Submitted Documents</span>
                    <span>{completedCount} of {totalCount} required items completed</span>
                </div>
                <Progress value={progress} className="h-2" />
            </div>
            </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pathwayRequirements.map((req) => {
                const formInfo = formStatusMap.get(req.title);
                const status = formInfo?.status || 'Pending';
                
                return (
                    <Card key={req.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-lg">{req.title}</CardTitle>
                                <req.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                            </div>
                            <CardDescription>{req.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-grow justify-end gap-4">
                            <StatusIndicator status={status} />
                            {getFormAction(req)}
                        </CardContent>
                    </Card>
                )
            })}
        </div>
      </div>

      <aside className="lg:col-span-1 space-y-6">
        <StaffApplicationTracker application={application} />
        <AdminActions application={application} />
      </aside>
    </div>
  );
}

export default function AdminApplicationDetailPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application...</p>
        </div>
    }>
      <ApplicationDetailPageContent />
    </Suspense>
  );
}

    