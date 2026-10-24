'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType, StaffTracker, StaffMember } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { healthNetSteps, kaiserSteps } from './application-status-config';

export function StatusIndicator({ status }: { status: FormStatusType['status'] | 'Not Applicable' }) {
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

export const quickStatusItems = [
  { key: 'CS Member Summary', label: 'CS' },
  { key: 'Waivers & Authorizations', label: 'Waivers' },
  { key: "LIC 602A - Physician's Report", label: '602' },
  { key: 'Medicine List', label: 'Meds' },
  { key: 'Proof of Income', label: 'POI' },
  { key: 'Declaration of Eligibility', label: 'DE' },
  { key: 'SNF Facesheet', label: 'SNF' },
  { key: 'Eligibility Check', label: 'Elig' },
  { key: 'Sent to Caspio', label: 'Caspio' },
  { key: 'ALFT Status', label: 'ALFT' },
  { key: 'Room and Board/Tier Level Agreement', label: 'R&B/Tier' },
];

export function StaffApplicationTracker({ application }: { application: Application }) {
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
        // Set staff list based on health plan
        const getStaffByHealthPlan = () => {
            setIsLoadingStaff(true);
            
            let staff: StaffMember[] = [];
            
            if (application.healthPlan === 'Kaiser') {
                staff = [
                    { uid: 'jesse', firstName: 'Jesse', lastName: '', email: 'jesse@example.com', role: 'Admin' },
                    { uid: 'nick', firstName: 'Nick', lastName: '', email: 'nick@example.com', role: 'Admin' },
                    { uid: 'john', firstName: 'John', lastName: '', email: 'john@example.com', role: 'Admin' },
                ];
            } else if (application.healthPlan === 'Health Net') {
                staff = [
                    { uid: 'monica', firstName: 'Monica', lastName: '', email: 'monica@example.com', role: 'Admin' },
                    { uid: 'leidy', firstName: 'Leidy', lastName: '', email: 'leidy@example.com', role: 'Admin' },
                    { uid: 'letitia', firstName: 'Letitia', lastName: '', email: 'letitia@example.com', role: 'Admin' },
                ];
            }
            
            setStaffList(staff);
            setIsLoadingStaff(false);
        };

        getStaffByHealthPlan();
    }, [application.healthPlan]);


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
                 <CardHeader>
                    <CardTitle>Staff Application Tracker</CardTitle>
                    <CardDescription>Internal progress for the {application.healthPlan} pathway.</CardDescription>
                </CardHeader>
                <CardContent>
                     <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">View/Edit Progress</Button>
                    </DialogTrigger>
                </CardContent>
            </Card>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
                            <div key={`${step}-${index}`} className="flex items-center space-x-2">
                                <RadioGroupItem value={step} id={`step-${index}`} />
                                <Label htmlFor={`step-${index}`}>{step}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>
            </DialogContent>
        </Dialog>
    );
}
