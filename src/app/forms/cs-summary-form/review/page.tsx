
'use client';

import React, { useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Send, Edit, CheckCircle2 } from 'lucide-react';
import { format, parse } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import type { FormValues } from '../schema';
import type { FormStatus as FormStatusType, Application } from '@/lib/definitions';


const Field = ({ label, value, fullWidth = false }: { label: string; value?: string | number | null; fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value || <span className="font-normal text-gray-400">N/A</span>}</p>
    </div>
);

const Section = ({ title, children, editLink, isReadOnly, isAdminView }: { title: string; children: React.ReactNode; editLink: string, isReadOnly: boolean, isAdminView: boolean }) => (
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
    { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '/forms/waivers' },
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

// Safely formats a date that might be a string or a Timestamp
const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (typeof date === 'string') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
            try {
                const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
                return format(parsedDate, 'PPP');
            } catch (e) {
                return date;
            }
        }
        try {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) {
                return format(parsedDate, 'PPP');
            }
        } catch (e) {
            // Fallthrough
        }
    }
    if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'PPP');
    }
    return 'Invalid Date';
};


function ReviewPageComponent({ isAdminView = false }: { isAdminView?: boolean }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const applicationId = searchParams.get('applicationId');
    const appUserId = searchParams.get('userId'); // For admins viewing a user's app
    const targetUserId = isAdminView ? appUserId : user?.uid;

    const applicationDocRef = useMemoFirebase(() => {
        if (isUserLoading || !firestore || !applicationId) {
            return null;
        }
        
        // Handle admin-created applications (stored in root applications collection)
        if (!targetUserId && applicationId?.startsWith('admin_app_')) {
            return doc(firestore, 'applications', applicationId);
        }
        
        // Handle user applications
        if (targetUserId) {
            return doc(firestore, `users/${targetUserId}/applications`, applicationId);
        }
        
        return null;
    }, [targetUserId, firestore, applicationId, isUserLoading]);

    const { data: application, isLoading } = useDoc<Application & FormValues>(applicationDocRef);

    const handleConfirm = async () => {
        if (!applicationDocRef || !application) return;

        const requiredForms = getRequiredFormsForPathway(application.pathway as FormValues['pathway']);
        
        try {
            const mrn = application.memberMrn?.trim();
            if (mrn) {
                const lookupResponse = await fetch(`/api/caspio-member-exists?mrn=${encodeURIComponent(mrn)}`);
                const lookupData = await lookupResponse.json();

                if (!lookupResponse.ok) {
                    throw new Error(lookupData?.error || 'Failed to verify medical record number');
                }

                if (lookupData?.exists) {
                    toast({
                        variant: 'destructive',
                        title: 'Medical Record Number Already Exists',
                        description: 'This medical record number already exists in Caspio. Please remove the Caspio record before submitting again.',
                    });
                    return;
                }
            }

            await setDoc(applicationDocRef, {
                status: 'In Progress',
                forms: requiredForms,
                lastUpdated: serverTimestamp(),
                // Mark CS Summary as completed for dashboard tracking
                csSummaryComplete: true,
                csSummaryCompletedAt: serverTimestamp(),
                csSummaryNotificationSent: false // Reset notification flag
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


    if (isLoading || isUserLoading) {
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
    const getEditLink = (step: number) => {
      const baseUrl = isAdminView ? '/admin/forms/edit' : '/forms/cs-summary-form';
      const userIdParam = isAdminView && appUserId ? `&userId=${appUserId}` : '';
      return `${baseUrl}?applicationId=${applicationId}&step=${step}${userIdParam}`;
    };
    const dobFormatted = formatDate(application.memberDob);

    const backLink = isAdminView 
      ? `/admin/applications/${applicationId}?userId=${appUserId}`
      : `/forms/cs-summary-form?applicationId=${applicationId}&step=4`;

    const getCapacityStatus = (hasLegalRepValue: Application['hasLegalRep']) => {
        switch(hasLegalRepValue) {
            case 'notApplicable':
            case 'same_as_primary':
            case 'different':
                return 'Yes, member has capacity';
            case 'no_has_rep': 
                return 'No, member lacks capacity';
            default: 
                return 'Yes, member has capacity';
        }
    }


    return (
        <div className="flex-grow py-8 sm:py-12">
            <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
                 <div className="mb-6">
                     <Button variant="outline" asChild>
                        <Link href={backLink}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Application Details
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
                        <Section title="Member Information" editLink={getEditLink(1)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="First Name" value={application.memberFirstName} />
                            <Field label="Last Name" value={application.memberLastName} />
                            <Field label="Date of Birth" value={dobFormatted} />
                            <Field label="Age" value={application.memberAge} />
                            <Field label="Medi-Cal Number" value={application.memberMediCalNum} />
                            <Field label="Medical Record Number (MRN)" value={application.memberMrn} />
                            <Field label="Preferred Language" value={application.memberLanguage} />
                            <Field label="County" value={application.currentCounty} />
                        </Section>

                        <Separator />

                        <Section title="Referrer Information" editLink={getEditLink(1)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="Name" value={application.referrerName} />
                            <Field label="Email" value={application.referrerEmail} />
                            <Field label="Phone" value={application.referrerPhone} />
                            <Field label="Relationship to Member" value={application.referrerRelationship} />
                            <Field label="Agency" value={application.agency} />
                        </Section>
                        
                         <Separator />

                        <Section title="Primary Contact" editLink={getEditLink(1)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="First Name" value={application.bestContactFirstName} />
                            <Field label="Last Name" value={application.bestContactLastName} />
                            <Field label="Relationship" value={application.bestContactRelationship} />
                            <Field label="Phone" value={application.bestContactPhone} />
                            <Field label="Email" value={application.bestContactEmail} />
                            <Field label="Language" value={application.bestContactLanguage} />
                        </Section>
                        
                        <Separator />
                        
                         <Section title="Legal Representative" editLink={getEditLink(1)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="Member Capacity Status" value={getCapacityStatus(application.hasLegalRep)} />
                            <Field label="Legal Representative Selection" value={application.hasLegalRep} />
                            <Field label="Representative First Name" value={application.repFirstName} />
                            <Field label="Representative Last Name" value={application.repLastName} />
                            <Field label="Representative Relationship" value={application.repRelationship} />
                            <Field label="Representative Phone" value={application.repPhone} />
                            <Field label="Representative Email" value={application.repEmail} />
                        </Section>

                        <Separator />

                        <Section title="Location Information" editLink={getEditLink(2)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="Current Location Type" value={application.currentLocation} />
                            <Field label="Current Address" value={`${application.currentAddress || ''}, ${application.currentCity || ''}, ${application.currentState || ''} ${application.currentZip || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} fullWidth />
                            <Field label="Customary Residence Location Type" value={application.customaryLocationType} />
                            <Field label="Customary Residence" value={`${application.customaryAddress || ''}, ${application.customaryCity || ''}, ${application.customaryState || ''} ${application.customaryZip || ''}`.replace(/, , /g, ', ').replace(/^, |, $/g, '')} fullWidth />
                        </Section>

                        <Separator />

                        <Section title="Health Plan &amp; Pathway" editLink={getEditLink(3)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
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

                        <Section title="ISP &amp; RCFE Information" editLink={getEditLink(4)} isReadOnly={isReadOnly} isAdminView={isAdminView}>
                            <Field label="ISP Contact Name" value={`${application.ispFirstName} ${application.ispLastName}`} />
                            <Field label="ISP Contact Phone" value={application.ispPhone} />
                            <Field label="ISP Assessment Location" value={application.ispAddress} fullWidth />
                            <Field label="On ALW Waitlist?" value={application.onALWWaitlist} />
                            <Field label="Has Preferred RCFE?" value={application.hasPrefRCFE} />
                            <Field label="RCFE Name" value={application.rcfeName} fullWidth />
                            <Field
                                label="Preferred RCFE Cities"
                                value={application.rcfePreferredCities}
                                fullWidth
                            />
                            <Field
                                label="RCFE Administrator"
                                value={[application.rcfeAdminFirstName, application.rcfeAdminLastName].filter(Boolean).join(' ')}
                                fullWidth
                            />
                            <Field label="Administrator Phone" value={application.rcfeAdminPhone} />
                            <Field label="Administrator Email" value={application.rcfeAdminEmail} />
                        </Section>

                        {!isReadOnly && !isAdminView && (
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
        </div>
    );
}

function ReviewPageWrapper() {
  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50">
        <ReviewPageComponent isAdminView={false} />
      </main>
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
      <ReviewPageWrapper />
    </Suspense>
  );
}
