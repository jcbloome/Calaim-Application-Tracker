'use client';

/* eslint-disable @typescript-eslint/no-unused-vars */
import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Check,
  CheckCircle2,
  File,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  Package,
  Database,
  X,
  XCircle,
  FileText,
  Lock,
  Edit,
  Mail,
  AlertTriangle,
  User,
  Calendar as CalendarIcon,
  List,
  Link as LinkIcon,
  Download,
  Bell,
  BellOff,
  BellRing,
  Eye,
  EyeOff,
  ChevronDown,
  Target,
  Wrench,
  RefreshCw,
  ClipboardPaste,
  RotateCcw,
  MessageSquareHeart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveKaiserRegion, isValidKaiserMrnForCaspioPush, KAISER_MRN_CASPIO_PUSH_HELP } from '@/lib/kaiser-region';
import { resolveReferralAuthorizedCaregiver } from '@/lib/kaiser-referral-caregiver';
import {
  composeReferralAddressLine,
  resolveKaiserReferralCurrentLocation,
  resolveKaiserReferralMailingAddress,
} from '@/lib/kaiser-referral-addresses';
import { mergeApplicationForms } from '@/lib/merge-application-forms';
import { markIlsMifMemberPushedToCaspio } from '@/lib/ils-mif-consolidator-sync';
import {
  dedupeIlsNotesBlocks,
  enrichSingleAuthAdminNotesFromApplication,
  looksLikeOriginalIlsImportNotes,
  mergeNotesAvoidingIlsDuplicate,
  stripOriginalIlsImportNotes,
} from '@/lib/ils-admin-notes';
import {
  applicationMifServiceDeliveryNeedsRefresh,
  collectWaiversAuthorizationsPdfUrls,
  isMifServiceRequestFormName,
  MIF_SERVICE_DELIVERY_FORM_NAME,
  MIF_SERVICE_DELIVERY_LAYOUT_VERSION,
  uploadMifServiceDeliveryForm,
  uploadWaiversAuthorizationsPacket,
  WAIVERS_AUTHORIZATIONS_PACKET_FORM_NAME,
  WAIVERS_AUTHORIZATIONS_PACKET_LAYOUT_VERSION,
} from '@/lib/mif-service-delivery-form';
import type { Application, FormStatus as FormStatusType, StaffTracker, StaffMember } from '@/lib/definitions';
import { useDoc, useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { addDoc, arrayUnion, collection, doc, getDoc, setDoc, serverTimestamp, Timestamp, onSnapshot, deleteDoc, getDocs, query, where, documentId, limit, deleteField } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getBlob, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { MultiUploadCard } from '@/components/MultiUploadCard';
import { useAdmin } from '@/hooks/use-admin';
import { useDesktopPresenceMap } from '@/hooks/use-desktop-presence';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogTitle, AlertDialogHeader, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import ActivityLog from '@/components/admin/ActivityLog';
import { KAISER_STATUS_PROGRESSION, getKaiserStatusesInOrder, getKaiserStatusProgress } from '@/lib/kaiser-status-progression';
import {
  KAISER_NOT_INTERESTED_COLLECTION,
  KAISER_NOT_INTERESTED_STATUS,
  buildKaiserNotInterestedDocId,
  isNotInterestedKaiserStatus,
} from '@/lib/kaiser-not-interested';
import { sendIlsServiceStartedEmails, sendClaimsDepartmentEmail } from '@/app/actions/send-email';
import { countPendingDocumentReviews } from '@/lib/review-queue';
import {
  buildMemberActionLogEntry,
  getMemberActionLog,
  MEMBER_ACTION_KEYS,
  synthesizeLegacyMemberActions,
  type MemberActionLogEntry,
} from '@/lib/member-action-log';
import {
  buildFirstContactAckResetFields,
  isNeedFirstContactKaiserStatus,
  isUserAssignedStaffForApp,
  shouldTrackFirstContactAck,
} from '@/lib/first-contact-ack';
import {
  SNF_RESIDENCY_NOTE,
  SNF_RESIDENCY_REQUIRED_DAYS,
  buildSnfResidencyFormFields,
  parseSnfResidencyDays,
} from '@/lib/snf-residency';
import { maybeSyncIlsClaimsWorkflowToCaspio } from '@/lib/caspio-ils-claims-workflow';
import { appConfirm } from '@/components/AppDialogHost';
import {
  DEFAULT_SOCIAL_WORKER_HOLD_VALUE,
  REQUIRED_PRE_PUSH_KAISER_STATUSES,
  normalizeStatusToken,
  REQUIRED_PRE_PUSH_KAISER_STATUS_TOKENS,
  isRequiredPrePushKaiserStatus,
  toMillisSafe,
  ILS_SERVICE_STARTED_EMAIL,
  CLAIMS_EMAIL_TO,
  CLAIMS_EMAIL_NAME,
  DEFAULT_SENDER_PHONE,
  QaDoneMeta,
  buildIlsEmailSignature,
  withIlsEmailSignature,
} from './shared';

export function PushToCaspioDialog({
    application,
    buttonVariant = "outline",
    buttonClassName = "w-full justify-start gap-2"
}: {
    application: Application;
    buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    buttonClassName?: string;
}) {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isSendingToCaspio, setIsSendingToCaspio] = useState(false);
    const [isResettingCaspio, setIsResettingCaspio] = useState(false);
    const [isPushingNotesOnly, setIsPushingNotesOnly] = useState(false);
    const [isClearingClientId2, setIsClearingClientId2] = useState(false);
    const [clientId2ClearedLocally, setClientId2ClearedLocally] = useState(false);
    const [updateExistingCaspioOnly, setUpdateExistingCaspioOnly] = useState(false);
    const [confirmOverwriteAck, setConfirmOverwriteAck] = useState(false);
    const [isLoadingPushOverwritePreview, setIsLoadingPushOverwritePreview] = useState(false);
    const [pushOverwritePreviewError, setPushOverwritePreviewError] = useState('');
    const [pushOverwritePreviewItems, setPushOverwritePreviewItems] = useState<
      Array<{
        csField: string;
        caspioField: string;
        appValue: string;
        caspioValue: string;
        status: 'overwrite_caspio' | 'unchanged' | 'app_empty' | 'caspio_empty_fill';
      }>
    >([]);
    const [caspioMappingPreview, setCaspioMappingPreview] = useState<Record<string, string> | null>(null);
    const [caspioMappingDraftMeta, setCaspioMappingDraftMeta] = useState<{
      draftName?: string;
      savedAtIso?: string;
      lockedAtIso?: string;
      source?: 'shared' | 'user' | 'local';
    } | null>(null);
    const skeletonPushEnabled =
      String((application as any)?.status || '').trim().toLowerCase() === 'draft' ||
      Boolean((application as any)?.createdByAdmin) ||
      String(application?.id || '').startsWith('admin_app_');

    const docRef = useMemoFirebase(() => {
        if (!firestore || !application.id) return null;
        const isAdminStored =
          String(application.id || '').startsWith('admin_app_') ||
          !String(application.userId || '').trim();
        if (isAdminStored) {
          return doc(firestore, 'applications', application.id);
        }
        return doc(firestore, `users/${application.userId}/applications`, application.id);
    }, [firestore, application.id, application.userId]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const loadMappingPreview = async () => {
            if (firestore && user?.uid) {
                try {
                    const sharedRef = doc(firestore, 'admin-settings', 'caspio-field-mapping');
                    const sharedSnap = await getDoc(sharedRef);
                    if (sharedSnap.exists()) {
                        const sharedData = (sharedSnap.data() || {}) as Record<string, any>;
                        const sharedLocked = sharedData?.lockedMappings;
                        if (sharedLocked && typeof sharedLocked === 'object' && Object.keys(sharedLocked).length > 0) {
                            if (!cancelled) {
                              setCaspioMappingPreview(sharedLocked as Record<string, string>);
                              setCaspioMappingDraftMeta({
                                source: 'shared',
                                draftName: String(sharedData?.lockedDraftName || '').trim() || undefined,
                                savedAtIso: String(sharedData?.lockedDraftSavedAtIso || '').trim() || undefined,
                                lockedAtIso: String(sharedData?.lockedAtIso || '').trim() || undefined,
                              });
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to load shared Caspio mapping preview:', error);
                }
                try {
                    const cloudRef = doc(firestore, 'users', user.uid, 'admin_settings', 'caspio_field_mapping');
                    const cloudSnap = await getDoc(cloudRef);
                    if (cloudSnap.exists()) {
                        const cloudData = (cloudSnap.data() || {}) as Record<string, any>;
                        const locked = cloudData?.lockedMappings;
                        if (locked && typeof locked === 'object' && Object.keys(locked).length > 0) {
                            if (!cancelled) {
                              setCaspioMappingPreview(locked as Record<string, string>);
                              const cloudLockedMeta = cloudData?.lockedDraftMeta;
                              setCaspioMappingDraftMeta({
                                source: 'user',
                                draftName:
                                  String(cloudLockedMeta?.draftName || cloudData?.lockedDraftName || '').trim() || undefined,
                                savedAtIso:
                                  String(cloudLockedMeta?.savedAtIso || cloudData?.lockedDraftSavedAtIso || '').trim() || undefined,
                                lockedAtIso:
                                  String(cloudLockedMeta?.lockedAtIso || cloudData?.lockedAtIso || '').trim() || undefined,
                              });
                            }
                            return;
                        }
                    }
                } catch (error) {
                    console.warn('Failed to load cloud Caspio mapping preview:', error);
                }
            }
            if (typeof window !== 'undefined') {
                try {
                    const stored = localStorage.getItem('calaim_cs_caspio_mapping');
                    if (!stored) {
                        if (!cancelled) setCaspioMappingPreview(null);
                        return;
                    }
                    const parsed = JSON.parse(stored);
                    if (parsed && typeof parsed === 'object') {
                        if (!cancelled) {
                          setCaspioMappingPreview(parsed);
                          let localMeta: Record<string, any> | null = null;
                          try {
                            const localMetaRaw = localStorage.getItem('calaim_cs_caspio_mapping_locked_draft_meta');
                            localMeta = localMetaRaw ? JSON.parse(localMetaRaw) : null;
                          } catch {
                            localMeta = null;
                          }
                          setCaspioMappingDraftMeta({
                            source: 'local',
                            draftName: String(localMeta?.draftName || '').trim() || undefined,
                            savedAtIso: String(localMeta?.savedAtIso || '').trim() || undefined,
                            lockedAtIso: String(localMeta?.lockedAtIso || '').trim() || undefined,
                          });
                        }
                        return;
                    }
                } catch (error) {
                    console.warn('Failed to load local Caspio mapping preview:', error);
                }
            }
            if (!cancelled) {
              setCaspioMappingPreview(null);
              setCaspioMappingDraftMeta(null);
            }
        };
        void loadMappingPreview();
        return () => {
            cancelled = true;
        };
    }, [firestore, isOpen, user?.uid]);

    const assignedStaffId = String((application as any)?.assignedStaffId || '').trim();
    const assignedStaffName = String((application as any)?.assignedStaffName || '').trim();
    const mappingDraftName = String(caspioMappingDraftMeta?.draftName || '').trim();
    const mappingDraftSavedAtIso = String(caspioMappingDraftMeta?.savedAtIso || '').trim();
    const mappingDraftSavedAtLabel = mappingDraftSavedAtIso ? new Date(mappingDraftSavedAtIso).toLocaleString() : '';
    const mappingSourceLabel =
      caspioMappingDraftMeta?.source === 'shared'
        ? 'Latest locked mapping (shared admin settings)'
        : caspioMappingDraftMeta?.source === 'user'
          ? 'Locked mapping (your admin settings)'
          : caspioMappingDraftMeta?.source === 'local'
            ? 'Locked mapping (local browser cache)'
            : 'Locked mapping';
    const isKaiserHealthPlan = String((application as any)?.healthPlan || '').trim().toLowerCase().includes('kaiser');
    const caspioCalAIMStatus = String(
      (application as any)?.caspioCalAIMStatus ||
        (application as any)?.CalAIM_Status ||
        (application as any)?.calaimStatus ||
        ''
    ).trim();
    const requestedKaiserStatus = String(
      (application as any)?.kaiserStatus || (application as any)?.Kaiser_Status || ''
    ).trim();
    const isRequiredKaiserStatusSelectedForPush =
      !isKaiserHealthPlan || isRequiredPrePushKaiserStatus(requestedKaiserStatus);
    const memberMrnForKaiserPush = String(
      (application as any)?.memberMrn ||
        (application as any)?.confirmMemberMrn ||
        (application as any)?.medicalRecordNumber ||
        (application as any)?.Member_MRN ||
        (application as any)?.MCP_CIN ||
        (application as any)?.mrn ||
        ''
    ).trim();
    const isValidKaiserMrnSelectedForPush =
      !isKaiserHealthPlan || isValidKaiserMrnForCaspioPush(memberMrnForKaiserPush);
    const requestedSocialWorkerHold = String(
      (application as any)?.holdForSocialWorkerStatus ||
      (application as any)?.Hold_For_Social_Worker_Visit ||
      (application as any)?.Hold_For_Social_Worker ||
      ''
    ).trim() || DEFAULT_SOCIAL_WORKER_HOLD_VALUE;
    const mediCalNumberForReadiness = String(
      (application as any)?.memberMediCalNum ||
      (application as any)?.confirmMemberMediCalNum ||
      (application as any)?.MediCal_Number ||
      (application as any)?.Medical_Number ||
      ''
    ).trim();
    const existingClientId2Raw = String((application as any)?.client_ID2 || (application as any)?.clientId2 || '').trim();
    const existingClientId2 = clientId2ClearedLocally ? '' : existingClientId2Raw;
    const isAlreadySent = Boolean((application as any)?.caspioSent);
    const caspioSentAtMs = toMillisSafe((application as any)?.caspioSentDate || (application as any)?.caspioLastPushedAt);
    const notesPushClientId2 = String(
      existingClientId2 ||
      (application as any)?.clientId2 ||
      (application as any)?.client_ID2 ||
      (application as any)?.caspioClientId2 ||
      ''
    ).trim();
    const hasExistingClientId2 = Boolean(existingClientId2);
    const clientIdConflictWarning =
      'This application already has Client_ID2. Delete the existing record in Caspio Clients Table and CalAIM Members tables before pushing again.';
    const hasAssignedStaff = Boolean(assignedStaffId || assignedStaffName);
    const kaiserAuthorizationMode = String((application as any)?.kaiserAuthorizationMode || '').trim().toLowerCase();
    const isKaiserAuthReceivedIntake =
      kaiserAuthorizationMode === 'authorization_received'
        ? true
        : kaiserAuthorizationMode === 'authorization_needed'
          ? false
          : Boolean((application as any)?.kaiserAuthReceivedViaIls) ||
            String((application as any)?.intakeType || '').trim().toLowerCase() === 'kaiser_auth_received_via_ils';
    const derivedCaspioCalAIMStatus =
      /^authorized$/i.test(caspioCalAIMStatus)
        ? 'Authorized'
        : /^pending$/i.test(caspioCalAIMStatus)
          ? 'Pending'
          : '';
    const hasCalAimStatusAssigned = Boolean(derivedCaspioCalAIMStatus);
    const calaimTrackingStatus = String((application as any)?.calaimTrackingStatus || '').trim();
    const forms = Array.isArray((application as any)?.forms) ? ((application as any)?.forms as any[]) : [];
    const hasCompletedForm = (candidates: string[]) =>
      forms.some((form) => {
        const name = String(form?.name || '').trim().toLowerCase();
        const status = String(form?.status || '').trim().toLowerCase();
        return candidates.some((candidate) => name === candidate.toLowerCase()) && status === 'completed';
      });
    const eligibilityCheckComplete =
      calaimTrackingStatus === 'CalAIM Eligible' ||
      calaimTrackingStatus === 'Not CalAIM Eligible' ||
      hasCompletedForm(['Eligibility Check', 'Eligibility Screenshot']) ||
      Boolean(
        String((application as any)?.lastEligibilityCheckAt || '').trim() ||
          String((application as any)?.lastEligibilityCheckDate || '').trim()
      );
    const allowDraftCaspioPush = Boolean((application as any)?.allowDraftCaspioPush);
    const isDraftLikeForPush =
      String((application as any)?.status || '').trim().toLowerCase() === 'draft' ||
      Boolean((application as any)?.createdByAdmin) ||
      allowDraftCaspioPush;
    const adminIntakeNotes = enrichSingleAuthAdminNotesFromApplication(
      String((application as any)?.adminNotes || '').trim(),
      application as any
    );
    const prePushNotesRaw = String((application as any)?.preAssessmentCareNeedsNotes || '').trim();
    const originalIlsNotesAlreadyPushed = Boolean(
      (application as any)?.caspioNotesLastPushedAt || (application as any)?.caspioSent
    );
    const prePushNotes = (() => {
      if (originalIlsNotesAlreadyPushed) {
        const cleanedRaw = stripOriginalIlsImportNotes(prePushNotesRaw);
        if (cleanedRaw) return cleanedRaw;
        // Do not re-send original MIF / ILS spreadsheet dump after the first notes push.
        if (looksLikeOriginalIlsImportNotes(adminIntakeNotes)) return '';
        return stripOriginalIlsImportNotes(adminIntakeNotes);
      }
      if (prePushNotesRaw && adminIntakeNotes) {
        return dedupeIlsNotesBlocks(
          mergeNotesAvoidingIlsDuplicate(prePushNotesRaw, adminIntakeNotes)
        );
      }
      return dedupeIlsNotesBlocks(prePushNotesRaw || adminIntakeNotes);
    })();
    const toClean = (value: unknown) => String(value ?? '').trim();
    const contactFirstName = toClean(
      (application as any)?.bestContactFirstName ||
      (application as any)?.referrerFirstName ||
      (application as any)?.repFirstName
    );
    const contactLastName = toClean(
      (application as any)?.bestContactLastName ||
      (application as any)?.referrerLastName ||
      (application as any)?.repLastName
    );
    const contactPhone = toClean(
      (application as any)?.bestContactPhone ||
      (application as any)?.referrerPhone ||
      (application as any)?.repPhone
    );
    const contactEmail = toClean(
      (application as any)?.bestContactEmail ||
      (application as any)?.referrerEmail ||
      (application as any)?.repEmail
    );
    const csSummaryComplete = hasCompletedForm(['CS Summary', 'CS Member Summary']);
    const readinessChecks = [
      { key: 'memberFirstName', label: 'Member first name', required: true, ready: Boolean(toClean((application as any)?.memberFirstName)) },
      { key: 'memberLastName', label: 'Member last name', required: true, ready: Boolean(toClean((application as any)?.memberLastName)) },
      { key: 'memberMediCalNum', label: 'Medi-Cal Number', required: true, ready: Boolean(mediCalNumberForReadiness) },
      { key: 'authorizationNumber', label: 'Authorization Number T038', required: isKaiserAuthReceivedIntake && !allowDraftCaspioPush && !skeletonPushEnabled, ready: Boolean(toClean((application as any)?.Authorization_Number_T038)) },
      { key: 'authorizationStart', label: 'Authorization Start T2038', required: isKaiserAuthReceivedIntake && !allowDraftCaspioPush && !skeletonPushEnabled, ready: Boolean(toClean((application as any)?.Authorization_Start_T2038)) },
      { key: 'authorizationEnd', label: 'Authorization End T2038', required: isKaiserAuthReceivedIntake && !allowDraftCaspioPush && !skeletonPushEnabled, ready: Boolean(toClean((application as any)?.Authorization_End_T2038)) },
      { key: 'memberMrn', label: 'Member MRN (Kaiser: must start with 0 or 1)', required: isKaiserHealthPlan, ready: isKaiserHealthPlan ? isValidKaiserMrnSelectedForPush : Boolean(toClean((application as any)?.memberMrn)) },
      { key: 'diagnosticCode', label: 'Diagnostic code', required: false, ready: Boolean(toClean((application as any)?.Diagnostic_Code)) },
      {
        key: 'assignedStaff',
        label: 'Member assigned to staff',
        required: true,
        ready: hasAssignedStaff,
      },
      {
        key: 'caspioCalAIMStatus',
        label: 'CalAIM Status (Authorized or Pending)',
        required: true,
        ready: hasCalAimStatusAssigned,
      },
      {
        key: 'kaiserStatus',
        label: 'Kaiser Status determined',
        required: isKaiserHealthPlan,
        ready: isRequiredKaiserStatusSelectedForPush,
      },
      { key: 'socialWorkerHold', label: 'SW Hold for Caspio', required: true, ready: Boolean(requestedSocialWorkerHold) },
      {
        key: 'contactPerson',
        label: 'Family/POA contact name',
        required: !skeletonPushEnabled,
        ready: Boolean(contactFirstName || contactLastName),
      },
      { key: 'contactEmail', label: 'Family/POA email', required: !skeletonPushEnabled, ready: Boolean(contactEmail) },
      { key: 'contactPhone', label: 'Family/POA phone', required: !skeletonPushEnabled, ready: Boolean(contactPhone) },
      {
        key: 'eligibilityCheckComplete',
        label: 'Eligibility check done (staff on portal)',
        required: false,
        ready: eligibilityCheckComplete,
      },
      {
        key: 'csSummaryComplete',
        label: 'CS Summary complete',
        required: isKaiserHealthPlan && !skeletonPushEnabled && !isDraftLikeForPush,
        ready: csSummaryComplete,
      },
      {
        key: 'prePushNotes',
        label: 'Notes',
        required: isDraftLikeForPush && !skeletonPushEnabled,
        ready: Boolean(prePushNotes),
      },
    ];
    const missingRequiredReadiness = readinessChecks.filter((item) => item.required && !item.ready);
    const readinessComplete = missingRequiredReadiness.length === 0;
    const pushGateMissing: string[] = [];
    if (!hasAssignedStaff) pushGateMissing.push('Assigned staff');
    if (isKaiserHealthPlan && !isRequiredKaiserStatusSelectedForPush) pushGateMissing.push('Kaiser Status');
    if (isKaiserHealthPlan && !isValidKaiserMrnSelectedForPush) {
      pushGateMissing.push('Kaiser MRN (must start with 0 or 1)');
    }
    if (!hasCalAimStatusAssigned) pushGateMissing.push('CalAIM Status (Authorized or Pending)');
    const pushGateBlocked = pushGateMissing.length > 0;
    // Staff / Kaiser / CalAIM gates keep the trigger closed. MRN can be reviewed inside the dialog.
    const hardPushGateBlocked =
      !hasAssignedStaff ||
      (isKaiserHealthPlan && !isRequiredKaiserStatusSelectedForPush) ||
      !hasCalAimStatusAssigned;
    const pushGateBlockedTitle = pushGateBlocked
      ? `Complete before Push to Caspio: ${pushGateMissing.join(', ')}`
      : undefined;
    const currentMappedSnapshot = useMemo(() => {
        if (!caspioMappingPreview || Object.keys(caspioMappingPreview).length === 0) return {} as Record<string, string>;
        const out: Record<string, string> = {};
        Object.entries(caspioMappingPreview).forEach(([csField, caspioField]) => {
            out[String(caspioField)] = String((application as any)?.[csField] ?? '').trim();
        });
        return out;
    }, [application, caspioMappingPreview]);
    const previousMappedSnapshot = useMemo(() => {
        const raw = (application as any)?.caspioLastPushedMappedData;
        if (!raw || typeof raw !== 'object') return {} as Record<string, string>;
        return raw as Record<string, string>;
    }, [application]);
    const mappedFieldChanges = useMemo(() => {
        const keys = new Set<string>([
            ...Object.keys(previousMappedSnapshot || {}),
            ...Object.keys(currentMappedSnapshot || {}),
        ]);
        return Array.from(keys)
            .map((field) => {
                const previousValue = String(previousMappedSnapshot?.[field] ?? '').trim();
                const nextValue = String(currentMappedSnapshot?.[field] ?? '').trim();
                return { field, previousValue, nextValue };
            })
            .filter((item) => item.previousValue !== item.nextValue);
    }, [currentMappedSnapshot, previousMappedSnapshot]);
    const hasMappedSnapshotBaseline = Object.keys(previousMappedSnapshot).length > 0;
    const currentSpecialSnapshot = useMemo(() => {
        const monthlyIncomeForCaspio = String(
          (application as any)?.proofIncomeActualAmount ||
          (application as any)?.monthlyIncome ||
          ''
        ).trim();
        return {
            CalAIM_Status: String(derivedCaspioCalAIMStatus || '').trim(),
            Kaiser_Status: String(requestedKaiserStatus || '').trim(),
            Hold_For_Social_Worker_Visit: String(requestedSocialWorkerHold || '').trim(),
            Monthly_Income: monthlyIncomeForCaspio,
            Pre_Assessment_Care_Needs_Notes: prePushNotes,
        } as Record<string, string>;
    }, [application, derivedCaspioCalAIMStatus, requestedKaiserStatus, requestedSocialWorkerHold, prePushNotes]);
    const previousSpecialSnapshot = useMemo(() => {
        const raw = (application as any)?.caspioLastPushedSpecialData;
        if (!raw || typeof raw !== 'object') return {} as Record<string, string>;
        return raw as Record<string, string>;
    }, [application]);
    const specialFieldChanges = useMemo(() => {
        const keys = new Set<string>([
            ...Object.keys(previousSpecialSnapshot || {}),
            ...Object.keys(currentSpecialSnapshot || {}),
        ]);
        return Array.from(keys)
            .map((field) => {
                const previousValue = String(previousSpecialSnapshot?.[field] ?? '').trim();
                const nextValue = String(currentSpecialSnapshot?.[field] ?? '').trim();
                return { field, previousValue, nextValue };
            })
            .filter((item) => item.previousValue !== item.nextValue);
    }, [currentSpecialSnapshot, previousSpecialSnapshot]);
    const hasSpecialSnapshotBaseline = Object.keys(previousSpecialSnapshot).length > 0;
    // Avoid noisy false positives for legacy records that were pushed before mapped snapshots existed.
    // In that case, still show tracked special/status changes and store mapped baseline on next push.
    const effectiveMappedFieldChanges = hasMappedSnapshotBaseline ? mappedFieldChanges : [];
    const pushOverwriteWillChangeItems = useMemo(
      () =>
        pushOverwritePreviewItems.filter(
          (item) => item.status === 'overwrite_caspio' || item.status === 'caspio_empty_fill'
        ),
      [pushOverwritePreviewItems]
    );
    const pushFieldsPreview = useMemo(() => {
      const rows: Array<{ label: string; caspioField: string; value: string; group: string }> = [];
      const mapping = (caspioMappingPreview || {}) as Record<string, string>;
      Object.entries(mapping).forEach(([csField, caspioField]) => {
        const value = String((application as any)?.[csField] ?? '').trim();
        if (!value) return;
        rows.push({
          label: csField,
          caspioField: String(caspioField || '').trim() || '(unmapped)',
          value,
          group: 'Mapped CS Summary',
        });
      });
      const alwaysRows: Array<{ label: string; caspioField: string; value: string }> = [
        {
          label: 'CalAIM Status',
          caspioField: 'CalAIM_Status',
          value: String(derivedCaspioCalAIMStatus || '').trim(),
        },
        {
          label: 'Kaiser Status',
          caspioField: 'Kaiser_Status',
          value: String(requestedKaiserStatus || '').trim(),
        },
        {
          label: 'SW Hold',
          caspioField: 'Hold_For_Social_Worker_Visit',
          value: String(requestedSocialWorkerHold || '').trim(),
        },
        {
          label: 'Primary Contact First',
          caspioField: 'Authorized_Party_First',
          value: String(
            (application as any)?.bestContactFirstName || (application as any)?.contactFirstName || ''
          ).trim(),
        },
        {
          label: 'Primary Contact Last',
          caspioField: 'Authorized_Party_Last',
          value: String(
            (application as any)?.bestContactLastName || (application as any)?.contactLastName || ''
          ).trim(),
        },
        {
          label: 'Primary Contact Phone',
          caspioField: 'Authorized_Party_Phone',
          value: String(
            (application as any)?.bestContactPhone || (application as any)?.contactPhone || ''
          ).trim(),
        },
        {
          label: 'Primary Contact Email',
          caspioField: 'Authorized_Party_Email + Best_Contact_Email',
          value: String(
            (application as any)?.bestContactEmail || (application as any)?.contactEmail || ''
          ).trim(),
        },
        {
          label: 'Admin / intake notes',
          caspioField: 'Caspio client notes (+ mapped notes field)',
          value: String(prePushNotes || '').trim(),
        },
      ];
      alwaysRows.forEach((row) => {
        if (!row.value) return;
        rows.push({ ...row, group: 'Always included on push' });
      });
      return rows;
    }, [
      application,
      caspioMappingPreview,
      derivedCaspioCalAIMStatus,
      requestedKaiserStatus,
      requestedSocialWorkerHold,
      prePushNotes,
    ]);
    const buildCaspioPushRequestBody = (
      pushApplicationData: Record<string, any>,
      mappingOverride?: Record<string, string> | null
    ) => {
      const resolvedClientId2 = String(
        (!clientId2ClearedLocally &&
          ((pushApplicationData as any)?.clientId2 ||
            (pushApplicationData as any)?.client_ID2 ||
            (pushApplicationData as any)?.Client_ID2 ||
            (pushApplicationData as any)?.caspioClientId2 ||
            existingClientId2)) ||
          ''
      ).trim();
      return {
      applicationData: {
        ...pushApplicationData,
        clientId2: resolvedClientId2 || String((pushApplicationData as any)?.clientId2 || '').trim(),
        client_ID2: resolvedClientId2 || String((pushApplicationData as any)?.client_ID2 || '').trim(),
        Client_ID2: resolvedClientId2 || String((pushApplicationData as any)?.Client_ID2 || '').trim(),
        caspioClientId2: resolvedClientId2 || String((pushApplicationData as any)?.caspioClientId2 || '').trim(),
        memberMediCalNum:
          String((pushApplicationData as any)?.memberMediCalNum || '').trim() ||
          String((pushApplicationData as any)?.confirmMemberMediCalNum || '').trim() ||
          '',
        confirmMemberMediCalNum:
          String((pushApplicationData as any)?.confirmMemberMediCalNum || '').trim() ||
          String((pushApplicationData as any)?.memberMediCalNum || '').trim() ||
          '',
        MediCal_Number:
          String((pushApplicationData as any)?.memberMediCalNum || '').trim() ||
          String((pushApplicationData as any)?.confirmMemberMediCalNum || '').trim() ||
          '',
        Medical_Number:
          String((pushApplicationData as any)?.memberMediCalNum || '').trim() ||
          String((pushApplicationData as any)?.confirmMemberMediCalNum || '').trim() ||
          '',
        preAssessmentCareNeedsNotes:
          String(prePushNotes || '').trim() ||
          String((pushApplicationData as any)?.preAssessmentCareNeedsNotes || '').trim(),
        pre_assessment_care_needs_notes:
          String(prePushNotes || '').trim() ||
          String((pushApplicationData as any)?.preAssessmentCareNeedsNotes || '').trim(),
        Pre_Assessment_Care_Needs_Notes:
          String(prePushNotes || '').trim() ||
          String((pushApplicationData as any)?.preAssessmentCareNeedsNotes || '').trim(),
        adminNotes:
          String((pushApplicationData as any)?.adminNotes || '').trim() ||
          String(adminIntakeNotes || '').trim(),
        notes:
          String((pushApplicationData as any)?.notes || '').trim() ||
          String(adminIntakeNotes || '').trim(),
        caspioCalAIMStatus: String(derivedCaspioCalAIMStatus || '').trim(),
        kaiserStatus: requestedKaiserStatus,
        holdForSocialWorkerStatus: requestedSocialWorkerHold,
      },
      mapping: mappingOverride || caspioMappingPreview || null,
      mappingDraftMeta: caspioMappingDraftMeta || null,
      skeletonPush: skeletonPushEnabled,
      updateExistingOnly: isAlreadySent ? true : updateExistingCaspioOnly,
    };
    };

    const notifyKaiserManagersIfT2038Ready = async () => {
        if (!firestore) return;
        const normalizedStatus = String(requestedKaiserStatus || '').trim().toLowerCase();
        if (normalizedStatus !== 't2038 request ready') return;
        const applicationId = String(application.id || '').trim();
        if (!applicationId) return;
        try {
            const managerSnap = await getDocs(
                query(collection(firestore, 'users'), where('isKaiserAssignmentManager', '==', true))
            );
            if (managerSnap.empty) return;
            const existingForAppSnap = await getDocs(
                query(collection(firestore, 'staff_notifications'), where('applicationId', '==', applicationId))
            );
            const existingByUser = new Set(
                existingForAppSnap.docs
                    .map((d) => d.data() as any)
                    .filter((n) => String(n?.type || '').trim() === 'kaiser_t2038_request_ready')
                    .map((n) => String(n?.userId || '').trim())
                    .filter(Boolean)
            );
            const memberName = `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() || 'Member';
            const dueDate = new Date();
            dueDate.setHours(17, 0, 0, 0);
            const senderName = String(user?.displayName || user?.email || 'Admin').trim();
            for (const docSnap of managerSnap.docs) {
                const managerUid = String(docSnap.id || '').trim();
                if (!managerUid || existingByUser.has(managerUid)) continue;
                // Action item notification
                await addDoc(collection(firestore, 'staff_notifications'), {
                    userId: managerUid,
                    title: `Kaiser status ready: ${memberName}`,
                    message: `${memberName} was pushed with Kaiser_Status "T2038 Request Ready". Please review and proceed with next actions.`,
                    memberName,
                    applicationId,
                    type: 'kaiser_t2038_request_ready',
                    priority: 'Priority',
                    status: 'Open',
                    isRead: false,
                    requiresStaffAction: true,
                    followUpRequired: true,
                    followUpDate: dueDate.toISOString(),
                    senderName,
                    assignedByUid: String(user?.uid || '').trim() || null,
                    assignedByName: senderName || null,
                    actionUrl: `/admin/applications/${applicationId}`,
                    source: 'application-pathway',
                    timestamp: serverTimestamp(),
                });
                // Tagged daily calendar task for Kaiser manager
                try {
                  const managerData = docSnap.data() as any;
                  const managerName = String(managerData?.displayName || managerData?.firstName || managerUid).trim();
                  await fetch('/api/daily-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: `Kaiser T2038 Ready: ${memberName}`,
                      description: `${memberName} was pushed with Kaiser_Status "T2038 Request Ready". Please review and proceed.`,
                      memberName,
                      healthPlan: 'Kaiser',
                      assignedTo: managerUid,
                      assignedToName: managerName,
                      priority: 'high',
                      dueDate: dueDate.toISOString().split('T')[0],
                      createdBy: String(user?.uid || '').trim(),
                      notes: `Triggered by Caspio push. Assigned by ${senderName}.`,
                      applicationId,
                      applicationLink: `/admin/applications/${applicationId}`,
                      source: 'caspio_kaiser',
                    }),
                  });
                } catch (calendarError) {
                  console.warn('Failed to create Kaiser calendar task:', calendarError);
                }
            }
        } catch (error) {
            console.warn('Failed to send Kaiser manager T2038-ready notification:', error);
        }
    };
    const buildPushApplicationData = (options?: { applicationOverrides?: Record<string, any> }) => {
        const effectiveApplicationData = {
            ...application,
            ...(options?.applicationOverrides || {}),
        };
        const placeholderSuffix = String(application?.id || '').trim().slice(-8) || 'DRAFT';
        const skeletonPlaceholderOverrides = skeletonPushEnabled
          ? {
              memberMediCalNum:
                String((effectiveApplicationData as any)?.memberMediCalNum || '').trim() || '',
              confirmMemberMediCalNum:
                String((effectiveApplicationData as any)?.confirmMemberMediCalNum || '').trim() ||
                String((effectiveApplicationData as any)?.memberMediCalNum || '').trim() ||
                '',
              bestContactFirstName:
                String((effectiveApplicationData as any)?.bestContactFirstName || '').trim() || 'Intake',
              bestContactLastName:
                String((effectiveApplicationData as any)?.bestContactLastName || '').trim() || 'Contact',
              bestContactEmail:
                String((effectiveApplicationData as any)?.bestContactEmail || '').trim() ||
                `intake+${placeholderSuffix.toLowerCase()}@example.com`,
              bestContactPhone:
                String((effectiveApplicationData as any)?.bestContactPhone || '').trim() || '9999999999',
              preAssessmentCareNeedsNotes:
                String((effectiveApplicationData as any)?.preAssessmentCareNeedsNotes || '').trim() ||
                prePushNotes ||
                'Initial skeleton intake pushed for assignment workflow. Full details pending.',
            }
          : {};
        return {
          ...effectiveApplicationData,
          ...skeletonPlaceholderOverrides,
        };
    };
    const sendToCaspio = async (
        mappingOverride?: Record<string, string> | null,
        options?: { applicationOverrides?: Record<string, any> }
    ) => {
        const pushApplicationData = buildPushApplicationData(options);
        if (!hasAssignedStaff) {
            toast({
                variant: 'destructive',
                title: 'Staff assignment required',
                description: 'Assign staff before pushing this application to Caspio.',
            });
            return;
        }
        if (!hasCalAimStatusAssigned) {
            toast({
                variant: 'destructive',
                title: 'CalAIM status required',
                description: 'Select CalAIM Status (Authorized or Pending) before pushing to Caspio.',
            });
            return;
        }
        if (isKaiserHealthPlan && !isRequiredKaiserStatusSelectedForPush) {
            toast({
                variant: 'destructive',
                title: 'Kaiser status required for Caspio push',
                description:
                  'Select Kaiser Status first: "T2038 Received, Need First Contact", "T2038 Received, doc collection", "T2038, Not Requested, Doc Collection", or "T2038 Requested".',
                duration: 4000,
            });
            return;
        }
        if (isKaiserHealthPlan && !isValidKaiserMrnSelectedForPush) {
            toast({
                variant: 'destructive',
                title: 'Kaiser MRN required for Caspio push',
                description: KAISER_MRN_CASPIO_PUSH_HELP,
                duration: 5000,
            });
            return;
        }
        const recordNotesPush = async (params: { mode: 'member-push' | 'notes-only'; clientId2?: string; noteSyncReason?: string }) => {
            if (!docRef) return;
            const pushedByName = String(user?.displayName || user?.email || 'Admin').trim();
            const pushedByEmail = String(user?.email || '').trim();
            const pushedByUid = String(user?.uid || '').trim();
            const normalizedNotes = String(prePushNotes || '').trim();
            if (!normalizedNotes) return;
            await setDoc(
              docRef,
              {
                caspioNotesLastPushedAt: serverTimestamp(),
                caspioNotesLastPushedByName: pushedByName || null,
                caspioNotesLastPushedByEmail: pushedByEmail || null,
                caspioNotesLastPushedByUid: pushedByUid || null,
                caspioNotesLastPushedClientId2: String(params.clientId2 || '').trim() || null,
                caspioNotesPushHistory: arrayUnion({
                  pushedAtIso: new Date().toISOString(),
                  mode: params.mode,
                  clientId2: String(params.clientId2 || '').trim() || null,
                  noteSyncReason: String(params.noteSyncReason || '').trim() || null,
                  pushedByName: pushedByName || null,
                  pushedByEmail: pushedByEmail || null,
                  pushedByUid: pushedByUid || null,
                  notes: normalizedNotes,
                }),
                lastUpdated: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => undefined);
        };
        if (isDraftLikeForPush && !skeletonPushEnabled && !prePushNotes) {
            toast({
                variant: 'destructive',
                title: 'Notes required',
                description: 'Add notes in Quick Actions before pushing this draft to Caspio.',
            });
            return;
        }
        setIsSendingToCaspio(true);
        if (docRef) {
            await setDoc(
                docRef,
                {
                    caspioPushLastAttemptAt: serverTimestamp(),
                    caspioPushLastStatus: 'pending',
                    caspioPushLastError: null,
                    caspioPushLastErrorCode: null,
                    caspioPushLastErrorDetails: null,
                    lastUpdated: serverTimestamp(),
                },
                { merge: true }
            ).catch(() => undefined);
        }
        try {
            const pushedByName = String(user?.displayName || user?.email || 'Admin').trim();
            const pushedByEmail = String(user?.email || '').trim();
            const pushedByUid = String(user?.uid || '').trim();
            const requestBody = buildCaspioPushRequestBody(pushApplicationData, mappingOverride);
            const response = await fetch('/api/admin/caspio/push-cs-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            const result = await response.json().catch(() => ({} as any));
            if (!response.ok || !result?.success) {
                const details = result?.details || null;
                throw {
                    code: result?.code || 'internal',
                    message: result?.message || 'Failed to publish to Caspio.',
                    details,
                };
            }

            const data = result as any;
            if (data?.success) {
                const resolvedDraftMeta = (data?.mappingDraftMeta || caspioMappingDraftMeta || null) as Record<string, any> | null;
                const draftName = String(resolvedDraftMeta?.draftName || '').trim();
                const savedAtIso = String(resolvedDraftMeta?.savedAtIso || '').trim();
                const savedAtLabel = savedAtIso
                  ? new Date(savedAtIso).toLocaleString()
                  : '';
                const mappingDraftMessage =
                  draftName && savedAtLabel
                    ? `Using mapping draft "${draftName}" (saved ${savedAtLabel}).`
                    : draftName
                      ? `Using mapping draft "${draftName}".`
                      : savedAtLabel
                        ? `Using locked mapping saved ${savedAtLabel}.`
                        : '';
                toast({
                    title: data?.alreadyExists
                      ? 'Record already created in Caspio'
                      : isAlreadySent
                        ? 'CS Summary updates pushed'
                        : 'Pushed to Caspio',
                    description: [data.message || 'Successfully published to Caspio.', mappingDraftMessage].filter(Boolean).join(' '),
                    className: data?.alreadyExists
                      ? 'bg-amber-100 text-amber-900 border-amber-200'
                      : 'bg-green-100 text-green-900 border-green-200',
                });
                const noteSync = (data?.noteSync || null) as Record<string, any> | null;
                const noteSyncReason = String(noteSync?.reason || '').trim();
                if (noteSync && noteSyncReason !== 'no-pre-push-notes') {
                    if (noteSync?.success && !noteSync?.skipped) {
                        await recordNotesPush({
                          mode: 'member-push',
                          clientId2: String(data?.clientId2 || '').trim(),
                          noteSyncReason,
                        });
                        toast({
                            title: 'Notes synced',
                            description: 'Notes were also added to Caspio client notes.',
                            className: 'bg-green-100 text-green-900 border-green-200',
                        });
                    } else if (noteSyncReason === 'missing-client-id2') {
                        toast({
                            variant: 'destructive',
                            title: 'Notes sync skipped',
                            description: 'Member push succeeded, but notes could not be added to Caspio client notes because Client_ID2 was missing.',
                        });
                    } else if (noteSyncReason === 'insert-failed') {
                        toast({
                            variant: 'destructive',
                            title: 'Notes sync failed',
                            description: 'Member push succeeded, but adding notes to Caspio client notes failed. Please retry push/manage after checking Caspio notes table access.',
                        });
                    }
                }

                if (docRef) {
                    const shouldPromoteFromDraft =
                      String((application as any)?.status || '').trim().toLowerCase() === 'draft';
                    const effectiveMapping = (mappingOverride || caspioMappingPreview || {}) as Record<string, string>;
                    const pushedMappedSnapshot: Record<string, string> = {};
                    const pushedSpecialSnapshot: Record<string, string> = {
                        CalAIM_Status: String(derivedCaspioCalAIMStatus || '').trim(),
                        Kaiser_Status: String(requestedKaiserStatus || '').trim(),
                        Hold_For_Social_Worker_Visit: String(requestedSocialWorkerHold || '').trim(),
                        Monthly_Income: String(
                          (application as any)?.proofIncomeActualAmount ||
                          (application as any)?.monthlyIncome ||
                          ''
                        ).trim(),
                        Pre_Assessment_Care_Needs_Notes: prePushNotes,
                    };
                    if (effectiveMapping && typeof effectiveMapping === 'object') {
                        Object.entries(effectiveMapping).forEach(([csField, caspioField]) => {
                            pushedMappedSnapshot[String(caspioField)] = String((application as any)?.[csField] ?? '').trim();
                        });
                    }
                    await setDoc(
                        docRef,
                        {
                            clientId2: String(data?.clientId2 || '').trim() || null,
                            client_ID2: String(data?.clientId2 || '').trim() || null,
                            caspioClientId2: String(data?.clientId2 || '').trim() || null,
                            caspioSent: true,
                            caspioSentDate: serverTimestamp(),
                            caspioSentByName: pushedByName || null,
                            caspioSentByEmail: pushedByEmail || null,
                            caspioSentByUid: pushedByUid || null,
                            caspioPushLastStatus: 'success',
                            caspioPushLastError: null,
                            caspioPushLastErrorCode: null,
                            caspioPushLastErrorDetails: null,
                            caspioLastPushedMappedData: pushedMappedSnapshot,
                            caspioLastPushedMappingCount: Object.keys(pushedMappedSnapshot).length,
                            caspioLastPushedSpecialData: pushedSpecialSnapshot,
                            caspioLastPushedMappingDraftName: draftName || null,
                            caspioLastPushedMappingDraftSavedAt: savedAtIso || null,
                            caspioLastPushedAt: serverTimestamp(),
                            memberActionLog: arrayUnion(
                              buildMemberActionLogEntry({
                                actionKey: MEMBER_ACTION_KEYS.caspioPush,
                                label: isAlreadySent
                                  ? 'Pushed CS Summary updates to Caspio'
                                  : 'Pushed CS Summary to Caspio',
                                byName: pushedByName || null,
                                byEmail: pushedByEmail || null,
                                byUid: pushedByUid || null,
                                details: String(data?.clientId2 || '').trim()
                                  ? `Client_ID2 ${String(data?.clientId2 || '').trim()}`
                                  : null,
                              })
                            ),
                            createdByAdmin: false,
                            allowDraftCaspioPush: false,
                            ...(shouldPromoteFromDraft ? { status: 'In Progress' } : {}),
                            lastUpdated: serverTimestamp(),
                        },
                        { merge: true }
                    );
                    // Drop this member from consolidator "New / not in Caspio" lists.
                    if (firestore) {
                      try {
                        await markIlsMifMemberPushedToCaspio(firestore, {
                          memberFirstName: String((application as any)?.memberFirstName || '').trim(),
                          memberLastName: String((application as any)?.memberLastName || '').trim(),
                          memberMrn: String((application as any)?.memberMrn || '').trim(),
                          memberMediCalNum: String(
                            (application as any)?.memberMediCalNum ||
                              (application as any)?.Medical_Number ||
                              ''
                          ).trim(),
                          memberDob: String((application as any)?.memberDob || '').trim(),
                          clientId2: String(data?.clientId2 || '').trim(),
                          consolidatorRunId: String((application as any)?.consolidatorRunId || '').trim(),
                          ilsMifDedupeKey: String((application as any)?.ilsMifDedupeKey || '').trim(),
                          applicationId: String(application?.id || '').trim(),
                          actor: pushedByEmail || pushedByName || pushedByUid || '',
                        });
                      } catch (consolidatorSyncError) {
                        console.warn(
                          'Caspio push succeeded, but consolidator New-list sync failed:',
                          consolidatorSyncError
                        );
                      }
                    }
                    await notifyKaiserManagersIfT2038Ready();
                }
                setIsOpen(false);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Caspio Error',
                    description: data?.message || 'Failed to publish to Caspio.',
                });
            }
        } catch (error: any) {
            let errorMessage = 'Failed to send to Caspio';
            let safeCode = '';
            let safeMessage = '';
            let details: any = null;
            try {
              safeCode = String(error?.code || '').trim();
            } catch {
              safeCode = '';
            }
            try {
              safeMessage = String(error?.message || '').trim();
            } catch {
              safeMessage = '';
            }
            try {
              details = error?.details ?? null;
            } catch {
              details = null;
            }

            if (safeCode === 'functions/already-exists' || safeCode === 'caspio-duplicate-or-blank') {
                errorMessage = safeMessage || 'This member already exists in Caspio. Try updating the existing profile instead of creating a new row.';
            } else if (safeCode === 'caspio-auth-failed' || safeCode === 'functions/failed-precondition') {
                errorMessage =
                  safeMessage ||
                  'Caspio credentials were rejected. Update CASPIO_CLIENT_ID / CASPIO_CLIENT_SECRET and restart the server.';
            } else if (safeMessage) {
                errorMessage = safeMessage;
            } else if (details && typeof details === 'object') {
                const caspioStatus = String((details as any)?.caspioStatus || '').trim();
                const caspioError = String((details as any)?.caspioError || '').trim();
                const rawError = String((details as any)?.rawError || '').trim();
                let parsedCaspioMessage = '';
                try {
                  const parsed = JSON.parse(caspioError);
                  parsedCaspioMessage = String(parsed?.Message || parsed?.message || '').trim();
                } catch {
                  parsedCaspioMessage = '';
                }
                errorMessage =
                  parsedCaspioMessage ||
                  rawError ||
                  (caspioStatus ? `Caspio rejected this push (HTTP ${caspioStatus}).` : 'Caspio push failed.');
            }
            // Use warn so Next.js dev overlay does not interrupt staff workflow on handled push failures.
            console.warn('Caspio push error details:', error);
            if (docRef) {
                await setDoc(
                    docRef,
                    {
                        // Don't retain failed-push details between attempts.
                        caspioPushLastStatus: 'idle',
                        caspioPushLastError: null,
                        caspioPushLastErrorCode: null,
                        caspioPushLastErrorDetails: null,
                        lastUpdated: serverTimestamp(),
                    },
                    { merge: true }
                ).catch(() => undefined);
            }
            toast({ variant: 'destructive', title: 'Error', description: errorMessage });
            return;
        } finally {
            setIsSendingToCaspio(false);
        }
    };

    useEffect(() => {
      if (!isOpen) {
        setConfirmOverwriteAck(false);
        setPushOverwritePreviewError('');
        setPushOverwritePreviewItems([]);
        setIsLoadingPushOverwritePreview(false);
        return;
      }
      if (isAlreadySent || hasExistingClientId2) {
        setUpdateExistingCaspioOnly(true);
      }
      if (!isAlreadySent) return;

      let cancelled = false;
      const loadOverwritePreview = async () => {
        setIsLoadingPushOverwritePreview(true);
        setPushOverwritePreviewError('');
        setConfirmOverwriteAck(false);
        try {
          const response = await fetch('/api/admin/caspio/pull-cs-summary-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationData: application,
              mapping: caspioMappingPreview || null,
            }),
          });
          const data = (await response.json().catch(() => ({}))) as any;
          if (!response.ok || !data?.success) {
            throw new Error(String(data?.error || data?.message || `Preview failed (HTTP ${response.status})`));
          }
          const items = Array.isArray(data?.preview?.items) ? data.preview.items : [];
          const mapped = items.map((item: any) => {
            const appValue = String(item?.currentValue || '').trim();
            const caspioValue = String(item?.incomingValue || '').trim();
            let status: 'overwrite_caspio' | 'unchanged' | 'app_empty' | 'caspio_empty_fill' = 'unchanged';
            if (!appValue && !caspioValue) status = 'unchanged';
            else if (!appValue && caspioValue) status = 'app_empty';
            else if (appValue && !caspioValue) status = 'caspio_empty_fill';
            else if (appValue !== caspioValue) status = 'overwrite_caspio';
            return {
              csField: String(item?.targetCsField || item?.csField || '').trim(),
              caspioField: String(item?.caspioField || '').trim(),
              appValue,
              caspioValue,
              status,
            };
          });
          if (!cancelled) setPushOverwritePreviewItems(mapped);
        } catch (error: any) {
          if (!cancelled) {
            setPushOverwritePreviewError(String(error?.message || 'Unable to load Caspio comparison preview.'));
            // Fall back to last-push snapshot diffs when live Caspio compare is unavailable.
            const fallback = [...effectiveMappedFieldChanges, ...specialFieldChanges].map((item) => ({
              csField: item.field,
              caspioField: item.field,
              appValue: item.nextValue,
              caspioValue: item.previousValue,
              status:
                item.nextValue === item.previousValue
                  ? ('unchanged' as const)
                  : !item.nextValue
                    ? ('app_empty' as const)
                    : !item.previousValue
                      ? ('caspio_empty_fill' as const)
                      : ('overwrite_caspio' as const),
            }));
            setPushOverwritePreviewItems(fallback);
          }
        } finally {
          if (!cancelled) setIsLoadingPushOverwritePreview(false);
        }
      };
      void loadOverwritePreview();
      return () => {
        cancelled = true;
      };
    }, [isOpen, isAlreadySent, hasExistingClientId2, application, caspioMappingPreview]);
    const resetCaspioPush = async (options?: { closeDialog?: boolean; showToast?: boolean }) => {
        if (!docRef) return;
        const closeDialog = options?.closeDialog ?? true;
        const showToast = options?.showToast ?? true;
        setIsResettingCaspio(true);
        try {
            await setDoc(
                docRef,
                {
                    caspioSent: false,
                    caspioSentDate: null,
                    caspioSentByName: null,
                    caspioSentByEmail: null,
                    caspioSentByUid: null,
                    caspioPushLastStatus: 'reset',
                    caspioPushLastError: null,
                    caspioPushLastErrorCode: null,
                    caspioPushLastErrorDetails: null,
                    lastUpdated: serverTimestamp(),
                },
                { merge: true }
            );
            if (showToast) {
                toast({
                    title: 'Caspio push reset',
                    description: 'Push status was reset. You can push this application to Caspio again.',
                    className: 'bg-green-100 text-green-900 border-green-200',
                });
            }
            if (closeDialog) {
                setIsOpen(false);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Reset failed',
                description: error?.message || 'Could not reset Caspio push status.',
            });
        } finally {
            setIsResettingCaspio(false);
        }
    };
    const resetAndPushToCaspio = async () => {
        if (!docRef) return;
        try {
            await resetCaspioPush({ closeDialog: false, showToast: false });
            toast({
                title: 'Caspio push reset',
                description: 'Status reset complete. Starting fresh Caspio push...',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
            await sendToCaspio(caspioMappingPreview, {
                applicationOverrides: {
                    caspioSent: false,
                    caspioSentDate: null,
                    caspioSentByName: null,
                    caspioSentByEmail: null,
                    caspioSentByUid: null,
                    clientId2: '',
                    client_ID2: '',
                    caspioClientId2: '',
                },
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Reset and push failed',
                description: error?.message || 'Could not reset and push to Caspio.',
            });
        }
    };
    const pushPrePushNotesOnly = async () => {
        const resolvedClientId2 = notesPushClientId2;
        if (!resolvedClientId2) {
          toast({
            variant: 'destructive',
            title: 'Client_ID2 required',
            description: 'Create/push the Caspio member record first so notes can be sent separately.',
          });
          return;
        }
        if (!prePushNotes) {
          toast({
            variant: 'destructive',
            title: 'Notes required',
            description: 'Add notes before sending notes-only update to Caspio.',
          });
          return;
        }
        setIsPushingNotesOnly(true);
        try {
          const response = await fetch('/api/admin/caspio/push-cs-summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notesOnly: true,
              applicationData: {
                ...application,
                clientId2: resolvedClientId2,
                client_ID2: resolvedClientId2,
                caspioClientId2: resolvedClientId2,
                // Updated notes only — API also strips original ILS/MIF dump when already pushed.
                preAssessmentCareNeedsNotes: String(prePushNotes || '').trim(),
                pre_assessment_care_needs_notes: String(prePushNotes || '').trim(),
                Pre_Assessment_Care_Needs_Notes: String(prePushNotes || '').trim(),
                adminNotes: originalIlsNotesAlreadyPushed
                  ? ''
                  : String(adminIntakeNotes || '').trim(),
                notes: originalIlsNotesAlreadyPushed ? '' : String(adminIntakeNotes || '').trim(),
                caspioNotesLastPushedAt: (application as any)?.caspioNotesLastPushedAt || null,
                caspioSent: Boolean((application as any)?.caspioSent),
              },
            }),
          });
          const result = await response.json().catch(() => ({} as any));
          if (!response.ok || !result?.success) {
            const syncError = String(result?.noteSync?.error || '').trim();
            const details = syncError || String(result?.message || '').trim();
            throw new Error(details || 'Failed to push notes to Caspio.');
          }
          if (docRef) {
            const pushedByName = String(user?.displayName || user?.email || 'Admin').trim();
            const pushedByEmail = String(user?.email || '').trim();
            const pushedByUid = String(user?.uid || '').trim();
            await setDoc(
              docRef,
              {
                caspioNotesLastPushedAt: serverTimestamp(),
                caspioNotesLastPushedByName: pushedByName || null,
                caspioNotesLastPushedByEmail: pushedByEmail || null,
                caspioNotesLastPushedByUid: pushedByUid || null,
                caspioNotesLastPushedClientId2: resolvedClientId2,
                caspioNotesPushHistory: arrayUnion({
                  pushedAtIso: new Date().toISOString(),
                  mode: 'notes-only',
                  clientId2: resolvedClientId2,
                  noteSyncReason: String(result?.noteSync?.reason || 'inserted').trim() || null,
                  pushedByName: pushedByName || null,
                  pushedByEmail: pushedByEmail || null,
                  pushedByUid: pushedByUid || null,
                  notes: String(prePushNotes || '').trim(),
                }),
                lastUpdated: serverTimestamp(),
              },
              { merge: true }
            );
          }
          toast({
            title: 'Notes pushed to Caspio',
            description: 'Notes were added to Caspio client notes for this member.',
            className: 'bg-green-100 text-green-900 border-green-200',
          });
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Notes push failed',
            description: String(error?.message || 'Could not push notes to Caspio.'),
          });
        } finally {
          setIsPushingNotesOnly(false);
        }
    };
    const clearStaleClientId2 = async () => {
        if (!docRef) return;
        setIsClearingClientId2(true);
        try {
            await setDoc(
                docRef,
                {
                    clientId2: null,
                    client_ID2: null,
                    caspioClientId2: null,
                    caspioPushLastStatus: 'reset',
                    lastUpdated: serverTimestamp(),
                },
                { merge: true }
            );
            setClientId2ClearedLocally(true);
            toast({
                title: 'Client_ID2 cleared',
                description: 'Local Client_ID2 was cleared. You can push again now.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Could not clear Client_ID2',
                description: error?.message || 'Failed to clear local Client_ID2.',
            });
        } finally {
            setIsClearingClientId2(false);
        }
    };

    /** After Caspio Clients + CalAIM Members rows are deleted, unlock a fresh create push. */
    const prepareFreshCaspioPushAfterDeletion = async () => {
        if (!docRef) return;
        const ok = await appConfirm(
          'Confirm you deleted this member in Caspio (Clients table and CalAIM Members).\n\nThis will:\n• Clear local Client_ID2\n• Reset “already pushed” status\n\nThen you can Confirm & Push to create new Caspio records.'
        );
        if (!ok) return;
        setIsResettingCaspio(true);
        setIsClearingClientId2(true);
        try {
            await setDoc(
                docRef,
                {
                    caspioSent: false,
                    caspioSentDate: null,
                    caspioSentByName: null,
                    caspioSentByEmail: null,
                    caspioSentByUid: null,
                    clientId2: null,
                    client_ID2: null,
                    caspioClientId2: null,
                    caspioPushLastStatus: 'reset_for_fresh_push',
                    caspioPushLastError: null,
                    caspioPushLastErrorCode: null,
                    caspioPushLastErrorDetails: null,
                    lastUpdated: serverTimestamp(),
                },
                { merge: true }
            );
            setClientId2ClearedLocally(true);
            setConfirmOverwriteAck(false);
            setUpdateExistingCaspioOnly(false);
            toast({
                title: 'Ready to push again',
                description:
                  'Push status and Client_ID2 were cleared. Review readiness, then Confirm & Push to create new Caspio records.',
                className: 'bg-green-100 text-green-900 border-green-200',
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Could not unlock fresh push',
                description: error?.message || 'Failed to reset Caspio push status.',
            });
        } finally {
            setIsResettingCaspio(false);
            setIsClearingClientId2(false);
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
                <Button
                  variant={buttonVariant}
                  className={buttonClassName}
                  disabled={
                    isSendingToCaspio ||
                    isResettingCaspio ||
                    isPushingNotesOnly ||
                    hardPushGateBlocked
                  }
                  title={pushGateBlockedTitle}
                >
                    {isSendingToCaspio || isResettingCaspio ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isResettingCaspio ? 'Resetting Caspio status...' : 'Pushing to Caspio...'}
                        </>
                    ) : isAlreadySent ? (
                        <>
                            <Database className="mr-2 h-4 w-4 text-sky-600" />
                            <span className="qa-label">Push CS Summary updates</span>
                            <span className="ml-auto inline-flex shrink-0">
                              <QaDoneMeta done atMs={caspioSentAtMs || undefined} />
                            </span>
                        </>
                    ) : (
                        <>
                            <Database className="mr-2 h-4 w-4 text-sky-600" />
                            <span className="qa-label">Push to Caspio</span>
                        </>
                    )}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {isAlreadySent ? 'Push CS Summary updates to Caspio' : 'Confirm push to Caspio'}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {isAlreadySent
                          ? 'Re-send current CS Summary form values into the existing Caspio member record (`CalAIM_tbl_Members`) using the locked mapping. This does not create a new Caspio row.'
                          : 'This will publish CS Summary fields into `CalAIM_tbl_Members` using the locked mapping.'}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <Alert className="border-blue-200 bg-blue-50 text-blue-900">
                    <AlertTitle>Mapping draft/version used for this push</AlertTitle>
                    <AlertDescription className="space-y-1">
                        <div>{mappingSourceLabel}</div>
                        <div>
                            {mappingDraftName
                              ? `Draft: ${mappingDraftName}`
                              : 'Draft: Not named (using currently locked mapping)'}
                        </div>
                        <div>
                            {mappingDraftSavedAtLabel
                              ? `Draft saved: ${mappingDraftSavedAtLabel}`
                              : 'Draft saved time: Not available'}
                        </div>
                        <div className="text-xs text-blue-800">
                            Push uses the latest locked draft version available at the time you open this dialog.
                        </div>
                    </AlertDescription>
                </Alert>
                {!mappingDraftSavedAtLabel ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Mapping saved time is missing</AlertTitle>
                        <AlertDescription className="space-y-2">
                            <div>
                                This looks like an older locked mapping without timestamp metadata. Go to
                                <strong> Admin {'>'} Caspio Test</strong>, update mappings, click
                                <strong> Save Draft</strong>, then <strong>Mapping Lock Actions {'>'} Lock Mappings</strong>
                                before pushing.
                            </div>
                            <Button asChild size="sm" variant="outline">
                                <Link href="/admin/caspio-test">Update New Mappings</Link>
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

                {isAlreadySent && (
                    <Alert className="border-sky-200 bg-sky-50 text-sky-950">
                        <AlertTitle>Sync direction: Application → Caspio</AlertTitle>
                        <AlertDescription className="space-y-1 text-xs">
                            <div>
                                This updates the existing Caspio member in place from the CS Summary / application values.
                                Caspio fields listed below will be overwritten where they differ.
                            </div>
                            <div>
                                To copy Caspio values into the app instead, use <strong>Precheck Caspio → CS Summary pull</strong>.
                            </div>
                        </AlertDescription>
                    </Alert>
                )}
                {isAlreadySent ? (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Need to push as new after deleting Caspio records?</AlertTitle>
                        <AlertDescription className="space-y-2 text-xs">
                            <div>
                                This application is marked already pushed
                                {existingClientId2Raw ? (
                                  <>
                                    {' '}
                                    (Client_ID2: <span className="font-mono">{existingClientId2Raw}</span>)
                                  </>
                                ) : null}
                                . Update-only push will fail if the Caspio rows were deleted.
                            </div>
                            <div>
                                After you delete the member in Caspio Clients and CalAIM Members, unlock a fresh create:
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                                onClick={() => {
                                    void prepareFreshCaspioPushAfterDeletion();
                                }}
                                disabled={
                                  isClearingClientId2 ||
                                  isSendingToCaspio ||
                                  isResettingCaspio ||
                                  isPushingNotesOnly
                                }
                            >
                                {(isClearingClientId2 || isResettingCaspio) ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                I deleted Caspio records — push again as new
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : null}
                {hasExistingClientId2 && !isAlreadySent && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Client_ID2 already exists: {existingClientId2}</AlertTitle>
                        <AlertDescription className="space-y-2">
                            <div>{clientIdConflictWarning}</div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    void clearStaleClientId2();
                                }}
                                disabled={isClearingClientId2 || isSendingToCaspio || isResettingCaspio}
                            >
                                {isClearingClientId2 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                I deleted Caspio records - clear local Client_ID2
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                {!hasExistingClientId2 && clientId2ClearedLocally && !isAlreadySent && (
                    <Alert className="border-green-200 bg-green-50 text-green-900">
                        <CheckCircle2 className="h-4 w-4 text-green-700" />
                        <AlertTitle>Client_ID2 cleared</AlertTitle>
                        <AlertDescription>
                            Local Client_ID2 was cleared successfully. You can push to Caspio again now.
                        </AlertDescription>
                    </Alert>
                )}
                {!hasAssignedStaff && (
                    <Alert variant="destructive">
                        <AlertTitle>Staff assignment required</AlertTitle>
                        <AlertDescription>
                            Assign staff in this application before pushing to Caspio.
                        </AlertDescription>
                    </Alert>
                )}
                {isKaiserHealthPlan && !isRequiredKaiserStatusSelectedForPush ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Kaiser Status required</AlertTitle>
                        <AlertDescription>
                            This application cannot be pushed to Caspio until Kaiser Status is determined.
                            Choose one of: {REQUIRED_PRE_PUSH_KAISER_STATUSES.join('; ')}.
                        </AlertDescription>
                    </Alert>
                ) : null}
                {isKaiserHealthPlan && !isValidKaiserMrnSelectedForPush ? (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Kaiser MRN must start with 0 or 1</AlertTitle>
                        <AlertDescription>
                            {KAISER_MRN_CASPIO_PUSH_HELP}
                            {memberMrnForKaiserPush
                              ? ` Current MRN: ${memberMrnForKaiserPush}.`
                              : ' No Kaiser MRN is set on this application.'}
                        </AlertDescription>
                    </Alert>
                ) : null}
                <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Caspio push readiness</div>
                        <Badge variant={readinessComplete ? 'default' : 'secondary'}>
                            {readinessComplete ? 'Ready' : `${missingRequiredReadiness.length} required field(s) missing`}
                        </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {readinessChecks.map((item) => (
                            <div key={item.key} className={cn('flex items-center justify-between gap-2', item.ready ? 'text-green-700' : item.required ? 'text-red-700' : 'text-muted-foreground')}>
                                <span>{item.label}{item.required ? ' *' : ''}</span>
                                <span>{item.ready ? 'OK' : item.required ? 'Missing' : 'Optional'}</span>
                            </div>
                        ))}
                    </div>
                    {!readinessComplete ? (
                        <div className="text-xs text-red-700">
                            Fill all required items above before pushing to Caspio.
                        </div>
                    ) : null}
                    {allowDraftCaspioPush ? (
                        <div className="text-xs text-muted-foreground">
                            Draft push mode is enabled for this intake. Authorization fields and CS Summary completion are optional so you can publish early and manage Kaiser status while details are still being completed.
                        </div>
                    ) : null}
                    {skeletonPushEnabled ? (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                          Skeleton push mode is enabled. Missing contact values will be auto-filled with temporary placeholders so staff can push and assign early.
                        </div>
                    ) : null}
                    <label className="flex items-start gap-2 rounded-md border p-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={isAlreadySent ? true : updateExistingCaspioOnly}
                          disabled={isAlreadySent}
                          onChange={(e) => setUpdateExistingCaspioOnly(e.target.checked)}
                        />
                        <span>
                          Update existing Caspio profile only (do not create new row). If no existing Caspio member is found by Client_ID2, MRN, or Medical Number, push will stop.
                          {isAlreadySent ? ' This is locked ON because this application was already pushed to Caspio.' : ''}
                        </span>
                    </label>
                    <div className="text-xs text-muted-foreground">
                        {skeletonPushEnabled
                          ? 'For skeletons, temporary contact placeholders are used until real family/POA details are completed.'
                          : 'Contact person name, email, and phone are required before push so automatic reminder outreach has a valid recipient.'}
                    </div>
                    {isDraftLikeForPush ? (
                        <div className="text-xs text-muted-foreground">
                            Draft push requires notes so care needs/context are included with the Caspio update.
                        </div>
                    ) : null}
                </div>
                {isAlreadySent ? (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                    <AlertTitle>
                      Fields Caspio will overwrite: {isLoadingPushOverwritePreview ? '…' : pushOverwriteWillChangeItems.length}
                    </AlertTitle>
                    <AlertDescription className="space-y-2 text-xs">
                      <div>
                        Review differences before confirming. Left = current Caspio value; right = application value that will be written.
                      </div>
                      {pushOverwritePreviewError ? (
                        <div className="rounded border border-amber-300 bg-white px-2 py-1 text-amber-900">
                          Live Caspio compare unavailable ({pushOverwritePreviewError}). Showing last-push snapshot differences instead.
                        </div>
                      ) : null}
                      {isLoadingPushOverwritePreview ? (
                        <div className="flex items-center gap-2 text-amber-900">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Comparing application fields with Caspio…
                        </div>
                      ) : pushOverwriteWillChangeItems.length === 0 ? (
                        <div className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-700">
                          No differing mapped fields found. Confirm &amp; Push will still re-send current non-empty mapped values to keep Caspio in sync.
                        </div>
                      ) : (
                        <div className="max-h-[280px] overflow-auto rounded border border-amber-200 bg-white text-foreground">
                          <div className="grid grid-cols-4 gap-2 border-b bg-amber-100/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                            <div>Field</div>
                            <div>Caspio (now)</div>
                            <div>App (will write)</div>
                            <div>Action</div>
                          </div>
                          {pushOverwriteWillChangeItems.slice(0, 60).map((item, index) => (
                            <div
                              key={`overwrite-${item.csField}-${item.caspioField}-${index}`}
                              className="grid grid-cols-4 gap-2 border-b px-2 py-1.5 text-[11px]"
                            >
                              <div>
                                <div className="font-medium truncate" title={item.csField}>
                                  {item.csField || '(field)'}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate" title={item.caspioField}>
                                  {item.caspioField}
                                </div>
                              </div>
                              <div className="truncate text-red-700" title={item.caspioValue || '(empty)'}>
                                {item.caspioValue || '(empty)'}
                              </div>
                              <div className="truncate text-green-800" title={item.appValue || '(empty)'}>
                                {item.appValue || '(empty)'}
                              </div>
                              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-800">
                                {item.status === 'caspio_empty_fill' ? 'Fill Caspio' : 'Overwrite Caspio'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {pushOverwritePreviewItems.some((item) => item.status === 'app_empty' && item.caspioValue) ? (
                        <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-900">
                          Some Caspio fields have values while the app field is empty. This push will not clear those Caspio values.
                          Use <strong>Precheck Caspio → CS Summary pull</strong> if you want to bring those into the app.
                        </div>
                      ) : null}
                      <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-white p-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={confirmOverwriteAck}
                          onChange={(e) => setConfirmOverwriteAck(e.target.checked)}
                        />
                        <span>
                          I reviewed the fields above and confirm Caspio should be updated from the application / CS Summary values.
                        </span>
                      </label>
                    </AlertDescription>
                  </Alert>
                ) : (
                <Alert className="border-sky-200 bg-sky-50 text-sky-950">
                    <AlertTitle>
                        Fields this push will send: {pushFieldsPreview.length}
                    </AlertTitle>
                    <AlertDescription className="space-y-2 text-xs">
                        <div>
                            Review the Caspio destinations below before confirming. Empty mapped fields are skipped.
                            Primary contact email is written to Authorized_Party_Email and Best_Contact_Email when present.
                        </div>
                        {pushFieldsPreview.length === 0 ? (
                            <div className="font-medium text-sky-900">
                                No non-empty mapped values are ready to push yet.
                            </div>
                        ) : (
                            <div className="max-h-[240px] overflow-auto rounded border border-sky-200 bg-white text-foreground">
                                <div className="grid grid-cols-3 gap-2 border-b bg-sky-50/80 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                                    <div>App / CS field</div>
                                    <div>Caspio field(s)</div>
                                    <div>Value</div>
                                </div>
                                {pushFieldsPreview.map((row, index) => (
                                    <div
                                        key={`push-preview-${row.label}-${row.caspioField}-${index}`}
                                        className="grid grid-cols-3 gap-2 border-b px-2 py-1.5 text-[11px]"
                                    >
                                        <div>
                                            <div className="font-medium">{row.label}</div>
                                            <div className="text-[10px] text-muted-foreground">{row.group}</div>
                                        </div>
                                        <div className="text-muted-foreground">{row.caspioField}</div>
                                        <div className="truncate" title={row.value}>
                                            {row.value.length > 120 ? `${row.value.slice(0, 120)}…` : row.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </AlertDescription>
                </Alert>
                )}

                <Alert>
                    <AlertTitle>{isAlreadySent ? 'Ready to push updates' : 'Ready to push'}</AlertTitle>
                    <AlertDescription>
                        {isAlreadySent
                          ? 'Confirming will update the existing Caspio member with the application values shown above (update-only; no new row).'
                          : 'Confirming will write the fields listed above into `CalAIM_tbl_Members` (and related client notes) using the active locked mapping.'}
                    </AlertDescription>
                </Alert>

                <AlertDialogFooter>
                    {notesPushClientId2 ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                void pushPrePushNotesOnly();
                            }}
                            disabled={isPushingNotesOnly || isResettingCaspio || isSendingToCaspio || !prePushNotes}
                        >
                            {isPushingNotesOnly ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Push notes
                        </Button>
                    ) : null}
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            void (async () => {
                              try {
                                await sendToCaspio(caspioMappingPreview);
                              } catch (error) {
                                console.warn('Unhandled Caspio push error:', error);
                                toast({
                                  variant: 'destructive',
                                  title: 'Error',
                                  description: 'Unexpected error while pushing to Caspio.',
                                });
                              }
                            })();
                        }}
                        disabled={
                          isPushingNotesOnly ||
                          isSendingToCaspio ||
                          isLoadingPushOverwritePreview ||
                          (hasExistingClientId2 && !isAlreadySent) ||
                          pushGateBlocked ||
                          !readinessComplete ||
                          (isAlreadySent && !confirmOverwriteAck)
                        }
                    >
                        <span className="inline-flex items-center gap-2">
                          <span>Confirm & Push</span>
                          {skeletonPushEnabled ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700">
                              Using placeholders
                            </span>
                          ) : null}
                        </span>
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
