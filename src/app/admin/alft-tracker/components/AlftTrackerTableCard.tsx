'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  computeStage,
  toLabel,
  assignmentWorkflowSignals,
  workflowChecklistFor,
  trackerCurrentStatusLabel,
  toMs,
  fmtTimeline,
  DEFAULT_PRE_REVIEW_MANAGER_NAME,
  DEFAULT_SEND_OWNER_NAME,
  stageBlockClass,
  type StandaloneUpload,
  type AlftAssignmentQueueRow,
} from './alft-tracker-helpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { type Dispatch, type SetStateAction } from 'react';

export interface AlftTrackerTableCardProps {
  isEditRoute: boolean;
  managerActionsOnly: boolean;
  filtered: StandaloneUpload[];
  rnActionsOnly: boolean;
  actionsQueueOnly: boolean;
  focusId: string;
  findAssignmentForUpload: (row: StandaloneUpload) => AlftAssignmentQueueRow | null;
  startingWorkflowFor: string;
  expandedMemberId: string;
  actionsQueueQuery: "" | "&managerActions=1" | "&rnActions=1";
  setExpandedMemberId: Dispatch<SetStateAction<string>>;
  canEditAlftRow: (row: StandaloneUpload) => boolean;
  removingFromTrackerId: string;
  removeMemberFromTracker: (row: StandaloneUpload) => Promise<void>;
}

