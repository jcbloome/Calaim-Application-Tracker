
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
  FileText
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
import { ScrollArea } from '@/components/ui/scroll-area';


const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form/review', icon: FileText },
    { id: 'program-info', title: 'Program Information', description: 'Review important details about the CalAIM program and our services.', type: 'info', href: '/info', icon: Info },
    { id: 'hipaa-authorization', title: 'HIPAA Authorization', description: 'Complete the online HIPAA authorization form.', type: 'online-form', href: '/forms/hipaa-authorization', icon: FileText },
    { id: 'liability-waiver', title: 'Liability Waiver', description: 'Complete the online liability waiver.', type: 'online-form', href: '/forms/liability-waiver', icon: FileText },
    { id: 'freedom-of-choice', title: 'Freedom of Choice Waiver', description: 'Complete the online Freedom of Choice waiver.', type: 'online-form', href: '/forms/freedom-of-choice', icon: FileText },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'upload', icon: UploadCloud, href: '#' },
  ];
  
  let requirements: typeof commonRequirements = [];

  if (pathway === 'SNF Diversion') {
    requirements = [
      ...commonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: 'Download the form, have it signed by a PCP, and upload it here.', type: 'upload', icon: Printer, href: '/forms/declaration-of-eligibility/printable' },
    ];
  } else { // SNF Transition
    requirements = [
        ...commonRequirements,
        { id: 'snf-facesheet', title: 'SNF Facesheet', description: "Upload the resident's facesheet from the Skilled Nursing Facility.", type: 'upload', icon: UploadCloud, href: '#' },
    ];
  }
  
  requirements.push({ id: 'proof-of-income', title: 'Proof of Income', description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'upload', icon: UploadCloud, href: '#' });

  return requirements;
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
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const applicationDocRef = useMemo(() => {
    if (user && firestore && applicationId) {
      return doc(firestore, `users/${user.uid}/applications`, applicationId);
    }
    return null;
  }, [user, firestore, applicationId]);

  const { data: application, isLoading, error } = useDoc<Application>(applicationDocRef);

  // This effect ensures the `forms` array is properly initialized in Firestore.
  useEffect(() => {
    if (application && applicationDocRef) {
      const pathwayRequirements = getPathwayRequirements(application.pathway);
      const existingFormNames = new Set(application.forms?.map(f => f.name) || []);
      
      const missingForms = pathwayRequirements
        .filter(req => !existingFormNames.has(req.title))
        .map(req => ({
            name: req.title,
            status: 'Pending' as 'Pending' | 'Completed',
            type: req.type as FormStatusType['type'],
            href: req.href || '#',
            fileName: null,
        }));

      if (missingForms.length > 0) {
        const updatedForms = [...(application.forms || []), ...missingForms];
        
        // Ensure CS Member Summary is always completed
        const summaryIndex = updatedForms.findIndex(f => f.name === 'CS Member Summary');
        if (summaryIndex !== -1) {
            updatedForms[summaryIndex].status = 'Completed';
        }

        setDoc(applicationDocRef, { forms: updatedForms }, { merge: true });
      }
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, requirementTitle: string) => {
    if (!event.target.files?.length) return;
    const file = event.target.files[0];
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    
    // Simulate upload time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await handleFormStatusUpdate([requirementTitle], 'Completed', file.name);

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
            <p className="ml-4">Loading Application...</p>
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
          <p>{applicationId ? 'Application not found.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const isReadOnly = application.status === 'Completed & Submitted' || application.status === 'Approved';

  const pathwayRequirements = getPathwayRequirements(application.pathway);
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
    const fileName = formInfo?.fileName;
    const href = req.href ? `${req.href}${req.href.includes('?') ? '&' : '?'}applicationId=${applicationId}` : '#';
    
    if (isReadOnly && req.type !== 'online-form' && req.type !== 'info') {
       return <p className="text-sm text-muted-foreground">This item was completed.</p>
    }
    if (isReadOnly && (req.type === 'online-form' || req.type === 'info')) {
        return (
            <Button asChild variant="outline" className="w-full bg-slate-50">
                <Link href={href}>View</Link>
            </Button>
        );
    }

    const isUploading = uploading[req.title];
    
    switch (req.type) {
        case 'online-form':
        case 'info':
            return (
                <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                    <Link href={href}>{isCompleted ? 'View/Edit' : 'Start'} &rarr;</Link>
                </Button>
            );
        case 'upload':
             if (isCompleted) {
                 return (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        <span className="truncate flex-1 text-green-800 font-medium">Completed</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-100 hover:text-red-600" onClick={() => handleFileRemove(req.title)}>
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remove file</span>
                        </Button>
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id={`bundle-check-${req.id}`} 
                            onCheckedChange={(checked) => handleFormStatusUpdate([req.title], checked ? 'Completed' : 'Pending')}
                            checked={isCompleted}
                            disabled={isReadOnly}
                        />
                        <Label htmlFor={`bundle-check-${req.id}`} className="text-xs text-muted-foreground">I included this in a bundle</Label>
                    </div>
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isUploading || isReadOnly) && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading || isReadOnly} />
                    {req.href && req.href !== '#' && (
                        <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                           <Link href={req.href} target="_blank">
                               <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                           </Link>
                       </Button>
                    )}
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
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 space-y-8">
          
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                Application for {application.memberFirstName} {application.memberLastName}
              </CardTitle>
              <CardDescription>
                Submitted by {user?.displayName} | {application.pathway} ({application.healthPlan})
              </CardDescription>
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
            {(application.status === 'In Progress' || application.status === 'Requires Revision') && (
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

            <Separator />
            <h2 className="text-xl font-semibold text-center text-muted-foreground">Bundle Upload Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow border-2 border-dashed border-primary/50">
                    <CardHeader className="pb-4">
                        <div className="flex justify-between items-start gap-4">
                            <CardTitle className="text-lg">Waivers Bundle</CardTitle>
                            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                        <CardDescription>Upload signed waivers as one package. Check the box for each included document.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow justify-end gap-4">
                        <div className="space-y-3">
                            {[
                                { name: 'HIPAA Authorization', href: '/forms/hipaa-authorization/printable' },
                                { name: 'Liability Waiver', href: '/forms/liability-waiver/printable' },
                                { name: 'Freedom of Choice Waiver', href: '/forms/freedom-of-choice/printable' },
                            ].map(form => (
                                <div key={form.name} className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`waiver-bundle-${form.name}`} 
                                            checked={formStatusMap.get(form.name)?.status === 'Completed'}
                                            onCheckedChange={(checked) => handleFormStatusUpdate([form.name], checked ? 'Completed' : 'Pending')}
                                            disabled={isReadOnly}
                                        />
                                        <Label htmlFor={`waiver-bundle-${form.name}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {form.name}
                                        </Label>
                                    </div>
                                    <Button asChild variant="link" className="w-full text-xs h-auto py-0 justify-start pl-8">
                                       <Link href={form.href} target="_blank">
                                           <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                                       </Link>
                                   </Button>
                                </div>
                            ))}
                        </div>
                        <Separator />
                         <Label htmlFor="waiver-bundle-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (uploading["Waivers Bundle"] || isReadOnly) && "opacity-50 pointer-events-none")}>
                            {uploading["Waivers Bundle"] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                            <span>{uploading["Waivers Bundle"] ? 'Uploading...' : 'Upload Bundle'}</span>
                        </Label>
                        <Input id="waiver-bundle-upload" type="file" className="sr-only" onChange={(e) => handleFileUpload(e, "Waivers Bundle")} disabled={uploading["Waivers Bundle"] || isReadOnly} />
                    </CardContent>
                </Card>

                <Card className="flex flex-col shadow-sm hover:shadow-md transition-shadow border-2 border-dashed border-primary/50">
                    <CardHeader className="pb-4">
                        <div className="flex justify-between items-start gap-4">
                            <CardTitle className="text-lg">Medical Documents Bundle</CardTitle>
                            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
                        </div>
                        <CardDescription>Upload multiple medical documents in one go. Check the box for each document you've included in the file.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow justify-end gap-4">
                        <div className="space-y-3">
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
                                    <Label htmlFor={`med-bundle-${form!.name}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {form!.name}
                                    </Label>
                                </div>
                            ))}
                        </div>
                         <Separator />
                         <Label htmlFor="medical-bundle-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (uploading["Medical Documents Bundle"] || isReadOnly) && "opacity-50 pointer-events-none")}>
                            {uploading["Medical Documents Bundle"] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                            <span>{uploading["Medical Documents Bundle"] ? 'Uploading...' : 'Upload Bundle'}</span>
                        </Label>
                        <Input id="medical-bundle-upload" type="file" className="sr-only" onChange={(e) => handleFileUpload(e, "Medical Documents Bundle")} disabled={uploading["Medical Documents Bundle"] || isReadOnly} />
                    </CardContent>
                </Card>
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
            <p className="ml-4">Loading Application...</p>
        </div>
    }>
      <PathwayPageContent />
    </Suspense>
  );
}
