
'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, Timestamp, query, where, getDocs } from 'firebase/firestore';

import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';
import { Header } from '@/components/Header';
import type { FormStatus as FormStatusType } from '@/lib/definitions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formSchema, type FormValues } from './schema';


const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberDob', 'memberMrn', 'confirmMemberMrn', 'memberLanguage', 'memberCounty',
      'memberMediCalNum', 'confirmMemberMediCalNum',
      'referrerPhone', 'referrerRelationship', 'agency',
      'bestContactType', 'bestContactFirstName', 'bestContactLastName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'secondaryContactFirstName', 'secondaryContactLastName', 'secondaryContactRelationship', 'secondaryContactPhone', 'secondaryContactEmail', 'secondaryContactLanguage',
      'hasCapacity', 'hasLegalRep', 'repName', 'repRelationship', 'repPhone', 'repEmail'
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentAddress', 'currentCity', 'currentState', 'currentZip', 'currentCounty', 'copyAddress', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'meetsPathwayCriteria', 'switchingHealthPlan', 'existingHealthPlan', 'snfDiversionReason'] },
  { id: 4, name: 'ISP & Facility Selection', fields: [
      'ispFirstName', 'ispLastName', 'ispRelationship', 'ispFacilityName', 'ispPhone', 'ispEmail', 
      'ispCopyCurrent', 'ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip', 'ispCounty', 
      'onALWWaitlist', 'hasPrefRCFE', 
      'rcfeName', 'rcfeAddress', 'rcfeAdminName', 'rcfeAdminPhone', 'rcfeAdminEmail'
  ]},
];

