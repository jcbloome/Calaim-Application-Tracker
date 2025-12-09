
'use client';

import React, { useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Send, Edit, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import type { FormValues } from '../schema';
import type { FormStatus as FormStatusType, Application } from '@/lib/definitions';


const Field = ({ label, value, fullWidth = false }: { label: string; value?: string | number | null; fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value || <span className="font-normal text-gray-400">N/A</span>}</p>
    </div>
);

const Section = ({ title, children, editLink, isReadOnly }: { title: string; children: React.ReactNode; editLink: string, isReadOnly: boolean }) => (
    <div className="relative">
        {!isReadOnly && (
            <Button asChild variant="ghost" size="sm" className="absolute top-0 right-0">
                <Link href={editLink}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                </Link>
            </Button>
        )}
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </div>
    </div>
);

const getRequiredFormsForPathway = (pathway?: FormValues['pathway']): FormStatusType[] => {
  const commonForms: FormStatusType[] = [
    { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
    { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '/forms/hipaa-authorization' },
    { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '/forms/liability-waiver' },
    { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '/forms/freedom-of-choice' },
    { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
    { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
  ];

  if (pathway === 'SNF Diversion') {
    return [
      ...commonForms,
      { name: 'Declaration of Eligibility', status: 'Pending', type: 'Upload', href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  
  // SNF Transition
  return [
      ...commonForms,
      { name: 'SNF Facesheet', status: 'Pending', type: 'Upload', href: '#' },
  ];
};

// Safely formats a date that might be a Firestore Timestamp
const formatDate = (date: any) => {
    if (!date) return 'N/A';
    // Firestore Timestamps have a toDate() method
    if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'PPP');
    }
    // Handle if it's already a Date object or a valid date string
    try {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
            return format(parsedDate, 'PPP');
        }
    } catch (e) {
        // Fallthrough to return 'Invalid Date'
    }
    return 'Invalid Date';
};


function ReviewPageComponent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();

    const applicationId = searchParams.get('applicationId');

    const applicationDocRef = useMemo(() => {
        if (user && firestore && applicationId) {
            return doc(firestore, `users/${user.uid}/applications`, applicationId);
        }
        return null;
    }, [user, firestore, applicationId]);

    const { data: application, isLoading } = useDoc<Application & FormValues>(applicationDocRef);

    const handleConfirm = async () => {
        if (!applicationDocRef || !application) return;

        const requiredForms = getRequiredFormsForPathway(application.pathway as FormValues['pathway']);
        
        try {
            await setDoc(applicationDocRef, {
                status: 'In Progress',
                forms: requiredForms,
                lastUpdated: serverTimestamp()
            }, { merge: true });

            toast({
                title: "Information Saved!",
                description: "You will now be taken to the next steps.",
                duration: 2000,
            });

            router.push(`/pathway?applicationId=${applicationId}`);

        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: `Could not finalize application: ${error.message}`
            });
        }
    };


    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading your summary...</p>
            </div>
        );
    }

    if (!application) {
        return (
            <div className="flex items-center justify-center h-screen">
                <p>Application data not found.</p>
            </div>
        );
    }
    
    const isReadOnly = application.status === 'Completed & Submitted' || application.status === 'Approved';
    const dobFormatted = formatDate(application.memberDob);
    const editLink = (step: number) => `/forms/cs-summary-form?applicationId=${applicationId}&step=${step}`;

    return (
        <>
            <Header />
            <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
                <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
                     <div className="mb-6">
                         <Button variant="outline" asChild>
                            <Link href={isReadOnly ? `/pathway?applicationId=${applicationId}` : `/forms/cs-summary-form?applicationId=${applicationId}&step=4`}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to {isReadOnly ? 'Pathway' : 'Form'}
                            </Link>
                        </Button>
                    </div>

                    <Card className="shadow-lg">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="h-8 w-8 text-green-500" />
                                <div>
                                    <CardTitle className="text-2xl">Review Your Information</CardTitle>
                                    <CardDescription>Please review all the information below for accuracy before submitting.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-8">
                            <Section title="Member Information" editLink={editLink(1)} isReadOnly={isReadOnly}>
                                <Field label="First Name" value={application.memberFirstName} />
                                <Field label="Last Name" value={application.memberLastName} />
                                <Field label="Date of Birth" value={dobFormatted} />
                                <Field label="Age" value={(application as any).memberAge} />
                                <Field label="Medi-Cal Number" value={(application as any).memberMediCalNum} />
                                <Field label="Medical Record Number (MRN)" value={application.memberMrn} />
                                <Field label="Preferred Language" value={(application as any).memberLanguage} />
                                <Field label="County" value={application.memberCounty} />
                            </Section>

                            <Separator />

                            <Section title="Referrer Information" editLink={editLink(1)} isReadOnly={isReadOnly}>
                                <Field label="First Name" value={(application as any).referrerFirstName} />
                                <Field label="Last Name" value={(application as any).referrerLastName} />
                                <Field label="Email" value={(application as any).referrerEmail} />
                                <Field label="Phone" value={(application as any).referrerPhone} />
                                <Field label="Relationship to Member" value={(application as any).referrerRelationship} />
                                <Field label="Agency" value={(application as any).agency} />
                            </Section>
                            
                             <Separator />

                            <Section title="Primary Contact" editLink={editLink(1)} isReadOnly={isReadOnly}>
                                <Field label="First Name" value={(application as any).bestContactFirstName} />
                                <Field label="Last Name" value={(application as any).bestContactLastName} />
                                <Field label="Relationship" value={(application as any).bestContactRelationship} />
                                <Field label="Phone" value={(application as any).bestContactPhone} />
                                <Field label="Email" value={(application as any).bestContactEmail} />
                                <Field label="Language" value={(application as any).bestContactLanguage} />
                            </Section>
                            
                            <Separator />
                            
                             <Section title="Legal Representative" editLink={editLink(1)} isReadOnly={isReadOnly}>
                                <Field label="Member Has Capacity" value={(application as any).hasCapacity} />
                                <Field label="Has Legal Representative" value={(application as any).hasLegalRep} />
                                <Field label="Representative Name" value={(application as any).repName} />
                                <Field label="Representative Relationship" value={(application as any).repRelationship} />
                                <Field label="Representative Phone" value={(application as any).repPhone} />
                                <Field label="Representative Email" value={(application as any).repEmail} />
                            </Section>

                            <Separator />

                            <Section title="Location Information" editLink={editLink(2)} isReadOnly={isReadOnly}>
                                <Field label="Current Location" value={(application as any).currentLocation} fullWidth />
                                <Field label="Current Address" value={`${(application as any).currentAddress}, ${(application as any).currentCity}, ${(application as any).currentState} ${(application as any).currentZip}`} fullWidth />
                                <Field label="Customary Residence" value={`${(application as any).customaryAddress}, ${(application as any).customaryCity}, ${(application as any).customaryState} ${(application as any).customaryZip}`} fullWidth />
                            </Section>

                            <Separator />

                            <Section title="Health Plan &amp; Pathway" editLink={editLink(3)} isReadOnly={isReadOnly}>
                                <Field label="Health Plan" value={application.healthPlan} />
                                {application.healthPlan === 'Other' && (
                                    <>
                                        <Field label="Existing Plan" value={(application as any).existingHealthPlan} />
                                        <Field label="Switching Plans?" value={(application as any).switchingHealthPlan} />
                                    </>
                                )}
                                <Field label="Pathway" value={application.pathway} />
                                <Field label="Meets Criteria" value={(application as any).meetsPathwayCriteria ? 'Yes' : 'No'} fullWidth />
                                {application.pathway === 'SNF Diversion' && <Field label="Reason for Diversion" value={(application as any).snfDiversionReason} fullWidth />}
                            </Section>
                            
                            <Separator />

                            <Section title="ISP &amp; RCFE Information" editLink={editLink(4)} isReadOnly={isReadOnly}>
                                <Field label="ISP Contact Name" value={`${(application as any).ispFirstName} ${(application as any).ispLastName}`} />
                                <Field label="ISP Contact Phone" value={(application as any).ispPhone} />
                                <Field label="ISP Assessment Location" value={`${(application as any).ispAddress}, ${(application as any).ispCity}, ${(application as any).ispState}`} fullWidth />
                                <Field label="On ALW Waitlist?" value={(application as any).onALWWaitlist} />
                                <Field label="Has Preferred RCFE?" value={(application as any).hasPrefRCFE} />
                                <Field label="RCFE Name" value={(application as any).rcfeName} fullWidth />
                            </Section>

                            {!isReadOnly && (
                                <div className="pt-6 border-t">
                                    <Button className="w-full" size="lg" onClick={handleConfirm}>
                                        <Send className="mr-2 h-4 w-4" />
                                        Confirm &amp; Continue to Pathway
                                    </Button>
                                </div>
                            )}

                        </CardContent>
                    </Card>
                </div>
            </main>
        </>
    );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
      <ReviewPageComponent />
    </Suspense>
  );
}
