
'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


const requiredString = z.string().min(1, { message: 'This field is required.' });
const optionalString = z.string().optional().nullable();
const optionalEmail = z.string().email({ message: 'Invalid email format.' }).optional().or(z.literal('')).nullable();

const formSchema = z.object({
    // Step 1 - Member Info
    memberFirstName: requiredString,
    memberLastName: requiredString,
    memberDob: z.date({ required_error: 'Date of birth is required.' }),
    memberAge: z.number().optional(),
    memberMediCalNum: z.string().regex(/^9[0-9]{7}[a-zA-Z]$/, { message: 'Invalid Medi-Cal number format. Must be 9, followed by 7 digits, then a letter.'}).max(9, "Medi-Cal number cannot exceed 9 characters."),
    confirmMemberMediCalNum: z.string().max(9, "Medi-Cal number cannot exceed 9 characters."),
    memberMrn: requiredString,
    confirmMemberMrn: requiredString,
    memberLanguage: requiredString,
    memberCounty: requiredString,
    
    // Step 1 - Referrer Info
    referrerFirstName: optionalString,
    referrerLastName: optionalString,
    referrerEmail: optionalString,
    referrerPhone: requiredString,
    referrerRelationship: requiredString,
    agency: optionalString.nullable(),

    // Step 1 - Best Contact Person
    bestContactType: z.enum(['member', 'other'], { required_error: 'Please select a best contact type.'}),
    bestContactFirstName: optionalString,
    bestContactLastName: optionalString,
    bestContactRelationship: optionalString,
    bestContactPhone: optionalString,
    bestContactEmail: optionalEmail,
    bestContactLanguage: optionalString,

    // Secondary Contact
    secondaryContactFirstName: optionalString,
    secondaryContactLastName: optionalString,
    secondaryContactRelationship: optionalString,
    secondaryContactPhone: optionalString,
    secondaryContactEmail: optionalEmail,
    secondaryContactLanguage: optionalString,

    // Step 1 - Legal Rep
    hasCapacity: z.enum(['Yes', 'No'], { required_error: 'This field is required.' }),
    hasLegalRep: optionalString,
    repName: optionalString,
    repRelationship: optionalString,
    repPhone: optionalString,
    repEmail: optionalEmail,

    // Step 2 - Location
    currentLocation: requiredString,
    currentAddress: requiredString,
    currentCity: requiredString,
    currentState: requiredString,
    currentZip: requiredString,
    copyAddress: z.boolean().optional(),
    customaryAddress: optionalString,
    customaryCity: optionalString,
    customaryState: optionalString,
    customaryZip: optionalString,

    // Step 3 - Health Plan & Pathway
    healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.' }),
    existingHealthPlan: optionalString,
    switchingHealthPlan: z.enum(['Yes', 'No']).optional().nullable(),
    pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
    meetsPathwayCriteria: z.boolean().refine(val => val === true, { message: "You must confirm the criteria are met." }),
    snfDiversionReason: optionalString,

    // Step 4 - ISP & RCFE
    ispFirstName: optionalString,
    ispLastName: optionalString,
    ispRelationship: optionalString,
    ispFacilityName: optionalString,
    ispPhone: optionalString,
    ispEmail: optionalEmail,
    ispAddress: optionalString,
    ispCity: optionalString,
    ispState: optionalString,
    ispZip: optionalString,
    ispCounty: optionalString,
    onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional().nullable(),
    hasPrefRCFE: optionalString,
    rcfeName: optionalString,
    rcfeAdminName: optionalString,
    rcfeAdminPhone: optionalString,
    rcfeAdminEmail: optionalEmail,
    rcfeAddress: optionalString,
  })
  .refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
    message: "Medi-Cal numbers don't match",
    path: ["confirmMemberMediCalNum"],
  })
  .refine(data => data.memberMrn === data.confirmMemberMrn, {
      message: "Medical Record Numbers don't match",
      path: ["confirmMemberMrn"],
  });


export type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberDob', 'memberMediCalNum', 'confirmMemberMediCalNum', 'memberMrn', 'confirmMemberMrn', 'memberLanguage', 'memberCounty',
      'referrerPhone', 'referrerRelationship', 'bestContactType',
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

