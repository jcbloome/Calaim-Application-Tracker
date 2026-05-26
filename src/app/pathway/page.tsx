
'use client';

import { Suspense, useState, useEffect, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  Info,
  Loader2,
  UploadCloud,
  Send,
  Printer,
  X,
  FileText,
  Package,
  ArrowLeft,
  AlertTriangle,
  MessageSquareHeart,
  RefreshCw,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { useEnhancedToast } from '@/components/ui/enhanced-toast';
import { cn } from '@/lib/utils';
import type { Application, FormStatus as FormStatusType } from '@/lib/definitions';
import { useUser, useFirestore, useMemoFirebase, useStorage } from '@/firebase';
import { useAdmin } from '@/hooks/use-admin';
import { doc, setDoc, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const getPathwayRequirements = (
  pathway: 'SNF Transition' | 'SNF Diversion',
  healthPlan?: string | null
) => {
  const normalizedPathway = String(pathway || '').trim().toLowerCase();
  const commonRequirements = [
    { id: 'cs-summary', title: 'CS Member Summary', description: 'This form MUST be completed online, as it provides the necessary data for the rest of the application.', type: 'online-form', href: '/forms/cs-summary-form/review', icon: FileText },
    { id: 'waivers', title: 'Waivers & Authorizations', description: 'Complete the consolidated HIPAA, Liability, Freedom of Choice, and Room & Board Commitment waiver form.', type: 'online-form', href: '/forms/waivers', icon: FileText },
    { id: 'proof-of-income', title: 'Proof of Income', description: "Upload the most recent Social Security annual award letter or 3 months of recent bank statements.", type: 'Upload', icon: UploadCloud, href: '#' },
    { id: 'lic-602a', title: "LIC 602A - Physician's Report", description: "Download, complete, and upload the signed physician's report.", type: 'Upload', icon: Printer, href: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/lic602a.pdf' },
    { id: 'medicine-list', title: 'Medicine List', description: "Upload a current list of all prescribed medications.", type: 'Upload', icon: UploadCloud, href: '#' },
  ];

  const normalizedHealthPlan = String(healthPlan || '').trim();
  const filteredCommonRequirements =
    normalizedHealthPlan === 'Health Net'
      ? commonRequirements.filter((req) => req.id !== 'proof-of-income')
      : commonRequirements;
  
  if (normalizedPathway === 'snf diversion') {
    return [
      ...filteredCommonRequirements,
      { id: 'declaration-of-eligibility', title: 'Declaration of Eligibility', description: "Required for SNF Diversion. Download, have it signed by a PCP, and upload. Note: This form is not required for any Kaiser members.", type: 'Upload', icon: Printer, href: '/forms/declaration-of-eligibility/printable' },
    ];
  }
  
  // SNF Transition
  if (normalizedPathway === 'snf transition') {
    return [
        ...filteredCommonRequirements,
        { id: 'snf-facesheet', title: 'SNF Facesheet', description: "Upload the resident's facesheet from the Skilled Nursing Facility. Required for SNF Transition only; not needed for SNF Diversion members.", type: 'Upload', icon: UploadCloud, href: '#' },
    ];
  }

  return filteredCommonRequirements;
};

function StatusIndicator({
  state,
  isUpload,
}: {
  state: RequirementReviewState;
  isUpload?: boolean;
}) {
    const statusLabel =
      state === 'reviewed'
        ? 'Reviewed'
        : state === 'needs_revision'
          ? 'Needs revision'
          : state === 'under_review'
            ? (isUpload ? 'Uploaded - under review' : 'Submitted - under review')
            : 'Not started';
    const isDone = state === 'reviewed' || state === 'under_review';
    const toneClass =
      state === 'reviewed'
        ? 'text-green-600'
        : state === 'needs_revision'
          ? 'text-amber-600'
          : state === 'under_review'
            ? 'text-blue-600'
            : 'text-orange-500';
    return (
      <div className={cn(
        "flex items-center gap-2 text-sm font-medium",
        toneClass
      )}>
        {isDone ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <div className="h-5 w-5 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full border-2 border-current" />
          </div>
        )}
        <span>{statusLabel}</span>
      </div>
    );
}

type RequirementReviewState = 'pending' | 'needs_revision' | 'under_review' | 'reviewed';

function hasOpenRevisionRequest(formInfo?: FormStatusType): boolean {
  if (!formInfo) return false;
  return Boolean((formInfo as any).revisionRequestedAt) || Boolean((formInfo as any).revisionRequestedReason);
}

function getRequirementReviewState(formInfo?: FormStatusType): RequirementReviewState {
  if (!formInfo) return 'pending';
  if (hasOpenRevisionRequest(formInfo)) return 'needs_revision';
  if (formInfo.status === 'Completed') {
    if (Boolean((formInfo as any).acknowledged)) return 'reviewed';
    return 'under_review';
  }
  return 'pending';
}

function getRequirementReviewLabel(state: RequirementReviewState): string {
  switch (state) {
    case 'reviewed':
      return 'Reviewed by staff';
    case 'under_review':
      return 'Submitted - under review';
    case 'needs_revision':
      return 'Needs revision';
    default:
      return 'Pending upload';
  }
}

function getRequirementMissingGuidance(req: { id: string; type: string }, state: RequirementReviewState): string[] {
  if (state === 'reviewed' || state === 'under_review') return [];
  if (req.id === 'proof-of-income') {
    return [
      'Upload either a Social Security award letter, one PDF containing all bank statements, or multiple statement files.',
      'Make sure all pages are readable and include names/dates.',
    ];
  }
  if (req.type === 'Upload') {
    return [
      'Upload the requested file(s).',
      'Use clear scans/photos so staff can verify quickly.',
    ];
  }
  if (req.id === 'waivers') {
    return ['Complete all waiver acknowledgements before submitting this card.'];
  }
  if (req.id === 'cs-summary') {
    return ['Complete all required CS Summary sections and save before returning here.'];
  }
  return ['Complete this card to continue your application.'];
}

function QuickViewField({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: unknown;
  fullWidth?: boolean;
}) {
  const text = String(value ?? '').trim();
  return (
    <div className={cn('space-y-1', fullWidth ? 'sm:col-span-2' : '')}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{text || 'N/A'}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function parseCurrencyAmount(value: unknown): number | null {
  if (value == null) return null;
  const normalized = String(value).replace(/[^0-9.]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBirthDate(value: unknown): string {
  if (value == null) return 'N/A';

  try {
    const ts = value as { toDate?: () => Date };
    if (ts && typeof ts.toDate === 'function') {
      const dt = ts.toDate();
      if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString();
      }
    }
  } catch {
    // fall through to string/date parsing
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString();
  }

  const raw = String(value).trim();
  if (!raw) return 'N/A';

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }

  return raw;
}

function normalizeCountyName(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ county$/i, '')
    .replace(/[^a-z]/g, '');
}

function getKaiserRegionFromCounty(county: unknown): 'Kaiser North' | 'Kaiser South' | '' {
  const normalized = normalizeCountyName(county);
  if (!normalized) return '';

  const kaiserNorthCounties = new Set([
    // Bay Area
    'alameda', 'contracosta', 'marin', 'napa', 'sanfrancisco', 'sanmateo', 'santaclara', 'solano', 'sonoma',
    // Sacramento region
    'sacramento', 'yolo', 'placer', 'eldorado', 'sutter', 'yuba', 'amador', 'nevada',
    // Central Valley (down through Fresno/Kings)
    'sanjoaquin', 'stanislaus', 'merced', 'madera', 'fresno', 'kings',
    // Northern California
    'butte', 'shasta', 'tehama', 'glenn', 'colusa', 'humboldt', 'delnorte', 'siskiyou', 'trinity',
    'mendocino', 'lake', 'lassen', 'modoc', 'plumas',
  ]);

  return kaiserNorthCounties.has(normalized) ? 'Kaiser North' : 'Kaiser South';
}

type PathwaySwAssignment = {
  found: boolean;
  eligible: boolean;
  memberId: string;
  kaiserStatus: string;
  assignedSwEmail: string;
  assignedSwName: string;
  assignmentStatus: string;
};

function PathwayPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const applicationId = searchParams.get('applicationId');
  const focusRequirementIdParam = String(searchParams.get('focus') || '').trim();
  const modeParam = String(searchParams.get('mode') || '').trim().toLowerCase();
  const { user, isUserLoading } = useUser();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const firestore = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();
  const enhancedToast = useEnhancedToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isSendingProofIncomeSocWarning, setIsSendingProofIncomeSocWarning] = useState(false);

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [consolidatedUploadChecks, setConsolidatedUploadChecks] = useState({
    'LIC 602A - Physician\'s Report': false,
    'Medicine List': false,
    'SNF Facesheet': false,
  });
  const [staffDownloadUrls, setStaffDownloadUrls] = useState<Record<string, string>>({});
  const [showMissingOnly, setShowMissingOnly] = useState(
    modeParam === 'upload-missing' || modeParam === 'missing'
  );
  const [focusedRequirementId, setFocusedRequirementId] = useState('');
  const [uploadReceiptByRequirement, setUploadReceiptByRequirement] = useState<
    Record<string, { uploadedAtIso: string; fileNames: string[]; fileCount: number }>
  >({});
  const [swAssignmentLoading, setSwAssignmentLoading] = useState(false);
  const [swAssignmentError, setSwAssignmentError] = useState('');
  const [swAssignment, setSwAssignment] = useState<PathwaySwAssignment | null>(null);
  const [swInviteEnabled, setSwInviteEnabled] = useState(false);
  const [swInviteSaving, setSwInviteSaving] = useState(false);

  const isAdminCreatedApp = applicationId?.startsWith('admin_app_');

  const getSafeForms = (value: unknown): FormStatusType[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is FormStatusType => {
      const name = String((item as any)?.name || '').trim();
      return name.length > 0;
    });
  };

  
  const docRef = useMemoFirebase(() => {
    if (!firestore || !applicationId) return null;
    
    // Admin-created applications are stored directly in the applications collection
    if (isAdminCreatedApp) {
      return doc(firestore, 'applications', applicationId);
    }
    
    // Regular user applications are stored in user subcollections
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/applications`, applicationId);
  }, [firestore, applicationId, user, isAdminCreatedApp]);

  useEffect(() => {
    if (!docRef) {
      if (!isUserLoading || isAdminCreatedApp) setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setApplication({ id: docSnap.id, ...docSnap.data() } as Application);
      } else {
        setApplication(null);
        setError(new Error("Application not found or you don't have access."));
      }
      setIsLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [docRef, isUserLoading]);

  useEffect(() => {
    if (!isLoading && !application && (!isUserLoading || isAdminCreatedApp)) {
      // For admin-created applications, redirect to admin applications page
      if (isAdminCreatedApp) {
        router.push('/admin/applications');
      } else {
        router.push('/applications');
      }
    }
  }, [isLoading, application, isUserLoading, router, isAdminCreatedApp]);

  useEffect(() => {
    const safeForms = getSafeForms(application?.forms);
    if (application && docRef && application.pathway && safeForms.length === 0) {
        const pathwayRequirements = getPathwayRequirements(
          application.pathway as 'SNF Transition' | 'SNF Diversion',
          application.healthPlan
        );
        const initialForms: FormStatusType[] = pathwayRequirements.map(req => ({
            name: req.title,
            status: 'Pending',
            type: req.type as FormStatusType['type'],
            href: req.href || '#',
        }));

        const summaryIndex = initialForms.findIndex(f => f.name === 'CS Member Summary');
        if (summaryIndex !== -1) {
            initialForms[summaryIndex].status = 'Completed';
        }

        setDoc(docRef, { forms: initialForms }, { merge: true });
    }
  }, [application, docRef]);

  useEffect(() => {
    if (!storage || !(isAdmin || isSuperAdmin) || !application) return;
    const formsNeedingUrl = getSafeForms(application.forms).filter((form) => {
      if (form?.status !== 'Completed') return false;
      if (form?.type !== 'Upload') return false;
      const name = String(form?.name || '').trim();
      if (!name) return false;
      if (!form?.filePath) return false;
      if (String(form?.downloadURL || '').trim()) return false;
      if (String(staffDownloadUrls[name] || '').trim()) return false;
      return true;
    });

    if (formsNeedingUrl.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolved: Record<string, string> = {};
      for (const form of formsNeedingUrl) {
        try {
          const url = await getDownloadURL(ref(storage, String(form.filePath)));
          const name = String(form.name || '').trim();
          if (name && url) resolved[name] = url;
        } catch {
          // Keep silent in UI: staff may still resolve through backend tools.
        }
      }
      if (cancelled || Object.keys(resolved).length === 0) return;
      setStaffDownloadUrls((prev) => ({ ...prev, ...resolved }));
    })();

    return () => {
      cancelled = true;
    };
  }, [application, isAdmin, isSuperAdmin, staffDownloadUrls, storage]);

  const handleFormStatusUpdate = async (updates: Partial<FormStatusType>[]) => {
      if (!docRef || !application) return;
      const isInternalStaffUpload = Boolean(isAdmin || isSuperAdmin);

      const existingForms = new Map(getSafeForms(application.forms).map(f => [f.name, f]));
      
      updates.forEach(update => {
          const name = String(update.name || '').trim();
          if (!name) return;
          const existingForm = existingForms.get(name);
          const isCompleted = update.status === 'Completed';
          const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
          const hasFile = Boolean((update as any).filePath || (update as any).downloadURL || (update as any).fileName);

          // Staff internal uploads should stay acknowledged (they're doing the reviewing).
          const shouldAutoAcknowledge = isInternalStaffUpload && isCompleted;

          // Referrer uploads should *reset* acknowledgement so staff sees it as new.
          const shouldResetAcknowledge =
            !isInternalStaffUpload && isCompleted && hasFile && !isSummary;
          const shouldClearRevision = isCompleted;

          const next = {
            ...(existingForm || { name, status: 'Pending' }),
            ...update,
            ...(shouldAutoAcknowledge ? { acknowledged: true } : {}),
            ...(shouldResetAcknowledge ? { acknowledged: false } : {}),
            ...(shouldClearRevision
              ? {
                  revisionRequestedReason: null,
                  revisionRequestedAt: null,
                  revisionRequestedBy: null,
                  revisionRequestedByUid: null,
                  revisionEmailTo: null,
                  revisionEmailSentAt: null,
                }
              : {})
          } as any;

          existingForms.set(name, next);
      });

      const updatedForms = Array.from(existingForms.values());
      const pendingDocReviewCount = updatedForms.filter((form: any) => {
        const isCompleted = form?.status === 'Completed';
        const name = String(form?.name || '').trim();
        const isSummary = name === 'CS Member Summary' || name === 'CS Summary';
        const acknowledged = Boolean(form?.acknowledged);
        return isCompleted && !isSummary && !acknowledged;
      }).length;
      
      try {
          const baseUpdate: Record<string, any> = {
              forms: updatedForms,
              lastUpdated: serverTimestamp(),
              lastModified: serverTimestamp(),
              lastDocumentUpload: serverTimestamp(),
              // Derived fields for staff review workflows
              pendingDocReviewCount,
              pendingDocReviewUpdatedAt: serverTimestamp(),
          };

          // Only referrer uploads should trigger "new documents" flags.
          if (!isInternalStaffUpload) {
            baseUpdate.hasNewDocuments = true;
            baseUpdate.newDocumentCount = updates.length;
            // If the referrer resubmits CS Summary, force it back into "needs review".
            const anyCsCompleted = updates.some((u) => {
              const nm = String(u?.name || '').trim();
              const isSummary = nm === 'CS Member Summary' || nm === 'CS Summary';
              return isSummary && u.status === 'Completed';
            });
            if (anyCsCompleted) {
              baseUpdate.applicationChecked = false;
            }
          }

          await setDoc(docRef, baseUpdate, { merge: true });
      } catch (e: any) {
          console.error("Failed to update form status:", e);
          enhancedToast.error('Update Error', 'Could not update form status.');
      }
  };

  const doUpload = async (files: File[], requirementTitle: string) => {
      console.log('doUpload called with:', { 
        fileCount: files.length, 
        requirementTitle,
        hasUser: !!user?.uid, 
        hasApplicationId: !!applicationId, 
        hasStorage: !!storage,
        hasFirestore: !!firestore
      });

      if (!user?.uid || !applicationId || !storage) {
        console.error('Upload prerequisites not met:', { 
          hasUser: !!user?.uid, 
          hasApplicationId: !!applicationId, 
          hasStorage: !!storage,
          userEmail: user?.email
        });
        throw new Error('Upload service not available. Please refresh the page and try again.');
      }

      if (files.length === 0) {
        throw new Error('No files selected for upload.');
      }
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      const uploadSingleFile = (file: File, fileIndex: number, totalFiles: number) => {
        if (file.size > maxSize) {
          throw new Error(`${file.name}: File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 10MB.`);
        }
        if (!allowedTypes.includes(file.type)) {
          throw new Error(
            `${file.name}: File type "${file.type}" is not supported. Please upload PDF, Word, JPG, or PNG files.`
          );
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const storagePath = `user_uploads/${user.uid}/${applicationId}/${requirementTitle}/${timestamp}_${file.name}`;
        const storageRef = ref(storage, storagePath);
        return new Promise<{ downloadURL: string | null; path: string; fileName: string }>((resolve, reject) => {
          const uploadTimeout = setTimeout(() => {
            console.error('Upload timeout after 5 minutes');
            reject(new Error(`${file.name}: Upload timeout - please try again with a smaller file.`));
          }, 5 * 60 * 1000);
          const uploadTask = uploadBytesResumable(storageRef, file);
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const fileProgress = snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
              const aggregateProgress = ((fileIndex + fileProgress) / Math.max(totalFiles, 1)) * 100;
              setUploadProgress((prev) => ({ ...prev, [requirementTitle]: aggregateProgress }));
            },
            (error) => {
              clearTimeout(uploadTimeout);
              let errorMessage = `${file.name}: Upload failed. Please try again.`;
              if (error.code === 'storage/unauthorized') {
                errorMessage = `${file.name}: Upload permission denied. Please check your authentication.`;
              } else if (error.code === 'storage/canceled') {
                errorMessage = `${file.name}: Upload was canceled.`;
              } else if (error.code === 'storage/unknown') {
                errorMessage = `${file.name}: Unknown upload error. Please check your internet connection.`;
              } else if (error.code === 'storage/quota-exceeded') {
                errorMessage = `${file.name}: Storage quota exceeded. Please contact support.`;
              }
              reject(new Error(errorMessage));
            },
            async () => {
              try {
                clearTimeout(uploadTimeout);
                const isInternalStaffUpload = Boolean(isAdmin || isSuperAdmin);
                if (isInternalStaffUpload) {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve({ downloadURL, path: storagePath, fileName: file.name });
                  return;
                }
                resolve({ downloadURL: null, path: storagePath, fileName: file.name });
              } catch (error: any) {
                clearTimeout(uploadTimeout);
                reject(new Error(`${file.name}: Failed to finalize upload (${error?.message || 'unknown error'}).`));
              }
            }
          );
        });
      };

      const uploadResults: Array<{ downloadURL: string | null; path: string; fileName: string }> = [];
      const uploadFailures: string[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        try {
          const result = await uploadSingleFile(file, i, files.length);
          uploadResults.push(result);
        } catch (error: any) {
          uploadFailures.push(String(error?.message || `${file.name}: Upload failed.`));
        }
      }

      if (uploadResults.length === 0) {
        throw new Error(uploadFailures[0] || 'Upload failed - no files were uploaded.');
      }

      return { uploadResults, uploadFailures };
  };






  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    requirementTitle: string,
    replaceExistingForm?: FormStatusType
  ) => {
    if (!event.target.files?.length || !user?.uid) {
      console.log('Upload blocked:', { 
        hasFiles: !!event.target.files?.length, 
        hasUser: !!user?.uid,
        userEmail: user?.email 
      });
      if (!user?.uid) {
        toast({ 
          variant: 'destructive', 
          title: 'Authentication Required', 
          description: 'Please sign in to upload files.' 
        });
      }
      return;
    }

    if (!applicationId) {
      toast({ 
        variant: 'destructive', 
        title: 'Application Required', 
        description: 'No application ID found. Please create an application first.' 
      });
      return;
    }

    if (!storage) {
      toast({ 
        variant: 'destructive', 
        title: 'Upload Service Unavailable', 
        description: 'File upload service is not available. Please try again later.' 
      });
      return;
    }

    const files = Array.from(event.target.files);
    console.log('Starting upload:', { requirementTitle, fileCount: files.length, applicationId });
    
    setUploading(prev => ({...prev, [requirementTitle]: true}));
    setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
    
    try {
        // If this is a revision upload, remove the prior file first so the new
        // upload replaces the original document in the pathway record.
        const existingUploadPaths = [
          String(replaceExistingForm?.filePath || '').trim(),
          ...((Array.isArray((replaceExistingForm as any)?.uploadedFiles)
            ? (replaceExistingForm as any).uploadedFiles
            : []
          )
            .map((item: any) => String(item?.filePath || '').trim())
            .filter(Boolean)),
        ].filter(Boolean);
        if (existingUploadPaths.length > 0) {
          try {
            await Promise.all(
              existingUploadPaths.map((path) => deleteObject(ref(storage, path)).catch(() => undefined))
            );
          } catch {
            // Best effort only. Continue so metadata still points to the newest file.
          }
        }
        console.log('Attempting upload with user:', user?.email, 'applicationId:', applicationId);
        const { uploadResults, uploadFailures } = await doUpload(files, requirementTitle);
        console.log('Upload results:', uploadResults);

        if (uploadResults.length > 0) {
            const existingFormInfo = replaceExistingForm || (formStatusMap.get(requirementTitle) as FormStatusType | undefined);
            const shouldMergeWithExisting =
              !replaceExistingForm &&
              Boolean(existingFormInfo) &&
              hasOpenRevisionRequest(existingFormInfo);
            const preservedExistingUploads = shouldMergeWithExisting
              ? ((Array.isArray((existingFormInfo as any)?.uploadedFiles)
                  ? (existingFormInfo as any).uploadedFiles
                  : []
                )
                  .map((entry: any) => ({
                    fileName: String(entry?.fileName || '').trim(),
                    filePath: String(entry?.filePath || '').trim(),
                    downloadURL: null,
                  }))
                  .filter((entry: any) => Boolean(entry.fileName || entry.filePath)))
              : [];
            const combinedUploads = [...preservedExistingUploads, ...uploadResults.map((entry, index) => ({
              fileName: String(entry.fileName || '').trim() || entry.path.split('/').pop() || 'Uploaded file',
              filePath: entry.path,
              downloadURL: null,
            }))];
            const primaryUpload = combinedUploads[0] || uploadResults[0];
            console.log('Updating form status...');
            await handleFormStatusUpdate([{
                name: requirementTitle,
                status: 'Completed',
                fileName: combinedUploads.map((entry) => String(entry.fileName || '').trim()).filter(Boolean).join(', '),
                filePath: String((primaryUpload as any)?.filePath || uploadResults[0].path || '').trim() || null,
                downloadURL: null,
                uploadedFiles: combinedUploads,
                dateCompleted: Timestamp.now(),
                uploadedByUid: user.uid,
                uploadedByEmail: user.email || null,
                uploadedByName: user.displayName || user.email || 'User',
            }]);
            setUploadReceiptByRequirement((prev) => ({
              ...prev,
              [requirementTitle]: {
                uploadedAtIso: new Date().toISOString(),
                fileNames: files.map((f) => String(f.name || '').trim()).filter(Boolean),
                fileCount: files.length,
              },
            }));
            console.log('Form status updated successfully');
            toast({ 
              title: 'Upload Successful', 
              description:
                uploadFailures.length > 0
                  ? `${uploadResults.length} file(s) uploaded. ${uploadFailures.length} file(s) failed.`
                  : `${requirementTitle} has been uploaded successfully.`,
              className: 'bg-green-100 text-green-900 border-green-200'
            });
            if (uploadFailures.length > 0) {
              toast({
                variant: 'destructive',
                title: 'Some files failed',
                description: uploadFailures.slice(0, 3).join(' | '),
              });
            }
        } else {
          throw new Error('Upload failed - no result returned');
        }
    } catch (error: any) {
        console.error('Upload error details:', {
          error: error,
          message: error.message,
          code: error.code,
          stack: error.stack,
          user: user?.email,
          applicationId: applicationId,
          requirementTitle: requirementTitle,
          fileInfo: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
        });
        
        toast({ 
          variant: 'destructive', 
          title: 'Upload Failed', 
          description: error.message || 'Could not upload file. Please try again.' 
        });
    } finally {
        setUploading(prev => ({...prev, [requirementTitle]: false}));
        setUploadProgress(prev => ({ ...prev, [requirementTitle]: 0 }));
        event.target.value = '';
    }
  };

  const handleConsolidatedUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length || !user?.uid) return;
    const files = Array.from(event.target.files);

    const formsToUpdate = Object.entries(consolidatedUploadChecks)
      .filter(([, isChecked]) => isChecked)
      .map(([formName]) => formName);

    if (formsToUpdate.length === 0) return;

    const consolidatedId = 'consolidated-medical-upload';
    setUploading(prev => ({ ...prev, [consolidatedId]: true }));
    setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));

    try {
      const { uploadResults, uploadFailures } = await doUpload(files, 'consolidated_medical');
      if (uploadResults.length > 0) {
        const primaryUpload = uploadResults[0];
        const updates: Partial<FormStatusType>[] = formsToUpdate.map(formName => ({
          name: formName,
          status: 'Completed',
          fileName: uploadResults.map((entry) => entry.fileName).join(', '),
          filePath: primaryUpload.path,
          downloadURL: null,
          uploadedFiles: uploadResults.map((entry) => ({
            fileName: entry.fileName,
            filePath: entry.path,
            downloadURL: null,
          })),
          dateCompleted: Timestamp.now(),
          uploadedByUid: user.uid,
          uploadedByEmail: user.email || null,
          uploadedByName: user.displayName || user.email || 'User',
        }));
        await handleFormStatusUpdate(updates);
        setUploadReceiptByRequirement((prev) => {
          const next = { ...prev };
          const nowIso = new Date().toISOString();
          const names = files.map((file) => String(file.name || '').trim()).filter(Boolean);
          formsToUpdate.forEach((name) => {
            next[name] = {
              uploadedAtIso: nowIso,
              fileNames: names,
              fileCount: files.length,
            };
          });
          return next;
        });
        toast({
          title: 'Upload Successful',
          description:
            uploadFailures.length > 0
              ? `${uploadResults.length} consolidated file(s) uploaded. ${uploadFailures.length} failed.`
              : 'Consolidated documents have been uploaded.',
        });
        if (uploadFailures.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Some files failed',
            description: uploadFailures.slice(0, 3).join(' | '),
          });
        }
      }
    } catch {
      toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload consolidated documents.' });
    } finally {
      setUploading(prev => ({ ...prev, [consolidatedId]: false }));
      setUploadProgress(prev => ({ ...prev, [consolidatedId]: 0 }));
      setConsolidatedUploadChecks({ 'LIC 602A - Physician\'s Report': false, 'Medicine List': false, 'SNF Facesheet': false });
      event.target.value = '';
    }
  };

  const handleFileRemove = async (form: FormStatusType) => {
    const uploadPaths = [
      String(form.filePath || '').trim(),
      ...((Array.isArray((form as any)?.uploadedFiles)
        ? (form as any).uploadedFiles
        : []
      )
        .map((item: any) => String(item?.filePath || '').trim())
        .filter(Boolean)),
    ].filter(Boolean);

    if (uploadPaths.length === 0) {
      await handleFormStatusUpdate([{
        name: form.name,
        status: 'Pending',
        fileName: null,
        filePath: null,
        downloadURL: null,
        uploadedFiles: [],
        uploadedByUid: null,
        uploadedByEmail: null,
        uploadedByName: null,
      }]);
      setUploadReceiptByRequirement((prev) => {
        if (!prev[form.name]) return prev;
        const next = { ...prev };
        delete next[form.name];
        return next;
      });
      return;
    }

    try {
      await Promise.all(uploadPaths.map((path) => deleteObject(ref(storage, path)).catch(() => undefined)));
      await handleFormStatusUpdate([{
        name: form.name,
        status: 'Pending',
        fileName: null,
        filePath: null,
        downloadURL: null,
        uploadedFiles: [],
        uploadedByUid: null,
        uploadedByEmail: null,
        uploadedByName: null,
      }]);
      setUploadReceiptByRequirement((prev) => {
        if (!prev[form.name]) return prev;
        const next = { ...prev };
        delete next[form.name];
        return next;
      });
      toast({ title: 'File Removed', description: `${form.fileName} has been removed.`});
    } catch (error) {
      console.error("Error removing file:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not remove file. It may have already been deleted.'});
      // Force update Firestore record even if storage deletion fails
      await handleFormStatusUpdate([{
        name: form.name,
        status: 'Pending',
        fileName: null,
        filePath: null,
        downloadURL: null,
        uploadedFiles: [],
        uploadedByUid: null,
        uploadedByEmail: null,
        uploadedByName: null,
      }]);
      setUploadReceiptByRequirement((prev) => {
        if (!prev[form.name]) return prev;
        const next = { ...prev };
        delete next[form.name];
        return next;
      });
    }
  };


  const handleSubmitApplication = async () => {
    if (!docRef) return;
    if (waiverFormStatus?.choice === 'decline') {
      toast({
        variant: 'destructive',
        title: 'Community Support Services Declined',
        description: 'This application cannot be submitted because Community Support services were declined in the Freedom of Choice waiver.'
      });
      return;
    }
    setIsSubmitting(true);
    try {
        await setDoc(docRef, {
            status: 'Completed & Submitted',
            lastUpdated: serverTimestamp(),
        }, { merge: true });

        // Trigger Health Net notifications if this is a Health Net application
        if (application?.healthPlan === 'Health Net') {
          try {
            console.log('🏥 Triggering Health Net notifications for:', application.memberFirstName, application.memberLastName);
            
            const notificationData = {
              memberName: `${application.memberFirstName} ${application.memberLastName}`.trim(),
              memberClientId: application.memberMediCalNum || application.memberMrn,
              applicationId: applicationId,
              submittedBy: application.referrerName || `${application.referrerFirstName} ${application.referrerLastName}`.trim(),
              submittedDate: new Date().toLocaleDateString(),
              pathway: application.pathway,
              currentLocation: `${application.currentCity}, ${application.currentState}`.trim(),
              healthPlan: application.healthPlan,
              applicationUrl: `${window.location.origin}/admin/applications/${applicationId}?userId=${application.userId}`,
            };

            // Send Health Net notifications (email + system tray + bell)
            fetch('/api/notifications/health-net', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(notificationData),
            }).then(response => {
              if (response.ok) {
                console.log('✅ Health Net notifications sent successfully');
              } else {
                console.error('❌ Failed to send Health Net notifications');
              }
            }).catch(error => {
              console.error('❌ Health Net notification error:', error);
            });

          } catch (notificationError) {
            console.error('❌ Health Net notification setup error:', notificationError);
            // Don't block the submission if notifications fail
          }
        }

        router.push('/applications/completed');
    } catch (e: any) {
        console.error(e);
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleSaveSocialWorkerInvite = async () => {
    if (!docRef || !application) return;
    if (!swAssignment?.eligible) {
      toast({
        variant: 'destructive',
        title: 'Social worker assignment unavailable',
        description: 'This member is not currently in Kaiser status "RN Visit Needed".',
      });
      return;
    }
    if (!swAssignment.assignedSwEmail) {
      toast({
        variant: 'destructive',
        title: 'No social worker email found',
        description: 'Please assign a social worker first before sending an invite.',
      });
      return;
    }

    setSwInviteSaving(true);
    try {
      const memberName =
        `${String(application.memberFirstName || '').trim()} ${String(application.memberLastName || '').trim()}`.trim() ||
        'Member';
      const actorName = String(user?.displayName || user?.email || 'Staff').trim();
      const actorEmail = String(user?.email || '').trim().toLowerCase();
      const memberId =
        swAssignment.memberId ||
        String((application as any)?.clientId2 || (application as any)?.client_ID2 || '').trim();

      if (swInviteEnabled && firestore && memberId) {
        await setDoc(
          doc(firestore, 'alft_assignments', memberId),
          {
            memberId,
            memberName,
            memberFirstName: String(application.memberFirstName || '').trim(),
            memberLastName: String(application.memberLastName || '').trim(),
            memberMrn: String(application.memberMrn || '').trim(),
            birthDate: String((application as any)?.memberDob || '').trim(),
            kaiserStatus: swAssignment.kaiserStatus || 'RN Visit Needed',
            assignedSwEmail: swAssignment.assignedSwEmail,
            assignedSwName: swAssignment.assignedSwName || swAssignment.assignedSwEmail,
            assignedByEmail: actorEmail,
            assignedByName: actorName,
            assignedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'assigned',
          },
          { merge: true }
        );

        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: swAssignment.assignedSwEmail,
            includeBcc: false,
            subject: `ALFT Invite: ${memberName}`,
            memberName: swAssignment.assignedSwName || 'Social Worker',
            staffName: actorName,
            staffTitle: 'ALFT Assignment Coordinator',
            staffEmail: actorEmail || undefined,
            status: 'In Progress',
            healthPlan: 'Kaiser',
            portalUrl: `${window.location.origin}/sw-login`,
            message: [
              `You have been assigned to complete the ALFT workflow for ${memberName}.`,
              '',
              'Please log in to the Social Worker Portal and open ALFT Upload to continue.',
              `Portal login: ${window.location.origin}/sw-login`,
            ].join('\n'),
          }),
        });
        const result = await response.json().catch(() => ({} as any));
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || 'Failed to send social worker invite email.');
        }
      }

      await setDoc(
        docRef,
        {
          swPortalInviteEnabled: swInviteEnabled,
          swPortalAssignedEmail: swAssignment.assignedSwEmail,
          swPortalAssignedName: swAssignment.assignedSwName || swAssignment.assignedSwEmail,
          swPortalKaiserStatus: swAssignment.kaiserStatus,
          swPortalMemberId: memberId || null,
          swPortalInviteUpdatedAt: serverTimestamp(),
          swPortalInviteUpdatedBy: actorName,
          swPortalInviteUpdatedByEmail: actorEmail || null,
          ...(swInviteEnabled
            ? {
                swPortalInviteSentAt: serverTimestamp(),
                swPortalInviteSentBy: actorName,
                swPortalInviteSentByEmail: actorEmail || null,
              }
            : {}),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      toast({
        title: swInviteEnabled ? 'Social worker invited' : 'Social worker invite setting saved',
        description: swInviteEnabled
          ? `${swAssignment.assignedSwName || swAssignment.assignedSwEmail} was invited to the SW portal.`
          : 'Invite checkbox was turned off.',
      });
      void loadSwAssignment();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not update social worker invite',
        description: error?.message || 'Please try again.',
      });
    } finally {
      setSwInviteSaving(false);
    }
  };

  useEffect(() => {
    setShowMissingOnly(modeParam === 'upload-missing' || modeParam === 'missing');
  }, [modeParam]);

  useEffect(() => {
    if (!focusRequirementIdParam || !application) {
      setFocusedRequirementId('');
      return;
    }
    const normalizedFocus = focusRequirementIdParam.toLowerCase();
    const requirementOptions = getPathwayRequirements(
      application.pathway as 'SNF Transition' | 'SNF Diversion',
      application.healthPlan
    );
    const match = requirementOptions.find((req) => String(req.id || '').trim().toLowerCase() === normalizedFocus);
    if (!match) return;
    setFocusedRequirementId(match.id);
    const cardId = `pathway-card-${match.id}`;
    const timeout = setTimeout(() => {
      const element = document.getElementById(cardId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(timeout);
  }, [focusRequirementIdParam, application]);

  useEffect(() => {
    setSwInviteEnabled(Boolean((application as any)?.swPortalInviteEnabled));
  }, [application]);

  const loadSwAssignment = useCallback(async () => {
    const isKaiser = String(application?.healthPlan || '').trim().toLowerCase().includes('kaiser');
    if (!application || !isKaiser) {
      setSwAssignment(null);
      setSwAssignmentError('');
      setSwAssignmentLoading(false);
      return false;
    }

    const memberMrn = String(application.memberMrn || '').trim();
    const memberMediCalNum = String((application as any)?.memberMediCalNum || '').trim();
    const memberClientId2 = String((application as any)?.clientId2 || (application as any)?.client_ID2 || '').trim();
    const memberFirstName = String(application.memberFirstName || '').trim();
    const memberLastName = String(application.memberLastName || '').trim();

    if (!memberMrn && !memberMediCalNum && !memberClientId2) {
      setSwAssignment(null);
      setSwAssignmentError('Missing member identifiers needed to resolve social worker assignment.');
      setSwAssignmentLoading(false);
      return false;
    }
    setSwAssignmentLoading(true);
    setSwAssignmentError('');
    try {
      const params = new URLSearchParams({
        memberMrn,
        memberMediCalNum,
        memberClientId2,
        memberFirstName,
        memberLastName,
      });
      const res = await fetch(`/api/pathway/sw-assignment?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Could not load social worker assignment.');
      }
      if (!data?.found) {
        setSwAssignment(null);
        setSwAssignmentError('No social worker assignment found for this member yet.');
        return false;
      }
      setSwAssignment({
        found: Boolean(data?.found),
        eligible: Boolean(data?.eligible),
        memberId: String(data?.memberId || '').trim(),
        kaiserStatus: String(data?.kaiserStatus || '').trim(),
        assignedSwEmail: String(data?.assignedSwEmail || '').trim().toLowerCase(),
        assignedSwName: String(data?.assignedSwName || '').trim(),
        assignmentStatus: String(data?.assignmentStatus || '').trim(),
      });
      return true;
    } catch (err: any) {
      setSwAssignment(null);
      setSwAssignmentError(err?.message || 'Could not load social worker assignment.');
      return false;
    } finally {
      setSwAssignmentLoading(false);
    }
  }, [application]);

  useEffect(() => {
    void loadSwAssignment();
  }, [loadSwAssignment]);

  if (isLoading || isUserLoading) {
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    );
  }

  if (error) {
     return (
        <div className="flex items-center justify-center h-screen">
            <p className="text-destructive">Error: {error.message}</p>
        </div>
     );
  }
  
  if (!application) {
    return (
        <div className="flex items-center justify-center h-screen">
          <p>{applicationId ? 'Application not found or you do not have permission to view it.' : 'No application ID provided.'}</p>
        </div>
    );
  }
  
  const isReadOnly = application.status === 'Completed & Submitted' || application.status === 'Approved';
  const memberCounty = String(
    application.currentCounty ||
    application.customaryCounty ||
    (application as any)?.memberCounty ||
    (application as any)?.Member_County ||
    ''
  ).trim();
  const kaiserRegion = String(application.healthPlan || '').trim().toLowerCase().includes('kaiser')
    ? getKaiserRegionFromCounty(memberCounty)
    : '';
  const healthPlanWithRegion = kaiserRegion
    ? `${application.healthPlan} (${kaiserRegion})`
    : application.healthPlan;
  const memberMrnDisplay = String(application.memberMrn || application.medicalRecordNumber || '').trim() || '—';
  const memberBirthdateDisplay = formatBirthDate(
    application.memberDob || (application as any)?.memberDOB || (application as any)?.dob || (application as any)?.Date_of_Birth
  );
  const kaiserReferralSubmission = (application as any)?.kaiserReferralSubmission || null;
  const kaiserReferralSubmitted = Boolean(
    kaiserReferralSubmission?.submitted ||
      kaiserReferralSubmission?.submittedAt ||
      kaiserReferralSubmission?.submittedAtIso
  );
  const kaiserReferralSubmittedAt = (() => {
    const raw = kaiserReferralSubmission?.submittedAtIso || kaiserReferralSubmission?.submittedAt;
    if (!raw) return '';
    try {
      if (typeof raw?.toDate === 'function') {
        const date = raw.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
      const parsed = new Date(String(raw));
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
      return String(raw);
    } catch {
      return '';
    }
  })();
  const kaiserReferralSubmittedByName = String(kaiserReferralSubmission?.submittedByName || '').trim();
  const kaiserReferralSubmittedByEmail = String(kaiserReferralSubmission?.submittedByEmail || '').trim();

  const pathwayRequirements = getPathwayRequirements(
    application.pathway as 'SNF Transition' | 'SNF Diversion',
    application.healthPlan
  );
  const orderedPathwayRequirements = (() => {
    const items = [...pathwayRequirements];
    const roomBoardIdx = items.findIndex((req) => req.id === 'room-board-obligation');
    if (roomBoardIdx > -1) {
      const [roomBoard] = items.splice(roomBoardIdx, 1);
      items.push(roomBoard);
    }
    return items;
  })();
  const formStatusMap = new Map(getSafeForms(application.forms).map(f => [f.name, f]));
  const reviewStateByRequirementId = new Map(
    orderedPathwayRequirements.map((req) => [req.id, getRequirementReviewState(formStatusMap.get(req.title))] as const)
  );
  const waiverFormStatus = formStatusMap.get('Waivers & Authorizations') as FormStatusType | undefined;
  const proofIncomeActualAmountRaw = String((application as any)?.proofIncomeActualAmount || '').trim();
  const proofIncomeActualAmount = parseCurrencyAmount(proofIncomeActualAmountRaw);
  const proofIncomeSocFlag = proofIncomeActualAmount != null && proofIncomeActualAmount > 1800;
  const completedCount = pathwayRequirements.reduce((acc, req) => {
    const state = reviewStateByRequirementId.get(req.id) || 'pending';
    if (state === 'under_review' || state === 'reviewed') return acc + 1;
    return acc;
  }, 0);
  
  const totalCount = pathwayRequirements.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allRequiredFormsComplete = completedCount === totalCount;
  const missingRequiredRequirements = orderedPathwayRequirements.filter((req) => {
    const state = reviewStateByRequirementId.get(req.id) || 'pending';
    return state === 'pending' || state === 'needs_revision';
  });
  const rejectedRequirements = orderedPathwayRequirements
    .map((req) => {
      const formInfo = formStatusMap.get(req.title);
      const state = getRequirementReviewState(formInfo);
      if (state !== 'needs_revision') return null;
      return {
        title: req.title,
        reason: String((formInfo as any)?.revisionRequestedReason || '').trim(),
      };
    })
    .filter((item): item is { title: string; reason: string } => Boolean(item));

  const servicesDeclined = waiverFormStatus?.choice === 'decline';
  const visiblePathwayRequirements = showMissingOnly ? missingRequiredRequirements : orderedPathwayRequirements;
  const waiverMonthlyIncomeAmount =
    parseCurrencyAmount((waiverFormStatus as any)?.monthlyIncome) ??
    parseCurrencyAmount((application as any)?.monthlyIncome);
  const waiverPossibleSocWarning = (waiverMonthlyIncomeAmount ?? 0) > 2000;

  const waiverSubTasks = [
      { id: 'hipaa', label: 'HIPAA Authorization', completed: !!waiverFormStatus?.ackHipaa },
      { id: 'liability', label: 'Liability Waiver', completed: !!waiverFormStatus?.ackLiability },
      { id: 'foc', label: 'Freedom of Choice', completed: !!waiverFormStatus?.ackFoc },
      { id: 'rb', label: 'Room & Board Commitment', completed: !!(waiverFormStatus as any)?.ackRoomAndBoard || !!(application as any)?.ackRoomAndBoard },
      { id: 'soc', label: 'Medi-Cal SOC Determination', completed: !!(waiverFormStatus as any)?.ackSocDetermination || !!(application as any)?.ackSocDetermination }
  ];
  const feedbackFormStatus = formStatusMap.get('Customer Feedback Survey') as FormStatusType | undefined;
  const feedbackCompleted = feedbackFormStatus?.status === 'Completed';
  const showFeedbackCard = application.status === 'Completed & Submitted' || application.status === 'Approved';
  const consolidatedMedicalDocuments = [
      { id: 'lic-602a-check', name: "LIC 602A - Physician's Report" },
      { id: 'med-list-check', name: 'Medicine List' },
      { id: 'facesheet-check', name: 'SNF Facesheet' },
  ].filter(doc => pathwayRequirements.some(req => req.title === doc.name));

  const updateProofIncomeDetails = async (patch: { proofIncomeActualAmount?: string; proofIncomeSocFlag?: boolean }) => {
    if (!docRef) return;
    try {
      await setDoc(
        docRef,
        {
          ...patch,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) => (prev ? ({ ...(prev as any), ...patch } as Application) : prev));
    } catch {
      toast({
        variant: 'destructive',
        title: 'Could not save proof of income details',
        description: 'Please retry. Your changes were not saved.',
      });
    }
  };

  const sendProofIncomeSocWarning = async () => {
    const to = String((application as any)?.bestContactEmail || (application as any)?.referrerEmail || '').trim();
    if (!to) {
      toast({
        variant: 'destructive',
        title: 'Primary contact email not available',
        description: 'Add a primary contact email before sending an SOC warning.',
      });
      return;
    }
    const amountLabel = proofIncomeActualAmountRaw || 'the submitted amount';
    const memberName = `${String(application.memberFirstName || '').trim()} ${String(application.memberLastName || '').trim()}`.trim() || 'the member';
    setIsSendingProofIncomeSocWarning(true);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          includeBcc: false,
          subject: `Proof of income SOC warning for ${memberName}`,
          memberName: String(
            `${(application as any)?.bestContactFirstName || ''} ${(application as any)?.bestContactLastName || ''}`.trim() ||
              application.referrerName ||
              'there'
          ),
          staffName: String(user?.displayName || user?.email || 'The Connections Team'),
          status: String(application.status || 'In Progress'),
          message: [
            `We reviewed proof of income for ${memberName}.`,
            '',
            `The amount we reviewed is ${amountLabel}, which may trigger a Medi-Cal Share of Cost (SOC).`,
            'Please confirm with Medi-Cal that SOC is $0 and reply with confirmation.',
            '',
            'If SOC is not $0, please share the next steps you are taking so we can continue processing.',
          ].join('\n'),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to send SOC warning email.');
      }
      await setDoc(
        docRef!,
        {
          proofIncomeSocWarningSentAt: serverTimestamp(),
          proofIncomeSocWarningSentBy: String(user?.displayName || user?.email || 'Staff'),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      setApplication((prev) =>
        prev
          ? ({
              ...(prev as any),
              proofIncomeSocWarningSentBy: String(user?.displayName || user?.email || 'Staff'),
            } as Application)
          : prev
      );
      toast({
        title: 'SOC warning sent',
        description: `Warning email sent to ${to}.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Could not send warning',
        description: error?.message || 'Failed to send SOC warning email.',
      });
    } finally {
      setIsSendingProofIncomeSocWarning(false);
    }
  };


  const getFormAction = (req: (typeof pathwayRequirements)[0]) => {
    const formInfo = formStatusMap.get(req.title);
    const isCompleted = formInfo?.status === 'Completed' && !hasOpenRevisionRequest(formInfo);
    const reviewState = getRequirementReviewState(formInfo);
    const canEditUploadedDocument = !isReadOnly && reviewState !== 'reviewed';
    const missingGuidance = getRequirementMissingGuidance(req as any, reviewState);
    const uploadReceipt = uploadReceiptByRequirement[req.title];
    const href = req.href ? `${req.href}${req.href.includes('?') ? '&' : '?'}applicationId=${applicationId}` : '#';
    const csSummaryPdfHref = `/forms/cs-summary-form/printable?applicationId=${encodeURIComponent(applicationId)}`;
    
    if (isReadOnly) {
       if (req.id === 'cs-summary') {
         return (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button asChild variant="outline" className="bg-slate-50">
                 <Link href={href}>View</Link>
             </Button>
             <Dialog>
               <DialogTrigger asChild>
                <Button variant="secondary">
                   Quick View
                 </Button>
               </DialogTrigger>
               <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                 <DialogHeader>
                   <DialogTitle>CS Summary: {application.memberFirstName} {application.memberLastName}</DialogTitle>
                   <DialogDescription>
                     Quick view of CS Summary details.
                   </DialogDescription>
                 </DialogHeader>
                 <div className="space-y-6 py-2">
                   <Section title="Member Information">
                     <QuickViewField label="First Name" value={application.memberFirstName} />
                     <QuickViewField label="Last Name" value={application.memberLastName} />
                     <QuickViewField label="Date of Birth" value={formatBirthDate(application.memberDob)} />
                     <QuickViewField label="MRN" value={application.memberMrn} />
                     <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                     <QuickViewField label="Preferred Language" value={application.memberLanguage} />
                   </Section>

                  <Section title="Submitting User Information">
                    <QuickViewField label="Submitting User Name" value={`${application.referrerFirstName || ''} ${application.referrerLastName || ''}`} />
                    <QuickViewField label="Agency" value={application.agency} />
                    <QuickViewField label="Submitting User Email" value={application.referrerEmail} />
                    <QuickViewField label="Submitting User Phone" value={application.referrerPhone} />
                   </Section>

                   <Section title="Health Plan & Pathway">
                    <QuickViewField label="Health Plan" value={healthPlanWithRegion} />
                    {kaiserRegion ? <QuickViewField label="Kaiser Region" value={kaiserRegion} /> : null}
                     <QuickViewField label="Pathway" value={application.pathway} />
                     <QuickViewField label="Current Location Type" value={application.currentLocation} />
                    <QuickViewField label="Normal Long Term Mailing Address Location Type" value={application.customaryLocationType} />
                   </Section>

                   <Section title="Location Information">
                     <QuickViewField label="Current Location Name" value={application.currentLocationName} />
                     <QuickViewField
                       label="Current Address"
                       value={[
                         String(application.currentAddress || '').trim(),
                         String(application.currentCity || '').trim(),
                         [String(application.currentState || '').trim(), String(application.currentZip || '').trim()]
                           .filter(Boolean)
                           .join(' '),
                         String(application.currentCounty || '').trim(),
                       ]
                         .filter(Boolean)
                         .join(', ')}
                       fullWidth
                     />
                     <QuickViewField label="Customary Location Name" value={application.customaryLocationName} />
                     <QuickViewField
                      label="Normal Long Term Mailing Address"
                       value={[
                         String(application.customaryAddress || '').trim(),
                         String(application.customaryCity || '').trim(),
                         [String(application.customaryState || '').trim(), String(application.customaryZip || '').trim()]
                           .filter(Boolean)
                           .join(' '),
                         String(application.customaryCounty || '').trim(),
                       ]
                         .filter(Boolean)
                         .join(', ')}
                       fullWidth
                     />
                   </Section>
                 </div>
               </DialogContent>
             </Dialog>
            <Button asChild variant="outline" className="bg-slate-50">
              <Link href={csSummaryPdfHref} target="_blank" rel="noopener noreferrer">
                Download PDF
              </Link>
            </Button>
           </div>
         );
       }
      if (req.type === 'Upload') {
          const staffDownloadUrl = formInfo?.downloadURL || (formInfo?.name ? staffDownloadUrls[formInfo.name] : '');
           return (
                <div className="flex min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                    {staffDownloadUrl && (isAdmin || isSuperAdmin) ? (
                        <a
                          href={staffDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-green-800 font-medium hover:underline"
                        >
                            {formInfo?.fileName || 'Completed'}
                        </a>
                    ) : (
                        <span className="min-w-0 flex-1 truncate text-green-800 font-medium">
                            {formInfo?.fileName || 'Completed'}
                            {!isAdmin && !isSuperAdmin && formInfo?.downloadURL && (
                                <span className="block text-xs text-gray-500 mt-1">Document submitted - accessible by staff only</span>
                            )}
                        </span>
                    )}
                </div>
           );
       }
       return (
            <Button asChild variant="outline" className="w-full bg-slate-50">
                <Link href={href}>View</Link>
            </Button>
        );
    }

    const isUploading = uploading[req.title];
    const currentProgress = uploadProgress[req.title];
    const isMultiple = req.title === 'Proof of Income';
    const renderUploadReceipt = () => {
      if (!uploadReceipt || uploadReceipt.fileCount <= 0) return null;
      const uploadedAtLabel = uploadReceipt.uploadedAtIso
        ? (() => {
            try {
              return format(new Date(uploadReceipt.uploadedAtIso), 'MMM d, yyyy h:mm a');
            } catch {
              return '';
            }
          })()
        : '';
      return (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <div className="font-medium">
            Upload received ({uploadReceipt.fileCount} file{uploadReceipt.fileCount === 1 ? '' : 's'})
          </div>
          {uploadedAtLabel ? <div className="text-emerald-800">Saved: {uploadedAtLabel}</div> : null}
          <div className="mt-1 space-y-0.5">
            {uploadReceipt.fileNames.slice(0, 5).map((name) => (
              <div key={`${req.id}-receipt-${name}`} className="truncate">
                - {name}
              </div>
            ))}
          </div>
        </div>
      );
    };
    const renderMissingGuidance = () => {
      if (missingGuidance.length === 0) return null;
      return (
        <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground mb-1">What is still needed</div>
          <ul className="list-disc pl-4 space-y-1">
            {missingGuidance.map((item) => (
              <li key={`${req.id}-guidance-${item}`}>{item}</li>
            ))}
          </ul>
        </div>
      );
    };
    
    switch (req.type) {
        case 'online-form':
            if (req.id === 'waivers') {
                return (
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Waivers are completed directly in this form; this card does not use file uploads.
                        </p>
                        {renderMissingGuidance()}
                        <div className="space-y-2 rounded-md border p-3">
                            {waiverSubTasks.map(task => (
                                <div key={task.id} className="flex items-center space-x-2">
                                    <Checkbox id={`waiver-${task.id}`} checked={task.completed} disabled />
                                    <label htmlFor={`waiver-${task.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {task.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                         <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                            <Link href={href}>
                                {isCompleted ? 'View/Edit Waivers' : 'Complete Waivers'} &rarr;
                            </Link>
                        </Button>
                    </div>
                );
            }
            if (req.id === 'cs-summary') {
                return (
                    <div className="space-y-2">
                      {renderMissingGuidance()}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <Button asChild variant="outline" className="bg-slate-50 hover:bg-slate-100">
                              <Link href={href}>{isCompleted ? 'View/Edit' : 'Start'} &rarr;</Link>
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="secondary">Quick View</Button>
                            </DialogTrigger>
                            <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>CS Summary: {application.memberFirstName} {application.memberLastName}</DialogTitle>
                                <DialogDescription>
                                  Quick view of CS Summary details.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-6 py-2">
                              <Section title="Member Information">
                                <QuickViewField label="First Name" value={application.memberFirstName} />
                                <QuickViewField label="Last Name" value={application.memberLastName} />
                                <QuickViewField label="Date of Birth" value={formatBirthDate(application.memberDob)} />
                                <QuickViewField label="MRN" value={application.memberMrn} />
                                <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                                <QuickViewField label="Preferred Language" value={application.memberLanguage} />
                              </Section>

                              <Section title="Submitting User Information">
                                <QuickViewField label="Submitting User Name" value={`${application.referrerFirstName || ''} ${application.referrerLastName || ''}`} />
                                <QuickViewField label="Agency" value={application.agency} />
                                <QuickViewField label="Submitting User Email" value={application.referrerEmail} />
                                <QuickViewField label="Submitting User Phone" value={application.referrerPhone} />
                              </Section>

                              <Section title="Health Plan & Pathway">
                                <QuickViewField label="Health Plan" value={healthPlanWithRegion} />
                                {kaiserRegion ? <QuickViewField label="Kaiser Region" value={kaiserRegion} /> : null}
                                <QuickViewField label="Pathway" value={application.pathway} />
                                <QuickViewField label="Current Location Type" value={application.currentLocation} />
                                <QuickViewField label="Normal Long Term Mailing Address Location Type" value={application.customaryLocationType} />
                              </Section>

                              <Section title="Location Information">
                                <QuickViewField label="Current Location Name" value={application.currentLocationName} />
                                <QuickViewField
                                  label="Current Address"
                                  value={[
                                    String(application.currentAddress || '').trim(),
                                    String(application.currentCity || '').trim(),
                                    [String(application.currentState || '').trim(), String(application.currentZip || '').trim()]
                                      .filter(Boolean)
                                      .join(' '),
                                    String(application.currentCounty || '').trim(),
                                  ]
                                    .filter(Boolean)
                                    .join(', ')}
                                  fullWidth
                                />
                                <QuickViewField label="Customary Location Name" value={application.customaryLocationName} />
                                <QuickViewField
                                  label="Normal Long Term Mailing Address"
                                  value={[
                                    String(application.customaryAddress || '').trim(),
                                    String(application.customaryCity || '').trim(),
                                    [String(application.customaryState || '').trim(), String(application.customaryZip || '').trim()]
                                      .filter(Boolean)
                                      .join(' '),
                                    String(application.customaryCounty || '').trim(),
                                  ]
                                    .filter(Boolean)
                                    .join(', ')}
                                  fullWidth
                                />
                              </Section>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button asChild variant="outline" className="bg-slate-50 hover:bg-slate-100">
                            <Link href={csSummaryPdfHref} target="_blank" rel="noopener noreferrer">
                              Download PDF
                            </Link>
                          </Button>
                      </div>
                    </div>
                );
            }
            return (
                <div className="space-y-2">
                  {renderMissingGuidance()}
                  <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                      <Link href={href}>{isCompleted ? 'View/Edit' : 'Start'} &rarr;</Link>
                  </Button>
                </div>
            );
        case 'Upload':
             if (req.id === 'proof-of-income') {
                const proofIncomeControl = (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label htmlFor="proof-income-actual-amount">Actual proof of income amount</Label>
                      <Input
                        id="proof-income-actual-amount"
                        value={proofIncomeActualAmountRaw}
                        disabled={isReadOnly}
                        placeholder="Enter amount from proof of income"
                        onChange={(event) =>
                          setApplication((prev) =>
                            prev
                              ? ({ ...(prev as any), proofIncomeActualAmount: event.target.value } as Application)
                              : prev
                          )
                        }
                        onBlur={(event) => {
                          const nextRaw = String(event.target.value || '').trim();
                          const nextAmount = parseCurrencyAmount(nextRaw);
                          void updateProofIncomeDetails({
                            proofIncomeActualAmount: nextRaw,
                            proofIncomeSocFlag: nextAmount != null && nextAmount > 1800,
                          });
                        }}
                      />
                    </div>
                    <div className="text-xs">
                      {proofIncomeSocFlag ? (
                        <span className="font-medium text-amber-700">
                          SOC flag: Actual proof income is over $1,800 and may trigger Medi-Cal SOC.
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          SOC flag: Not triggered (enter amount above $1,800 to trigger).
                        </span>
                      )}
                    </div>
                    {proofIncomeSocFlag ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => void sendProofIncomeSocWarning()}
                        disabled={isSendingProofIncomeSocWarning}
                      >
                        {isSendingProofIncomeSocWarning ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending SOC warning...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send SOC warning to primary contact
                          </>
                        )}
                      </Button>
                    ) : null}
                  </div>
                );
                if (isCompleted) {
                  const staffDownloadUrl = formInfo?.downloadURL || (formInfo?.name ? staffDownloadUrls[formInfo.name] : '');
                  return (
                    <div className="space-y-2">
                      {proofIncomeControl}
                      {renderUploadReceipt()}
                      <div className="min-w-0 max-w-full overflow-hidden p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        {(isAdmin || isSuperAdmin) && staffDownloadUrl ? (
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={staffDownloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-green-800 font-medium hover:underline"
                            >
                              {formInfo?.fileName || 'Completed'}
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
                              onClick={() => handleFileRemove(formInfo!)}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">Remove file</span>
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="block text-green-800 font-medium">Document submitted</span>
                            <span className="block text-xs text-gray-500">Document preview/download is restricted to staff.</span>
                            {canEditUploadedDocument && (
                              <>
                                <Label
                                  htmlFor={`${req.id}-replace`}
                                  className={cn(
                                    "flex h-9 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-xs font-medium ring-offset-background transition-colors hover:bg-primary/90",
                                    isUploading && "opacity-50 pointer-events-none"
                                  )}
                                >
                                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                  <span>{isUploading ? `Replacing... ${currentProgress?.toFixed(0)}%` : 'Upload Revised Document'}</span>
                                </Label>
                                <Input
                                  id={`${req.id}-replace`}
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) => handleFileUpload(e, req.title, formInfo)}
                                  disabled={isUploading}
                                  multiple={isMultiple}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                                  onClick={() => void handleFileRemove(formInfo!)}
                                  disabled={isUploading}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Delete Upload
                                </Button>
                              </>
                            )}
                            {!canEditUploadedDocument && (
                              <span className="block text-xs text-gray-500">
                                This upload is verified by staff and is now frozen.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {proofIncomeControl}
                    {renderMissingGuidance()}
                    {renderUploadReceipt()}
                    {isUploading && (
                      <Progress value={currentProgress} className="h-1 w-full" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Accepted: PDF, Word, JPG, PNG (max 10MB). You can replace files anytime before submit.
                    </p>
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isUploading || isReadOnly) && "opacity-50 pointer-events-none")}>
                      {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading || isReadOnly} multiple={isMultiple} />
                  </div>
                );
             }
             if (isCompleted) {
                 const staffDownloadUrl = formInfo?.downloadURL || (formInfo?.name ? staffDownloadUrls[formInfo.name] : '');
                 return (
                    <div className="space-y-2">
                      {renderUploadReceipt()}
                      <div className="min-w-0 max-w-full overflow-hidden p-2 rounded-md bg-green-50 border border-green-200 text-sm">
                        {(isAdmin || isSuperAdmin) && staffDownloadUrl ? (
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={staffDownloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-green-800 font-medium hover:underline"
                            >
                              {formInfo?.fileName || 'Completed'}
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-100 hover:text-red-600"
                              onClick={() => handleFileRemove(formInfo!)}
                            >
                              <X className="h-4 w-4" />
                              <span className="sr-only">Remove file</span>
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <span className="block text-green-800 font-medium">Document submitted</span>
                            <span className="block text-xs text-gray-500">Document preview/download is restricted to staff.</span>
                            {canEditUploadedDocument && (
                              <>
                                <Label
                                  htmlFor={`${req.id}-replace`}
                                  className={cn(
                                    "flex h-9 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-xs font-medium ring-offset-background transition-colors hover:bg-primary/90",
                                    isUploading && "opacity-50 pointer-events-none"
                                  )}
                                >
                                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                  <span>{isUploading ? `Replacing... ${currentProgress?.toFixed(0)}%` : 'Upload Revised Document'}</span>
                                </Label>
                                <Input
                                  id={`${req.id}-replace`}
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) => handleFileUpload(e, req.title, formInfo)}
                                  disabled={isUploading}
                                  multiple={isMultiple}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                                  onClick={() => void handleFileRemove(formInfo!)}
                                  disabled={isUploading}
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Delete Upload
                                </Button>
                              </>
                            )}
                            {!canEditUploadedDocument && (
                              <span className="block text-xs text-gray-500">
                                This upload is verified by staff and is now frozen.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                 )
             }
             return (
                <div className="space-y-2">
                    {renderMissingGuidance()}
                    {renderUploadReceipt()}
                    {isUploading && (
                        <Progress value={currentProgress} className="h-1 w-full" />
                    )}
                    <p className="text-xs text-muted-foreground">
                      Accepted: PDF, Word, JPG, PNG (max 10MB). You can replace files anytime before submit.
                    </p>
                    {req.href && req.href !== '#' && (
                        <Button asChild variant="link" className="w-full text-xs h-auto py-0">
                           <Link href={req.href} target="_blank">
                               <Printer className="mr-1 h-3 w-3" /> Download/Print Blank Form
                           </Link>
                       </Button>
                    )}
                    <Label htmlFor={req.id} className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isUploading || isReadOnly) && "opacity-50 pointer-events-none")}>
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                        <span>{isUploading ? `Uploading... ${currentProgress?.toFixed(0)}%` : 'Upload File(s)'}</span>
                    </Label>
                    <Input id={req.id} type="file" className="sr-only" onChange={(e) => handleFileUpload(e, req.title)} disabled={isUploading || isReadOnly} multiple={isMultiple} />
                </div>
            );
        default:
            return null;
    }
};

  const isConsolidatedUploading = uploading['consolidated-medical-upload'];
  const consolidatedProgress = uploadProgress['consolidated-medical-upload'];
  const isAnyConsolidatedChecked = Object.values(consolidatedUploadChecks).some(v => v);
  const userPrimaryCardsCount =
    visiblePathwayRequirements.length + (!isReadOnly && consolidatedMedicalDocuments.length > 0 ? 1 : 0);
  const showUserPlaceholderCard = userPrimaryCardsCount % 2 === 1;

  return (
    <>
      <Header />
      <main className="flex-grow bg-slate-50/50 py-8 sm:py-12">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8 max-w-full overflow-x-hidden">
          {/* Back to Applications Hub Link */}
          <div className="flex items-center">
            <Link 
              href="/applications" 
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Applications Hub
            </Link>
          </div>
            <Card className="shadow-sm">
                <CardHeader>
                <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
                    Application for {application.memberFirstName} {application.memberLastName}
                </CardTitle>
                <CardDescription className="text-sm">
                  MRN: {memberMrnDisplay} | Birthdate: {memberBirthdateDisplay}
                </CardDescription>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardDescription>
                    Submitted by {application.referrerName || user?.displayName} | {application.pathway} ({healthPlanWithRegion})
                    </CardDescription>
                </div>
                </CardHeader>
                <CardContent className="space-y-4">
                {servicesDeclined && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Community Support Services Declined</AlertTitle>
                        <AlertDescription>
                            This application cannot be submitted because Community Support services were declined in the Freedom of Choice waiver.
                        </AlertDescription>
                    </Alert>
                )}
                {application.status === 'Requires Revision' && rejectedRequirements.length > 0 && (
                    <Alert variant="warning">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Action needed: Please resubmit rejected item(s)</AlertTitle>
                        <AlertDescription>
                          <div className="mt-1 space-y-1 text-sm">
                            {rejectedRequirements.map((item) => (
                              <div key={item.title}>
                                <span className="font-medium">{item.title}</span>
                                {item.reason ? ` - ${item.reason}` : ''}
                              </div>
                            ))}
                          </div>
                        </AlertDescription>
                    </Alert>
                )}
                {String(application.healthPlan || '').toLowerCase().includes('kaiser') && kaiserReferralSubmitted && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Kaiser referral form already submitted</AlertTitle>
                    <AlertDescription>
                      Submitted {kaiserReferralSubmittedAt ? `on ${kaiserReferralSubmittedAt}` : 'previously'}.
                      {kaiserReferralSubmittedByName || kaiserReferralSubmittedByEmail
                        ? ` Sent by ${
                            [kaiserReferralSubmittedByName, kaiserReferralSubmittedByEmail]
                              .filter(Boolean)
                              .join(' ')
                          }.`
                        : ''}
                      Duplicate sends are blocked unless staff uses an explicit override.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="truncate col-span-2 sm:col-span-1"><strong>Application ID:</strong> <span className="font-mono text-xs">{application.id}</span></div>
                    <div><strong>Status:</strong> <span className="font-semibold">{application.status}</span></div>
                </div>
                {(isAdmin || isSuperAdmin) && String(application.healthPlan || '').toLowerCase().includes('kaiser') && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">Social Worker Assignment (ALFT)</div>
                      <div className="flex items-center gap-2">
                        {swAssignmentLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => void loadSwAssignment()}
                          disabled={swAssignmentLoading}
                        >
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          Refresh
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <strong>Kaiser Status:</strong>{' '}
                        <span>{swAssignment?.kaiserStatus || 'Not found'}</span>
                      </div>
                      <div>
                        <strong>Assigned Social Worker:</strong>{' '}
                        <span>
                          {swAssignment?.assignedSwName || swAssignment?.assignedSwEmail || 'Not assigned'}
                        </span>
                      </div>
                    </div>
                    {swAssignmentError ? (
                      <div className="text-xs text-amber-700">{swAssignmentError}</div>
                    ) : null}
                    <div className="flex items-start gap-2 rounded-md border p-2">
                      <Checkbox
                        id="sw-portal-invite"
                        checked={swInviteEnabled}
                        onCheckedChange={(checked) => setSwInviteEnabled(Boolean(checked))}
                        disabled={isReadOnly || !swAssignment?.eligible || !swAssignment?.assignedSwEmail}
                      />
                      <div className="space-y-1">
                        <Label htmlFor="sw-portal-invite" className="text-sm font-medium">
                          Invite assigned social worker to Social Worker Portal for ALFT
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Enabled only when Kaiser Status is RN Visit Needed and a Social Worker is assigned.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSaveSocialWorkerInvite()}
                        disabled={swInviteSaving || isReadOnly || !swAssignment?.eligible || !swAssignment?.assignedSwEmail}
                      >
                        {swInviteSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : swInviteEnabled ? (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Save & Send Invite
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      {Boolean((application as any)?.swPortalInviteSentBy) ? (
                        <span className="text-xs text-muted-foreground">
                          Last invite sent by {String((application as any)?.swPortalInviteSentBy || '').trim()}.
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span className="font-medium">Document Checklist</span>
                        <span>{completedCount} of {totalCount} completed</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowMissingOnly((prev) => !prev)}
                        className="text-xs"
                      >
                        {showMissingOnly ? 'Show all cards' : 'Upload missing only'}
                      </Button>
                    </div>
                    <div className="space-y-2 rounded-md border p-3">
                        {orderedPathwayRequirements.map((req) => {
                            const formInfo = formStatusMap.get(req.title);
                            const reviewState = getRequirementReviewState(formInfo);
                            const isCompleted = reviewState === 'under_review' || reviewState === 'reviewed';
                            return (
                                <div key={req.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={isCompleted} disabled />
                                    <span
                                      className={cn(
                                        reviewState === 'reviewed' || reviewState === 'under_review'
                                          ? 'text-green-700'
                                          : reviewState === 'needs_revision'
                                          ? 'text-amber-700'
                                          : 'text-muted-foreground'
                                      )}
                                    >
                                        {req.title}
                                        <span className="ml-2 text-xs font-normal">
                                          ({getRequirementReviewLabel(reviewState)})
                                        </span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                </CardContent>
                {(!isReadOnly && (application.status === 'In Progress' || application.status === 'Requires Revision')) && (
                    <CardFooter>
                        <div className="w-full space-y-3">
                          {!allRequiredFormsComplete && (
                            <Alert variant="warning">
                              <Info className="h-4 w-4" />
                              <AlertTitle>Complete required items before submitting</AlertTitle>
                              <AlertDescription>
                                <div className="mt-1 text-sm">
                                  Missing: {missingRequiredRequirements.map((req) => req.title).join(', ')}
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          <Button 
                              className="w-full bg-emerald-600 text-white hover:bg-emerald-700" 
                              disabled={!allRequiredFormsComplete || isSubmitting || servicesDeclined}
                              onClick={handleSubmitApplication}
                          >
                              {isSubmitting ? (
                                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                              ) : (
                                  <><Send className="mr-2 h-4 w-4" /> Submit Application for Review</>
                              )}
                          </Button>
                        </div>
                    </CardFooter>
                )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {application.pathway === 'SNF Diversion' ? (
                  <Alert className="md:col-span-2 border-blue-200 bg-blue-50 text-blue-900">
                    <Info className="h-4 w-4" />
                    <AlertTitle>SNF Facesheet note</AlertTitle>
                    <AlertDescription>
                      SNF Facesheet is only required for the SNF Transition pathway and is not required for SNF Diversion.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {visiblePathwayRequirements.length === 0 ? (
                  <Card className="md:col-span-2">
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No missing cards right now. You can switch back to view all cards.
                    </CardContent>
                  </Card>
                ) : null}
                {visiblePathwayRequirements.map((req) => {
                    const formInfo = formStatusMap.get(req.title);
                    const reviewState = getRequirementReviewState(formInfo);

                    // Visual hierarchy: color-coded left border per state
                    const cardBorderClass = reviewState === 'needs_revision'
                      ? 'border-l-4 border-l-amber-400'
                      : reviewState === 'reviewed'
                      ? 'border-l-4 border-l-green-400'
                      : reviewState === 'under_review'
                      ? 'border-l-4 border-l-blue-400'
                      : reviewState === 'pending'
                      ? 'border-l-4 border-l-gray-200'
                      : '';

                    // Human-readable state label with icon hint
                    const reviewBadge = reviewState === 'needs_revision'
                      ? { text: '⚠ Action needed — please resubmit', cls: 'text-amber-700 font-semibold' }
                      : reviewState === 'reviewed'
                      ? { text: '✓ Reviewed by staff', cls: 'text-green-700 font-medium' }
                      : reviewState === 'under_review'
                      ? { text: '⏳ Submitted — staff is reviewing', cls: 'text-blue-700' }
                      : { text: 'Not yet submitted', cls: 'text-muted-foreground' };
                    
                    return (
                        <Card
                          key={req.id}
                          id={`pathway-card-${req.id}`}
                          className={cn(
                            "flex flex-col shadow-sm hover:shadow-md transition-shadow",
                            cardBorderClass,
                            focusedRequirementId === req.id && 'ring-2 ring-blue-400'
                          )}
                        >
                            <CardHeader className="pb-4">
                                <div className="flex justify-between items-start gap-4">
                                    <CardTitle className="text-lg">{req.title}</CardTitle>
                                </div>
                                <CardDescription>{req.description}</CardDescription>
                                {req.id === 'waivers' && waiverPossibleSocWarning && (
                                  <Alert variant="warning" className="mt-3">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Possible SOC Warning</AlertTitle>
                                    <AlertDescription>
                                      Member monthly income is above $2,000. This may indicate a Medi-Cal Share of Cost (SOC) that must be resolved to $0 before CalAIM enrollment.
                                    </AlertDescription>
                                  </Alert>
                                )}
                            </CardHeader>
                            <CardContent className="flex flex-col flex-grow justify-end gap-4">
                                <StatusIndicator state={reviewState} isUpload={req.type === 'Upload'} />
                                <p className={cn('text-xs', reviewBadge.cls)}>
                                  {reviewBadge.text}
                                </p>
                                {reviewState === 'needs_revision' && Boolean((formInfo as any)?.revisionRequestedReason) && (
                                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                                    <strong>Staff note:</strong> {String((formInfo as any)?.revisionRequestedReason || '').trim()}
                                  </div>
                                )}
                                {getFormAction(req)}
                            </CardContent>
                        </Card>
                    )
                })}

                {!isReadOnly && consolidatedMedicalDocuments.length > 0 && (
                    <Card key="consolidated-medical" className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-muted-foreground"/>Consolidated Medical Documents (Optional)</CardTitle>
                            </div>
                            <CardDescription>Upload LIC 602A, medicine list, and SNF facesheet together when applicable.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-grow justify-end gap-4">
                            {isConsolidatedUploading && (
                                <Progress value={consolidatedProgress} className="h-1 w-full" />
                            )}
                            <div className="space-y-2 rounded-md border p-3">
                                {consolidatedMedicalDocuments.map(doc => (
                                     <div key={doc.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={doc.id}
                                            checked={consolidatedUploadChecks[doc.name as keyof typeof consolidatedUploadChecks]}
                                            onCheckedChange={(checked) => {
                                                setConsolidatedUploadChecks(prev => ({ ...prev, [doc.name]: !!checked }))
                                            }}
                                            disabled={isReadOnly || formStatusMap.get(doc.name)?.status === 'Completed'}
                                        />
                                        <label htmlFor={doc.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            {doc.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                            <Label htmlFor="consolidated-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isConsolidatedUploading || isReadOnly || !isAnyConsolidatedChecked) && "opacity-50 pointer-events-none")}>
                                {isConsolidatedUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                                <span>{isConsolidatedUploading ? `Uploading... ${consolidatedProgress?.toFixed(0)}%` : 'Upload Consolidated Documents'}</span>
                            </Label>
                            <Input id="consolidated-upload" type="file" className="sr-only" onChange={handleConsolidatedUpload} disabled={isConsolidatedUploading || isReadOnly || !isAnyConsolidatedChecked} multiple />
                        </CardContent>
                    </Card>
                )}
                {showFeedbackCard && (
                    <Card key="customer-feedback-survey" className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start gap-4">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <MessageSquareHeart className="h-5 w-5 text-muted-foreground" />
                                  Customer Feedback Survey (Optional)
                                </CardTitle>
                            </div>
                            <CardDescription>
                              Tell us how your application experience went. Your feedback helps improve the process and does not affect eligibility.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col flex-grow justify-end gap-4">
                            <StatusIndicator state={feedbackCompleted ? 'reviewed' : 'pending'} />
                            <Button asChild variant="outline" className="w-full bg-slate-50 hover:bg-slate-100">
                                <Link href={`/forms/customer-feedback?applicationId=${encodeURIComponent(String(applicationId || ''))}`}>
                                    {feedbackCompleted ? 'View/Edit Feedback' : 'Give Feedback'} &rarr;
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
                {showUserPlaceholderCard && (
                    <Card
                      aria-hidden="true"
                      className="hidden md:flex border-dashed border-muted-foreground/20 bg-transparent shadow-none pointer-events-none"
                    >
                      <CardContent className="h-full min-h-[120px]" />
                    </Card>
                )}
            </div>

          {/* Help footer */}
          <div className="text-center text-sm text-muted-foreground border-t pt-6">
            Have a question or need help with a document?{' '}
            <Link href="/contact" className="text-blue-600 hover:underline font-medium">
              Contact us
            </Link>
            {' '}and a Connections team member will assist you.
          </div>

        </div>
      </main>
    </>
  );
}

export default function PathwayPage() {
  return (
    <Suspense fallback={
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4">Loading Application Pathway...</p>
        </div>
    }>
      <PathwayPageContent />
    </Suspense>
  );
}
