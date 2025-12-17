
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
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  X,
  FileText,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GlossaryDialog } from '@/components/GlossaryDialog';

const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form/review', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, and Freedom of Choice waiver form.', type: 'online-form', href: '/forms/waivers', icon: FileText },
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

function PathwayPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicationId = searchParams.get('applicationId');
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const docRef = useMemo(() => {
    if (!firestore || !applicationId || !user) return null;
    return doc(firestore, `users/${user.uid}/applications`, applicationId);
  }, [firestore, applicationId, user]);

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

  useEffect(() => {
    if (!isLoading && !application && !isUserLoading) {
      router.push('/applications');
    }
  }, [isLoading, application, isUserLoading, router]);

  useEffect(() => {
    if (application && docRef && application.pathway && (!application.forms || application.forms.length === 0)) {
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

        setDoc(docRef, { forms: initialForms }, { merge: true });
    }
  }, [application, docRef]);

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

  const handleSubmitApplication = async () => {
    if (!docRef) return;
    setIsSubmitting(true);
    try {
        await setDoc(docRef, {
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

  if (isLoading || isUserLoading) {
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
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 space-y-8">
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
                    You can check the boxes for "I included this in a bundle" for forms that you plan to upload together. This helps track completion.
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
