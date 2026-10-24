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
import { User, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { QaDoneMeta } from './shared';
import {
  getStaffAssignmentSentAtMs,
  getStaffAssignmentLogEntries,
} from './application-detail-helpers';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { StaffAssignmentDropdown } from './StaffAssignmentDropdown';
import { type MemberActionLogEntry } from '@/lib/member-action-log';
import {
  isNeedFirstContactKaiserStatus,
  buildFirstContactAckResetFields,
  shouldTrackFirstContactAck,
  isUserAssignedStaffForApp,
} from '@/lib/first-contact-ack';
import { Checkbox } from '@/components/ui/checkbox';
import { type Application, type StaffTracker } from '@/lib/definitions';
import { type Dispatch, type SetStateAction } from 'react';

export interface AssignedStaffQuickActionProps {
  assignedStaffName: string;
  application: Application;
  setApplication: Dispatch<SetStateAction<Application | null>>;
  updateStaffTracker: (patch: Partial<StaffTracker>) => Promise<void>;
  isUpdatingFirstContactAck: boolean;
  currentUserId: string;
  updateFirstContactAck: (patch: { firstContactAcknowledged?: boolean | undefined; }) => Promise<void>;
}

export function AssignedStaffQuickAction({
  assignedStaffName,
  application,
  setApplication,
  updateStaffTracker,
  isUpdatingFirstContactAck,
  currentUserId,
  updateFirstContactAck,
}: AssignedStaffQuickActionProps) {
  return (
    <div className="order-[2] space-y-2">
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="qa-trigger">
          <User className="h-4 w-4" />
          <span className="qa-label min-w-0 truncate">
            {assignedStaffName ? `2. Assigned: ${assignedStaffName}` : '2. Assign staff'}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            <Badge variant={assignedStaffName ? 'default' : 'outline'} className="text-[10px]">
              {assignedStaffName ? 'Assigned' : 'Unassigned'}
            </Badge>
            <QaDoneMeta
              done={Boolean(assignedStaffName)}
              atMs={getStaffAssignmentSentAtMs(application as any) || undefined}
              titlePrefix="Sent to staff"
            />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Assigned staff</DialogTitle>
          <DialogDescription>Assign primary staff for this application.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {(() => {
            const sentAtMs = getStaffAssignmentSentAtMs(application as any);
            const logEntries = getStaffAssignmentLogEntries(application as any);
            const lastSentLabel = sentAtMs
              ? (() => {
                  try {
                    return format(new Date(sentAtMs), 'MMM d, yyyy h:mm a');
                  } catch {
                    return '';
                  }
                })()
              : '';
            if (!assignedStaffName && !logEntries.length) return null;
            return (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 space-y-2">
                <div className="font-medium">
                  {lastSentLabel
                    ? `Sent to staff ${lastSentLabel}`
                    : assignedStaffName
                      ? `Assigned: ${assignedStaffName}`
                      : 'Assignment log'}
                </div>
                {logEntries.length > 0 ? (
                  <ul className="space-y-1.5">
                    {logEntries.slice(0, 6).map((entry) => {
                      let when = '';
                      try {
                        when = format(new Date(entry.atIso), 'MMM d, yyyy h:mm a');
                      } catch {
                        when = entry.atIso;
                      }
                      return (
                        <li key={entry.id} className="border-t border-emerald-200/70 pt-1.5 first:border-0 first:pt-0">
                          <div className="font-medium text-emerald-900">{entry.label}</div>
                          <div className="text-[11px] text-emerald-800/90">
                            {when}
                            {entry.byName ? ` · by ${entry.byName}` : ''}
                            {entry.details ? ` · ${entry.details}` : ''}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })()}
          <div className="space-y-2">
            <Label htmlFor="main-staff-assignment" className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Assigned Staff
            </Label>
            <StaffAssignmentDropdown
              application={application}
              onStaffChange={(staffId, staffName, meta) => {
                setApplication((prev) => {
                  if (!prev) return null;
                  const existingLog = Array.isArray((prev as any)?.memberActionLog)
                    ? ([...(prev as any).memberActionLog] as MemberActionLogEntry[])
                    : [];
                  const incoming = Array.isArray(meta?.logEntries) ? meta.logEntries : [];
                  const seen = new Set(
                    existingLog.map((e) => String(e?.id || `${e?.actionKey}-${e?.atIso}`))
                  );
                  incoming.forEach((entry) => {
                    const id = String(entry?.id || `${entry?.actionKey}-${entry?.atIso}`);
                    if (!seen.has(id)) {
                      existingLog.push(entry);
                      seen.add(id);
                    }
                  });
                  const next: any = {
                    ...prev,
                    assignedStaffId: staffId,
                    assignedStaffName: staffName,
                    assignedDate: meta?.assignedDate || new Date().toISOString(),
                    memberActionLog: existingLog,
                  };
                  if (meta?.staffAssignmentNotifiedAt) {
                    next.staffAssignmentNotifiedAt = meta.staffAssignmentNotifiedAt;
                  }
                  if (
                    isNeedFirstContactKaiserStatus(
                      (prev as any)?.kaiserStatus || (prev as any)?.Kaiser_Status
                    )
                  ) {
                    Object.assign(next, buildFirstContactAckResetFields());
                  }
                  return next;
                });
                updateStaffTracker({ assignedStaffId: staffId, assignedStaffName: staffName } as any);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            After assignment, the assigned staff opens this record and checks{' '}
            <span className="font-medium">Staff acknowledges assignment</span> under Assigned staff.
            That stops daily first-contact reminder emails for this member.
          </p>
        </div>
      </DialogContent>
    </Dialog>
    {shouldTrackFirstContactAck(application as any) ? (
      <div className="rounded-md border border-violet-200 bg-violet-50/70 p-2.5 space-y-1.5">
        <label className="flex items-start gap-2 text-xs text-violet-950">
          <Checkbox
            className="mt-0.5"
            checked={Boolean((application as any)?.firstContactAcknowledged)}
            disabled={
              isUpdatingFirstContactAck ||
              !isUserAssignedStaffForApp(application as any, currentUserId)
            }
            onCheckedChange={(checked) =>
              void updateFirstContactAck({ firstContactAcknowledged: Boolean(checked) })
            }
          />
          <span>
            <span className="font-medium">Staff acknowledges assignment</span>
            <span className="block text-[11px] text-violet-800/90 mt-0.5">
              Assigned staff checks this after opening the record. Until checked, daily reminders
              list this Need First Contact member.
            </span>
            {!isUserAssignedStaffForApp(application as any, currentUserId) ? (
              <span className="block text-[11px] text-violet-700 mt-1">
                Only {assignedStaffName || 'the assigned staff member'} can check this box.
              </span>
            ) : null}
            {(application as any)?.firstContactAcknowledgedBy ? (
              <span className="block text-[11px] text-violet-700 mt-1">
                Acknowledged by {String((application as any).firstContactAcknowledgedBy)}
                {(application as any)?.firstContactAcknowledgedAt
                  ? ` · ${format(
                      new Date(String((application as any).firstContactAcknowledgedAt)),
                      'MMM d, yyyy h:mm a'
                    )}`
                  : ''}
              </span>
            ) : null}
          </span>
        </label>
        {isUpdatingFirstContactAck ? (
          <div className="flex items-center gap-2 text-[11px] text-violet-800 pl-6">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving…
          </div>
        ) : null}
      </div>
    ) : null}
    </div>
  );
}