// Simple on-screen logger
const DebugLog = ({ logs }: { logs: string[] }) => (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Submission Debug Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-40 w-full rounded-md border p-4">
          {logs.map((log, index) => (
            <p key={index} className="text-xs font-mono">
              {`[${new Date().toLocaleTimeString()}] ${log}`}
            </p>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
);


function CsSummaryFormComponent() {
  const [currentStep, setCurrentStep] = useState(1);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, dismiss } = useToast();
  const activeToastId = useRef<string | null>(null);
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const [applicationId, setApplicationId] = useState<string | null>(searchParams.get('applicationId'));

  const addLog = (message: string) => {
    setDebugLogs(prev => [message, ...prev]);
  };
  
  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      copyAddress: false,
    },
    mode: 'onBlur',
  });

  const { formState: { errors }, trigger, getValues, handleSubmit, reset } = methods;

  useEffect(() => {
    addLog("Form component mounted.");
    if (!isUserLoading && !user) {
      addLog("User not found, redirecting to /login.");
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (applicationId && user && firestore) {
        addLog(`Existing application ID found: ${applicationId}. Fetching data...`);
        const docRef = doc(firestore, `users/${user.uid}/applications`, applicationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          addLog("Application data found in Firestore.");
          
          if (data.memberDob && typeof data.memberDob.toDate === 'function') {
            data.memberDob = data.memberDob.toDate();
            addLog("Converted 'memberDob' from Firestore Timestamp to Date.");
          }
          
          reset(data);
          addLog("Form reset with loaded data.");
        } else {
            addLog(`Warning: Application ID ${applicationId} not found. Starting a new application.`);
            setApplicationId(null);
            reset({
              copyAddress: false,
              referrerFirstName: user?.displayName?.split(' ')[0] || '',
              referrerLastName: user?.displayName?.split(' ')[1] || '',
              referrerEmail: user?.email || '',
            });
        }
      } else if (user && !applicationId) { // Handles case where it's a new form from the start
          reset({
              copyAddress: false,
              referrerFirstName: user?.displayName?.split(' ')[0] || '',
              referrerLastName: user?.displayName?.split(' ')[1] || '',
              referrerEmail: user?.email || '',
          });
          addLog("New form, pre-populating with user data.");
      }
    };
    fetchApplicationData();
  }, [applicationId, user, firestore, reset]);

  const saveProgress = async (isNavigating: boolean = false) => {
    addLog("Attempting to save progress...");
    if (!user || !firestore) {
        addLog("Save failed: User or Firestore not available.");
        return null;
    }
  
    const currentData = getValues();
    let docId = applicationId;
  
    if (!docId) {
      docId = doc(collection(firestore, `users/${user.uid}/applications`)).id;
      setApplicationId(docId);
      addLog(`Generated new application ID: ${docId}`);
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
       addLog(`Progress saved successfully for application ID: ${docId}`);
       return docId;
    } catch (error: any) {
      addLog(`Error saving progress: ${error.message}`);
      if (!isNavigating) {
        toast({ variant: "destructive", title: "Save Error", description: `Could not save your progress: ${error.message}` });
      }
    }
    return null;
  };


  const nextStep = async () => {
    addLog(`Attempting to go to next step from step ${currentStep}`);
    const fieldsToValidate = steps[currentStep - 1].fields;
    addLog(`Fields to validate: ${fieldsToValidate.join(', ')}`);
    const isValidStep = await trigger(fieldsToValidate as (keyof FormValues)[]);
    addLog(`Step validation result: ${isValidStep}`);

    if (isValidStep) {
        await saveProgress(true);
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
            window.scrollTo(0, 0);
            addLog(`Successfully moved to step ${currentStep + 1}`);
        }
    } else {
        const errorList = JSON.stringify(errors, null, 2);
        addLog(`Step is invalid. Errors: ${errorList}`);
        if (activeToastId.current) dismiss(activeToastId.current);
        const { id } = toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Please fill out all required fields before continuing.",
        });
        activeToastId.current = id;
    }
  };

  const prevStep = async () => {
    addLog(`Going to previous step from ${currentStep}`);
    await saveProgress(true);
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const onInvalid = (errors: any) => {
    const errorString = JSON.stringify(errors, null, 2);
    addLog(`Form submission failed due to validation errors: ${errorString}`);
    toast({
      variant: 'destructive',
      title: 'Submission Failed',
      description: 'Please check the form for errors and try again.',
    });
  };

  const onSubmit = async (data: FormValues) => {
    addLog('onSubmit triggered. Form data is valid. Starting final submission...');
    if (!user || !firestore) {
      addLog("Submission failed: User or Firestore not available.");
      toast({ variant: "destructive", title: "Error", description: "You must be logged in." });
      return;
    }
  
    addLog("Calling saveProgress before final submission...");
    const finalAppId = await saveProgress(true);

    if (!finalAppId) {
         addLog("Submission failed: Could not get an application ID.");
         toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
         return;
    }
  
    addLog(`Finalizing submission for application ID: ${finalAppId}`);
    const docRef = doc(firestore, `users/${user.uid}/applications`, finalAppId);
    
    const requiredForms = getRequiredFormsForPathway(data.pathway);
    addLog(`Generated required forms for pathway '${data.pathway}': ${JSON.stringify(requiredForms.map(f => f.name))}`);
    
    // Sanitize data one last time before final save
    const sanitizedData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
    );
    
    const finalData = {
      ...sanitizedData,
      forms: requiredForms,
      status: 'Completed & Submitted' as const,
      lastUpdated: serverTimestamp(),
    };
  
    try {
      await setDoc(docRef, finalData, { merge: true });
      addLog("Final data merged successfully into Firestore.");
      toast({
        title: 'Application Started!',
        description: 'Your member summary is complete. Continue to the next steps.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      addLog(`Navigating to /pathway?applicationId=${finalAppId}`);
      router.push(`/pathway?applicationId=${finalAppId}`);
    } catch (error: any) {
      addLog(`Error during final submission: ${error.message}`);
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
                  <Button type="submit">Save and Continue</Button>
                )}
              </div>
              
              <DebugLog logs={debugLogs} />
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
