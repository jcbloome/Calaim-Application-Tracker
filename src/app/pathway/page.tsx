
'use client';

import { Suspense, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { Header } from '@/components/Header';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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


function PathwayPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicationId = searchParams.get('applicationId');
  const { user } = useUser();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const applicationDocRef = useMemo(() => {
    // Admins can view any application, so we don't check for user ownership if they are an admin.
    // The query to get the application data is done in the Admin table, which requires a collectionGroup query.
    // The user ID is part of the application data itself.
    if (firestore && applicationId && user) {
        // This part is tricky. If an admin is viewing, the application's original userId must be used.
        // The useDoc hook implicitly uses the currently logged-in user's UID if not handled carefully.
        // For this to work for admins, the `application` object (when available) must contain the original `userId`.
        const userIdToUse = isAdmin || isSuperAdmin ? application?.userId : user.uid;
        if (userIdToUse) {
             return doc(firestore, `users/${userIdToUse}/applications`, applicationId);
        }
        // Fallback for regular user before app data is loaded
        return doc(firestore, `users/${user.uid}/applications`, applicationId);
    }
    return null;
  }, [user, firestore, applicationId, isAdmin, isSuperAdmin]);

  const { data: application, isLoading, error } = useDoc<Application>(applicationDocRef, {}, [applicationId]);


  useEffect(() => {
    // If the hook is done loading and there's no application, it might be an admin trying to access it.
    // In a real-world scenario, you might have a separate data fetching mechanism for admins.
    // For this prototype, we'll redirect if a non-admin can't find the app in their own collection.
    if (!isLoading && !application && !isAdmin && !isSuperAdmin) {
        // router.push('/applications'); // Or some error page
    }
  }, [isLoading, application, isAdmin, isSuperAdmin, router]);


  useEffect(() => {
    if (application && applicationDocRef && application.pathway && (!application.forms || application.forms.length === 0)) {
        const pathwayRequirements = getPathwayRequirements(application.pathway);
        const initialForms: FormStatusType[] = pathwayRequirements.map(req => ({
            name: req.title,
            status: 'Pending',
            type: req.type as FormStatusType['type'],
            href: req.href || '#',
        }));

        const summaryIndex = initialForms.findIndex(f => f.name === 'CS Member Summary');
        if (summaryIndex !== -1) {
            initialForms[summaryIndex].status = 'Completed';
        }

        setDoc(applicationDocRef, { forms: initialForms }, { merge: true });
    }
}, [application, applicationDocRef]);


  const handleFormStatusUpdate = async (formNames: string[], newStatus: 'Completed' | 'Pending', fileName?: string | null) => {
      if (!applicationDocRef || !application) {
        return;
      }

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
          await setDoc(applicationDocRef, {
              forms: updatedForms,
              lastUpdated: serverTimestamp(),
          }, { merge: true });
      } catch (e: any) {
          console.error("Failed to update form status:", e);
      }
  };
  
   const handleStatusChange = async (newStatus: Application['status']) => {
        if (!applicationDocRef) return;
        await setDoc(applicationDocRef, { status: newStatus, lastUpdated: serverTimestamp() }, { merge: true });
    };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length) return;
    const files = Array.from(event.target.files);
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    
    // Simulate upload delay & storage logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const fileNames = files.map(f => f.name).join(', ');
    await handleFormStatusUpdate([requirementTitle], 'Completed', fileNames);

    setUploading(prev => ({...prev, [requirementTitle]: false}));
    
    event.target.value = '';
  };
  
  const handleFileRemove = async (requirementTitle: string) => {
    await handleFormStatusUpdate([requirementTitle], 'Pending', null);
  };

  const handleSubmitApplication = async () => {
    if (!applicationDocRef) return;
    setIsSubmitting(true);
    try {
        await setDoc(applicationDocRef, {
            status: 'Completed & Submitted',
            lastUpdated: serverTimestamp(),
        }, { merge: true });
        router.push('/applications/completed');
    } catch (e: any) {
        console.error(e);
    } finally {
        setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-screen">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-screen">
          <p>{applicationId ? 'Application not found or you do not have permission to view it.' : 'No application ID provided.'}</p>
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
  const allRequiredFormsComplete = completedCount === totalCount;

  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed';
    const href = req.href ? `${req.href}${req.href.includes('?') ? '&' : '?'}applicationId=${applicationId}` : '#';
    
    if (isReadOnly) {
       if (req.type === 'Upload') {
           return (
                <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                    <span className="truncate flex-1 text-green-800 font-medium">{formInfo?.fileName || 'Completed'}</span>
                </div>
           );
       }
       return (
            <Button asChild variant="outline" className="w-full bg-slate-50">
                <Link href={href}>View</Link>
            </Button>
        );
    }

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
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isUploading || isReadOnly) && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? 'Uploading...' : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading || isReadOnly} multiple={isMultiple} />
                </div>
            );
        default:
            return null;
    }
};

  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
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
                {(!isReadOnly && (application.status === 'In Progress' || application.status === 'Requires Revision')) && (
                    <CardFooter>
                        <Button 
                            className="w-full" 
                            disabled={!allRequiredFormsComplete || isSubmitting}
                            onClick={handleSubmitApplication}
                        >
                            {isSubmitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                            ) : (
                                <><Send className="mr-2 h-4 w-4" /> Submit Application for Review</>
                            )}
                        </Button>
                    </CardFooter>
                )}
            </Card>

            <Alert variant="default" className="bg-sky-50 border-sky-200 text-sky-800">
                <Info className="h-4 w-4 !text-sky-800" />
                <AlertTitle>Upload Tip</AlertTitle>
                <AlertDescription>
                    You can check the boxes for "I included this in a bundle" for forms that you plan to upload together, like in the 'Medical Documents Bundle' below. This helps track completion.
                </AlertDescription>
            </Alert>

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
            {(isAdmin || isSuperAdmin) && <AdminActions application={application} onStatusChange={handleStatusChange} />}

             <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Bundle Uploads</CardTitle>
                    <CardDescription>For convenience, upload multiple signed documents as a single file.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="p-4 border rounded-md">
                         <h3 className="font-semibold text-base">Waivers Bundle</h3>
                         <p className="text-xs text-muted-foreground mb-4">Includes HIPAA, Liability, and Freedom of Choice waivers.</p>
                         <div className="space-y-3 mb-4">
                            {[ 'HIPAA Authorization', 'Liability Waiver', 'Freedom of Choice Waiver' ].map(formName => (
                                <div key={formName} className="flex items-center space-x-2">
                                     <Checkbox 
                                        id={`waiver-bundle-${formName}`} 
                                        checked={formStatusMap.get(formName)?.status === 'Completed'}
                                        onCheckedChange={(checked) => handleFormStatusUpdate([formName], checked ? 'Completed' : 'Pending')}
                                        disabled={isReadOnly}
                                    />
                                    <Label htmlFor={`waiver-bundle-${formName}`} className="text-sm">{formName}</Label>
                                </div>
                            ))}
                         </div>
                         <Button asChild className="w-full">
                            <Link href="/forms/printable-package/full-package" target="_blank"><Printer className="mr-2 h-4 w-4" /> Download Blank Waivers</Link>
                         </Button>
                    </div>

                    <div className="p-4 border rounded-md">
                         <h3 className="font-semibold text-base">Medical Docs Bundle</h3>
                         <p className="text-xs text-muted-foreground mb-4">Includes Physician's Report, Med List, etc.</p>
                         <div className="space-y-3 mb-4">
                           {[
                                {name: "LIC 602A - Physician's Report"},
                                {name: "Medicine List"},
                                application.pathway === 'SNF Transition' ? {name: "SNF Facesheet"} : null,
                                application.pathway === 'SNF Diversion' ? {name: "Declaration of Eligibility"} : null,
                           ].filter(Boolean).map(form => (
                                <div key={form!.name} className="flex items-center space-x-2">
                                     <Checkbox 
                                        id={`med-bundle-${form!.name}`} 
                                        checked={formStatusMap.get(form!.name)?.status === 'Completed'}
                                        onCheckedChange={(checked) => handleFormStatusUpdate([form!.name], checked ? 'Completed' : 'Pending')}
                                        disabled={isReadOnly}
                                    />
                                    <Label htmlFor={`med-bundle-${form!.name}`} className="text-sm">{form!.name}</Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
             </Card>
          </aside>
        </div>
      </main>
    </>
  );
}

export default function PathwayPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    }>
      <PathwayPageContent />
    </Suspense>
  );
}
