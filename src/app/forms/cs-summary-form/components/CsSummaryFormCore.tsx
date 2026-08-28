'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm, FormProvider, FieldPath, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Save, Trash2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError, useMemoFirebase } from '@/firebase';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp, collection, collectionGroup, query, where, getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
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
import { AdminCaspioIntakeFieldsPanel } from '@/app/admin/forms/components/AdminCaspioIntakeFieldsPanel';
import { stripCaspioIntakeFields } from '@/lib/caspio-intake-fields';

const steps = [
  { id: 1, name: 'Member & Contact Info', fields: [
      'memberFirstName', 'memberLastName', 'memberAge', 'memberMrn', 'confirmMemberMrn', 'memberLanguage',
      'memberMediCalNum', 'confirmMemberMediCalNum', 'memberDob', 'sex', 'memberPhone', 'memberEmail',
      'referrerFirstName', 'referrerLastName', 'referrerPhone', 'referrerRelationship', 'agency',
      'submitterAlsoReceivesDocRequests',
      'isPrimaryContactSameAsReferrer', 'isPrimaryContactSameAsMember',
      'bestContactFirstName', 'bestContactLastName', 'bestContactRelationship', 'bestContactPhone', 'bestContactEmail', 'bestContactLanguage',
      'secondaryContactFirstName', 'secondaryContactLastName', 'secondaryContactRelationship', 'secondaryContactPhone', 'secondaryContactEmail', 'secondaryContactLanguage',
      'hasLegalRep', 'repFirstName', 'repLastName', 'repRelationship', 'repPhone', 'repEmail'
  ]},
  { id: 2, name: 'Location Information', fields: ['currentLocation', 'currentLocationName', 'currentAddress', 'currentCity', 'currentState', 'currentZip', 'currentCounty', 'customaryLocationType', 'customaryLocationName', 'customaryAddress', 'customaryCity', 'customaryState', 'customaryZip', 'customaryCounty'] },
  { id: 3, name: 'Health Plan & Pathway', fields: ['healthPlan', 'pathway', 'switchingHealthPlan', 'existingHealthPlan'] },
  { id: 4, name: 'Financial & Cost Information', fields: [] },
  { id: 5, name: 'ISP, ALW, RCFE Selection', fields: [
      'ispContactIsMember',
      'ispContactSameAsPrimary',
      'ispSecondaryContactSameAsPrimary',
      'ispLocationSameAsCurrent',
      'ispFirstName', 'ispLastName', 'ispRelationship', 'ispFacilityName', 'ispPhone', 'ispEmail',
      'ispSecondaryFirstName', 'ispSecondaryLastName', 'ispSecondaryRelationship', 'ispSecondaryPhone', 'ispSecondaryEmail',
      'ispLocationType', 'ispAddress', 'ispCity', 'ispState', 'ispZip',
      'snfDiversionReason',
      'preAssessmentCareNeedsNotes',
      'onALWWaitlist', 'hasPrefRCFE',
      'rcfeSameAsCurrentLocation',
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

function isValidMemberNameValue(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  const lowered = normalized.toLowerCase();
  return !['undefined', 'null', 'nan'].includes(lowered);
}

function splitNameParts(fullName: string) {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function resolveLoadedMediCalNumber(source: Record<string, unknown>) {
  const pick = (value: unknown) => String(value || '').trim();
  const candidates = [
    source.memberMediCalNum,
    source.confirmMemberMediCalNum,
    source.MediCal_Number,
    source.Medi_Cal_Number,
    source.MediCalNumber,
    source.Medical_Number,
    source.MedicalNumber,
    source.CIN,
    source.cin,
    source.CIN_Number,
    source.MCP_CIN,
  ];
  const resolved = candidates.map(pick).find((value) => Boolean(value)) || '';
  return resolved.toUpperCase();
}

function getStaffIdentity(options: {
  currentUser: unknown;
  appData?: Record<string, unknown>;
  preferAssignedStaff?: boolean;
}) {
  const currentUser = (options.currentUser && typeof options.currentUser === 'object'
    ? options.currentUser
    : {}) as Record<string, unknown>;
  const appData = options.appData || {};

  const userDisplayName = String(currentUser.displayName || '').trim();
  const userEmail = String(currentUser.email || '').trim();
  const providerDisplayName = String((Array.isArray(currentUser.providerData) ? currentUser.providerData[0] : {})?.displayName || '').trim();
  const providerEmail = String((Array.isArray(currentUser.providerData) ? currentUser.providerData[0] : {})?.email || '').trim();

  const storedDisplayName = String(
    appData.assignedStaffName ||
    appData.assignedStaffDisplayName ||
    appData.draftSubmittedByStaffName ||
    appData.referrerName ||
    ''
  ).trim();
  const storedEmail = String(
    appData.assignedStaffEmail ||
    appData.draftSubmittedByStaffEmail ||
    appData.calaimCoordinatorEmail ||
    ''
  ).trim();

  const preferAssignedStaff = Boolean(options.preferAssignedStaff);
  const resolvedEmail = preferAssignedStaff
    ? (storedEmail || userEmail || providerEmail)
    : (userEmail || providerEmail || storedEmail);
  const resolvedName = preferAssignedStaff
    ? (storedDisplayName || userDisplayName || providerDisplayName || (resolvedEmail ? resolvedEmail.split('@')[0] : ''))
    : (userDisplayName || providerDisplayName || storedDisplayName || (resolvedEmail ? resolvedEmail.split('@')[0] : ''));
  const nameParts = splitNameParts(resolvedName);

  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: resolvedEmail,
  };
}

type LoggedInUserIdentity = {
  firstName: string;
  lastName: string;
  email: string;
};

function normalizeNameForCompare(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function getLoggedInUserIdentityFromAuth(
  currentUser: { displayName?: string | null; email?: string | null; providerData?: unknown[] } | null | undefined
): LoggedInUserIdentity {
  if (!currentUser) return { firstName: '', lastName: '', email: '' };

  const displayName = String(currentUser.displayName || '').trim();
  const provider = (Array.isArray(currentUser.providerData) ? currentUser.providerData[0] : {}) as Record<string, unknown>;
  const providerDisplayName = String(provider?.displayName || '').trim();
  const providerEmail = String(provider?.email || '').trim();
  const resolvedName = displayName || providerDisplayName;
  const nameParts = splitNameParts(resolvedName);

  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: String(currentUser.email || providerEmail || '').trim(),
  };
}

async function resolveLoggedInUserIdentity(
  firestore: ReturnType<typeof useFirestore> | null | undefined,
  currentUser: { uid?: string; displayName?: string | null; email?: string | null; providerData?: unknown[] } | null | undefined
): Promise<LoggedInUserIdentity> {
  const base = getLoggedInUserIdentityFromAuth(currentUser);
  if (!firestore || !currentUser?.uid) return base;

  try {
    const snap = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        firstName: String(data.firstName || base.firstName || '').trim(),
        lastName: String(data.lastName || base.lastName || '').trim(),
        email: String(currentUser.email || data.email || base.email || '').trim(),
      };
    }
  } catch {
    // Fall back to auth profile when the user doc cannot be read.
  }

  return base;
}

function applyLoggedInSubmitterIdentityToRecord(
  target: Record<string, unknown>,
  identity: LoggedInUserIdentity,
  memberHint?: { firstName?: unknown; lastName?: unknown }
) {
  const memberFirst = normalizeNameForCompare(memberHint?.firstName ?? target.memberFirstName);
  const memberLast = normalizeNameForCompare(memberHint?.lastName ?? target.memberLastName);
  const identityFirst = normalizeNameForCompare(identity.firstName);
  const identityLast = normalizeNameForCompare(identity.lastName);
  const identityMatchesMember =
    Boolean(memberFirst && memberLast && identityFirst && identityLast) &&
    identityFirst === memberFirst &&
    identityLast === memberLast;

  // Always keep submitter email from the logged-in account when empty.
  if (identity.email && !String(target.referrerEmail || '').trim()) {
    target.referrerEmail = identity.email;
  }

  // Do not prefill submitter name with the member's name (common when the portal
  // account was created under the member). Family must type their own name.
  if (identityMatchesMember) {
    const referrerFirst = normalizeNameForCompare(target.referrerFirstName);
    const referrerLast = normalizeNameForCompare(target.referrerLastName);
    if (referrerFirst === memberFirst && referrerLast === memberLast) {
      target.referrerFirstName = '';
      target.referrerLastName = '';
    }
    return;
  }

  if (identity.firstName && !String(target.referrerFirstName || '').trim()) {
    target.referrerFirstName = identity.firstName;
  }
  if (identity.lastName && !String(target.referrerLastName || '').trim()) {
    target.referrerLastName = identity.lastName;
  }
}

function shouldSyncSubmitterWithLoggedInUser(
  current: Pick<FormValues, 'referrerFirstName' | 'referrerLastName' | 'referrerEmail' | 'memberFirstName' | 'memberLastName'>,
  identity: LoggedInUserIdentity
) {
  const memberFirst = normalizeNameForCompare(current.memberFirstName);
  const memberLast = normalizeNameForCompare(current.memberLastName);
  const referrerFirst = normalizeNameForCompare(current.referrerFirstName);
  const referrerLast = normalizeNameForCompare(current.referrerLastName);
  const referrerEmail = normalizeNameForCompare(current.referrerEmail);

  const identityFirst = normalizeNameForCompare(identity.firstName);
  const identityLast = normalizeNameForCompare(identity.lastName);
  const identityEmail = normalizeNameForCompare(identity.email);

  const identityMatchesMember =
    Boolean(memberFirst && memberLast && identityFirst && identityLast) &&
    identityFirst === memberFirst &&
    identityLast === memberLast;

  const referrerMatchesMember =
    Boolean(memberFirst && memberLast) &&
    referrerFirst === memberFirst &&
    referrerLast === memberLast;

  const referrerEmpty = !referrerFirst && !referrerLast;
  const emailEmpty = !referrerEmail;

  // Only fill blanks / clear accidental member-as-submitter. Never overwrite a name the user typed.
  if (identityMatchesMember || referrerMatchesMember) return true;
  if (referrerEmpty && (identityFirst || identityLast) && !identityMatchesMember) return true;
  if (emailEmpty && identityEmail) return true;
  return false;
}

function applyLoggedInSubmitterToForm(
  setValue: (name: FieldPath<FormValues>, value: unknown, options?: { shouldDirty?: boolean }) => void,
  getValues: () => FormValues,
  identity: LoggedInUserIdentity
) {
  if (!identity.firstName && !identity.lastName && !identity.email) return;

  const current = getValues();
  if (!shouldSyncSubmitterWithLoggedInUser(current, identity)) return;

  const memberFirst = normalizeNameForCompare(current.memberFirstName);
  const memberLast = normalizeNameForCompare(current.memberLastName);
  const identityFirst = normalizeNameForCompare(identity.firstName);
  const identityLast = normalizeNameForCompare(identity.lastName);
  const identityMatchesMember =
    Boolean(memberFirst && memberLast && identityFirst && identityLast) &&
    identityFirst === memberFirst &&
    identityLast === memberLast;
  const referrerMatchesMember =
    Boolean(memberFirst && memberLast) &&
    normalizeNameForCompare(current.referrerFirstName) === memberFirst &&
    normalizeNameForCompare(current.referrerLastName) === memberLast;

  if (identity.email && !normalizeNameForCompare(current.referrerEmail)) {
    setValue('referrerEmail', identity.email, { shouldDirty: false });
  }

  if (identityMatchesMember || referrerMatchesMember) {
    if (referrerMatchesMember || identityMatchesMember) {
      setValue('referrerFirstName', '', { shouldDirty: false });
      setValue('referrerLastName', '', { shouldDirty: false });
    }
    return;
  }

  if (identity.firstName && !normalizeNameForCompare(current.referrerFirstName)) {
    setValue('referrerFirstName', identity.firstName, { shouldDirty: false });
  }
  if (identity.lastName && !normalizeNameForCompare(current.referrerLastName)) {
    setValue('referrerLastName', identity.lastName, { shouldDirty: false });
  }
}

function CsSummaryFormComponent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  
  const applicationId = searchParams.get('applicationId');
  const appUserId = searchParams.get('userId'); // For admins editing a user's app
  const isAdminRoute = String(pathname || '').startsWith('/admin/');

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
  const [hasPendingUnsavedChanges, setHasPendingUnsavedChanges] = useState(false);
  const [lastEditedAt, setLastEditedAt] = useState(0);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [isKaiserSkeletonDraftFlow, setIsKaiserSkeletonDraftFlow] = useState(false);
  const [isStaffDraftFlow, setIsStaffDraftFlow] = useState(false);
  const navigationFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialWatchCompleteRef = useRef(false);
  const lastSnapshotRef = useRef('');
  const savedSnapshotRef = useRef('');
  const mrnIndexWarningShownRef = useRef(false);
  /** Avoid re-fetching Firestore and reset() right after we create/save a draft locally. */
  const hydratedApplicationIdRef = useRef<string | null>(null);
  const skipHydrateApplicationIdsRef = useRef<Set<string>>(new Set());
  const navigateWithHardFallback = (target: string) => {
    const destination = String(target || '').trim();
    if (!destination) return;
    if (navigationFallbackTimerRef.current) {
      clearTimeout(navigationFallbackTimerRef.current);
      navigationFallbackTimerRef.current = null;
    }
    if (typeof window === 'undefined') {
      router.push(destination);
      return;
    }
    const startPath = `${window.location.pathname}${window.location.search}`;
    try {
      router.push(destination);
      navigationFallbackTimerRef.current = window.setTimeout(() => {
        try {
          const expected = new URL(destination, window.location.origin);
          const currentPath = `${window.location.pathname}${window.location.search}`;
          const expectedPath = `${expected.pathname}${expected.search}`;
          if (currentPath === startPath && currentPath !== expectedPath) {
            window.location.assign(expected.href);
          }
        } catch {
          window.location.assign(destination);
        }
      }, 1200);
    } catch {
      window.location.assign(destination);
    }
  };

  useEffect(() => {
    return () => {
      if (navigationFallbackTimerRef.current) {
        clearTimeout(navigationFallbackTimerRef.current);
        navigationFallbackTimerRef.current = null;
      }
    };
  }, []);


  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      isPrimaryContactSameAsReferrer: false,
      isPrimaryContactSameAsMember: false,
      submitterAlsoReceivesDocRequests: false,
      copyAddress: false,
      ispContactIsMember: false,
      ispContactSameAsPrimary: false,
      ispSecondaryContactSameAsPrimary: false,
      ispLocationSameAsCurrent: false,
      rcfeSameAsCurrentLocation: false,
    }
  });

  const { formState: { errors }, trigger, getValues, handleSubmit, reset, setFocus, setError, clearErrors, setValue } = methods;
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
  const isAdminView = isAdminRoute || !!appUserId;
  const isAdminCreatedApp = internalApplicationId?.startsWith('admin_app_');
  const backLink = isAdminView
    ? `/admin/applications/${internalApplicationId}${appUserId ? `?userId=${appUserId}` : ''}`
    : `/applications`;
  
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
    hydratedApplicationIdRef.current = null;
    skipHydrateApplicationIdsRef.current.clear();
  }, [applicationId]);

  useEffect(() => {
    const fetchApplicationData = async () => {
      if (docRef && internalApplicationId) {
        if (skipHydrateApplicationIdsRef.current.has(internalApplicationId)) {
          skipHydrateApplicationIdsRef.current.delete(internalApplicationId);
          hydratedApplicationIdRef.current = internalApplicationId;
          return;
        }
        if (hydratedApplicationIdRef.current === internalApplicationId) {
          return;
        }

        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Application;
          const isSkeletonSeed =
            Boolean((data as any)?.createdByAdmin) ||
            Boolean((data as any)?.intakeSource) ||
            String((data as any)?.id || '').startsWith('admin_app_') ||
            Boolean(internalApplicationId?.startsWith('admin_app_'));
          const isStaffDraftFlowDetected = isAdminView && isSkeletonSeed;
          const normalizedIntakeType = String((data as any)?.intakeType || '').trim().toLowerCase();
          const normalizedIntakeSource = String((data as any)?.intakeSource || '').trim().toLowerCase();
          const isIlsGeneratedDraft =
            normalizedIntakeType === 'kaiser_auth_received_via_ils' ||
            normalizedIntakeSource === 'ils_single_authorization_sheet' ||
            normalizedIntakeSource === 'ils_spreadsheet_batch';

          const nextData = { ...(data as any) } as Record<string, unknown>;
          const resolvedMediCalNumber = resolveLoadedMediCalNumber(nextData);
          if (resolvedMediCalNumber) {
            if (!String(nextData.memberMediCalNum || '').trim()) {
              nextData.memberMediCalNum = resolvedMediCalNumber;
            }
            if (!String(nextData.confirmMemberMediCalNum || '').trim()) {
              nextData.confirmMemberMediCalNum = resolvedMediCalNumber;
            }
          }
          // Normalize skeleton/create aliases so CS Summary fields prefill from create-app data.
          if (!String(nextData.sex || '').trim() && String(nextData.memberSex || '').trim()) {
            nextData.sex = String(nextData.memberSex || '').trim();
          }
          if (!String(nextData.confirmMemberMrn || '').trim() && String(nextData.memberMrn || '').trim()) {
            nextData.confirmMemberMrn = String(nextData.memberMrn || '').trim();
          }
          if (
            !String(nextData.confirmMemberMediCalNum || '').trim() &&
            String(nextData.memberMediCalNum || '').trim()
          ) {
            nextData.confirmMemberMediCalNum = String(nextData.memberMediCalNum || '').trim();
          }
          (['Address', 'City', 'State', 'Zip', 'County'] as const).forEach((suffix) => {
            const formKey = `customary${suffix}`;
            const legacyKey = `memberCustomary${suffix}`;
            if (!String(nextData[formKey] || '').trim() && String(nextData[legacyKey] || '').trim()) {
              nextData[formKey] = String(nextData[legacyKey] || '').trim();
            }
          });
          if (
            !String(nextData.customaryLocationType || '').trim() &&
            String(nextData.memberCustomaryLocation || '').trim()
          ) {
            nextData.customaryLocationType = String(nextData.memberCustomaryLocation || '').trim();
          }
          if (isStaffDraftFlowDetected) {
            const staffIdentity = getStaffIdentity({
              currentUser: user,
              appData: data as Record<string, unknown>,
              preferAssignedStaff: true,
            });
            const existingReferrerPhone = String((data as any)?.referrerPhone || '').trim();
            const fallbackPhone = String((data as any)?.contactPhone || '').trim() || String((data as any)?.careManagerPhone || '').trim();
            nextData.referrerFirstName = staffIdentity.firstName || String((data as any)?.referrerFirstName || '');
            nextData.referrerLastName = staffIdentity.lastName || String((data as any)?.referrerLastName || '');
            nextData.referrerEmail = staffIdentity.email || String((data as any)?.referrerEmail || '');
            nextData.referrerPhone = existingReferrerPhone || fallbackPhone;
            nextData.referrerRelationship = 'Staff';
            nextData.agency = String((data as any)?.agency || '').trim() || 'Connections Care Home Consultants';
            nextData.isPrimaryContactSameAsReferrer = false;
          }
          const normalizedStatus = String((data as any)?.status || '').trim().toLowerCase();
          const hasLegacyAutoSelectedPathway = Boolean(String(nextData.pathway || '').trim());
          const hasPathwaySelectionConfirmation = Boolean(
            String((nextData as any)?.pathwaySelectionConfirmedAt || '').trim()
          );
          const shouldClearLegacyDraftPathway =
            isStaffDraftFlowDetected &&
            normalizedStatus === 'draft' &&
            hasLegacyAutoSelectedPathway &&
            !hasPathwaySelectionConfirmation;
          if (shouldClearLegacyDraftPathway) {
            nextData.pathway = '';
            nextData.snfDiversionReason = '';
          }

          if (!isAdminView && user) {
            const loggedInIdentity = await resolveLoggedInUserIdentity(firestore, user);
            applyLoggedInSubmitterIdentityToRecord(nextData, loggedInIdentity);
          }

          reset(stripCaspioIntakeFields(nextData) as FormValues);
          hydratedApplicationIdRef.current = internalApplicationId;
          setIsKaiserSkeletonDraftFlow(isStaffDraftFlowDetected);
          setIsStaffDraftFlow(isStaffDraftFlowDetected);
          
          // Check if CS Summary is already completed and show skip option
          const csSummaryForm = data.forms?.find(form => 
            form.name === 'CS Member Summary' || form.name === 'CS Summary'
          );
          if (csSummaryForm?.status === 'Completed' && !isAdminView) {
            setShowSkipOption(true);
          }
        } else {
            if (skipHydrateApplicationIdsRef.current.has(internalApplicationId)) {
              skipHydrateApplicationIdsRef.current.delete(internalApplicationId);
              hydratedApplicationIdRef.current = internalApplicationId;
              return;
            }
            setInternalApplicationId(null);
            hydratedApplicationIdRef.current = null;
            setIsKaiserSkeletonDraftFlow(false);
            setIsStaffDraftFlow(false);
            if (user && !isAdminView) {
                const loggedInIdentity = await resolveLoggedInUserIdentity(firestore, user);
                const nextValues = { ...getValues() };
                applyLoggedInSubmitterIdentityToRecord(nextValues as Record<string, unknown>, loggedInIdentity);
                reset(nextValues as FormValues);
            }
        }
      } else if (user && !internalApplicationId && !isAdminView) {
          setIsKaiserSkeletonDraftFlow(false);
          setIsStaffDraftFlow(false);
          const loggedInIdentity = await resolveLoggedInUserIdentity(firestore, user);
          const nextValues: Record<string, unknown> = {};
          applyLoggedInSubmitterIdentityToRecord(nextValues, loggedInIdentity);
          reset(nextValues as FormValues);
      }
    };
    fetchApplicationData();
  }, [docRef, user, firestore, reset, isAdminView, getValues, internalApplicationId]);

  useEffect(() => {
    if (isAdminView || isStaffDraftFlow || isUserLoading || !user) return;

    let cancelled = false;
    (async () => {
      const loggedInIdentity = await resolveLoggedInUserIdentity(firestore, user);
      if (cancelled) return;
      applyLoggedInSubmitterToForm(setValue, getValues, loggedInIdentity);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    isUserLoading,
    isAdminView,
    isStaffDraftFlow,
    firestore,
    watchedValues.memberFirstName,
    watchedValues.memberLastName,
    setValue,
    getValues,
  ]);

  useEffect(() => {
    const nextSnapshot = JSON.stringify(watchedValues || {});
    if (!initialWatchCompleteRef.current) {
      initialWatchCompleteRef.current = true;
      lastSnapshotRef.current = nextSnapshot;
      savedSnapshotRef.current = nextSnapshot;
      setHasPendingUnsavedChanges(false);
      return;
    }
    if (nextSnapshot !== lastSnapshotRef.current) {
      lastSnapshotRef.current = nextSnapshot;
      if (methods.formState.isDirty) {
        setHasInteracted(true);
        setLastEditedAt(Date.now());
      }
    }
    setHasPendingUnsavedChanges(
      Boolean(methods.formState.isDirty) && nextSnapshot !== savedSnapshotRef.current
    );
  }, [watchedValues, methods.formState.isDirty]);

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
    if (isAdminView) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingUnsavedChanges || isProcessing) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingUnsavedChanges, isProcessing, isAdminView]);


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
      const adminAppsSnap = await getDocs(
        query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))
      );
      let userAppsDocs: QueryDocumentSnapshot<DocumentData>[] = [];
      try {
        const userAppsSnap = await getDocs(
          query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))
        );
        userAppsDocs = userAppsSnap.docs;
      } catch (groupError: any) {
        const code = String(groupError?.code || '').trim().toLowerCase();
        const msg = String(groupError?.message || '').toLowerCase();
        const missingIndex = code === 'failed-precondition' || msg.includes('requires a collection_group') || msg.includes('index');
        if (!missingIndex) throw groupError;
        if (!mrnIndexWarningShownRef.current) {
          mrnIndexWarningShownRef.current = true;
          toast({
            title: 'MRN duplicate check limited',
            description: 'Cross-user MRN duplicate checking is temporarily limited until the Firestore index is available.',
          });
        }
      }

      const currentPath = docRef?.path;
      const allDocs = [...userAppsDocs, ...adminAppsSnap.docs];
      const seenPaths = new Set<string>();
      const duplicates = allDocs.filter((docSnapshot) => {
        const path = docSnapshot.ref.path;
        if (seenPaths.has(path)) return false;
        seenPaths.add(path);
        if (currentPath && path === currentPath) return false;
        if (internalApplicationId && docSnapshot.id === internalApplicationId) return false;
        const status = String((docSnapshot.data() as any)?.status || '').trim().toLowerCase();
        if (status === 'deleted') return false;
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
    } catch (error: any) {
      console.warn('MRN uniqueness check skipped:', String(error?.message || 'unknown error'));
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
        const hasValidMemberNames =
          isValidMemberNameValue(currentData.memberFirstName) &&
          isValidMemberNameValue(currentData.memberLastName);
        if (!hasValidMemberNames) {
          setValidationError('Member first and last name are required before saving this draft.');
          if (!isNavigating) {
            toast({
              variant: 'destructive',
              title: 'Member name required',
              description: 'Enter member first and last name before saving.',
            });
          }
          setTimeout(() => setFocus('memberFirstName' as FieldPath<FormValues>), 0);
          return resolve(null);
        }
        setValidationError(null);
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
              skipHydrateApplicationIdsRef.current.add(docId);
              isNewDoc = true;
            } else {
              docId = doc(collection(firestore, `users/${targetUserId}/applications`)).id;
              setInternalApplicationId(docId);
              skipHydrateApplicationIdsRef.current.add(docId);
              isNewDoc = true;
            }
          }

          // Determine the correct document reference
          const resolvedDocRef = targetIsAdminCreatedDoc
            ? doc(firestore, 'applications', docId)
            : doc(firestore, `users/${targetUserId}/applications`, docId);

          const sanitizedData = Object.fromEntries(
              Object.entries(stripCaspioIntakeFields(currentData as Record<string, unknown>)).map(([key, value]) => [
                key,
                value === undefined ? null : value,
              ])
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

          // For admin-stored docs, preserve explicit conversion to normal apps.
          // Previously this always reset createdByAdmin=true on every save for
          // admin_app_* IDs, which made converted apps revert to skeleton mode.
          if (targetIsAdminCreatedDoc) {
              const keepSkeletonMode = isNewDoc ? true : Boolean((currentData as any)?.createdByAdmin);
              dataToSave.createdByAdmin = keepSkeletonMode;
              if (!keepSkeletonMode) {
                dataToSave.allowDraftCaspioPush = false;
              }
          }

          setDoc(resolvedDocRef, dataToSave, { merge: true })
              .then(() => {
                  const latestSnapshot = JSON.stringify(getValues() || {});
                  savedSnapshotRef.current = latestSnapshot;
                  setHasPendingUnsavedChanges(false);
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
    const allowDraftNavigationWithoutStepValidation = isStaffDraftFlow;
    if (!allowDraftNavigationWithoutStepValidation) {
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
    }

    setValidationError(null);
    
    if (currentStep < steps.length) {
        const savedAppId = await saveProgress(true);
        if (savedAppId) {
          const newUrl = isAdminView
            ? `/admin/forms/edit?applicationId=${savedAppId}&step=${currentStep + 1}${appUserId ? `&userId=${appUserId}` : ''}`
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
      const newUrl = isAdminView
        ? `/admin/forms/edit?applicationId=${savedAppId}&step=${currentStep - 1}${appUserId ? `&userId=${appUserId}` : ''}`
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

    let userAppsDocs: QueryDocumentSnapshot<DocumentData>[] = [];
    let adminAppsSnap;
    try {
      adminAppsSnap = await getDocs(
        query(collection(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))
      );
      try {
        const userAppsSnap = await getDocs(
          query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', normalizedMrn))
        );
        userAppsDocs = userAppsSnap.docs;
      } catch (groupError: any) {
        const code = String(groupError?.code || '').trim().toLowerCase();
        const msg = String(groupError?.message || '').toLowerCase();
        const missingIndex = code === 'failed-precondition' || msg.includes('requires a collection_group') || msg.includes('index');
        if (!missingIndex) throw groupError;
        if (!mrnIndexWarningShownRef.current) {
          mrnIndexWarningShownRef.current = true;
          toast({
            title: 'MRN duplicate check limited',
            description: 'Cross-user MRN duplicate checking is temporarily limited until the Firestore index is available.',
          });
        }
      }
    } catch (error: any) {
      console.warn('Duplicate check skipped:', error);
      return false;
    }

    const currentPath = docRef?.path;
    const allDocs = [...userAppsDocs, ...adminAppsSnap.docs];
    const seenPaths = new Set<string>();
    const duplicates = allDocs.filter((docSnapshot) => {
      const path = docSnapshot.ref.path;
      if (seenPaths.has(path)) return false;
      seenPaths.add(path);
      if (currentPath && path === currentPath) return false;
      if (internalApplicationId && docSnapshot.id === internalApplicationId) return false;
      const status = String((docSnapshot.data() as any)?.status || '').trim().toLowerCase();
      if (status === 'deleted') return false;
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

    const isEditingExistingApplication = Boolean(internalApplicationId);
    if (!isEditingExistingApplication) {
      const hasDuplicate = await checkForDuplicates(data);
      if (hasDuplicate) {
        setIsProcessing(false);
        return;
      }
    }
  
    try {
        const finalAppId = await saveProgress(true);
        if (!finalAppId) {
             toast({ variant: "destructive", title: "Error", description: "Could not get an application ID to finalize submission." });
             setIsProcessing(false);
             return;
        }

        if (isEditingExistingApplication && isAdminView && firestore) {
          const isFinalAdminApp = finalAppId.startsWith('admin_app_');
          const finalDocRef = isFinalAdminApp
            ? doc(firestore, 'applications', finalAppId)
            : (targetUserId ? doc(firestore, `users/${targetUserId}/applications`, finalAppId) : null);
          if (finalDocRef) {
            try {
              const finalSnap = await getDoc(finalDocRef);
              const existingData = (finalSnap.exists() ? (finalSnap.data() as Application) : ({} as Application));
              const forms = Array.isArray((existingData as any)?.forms) ? ([...(existingData as any).forms] as any[]) : [];
              const csSummaryIndex = forms.findIndex((form) => {
                const name = String(form?.name || '').trim();
                return name === 'CS Member Summary' || name === 'CS Summary';
              });
              const completedEntry = {
                name: 'CS Member Summary',
                type: 'online-form',
                status: 'Completed',
                href: isAdminView ? '/admin/forms/edit' : '/forms/cs-summary-form',
              };
              if (csSummaryIndex >= 0) {
                forms[csSummaryIndex] = {
                  ...forms[csSummaryIndex],
                  status: 'Completed',
                };
              } else {
                forms.push(completedEntry);
              }
              await setDoc(finalDocRef, {
                forms,
                csSummaryComplete: true,
                csSummaryCompletedAt: serverTimestamp(),
                lastUpdated: serverTimestamp(),
              }, { merge: true });
            } catch (completionSyncError: any) {
              console.warn('CS summary completion sync failed (non-blocking):', completionSyncError);
              toast({
                variant: 'destructive',
                title: 'Saved, but completion flag update failed',
                description: 'Your CS Summary data was saved. Please refresh and re-open the application if completion status does not update.',
              });
            }
          }
        }

        if (isEditingExistingApplication) {
          if (isAdminView) {
            navigateWithHardFallback(`/admin/applications/${finalAppId}${appUserId ? `?userId=${appUserId}` : ''}`);
          } else {
            router.push(`/pathway?applicationId=${finalAppId}`);
          }
        } else {
          const reviewUrl = appUserId || finalAppId.startsWith('admin_app_')
            ? `/admin/forms/review?applicationId=${finalAppId}${appUserId ? `&userId=${appUserId}` : ''}`
            : `/forms/cs-summary-form/review?applicationId=${finalAppId}`;
          router.push(reviewUrl);
        }
        
    } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Save failed',
          description: String(error?.message || 'Unable to save and continue. Please try again.'),
        });
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
      const loggedInIdentity = await resolveLoggedInUserIdentity(firestore, user);
      const freshValues: Partial<FormValues> = {};
      applyLoggedInSubmitterIdentityToRecord(freshValues as Record<string, unknown>, loggedInIdentity);

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
      <div className="flex-grow">
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

            {isAdminView && docRef ? <AdminCaspioIntakeFieldsPanel docRef={docRef} /> : null}

      <form
        onSubmit={
          isStaffDraftFlow
            ? (event) => {
                event.preventDefault();
                void onSubmit(getValues());
              }
            : handleSubmit(onSubmit, onInvalid)
        }
        className="flex-grow"
      >
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
                          <h1 className="text-2xl font-bold">
                            {isStaffDraftFlow ? 'Skeleton Application - CS Member Summary' : 'CS Member Summary'}
                          </h1>
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
                      <div className="self-start sm:self-auto rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                        <div className="flex items-center gap-1.5 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Progress autosaves
                        </div>
                        <p className="mt-0.5 text-blue-800">
                          You can safely leave and return later without losing your CS Summary progress.
                        </p>
                        {isStaffDraftFlow ? (
                          <p className="mt-1 text-blue-800">
                            Skeleton application mode: not all required fields are filled out yet. You can save partial information now and complete required fields before final submission/Caspio push.
                          </p>
                        ) : null}
                      </div>
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
              {currentStep === 1 && (
                <Step1
                  isAdminView={isAdminView}
                  onCheckMrnUnique={checkMrnUniqueness}
                  forceSeparatePrimaryContactFromSubmitter={isKaiserSkeletonDraftFlow}
                  applicationIdForDraftUploads={internalApplicationId || ''}
                  appUserIdForDraftUploads={appUserId || ''}
                />
              )}
              {currentStep === 2 && <Step2 />}
              {currentStep === 3 && <Step3 />}
              {currentStep === 4 && <Step4 />}
              {currentStep === 5 && <Step5 relaxIspRequiredForDraft={isStaffDraftFlow} />}
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
                          (internalApplicationId
                            ? (isAdminView ? 'Save & Continue to Application' : 'Save & Continue to Pathway')
                            : 'Review & Complete')
                      )}
                    </Button>
                  )}
              </div>
            </div>

            {/* Help footer */}
            <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
              Need help filling out this form?{' '}
              <Link href="/contact" className="text-blue-600 hover:underline font-medium">
                Contact us
              </Link>
              {' '}and we&apos;ll guide you through it.
            </div>
            
      </form>
          </div>
        </div>
      </div>
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
