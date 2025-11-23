
'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

function PrintableFreedomOfChoiceContent() {
  return (
    <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
        <p>I understand I have a choice to receive services in the community. Community Supports for Community Transition are available to help me. I can choose to accept or decline these services.</p>
        <p>If I accept these services, I will receive assistance from Connections Care Home Consultants to move into a community-based setting like an assisted living facility. They will help me find a place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by my Managed Care Plan.</p>
        <p>If I decline these services, I am choosing to remain where I am, and I will not receive the transition support services offered by this program at this time.</p>
    </div>
  );
}


function FreedomOfChoiceFormComponent() {
    const [choice, setChoice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
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

    const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);

    const handleSubmit = async () => {
        if (!choice) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'You must make a choice to continue.',
            });
            return;
        }

        if (!applicationId || !applicationDocRef) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Application ID is missing.',
            });
            return;
        }

        setIsLoading(true);

        const existingForms = application?.forms || [];
        const formIndex = existingForms.findIndex(form => form.name === 'Freedom of Choice Waiver');

        let updatedForms: FormStatus[];

        if (formIndex > -1) {
            updatedForms = [
                ...existingForms.slice(0, formIndex),
                { ...existingForms[formIndex], status: 'Completed', choice, dateCompleted: Timestamp.now() },
                ...existingForms.slice(formIndex + 1),
            ];
        } else {
            updatedForms = [
                ...existingForms,
                { name: 'Freedom of Choice Waiver', status: 'Completed', type: 'online-form', href: '/forms/freedom-of-choice', choice, dateCompleted: Timestamp.now() }
            ];
        }

        try {
            await setDoc(applicationDocRef, {
                forms: updatedForms,
                lastUpdated: Timestamp.now(),
            }, { merge: true });

            toast({
                title: 'Freedom of Choice Waiver Completed',
                description: 'Your choice has been recorded.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            router.push(`/pathway?applicationId=${applicationId}`);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Submission Error',
                description: error.message || 'Could not save your choice.',
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    if (isLoadingApplication) {
        return (
             <div className="flex-grow flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading Application Data...</p>
            </div>
        )
    }

    return (
        <>
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8 sm:px-6">
                <div className="max-w-3xl mx-auto">
                     <div className="mb-6">
                         <Button variant="outline" asChild>
                            <Link href={`/pathway?applicationId=${applicationId}`}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Pathway
                            </Link>
                        </Button>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">Freedom of Choice Waiver</CardTitle>
                            <CardDescription>Acknowledge your choice regarding Community Supports services.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                     <div>
                                        <h3 className="text-sm font-medium text-muted-foreground">Member Name</h3>
                                        <p className="font-semibold">{application?.memberFirstName} {application?.memberLastName}</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-muted-foreground">Medical Record Number</h3>
                                        <p className="font-semibold font-mono text-sm">{application?.memberMrn}</p>
                                    </div>
                                </div>
                            </div>

                            <PrintableFreedomOfChoiceContent />

                            <div className="p-4 border rounded-md space-y-3">
                                <h3 className="font-medium text-base">My Choice</h3>
                                 <RadioGroup onValueChange={setChoice} value={choice}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="accept" id="accept" />
                                        <Label htmlFor="accept">I choose to accept Community Supports services for community transition.</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="decline" id="decline" />
                                        <Label htmlFor="decline">I choose to decline Community Supports services for community transition.</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                             <div className="p-4 border-t mt-6">
                                <p className="text-sm text-muted-foreground">
                                    By clicking "Acknowledge and Complete" you are electronically signing and agreeing to the choice you have made above.
                                </p>
                            </div>

                            <Button onClick={handleSubmit} disabled={isLoading || !choice} className="w-full">
                                {isLoading ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                                ) : (
                                    <><FileCheck2 className="mr-2 h-4 w-4" /> Acknowledge and Complete</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}


export default function FreedomOfChoicePage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col min-h-screen">
                <Header />
                <div className="flex-grow flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-4">Loading...</p>
                </div>
            </div>
        }>
            <FreedomOfChoiceFormComponent />
        </Suspense>
    );
}