export function AlftTrackerTableCard({
  isEditRoute,
  managerActionsOnly,
  filtered,
  rnActionsOnly,
  actionsQueueOnly,
  focusId,
  findAssignmentForUpload,
  startingWorkflowFor,
  expandedMemberId,
  actionsQueueQuery,
  setExpandedMemberId,
  canEditAlftRow,
  removingFromTrackerId,
  removeMemberFromTracker,
}: AlftTrackerTableCardProps) {
  return (
    <>
      {!isEditRoute && !managerActionsOnly ? (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ALFT Tracker</CardTitle>
          <CardDescription>
            Step 4 begins here after Queue push: open each member workflow, then use Open details for progress and status checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="space-y-3 py-4">
              <div className="text-sm text-muted-foreground">
                {managerActionsOnly
                  ? 'No members currently ready for admin review.'
                  : rnActionsOnly
                    ? 'No members currently ready for RN review.'
                    : 'No ALFT members found for the current filters.'}
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{actionsQueueOnly ? 'Member ready for review' : 'Member'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const focused = focusId && r.id === focusId;
                    const stage = computeStage(r);
                    const assignmentForRow = findAssignmentForUpload(r);
                    const socialWorkerName = toLabel(assignmentForRow?.assignedSwName) || 'Not assigned';
                    const assignmentWorkflowKey = String(assignmentForRow?.memberId || assignmentForRow?.id || '').trim();
                    const assignmentSignals = assignmentForRow ? assignmentWorkflowSignals(assignmentForRow) : null;
                    const workflowAlreadyStarted = Boolean(
                      assignmentSignals && (assignmentSignals.swInviteSent || assignmentSignals.swSubmitted || assignmentSignals.rnStep || assignmentSignals.finalManager || assignmentSignals.complete)
                    );
                    const isStartingWorkflow = Boolean(assignmentWorkflowKey) && startingWorkflowFor === assignmentWorkflowKey;
                    const checklist = workflowChecklistFor(r);
                    const explicitCurrentChecklistIdx = checklist.findIndex((step: any) => Boolean((step as any)?.current));
                    const currentChecklistIdx =
                      explicitCurrentChecklistIdx >= 0 ? explicitCurrentChecklistIdx : checklist.findIndex((step) => !step.done);
                    const statusLabel = trackerCurrentStatusLabel(r, stage);
                    const currentStep =
                      checklist[(currentChecklistIdx >= 0 ? currentChecklistIdx : Math.max(checklist.length - 1, 0))];
                    const workflowHasStarted = checklist.some((step) => Boolean(step.done || step.current));
                    const currentStepLabel = workflowHasStarted ? (currentStep?.label || 'Begin workflow') : 'Begin workflow';
                    const currentStepAtLabel = workflowHasStarted ? (currentStep?.atLabel || '') : '';
                    const workflowStatus = String((r as any)?.workflowStatus || '').toLowerCase();
                    const managerActionRequired = workflowStatus.includes('awaiting_kaiser_manager_final_review');
                    const isExpanded = expandedMemberId === r.id;
                    const trackerUpdatedAtMs = Math.max(toMs((r as any)?.updatedAt), toMs((r as any)?.createdAt));
                    const trackerUpdatedAtLabel = trackerUpdatedAtMs ? fmtTimeline(trackerUpdatedAtMs) : '';
                    const finalReviewerName =
                      toLabel((r as any)?.workflowRouting?.finalReviewOwnerName) || DEFAULT_PRE_REVIEW_MANAGER_NAME;
                    const sendOwnerName =
                      toLabel((r as any)?.workflowRouting?.nextRecipientName) || DEFAULT_SEND_OWNER_NAME;

                    return [
                      <TableRow key={`row-${r.id}`} className={cn(focused ? 'bg-amber-50/30' : '')}>
                        <TableCell colSpan={3}>
                          <div className="font-semibold truncate">{r.memberName || '—'}</div>
                          <div className="text-sm text-muted-foreground break-words">
                            Social worker: {socialWorkerName}
                          </div>
                          <div className="text-sm text-muted-foreground break-words">
                            MRN: {r.medicalRecordNumber || '—'} • {r.healthPlan || '—'}
                          </div>
                          <div className="text-sm text-muted-foreground break-words">
                            Uploaded {r.alftUploadDate || (toMs(r.createdAt) ? new Date(toMs(r.createdAt)).toLocaleDateString() : '—')}
                            {r.uploaderName ? ` • By: ${r.uploaderName}` : ''}
                          </div>
                          {trackerUpdatedAtLabel ? (
                            <div className="text-sm text-muted-foreground break-words">
                              Tracker updated: {trackerUpdatedAtLabel}
                            </div>
                          ) : null}
                          <div className="mt-1 text-sm">
                            Current step: <span className="font-medium">{currentStepLabel}</span>
                            <span className="text-muted-foreground"> • {currentStepAtLabel || 'No timestamp yet'}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Checklist progress: {checklist.filter((step) => step.done).length}/{checklist.length} complete
                          </div>
                          <div className="mt-2 space-y-2 text-sm">
                            <div className={cn('rounded-md border px-2 py-1.5', stageBlockClass(stage))}>
                              <span className="font-medium">Status:</span> {statusLabel}
                            </div>
                            {managerActionRequired ? (
                              <div className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 py-1.5 text-fuchsia-800 font-medium">
                                Manager action required
                              </div>
                            ) : null}
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-blue-900">
                              <span className="font-medium">Assigned social worker:</span> {socialWorkerName}
                            </div>
                            <div className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900">
                              <span className="font-medium">ALFT Reviewer:</span> {finalReviewerName}
                            </div>
                            <div className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5 text-purple-900">
                              <span className="font-medium">ALFTA Manager:</span> {sendOwnerName}
                            </div>
                            {String((r as any)?.alftSwTierRecommendation?.tier || '').trim() ? (
                              <div className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-sky-950 font-medium">
                                Social worker estimated tier: Tier{' '}
                                {String((r as any)?.alftSwTierRecommendation?.tier || '').trim()}
                                {String((r as any)?.alftSwTierRecommendation?.levelLabel || '').trim()
                                  ? ` — ${String((r as any)?.alftSwTierRecommendation?.levelLabel || '').trim()}`
                                  : ''}
                              </div>
                            ) : null}
                            {String((r as any)?.alftRnTierRecommendation?.tier || '').trim() ? (
                              <div className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1.5 text-violet-950 font-medium">
                                RN agree / suggest: Tier{' '}
                                {String((r as any)?.alftRnTierRecommendation?.tier || '').trim()}
                                {String((r as any)?.alftRnTierRecommendation?.adminReviewedAtIso || '').trim()
                                  ? ' · admin reviewed'
                                  : ' · awaiting admin final review'}
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              variant={!workflowAlreadyStarted ? 'default' : 'outline'}
                              className={!workflowAlreadyStarted ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                              disabled={!r?.id || isStartingWorkflow}
                              onClick={() => {
                                if (!r?.id) return;
                                window.location.assign(
                                  `/admin/alft-tracker?edit=${encodeURIComponent(String(r.id || ''))}${actionsQueueQuery}`
                                );
                              }}
                              title={workflowAlreadyStarted ? 'Open workflow page for this member' : 'Step 4: open workflow page for this member'}
                            >
                              {workflowAlreadyStarted ? 'Open Workflow Page' : 'Step 4: Start Workflow'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => setExpandedMemberId((prev) => (prev === r.id ? '' : r.id))}
                            >
                              {isExpanded ? 'Hide details' : 'Open details'}
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              disabled={!canEditAlftRow(r)}
                              title={!canEditAlftRow(r) ? 'No edit permission for this intake' : 'View member ALFT'}
                            >
                              <Link
                                href={`/admin/alft-tracker?edit=${encodeURIComponent(String(r.id || ''))}${actionsQueueQuery}`}
                              >
                                View
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              disabled={removingFromTrackerId === String(r.id || '')}
                              onClick={() => void removeMemberFromTracker(r)}
                              title="Remove member from ALFT Tracker active list"
                            >
                              {removingFromTrackerId === String(r.id || '') ? 'Removing…' : 'Remove'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>,
                      isExpanded ? (
                        <TableRow key={`details-${r.id}`} className={cn(focused ? 'bg-amber-50/20' : '')}>
                          <TableCell colSpan={3} className="p-3">
                            <div className="grid grid-cols-1 gap-3 rounded-md border bg-white p-3">
                              <div className="space-y-2.5">
                                <div className="text-sm font-semibold">Workflow progress</div>
                                <div className="rounded border bg-muted/20 p-3 text-sm space-y-1.5">
                                  {checklist.map((step, idx) => {
                                    const isCurrent =
                                      explicitCurrentChecklistIdx >= 0 ? idx === explicitCurrentChecklistIdx : idx === currentChecklistIdx && !step.done;
                                    return (
                                      <div key={step.id} className="flex items-start gap-2">
                                        {step.done ? (
                                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                                        ) : (
                                          <span className="mt-0.5 h-4 w-4 shrink-0" />
                                        )}
                                        <div className={step.done ? 'text-foreground' : isCurrent ? 'text-amber-700' : 'text-muted-foreground'}>
                                          <div>{step.label}</div>
                                          {step.atLabel ? <div className="text-xs text-muted-foreground">{step.atLabel}</div> : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="text-sm text-muted-foreground">RN: {r.alftRnName || '—'}</div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      ) : null}
    </>
  );
}
