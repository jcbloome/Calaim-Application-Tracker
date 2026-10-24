'use client';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  applicationInactiveCalaimStatus,
  INACTIVE_CALAIM_STATUSES,
} from '@/lib/inactive-calaim-status';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { type Application } from '@/lib/definitions';
import { type Dispatch, type SetStateAction } from 'react';

export interface ApplicationProgressSummaryCardProps {
  eligibilityCompleted: boolean;
  caspioPushed: boolean;
  effectiveCaspioCalAIMStatus: "" | "Pending" | "Authorized";
  csSummaryCaspioSyncLabel: string;
  csSummaryCaspioSyncMode: string;
  isKaiserPlan: boolean;
  isKaiserNotInterested: boolean;
  currentKaiserStatus: string;
  handleUpdateKaiserStatusFromCaspio: () => Promise<void>;
  isConfirmingCaspioPush: boolean;
  kaiserManagerActionRequired: boolean;
  isKaiserAuthReceivedIntake: boolean;
  kaiserReferralSubmitted: boolean;
  kaiserReferralSubmittedAtLabel: string;
  currentSocialWorkerHold: string;
  hasAlftAssignmentStatus: boolean;
  alftAssignmentStatusLabel: string;
  staffAssigned: boolean;
  assignedStaffName: string;
  caspioSentByName: string;
  caspioSentDateLabel: string;
  application: Application;
  getFrequencyLabel: (days: number) => string;
  documentReminderFrequencyDays: number;
  getNextReminderLabel: (ms: number) => string;
  documentReminderNextAtMs: number;
  statusReminderFrequencyDays: number;
  statusReminderNextAtMs: number;
  setIsReminderDialogOpen: Dispatch<SetStateAction<boolean>>;
  updateReminderSettings: (patch: Record<string, any>) => Promise<void>;
  DAY_MS: number;
  isUpdatingReminderControls: boolean;
  reminderFrequencyOptions: readonly [7];
  updateCaspioCalAIMStatus: (status: string) => Promise<void>;
  isUpdatingCaspioStatus: boolean;
  updateSocialWorkerHoldStatus: (status: string) => Promise<void>;
  isUpdatingSocialWorkerHold: boolean;
  isLoadingSwPortalAssignment: boolean;
  swPortalAssignment: { memberId: string; kaiserStatus: string; assignedSwName: string; assignedSwEmail: string; assignmentStatus: string; eligible: boolean; } | null;
  swPortalAssignmentError: string;
  swPortalInviteEnabled: boolean;
  setSwPortalInviteEnabled: Dispatch<SetStateAction<boolean>>;
  isSavingSwPortalInvite: boolean;
  handleSaveSwPortalInvite: () => Promise<void>;
  swPortalInviteSentAtLabel: string;
  familyStatusLastSentLabel: string;
  familyStatusLastEmail: any;
  healthNetCurrentStatus: string;
  isNewCsSummary: boolean;
  processTrackerCompletedCount: number;
  processTrackerTotalCount: number;
  processTrackerProgress: number;
  processTrackerStatuses: { item: { key: string; label: string; }; status: "Completed" | "Pending" | "Not Applicable"; }[];
}

