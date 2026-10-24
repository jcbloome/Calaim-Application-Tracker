'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { stepChipClass, type AlftAssignmentQueueRow } from './alft-tracker-helpers';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { type Dispatch, type SetStateAction } from 'react';

export interface PreSubmissionWorkflowQueueProps {
  managerActionsOnly: boolean;
  isRnReviewUi: boolean;
  editAssignmentRow: AlftAssignmentQueueRow | null;
  canRunManagerWorkflow: boolean;
  editAssignmentDoneCount: number;
  editAssignmentSteps: { step: number; chip: string; label: string; done: boolean; current: boolean; }[];
  editAssignmentStage: { label: string; color: string; } | null;
  editWorkflowSummary: "Next: Workflow complete. Send/confirm completed ALFT PDF to Jocelyn." | "Next: SW updates required sections, signs again, and routes back to John for re-check." | "Next: RN reviews, edits if needed, and signs." | "Next: Kaiser manager final review, then send completed packet." | "Next: John first review (approve or reject with needed changes)." | "Next: SW logs in, completes prefilled ALFT, and signs." | "Next: Run Step 1 -> Step 4 in order to start workflow invite.";
  step1VerificationHref: string;
  editVerificationDone: boolean;
  setVerificationForMember: (row: AlftAssignmentQueueRow, checked: boolean) => Promise<void>;
  verifyingMemberId: string;
  editVerificationBy: string;
  editVerificationAtLabel: string;
  setSwEmailPreviewRow: Dispatch<SetStateAction<AlftAssignmentQueueRow | null>>;
  setSwEmailPreviewUseTestOverride: Dispatch<SetStateAction<boolean>>;
  setSwEmailPreviewTestEmail: Dispatch<SetStateAction<string>>;
  setSwEmailPreviewEditableBody: Dispatch<SetStateAction<string>>;
  swEmailPreview: { to: string; subject: string; canSend: boolean; alreadySent: boolean; sentAtLabel: string; missingIspFields: string[]; logoPath: string; ispContactName: string; ispContactRelationship: string; ispAddress: string; ispFacilityName: string; ispFacilityType: string; ispPhone: string; ispEmail: string; body: string; } | null;
  setSwEmailPreviewOpen: Dispatch<SetStateAction<boolean>>;
  editAssignmentSignals: { status: string; workflowStatus: string; swInviteSent: boolean; swSubmitted: boolean; returnedToSw: boolean; rnStep: boolean; finalManager: boolean; readyToSend: boolean; complete: boolean; } | null;
  editSwEmailDeliveryLog: { status: string; recipientEmail: string; atMs: number; atLabel: string; triggeredBy: string; isResend: boolean; error: string; }[];
  swSupportUploadLabel: string;
  setSwSupportUploadLabel: Dispatch<SetStateAction<string>>;
  setSwSupportUploadFiles: Dispatch<SetStateAction<File[]>>;
  swSupportUploadFiles: File[];
  swSupportUploading: boolean;
  uploadSwPortalSupportFile: (row: AlftAssignmentQueueRow) => Promise<void>;
  swSupportUploadProgress: number;
  editSwPortalSupportFiles: { id: string; label: string; fileName: string; downloadURL: string; uploadedAtMs: number; uploadedAtLabel: string; }[];
}

