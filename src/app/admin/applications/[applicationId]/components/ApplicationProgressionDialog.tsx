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
import { Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import { type Application, type StaffTracker } from '@/lib/definitions';
import { type WithId } from '@/firebase/firestore/use-collection';

export interface ApplicationProgressionDialogProps {
  application: Application;
  healthNetCurrentStatus: string;
  isKaiserPlan: boolean;
  isHealthNetPlan: boolean;
  effectiveNextStep: string;
  staffTracker: WithId<StaffTracker> | null;
}

export function ApplicationProgressionDialog({
  application,
  healthNetCurrentStatus,
  isKaiserPlan,
  isHealthNetPlan,
  effectiveNextStep,
  staffTracker,
}: ApplicationProgressionDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="qa-trigger">
          <Target className="h-4 w-4" />
          <span className="qa-label">Application progression</span>
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {String((application as any)?.assignedStaffName || '').trim() || 'Unassigned'}
            </Badge>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Application progression</DialogTitle>
          <DialogDescription>
            View Caspio workflow status and tracking fields. Updates should be made in the tracker pages (Caspio-backed), not here.
            <span className="mt-2 block text-xs text-muted-foreground">
              Assigned staff:{' '}
              <span className="font-medium text-foreground">
                {String((application as any)?.assignedStaffName || '').trim() || 'Unassigned'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Workflow status</label>
              <span className="text-xs text-muted-foreground">{application.healthPlan} workflow</span>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              {Boolean((application as any)?.caspioSent) ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Current status</div>
                      <div className="text-sm font-medium">
                        {String(
                          (application as any)?.healthPlan?.toLowerCase?.().includes('kaiser')
                            ? ((application as any)?.kaiserStatus || '')
                            : (application as any)?.healthPlan?.toLowerCase?.().includes('health net')
                              ? (healthNetCurrentStatus || '')
                              : ''
                        ).trim() || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(application as any)?.healthPlan?.toLowerCase?.().includes('kaiser') ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href="/admin/kaiser-tracker">Open Kaiser Tracker</Link>
                        </Button>
                      ) : (application as any)?.healthPlan?.toLowerCase?.().includes('health net') ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href="/admin/progress-tracker">Open Progress Tracker</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    This page is read-only for workflow status and next-step tracking. Edits are handled in the tracker pages after the application is in Caspio.
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Not yet sent to Caspio. Workflow status / next step tracking will appear after the application is pushed to Caspio.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="text-sm font-medium">Next step tracking (Caspio)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Suggested next step</div>
                <div className="text-sm font-medium">
                  {String((isKaiserPlan || isHealthNetPlan) ? (effectiveNextStep || '') : '').trim() || '—'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Next step due date</div>
                <div className="text-sm font-medium">
                  {(() => {
                    const raw: any =
                      (application as any)?.Next_Step_Due_Date ||
                      (application as any)?.nextStepDueDate ||
                      (application as any)?.Kaiser_Next_Step_Date ||
                      (application as any)?.kaiserNextStepDate ||
                      (application as any)?.nextStepDate ||
                      (staffTracker as any)?.nextStepDate ||
                      null;
                    try {
                      const d: Date | null = raw?.toDate?.() || (raw ? new Date(raw) : null);
                      const ms = d?.getTime?.();
                      if (!ms || Number.isNaN(ms)) return '—';
                      return format(d as Date, 'MMM d, yyyy');
                    } catch {
                      return '—';
                    }
                  })()}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              To change workflow, next step, next step date, or assigned staff, use the tracker pages (Caspio-backed).
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
