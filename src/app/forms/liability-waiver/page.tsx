
'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function PrintableLiabilityWaiverContent() {
  return (
    <div className="prose prose-xs max-w-none text-gray-700 space-y-2">
        <p><strong>Intention.</strong> The purpose of this agreement ('Agreement') is to forever release and discharge Connections Care Home Consultants, LLC (the 'Company') and all its agents, officers, and employees (collectively referred to as 'Releasees') from all liability for injury or damages that may arise out of the resident/client's ('Resident') participation in the Community Supports program ('Program'). Resident understands that this Agreement covers liability, claims, and actions caused in whole or in part by any acts or failures to act of the Releasees, including, but not limited to, negligence, fault, or breach of contract.</p>
        <p><strong>Release and Discharge.</strong> Resident does hereby release and forever discharge the Releasees from all liability, claims, demands, actions, and causes of action of any kind, arising from or related to any loss, damage, or injury, including death, that may be sustained by Resident or any property belonging to Resident, whether caused by the negligence of the Releasees or otherwise, while participating in the Program, or while in, on, or upon the premises where the Program is being conducted, or while in transit to or from the Program.</p>
        <p><strong>Assumption of Risk.</strong> Resident understands that their participation in the Program may involve a risk of injury or even death from various causes. Resident assumes all possible risks, both known and unknown, of participating in the Program and agrees to release, defend, indemnify, and hold harmless the Releasees from any injury, loss, liability, damage, or cost they may incur due to their participation in the Program.</p>
        <p><strong>Indemnification.</strong> Resident agrees to indemnify, defend, and hold harmless the Releasees from and against all liability, claims, actions, damages, costs, or expenses of any nature whatsoever for any injury, loss, or damage to persons or property that may arise out of or be related to Resident's participation in the Program. Resident agrees that this indemnification obligation survives the expiration or termination of this Agreement.</p>
        <p><strong>No Insurance.</strong> Resident understands that the Company does not assume any responsibility for or obligation to provide financial assistance or other assistance, including but not limited to medical, health, or disability insurance, in the event of injury or illness. Resident understands that they are not covered by any medical, health, accident, or life insurance provided by the Company and is responsible for providing their own insurance.</p>
        <p><strong>Representations.</strong> Resident represents that they are in good health and in proper physical condition to safely participate in the Program. Resident further represents that they will participate safely and will not commit any act that will endanger their safety or the safety of others.</p>
        <p><strong>Acknowledgment.</strong> Resident acknowledges that they have read this Agreement in its entirety and understands its content. Resident is aware that this is a release of liability and a contract of indemnity, and they sign it of their own free will.</p>
    </div>
  );
}


function LiabilityWaiverFormComponent() {
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

        const existingForms = application?.forms || [];
        const formIndex = existingForms.findIndex(form => form.name === 'Liability Waiver');

        let updatedForms: FormStatus[];

        if (formIndex > -1) {
            updatedForms = [
                ...existingForms.slice(0, formIndex),
                { ...existingForms[formIndex], status: 'Completed', dateCompleted: Timestamp.now() },
                ...existingForms.slice(formIndex + 1),
            ];
        } else {
            updatedForms = [
                ...existingForms,
                { name: 'Liability Waiver', status: 'Completed', type: 'online-form', href: '/forms/liability-waiver', dateCompleted: Timestamp.now() }
            ];
        }

        try {
            await setDoc(applicationDocRef, {
                forms: updatedForms,
                lastUpdated: Timestamp.now(),
            }, { merge: true });

            toast({
                title: 'Liability Waiver Completed',
                description: 'Your agreement has been recorded.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            router.push(`/pathway?applicationId=${applicationId}`);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Submission Error',
                description: error.message || 'Could not save your agreement.',
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
                            <CardTitle className="text-2xl">Participant Liability Waiver & Hold Harmless Agreement</CardTitle>
                            <CardDescription>Please carefully review the following liability waiver and sign below.</CardDescription>
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
                            
                            <PrintableLiabilityWaiverContent />

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
                                    By clicking "Acknowledge and Complete" you are electronically signing and agreeing to the terms outlined in this Liability Waiver.
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


export default function LiabilityWaiverPage() {
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
            <LiabilityWaiverFormComponent />
        </Suspense>
    );
}
