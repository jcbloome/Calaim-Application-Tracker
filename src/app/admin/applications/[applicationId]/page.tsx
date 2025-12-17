
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
  CardFooter
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
  Edit
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea';
import { sendRevisionRequestEmail, sendApplicationStatusEmail } from '@/app/actions/send-email';

const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form/review', icon: FileText },
    { id: 'hipaa-authorization', title: 'HIPAA Authorization', description: 'Complete the online HIPAA authorization form.', type: 'online-form', href: '/forms/hipaa-authorization', icon: FileText },
    { id: 'liability-waiver', title: 'Liability Waiver', description: 'Complete the online liability waiver.', type: 'online-form', href: '/forms/liability-waiver', icon: FileText },
    { id: 'freedom-of-choice', title: 'Freedom of Choice Waiver', description: 'Complete the online Freedom of Choice waiver.', type: 'online-form', href: '/forms/freedom-of-choice', icon: FileText },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'proof-of-income', title: 'Proof of Income', description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
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

function AdminActions({ application, onStatusChange }: { application: Application, onStatusChange: (status: Application['status']) => Promise<void> }) {
    const { isAdmin, isSuperAdmin } = useAdmin();
    const [revisionNotes, setRevisionNotes] = useState('');
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();

    if (!isAdmin && !isSuperAdmin) {
        return null;
    }
    
    const sendEmailAndUpdateStatus = async (status: Application['status'], subject: string, message: string) => {
        if (!application.referrerEmail) {
            toast({ variant: 'destructive', title: 'Error', description: 'Referrer email is not available for this application.' });
            return;
        }

        setIsSending(true);

        try {
            if (status === 'Requires Revision') {
                 await sendRevisionRequestEmail({
                    to: application.referrerEmail,
                    subject: subject,
                    memberName: `${application.memberFirstName} ${application.memberLastName}`,
                    formName: 'the application', // Can be made more specific if needed
                    revisionNotes: message,
                });
            } else {
                 await sendApplicationStatusEmail({
                    to: application.referrerEmail,
                    subject: subject,
                    memberName: `${application.memberFirstName} ${application.memberLastName}`,
                    staffName: "The Connections Team",
                    message: message,
                    status: status,
                });
            }

            await onStatusChange(status);

            toast({
                title: 'Success!',
                description: `Application status set to "${status}" and an email has been sent.`,
                className: 'bg-green-100 text-green-900',
            });

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


    const handleRevisionRequest = () => {
        if (!revisionNotes) {
            toast({ variant: 'destructive', title: 'Error', description: 'Revision notes cannot be empty.' });
            return;
        }
        sendEmailAndUpdateStatus('Requires Revision', 'Revision Required for CalAIM Application', revisionNotes);
    };

    const handleApproval = () => {
        sendEmailAndUpdateStatus('Approved', 'Your CalAIM Application Has Been Approved!', 'Congratulations! Your application has been approved. Our team will be in touch with the next steps.');
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Admin Actions</CardTitle>
                <CardDescription>Manage the status of this application.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">Request Revision</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Request Revision</DialogTitle>
                            <DialogDescription>
                                Describe the changes needed. An email will be sent to the referrer.
                            </DialogDescription>
                        </DialogHeader>
                        <Textarea
                            placeholder="e.g., 'Please upload a clearer copy of the Proof of Income document.'"
                            value={revisionNotes}
                            onChange={(e) => setRevisionNotes(e.target.value)}
                        />
                        <DialogFooter>
                            <Button onClick={handleRevisionRequest} disabled={isSending}>
                                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Send Request
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Button className="w-full bg-green-600 hover:bg-green-700" onClick={handleApproval} disabled={isSending}>
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Approve Application
                </Button>
            </CardContent>
        </Card>
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

  const docRef = useMemo(() => {
    if (!firestore || !applicationId || !appUserId) return null;
    return doc(firestore, `users/${appUserId}/applications`, applicationId);
  }, [firestore, applicationId, appUserId]);

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
  
   const handleStatusChange = async (newStatus: Application['status']) => {
        if (!docRef) return;
        await setDoc(docRef, { status: newStatus, lastUpdated: serverTimestamp() }, { merge: true });
    };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length) return;
    const files = Array.from(event.target.files);
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const fileNames = files.map(f => f.name).join(', ');
    await handleFormStatusUpdate([requirementTitle], 'Completed', fileNames);

    setUploading(prev => ({...prev, [requirementTitle]: false}));
    
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
  
  const isReadOnly = application.status === 'Completed & Submitted' || application.status === 'Approved';

  const pathwayRequirements = getPathwayRequirements(application.pathway as 'SNF Transition' | 'SNF Diversion');
  const formStatusMap = new Map(application.forms?.map(f => [f.name, {status: f.status, fileName: f.fileName}]));
  
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const form = formStatusMap.get(req.title);
    if (form?.status === 'Completed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed';
    let href = req.href ? `${req.href}${req.href.includes('?') ? '&' : '?'}applicationId=${applicationId}` : '#';
    // Admins need userId to view forms
    href += `&userId=${appUserId}`;
    
    const isUploading = uploading[req.title];
    const isMultiple = req.title === 'Proof of Income';
    
    switch (req.type) {
        case 'online-form':
        case 'Info':
            return (
                <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                    <Link href={href}>{isCompleted ? 'View/Edit' : 'Start'} &rarr;</Link>
                </Button>
            );
        case 'Upload':
             if (isCompleted) {
                 return (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        <span className="truncate flex-1 text-green-800 font-medium">{formInfo?.fileName || 'Completed'}</span>
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">This document must be uploaded by the user.</p>
                </div>
            );
        default:
            return null;
    }
};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <Card className="shadow-sm">
            <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                Application for {application.memberFirstName} {application.memberLastName}
            </CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardDescription>
                Submitted by {application.referrerName || user?.displayName} | {application.pathway} ({application.healthPlan})
                </CardDescription>
                <GlossaryDialog />
            </div>
            </CardHeader>
            <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div className="truncate"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                <div><strong>Status:</strong> <span className="font-semibold">{application.status}</span></div>
            </div>
            <div>
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                    <span className="font-medium">Application Progress</span>
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
        <AdminActions application={application} onStatusChange={handleStatusChange} />
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