const getRequiredFormsForPathway = (pathway?: FormValues['pathway']): FormStatusType[] => {
  const commonForms: FormStatusType[] = [
    { name: 'CS Member Summary', status: 'Completed', type: 'online-form', href: '/forms/cs-summary-form' },
    { name: 'Program Information', status: 'Pending', type: 'info', href: '/info' },
    { name: 'HIPAA Authorization', status: 'Pending', type: 'online-form', href: '/forms/hipaa-authorization' },
    { name: 'Liability Waiver', status: 'Pending', type: 'online-form', href: '/forms/liability-waiver' },
    { name: 'Freedom of Choice Waiver', status: 'Pending', type: 'online-form', href: '/forms/freedom-of-choice' },
  ];

  if (pathway === 'SNF Diversion') {
    return [
      ...commonForms,
      { name: 'Declaration of Eligibility', status: 'Pending', type: 'upload', href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  // Default to SNF Transition forms if pathway is not specified or is SNF Transition
  return commonForms;
};


function CsSummaryFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [applicationId, setApplicationId] = useState<string | null>(searchParams.get('applicationId'));
  const initialStep = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(initialStep);


  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      copyAddress: false,
      hasLegalRep: undefined,
      meetsPathwayCriteria: false, // Ensure this defaults to false
    },
    mode: 'onSubmit',
  });

  const { formState: { errors }, trigger, getValues, handleSubmit, reset } = methods;

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (applicationId && user && firestore) {
        const docRef = doc(firestore, `users/${user.uid}/applications`, applicationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          if (data.memberDob && typeof data.memberDob.toDate === 'function') {
            data.memberDob = data.memberDob.toDate();
          }
          
          reset(data);
        } else {
            setApplicationId(null);
            reset({
              referrerFirstName: user?.displayName?.split(' ')[0] || '',
              referrerLastName: user?.displayName?.split(' ')[1] || '',
              referrerEmail: user?.email || '',
              copyAddress: false,
              hasLegalRep: undefined,
              meetsPathwayCriteria: false,
            });
        }
      } else if (user && !applicationId) { // Handles case where it's a new form from the start
          reset({
              referrerFirstName: user?.displayName?.split(' ')[0] || '',
              referrerLastName: user?.displayName?.split(' ')[1] || '',
              referrerEmail: user?.email || '',
              copyAddress: false,
              hasLegalRep: undefined,
              meetsPathwayCriteria: false,
          });
      }
    };
    fetchApplicationData();
  }, [applicationId, user, firestore, reset]);

  // Dismiss validation toast when errors are resolved
  useEffect(() => {
    if (Object.keys(errors).length === 0 && activeToastId.current) {
      dismiss(activeToastId.current);
      activeToastId.current = null;
    }
  }, [errors, dismiss]);

  const saveProgress = async (isNavigating: boolean = false): Promise<string | null> => {
    if (!user || !firestore) {
        return null;
    }
  
    const currentData = getValues();
    let docId = applicationId;
  
    // Ensure we have an ID before saving, create one if it's a new form.
    if (!docId) {
      docId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
      setApplicationId(docId);
      // Update URL without a full reload to keep state
      if (isNavigating) {
        router.replace(`/forms/cs-summary-form?applicationId=${docId}`, { scroll: false });
      }
    }
  
    const docRef = doc(firestore, `users/${user.uid}/applications`, docId);
  
    const sanitizedData = Object.fromEntries(
      Object.entries(currentData).map(([key, value]) => [key, value === undefined ? null : value])
    );
  
    const dataToSave = {
      ...sanitizedData,
      id: docId,
      userId: user.uid,
      status: 'In Progress' as const,
      lastUpdated: serverTimestamp(),
    };
  
    try {
      await setDoc(docRef, dataToSave, { merge: true });
       if (!isNavigating) {
         toast({ title: 'Progress Saved', description: 'Your changes have been saved.' });
       }
       return docId; // Return the ID on successful save
    } catch (error: any) {
      if (!isNavigating) {
        toast({ variant: "destructive", title: "Save Error", description: `Could not save your progress: ${error.message}` });
      }
    }
    return null; // Return null on failure
  };


  const nextStep = async () => {
    const fields = steps[currentStep - 1].fields;
    const isValid = await trigger(fields as FieldPath<FormValues>[], { shouldFocus: true });
    
    if (!isValid) {
      console.error(`[Form Debug] Validation failed on Step ${currentStep}. Errors:`, errors);
      if (activeToastId.current) dismiss(activeToastId.current);
      const { id } = toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fix the errors on this page before continuing.",
      });
      activeToastId.current = id;
      return; // Stop advancement
    }

    if (activeToastId.current) dismiss(activeToastId.current);
    
    await saveProgress(true);
    if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
        window.scrollTo(0, 0);
    }
  };

  const prevStep = async () => {
    await saveProgress(true);
    if (currentStep > 1) {
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
  }

  const onInvalid = (errors: any) => {
    console.error("[Form Debug] Full form submission failed. Errors:", errors);
    const firstErrorStep = findFirstErrorStep(errors);
    if (firstErrorStep && firstErrorStep !== currentStep) {
        setCurrentStep(firstErrorStep);
        if (activeToastId.current) dismiss(activeToastId.current);
        const { id } = toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: `Please correct the errors on Step ${firstErrorStep}: ${steps[firstErrorStep - 1].name}.`,
        });
        activeToastId.current = id;
        return;
    }

    if (activeToastId.current) dismiss(activeToastId.current);
    const { id } = toast({
      variant: 'destructive',
      title: 'Submission Failed',
      description: 'Please check the form for errors and try again.',
    });
    activeToastId.current = id;
  };

  const checkForDuplicates = async (data: FormValues): Promise<boolean> => {
    if (!user || !firestore) return false;

    const appsRef = collection(firestore, `users/${user.uid}/applications`);
    
    const mrnQuery = query(appsRef, where("memberMrn", "==", data.memberMrn));
    const mrnSnap = await getDocs(mrnQuery);

    if (!mrnSnap.empty && mrnSnap.docs.some(doc => doc.id !== applicationId)) {
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
    if (!user || !firestore) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }

    const hasDuplicate = await checkForDuplicates(data);
    if (hasDuplicate) {
      return;
    }
  
    // Save progress and get the final ID.
    const finalAppId = await saveProgress(true);

    if (!finalAppId) {
         toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
         return;
    }
  
    const docRef = doc(firestore, `users/${user.uid}/applications`, finalAppId);
    
    // Sanitize data one last time before final save
    const sanitizedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
    );
    
    const finalData = {
      ...sanitizedData,
      lastUpdated: serverTimestamp(),
    };
  
    try {
      await setDoc(docRef, finalData, { merge: true });
      toast({
        title: 'Summary Complete!',
        description: 'Please review your information before continuing to the pathway.',
      });
      router.push(`/forms/cs-summary-form/review?applicationId=${finalAppId}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: `Could not submit your application: ${error.message}`,
      });
    }
  };

  if (isUserLoading || !user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-4">Loading user data...</p>
        </div>
      </div>
    );
  }

  const progress = (currentStep / steps.length) * 100;

  return (
    <>
      <Header />
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex-grow">
          <div className="container mx-auto px-4 py-8 sm:px-6">
            <div className="max-w-4xl mx-auto">
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
                {currentStep === 1 && <Step1 />}
                {currentStep === 2 && <Step2 />}
                {currentStep === 3 && <Step3 />}
                {currentStep === 4 && <Step4 />}
              </div>

              <div className="mt-8 pt-5 border-t flex justify-between">
                <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                </Button>

                {currentStep < steps.length ? (
                  <Button type="button" onClick={nextStep}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit">Review & Complete</Button>
                )}
              </div>
              
            </div>
          </div>
        </form>
      </FormProvider>
    </>
  );
}

export default function CsSummaryFormPage() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin"/></div>}>
      <CsSummaryFormComponent />
    </React.Suspense>
  );
}