export function ApplicationProgressSummaryCard({
  eligibilityCompleted,
  caspioPushed,
  effectiveCaspioCalAIMStatus,
  csSummaryCaspioSyncLabel,
  csSummaryCaspioSyncMode,
  isKaiserPlan,
  isKaiserNotInterested,
  currentKaiserStatus,
  handleUpdateKaiserStatusFromCaspio,
  isConfirmingCaspioPush,
  kaiserManagerActionRequired,
  isKaiserAuthReceivedIntake,
  kaiserReferralSubmitted,
  kaiserReferralSubmittedAtLabel,
  currentSocialWorkerHold,
  hasAlftAssignmentStatus,
  alftAssignmentStatusLabel,
  staffAssigned,
  assignedStaffName,
  caspioSentByName,
  caspioSentDateLabel,
  application,
  getFrequencyLabel,
  documentReminderFrequencyDays,
  getNextReminderLabel,
  documentReminderNextAtMs,
  statusReminderFrequencyDays,
  statusReminderNextAtMs,
  setIsReminderDialogOpen,
  updateReminderSettings,
  DAY_MS,
  isUpdatingReminderControls,
  reminderFrequencyOptions,
  updateCaspioCalAIMStatus,
  isUpdatingCaspioStatus,
  updateSocialWorkerHoldStatus,
  isUpdatingSocialWorkerHold,
  isLoadingSwPortalAssignment,
  swPortalAssignment,
  swPortalAssignmentError,
  swPortalInviteEnabled,
  setSwPortalInviteEnabled,
  isSavingSwPortalInvite,
  handleSaveSwPortalInvite,
  swPortalInviteSentAtLabel,
  familyStatusLastSentLabel,
  familyStatusLastEmail,
  healthNetCurrentStatus,
  isNewCsSummary,
  processTrackerCompletedCount,
  processTrackerTotalCount,
  processTrackerProgress,
  processTrackerStatuses,
}: ApplicationProgressSummaryCardProps) {
  return (
    <Card className="border-dashed">
    <CardContent className="space-y-4 pt-4">
        <div className="space-y-1 border-b pb-3">
          <div className={cn('flex items-center gap-2 text-base font-semibold', eligibilityCompleted ? 'text-green-700' : 'text-amber-700')}>
            {eligibilityCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>{eligibilityCompleted ? 'Eligibility Check: Complete' : 'Eligibility Check: Pending'}</span>
          </div>
          <div className={cn('flex items-center gap-2 text-base font-semibold', caspioPushed ? 'text-green-700' : 'text-amber-700')}>
            {caspioPushed ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>{caspioPushed ? 'Caspio: Pushed' : 'Caspio: Pending'}</span>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              effectiveCaspioCalAIMStatus ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {effectiveCaspioCalAIMStatus ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>
              {effectiveCaspioCalAIMStatus
                ? `CalAIM Status (Caspio sync): ${effectiveCaspioCalAIMStatus}`
                : 'CalAIM Status (Caspio sync): Waiting for Caspio update'}
            </span>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              csSummaryCaspioSyncLabel ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {csSummaryCaspioSyncLabel ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>
              {csSummaryCaspioSyncLabel
                ? `CS Summary Caspio sync: ${csSummaryCaspioSyncLabel}`
                : 'CS Summary Caspio sync: Not run yet'}
            </span>
            {csSummaryCaspioSyncLabel && csSummaryCaspioSyncMode ? (
              <Badge
                variant="outline"
                className={
                  csSummaryCaspioSyncMode === 'overwrite_enabled'
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                }
              >
                {csSummaryCaspioSyncMode === 'overwrite_enabled' ? 'Overwrite mode' : 'Fill-empty mode'}
              </Badge>
            ) : null}
          </div>
          {isKaiserPlan ? (
            <div
              className={cn(
                'flex items-center gap-2 text-base font-semibold',
                isKaiserNotInterested
                  ? 'text-rose-700'
                  : currentKaiserStatus
                    ? 'text-green-700'
                    : 'text-amber-700'
              )}
            >
              {currentKaiserStatus ? (
                isKaiserNotInterested ? (
                  <XCircle className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span>
                {currentKaiserStatus
                  ? `Kaiser Status: ${currentKaiserStatus}`
                  : 'Kaiser Status: Pending selection'}
              </span>
              {isKaiserNotInterested ? (
                <Link href="/admin/kaiser-not-interested-log">
                  <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100">
                    Not interested log
                  </Badge>
                </Link>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-2 h-7 px-2 text-xs"
                onClick={() => void handleUpdateKaiserStatusFromCaspio()}
                disabled={isConfirmingCaspioPush}
              >
                {isConfirmingCaspioPush ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Update status
              </Button>
            </div>
          ) : null}
          {kaiserManagerActionRequired ? (
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-base font-semibold text-red-700">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
                <span>Kaiser manager action required</span>
              </div>
              <div className="ml-4 text-xs font-normal text-red-700/90">
                Acknowledge pending documents and/or complete the Kaiser referral form send.
              </div>
            </div>
          ) : null}
          {isKaiserPlan ? (
            <div
              className={cn(
                'flex items-center gap-2 text-base font-semibold',
                isKaiserAuthReceivedIntake || kaiserReferralSubmitted ? 'text-green-700' : 'text-amber-700'
              )}
            >
              {isKaiserAuthReceivedIntake || kaiserReferralSubmitted ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span>
                {isKaiserAuthReceivedIntake
                  ? 'Kaiser Referral Form: Not required (authorization already received)'
                  : kaiserReferralSubmitted
                    ? `Kaiser Referral Form: Sent${kaiserReferralSubmittedAtLabel ? ` (${kaiserReferralSubmittedAtLabel})` : ''}`
                    : 'Kaiser Referral Form: Pending send'}
              </span>
            </div>
          ) : null}
          <div
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              currentSocialWorkerHold ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {currentSocialWorkerHold ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>
              {currentSocialWorkerHold
                ? `SW Hold for Caspio: ${currentSocialWorkerHold}`
                : 'SW Hold for Caspio: Pending selection'}
            </span>
          </div>
          {isKaiserPlan ? (
            <div
              className={cn(
                'flex items-center gap-2 text-base font-semibold',
                hasAlftAssignmentStatus ? 'text-green-700' : 'text-amber-700'
              )}
            >
              {hasAlftAssignmentStatus ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span>{`ALFT Status: ${alftAssignmentStatusLabel}`}</span>
            </div>
          ) : null}
          <div className={cn('flex items-center gap-2 text-base font-semibold', staffAssigned ? 'text-green-700' : 'text-amber-700')}>
            {staffAssigned ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>{staffAssigned ? `Staff Assigned: ${assignedStaffName || 'Assigned'}` : 'Staff Assigned: Pending assignment'}</span>
          </div>
          {caspioPushed ? (
            <div className="text-xs text-muted-foreground pl-7">
              {caspioSentByName && caspioSentDateLabel
                ? `${caspioSentByName} • ${caspioSentDateLabel}`
                : caspioSentByName
                  ? caspioSentByName
                  : caspioSentDateLabel || 'Date unavailable'}
            </div>
          ) : null}
          <div
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              (application as any)?.emailRemindersEnabled === true ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {(application as any)?.emailRemindersEnabled === true ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>
              Email reminders: {(application as any)?.emailRemindersEnabled === true
                ? `On (${getFrequencyLabel(documentReminderFrequencyDays)}) • Next: ${getNextReminderLabel(documentReminderNextAtMs)}`
                : 'Off'}
            </span>
          </div>
          <div
            className={cn(
              'flex items-center gap-2 text-base font-semibold',
              (application as any)?.statusRemindersEnabled === true ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {(application as any)?.statusRemindersEnabled === true ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
            <span>
              Status updates: {(application as any)?.statusRemindersEnabled === true
                ? `On (${getFrequencyLabel(statusReminderFrequencyDays)}) • Next: ${getNextReminderLabel(statusReminderNextAtMs)}`
                : 'Off'}
            </span>
          </div>
          <div className="pl-7">
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setIsReminderDialogOpen(true)}
            >
              Open reminder preview tools
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pl-7 rounded-lg border bg-muted/10 p-3">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Status updates frequency</Label>
              <Select
                value={Boolean((application as any)?.statusRemindersEnabled) ? String(statusReminderFrequencyDays) : 'none'}
                onValueChange={(v) => {
                  if (v === 'none') {
                    updateReminderSettings({ statusRemindersEnabled: false });
                    return;
                  }
                  const nextAtMs = statusReminderNextAtMs || (Date.now() + Number(v) * DAY_MS);
                  updateReminderSettings({
                    statusRemindersEnabled: true,
                    statusReminderFrequencyDays: Number(v),
                    statusReminderNextAtMs: nextAtMs,
                  });
                }}
                disabled={isUpdatingReminderControls}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {reminderFrequencyOptions.map((d) => (
                    <SelectItem key={`pathway-status-freq-${d}`} value={String(d)}>
                      Once a week
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 md:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <Label className="text-xs font-medium text-muted-foreground">CalAIM Status for Caspio</Label>
                  <Select
                    value={
                      applicationInactiveCalaimStatus(application as any) ||
                      (effectiveCaspioCalAIMStatus === 'Authorized' ||
                      effectiveCaspioCalAIMStatus === 'Pending'
                        ? effectiveCaspioCalAIMStatus
                        : '__none__')
                    }
                    onValueChange={(value) => {
                      if (value === '__none__') {
                        void updateCaspioCalAIMStatus('');
                        return;
                      }
                      void updateCaspioCalAIMStatus(value);
                    }}
                    disabled={isUpdatingCaspioStatus}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select CalAIM status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not selected</SelectItem>
                      <SelectItem value="Authorized">Authorized</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      {INACTIVE_CALAIM_STATUSES.map((status) => (
                        <SelectItem key={`caspio-${status}`} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Authorized or Pending is required before Caspio push. Closed, Denied, Member Died, Non-Active, and Not Interested move the application to Inactive.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">SW Hold for Caspio</Label>
              <Select
                value={currentSocialWorkerHold}
                onValueChange={(value) => {
                  if (value) {
                    void updateSocialWorkerHoldStatus(value);
                  }
                }}
                disabled={isUpdatingSocialWorkerHold}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select hold status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="🔴 Hold">🔴 Hold</SelectItem>
                  <SelectItem value="Hold">Hold</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Defaults to Hold; this can later be changed from Social Worker assignment workflow.
              </p>
            </div>
            {isKaiserPlan ? (
              <div className="space-y-2 md:col-span-2 rounded-md border bg-background p-3">
                <Label className="text-xs font-medium text-muted-foreground">Social Worker Assignment</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Social Worker Assigned</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {isLoadingSwPortalAssignment
                        ? 'Loading social worker assignment...'
                        : swPortalAssignment?.assignedSwName || 'Not assigned'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Social Worker Email</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      {isLoadingSwPortalAssignment
                        ? 'Loading email...'
                        : swPortalAssignment?.assignedSwEmail || 'Not available'}
                    </div>
                  </div>
                </div>
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  ALFT Status: {isLoadingSwPortalAssignment ? 'Loading...' : swPortalAssignment?.assignmentStatus || 'Not assigned'}
                </div>
                {swPortalAssignmentError ? (
                  <p className="text-xs text-amber-700">{swPortalAssignmentError}</p>
                ) : null}
                <div className="flex items-start gap-2 rounded-md border p-2">
                  <Checkbox
                    id="sw-portal-invite-admin"
                    checked={swPortalInviteEnabled}
                    onCheckedChange={(checked) => setSwPortalInviteEnabled(Boolean(checked))}
                    disabled={!swPortalAssignment?.eligible || !swPortalAssignment?.assignedSwEmail || isSavingSwPortalInvite}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="sw-portal-invite-admin" className="text-xs font-medium text-muted-foreground">
                      Invite to SW Portal ALFT workflow
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Sends an invite when Kaiser status is RN Visit Needed.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleSaveSwPortalInvite()}
                    disabled={!swPortalAssignment?.eligible || !swPortalAssignment?.assignedSwEmail || isSavingSwPortalInvite}
                  >
                    {isSavingSwPortalInvite ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Invite'
                    )}
                  </Button>
                  {swPortalInviteSentAtLabel ? (
                    <span className="text-xs text-muted-foreground">
                      Sent: {swPortalInviteSentAtLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {familyStatusLastSentLabel ? (
            <div className="text-xs text-muted-foreground pl-7">
              Last family status email: {familyStatusLastSentLabel}
              {String(familyStatusLastEmail?.to || '').trim() ? ` to ${String(familyStatusLastEmail?.to || '').trim()}` : ''}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {application.healthPlan?.toLowerCase().includes('kaiser')
                ? `Progression: ${currentKaiserStatus || 'Not set'}`
                : application.healthPlan?.toLowerCase().includes('health net')
                  ? `Progression: ${healthNetCurrentStatus || 'Not set'}`
                  : null}
            </div>
          </div>
        </div>

        <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Process Tracker</span>
                  {isNewCsSummary && (
                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200">
                      New CS
                    </Badge>
                  )}
                </div>
                <span>{processTrackerCompletedCount} of {processTrackerTotalCount} required items completed</span>
            </div>
            <Progress value={processTrackerProgress} className="h-2" />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {processTrackerStatuses.map(({ item, status }) => {
            if (status === 'Not Applicable') return null;
            return (
              <span key={item.key} className="flex items-center gap-1" title={`${item.key}: ${status}`}>
                {status === 'Completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-orange-500" />
                )}
                <span>{item.label}</span>
              </span>
            );
          })}
        </div>
    </CardContent>
    </Card>
  );
}
