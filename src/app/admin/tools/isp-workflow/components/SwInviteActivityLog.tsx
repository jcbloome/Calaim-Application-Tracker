'use client';

import { Button } from '@/components/ui/button';
import {
  clientIdOf,
  formatWhen,
  type KaiserMember,
  type AssignmentInviteActivity,
  type StaffOption,
} from './isp-workflow-helpers';
import { RefreshCw } from 'lucide-react';
import { formatSwAssignmentHistoryLabel } from '@/lib/sw-assignment-history';

export interface SwInviteActivityLogProps {
  refreshAssignmentActivity: (memberIdRaw: string) => Promise<void>;
  selectedMember: KaiserMember;
  assignmentActivity: AssignmentInviteActivity;
  firstReviewer: StaffOption | null;
}

export function SwInviteActivityLog({
  refreshAssignmentActivity,
  selectedMember,
  assignmentActivity,
  firstReviewer,
}: SwInviteActivityLogProps) {
  return (
    <div className="rounded-md border bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">SW invite / assessment activity log</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void refreshAssignmentActivity(clientIdOf(selectedMember))}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh log
        </Button>
      </div>
      <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
        <li>
          <span className="font-medium">Invite sent:</span>{' '}
          {assignmentActivity.invitedAt
            ? `${formatWhen(assignmentActivity.invitedAt)}${
                assignmentActivity.invitedTo ? ` → ${assignmentActivity.invitedTo}` : ''
              }${
                (assignmentActivity.inviteSendCount || 0) > 1
                  ? ` · ${assignmentActivity.inviteSendCount} sends (latest ${formatWhen(
                      assignmentActivity.lastInvitedAt || assignmentActivity.invitedAt
                    )})`
                  : ''
              }`
            : 'Not sent yet'}
        </li>
        <li>
          <span className="font-medium">SW viewed portal:</span>{' '}
          {assignmentActivity.viewedAt
            ? `${formatWhen(assignmentActivity.viewedAt)}${
                assignmentActivity.viewedBy ? ` · ${assignmentActivity.viewedBy}` : ''
              }`
            : 'Not viewed yet'}
        </li>
        <li>
          <span className="font-medium">SW submitted / signed:</span>{' '}
          {assignmentActivity.signedAt || assignmentActivity.submittedAt
            ? formatWhen(assignmentActivity.signedAt || assignmentActivity.submittedAt)
            : 'Not submitted yet'}
        </li>
        <li>
          <span className="font-medium">Next after SW submit:</span> email + Action Item for{' '}
          {firstReviewer?.label || 'first review staff'} (members needing review)
        </li>
      </ul>
      {assignmentActivity.assignmentHistory &&
      assignmentActivity.assignmentHistory.length > 0 ? (
        <div className="mt-2 border-t pt-2">
          <div className="text-xs font-medium text-slate-800">
            Social worker assignment history
          </div>
          <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-600">
            {[...assignmentActivity.assignmentHistory].reverse().map((entry, idx) => (
              <li key={`${entry.atIso}-${entry.toEmail}-${idx}`}>
                {formatSwAssignmentHistoryLabel(entry)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {assignmentActivity.emailLog && assignmentActivity.emailLog.length > 0 ? (
        <div className="mt-2 border-t pt-2">
          <div className="text-xs font-medium text-slate-800">Email delivery history</div>
          <div className="mt-1 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-600">
            {[...assignmentActivity.emailLog]
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div key={`${entry.atIso}-${idx}`}>
                  {entry.status || '—'}
                  {entry.recipientEmail ? ` · ${entry.recipientEmail}` : ''}
                  {entry.atIso ? ` · ${formatWhen(entry.atIso)}` : ''}
                  {entry.isResend ? ' · re-send' : ''}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
