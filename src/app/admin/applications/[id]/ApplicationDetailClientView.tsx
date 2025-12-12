'use client';

import { notFound, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, FileWarning, PenSquare, ArrowLeft, Trash2, Loader2, User, Clock, Check, Circle, Lock, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Application, FormStatus, Activity } from '@/lib/definitions';
import { activities as mockActivities } from '@/lib/data';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sendRevisionRequestEmail } from '@/app/actions/send-email';
import { Input } from '@/components/ui/input';
import { sendApplicationStatusEmail } from '@/app/actions/send-email';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const FormViewer = dynamic(() => import('./FormViewer').then(mod => mod.FormViewer), {
  loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>,
});

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


export function ApplicationDetailClientView({ initialApplication }: { initialApplication: Application }) {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const { id, userId } = initialApplication;

  const applicationDocRef = useMemo(() => {
    if (!firestore || !userId || !id) return null;
    return doc(firestore, `users/${userId}/applications`, id);
  }, [firestore, userId, id]);

  // Use the initial data from the server, but then let the useDoc hook take over for real-time updates.
  const { data: application, isLoading: isApplicationLoading } = useDoc<Application & { [key:string]: any }>(applicationDocRef, {
      initialData: initialApplication
  });

  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [isFormViewerOpen, setFormViewerOpen] = useState(false);

  const [revisionDetails, setRevisionDetails] = useState('');
  const [isRevisionDialogOpen, setRevisionDialogOpen] = useState(false);
  const [targetFormForRevision, setTargetFormForRevision] = useState('');
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');

  useEffect(() => {
    if (!isFormViewerOpen) {
      setSelectedForm(null);
    }
  }, [isFormViewerOpen])

  const applicationActivities = useMemo(() => {
    return mockActivities.filter(activity => activity.applicationId === id);
  }, [id]);


  const handleRequestRevision = async () => {
    if (!application || !revisionDetails || !targetFormForRevision || !applicationDocRef) return;

    try {
        await updateDoc(applicationDocRef, { status: 'Requires Revision' });
        
        await sendRevisionRequestEmail({
            to: application.UserEmail || application.referrerEmail,
            subject: `Revision Required for Your CalAIM Application: ${application.memberFirstName} ${application.memberLastName}`,
            memberName: `${application.memberFirstName} ${application.memberLastName}`,
            formName: targetFormForRevision,
            revisionNotes: revisionDetails
        });

        toast({
            title: 'Revision Request Sent',
            description: `An email has been sent to the user regarding the ${targetFormForRevision}.`,
            className: 'bg-green-100 text-green-900 border-green-200',
        });
    } catch (error) {
        console.error("Failed to send email or update status:", error);
        toast({
            variant: 'destructive',
            title: 'Action Failed',
            description: 'Could not send the revision request email or update status. Please try again.',
        });
    }

    setRevisionDialogOpen(false);
    setRevisionDetails('');
    setTargetFormForRevision('');
  };
  
   const handleDeleteApplication = async () => {
    if (!application || !user || !applicationDocRef) return;

    if (deleteMessage) {
        try {
            await sendApplicationStatusEmail({
                to: application.UserEmail || application.referrerEmail,
                subject: `CalAIM Application Status Update for ${application.memberFirstName} ${application.memberLastName}`,
                memberName: `${application.memberFirstName} ${application.memberLastName}`,
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
    
    try {
      await deleteDoc(applicationDocRef);
      toast({
          title: 'Application Deleted',
          description: `The application for ${application.memberFirstName} ${application.memberLastName} has been removed.`,
      });
      router.push('/admin/applications');
    } catch (error) {
        console.error("Failed to delete application:", error);
         toast({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: 'Could not delete the application. Please try again.',
        });
    }

    setDeleteDialogOpen(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!application || !applicationDocRef) return;
     
    try {
        await updateDoc(applicationDocRef, { status: newStatus, lastUpdated: Timestamp.now() });
        toast({
            title: "Status Updated",
            description: `Application for ${application.memberFirstName} ${application.memberLastName} is now: ${newStatus}`,
        });
    } catch (error) {
        console.error("Failed to update status:", error);
        toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: 'Could not update the application status. Please try again.',
        });
    }
  }

  // Display a loading spinner while the useDoc hook revalidates the data in the background
  if (isApplicationLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Loading application...</p>
        </div>
    );
  }
  
  if (!application) {
      // This should theoretically not happen if the server component found it,
      // but it's a good fallback.
      notFound();
  }


  const completedForms = application.forms?.filter(f => f.status === 'Completed').length || 0;
  const totalForms = application.forms?.length || 0;
  const progress = totalForms > 0 ? (completedForms / totalForms) * 100 : 0;

  return (
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
                <Button variant="destructive" className="w-full sm:w-auto">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Application
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete the application for <strong>{application.memberFirstName} {application.memberLastName}</strong>.
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

      {application.healthPlan === 'Other' && (
          <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Non-Contracted Health Plan</AlertTitle>
              <AlertDescription>
                The member's selected health plan is '{application.existingHealthPlan || 'Other'}'. The member must switch to Health Net or Kaiser to be eligible for this program.
              </AlertDescription>
          </Alert>
      )}

      {application.hasCapacity === 'No' && (
          <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Member Lacks Capacity</AlertTitle>
              <AlertDescription>
              This member has been identified as lacking the capacity to make their own decisions. Please ensure a legal representative is involved.
              </AlertDescription>
          </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <CardTitle className="text-2xl">Application: {application.id}</CardTitle>
              <CardDescription className="flex flex-wrap gap-x-2 gap-y-1">
                <span>Member: <strong>{application.memberFirstName} {application.memberLastName}</strong></span>
                <span className="hidden sm:inline">|</span>
                <span>Health Plan: <strong>{application.healthPlan}</strong></span>
                <span className="hidden sm:inline">|</span>
                <span>Pathway: <strong>{application.pathway}</strong></span>
                 <span className="hidden sm:inline">|</span>
                <span>Status: <strong>{application.status}</strong></span>
              </CardDescription>
            </div>
            <div className="text-left sm:text-right shrink-0">
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
                  {application.forms?.map((form: FormStatus) => (
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
                          <Button variant="outline" size="sm" onClick={() => {
                              setSelectedForm(form.name);
                              setFormViewerOpen(true);
                          }}>
                              View
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => {
                              setTargetFormForRevision(form.name);
                              setRevisionDialogOpen(true);
                          }}>
                              <FileWarning className="mr-2 h-4 w-4" />
                              Revise
                          </Button>
                      </div>
                      </div>
                  ))}
                  {!application.forms?.length && (
                      <div className="text-center p-8 text-muted-foreground">No forms required for this pathway yet.</div>
                  )}
                  </div>
              </CardContent>
              </Card>

               <ApplicationActivityLog activities={applicationActivities} />
          </div>

          <div className="lg:col-span-1">
               <ApplicationStatusTracker application={application} onStatusChange={handleStatusChange} />
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
                      <Input id="memberName" value={`${application.memberFirstName} ${application.memberLastName}`} readOnly />
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="userEmail">Recipient Email</Label>
                      <Input id="userEmail" value={application.UserEmail || application.referrerEmail} readOnly />
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
      <Dialog open={isFormViewerOpen} onOpenChange={setFormViewerOpen}>
         <DialogContent className="max-w-4xl">
              <DialogHeader>
                  <DialogTitle>{selectedForm || 'Form View'}: Read-Only</DialogTitle>
              </DialogHeader>
              {selectedForm && <FormViewer formName={selectedForm} application={application} />}
          </DialogContent>
      </Dialog>
    </div>
  );
}