export function PreSubmissionWorkflowQueue({
  managerActionsOnly,
  isRnReviewUi,
  editAssignmentRow,
  canRunManagerWorkflow,
  editAssignmentDoneCount,
  editAssignmentSteps,
  editAssignmentStage,
  editWorkflowSummary,
  step1VerificationHref,
  editVerificationDone,
  setVerificationForMember,
  verifyingMemberId,
  editVerificationBy,
  editVerificationAtLabel,
  setSwEmailPreviewRow,
  setSwEmailPreviewUseTestOverride,
  setSwEmailPreviewTestEmail,
  setSwEmailPreviewEditableBody,
  swEmailPreview,
  setSwEmailPreviewOpen,
  editAssignmentSignals,
  editSwEmailDeliveryLog,
  swSupportUploadLabel,
  setSwSupportUploadLabel,
  setSwSupportUploadFiles,
  swSupportUploadFiles,
  swSupportUploading,
  uploadSwPortalSupportFile,
  swSupportUploadProgress,
  editSwPortalSupportFiles,
}: PreSubmissionWorkflowQueueProps) {
  return (
    <>
      {!managerActionsOnly && !isRnReviewUi && editAssignmentRow && canRunManagerWorkflow ? (
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-base font-semibold">Pre-submission ALFT workflow queue</div>
            <div className="text-sm text-muted-foreground">
              Progress: {editAssignmentDoneCount}/{editAssignmentSteps.length} steps completed
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Current status:{' '}
            <span className="font-medium text-foreground">{editAssignmentStage?.label || 'Not started'}</span>
          </div>
          <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">{editWorkflowSummary}</div>
          <div className="flex flex-wrap gap-1.5">
            {editAssignmentSteps.map((step) => (
              <Badge key={`edit-assign-chip-${step.step}`} variant="outline" className={cn('text-xs px-2 py-1', stepChipClass(step))}>
                {step.done ? `✓ ${step.chip}` : `${step.step}. ${step.chip}`}
              </Badge>
            ))}
          </div>
          <div className="rounded border p-3 text-sm space-y-2.5">
            <div className="font-semibold">Ordered steps (click to run)</div>
            <Button variant="outline" className="w-full justify-start text-sm" asChild>
              <Link href={step1VerificationHref}>1) Open verification tool (manual sync + prefill review)</Link>
            </Button>
            <label className="flex items-start gap-2 rounded border p-2">
              <Checkbox
                checked={editVerificationDone}
                onCheckedChange={(checked) => void setVerificationForMember(editAssignmentRow, Boolean(checked))}
                disabled={verifyingMemberId === String(editAssignmentRow.memberId || editAssignmentRow.id || '')}
              />
              <div>
                <div>2) Verification checkbox with staff name + timestamp (required before Step 3 send/re-send)</div>
                {editVerificationDone ? (
                  <div className="text-xs text-emerald-700">
                    Verified{editVerificationBy ? ` by ${editVerificationBy}` : ''}{editVerificationAtLabel ? ` at ${editVerificationAtLabel}` : ''}
                  </div>
                ) : (
                  <div className="text-xs text-amber-700">Not verified yet</div>
                )}
              </div>
            </label>
              <Button
              variant="link"
              className="h-auto w-auto justify-start p-0 text-sm"
              disabled={!editVerificationDone}
              onClick={() => {
                setSwEmailPreviewRow(editAssignmentRow);
                setSwEmailPreviewUseTestOverride(false);
                setSwEmailPreviewTestEmail('');
                setSwEmailPreviewEditableBody(String(swEmailPreview?.body || ''));
                setSwEmailPreviewOpen(true);
              }}
            >
              3) Preview SW email + Send/Re-send with timestamp
            </Button>
            {editAssignmentSignals?.swInviteSent ? (
              <div className="text-xs text-muted-foreground">SW email already sent. Step 3 lets you preview and re-send if needed.</div>
            ) : (
              <div className="text-xs text-muted-foreground">SW email has not been sent yet. Use Step 3 to preview and send.</div>
            )}
            {editSwEmailDeliveryLog.length ? (
              <div className="rounded border bg-muted/20 px-2 py-1.5 text-xs space-y-1">
                <div className="font-medium text-foreground">SW email send log</div>
                {editSwEmailDeliveryLog.slice(0, 5).map((entry, idx) => (
                  <div key={`sw-email-log-${idx}`} className="text-muted-foreground">
                    {entry.status === 'sent' ? 'Sent' : entry.status === 'failed' ? 'Failed' : 'Missing recipient'} to{' '}
                    <span className="font-medium text-foreground">{entry.recipientEmail || 'no recipient email'}</span>
                    {entry.atLabel ? ` at ${entry.atLabel}` : ''}
                    {entry.isResend ? ' (re-send)' : ''}
                    {entry.triggeredBy ? ` by ${entry.triggeredBy}` : ''}
                    {entry.error ? ` — ${entry.error}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rounded border bg-muted/20 px-2 py-2 text-xs space-y-2">
              <div className="font-medium text-foreground">Workflow files for SW portal (602, facesheet, etc.)</div>
              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-1">
                  <Label htmlFor="sw-support-file-label" className="text-[11px]">File label (optional)</Label>
                  <Input
                    id="sw-support-file-label"
                    value={swSupportUploadLabel}
                    onChange={(e) => setSwSupportUploadLabel(e.target.value)}
                    placeholder="Example: 602 or Facesheet"
                    className="h-8 text-xs"
                  />
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setSwSupportUploadFiles(Array.from(e.target.files || []))}
                    className="text-xs"
                  />
                  {swSupportUploadFiles.length ? (
                    <div className="text-[11px] text-muted-foreground">
                      Selected {swSupportUploadFiles.length} file{swSupportUploadFiles.length > 1 ? 's' : ''}:{' '}
                      {swSupportUploadFiles.slice(0, 2).map((f) => f.name).join(', ')}
                      {swSupportUploadFiles.length > 2 ? ` +${swSupportUploadFiles.length - 2} more` : ''}
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  className="h-8"
                  disabled={!editAssignmentRow || !swSupportUploadFiles.length || swSupportUploading}
                  onClick={() => editAssignmentRow && void uploadSwPortalSupportFile(editAssignmentRow)}
                >
                  {swSupportUploading
                    ? `Uploading${swSupportUploadProgress ? ` (${swSupportUploadProgress}%)` : '...'}`
                    : 'Upload for SW portal'}
                </Button>
              </div>
              {editSwPortalSupportFiles.length ? (
                <div className="space-y-1">
                  {editSwPortalSupportFiles.slice(0, 8).map((f, idx) => (
                    <div key={f.id || `${f.fileName}-${idx}`} className="text-muted-foreground">
                      <a href={f.downloadURL} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
                        {f.label || f.fileName || 'Support file'}
                      </a>
                      {f.label && f.fileName && f.label !== f.fileName ? ` (${f.fileName})` : ''}
                      {f.uploadedAtLabel ? ` • uploaded ${f.uploadedAtLabel}` : ''}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">No workflow files uploaded for this member yet.</div>
              )}
            </div>
            <div className="text-sm">
              <span className="font-medium">4) SW Signed</span>{' '}
              <span className={editAssignmentSignals?.swSubmitted ? 'text-emerald-700' : 'text-muted-foreground'}>
                {editAssignmentSignals?.swSubmitted ? 'completed' : 'waiting for SW submission/signature'}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
