
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
import { doc, setDoc, getDoc, serverTimestamp, collection } from 'firebase/firestore';

import Step1 from './components/Step1';
import Step2 from './components/Step2';
import Step3 from './components/Step3';
import Step4 from './components/Step4';
import { Header } from '@/components/Header';
import type { FormStatus as FormStatusType } from '@/lib/definitions';


const requiredString = z.string().min(1, { message: 'This field is required.' });

const formSchema = z.object({
  // Step 1
  memberFirstName: requiredString,
  memberLastName: requiredString,
  memberDob: z.date({ required_error: 'Date of birth is required.' }),
  memberAge: z.number().optional(),
  memberMediCalNum: requiredString,
  memberMrn: requiredString,
  memberLanguage: requiredString,
  
  referrerFirstName: z.string().optional(),
  referrerLastName: z.string().optional(),
  referrerEmail: z.string().optional(),
  referrerPhone: requiredString,
  referrerRelationship: requiredString,
  agency: z.string().optional(),

  memberPhone: z.string().optional(),
  memberEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),

  bestContactName: requiredString,
  bestContactRelationship: requiredString,
  bestContactPhone: requiredString,
  bestContactEmail: requiredString.email({ message: 'Invalid email format.' }),
  bestContactLanguage: requiredString,

  hasCapacity: z.enum(['Yes', 'No'], { required_error: 'This field is required.' }),
  hasLegalRep: z.enum(['Yes', 'No', 'Unknown'], { required_error: 'This field is required.' }),
  repName: z.string().optional(),
  repRelationship: z.string().optional(),
  repPhone: z.string().optional(),
  repEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
  repLanguage: z.string().optional(),

  // Step 2
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

  // Step 3
  healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.' }),
  existingHealthPlan: z.string().optional(),
  switchingHealthPlan: z.enum(['Yes', 'No']).optional(),
  pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
  meetsPathwayCriteria: z.boolean().refine(val => val === true, { message: "You must confirm the criteria are met." }),
  snfDiversionReason: z.string().optional(),

  // Step 4
  ispFirstName: z.string().optional(),
  ispLastName: z.string().optional(),
  ispRelationship: z.string().optional(),
  ispFacilityName: z.string().optional(),
  ispPhone: zstring().optional(),
  ispEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
  ispAddress: z.string().optional(),
  ispCity: z.string().optional(),
  ispState: z.string().optional(),
  ispZip: z.string().optional(),
  ispCounty: z.string().optional(),
  onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional(),
  hasPrefRCFE: z.enum(['Yes', 'No']).optional(),
  rcfeName: z.string().optional(),
  rcfeAdminName: z.string().optional(),
  rcfeAdminPhone: z.string().optional(),
  rcfeAdminEmail: z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')),
  rcfeAddress: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.hasLegalRep === 'Yes') {
        if (!data.repName) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['repName'] });
        if (!data.repRelationship) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['repRelationship'] });
        if (!data.repPhone) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['repPhone'] });
        if (!data.repEmail) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['repEmail'] });
        if (!data.repLanguage) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['repLanguage'] });
    }
    if (data.healthPlan === 'Other') {
        if (!data.existingHealthPlan) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['existingHealthPlan'] });
        if (!data.switchingHealthPlan) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['switchingHealthPlan'] });
    }
    if (data.pathway === 'SNF Diversion' && !data.snfDiversionReason) {
        // No longer required by default, but we might check this on final submission if needed.
    }
    if (data.hasPrefRCFE === 'Yes') {
        if (!data.rcfeName) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['rcfeName'] });
        if (!data.rcfeAddress) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['rcfeAddress'] });
        if (!data.rcfeAdminName) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['rcfeAdminName'] });
        if (!data.rcfeAdminPhone) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['rcfeAdminPhone'] });
        if (!data.rcfeAdminEmail) ctx.addIssue({ code: 'custom', message: 'This field is required.', path: ['rcfeAdminEmail'] });
    }
    if (data.healthPlan === 'Kaiser') {
        if (!data.ispFirstName) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispFirstName'] });
        if (!data.ispLastName) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispLastName'] });
        if (!data.ispRelationship) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispRelationship'] });
        if (!data.ispAddress) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispAddress'] });
        if (!data.ispCity) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispCity'] });
        if (!data.ispState) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispState'] });
        if (!data.ispZip) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispZip'] });
        if (!data.ispCounty) ctx.addIssue({ code: 'custom', message: 'This field is required for Kaiser.', path: ['ispCounty'] });
    }
});


