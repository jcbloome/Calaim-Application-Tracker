
'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, Timestamp, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import { formSchema, type FormValues } from '../schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Application } from '@/lib/definitions';

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberAge', 'memberMrn', 'confirmMemberMrn', 'memberLanguage', 'memberCounty',
      'memberMediCalNum', 'confirmMemberMediCalNum', 'memberDob',
      'referrerFirstName', 'referrerLastName', 'referrerPhone', 'referrerRelationship', 'agency',
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

// Function to format the errors object into a user-friendly string
const formatErrorsForDisplay = (errors: FieldErrors<FormValues>): string => {
  const errorMessages = Object.entries(errors).map(([fieldName, error]) => {
    if (error && error.message) {
      return `${fieldName}: ${error.message}`;
    }
    return `${fieldName}: An unknown error occurred.`;
  });
  return errorMessages.join('\n');
};

function CsSummaryFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const applicationId = searchParams.get('applicationId');
  const appUserId = searchParams.get('userId'); // For admins editing a user's app

  const [internalApplicationId, setInternalApplicationId] = useState<string | null>(applicationId);
  const [existingApplicationData, setExistingApplicationData] = useState<Application | null>(null);
  const initialStep = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      meetsPathwayCriteria: false,
    },
  });

  const { formState: { errors, isValid }, trigger, getValues, handleSubmit, reset } = methods;

  const targetUserId = appUserId || user?.uid;
  const isAdminView = !!appUserId;
  const backLink = isAdminView ? `/admin/applications/${internalApplicationId}?userId=${appUserId}` : `/applications`;

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (internalApplicationId && targetUserId && firestore) {
        const docRef = doc(firestore, `users/${targetUserId}/applications`, internalApplicationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Application;
          setExistingApplicationData(data);
          reset(data as FormValues);
        } else {
            setInternalApplicationId(null);
            setExistingApplicationData(null);
            if (user && !isAdminView) { // Only reset referrer for new user forms
                const displayName = user.displayName || '';
                const nameParts = displayName.split(' ');
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                reset({
                    ...getValues(), // keep existing data
                    referrerFirstName: firstName,
                    referrerLastName: lastName,
                    referrerEmail: user.email || '',
                    meetsPathwayCriteria: false,
                });
            }
        }
      } else if (user && !internalApplicationId && !isAdminView) {
          const displayName = user.displayName || '';
          const nameParts = displayName.split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          reset({
              referrerFirstName: firstName,
              referrerLastName: lastName,
              referrerEmail: user.email || '',
              meetsPathwayCriteria: false,
          });
      }
    };
    fetchApplicationData();
  }, [internalApplicationId, targetUserId, user, firestore, reset, isAdminView, getValues]);


  useEffect(() => {
    if (isValid && validationError) {
      setValidationError(null);
    }
  }, [isValid, validationError]);

  const saveProgress = async (isNavigating: boolean = false): Promise<string | null> => {
    if (!targetUserId || !firestore) {
        return null;
    }
  
    const currentData = getValues();
    let docId = internalApplicationId;
  
    if (!docId) {
      docId = doc(collection(firestore, `users/${targetUserId}/applications`)).id;
      setInternalApplicationId(docId);
      const newUrl = `/forms/cs-summary-form?applicationId=${docId}&step=${currentStep}${appUserId ? `&userId=${appUserId}`: ''}`;
      router.replace(newUrl, { scroll: false });
    }
  
    const docRef = doc(firestore, `users/${targetUserId}/applications`, docId);
  
    const sanitizedData = Object.fromEntries(
      Object.entries(currentData).map(([key, value]) => [key, value === undefined ? null : value])
    );
  
    const dataToSave = {
      ...sanitizedData,
      id: docId,
      userId: targetUserId,
      status: 'In Progress' as const,
      lastUpdated: serverTimestamp(),
      // Only set referrerName on initial creation, otherwise keep existing
      ...( !existingApplicationData?.referrerName && { referrerName: `${currentData.referrerFirstName} ${currentData.referrerLastName}`.trim() } ),
    };
  
    try {
      await setDoc(docRef, dataToSave, { merge: true });
       if (!isNavigating) {
         toast({ title: 'Progress Saved', description: 'Your changes have been saved.' });
       }
       return docId;
    } catch (error: any) {
      if (!isNavigating) {
        toast({ variant: "destructive", title: "Save Error", description: `Could not save your progress: ${error.message}` });
      }
    }
    return null;
  };

  const nextStep = async () => {
    const fields = steps[currentStep - 1].fields;
    const isValid = await trigger(fields as FieldPath<FormValues>[], { shouldFocus: true });
    
    if (!isValid) {
      const detailedErrors = formatErrorsForDisplay(errors);
      setValidationError(`Please correct the following errors:\n${detailedErrors}`);
      return;
    }

    setValidationError(null);
    
    if (currentStep < steps.length) {
        const savedAppId = await saveProgress(true);
        if(savedAppId) {
          const newUrl = `${appUserId ? '/admin' : ''}/forms/cs-summary-form?applicationId=${savedAppId}&step=${currentStep + 1}${appUserId ? `&userId=${appUserId}`: ''}`;
          router.push(newUrl);
          setCurrentStep(currentStep + 1);
          window.scrollTo(0, 0);
        }
    }
  };

  const prevStep = async () => {
    const savedAppId = await saveProgress(true);
    if (currentStep > 1 && savedAppId) {
      const newUrl = `${appUserId ? '/admin' : ''}/forms/cs-summary-form?applicationId=${savedAppId}&step=${currentStep - 1}${appUserId ? `&userId=${appUserId}`: ''}`;
      router.push(newUrl);
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };
  
  const findFirstErrorStep = (errors: any) => {
    for (const step of steps) {
        const hasError = step.fields.some(field => errors[field]);
        if (hasError) {
            return step.id;
        }
    }
    return null;
  };

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    const errorLog = formatErrorsForDisplay(errors);
    console.log("Form Validation Failed:", errors);
    
    const firstErrorStep = findFirstErrorStep(errors);
    if (firstErrorStep && firstErrorStep !== currentStep) {
        setCurrentStep(firstErrorStep);
        setValidationError(`Please correct errors on Step ${firstErrorStep} (and other steps):\n${errorLog}`);
        return;
    }

    setValidationError(`Please check the form for the following errors:\n${errorLog}`);
  };

  const checkForDuplicates = async (data: FormValues): Promise<boolean> => {
    if (!targetUserId || !firestore) return false;

    const appsRef = collection(firestore, `users/${targetUserId}/applications`);
    
    const mrnQuery = query(appsRef, where("memberMrn", "==", data.memberMrn));
    const mrnSnap = await getDocs(mrnQuery);

    if (!mrnSnap.empty && mrnSnap.docs.some(doc => doc.id !== internalApplicationId)) {
      toast({
        variant: 'destructive',
        title: 'Duplicate Application Found',
        description: `An application with MRN ${data.memberMrn} already exists.`,
      });
      return true;
    }
    
    return false;
  };

  const onSubmit = async (data: FormValues) => {
    setIsProcessing(true);

    if (!targetUserId || !firestore) {
      toast({ variant: "destructive", title: "Error", description: "User session not found." });
      setIsProcessing(false);
      return;
    }

    const hasDuplicate = await checkForDuplicates(data);
    if (hasDuplicate) {
      setIsProcessing(false);
      return;
    }
  
    const finalAppId = await saveProgress(true);

    if (!finalAppId) {
         toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
         setIsProcessing(false);
         return;
    }
  
    const docRef = doc(firestore, `users/${targetUserId}/applications`, finalAppId);
    
    const sanitizedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
    );
    
    const finalData = {
      ...sanitizedData,
      lastUpdated: serverTimestamp(),
      referrerName: `${data.referrerFirstName} ${data.referrerLastName}`.trim(),
    };
  
    try {
      await setDoc(docRef, finalData, { merge: true });
      const reviewUrl = `${appUserId ? '/admin' : ''}/forms/cs-summary-form/review?applicationId=${finalAppId}${appUserId ? `&userId=${appUserId}`: ''}`;
      router.push(reviewUrl);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: `Could not submit your application: ${error.message}`,
      });
    } finally {
        setIsProcessing(false);
    }
  };

  if (isUserLoading || (!targetUserId && !isUserLoading)) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading user data...</p>
      </div>
    );
  }

  const progress = (currentStep / steps.length) * 100;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex-grow">
        <div className="container mx-auto px-4 py-8 sm:px-6">
          <div className="max-w-4xl mx-auto">
             {isAdminView && internalApplicationId && (
                <div className="mb-6">
                    <Button variant="outline" asChild>
                        <Link href={backLink}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Application Details
                        </Link>
                    </Button>
                </div>
            )}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-4">
                       <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                           <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                       </Button>
                        <h1 className="text-2xl font-bold hidden sm:block">CS Member Summary</h1>
                   </div>
                  <span className="text-sm font-medium text-muted-foreground">
                      Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                  </span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>

            <div className="min-h-[450px]">
              {currentStep === 1 && <Step1 isAdminView={isAdminView} />}
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
                    <Button type="button" onClick={nextStep}>
                      Next
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isProcessing}>
                      {isProcessing ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                      ) : (
                          'Review & Complete'
                      )}
                    </Button>
                  )}
              </div>
            </div>
            
          </div>
        </div>
      </form>
    </FormProvider>
  );
}

export default function CsSummaryFormCorePage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
      <CsSummaryFormComponent />
    </React.Suspense>
  );
}
