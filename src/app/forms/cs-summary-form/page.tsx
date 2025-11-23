
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, Timestamp } from 'firebase/firestore';

import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';
import { Header } from '@/components/Header';
import type { FormStatus as FormStatusType } from '@/lib/definitions';


const requiredString = z.string().min(1, { message: 'This field is required.' });

// This schema is now simplified. All fields are either universally required or fully optional.
// The UI will instruct users to enter "N/A" for fields that are not applicable.
const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: z.date({ required_error: 'Date of birth is required.' }),
    memberAge: z.number().optional(),
    memberMediCalNum: requiredString,
    memberMrn: requiredString,
    memberLanguage: requiredString,
    
    // Step 1 - Referrer Info
    referrerFirstName: z.string().optional(),
    referrerLastName: z.string().optional(),
    referrerEmail: z.string().optional(),
    referrerPhone: requiredString,
    referrerRelationship: requiredString,
    agency: z.string().optional(),

    // Step 1 - Member Contact
    memberPhone: z.string().optional(),
    memberEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
    bestContactName: z.string().optional(),
    bestContactRelationship: z.string().optional(),
    bestContactPhone: z.string().optional(),
    bestContactEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
    bestContactLanguage: z.string().optional(),

    // Step 1 - Legal Rep
    hasCapacity: z.enum(['Yes', 'No'], { required_error: 'This field is required.' }),
    hasLegalRep: z.string().optional(), // Was enum, now string for flexibility
    repName: z.string().optional(),
    repRelationship: z.string().optional(),
    repPhone: z.string().optional(),
    repEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
    repLanguage: z.string().optional(),

    // Step 2 - Location
    currentLocation: requiredString,
    currentAddress: requiredString,
    currentCity: requiredString,
    currentState: requiredString,
    currentZip: requiredString,
    copyAddress: z.boolean().optional(),
    customaryAddress: z.string().optional(),
    customaryCity: z.string().optional(),
    customaryState: z.string().optional(),
    customaryZip: z.string().optional(),

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.' }),
    existingHealthPlan: z.string().optional(),
    switchingHealthPlan: z.enum(['Yes', 'No']).optional(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
    meetsPathwayCriteria: z.boolean().refine(val => val === true, { message: "You must confirm the criteria are met." }),
    snfDiversionReason: z.string().optional(),

    // Step 4 - ISP & RCFE
    ispFirstName: z.string().optional(),
    ispLastName: z.string().optional(),
    ispRelationship: z.string().optional(),
    ispFacilityName: z.string().optional(),
    ispPhone: z.string().optional(),
    ispEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
    ispAddress: z.string().optional(),
    ispCity: z.string().optional(),
    ispState: z.string().optional(),
    ispZip: z.string().optional(),
    ispCounty: z.string().optional(),
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional(),
    hasPrefRCFE: z.string().optional(), // Was enum, now string
    rcfeName: z.string().optional(),
    rcfeAdminName: z.string().optional(),
    rcfeAdminPhone: z.string().optional(),
    rcfeAdminEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
    rcfeAddress: z.string().optional(),
  });


