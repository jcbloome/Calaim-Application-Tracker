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

export function IlsServiceStartedEmailDialog({
  application,
  buttonVariant = 'outline',
  buttonClassName = 'w-full justify-start gap-2',
  buttonLabel,
}: {
  application: Application;
  buttonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'compose' | 'preview'>('compose');
  const [isSending, setIsSending] = useState(false);
  const [ilsSubjectDraft, setIlsSubjectDraft] = useState('');
  const [ilsBodyDraft, setIlsBodyDraft] = useState('');
  const [previewAck, setPreviewAck] = useState(false);
  const [senderProfile, setSenderProfile] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  const memberName = `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() || 'Member';
  const memberMrn = String((application as any)?.memberMrn || (application as any)?.confirmMemberMrn || '').trim();
  const lastSentAtMs = toMillisSafe((application as any)?.ilsServiceStartedEmailLastSentAt);
  const lastSentLabel = useMemo(() => {
    if (!lastSentAtMs) return '';
    try {
      return format(new Date(lastSentAtMs), 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  }, [lastSentAtMs]);

  const senderName =
    String(senderProfile?.name || user?.displayName || '').trim() ||
    String(user?.email || '').trim() ||
    'CalAIM Team';
  const senderEmail =
    String(senderProfile?.email || user?.email || '').trim();
  const senderPhone =
    String(senderProfile?.phone || '').trim() || DEFAULT_SENDER_PHONE;
  const senderSignature = useMemo(
    () =>
      buildIlsEmailSignature({
        name: senderName,
        email: senderEmail,
        phone: senderPhone,
      }),
    [senderName, senderEmail, senderPhone]
  );

  const defaultIlsSubject = `To ILS: Re: ${memberName}${memberMrn ? `: ${memberMrn}` : ''}`;
  const defaultIlsBody = withIlsEmailSignature(
    [
      'Hi ILS,',
      '',
      'Please note we have STARTED service delivery for this member.',
      '',
      `Member: ${memberName}${memberMrn ? ` | MRN: ${memberMrn}` : ''}`,
    ].join('\n'),
    senderSignature
  );

  const docRef = useMemoFirebase(() => {
    if (!firestore || !application.id) return null;
    const isAdminStored =
      String(application.id || '').startsWith('admin_app_') ||
      !String(application.userId || '').trim();
    if (isAdminStored) return doc(firestore, 'applications', application.id);
    return doc(firestore, `users/${application.userId}/applications`, application.id);
  }, [firestore, application.id, application.userId]);

  useEffect(() => {
    if (!isOpen) {
      setStep('compose');
      setPreviewAck(false);
      return;
    }
    let cancelled = false;
    const loadSenderProfile = async () => {
      const fallback = {
        name: String(user?.displayName || '').trim() || String(user?.email || '').trim() || 'CalAIM Team',
        email: String(user?.email || '').trim(),
        phone: DEFAULT_SENDER_PHONE,
      };
      if (!firestore || !user?.uid) {
        if (!cancelled) setSenderProfile(fallback);
        return;
      }
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        const data = snap.exists() ? (snap.data() as any) : {};
        const firstName = String(data?.firstName || '').trim();
        const lastName = String(data?.lastName || '').trim();
        const fullName =
          `${firstName} ${lastName}`.trim() ||
          String(data?.displayName || data?.name || user?.displayName || '').trim() ||
          fallback.name;
        const email = String(data?.email || user?.email || '').trim() || fallback.email;
        const phone =
          String(
            data?.phone ||
              data?.phoneNumber ||
              data?.mobilePhone ||
              data?.workPhone ||
              data?.officePhone ||
              ''
          ).trim() || DEFAULT_SENDER_PHONE;
        if (!cancelled) setSenderProfile({ name: fullName, email, phone });
      } catch {
        if (!cancelled) setSenderProfile(fallback);
      }
    };
    void loadSenderProfile();
    return () => {
      cancelled = true;
    };
  }, [isOpen, firestore, user?.uid, user?.displayName, user?.email]);

  const openPreview = () => {
    setIlsSubjectDraft(defaultIlsSubject);
    setIlsBodyDraft(defaultIlsBody);
    setPreviewAck(false);
    setStep('preview');
  };

  const handleSend = async () => {
    if (!previewAck) {
      toast({
        variant: 'destructive',
        title: 'Review required',
        description: 'Check the preview confirmation before sending.',
      });
      return;
    }
    setIsSending(true);
    try {
      const result = await sendIlsServiceStartedEmails({
        memberName,
        memberMrn,
        applicationId: String(application.id || '').trim(),
        replyTo: senderEmail || String(user?.email || '').trim(),
        ilsSubject: ilsSubjectDraft,
        ilsBody: withIlsEmailSignature(ilsBodyDraft, senderSignature),
        senderName,
        senderEmail,
        senderPhone,
      });
      const sentAtIso = new Date().toISOString();
      if (docRef) {
        await setDoc(
          docRef,
          {
            ilsServiceStartedEmailLastSentAt: serverTimestamp(),
            ilsServiceStartedEmailLastSentToIls: ILS_SERVICE_STARTED_EMAIL,
            ilsServiceStartedEmailLastSentByName: senderName || null,
            ilsServiceStartedEmailLastSentByEmail: senderEmail || null,
            ilsServiceStartedEmailLastSentByPhone: senderPhone || null,
            memberActionLog: arrayUnion(
              buildMemberActionLogEntry({
                actionKey: MEMBER_ACTION_KEYS.ilsServiceStartedEmail,
                label: 'Email ILS: service started',
                atIso: sentAtIso,
                byName: senderName || null,
                byEmail: senderEmail || null,
                details: `To ${ILS_SERVICE_STARTED_EMAIL}`,
              })
            ),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => undefined);
      }
      const syncResult = await maybeSyncIlsClaimsWorkflowToCaspio(application as Record<string, unknown>, {
        ilsServiceStartedEmailLastSentAt: sentAtIso,
      });
      if (syncResult.synced && syncResult.success) {
        toast({
          title: 'Caspio updated',
          description: 'ILS notified, claims dept notified, and Caspio workflow fields synced.',
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          title: 'ILS notified',
          description: `Sent to ${result.ilsTo}.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        if (syncResult.synced && !syncResult.success) {
          toast({
            variant: 'destructive',
            title: 'Caspio sync failed',
            description: String(syncResult.message || 'Unable to sync workflow fields to Caspio.'),
          });
        }
      }
      setIsOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: String(error?.message || 'Unable to send ILS email.'),
      });
    } finally {
      setIsSending(false);
    }
  };

  const canConfirmSend =
    previewAck && Boolean(ilsSubjectDraft.trim()) && Boolean(ilsBodyDraft.trim());

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setStep('compose');
          setPreviewAck(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className={buttonClassName}>
          <Mail className="h-4 w-4" />
          <span className="qa-label">{buttonLabel || 'Email ILS: service started'}</span>
          <span className="ml-auto inline-flex shrink-0">
            <QaDoneMeta done={Boolean(lastSentAtMs)} atMs={lastSentAtMs || undefined} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'compose' ? 'Email ILS — service started' : 'Preview ILS email'}
          </DialogTitle>
          <DialogDescription>
            {step === 'compose'
              ? 'Notify ILS that service delivery has started for this member.'
              : 'Review (and edit if needed). Nothing is sent until you confirm.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'compose' ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 space-y-1">
              <div><span className="font-medium">ILS recipient:</span> {ILS_SERVICE_STARTED_EMAIL}</div>
              <div><span className="font-medium">Member:</span> {memberName}{memberMrn ? ` · MRN ${memberMrn}` : ''}</div>
            </div>
            {lastSentLabel ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                Last sent {lastSentLabel}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                ILS email preview
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input value={ILS_SERVICE_STARTED_EMAIL} readOnly className="mt-1 bg-background" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <Input
                  value={ilsSubjectDraft}
                  onChange={(e) => setIlsSubjectDraft(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Message</Label>
                <Textarea
                  value={ilsBodyDraft}
                  onChange={(e) => setIlsBodyDraft(e.target.value)}
                  rows={8}
                  className="mt-1"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
              <Checkbox
                className="mt-0.5"
                checked={previewAck}
                onCheckedChange={(checked) => setPreviewAck(Boolean(checked))}
              />
              <span>I reviewed this email preview and confirm it is ready to send.</span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'compose' ? (
            <>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={openPreview}>
                Preview email
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep('compose');
                  setPreviewAck(false);
                }}
                disabled={isSending}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !canConfirmSend}
              >
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Confirm & Send
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClaimsDepartmentEmailDialog({
  application,
  buttonVariant = 'outline',
  buttonClassName = 'w-full justify-start gap-2',
  buttonLabel,
}: {
  application: Application;
  buttonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'compose' | 'preview'>('compose');
  const [isSending, setIsSending] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [previewAck, setPreviewAck] = useState(false);
  const [claimsRecipients, setClaimsRecipients] = useState<Array<{ email: string; name: string }>>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [senderProfile, setSenderProfile] = useState<{
    name: string;
    email: string;
    phone: string;
  } | null>(null);

  const memberName = `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() || 'Member';
  const memberMrn = String((application as any)?.memberMrn || (application as any)?.confirmMemberMrn || '').trim();
  const lastSentAtMs = toMillisSafe((application as any)?.claimsDepartmentEmailLastSentAt);
  const lastSentLabel = useMemo(() => {
    if (!lastSentAtMs) return '';
    try {
      return format(new Date(lastSentAtMs), 'MMM d, yyyy h:mm a');
    } catch {
      return '';
    }
  }, [lastSentAtMs]);

  const senderName =
    String(senderProfile?.name || user?.displayName || '').trim() ||
    String(user?.email || '').trim() ||
    'CalAIM Team';
  const senderEmail = String(senderProfile?.email || user?.email || '').trim();
  const senderPhone = String(senderProfile?.phone || '').trim() || DEFAULT_SENDER_PHONE;
  const senderSignature = useMemo(
    () => buildIlsEmailSignature({ name: senderName, email: senderEmail, phone: senderPhone }),
    [senderName, senderEmail, senderPhone]
  );

  const recipientEmails = useMemo(() => {
    const emails = claimsRecipients
      .map((r) => String(r.email || '').trim().toLowerCase())
      .filter((email) => email.includes('@'));
    return emails.length ? emails : [CLAIMS_EMAIL_TO];
  }, [claimsRecipients]);
  const recipientLabel = useMemo(() => recipientEmails.join(', '), [recipientEmails]);
  const greetingName =
    claimsRecipients.length === 1
      ? String(claimsRecipients[0]?.name || '').trim().split(/\s+/)[0] || CLAIMS_EMAIL_NAME
      : claimsRecipients.length > 1
        ? 'Claims Team'
        : CLAIMS_EMAIL_NAME;

  const defaultSubject = `Start claims: ${memberName}${memberMrn ? ` (MRN ${memberMrn})` : ''}`;
  const defaultBody = withIlsEmailSignature(
    [
      `Hi ${greetingName},`,
      '',
      'Please start submitting claims for this member.',
      '',
      `Member: ${memberName}${memberMrn ? ` | MRN: ${memberMrn}` : ''}`,
    ].join('\n'),
    senderSignature
  );

  const docRef = useMemoFirebase(() => {
    if (!firestore || !application.id) return null;
    const isAdminStored =
      String(application.id || '').startsWith('admin_app_') ||
      !String(application.userId || '').trim();
    if (isAdminStored) return doc(firestore, 'applications', application.id);
    return doc(firestore, `users/${application.userId}/applications`, application.id);
  }, [firestore, application.id, application.userId]);

  useEffect(() => {
    if (!isOpen) {
      setStep('compose');
      setPreviewAck(false);
      return;
    }
    let cancelled = false;
    const loadSenderProfile = async () => {
      const fallback = {
        name: String(user?.displayName || '').trim() || String(user?.email || '').trim() || 'CalAIM Team',
        email: String(user?.email || '').trim(),
        phone: DEFAULT_SENDER_PHONE,
      };
      if (!firestore || !user?.uid) {
        if (!cancelled) setSenderProfile(fallback);
        return;
      }
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        const data = snap.exists() ? (snap.data() as any) : {};
        const firstName = String(data?.firstName || '').trim();
        const lastName = String(data?.lastName || '').trim();
        const fullName =
          `${firstName} ${lastName}`.trim() ||
          String(data?.displayName || data?.name || user?.displayName || '').trim() ||
          fallback.name;
        const email = String(data?.email || user?.email || '').trim() || fallback.email;
        const phone =
          String(
            data?.phone ||
              data?.phoneNumber ||
              data?.mobilePhone ||
              data?.workPhone ||
              data?.officePhone ||
              ''
          ).trim() || DEFAULT_SENDER_PHONE;
        if (!cancelled) setSenderProfile({ name: fullName, email, phone });
      } catch {
        if (!cancelled) setSenderProfile(fallback);
      }
    };
    void loadSenderProfile();
    const loadClaimsRecipients = async () => {
      if (!firestore) {
        if (!cancelled) setClaimsRecipients([{ email: CLAIMS_EMAIL_TO, name: CLAIMS_EMAIL_NAME }]);
        return;
      }
      setLoadingRecipients(true);
      try {
        const settingsSnap = await getDoc(doc(firestore, 'system_settings', 'notifications'));
        const uids = Array.isArray((settingsSnap.data() as any)?.claimsDepartmentNotifyRecipientUids)
          ? ((settingsSnap.data() as any).claimsDepartmentNotifyRecipientUids as unknown[])
              .map((uid) => String(uid || '').trim())
              .filter(Boolean)
          : [];

        if (!uids.length) {
          if (!cancelled) setClaimsRecipients([{ email: CLAIMS_EMAIL_TO, name: CLAIMS_EMAIL_NAME }]);
          return;
        }

        const rows = await Promise.all(
          uids.map(async (uid) => {
            try {
              const snap = await getDoc(doc(firestore, 'users', uid));
              const data = snap.exists() ? (snap.data() as any) : {};
              const email = String(data?.email || '').trim().toLowerCase();
              const name =
                `${String(data?.firstName || '').trim()} ${String(data?.lastName || '').trim()}`.trim() ||
                String(data?.displayName || data?.name || '').trim() ||
                email;
              return email.includes('@') ? { email, name } : null;
            } catch {
              return null;
            }
          })
        );

        const recipients = rows.filter(Boolean) as Array<{ email: string; name: string }>;
        if (!cancelled) {
          setClaimsRecipients(
            recipients.length ? recipients : [{ email: CLAIMS_EMAIL_TO, name: CLAIMS_EMAIL_NAME }]
          );
        }
      } catch {
        if (!cancelled) setClaimsRecipients([{ email: CLAIMS_EMAIL_TO, name: CLAIMS_EMAIL_NAME }]);
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    };
    void loadClaimsRecipients();
    return () => {
      cancelled = true;
    };
  }, [isOpen, firestore, user?.uid, user?.displayName, user?.email]);

  const openPreview = () => {
    setSubjectDraft(defaultSubject);
    setBodyDraft(defaultBody);
    setPreviewAck(false);
    setStep('preview');
  };

  const handleSend = async () => {
    if (!previewAck) {
      toast({
        variant: 'destructive',
        title: 'Review required',
        description: 'Check the preview confirmation before sending.',
      });
      return;
    }
    setIsSending(true);
    try {
      const result = await sendClaimsDepartmentEmail({
        memberName,
        memberMrn,
        applicationId: String(application.id || '').trim(),
        replyTo: senderEmail || String(user?.email || '').trim(),
        staffName: greetingName,
        staffEmail: recipientEmails[0],
        staffEmails: recipientEmails,
        staffSubject: subjectDraft,
        staffBody: withIlsEmailSignature(bodyDraft, senderSignature),
        senderName,
        senderEmail,
        senderPhone,
      });
      const sentAtIso = new Date().toISOString();
      if (docRef) {
        await setDoc(
          docRef,
          {
            claimsDepartmentEmailLastSentAt: serverTimestamp(),
            claimsDepartmentEmailLastSentTo: recipientLabel,
            claimsDepartmentEmailLastSentByName: senderName || null,
            claimsDepartmentEmailLastSentByEmail: senderEmail || null,
            claimsDepartmentEmailLastSentByPhone: senderPhone || null,
            memberActionLog: arrayUnion(
              buildMemberActionLogEntry({
                actionKey: MEMBER_ACTION_KEYS.claimsDepartmentEmail,
                label: 'Email claims department',
                atIso: sentAtIso,
                byName: senderName || null,
                byEmail: senderEmail || null,
                details: `To ${recipientLabel}`,
              })
            ),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => undefined);
      }
      const syncResult = await maybeSyncIlsClaimsWorkflowToCaspio(application as Record<string, unknown>, {
        claimsDepartmentEmailLastSentAt: sentAtIso,
      });
      if (syncResult.synced && syncResult.success) {
        toast({
          title: 'Claims department emailed',
          description: `Sent to ${result.staffTo}. Caspio workflow fields synced.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
      } else {
        toast({
          title: 'Claims department emailed',
          description: `Sent to ${result.staffTo}.`,
          className: 'bg-green-100 text-green-900 border-green-200',
        });
        if (syncResult.synced && !syncResult.success) {
          toast({
            variant: 'destructive',
            title: 'Caspio sync failed',
            description: String(syncResult.message || 'Unable to sync workflow fields to Caspio.'),
          });
        }
      }
      setIsOpen(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: String(error?.message || 'Unable to send claims email.'),
      });
    } finally {
      setIsSending(false);
    }
  };

  const canConfirmSend =
    previewAck && Boolean(subjectDraft.trim()) && Boolean(bodyDraft.trim());

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setStep('compose');
          setPreviewAck(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={buttonVariant} className={buttonClassName}>
          <Mail className="h-4 w-4" />
          <span className="qa-label">{buttonLabel || 'Email claims department'}</span>
          <span className="ml-auto inline-flex shrink-0">
            <QaDoneMeta done={Boolean(lastSentAtMs)} atMs={lastSentAtMs || undefined} />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'compose' ? 'Email claims department' : 'Preview claims email'}
          </DialogTitle>
          <DialogDescription>
            {step === 'compose'
              ? 'Ask claims to start submitting for this member. Optional and separate from ILS notice.'
              : 'Review (and edit if needed). Nothing is sent until you confirm.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'compose' ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
              <div>
                <span className="font-medium">Claims recipient{recipientEmails.length === 1 ? '' : 's'}:</span>{' '}
                {loadingRecipients ? 'Loading…' : recipientLabel}
              </div>
              <div className="text-[11px] text-amber-900/80">
                Based on Staff Management → Claims department notify. If none are checked, falls back to{' '}
                {CLAIMS_EMAIL_TO}.
              </div>
              <div><span className="font-medium">Member:</span> {memberName}{memberMrn ? ` · MRN ${memberMrn}` : ''}</div>
            </div>
            {lastSentLabel ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                Last sent {lastSentLabel}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border p-3 space-y-3 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Claims email preview
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input value={recipientLabel} readOnly className="mt-1 bg-background" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <Input value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Message</Label>
                <Textarea value={bodyDraft} onChange={(e) => setBodyDraft(e.target.value)} rows={8} className="mt-1" />
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
              <Checkbox className="mt-0.5" checked={previewAck} onCheckedChange={(checked) => setPreviewAck(Boolean(checked))} />
              <span>I reviewed this email preview and confirm it is ready to send.</span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'compose' ? (
            <>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="button" onClick={openPreview}>Preview email</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => { setStep('compose'); setPreviewAck(false); }} disabled={isSending}>Back</Button>
              <Button type="button" onClick={() => void handleSend()} disabled={isSending || !canConfirmSend}>
                {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Confirm & Send
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
