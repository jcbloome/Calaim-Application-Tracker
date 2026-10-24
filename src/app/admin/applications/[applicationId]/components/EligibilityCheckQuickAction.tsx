'use client';

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { QaDoneMeta, toMillisSafe } from './shared';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { notEligibleReasonOptions, type PathwayRequirement } from './application-status-config';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusIndicator } from './StaffApplicationTracker';
import { type Application, type FormStatus } from '@/lib/definitions';
import { type Dispatch, type SetStateAction, type JSX } from 'react';
import { type KaiserRegion } from '@/lib/kaiser-region';
import {
  type CommunicationNoteLogEntry,
  type EligibilityScreenshotUpload,
} from './application-detail-types';

export interface EligibilityCheckQuickActionProps {
  isCalaimEligible: boolean;
  isCalaimNotEligible: boolean;
  isCalaimPending: boolean;
  eligibilityCompleted: boolean;
  application: Application;
  memberNameDisplay: string;
  memberMrnDisplay: string;
  healthPlanDisplay: string;
  pathwayDisplay: string;
  memberCountyDisplay: string;
  kaiserRegionDisplay: "" | "—" | KaiserRegion;
  memberDobDisplay: string;
  isUpdatingTracking: boolean;
  updateTrackingStatus: (status: string) => Promise<void>;
  hasEligibilityUploadEvidence: boolean;
  setApplication: Dispatch<SetStateAction<Application | null>>;
  updateNotEligibleFlags: (updates: { calaimNotEligibleSwitchingProviders?: boolean | undefined; calaimNotEligibleHasSoc?: boolean | undefined; calaimNotEligibleOutOfCounty?: boolean | undefined; calaimNotEligibleOther?: boolean | undefined; calaimNotEligibleReason?: string | undefined; calaimNotEligibleOtherReason?: string | undefined; }) => Promise<void>;
  eligibilityTemplateSelection: string;
  setEligibilityTemplateSelection: Dispatch<SetStateAction<string>>;
  applyEligibilityTemplate: (templateKey: string) => Promise<void>;
  updateTrackingReason: (reason: string) => Promise<void>;
  latestEligibilitySuccessNote: CommunicationNoteLogEntry | undefined;
  eligibilityNoteSendStatus: { state: "success" | "failed" | "blocked_duplicate" | "idle" | "sending"; message: string; atIso?: string | undefined; };
  isEligibilityDraftDuplicate: boolean;
  selectableEligibilityScreenshots: EligibilityScreenshotUpload[];
  setSelectedEligibilityScreenshotIds: Dispatch<SetStateAction<string[]>>;
  selectedEligibilityScreenshotIds: string[];
  sendEligibilityNote: () => Promise<void>;
  isSendingEligibilityNote: boolean;
  eligibilityRequirements: PathwayRequirement[];
  resetEligibilityUploads: () => Promise<void>;
  isResettingEligibilityUploads: boolean;
  hasEligibilityUploadsToReset: boolean;
  formStatusMap: Map<string, FormStatus>;
  getFormAction: (req: PathwayRequirement) => JSX.Element | null;
}

