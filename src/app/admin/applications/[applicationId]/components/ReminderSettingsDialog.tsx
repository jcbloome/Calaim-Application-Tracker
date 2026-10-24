'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Mail, Loader2, Eye, Bell } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { type Application } from '@/lib/definitions';

export interface ReminderSettingsDialogProps {
  isReminderDialogOpen: boolean;
  setIsReminderDialogOpen: Dispatch<SetStateAction<boolean>>;
  emailReminderSectionRef: MutableRefObject<HTMLDivElement | null>;
  application: Application;
  isUpdatingReminderControls: boolean;
  updateReminderSettings: (patch: Record<string, any>) => Promise<void>;
  currentReminderMissingItems: string[];
  documentReminderFrequencyDays: number;
  documentReminderNextAtMs: number;
  DAY_MS: number;
  reminderFrequencyOptions: readonly [7];
  toDateInputValue: (ms: number) => string;
  fromDateInputToMs: (value: string) => number | null;
  staffTestReminderEmail: string;
  loadTestMissingDocsPreview: () => Promise<void>;
  isLoadingReminderPreview: boolean;
  sendTestMissingDocsReminder: () => Promise<void>;
  isSendingTestReminder: boolean;
  reminderPreview: { recipientEmail: string; referrerName: string; memberName: string; subject: string; missingItems: string[]; } | null;
  statusReminderSectionRef: MutableRefObject<HTMLDivElement | null>;
  statusReminderFrequencyDays: number;
  statusReminderNextAtMs: number;
  isKaiserPlan: boolean;
  isAlfaVisitCompleteStatusSelected: boolean;
  handleFamilyStatusProgressChange: (value: string) => Promise<void>;
  alfaVisitCompleteStatusLabel: "ALFA Visit Complete with Signoffs and Sent to ILS";
  loadTestStatusReminderPreview: () => Promise<void>;
  isLoadingStatusReminderPreview: boolean;
  sendTestStatusReminder: () => Promise<void>;
  isSendingStatusTestReminder: boolean;
  statusReminderPreview: { recipientEmail: string; referrerName: string; memberName: string; subject: string; statusText: string; deniedReason: string; message: string; } | null;
  isHealthNetPlan: boolean;
  familyStatusProgressValue: string;
  familyProgressOptions: string[];
  familyProgressNeedsDeniedReason: boolean;
  familyStatusDeniedReason: string;
  setApplication: Dispatch<SetStateAction<Application | null>>;
  handleFamilyDeniedReasonBlur: (value: string) => Promise<void>;
  handleManualFamilyStatusSend: () => Promise<void>;
  isSendingFamilyStatusNow: boolean;
  familyStatusHistory: any[];
}

