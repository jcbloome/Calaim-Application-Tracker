
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parse, differenceInHours } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Sparkles, FileText, ExternalLink, CheckCircle2, Mail, Bell, Download } from 'lucide-react';
import type { Application } from '@/lib/definitions';
import { EmptyState } from '@/components/EmptyState';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { type WithId } from '@/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/use-admin';
import { ApplicationTrackerInline } from '@/components/admin/ApplicationTrackerInline';
import { countPendingDocumentReviews, isCsSummaryFormName, isPendingDocumentReview } from '@/lib/review-queue';

type ApplicationStatusType = Application['status'];
type IncomingDocumentSummary = {
  name: string;
  flaggedCount: number;
  totalCount: number;
};
type GroupedApplicationRow = {
  key: string;
  primaryApp: WithId<Application & FormValues>;
  appIds: string[];
  incomingDocuments: IncomingDocumentSummary[];
};

const getBadgeVariant = (status: ApplicationStatusType) => {
  switch (status) {
    case 'Approved':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Completed & Submitted':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Requires Revision':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'In Progress':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getCsSummaryNeedsReview = (app: WithId<Application & FormValues>) => {
  const forms = app.forms || [];
  const hasCompletedSummary = forms.some((form: any) => isCsSummaryFormName(form?.name) && form.status === 'Completed');
  return hasCompletedSummary && !app.applicationChecked;
};

const getCsSummaryCompletedAt = (app: WithId<Application & FormValues>): Date | null => {
  const forms = app.forms || [];
  const completedSummary = forms.find(
    (form: any) => isCsSummaryFormName(form?.name) && form.status === 'Completed' && form.dateCompleted
  ) as any;

  const raw = completedSummary?.dateCompleted;
  if (!raw) return null;
  if (typeof raw?.toDate === 'function') return raw.toDate();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const isNewCsSummary = (app: WithId<Application & FormValues>) => {
  const completedAt = getCsSummaryCompletedAt(app);
  if (!completedAt) return false;
  if (app.applicationChecked) return false;
  // "New" window: 24 hours from CS summary completion time
  return differenceInHours(new Date(), completedAt) < 24;
};

const getUnacknowledgedDocsCount = (app: WithId<Application & FormValues>) => {
  return countPendingDocumentReviews(app.forms || []);
};

const normalizeLookup = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const sanitizeUserId = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return '';
  return raw;
};

const isAdminStoredApplication = (app: WithId<Application & FormValues>) =>
  String(app.id || '').startsWith('admin_app_') ||
  String((app as any)?.source || '').trim().toLowerCase() === 'admin' ||
  !sanitizeUserId((app as any)?.userId);

export const buildAdminApplicationHref = (
  app: WithId<Application & FormValues>,
  extraParams?: Record<string, string>
) => {
  const params = new URLSearchParams();
  const cleanUserId = sanitizeUserId((app as any)?.userId);
  if (cleanUserId && !isAdminStoredApplication(app)) {
    params.set('userId', cleanUserId);
  }
  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (String(value || '').trim()) params.set(key, String(value));
  });
  const query = params.toString();
  return `/admin/applications/${app.id}${query ? `?${query}` : ''}`;
};

export const getDisplayMemberName = (app: WithId<Application & FormValues>) => {
  const firstRaw = String((app as any)?.memberFirstName || '').trim();
  const lastRaw = String((app as any)?.memberLastName || '').trim();
  const invalidToken = (value: string) => {
    const lowered = value.toLowerCase();
    return lowered === 'undefined' || lowered === 'null' || lowered === 'nan';
  };
  const first = invalidToken(firstRaw) ? '' : firstRaw;
  const last = invalidToken(lastRaw) ? '' : lastRaw;
  const full = `${first} ${last}`.trim();
  if (full) return full;

  const combined = String(
    (app as any)?.memberName ||
      (app as any)?.memberFullName ||
      (app as any)?.member_full_name ||
      (app as any)?.seniorName ||
      ''
  ).trim();
  if (combined && !invalidToken(combined)) return combined;
  return 'Member';
};

const getMemberGroupingKey = (app: WithId<Application & FormValues>) => {
  const mrn = normalizeLookup((app as any)?.memberMrn);
  if (mrn) return `mrn:${mrn}`;
  const mediCal = normalizeLookup((app as any)?.memberMediCalNum);
  if (mediCal) return `medi:${mediCal}`;
  const dob = normalizeLookup((app as any)?.memberDob);
  const first = normalizeLookup((app as any)?.memberFirstName);
  const last = normalizeLookup((app as any)?.memberLastName);
  const fullName = `${first} ${last}`.trim();
  if (fullName && dob) return `name_dob:${fullName}|${dob}`;
  if (fullName) return `name:${fullName}`;
  return `app:${String(app.id || '')}`;
};

const getIncomingDocumentSummaries = (
  app: WithId<Application & FormValues>
): IncomingDocumentSummary[] => {
  const forms = Array.isArray((app as any)?.forms) ? ((app as any).forms as any[]) : [];
  return forms
    .filter((form: any) => isPendingDocumentReview(form))
    .map((form: any) => {
      const formName = String(form?.name || '').trim();
      const fileName = String(form?.fileName || '').trim();
      const name = fileName || formName || 'Incoming document';
      return {
        name,
        flaggedCount: 1,
        totalCount: 1,
      };
    });
};

const mergeIncomingDocuments = (docs: IncomingDocumentSummary[]): IncomingDocumentSummary[] => {
  const byName = new Map<string, IncomingDocumentSummary>();
  docs.forEach((doc) => {
    const docKey = normalizeLookup(doc.name);
    const prev = byName.get(docKey);
    if (!prev) {
      byName.set(docKey, { ...doc });
      return;
    }
    byName.set(docKey, {
      name: prev.name,
      flaggedCount: prev.flaggedCount + doc.flaggedCount,
      totalCount: prev.totalCount + doc.totalCount,
    });
  });
  return Array.from(byName.values());
};

