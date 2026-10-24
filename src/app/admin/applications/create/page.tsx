'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, FileText, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { addDoc, collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';
import { findCountyByCity } from '@/lib/california-cities';
import { LIC_602A_FORM_URL } from '@/lib/form-links';
import { withNormalizedBestContactEmail } from '@/lib/application-contact-email';
import { extractIdentitySignals, identityTokenLookupKeys } from '@/lib/member-identity';
import { sanitizeRelationshipLabel } from '@/lib/sanitize-relationship-label';
import {
  annotateIdentityRowsAgainstMasterMembers,
  buildIlsMifDedupeKey,
  findIlsMifMasterMemberMatch,
  ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
  ILS_MIF_DECLINED_COLLECTION,
  ILS_MIF_MASTER_COLLECTION,
  ILS_MIF_REMOVED_COLLECTION,
  ILS_MIF_RUN_MEMBERS_SUBCOLLECTION,
  ILS_MIF_UPLOADED_FILES_COLLECTION,
  isIlsMifCaspioPendingStatus,
  isIlsMifCreateAppCandidate,
  isIlsServedCounty,
  normalizeIlsMifCalAimStatus,
  pickIlsMifCaspioAuthorizationDates,
  readAndClearIlsMifConsolidatorHandoff,
  resolveIlsMifAuthorizationFields,
  resolveIlsMifNeedsAuthorizedUpdate,
  type IlsMifConsolidationRunRecord,
  type IlsMifMasterRow,
  type IlsMifUploadedFileRecord,
  buildIlsMifAddressNotesLines,
} from '@/lib/ils-mif-parse';
import {
  buildSingleAuthPdfDetailsNotes,
  stripSingleAuthPdfDetailsHeading,
} from '@/lib/ils-admin-notes';
import {
  excludeIlsMifMemberFromCreateApp,
  findExistingApplicationsForMember,
  formatExistingApplicationMatchLabel,
  loadCreateAppExcludedDedupeKeys,
  loadExistingApplicationIdentityIndex,
  markIlsMifMemberPushedToCaspio,
  markIlsMifMemberServiceDeclined,
  markIlsMifMemberSkeletonCreated,
  matchIdentityToExistingApplications,
  partitionExistingApplicationMatches,
  resolveIlsMifDedupeKey,
} from '@/lib/ils-mif-consolidator-sync';
import { MIF_SERVICE_DELIVERY_FORM_NAME, MIF_SERVICE_DELIVERY_LAYOUT_VERSION, uploadMifServiceDeliveryForm } from '@/lib/mif-service-delivery-form';
import {
  ILS_DECISION_CC,
  ILS_DECISION_RECIPIENTS,
  ILS_DECISION_TO,
  buildIlsDecisionSubject,
  buildIlsDecisionTextBody,
  type IlsDecisionChoice,
} from '@/lib/ils-decision-email';
import { appConfirm } from '@/components/AppDialogHost';
import { addIlsMifAuditDoc } from '@/lib/log-change-event';
import { firebaseAuthHeaders } from '@/lib/admin-fetch';
import { loadPdfJs } from './components/pdf-loader';
import { IlsDecisionLogState, IlsDecisionPreviewDraft } from './components/create-application-types';
import {
  toMmDdYyyy,
  toDateInputValue,
  parseMemberName,
  stripTrailingNonNameTokens,
  toNameCase,
  normalizePhoneDigits,
  formatPhoneDashed,
  normalizeMediCalNumber,
  normalizeMemberSex,
  mergeAdminNotes,
  inferCountyFromCityZip,
  COUNTY_UNDETERMINED_MESSAGE,
  isCountyUndetermined,
  inferStateFromCityZip,
  parseAddressParts,
  extractServiceRequestFields,
} from './components/service-request-parsing';
import {
  getEmptyMemberData,
  getSubmittingStaffIdentity,
  normalizeMemberPatch,
  withInferredCountyFromAddress,
  withoutCurrentAddressPrefill,
  EMPTY_SINGLE_AUTH_CONTACT_PREVIEW,
  extractSingleAuthContactPreview,
} from './components/member-data-helpers';
import {
  KaiserIlsImportRow,
  normalizeEligibilityStatus,
  isIlsRowCreated,
  isIlsRowLockedForSkeletonCreate,
  getIlsRowCreateAppDedupeKey,
  toSpreadsheetTrackingMembers,
  IlsDuplicateMatch,
  normalizeSheetHeader,
  normalizeLookupToken,
  buildMemberLookupNameKey,
  pickIlsSheetName,
  toSpreadsheetDate,
  normalizeUsZip,
  getSpreadsheetValue,
  getSpreadsheetRawValue,
  collectUnusedSpreadsheetNotes,
  extractSpreadsheetMediCalNumber,
} from './components/kaiser-ils-import-helpers';
import { IntakeTypeSelector } from './components/IntakeTypeSelector';
import { SingleAuthPdfPanel } from './components/SingleAuthPdfPanel';
import { PrimaryContactSection } from './components/PrimaryContactSection';
import { CreateApplicationSubmitBar } from './components/CreateApplicationSubmitBar';
import { MifPullPanel } from './components/MifPullPanel';

