'use client';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Info,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  MessageSquareHeart,
  Package,
  UploadCloud,
} from 'lucide-react';
import {
  PROCESS_TRACKER_REVIEW_TARGETS,
  ALLOW_COMPLETE_WITHOUT_UPLOAD,
  type PathwayRequirement,
} from './application-status-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  SNF_RESIDENCY_REQUIRED_DAYS,
  SNF_RESIDENCY_NOTE,
  parseSnfResidencyDays,
  buildSnfResidencyFormFields,
} from '@/lib/snf-residency';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from './StaffApplicationTracker';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { MultiUploadCard } from '@/components/MultiUploadCard';
import { type Application, type FormStatus } from '@/lib/definitions';
import { type Dispatch, type SetStateAction, type JSX, type ChangeEvent } from 'react';
import type { useToast } from '@/hooks/use-toast';
import { type FormStatusUpdate } from './application-detail-types';

export interface PathwayRequirementsGridProps {
  application: Application;
  showSnfFacesheet: boolean;
  displayedPathwayRequirements: PathwayRequirement[];
  formStatusMap: Map<string, FormStatus>;
  getComponentStatus: (componentKey: string) => "Completed" | "Pending" | "Not Applicable";
  focusRequirementTarget: string;
  isNewCsSummary: boolean;
  handleCsSummaryMarkReviewed: () => Promise<void>;
  handleApplicationReviewed: (checked: boolean) => Promise<void>;
  handleFormReviewed: (formName: string, checked: boolean) => Promise<void>;
  getReviewerMeta: (reqTitle: string, formInfo?: any) => { name: string; dateLabel: string; };
  snfResidencyDaysInput: string;
  setSnfResidencyDaysInput: Dispatch<SetStateAction<string>>;
  isSavingSnfResidency: boolean;
  toast: ReturnType<typeof useToast>['toast'];
  setIsSavingSnfResidency: Dispatch<SetStateAction<boolean>>;
  handleFormStatusUpdate: (updates: FormStatusUpdate[]) => Promise<void>;
  getFormAction: (req: PathwayRequirement) => JSX.Element | null;
  rejectScopeByForm: Record<string, "form" | "info">;
  openRevisionRequestDialog: (formName: string, scope?: "form" | "info") => void;
  setRejectScopeByForm: Dispatch<SetStateAction<Record<string, "form" | "info">>>;
  rejectDialogForm: string | null;
  setRejectDialogForm: Dispatch<SetStateAction<string | null>>;
  rejectEmailRecipientByForm: Record<string, "primary" | "creator">;
  rejectEmailBodyByForm: Record<string, string>;
  rejectUseSameLinkByForm: Record<string, boolean>;
  setRejectEmailRecipientByForm: Dispatch<SetStateAction<Record<string, "primary" | "creator">>>;
  setRejectEmailBodyByForm: Dispatch<SetStateAction<Record<string, string>>>;
  setRejectUseSameLinkByForm: Dispatch<SetStateAction<Record<string, boolean>>>;
  rejectingByForm: Record<string, boolean>;
  handleRejectFormRedo: (formName: string, sendEmail: boolean, options?: { scope?: "form" | "info" | "file" | undefined; targetFileKey?: string | undefined; resetCard?: boolean | undefined; useSameLink?: boolean | undefined; emailRecipient?: "primary" | "creator" | undefined; } | undefined) => Promise<void>;
  formatDateTimeValue: (value: any) => string;
  markFormAsComplete: (formName: string) => Promise<void>;
  showCustomerFeedbackCard: boolean;
  customerFeedbackRating: number;
  customerFeedbackSubmittedAtLabel: string;
  customerFeedbackComments: string;
  consolidatedMedicalDocuments: { id: string; name: string; }[];
  isConsolidatedUploadReviewed: boolean;
  canReviewConsolidatedUpload: boolean;
  isConsolidatedUploading: boolean;
  consolidatedProgress: number;
  consolidatedUploadChecks: Record<string, boolean>;
  setConsolidatedUploadChecks: Dispatch<SetStateAction<Record<string, boolean>>>;
  isAnyConsolidatedChecked: boolean;
  handleConsolidatedUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  showAdminPlaceholderCard: boolean;
  pathwayRequirements: PathwayRequirement[];
}