const getPlanBadgeLabel = (app: WithId<Application & FormValues>) => {
  const plan = String(app.healthPlan || '').toLowerCase();
  if (plan.includes('health net')) return 'HN';
  if (plan.includes('kaiser')) return 'K';
  return 'Other';
};

const getPlanBadgeClass = (app: WithId<Application & FormValues>) => {
  const plan = String(app.healthPlan || '').toLowerCase();
  if (plan.includes('health net')) return 'bg-green-100 text-green-800 border-green-200';
  if (plan.includes('kaiser')) return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
};

const getProcessStatusFromApp = (
  app: WithId<Application & FormValues>,
  overrides?: Record<string, string>
) => {
  const override = String(overrides?.[app.id] || '').trim();
  if (override) return override;
  const plan = String(app.healthPlan || '').toLowerCase();
  if (plan.includes('kaiser')) {
    return String((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status || '').trim();
  }
  if (plan.includes('health net')) {
    return String((app as any)?.Health_Net_Process_Status || (app as any)?.healthNetStatus || '').trim();
  }
  return '';
};
void getProcessStatusFromApp;

const getT2038FlagLabel = (app: WithId<Application & FormValues>) => {
  const kaiserStatus = String((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status || '')
    .trim()
    .toLowerCase();
  if (!kaiserStatus) return '';
  if (kaiserStatus.includes('t2038 received')) return 'T2038 Received';
  if (kaiserStatus.includes('t2038 requested')) return 'T2038 Requested';
  return '';
};

const getAdminProcessingStatus = (app: WithId<Application & FormValues>) =>
  String((app as any)?.adminProcessingStatus || '').trim();

const getAdminProcessingReason = (app: WithId<Application & FormValues>) =>
  String((app as any)?.adminProcessingReason || '').trim();

const getAdminProcessingBadgeClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'on hold') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized === 'in process') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (normalized === 'closed') return 'bg-slate-100 text-slate-800 border-slate-200';
  if (normalized.includes('pending')) return 'bg-purple-100 text-purple-800 border-purple-200';
  if (normalized.includes('ready')) return 'bg-green-100 text-green-800 border-green-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
};

const getAssignedStaffLabel = (app: WithId<Application & FormValues>) => {
  const candidates = [
    (app as any)?.assignedStaffName,
    (app as any)?.assignedStaff,
    (app as any)?.assignedToName,
    (app as any)?.assignedTo,
    (app as any)?.staffName,
  ];
  const label =
    candidates
      .map((value) => String(value ?? '').trim())
      .find((value) => value.length > 0) || '';
  return label || 'Staff unassigned';
};

const isKaiserManagerActionRequired = (
  app: WithId<Application & FormValues>,
  unacknowledgedDocsCount: number
) => {
  const isKaiserPlan = String(app.healthPlan || '').trim().toLowerCase().includes('kaiser');
  if (!isKaiserPlan) return false;
  if (unacknowledgedDocsCount <= 0) return false;
  const forms = Array.isArray((app as any)?.forms) ? ((app as any).forms as any[]) : [];
  const isRequiresRevision = String((app as any)?.status || '').trim().toLowerCase() === 'requires revision';
  const hasRevisionPhase = forms.some((form: any) => {
    const formStatus = String(form?.status || '').trim().toLowerCase();
    if (formStatus === 'requires revision') return true;
    return Boolean(String(form?.revisionRequestedAt || '').trim() || String(form?.revisionRequestedReason || '').trim());
  });
  if (isRequiresRevision || hasRevisionPhase) return false;
  const kaiserStatus = normalizeKaiserStatus((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status);
  if (kaiserStatus === 'r&b sent pending ils contract') return false;
  const referral = (app as any)?.kaiserReferralSubmission || {};
  const step5 = (app as any)?.kaiserReferralStep5 || {};
  const referralSent = Boolean(
    referral?.submitted ||
      referral?.submittedAt ||
      referral?.submittedAtIso ||
      referral?.providerMessageId ||
      step5?.acknowledged ||
      step5?.acknowledgedAt ||
      step5?.acknowledgedAtIso
  );
  if (referralSent) return false;
  const hasRevisionEmailSent = forms.some((form: any) => {
    const sentAt = String(form?.revisionEmailSentAt || '').trim();
    if (sentAt) return true;
    const history = Array.isArray(form?.revisionHistory) ? form.revisionHistory : [];
    return history.some((entry: any) => Boolean(entry?.emailed));
  });
  if (isRequiresRevision && hasRevisionEmailSent) return false;
  return true;
};

const getLatestStatusLabel = (app: WithId<Application & FormValues>) => {
  const referral = (app as any)?.kaiserReferralSubmission || {};
  const referralSent = Boolean(
    referral?.submitted ||
      referral?.submittedAt ||
      referral?.submittedAtIso ||
      referral?.providerMessageId
  );
  if (referralSent) return 'Referral form sent';

  const internalStatus = String((app as any)?.adminProcessingStatus || '').trim();
  if (internalStatus) return internalStatus;

  const kaiserStatus = String((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status || '').trim();
  if (normalizeKaiserStatus(kaiserStatus) === 'on hold') return 'On Hold';
  if (kaiserStatus) return kaiserStatus;

  return String(app.status || 'In Progress').trim() || 'In Progress';
};

const normalizeKaiserStatus = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[-_]+/g, ' ')
    .trim();

const isKaiserCompletionStatus = (value: unknown) => {
  const normalized = normalizeKaiserStatus(value);
  return normalized === 'final at rfe' || normalized === 'r&b sent pending ils contract';
};

const isKaiserOnHoldStatus = (value: unknown) => normalizeKaiserStatus(value) === 'on hold';

const QuickViewField = ({ label, value, fullWidth = false }: { label: string, value?: string | number | boolean | null, fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2' : ''}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{String(value) || <span className="font-normal text-gray-400">N/A</span>}</p>
    </div>
);

const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (typeof date === 'string') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
            try {
                const parsedDate = parse(date, 'MM/dd/yyyy', new Date());
                return format(parsedDate, 'PPP');
            } catch { return date; }
        }
        try {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate.getTime())) return format(parsedDate, 'PPP');
        } catch { /* Fallthrough */ }
    }
    if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'PPP');
    }
    return 'Invalid Date';
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
        <h3 className="text-lg font-semibold mb-2 text-primary">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {children}
        </div>
        <Separator className="my-6" />
    </div>
);

