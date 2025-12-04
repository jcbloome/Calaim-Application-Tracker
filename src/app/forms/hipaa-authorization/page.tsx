
'use client';

import React, { useState, useMemo, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileCheck2, AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import type { Application, FormStatus } from '@/lib/definitions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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

    const [signerType, setSignerType] = useState<'member' | 'representative' | ''>('');
    const [signerName, setSignerName] = useState('');
    const [signerRelationship, setSignerRelationship] = useState('');
    const [signatureDate, setSignatureDate] = useState('');

    const applicationDocRef = useMemo(() => {
        if (user && firestore && applicationId) {
            return doc(firestore, `users/${user.uid}/applications`, applicationId);
        }
        return null;
    }, [user, firestore, applicationId]);

    const { data: application, isLoading: isLoadingApplication } = useDoc<Application>(applicationDocRef);

    const isReadOnly = application?.status === 'Completed & Submitted' || application?.status === 'Approved';

    useEffect(() => {
        if (application) {
            const form = application.forms?.find(f => f.name === 'HIPAA Authorization');
            if (form && form.status === 'Completed') {
                setSignerType(form.signerType || '');
                setSignerName(form.signerName || '');
                setSignerRelationship(form.signerRelationship || '');
                setSignatureDate(form.dateCompleted ? new Date(form.dateCompleted.seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString());
            } else {
                 setSignatureDate(new Date().toLocaleDateString());
            }
        } else {
            setSignatureDate(new Date().toLocaleDateString());
        }
    }, [application]);


    const isSignatureValid = () => {
        if (!signerType || !signerName) return false;
        if (signerType === 'representative' && !signerRelationship) return false;
        return true;
    };

    const handleSubmit = async () => {
        if (!isSignatureValid()) {
            toast({
                variant: 'destructive',
                title: 'Incomplete Signature',
                description: 'Please complete all signature fields to continue.',
            });
            return;
        }

        if (!applicationId || !applicationDocRef) {
            toast({ variant: 'destructive', title: 'Error', description: 'Application ID is missing.' });
            return;
        }

        setIsLoading(true);

        const existingForms = application?.forms || [];
        const formIndex = existingForms.findIndex(form => form.name === 'HIPAA Authorization');

        const newFormData: Partial<FormStatus> = {
            status: 'Completed',
            signerType,
            signerName,
            signerRelationship: signerType === 'representative' ? signerRelationship : undefined,
            dateCompleted: Timestamp.now(),
        };

        let updatedForms: FormStatus[];

        if (formIndex > -1) {
            updatedForms = [
                ...existingForms.slice(0, formIndex),
                { ...existingForms[formIndex], ...newFormData },
                ...existingForms.slice(formIndex + 1),
            ];
        } else {
            updatedForms = [
                ...existingForms,
                { name: 'HIPAA Authorization', type: 'online-form', href: '/forms/hipaa-authorization', ...newFormData } as FormStatus
            ];
        }

        try {
            await setDoc(applicationDocRef, { forms: updatedForms, lastUpdated: Timestamp.now() }, { merge: true });
            toast({ title: 'HIPAA Form Completed', description: 'Your authorization has been recorded.', className: 'bg-green-100 text-green-900 border-green-200' });
            router.push(`/pathway?applicationId=${applicationId}`);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Error', description: error.message || 'Could not save your authorization.' });
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

                     {isReadOnly && (
                        <Alert variant="default" className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
                            <Lock className="h-4 w-4 !text-blue-800" />
                            <AlertTitle>Form Locked</AlertTitle>
                            <AlertDescription>
                                This form is part of a submitted application and is now read-only.
                            </AlertDescription>
                        </Alert>
                    )}

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
                                <h3 className="text-base font-semibold text-gray-800">Electronic Signature</h3>
                                <div className="space-y-4 mt-4">
                                    <RadioGroup onValueChange={(v) => setSignerType(v as any)} value={signerType} disabled={isReadOnly}>
                                        <Label>I am the:</Label>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="member" id="signer-member" />
                                                <Label htmlFor="signer-member">Member</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="representative" id="signer-rep" />
                                                <Label htmlFor="signer-rep">Authorized Representative</Label>
                                            </div>
                                        </div>
                                    </RadioGroup>
                                    
                                    {signerType === 'representative' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="signer-relationship">Relationship to Member</Label>
                                            <Input id="signer-relationship" value={signerRelationship} onChange={e => setSignerRelationship(e.target.value)} placeholder="e.g., Son, Daughter, Conservator" disabled={isReadOnly} />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <Label htmlFor="signer-name">Type Full Name to Sign</Label>
                                        <Input id="signer-name" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Your full legal name" disabled={isReadOnly} />
                                    </div>
                                     <div>
                                        <Label>Date Signed</Label>
                                        <Input value={signatureDate} readOnly disabled className="bg-muted" />
                                    </div>
                                </div>
                            </div>

                             {!isReadOnly && (
                                <>
                                <div className="p-4 border-t mt-6 space-y-4">
                                    <Alert>
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Legal Attestation</AlertTitle>
                                        <AlertDescription>
                                            By clicking the button below, I acknowledge that under penalty of perjury, I am the member or an authorized representative legally empowered to sign on behalf of the member.
                                        </AlertDescription>
                                    </Alert>
                                </div>

                                <Button onClick={handleSubmit} disabled={isLoading || !isSignatureValid()} className="w-full">
                                    {isLoading ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                                    ) : (
                                        <><FileCheck2 className="mr-2 h-4 w-4" /> Acknowledge and Complete</>
                                    )}
                                </Button>
                                </>
                             )}
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
