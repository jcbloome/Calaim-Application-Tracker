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
import type { FormStatus as FormStatusType } from '@/lib/definitions';


const Field = ({ label, value, fullWidth = false }: { label: string; value?: string | number | null; fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value || <span className="font-normal text-gray-400">N/A</span>}</p>
    </div>
);

const Section = ({ title, children, editLink }: { title: string; children: React.ReactNode; editLink: string }) => (
    <div className="relative">
        <Button asChild variant="ghost" size="sm" className="absolute top-0 right-0">
            <Link href={editLink}>
                <Edit className="mr-2 h-4 w-4" /> Edit
            </Link>
        </Button>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </div>
    </div>
);

const getRequiredFormsForPathway = (pathway?: FormValues['pathway']): FormStatusType[] => {
  const commonForms: FormStatusType[] = [
    { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
    { name: 'Program Information', status: 'Pending', type: 'info', href: '/info' },
    { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '/forms/hipaa-authorization' },
    { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '/forms/liability-waiver' },
    { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '/forms/freedom-of-choice' },
    { name: 'Proof of Income', status: 'Pending', type: 'upload', href: '#' },
    { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'upload', href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { name: 'Medicine List', status: 'Pending', type: 'upload', href: '#' },
    // Bundles are implicitly handled now but we still need status objects for them to exist.
    { name: 'Medical Documents Bundle', status: 'Pending', type: 'bundle', href: '#' },
    { name: 'Waivers & Forms Bundle', status: 'Pending', type: 'bundle', href: '/forms/printable-package/full-package' },
  ];

  if (pathway === 'SNF Diversion') {
    return [
      ...commonForms,
      { name: 'Declaration of Eligibility', status: 'Pending', type: 'upload', href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  
  return [
      ...commonForms,
      { name: 'SNF Facesheet', status: 'Pending', type: 'upload', href: '#' },
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

    const { data: application, isLoading } = useDoc<FormValues>(applicationDocRef);

    const handleConfirm = async () => {
        if (!applicationDocRef || !application) return;

        const requiredForms = getRequiredFormsForPathway(application.pathway);
        
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
    
    const dobFormatted = formatDate(application.memberDob);
    const editLink = (step: number) => `/forms/cs-summary-form?applicationId=${applicationId}&step=${step}`;

    return (
        <>
            <Header />
            <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
                <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
                     <div className="mb-6">
                         <Button variant="outline" asChild>
                            <Link href={`/forms/cs-summary-form?applicationId=${applicationId}&step=4`}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Form
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
                            <Section title="Member Information" editLink={editLink(1)}>
                                <Field label="First Name" value={application.memberFirstName} />
                                <Field label="Last Name" value={application.memberLastName} />
                                <Field label="Date of Birth" value={dobFormatted} />
                                <Field label="Age" value={application.memberAge} />
                                <Field label="Medi-Cal Number" value={application.memberMediCalNum} />
                                <Field label="Medical Record Number (MRN)" value={application.memberMrn} />
                                <Field label="Preferred Language" value={application.memberLanguage} />
                                <Field label="County" value={application.memberCounty} />
                            </Section>

                            <Separator />

                            <Section title="Referrer Information" editLink={editLink(1)}>
                                <Field label="First Name" value={application.referrerFirstName} />
                                <Field label="Last Name" value={application.referrerLastName} />
                                <Field label="Email" value={application.referrerEmail} />
                                <Field label="Phone" value={application.referrerPhone} />
                                <Field label="Relationship to Member" value={application.referrerRelationship} />
                                <Field label="Agency" value={application.agency} />
                            </Section>
                            
                             <Separator />

                            <Section title="Primary Contact" editLink={editLink(1)}>
                                <Field label="First Name" value={application.bestContactFirstName} />
                                <Field label="Last Name" value={application.bestContactLastName} />
                                <Field label="Relationship" value={application.bestContactRelationship} />
                                <Field label="Phone" value={application.bestContactPhone} />
                                <Field label="Email" value={application.bestContactEmail} />
                                <Field label="Language" value={application.bestContactLanguage} />
                            </Section>
                            
                            <Separator />
                            
                             <Section title="Legal Representative" editLink={editLink(1)}>
                                <Field label="Member Has Capacity" value={application.hasCapacity} />
                                <Field label="Has Legal Representative" value={application.hasLegalRep} />
                                <Field label="Representative Name" value={application.repName} />
                                <Field label="Representative Relationship" value={application.repRelationship} />
                                <Field label="Representative Phone" value={application.repPhone} />
                                <Field label="Representative Email" value={application.repEmail} />
                            </Section>

                            <Separator />

                            <Section title="Location Information" editLink={editLink(2)}>
                                <Field label="Current Location" value={application.currentLocation} fullWidth />
                                <Field label="Current Address" value={`${application.currentAddress}, ${application.currentCity}, ${application.currentState} ${application.currentZip}`} fullWidth />
                                <Field label="Customary Residence" value={`${application.customaryAddress}, ${application.customaryCity}, ${application.customaryState} ${application.customaryZip}`} fullWidth />
                            </Section>

                            <Separator />

                            <Section title="Health Plan &amp; Pathway" editLink={editLink(3)}>
                                <Field label="Health Plan" value={application.healthPlan} />
                                {application.healthPlan === 'Other' && (
                                    <>
                                        <Field label="Existing Plan" value={application.existingHealthPlan} />
                                        <Field label="Switching Plans?" value={application.switchingHealthPlan} />
                                    </>
                                )}
                                <Field label="Pathway" value={application.pathway} />
                                <Field label="Meets Criteria" value={application.meetsPathwayCriteria ? 'Yes' : 'No'} fullWidth />
                                {application.pathway === 'SNF Diversion' && <Field label="Reason for Diversion" value={application.snfDiversionReason} fullWidth />}
                            </Section>
                            
                            <Separator />

                            <Section title="ISP &amp; RCFE Information" editLink={editLink(4)}>
                                <Field label="ISP Contact Name" value={`${application.ispFirstName} ${application.ispLastName}`} />
                                <Field label="ISP Contact Phone" value={application.ispPhone} />
                                <Field label="ISP Assessment Location" value={`${application.ispAddress}, ${application.ispCity}, ${application.ispState}`} fullWidth />
                                <Field label="On ALW Waitlist?" value={application.onALWWaitlist} />
                                <Field label="Has Preferred RCFE?" value={application.hasPrefRCFE} />
                                <Field label="RCFE Name" value={application.rcfeName} fullWidth />
                            </Section>

                            <div className="pt-6 border-t">
                                <Button className="w-full" size="lg" onClick={handleConfirm}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Confirm &amp; Continue to Pathway
                                </Button>
                            </div>

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
