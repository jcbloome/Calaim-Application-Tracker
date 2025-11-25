
'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, FileWarning, PenSquare, ArrowLeft, Trash2, Loader2, User, Clock, Check, Circle, Lock } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Application, FormStatus, Activity } from '@/lib/definitions';
import { applications as mockApplications, activities as mockActivities } from '@/lib/data';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FormViewer } from './FormViewer';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sendRevisionRequestEmail } from '@/app/actions/send-email';
import { Input } from '@/components/ui/input';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';
import { cn } from '@/lib/utils';


// This is a temporary solution for the demo to find the mock application data
// In a real app, you would fetch this from a central 'applications' collection or use a backend search function.
const getMockApplicationById = (id: string): (Application & { [key: string]: any }) | undefined => {
  const app = mockApplications.find(app => app.id === id);
  if (app) {
      // For the demo, let's just create a more complete object.
      // In a real app this data would come from firestore.
      return { 
        ...app,
        ApplicationID: app.id,
        MemberFullName: app.memberName,
        MemberFirstName: app.memberName?.split(' ')[0] || '',
        MemberLastName: app.memberName?.split(' ')[1] || '',
        MemberDateOfBirth: new Date(1980, 1, 1),
        MemberAge: 44,
        MemberMediCalNumber: '91234567A',
        MemberMedicalRecordNumber: 'MRN12345',
        MemberPreferredLanguage: 'English',
        MemberCounty: 'Los Angeles',
        ReferrerFirstName: 'Jason',
        ReferrerLastName: 'Bloome',
        ReferrerEmail: 'jason@carehomefinders.com',
        UserEmail: 'user@example.com', // Added for email notifications
        ReferrerPhone: '(555) 123-4567',
        ReferrerRelationship: 'Social Worker',
        Agency: 'Care Home Finders',
        PrimaryContactType: 'other',
        PrimaryContactFirstName: 'Contact',
        PrimaryContactLastName: 'Person',
        PrimaryContactRelationship: 'Family Member',
        PrimaryContactPhone: '(555) 555-5555',
        PrimaryContactEmail: 'contact@example.com',
        PrimaryContactLanguage: 'English',
        SecondaryContactFirstName: 'Secondary',
        SecondaryContactLastName: 'Person',
        SecondaryContactRelationship: 'Friend',
        SecondaryContactPhone: '(555) 111-2222',
        SecondaryContactEmail: 'secondary@example.com',
        SecondaryContactLanguage: 'Spanish',
        MemberHasCapacity: 'Yes',
        HasLegalRepresentative: 'Yes',
        LegalRepresentativeName: 'Legal Eagle',
        LegalRepresentativeRelationship: 'Lawyer',
        LegalRepresentativePhone: '(555) 333-4444',
        LegalRepresentativeEmail: 'legal@rep.com',
        CurrentLocationType: 'SNF',
        CurrentAddress: '123 Nursing Way',
        CurrentCity: 'Healthville',
        CurrentState: 'CA',
        CurrentZipCode: '90210',
        CurrentCounty: 'Los Angeles',
        IsCustomaryAddressSameAsCurrent: false,
        CustomaryAddress: '456 Home Street',
        CustomaryCity: 'Hometown',
        CustomaryState: 'CA',
        CustomaryZipCode: '90211',
        CustomaryCounty: 'Los Angeles',
        HealthPlan: app.healthPlan || 'Kaiser Permanente',
        IsSwitchingHealthPlan: 'No',
        Pathway: app.pathway || 'SNF Transition',
        MeetsPathwayCriteria: 'Yes',
        SNFDiversionReason: 'N/A',
        ISPContactFirstName: 'ISP',
        ISPContactLastName: 'Coordinator',
        ISPContactRelationship: 'Coordinator',
        ISPContactFacilityName: 'Community Services Center',
        ISPContactPhone: '(555) 555-5555',
        ISPContactEmail: 'isp@example.com',
        ISPAddress: '789 Assessment Dr, Planville, CA 90213',
        ISPCounty: 'Los Angeles',
        IsOnALWWaitlist: 'No',
        HasPreferredRCFE: 'Yes',
        RCFEName: 'The Golden Years RCFE',
        RCFEAddress: '789 Sunshine Ave, Happy Town, CA',
        RCFEAdministratorName: 'Admin Person',
        RCFEAdministratorPhone: '(555) 111-2222',
        RCFEAdministratorEmail: 'rcfe-admin@example.com',
        forms: app.forms, // Explicitly carry over the forms array
      };
  }
  return undefined;
};


