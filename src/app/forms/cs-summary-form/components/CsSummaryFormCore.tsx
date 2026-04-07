'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, AlertCircle, Languages, CheckCircle2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';

import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import Step5 from './Step5';
import { formSchema, type FormValues } from '../schema';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Application } from '@/lib/definitions';
import { FormProgressIndicator } from '@/components/FormProgressIndicator';

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberAge', 'memberMrn', 'confirmMemberMrn', 'memberLanguage',
      'memberMediCalNum', 'confirmMemberMediCalNum', 'memberDob', 'sex', 'memberPhone', 'memberEmail',
      'Authorization_Number_T038', 'Authorization_Start_T2038', 'Authorization_End_T2038', 'Diagnostic_Code',
      'referrerFirstName', 'referrerLastName', 'referrerPhone', 'referrerRelationship', 'agency',
      'bestContactFirstName', 'bestContactLastName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'secondaryContactFirstName', 'secondaryContactLastName', 'secondaryContactRelationship', 'secondaryContactPhone', 'secondaryContactEmail', 'secondaryContactLanguage',
      'hasLegalRep', 'repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail'
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentLocationName', 'currentAddress', 'currentCity', 'currentState', 'currentZip', 'currentCounty', 'customaryLocationType', 'customaryLocationName', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'eligibilityRoute', 'switchingHealthPlan', 'existingHealthPlan', 'snfDiversionReason'] },
  { id: 4, name: 'NMOHC, SOC, Room & Board', fields: [] },
  { id: 5, name: 'ISP, ALW, RCFE Selection', fields: [
      'ispFirstName', 'ispLastName', 'ispRelationship', 'ispFacilityName', 'ispPhone', 'ispEmail',
      'ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip',
      'onALWWaitlist', 'hasPrefRCFE',
      'rcfeName', 'rcfeAddress', 'rcfePreferredCities',
      'rcfeAdminFirstName', 'rcfeAdminLastName', 'rcfeAdminPhone', 'rcfeAdminEmail'
  ]},
];

