'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { clean, type ActiveIntake, type AnswerMap, type StaffOption } from './isp-workflow-helpers';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { type Dispatch, type SetStateAction } from 'react';
import type { useToast } from '@/hooks/use-toast';

export interface ResendReasonDialogProps {
  resendRnDialogOpen: boolean;
  setResendRnDialogOpen: Dispatch<SetStateAction<boolean>>;
  setResendRnNote: Dispatch<SetStateAction<string>>;
  setConfirmResendRnSendOpen: Dispatch<SetStateAction<boolean>>;
  rnAlreadySigned: boolean;
  activeIntake: ActiveIntake | null;
  answers: AnswerMap;
  assignedRn: StaffOption;
  resendRnNote: string;
  busyAction: string;
  toast: ReturnType<typeof useToast>['toast'];
}

export function ResendReasonDialog({
  resendRnDialogOpen,
  setResendRnDialogOpen,
  setResendRnNote,
  setConfirmResendRnSendOpen,
  rnAlreadySigned,
  activeIntake,
  answers,
  assignedRn,
  resendRnNote,
  busyAction,
  toast,
}: ResendReasonDialogProps) {
  return (
    <Dialog
      open={resendRnDialogOpen}
      onOpenChange={(open) => {
        setResendRnDialogOpen(open);
        if (!open) {
          setResendRnNote('');
          setConfirmResendRnSendOpen(false);
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {rnAlreadySigned ? 'Resend → RN for new signature' : 'Resend → RN'}
          </DialogTitle>
          <DialogDescription>
            {rnAlreadySigned
              ? 'This clears the prior RN electronic signature and emails a fresh signature link. Enter why you are requesting a new signature.'
              : 'This re-notifies the RN with another signature link. Enter why you are resending.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">
              {clean(activeIntake?.memberName) || clean(answers?.p1_member_name) || 'Member'}
            </div>
            <div className="font-mono text-muted-foreground">
              {clean(activeIntake?.medicalRecordNumber) || clean(answers?.p1_mrn) || '—'}
            </div>
            <div className="mt-2 text-muted-foreground">
              RN:{' '}
              {clean(assignedRn?.label) || clean(activeIntake?.alftRnName) || 'Assigned RN'}
              {clean(assignedRn?.email) || clean(activeIntake?.alftRnEmail)
                ? ` (${clean(assignedRn?.email) || clean(activeIntake?.alftRnEmail)})`
                : ''}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="isp-workflow-resend-rn-note">Why are you resending? (required)</Label>
            <Textarea
              id="isp-workflow-resend-rn-note"
              value={resendRnNote}
              onChange={(e) => setResendRnNote(e.target.value)}
              rows={4}
              placeholder="e.g. Form updated after RN signed / need Leslie to re-sign after corrections."
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setResendRnDialogOpen(false)}
            disabled={Boolean(busyAction)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!clean(resendRnNote)) {
                toast({
                  variant: 'destructive',
                  title: 'Resend note required',
                  description: 'Explain why you are requesting a new RN signature.',
                });
                return;
              }
              setConfirmResendRnSendOpen(true);
            }}
            disabled={Boolean(busyAction) || !clean(resendRnNote)}
          >
            <Send className="mr-2 h-4 w-4" />
            Continue to confirm…
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
