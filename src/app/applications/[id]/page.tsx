
'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useParams, notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Send, Edit, Lock } from 'lucide-react';
import { Header } from '@/components/Header';
import type { Application } from '@/lib/definitions';
import { useDoc, useUser, useFirestore } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { CsSummaryView } from '@/app/admin/application/[id]/CsSummaryView'; // Re-use the admin summary view
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';


function ApplicationReviewPageContent() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const applicationId = params.id as string; // Get ID from dynamic route
  const { user } = useUser();
  const firestore = useFirestore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applicationDocRef = useMemo(() => {
    if (user && firestore && applicationId) {
      return doc(firestore, `users/${user.uid}/applications`, applicationId);
    }
    return null;
  }, [user, firestore, applicationId]);

  const { data: application, isLoading, error } = useDoc<Application>(applicationDocRef);

  const handleSubmitForReview = async () => {
    if (!applicationDocRef || !application) return;

    setIsSubmitting(true);
    try {
      await setDoc(applicationDocRef, {
        status: 'Completed & Submitted',
        lastUpdated: serverTimestamp(),
      }, { merge: true });

      toast({
        title: 'Application Submitted!',
        description: 'Your application has been sent for review.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });

      router.push(`/pathway?applicationId=${applicationId}`);

    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Submission Error',
        description: 'There was a problem submitting your application. Please try again.'
      });
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Application to Review...</p>
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

  // Only call notFound if loading is complete and there's still no application
  if (!isLoading && !application) {
    notFound();
    return null;
  }
  
  if (!application) {
    // This part should ideally not be reached if the above logic is correct,
    // but it's a safe fallback.
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application to Review...</p>
        </div>
    );
  }
  
  // A submitted application can be viewed, but not edited or re-submitted.
  const isLocked = application.status === 'Completed & Submitted' || application.status === 'Approved';

  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
           <div className="flex items-center justify-between">
                <Button asChild variant="outline">
                  <Link href="/applications">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to My Applications
                  </Link>
                </Button>
                 {!isLocked && (
                    <Button asChild variant="secondary">
                        <Link href={`/forms/cs-summary-form?applicationId=${applicationId}`}>
                            <Edit className="mr-2 h-4 w-4" /> Edit Information
                        </Link>
                    </Button>
                 )}
          </div>
          
          <Card className="shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-2xl sm:text-3xl font-bold">
                            Review CS Member Summary
                        </CardTitle>
                        <CardDescription>
                            Please carefully review all the information below. If anything is incorrect, you can go back and edit it.
                        </CardDescription>
                    </div>
                    {isLocked && (
                        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground bg-slate-100 px-3 py-1.5 rounded-md">
                            <Lock className="h-4 w-4" />
                            <span>Submitted & Locked</span>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {/* We can re-use the detailed view from the admin panel */}
                <CsSummaryView application={application} />
            </CardContent>
            {!isLocked && (
                 <CardFooter>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button className="w-full" size="lg" disabled={isSubmitting}>
                                <Send className="mr-2 h-4 w-4" />
                                Submit for Review
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure you want to submit?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Once you submit this summary, you will not be able to edit it unless a staff member requests a revision. Please confirm that all information is accurate.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleSubmitForReview} disabled={isSubmitting}>
                                     {isSubmitting ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                                    ) : 'Yes, Submit Now'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardFooter>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}

export default function ApplicationReviewPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <Suspense key={id} fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading Application...</p>
      </div>
    }>
      <ApplicationReviewPageContent />
    </Suspense>
  );
}
