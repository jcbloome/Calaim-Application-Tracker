
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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

const formSchema = z.object({
  // Step 1
  memberFirstName: z.string().min(1, 'First name is required'),
  memberLastName: z.string().min(1, 'Last name is required'),
  memberDob: z.date({ required_error: 'Date of birth is required' }),
  memberAge: z.number().optional(),
  memberMediCalNum: z.string().min(1, 'Medi-Cal number is required'),
  confirmMemberMediCalNum: z.string(),
  memberMrn: z.string().min(1, 'MRN is required'),
  confirmMemberMrn: z.string(),
  memberLanguage: z.string().min(1, 'Preferred language is required'),
  referrerFirstName: z.string().min(1, 'First name is required'),
  referrerLastName: z.string().min(1, 'Last name is required'),
  referrerEmail: z.string().email(),
  referrerPhone: z.string().min(1, 'Phone number is required'),
  referrerRelationship: z.string().min(1, 'Relationship is required'),
  memberPhone: z.string().optional(),
  memberEmail: z.string().email().optional().or(z.literal('')),
  isBestContact: z.boolean().default(false),
  bestContactName: z.string().optional(),
  bestContactRelationship: z.string().optional(),
  bestContactPhone: z.string().optional(),
  bestContactEmail: z.string().email().optional().or(z.literal('')),
  bestContactLanguage: z.string().optional(),
  hasCapacity: z.enum(['Yes', 'No', 'Unknown']),
  hasLegalRep: z.enum(['Yes', 'No']).optional(),
  repName: z.string().optional(),
  repRelationship: z.string().optional(),
  repPhone: z.string().optional(),
  repEmail: z.string().email().optional().or(z.literal('')),
  repLanguage: z.string().optional(),

  // Step 2
  currentLocation: z.string().min(1, 'Current location is required'),
  currentAddress: z.string().min(1, 'Address is required'),
  currentCity: z.string().min(1, 'City is required'),
  currentState: z.string().min(1, 'State is required'),
  currentZip: z.string().min(1, 'ZIP code is required'),
  copyAddress: z.boolean().default(false),
  customaryAddress: z.string().optional(),
  customaryCity: z.string().optional(),
  customaryState: z.string().optional(),
  customaryZip: z.string().optional(),

  // Step 3
  healthPlan: z.enum(['Kaiser', 'Health Net', 'Other'], { required_error: 'Please select a health plan.' }),
  pathway: z.enum(['SNF Transition', 'SNF Diversion'], { required_error: 'Please select a pathway.' }),
  meetsSnfTransitionCriteria: z.boolean().optional(),
  meetsSnfDiversionCriteria: z.boolean().optional(),
  snfDiversionReason: z.string().optional(),
  
  // Step 4
  ispFirstName: z.string().optional(),
  ispLastName: z.string().optional(),
  ispRelationship: z.string().optional(),
  ispFacilityName: z.string().optional(),
  ispPhone: z.string().optional(),
  ispEmail: z.string().email().optional().or(z.literal('')),
  ispCopyCurrent: z.boolean().default(false),
  ispCopyCustomary: z.boolean().default(false),
  ispAddress: z.string().optional(),
  ispCity: z.string().optional(),
  ispState: z.string().optional(),
  ispZip: z.string().optional(),
  ispCounty: z.string().optional(),
  onALWWaitlist: z.enum(['Yes', 'No', 'Unknown']).optional(),
  hasPrefRCFE: z.enum(['Yes', 'No'], { required_error: 'Please make a selection.' }),
  rcfeName: z.string().optional(),
  rcfeAdminName: z.string().optional(),
  rcfeAdminPhone: z.string().optional(),
  rcfeAdminEmail: z.string().email().optional().or(z.literal('')),
  rcfeAddress: z.string().optional(),
})
.refine(data => data.memberMediCalNum === data.confirmMemberMediCalNum, {
  message: "Medi-Cal numbers don't match",
  path: ["confirmMemberMediCalNum"],
})
.refine(data => data.memberMrn === data.confirmMemberMrn, {
    message: "MRNs don't match",
    path: ["confirmMemberMrn"],
});

export type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 1, name: 'Member & Contact Info' },
  { id: 2, name: 'Location Information' },
  { id: 3, name: 'Health Plan & Pathway' },
  { id: 4, name: 'ISP & Facility Selection' },
];

function CsSummaryFormComponent() {
  const [currentStep, setCurrentStep] = useState(1);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const applicationId = searchParams.get('applicationId');

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
      isBestContact: false,
      copyAddress: false,
      ispCopyCurrent: false,
      ispCopyCustomary: false,
      hasLegalRep: 'No',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    // Pre-fill referrer info from user profile when it loads
    if (userProfile && !applicationId) { // Only pre-fill for new applications
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
          // Convert Firestore Timestamps to JS Dates
          if (data.memberDob && data.memberDob.toDate) {
            data.memberDob = data.memberDob.toDate();
          }
          methods.reset(data);
        }
      }
    };
    fetchApplicationData();
  }, [applicationId, user, firestore, methods]);


  const { trigger, handleSubmit } = methods;

  const nextStep = async () => {
    const isValid = await trigger();
    if (isValid) {
      if (currentStep < steps.length) {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: FormValues) => {
    if (!user || !firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "You must be logged in to submit an application.",
      });
      return;
    }
  
    const docId = applicationId || doc(collection(firestore, `users/${user.uid}/applications`)).id;
    const docRef = doc(firestore, `users/${user.uid}/applications`, docId);
  
    // Sanitize data: convert undefined to null
    const sanitizedData = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
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
      toast({
        title: applicationId ? 'Application Updated!' : 'Application Saved!',
        description: 'Your application has been saved successfully.',
        className: 'bg-green-100 text-green-900 border-green-200',
      });
      router.push(`/pathway?applicationId=${docId}`);
    } catch (error) {
      console.error("Error saving document: ", error);
      toast({
        variant: "destructive",
        title: "Uh oh! Something went wrong.",
        description: "Could not save your application.",
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
                  <ArrowLeft className="mr-2 h-4 w-4" /> Previous Step
                </Button>
                {currentStep < steps.length ? (
                  <Button type="button" onClick={nextStep}>
                    Next Step
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