function formatFieldLabel(fieldName: string) {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function CsSummaryFormComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const applicationId = searchParams.get('applicationId');
  const appUserId = searchParams.get('userId'); // For admins editing a user's app

  const [internalApplicationId, setInternalApplicationId] = useState<string | null>(applicationId);
  const initialStep = parseInt(searchParams.get('step') || '1', 10);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSkipOption, setShowSkipOption] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [lastEditedAt, setLastEditedAt] = useState(0);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const initialWatchCompleteRef = useRef(false);
  const lastSnapshotRef = useRef('');

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isPrimaryContactSameAsReferrer: false,
      copyAddress: false
    }
  });

  const { formState: { errors }, trigger, getValues, handleSubmit, reset, setFocus, setError, clearErrors } = methods;
  const watchedValues = methods.watch();

  const fieldToStepMap = useMemo(() => {
    const map: Record<string, number> = {};
    steps.forEach((step) => {
      step.fields.forEach((field) => {
        map[field] = step.id;
      });
    });
    return map;
  }, []);

  const errorChecklist = useMemo(() => {
    return Object.keys(errors || {})
      .map((field) => ({
        field,
        step: fieldToStepMap[field] || 1,
        label: formatFieldLabel(field),
      }))
      .sort((a, b) => a.step - b.step || a.label.localeCompare(b.label));
  }, [errors, fieldToStepMap]);

  const normalizeForCompare = (value: unknown) => String(value || '').trim().toLowerCase();

  const findLinkableAdminApplication = async (data: Partial<FormValues>) => {
    if (!firestore) return null;
    const normalizedMrn = String(data?.memberMrn || '').trim();
    if (!normalizedMrn) return null;

    const first = normalizeForCompare(data?.memberFirstName);
    const last = normalizeForCompare(data?.memberLastName);
    const currentPath = docRef?.path;

    const adminAppsSnap = await getDocs(
      query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))
    );

    const matches = adminAppsSnap.docs
      .map((docSnapshot) => ({ id: docSnapshot.id, path: docSnapshot.ref.path, data: docSnapshot.data() as any }))
      .filter((entry) => {
        if (currentPath && entry.path === currentPath) return false;
        const isAdminSeed = entry.id.startsWith('admin_app_') || Boolean(entry.data?.createdByAdmin);
        if (!isAdminSeed) return false;
        const status = normalizeForCompare(entry.data?.status);
        if (status === 'approved' || status === 'completed & submitted') return false;
        if (first && normalizeForCompare(entry.data?.memberFirstName) !== first) return false;
        if (last && normalizeForCompare(entry.data?.memberLastName) !== last) return false;
        return true;
      })
      .sort((a, b) => {
        const aTs = Number((a.data?.lastUpdated as any)?.seconds || 0);
        const bTs = Number((b.data?.lastUpdated as any)?.seconds || 0);
        return bTs - aTs;
      });

    return matches.length > 0 ? matches[0] : null;
  };

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
          });
      }
    };
    fetchApplicationData();
  }, [docRef, user, firestore, reset, isAdminView, getValues, internalApplicationId]);

  useEffect(() => {
    const nextSnapshot = JSON.stringify(watchedValues || {});
    if (!initialWatchCompleteRef.current) {
      initialWatchCompleteRef.current = true;
      lastSnapshotRef.current = nextSnapshot;
      return;
    }
    if (nextSnapshot !== lastSnapshotRef.current) {
      lastSnapshotRef.current = nextSnapshot;
      setHasInteracted(true);
      setLastEditedAt(Date.now());
    }
  }, [watchedValues]);

  useEffect(() => {
    if (!hasInteracted) return;
    if (isProcessing) return;
    if (!lastEditedAt) return;
    if (!methods.formState.isDirty) return;
    if (!firestore) return;
    if (!isAdminCreatedApp && !targetUserId) return;

    const timer = setTimeout(async () => {
      try {
        setIsAutoSaving(true);
        setAutoSaveError(null);
        const savedId = await saveProgress(true);
        if (savedId) {
          setLastSavedAt(new Date());
        }
      } catch (error: any) {
        setAutoSaveError(String(error?.message || 'Autosave failed'));
      } finally {
        setIsAutoSaving(false);
      }
    }, 1800);

    return () => clearTimeout(timer);
  }, [
    hasInteracted,
    lastEditedAt,
    isProcessing,
    methods.formState.isDirty,
    firestore,
    isAdminCreatedApp,
    targetUserId,
  ]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!methods.formState.isDirty || isProcessing) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [methods.formState.isDirty, isProcessing]);


  useEffect(() => {
    // Clear validation error when the form becomes valid for the current step
    const fieldsForCurrentStep = steps[currentStep - 1].fields;
    const hasErrorsInCurrentStep = fieldsForCurrentStep.some(field => errors[field as keyof FormValues]);

    if (!hasErrorsInCurrentStep) {
        setValidationError(null);
    }
  }, [errors, currentStep]);

  const checkMrnUniqueness = async (mrn: string) => {
    if (!firestore) return;
    const normalizedMrn = mrn.trim();
    if (!normalizedMrn) {
      clearErrors('memberMrn');
      return;
    }

    try {
      const [userAppsSnap, adminAppsSnap] = await Promise.all([
        getDocs(query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))),
        getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))),
      ]);

      const currentPath = docRef?.path;
      const allDocs = [...userAppsSnap.docs, ...adminAppsSnap.docs];
      const seenPaths = new Set<string>();
      const duplicates = allDocs.filter((docSnapshot) => {
        const path = docSnapshot.ref.path;
        if (seenPaths.has(path)) return false;
        seenPaths.add(path);
        if (currentPath && path === currentPath) return false;
        return true;
      });

      if (duplicates.length > 0) {
        const currentData = getValues();
        const linkableAdmin = await findLinkableAdminApplication({
          memberMrn: normalizedMrn,
          memberFirstName: currentData.memberFirstName,
          memberLastName: currentData.memberLastName,
        });
        const otherDuplicates = duplicates.filter((dup) => dup.id !== linkableAdmin?.id);
        if (linkableAdmin && otherDuplicates.length === 0 && !internalApplicationId && !isAdminView) {
          clearErrors('memberMrn');
          return;
        }
        setError('memberMrn', { type: 'manual', message: 'MRN already used in another application.' });
      } else {
        clearErrors('memberMrn');
      }
    } catch (error) {
      console.error('Error checking MRN uniqueness:', error);
    }
  };


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

        let targetIsAdminCreatedDoc = Boolean(docId?.startsWith('admin_app_'));

        const continueAdminSeedIfAny = async () => {
          if (docId || isAdminView) return null;
          const linkable = await findLinkableAdminApplication({
            memberMrn: currentData.memberMrn,
            memberFirstName: currentData.memberFirstName,
            memberLastName: currentData.memberLastName,
          });
          return linkable;
        };

        const persistWithDoc = async () => {
          if (!docId) {
            if (targetIsAdminCreatedDoc) {
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
          const resolvedDocRef = targetIsAdminCreatedDoc
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
          if (targetIsAdminCreatedDoc) {
              dataToSave.createdByAdmin = true;
          }

          setDoc(resolvedDocRef, dataToSave, { merge: true })
              .then(() => {
                  if (!isNavigating) {
                      toast({ title: 'Progress Saved', description: 'Your changes have been saved.' });
                  }
                  resolve(docId);
              })
              .catch((error) => {
                  const permissionError = new FirestorePermissionError({
                      path: resolvedDocRef.path,
                      operation: isNewDoc ? 'create' : 'update',
                      requestResourceData: dataToSave,
                  });
                  errorEmitter.emit('permission-error', permissionError);

                  if (!isNavigating) {
                      toast({ variant: "destructive", title: "Save Error", description: `Could not save your progress: ${error.message}` });
                  }
                  reject(error);
              });
        };

        continueAdminSeedIfAny()
          .then((linked) => {
            if (linked) {
              docId = linked.id;
              targetIsAdminCreatedDoc = true;
              isNewDoc = false;
              setInternalApplicationId(linked.id);
              if (!isNavigating) {
                toast({
                  title: 'Linked existing application',
                  description: 'Continuing the backend application started by staff.',
                });
              }
            }
            return persistWithDoc();
          })
          .catch((err) => reject(err));
    });
  };

  const nextStep = async () => {
    const fields = steps[currentStep - 1].fields;
    const isValid = await trigger(fields as FieldPath<FormValues>[], { shouldFocus: true });
    
    if (!isValid) {
      setValidationError("Please correct the errors on this page. Required fields are marked with a red asterisk (*).");
      const firstErrorField = fields.find((field) => errors[field]);
      if (firstErrorField) {
        setTimeout(() => setFocus(firstErrorField), 0);
      }
      return;
    }

    setValidationError(null);
    
    if (currentStep < steps.length) {
        const savedAppId = await saveProgress(true);
        if (savedAppId) {
          const newUrl = appUserId
            ? `/admin/forms/edit?applicationId=${savedAppId}&step=${currentStep + 1}&userId=${appUserId}`
            : `/forms/cs-summary-form?applicationId=${savedAppId}&step=${currentStep + 1}`;
          router.push(newUrl);
          setCurrentStep(currentStep + 1);
          window.scrollTo(0, 0);
        }
    }
  };

  const prevStep = async () => {
    const savedAppId = await saveProgress(true);
    if (currentStep > 1 && savedAppId) {
      const newUrl = appUserId
        ? `/admin/forms/edit?applicationId=${savedAppId}&step=${currentStep - 1}&userId=${appUserId}`
        : `/forms/cs-summary-form?applicationId=${savedAppId}&step=${currentStep - 1}`;
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
    
    const errorFields = Object.keys(errors || {});
    const firstErrorField = errorFields[0];
    const firstErrorStep = findFirstErrorStep(errors);
    
    if (firstErrorStep && firstErrorStep !== currentStep) {
        setCurrentStep(firstErrorStep);
        setValidationError(`Please correct errors on this page before proceeding. Required fields are marked with a red asterisk (*).`);
        if (firstErrorField) {
          setTimeout(() => setFocus(firstErrorField as FieldPath<FormValues>), 0);
        }
        window.scrollTo(0, 0);
    } else {
        setValidationError(`Please check the form for errors. Required fields are marked with a red asterisk (*).`);
        if (firstErrorField) {
          setTimeout(() => setFocus(firstErrorField as FieldPath<FormValues>), 0);
        }
        if (!firstErrorStep && currentStep !== 1) {
          setCurrentStep(1);
          window.scrollTo(0, 0);
        }
    }
    
    if (firstErrorField) {
      toast({
        variant: "destructive",
        title: "Missing required field",
        description: formatFieldLabel(firstErrorField)
      });
    }
  };

  const jumpToField = (fieldName: string) => {
    const nextStep = fieldToStepMap[fieldName] || 1;
    if (nextStep !== currentStep) {
      setCurrentStep(nextStep);
    }
    setValidationError('Please fix the highlighted fields before continuing.');
    setTimeout(() => {
      setFocus(fieldName as FieldPath<FormValues>);
    }, 100);
  };

  const checkForDuplicates = async (data: FormValues): Promise<boolean> => {
    if (!firestore) return false;

    const normalizedMrn = data.memberMrn?.trim();
    if (!normalizedMrn) return false;

    let userAppsSnap;
    let adminAppsSnap;
    try {
      [userAppsSnap, adminAppsSnap] = await Promise.all([
        getDocs(query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))),
        getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))),
      ]);
    } catch (error: any) {
      console.warn('Duplicate check skipped:', error);
      return false;
    }

    const currentPath = docRef?.path;
    const allDocs = [...userAppsSnap.docs, ...adminAppsSnap.docs];
    const seenPaths = new Set<string>();
    const duplicates = allDocs.filter((docSnapshot) => {
      const path = docSnapshot.ref.path;
      if (seenPaths.has(path)) return false;
      seenPaths.add(path);
      if (currentPath && path === currentPath) return false;
      return true;
    });

    if (duplicates.length > 0) {
      const linkableAdmin = await findLinkableAdminApplication({
        memberMrn: data.memberMrn,
        memberFirstName: data.memberFirstName,
        memberLastName: data.memberLastName,
      });
      const otherDuplicates = duplicates.filter((dup) => dup.id !== linkableAdmin?.id);
      if (linkableAdmin && otherDuplicates.length === 0 && !internalApplicationId && !isAdminView) {
        return false;
      }
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

    if (!firestore) {
      toast({ variant: "destructive", title: "Error", description: "Firestore not available." });
      setIsProcessing(false);
      return;
    }
    
    if (!targetUserId && !isAdminCreatedApp) {
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
        
        const reviewUrl = appUserId || finalAppId.startsWith('admin_app_')
          ? `/admin/forms/review?applicationId=${finalAppId}${appUserId ? `&userId=${appUserId}` : ''}`
          : `/forms/cs-summary-form/review?applicationId=${finalAppId}`;
        router.push(reviewUrl);
        
    } catch {
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

  const handleDeleteDraft = async () => {
    if (isAdminView) return;
    if (!firestore || !docRef || !internalApplicationId) {
      toast({
        variant: 'destructive',
        title: 'No saved draft',
        description: 'Save a draft first, then you can delete it.',
      });
      return;
    }
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm('Delete this draft application? This cannot be undone.')
        : false;
    if (!confirmed) return;

    setIsDeletingDraft(true);
    try {
      await deleteDoc(docRef);
      const displayName = user?.displayName || '';
      const nameParts = displayName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const freshValues: Partial<FormValues> = {
        referrerFirstName: firstName,
        referrerLastName: lastName,
        referrerEmail: user?.email || '',
      };

      reset(freshValues as FormValues);
      setInternalApplicationId(null);
      setShowSkipOption(false);
      setLastSavedAt(null);
      setAutoSaveError(null);
      setHasInteracted(false);
      setLastEditedAt(0);
      initialWatchCompleteRef.current = false;
      lastSnapshotRef.current = JSON.stringify(freshValues);
      setCurrentStep(1);
      router.replace('/forms/cs-summary-form');

      toast({
        title: 'Draft deleted',
        description: 'Your saved draft was removed.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error?.message || 'Could not delete this draft.',
      });
    } finally {
      setIsDeletingDraft(false);
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
                          <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                            {isAutoSaving ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Saving draft...
                              </span>
                            ) : lastSavedAt ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <CheckCircle2 className="h-3 w-3" /> Saved {lastSavedAt.toLocaleTimeString()}
                              </span>
                            ) : (
                              <span>Draft saves automatically while you type.</span>
                            )}
                            {autoSaveError ? <span className="text-red-600">Autosave error: {autoSaveError}</span> : null}
                          </div>
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
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     className="sm:w-auto"
                     onClick={async () => {
                       try {
                         const savedId = await saveProgress(false);
                         if (savedId) setLastSavedAt(new Date());
                       } catch {
                         // handled in saveProgress
                       }
                     }}
                   >
                     <Save className="mr-2 h-4 w-4" /> Save Draft
                   </Button>
                   {!isAdminView && internalApplicationId ? (
                     <Button
                       type="button"
                       variant="destructive"
                       size="sm"
                       className="sm:w-auto"
                       onClick={() => void handleDeleteDraft()}
                       disabled={isDeletingDraft}
                     >
                       {isDeletingDraft ? (
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       ) : (
                         <Trash2 className="mr-2 h-4 w-4" />
                       )}
                       Delete Draft
                     </Button>
                   ) : null}
              </div>
              <Progress value={progress} className="w-full" />
            </div>

            {errorChecklist.length > 0 && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-medium text-amber-900">Quick fixes needed before submit</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {errorChecklist.slice(0, 12).map((item) => (
                    <button
                      key={`err-${item.field}`}
                      type="button"
                      onClick={() => jumpToField(item.field)}
                      className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100"
                    >
                      Step {item.step}: {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Skip to Pathway Option for Completed Forms */}
            {showSkipOption && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium text-blue-900">CS Summary Already Completed</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Your CS Member Summary form is already completed. You can skip directly to the pathway page to continue with other requirements.
                    </p>
                  </div>
                  <Button 
                    type="button"
                    onClick={handleSkipToPathway}
                    className="w-full sm:w-auto sm:ml-4 bg-blue-600 hover:bg-blue-700"
                  >
                    Skip to Pathway
                  </Button>
                </div>
              </div>
            )}

            <div className="min-h-[450px]">
              {currentStep === 1 && <Step1 isAdminView={isAdminView} onCheckMrnUnique={checkMrnUniqueness} />}
              {currentStep === 2 && <Step2 />}
              {currentStep === 3 && <Step3 />}
              {currentStep === 4 && <Step4 />}
              {currentStep === 5 && <Step5 />}
            </div>

            <div className="mt-8 pt-5 border-t">
               {currentStep === steps.length && (
                <Alert className={errorChecklist.length > 0 ? 'mb-4 border-amber-300 bg-amber-50' : 'mb-4 border-green-300 bg-green-50'}>
                  {errorChecklist.length > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  <AlertTitle>{errorChecklist.length > 0 ? 'Not ready to submit yet' : 'Ready to submit'}</AlertTitle>
                  <AlertDescription>
                    {errorChecklist.length > 0
                      ? `Please fix ${errorChecklist.length} required field(s) before reviewing and completing.`
                      : 'All required sections look complete. You can continue to Review & Complete.'}
                  </AlertDescription>
                </Alert>
              )}
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