export type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberDob', 'memberMediCalNum', 'memberMrn', 'memberLanguage',
      'referrerPhone', 'referrerRelationship',
      'bestContactName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'hasCapacity', 'hasLegalRep', 'repName', 'repRelationship', 'repPhone', 'repEmail', 'repLanguage',
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentAddress', 'currentCity', 'currentState', 'currentZip'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'existingHealthPlan', 'switchingHealthPlan', 'meetsPathwayCriteria'] },
  { id: 4, name: 'ISP & Facility Selection', fields: [
      'hasPrefRCFE', 'rcfeName', 'rcfeAddress', 'rcfeAdminName', 'rcfeAdminPhone', 'rcfeAdminEmail',
      'ispFirstName', 'ispLastName', 'ispRelationship', 'ispAddress', 'ispCity', 'ispState', 'ispZip', 'ispCounty'
  ]},
];

const getRequiredFormsForPathway = (pathway: FormValues['pathway']): FormStatusType[] => {
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
  
  // Use a state for application ID to make it stable across renders
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
    mode: 'onChange',
  });

  const { formState: { isValid }, trigger, getValues, handleSubmit } = methods;

  useEffect(() => {
    const subscription = methods.watch(() => {
        if (isValid && activeToastId.current) {
            dismiss(activeToastId.current);
            activeToastId.current = null;
        }
    });
    return () => subscription.unsubscribe();
  }, [methods, isValid, dismiss]);

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
        const docRef = doc(firestore, `users/${user.uid}/applications`, applicationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          if (data.memberDob && data.memberDob.toDate) {
            data.memberDob = data.memberDob.toDate();
          }
          methods.reset(data);
        } else {
            console.warn("Application ID provided but document not found.");
            setApplicationId(null); // Reset if not found
        }
      }
    };
    fetchApplicationData();
  }, [applicationId, user, firestore, methods]);

  const saveProgress = async (isNavigating: boolean = false) => {
    if (!user || !firestore) return;
  
    const currentData = getValues();
    let docId = applicationId;
  
    // Create new application ID if one doesn't exist
    if (!docId) {
      docId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
      setApplicationId(docId);
       if (isNavigating) {
        // Update URL without full page reload if a new ID is created
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
      status: 'In Progress',
      lastUpdated: serverTimestamp(),
    };
  
    try {
      await setDoc(docRef, dataToSave, { merge: true });
       if (!isNavigating) {
         toast({ title: 'Progress Saved', description: 'Your changes have been saved.' });
       }
    } catch (error) {
      console.error("Error saving progress: ", error);
      if (!isNavigating) {
        toast({ variant: "destructive", title: "Save Error", description: "Could not save your progress." });
      }
    }
  };


  const nextStep = async () => {
    const fieldsToValidate = steps[currentStep - 1].fields;
    const isValidStep = await trigger(fieldsToValidate as (keyof FormValues)[]);

    if (isValidStep) {
        await saveProgress(true);
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
            window.scrollTo(0, 0);
        }
    } else {
        if (activeToastId.current) dismiss(activeToastId.current);
        const { id } = toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please see required fields before continuing.",
        });
        activeToastId.current = id;
    }
  };

  const prevStep = async () => {
    await saveProgress(true);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const onSubmit = async (data: FormValues) => {
    if (!user || !firestore) {
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
  
    const docId = applicationId || doc(collection(firestore, `users/${user.uid}/applications`)).id;
    const docRef = doc(firestore, `users/${user.uid}/applications`, docId);
  
    const sanitizedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
    );

    const requiredForms = getRequiredFormsForPathway(data.pathway);
    
    const dataToSave = {
      ...sanitizedData,
      id: docId,
      userId: user.uid,
      status: 'In Progress', // The form is complete, but the application is just starting
      lastUpdated: serverTimestamp(),
      forms: requiredForms, // Add the required forms array
    };
  
    try {
      await setDoc(docRef, dataToSave, { merge: true });
      toast({
        title: 'Application Started!',
        description: 'Your member summary is complete. Continue to the next steps.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      router.push(`/pathway?applicationId=${docId}`);
    } catch (error) {
      console.error("Error submitting document: ", error);
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
        <form onSubmit={handleSubmit(onSubmit)} className="flex-grow">
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
    <React.Suspense fallback={<div>Loading form...</div>}>
      <CsSummaryFormComponent />
    </React.Suspense>
  );
}

    