export function EligibilityCheckQuickAction({
  isCalaimEligible,
  isCalaimNotEligible,
  isCalaimPending,
  eligibilityCompleted,
  application,
  memberNameDisplay,
  memberMrnDisplay,
  healthPlanDisplay,
  pathwayDisplay,
  memberCountyDisplay,
  kaiserRegionDisplay,
  memberDobDisplay,
  isUpdatingTracking,
  updateTrackingStatus,
  hasEligibilityUploadEvidence,
  setApplication,
  updateNotEligibleFlags,
  eligibilityTemplateSelection,
  setEligibilityTemplateSelection,
  applyEligibilityTemplate,
  updateTrackingReason,
  latestEligibilitySuccessNote,
  eligibilityNoteSendStatus,
  isEligibilityDraftDuplicate,
  selectableEligibilityScreenshots,
  setSelectedEligibilityScreenshotIds,
  selectedEligibilityScreenshotIds,
  sendEligibilityNote,
  isSendingEligibilityNote,
  eligibilityRequirements,
  resetEligibilityUploads,
  isResettingEligibilityUploads,
  hasEligibilityUploadsToReset,
  formStatusMap,
  getFormAction,
}: EligibilityCheckQuickActionProps) {
  return (
    <div className="order-[1]">
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="qa-trigger">
          <CheckCircle2 className="h-4 w-4" />
          <span className="qa-label">1. Eligibility check & uploads</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            {isCalaimEligible ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                Eligible
              </Badge>
            ) : isCalaimNotEligible ? (
              <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
                Not Eligible
              </Badge>
            ) : isCalaimPending ? (
              <Badge className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50">
                Pending
              </Badge>
            ) : null}
            <QaDoneMeta
              done={eligibilityCompleted || isCalaimEligible || isCalaimNotEligible}
              atMs={toMillisSafe((application as any)?.lastEligibilityCheckAt) || undefined}
            />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Eligibility check</DialogTitle>
          <DialogDescription>Track CalAIM eligibility status and supporting uploads.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <span className="font-medium">Member:</span>{' '}
                {memberNameDisplay}
              </div>
              <div>
                <span className="font-medium">MRN:</span>{' '}
                {memberMrnDisplay}
              </div>
              <div>
                <span className="font-medium">Health Plan:</span>{' '}
                {healthPlanDisplay}
              </div>
              <div>
                <span className="font-medium">Pathway:</span>{' '}
                {pathwayDisplay}
              </div>
              <div>
                <span className="font-medium">County:</span>{' '}
                {memberCountyDisplay}
              </div>
              {kaiserRegionDisplay ? (
                <div>
                  <span className="font-medium">Kaiser Region:</span>{' '}
                  {kaiserRegionDisplay}
                </div>
              ) : null}
              <div>
                <span className="font-medium">DOB:</span>{' '}
                {memberDobDisplay}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">CalAIM Status</label>
              {isUpdatingTracking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <RadioGroup
              value={(application as any)?.calaimTrackingStatus || ''}
              onValueChange={updateTrackingStatus}
              disabled={isUpdatingTracking || !hasEligibilityUploadEvidence}
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="calaim-status-eligible"
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3',
                  (application as any)?.calaimTrackingStatus === 'CalAIM Eligible' && 'border-emerald-400 bg-emerald-50',
                  (isUpdatingTracking || !hasEligibilityUploadEvidence) && 'cursor-not-allowed opacity-60'
                )}
              >
                <RadioGroupItem id="calaim-status-eligible" value="CalAIM Eligible" />
                <span className="text-sm font-medium">CalAIM Eligible</span>
              </label>
              <label
                htmlFor="calaim-status-not-eligible"
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3',
                  (application as any)?.calaimTrackingStatus === 'Not CalAIM Eligible' && 'border-amber-400 bg-amber-50',
                  (isUpdatingTracking || !hasEligibilityUploadEvidence) && 'cursor-not-allowed opacity-60'
                )}
              >
                <RadioGroupItem id="calaim-status-not-eligible" value="Not CalAIM Eligible" />
                <span className="text-sm font-medium">Not CalAIM Eligible</span>
              </label>
            </RadioGroup>
            {!hasEligibilityUploadEvidence ? (
              <p className="text-xs text-muted-foreground">
                Upload eligibility evidence first, then check off Eligible or Not Eligible.
              </p>
            ) : null}

            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason</Label>
              <Select
                value={(application as any)?.calaimNotEligibleReason || ''}
                onValueChange={(value) => {
                  const nextReason = value || '';
                  const nextFlags = {
                    calaimNotEligibleSwitchingProviders: nextReason === 'Switching Providers by end of Month',
                    calaimNotEligibleHasSoc: nextReason === 'Has SOC',
                    calaimNotEligibleOutOfCounty: nextReason === 'Not in our contracted CalAIM County',
                    calaimNotEligibleOther: nextReason === 'Other',
                    calaimNotEligibleReason: nextReason,
                    calaimNotEligibleOtherReason:
                      nextReason === 'Other' ? (application as any)?.calaimNotEligibleOtherReason || '' : '',
                  };
                  setApplication((prev) => (prev ? { ...prev, ...nextFlags } : null));
                  updateNotEligibleFlags(nextFlags);
                }}
                disabled={isUpdatingTracking || (application as any)?.calaimTrackingStatus !== 'Not CalAIM Eligible'}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {notEligibleReasonOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(application as any)?.calaimTrackingStatus !== 'Not CalAIM Eligible' ? (
                <p className="text-xs text-muted-foreground">
                  Reason fields are available when CalAIM Status is set to Not CalAIM Eligible.
                </p>
              ) : null}
              {(application as any)?.calaimNotEligibleReason === 'Other' && (
                <Textarea
                  id="not-eligible-other-reason"
                  rows={2}
                  placeholder="Describe the reason..."
                  value={(application as any)?.calaimNotEligibleOtherReason || ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setApplication((prev) => (prev ? { ...prev, calaimNotEligibleOtherReason: nextValue } : null));
                  }}
                  onBlur={(event) =>
                    updateNotEligibleFlags({ calaimNotEligibleOtherReason: event.target.value })
                  }
                  disabled={isUpdatingTracking || (application as any)?.calaimTrackingStatus !== 'Not CalAIM Eligible'}
                />
              )}
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium">Note to Member (optional)</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Select
                    value={eligibilityTemplateSelection}
                    onValueChange={(value) => setEligibilityTemplateSelection(value)}
                    disabled={isUpdatingTracking}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No template</SelectItem>
                      <SelectItem value="health-net-molina-switch">
                        Health Net: Member assigned to Molina
                      </SelectItem>
                      <SelectItem value="no-medi-cal-assigned-plan">
                        Generic: No Medi-Cal assigned with plan
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void applyEligibilityTemplate(eligibilityTemplateSelection)}
                    disabled={isUpdatingTracking || eligibilityTemplateSelection === 'none'}
                  >
                    Use Template
                  </Button>
                </div>
                <Textarea
                  rows={3}
                  placeholder="Add a message that explains the eligibility outcome..."
                  value={(application as any)?.calaimTrackingReason || ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setApplication((prev) => (prev ? { ...prev, calaimTrackingReason: nextValue } : null));
                  }}
                  onBlur={(event) => updateTrackingReason(event.target.value)}
                  disabled={isUpdatingTracking}
                />
                {latestEligibilitySuccessNote ? (
                  <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                    Last sent:{' '}
                    {(() => {
                      try {
                        const d = new Date(latestEligibilitySuccessNote.createdAtIso || '');
                        return Number.isNaN(d.getTime()) ? 'recently' : format(d, 'MMM d, yyyy h:mm a');
                      } catch {
                        return 'recently';
                      }
                    })()}
                    {latestEligibilitySuccessNote.recipientEmail
                      ? ` to ${latestEligibilitySuccessNote.recipientEmail}`
                      : ''}
                  </div>
                ) : null}
                {eligibilityNoteSendStatus.state !== 'idle' ? (
                  <div
                    className={cn(
                      'rounded-md border p-2 text-xs',
                      eligibilityNoteSendStatus.state === 'success'
                        ? 'border-green-200 bg-green-50 text-green-800'
                        : eligibilityNoteSendStatus.state === 'sending'
                          ? 'border-blue-200 bg-blue-50 text-blue-800'
                          : eligibilityNoteSendStatus.state === 'blocked_duplicate'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-red-200 bg-red-50 text-red-800'
                    )}
                  >
                    {eligibilityNoteSendStatus.message}
                    {eligibilityNoteSendStatus.atIso
                      ? ` (${format(new Date(eligibilityNoteSendStatus.atIso), 'MMM d, h:mm a')})`
                      : ''}
                  </div>
                ) : null}
                {isEligibilityDraftDuplicate ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    This draft matches the last sent note. Sending is blocked until you change the content.
                  </div>
                ) : null}
                {selectableEligibilityScreenshots.length > 0 ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-medium">Screenshots to include in email</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setSelectedEligibilityScreenshotIds(
                              selectableEligibilityScreenshots.map((upload) => upload.id)
                            )
                          }
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setSelectedEligibilityScreenshotIds([])}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {selectableEligibilityScreenshots.map((upload) => {
                        const checked = selectedEligibilityScreenshotIds.includes(upload.id);
                        return (
                          <label
                            key={upload.id}
                            className="flex items-start gap-2 rounded-md border bg-muted/20 p-2 text-xs"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                const shouldCheck = next === true;
                                setSelectedEligibilityScreenshotIds((prev) => {
                                  if (shouldCheck) {
                                    if (prev.includes(upload.id)) return prev;
                                    return [...prev, upload.id];
                                  }
                                  return prev.filter((id) => id !== upload.id);
                                });
                              }}
                            />
                            <span className="min-w-0 truncate" title={upload.fileName}>
                              {upload.fileName}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selected screenshots are appended as links in the note email.
                    </p>
                  </div>
                ) : null}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={sendEligibilityNote}
                  disabled={isSendingEligibilityNote || isEligibilityDraftDuplicate}
                >
                  {isSendingEligibilityNote ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Note...
                    </>
                  ) : (
                    'Send Note to Referrer'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {eligibilityRequirements.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Eligibility Uploads</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void resetEligibilityUploads()}
                  disabled={isResettingEligibilityUploads || !hasEligibilityUploadsToReset}
                >
                  {isResettingEligibilityUploads ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Delete All / Start Over
                    </>
                  )}
                </Button>
              </div>
              <div className="space-y-3">
                {eligibilityRequirements.map((req) => {
                  const formInfo = formStatusMap.get(req.title);
                  const status = formInfo?.status || 'Pending';
                  return (
                    <div key={req.id} className="rounded-md border p-3 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{req.title}</div>
                          <StatusIndicator status={status} />
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      </div>
                      {getFormAction(req)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );
}
