
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

import Step1 from '@/app/forms/cs-summary-form/components/Step1';
import Step2 from '@/app/forms/cs-summary-form/components/Step2';
import Step3 from '@/app/forms/cs-summary-form/components/Step3';
import Step4 from '@/app/forms/cs-summary-form/components/Step4';
import { formSchema, type FormValues } from '@/app/forms/cs-summary-form/schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const steps = [
    { id: 1, name: 'Member & Contact Info', fields: [
        'memberFirstName', 'memberLastName', 'memberAge', 'memberMrn', 'confirmMemberMrn', 'memberLanguage', 'memberCounty',
        'memberMediCalNum', 'confirmMemberMediCalNum', 'memberDob',
        'referrerPhone', 'referrerRelationship', 'agency',
        'bestContactFirstName', 'bestContactLastName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
        'secondaryContactFirstName', 'secondaryContactLastName', 'secondaryContactRelationship', 'secondaryContactPhone', 'secondaryContactEmail', 'secondaryContactLanguage',
        'hasCapacity', 'hasLegalRep', 'repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail'
    ]},
    { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentAddress', 'currentCity', 'currentState', 'currentZip', 'currentCounty', 'customaryLocationType', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty'] },
    { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'meetsPathwayCriteria', 'switchingHealthPlan', 'existingHealthPlan', 'snfDiversionReason'] },
    { id: 4, name: 'ISP & Facility Selection', fields: [
        'ispFirstName', 'ispLastName', 'ispRelationship', 'ispFacilityName', 'ispPhone', 'ispEmail', 
        'ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip', 'ispCounty', 
        'onALWWaitlist', 'hasPrefRCFE', 
        'rcfeName', 'rcfeAddress', 'rcfeAdminName', 'rcfeAdminPhone', 'rcfeAdminEmail'
    ]},
];

const formatErrorsForDisplay = (errors: FieldErrors<FormValues>): string => {
  const errorMessages = Object.entries(errors).map(([fieldName, error]) => {
    if (error && error.message) {
      return `${fieldName}: ${error.message}`;
    }
    return `${fieldName}: An unknown error occurred.`;
  });
  return errorMessages.join('\n');
};

function EditApplicationFormComponent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const applicationId = params.id as string;
    const userId = searchParams.get('userId');
    const initialStep = parseInt(searchParams.get('step') || '1', 10);
    const [currentStep, setCurrentStep] = useState(initialStep);
    const [isProcessing, setIsProcessing] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const methods = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { meetsPathwayCriteria: false },
    });

    const { formState: { errors, isValid }, trigger, getValues, handleSubmit, reset } = methods;

    useEffect(() => {
        const fetchApplicationData = async () => {
            if (applicationId && userId && firestore) {
                const docRef = doc(firestore, `users/${userId}/applications`, applicationId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    reset(docSnap.data());
                } else {
                    toast({ variant: 'destructive', title: 'Error', description: 'Application not found.' });
                    router.push('/admin/applications');
                }
            }
        };
        fetchApplicationData();
    }, [applicationId, userId, firestore, reset, router, toast]);

    const saveProgress = async () => {
        if (!userId || !firestore) return;
        const currentData = getValues();
        const docRef = doc(firestore, `users/${userId}/applications`, applicationId);
        const sanitizedData = Object.fromEntries(
            Object.entries(currentData).map(([key, value]) => [key, value === undefined ? null : value])
        );
        const dataToSave = { ...sanitizedData, lastUpdated: serverTimestamp() };

        try {
            await setDoc(docRef, dataToSave, { merge: true });
            toast({ title: 'Changes Saved', description: 'Your updates have been saved successfully.' });
        } catch (error: any) {
            toast({ variant: "destructive", title: "Save Error", description: `Could not save changes: ${error.message}` });
        }
    };

    const nextStep = async () => {
        const fields = steps[currentStep - 1].fields;
        const isValidStep = await trigger(fields as FieldPath<FormValues>[], { shouldFocus: true });
        if (!isValidStep) {
            setValidationError(`Please correct the errors on this step before proceeding.`);
            return;
        }
        setValidationError(null);
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
            window.scrollTo(0, 0);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            window.scrollTo(0, 0);
        }
    };

    const onInvalid = (errors: FieldErrors<FormValues>) => {
        const errorLog = formatErrorsForDisplay(errors);
        setValidationError(`Please check the form for the following errors:\n${errorLog}`);
    };

    const onSubmit = async (data: FormValues) => {
        setIsProcessing(true);
        await saveProgress();
        setIsProcessing(false);
        router.push(`/admin/applications/${applicationId}?userId=${userId}`);
    };

    if (isUserLoading || !user || !userId) {
        return (
            <div className="flex items-center justify-center h-[80vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4">Loading application editor...</p>
            </div>
        );
    }

    const progress = (currentStep / steps.length) * 100;

    return (
        <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <Button type="button" variant="outline" asChild>
                                <Link href={`/admin/applications/${applicationId}?userId=${userId}`}>
                                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Application
                                </Link>
                            </Button>
                        </div>
                        <span className="text-sm font-medium text-muted-foreground">
                            Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                        </span>
                    </div>
                    <Progress value={progress} className="w-full" />
                </div>

                <div className="min-h-[450px]">
                    {currentStep === 1 && <Step1 />}
                    {currentStep === 2 && <Step2 />}
                    {currentStep === 3 && <Step3 />}
                    {currentStep === 4 && <Step4 />}
                </div>

                <div className="mt-8 pt-5 border-t">
                    {validationError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Validation Error</AlertTitle>
                            <AlertDescription className="whitespace-pre-wrap text-xs font-mono bg-destructive-foreground text-destructive p-2 rounded-md">
                                {validationError}
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="flex justify-between">
                        <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                        </Button>
                        {currentStep < steps.length ? (
                            <Button type="button" onClick={nextStep}>Next</Button>
                        ) : (
                            <Button type="submit" disabled={isProcessing}>
                                {isProcessing ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                                ) : ( 'Save and Finish Editing' )}
                            </Button>
                        )}
                    </div>
                </div>
            </form>
        </FormProvider>
    );
}


export default function EditApplicationPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <EditApplicationFormComponent />
        </Suspense>
    );
}
