'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, AlertCircle, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, Timestamp, query, where, getDocs, FieldValue } from 'firebase/firestore';
import Link from 'next/link';

import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import { formSchema, type FormValues } from '../schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Application } from '@/lib/definitions';
import { GlossaryDialog } from '@/components/GlossaryDialog';
import { FormProgressIndicator } from '@/components/FormProgressIndicator';

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberAge', 'memberMrn', 'confirmMemberMrn', 'memberLanguage',
      'memberMediCalNum', 'confirmMemberMediCalNum', 'memberDob', 'sex',
      'referrerFirstName', 'referrerLastName', 'referrerPhone', 'referrerRelationship', 'agency',
      'bestContactFirstName', 'bestContactLastName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'secondaryContactFirstName', 'secondaryContactLastName', 'secondaryContactRelationship', 'secondaryContactPhone', 'secondaryContactEmail', 'secondaryContactLanguage',
      'hasLegalRep', 'repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail'
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentAddress', 'currentCity', 'currentState', 'currentZip', 'currentCounty', 'customaryLocationType', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'meetsPathwayCriteria', 'switchingHealthPlan', 'existingHealthPlan', 'snfDiversionReason'] },
  { id: 4, name: 'ISP & Facility Selection', fields: [
      'ispFirstName', 'ispLastName', 'ispRelationship', 'ispFacilityName', 'ispPhone', 'ispEmail', 
      'ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip', 'ispCounty', 
      'onALWWaitlist', 'hasPrefRCFE', 
      'rcfeName', 'rcfeAddress', 'rcfeAdminName', 'rcfeAdminPhone', 'rcfeAdminEmail',
      'monthlyIncome', 'ackRoomAndBoard'
  ]},
];

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
  const [showSkipOption, setShowSkipOption] = useState(false);

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      meetsPathwayCriteria: false,
    },
  });

  const { formState: { errors, isValid }, trigger, getValues, handleSubmit, reset } = methods;

  const targetUserId = appUserId || user?.uid;
  const isAdminView = !!appUserId;
  const isAdminCreatedApp = internalApplicationId?.startsWith('admin_app_');
  const backLink = isAdminView ? `/admin/applications/${internalApplicationId}?userId=${appUserId}` : `/applications`;
  
  const docRef = useMemoFirebase(() => {
    if (!firestore || !internalApplicationId) return null;
    
    // Admin-created applications are stored directly in the applications collection
    if (isAdminCreatedApp) {
      return doc(firestore, 'applications', internalApplicationId);
    }
    
    // Regular user applications are stored in user subcollections
    if (!targetUserId) return null;
    return doc(firestore, `users/${targetUserId}/applications`, internalApplicationId);
  }, [firestore, targetUserId, internalApplicationId, isAdminCreatedApp]);

  useEffect(() => {
    // This is the fix. If auth has loaded and there's no user, and it's not an admin view,
    // redirect to the main login page.
    if (!isUserLoading && !user && !isAdminView) {
        router.push('/');
    }
  }, [isUserLoading, user, isAdminView, router]);


  useEffect(() => {
    const fetchApplicationData = async () => {
      if (docRef) {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Application;
          setExistingApplicationData(data);
          reset(data as FormValues);
          
          // Check if CS Summary is already completed and show skip option
          const csSummaryForm = data.forms?.find(form => 
            form.name === 'CS Member Summary' || form.name === 'CS Summary'
          );
          if (csSummaryForm?.status === 'Completed' && !isAdminView) {
            setShowSkipOption(true);
          }
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
  }, [docRef, user, firestore, reset, isAdminView, getValues, internalApplicationId]);


  useEffect(() => {
    // Clear validation error when the form becomes valid for the current step
    const fieldsForCurrentStep = steps[currentStep - 1].fields;
    const hasErrorsInCurrentStep = fieldsForCurrentStep.some(field => errors[field as keyof FormValues]);

    if (!hasErrorsInCurrentStep) {
        setValidationError(null);
    }
  }, [errors, currentStep]);


  const saveProgress = (isNavigating: boolean = false): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        if (!firestore) {
            return resolve(null);
        }

        // For admin-created applications, we don't need a targetUserId
        if (!isAdminCreatedApp && !targetUserId) {
            return resolve(null);
        }

        const currentData = getValues();
        let docId = internalApplicationId;
        let isNewDoc = false;

        if (!docId) {
            if (isAdminCreatedApp) {
                // This shouldn't happen for admin-created apps, but handle it just in case
                docId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                setInternalApplicationId(docId);
                isNewDoc = true;
            } else {
                docId = doc(collection(firestore, `users/${targetUserId}/applications`)).id;
                setInternalApplicationId(docId);
                isNewDoc = true;
            }
        }

        // Determine the correct document reference
        const docRef = isAdminCreatedApp 
            ? doc(firestore, 'applications', docId)
            : doc(firestore, `users/${targetUserId}/applications`, docId);

        const sanitizedData = Object.fromEntries(
            Object.entries(currentData).map(([key, value]) => [key, value === undefined ? null : value])
        );

        const dataToSave: Partial<Application> = {
            ...sanitizedData,
            id: docId,
            userId: targetUserId,
            status: 'In Progress',
            lastUpdated: serverTimestamp(),
            referrerName: `${currentData.referrerFirstName} ${currentData.referrerLastName}`.trim(),
        };

        if (isNewDoc) {
            dataToSave.submissionDate = serverTimestamp();
        }

        // For admin-created applications, mark them as such
        if (isAdminCreatedApp) {
            dataToSave.createdByAdmin = true;
        }

        setDoc(docRef, dataToSave, { merge: true })
            .then(() => {
                if (!isNavigating) {
                    toast({ title: 'Progress Saved', description: 'Your changes have been saved.' });
                }
                resolve(docId);
            })
            .catch((error) => {
                const permissionError = new FirestorePermissionError({
                    path: docRef.path,
                    operation: isNewDoc ? 'create' : 'update',
                    requestResourceData: dataToSave,
                });
                errorEmitter.emit('permission-error', permissionError);

                if (!isNavigating) {
                    toast({ variant: "destructive", title: "Save Error", description: `Could not save your progress: ${error.message}` });
                }
                reject(error);
            });
    });
  };

  const nextStep = async () => {
    const fields = steps[currentStep - 1].fields;
    const isValid = await trigger(fields as FieldPath<FormValues>[], { shouldFocus: true });
    
    if (!isValid) {
      setValidationError("Please correct the errors on this page. Required fields are marked with a red asterisk (*).");
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
    console.log("Form Validation Failed:", errors);
    
    const firstErrorStep = findFirstErrorStep(errors);
    if (firstErrorStep && firstErrorStep !== currentStep) {
        setCurrentStep(firstErrorStep);
        setValidationError(`Please correct errors on this page before proceeding. Required fields are marked with a red asterisk (*).`);
        return;
    }

    setValidationError(`Please check the form for errors. Required fields are marked with a red asterisk (*).`);
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
  
    try {
        const finalAppId = await saveProgress(true);
        if (!finalAppId) {
             toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
             setIsProcessing(false);
             return;
        }
        
        const reviewUrl = `${appUserId ? '/admin' : ''}/forms/cs-summary-form/review?applicationId=${finalAppId}${appUserId ? `&userId=${appUserId}`: ''}`;
        router.push(reviewUrl);
        
    } catch (error) {
        // Error is already handled and emitted by saveProgress
    } finally {
        setIsProcessing(false);
    }
  };

  const handleSkipToPathway = () => {
    if (internalApplicationId) {
      router.push(`/pathway?applicationId=${internalApplicationId}`);
    }
  };

  if (isUserLoading || (!targetUserId && !isUserLoading && !isAdminView)) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4">Loading user data...</p>
      </div>
    );
  }

  if (!internalApplicationId && !isAdminView) {
    return (
      <div className="flex-grow flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg space-y-4">
          <Alert>
            <AlertTitle>Application creation requires an admin</AlertTitle>
            <AlertDescription>
              New member applications must be created by an administrator. Please contact your
              care team to start a new application.
            </AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link href="/applications">Back to My Applications</Link>
          </Button>
        </div>
      </div>
    );
  }

  const progress = (currentStep / steps.length) * 100;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex-grow">
        <div className="container mx-auto px-3 py-4 sm:px-6 sm:py-8 max-w-full overflow-x-hidden">
          <div className="max-w-4xl mx-auto w-full">
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
            
            {/* Progress Indicator */}
            <div className="mb-8">
              <FormProgressIndicator 
                steps={steps} 
                currentStep={currentStep}
                completedSteps={[]}
              />
            </div>
            
            <div className="mb-8">
              <div className="mb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                          <h1 className="text-2xl font-bold">CS Member Summary</h1>
                          {!isAdminView && <GlossaryDialog className="p-0 h-auto mt-2" />}
                      </div>
                      {!isAdminView && (
                          <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              className="flex items-center gap-2 self-start sm:self-auto"
                              onClick={() => {
                                  // TODO: Implement Spanish translation
                                  console.log('Spanish translation will be implemented later');
                              }}
                          >
                              <Languages className="h-4 w-4" />
                              Español
                          </Button>
                      )}
                  </div>
              </div>
               <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                   <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1} size="sm" className="sm:w-auto">
                       <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                   </Button>
                   <span className="text-xs sm:text-sm font-medium text-muted-foreground text-center flex-shrink-0 px-2 sm:px-4 order-first sm:order-none">
                       Step {currentStep} of {steps.length}: <span className="hidden sm:inline">{steps[currentStep - 1].name}</span>
                   </span>
                   <span className="hidden sm:block"></span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>

            {/* Skip to Pathway Option for Completed Forms */}
            {showSkipOption && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-blue-900">CS Summary Already Completed</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Your CS Member Summary form is already completed. You can skip directly to the pathway page to continue with other requirements.
                    </p>
                  </div>
                  <Button 
                    type="button"
                    onClick={handleSkipToPathway}
                    className="ml-4 bg-blue-600 hover:bg-blue-700"
                  >
                    Skip to Pathway
                  </Button>
                </div>
              </div>
            )}

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
                  <AlertDescription>
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
