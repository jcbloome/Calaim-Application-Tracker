'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';
import { type Dispatch, type SetStateAction } from 'react';
import { type StandaloneUpload } from './alft-tracker-helpers';

export interface RejectDialogProps {
  rejectDialogOpen: boolean;
  setRejectDialogOpen: Dispatch<SetStateAction<boolean>>;
  rejectRow: StandaloneUpload | null;
  rejectSwName: string;
  rejectSwEmail: string;
  rejectTarget: "rn" | "sw" | "staff";
  setRejectTarget: Dispatch<SetStateAction<"rn" | "sw" | "staff">>;
  rejectReason: string;
  setRejectReason: Dispatch<SetStateAction<string>>;
  rejectingId: string;
  returnForEdits: () => Promise<void>;
}

export function RejectDialog({
  rejectDialogOpen,
  setRejectDialogOpen,
  rejectRow,
  rejectSwName,
  rejectSwEmail,
  rejectTarget,
  setRejectTarget,
  rejectReason,
  setRejectReason,
  rejectingId,
  returnForEdits,
}: RejectDialogProps) {
  return (
    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Reject → Return for edits</DialogTitle>
          <DialogDescription>
            Choose who should revise this packet: social worker (MSW), admin/staff, or RN. It stays open (not completed)
            so they can edit and continue the workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium">{rejectRow?.memberName || '—'}</div>
            <div className="text-sm text-muted-foreground font-mono">{rejectRow?.medicalRecordNumber || '—'}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Social worker: {rejectSwName} {rejectSwEmail ? `(${rejectSwEmail})` : ''}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Return to</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={rejectTarget === 'sw' ? 'default' : 'outline'}
                onClick={() => setRejectTarget('sw')}
              >
                Social worker
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rejectTarget === 'staff' ? 'default' : 'outline'}
                onClick={() => setRejectTarget('staff')}
              >
                Admin / staff
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rejectTarget === 'rn' ? 'default' : 'outline'}
                onClick={() => setRejectTarget('rn')}
              >
                RN
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="alft-reject-reason">Revision comments (required)</Label>
            <textarea
              id="alft-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={
                rejectTarget === 'sw'
                  ? 'Describe what the SW must change before resubmitting.'
                  : rejectTarget === 'staff'
                    ? 'Describe what admin/staff must change.'
                    : 'Describe what the RN must change before re-signing.'
              }
            />
          </div>
          {rejectTarget === 'sw' ? (
            <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
              <div className="font-medium">Email preview</div>
              <div>
                <span className="text-muted-foreground">To:</span> {rejectSwName} &lt;{rejectSwEmail}&gt;
              </div>
              <div>
                <span className="text-muted-foreground">Subject:</span> ALFT returned for edits —{' '}
                {rejectRow?.memberName || 'Member'}
              </div>
              <div className="rounded border bg-white p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                {`Hello ${rejectSwName} —

Admin reviewed ${rejectRow?.memberName || 'this member'}'s ISP / ALFT and needs further edits before RN review.

Comments:
${String(rejectReason || '').trim() || '(add revision comments above)'}

Please log into the SW portal, update the form, sign again, and resubmit.`}
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-amber-50/80 border-amber-200 p-3 text-sm text-amber-950">
              {rejectTarget === 'staff'
                ? 'Admin/staff will see this in the ready queue as Needs revision and can edit/save without it being marked completed.'
                : 'RN signature is cleared so they can edit and re-sign. Packet stays open until final send.'}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={Boolean(rejectingId)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void returnForEdits()}
            disabled={Boolean(rejectingId) || !String(rejectReason).trim()}
          >
            {rejectingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {rejectTarget === 'sw'
              ? 'Send email & return to SW'
              : rejectTarget === 'staff'
                ? 'Return to admin/staff'
                : 'Return to RN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