export default function CreateApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();
  const { user } = useUser();
  
  const [isCreating, setIsCreating] = useState(false);
  const [intakeType, setIntakeType] = useState<'standard' | 'kaiser_auth_received_via_ils'>('standard');
  /** After Option 2: choose Single Auth PDF vs Pull from MIF consolidator. */
  const [kaiserIlsPath, setKaiserIlsPath] = useState<'single_auth' | 'pull_from_mif' | ''>('');
  const [kaiserStaffList, setKaiserStaffList] = useState<Array<{ uid: string; displayName: string; email: string }>>([]);
  const [, setIsLoadingKaiserStaff] = useState(false);
  const [selectedAssignedStaffId, setSelectedAssignedStaffId] = useState('');
  const [selectedAssignedStaffName, setSelectedAssignedStaffName] = useState('');
  const [, setSelectedStaffActionItemCount] = useState(0);
  const [eligibilityScreenshotFiles, setEligibilityScreenshotFiles] = useState<File[]>([]);
  const [serviceRequestFile, setServiceRequestFile] = useState<File | null>(null);
  const [serviceRequestFiles, setServiceRequestFiles] = useState<File[]>([]);
  const [isParsingServiceRequest, setIsParsingServiceRequest] = useState(false);
  const [serviceRequestParsedFields, setServiceRequestParsedFields] = useState<string[]>([]);
  const [serviceRequestWarnings, setServiceRequestWarnings] = useState<string[]>([]);
  const [, setServiceRequestParseMode] = useState<'none' | 'text' | 'vision'>('none');
  const [, setServiceRequestTextPreview] = useState('');
  const [, setIlsRowEligibilityFiles] = useState<Record<string, File[]>>({});
  const [singleAuthContactPreview, setSingleAuthContactPreview] = useState<{
    memberPhone: string;
    cellPhone: string;
    memberEmail: string;
  }>(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
  const [ilsSpreadsheetFileName, setIlsSpreadsheetFileName] = useState('');
  const [ilsImportRows, setIlsImportRows] = useState<KaiserIlsImportRow[]>([]);
  const [ilsImportSelected, setIlsImportSelected] = useState<Record<string, boolean>>({});
  const [pickedIlsRowId, setPickedIlsRowId] = useState('');
  const [activeSpreadsheetUploadLogId, setActiveSpreadsheetUploadLogId] = useState('');
  const [showOnlyNotInCaspio, setShowOnlyNotInCaspio] = useState(false);
  const [ilsPickerSearch, setIlsPickerSearch] = useState('');
  const [ilsPickerSearchMode, setIlsPickerSearchMode] = useState<'all' | 'lastName' | 'mrn'>('all');
  const [isExcludingFromCreateApp, setIsExcludingFromCreateApp] = useState(false);
  const [isParsingIlsSpreadsheet, setIsParsingIlsSpreadsheet] = useState(false);
  const [isCheckingCaspioExisting, setIsCheckingCaspioExisting] = useState(false);
  const [hasMifCaspioRefresh, setHasMifCaspioRefresh] = useState(false);
  const [mifLastCaspioRefreshAtIso, setMifLastCaspioRefreshAtIso] = useState('');
  const [consolidatorRuns, setConsolidatorRuns] = useState<IlsMifConsolidationRunRecord[]>([]);
  const [consolidatorUploadedFiles, setConsolidatorUploadedFiles] = useState<IlsMifUploadedFileRecord[]>([]);
  const [selectedConsolidatorRunId, setSelectedConsolidatorRunId] = useState('');
  const [createAppLoadedRunId, setCreateAppLoadedRunId] = useState('');
  const [createAppLoadedAtIso, setCreateAppLoadedAtIso] = useState('');
  const [createAppLoadSkipStats, setCreateAppLoadSkipStats] = useState({
    skippedSkeleton: 0,
    skippedInCaspio: 0,
  });
  const [notInCaspioCardActive, setNotInCaspioCardActive] = useState(false);
  const [isLoadingConsolidatorRuns, setIsLoadingConsolidatorRuns] = useState(false);
  const [mifMasterSearchMrn, setMifMasterSearchMrn] = useState('');
  const [mifMasterSearchLastName, setMifMasterSearchLastName] = useState('');
  const [mifMasterSearchFirstName, setMifMasterSearchFirstName] = useState('');
  const [mifMasterSearchMediCal, setMifMasterSearchMediCal] = useState('');
  const [isSearchingMifMaster, setIsSearchingMifMaster] = useState(false);
  const [mifMasterSearchResult, setMifMasterSearchResult] = useState<{
    exists: boolean;
    matchLabel: string;
    matchedBy: string;
    queriedAs: string;
    runLabel?: string;
    createAppEligible?: boolean;
    createAppExcludeReason?: string;
  } | null>(null);
  const [singleAuthMifMasterHit, setSingleAuthMifMasterHit] = useState<{
    exists: boolean;
    matchLabel: string;
    matchedBy: string;
    runLabel?: string;
    caspioExists?: boolean;
    caspioMatchLabel?: string;
    alreadyInApp?: boolean;
    existingApplicationIds?: string[];
    existingApplicationLabels?: string[];
    /** MRN/CIN hit a differently named person — warn only, do not hard-block. */
    mrnNameConflict?: boolean;
    mrnNameConflictLabels?: string[];
    mrnNameConflictIds?: string[];
  } | null>(null);
  const [singleAuthIlsDecisionLog, setSingleAuthIlsDecisionLog] = useState<IlsDecisionLogState | null>(null);
  const [, setCheckingRowDuplicates] = useState<Record<string, boolean>>({});
  const [, setIlsRowDuplicateMatches] = useState<Record<string, IlsDuplicateMatch[]>>({});
  const [sendingIlsDecisionRowId, setSendingIlsDecisionRowId] = useState('');
  const [ilsDecisionLogByRowId, setIlsDecisionLogByRowId] = useState<Record<string, IlsDecisionLogState>>({});
  const [pendingIlsDecisionDraft, setPendingIlsDecisionDraft] = useState<IlsDecisionPreviewDraft | null>(null);
  const [isLoadingIntroEmailPreview, setIsLoadingIntroEmailPreview] = useState(false);
  const [isSendingIntroEmail, setIsSendingIntroEmail] = useState(false);
  const navigationFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | number | null>(null);

  const navigateWithHardFallback = useCallback((target: string) => {
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
          // Only force hard navigation if we are still on the same page where
          // navigation started (prevents stale fallback from hijacking later clicks).
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
  }, [router]);

  useEffect(() => {
    return () => {
      if (navigationFallbackTimerRef.current) {
        clearTimeout(navigationFallbackTimerRef.current);
        navigationFallbackTimerRef.current = null;
      }
    };
  }, []);
  const [introEmailDraft, setIntroEmailDraft] = useState<{
    to: string;
    subject: string;
    message: string;
    senderFrom?: string;
    senderWarning?: string;
    senderUsesFallbackFrom?: boolean;
  } | null>(null);
  const [lastCreatedSkeleton, setLastCreatedSkeleton] = useState<{ applicationId: string; memberName: string; clientId2: string } | null>(null);
  const ilsSpreadsheetInputRef = useRef<HTMLInputElement | null>(null);
  const serviceRequestFileInputRef = useRef<HTMLInputElement | null>(null);
  const parseAbortControllerRef = useRef<AbortController | null>(null);
  const parsedSingleAuthFilesRef = useRef<Record<string, File>>({});
  const ilsSpreadsheetSourceFileRef = useRef<File | null>(null);
  const ilsDuplicateIndexWarningShownRef = useRef(false);
  const spreadsheetLogPermissionWarnedRef = useRef(false);
  const createApplicationRef = useRef<() => Promise<string | null> | string | null>(() => null);
  const [memberData, setMemberData] = useState(getEmptyMemberData);

  useEffect(() => {
    const intakeSource = String(searchParams.get('intakeSource') || '').trim().toLowerCase();
    const intakeAlias = String(searchParams.get('intake') || '').trim().toLowerCase();
    const fromConsolidator = searchParams.get('fromConsolidator') === '1';
    if (
      fromConsolidator ||
      intakeSource === 'ils_single_authorization_sheet' ||
      intakeSource === 'ils_spreadsheet_batch' ||
      intakeAlias === 'ils_mif' ||
      intakeAlias === 'kaiser_auth_received_via_ils'
    ) {
      setIntakeType('kaiser_auth_received_via_ils');
      if (typeof window !== 'undefined' && (window.location.hash.includes('kaiser-auth-received-via-ils') || window.location.hash.includes('kaiser-ils-datapage'))) {
        window.setTimeout(() => {
          document
            .getElementById('kaiser-ils-datapage')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
      return;
    }
    if (!intakeSource) return;
    if (intakeSource === 'family_call') {
      setIntakeType('standard');
    }
  }, [searchParams]);

  useEffect(() => {
    const loadKaiserStaff = async () => {
      if (!firestore || intakeType !== 'kaiser_auth_received_via_ils') return;
      setIsLoadingKaiserStaff(true);
      try {
        const snap = await getDocs(query(collection(firestore, 'users'), where('isKaiserStaff', '==', true)));
        const staff = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const firstName = String(data?.firstName || '').trim();
            const lastName = String(data?.lastName || '').trim();
            const email = String(data?.email || '').trim();
            const displayName = `${firstName} ${lastName}`.trim() || email || d.id;
            return { uid: d.id, displayName, email };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setKaiserStaffList(staff);
      } catch (error) {
        console.error('Failed to load Kaiser staff list:', error);
      } finally {
        setIsLoadingKaiserStaff(false);
      }
    };
    void loadKaiserStaff();
  }, [firestore, intakeType]);

  useEffect(() => {
    const city = String(memberData.memberCustomaryCity || '').trim();
    const zip = String(memberData.memberCustomaryZip || '').trim();
    if (String(memberData.memberCustomaryCounty || '').trim()) return;
    if (!city && !zip) return;
    const inferredCounty = inferCountyFromCityZip({ city, zip });
    if (!inferredCounty) return;
    setMemberData((prev) => {
      if (String(prev.memberCustomaryCounty || '').trim()) return prev;
      return {
        ...prev,
        memberCustomaryCounty: toNameCase(inferredCounty),
      };
    });
  }, [memberData.memberCustomaryCity, memberData.memberCustomaryZip, memberData.memberCustomaryCounty]);

  useEffect(() => {
    const loadActionItemCount = async () => {
      if (!firestore || !selectedAssignedStaffId) {
        setSelectedStaffActionItemCount(0);
        return;
      }
      try {
        const snap = await getDocs(query(collection(firestore, 'staff_notifications'), where('userId', '==', selectedAssignedStaffId)));
        const count = snap.docs.filter((d) => {
          const n = d.data() as any;
          const status = String(n?.status || '').trim().toLowerCase();
          const requiresAction = Boolean(n?.requiresStaffAction);
          return requiresAction && (status === 'open' || status === '');
        }).length;
        setSelectedStaffActionItemCount(count);
      } catch (error) {
        console.warn('Could not load staff action item count:', error);
        setSelectedStaffActionItemCount(0);
      }
    };
    void loadActionItemCount();
  }, [firestore, selectedAssignedStaffId]);

  const sendStaffAssignmentWorkflowEmail = async (params: {
    applicationId: string;
    appUserId: string;
    staffId: string;
    staffName: string;
    memberName: string;
    memberMrn?: string;
    memberCounty?: string;
    serviceDeliveryFormUrl?: string;
    serviceDeliveryFormFileName?: string;
    serviceDeliveryFormFilePath?: string;
    kaiserStatus?: string;
    assignedBy: string;
    alreadyPushedToCaspio?: boolean;
  }) => {
    const staffEmail = String(
      kaiserStaffList.find((staff) => staff.uid === params.staffId)?.email || ''
    ).trim();
    const res = await fetch('/api/admin/send-staff-assignment-email', {
      method: 'POST',
      headers: { ...(await firebaseAuthHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: params.applicationId,
        appUserId: params.appUserId,
        staffId: params.staffId,
        staffName: params.staffName,
        to: staffEmail || undefined,
        memberName: params.memberName,
        memberMrn: params.memberMrn || '',
        memberCounty: params.memberCounty || '',
        serviceDeliveryFormUrl: String(params.serviceDeliveryFormUrl || '').trim(),
        serviceDeliveryFormFileName: String(params.serviceDeliveryFormFileName || '').trim(),
        serviceDeliveryFormFilePath: String(params.serviceDeliveryFormFilePath || '').trim(),
        kaiserStatus: String(params.kaiserStatus || '').trim(),
        calaimStatus: 'Authorized',
        assignedBy: params.assignedBy,
        alreadyPushedToCaspio: Boolean(params.alreadyPushedToCaspio),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(String(data?.error || 'Failed to send staff assignment email.'));
    }
  };

  const uploadEligibilityFiles = async (applicationId: string) => {
    if (!storage || eligibilityScreenshotFiles.length === 0) return [];
    const uploads = eligibilityScreenshotFiles.map((file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `applications/${applicationId}/eligibility-screenshots/${Date.now()}-${safeName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      return new Promise<{ fileName: string; filePath: string; downloadURL: string }>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          undefined,
          reject,
          async () => {
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({ fileName: file.name, filePath: storagePath, downloadURL });
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    });
    return Promise.all(uploads);
  };

  const uploadIntakeSourceFile = async (params: {
    applicationId: string;
    file: File;
    sourceLabel: string;
    sourceTag: string;
  }) => {
    if (!storage) return null;
    const safeFileName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `applications/${params.applicationId}/original-intake/${Date.now()}-${safeFileName}`;
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, params.file);
    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', undefined, reject, () => resolve());
    });
    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
    return {
      name: params.sourceLabel,
      status: 'Completed',
      type: 'Upload',
      href: '#',
      fileName: params.file.name,
      filePath: storagePath,
      downloadURL,
      dateCompleted: new Date().toISOString(),
      source: params.sourceTag,
      uploadedFiles: [{ fileName: params.file.name, filePath: storagePath, downloadURL }],
    } as any;
  };

  const createSpreadsheetServiceDeliveryPlaceholder = async (params: {
    applicationId: string;
    row: KaiserIlsImportRow;
  }) => {
    const storageClient = storage || getStorage();
    if (!storageClient) return null;
    const selectedRun = consolidatorRuns.find(
      (run) =>
        run.id ===
        String(selectedConsolidatorRunId || createAppLoadedRunId || '').trim()
    );
    const uploaded = await uploadMifServiceDeliveryForm({
      storage: storageClient,
      applicationId: params.applicationId,
      identity: {
        memberFirstName: params.row.memberFirstName,
        memberLastName: params.row.memberLastName,
        memberMrn: params.row.memberMrn,
        memberMediCalNum: params.row.memberMediCalNum,
        memberSex: params.row.memberSex,
        memberDob: params.row.memberDob,
        memberPhone: params.row.memberPhone,
        memberEmail: params.row.memberEmail,
        memberAddress: params.row.memberAddress,
        memberCity: params.row.memberCity,
        memberState: params.row.memberState,
        memberZip: params.row.memberZip,
        memberCounty: params.row.memberCounty,
        contactPhone: params.row.contactPhone,
        contactEmail: params.row.contactEmail,
        referringOrganization: params.row.referringOrganization,
        emergencyContactName: params.row.emergencyContactName,
        emergencyContactRelationship: params.row.emergencyContactRelationship,
        emergencyContactPhone: params.row.emergencyContactPhone,
        emergencyContactEmail: params.row.emergencyContactEmail,
        careManagerName: params.row.careManagerName,
        careManagerPhone: params.row.careManagerPhone,
        careManagerEmail: params.row.careManagerEmail,
        authorizationNumberT2038: params.row.authorizationNumberT2038,
        authorizationStartT2038: params.row.authorizationStartT2038,
        authorizationEndT2038: params.row.authorizationEndT2038,
        dateReceivedRequestForAuthorization: params.row.dateReceivedRequestForAuthorization,
        dateOfReferralAuthorizationDecision: params.row.dateOfReferralAuthorizationDecision,
        diagnosticCode: params.row.diagnosticCode,
        cptCode: params.row.cptCode,
        kaiserStatus: params.row.kaiserStatus,
        sourceFileName: params.row.sourceFileName,
        sourceType: params.row.sourceType,
        eligibilityCheckStatus: params.row.eligibilityCheckStatus,
        caspioExists: params.row.caspioExists,
        mifMasterExists: params.row.mifMasterExists,
      },
      extraFileNames:
        params.row.sourceType === 'single_auth_pdf'
          ? []
          : [
              ilsSpreadsheetFileName,
              ...(Array.isArray(selectedRun?.sourceFiles) ? selectedRun.sourceFiles : []),
            ],
    });
    return uploaded.formRecord as any;
  };

  const normalizeAuthorizationValue = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const checkRowDuplicateAuthorizationByMrn = async (row: KaiserIlsImportRow) => {
    const rowId = String(row?.rowId || '').trim();
    const mrn = String(row?.memberMrn || '').trim();
    const authNumber = String(row?.authorizationNumberT2038 || '').trim();
    const authStart = String(row?.authorizationStartT2038 || '').trim();
    const authEnd = String(row?.authorizationEndT2038 || '').trim();
    const normalizedAuth = normalizeAuthorizationValue(authNumber);
    const fallbackAuthKey =
      authStart && authEnd ? `${normalizeAuthorizationValue(authStart)}|${normalizeAuthorizationValue(authEnd)}` : '';
    if (!rowId) return;
    if (!firestore || !mrn || (!normalizedAuth && !fallbackAuthKey)) {
      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: [] }));
      return;
    }

    setCheckingRowDuplicates((prev) => ({ ...prev, [rowId]: true }));
    try {
      const adminAppsSnap = await getDocs(query(collection(firestore, 'applications'), where('memberMrn', '==', mrn)));
      let userAppsDocs: Array<any> = [];
      try {
        const userAppsSnap = await getDocs(query(collectionGroup(firestore, 'applications'), where('memberMrn', '==', mrn)));
        userAppsDocs = userAppsSnap.docs;
      } catch (groupError: any) {
        const code = String(groupError?.code || '').trim().toLowerCase();
        const msg = String(groupError?.message || '').toLowerCase();
        const missingIndex = code === 'failed-precondition' || msg.includes('requires a collection_group') || msg.includes('index');
        if (!missingIndex) throw groupError;
        if (!ilsDuplicateIndexWarningShownRef.current) {
          ilsDuplicateIndexWarningShownRef.current = true;
          toast({
            title: 'Duplicate check limited',
            description: 'Cross-user duplicate checks are temporarily limited until the Firestore index is available.',
          });
        }
      }

      const matches: IlsDuplicateMatch[] = [];

      adminAppsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const existingAuth = String(data?.Authorization_Number_T038 || '').trim();
        const existingStart = String(data?.Authorization_Start_T2038 || '').trim();
        const existingEnd = String(data?.Authorization_End_T2038 || '').trim();
        const normalizedExistingAuth = normalizeAuthorizationValue(existingAuth);
        const existingFallbackAuthKey =
          existingStart && existingEnd
            ? `${normalizeAuthorizationValue(existingStart)}|${normalizeAuthorizationValue(existingEnd)}`
            : '';

        const authMatches =
          (normalizedAuth && normalizedExistingAuth && normalizedAuth === normalizedExistingAuth) ||
          (!normalizedAuth && fallbackAuthKey && existingFallbackAuthKey && fallbackAuthKey === existingFallbackAuthKey);
        if (!authMatches) return;
        matches.push({
          source: 'application',
          sourceId: docSnap.id,
          sourceLabel: `Application ${docSnap.id}`,
          matchedAuthorization: existingAuth || `${existingStart} - ${existingEnd}` || 'Authorization match',
        });
      });

      userAppsDocs.forEach((docSnap: any) => {
        const data = docSnap.data() as any;
        const existingAuth = String(data?.Authorization_Number_T038 || '').trim();
        const existingStart = String(data?.Authorization_Start_T2038 || '').trim();
        const existingEnd = String(data?.Authorization_End_T2038 || '').trim();
        const normalizedExistingAuth = normalizeAuthorizationValue(existingAuth);
        const existingFallbackAuthKey =
          existingStart && existingEnd
            ? `${normalizeAuthorizationValue(existingStart)}|${normalizeAuthorizationValue(existingEnd)}`
            : '';

        const authMatches =
          (normalizedAuth && normalizedExistingAuth && normalizedAuth === normalizedExistingAuth) ||
          (!normalizedAuth && fallbackAuthKey && existingFallbackAuthKey && fallbackAuthKey === existingFallbackAuthKey);
        if (!authMatches) return;
        matches.push({
          source: 'application',
          sourceId: docSnap.id,
          sourceLabel: `Application ${docSnap.id}`,
          matchedAuthorization: existingAuth || `${existingStart} - ${existingEnd}` || 'Authorization match',
        });
      });

      const dedup = new Map<string, IlsDuplicateMatch>();
      matches.forEach((match) => {
        dedup.set(`${match.source}:${match.sourceId}:${normalizeAuthorizationValue(match.matchedAuthorization)}`, match);
      });

      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: Array.from(dedup.values()) }));
    } catch (error) {
      console.warn('Duplicate check failed:', error);
      setIlsRowDuplicateMatches((prev) => ({ ...prev, [rowId]: [] }));
    } finally {
      setCheckingRowDuplicates((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const selectedIlsRows = useMemo(
    () =>
      ilsImportRows.filter(
        (row) => Boolean(ilsImportSelected[row.rowId]) && !isIlsRowLockedForSkeletonCreate(row)
      ),
    [ilsImportRows, ilsImportSelected]
  );
  const selectedCreatedIlsRows = useMemo(
    () => selectedIlsRows.filter((row) => Boolean(String(row.applicationId || '').trim())),
    [selectedIlsRows]
  );
  const caspioExistingRowCount = useMemo(
    () => ilsImportRows.filter((row) => row.caspioExists).length,
    [ilsImportRows]
  );
  const pendingAuthUpdateRowCount = useMemo(
    () => ilsImportRows.filter((row) => row.needsAuthorizedUpdate).length,
    [ilsImportRows]
  );
  const nonCaspioRowCount = useMemo(
    () => ilsImportRows.filter((row) => !row.caspioExists).length,
    [ilsImportRows]
  );
  const selectedOrLatestConsolidatorRun = useMemo(() => {
    const preferredId = String(
      selectedConsolidatorRunId || createAppLoadedRunId || consolidatorRuns[0]?.id || ''
    ).trim();
    if (!preferredId) return null;
    return consolidatorRuns.find((run) => run.id === preferredId) || consolidatorRuns[0] || null;
  }, [consolidatorRuns, selectedConsolidatorRunId, createAppLoadedRunId]);
  const notInCaspioCardCount = useMemo(() => {
    if (ilsImportRows.length > 0 || createAppLoadedRunId) {
      return nonCaspioRowCount;
    }
    const fromRun = Number(selectedOrLatestConsolidatorRun?.totals?.createApp);
    return Number.isFinite(fromRun) && fromRun > 0 ? fromRun : null;
  }, [
    ilsImportRows.length,
    createAppLoadedRunId,
    nonCaspioRowCount,
    selectedOrLatestConsolidatorRun,
  ]);
  const notInCaspioCardHint = useMemo(() => {
    if (ilsImportRows.length > 0 || createAppLoadedRunId) {
      return createAppLoadSkipStats.skippedSkeleton > 0
        ? `Same count Create Application loads · ${createAppLoadSkipStats.skippedSkeleton} already have skeleton (excluded)`
        : 'Same members Create Application loads from this run';
    }
    if (notInCaspioCardCount != null) {
      return 'Click to load this run into the picker · Jump to member list';
    }
    return 'Refresh Consolidated Run first (or open consolidator and re-check Caspio)';
  }, [
    ilsImportRows.length,
    createAppLoadedRunId,
    createAppLoadSkipStats.skippedSkeleton,
    notInCaspioCardCount,
  ]);
  const ilsPickerRows = useMemo(
    () => {
      const baseRows = showOnlyNotInCaspio ? ilsImportRows.filter((row) => !row.caspioExists) : ilsImportRows;
      const needle = normalizeLookupToken(ilsPickerSearch);
      if (!needle) return baseRows;
      return baseRows.filter((row) => {
        const first = String(row.memberFirstName || '').trim();
        const last = String(row.memberLastName || '').trim();
        const mrn = String(row.memberMrn || '').trim();
        const cin = String(row.memberMediCalNum || '').trim();
        if (ilsPickerSearchMode === 'lastName') {
          return normalizeLookupToken(last).includes(needle);
        }
        if (ilsPickerSearchMode === 'mrn') {
          return normalizeLookupToken(mrn).includes(needle);
        }
        const fullName = `${first} ${last}`.trim();
        const reverseName = `${last}, ${first}`.trim().replace(/^,\s*/, '');
        return [
          normalizeLookupToken(first),
          normalizeLookupToken(last),
          normalizeLookupToken(fullName),
          normalizeLookupToken(reverseName),
          normalizeLookupToken(mrn),
          normalizeLookupToken(cin),
        ].some((token) => token.includes(needle));
      });
    },
    [ilsImportRows, showOnlyNotInCaspio, ilsPickerSearch, ilsPickerSearchMode]
  );

  const syncSpreadsheetUploadLog = async (params: {
    uploadLogId: string;
    fileName: string;
    rows: KaiserIlsImportRow[];
    isNewUpload?: boolean;
  }) => {
    if (!firestore || !params.uploadLogId) return;
    const logRef = doc(firestore, 'ils_spreadsheet_upload_logs', params.uploadLogId);
    const uploadedBy = String(user?.displayName || user?.email || 'Unknown').trim();
    const trackedMembers = toSpreadsheetTrackingMembers(params.rows);
    const payload: Record<string, unknown> = {
      uploadLogId: params.uploadLogId,
      fileName: params.fileName || 'Unknown Spreadsheet',
      uploadedBy,
      uploadedByUid: String(user?.uid || '').trim() || '',
      members: trackedMembers,
      totalMembers: trackedMembers.length,
      caspioMatchedMembers: trackedMembers.filter((row) => Boolean(row.caspioExists)).length,
      skeletonCreatedMembers: trackedMembers.filter((row) => Boolean(row.skeletonCreated)).length,
      lastSyncedAt: serverTimestamp(),
    };
    if (params.isNewUpload) {
      payload.createdAt = serverTimestamp();
    }
    try {
      await setDoc(logRef, payload, { merge: true });
    } catch (error: any) {
      const code = String(error?.code || '').trim().toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      const isPermissionError =
        code.includes('permission-denied') ||
        message.includes('permission-denied') ||
        message.includes('missing or insufficient permissions');
      if (isPermissionError && !spreadsheetLogPermissionWarnedRef.current) {
        spreadsheetLogPermissionWarnedRef.current = true;
        toast({
          title: 'Spreadsheet status tracking is blocked',
          description:
            'Your upload and skeleton workflow still works. Spreadsheet history logging is disabled until Firestore permissions are updated.',
          variant: 'default',
        });
      } else if (!isPermissionError) {
        console.warn('Spreadsheet upload log sync failed:', error);
      }
    }
  };

  useEffect(() => {
    if (!activeSpreadsheetUploadLogId || !ilsSpreadsheetFileName) return;
    const timeout = setTimeout(() => {
      void syncSpreadsheetUploadLog({
        uploadLogId: activeSpreadsheetUploadLogId,
        fileName: ilsSpreadsheetFileName,
        rows: ilsImportRows,
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [activeSpreadsheetUploadLogId, ilsSpreadsheetFileName, ilsImportRows]);

  const loadLatestIlsMifMasterMembers = async () => {
    if (!firestore) {
      return { members: [] as Array<Partial<IlsMifMasterRow>>, runId: '', runLabel: '' };
    }
    let runId = String(selectedConsolidatorRunId || '').trim();
    if (!runId) {
      const metaSnap = await getDoc(doc(firestore, ILS_MIF_MASTER_COLLECTION, '_meta'));
      runId = String(metaSnap.exists() ? metaSnap.data()?.latestRunId || '' : '').trim();
    }
    if (!runId && consolidatorRuns[0]?.id) runId = consolidatorRuns[0].id;

    const members: Array<Partial<IlsMifMasterRow>> = [];
    let runLabel = runId;
    if (runId) {
      const [runSnap, memberSnap] = await Promise.all([
        getDoc(doc(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION, runId)),
        getDocs(
          collection(
            firestore,
            ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
            runId,
            ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
          )
        ),
      ]);
      if (runSnap.exists()) {
        const data = runSnap.data() || {};
        const createdAtIso = String(data.createdAtIso || '').trim();
        runLabel =
          String(data.label || '').trim() ||
          (createdAtIso ? new Date(createdAtIso).toLocaleString() : runId);
      }
      memberSnap.forEach((docSnap) => {
        const data = docSnap.data() as Partial<IlsMifMasterRow>;
        if (!data?.memberFirstName && !data?.memberLastName && !data?.memberMrn && !data?.memberMediCalNum) return;
        members.push({ ...data, rowId: String(data.rowId || docSnap.id) });
      });
    }

    if (!members.length) {
      const snap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      snap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        members.push(docSnap.data() as Partial<IlsMifMasterRow>);
      });
      if (!runLabel) runLabel = 'shared master list';
    }
    return { members, runId, runLabel };
  };

  const annotateRowsWithMifMasterList = async (rows: KaiserIlsImportRow[]): Promise<KaiserIlsImportRow[]> => {
    if (!rows.length) return rows;
    if (!firestore) {
      return rows.map((row) => ({
        ...row,
        mifMasterExists: false,
        mifMasterMatchLabel: '',
        mifMasterMatchedBy: '' as const,
      }));
    }
    try {
      const { members } = await loadLatestIlsMifMasterMembers();
      return annotateIdentityRowsAgainstMasterMembers(rows, members);
    } catch (error) {
      console.warn('Failed to annotate rows against consolidated MIF master list:', error);
      toast({
        title: 'MIF master check unavailable',
        description: 'Could not check the latest consolidated MIF master list. Caspio matching still applies.',
      });
      return rows.map((row) => ({
        ...row,
        mifMasterExists: Boolean(row.mifMasterExists),
        mifMasterMatchLabel: String(row.mifMasterMatchLabel || ''),
        mifMasterMatchedBy: row.mifMasterMatchedBy || '',
      }));
    }
  };

  const lookupIdentityOnMifMaster = async (identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
    clientId2?: string;
    memberDob?: string;
  }) => {
    if (!firestore) {
      throw new Error('Firestore unavailable');
    }
    const { members, runLabel } = await loadLatestIlsMifMasterMembers();
    const probe = {
      memberFirstName: String(identity.memberFirstName || '').trim(),
      memberLastName: String(identity.memberLastName || '').trim(),
      memberMrn: String(identity.memberMrn || '').trim(),
      memberMediCalNum: String(identity.memberMediCalNum || '').trim(),
      clientId2: String(identity.clientId2 || '').trim(),
    };
    if (!probe.memberFirstName && !probe.memberLastName && !probe.memberMrn && !probe.memberMediCalNum && !probe.clientId2) {
      return {
        exists: false,
        matchLabel: '',
        matchedBy: '' as const,
        queriedAs: '',
        runLabel,
        member: null as Partial<IlsMifMasterRow> | null,
      };
    }
    const hit = findIlsMifMasterMemberMatch(probe, members);
    const queriedAs = [
      probe.memberLastName || probe.memberFirstName
        ? `${probe.memberLastName || ''}, ${probe.memberFirstName || ''}`.replace(/^,\s*|,\s*$/g, '').trim()
        : '',
      probe.memberMrn ? `MRN ${probe.memberMrn}` : '',
      probe.memberMediCalNum ? `CIN ${probe.memberMediCalNum}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      exists: Boolean(hit),
      matchLabel: hit?.matchLabel || '',
      matchedBy: hit?.matchedBy || '',
      queriedAs,
      runLabel,
      member: hit?.member || null,
    };
  };

  const preferMifValue = (...values: Array<unknown>) => {
    for (const value of values) {
      const text = String(value ?? '').trim();
      if (text) return text;
    }
    return '';
  };

  /** When single-auth PDF member is also on the consolidator list, prefer MIF master fields. */
  const applyPreferredIlsMifMasterFieldsToForm = (
    master: Partial<IlsMifMasterRow>,
    options?: { matchLabel?: string; matchedBy?: string; runLabel?: string }
  ) => {
    const auth = resolveIlsMifAuthorizationFields(master as IlsMifMasterRow);
    const emergencyName = parseMemberName(String(master.emergencyContactName || ''));
    const emergencyPhone = String(master.emergencyContactPhone || '').trim();
    const emergencyEmail = String(master.emergencyContactEmail || '').trim().toLowerCase();
    const referringEmail = String(master.careManagerEmail || '').trim().toLowerCase();
    const contactEmail =
      emergencyEmail ||
      (String(master.contactEmail || '').trim().toLowerCase() !== referringEmail
        ? String(master.contactEmail || '').trim().toLowerCase()
        : '');
    const address = toNameCase(
      String(master.memberResidentialAddress || master.memberAddress || '').trim()
    );
    const city = toNameCase(
      String(master.memberResidentialCity || master.memberCity || master.memberMailingCity || '').trim()
    );
    const zip = normalizeUsZip(
      String(master.memberResidentialZip || master.memberZip || master.memberMailingZip || '').trim()
    );
    const county = toNameCase(
      String(
        master.memberCounty ||
          inferCountyFromCityZip({ city, zip }) ||
          ''
      ).trim()
    );
    const state = String(
      inferStateFromCityZip({ city, zip }) || master.memberState || ''
    )
      .trim()
      .toUpperCase();
    const priorityNote = [
      'Prioritized fields from consolidated MIF master',
      options?.matchedBy ? `(matched by ${options.matchedBy})` : '',
      options?.matchLabel ? `· ${options.matchLabel}` : '',
      options?.runLabel ? `· ${options.runLabel}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    setMemberData((prev) => ({
      ...prev,
      memberFirstName: preferMifValue(master.memberFirstName, prev.memberFirstName),
      memberLastName: preferMifValue(master.memberLastName, prev.memberLastName),
      memberMrn: preferMifValue(master.memberMrn, prev.memberMrn),
      memberMediCalNum: preferMifValue(master.memberMediCalNum, prev.memberMediCalNum),
      confirmMemberMediCalNum: preferMifValue(
        master.memberMediCalNum,
        prev.confirmMemberMediCalNum,
        prev.memberMediCalNum
      ),
      memberSex: preferMifValue(master.memberSex, prev.memberSex),
      memberDob: preferMifValue(master.memberDob, prev.memberDob),
      memberPhone: preferMifValue(master.memberPhone, prev.memberPhone),
      memberEmail: preferMifValue(master.memberEmail, prev.memberEmail),
      memberCustomaryAddress: preferMifValue(address, prev.memberCustomaryAddress),
      memberCustomaryCity: preferMifValue(city, prev.memberCustomaryCity),
      memberCustomaryZip: preferMifValue(zip, prev.memberCustomaryZip),
      memberCustomaryCounty: preferMifValue(county, prev.memberCustomaryCounty),
      memberCustomaryState: preferMifValue(state, prev.memberCustomaryState),
      careManagerName: preferMifValue(master.careManagerName, prev.careManagerName),
      careManagerPhone: preferMifValue(master.careManagerPhone, prev.careManagerPhone),
      careManagerEmail: preferMifValue(master.careManagerEmail, prev.careManagerEmail),
      Authorization_Number_T038: preferMifValue(
        auth.authorizationNumberT2038,
        prev.Authorization_Number_T038
      ),
      Authorization_Start_T2038: preferMifValue(
        auth.authorizationStartT2038,
        prev.Authorization_Start_T2038
      ),
      Authorization_End_T2038: preferMifValue(
        auth.authorizationEndT2038,
        prev.Authorization_End_T2038
      ),
      contactFirstName: preferMifValue(emergencyName.firstName, prev.contactFirstName),
      contactLastName: preferMifValue(emergencyName.lastName, prev.contactLastName),
      contactPhone: preferMifValue(emergencyPhone, master.contactPhone, prev.contactPhone),
      contactEmail: preferMifValue(contactEmail, prev.contactEmail),
      contactRelationship: preferMifValue(
        sanitizeRelationshipLabel(String(master.emergencyContactRelationship || '')),
        prev.contactRelationship
      ),
      notes: mergeAdminNotes(prev.notes, priorityNote),
    }));
  };

  const searchMifMasterList = async () => {
    const identity = {
      memberFirstName: mifMasterSearchFirstName,
      memberLastName: mifMasterSearchLastName,
      memberMrn: mifMasterSearchMrn,
      memberMediCalNum: mifMasterSearchMediCal,
    };
    if (
      !String(identity.memberFirstName || '').trim() &&
      !String(identity.memberLastName || '').trim() &&
      !String(identity.memberMrn || '').trim() &&
      !String(identity.memberMediCalNum || '').trim()
    ) {
      toast({
        title: 'Enter search criteria',
        description: 'Use MRN, Medi-Cal/CIN, and/or first + last name to check the consolidated MIF master list.',
      });
      return;
    }
    setIsSearchingMifMaster(true);
    try {
      const result = await lookupIdentityOnMifMaster(identity);
      let createAppEligible = false;
      let createAppExcludeReason = '';
      if (result.exists && result.member) {
        const member = result.member;
        const mergeStatus = String(member.mergeStatus || 'unique');
        const caspioExists =
          Boolean(member.caspioExists) || mergeStatus === 'already_in_caspio';
        const skeletonApplicationId = String(member.skeletonApplicationId || '').trim();
        const dedupeKey = buildIlsMifDedupeKey({
          clientId2: String(member.clientId2 || ''),
          memberMrn: String(member.memberMrn || ''),
          memberMediCalNum: String(member.memberMediCalNum || ''),
          memberFirstName: String(member.memberFirstName || ''),
          memberLastName: String(member.memberLastName || ''),
          memberDob: String(member.memberDob || ''),
          memberAddress: '',
          memberZip: '',
          authorizationNumberT2038: '',
        })
          .replace(/[\/#?[\]]/g, '_')
          .slice(0, 700);
        const rowId = String(member.rowId || '').trim();

        let isDeclined = false;
        let isRemoved = false;
        let isCreateAppHidden = false;
        if (firestore) {
          const [declinedSnap, removedSnap, createAppExcludedKeys] = await Promise.all([
            getDocs(collection(firestore, ILS_MIF_DECLINED_COLLECTION)),
            getDocs(collection(firestore, ILS_MIF_REMOVED_COLLECTION)),
            loadCreateAppExcludedDedupeKeys(firestore),
          ]);
          const declinedKeys = new Set<string>();
          declinedSnap.forEach((docSnap) => {
            declinedKeys.add(docSnap.id);
            const data = docSnap.data() as any;
            const keyFromFields = buildIlsMifDedupeKey({
              clientId2: String(data.clientId2 || ''),
              memberMrn: String(data.memberMrn || ''),
              memberMediCalNum: String(data.memberMediCalNum || ''),
              memberFirstName: String(data.memberFirstName || ''),
              memberLastName: String(data.memberLastName || ''),
              memberDob: String(data.memberDob || ''),
              memberAddress: '',
              memberZip: '',
              authorizationNumberT2038: '',
            })
              .replace(/[\/#?[\]]/g, '_')
              .slice(0, 700);
            if (keyFromFields) declinedKeys.add(keyFromFields);
            const dk = String(data.dedupeKey || '').trim();
            if (dk) declinedKeys.add(dk);
          });
          const removedKeys = new Set<string>();
          removedSnap.forEach((docSnap) => {
            removedKeys.add(docSnap.id);
            const dk = String(docSnap.data()?.dedupeKey || '').trim();
            if (dk) removedKeys.add(dk);
          });
          isDeclined =
            (rowId ? declinedKeys.has(rowId) : false) || (dedupeKey ? declinedKeys.has(dedupeKey) : false);
          // Sacramento is served — do not treat older northern-decline marks as create blockers.
          if (
            isDeclined &&
            (isIlsServedCounty(member.memberCounty) ||
              isIlsServedCounty(findCountyByCity(String(member.memberCity || '').trim())))
          ) {
            isDeclined = false;
          }
          isRemoved =
            (rowId ? removedKeys.has(rowId) : false) || (dedupeKey ? removedKeys.has(dedupeKey) : false);
          isCreateAppHidden =
            (rowId ? createAppExcludedKeys.has(rowId) : false) ||
            (dedupeKey ? createAppExcludedKeys.has(dedupeKey) : false);
        }

        if (caspioExists || mergeStatus === 'already_in_caspio') {
          createAppExcludeReason = 'Already in Caspio — use Caspio/auth tools, not Create App picker.';
        } else if (skeletonApplicationId) {
          createAppExcludeReason = `Skeleton already created (${skeletonApplicationId}).`;
        } else if (isDeclined) {
          createAppExcludeReason = 'Marked declined / Northern decline — excluded from Create App.';
        } else if (isRemoved) {
          createAppExcludeReason = 'Removed from consolidator — excluded from Create App.';
        } else if (isCreateAppHidden) {
          createAppExcludeReason = 'Hidden from Create App (Hide Selected) — still on MIF master.';
        } else if (mergeStatus === 'duplicate_in_batch') {
          createAppExcludeReason = 'Duplicate in batch — not a Create App candidate.';
        } else if (
          !isIlsMifCreateAppCandidate(
            {
              mergeStatus: mergeStatus as IlsMifMasterRow['mergeStatus'],
              caspioExists,
              skeletonApplicationId,
            },
            false
          )
        ) {
          createAppExcludeReason = `Not a Create App candidate (status: ${mergeStatus || 'unknown'}).`;
        } else {
          createAppEligible = true;
        }

        // Prefer showing them in the picker search when eligible (or even when not — staff can see empty).
        const lastName = String(member.memberLastName || identity.memberLastName || '').trim();
        if (lastName) {
          setIlsPickerSearchMode('lastName');
          setIlsPickerSearch(lastName);
        }
      }

      setMifMasterSearchResult({
        exists: result.exists,
        matchLabel: result.matchLabel,
        matchedBy: result.matchedBy,
        queriedAs: result.queriedAs,
        runLabel: result.runLabel,
        createAppEligible,
        createAppExcludeReason,
      });
      toast({
        title: result.exists ? 'On latest consolidated MIF master' : 'Not on latest consolidated MIF master',
        description: result.exists
          ? `Matched by ${result.matchedBy || 'identity'}${result.matchLabel ? `: ${result.matchLabel}` : ''}${
              result.runLabel ? ` · ${result.runLabel}` : ''
            }.${
              createAppEligible
                ? ' Eligible for Create App picker — click Refresh Consolidated Run if the list is empty.'
                : createAppExcludeReason
                  ? ` Not in picker: ${createAppExcludeReason}`
                  : ''
            }`
          : `No master-list match for ${result.queriedAs || 'that search'}${
              result.runLabel ? ` (${result.runLabel})` : ''
            }.`,
        className: result.exists
          ? createAppEligible
            ? 'bg-indigo-100 text-indigo-950 border-indigo-200'
            : 'bg-amber-100 text-amber-950 border-amber-200'
          : 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'MIF master search failed',
        description: String(error?.message || 'Unknown error'),
      });
    } finally {
      setIsSearchingMifMaster(false);
    }
  };

  const checkParsedIdentityAgainstMifAndCaspio = async (identity: {
    memberFirstName?: string;
    memberLastName?: string;
    memberMrn?: string;
    memberMediCalNum?: string;
    clientId2?: string;
  }) => {
    try {
      const mif = await lookupIdentityOnMifMaster(identity);
      const probeRow = {
        rowId: 'single-auth-probe',
        sourceType: 'single_auth_pdf',
        sourceFileName: '',
        memberFirstName: String(identity.memberFirstName || '').trim(),
        memberLastName: String(identity.memberLastName || '').trim(),
        memberMrn: String(identity.memberMrn || '').trim(),
        memberMediCalNum: String(identity.memberMediCalNum || '').trim(),
        clientId2: String(identity.clientId2 || '').trim(),
        memberDob: '',
        memberSex: '',
        memberAddress: '',
        memberCity: '',
        memberZip: '',
        memberState: '',
        memberCounty: '',
        memberPhone: '',
        memberEmail: '',
        contactPhone: '',
        contactEmail: '',
        referringOrganization: '',
        emergencyContactName: '',
        emergencyContactRelationship: '',
        emergencyContactPhone: '',
        emergencyContactEmail: '',
        careManagerName: '',
        careManagerPhone: '',
        careManagerEmail: '',
        eligibilityCheckStatus: 'Pending',
        authorizationNumberT2038: '',
        authorizationStartT2038: '',
        authorizationEndT2038: '',
        kaiserStatus: '',
        dateReceivedRequestForAuthorization: '',
        dateOfReferralAuthorizationDecision: '',
        cptCode: '',
        diagnosticCode: '',
        assignedStaffId: '',
        assignedStaffName: '',
        createStatus: 'idle',
        pushStatus: 'idle',
        deleteStatus: 'idle',
        statusNote: '',
        applicationId: '',
        pushedClientId2: '',
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '',
        mifMasterExists: mif.exists,
        mifMasterMatchLabel: mif.matchLabel,
        mifMasterMatchedBy: mif.matchedBy,
      } as KaiserIlsImportRow;
      const [caspio] = await annotateRowsWithCaspioExists([probeRow]);
      let existing: Awaited<ReturnType<typeof findExistingApplicationsForMember>> = [];
      if (firestore) {
        existing = await findExistingApplicationsForMember(firestore, {
          memberMrn: identity.memberMrn,
          memberMediCalNum: identity.memberMediCalNum,
        });
      }
      const { samePersonMatches, differentNameMatches } = partitionExistingApplicationMatches(existing, {
        memberFirstName: identity.memberFirstName,
        memberLastName: identity.memberLastName,
      });
      setSingleAuthMifMasterHit({
        exists: mif.exists,
        matchLabel: mif.matchLabel,
        matchedBy: mif.matchedBy,
        runLabel: mif.runLabel,
        caspioExists: Boolean(caspio?.caspioExists),
        caspioMatchLabel: String(caspio?.caspioMatchLabel || ''),
        alreadyInApp: samePersonMatches.length > 0,
        existingApplicationIds: samePersonMatches.map((item) => item.applicationId),
        existingApplicationLabels: samePersonMatches.map((item) => formatExistingApplicationMatchLabel(item)),
        mrnNameConflict: differentNameMatches.length > 0,
        mrnNameConflictIds: differentNameMatches.map((item) => item.applicationId),
        mrnNameConflictLabels: differentNameMatches.map((item) => formatExistingApplicationMatchLabel(item)),
      });
      if (mif.exists && mif.member) {
        applyPreferredIlsMifMasterFieldsToForm(mif.member, {
          matchLabel: mif.matchLabel,
          matchedBy: mif.matchedBy,
          runLabel: mif.runLabel,
        });
      }
      const hits: string[] = [];
      if (caspio?.caspioExists) {
        hits.push(`Caspio${caspio.caspioMatchLabel ? ` (${caspio.caspioMatchLabel})` : ''}`);
      }
      if (samePersonMatches.length) {
        hits.push(`application ${samePersonMatches[0].applicationId}`);
      }
      if (differentNameMatches.length) {
        hits.push(
          `MRN/CIN also on differently named app ${formatExistingApplicationMatchLabel(differentNameMatches[0])}`
        );
      }
      if (mif.exists) {
        hits.push(
          `latest MIF master${mif.matchLabel ? ` (${mif.matchLabel})` : ''}${
            mif.runLabel ? ` · ${mif.runLabel}` : ''
          }`
        );
      }
      if (hits.length) {
        const hardDuplicate = Boolean(caspio?.caspioExists) || samePersonMatches.length > 0;
        const onlyNameConflict =
          !hardDuplicate && differentNameMatches.length > 0 && !mif.exists;
        toast({
          variant: hardDuplicate ? 'destructive' : 'default',
          title: onlyNameConflict
            ? 'MRN/CIN matches a differently named application'
            : mif.exists && !hardDuplicate
              ? 'On consolidated MIF master — form prioritized from MIF'
              : 'Possible duplicate — review before skeleton create',
          description: onlyNameConflict
            ? `Parsed MRN/CIN also appears on ${formatExistingApplicationMatchLabel(
                differentNameMatches[0]
              )}. Names do not match — verify the MRN on the PDF before creating.`
            : mif.exists && !hardDuplicate
              ? `Matched ${mif.matchLabel || 'member'} on the latest consolidator list${
                  mif.matchedBy ? ` by ${mif.matchedBy}` : ''
                }. MIF fields filled the form where available (richer than single-auth PDF alone).`
              : `This member already appears in ${hits.join(' and ')}.`,
          className: hardDuplicate ? undefined : 'bg-amber-100 text-amber-950 border-amber-200',
        });
      }
    } catch (error) {
      console.warn('Single-auth duplicate check failed:', error);
      setSingleAuthMifMasterHit(null);
    }
  };

  const annotateRowsWithCaspioAndMifMaster = async (rows: KaiserIlsImportRow[]) => {
    const withCaspio = await annotateRowsWithCaspioExists(rows);
    return annotateRowsWithMifMasterList(withCaspio);
  };

  const annotateRowsWithCaspioExists = async (rows: KaiserIlsImportRow[]) => {
    if (!rows.length) return rows;
    setIsCheckingCaspioExisting(true);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(data?.error || `Failed to check existing Caspio members (HTTP ${response.status})`);
      }

      const byMrn = new Map<string, { label: string; clientId2: string; calAimStatus: string }>();
      const byMediCal = new Map<string, { label: string; clientId2: string; calAimStatus: string }>();
      const byName = new Map<string, { label: string; clientId2: string; calAimStatus: string }>();
      const byClientId2 = new Map<string, { label: string; clientId2: string; calAimStatus: string }>();

      (data.members as any[]).forEach((member) => {
        const raw = (member?.caspioRaw || {}) as Record<string, unknown>;
        const firstName = String(member?.memberFirstName || member?.Senior_First || '').trim();
        const lastName = String(member?.memberLastName || member?.Senior_Last || '').trim();
        const label = `${lastName}, ${firstName}`.trim().replace(/^,\s*/, '') || 'Caspio Member';
        const clientId2 = String(member?.client_ID2 || member?.Client_ID2 || '').trim();
        const calAimStatus = normalizeIlsMifCalAimStatus(
          member?.CalAIM_Status ||
            member?.calaimStatus ||
            member?.calAimStatus ||
            raw?.CalAIM_Status ||
            raw?.calaimStatus ||
            ''
        );
        const caspioAuthDates = pickIlsMifCaspioAuthorizationDates(member);
        const matchPayload = {
          label,
          clientId2,
          calAimStatus,
          authorizationEndT2038: caspioAuthDates.authorizationEndT2038,
        };
        const signals = extractIdentitySignals(
          {
            ...raw,
            ...member,
            memberFirstName: firstName,
            memberLastName: lastName,
            clientId2,
          },
          {
            firstNameFields: ['memberFirstName', 'Senior_First', 'First_Name'],
            lastNameFields: ['memberLastName', 'Senior_Last', 'Last_Name'],
            mrnFields: ['Member_MRN', 'Kaiser_MRN', 'MRN', 'Medical_Record_Number', 'memberMrn'],
            mediCalFields: [
              'memberMediCalNum',
              'MediCal_Number',
              'MCP_CIN',
              'Medical_Number',
              'CIN',
              'Medi_Cal_Number',
              'memberMrn',
            ],
            clientId2Fields: ['clientId2', 'client_ID2', 'Client_ID2'],
          }
        );
        identityTokenLookupKeys(signals.mrnToken).forEach((key) => {
          if (key && !byMrn.has(key)) byMrn.set(key, matchPayload);
        });
        identityTokenLookupKeys(signals.mediCalToken).forEach((key) => {
          if (key && !byMediCal.has(key)) byMediCal.set(key, matchPayload);
        });
        // Dual-index explicit Kaiser MRN + CIN when both exist on the Caspio row.
        identityTokenLookupKeys(
          raw?.Member_MRN || raw?.Kaiser_MRN || raw?.MRN || raw?.Medical_Record_Number || member?.Member_MRN
        ).forEach((key) => {
          if (key && !byMrn.has(key)) byMrn.set(key, matchPayload);
        });
        identityTokenLookupKeys(
          raw?.MCP_CIN || raw?.MediCal_Number || member?.memberMediCalNum || member?.MCP_CIN
        ).forEach((key) => {
          if (key && !byMediCal.has(key)) byMediCal.set(key, matchPayload);
        });
        const nameKey = buildMemberLookupNameKey(firstName, lastName);
        const clientId2Key = signals.clientId2Token;
        if (clientId2Key && !byClientId2.has(clientId2Key)) {
          byClientId2.set(clientId2Key, matchPayload);
        }
        if (nameKey !== '|' && !byName.has(nameKey)) {
          byName.set(nameKey, matchPayload);
        }
      });

      return rows.map((row) => {
        const rowSignals = extractIdentitySignals(
          {
            memberFirstName: row.memberFirstName,
            memberLastName: row.memberLastName,
            memberMrn: row.memberMrn,
            memberMediCalNum: row.memberMediCalNum,
            clientId2: (row as any).clientId2 || (row as any).caspioMatchedClientId2,
          },
          {
            mrnFields: ['memberMrn'],
            mediCalFields: ['memberMediCalNum'],
            clientId2Fields: ['clientId2', 'caspioMatchedClientId2'],
          }
        );

        const nameKey = buildMemberLookupNameKey(row.memberFirstName, row.memberLastName);
        const clientId2Match = rowSignals.clientId2Token ? byClientId2.get(rowSignals.clientId2Token) : undefined;
        const mrnMatch = !clientId2Match
          ? identityTokenLookupKeys(rowSignals.mrnToken)
              .map((key) => byMrn.get(key) || byMediCal.get(key))
              .find(Boolean)
          : undefined;
        const mediCalMatch =
          !clientId2Match && !mrnMatch
            ? identityTokenLookupKeys(rowSignals.mediCalToken)
                .map((key) => byMediCal.get(key))
                .find(Boolean)
            : undefined;
        // Do not treat name-only as In Caspio (duplicate common names).
        const match = clientId2Match || mrnMatch || mediCalMatch;
        if (!match) {
          const nameHint =
            !clientId2Match && !mrnMatch && !mediCalMatch && nameKey !== '|'
              ? byName.get(nameKey)
              : undefined;
          return {
            ...row,
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '' as const,
            caspioCalAIMStatus: '',
            needsAuthorizedUpdate: false,
            statusNote: nameHint
              ? `Name-only Caspio hint (not In Caspio): ${nameHint.label} — confirm MRN/CIN`
              : row.statusNote || '',
          };
        }
        const matchedBy = clientId2Match
          ? 'client_id2'
          : mrnMatch
            ? 'mrn'
            : 'medi_cal';
        const calAimStatus = normalizeIlsMifCalAimStatus(match.calAimStatus);
        const needsAuthorizedUpdate = resolveIlsMifNeedsAuthorizedUpdate(calAimStatus, true, {
          fallback: isIlsMifCaspioPendingStatus(calAimStatus),
          mifAuthorizationEnd: (row as any).authorizationEndT2038,
          caspioAuthorizationEnd: (match as any).authorizationEndT2038,
          requireExtendedAuth: true,
        });
        return {
          ...row,
          caspioExists: true,
          caspioMatchLabel: match.label,
          caspioMatchedClientId2: match.clientId2,
          caspioMatchedBy: matchedBy as KaiserIlsImportRow['caspioMatchedBy'],
          caspioCalAIMStatus: calAimStatus,
          needsAuthorizedUpdate,
          statusNote: needsAuthorizedUpdate
            ? `In Caspio · CalAIM_Status Pending — MIF auth extends past current Caspio auth`
            : isIlsMifCaspioPendingStatus(calAimStatus)
              ? row.statusNote ||
                `In Caspio · CalAIM_Status Pending (no newer MIF auth end than Caspio)`
              : row.statusNote || `In Caspio (${matchedBy.replace('_', ' ')}): ${match.label}`,
        };
      });
    } catch (error) {
      console.warn('Failed to annotate rows with existing Caspio members:', error);
      toast({
        title: 'Caspio match check unavailable',
        description: 'Could not verify existing Caspio members. You can still choose rows and import.',
      });
      return rows.map((row) => ({
        ...row,
        caspioExists: false,
        caspioMatchLabel: '',
        caspioMatchedClientId2: '',
        caspioMatchedBy: '' as const,
        caspioCalAIMStatus: '',
        needsAuthorizedUpdate: false,
      }));
    } finally {
      setIsCheckingCaspioExisting(false);
    }
  };

  const parseIlsSpreadsheetFile = async (file: File) => {
    if (!hasMifCaspioRefresh) {
      toast({
        title: 'Refresh Caspio first',
        description: 'Run "1) Refresh Caspio Members" before uploading a MIF spreadsheet.',
        variant: 'destructive',
      });
      if (ilsSpreadsheetInputRef.current) {
        ilsSpreadsheetInputRef.current.value = '';
      }
      return;
    }
    setIsParsingIlsSpreadsheet(true);
    setIlsSpreadsheetFileName(String(file?.name || '').trim());
    ilsSpreadsheetSourceFileRef.current = file;
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = pickIlsSheetName(wb.SheetNames);
      if (!sheetName) throw new Error('No worksheet found in spreadsheet.');
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!rows.length) throw new Error('Spreadsheet has no data rows.');

      const parsed: KaiserIlsImportRow[] = rows
        .map((raw, idx) => {
          // CS_MIF import: pull only approved column headers.
          const memberFirstNameRaw = getSpreadsheetValue(raw, ['Member First Name']);
          const memberLastNameRaw = getSpreadsheetValue(raw, ['Member Last Name']);
          const memberFirstName = toNameCase(memberFirstNameRaw);
          const memberLastName = toNameCase(stripTrailingNonNameTokens(memberLastNameRaw));
          const memberMrn = getSpreadsheetValue(raw, [
            'Medical Record Number (MRN)',
          ]);
          const memberMediCalNum = extractSpreadsheetMediCalNumber(raw);
          const memberSex = normalizeMemberSex(
            getSpreadsheetValue(raw, [
              'Member Gender Code',
              'Member Gender',
              'Member Sex',
              'Gender',
              'Sex',
            ])
          );
          const clientId2 = getSpreadsheetValue(raw, ['Client_ID2', 'Client ID2', 'client_ID2']);
          const residentialAddress = getSpreadsheetValue(raw, ['Member Residential Address']);
          const residentialCity = getSpreadsheetValue(raw, [
            'Member Residential City',
          ]);
          const residentialZip = getSpreadsheetValue(raw, [
            'Member Residential Zip Code',
            'Member Resdidential Zip Code',
            'Member Resdential Zip Code',
            'Member Residential Zip',
            'Residential Zip Code',
            'Residential Zip',
          ]);
          const mailingAddress = getSpreadsheetValue(raw, [
            'Member Mailing Address',
          ]);
          const mailingCity = getSpreadsheetValue(raw, ['Member Mailing City']);
          const mailingZip = getSpreadsheetValue(raw, ['Member Mailing Zip Code']);
          const memberResidentialAddress = toNameCase(residentialAddress);
          const memberAddress = toNameCase(mailingAddress);
          const parsedAddress = parseAddressParts(memberAddress);
          const mailingCityNorm = toNameCase(mailingCity);
          const residentialCityNorm = toNameCase(residentialCity);
          const mailingZipNorm = normalizeUsZip(mailingZip);
          const residentialZipNorm = normalizeUsZip(residentialZip);
          const memberCity =
            mailingCityNorm ||
            residentialCityNorm ||
            toNameCase(parsedAddress.city) ||
            '';
          const memberZip = mailingCityNorm
            ? mailingZipNorm || residentialZipNorm || normalizeUsZip(parsedAddress.zip)
            : residentialCityNorm
              ? residentialZipNorm || mailingZipNorm || normalizeUsZip(parsedAddress.zip)
              : mailingZipNorm || residentialZipNorm || normalizeUsZip(parsedAddress.zip) || '';
          const memberState = inferStateFromCityZip({ city: memberCity, zip: memberZip });
          const memberCountyRaw = String(
            getSpreadsheetValue(raw, [
              'Medi-Cal Coverage County',
              'Member County',
              'County',
            ]) || ''
          )
            .replace(/\s+county$/i, '')
            .trim();
          const memberCountyLooksValid =
            memberCountyRaw.length >= 3 && !/^\d+$/.test(memberCountyRaw);
          const memberCounty = toNameCase(
            (memberCountyLooksValid ? memberCountyRaw : '') ||
              inferCountyFromCityZip({ city: memberCity, zip: memberZip }) ||
              ''
          );
          const memberDob = toSpreadsheetDate(getSpreadsheetRawValue(raw, ['Member Date of Birth']));
          const primaryPhone = getSpreadsheetValue(raw, ['Primary Phone Number']);
          const homePhone = getSpreadsheetValue(raw, ['Home Phone Number']);
          const memberPhone = primaryPhone || homePhone;
          const referringOrganization = getSpreadsheetValue(raw, ['Referring Organization']);
          const referringIndividualName = getSpreadsheetValue(raw, ['Referring Individual Name']);
          const referringIndividualPhone = getSpreadsheetValue(raw, [
            'Referring Individual Phone Number',
          ]);
          const referringIndividualEmail = getSpreadsheetValue(raw, [
            'Referring Individual Email Address',
          ]);
          const emergencyContactName = getSpreadsheetValue(raw, [
            'Emergency/ Alternate Contact Name',
            'Emergency/Alternate Contact Name',
          ]);
          const emergencyContactRelationship = getSpreadsheetValue(raw, [
            'Emergency/Alternate Contact Relation',
            'Emergency/ Alternate Contact Relation',
          ]);
          const emergencyContactPhone =
            getSpreadsheetValue(raw, [
              'Emergency/Alternate Contact Phone Number',
              'Emergency/ Alternate Contact Phone Number',
              'Emergency/Contact Alternate Contact Phone Number',
            ]) ||
            Object.entries(raw || {}).reduce((found, [key, value]) => {
              if (found) return found;
              const nk = normalizeSheetHeader(key);
              if (
                nk.includes('emergency') &&
                nk.includes('phone') &&
                !nk.includes('referring') &&
                !nk.includes('primary') &&
                !nk.includes('home')
              ) {
                return String(value ?? '').trim();
              }
              return '';
            }, '');
          const emergencyContactEmail = String(
            getSpreadsheetValue(raw, [
              'Emergency/Alternate Contact Email Address',
              'Emergency/ Alternate Contact Email Address',
              'Emergency/Alternate Contact Email',
              'Emergency Contact Email Address',
              'Emergency Contact Email',
            ]) ||
              Object.entries(raw || {}).reduce((found, [key, value]) => {
                if (found) return found;
                const nk = normalizeSheetHeader(key);
                if (nk.includes('emergency') && nk.includes('email') && !nk.includes('referring')) {
                  return String(value ?? '').trim();
                }
                return '';
              }, '') ||
              ''
          )
            .trim()
            .toLowerCase();
          const contactPhone = emergencyContactPhone || referringIndividualPhone;
          // Primary contact email is emergency/alternate only — never referring individual.
          const contactEmail = emergencyContactEmail;
          const careManagerName = referringIndividualName;
          const careManagerPhone = referringIndividualPhone;
          const careManagerEmail = referringIndividualEmail;
          const memberEmail = String(
            getSpreadsheetValue(raw, ['Member Email Address']) || ''
          )
            .trim()
            .toLowerCase();
          const eligibilityCheckStatus = 'Pending' as const;
          const authorizationNumberT2038 = getSpreadsheetValue(raw, ['Authorization Number']);
          const authorizationStartT2038 = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Authorization Start Date'])
          );
          const authorizationEndT2038 = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Authorizatin End Date', 'Authorization End Date'])
          );
          const dateReceivedRequestForAuthorization = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Date Received Request for Authorization'])
          );
          const dateOfReferralAuthorizationDecision = toSpreadsheetDate(
            getSpreadsheetRawValue(raw, ['Date of Referral Authorization Decision'])
          );
          const cptCode = '';
          const diagnosticCode = '';
          const ready = Boolean(memberFirstName && memberLastName && memberMediCalNum);
          const kaiserStatus = '';
          const extraAdminNotesLines = collectUnusedSpreadsheetNotes(raw);
          const extraAdminNotes = extraAdminNotesLines.join('\n');
          const primaryPhoneNumber = normalizePhoneDigits(primaryPhone)
            ? formatPhoneDashed(normalizePhoneDigits(primaryPhone))
            : '';
          const homePhoneNumber = normalizePhoneDigits(homePhone)
            ? formatPhoneDashed(normalizePhoneDigits(homePhone))
            : '';
          return {
            rowId: `ils-${Date.now()}-${idx}`,
            sourceType: 'spreadsheet',
            sourceFileName: String(file?.name || '').trim(),
            memberFirstName,
            memberLastName,
            memberMrn,
            memberMediCalNum,
            memberSex,
            clientId2,
            memberAddress,
            memberResidentialAddress,
            memberResidentialCity: residentialCityNorm,
            memberResidentialZip: residentialZipNorm,
            memberMailingCity: mailingCityNorm,
            memberMailingZip: mailingZipNorm,
            memberCity: String(memberCity || '').trim(),
            memberZip: String(memberZip || '').trim(),
            memberState: String(memberState || '').trim().toUpperCase(),
            memberCounty,
            memberDob,
            memberPhone,
            primaryPhoneNumber,
            homePhoneNumber,
            memberEmail,
            contactPhone: normalizePhoneDigits(contactPhone)
              ? formatPhoneDashed(normalizePhoneDigits(contactPhone))
              : '',
            contactEmail: String(contactEmail || '').trim().toLowerCase(),
            referringOrganization: toNameCase(String(referringOrganization || '').trim()),
            emergencyContactName: toNameCase(String(emergencyContactName || '').trim()),
            emergencyContactRelationship: toNameCase(String(emergencyContactRelationship || '').trim()),
            emergencyContactPhone: normalizePhoneDigits(emergencyContactPhone)
              ? formatPhoneDashed(normalizePhoneDigits(emergencyContactPhone))
              : '',
            emergencyContactEmail,
            careManagerName: toNameCase(String(careManagerName || '').trim()),
            careManagerPhone: normalizePhoneDigits(careManagerPhone)
              ? formatPhoneDashed(normalizePhoneDigits(careManagerPhone))
              : '',
            careManagerEmail: String(careManagerEmail || '').trim().toLowerCase(),
            eligibilityCheckStatus,
            authorizationNumberT2038,
            authorizationStartT2038,
            authorizationEndT2038,
            kaiserStatus,
            dateReceivedRequestForAuthorization,
            dateOfReferralAuthorizationDecision,
            cptCode,
            diagnosticCode,
            assignedStaffId: '',
            assignedStaffName: '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: ready ? '' : 'Missing member name or Medi-Cal/CIN',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
            extraAdminNotes,
          } as KaiserIlsImportRow;
        })
        .filter((row) => Boolean(row.memberFirstName && row.memberLastName));

      if (!parsed.length) {
        throw new Error('No usable rows found. Make sure spreadsheet has member first/last name columns.');
      }
      const annotated = await annotateRowsWithCaspioAndMifMaster(parsed);
      let createAppExcludedKeys = new Set<string>();
      try {
        if (firestore) createAppExcludedKeys = await loadCreateAppExcludedDedupeKeys(firestore);
      } catch {
        createAppExcludedKeys = new Set();
      }
      const visibleAnnotated = annotated.filter((row) => {
        const key = getIlsRowCreateAppDedupeKey(row);
        return !(key && createAppExcludedKeys.has(key));
      });
      const nextSelected: Record<string, boolean> = {};
      visibleAnnotated.forEach((row) => {
        nextSelected[row.rowId] = false;
      });
      const uploadLogId = `ils_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setIlsImportRows(visibleAnnotated);
      setIlsImportSelected(nextSelected);
      setPickedIlsRowId('');
      setActiveSpreadsheetUploadLogId(uploadLogId);
      await syncSpreadsheetUploadLog({
        uploadLogId,
        fileName: String(file?.name || '').trim(),
        rows: annotated,
        isNewUpload: true,
      });
      void Promise.all(annotated.map((row) => checkRowDuplicateAuthorizationByMrn(row)));
      const existingCount = visibleAnnotated.filter((row) => row.caspioExists).length;
      const importDefaultCount = visibleAnnotated.filter((row) => !row.caspioExists).length;
      const mifMasterCount = visibleAnnotated.filter((row) => row.mifMasterExists).length;
      const hiddenCount = annotated.length - visibleAnnotated.length;
      setHasMifCaspioRefresh(false);
      toast({
        title: 'Spreadsheet parsed',
        description: `Loaded ${visibleAnnotated.length} row(s): ${importDefaultCount} new, ${existingCount} already in Caspio, ${mifMasterCount} also on consolidated MIF master${
          hiddenCount ? ` (${hiddenCount} hidden from Create App)` : ''
        }.`,
      });
    } catch (error: any) {
      toast({
        title: 'Spreadsheet parse failed',
        description: String(error?.message || 'Unable to parse this spreadsheet.'),
        variant: 'destructive',
      });
    } finally {
      setIsParsingIlsSpreadsheet(false);
    }
  };

  const clearIlsSpreadsheetImport = () => {
    setIlsImportRows([]);
    setIlsImportSelected({});
    setPickedIlsRowId('');
    setActiveSpreadsheetUploadLogId('');
    setShowOnlyNotInCaspio(false);
    setIlsPickerSearch('');
    setIlsRowEligibilityFiles({});
    setIlsRowDuplicateMatches({});
    setCheckingRowDuplicates({});
    setIlsSpreadsheetFileName('');
    setHasMifCaspioRefresh(false);
    setMifLastCaspioRefreshAtIso('');
    setCreateAppLoadedRunId('');
    setCreateAppLoadedAtIso('');
    setIlsDecisionLogByRowId({});
    setPendingIlsDecisionDraft(null);
    ilsSpreadsheetSourceFileRef.current = null;
    parsedSingleAuthFilesRef.current = {};
    if (ilsSpreadsheetInputRef.current) {
      ilsSpreadsheetInputRef.current.value = '';
    }
    toast({
      title: 'Spreadsheet upload removed',
      description: 'Spreadsheet rows were cleared. You can upload again and start over.',
    });
  };

  const applyIlsRowsFromConsolidator = async (
    incomingRows: KaiserIlsImportRow[],
    sourceLabel: string,
    options?: { skippedDeclined?: number; silent?: boolean; runId?: string; autoParseRowId?: string }
  ): Promise<KaiserIlsImportRow[]> => {
    if (!incomingRows.length) {
      if (options?.silent) {
        setIlsImportRows([]);
        setIlsImportSelected({});
        setPickedIlsRowId('');
        toast({
          title: 'Picker updated',
          description: 'No remaining new members in this consolidation run.',
        });
        return [];
      }
      toast({
        variant: 'destructive',
        title: 'No members to load',
        description: 'The consolidator handoff did not include any rows.',
      });
      return [];
    }
    const withCaspio = await annotateRowsWithCaspioExists(incomingRows);
    let liveAppHits = 0;
    const liveCaspioHits = withCaspio.filter((row) => row.caspioExists).length;
    const pendingAuthHits = withCaspio.filter((row) => row.needsAuthorizedUpdate).length;
    // Create Application list: only members not already in Caspio (for new skeleton creates).
    let remaining = withCaspio.filter((row) => !row.caspioExists);
    if (firestore && remaining.length) {
      try {
        const appIndex = await loadExistingApplicationIdentityIndex(firestore);
        const stillNew: KaiserIlsImportRow[] = [];
        for (const row of remaining) {
          const existing = matchIdentityToExistingApplications(appIndex, row);
          if (existing.length) {
            liveAppHits += 1;
            try {
              await markIlsMifMemberSkeletonCreated(firestore, {
                memberFirstName: row.memberFirstName,
                memberLastName: row.memberLastName,
                memberMrn: row.memberMrn,
                memberMediCalNum: row.memberMediCalNum,
                memberDob: row.memberDob,
                clientId2: row.clientId2,
                consolidatorRunId: options?.runId,
                applicationId: existing[0].applicationId,
                actor: user?.email || user?.uid || '',
              });
            } catch (flagError) {
              console.warn('Failed to mark existing app member on consolidator list:', flagError);
            }
            continue;
          }
          stillNew.push(row);
        }
        remaining = stillNew;
      } catch (appLookupError) {
        console.warn('Live application match during consolidator refresh failed:', appLookupError);
      }
    }
    if (firestore && liveCaspioHits > 0) {
      await Promise.all(
        withCaspio
          .filter((row) => row.caspioExists)
          .map(async (row) => {
            try {
              await markIlsMifMemberPushedToCaspio(firestore, {
                memberFirstName: row.memberFirstName,
                memberLastName: row.memberLastName,
                memberMrn: row.memberMrn,
                memberMediCalNum: row.memberMediCalNum,
                memberDob: row.memberDob,
                clientId2: row.clientId2 || row.caspioMatchedClientId2,
                consolidatorRunId: options?.runId,
                actor: user?.email || user?.uid || '',
              });
            } catch (flagError) {
              console.warn('Failed to mark Caspio member on consolidator list:', flagError);
            }
          })
      );
    }
    if (!remaining.length) {
      setIlsImportRows([]);
      setIlsImportSelected({});
      setPickedIlsRowId('');
      setCreateAppLoadedAtIso(new Date().toISOString());
      toast({
        title: options?.silent ? 'Picker updated' : 'Loaded from ILS MIF Consolidator',
        description:
          liveAppHits > 0 || liveCaspioHits > 0
            ? `No remaining members to create. Excluded ${liveCaspioHits} already in Caspio and ${liveAppHits} already in the app.`
            : 'No remaining new members in this consolidation run.',
      });
      return [];
    }
    const annotatedRows = await annotateRowsWithMifMasterList(
      remaining.map((row) => ({
        ...row,
        mifMasterExists: Boolean(row.mifMasterExists),
        mifMasterMatchLabel: String(row.mifMasterMatchLabel || ''),
        mifMasterMatchedBy: row.mifMasterMatchedBy || '',
      }))
    );
    const nextSelected: Record<string, boolean> = {};
    annotatedRows.forEach((row) => {
      // Leave all picks off so staff choose one member at a time (parse → skeleton → assign).
      nextSelected[row.rowId] = false;
    });
    setIntakeType('kaiser_auth_received_via_ils');
    setIlsImportRows(annotatedRows);
    setIlsImportSelected(nextSelected);
    setPickedIlsRowId('');
    setIlsSpreadsheetFileName(sourceLabel);
    setHasMifCaspioRefresh(true);
    setMifLastCaspioRefreshAtIso(new Date().toISOString());
    if (options?.runId) {
      setCreateAppLoadedRunId(String(options.runId).trim());
    }
    setCreateAppLoadedAtIso(new Date().toISOString());
    // Default to not-in-Caspio only — this list is for creating applications.
    setShowOnlyNotInCaspio(true);

    const autoParseRowId = String(options?.autoParseRowId || '').trim();
    if (autoParseRowId && annotatedRows.length) {
      const target =
        annotatedRows.find((row) => String(row.rowId || '') === autoParseRowId) || annotatedRows[0];
      if (target) {
        setIlsImportSelected(() => {
          const next: Record<string, boolean> = {};
          annotatedRows.forEach((row) => {
            next[row.rowId] = row.rowId === target.rowId;
          });
          return next;
        });
        setPickedIlsRowId(target.rowId);
        window.setTimeout(() => {
          try {
            populateMemberDataFromIlsRow(target);
          } catch (parseError) {
            console.warn('Auto-parse from consolidator failed:', parseError);
          }
        }, 0);
      }
    }

    const declinedNote =
      options?.skippedDeclined && options.skippedDeclined > 0
        ? ` Excluded ${options.skippedDeclined} declined / removed / already-skeleton / in-Caspio row(s).`
        : '';
    const appSkipNote =
      liveAppHits > 0 ? ` Excluded ${liveAppHits} already in the app.` : '';
    const caspioSkipNote =
      liveCaspioHits > 0
        ? ` Removed ${liveCaspioHits} already in Caspio${
            pendingAuthHits > 0 ? ` (${pendingAuthHits} Pending CalAIM — use Caspio/auth tools for updates)` : ''
          }.`
        : '';
    toast({
      title: options?.silent ? 'Picker refreshed' : 'Loaded from ILS MIF Consolidator',
      description: options?.silent
        ? `${annotatedRows.length} member(s) not in Caspio from this run.${declinedNote}${appSkipNote}${caspioSkipNote}`
        : autoParseRowId
          ? `${annotatedRows.length} member(s) loaded from consolidator. Parsed into the form — review fields, then create the skeleton.`
          : `${annotatedRows.length} members not in Caspio loaded (ready to create applications). All picks are off — select one, parse into the form, create skeleton, then assign staff.${declinedNote}${appSkipNote}${caspioSkipNote}`,
      className: options?.silent ? undefined : 'bg-green-100 text-green-900 border-green-200',
    });
    if (!options?.silent && typeof window !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById('kaiser-ils-datapage')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 160);
    }
    return annotatedRows;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (searchParams.get('fromConsolidator') !== '1') return;
    try {
      const parsed = readAndClearIlsMifConsolidatorHandoff();
      if (!parsed?.rows?.length) return;
      const sourceLabel =
        Array.isArray(parsed.sourceFiles) && parsed.sourceFiles.length
          ? `MIF Consolidator (${parsed.sourceFiles.join(', ')})`
          : 'MIF Consolidator handoff';
      if (parsed.runId) {
        setSelectedConsolidatorRunId(String(parsed.runId));
        setCreateAppLoadedRunId(String(parsed.runId));
      }
      const autoParseRowId =
        String(parsed.autoParseRowId || '').trim() ||
        (searchParams.get('autoParse') === '1' && parsed.rows.length === 1
          ? String(parsed.rows[0]?.rowId || '').trim()
          : '');
      void applyIlsRowsFromConsolidator(parsed.rows as KaiserIlsImportRow[], sourceLabel, {
        runId: String(parsed.runId || ''),
        autoParseRowId: autoParseRowId || undefined,
      });
    } catch (error) {
      console.warn('Failed to load consolidator handoff:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const loadConsolidatorRunsForCreate = async () => {
    if (!firestore) return [] as IlsMifConsolidationRunRecord[];
    setIsLoadingConsolidatorRuns(true);
    try {
      const [runsSnap, uploadsSnap] = await Promise.all([
        getDocs(
          query(
            collection(firestore, ILS_MIF_CONSOLIDATION_RUNS_COLLECTION),
            orderBy('createdAtIso', 'desc'),
            limit(25)
          )
        ),
        getDocs(
          query(
            collection(firestore, ILS_MIF_UPLOADED_FILES_COLLECTION),
            orderBy('uploadedAtIso', 'desc'),
            limit(100)
          )
        ),
      ]);
      const nextRuns: IlsMifConsolidationRunRecord[] = [];
      runsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextRuns.push({
          id: docSnap.id,
          createdAtIso: String(data.createdAtIso || ''),
          label: String(data.label || docSnap.id),
          sourceFiles: Array.isArray(data.sourceFiles) ? data.sourceFiles.map(String) : [],
          newMemberCount: Number(data.newMemberCount || data?.totals?.unique || 0),
          totals: data.totals || {},
        });
      });
      setConsolidatorRuns(nextRuns);

      const nextUploads: IlsMifUploadedFileRecord[] = [];
      uploadsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        nextUploads.push({
          id: docSnap.id,
          fileName: String(data.fileName || docSnap.id),
          uploadedAtIso: String(data.uploadedAtIso || ''),
          rowCount: Number(data.rowCount || 0),
          uploadedBy: String(data.uploadedBy || ''),
          runId: String(data.runId || ''),
        });
      });
      setConsolidatorUploadedFiles(nextUploads);
      return nextRuns;
    } catch (error) {
      console.warn('Failed to load consolidator runs for create page:', error);
      return [] as IlsMifConsolidationRunRecord[];
    } finally {
      setIsLoadingConsolidatorRuns(false);
    }
  };

  useEffect(() => {
    if (intakeType !== 'kaiser_auth_received_via_ils') return;
    void loadConsolidatorRunsForCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeType, firestore]);

  const loadNewMembersFromMifMasterList = async (
    runId?: string,
    options?: { silent?: boolean; preferLatest?: boolean }
  ): Promise<KaiserIlsImportRow[]> => {
    if (!firestore) {
      if (!options?.silent) {
        toast({ variant: 'destructive', title: 'Firestore unavailable' });
      }
      return [];
    }
    try {
      let preferredRunId = String(runId || '').trim();
      if (options?.preferLatest || !preferredRunId) {
        const runs = await loadConsolidatorRunsForCreate();
        if (options?.preferLatest && runs[0]?.id) {
          preferredRunId = runs[0].id;
        } else if (!preferredRunId) {
          preferredRunId = String(
            selectedConsolidatorRunId || createAppLoadedRunId || searchParams.get('consolidatorRunId') || runs[0]?.id || ''
          ).trim();
        }
      } else {
        preferredRunId = String(
          preferredRunId || selectedConsolidatorRunId || createAppLoadedRunId || searchParams.get('consolidatorRunId') || ''
        ).trim();
      }
      if (!preferredRunId) {
        if (!options?.silent) {
          toast({
            title: 'No consolidation run yet',
            description: 'Save a dated run in ILS MIF Consolidator, then refresh this filtered Create App list.',
          });
        }
        return [];
      }
      setSelectedConsolidatorRunId(preferredRunId);

      const [memberSnapInitial, declinedSnap, removedSnap, createAppExcludedKeys] = await Promise.all([
        getDocs(
          collection(
            firestore,
            ILS_MIF_CONSOLIDATION_RUNS_COLLECTION,
            preferredRunId,
            ILS_MIF_RUN_MEMBERS_SUBCOLLECTION
          )
        ),
        getDocs(collection(firestore, ILS_MIF_DECLINED_COLLECTION)),
        getDocs(collection(firestore, ILS_MIF_REMOVED_COLLECTION)),
        loadCreateAppExcludedDedupeKeys(firestore),
      ]);

      const declinedKeys = new Set<string>();
      declinedSnap.forEach((docSnap) => {
        const data = docSnap.data() as any;
        const keyFromFields = buildIlsMifDedupeKey({
          clientId2: String(data.clientId2 || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberDob: String(data.memberDob || ''),
          memberAddress: '',
          memberZip: '',
          authorizationNumberT2038: '',
        }).replace(/[\/#?[\]]/g, '_').slice(0, 700);
        if (keyFromFields) declinedKeys.add(keyFromFields);
        if (docSnap.id) declinedKeys.add(docSnap.id);
        const dedupeKey = String(data.dedupeKey || '').trim();
        if (dedupeKey) declinedKeys.add(dedupeKey);
      });

      const removedKeys = new Set<string>();
      removedSnap.forEach((docSnap) => {
        removedKeys.add(docSnap.id);
        const dedupeKey = String(docSnap.data()?.dedupeKey || '').trim();
        if (dedupeKey) removedKeys.add(dedupeKey);
      });

      let usedRunSnapshot = true;
      let memberSnap = memberSnapInitial;
      if (memberSnap.empty) {
        usedRunSnapshot = false;
        memberSnap = await getDocs(collection(firestore, ILS_MIF_MASTER_COLLECTION));
      }

      const rows: KaiserIlsImportRow[] = [];
      let skippedDeclined = 0;
      let skippedRemoved = 0;
      let skippedCreateAppExcluded = 0;
      let skippedSkeleton = 0;
      let skippedInCaspio = 0;
      let skippedOther = 0;
      memberSnap.forEach((docSnap) => {
        if (docSnap.id === '_meta') return;
        const data = docSnap.data() as any;
        if (!data?.memberFirstName || !data?.memberLastName) return;
        if (!usedRunSnapshot && String(data.runId || '') !== preferredRunId) return;

        const dedupeKey = buildIlsMifDedupeKey({
          clientId2: String(data.clientId2 || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberDob: String(data.memberDob || ''),
          memberAddress: '',
          memberZip: '',
          authorizationNumberT2038: '',
        }).replace(/[\/#?[\]]/g, '_').slice(0, 700);

        const mergeStatus = String(data.mergeStatus || 'unique');
        const caspioExists =
          Boolean(data.caspioExists) || mergeStatus === 'already_in_caspio';
        const skeletonApplicationId = String(data.skeletonApplicationId || '').trim();
        let isDeclined =
          declinedKeys.has(docSnap.id) || (dedupeKey ? declinedKeys.has(dedupeKey) : false);
        if (
          isDeclined &&
          (isIlsServedCounty(data.memberCounty) ||
            isIlsServedCounty(findCountyByCity(String(data.memberCity || '').trim())))
        ) {
          isDeclined = false;
        }

        // Same rules as consolidator Send → Create App (unique + incomplete / missing CIN).
        if (
          !isIlsMifCreateAppCandidate(
            {
              mergeStatus: mergeStatus as IlsMifMasterRow['mergeStatus'],
              caspioExists,
              skeletonApplicationId,
            },
            isDeclined
          )
        ) {
          if (caspioExists || mergeStatus === 'already_in_caspio') skippedInCaspio += 1;
          else if (skeletonApplicationId) skippedSkeleton += 1;
          else if (isDeclined) skippedDeclined += 1;
          else skippedOther += 1;
          return;
        }
        if (removedKeys.has(docSnap.id) || (dedupeKey && removedKeys.has(dedupeKey))) {
          skippedRemoved += 1;
          return;
        }
        if (
          createAppExcludedKeys.has(docSnap.id) ||
          (dedupeKey && createAppExcludedKeys.has(dedupeKey))
        ) {
          skippedCreateAppExcluded += 1;
          return;
        }

        rows.push({
          rowId: String(data.rowId || docSnap.id),
          sourceType: 'spreadsheet',
          sourceFileName: String(data.sourceFileName || 'MIF Master List'),
          memberFirstName: String(data.memberFirstName || ''),
          memberLastName: String(data.memberLastName || ''),
          memberMrn: String(data.memberMrn || ''),
          memberMediCalNum: String(data.memberMediCalNum || ''),
          memberSex: String(data.memberSex || ''),
          clientId2: String(data.clientId2 || ''),
          memberAddress: String(data.memberAddress || ''),
          memberCity: String(data.memberCity || ''),
          memberZip: String(data.memberZip || ''),
          memberState: String(data.memberState || ''),
          memberCounty: String(data.memberCounty || ''),
          memberDob: String(data.memberDob || ''),
          memberPhone: String(data.memberPhone || ''),
          memberEmail: String(data.memberEmail || ''),
          contactPhone: String(data.contactPhone || ''),
          contactEmail: String(data.contactEmail || ''),
          referringOrganization: String(data.referringOrganization || ''),
          emergencyContactName: String(data.emergencyContactName || ''),
          emergencyContactRelationship: String(data.emergencyContactRelationship || ''),
          emergencyContactPhone: String(data.emergencyContactPhone || ''),
          emergencyContactEmail: String(data.emergencyContactEmail || '')
            .trim()
            .toLowerCase(),
          careManagerName: String(data.careManagerName || ''),
          careManagerPhone: String(data.careManagerPhone || ''),
          careManagerEmail: String(data.careManagerEmail || ''),
          eligibilityCheckStatus: 'Pending',
          authorizationNumberT2038: String(data.authorizationNumberT2038 || ''),
          authorizationStartT2038: String(data.authorizationStartT2038 || ''),
          authorizationEndT2038: String(data.authorizationEndT2038 || ''),
          kaiserStatus: '',
          dateReceivedRequestForAuthorization: String(data.dateReceivedRequestForAuthorization || ''),
          dateOfReferralAuthorizationDecision: String(data.dateOfReferralAuthorizationDecision || ''),
          cptCode: '',
          diagnosticCode: '',
          assignedStaffId: '',
          assignedStaffName: '',
          createStatus: 'idle',
          pushStatus: 'idle',
          deleteStatus: 'idle',
          statusNote: String(data.statusNote || ''),
          applicationId: '',
          pushedClientId2: '',
          caspioExists: false,
          caspioMatchLabel: String(data.caspioMatchLabel || ''),
          caspioMatchedClientId2: String(data.caspioMatchedClientId2 || data.clientId2 || ''),
          caspioMatchedBy: (data.caspioMatchedBy as KaiserIlsImportRow['caspioMatchedBy']) || '',
          caspioCalAIMStatus: normalizeIlsMifCalAimStatus(data.caspioCalAIMStatus || data.CalAIM_Status || ''),
          needsAuthorizedUpdate: false,
          mifMasterExists: true,
          mifMasterMatchLabel: `${String(data.memberLastName || '').trim()}, ${String(data.memberFirstName || '').trim()}`.trim(),
          mifMasterMatchedBy: 'name',
          extraAdminNotes: String(data.extraAdminNotes || ''),
        });
      });
      if (!rows.length) {
        setCreateAppLoadedRunId(preferredRunId);
        setCreateAppLoadedAtIso(new Date().toISOString());
        setCreateAppLoadSkipStats({
          skippedSkeleton,
          skippedInCaspio,
        });
        if (options?.silent) {
          setIlsImportRows([]);
          setIlsImportSelected({});
          setPickedIlsRowId('');
          toast({
            title: 'Picker updated',
            description: `No remaining members in this run${
              skippedSkeleton || skippedDeclined || skippedRemoved || skippedCreateAppExcluded || skippedInCaspio || skippedOther
                ? ` (excluded ${skippedSkeleton} skeleton(s), ${skippedInCaspio} in Caspio, ${skippedDeclined} decline(s), ${skippedRemoved} removal(s), ${skippedCreateAppExcluded} Create App hide(s)${skippedOther ? `, ${skippedOther} other` : ''})`
                : ''
            }.`,
          });
          return [];
        }
        toast({
          title: 'No master-list members left',
          description: skippedDeclined || skippedRemoved || skippedSkeleton || skippedCreateAppExcluded || skippedInCaspio || skippedOther
            ? `That run has no remaining Create App members after excluding ${skippedSkeleton} skeleton(s), ${skippedInCaspio} already in Caspio, ${skippedDeclined} decline(s), ${skippedRemoved} removal(s), and ${skippedCreateAppExcluded} Create App hide(s).`
            : 'That consolidation run has no members left to load. Save a dated run in ILS MIF Consolidator first.',
        });
        return [];
      }
      setCreateAppLoadedRunId(preferredRunId);
      setCreateAppLoadedAtIso(new Date().toISOString());
      setCreateAppLoadSkipStats({
        skippedSkeleton,
        skippedInCaspio,
      });
      const selectedRun = consolidatorRuns.find((run) => run.id === preferredRunId);
      if (!options?.silent) {
        try {
          await addIlsMifAuditDoc(firestore, {
            action: 'create_app_load',
            summary: `Loaded ${rows.length} member(s) not in Caspio into Create Application from ${preferredRunId}`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            runId: preferredRunId,
            count: rows.length,
            skippedDeclined,
            skippedRemoved,
            skippedCreateAppExcluded,
            skippedSkeleton,
            skippedInCaspio,
            skippedOther,
          });
        } catch (auditError) {
          console.warn('Create App MIF audit write failed:', auditError);
        }
      }
      const appliedRows = await applyIlsRowsFromConsolidator(
        rows,
        `ILS MIF Run ${
          selectedRun?.createdAtIso
            ? new Date(selectedRun.createdAtIso).toLocaleString()
            : preferredRunId
        }`,
        {
          skippedDeclined: skippedDeclined + skippedRemoved + skippedSkeleton + skippedCreateAppExcluded + skippedInCaspio + skippedOther,
          silent: Boolean(options?.silent),
          runId: preferredRunId,
        }
      );
      return appliedRows;
    } catch (error: any) {
      if (!options?.silent) {
        toast({
          variant: 'destructive',
          title: 'Unable to load MIF master list',
          description: String(error?.message || 'Unknown error'),
        });
      } else {
        console.warn('Silent consolidator picker refresh failed:', error);
      }
      return [];
    }
  };

  // When returning from application Caspio push (or another tab), refresh the already-loaded filtered list.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (intakeType !== 'kaiser_auth_received_via_ils') return;

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!createAppLoadedRunId) return;
      void loadNewMembersFromMifMasterList(undefined, { silent: true, preferLatest: true });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeType, createAppLoadedRunId, firestore]);

  const selectAllVisibleIlsRows = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsPickerRows.forEach((row) => {
        next[row.rowId] = !isIlsRowLockedForSkeletonCreate(row);
      });
      return next;
    });
  };

  const clearAllVisibleIlsSelections = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsPickerRows.forEach((row) => {
        next[row.rowId] = false;
      });
      return next;
    });
  };

  const selectOnlyNotInCaspio = (rowsOverride?: KaiserIlsImportRow[]) => {
    const rows = rowsOverride || ilsImportRows;
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      rows.forEach((row) => {
        next[row.rowId] = !row.caspioExists && !isIlsRowLockedForSkeletonCreate(row);
      });
      return next;
    });
    const firstNotInCaspio = rows.find((row) => !row.caspioExists);
    setPickedIlsRowId(firstNotInCaspio?.rowId || '');
    setShowOnlyNotInCaspio(true);
    setNotInCaspioCardActive(true);
  };

  const focusNotInCaspioMembers = async () => {
    setNotInCaspioCardActive(true);
    let rows = ilsImportRows;
    if (rows.length === 0) {
      rows = await loadNewMembersFromMifMasterList(selectedConsolidatorRunId || undefined, {
        preferLatest: !selectedConsolidatorRunId,
      });
    }
    setShowOnlyNotInCaspio(true);
    setIlsPickerSearch('');
    const firstNotInCaspio = rows.find((row) => !row.caspioExists) || rows[0];
    if (firstNotInCaspio) {
      setPickedIlsRowId(firstNotInCaspio.rowId);
      setIlsImportSelected((prev) => {
        const next: Record<string, boolean> = { ...prev };
        rows.forEach((row) => {
          next[row.rowId] = row.rowId === firstNotInCaspio.rowId;
        });
        return next;
      });
    }
    window.setTimeout(() => {
      document.getElementById('create-app-mif-member-picker')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
  };

  const selectOnlyInCaspio = () => {
    setIlsImportSelected((prev) => {
      const next = { ...prev };
      ilsImportRows.forEach((row) => {
        next[row.rowId] = false;
      });
      return next;
    });
    setPickedIlsRowId('');
    setShowOnlyNotInCaspio(false);
    setNotInCaspioCardActive(false);
    toast({
      title: 'Rows already in Caspio are locked',
      description:
        'To create a new skeleton from these rows again, delete the member in both Application records and Caspio, then re-upload/re-check.',
    });
  };

  const excludeRowsFromCreateApp = async (rows: KaiserIlsImportRow[]) => {
    if (!firestore) {
      toast({ variant: 'destructive', title: 'Firestore unavailable' });
      return;
    }
    if (!rows.length) {
      toast({
        title: 'Nothing selected',
        description: 'Select one or more members, or use Hide on a single row.',
      });
      return;
    }
    const label =
      rows.length === 1
        ? `${rows[0].memberFirstName || ''} ${rows[0].memberLastName || ''}`.trim() || 'this member'
        : `${rows.length} members`;
    const ok = await appConfirm(
      `Hide ${label} from Create Application runs?\n\nThey stay on the full consolidator / master list. They just will not appear here again.`
    );
    if (!ok) return;

    setIsExcludingFromCreateApp(true);
    try {
      const excludedRowIds = new Set<string>();
      for (const row of rows) {
        await excludeIlsMifMemberFromCreateApp(firestore, {
          memberFirstName: row.memberFirstName,
          memberLastName: row.memberLastName,
          memberMrn: row.memberMrn,
          memberMediCalNum: row.memberMediCalNum,
          memberDob: row.memberDob,
          clientId2: row.clientId2 || row.pushedClientId2,
          ilsMifDedupeKey: getIlsRowCreateAppDedupeKey(row),
          reason: 'Hidden from Create Application (kept on consolidator master list)',
          actor: user?.email || user?.uid || '',
          consolidatorRunId: selectedConsolidatorRunId || createAppLoadedRunId || '',
        });
        excludedRowIds.add(row.rowId);
      }
      setIlsImportRows((prev) => prev.filter((row) => !excludedRowIds.has(row.rowId)));
      setIlsImportSelected((prev) => {
        const next = { ...prev };
        excludedRowIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });
      if (pickedIlsRowId && excludedRowIds.has(pickedIlsRowId)) {
        setPickedIlsRowId('');
      }
      toast({
        title: 'Hidden from Create Application',
        description: `${rows.length} member${rows.length === 1 ? '' : 's'} will stay on the consolidator list but no longer appear in Create App runs.`,
        className: 'bg-green-100 text-green-900 border-green-200',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not hide member',
        description: String(error?.message || 'Unable to exclude from Create Application.'),
      });
    } finally {
      setIsExcludingFromCreateApp(false);
    }
  };

  const excludeSelectedFromCreateApp = async () => {
    const selected = ilsImportRows.filter((row) => ilsImportSelected[row.rowId]);
    await excludeRowsFromCreateApp(selected);
  };

  const refreshIlsRowsFromCaspio = async () => {
    if (!ilsImportRows.length) {
      toast({
        title: 'No rows to refresh',
        description: 'Upload or parse spreadsheet rows first, then run Caspio refresh.',
      });
      return;
    }
    const annotatedRows = await annotateRowsWithCaspioAndMifMaster(ilsImportRows);
    let createAppExcludedKeys = new Set<string>();
    try {
      if (firestore) createAppExcludedKeys = await loadCreateAppExcludedDedupeKeys(firestore);
    } catch {
      createAppExcludedKeys = new Set();
    }
    const visibleRows = annotatedRows.filter((row) => {
      const key = getIlsRowCreateAppDedupeKey(row);
      return !(key && createAppExcludedKeys.has(key));
    });
    setIlsImportRows(visibleRows);
    setIlsImportSelected((prev) => {
      const next: Record<string, boolean> = {};
      visibleRows.forEach((row) => {
        const isLocked = isIlsRowLockedForSkeletonCreate(row);
        next[row.rowId] = isLocked ? false : Boolean(prev[row.rowId]);
      });
      return next;
    });
    if (pickedIlsRowId && !visibleRows.some((row) => row.rowId === pickedIlsRowId)) {
      setPickedIlsRowId('');
    } else if (showOnlyNotInCaspio && pickedIlsRowId) {
      const pickedRow = visibleRows.find((row) => row.rowId === pickedIlsRowId);
      if (pickedRow?.caspioExists) {
        const firstNotInCaspio = visibleRows.find((row) => !row.caspioExists);
        setPickedIlsRowId(firstNotInCaspio?.rowId || '');
      }
    }
    const existingCount = visibleRows.filter((row) => row.caspioExists).length;
    const pendingAuthCount = visibleRows.filter((row) => row.needsAuthorizedUpdate).length;
    const newCount = visibleRows.length - existingCount;
    const mifMasterCount = visibleRows.filter((row) => row.mifMasterExists).length;
    setHasMifCaspioRefresh(true);
    setMifLastCaspioRefreshAtIso(new Date().toISOString());
    toast({
      title: 'Caspio + MIF master match refreshed',
      description: `${visibleRows.length} row(s): ${newCount} new to Caspio, ${existingCount} in Caspio${
        pendingAuthCount > 0 ? ` (${pendingAuthCount} Pending — auth update needed)` : ''
      }, ${mifMasterCount} on consolidated MIF master.`,
    });
  };

  const refreshCaspioBeforeSpreadsheetParse = async () => {
    setIsCheckingCaspioExisting(true);
    try {
      const response = await fetch('/api/kaiser-members?source=caspio&refresh=1', { cache: 'no-store' });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok || !data?.success || !Array.isArray(data?.members)) {
        throw new Error(String(data?.error || `Failed to refresh Caspio members (HTTP ${response.status})`));
      }
      setHasMifCaspioRefresh(true);
      setMifLastCaspioRefreshAtIso(new Date().toISOString());
      toast({
        title: 'Caspio refresh complete',
        description: `Fetched ${data.members.length} current member record(s). You can now upload the MIF spreadsheet for parsing.`,
      });
    } catch (error: any) {
      toast({
        title: 'Caspio refresh failed',
        description: String(error?.message || 'Could not refresh Caspio members right now.'),
        variant: 'destructive',
      });
    } finally {
      setIsCheckingCaspioExisting(false);
    }
  };

  const buildIlsRowAdminNotes = (row: KaiserIlsImportRow) => {
    if (row.sourceType === 'single_auth_pdf') {
      const base = buildSingleAuthPdfDetailsNotes({
        sourceFileName: row.sourceFileName,
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        memberMrn: row.memberMrn,
        memberMediCalNum: row.memberMediCalNum,
        memberDob: row.memberDob,
        memberCustomaryAddress: row.memberAddress,
        memberCustomaryCity: row.memberCity,
        memberCustomaryState: row.memberState,
        memberCustomaryZip: row.memberZip,
        memberCustomaryCounty: row.memberCounty,
        memberPhone: row.memberPhone,
        contactPhone: row.contactPhone,
        memberEmail: row.memberEmail,
        contactEmail: row.contactEmail || row.emergencyContactEmail,
        careManagerName: row.careManagerName,
        careManagerPhone: row.careManagerPhone,
        careManagerEmail: row.careManagerEmail,
        referringOrganization: row.referringOrganization,
        emergencyContactName: row.emergencyContactName,
        emergencyContactRelationship: row.emergencyContactRelationship,
        emergencyContactPhone: row.emergencyContactPhone,
        emergencyContactEmail: row.emergencyContactEmail,
        Authorization_Number_T038: row.authorizationNumberT2038,
        Authorization_Start_T2038: row.authorizationStartT2038,
        Authorization_End_T2038: row.authorizationEndT2038,
        Diagnostic_Code: row.diagnosticCode,
        cptCode: row.cptCode,
      });
      const leftover = stripSingleAuthPdfDetailsHeading(row.extraAdminNotes || '');
      if (!leftover) {
        return (
          base ||
          [
            'Single Auth PDF Details',
            row.mifMasterExists
              ? `On Consolidated MIF Master: Yes (${row.mifMasterMatchedBy || 'match'}${
                  row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''
                })`
              : 'On Consolidated MIF Master: No',
          ].join('\n')
        );
      }
      const baseLower = base.toLowerCase();
      const uniqueExtraLines = leftover
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => {
          const label = line.split(':')[0]?.trim().toLowerCase() || '';
          if (!label) return false;
          // Keep spreadsheet-style extras (language/age/plan/provider/instructions) not already present.
          return !baseLower.includes(`${label}:`);
        });
      const mifMasterLine = row.mifMasterExists
        ? `On Consolidated MIF Master: Yes (${row.mifMasterMatchedBy || 'match'}${
            row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''
          })`
        : 'On Consolidated MIF Master: No';
      return [base, ...uniqueExtraLines, mifMasterLine].filter(Boolean).join('\n');
    }

    const heading = 'ILS Spreadsheet Details';
    const addressLines = buildIlsMifAddressNotesLines(row);
    const lines = [
      heading,
      `Source File: ${row.sourceFileName || 'Unknown'}`,
      ...addressLines,
      row.referringOrganization ? `Referring Organization: ${row.referringOrganization}` : '',
      row.careManagerName ? `Referring Individual: ${row.careManagerName}` : '',
      row.careManagerPhone ? `Referring Individual Phone: ${row.careManagerPhone}` : '',
      row.careManagerEmail ? `Referring Individual Email: ${row.careManagerEmail}` : '',
      row.emergencyContactName ? `Emergency/Alternate Contact: ${row.emergencyContactName}` : '',
      row.emergencyContactRelationship ? `Emergency Contact Relationship: ${row.emergencyContactRelationship}` : '',
      row.emergencyContactPhone ? `Emergency Contact Phone: ${row.emergencyContactPhone}` : '',
      row.emergencyContactEmail ? `Emergency Contact Email: ${row.emergencyContactEmail}` : '',
      row.dateReceivedRequestForAuthorization
        ? `Date Received Request for Authorization: ${row.dateReceivedRequestForAuthorization}`
        : '',
      row.dateOfReferralAuthorizationDecision
        ? `Date of Referral Authorization Decision: ${row.dateOfReferralAuthorizationDecision}`
        : '',
      row.mifMasterExists
        ? `On Consolidated MIF Master: Yes (${row.mifMasterMatchedBy || 'match'}${
            row.mifMasterMatchLabel ? ` - ${row.mifMasterMatchLabel}` : ''
          })`
        : 'On Consolidated MIF Master: No',
      row.extraAdminNotes || '',
    ].filter(Boolean);
    return lines.join('\n');
  };

  const resolveEmergencyContactFieldsFromIlsRow = (row: KaiserIlsImportRow) => {
    const emergencyName = parseMemberName(row.emergencyContactName || '');
    const contactPhoneRaw = row.emergencyContactPhone || row.contactPhone || '';
    const contactPhone = normalizePhoneDigits(contactPhoneRaw)
      ? formatPhoneDashed(normalizePhoneDigits(contactPhoneRaw))
      : String(contactPhoneRaw || '').trim();
    const referringEmail = String(row.careManagerEmail || '')
      .trim()
      .toLowerCase();
    // Prefer emergency email; ignore contactEmail when it was the referral-source email.
    const emergencyEmail = String(row.emergencyContactEmail || '')
      .trim()
      .toLowerCase();
    const legacyContactEmail = String(row.contactEmail || '')
      .trim()
      .toLowerCase();
    const contactEmail =
      emergencyEmail ||
      (legacyContactEmail && legacyContactEmail !== referringEmail ? legacyContactEmail : '');
    const contactRelationship = sanitizeRelationshipLabel(
      toNameCase(String(row.emergencyContactRelationship || '').trim())
    );
    const emergencyContactName = String(row.emergencyContactName || '').trim();
    return {
      contactFirstName: emergencyName.firstName,
      contactLastName: emergencyName.lastName,
      contactPhone,
      contactEmail,
      contactRelationship,
      emergencyContactName,
      emergencyContactPhone: contactPhone,
      emergencyContactRelationship: contactRelationship,
      emergencyContactEmail: contactEmail,
    };
  };

  const populateMemberDataFromIlsRow = (row: KaiserIlsImportRow, options?: { silent?: boolean }) => {
    const notes = buildIlsRowAdminNotes(row);
    const normalizedAddress = toNameCase(row.memberAddress || '');
    const normalizedCity = toNameCase(row.memberCity || '');
    const normalizedZip = normalizeUsZip(row.memberZip || parseAddressParts(row.memberAddress || '').zip || '');
    const normalizedCounty = toNameCase(
      inferCountyFromCityZip({ city: normalizedCity, zip: normalizedZip }) || row.memberCounty || ''
    );
    const normalizedState = String(
      inferStateFromCityZip({ city: normalizedCity, zip: normalizedZip }) || row.memberState || ''
    )
      .trim()
      .toUpperCase();
    const emergencyContact = resolveEmergencyContactFieldsFromIlsRow(row);
    setMemberData((prev) => ({
      ...prev,
      memberFirstName: row.memberFirstName || '',
      memberLastName: row.memberLastName || '',
      memberMrn: row.memberMrn || '',
      memberMediCalNum: row.memberMediCalNum || '',
      confirmMemberMediCalNum: row.memberMediCalNum || '',
      memberSex: row.memberSex || '',
      parsedSourceType: row.sourceType || '',
      createServiceDeliveryFormPdf: row.sourceType === 'spreadsheet',
      memberDob: row.memberDob || '',
      memberPhone: row.memberPhone || '',
      memberEmail: row.memberEmail || '',
      memberCustomaryAddress: normalizedAddress,
      memberCustomaryCity: normalizedCity,
      memberCustomaryState: normalizedState,
      memberCustomaryZip: normalizedZip,
      memberCustomaryCounty: normalizedCounty,
      Authorization_Number_T038: row.authorizationNumberT2038 || '',
      Authorization_Start_T2038: row.authorizationStartT2038 || '',
      Authorization_End_T2038: row.authorizationEndT2038 || '',
      Diagnostic_Code: row.diagnosticCode || '',
      careManagerName: row.careManagerName || '',
      careManagerPhone: row.careManagerPhone || '',
      careManagerEmail: row.careManagerEmail || '',
      contactFirstName: emergencyContact.contactFirstName,
      contactLastName: emergencyContact.contactLastName,
      contactPhone: emergencyContact.contactPhone,
      contactEmail: emergencyContact.contactEmail,
      contactRelationship: emergencyContact.contactRelationship,
      eligibilityCheckStatus: normalizeEligibilityStatus(row.eligibilityCheckStatus),
      kaiserStatus: row.kaiserStatus || '',
      notes,
    }));
    if (!options?.silent) {
      const countyUndetermined = isCountyUndetermined({
        city: normalizedCity,
        zip: normalizedZip,
        county: normalizedCounty,
      });
      toast({
        title: countyUndetermined ? 'County cannot be determined' : 'Member loaded into form',
        description: countyUndetermined
          ? COUNTY_UNDETERMINED_MESSAGE
          : `${row.memberFirstName || ''} ${row.memberLastName || ''}`.trim() +
            (normalizedZip ? ` • ZIP ${normalizedZip}` : ''),
        variant: countyUndetermined ? 'destructive' : 'default',
      });
    }
  };

  const parsePickedIlsRowToForm = () => {
    const pickedById = ilsImportRows.find((row) => row.rowId === pickedIlsRowId) || null;
    const firstChecked = ilsImportRows.find((row) => Boolean(ilsImportSelected[row.rowId])) || null;
    const targetRow = pickedById || firstChecked;
    if (!targetRow) {
      toast({
        title: 'No row picked',
        description: 'Pick a spreadsheet row first, then click Parse Picked Row.',
        variant: 'destructive',
      });
      return;
    }
    if (isIlsRowCreated(targetRow)) {
      toast({
        title: 'Row already created',
        description: 'This row already has a skeleton application and is locked from re-picking.',
      });
      return;
    }
    setPickedIlsRowId(targetRow.rowId);
    populateMemberDataFromIlsRow(targetRow);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formattedPhone = formatPhoneDashed(e.currentTarget.value || '');
    setMemberData((prev) => ({ ...prev, contactPhone: formattedPhone }));
  };

  useEffect(() => {
    const current = String(memberData.contactPhone || '');
    const formatted = formatPhoneDashed(current);
    if (formatted !== current) {
      setMemberData((prev) => ({ ...prev, contactPhone: formatted }));
    }
  }, [memberData.contactPhone]);

  const formatMemberPhoneWithDashes = (value: string) => {
    const phoneNumber = value.replace(/\D/g, '');
    const limitedPhoneNumber = phoneNumber.substring(0, 10);
    if (limitedPhoneNumber.length <= 3) return limitedPhoneNumber;
    if (limitedPhoneNumber.length <= 6) {
      return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3)}`;
    }
    return `${limitedPhoneNumber.substring(0, 3)}-${limitedPhoneNumber.substring(3, 6)}-${limitedPhoneNumber.substring(6)}`;
  };

  const parseServiceRequestPdfAndApply = async (fileOverride?: File | null) => {
    const targetFile = fileOverride instanceof File ? fileOverride : serviceRequestFile;
    if (!targetFile) {
      toast({ title: 'No PDF selected', description: 'Choose a Service Request Form PDF first.', variant: 'destructive' });
      return;
    }
    
    // Create abort controller for this parse operation
    parseAbortControllerRef.current = new AbortController();
    
    setIsParsingServiceRequest(true);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestParseMode('none');
    try {
      const pdfjs = await loadPdfJs();
      const bytes = await targetFile.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true });
      const pdf = await loadingTask.promise;
      const lines: string[] = [];
      const warnings: string[] = [];
      const maxPagesForText = Math.min(pdf.numPages, 8);
      if (pdf.numPages > maxPagesForText) warnings.push(`Parsed first ${maxPagesForText} pages.`);

      for (let pageNum = 1; pageNum <= maxPagesForText; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const tc = await page.getTextContent();
        const items = (tc.items || []) as Array<any>;
        const rows: Array<{ str: string; x: number; y: number }> = [];
        for (const it of items) {
          const str = String(it?.str || '').trim();
          if (!str) continue;
          const tr = it?.transform || [];
          const x = Number(tr?.[4] ?? 0);
          const y = Number(tr?.[5] ?? 0);
          rows.push({ str, x, y });
        }
        const byY = new Map<number, Array<{ str: string; x: number }>>();
        for (const row of rows) {
          const yk = Math.round(row.y);
          const arr = byY.get(yk) || [];
          arr.push({ str: row.str, x: row.x });
          byY.set(yk, arr);
        }
        const yKeys = Array.from(byY.keys()).sort((a, b) => b - a);
        for (const yk of yKeys) {
          const parts = (byY.get(yk) || []).sort((a, b) => a.x - b.x).map((p) => p.str);
          const line = parts.join(' ').replace(/\s{2,}/g, ' ').trim();
          if (line) lines.push(line);
        }
      }

      const text = lines.join('\n').trim();
      setServiceRequestTextPreview(text ? text.slice(0, 8000) : '');

      if (!text) {
        // No text layer - use vision API with browser-based image conversion
        toast({
          title: 'Scanned PDF detected',
          description: 'Using AI vision to extract fields...',
          variant: 'default',
        });

        // Convert PDF page to image in browser
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });

        // Send image to vision API
        const formData = new FormData();
        formData.append('image', blob, 'page.png');

        const response = await fetch('/api/admin/parse-service-request-vision', {
          method: 'POST',
          body: formData,
          signal: parseAbortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({} as any));
          const errorMessage = String(errorData?.error || 'Vision parsing failed').trim();
          const errorDetails = String(errorData?.details || '').trim();
          const combinedMessage = errorDetails
            ? `${errorMessage} ${errorDetails}`
            : errorMessage;
          throw new Error(combinedMessage);
        }

        const visionResult = await response.json();
        const updates = visionResult.fields;
        const parsedFieldKeys = visionResult.parsedFieldKeys;
        const visionWarnings = visionResult.warnings || [];

        if (parsedFieldKeys.length === 0) {
          setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
          setServiceRequestWarnings(visionWarnings);
          setServiceRequestParseMode('vision');
          toast({
            title: 'No fields extracted',
            description: 'Could not extract fields from scanned PDF. Please enter data manually.',
            variant: 'default',
          });
          return;
        }

        const normalizedPatch = normalizeMemberPatch(updates as Record<string, unknown>);
        const sanitizedPatch = withInferredCountyFromAddress(
          withoutCurrentAddressPrefill({ ...normalizedPatch, contactEmail: '' })
        );
        const countyUndetermined = isCountyUndetermined({
          city: sanitizedPatch.memberCustomaryCity,
          zip: sanitizedPatch.memberCustomaryZip,
          county: sanitizedPatch.memberCustomaryCounty,
        });
        if (countyUndetermined) visionWarnings.push(COUNTY_UNDETERMINED_MESSAGE);
        const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
        setSingleAuthContactPreview(contactPreview);
        setMemberData((prev) => ({
          ...prev,
          ...sanitizedPatch,
          notes: mergeAdminNotes(prev.notes, sanitizedPatch.notes),
        }));
        setServiceRequestParsedFields(parsedFieldKeys);
        setServiceRequestWarnings(visionWarnings);
        setServiceRequestParseMode('vision');
        void checkParsedIdentityAgainstMifAndCaspio({
          memberFirstName: String(sanitizedPatch.memberFirstName || ''),
          memberLastName: String(sanitizedPatch.memberLastName || ''),
          memberMrn: String(sanitizedPatch.memberMrn || ''),
          memberMediCalNum: String(sanitizedPatch.memberMediCalNum || ''),
        });
        toast({
          title: countyUndetermined ? 'County cannot be determined' : 'Service request parsed (Vision)',
          description: countyUndetermined
            ? `${parsedFieldKeys.length} field(s) autofilled. ${COUNTY_UNDETERMINED_MESSAGE}`
            : `Autofilled ${parsedFieldKeys.length} field(s) using AI vision.`,
          variant: countyUndetermined ? 'destructive' : 'default',
        });
        return;
      }

      const parsed = extractServiceRequestFields({ text, fileName: targetFile.name });
      const updates = parsed.updates;
      const parsedFieldKeys = parsed.parsedFields;
      warnings.push(...parsed.warnings);

      if (parsedFieldKeys.length === 0) {
        setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
        setServiceRequestWarnings(warnings);
        setServiceRequestParseMode('text');
        toast({
          title: 'No autofill fields found',
          description: warnings[0] || 'No matching fields were found. You can continue entering data manually.',
          variant: 'default',
        });
        return;
      }

      const normalizedPatch = normalizeMemberPatch(updates as Record<string, unknown>);
      const sanitizedPatch = withInferredCountyFromAddress(
        withoutCurrentAddressPrefill({ ...normalizedPatch, contactEmail: '' })
      );
      const countyUndetermined = isCountyUndetermined({
        city: sanitizedPatch.memberCustomaryCity,
        zip: sanitizedPatch.memberCustomaryZip,
        county: sanitizedPatch.memberCustomaryCounty,
      });
      if (countyUndetermined) warnings.push(COUNTY_UNDETERMINED_MESSAGE);
      const contactPreview = extractSingleAuthContactPreview(sanitizedPatch);
      setSingleAuthContactPreview(contactPreview);
      setMemberData((prev) => ({
        ...prev,
        ...sanitizedPatch,
        notes: mergeAdminNotes(prev.notes, sanitizedPatch.notes),
      }));
      setServiceRequestParsedFields(parsedFieldKeys);
      setServiceRequestWarnings(warnings);
      setServiceRequestParseMode('text');
      void checkParsedIdentityAgainstMifAndCaspio({
        memberFirstName: String(sanitizedPatch.memberFirstName || ''),
        memberLastName: String(sanitizedPatch.memberLastName || ''),
        memberMrn: String(sanitizedPatch.memberMrn || ''),
        memberMediCalNum: String(sanitizedPatch.memberMediCalNum || ''),
      });
      toast({
        title: countyUndetermined ? 'County cannot be determined' : 'Service request parsed',
        description: countyUndetermined
          ? `${parsedFieldKeys.length} field(s) autofilled. ${COUNTY_UNDETERMINED_MESSAGE}`
          : `Autofilled ${parsedFieldKeys.length} field(s) from PDF text.`,
        variant: countyUndetermined ? 'destructive' : 'default',
      });
    } catch (error: any) {
      // Check if it was aborted
      if (error.name === 'AbortError') {
        toast({
          title: 'Parsing cancelled',
          description: 'PDF parsing was stopped.',
          variant: 'default',
        });
        return;
      }
      
      const safeMessage = String(error?.message || 'Could not parse Service Request PDF.');
      const lowerMessage = safeMessage.toLowerCase();
      const isFetchError =
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('networkerror') ||
        lowerMessage.includes('load failed') ||
        lowerMessage.includes('could not load pdf parser');
      const isVisionQuotaError =
        lowerMessage.includes('credits') ||
        lowerMessage.includes('quota') ||
        lowerMessage.includes('too many requests') ||
        lowerMessage.includes('vision parsing is temporarily unavailable');
      // Avoid logging raw Error objects in dev overlay, which can appear as unhandled runtime errors.
      console.warn('Service request parse failed:', safeMessage);
      if (isVisionQuotaError) {
        setServiceRequestWarnings((prev) => [
          ...prev,
          'Vision parser credits/quota are currently unavailable. Please enter fields manually for now.',
        ]);
      }
      toast({
        title: isVisionQuotaError
          ? 'Vision parsing unavailable'
          : isFetchError
            ? 'Parse network error'
            : 'Parse failed',
        description: isVisionQuotaError
          ? 'Gemini vision credits/quota are currently unavailable. Enter fields manually and continue, or retry later.'
          : isFetchError
            ? 'Could not reach the PDF parser or vision API. Hard-refresh the page, confirm the app is running, then try Parse again.'
            : safeMessage,
        variant: 'destructive',
      });
    } finally {
      setIsParsingServiceRequest(false);
      parseAbortControllerRef.current = null;
    }
  };

  const clearServiceRequestFile = () => {
    resetAllCreateFields();
  };

  const buildIlsDecisionPreviewDraft = (row: KaiserIlsImportRow, choice: IlsDecisionChoice): IlsDecisionPreviewDraft => {
    const memberName = `${String(row.memberFirstName || '').trim()} ${String(row.memberLastName || '').trim()}`.trim() || 'Unknown Member';
    const memberMrn = String(row.memberMrn || '').trim();
    const memberCounty = String(row.memberCounty || '').trim();
    const memberClientId = String(row.clientId2 || row.caspioMatchedClientId2 || '').trim();
    const subject = buildIlsDecisionSubject(memberName, memberMrn || 'N/A');
    const emailBodyText = buildIlsDecisionTextBody({
      choice,
      memberName,
      memberMrn: memberMrn || 'N/A',
      memberCounty: memberCounty || 'N/A',
    });
    return {
      rowId: row.rowId,
      choice,
      memberName,
      memberMrn,
      memberCounty,
      memberClientId,
      recipients: [...ILS_DECISION_RECIPIENTS],
      subject,
      emailBodyText,
      customText: '',
      idempotencyKey:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
  };

  const openIlsServiceDecisionPreview = (row: KaiserIlsImportRow, choice: IlsDecisionChoice) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setPendingIlsDecisionDraft(buildIlsDecisionPreviewDraft(row, choice));
  };

  const openSingleAuthIlsServiceDecisionPreview = (choice: IlsDecisionChoice) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    const memberName =
      `${String(memberData.memberFirstName || '').trim()} ${String(memberData.memberLastName || '').trim()}`.trim();
    if (!memberName) {
      toast({
        variant: 'destructive',
        title: 'Member name required',
        description: 'Parse the single-auth PDF (or fill first/last name) before Decline to ILS.',
      });
      return;
    }
    const syntheticRow = {
      rowId: 'single_auth_form',
      memberFirstName: String(memberData.memberFirstName || '').trim(),
      memberLastName: String(memberData.memberLastName || '').trim(),
      memberMrn: String(memberData.memberMrn || '').trim(),
      memberCounty: String(memberData.memberCustomaryCounty || '').trim(),
      clientId2: String((memberData as any).clientId2 || (memberData as any).client_ID2 || '').trim(),
      caspioMatchedClientId2: '',
      sourceType: 'single_auth_pdf',
      sourceFileName: String(serviceRequestFile?.name || serviceRequestFiles[0]?.name || ''),
    } as KaiserIlsImportRow;
    setPendingIlsDecisionDraft(buildIlsDecisionPreviewDraft(syntheticRow, choice));
  };

  const sendIlsServiceDecision = async (draft: IlsDecisionPreviewDraft) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in and retry.', variant: 'destructive' });
      return;
    }
    setSendingIlsDecisionRowId(draft.rowId);
    try {
      const idToken = await user.getIdToken();
      const importRow = ilsImportRows.find((entry) => entry.rowId === draft.rowId);
      const isSingleAuthForm = draft.rowId === 'single_auth_form';
      const response = await fetch('/api/admin/ils-service-delivery-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rowId: draft.rowId,
          sourceType: isSingleAuthForm
            ? 'single_auth_pdf'
            : (importRow?.sourceType as string) || '',
          sourceFileName: isSingleAuthForm
            ? String(serviceRequestFile?.name || serviceRequestFiles[0]?.name || '')
            : String(importRow?.sourceFileName || ''),
          memberName: draft.memberName,
          memberMrn: draft.memberMrn,
          memberCounty: draft.memberCounty,
          memberClientId: draft.memberClientId,
          choice: draft.choice,
          emailSubject: draft.subject,
          emailBodyText: draft.emailBodyText,
          customText: draft.customText,
          idempotencyKey: draft.idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `Failed to send decision email (HTTP ${response.status})`));
      }
      const log = (body?.log || {}) as any;
      const sentAtIso = String(log?.createdAtIso || new Date().toISOString());
      const sentBy = String(log?.actedByName || user.displayName || user.email || 'Staff').trim();
      const decisionState: IlsDecisionLogState = {
        choice: draft.choice,
        sentAtIso,
        sentBy,
        logId: String(log?.id || ''),
      };
      setIlsDecisionLogByRowId((prev) => ({
        ...prev,
        [draft.rowId]: decisionState,
      }));
      if (isSingleAuthForm) {
        setSingleAuthIlsDecisionLog(decisionState);
      }
      if (draft.choice === 'decline' && firestore) {
        try {
          await markIlsMifMemberServiceDeclined(firestore, {
            memberFirstName: isSingleAuthForm
              ? String(memberData.memberFirstName || '').trim()
              : String(importRow?.memberFirstName || '').trim(),
            memberLastName: isSingleAuthForm
              ? String(memberData.memberLastName || '').trim()
              : String(importRow?.memberLastName || '').trim(),
            memberMrn: draft.memberMrn,
            memberMediCalNum: isSingleAuthForm
              ? String(memberData.memberMediCalNum || '').trim()
              : String(importRow?.memberMediCalNum || '').trim(),
            memberDob: isSingleAuthForm
              ? String(memberData.memberDob || '').trim()
              : String(importRow?.memberDob || '').trim(),
            clientId2: draft.memberClientId,
            memberCounty: draft.memberCounty,
            ilsMifDedupeKey: importRow
              ? resolveIlsMifDedupeKey(importRow, buildIlsMifDedupeKey(importRow))
              : undefined,
            sourceType: isSingleAuthForm
              ? 'single_auth_pdf'
              : String(importRow?.sourceType || 'create_app_ils_import'),
            sourceFileName: isSingleAuthForm
              ? String(serviceRequestFile?.name || serviceRequestFiles[0]?.name || '')
              : String(importRow?.sourceFileName || ''),
            emailSubject: draft.subject,
            emailBodyText: draft.emailBodyText,
            customText: draft.customText,
            decisionLogId: decisionState.logId,
            actorEmail: user.email || '',
            actorUid: user.uid || '',
            to: [...ILS_DECISION_TO],
            cc: [...ILS_DECISION_CC],
          });
        } catch (declinePersistError) {
          console.warn('Declined member list write failed after ILS email:', declinePersistError);
        }
      }
      setPendingIlsDecisionDraft(null);
      toast({
        title: draft.choice === 'accept' ? 'Accepted update sent' : 'Declined update sent',
        description:
          draft.choice === 'decline'
            ? `${draft.memberName} (${draft.memberCounty || 'County N/A'}) was emailed to ILS and will show as Denied on MIF consolidator monthly updates.`
            : `${draft.memberName} (${draft.memberCounty || 'County N/A'}) was logged and emailed to ILS recipients.`,
      });
    } catch (error: any) {
      toast({
        title: 'Decision send failed',
        description: String(error?.message || 'Could not send decision email.'),
        variant: 'destructive',
      });
    } finally {
      setSendingIlsDecisionRowId('');
    }
  };

  const resetAllCreateFields = () => {
    setMemberData(getEmptyMemberData());
    setSelectedAssignedStaffId('');
    setSelectedAssignedStaffName('');
    setSelectedStaffActionItemCount(0);
    setEligibilityScreenshotFiles([]);
    setServiceRequestFile(null);
    setServiceRequestFiles([]);
    setServiceRequestParsedFields([]);
    setServiceRequestWarnings([]);
    setServiceRequestTextPreview('');
    setIlsRowEligibilityFiles({});
    setIlsRowDuplicateMatches({});
    setCheckingRowDuplicates({});
    setIlsDecisionLogByRowId({});
    setPendingIlsDecisionDraft(null);
    setSingleAuthIlsDecisionLog(null);
    setHasMifCaspioRefresh(false);
    setMifLastCaspioRefreshAtIso('');
    setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
    setIlsSpreadsheetFileName('');
    setIlsImportRows([]);
    setIlsImportSelected({});
    setPickedIlsRowId('');
    setActiveSpreadsheetUploadLogId('');
    setShowOnlyNotInCaspio(false);
    setLastCreatedSkeleton(null);
    setIntroEmailDraft(null);
    parsedSingleAuthFilesRef.current = {};
    if (serviceRequestFileInputRef.current) {
      serviceRequestFileInputRef.current.value = '';
    }
    if (ilsSpreadsheetInputRef.current) {
      ilsSpreadsheetInputRef.current.value = '';
    }
    toast({
      title: 'Form reset',
      description: 'All entered fields were cleared so you can start over.',
    });
  };

  const hasValidMemberName = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    const lowered = normalized.toLowerCase();
    return !['undefined', 'null', 'nan'].includes(lowered);
  };

  const hasRequiredMemberName = hasValidMemberName(memberData.memberFirstName) && hasValidMemberName(memberData.memberLastName);
  const isKaiserAuthReceivedIntake = intakeType === 'kaiser_auth_received_via_ils';
  const countyCannotBeDetermined = isCountyUndetermined({
    city: memberData.memberCustomaryCity,
    zip: memberData.memberCustomaryZip,
    county: memberData.memberCustomaryCounty,
  });
  const notifyCountyUndetermined = (params: { city?: unknown; zip?: unknown; county?: unknown }) => {
    if (!String(params.zip || '').trim()) return;
    if (!isCountyUndetermined(params)) return;
    toast({
      title: 'County cannot be determined',
      description: COUNTY_UNDETERMINED_MESSAGE,
      variant: 'destructive',
    });
  };
  const hasPrimaryContactComplete =
    Boolean(memberData.contactFirstName && memberData.contactLastName && memberData.contactPhone && memberData.contactEmail) &&
    String(memberData.contactPhone || '').replace(/\D/g, '').length === 10;
  const createApplicationForMember = async (options?: { skipNavigate?: boolean; suppressSuccessToast?: boolean }) => {
    const isKaiserAuthReceived = isKaiserAuthReceivedIntake;
    const hasRequiredCreateInputs = isKaiserAuthReceived ? true : (hasRequiredMemberName && hasPrimaryContactComplete);
    const submittingStaff = getSubmittingStaffIdentity(user);

    if (!firestore || !hasRequiredCreateInputs) {
      toast({
        title: "Missing Information",
        description: isKaiserAuthReceived
          ? "Please complete required draft fields before creating the Kaiser auth draft."
          : "Please fill member name and primary contact name, phone, and email before creating the draft application.",
        variant: "destructive",
      });
      return null;
    }

    let ilsConsolidatorRunId = '';
    let ilsMifDedupeKeyForApp = '';
    let ilsPickedRowIdForLock = '';

    if (isKaiserAuthReceived) {
      const pickedRow = ilsImportRows.find((row) => row.rowId === pickedIlsRowId);
      const identity = {
        memberFirstName: String(memberData.memberFirstName || pickedRow?.memberFirstName || '').trim(),
        memberLastName: String(memberData.memberLastName || pickedRow?.memberLastName || '').trim(),
        memberMrn: String(memberData.memberMrn || pickedRow?.memberMrn || '').trim(),
        memberMediCalNum: String(memberData.memberMediCalNum || pickedRow?.memberMediCalNum || '').trim(),
        clientId2: String(pickedRow?.clientId2 || '').trim(),
      };
      const dedupeKey = resolveIlsMifDedupeKey(
        {
          ...identity,
          memberDob: String(memberData.memberDob || pickedRow?.memberDob || ''),
        },
        pickedRow ? buildIlsMifDedupeKey(pickedRow) : ''
      );
      ilsConsolidatorRunId = String(
        selectedConsolidatorRunId || searchParams.get('consolidatorRunId') || ''
      ).trim();
      ilsMifDedupeKeyForApp = dedupeKey;
      ilsPickedRowIdForLock = String(pickedRow?.rowId || '').trim();

      if (pickedRow && isIlsRowCreated(pickedRow)) {
        toast({
          variant: 'destructive',
          title: 'Already has a skeleton',
          description: `This row already has application ${pickedRow.applicationId || ''}.`,
        });
        return null;
      }

      // Live Caspio re-check (row flag can be stale after handoff).
      let liveCaspioHit = Boolean(pickedRow?.caspioExists);
      let liveNeedsAuthorizedUpdate = Boolean(pickedRow?.needsAuthorizedUpdate);
      let liveCaspioCalAIMStatus = String(pickedRow?.caspioCalAIMStatus || '');
      let annotatedProbe: KaiserIlsImportRow | undefined;
      try {
        const probeRow = (pickedRow ||
          ({
            rowId: 'form-probe',
            sourceType: 'spreadsheet',
            sourceFileName: '',
            memberFirstName: identity.memberFirstName,
            memberLastName: identity.memberLastName,
            memberMrn: identity.memberMrn,
            memberMediCalNum: identity.memberMediCalNum,
            memberDob: String(memberData.memberDob || ''),
            memberSex: '',
            clientId2: identity.clientId2,
            memberAddress: '',
            memberCity: '',
            memberZip: '',
            memberState: '',
            memberCounty: '',
            memberPhone: '',
            memberEmail: '',
            contactPhone: '',
            contactEmail: '',
            referringOrganization: '',
            emergencyContactName: '',
            emergencyContactRelationship: '',
            emergencyContactPhone: '',
            emergencyContactEmail: '',
            careManagerName: '',
            careManagerPhone: '',
            careManagerEmail: '',
            eligibilityCheckStatus: 'Pending',
            authorizationNumberT2038: '',
            authorizationStartT2038: '',
            authorizationEndT2038: '',
            kaiserStatus: '',
            dateReceivedRequestForAuthorization: '',
            dateOfReferralAuthorizationDecision: '',
            cptCode: '',
            diagnosticCode: '',
            assignedStaffId: '',
            assignedStaffName: '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
          } as KaiserIlsImportRow));
        const [probeResult] = await annotateRowsWithCaspioExists([probeRow]);
        annotatedProbe = probeResult;
        liveCaspioHit = Boolean(annotatedProbe?.caspioExists);
        liveNeedsAuthorizedUpdate = Boolean(annotatedProbe?.needsAuthorizedUpdate);
        liveCaspioCalAIMStatus = String(annotatedProbe?.caspioCalAIMStatus || '');
        if (liveCaspioHit && pickedRow) {
          setIlsImportRows((prev) =>
            prev.map((row) =>
              row.rowId === pickedRow.rowId
                ? {
                    ...row,
                    caspioExists: true,
                    caspioMatchLabel: annotatedProbe?.caspioMatchLabel || row.caspioMatchLabel,
                    caspioMatchedClientId2:
                      annotatedProbe?.caspioMatchedClientId2 || row.caspioMatchedClientId2,
                    caspioMatchedBy: annotatedProbe?.caspioMatchedBy || row.caspioMatchedBy,
                    caspioCalAIMStatus: liveCaspioCalAIMStatus || row.caspioCalAIMStatus,
                    needsAuthorizedUpdate: liveNeedsAuthorizedUpdate,
                    statusNote: annotatedProbe?.statusNote || row.statusNote,
                  }
                : row
            )
          );
        }
      } catch (liveCaspioError) {
        console.warn('Live Caspio check failed during skeleton create:', liveCaspioError);
      }

      let existingAppHit: Awaited<ReturnType<typeof findExistingApplicationsForMember>> = [];
      try {
        existingAppHit = await findExistingApplicationsForMember(firestore, {
          memberMrn: identity.memberMrn,
          memberMediCalNum: identity.memberMediCalNum,
        });
      } catch (existingAppError) {
        console.warn('Existing application check failed during skeleton create:', existingAppError);
      }

      let declinedHit = false;
      let declinedMatchCounty = '';
      try {
        const declinedSnap = await getDocs(collection(firestore, ILS_MIF_DECLINED_COLLECTION));
        declinedSnap.forEach((docSnap) => {
          if (declinedHit) return;
          const data = docSnap.data() as any;
          const key =
            docSnap.id === dedupeKey
              ? dedupeKey
              : resolveIlsMifDedupeKey({
                  clientId2: String(data.clientId2 || ''),
                  memberMrn: String(data.memberMrn || ''),
                  memberMediCalNum: String(data.memberMediCalNum || ''),
                  memberFirstName: String(data.memberFirstName || ''),
                  memberLastName: String(data.memberLastName || ''),
                  memberDob: String(data.memberDob || ''),
                });
          if (!key || key !== dedupeKey) return;
          declinedHit = true;
          declinedMatchCounty = String(data.memberCounty || '').trim();
        });
      } catch (error) {
        console.warn('Declined-list check failed during skeleton create:', error);
      }

      // Sacramento (and other served counties) must never be blocked as “northern decline”.
      // Members may still appear on the declined list from older bulk declines that wrongly included Sacramento.
      const formCity = String((memberData as any)?.memberCustomaryCity || pickedRow?.memberCity || '').trim();
      const formCounty =
        String((memberData as any)?.memberCustomaryCounty || '').trim() ||
        String((memberData as any)?.memberCounty || '').trim() ||
        String(pickedRow?.memberCounty || '').trim() ||
        String(findCountyByCity(formCity) || '').trim();
      if (
        declinedHit &&
        (isIlsServedCounty(formCounty) ||
          isIlsServedCounty(declinedMatchCounty) ||
          isIlsServedCounty(findCountyByCity(formCity)))
      ) {
        declinedHit = false;
        toast({
          title: 'Sacramento member — create allowed',
          description:
            'This member was on an older Northern decline list, but Sacramento is in our service area. Continuing skeleton create.',
        });
      } else if (declinedHit && !formCounty && !declinedMatchCounty) {
        const proceedSacramento = await appConfirm(
          `This member is on the Northern California declined list, but county is blank on the form.\n\n` +
            `Sacramento County is in our service area and must not be blocked.\n\n` +
            `Create the skeleton anyway because this member is in Sacramento (or another served county)?`
        );
        if (proceedSacramento) {
          declinedHit = false;
        }
      }

      const caspioHit = liveCaspioHit;
      const { samePersonMatches, differentNameMatches } = partitionExistingApplicationMatches(existingAppHit, {
        memberFirstName: identity.memberFirstName,
        memberLastName: identity.memberLastName,
      });
      const alreadyInApp = samePersonMatches.length > 0;
      // Being on the consolidated MIF master is expected (most new apps are MIF members not yet in Caspio).
      // Still look up the master so the form can prefer MIF fields — but do not warn or block create.
      try {
        const liveMif = await lookupIdentityOnMifMaster({
          ...identity,
          memberDob: String(memberData.memberDob || pickedRow?.memberDob || ''),
        });
        if (liveMif.exists) {
          setSingleAuthMifMasterHit((prev) => ({
            exists: true,
            matchLabel: liveMif.matchLabel,
            matchedBy: liveMif.matchedBy,
            runLabel: liveMif.runLabel,
            caspioExists: Boolean(prev?.caspioExists || liveCaspioHit),
            caspioMatchLabel: prev?.caspioMatchLabel || '',
            alreadyInApp: Boolean(prev?.alreadyInApp || alreadyInApp),
            existingApplicationIds: prev?.existingApplicationIds || samePersonMatches.map((m) => m.applicationId),
            existingApplicationLabels:
              prev?.existingApplicationLabels ||
              samePersonMatches.map((m) => formatExistingApplicationMatchLabel(m)),
            mrnNameConflict: Boolean(prev?.mrnNameConflict || differentNameMatches.length > 0),
            mrnNameConflictIds: prev?.mrnNameConflictIds || differentNameMatches.map((m) => m.applicationId),
            mrnNameConflictLabels:
              prev?.mrnNameConflictLabels ||
              differentNameMatches.map((m) => formatExistingApplicationMatchLabel(m)),
          }));
        }
      } catch (liveMifError) {
        console.warn('Live MIF master check failed during skeleton create:', liveMifError);
      }

      if (declinedHit || alreadyInApp) {
        const blockReason = alreadyInApp
          ? `already has application ${samePersonMatches[0]?.applicationId || ''}`
          : 'declined Northern CA';
        try {
          await addIlsMifAuditDoc(firestore, {
            action: 'skeleton_create_blocked',
            summary: `Blocked skeleton create for ${identity.memberLastName}, ${identity.memberFirstName} (${blockReason})`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            caspioHit,
            declinedHit,
            alreadyInApp,
            existingApplicationIds: samePersonMatches.map((m) => m.applicationId),
            memberMrn: identity.memberMrn,
          });
        } catch {
          // ignore audit failure
        }
        toast({
          variant: 'destructive',
          title: alreadyInApp ? 'Already in Applications' : 'Declined to serve (Northern CA)',
          description: alreadyInApp
            ? `An application already exists for this MRN/CIN (${samePersonMatches
                .slice(0, 3)
                .map((m) => formatExistingApplicationMatchLabel(m))
                .join('; ')}${samePersonMatches.length > 3 ? '…' : ''}). Open that app from the link in the duplicate warning, or delete it if it was a bad skeleton.`
            : 'This member is on the Northern California declined list. Skeleton create is blocked.',
        });
        return null;
      }

      if (differentNameMatches.length > 0) {
        const conflictLabel = differentNameMatches
          .slice(0, 2)
          .map((m) => formatExistingApplicationMatchLabel(m))
          .join('; ');
        const proceedDespiteNameConflict = await appConfirm(
          `The parsed MRN/CIN also appears on a differently named application:\n\n${conflictLabel}\n\n` +
            `Incoming member: ${identity.memberFirstName} ${identity.memberLastName}\n` +
            `MRN: ${identity.memberMrn || '—'} · Medi-Cal/CIN: ${identity.memberMediCalNum || '—'}\n\n` +
            `This is usually a bad PDF parse or wrong MRN on file — not the same person.\n\n` +
            `Create a skeleton for ${identity.memberFirstName} ${identity.memberLastName} anyway?`
        );
        if (!proceedDespiteNameConflict) {
          toast({
            title: 'Skeleton create cancelled',
            description: 'Fix the MRN/CIN on the form if needed, then try again.',
          });
          return null;
        }
      }

      if (caspioHit) {
        const proceed = await appConfirm(
          `This member already exists in Caspio` +
            (liveNeedsAuthorizedUpdate || isIlsMifCaspioPendingStatus(liveCaspioCalAIMStatus)
              ? ` with CalAIM_Status Pending — new auth may need a Caspio update`
              : liveCaspioCalAIMStatus
                ? ` (CalAIM_Status: ${liveCaspioCalAIMStatus})`
                : '') +
            `.\n\nCreate a skeleton application anyway?`
        );
        if (!proceed) {
          try {
            await addIlsMifAuditDoc(firestore, {
              action: 'skeleton_create_caspio_cancelled',
              summary: `Cancelled skeleton create for ${identity.memberLastName}, ${identity.memberFirstName} (already in Caspio)`,
              atIso: new Date().toISOString(),
              atServer: serverTimestamp(),
              actor: user?.email || user?.uid || '',
              caspioHit: true,
              needsAuthorizedUpdate: liveNeedsAuthorizedUpdate,
              caspioCalAIMStatus: liveCaspioCalAIMStatus,
              memberMrn: identity.memberMrn,
            });
          } catch {
            // ignore audit failure
          }
          toast({
            title: 'Skeleton create cancelled',
            description: 'Member is already in Caspio. No skeleton was created.',
          });
          return null;
        }
      }
    }

    setIsCreating(true);
    try {
      // Create a unique application ID for this member
      const applicationId = `admin_app_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const applicationRef = doc(firestore, 'applications', applicationId);
      
      const ilsReferrerName = parseMemberName(memberData.careManagerName || '');
      const ilsReferrerFirstName = ilsReferrerName.firstName || '';
      const ilsReferrerLastName = ilsReferrerName.lastName || '';
      // Referrer = referring individual (care manager), not primary/emergency contact.
      const ilsReferrerEmail = memberData.careManagerEmail || '';
      const ilsReferrerPhone =
        memberData.careManagerPhone || memberData.memberPhone || '';

      // Create the application document with initial member and contact information.
      // Always write CS Summary form field names so the form hydrates MRN/DOB/etc.
      // when staff already entered them at create time (or from ILS/MIF intake).
      const baseApplication: Record<string, unknown> = {
        // Member information
        memberFirstName: memberData.memberFirstName,
        memberLastName: memberData.memberLastName,
        memberMrn: memberData.memberMrn || '',
        confirmMemberMrn: memberData.memberMrn || '',
        memberMediCalNum: memberData.memberMediCalNum || '',
        confirmMemberMediCalNum: memberData.confirmMemberMediCalNum || memberData.memberMediCalNum || '',
        sex: memberData.memberSex || '',
        memberSex: memberData.memberSex || '',
        memberDob: memberData.memberDob || '',
        memberPhone: memberData.memberPhone || '',
        memberEmail: memberData.memberEmail || '',
        customaryLocationType: memberData.memberCustomaryLocation || '',
        customaryAddress: memberData.memberCustomaryAddress || '',
        customaryCity: memberData.memberCustomaryCity || '',
        customaryState: memberData.memberCustomaryState || '',
        customaryZip: memberData.memberCustomaryZip || '',
        customaryCounty: memberData.memberCustomaryCounty || '',
        // Preserve MCP single-auth / MIF address snapshot (Section 6A can refill from these).
        memberCustomaryLocation: memberData.memberCustomaryLocation || '',
        memberCustomaryAddress: memberData.memberCustomaryAddress || '',
        memberCustomaryCity: memberData.memberCustomaryCity || '',
        memberCustomaryState: memberData.memberCustomaryState || '',
        memberCustomaryZip: memberData.memberCustomaryZip || '',
        memberCustomaryCounty: memberData.memberCustomaryCounty || '',
        ...(isKaiserAuthReceived
          ? {
              careManagerName: memberData.careManagerName || '',
              careManagerPhone: memberData.careManagerPhone || '',
              careManagerEmail: memberData.careManagerEmail || '',
              Authorization_Number_T038: memberData.Authorization_Number_T038 || '',
              Authorization_Start_T2038: memberData.Authorization_Start_T2038 || '',
              Authorization_End_T2038: memberData.Authorization_End_T2038 || '',
              Diagnostic_Code: memberData.Diagnostic_Code || '',
              currentLocation: 'Unknown',
              currentAddress: 'Unknown',
              currentCity: 'Unknown',
              currentState: 'Unknown',
              currentZip: 'Unknown',
              currentCounty: 'Unknown',
              calaimTrackingStatus: String(memberData.eligibilityCheckStatus || '').trim() || 'Pending',
            }
          : {}),

        // Referrer details
        // For ILS auth intake, do not default referrer to submitting staff.
        referrerFirstName: isKaiserAuthReceived ? ilsReferrerFirstName : (submittingStaff.firstName || ''),
        referrerLastName: isKaiserAuthReceived ? ilsReferrerLastName : (submittingStaff.lastName || ''),
        referrerEmail: isKaiserAuthReceived ? ilsReferrerEmail : (submittingStaff.email || ''),
        referrerPhone: isKaiserAuthReceived ? ilsReferrerPhone : (submittingStaff.phone || memberData.contactPhone || memberData.memberPhone || ''),
        referrerRelationship: isKaiserAuthReceived ? 'ILS Referral' : 'Staff',
        agency: 'Connections Care Home Consultants',

        // Primary contact for member outreach — never fill from referral-source (care manager) email.
        isPrimaryContactSameAsReferrer: false,
        bestContactFirstName: memberData.contactFirstName || '',
        bestContactLastName: memberData.contactLastName || '',
        bestContactPhone: memberData.contactPhone || '',
        bestContactRelationship: memberData.contactRelationship || '',
        ...withNormalizedBestContactEmail(memberData.contactEmail || ''),

        intakeType,
        intakeSource: isKaiserAuthReceived
          ? (String(memberData.parsedSourceType || '').trim() === 'spreadsheet'
              ? 'ils_spreadsheet_batch'
              : 'ils_single_authorization_sheet')
          : 'family_call',
        kaiserAuthReceivedViaIls: isKaiserAuthReceived,
        kaiserAuthReceivedDate: isKaiserAuthReceived ? serverTimestamp() : null,
        ilsMifSourceFileName: isKaiserAuthReceived ? String(ilsSpreadsheetFileName || '').trim() : '',

        // Application metadata
        createdAt: serverTimestamp(),
        createdByAdmin: true,
        draftSubmittedByStaffUid: submittingStaff.uid || null,
        draftSubmittedByStaffName: submittingStaff.name || null,
        draftSubmittedByStaffEmail: submittingStaff.email || null,
        status: 'draft',
        currentStep: 1,
        adminNotes: memberData.notes,

        // Mark as incomplete - will be completed through the form
        isComplete: false,
      };

      const authReceivedForms = [
        { name: 'CS Member Summary', status: 'Pending', type: 'online-form', href: '/admin/forms/edit' },
        { name: 'Waivers & Authorizations', status: 'Pending', type: 'online-form', href: '/admin/forms/waivers' },
        { name: 'Eligibility Screenshot', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Proof of Income', status: 'Pending', type: 'Upload', href: '#' },
        { name: "LIC 602A - Physician's Report", status: 'Pending', type: 'Upload', href: LIC_602A_FORM_URL },
        { name: 'Medicine List', status: 'Pending', type: 'Upload', href: '#' },
        { name: 'Room and Board/Tier Level Agreement', status: 'Pending', type: 'Upload', href: '/forms/room-board-obligation/printable' },
      ];
      let currentAuthForms: Array<{ name: string; [key: string]: unknown }> = authReceivedForms.map((form) => ({ ...form }));
      let generatedServiceDeliveryFormUrl = '';
      let generatedServiceDeliveryFormFileName = '';
      let generatedServiceDeliveryFormFilePath = '';
      const isSingleAuthCreate =
        Boolean(serviceRequestFile) ||
        String(memberData.parsedSourceType || '').trim() === 'single_auth_pdf';

      if (isKaiserAuthReceived) {
        try {
          const emergencyContactName = [memberData.contactFirstName, memberData.contactLastName]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ');
          const spreadsheetRowLike: KaiserIlsImportRow = {
            rowId: isSingleAuthCreate ? 'manual-single-auth-parse' : 'manual-spreadsheet-parse',
            sourceType: isSingleAuthCreate ? 'single_auth_pdf' : 'spreadsheet',
            sourceFileName: isSingleAuthCreate
              ? String(serviceRequestFile?.name || 'ILS Authorization Sheet PDF').trim()
              : String(ilsSpreadsheetFileName || '').trim(),
            memberFirstName: String(memberData.memberFirstName || '').trim(),
            memberLastName: String(memberData.memberLastName || '').trim(),
            memberMrn: String(memberData.memberMrn || '').trim(),
            memberMediCalNum: String(memberData.memberMediCalNum || '').trim(),
            memberSex: String(memberData.memberSex || '').trim(),
            clientId2: '',
            memberAddress: String(memberData.memberCustomaryAddress || '').trim(),
            memberCity: String(memberData.memberCustomaryCity || '').trim(),
            memberZip: String(memberData.memberCustomaryZip || '').trim(),
            memberState: String(memberData.memberCustomaryState || '').trim(),
            memberCounty: String(memberData.memberCustomaryCounty || '').trim(),
            memberDob: String(memberData.memberDob || '').trim(),
            memberPhone: String(memberData.memberPhone || '').trim(),
            memberEmail: String(memberData.memberEmail || '').trim(),
            contactPhone: String(memberData.contactPhone || '').trim(),
            contactEmail: String(memberData.contactEmail || '').trim(),
            referringOrganization: '',
            emergencyContactName,
            emergencyContactRelationship: String(memberData.contactRelationship || '').trim(),
            emergencyContactPhone: String(memberData.contactPhone || '').trim(),
            emergencyContactEmail: String(memberData.contactEmail || '').trim(),
            careManagerName: String(memberData.careManagerName || '').trim(),
            careManagerPhone: String(memberData.careManagerPhone || '').trim(),
            careManagerEmail: String(memberData.careManagerEmail || '').trim(),
            eligibilityCheckStatus: normalizeEligibilityStatus(memberData.eligibilityCheckStatus),
            authorizationNumberT2038: String(memberData.Authorization_Number_T038 || '').trim(),
            authorizationStartT2038: String(memberData.Authorization_Start_T2038 || '').trim(),
            authorizationEndT2038: String(memberData.Authorization_End_T2038 || '').trim(),
            kaiserStatus: String(memberData.kaiserStatus || '').trim(),
            dateReceivedRequestForAuthorization: '',
            dateOfReferralAuthorizationDecision: '',
            cptCode: '',
            diagnosticCode: String(memberData.Diagnostic_Code || '').trim(),
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
            createStatus: 'idle',
            pushStatus: 'idle',
            deleteStatus: 'idle',
            statusNote: '',
            applicationId: '',
            pushedClientId2: '',
            caspioExists: false,
            caspioMatchLabel: '',
            caspioMatchedClientId2: '',
            caspioMatchedBy: '',
            mifMasterExists: false,
            mifMasterMatchLabel: '',
            mifMasterMatchedBy: '',
          };
          const serviceDeliveryForm = await createSpreadsheetServiceDeliveryPlaceholder({
            applicationId,
            row: spreadsheetRowLike,
          });
          if (serviceDeliveryForm) {
            generatedServiceDeliveryFormUrl = String(serviceDeliveryForm.downloadURL || '').trim();
            generatedServiceDeliveryFormFileName = String(serviceDeliveryForm.fileName || '').trim();
            generatedServiceDeliveryFormFilePath = String(serviceDeliveryForm.filePath || '').trim();
            currentAuthForms = [serviceDeliveryForm, ...currentAuthForms];
          }
        } catch (error) {
          console.warn(`Failed to create ${MIF_SERVICE_DELIVERY_FORM_NAME} PDF:`, error);
          toast({
            variant: 'destructive',
            title: `${MIF_SERVICE_DELIVERY_FORM_NAME} not saved`,
            description: `Skeleton was created, but the ${MIF_SERVICE_DELIVERY_FORM_NAME} PDF could not be generated. Opening the application will retry automatically.`,
          });
        }
      }

      await setDoc(applicationRef, {
        ...baseApplication,
        healthPlan: isKaiserAuthReceived ? 'Kaiser' : '',
        pathway: '',
        kaiserStatus: '',
        Kaiser_Status: '',
        kaiserPrePushStatusPickedAt: '',
        kaiserStatusSyncSource: '',
        caspioCalAIMStatus: isKaiserAuthReceived ? 'Authorized' : '',
        allowDraftCaspioPush: isKaiserAuthReceived ? true : false,
        ...(isKaiserAuthReceived
          ? {
              consolidatorRunId: ilsConsolidatorRunId || null,
              ilsMifDedupeKey: ilsMifDedupeKeyForApp || null,
            }
          : {}),
        forms: isKaiserAuthReceived ? currentAuthForms : [],
        ...(generatedServiceDeliveryFormUrl
          ? {
              serviceDeliveryForm: {
                fileName: generatedServiceDeliveryFormFileName,
                filePath: generatedServiceDeliveryFormFilePath,
                downloadURL: generatedServiceDeliveryFormUrl,
                generatedAtIso: new Date().toISOString(),
                source: 'spreadsheet_service_delivery_placeholder',
                layoutVersion: MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
              },
            }
          : {}),
        ...(isKaiserAuthReceived
          ? (selectedAssignedStaffId
              ? {
              assignedStaffId: selectedAssignedStaffId,
              assignedStaffName: selectedAssignedStaffName,
              assignedDate: new Date().toISOString(),
                }
              : {})
          : {}),
      });

      if (isKaiserAuthReceived && serviceRequestFile && storage) {
        try {
          const sourceForm = await uploadIntakeSourceFile({
            applicationId,
            file: serviceRequestFile,
            sourceLabel: 'ILS Authorization Sheet PDF',
            sourceTag: 'single_auth_pdf',
          });
          if (sourceForm) {
            currentAuthForms = [sourceForm, ...currentAuthForms];
            await setDoc(applicationRef, { forms: currentAuthForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.warn('Failed to upload single-auth source PDF:', error);
        }
      }

      if (isKaiserAuthReceived && eligibilityScreenshotFiles.length > 0) {
        try {
          const uploadedFiles = await uploadEligibilityFiles(applicationId);
          if (uploadedFiles.length > 0) {
            const completedEligibilityForm = {
              name: 'Eligibility Screenshot',
              status: 'Completed',
              type: 'Upload',
              fileName: uploadedFiles[0].fileName,
              filePath: uploadedFiles[0].filePath,
              downloadURL: uploadedFiles[0].downloadURL,
              uploadedFiles,
              dateCompleted: new Date().toISOString(),
            };
            const updatedForms = currentAuthForms.map((f) =>
              f.name === 'Eligibility Screenshot' ? completedEligibilityForm : f
            );
            currentAuthForms = updatedForms;
            await setDoc(applicationRef, { forms: updatedForms, lastUpdated: serverTimestamp() }, { merge: true });
          }
        } catch (error) {
          console.error('Eligibility screenshot upload failed:', error);
          toast({
            variant: 'destructive',
            title: 'Eligibility upload failed',
            description: 'Application was created, but eligibility screenshots failed to upload. You can upload them on the application details page.',
          });
        }
      }

      if (isKaiserAuthReceived && selectedAssignedStaffId) {
        try {
          const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
          const memberMrn = String(memberData.memberMrn || '').trim() || '—';
          const memberDob = String(memberData.memberDob || '').trim() || '—';
          const memberCounty = String(memberData.memberCustomaryCounty || '').trim() || '—';
          const mcpName = 'Kaiser';
          const pathwayName = 'SNF Transition';
          const dueDate = new Date();
          dueDate.setHours(17, 0, 0, 0);
          const assignedByName = String(user?.displayName || user?.email || 'Manager').trim();
          await addDoc(collection(firestore, 'staff_notifications'), {
            userId: selectedAssignedStaffId,
            title: `Kaiser assignment: ${memberName}`,
            message:
              `You were assigned ${memberName} in Application Pathway.\n` +
              `MRN: ${memberMrn} • DOB: ${memberDob} • County: ${memberCounty}\n` +
              `MCP: ${mcpName} • Pathway: ${pathwayName}\n` +
              (generatedServiceDeliveryFormUrl
                ? `${MIF_SERVICE_DELIVERY_FORM_NAME} PDF: ${generatedServiceDeliveryFormUrl}\n`
                : '') +
              `Next steps: (1) Confirm Caspio record created, (2) Create Google Drive member folder, (3) Upload eligibility evidence, (4) After first member/POA contact, use Application Portal in app to schedule auto-emails.`,
            memberName,
            memberMrn: memberMrn === '—' ? null : memberMrn,
            memberDob: memberDob === '—' ? null : memberDob,
            county: memberCounty === '—' ? null : memberCounty,
            mcpName,
            pathway: pathwayName,
            healthPlan: 'Kaiser',
            type: 'assignment',
            priority: 'Priority',
            status: 'Open',
            isRead: false,
            requiresStaffAction: true,
            followUpRequired: true,
            followUpDate: dueDate.toISOString(),
            senderName: assignedByName,
            assignedByUid: String(user?.uid || '').trim() || null,
            assignedByName,
            actionUrl: `/admin/applications/${applicationId}`,
            applicationId,
            source: 'application-pathway',
            timestamp: serverTimestamp(),
          });
          await sendStaffAssignmentWorkflowEmail({
            applicationId,
            appUserId: '',
            staffId: selectedAssignedStaffId,
            staffName: selectedAssignedStaffName || 'Kaiser Staff',
            memberName,
            memberMrn: memberMrn === '—' ? '' : memberMrn,
            memberCounty: memberCounty === '—' ? '' : memberCounty,
            serviceDeliveryFormUrl: generatedServiceDeliveryFormUrl,
            serviceDeliveryFormFileName: generatedServiceDeliveryFormFileName,
            serviceDeliveryFormFilePath: generatedServiceDeliveryFormFilePath,
            kaiserStatus: String(memberData.kaiserStatus || '').trim(),
            assignedBy: assignedByName,
            alreadyPushedToCaspio: Boolean(isKaiserAuthReceived && (memberData as any)?.caspioExists),
          });
        } catch (error) {
          console.warn('Failed to create initial staff assignment notification:', error);
        }
      }

      const nextTarget = isKaiserAuthReceived
        ? `/admin/applications/${applicationId}`
        : `/admin/applications/create/cs-summary?applicationId=${applicationId}`;
      if (!options?.suppressSuccessToast) {
        toast({
          title: isKaiserAuthReceived ? "Created" : "Application Created",
          description: isKaiserAuthReceived
            ? `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to Application Pathway for eligibility checks.`
            : `Application created for ${memberData.memberFirstName} ${memberData.memberLastName}. Redirecting to CS Summary form.`,
          action: (
            <ToastAction
              altText={isKaiserAuthReceived ? "Open application pathway" : "Open CS Summary form"}
              onClick={() => navigateWithHardFallback(nextTarget)}
            >
              {isKaiserAuthReceived ? 'Open Application Pathway' : 'Open CS Summary'}
            </ToastAction>
          ),
        });
      }
      const memberName = `${memberData.memberFirstName || ''} ${memberData.memberLastName || ''}`.trim() || 'Member';
      setLastCreatedSkeleton({ applicationId, memberName, clientId2: '' });
      if (isKaiserAuthReceived && ilsPickedRowIdForLock) {
        setIlsImportRows((prev) => prev.filter((row) => row.rowId !== ilsPickedRowIdForLock));
        setIlsImportSelected((prev) => {
          const next = { ...prev };
          delete next[ilsPickedRowIdForLock];
          return next;
        });
        if (pickedIlsRowId === ilsPickedRowIdForLock) setPickedIlsRowId('');
      }
      if (isKaiserAuthReceived && firestore) {
        try {
          await markIlsMifMemberSkeletonCreated(firestore, {
            memberFirstName: String(memberData.memberFirstName || '').trim(),
            memberLastName: String(memberData.memberLastName || '').trim(),
            memberMrn: String(memberData.memberMrn || '').trim(),
            memberMediCalNum: String(memberData.memberMediCalNum || '').trim(),
            memberDob: String(memberData.memberDob || '').trim(),
            consolidatorRunId: ilsConsolidatorRunId,
            ilsMifDedupeKey: ilsMifDedupeKeyForApp,
            applicationId,
            actor: user?.email || user?.uid || '',
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
          });
        } catch (skeletonSyncError) {
          console.warn('Skeleton create consolidator sync failed:', skeletonSyncError);
        }
        try {
          await addIlsMifAuditDoc(firestore, {
            action: 'skeleton_create',
            summary: `Created skeleton ${applicationId} for ${memberName}${
              selectedAssignedStaffName ? ` · assigned ${selectedAssignedStaffName}` : ''
            }`,
            atIso: new Date().toISOString(),
            atServer: serverTimestamp(),
            actor: user?.email || user?.uid || '',
            applicationId,
            memberMrn: String(memberData.memberMrn || ''),
            consolidatorRunId: ilsConsolidatorRunId || '',
            ilsMifDedupeKey: ilsMifDedupeKeyForApp || '',
            assignedStaffId: selectedAssignedStaffId || '',
            assignedStaffName: selectedAssignedStaffName || '',
          });
        } catch (auditError) {
          console.warn('Skeleton create audit write failed:', auditError);
        }
        if (ilsConsolidatorRunId) {
          void loadNewMembersFromMifMasterList(ilsConsolidatorRunId, { silent: true });
        }
      }
      setIntroEmailDraft(null);
      const shouldSkipNavigate = options?.skipNavigate ?? false;
      if (!shouldSkipNavigate) {
        navigateWithHardFallback(nextTarget);
      }
      return applicationId;
      
    } catch (error) {
      console.error('Error creating application:', error);
      toast({
        title: "Creation Error",
        description: "Failed to create application. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const familyPortalContinueLink = useMemo(() => {
    if (!lastCreatedSkeleton?.applicationId) return '';
    return `https://connectcalaim.com/pathway?applicationId=${encodeURIComponent(lastCreatedSkeleton.applicationId)}`;
  }, [lastCreatedSkeleton?.applicationId]);

  const familyPortalSignInLink = useMemo(() => {
    if (!lastCreatedSkeleton?.applicationId) return '';
    return `https://connectcalaim.com/invite/continue?applicationId=${encodeURIComponent(lastCreatedSkeleton.applicationId)}`;
  }, [lastCreatedSkeleton?.applicationId]);

  const copyToClipboard = async (label: string, value: string) => {
    const text = String(value || '').trim();
    if (!text) {
      toast({ title: `${label} unavailable`, description: 'Create a skeleton application first.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied`, description: text });
    } catch {
      toast({ title: `Copy failed`, description: `Please copy manually: ${text}`, variant: 'destructive' });
    }
  };

  const loadIntroEmailPreview = async () => {
    const applicationId = String(lastCreatedSkeleton?.applicationId || '').trim();
    if (!applicationId) {
      toast({ title: 'No skeleton application', description: 'Create a skeleton application first.' });
      return;
    }
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }
    setIsLoadingIntroEmailPreview(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          mode: 'preview',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load introductory email preview.');
      }
      setIntroEmailDraft({
        to: String(data?.draft?.to || '').trim(),
        subject: String(data?.draft?.subject || '').trim(),
        message: String(data?.draft?.message || '').trim(),
        senderFrom: String(data?.sender?.from || '').trim(),
        senderWarning: String(data?.sender?.warning || '').trim(),
        senderUsesFallbackFrom: Boolean(data?.sender?.usesFallbackFrom),
      });
      toast({
        title: 'Preview loaded',
        description: `Introductory email draft is ready for review.`,
      });
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: String(error?.message || 'Unable to load introductory email preview.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingIntroEmailPreview(false);
    }
  };

  const sendIntroductoryEmail = async () => {
    const applicationId = String(lastCreatedSkeleton?.applicationId || '').trim();
    if (!applicationId) {
      toast({ title: 'No skeleton application', description: 'Create a skeleton application first.' });
      return;
    }
    if (!introEmailDraft) {
      toast({ title: 'No preview loaded', description: 'Load an introductory email preview first.' });
      return;
    }
    if (!selectedAssignedStaffId) {
      toast({
        title: 'Assigned case manager required',
        description: 'Assign staff before sending the introductory invite.',
        variant: 'destructive',
      });
      return;
    }
    if (!user) {
      toast({ title: 'Not signed in', description: 'Please refresh and try again.', variant: 'destructive' });
      return;
    }

    const to = String(introEmailDraft.to || '').trim();
    const subject = String(introEmailDraft.subject || '').trim();
    const message = String(introEmailDraft.message || '').trim();
    if (!to || !subject || !message) {
      toast({
        title: 'Missing email content',
        description: 'Recipient, subject, and message are required before sending.',
        variant: 'destructive',
      });
      return;
    }

    setIsSendingIntroEmail(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/send-introductory-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId,
          mode: 'send',
          to,
          subject,
          message,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send introductory email.');
      }
      toast({
        title: 'Introductory email sent',
        description: `Email sent to ${to} and logged in Email Logs.`,
      });
    } catch (error: any) {
      toast({
        title: 'Send failed',
        description: String(error?.message || 'Unable to send introductory email.'),
        variant: 'destructive',
      });
    } finally {
      setIsSendingIntroEmail(false);
    }
  };

  const isFormValid = isKaiserAuthReceivedIntake ? true : (hasRequiredMemberName && hasPrimaryContactComplete);

  const hasUnsavedChanges = useMemo(() => {
    const memberDefaults = getEmptyMemberData();
    const normalizedMemberData = Object.keys(memberDefaults).reduce<Record<string, string>>((acc, key) => {
      acc[key] = String((memberData as any)?.[key] || '');
      return acc;
    }, {});
    const baseMemberData = Object.keys(memberDefaults).reduce<Record<string, string>>((acc, key) => {
      acc[key] = String((memberDefaults as any)?.[key] || '');
      return acc;
    }, {});

    const currentSnapshot = JSON.stringify({
      intakeType,
      memberData: normalizedMemberData,
      selectedAssignedStaffId: String(selectedAssignedStaffId || ''),
      selectedAssignedStaffName: String(selectedAssignedStaffName || ''),
      eligibilityScreenshotCount: eligibilityScreenshotFiles.length,
      serviceRequestFileName: serviceRequestFile?.name || '',
    });
    const initialSnapshot = JSON.stringify({
      intakeType: 'standard',
      memberData: baseMemberData,
      selectedAssignedStaffId: '',
      selectedAssignedStaffName: '',
      eligibilityScreenshotCount: 0,
      serviceRequestFileName: '',
    });
    return currentSnapshot !== initialSnapshot;
  }, [
    intakeType,
    memberData,
    selectedAssignedStaffId,
    selectedAssignedStaffName,
    eligibilityScreenshotFiles.length,
    serviceRequestFile?.name,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges || isCreating) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, isCreating]);

  useEffect(() => {
    createApplicationRef.current = createApplicationForMember;
  }, [createApplicationForMember]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;
      event.preventDefault();
      if (isCreating) return;
      if (!isFormValid) {
        toast({
          title: 'Missing Information',
          description: 'Fill required fields before creating the application.',
          variant: 'destructive',
        });
        return;
      }
      void createApplicationRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCreating, isFormValid, toast]);

  return (
    <div className="w-full px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.assign('/admin/applications');
              return;
            }
            navigateWithHardFallback('/admin/applications');
          }}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Applications
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Create Application for Member</h1>
        <p className="text-gray-600 mt-2">
          Create a CS Summary application on behalf of a member/family. This is for families who need assistance completing their application or don&apos;t have email access.
        </p>
      </div>

      {/* Information Alert */}
      <Alert className="mb-6">
        <Users className="h-4 w-4" />
        <AlertDescription>
          <strong>Admin Application Creation:</strong> Use this form when families request help completing their CalAIM application. 
          You&apos;ll provide basic member and contact information, then complete the full CS Summary form on their behalf.
        </AlertDescription>
      </Alert>

      {/* Member & Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Member & Contact Information
          </CardTitle>
          <CardDescription>
            Provide basic information about the member and the primary contact person (family member, caregiver, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <IntakeTypeSelector
            setIntakeType={setIntakeType}
            setKaiserIlsPath={setKaiserIlsPath}
            intakeType={intakeType}
            kaiserIlsPath={kaiserIlsPath}
          />

          {/* Member Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Member Information</h3>
            {intakeType !== 'kaiser_auth_received_via_ils' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="memberFirstName">Member First Name *</Label>
                  <Input
                    id="memberFirstName"
                    value={memberData.memberFirstName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberFirstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberLastName">Member Last Name *</Label>
                  <Input
                    id="memberLastName"
                    value={memberData.memberLastName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberLastName: e.target.value })}
                  />
                </div>
              </div>
            )}
            {intakeType === 'kaiser_auth_received_via_ils' && (
              <div id="kaiser-ils-datapage" className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 scroll-mt-24">
                <div className="md:col-span-2 space-y-3" key={kaiserIlsPath || 'ils-path-none'}>
                  <SingleAuthPdfPanel
                    kaiserIlsPath={kaiserIlsPath}
                    serviceRequestFileInputRef={serviceRequestFileInputRef}
                    setServiceRequestFiles={setServiceRequestFiles}
                    setServiceRequestFile={setServiceRequestFile}
                    setServiceRequestParsedFields={setServiceRequestParsedFields}
                    setServiceRequestWarnings={setServiceRequestWarnings}
                    setSingleAuthContactPreview={setSingleAuthContactPreview}
                    setSingleAuthMifMasterHit={setSingleAuthMifMasterHit}
                    isParsingServiceRequest={isParsingServiceRequest}
                    serviceRequestFile={serviceRequestFile}
                    parseServiceRequestPdfAndApply={parseServiceRequestPdfAndApply}
                    clearServiceRequestFile={clearServiceRequestFile}
                    singleAuthMifMasterHit={singleAuthMifMasterHit}
                    serviceRequestFiles={serviceRequestFiles}
                    sendingIlsDecisionRowId={sendingIlsDecisionRowId}
                    memberData={memberData}
                    openSingleAuthIlsServiceDecisionPreview={openSingleAuthIlsServiceDecisionPreview}
                    pendingIlsDecisionDraft={pendingIlsDecisionDraft}
                    singleAuthIlsDecisionLog={singleAuthIlsDecisionLog}
                    setPendingIlsDecisionDraft={setPendingIlsDecisionDraft}
                    sendIlsServiceDecision={sendIlsServiceDecision}
                    serviceRequestParsedFields={serviceRequestParsedFields}
                    serviceRequestWarnings={serviceRequestWarnings}
                    singleAuthContactPreview={singleAuthContactPreview}
                    lastCreatedSkeleton={lastCreatedSkeleton}
                    copyToClipboard={copyToClipboard}
                    familyPortalSignInLink={familyPortalSignInLink}
                    familyPortalContinueLink={familyPortalContinueLink}
                    loadIntroEmailPreview={loadIntroEmailPreview}
                    isLoadingIntroEmailPreview={isLoadingIntroEmailPreview}
                    isSendingIntroEmail={isSendingIntroEmail}
                    sendIntroductoryEmail={sendIntroductoryEmail}
                    introEmailDraft={introEmailDraft}
                    selectedAssignedStaffId={selectedAssignedStaffId}
                    setIntroEmailDraft={setIntroEmailDraft}
                  />
                  <MifPullPanel
                    kaiserIlsPath={kaiserIlsPath}
                    mifMasterSearchMrn={mifMasterSearchMrn}
                    setMifMasterSearchMrn={setMifMasterSearchMrn}
                    mifMasterSearchMediCal={mifMasterSearchMediCal}
                    setMifMasterSearchMediCal={setMifMasterSearchMediCal}
                    mifMasterSearchLastName={mifMasterSearchLastName}
                    setMifMasterSearchLastName={setMifMasterSearchLastName}
                    mifMasterSearchFirstName={mifMasterSearchFirstName}
                    setMifMasterSearchFirstName={setMifMasterSearchFirstName}
                    isSearchingMifMaster={isSearchingMifMaster}
                    searchMifMasterList={searchMifMasterList}
                    memberData={memberData}
                    mifMasterSearchResult={mifMasterSearchResult}
                    refreshCaspioBeforeSpreadsheetParse={refreshCaspioBeforeSpreadsheetParse}
                    isCheckingCaspioExisting={isCheckingCaspioExisting}
                    isParsingIlsSpreadsheet={isParsingIlsSpreadsheet}
                    ilsSpreadsheetInputRef={ilsSpreadsheetInputRef}
                    parseIlsSpreadsheetFile={parseIlsSpreadsheetFile}
                    hasMifCaspioRefresh={hasMifCaspioRefresh}
                    loadNewMembersFromMifMasterList={loadNewMembersFromMifMasterList}
                    selectedConsolidatorRunId={selectedConsolidatorRunId}
                    isLoadingConsolidatorRuns={isLoadingConsolidatorRuns}
                    notInCaspioCardCount={notInCaspioCardCount}
                    ilsImportRows={ilsImportRows}
                    consolidatorRuns={consolidatorRuns}
                    focusNotInCaspioMembers={focusNotInCaspioMembers}
                    notInCaspioCardActive={notInCaspioCardActive}
                    notInCaspioCardHint={notInCaspioCardHint}
                    setSelectedConsolidatorRunId={setSelectedConsolidatorRunId}
                    ilsPickerSearchMode={ilsPickerSearchMode}
                    setIlsPickerSearchMode={setIlsPickerSearchMode}
                    ilsPickerSearch={ilsPickerSearch}
                    setIlsPickerSearch={setIlsPickerSearch}
                    ilsPickerRows={ilsPickerRows}
                    pickedIlsRowId={pickedIlsRowId}
                    setPickedIlsRowId={setPickedIlsRowId}
                    setIlsImportSelected={setIlsImportSelected}
                    createAppLoadedRunId={createAppLoadedRunId}
                    createAppLoadedAtIso={createAppLoadedAtIso}
                    consolidatorUploadedFiles={consolidatorUploadedFiles}
                    parsePickedIlsRowToForm={parsePickedIlsRowToForm}
                    clearIlsSpreadsheetImport={clearIlsSpreadsheetImport}
                    ilsSpreadsheetFileName={ilsSpreadsheetFileName}
                    mifLastCaspioRefreshAtIso={mifLastCaspioRefreshAtIso}
                    selectedIlsRows={selectedIlsRows}
                    selectedCreatedIlsRows={selectedCreatedIlsRows}
                    nonCaspioRowCount={nonCaspioRowCount}
                    caspioExistingRowCount={caspioExistingRowCount}
                    pendingAuthUpdateRowCount={pendingAuthUpdateRowCount}
                    selectAllVisibleIlsRows={selectAllVisibleIlsRows}
                    clearAllVisibleIlsSelections={clearAllVisibleIlsSelections}
                    selectOnlyNotInCaspio={selectOnlyNotInCaspio}
                    selectOnlyInCaspio={selectOnlyInCaspio}
                    excludeSelectedFromCreateApp={excludeSelectedFromCreateApp}
                    isExcludingFromCreateApp={isExcludingFromCreateApp}
                    ilsImportSelected={ilsImportSelected}
                    refreshIlsRowsFromCaspio={refreshIlsRowsFromCaspio}
                    showOnlyNotInCaspio={showOnlyNotInCaspio}
                    setShowOnlyNotInCaspio={setShowOnlyNotInCaspio}
                    setNotInCaspioCardActive={setNotInCaspioCardActive}
                    populateMemberDataFromIlsRow={populateMemberDataFromIlsRow}
                    excludeRowsFromCreateApp={excludeRowsFromCreateApp}
                    ilsDecisionLogByRowId={ilsDecisionLogByRowId}
                    sendingIlsDecisionRowId={sendingIlsDecisionRowId}
                    openIlsServiceDecisionPreview={openIlsServiceDecisionPreview}
                    pendingIlsDecisionDraft={pendingIlsDecisionDraft}
                    setPendingIlsDecisionDraft={setPendingIlsDecisionDraft}
                    sendIlsServiceDecision={sendIlsServiceDecision}
                  />
                </div>
                <div>
                  <Label htmlFor="memberFirstName">Member First Name</Label>
                  <Input
                    id="memberFirstName"
                    value={memberData.memberFirstName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberFirstName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberLastName">Member Last Name</Label>
                  <Input
                    id="memberLastName"
                    value={memberData.memberLastName || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberLastName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberMrn">Member MRN</Label>
                  <Input
                    id="memberMrn"
                    value={memberData.memberMrn || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberMrn: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberMediCalNum">Medical Number (Medi-Cal/CIN)</Label>
                  <Input
                    id="memberMediCalNum"
                    value={memberData.memberMediCalNum || ''}
                    onChange={(e) => {
                      const normalized = normalizeMediCalNumber(e.target.value);
                      setMemberData({
                        ...memberData,
                        memberMediCalNum: normalized,
                        confirmMemberMediCalNum: normalized,
                      });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberSex">Sex</Label>
                  <Select
                    value={
                      memberData.memberSex === 'M' || memberData.memberSex === 'F'
                        ? memberData.memberSex
                        : '__none__'
                    }
                    onValueChange={(value) => {
                      setMemberData({
                        ...memberData,
                        memberSex: value === '__none__' ? '' : normalizeMemberSex(value),
                      });
                    }}
                  >
                    <SelectTrigger id="memberSex">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="F">F</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="memberPhone">Member Phone</Label>
                  <Input
                    id="memberPhone"
                    type="tel"
                    value={memberData.memberPhone || ''}
                    onChange={(e) => {
                      const formattedPhone = formatMemberPhoneWithDashes(e.target.value);
                      setMemberData({ ...memberData, memberPhone: formattedPhone });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberEmail">Member Email</Label>
                  <Input
                    id="memberEmail"
                    type="email"
                    value={memberData.memberEmail || ''}
                    onChange={(e) =>
                      setMemberData({
                        ...memberData,
                        memberEmail: String(e.target.value || '').trim().toLowerCase(),
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerName">Care Manager Name</Label>
                  <Input
                    id="careManagerName"
                    value={memberData.careManagerName || ''}
                    onChange={(e) => setMemberData({ ...memberData, careManagerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerPhone">Care Manager Phone</Label>
                  <Input
                    id="careManagerPhone"
                    type="tel"
                    value={memberData.careManagerPhone || ''}
                    onChange={(e) => {
                      const formattedPhone = formatMemberPhoneWithDashes(e.target.value);
                      setMemberData({ ...memberData, careManagerPhone: formattedPhone });
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="careManagerEmail">Care Manager Email</Label>
                  <Input
                    id="careManagerEmail"
                    type="email"
                    value={memberData.careManagerEmail || ''}
                    onChange={(e) =>
                      setMemberData({ ...memberData, careManagerEmail: String(e.target.value || '').trim().toLowerCase() })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="memberDob">Member DOB</Label>
                  <Input
                    id="memberDob"
                    placeholder="MM/DD/YYYY"
                    value={memberData.memberDob || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberDob: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Use MM/DD/YYYY format (example: 01/31/1940).</p>
                </div>
                <div>
                  <Label htmlFor="memberCustomaryLocation">Member Customary Location Type</Label>
                  <Input
                    id="memberCustomaryLocation"
                    value={memberData.memberCustomaryLocation || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryLocation: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="memberCustomaryAddress">Member Customary Street Address</Label>
                  <Input
                    id="memberCustomaryAddress"
                    value={memberData.memberCustomaryAddress || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryAddress: e.target.value })}
                    onBlur={(e) => {
                      const street = toNameCase(e.target.value);
                      const zipFromStreet = String(e.target.value || '').match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] || '';
                      const nextZip = String(memberData.memberCustomaryZip || zipFromStreet).trim();
                      const inferredCounty = inferCountyFromCityZip({
                        city: memberData.memberCustomaryCity,
                        zip: nextZip,
                      });
                      const nextCounty = toNameCase(inferredCounty || memberData.memberCustomaryCounty || '');
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: nextZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryAddress: street,
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCity">Member Customary City</Label>
                  <Input
                    id="memberCustomaryCity"
                    value={memberData.memberCustomaryCity || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCity: e.target.value })}
                    onBlur={(e) => {
                      const city = toNameCase(e.target.value);
                      const inferredCounty = inferCountyFromCityZip({
                        city,
                        zip: memberData.memberCustomaryZip,
                      });
                      const inferredState = inferStateFromCityZip({
                        city,
                        zip: memberData.memberCustomaryZip,
                      });
                      const nextCounty = toNameCase(inferredCounty || memberData.memberCustomaryCounty || '');
                      notifyCountyUndetermined({
                        city,
                        zip: memberData.memberCustomaryZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCity: city,
                        memberCustomaryState: String(
                          inferredState || prev.memberCustomaryState || ''
                        )
                          .trim()
                          .toUpperCase(),
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryState">Member Customary State</Label>
                  <Input
                    id="memberCustomaryState"
                    value={memberData.memberCustomaryState || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryState: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryZip">Member Customary ZIP</Label>
                  <Input
                    id="memberCustomaryZip"
                    value={memberData.memberCustomaryZip || ''}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryZip: e.target.value })}
                    onBlur={(e) => {
                      const normalizedZip = normalizeUsZip(e.target.value);
                      const nextCounty = toNameCase(
                        inferCountyFromCityZip({
                          city: memberData.memberCustomaryCity,
                          zip: normalizedZip,
                        }) || memberData.memberCustomaryCounty || ''
                      );
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: normalizedZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryZip: normalizedZip,
                        memberCustomaryState: String(
                          inferStateFromCityZip({
                            city: prev.memberCustomaryCity,
                            zip: normalizedZip,
                          }) || prev.memberCustomaryState || ''
                        )
                          .trim()
                          .toUpperCase(),
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="memberCustomaryCounty">Member Customary County</Label>
                  <Input
                    id="memberCustomaryCounty"
                    value={memberData.memberCustomaryCounty || ''}
                    placeholder={countyCannotBeDetermined ? 'County cannot be determined' : ''}
                    className={countyCannotBeDetermined ? 'border-amber-500 bg-amber-50' : undefined}
                    onChange={(e) => setMemberData({ ...memberData, memberCustomaryCounty: e.target.value })}
                    onFocus={() => {
                      setMemberData((prev) => {
                        if (String(prev.memberCustomaryCounty || '').trim()) return prev;
                        const inferredCounty = inferCountyFromCityZip({
                          city: prev.memberCustomaryCity,
                          zip: prev.memberCustomaryZip,
                        });
                        if (!inferredCounty) return prev;
                        return {
                          ...prev,
                          memberCustomaryCounty: toNameCase(inferredCounty),
                        };
                      });
                    }}
                    onBlur={(e) => {
                      const nextCounty = toNameCase(
                        e.target.value ||
                          inferCountyFromCityZip({
                            city: memberData.memberCustomaryCity,
                            zip: memberData.memberCustomaryZip,
                          }) ||
                          ''
                      );
                      notifyCountyUndetermined({
                        city: memberData.memberCustomaryCity,
                        zip: memberData.memberCustomaryZip,
                        county: nextCounty,
                      });
                      setMemberData((prev) => ({
                        ...prev,
                        memberCustomaryCounty: nextCounty,
                      }));
                    }}
                  />
                  {countyCannotBeDetermined ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">{COUNTY_UNDETERMINED_MESSAGE}</p>
                  ) : null}
                </div>
                <div>
                  <Label htmlFor="Authorization_Number_T038">Authorization Number T2038</Label>
                  <Input
                    id="Authorization_Number_T038"
                    value={memberData.Authorization_Number_T038 || ''}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Number_T038: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="Diagnostic_Code">Diagnostic Code</Label>
                  <Input
                    id="Diagnostic_Code"
                    value={memberData.Diagnostic_Code || ''}
                    onChange={(e) => setMemberData({ ...memberData, Diagnostic_Code: e.target.value })}
                  />
                </div>
                {String(memberData.parsedSourceType || '').trim() === 'spreadsheet' && (
                  <div className="md:col-span-2 rounded-md border p-3 text-sm">
                    <p>
                      A {MIF_SERVICE_DELIVERY_FORM_NAME} PDF is always created from this parsed MIF row, saved in member files,
                      and attached to the staff assignment email.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Staff can open it from member files or as a PDF attachment on the assignment email.
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="Authorization_Start_T2038">Authorization Start T2038</Label>
                  <Input
                    id="Authorization_Start_T2038"
                    type="date"
                    value={toDateInputValue(memberData.Authorization_Start_T2038)}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_Start_T2038: toMmDdYyyy(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="Authorization_End_T2038">Authorization End T2038</Label>
                  <Input
                    id="Authorization_End_T2038"
                    type="date"
                    value={toDateInputValue(memberData.Authorization_End_T2038)}
                    onChange={(e) => setMemberData({ ...memberData, Authorization_End_T2038: toMmDdYyyy(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Contact Information */}
          <PrimaryContactSection
            intakeType={intakeType}
            user={user}
            memberData={memberData}
            setMemberData={setMemberData}
            handlePhoneChange={handlePhoneChange}
          />

          {/* Admin Notes */}
          <div>
            <Label htmlFor="notes">Admin Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={memberData.notes || ''}
              onChange={(e) => setMemberData({ ...memberData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <CreateApplicationSubmitBar
            createApplicationForMember={createApplicationForMember}
            isCreating={isCreating}
            isFormValid={isFormValid}
            intakeType={intakeType}
            resetAllCreateFields={resetAllCreateFields}
          />

          {!isFormValid && (
            <div className="text-sm text-gray-500 text-center space-y-1">
              <p>
                {intakeType === 'kaiser_auth_received_via_ils'
                  ? 'Please complete required draft fields before creating the Kaiser auth draft.'
                  : 'Please fill in all required fields (marked with *) before creating the application draft.'}
              </p>
              {memberData.contactPhone && memberData.contactPhone.replace(/\D/g, '').length > 0 && memberData.contactPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Contact phone number must be 10 digits (xxx-xxx-xxxx)</p>
              )}
              {intakeType === 'kaiser_auth_received_via_ils' && memberData.memberPhone && memberData.memberPhone.replace(/\D/g, '').length > 0 && memberData.memberPhone.replace(/\D/g, '').length < 10 && (
                <p className="text-red-500">Member phone number must be 10 digits (xxx.xxx.xxxx)</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}