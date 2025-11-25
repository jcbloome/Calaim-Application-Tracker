

'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, FileWarning, PenSquare, ArrowLeft, Trash2, Loader2, User, Clock, Check, Circle } from 'lucide-react';
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
        memberName: app.memberName,
        memberFirstName: app.memberName?.split(' ')[0] || '',
        memberLastName: app.memberName?.split(' ')[1] || '',
        memberDob: new Date(1980, 1, 1),
        memberAge: 44,
        memberMediCalNum: '91234567A',
        memberMrn: 'MRN12345',
        memberLanguage: 'English',
        memberCounty: 'Los Angeles',
        referrerFirstName: 'Jason',
        referrerLastName: 'Bloome',
        referrerEmail: 'jason@carehomefinders.com',
        userEmail: 'user@example.com', // Added for email notifications
        referrerPhone: '(555) 123-4567',
        referrerRelationship: 'Social Worker',
        agency: 'Care Home Finders',
        bestContactType: 'other',
        bestContactFirstName: 'Contact',
        bestContactLastName: 'Person',
        bestContactRelationship: 'Family Member',
        bestContactPhone: '(555) 555-5555',
        bestContactEmail: 'contact@example.com',
        bestContactLanguage: 'English',
        currentLocation: 'SNF',
        currentAddress: '123 Nursing Way',
        currentCity: 'Healthville',
        currentState: 'CA',
        currentZip: '90210',
        currentCounty: 'Los Angeles',
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
    { id: 'kaiser-0', name: 'Application Under Review' },
    { id: 'kaiser-1', name: 'Authorization Received' },
    { id: 'kaiser-2', name: 'MSW/RN Visit & Tier Assessment' },
    { id: 'kaiser-3', name: 'ISP Tool Submitted to ILS/Kaiser' },
    { id: 'kaiser-4', name: 'Tiered Rate Received' },
    { id: 'kaiser-5', name: 'RCFE Recommended' },
    { id: 'kaiser-6', name: 'RCFE Selected & Contracting Started' },
    { id: 'kaiser-7', name: 'Authorization Start Date & Payment Instructions Received' },
    { id: 'kaiser-8', name: 'Member Moved In' },
    { id: 'kaiser-9', name: 'Social Worker Visits Started' },
];

const healthNetSteps = [
    { id: 'healthnet-0', name: 'Application Under Review' },
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
    const steps = application.healthPlan?.includes('Kaiser') ? kaiserSteps : healthNetSteps;
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
                                key={step.id}
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
        setLocalApplication(appData);
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
            to: localApplication.userEmail,
            subject: `Revision Required for Your CalAIM Application: ${localApplication.memberName}`,
            memberName: localApplication.memberName,
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
                to: localApplication.userEmail,
                subject: `CalAIM Application Status Update for ${localApplication.memberName}`,
                memberName: localApplication.memberName,
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
        details: `Deleted application for ${localApplication.memberName}. ${deleteMessage ? 'User was notified.' : 'User was not notified.'}`
    });

    toast({
        title: 'Application Deleted',
        description: `The application for ${localApplication.memberName} has been removed.`,
    });
    setDeleteDialogOpen(false);
    router.push('/admin/applications');
  };

  const handleStatusChange = (newStatus: string) => {
    if (!localApplication) return;
     setLocalApplication(prev => prev ? { ...prev, status: newStatus as any } : undefined);
    
    toast({
        title: "Status Updated",
        description: `Application for ${localApplication.memberName} is now: ${newStatus}`,
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


  const completedForms = localApplication.forms.filter(f => f.status === 'Completed').length;
  const totalForms = localApplication.forms.length;
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
                      This action cannot be undone. This will permanently delete the application for <strong>{localApplication.memberName}</strong>.
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
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">Application: {localApplication.id}</CardTitle>
                <CardDescription>
                  Member: <strong>{localApplication.memberName}</strong> | Pathway: <strong>{localApplication.pathway}</strong> | Status: <strong>{localApplication.status}</strong>
                </CardDescription>
              </div>
              <div className="text-right">
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
                    <CardTitle>Forms & Documents</CardTitle>
                    <CardDescription>Review submitted materials and request revisions if needed.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                    {localApplication.forms.map(form => (
                        <div key={form.name} className="flex items-center justify-between rounded-lg border p-4">
                        <div className="flex items-center gap-4">
                            {form.status === 'Completed' ? (
                            <CheckCircle2 className="h-6 w-6 text-green-500" />
                            ) : (
                            <PenSquare className="h-6 w-6 text-yellow-500" />
                            )}
                            <div>
                            <p className="font-medium">{form.name}</p>
                            <p className="text-sm text-muted-foreground">Type: {form.type}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                    {localApplication.forms.length === 0 && (
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
                        <Input id="memberName" value={localApplication.memberName} readOnly />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="userEmail">Recipient Email</Label>
                        <Input id="userEmail" value={localApplication.userEmail} readOnly />
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