export type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberDob', 'memberMediCalNum', 'memberMrn', 'memberLanguage',
      'referrerPhone', 'referrerRelationship',
      'bestContactName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'hasCapacity',
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentAddress', 'currentCity', 'currentState', 'currentZip'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'meetsPathwayCriteria'] },
  { id: 4, name: 'ISP & Facility Selection', fields: []},
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
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [applicationId, setApplicationId] = useState<string | null>(searchParams.get('applicationId'));

  const userProfileDocRef = useMemo(() => {
    if (user && firestore) {
      return doc(firestore, `users/${user.uid}`);
    }
    return null;
  }, [user, firestore]);
  
  const { data: userProfile } = useDoc(userProfileDocRef);

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      copyAddress: false,
    },
    mode: 'onBlur',
  });

  const { formState: { errors, isValid }, trigger, getValues, handleSubmit } = methods;

  useEffect(() => {
    const subscription = methods.watch((value, { name, type }) => {
        console.log('Form state changed:', { name, type, value });
        if (Object.keys(errors).length > 0) {
            console.log('Current validation errors:', errors);
        }
    });
    return () => subscription.unsubscribe();
  }, [methods, errors]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (userProfile && !applicationId) { 
      methods.setValue('referrerFirstName', userProfile.firstName, { shouldValidate: true });
      methods.setValue('referrerLastName', userProfile.lastName, { shouldValidate: true });
      methods.setValue('referrerEmail', userProfile.email, { shouldValidate: true });
    }
  }, [userProfile, methods, applicationId]);

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (applicationId && user && firestore) {
        console.log(`Fetching application data for ID: ${applicationId}`);
        const docRef = doc(firestore, `users/${user.uid}/applications`, applicationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log("Loaded data from Firestore:", data);
          
          if (data.memberDob && typeof data.memberDob.toDate === 'function') {
            console.log("Converting 'memberDob' from Firestore Timestamp to Date.");
            data.memberDob = data.memberDob.toDate();
          }
          
          methods.reset(data);
          console.log("Form reset with loaded data.");
        } else {
            console.warn("Application ID provided but document not found.");
            setApplicationId(null); // Reset if not found
        }
      }
    };
    fetchApplicationData();
  }, [applicationId, user, firestore, methods]);

  const saveProgress = async (isNavigating: boolean = false) => {
    console.log("Attempting to save progress...");
    if (!user || !firestore) {
        console.error("Save failed: User or Firestore not available.");
        return;
    }
  
    const currentData = getValues();
    let docId = applicationId;
  
    if (!docId) {
      docId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
      setApplicationId(docId);
      console.log(`Generated new application ID: ${docId}`);
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
       console.log(`Progress saved successfully for application ID: ${docId}`);
    } catch (error) {
      console.error("Error saving progress: ", error);
      if (!isNavigating) {
        toast({ variant: "destructive", title: "Save Error", description: "Could not save your progress." });
      }
    }
    return docId;
  };


  const nextStep = async () => {
    console.log(`Attempting to go to next step from step ${currentStep}`);
    const fieldsToValidate = steps[currentStep - 1].fields;
    console.log("Fields to validate for this step:", fieldsToValidate);
    const isValidStep = await trigger(fieldsToValidate as (keyof FormValues)[]);
    console.log(`Step validation result: ${isValidStep}`);

    if (isValidStep) {
        await saveProgress(true);
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
            window.scrollTo(0, 0);
            console.log(`Successfully moved to step ${currentStep + 1}`);
        }
    } else {
        console.log("Step is invalid. Showing toast.");
        if (activeToastId.current) dismiss(activeToastId.current);
        const { id } = toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please fill out all required fields before continuing.",
        });
        activeToastId.current = id;
        // Log the specific errors
        console.log('Validation errors:', methods.formState.errors);
    }
  };

  const prevStep = async () => {
    console.log(`Going to previous step from ${currentStep}`);
    await saveProgress(true);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const onInvalid = (errors: any) => {
    console.error('Form submission failed due to validation errors:', errors);
    toast({
      variant: 'destructive',
      title: 'Submission Failed',
      description: 'Please check the form for errors and try again.',
    });
  };

  const onSubmit = async (data: FormValues) => {
    console.log('onSubmit triggered. Form data is valid.');
    if (!user || !firestore) {
      console.error("Submission failed: User or Firestore not available.");
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
  
    console.log("Calling saveProgress before final submission...");
    const finalAppId = await saveProgress(true);

    if (!finalAppId) {
         console.error("Submission failed: Could not get an application ID.");
         toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
         return;
    }
  
    console.log(`Finalizing submission for application ID: ${finalAppId}`);
    const docRef = doc(firestore, `users/${user.uid}/applications`, finalAppId);
    
    const requiredForms = getRequiredFormsForPathway(data.pathway);
    console.log("Generated required forms based on pathway:", requiredForms);
    
    const finalData = {
      forms: requiredForms,
    };
  
    try {
      await setDoc(docRef, finalData, { merge: true });
      console.log("Final data merged successfully.");
      toast({
        title: 'Application Started!',
        description: 'Your member summary is complete. Continue to the next steps.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      console.log(`Navigating to /pathway?applicationId=${finalAppId}`);
      router.push(`/pathway?applicationId=${finalAppId}`);
    } catch (error) {
      console.error("Error during final submission: ", error);
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: "Could not submit your application.",
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
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-2xl font-bold">CS Member Summary</h1>
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
                  <Button type="submit">Save and Continue</Button>
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