export function PathwayRequirementsGrid({
  application,
  showSnfFacesheet,
  displayedPathwayRequirements,
  formStatusMap,
  getComponentStatus,
  focusRequirementTarget,
  isNewCsSummary,
  handleCsSummaryMarkReviewed,
  handleApplicationReviewed,
  handleFormReviewed,
  getReviewerMeta,
  snfResidencyDaysInput,
  setSnfResidencyDaysInput,
  isSavingSnfResidency,
  toast,
  setIsSavingSnfResidency,
  handleFormStatusUpdate,
  getFormAction,
  rejectScopeByForm,
  openRevisionRequestDialog,
  setRejectScopeByForm,
  rejectDialogForm,
  setRejectDialogForm,
  rejectEmailRecipientByForm,
  rejectEmailBodyByForm,
  rejectUseSameLinkByForm,
  setRejectEmailRecipientByForm,
  setRejectEmailBodyByForm,
  setRejectUseSameLinkByForm,
  rejectingByForm,
  handleRejectFormRedo,
  formatDateTimeValue,
  markFormAsComplete,
  showCustomerFeedbackCard,
  customerFeedbackRating,
  customerFeedbackSubmittedAtLabel,
  customerFeedbackComments,
  consolidatedMedicalDocuments,
  isConsolidatedUploadReviewed,
  canReviewConsolidatedUpload,
  isConsolidatedUploading,
  consolidatedProgress,
  consolidatedUploadChecks,
  setConsolidatedUploadChecks,
  isAnyConsolidatedChecked,
  handleConsolidatedUpload,
  showAdminPlaceholderCard,
  pathwayRequirements,
}: PathwayRequirementsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {application?.pathway === 'SNF Diversion' && !showSnfFacesheet ? (
          <Alert className="md:col-span-2 border-blue-200 bg-blue-50 text-blue-900">
            <Info className="h-4 w-4" />
            <AlertTitle>SNF Facesheet note</AlertTitle>
            <AlertDescription>
              SNF Facesheet is only required for SNF Transition. It is not required for this application.
            </AlertDescription>
          </Alert>
        ) : null}
        {displayedPathwayRequirements.map((req) => {
            const formInfo = formStatusMap.get(req.title);
            const status = getComponentStatus(req.title);
            const isSummary = req.title === 'CS Member Summary' || req.title === 'CS Summary';
            const isWaiversCard = req.title === 'Waivers & Authorizations';
            const isProcessTrackerReviewTarget = PROCESS_TRACKER_REVIEW_TARGETS.has(req.title);
            const isReviewed = isSummary
              ? Boolean((application as any)?.applicationChecked)
              : Boolean(formInfo?.acknowledged);
            const cardHasUploadedFiles =
              req.type === 'Upload' &&
              (Boolean(String((formInfo as any)?.filePath || '').trim()) ||
                Boolean(String((formInfo as any)?.downloadURL || '').trim()) ||
                (Array.isArray((formInfo as any)?.uploadedFiles) &&
                  (formInfo as any).uploadedFiles.length > 0));
            const canReviewCard = status === 'Completed' || cardHasUploadedFiles;
            const needsReview = canReviewCard && !isReviewed;
            const roomBoardAck =
              req.title === 'Room and Board/Tier Level Agreement'
                ? (formInfo as any)?.ackRoomAndBoard ?? (application as any)?.ackRoomAndBoard
                : null;
            const revisionRequestedReason = String((formInfo as any)?.revisionRequestedReason || '').trim();
            const revisionRequestedAt = String((formInfo as any)?.revisionRequestedAt || '').trim();
            const hasRevisionRequested = Boolean(revisionRequestedAt || revisionRequestedReason);
            
            return (
                <Card
                  id={`requirement-card-${String(req.id || '').trim().toLowerCase()}`}
                  key={req.id}
                  className={cn(
                    'flex flex-col shadow-sm hover:shadow-md transition-shadow',
                    hasRevisionRequested && 'border-amber-300',
                    focusRequirementTarget === String(req.id || '').trim().toLowerCase() &&
                      'ring-2 ring-blue-300 ring-offset-2'
                  )}
                >
                    <CardHeader className="pb-4">
                        <div className="flex flex-col gap-3 min-w-0">
                            <CardTitle className="text-lg break-words">{req.title}</CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                              {hasRevisionRequested ? (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                  Revision requested
                                </Badge>
                              ) : null}
                              {isSummary && isNewCsSummary && (
                                <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                                  New
                                </Badge>
                              )}
                              {req.title === 'Room and Board/Tier Level Agreement' && status === 'Completed' && roomBoardAck === false ? (
                                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                  Does not agree
                                </Badge>
                              ) : null}
                            </div>
                            {(canReviewCard || isWaiversCard || isSummary) && (
                              <div className="flex flex-col items-start gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isReviewed ? (
                                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                                      Reviewed
                                    </Badge>
                                  ) : needsReview || isSummary ? (
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                      {hasRevisionRequested && cardHasUploadedFiles
                                        ? 'Needs review (revision open)'
                                        : canReviewCard
                                          ? 'Needs review'
                                          : 'Ready to mark reviewed'}
                                    </Badge>
                                  ) : null}
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`reviewed-${req.id}`}
                                      checked={isReviewed}
                                      onCheckedChange={(checked) => {
                                        if (isSummary) {
                                          if (checked) {
                                            void handleCsSummaryMarkReviewed();
                                          } else {
                                            void handleApplicationReviewed(false);
                                          }
                                        } else {
                                          handleFormReviewed(req.title, Boolean(checked));
                                        }
                                      }}
                                    />
                                    <Label
                                      htmlFor={`reviewed-${req.id}`}
                                      className="text-xs text-muted-foreground cursor-pointer select-none"
                                    >
                                      {isReviewed ? 'Reviewed' : 'Mark reviewed'}
                                    </Label>
                                  </div>
                                </div>
                                {isReviewed && (() => {
                                  const meta = getReviewerMeta(req.title, formInfo);
                                  if (!meta.name && !meta.dateLabel) return null;
                                  const parts = [meta.dateLabel, meta.name].filter(Boolean);
                                  return (
                                    <div className="text-[11px] text-muted-foreground leading-tight whitespace-normal break-words">
                                      {parts.join(' · ')}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                        </div>
                        <CardDescription>{req.description}</CardDescription>
                        {req.id === 'snf-facesheet' && showSnfFacesheet ? (
                          <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                            {(formInfo as any)?.snfResidencyNeedsStaffReview ||
                            ((formInfo as any)?.snfResidencyDaysTotal != null &&
                              Number((formInfo as any).snfResidencyDaysTotal) < SNF_RESIDENCY_REQUIRED_DAYS) ? (
                              <Alert variant="warning">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Staff flag: under 60-day SNF residency</AlertTitle>
                                <AlertDescription className="text-sm">
                                  Submitter reported{' '}
                                  <strong>
                                    {String((formInfo as any)?.snfResidencyDaysTotal ?? (snfResidencyDaysInput || '?'))} days
                                  </strong>{' '}
                                  at SNF (below the {SNF_RESIDENCY_REQUIRED_DAYS}-day requirement). Hospital–SNF Medicare and
                                  Medi-Cal days may be combined — verify before proceeding.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Alert className="border-blue-200 bg-blue-50 text-blue-950">
                                <Info className="h-4 w-4" />
                                <AlertTitle>60-day SNF residency</AlertTitle>
                                <AlertDescription className="text-sm">{SNF_RESIDENCY_NOTE}</AlertDescription>
                              </Alert>
                            )}
                            <div className="space-y-1.5">
                              <Label htmlFor={`snf-residency-days-admin-${req.id}`} className="text-sm font-medium">
                                Number of combined continuous Medicare and Medi-Cal days
                              </Label>
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  id={`snf-residency-days-admin-${req.id}`}
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  placeholder="e.g. 75"
                                  className="max-w-[140px] bg-white"
                                  value={snfResidencyDaysInput}
                                  onChange={(e) => setSnfResidencyDaysInput(e.target.value)}
                                />
                                <span className="text-sm text-muted-foreground">days</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isSavingSnfResidency}
                                  onClick={() => {
                                    const days = parseSnfResidencyDays(snfResidencyDaysInput);
                                    if (days == null) {
                                      toast({
                                        variant: 'destructive',
                                        title: 'Enter days at SNF',
                                        description: 'Enter a whole number of days.',
                                      });
                                      return;
                                    }
                                    setIsSavingSnfResidency(true);
                                    const fields = buildSnfResidencyFormFields(days);
                                    void handleFormStatusUpdate([{ name: 'SNF Facesheet', ...fields }])
                                      .then(() => {
                                        toast({
                                          title: fields.snfResidencyNeedsStaffReview
                                            ? 'Saved — under 60 days (flagged)'
                                            : 'SNF residency days saved',
                                          description: `Recorded ${days} days.`,
                                          variant: fields.snfResidencyNeedsStaffReview ? 'destructive' : 'default',
                                        });
                                      })
                                      .finally(() => setIsSavingSnfResidency(false));
                                  }}
                                >
                                  {isSavingSnfResidency ? (
                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  ) : null}
                                  Save days
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow justify-end gap-4">
                        <StatusIndicator status={status} />
                        {getFormAction(req)}
                        {isSummary && !isReviewed ? (
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => void handleCsSummaryMarkReviewed()}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              {status === 'Completed'
                                ? 'Mark as Reviewed'
                                : 'Mark Completed & Reviewed (filled with family)'}
                            </Button>
                        ) : null}
                        {!isSummary && canReviewCard && isProcessTrackerReviewTarget && !isReviewed ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => {
                                void handleFormReviewed(req.title, true);
                              }}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark as Reviewed
                            </Button>
                        ) : null}
                        {(
                            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-3">
                                {(() => {
                                  const selectedScope = rejectScopeByForm[req.title] || 'info';
                                  return (
                                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                                      <div className="text-xs font-medium">Revision action (on pathway)</div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={selectedScope === 'info' ? 'default' : 'outline'}
                                          onClick={() => openRevisionRequestDialog(req.title, 'info')}
                                        >
                                          Request additional info
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={selectedScope === 'form' ? 'default' : 'outline'}
                                          onClick={() =>
                                            setRejectScopeByForm((prev) => ({ ...prev, [req.title]: 'form' }))
                                          }
                                        >
                                          Reset whole set/card
                                        </Button>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">
                                        {selectedScope === 'info'
                                          ? 'Keeps existing uploads and asks the family for more information or another document.'
                                          : 'Deletes all uploads on this card and resets it to Pending.'}
                                      </p>
                                    </div>
                                  );
                                })()}
                                  <Dialog
                                  open={rejectDialogForm === req.title}
                                  onOpenChange={(open) => {
                                    if (open) {
                                      openRevisionRequestDialog(
                                        req.title,
                                        rejectScopeByForm[req.title] || 'info'
                                      );
                                      return;
                                    }
                                    setRejectDialogForm(null);
                                  }}
                                >
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full border-amber-300 text-amber-800 hover:bg-amber-100"
                                    >
                                      {isReviewed ? 'Unlock card / requires revision' : 'Requires Revision'}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>
                                        {(rejectScopeByForm[req.title] || 'info') === 'info'
                                          ? `Request additional info: ${req.title}`
                                          : `Requires Revision: ${req.title}`}
                                      </DialogTitle>
                                      <DialogDescription>
                                        Write what you are requesting. The primary contact name is prefilled in the
                                        note. Login instructions are always included below your message.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-3">
                                      {(() => {
                                        const selectedScope = rejectScopeByForm[req.title] || 'info';
                                        const scopeLabel =
                                          selectedScope === 'info'
                                              ? 'Request more info only (keeps existing uploads)'
                                              : 'Reset whole set/card (deletes uploads)';
                                        return (
                                          <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                                            Selected pathway action: <span className="font-medium text-foreground">{scopeLabel}</span>
                                          </div>
                                        );
                                      })()}
                                      {(() => {
                                        const looksLikeEmail = (value: unknown) => {
                                          const email = String(value || '').trim().toLowerCase();
                                          if (!email || email === 'n/a' || email === 'na' || email === 'none' || email === 'null') {
                                            return false;
                                          }
                                          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                                        };
                                        const primaryEmailCandidates = [
                                          (application as any)?.bestContactEmail,
                                          (application as any)?.primaryContactEmail,
                                          (application as any)?.contactEmail,
                                          (application as any)?.linkedToFamilyEmail,
                                        ];
                                        const creatorEmailCandidates = [
                                          (application as any)?.referrerEmail,
                                          (application as any)?.submittedByEmail,
                                          (application as any)?.createdByEmail,
                                          (application as any)?.submitterEmail,
                                        ];
                                        const primaryEmail =
                                          primaryEmailCandidates
                                            .map((v) => String(v || '').trim())
                                            .find((v) => looksLikeEmail(v)) || '';
                                        const creatorEmail =
                                          creatorEmailCandidates
                                            .map((v) => String(v || '').trim())
                                            .find((v) => looksLikeEmail(v)) || '';
                                        const primaryContactName =
                                          [
                                            String((application as any)?.bestContactFirstName || '').trim(),
                                            String((application as any)?.bestContactLastName || '').trim(),
                                          ]
                                            .filter(Boolean)
                                            .join(' ')
                                            .trim() ||
                                          String((application as any)?.bestContactName || '').trim() ||
                                          String((application as any)?.contactFirstName || '').trim() ||
                                          'Primary contact';
                                        const selectedRecipient =
                                          rejectEmailRecipientByForm[req.title] ||
                                          (primaryEmail ? 'primary' : creatorEmail ? 'creator' : 'primary');
                                        const applicantPortalLoginUrl = 'https://connectcalaim.com/login';
                                        const previewSubject = `Action needed: Please redo ${req.title}`;
                                        const descriptionValue = String(rejectEmailBodyByForm[req.title] || '');
                                        const latestHistoryEntry = Array.isArray((formInfo as any)?.revisionHistory)
                                          ? (formInfo as any).revisionHistory[0]
                                          : null;
                                        const previousReason = String(latestHistoryEntry?.reason || '').trim();
                                        const parseLinkFromReason = (reason: string, marker: string) => {
                                          const line = reason
                                            .split('\n')
                                            .map((value) => value.trim())
                                            .find((value) => value.toLowerCase().startsWith(marker.toLowerCase()));
                                          if (!line) return '';
                                          return String(line.slice(marker.length).trim()).replace(/[)>.,;]+$/g, '');
                                        };
                                        const previousLoginUrl =
                                          String(latestHistoryEntry?.portalLoginUrl || '').trim() ||
                                          parseLinkFromReason(previousReason, 'Login:');
                                        const previousPathUrl =
                                          String(latestHistoryEntry?.portalPathUrl || '').trim() ||
                                          parseLinkFromReason(previousReason, 'Go directly to your application:');
                                        const useSameLink = rejectUseSameLinkByForm[req.title] ?? true;
                                        const loginInstructionsPreview =
                                          'Log in to the application portal and update this form so we can continue processing.\n\n' +
                                          `${useSameLink && previousPathUrl ? `Go directly to your application: ${previousPathUrl}\n` : ''}` +
                                          `Login: ${useSameLink && previousLoginUrl ? previousLoginUrl : applicantPortalLoginUrl}`;
                                        const activeEmail =
                                          selectedRecipient === 'creator' ? creatorEmail : primaryEmail;
                                        const activeLabel =
                                          selectedRecipient === 'creator'
                                            ? 'Application creator / submitter'
                                            : 'Primary contact';
                                        return (
                                          <div className="rounded-md border bg-white p-3 text-xs space-y-2">
                                            <div className="font-medium text-foreground">Email preview</div>
                                            <div className="rounded-md border bg-slate-50 p-2 space-y-2">
                                              <div className="font-medium text-foreground">Send email to</div>
                                              <label className="flex items-start gap-2">
                                                <input
                                                  type="radio"
                                                  name={`reject-recipient-${req.id}`}
                                                  className="mt-0.5"
                                                  checked={selectedRecipient === 'primary'}
                                                  disabled={!primaryEmail}
                                                  onChange={() =>
                                                    setRejectEmailRecipientByForm((prev) => ({
                                                      ...prev,
                                                      [req.title]: 'primary',
                                                    }))
                                                  }
                                                />
                                                <span>
                                                  <span className="font-medium">Primary contact — {primaryContactName}</span>
                                                  <span className="block text-muted-foreground">
                                                    {primaryEmail || 'No valid primary contact email on file'}
                                                  </span>
                                                </span>
                                              </label>
                                              <label className="flex items-start gap-2">
                                                <input
                                                  type="radio"
                                                  name={`reject-recipient-${req.id}`}
                                                  className="mt-0.5"
                                                  checked={selectedRecipient === 'creator'}
                                                  disabled={!creatorEmail}
                                                  onChange={() =>
                                                    setRejectEmailRecipientByForm((prev) => ({
                                                      ...prev,
                                                      [req.title]: 'creator',
                                                    }))
                                                  }
                                                />
                                                <span>
                                                  <span className="font-medium">Application creator / submitter</span>
                                                  <span className="block text-muted-foreground">
                                                    {creatorEmail || 'No valid creator/submitter email on file'}
                                                    {!primaryEmail && creatorEmail
                                                      ? ' · Suggested because primary contact has no email'
                                                      : ''}
                                                  </span>
                                                </span>
                                              </label>
                                            </div>
                                            <div>
                                              <span className="font-medium">Subject:</span> {previewSubject}
                                            </div>
                                            <div className="space-y-1">
                                              <Label htmlFor={`reject-email-body-${req.id}`} className="text-xs font-medium">
                                                What we are requesting (required)
                                              </Label>
                                              <Textarea
                                                id={`reject-email-body-${req.id}`}
                                                value={descriptionValue}
                                                onChange={(e) =>
                                                  setRejectEmailBodyByForm((prev) => ({ ...prev, [req.title]: e.target.value }))
                                                }
                                                placeholder={`Hi ${primaryContactName},\n\nWrite what additional information you need...`}
                                                className="min-h-[120px] text-[11px] leading-relaxed"
                                              />
                                              <p className="text-[11px] text-muted-foreground">
                                                Prefills with the primary contact name. This note appears above the login instructions
                                                and in the email as &quot;Dear {primaryContactName}&quot;.
                                              </p>
                                            </div>
                                            {previousLoginUrl ? (
                                              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
                                                <div className="flex items-center gap-2">
                                                  <Checkbox
                                                    id={`reuse-revision-link-${req.id}`}
                                                    checked={useSameLink}
                                                    onCheckedChange={(checked) =>
                                                      setRejectUseSameLinkByForm((prev) => ({
                                                        ...prev,
                                                        [req.title]: checked !== false,
                                                      }))
                                                    }
                                                  />
                                                  <Label htmlFor={`reuse-revision-link-${req.id}`} className="text-[11px] font-medium">
                                                    Send same link as last revision email
                                                  </Label>
                                                </div>
                                                <div className="mt-1 text-[11px] text-muted-foreground break-all">
                                                  {previousLoginUrl}
                                                </div>
                                              </div>
                                            ) : null}
                                            <div className="space-y-1">
                                              <span className="font-medium">Login instructions (always included)</span>
                                              <pre className="whitespace-pre-wrap rounded bg-muted/60 p-2 text-[11px] leading-relaxed">
{loginInstructionsPreview}
                                              </pre>
                                            </div>
                                            <div className="pt-1">
                                              <Button asChild size="sm" variant="outline">
                                                <a href={applicantPortalLoginUrl} target="_blank" rel="noreferrer">
                                                  ConnectCalAIM Login
                                                </a>
                                              </Button>
                                            </div>
                                            <div className="rounded-md border bg-muted/40 p-2">
                                              <span className="font-medium">Sending to:</span>{' '}
                                              {activeEmail
                                                ? `${activeEmail} (${activeLabel})`
                                                : 'No valid recipient email selected'}{' '}
                                              <span className="text-muted-foreground">(BCC disabled)</span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                      <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                                        {formInfo && (
                                          <>
                                            {String((formInfo as any)?.revisionEmailSentAt || '').trim() ? (
                                              <div>
                                                <span className="font-medium">Last revision email sent:</span>{' '}
                                                {format(new Date(String((formInfo as any).revisionEmailSentAt)), 'MMM d, yyyy h:mm a')}
                                                {String((formInfo as any)?.revisionEmailTo || '').trim()
                                                  ? ` to ${String((formInfo as any).revisionEmailTo).trim()}`
                                                  : ''}
                                                {String((formInfo as any)?.revisionEmailRecipientType || '').trim()
                                                  ? ` (${String((formInfo as any).revisionEmailRecipientType).trim() === 'creator' ? 'Application creator' : 'Primary contact'})`
                                                  : ''}
                                              </div>
                                            ) : (
                                              <div>
                                                <span className="font-medium">Last revision email sent:</span> Not sent yet
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                                        <Button
                                          variant="ghost"
                                          onClick={() => setRejectDialogForm(null)}
                                          disabled={Boolean(rejectingByForm[req.title])}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={
                                            Boolean(rejectingByForm[req.title]) ||
                                            !String(rejectEmailBodyByForm[req.title] || '').trim()
                                          }
                                          onClick={() => {
                                            const selectedScope = rejectScopeByForm[req.title] || 'info';
                                            const isInfoOnly = selectedScope === 'info';
                                            void handleRejectFormRedo(req.title, false, {
                                              scope: selectedScope,
                                              resetCard: !isInfoOnly,
                                            });
                                          }}
                                        >
                                          {rejectingByForm[req.title] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                          {(rejectScopeByForm[req.title] || 'info') === 'info' ? 'Save Request (No Reset)' : 'Apply Reset Action'}
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="bg-amber-600 text-white hover:bg-amber-700"
                                          disabled={
                                            Boolean(rejectingByForm[req.title]) ||
                                            !String(rejectEmailBodyByForm[req.title] || '').trim()
                                          }
                                          onClick={() => {
                                            const selectedScope = rejectScopeByForm[req.title] || 'info';
                                            const isInfoOnly = selectedScope === 'info';
                                            void handleRejectFormRedo(req.title, true, {
                                              scope: selectedScope,
                                              resetCard: !isInfoOnly,
                                              useSameLink: rejectUseSameLinkByForm[req.title] ?? true,
                                              emailRecipient: rejectEmailRecipientByForm[req.title],
                                            });
                                          }}
                                        >
                                          {rejectingByForm[req.title] ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                          {(rejectEmailRecipientByForm[req.title] || 'primary') === 'creator'
                                            ? 'Email Application Creator'
                                            : 'Email Primary Contact'}
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                                {(() => {
                                  const latest = Array.isArray((formInfo as any)?.revisionHistory)
                                    ? (formInfo as any).revisionHistory[0]
                                    : null;
                                  if (!latest || !latest?.emailed) return null;
                                  const sentLabel = formatDateTimeValue(latest?.emailSentAt);
                                  return (
                                    <div className="text-xs text-green-700">
                                      Email sent successfully{sentLabel ? ` at ${sentLabel}` : ''}.
                                    </div>
                                  );
                                })()}
                                {Array.isArray((formInfo as any)?.revisionHistory) && (formInfo as any).revisionHistory.length > 0 && (
                                  <Dialog>
                                    <DialogTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-xs text-amber-800 underline underline-offset-2 hover:text-amber-900 w-fit"
                                      >
                                        View revision history ({(formInfo as any).revisionHistory.length})
                                      </button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-2xl">
                                      <DialogHeader>
                                        <DialogTitle>Revision history: {req.title}</DialogTitle>
                                        <DialogDescription>
                                          Recent revision requests and email delivery details for this card.
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
                                        {(formInfo as any).revisionHistory.map((entry: any, idx: number) => {
                                          const when = String(entry?.rejectedAt || '').trim();
                                          const dateLabel = when && !Number.isNaN(new Date(when).getTime())
                                            ? format(new Date(when), 'MMM d, yyyy h:mm a')
                                            : 'Unknown date';
                                          const who = String(entry?.rejectedBy || '').trim() || 'Unknown sender';
                                          const why = String(entry?.reason || '').trim() || 'No reason';
                                          const scope = String(entry?.scope || '').trim().toLowerCase() === 'file' ? 'Specific file' : 'Whole card';
                                          const targetFileLabel = String(entry?.targetFileLabel || '').trim();
                                          const emailed = Boolean(entry?.emailed);
                                          const to = String(entry?.emailTo || '').trim();
                                          const sentAt = String(entry?.emailSentAt || '').trim();
                                          const sentLabel = sentAt && !Number.isNaN(new Date(sentAt).getTime())
                                            ? format(new Date(sentAt), 'MMM d, yyyy h:mm a')
                                            : '';
                                          return (
                                            <div
                                              key={`reject-history-dialog-${req.id}-${idx}`}
                                              className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground leading-snug"
                                            >
                                              <div>
                                                <span className="font-medium text-foreground">{dateLabel}</span> - {who}
                                              </div>
                                              <div>
                                                Scope: <span className="font-medium text-foreground">{scope}</span>
                                                {targetFileLabel ? ` - ${targetFileLabel}` : ''}
                                              </div>
                                              <div>{why}</div>
                                              <div className={emailed ? 'text-red-700' : ''}>
                                                {emailed
                                                  ? `Emailed ${to || 'applicant'}${sentLabel ? ` at ${sentLabel}` : ''}`
                                                  : 'Email not sent'}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                )}
                            </div>
                        )}
                        {status === 'Pending' && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-green-200 text-green-700 hover:bg-green-50"
                                onClick={() => markFormAsComplete(req.title)}
                            >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                {ALLOW_COMPLETE_WITHOUT_UPLOAD.has(req.title)
                                  ? 'Mark Complete (received by email)'
                                  : 'Mark as Complete'}
                            </Button>
                        )}
                        {status === 'Pending' && ALLOW_COMPLETE_WITHOUT_UPLOAD.has(req.title) ? (
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Use when the family sent the signed 602 by email (or another channel). You can still
                            upload/import the file later if needed.
                          </p>
                        ) : null}
                    </CardContent>
                </Card>
            )
        })}
        {showCustomerFeedbackCard && (
          <Card
            id="requirement-card-customer-feedback-survey"
            key="customer-feedback-survey"
            className={cn(
              'flex flex-col shadow-sm hover:shadow-md transition-shadow',
              focusRequirementTarget === 'customer-feedback-survey' && 'ring-2 ring-blue-300 ring-offset-2'
            )}
          >
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquareHeart className="h-5 w-5 text-muted-foreground" />
                Customer Feedback Survey (Optional)
              </CardTitle>
              <CardDescription>
                Member feedback captured from the user portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div>
                  <span className="font-medium">Rating:</span>{' '}
                  {customerFeedbackRating > 0 ? `${customerFeedbackRating}/5` : 'Not submitted'}
                </div>
                <div className="mt-1">
                  <span className="font-medium">Submitted:</span> {customerFeedbackSubmittedAtLabel || 'Not submitted'}
                </div>
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-1">Comments</div>
                <div className="whitespace-pre-wrap break-words text-muted-foreground">
                  {customerFeedbackComments || 'No comments submitted.'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
         {consolidatedMedicalDocuments.length > 0 && (
          <Card key="consolidated-medical" className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                  <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-muted-foreground"/>Consolidated Medical Documents (Optional)</CardTitle>
                      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1">
                        <Label htmlFor="consolidated-medical-reviewed" className="text-xs font-medium">
                          Mark reviewed
                        </Label>
                        <Checkbox
                          id="consolidated-medical-reviewed"
                          checked={isConsolidatedUploadReviewed}
                          onCheckedChange={(checked) => {
                            void handleFormReviewed('Consolidated Medical Documents', Boolean(checked));
                          }}
                          disabled={!canReviewConsolidatedUpload}
                        />
                      </div>
                  </div>
                  <CardDescription>For convenience, you can upload multiple medical forms at once. Select the documents you are uploading below.</CardDescription>
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
                                  disabled={formStatusMap.get(doc.name)?.status === 'Completed'}
                              />
                              <label htmlFor={doc.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                  {doc.name}
                              </label>
                          </div>
                      ))}
                  </div>
                  <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/40 p-3">
                    <div className="text-xs font-medium text-blue-900">Review checklist (individual documents)</div>
                    {consolidatedMedicalDocuments.map((doc) => {
                      const formInfo = formStatusMap.get(doc.name);
                      const isCompleted = String(formInfo?.status || '').trim() === 'Completed';
                      const isReviewed = Boolean(formInfo?.acknowledged);
                      return (
                        <div key={`${doc.id}-review`} className="flex items-center justify-between gap-2">
                          <Label htmlFor={`${doc.id}-review`} className="text-xs">
                            {doc.name}
                          </Label>
                          <div className="flex items-center gap-2">
                            {!isCompleted ? (
                              <span className="text-[11px] text-muted-foreground">Upload first</span>
                            ) : isReviewed ? (
                              <span className="text-[11px] text-green-700">Reviewed</span>
                            ) : (
                              <span className="text-[11px] text-amber-700">Needs review</span>
                            )}
                            <Checkbox
                              id={`${doc.id}-review`}
                              checked={isReviewed}
                              onCheckedChange={(checked) => {
                                void handleFormReviewed(doc.name, Boolean(checked));
                              }}
                              disabled={!isCompleted}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Label htmlFor="consolidated-upload" className={cn("flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-primary text-primary-foreground text-sm font-medium ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", (isConsolidatedUploading || !isAnyConsolidatedChecked) && "opacity-50 pointer-events-none")}>
                      {isConsolidatedUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                      <span>{isConsolidatedUploading ? `Uploading... ${consolidatedProgress?.toFixed(0)}%` : 'Upload Consolidated Documents'}</span>
                  </Label>
                  <Input id="consolidated-upload" type="file" className="sr-only" onChange={handleConsolidatedUpload} disabled={isConsolidatedUploading || !isAnyConsolidatedChecked} multiple />
              </CardContent>
          </Card>
        )}
        {showAdminPlaceholderCard && (
          <Card
            aria-hidden="true"
            className="hidden md:flex border-dashed border-muted-foreground/20 bg-transparent shadow-none pointer-events-none"
          >
            <CardContent className="h-full min-h-[120px]" />
          </Card>
        )}

        {/* Multi Upload Card */}
        <MultiUploadCard
            applicationComponents={pathwayRequirements
                .filter(req => req.type === 'Upload')
                .map(req => ({
                    id: req.id,
                    title: req.title,
                    description: req.description,
                    required: true
                }))
            }
            onUploadComplete={(files) => {
                // Handle the uploaded files
                console.log('Uploaded files:', files);
                // TODO: Update form status for each component
                files.forEach(({ components, url }) => {
                    const updates = components.map(componentId => {
                        const requirement = pathwayRequirements.find(req => req.id === componentId);
                        return {
                            name: requirement?.title,
                            status: 'Completed' as const,
                            uploadUrl: url
                        };
                    });
                    handleFormStatusUpdate(updates);
                });
                
                toast({
                    title: "Documents Uploaded",
                    description: "Your documents have been successfully uploaded and assigned to the application components.",
                });
            }}
            className="md:col-span-2"
        />
    </div>
  );
}
