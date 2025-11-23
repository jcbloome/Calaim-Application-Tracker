
'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  Send
} from 'lucide-react';
import { Header } from '@/components/Header';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';

const getPathwayRequirements = (pathway: 'SNF Transition' | 'SNF Diversion') => {
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form', icon: File },
    { id: 'program-info', title: 'Program Information', description: 'Review important details about the CalAIM program and our services.', type: 'info', href: '/info', icon: Info },
    { id: 'hipaa-auth', title: 'HIPAA Authorization', description: 'Authorize the use or disclosure of Protected Health Information (PHI).', type: 'online-form', href: '/forms/hipaa-authorization', icon: File },
    { id: 'liability-waiver', title: 'Liability Waiver', description: 'Review and sign the Participant Liability Waiver & Hold Harmless Agreement.', type: 'online-form', href: '/forms/liability-waiver', icon: File },
    { id: 'freedom-of-choice', title: 'Freedom of Choice Waiver', description: 'Acknowledge your choice to accept or decline Community Supports services.', type: 'online-form', href: '/forms/freedom-of-choice', icon: File },
    { id: 'proof-of-income', title: 'Proof of Income', description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements showing Social Security income.", type: 'upload', icon: UploadCloud },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, have the physician complete, and upload the report.", type: 'upload', icon: UploadCloud },
    { id: 'med-list', title: "Medicine List", description: "Upload a current list of all medications.", type: 'upload', icon: UploadCloud },
  ];

  if (pathway === 'SNF Diversion') {
    return [
      ...commonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: 'Required for SNF Diversion. Download the form, have it signed by a physician, and upload it here.', type: 'upload', href: '/forms/declaration-of-eligibility/printable', icon: UploadCloud },
    ];
  }

  // SNF Transition
  return [
      ...commonRequirements,
      { id: 'snf-facesheet', title: 'SNF Facesheet', description: "Upload the Skilled Nursing Facility facesheet.", type: 'upload', icon: UploadCloud },
  ];
};


function StatusIndicator({ status }: { status: FormStatusType['status'] }) {
    const isCompleted = status === 'Completed';
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm",
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
  const applicationId = searchParams.get('applicationId');
  const { user } = useUser();
  const firestore = useFirestore();

  const applicationDocRef = useMemo(() => {
    if (user && firestore && applicationId) {
      return doc(firestore, `users/${user.uid}/applications`, applicationId);
    }
    return null;
  }, [user, firestore, applicationId]);

  const { data: application, isLoading, error } = useDoc<Application>(applicationDocRef);

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

  const pathwayRequirements = getPathwayRequirements(application.pathway);
  
  // Create a map for quick status lookup
  const formStatusMap = new Map(application.forms?.map(f => [f.name, f.status]));

  const completedCount = pathwayRequirements.reduce((acc, req) => {
    // Manually mark info as complete for progress, as it has no status
    if (req.type === 'info') return acc + 1;
    if (formStatusMap.get(req.title) === 'Completed') {
        return acc + 1;
    }
    return acc;
  }, 0);

  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allRequiredFormsComplete = completedCount === totalCount;


  const getFormAction = (req: (typeof pathwayRequirements)[0], isCompleted: boolean) => {
    const href = req.href ? `${req.href}?applicationId=${applicationId}` : '#';
    switch (req.type) {
        case 'online-form':
            return (
                <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                    <Link href={href}>{isCompleted ? 'View/Edit Form' : 'Start Form'} &rarr;</Link>
                </Button>
            );
        case 'info':
            return (
                <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                    <Link href="/info">Review Information &rarr;</Link>
                </Button>
            );
        case 'upload':
             return (
                <div className="space-y-2">
                    {req.href && (
                        <Button asChild variant="secondary" className="w-full">
                            <Link href={req.href} target="_blank">
                                <File className="mr-2 h-4 w-4" /> Download Blank Form
                            </Link>
                        </Button>
                    )}
                    <Button variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                         <UploadCloud className="mr-2 h-4 w-4" /> Upload Document
                    </Button>
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
                {application.pathway} ({application.healthPlan || 'N/A'})
              </CardTitle>
              <CardDescription>
                For members {application.pathway === 'SNF Diversion' ? 'living in the community who are at risk of institutionalization.' : 'currently in a Skilled Nursing Facility who want to move to a community setting.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                <div><strong>Member:</strong> {application.memberFirstName} {application.memberLastName}</div>
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
            {application.status === 'In Progress' || application.status === 'Requires Revision' ? (
                <CardFooter>
                    <Button className="w-full" disabled={!allRequiredFormsComplete}>
                        <Send className="mr-2 h-4 w-4" />
                        Submit Application for Review
                    </Button>
                </CardFooter>
            ) : null}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pathwayRequirements.map((req) => {
                const status = (req.type === 'info') ? 'Completed' : (formStatusMap.get(req.title) || 'Pending');
                const isCompleted = status === 'Completed';
                
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
                            {getFormAction(req, isCompleted)}
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
            <p className="ml-4">Loading Application...</p>
        </div>
    }>
      <PathwayPageContent />
    </Suspense>
  );
}
