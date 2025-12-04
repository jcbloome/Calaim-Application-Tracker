
'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function PrintableHipaaFormContent() {
    return (
      <div className="prose prose-sm max-w-none text-gray-700 space-y-3">
            <p>This form, when completed and signed by you, authorizes the use and/or disclosure of your protected health information. The information authorized for release may include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.</p>
            <div>
                <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to make the disclosure:</h3>
                <p>any health care related agency or person providing information for the purpose of applying for the CalAIM CS for Assisted Living Transitions</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">Person(s) or organization(s) authorized to receive the information:</h3>
                <p>Connections Care Home Consultants, LLC</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">Specific information to be disclosed:</h3>
                <p>All medical records necessary for Community Supports (CS) application.</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">The information will be used for the following purpose:</h3>
                <p>To determine eligibility and arrange services for CS for Assisted Living Transitions.</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">This authorization expires:</h3>
                <p>One year from the date of signature.</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">My rights:</h3>
                <p>I understand that I may refuse to sign this authorization. My healthcare treatment is not dependent on my signing this form. I may revoke this authorization at any time by writing to the disclosing party, but it will not affect any actions taken before the revocation was received. A copy of this authorization is as valid as the original. I understand that information disclosed pursuant to this authorization may be subject to re-disclosure by the recipient and may no longer be protected by federal privacy regulations.</p>
            </div>
            <div>
                <h3 className="font-semibold text-gray-800">Redisclosure:</h3>
                <p>I understand that the person(s) or organization(s) I am authorizing to receive my information may not be required to protect it under federal privacy laws (HIPAA). Therefore, the information may be re-disclosed without my consent.</p>
            </div>
        </div>
    )
}

function HipaaAuthorizationFormComponent() {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const applicationId = searchParams.get('applicationId');
    const { user } = useUser();
    const firestore = useFirestore();
    const [signatureDate, setSignatureDate] = useState('');

    useEffect(() => {
        setSignatureDate(new Date().toLocaleDateString());
    }, []);

    const applicationDocRef = useMemo(() => {
        if (user && firestore && applicationId) {
            return doc(firestore, `users/${user.uid}/applications`, applicationId);
        }
        return null;
    }, [user, firestore, applicationId]);

    const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);

    const handleSubmit = async () => {
        if (!applicationId || !applicationDocRef) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Application ID is missing.',
            });
            return;
        }

        setIsLoading(true);

        // Find the existing form status
        const existingForms = application?.forms || [];
        const formIndex = existingForms.findIndex(form => form.name === 'HIPAA Authorization');

        let updatedForms: FormStatus[];

        if (formIndex > -1) {
            // Update the status of the existing form
            updatedForms = [
                ...existingForms.slice(0, formIndex),
                { ...existingForms[formIndex], status: 'Completed', dateCompleted: Timestamp.now() },
                ...existingForms.slice(formIndex + 1),
            ];
        } else {
            // This case is unlikely if the flow starts from pathway, but good to handle
            updatedForms = [
                ...existingForms,
                { name: 'HIPAA Authorization', status: 'Completed', type: 'online-form', href: '/forms/hipaa-authorization', dateCompleted: Timestamp.now() }
            ];
        }

        try {
            await setDoc(applicationDocRef, {
                forms: updatedForms,
                lastUpdated: Timestamp.now(),
            }, { merge: true });

            toast({
                title: 'HIPAA Form Completed',
                description: 'Your authorization has been recorded.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            router.push(`/pathway?applicationId=${applicationId}`);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Submission Error',
                description: error.message || 'Could not save your authorization.',
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
                            <CardTitle className="text-2xl">HIPAA Authorization Form</CardTitle>
                            <CardDescription>Authorization for Use or Disclosure of Protected Health Information (PHI).</CardDescription>
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
                            
                            <PrintableHipaaFormContent />
                            
                            <div className="mt-8 pt-6 border-t">
                                <h3 className="text-base font-semibold text-gray-800">Signature</h3>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4 text-sm">
                                    <div>
                                        <p className="text-gray-500">Signed by (Full Name)</p>
                                        <p className="font-semibold">{user?.displayName || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-500">Date Signed</p>
                                        <p className="font-semibold">{signatureDate}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t mt-6 space-y-4">
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Legal Attestation</AlertTitle>
                                    <AlertDescription>
                                        By clicking the button below, I acknowledge that under penalty of perjury, I am the member or an authorized representative legally empowered to sign on behalf of the member.
                                    </AlertDescription>
                                </Alert>
                                <p className="text-sm text-muted-foreground">
                                    By clicking "Acknowledge and Complete" you are electronically signing and agreeing to the terms outlined in this HIPAA Authorization form.
                                </p>
                            </div>

                            <Button onClick={handleSubmit} disabled={isLoading} className="w-full">
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


export default function HipaaAuthorizationPage() {
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
            <HipaaAuthorizationFormComponent />
        </Suspense>
    );
}