const ApplicationActivityLog = ({ activities }: { activities: Activity[] }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
        <CardDescription>A timeline of events for this application.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {activities.length > 0 ? activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-4">
               <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                 <User className="h-4 w-4" />
               </div>
              <div className="grid gap-1 text-sm">
                <p className="font-medium leading-none">
                  <span className="font-semibold">{activity.user}</span> performed action <span className="font-semibold text-primary">{activity.action}</span>
                </p>
                <p className="text-muted-foreground">{activity.details}</p>
                <p className="text-xs text-muted-foreground/80 flex items-center gap-1.5"><Clock className="h-3 w-3" /> {activity.timestamp}</p>
              </div>
            </div>
          )) : (
            <div className="text-center text-muted-foreground py-8">No activities recorded yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const kaiserSteps = [
    { id: 'submitted', name: 'Application Under Review' },
    { id: 'kaiser-1', name: 'Authorization Received' },
    { id: 'kaiser-2', name: 'MSW/RN Visit & Tier Assessment' },
    { id: 'kaiser-3', name: 'ISP Tool Submitted to ILS/Kaiser' },
    { id: 'kaiser-4', name: 'Tiered Rate Received' },
    { id: 'kaiser-5', name: 'RCFE Recommended' },
    { id: 'kaiser-6', name: 'RCFE Selected & Contracting Started' },
    { id: 'kaiser-8', name: 'Member Moved In' },
    { id: 'kaiser-9', name: 'Social Worker Visits Started' },
];

const healthNetSteps = [
    { id: 'submitted', name: 'Application Under Review' },
    { id: 'healthnet-1', name: 'Documents Compiled' },
    { id: 'healthnet-2', name: 'RN Virtual Assessment & Tier Score' },
    { id: 'healthnet-3', name: 'RCFE Recommended' },
    { id: 'healthnet-4', name: 'RCFE Selected' },
    { id: 'healthnet-5', name: 'Package Submitted to Health Net for Authorization' },
    { id: 'healthnet-6', name: 'Authorization Received' },
    { id: 'healthnet-7', name: 'Member Moved In' },
    { id: 'healthnet-8', name: 'Social Worker Visits Started' },
];


const ApplicationStatusTracker = ({ application, onStatusChange }: { application: Partial<Application> & { [key: string]: any }, onStatusChange: (status: string) => void }) => {
    let steps;
    const baseSteps = [{ id: 'in-progress', name: 'In Progress' }];
    
    if (application.healthPlan?.includes('Kaiser')) {
        steps = [...baseSteps, ...kaiserSteps];
    } else if (application.healthPlan?.includes('Health Net')) {
        steps = [...baseSteps, ...healthNetSteps];
    } else {
        steps = [
            ...baseSteps,
            { id: 'submitted', name: 'Application Under Review' }
        ];
    }

    if (application.status === 'Requires Revision' && !steps.find(s => s.name === 'Requires Revision')) {
      steps = [{id: application.status, name: application.status}, ...steps];
    }
    
    const currentStatus = application.status || '';
    const currentIndex = steps.findIndex(step => step.name === currentStatus);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Application Status Tracker</CardTitle>
                <CardDescription>Update the application's progress. The selected step will be visible to the user.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="mb-4">
                    <p className="text-sm font-medium text-muted-foreground">Current User-Facing Status:</p>
                    <p className="font-semibold">{currentStatus || 'Not Started'}</p>
                </div>
                <div className="space-y-2">
                    {steps.map((step, index) => {
                        const isCompleted = currentIndex > index;
                        const isCurrent = currentIndex === index;

                        return (
                            <button
                                key={step.id || step.name}
                                onClick={() => onStatusChange(step.name)}
                                className={cn(
                                    "w-full flex items-center gap-4 p-3 rounded-lg text-left transition-colors",
                                    isCurrent && "ring-2 ring-primary bg-muted",
                                    "hover:bg-muted/80"
                                )}
                            >
                                <div className={cn(
                                    "h-6 w-6 rounded-full flex items-center justify-center shrink-0 border-2",
                                    isCompleted ? "bg-green-500 border-green-500 text-white" : isCurrent ? "border-primary" : "border-gray-300 bg-gray-100"
                                )}>
                                    {isCompleted ? <Check className="h-4 w-4" /> : <Circle className={cn("h-3 w-3", isCurrent ? "fill-primary text-primary" : "fill-gray-300 text-gray-300")} />}
                                </div>
                                <span className={cn("font-medium", isCompleted ? "text-muted-foreground line-through" : isCurrent ? "font-semibold text-primary" : "text-foreground")}>{step.name}</span>
                            </button>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}


export default function AdminApplicationDetailPage() {
  const params = useParams();
  const { id } = params as { id: string };
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  
  const [localApplication, setLocalApplication] = useState< (Application & { [key: string]: any }) | null | undefined>(undefined);

  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [revisionDetails, setRevisionDetails] = useState('');
  const [isRevisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [targetFormForRevision, setTargetFormForRevision] = useState('');
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');

  useEffect(() => {
    if (id) {
        const appData = getMockApplicationById(id);
        setLocalApplication(appData ? appData : null);
    }
  }, [id]);

  const applicationActivities = useMemo(() => {
    return mockActivities.filter(activity => activity.applicationId === id);
  }, [id]);


  const handleRequestRevision = async () => {
    if (!localApplication || !revisionDetails || !targetFormForRevision) return;

    setLocalApplication(prev => prev ? { ...prev, status: 'Requires Revision' } : null);

    try {
        await sendRevisionRequestEmail({
            to: localApplication.UserEmail,
            subject: `Revision Required for Your CalAIM Application: ${localApplication.MemberFullName}`,
            memberName: localApplication.MemberFullName,
            formName: targetFormForRevision,
            revisionNotes: revisionDetails
        });

        toast({
            title: 'Revision Request Sent',
            description: `An email has been sent to the user regarding the ${targetFormForRevision}.`,
            className: 'bg-green-100 text-green-900 border-green-200',
        });
    } catch (error) {
        console.error("Failed to send email:", error);
        toast({
            variant: 'destructive',
            title: 'Email Failed',
            description: 'Could not send the revision request email. Please try again.',
        });
    }

    setRevisionDialogOpen(false);
    setRevisionDetails('');
    setTargetFormForRevision('');
  };
  
   const handleDeleteApplication = async () => {
    if (!localApplication || !user) return;

    if (deleteMessage) {
        try {
            await sendApplicationStatusEmail({
                to: localApplication.UserEmail,
                subject: `CalAIM Application Status Update for ${localApplication.MemberFullName}`,
                memberName: localApplication.MemberFullName,
                staffName: user.displayName || 'The Admin Team',
                message: deleteMessage,
                status: 'Deleted'
            });
            toast({ title: 'Notification Sent', description: 'User has been notified of the application deletion.' });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Email Failed',
                description: 'The application was deleted, but the notification email could not be sent. Please contact the user manually.'
            });
        }
    }

    const appIndex = mockApplications.findIndex(a => a.id === localApplication.id);
    if (appIndex !== -1) {
        mockApplications.splice(appIndex, 1);
    }
    
     mockActivities.unshift({
        id: `act-${Date.now()}`,
        applicationId: localApplication.id,
        user: user.displayName || 'Admin',
        action: 'Application Deletion',
        timestamp: new Date().toLocaleString(),
        details: `Deleted application for ${localApplication.MemberFullName}. ${deleteMessage ? 'User was notified.' : 'User was not notified.'}`
    });

    toast({
        title: 'Application Deleted',
        description: `The application for ${localApplication.MemberFullName} has been removed.`,
    });
    setDeleteDialogOpen(false);
    router.push('/admin/applications');
  };

  const handleStatusChange = (newStatus: string) => {
    if (!localApplication) return;
     setLocalApplication(prev => prev ? { ...prev, status: newStatus as any } : undefined);
    
    toast({
        title: "Status Updated",
        description: `Application for ${localApplication.MemberFullName} is now: ${newStatus}`,
    });
  }

  if (localApplication === undefined) {
    return (
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Loading application...</p>
        </div>
    );
  }
  
  if (localApplication === null) {
      notFound();
  }


  const completedForms = localApplication.forms?.filter(f => f.status === 'Completed').length || 0;
  const totalForms = localApplication.forms?.length || 0;
  const progress = totalForms > 0 ? (completedForms / totalForms) * 100 : 0;

  return (
    <Dialog onOpenChange={(isOpen) => { if (!isOpen) setSelectedForm(null) }}>
      <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Button asChild variant="outline">
                  <Link href="/admin/applications">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to All Applications
                  </Link>
              </Button>
               <Dialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Application
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Are you absolutely sure?</DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. This will permanently delete the application for <strong>{localApplication.MemberFullName}</strong>.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="delete-message">Optional Message to User</Label>
                    <Textarea
                      id="delete-message"
                      placeholder="e.g., This application was a duplicate. Please refer to application #123."
                      value={deleteMessage}
                      onChange={(e) => setDeleteMessage(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">If you provide a message, an email will be sent to the user notifying them of the deletion.</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDeleteApplication}>Confirm Deletion</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
          </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div>
                <CardTitle className="text-2xl">Application: {localApplication.id}</CardTitle>
                <CardDescription>
                  Member: <strong>{localApplication.MemberFullName}</strong> | Health Plan: <strong>{localApplication.HealthPlan}</strong> | Pathway: <strong>{localApplication.Pathway}</strong> | Status: <strong>{localApplication.status}</strong>
                </CardDescription>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-muted-foreground">Completion</p>
                <p className="text-2xl font-bold">{Math.round(progress)}%</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Progress value={progress} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                <CardHeader>
                    <CardTitle>Forms &amp; Documents</CardTitle>
                    <CardDescription>Review submitted materials and request revisions if needed.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                    {localApplication.forms?.map((form: FormStatus) => (
                        <div key={form.name} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="flex items-center gap-4">
                            {form.status === 'Completed' ? (
                            <CheckCircle2 className="h-6 w-6 text-green-500" />
                            ) : (
                            <PenSquare className="h-6 w-6 text-yellow-500" />
                            )}
                            <div>
                            <p className="font-medium">{form.name}</p>
                            <p className="text-sm text-muted-foreground">Status: {form.status}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => setSelectedForm(form.name)}>
                                    View
                                </Button>
                            </DialogTrigger>
                                <Button variant="secondary" size="sm" onClick={() => {
                                    setTargetFormForRevision(form.name);
                                    setRevisionDialogOpen(true);
                                }}>
                                    <FileWarning className="mr-2 h-4 w-4" />
                                    Request Revision
                                </Button>
                        </div>
                        </div>
                    ))}
                    {!localApplication.forms?.length && (
                        <div className="text-center p-8 text-muted-foreground">No forms required for this pathway yet.</div>
                    )}
                    </div>
                </CardContent>
                </Card>

                 <ApplicationActivityLog activities={applicationActivities} />
            </div>

            <div className="lg:col-span-1">
                 <ApplicationStatusTracker application={localApplication} onStatusChange={handleStatusChange} />
            </div>
        </div>
        
        {/* Revision Request Dialog */}
        <Dialog open={isRevisionDialogOpen} onOpenChange={setRevisionDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Revision</DialogTitle>
                    <DialogDescription>
                      Write a message explaining what needs to be corrected for '{targetFormForRevision}'. This will be sent via email.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="memberName">Member Name</Label>
                        <Input id="memberName" value={localApplication.MemberFullName} readOnly />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="userEmail">Recipient Email</Label>
                        <Input id="userEmail" value={localApplication.UserEmail} readOnly />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="revision-details">Revision Details</Label>
                        <Textarea 
                          id="revision-details" 
                          placeholder="e.g., Please provide a clearer copy of the Proof of Income document." 
                          rows={5}
                          value={revisionDetails}
                          onChange={(e) => setRevisionDetails(e.target.value)}
                         />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setRevisionDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRequestRevision} disabled={!revisionDetails}>Send Request</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Form Viewer Dialog */}
         <DialogContent className="max-w-4xl">
              <DialogHeader>
                  <DialogTitle>{selectedForm || 'Form View'}: Read-Only</DialogTitle>
              </DialogHeader>
              {selectedForm && <FormViewer formName={selectedForm} application={localApplication} />}
          </DialogContent>
      </div>
    </Dialog>
  );
}

    