export function ReminderSettingsDialog({
  isReminderDialogOpen,
  setIsReminderDialogOpen,
  emailReminderSectionRef,
  application,
  isUpdatingReminderControls,
  updateReminderSettings,
  currentReminderMissingItems,
  documentReminderFrequencyDays,
  documentReminderNextAtMs,
  DAY_MS,
  reminderFrequencyOptions,
  toDateInputValue,
  fromDateInputToMs,
  staffTestReminderEmail,
  loadTestMissingDocsPreview,
  isLoadingReminderPreview,
  sendTestMissingDocsReminder,
  isSendingTestReminder,
  reminderPreview,
  statusReminderSectionRef,
  statusReminderFrequencyDays,
  statusReminderNextAtMs,
  isKaiserPlan,
  isAlfaVisitCompleteStatusSelected,
  handleFamilyStatusProgressChange,
  alfaVisitCompleteStatusLabel,
  loadTestStatusReminderPreview,
  isLoadingStatusReminderPreview,
  sendTestStatusReminder,
  isSendingStatusTestReminder,
  statusReminderPreview,
  isHealthNetPlan,
  familyStatusProgressValue,
  familyProgressOptions,
  familyProgressNeedsDeniedReason,
  familyStatusDeniedReason,
  setApplication,
  handleFamilyDeniedReasonBlur,
  handleManualFamilyStatusSend,
  isSendingFamilyStatusNow,
  familyStatusHistory,
}: ReminderSettingsDialogProps) {
  return (
    <Dialog open={isReminderDialogOpen} onOpenChange={setIsReminderDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Missing Docs and status reminders</DialogTitle>
          <DialogDescription>
            Configure reminder cadence and preview reminder content before test-sending.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div ref={emailReminderSectionRef} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="email-reminders-quick" className="text-sm font-medium">
                  Email reminders for missing documents
                </Label>
                <p className="text-xs text-muted-foreground">
                  Recipient: {(application as any)?.referrerEmail || 'Email not available'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="email-reminders-quick"
                checked={Boolean((application as any)?.emailRemindersEnabled)}
                onCheckedChange={(enabled) =>
                  updateReminderSettings({
                    emailRemindersEnabled: Boolean(enabled),
                    ...(enabled ? { emailRemindersEnabledAt: new Date().toISOString() } : {}),
                  })
                }
                disabled={isUpdatingReminderControls}
              />
            </div>
          </div>

          <div className="p-2 bg-slate-50 border border-slate-200 rounded">
            <p className="text-xs font-medium text-slate-800 mb-1">Currently required missing documents (email content):</p>
            {currentReminderMissingItems.length > 0 ? (
              <ul className="text-xs text-slate-700 space-y-1">
                {currentReminderMissingItems.map((doc) => (
                  <li key={doc} className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                    {doc}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-green-700">All required documents are currently complete.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-reminder-frequency-quick">Email reminder frequency</Label>
            <Select
              value={Boolean((application as any)?.emailRemindersEnabled) ? String(documentReminderFrequencyDays) : 'none'}
              onValueChange={(v) => {
                if (v === 'none') {
                  updateReminderSettings({ emailRemindersEnabled: false });
                  return;
                }
                const nextAtMs = documentReminderNextAtMs || (Date.now() + Number(v) * DAY_MS);
                updateReminderSettings({
                  emailRemindersEnabled: true,
                  emailRemindersEnabledAt: new Date().toISOString(),
                  documentReminderFrequencyDays: Number(v),
                  documentReminderNextAtMs: nextAtMs,
                });
              }}
              disabled={isUpdatingReminderControls}
            >
              <SelectTrigger id="email-reminder-frequency-quick" className="w-full">
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {reminderFrequencyOptions.map((d) => (
                  <SelectItem key={`quick-doc-freq-${d}`} value={String(d)}>
                    Once a week
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-reminder-next-date-quick">Next email reminder date</Label>
            <Input
              id="email-reminder-next-date-quick"
              type="date"
              value={toDateInputValue(documentReminderNextAtMs)}
              onChange={(event) => {
                const nextAtMs = fromDateInputToMs(event.target.value);
                updateReminderSettings({ documentReminderNextAtMs: nextAtMs });
              }}
              disabled={isUpdatingReminderControls}
            />
          </div>

          <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
            <Label htmlFor="staff-test-reminder-email" className="text-sm font-medium">
              Staff test reminder email
            </Label>
            <Input
              id="staff-test-reminder-email"
              type="email"
              value={staffTestReminderEmail}
              readOnly
              disabled
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Button
                variant="secondary"
                onClick={loadTestMissingDocsPreview}
                disabled={isLoadingReminderPreview || !staffTestReminderEmail}
              >
                {isLoadingReminderPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Test
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={sendTestMissingDocsReminder}
                disabled={isSendingTestReminder || !staffTestReminderEmail}
              >
                {isSendingTestReminder ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Test'
                )}
              </Button>
            </div>
          </div>

          {reminderPreview && (
            <div className="rounded border bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Reminder email preview (what applicant sees)</div>
              <div className="text-xs text-muted-foreground">To: {reminderPreview.recipientEmail}</div>
              <div className="text-xs text-muted-foreground">Subject: {reminderPreview.subject}</div>
              <div className="text-xs">
                Hi {reminderPreview.referrerName}, this is a reminder that the application for {reminderPreview.memberName} is still missing:
              </div>
              {reminderPreview.missingItems.length > 0 ? (
                <ul className="text-xs space-y-1">
                  {reminderPreview.missingItems.map((item) => (
                    <li key={item} className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">No missing items.</div>
              )}
            </div>
          )}

          <div ref={statusReminderSectionRef} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div className="flex items-center space-x-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="status-reminders-quick" className="text-sm font-medium">
                  Status update reminders
                </Label>
                <p className="text-xs text-muted-foreground">Send application status updates to user</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {isUpdatingReminderControls && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="status-reminders-quick"
                checked={Boolean((application as any)?.statusRemindersEnabled)}
                onCheckedChange={(enabled) => updateReminderSettings({ statusRemindersEnabled: Boolean(enabled) })}
                disabled={isUpdatingReminderControls}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-reminder-frequency-quick">Status reminder frequency</Label>
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
              <SelectTrigger id="status-reminder-frequency-quick" className="w-full">
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {reminderFrequencyOptions.map((d) => (
                  <SelectItem key={`quick-status-freq-${d}`} value={String(d)}>
                    Once a week
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isKaiserPlan ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={isAlfaVisitCompleteStatusSelected}
                  onCheckedChange={(checked) => {
                    if (Boolean(checked)) {
                      void handleFamilyStatusProgressChange(alfaVisitCompleteStatusLabel);
                      return;
                    }
                    if (isAlfaVisitCompleteStatusSelected) {
                      void handleFamilyStatusProgressChange('none');
                    }
                  }}
                  disabled={isUpdatingReminderControls}
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium">ALFA visit complete with signoffs and sent to ILS</span>
                  <p className="text-xs text-muted-foreground">
                    Marks this status update and syncs the Application progress value below.
                  </p>
                </div>
              </label>
            </div>
          ) : null}
          <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
            <Label htmlFor="staff-test-status-reminder-email" className="text-sm font-medium">
              Staff test status email
            </Label>
            <Input
              id="staff-test-status-reminder-email"
              type="email"
              value={staffTestReminderEmail}
              readOnly
              disabled
            />
            <div className="text-xs text-muted-foreground">
              Uses current <span className="font-medium">Application progress</span> value below.
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Button
                variant="secondary"
                onClick={loadTestStatusReminderPreview}
                disabled={isLoadingStatusReminderPreview || !staffTestReminderEmail}
              >
                {isLoadingStatusReminderPreview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Test
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={sendTestStatusReminder}
                disabled={isSendingStatusTestReminder || !staffTestReminderEmail}
              >
                {isSendingStatusTestReminder ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Test'
                )}
              </Button>
            </div>
          </div>
          {statusReminderPreview && (
            <div className="rounded border bg-white p-3 space-y-2">
              <div className="text-xs font-semibold">Status reminder preview (what applicant sees)</div>
              <div className="text-xs text-muted-foreground">To: {statusReminderPreview.recipientEmail}</div>
              <div className="text-xs text-muted-foreground">Subject: {statusReminderPreview.subject}</div>
              <div className="text-xs">
                Hi {statusReminderPreview.referrerName}, {statusReminderPreview.message}
              </div>
              {statusReminderPreview.deniedReason ? (
                <div className="text-xs text-muted-foreground">
                  Denied reason: {statusReminderPreview.deniedReason}
                </div>
              ) : null}
            </div>
          )}

          {(isKaiserPlan || isHealthNetPlan) && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <Label htmlFor="family-status-progress" className="text-sm font-medium">
                Application progress (status reminders to families)
              </Label>
              <Select
                value={familyStatusProgressValue || 'none'}
                onValueChange={(value) => {
                  void handleFamilyStatusProgressChange(value);
                }}
                disabled={isUpdatingReminderControls}
              >
                <SelectTrigger id="family-status-progress">
                  <SelectValue placeholder="Select progress status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {familyProgressOptions.map((option) => (
                    <SelectItem key={`family-progress-${option}`} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {familyProgressNeedsDeniedReason && (
                <div className="space-y-2">
                  <Label htmlFor="family-status-denied-reason" className="text-sm font-medium">
                    Authorization denied reason
                  </Label>
                  <Textarea
                    id="family-status-denied-reason"
                    rows={3}
                    placeholder="Enter denial reason for family status updates..."
                    value={familyStatusDeniedReason}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setApplication((prev) =>
                        prev ? ({ ...(prev as any), familyStatusDeniedReason: nextValue } as any) : prev
                      );
                    }}
                    onBlur={(event) => {
                      void handleFamilyDeniedReasonBlur(event.target.value);
                    }}
                    disabled={isUpdatingReminderControls}
                  />
                </div>
              )}
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  void handleManualFamilyStatusSend();
                }}
                disabled={
                  isSendingFamilyStatusNow ||
                  !familyStatusProgressValue ||
                  (familyProgressNeedsDeniedReason && !String(familyStatusDeniedReason || '').trim())
                }
              >
                {isSendingFamilyStatusNow ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending status...
                  </>
                ) : (
                  'Send status update now'
                )}
              </Button>

              {familyStatusHistory.length > 0 && (
                <div className="space-y-1 rounded border p-2 bg-white">
                  <div className="text-xs font-medium text-muted-foreground">Recent status emails</div>
                  {familyStatusHistory.slice(0, 5).map((entry: any, idx: number) => {
                    const when = (() => {
                      try {
                        const d = new Date(entry?.sentAtMs || entry?.sentAtIso || '');
                        return Number.isNaN(d.getTime()) ? '' : format(d, 'MMM d, h:mm a');
                      } catch {
                        return '';
                      }
                    })();
                    return (
                      <div key={`family-status-history-${idx}`} className="text-xs text-muted-foreground">
                        {when ? `${when} - ` : ''}{String(entry?.status || 'Status update')}
                        {String(entry?.reason || '').trim() ? ` (Reason: ${String(entry.reason).trim()})` : ''}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