const QuickViewDialog = ({ application }: { application: WithId<Application & FormValues> }) => {
    
    const getCapacityStatus = (hasLegalRepValue: Application['hasLegalRep']) => {
        switch(hasLegalRepValue) {
            case 'unknown':
                return 'Unknown';
            case 'notApplicable':
            case 'same_as_primary':
            case 'different':
                return 'Yes, member has capacity';
            case 'no_capacity_has_rep':
            case 'no_has_rep': 
                return 'No, member lacks capacity';
            default: 
                return 'Unknown';
        }
    }

    const roomBoardAgreementLabel = (() => {
        const forms = (application as any)?.forms || [];
        const form = forms.find((f: any) => {
          const name = String(f?.name || '').trim();
          return (
            name === 'Room and Board/Tier Level Agreement' ||
            name === 'Room and Board/Tier Level Commitment' ||
            name === 'Room and Board Commitment'
          );
        });
        const ack = form?.ackRoomAndBoard ?? (application as any)?.ackRoomAndBoard;
        if (ack === true) return 'Agrees';
        if (ack === false) return 'Does not agree';
        return 'Not provided';
    })();
    
    return (
         <Dialog>
            <DialogTrigger asChild>
                <Button variant="link" className="text-sm font-medium text-primary hover:underline p-0 h-auto">
                    <FileText className="h-3 w-3 mr-1" />
                    Quick View
                </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <DialogTitle className="text-xl">CS Summary: {application.memberFirstName} {application.memberLastName}</DialogTitle>
                            <DialogDescription>
                                Complete CS Member Summary form data • {application.healthPlan} • {application.pathway}
                            </DialogDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <Link href={buildAdminApplicationHref(application)}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Full Details
                                </Link>
                            </Button>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto">
                    <div className="space-y-6 py-4 px-2">
                    <Section title="Member Information">
                        <QuickViewField label="First Name" value={application.memberFirstName} />
                        <QuickViewField label="Last Name" value={application.memberLastName} />
                        <QuickViewField label="Date of Birth" value={formatDate(application.memberDob)} />
                        <QuickViewField label="Age" value={application.memberAge} />
                        <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                        <QuickViewField label="Medical Record Number (MRN)" value={application.memberMrn} />
                        <QuickViewField label="Preferred Language" value={application.memberLanguage} />
                        <QuickViewField label="County" value={application.currentCounty} />
                    </Section>

                    <Section title="Referrer Information">
                        <QuickViewField label="Name" value={`${application.referrerFirstName} ${application.referrerLastName}`} />
                        <QuickViewField label="Email" value={application.referrerEmail} />
                        <QuickViewField label="Phone" value={application.referrerPhone} />
                        <QuickViewField label="Relationship" value={application.referrerRelationship} />
                        <QuickViewField label="Agency" value={application.agency} />
                    </Section>

                    <Section title="Primary Contact">
                        <QuickViewField label="Name" value={`${application.bestContactFirstName} ${application.bestContactLastName}`} />
                        <QuickViewField label="Relationship" value={application.bestContactRelationship} />
                        <QuickViewField label="Phone" value={application.bestContactPhone} />
                        <QuickViewField label="Email" value={application.bestContactEmail} />
                        <QuickViewField label="Language" value={application.bestContactLanguage} />
                    </Section>

                    <Section title="Legal Representative">
                        <QuickViewField label="Member Has Capacity" value={getCapacityStatus(application.hasLegalRep)} />
                        <QuickViewField label="Has Legal Representative" value={application.hasLegalRep} />
                        <QuickViewField label="Rep Name" value={`${application.repFirstName || ''} ${application.repLastName || ''}`.trim() || 'N/A'} />
                        <QuickViewField label="Rep Relationship" value={application.repRelationship} />
                        <QuickViewField label="Rep Phone" value={application.repPhone} />
                        <QuickViewField label="Rep Email" value={application.repEmail} />
                    </Section>
                    
                    <Section title="Location Information">
                        <QuickViewField label="Current Location Type" value={application.currentLocation} />
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
                            .join(', ')
                            .replace(/,\s*,/g, ', ')
                            .trim()}
                          fullWidth
                        />
                        <QuickViewField label="Customary Residence Type" value={application.customaryLocationType} />
                        <QuickViewField label="Customary Location Name" value={application.customaryLocationName} />
                        <QuickViewField
                          label="Customary Address"
                          value={[
                            String(application.customaryAddress || '').trim(),
                            String(application.customaryCity || '').trim(),
                            [String(application.customaryState || '').trim(), String(application.customaryZip || '').trim()]
                              .filter(Boolean)
                              .join(' '),
                            String(application.customaryCounty || '').trim(),
                          ]
                            .filter(Boolean)
                            .join(', ')
                            .replace(/,\s*,/g, ', ')
                            .trim()}
                          fullWidth
                        />
                    </Section>
                    
                    <Section title="Health Plan & Pathway">
                        <QuickViewField label="Health Plan" value={application.healthPlan} />
                        <QuickViewField label="Pathway" value={application.pathway} />
                        {application.pathway === 'SNF Diversion' && <QuickViewField label="Reason for Diversion" value={application.snfDiversionReason} fullWidth />}
                    </Section>

                     <Section title="ISP Information">
                        <QuickViewField label="ISP Contact Name" value={`${application.ispFirstName} ${application.ispLastName}`} />
                        <QuickViewField label="ISP Contact Phone" value={application.ispPhone} />
                        <QuickViewField
                          label="ISP Assessment Location"
                          value={[
                            String(application.ispAddress || '').trim(),
                            String(application.ispCity || '').trim(),
                            [String(application.ispState || '').trim(), String(application.ispZip || '').trim()]
                              .filter(Boolean)
                              .join(' '),
                          ]
                            .filter(Boolean)
                            .join(', ')
                            .replace(/,\s*,/g, ', ')
                            .trim()}
                          fullWidth
                        />
                    </Section>

                    <Section title="RCFE Information">
                        <QuickViewField label="On ALW Waitlist?" value={application.onALWWaitlist} />
                        <QuickViewField label="Has Preferred RCFE?" value={application.hasPrefRCFE} />
                        <QuickViewField label="RCFE Name" value={application.rcfeName} fullWidth />
                        <QuickViewField label="RCFE Address" value={application.rcfeAddress} fullWidth />
                        <QuickViewField label="Preferred RCFE Cities" value={application.rcfePreferredCities} fullWidth />
                        <QuickViewField label="RCFE Admin First Name" value={application.rcfeAdminFirstName} />
                        <QuickViewField label="RCFE Admin Last Name" value={application.rcfeAdminLastName} />
                        <QuickViewField label="RCFE Admin Phone" value={application.rcfeAdminPhone} />
                        <QuickViewField label="RCFE Admin Email" value={application.rcfeAdminEmail} />
                    </Section>

                    <Section title="Financial Information">
                        <QuickViewField label="Income Source" value={application.incomeSource} />
                        <QuickViewField label="Has Medi-Cal" value={application.hasMediCal ? 'Yes' : 'No'} />
                        <QuickViewField label="Medi-Cal Number" value={application.memberMediCalNum} />
                        <QuickViewField label="Share of Cost" value={application.shareOfCost} />
                        <QuickViewField label="Room & Board Agreement" value={roomBoardAgreementLabel} />
                    </Section>

                    <Section title="Application Status & Tracking">
                        <QuickViewField label="Submission Status" value={application.status} />
                        <QuickViewField label="Submitted Date" value={application.submissionDate ? format((application.submissionDate as Timestamp).toDate(), 'PPP p') : 'N/A'} />
                        <QuickViewField label="Last Updated" value={application.lastUpdated ? format((application.lastUpdated as Timestamp).toDate(), 'PPP p') : 'N/A'} />
                        <QuickViewField label="Submitted By" value={application.referrerName || 'N/A'} />
                        <QuickViewField label="Application ID" value={application.id} fullWidth />
                    </Section>

                    {/* Additional Notes Section */}
                    {(application.additionalNotes || application.specialInstructions) && (
                        <Section title="Additional Information">
                            {application.additionalNotes && <QuickViewField label="Additional Notes" value={application.additionalNotes} fullWidth />}
                            {application.specialInstructions && <QuickViewField label="Special Instructions" value={application.specialInstructions} fullWidth />}
                        </Section>
                    )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

const FilesQuickViewDialog = ({ application }: { application: WithId<Application & FormValues> }) => {
  const { toast } = useToast();
  const { user } = useAdmin();
  const [isDownloadingAllFiles, setIsDownloadingAllFiles] = useState(false);
  const forms = Array.isArray((application as any)?.forms) ? ((application as any).forms as any[]) : [];

  const uploadedDocuments = forms
    .filter((form) => form?.status === 'Completed' && (form?.type === 'Upload' || form?.fileName || form?.downloadURL))
    .map((form) => ({
      category: 'Application files',
      formName: String(form?.name || 'Uploaded Document'),
      fileName: String(form?.fileName || 'File uploaded'),
      downloadURL: String(form?.downloadURL || '').trim(),
      filePath: String(form?.filePath || '').trim(),
      dateCompleted: form?.dateCompleted || null,
    }));

  const completedForms = forms
    .filter((form) => form?.status === 'Completed' && form?.type !== 'Upload')
    .map((form) => ({
      formName: String(form?.name || 'Form'),
      dateCompleted: form?.dateCompleted || null,
      type: String(form?.type || 'online-form'),
    }));
  const printableCsSummaryHref = (() => {
    const appId = String((application as any)?.id || '').trim();
    const params = new URLSearchParams({ applicationId: appId });
    const userId = String((application as any)?.userId || '').trim();
    if (appId && !appId.startsWith('admin_app_') && userId) {
      params.set('userId', userId);
    }
    return `/admin/forms/cs-summary-printable?${params.toString()}`;
  })();

  const sanitizeZipToken = (value: unknown, fallback: string) => {
    const cleaned = String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ');
    return cleaned || fallback;
  };

  const buildZipFileName = () => {
    const lastName = sanitizeZipToken((application as any)?.memberLastName, 'UnknownLast');
    const firstName = sanitizeZipToken((application as any)?.memberFirstName, 'UnknownFirst');
    const mrn = sanitizeZipToken((application as any)?.memberMrn, 'UnknownMRN');
    return `${lastName}, ${firstName} Member ${mrn}.zip`;
  };

  const handleDownloadAllFiles = async () => {
    if (!uploadedDocuments.length) {
      toast({
        variant: 'destructive',
        title: 'No files to download',
        description: 'This application does not have uploaded files yet.',
      });
      return;
    }

    try {
      setIsDownloadingAllFiles(true);
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        throw new Error('Unable to verify admin session. Please refresh and try again.');
      }

      const entries = uploadedDocuments.map((doc) => ({
        category: doc.category,
        documentName: doc.formName,
        fileName: doc.fileName,
        downloadURL: doc.downloadURL,
        filePath: doc.filePath,
      }));

      const response = await fetch('/api/admin/member-files-zip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          zipFileName: buildZipFileName(),
          entries,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `ZIP request failed (${response.status})`);
      }

      const zipBlob = await response.blob();
      const objectUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = buildZipFileName();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      const downloadedCount = Number(response.headers.get('x-downloaded-count') || entries.length);
      const skippedCount = Number(response.headers.get('x-skipped-count') || 0);
      const failedCount = Number(response.headers.get('x-failed-count') || 0);
      toast({
        title: 'Download complete',
        description: `${downloadedCount} downloaded${skippedCount ? ` • ${skippedCount} skipped` : ''}${failedCount ? ` • ${failedCount} failed` : ''}`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description: String(error?.message || 'Could not create ZIP download.'),
      });
    } finally {
      setIsDownloadingAllFiles(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-sm font-medium text-primary hover:underline p-0 h-auto">
          <FileText className="h-3 w-3 mr-1" />
          View Files
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Documents & Completed Forms: {application.memberFirstName} {application.memberLastName}
          </DialogTitle>
          <DialogDescription>
            Quick view of uploaded files and completed forms for this member.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end">
          <Button onClick={handleDownloadAllFiles} disabled={isDownloadingAllFiles || uploadedDocuments.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            {isDownloadingAllFiles ? 'Preparing ZIP...' : 'Download Entire File Set'}
          </Button>
        </div>

        <div className="space-y-6 py-2">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary">Printable Forms</h3>
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">CS Member Summary (Filled Printable)</p>
                  <p className="text-xs text-muted-foreground">
                    Opens the current printable CS Summary form for this application.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={printableCsSummaryHref}>
                    Open Printable
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary">Uploaded Documents</h3>
            {uploadedDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No uploaded documents found.</p>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                {uploadedDocuments.map((doc, idx) => (
                  <div key={`${doc.formName}-${idx}`} className="flex flex-col gap-1 border-b last:border-b-0 pb-2 last:pb-0">
                    <p className="text-sm font-semibold">{doc.formName}</p>
                    <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      Completed: {doc.dateCompleted ? formatDate(doc.dateCompleted) : 'N/A'}
                    </p>
                    {doc.downloadURL ? (
                      <a
                        href={doc.downloadURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open file
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">No direct file link available.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2 text-primary">Completed Forms</h3>
            {completedForms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed forms found.</p>
            ) : (
              <div className="space-y-2 rounded-md border p-3">
                {completedForms.map((form, idx) => (
                  <div key={`${form.formName}-${idx}`} className="flex items-start justify-between gap-3 border-b last:border-b-0 pb-2 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold">{form.formName}</p>
                      <p className="text-xs text-muted-foreground">Type: {form.type}</p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {form.dateCompleted ? formatDate(form.dateCompleted) : 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const AdminApplicationsTable = ({
  applications,
  isLoading,
  onSelectionChange,
  selected,
  showInlineTracker = false,
  onRefreshRequested: _onRefreshRequested,
}: {
  applications: WithId<Application & FormValues>[];
  isLoading: boolean;
  onSelectionChange?: (id: string, checked: boolean) => void;
  selected?: string[];
  showInlineTracker?: boolean;
  onRefreshRequested?: () => Promise<void> | void;
}) => {
  const { toast } = useToast();
  const { user } = useAdmin();
  const [confirmingApps, setConfirmingApps] = useState<Set<string>>(new Set());
  const [sendingReminders, setSendingReminders] = useState<Set<string>>(new Set());

  const handleConfirmCsSummary = async (app: WithId<Application & FormValues>) => {
    if (confirmingApps.has(app.id)) return;

    setConfirmingApps(prev => new Set(prev).add(app.id));
    
    try {
      const response = await fetch('/api/admin/confirm-cs-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: app.id,
          userId: app.userId,
          confirmedBy: user?.displayName || user?.email || 'Admin'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: 'CS Summary Confirmed',
          description: result.note ? 
            `CS Summary confirmation simulated for ${app.memberFirstName} ${app.memberLastName} (Firebase Admin not configured)` :
            `Successfully confirmed CS Summary for ${app.memberFirstName} ${app.memberLastName}`,
        });
        
        // Only refresh if not simulated
        if (!result.note) {
          window.location.reload();
        }
      } else {
        throw new Error(result.error || 'Failed to confirm CS Summary');
      }
    } catch (error: any) {
      console.error('Error confirming CS Summary:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm CS Summary',
        variant: 'destructive',
      });
    } finally {
      setConfirmingApps(prev => {
        const newSet = new Set(prev);
        newSet.delete(app.id);
        return newSet;
      });
    }
  };

  const handleSendReminder = async (app: WithId<Application & FormValues>) => {
    if (sendingReminders.has(app.id)) return;

    setSendingReminders(prev => new Set(prev).add(app.id));
    
    try {
      const response = await fetch('/api/admin/send-cs-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: app.id,
          userId: app.userId,
          reminderType: 'email'
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: 'Reminder Sent',
          description: result.note ? 
            `CS Summary reminder simulated for ${app.memberFirstName} ${app.memberLastName} (Firebase Admin not configured)` :
            `CS Summary reminder sent to ${result.userEmail || 'user'} for ${app.memberFirstName} ${app.memberLastName}`,
        });
      } else {
        throw new Error(result.error || 'Failed to send reminder');
      }
    } catch (error: any) {
      console.error('Error sending reminder:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reminder',
        variant: 'destructive',
      });
    } finally {
      setSendingReminders(prev => {
        const newSet = new Set(prev);
        newSet.delete(app.id);
        return newSet;
      });
    }
  };
  void handleConfirmCsSummary;
  void handleSendReminder;
    
    const sortedApplications = useMemo(() => {
        if (!applications) return [];
        return [...applications].sort((a, b) => {
            const toMillis = (value: any): number => {
              if (!value) return 0;
              if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
              if (typeof value?.toDate === 'function') return value.toDate().getTime();
              const parsed = new Date(String(value)).getTime();
              return Number.isFinite(parsed) ? parsed : 0;
            };
            const createdA = toMillis((a as any).submissionDate || (a as any).createdAt);
            const createdB = toMillis((b as any).submissionDate || (b as any).createdAt);
            if (createdA !== createdB) return createdB - createdA;
            const updatedA = toMillis((a as any).lastUpdated);
            const updatedB = toMillis((b as any).lastUpdated);
            return updatedB - updatedA;
        });
    }, [applications]);

    const groupedApplications = useMemo(() => {
      const grouped = new Map<string, GroupedApplicationRow>();

      sortedApplications.forEach((app) => {
        const key = getMemberGroupingKey(app);
        const existing = grouped.get(key);
        const incomingDocs = getIncomingDocumentSummaries(app);

        if (!existing) {
          grouped.set(key, {
            key,
            primaryApp: app,
            appIds: [app.id],
            incomingDocuments: mergeIncomingDocuments(incomingDocs),
          });
          return;
        }

        existing.appIds.push(app.id);
        existing.incomingDocuments = mergeIncomingDocuments([
          ...existing.incomingDocuments,
          ...incomingDocs,
        ]);
      });

      return Array.from(grouped.values());
    }, [sortedApplications]);

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block w-full overflow-x-auto">
        <Table>
        <TableHeader>
          <TableRow>
            {onSelectionChange && selected && (
              <TableHead className="w-[50px]">
                  <Checkbox
                      checked={selected.length === sortedApplications.length && sortedApplications.length > 0}
                      onCheckedChange={(checked) => {
                          sortedApplications.forEach(app => onSelectionChange(app.id, !!checked))
                      }}
                      aria-label="Select all"
                  />
              </TableHead>
            )}
            <TableHead>Member</TableHead>
            <TableHead className="w-[190px] min-w-[190px]">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Plan & Pathway</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={onSelectionChange ? 5 : 4} className="h-24 text-center">
                Loading applications...
              </TableCell>
            </TableRow>
          ) : groupedApplications.length > 0 ? (
            groupedApplications.map(group => {
              const app = group.primaryApp;
              const referrerName = app.referrerName || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim() || 'N/A';
              const submissionDate = app.submissionDate ? (app.submissionDate as Timestamp).toDate() : null;
              const lastUpdatedDate = app.lastUpdated ? (app.lastUpdated as Timestamp).toDate() : null;
              const servicesDeclined = app.forms?.find(f => f.name === 'Waivers & Authorizations')?.choice === 'decline';
              const isNew = submissionDate && differenceInHours(new Date(), submissionDate) < 24;
              const isRecentlyUpdated = lastUpdatedDate && submissionDate && 
                differenceInHours(new Date(), lastUpdatedDate) < 24 && 
                differenceInHours(lastUpdatedDate, submissionDate) > 1;
              const csSummaryNeedsReview = getCsSummaryNeedsReview(app);
              const unacknowledgedDocsCount = getUnacknowledgedDocsCount(app);
              const planLabel = getPlanBadgeLabel(app);
              const planBadgeClass = getPlanBadgeClass(app);
              const csSummaryIsNew = isNewCsSummary(app);
              const adminProcessingStatus = getAdminProcessingStatus(app);
              const adminProcessingReason = getAdminProcessingReason(app);
              void adminProcessingReason;
              const isKaiserCompleted = isKaiserCompletionStatus(
                (app as any)?.kaiserStatus || (app as any)?.Kaiser_Status
              );
              const isKaiserOnHold = isKaiserOnHoldStatus(
                (app as any)?.kaiserStatus || (app as any)?.Kaiser_Status
              );
              const latestStatusLabel = getLatestStatusLabel(app);
              const staffLabel = getAssignedStaffLabel(app);
              const kaiserManagerActionRequired = isKaiserManagerActionRequired(app, unacknowledgedDocsCount);
              const isAuthReceivedIntake = Boolean(
                (app as any)?.kaiserAuthReceivedViaIls ||
                String((app as any)?.intakeType || '').trim() === 'kaiser_auth_received_via_ils' ||
                String((app as any)?.status || '').trim() === 'Authorization Received (Doc Collection)'
              );
              const isSkeletonApplication = Boolean(
                (app as any)?.createdByAdmin ||
                Boolean((app as any)?.allowDraftCaspioPush) ||
                String((app as any)?.status || '').trim().toLowerCase() === 'draft'
              );
              const t2038FlagLabel = getT2038FlagLabel(app);
              const isGroupSelected = Boolean(
                selected && group.appIds.length > 0 && group.appIds.every((id) => selected.includes(id))
              );

              return (
              <TableRow key={group.key} className={cn(
                isNew && "bg-blue-50 border-l-4 border-l-blue-400",
                isRecentlyUpdated && "bg-amber-50 border-l-4 border-l-amber-400"
              )}>
                {onSelectionChange && selected && (
                  <TableCell>
                      <Checkbox
                          checked={isGroupSelected}
                          onCheckedChange={(checked) => {
                            group.appIds.forEach((id) => onSelectionChange(id, !!checked));
                          }}
                          aria-label={`Select application for ${app.memberFirstName}`}
                      />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div>
                    <div className="flex items-center gap-2">
                      {getDisplayMemberName(app)}
                      {isNew && <Badge className="bg-blue-100 text-blue-800 border-blue-200"><Sparkles className="h-3 w-3 mr-1" /> New</Badge>}
                      {isRecentlyUpdated && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Updated</Badge>}
                      {csSummaryIsNew && (
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                          New CS
                        </Badge>
                      )}
                      {csSummaryNeedsReview && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0.5 ${planBadgeClass}`}
                              >
                                {planLabel}(CS)
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>CS Summary needs review</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {unacknowledgedDocsCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0.5 ${planBadgeClass}`}
                              >
                                {planLabel}(D){unacknowledgedDocsCount > 1 ? ` ${unacknowledgedDocsCount}` : ''}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{unacknowledgedDocsCount} document{unacknowledgedDocsCount === 1 ? '' : 's'} need acknowledgement</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {isAuthReceivedIntake && (
                        <Badge variant="outline" className="bg-cyan-100 text-cyan-800 border-cyan-200">
                          Auth Received
                        </Badge>
                      )}
                      {t2038FlagLabel && (
                        <Badge
                          variant="outline"
                          className={
                            t2038FlagLabel === 'T2038 Received'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }
                        >
                          {t2038FlagLabel}
                        </Badge>
                      )}
                      {isSkeletonApplication && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">
                          Skeleton - required fields pending
                        </Badge>
                      )}
                      {kaiserManagerActionRequired ? (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />
                          Kaiser manager action required
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 break-words">
                      {submissionDate ? `Created: ${format(submissionDate, 'MM/dd/yyyy h:mm a')}` : 'Created: N/A'}
                      {lastUpdatedDate && ` • Updated: ${format(lastUpdatedDate, 'MM/dd/yyyy h:mm a')}`}
                      • By: {referrerName || (sanitizeUserId(app.userId) ? `user-ID: ...${sanitizeUserId(app.userId).substring(sanitizeUserId(app.userId).length - 4)}` : 'Unknown')}
                      {` • Staff: ${staffLabel}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Latest Status: <span className="font-medium text-foreground">{latestStatusLabel}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {group.incomingDocuments.length > 0 ? (
                        group.incomingDocuments.map((doc) => (
                          <div key={`${group.key}-${normalizeLookup(doc.name)}`} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Incoming:</span>
                            <span>{doc.name}</span>
                            <Badge variant="secondary">Flagged</Badge>
                            {doc.totalCount > 1 ? (
                              <span className="text-muted-foreground">x{doc.totalCount}</span>
                            ) : null}
                          </div>
                        ))
                      ) : null}
                    </div>
                    {showInlineTracker && (
                      <div className="mt-2">
                        <ApplicationTrackerInline application={app} />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="w-[190px] min-w-[190px] align-top">
                  <div className="space-y-1 min-w-[170px]">
                    <Badge variant="outline" className={cn('whitespace-nowrap', getBadgeVariant(app.status))}>
                      {app.status}
                    </Badge>
                    {isKaiserCompleted ? (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                        Complete (Kaiser)
                      </Badge>
                    ) : null}
                    {isKaiserOnHold ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 whitespace-nowrap">
                        On Hold
                      </Badge>
                    ) : null}
                    {adminProcessingStatus ? (
                      <div className="space-y-1">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0.5', getAdminProcessingBadgeClass(adminProcessingStatus))}
                        >
                          Internal: {adminProcessingStatus}
                        </Badge>
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                 <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <span>{app.healthPlan}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{app.pathway}</div>
                    {String(app.healthPlan || '').toLowerCase().includes('kaiser') ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        Kaiser Status:{' '}
                        <span className="font-medium text-foreground">
                          {String((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status || 'N/A').trim() || 'N/A'}
                        </span>
                      </div>
                    ) : null}
                </TableCell>
                <TableCell className="text-right">
                   <div className="inline-flex items-center gap-2">
                    {/* Notification Status Icons */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center" aria-label="Status reminders indicator">
                            <Bell
                              className={`h-4 w-4 ${
                                (app as any)?.statusRemindersEnabled === true
                                  ? 'text-green-600'
                                  : 'text-gray-400'
                              }`}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {(app as any)?.statusRemindersEnabled === true
                              ? 'Status reminders enabled'
                              : 'Status reminders disabled'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center" aria-label="Email reminders indicator">
                            <Mail
                              className={`h-4 w-4 ${
                                (app as any)?.emailRemindersEnabled === true
                                  ? 'text-green-600'
                                  : 'text-gray-400'
                              }`}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {(app as any)?.emailRemindersEnabled === true
                              ? 'Email reminders enabled'
                              : 'Email reminders disabled'}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    {servicesDeclined && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <AlertTriangle className="h-4 w-4 text-destructive" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Services were declined by member.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {(app as any)?.caspioSent && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>CS Summary sent to Caspio</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    <QuickViewDialog application={app} />
                    <FilesQuickViewDialog application={app} />
                    <Button asChild variant="link" className="text-sm font-medium text-primary hover:underline p-0 h-auto">
                        <Link href={buildAdminApplicationHref(app)}>View Details</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )})
          ) : (
            <TableRow>
              <TableCell colSpan={onSelectionChange ? 5 : 4} className="h-24 text-center">
                <EmptyState
                  icon={FileText}
                  title="No Applications Found"
                  description="Applications will appear here once they're submitted by users."
                  className="py-8"
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>

      {/* Mobile Single-Line View */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="text-center py-8">Loading applications...</div>
        ) : groupedApplications.length > 0 ? (
          groupedApplications.map(group => {
            const app = group.primaryApp;
            const referrerName = app.referrerName || `${app.referrerFirstName || ''} ${app.referrerLastName || ''}`.trim();
            const submissionDate = app.submissionDate ? (app.submissionDate as Timestamp).toDate() : null;
            const lastUpdatedDate = app.lastUpdated ? (app.lastUpdated as Timestamp).toDate() : null;
            const isNew = submissionDate && differenceInHours(new Date(), submissionDate) < 24;
            const isRecentlyUpdated = lastUpdatedDate && submissionDate && 
              differenceInHours(new Date(), lastUpdatedDate) < 24 && 
              differenceInHours(lastUpdatedDate, submissionDate) > 1;
            const csSummaryNeedsReview = getCsSummaryNeedsReview(app);
            const unacknowledgedDocsCount = getUnacknowledgedDocsCount(app);
            const planLabel = getPlanBadgeLabel(app);
            const planBadgeClass = getPlanBadgeClass(app);
            const csSummaryIsNew = isNewCsSummary(app);
            const adminProcessingStatus = getAdminProcessingStatus(app);
            const isKaiserCompleted = isKaiserCompletionStatus(
              (app as any)?.kaiserStatus || (app as any)?.Kaiser_Status
            );
            const isKaiserOnHold = isKaiserOnHoldStatus(
              (app as any)?.kaiserStatus || (app as any)?.Kaiser_Status
            );
            const latestStatusLabel = getLatestStatusLabel(app);
            const staffLabel = getAssignedStaffLabel(app);
            const kaiserManagerActionRequired = isKaiserManagerActionRequired(app, unacknowledgedDocsCount);
            const isAuthReceivedIntake = Boolean(
              (app as any)?.kaiserAuthReceivedViaIls ||
              String((app as any)?.intakeType || '').trim() === 'kaiser_auth_received_via_ils' ||
              String((app as any)?.status || '').trim() === 'Authorization Received (Doc Collection)'
            );
            const isSkeletonApplication = Boolean(
              (app as any)?.createdByAdmin ||
              Boolean((app as any)?.allowDraftCaspioPush) ||
              String((app as any)?.status || '').trim().toLowerCase() === 'draft'
            );
            const t2038FlagLabel = getT2038FlagLabel(app);
            const isGroupSelected = Boolean(
              selected && group.appIds.length > 0 && group.appIds.every((id) => selected.includes(id))
            );

            return (
              <div key={group.key} className={cn(
                "bg-white border rounded-lg p-3 shadow-sm",
                isNew && "border-l-4 border-l-blue-400 bg-blue-50",
                isRecentlyUpdated && "border-l-4 border-l-amber-400 bg-amber-50"
              )}>
                <div className="flex flex-col gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {onSelectionChange && selected && (
                        <Checkbox
                          checked={isGroupSelected}
                          onCheckedChange={(checked) => {
                            group.appIds.forEach((id) => onSelectionChange(id, !!checked));
                          }}
                          aria-label={`Select application for ${app.memberFirstName} ${app.memberLastName}`}
                        />
                      )}
                      <h3 className="font-medium truncate">
                        {getDisplayMemberName(app)}
                      </h3>
                      {isNew && <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs"><Sparkles className="h-3 w-3 mr-1" /> New</Badge>}
                      {isRecentlyUpdated && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Updated</Badge>}
                      {(app as any)?.caspioSent && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      {csSummaryIsNew && (
                        <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                          New CS
                        </Badge>
                      )}
                      {csSummaryNeedsReview && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${planBadgeClass}`}
                        >
                          {planLabel}(CS)
                        </Badge>
                      )}
                      {unacknowledgedDocsCount > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0.5 ${planBadgeClass}`}
                        >
                          {planLabel}(D){unacknowledgedDocsCount > 1 ? ` ${unacknowledgedDocsCount}` : ''}
                        </Badge>
                      )}
                      {isAuthReceivedIntake && (
                        <Badge variant="outline" className="bg-cyan-100 text-cyan-800 border-cyan-200 text-xs">
                          Auth Received
                        </Badge>
                      )}
                      {t2038FlagLabel && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            t2038FlagLabel === 'T2038 Received'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          )}
                        >
                          {t2038FlagLabel}
                        </Badge>
                      )}
                      {isSkeletonApplication && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-xs">
                          Skeleton - required fields pending
                        </Badge>
                      )}
                      {kaiserManagerActionRequired ? (
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />
                          Action required
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground break-words">
                      {submissionDate ? `Created: ${format(submissionDate, 'MM/dd/yyyy h:mm a')}` : 'Created: N/A'}
                      {lastUpdatedDate && ` • Updated: ${format(lastUpdatedDate, 'MM/dd/yyyy h:mm a')}`}
                      • By: {referrerName || (sanitizeUserId(app.userId) ? `user-ID: ...${sanitizeUserId(app.userId).substring(sanitizeUserId(app.userId).length - 4)}` : 'Unknown')}
                      {` • Staff: ${staffLabel}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Latest Status: <span className="font-medium text-foreground">{latestStatusLabel}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{app.healthPlan}</span>
                    </div>
                    {String(app.healthPlan || '').toLowerCase().includes('kaiser') ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        Kaiser Status:{' '}
                        <span className="font-medium text-foreground">
                          {String((app as any)?.kaiserStatus || (app as any)?.Kaiser_Status || 'N/A').trim() || 'N/A'}
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-2 space-y-1">
                      {group.incomingDocuments.length > 0 ? (
                        group.incomingDocuments.map((doc) => (
                          <div key={`${group.key}-mobile-${normalizeLookup(doc.name)}`} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Incoming:</span>
                            <span>{doc.name}</span>
                            <Badge variant="secondary">Flagged</Badge>
                            {doc.totalCount > 1 ? (
                              <span className="text-muted-foreground">x{doc.totalCount}</span>
                            ) : null}
                          </div>
                        ))
                      ) : null}
                    </div>
                    {showInlineTracker && (
                      <div className="mt-2">
                        <ApplicationTrackerInline application={app} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className={getBadgeVariant(app.status)}>
                      {app.status}
                    </Badge>
                    {isKaiserCompleted ? (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">
                        Complete (Kaiser)
                      </Badge>
                    ) : null}
                    {isKaiserOnHold ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-xs">
                        On Hold
                      </Badge>
                    ) : null}
                    {adminProcessingStatus ? (
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0.5', getAdminProcessingBadgeClass(adminProcessingStatus))}
                        title={adminProcessingStatus}
                      >
                        Internal: {adminProcessingStatus}
                      </Badge>
                    ) : null}
                    <QuickViewDialog application={app} />
                    <FilesQuickViewDialog application={app} />
                    <Button asChild size="sm" variant="outline">
                      <Link href={buildAdminApplicationHref(app)}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={FileText}
            title="No Applications Found"
            description="Applications will appear here once they're submitted by users."
          />
        )}
      </div>
    </>
  );
};
