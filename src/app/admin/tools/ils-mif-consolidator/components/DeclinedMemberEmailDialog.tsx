'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Undo2, Pencil } from 'lucide-react';
import { ILS_DECISION_TO, ILS_DECISION_CC } from '@/lib/ils-decision-email';
import { type DeclinedMemberRecord } from './consolidator-types';
import { type Dispatch, type SetStateAction } from 'react';

export interface DeclinedMemberEmailDialogProps {
  viewedDeclineEmail: DeclinedMemberRecord | null;
  setViewedDeclineEmail: Dispatch<SetStateAction<DeclinedMemberRecord | null>>;
  isUndeclining: boolean;
  undeclineDeclinedRecords: (records: DeclinedMemberRecord[], options?: { label?: string | undefined; } | undefined) => Promise<boolean>;
  isSendingDeclines: boolean;
  openResendDeclinedMemberComposer: (row: DeclinedMemberRecord) => void;
}

export function DeclinedMemberEmailDialog({
  viewedDeclineEmail,
  setViewedDeclineEmail,
  isUndeclining,
  undeclineDeclinedRecords,
  isSendingDeclines,
  openResendDeclinedMemberComposer,
}: DeclinedMemberEmailDialogProps) {
  return (
    <Dialog open={Boolean(viewedDeclineEmail)} onOpenChange={(open) => !open && setViewedDeclineEmail(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>Declined member email</DialogTitle>
          <DialogDescription>
            {viewedDeclineEmail
              ? `${viewedDeclineEmail.memberLastName}, ${viewedDeclineEmail.memberFirstName}`
              : 'Decline email'}
          </DialogDescription>
        </DialogHeader>
        {viewedDeclineEmail ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2">
              <span className="text-sky-950">
                Preview of what was sent. Resend with edits, or Undecline to put them back on Create Application /
                Northern lists.
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-sky-800"
                  disabled={isUndeclining}
                  onClick={() =>
                    void undeclineDeclinedRecords([viewedDeclineEmail], {
                      label: `${viewedDeclineEmail.memberLastName}, ${viewedDeclineEmail.memberFirstName}`.trim(),
                    }).then((ok) => {
                      if (ok) setViewedDeclineEmail(null);
                    })
                  }
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  Undecline
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSendingDeclines}
                  onClick={() => openResendDeclinedMemberComposer(viewedDeclineEmail)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit text &amp; resend
                </Button>
              </div>
            </div>
            <div>
              <span className="font-medium">To:</span>{' '}
              {(viewedDeclineEmail.to.length ? viewedDeclineEmail.to : [...ILS_DECISION_TO]).join(', ')}
            </div>
            <div>
              <span className="font-medium">CC:</span>{' '}
              {(viewedDeclineEmail.cc.length ? viewedDeclineEmail.cc : [...ILS_DECISION_CC]).join(', ')}
            </div>
            <div>
              <span className="font-medium">Subject:</span> {viewedDeclineEmail.emailSubject || '—'}
            </div>
            {viewedDeclineEmail.customText ? (
              <div>
                <span className="font-medium">Custom text included:</span>
                <div className="mt-1 whitespace-pre-wrap rounded border bg-amber-50 px-3 py-2">
                  {viewedDeclineEmail.customText}
                </div>
              </div>
            ) : null}
            <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 leading-6">
              {viewedDeclineEmail.emailBodyText || 'Email body was not stored for this older decline record.'}
            </div>
            <div className="text-xs text-muted-foreground">
              Sent {viewedDeclineEmail.declinedAtIso ? new Date(viewedDeclineEmail.declinedAtIso).toLocaleString() : '—'}
              {viewedDeclineEmail.actedByEmail ? ` by ${viewedDeclineEmail.actedByEmail}` : ''}
            </div>
          </div>
        ) : null}
        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setViewedDeclineEmail(null)}>
            Close
          </Button>
          {viewedDeclineEmail ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="text-sky-800"
                disabled={isUndeclining}
                onClick={() =>
                  void undeclineDeclinedRecords([viewedDeclineEmail], {
                    label: `${viewedDeclineEmail.memberLastName}, ${viewedDeclineEmail.memberFirstName}`.trim(),
                  }).then((ok) => {
                    if (ok) setViewedDeclineEmail(null);
                  })
                }
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Undecline
              </Button>
              <Button
                type="button"
                disabled={isSendingDeclines}
                onClick={() => openResendDeclinedMemberComposer(viewedDeclineEmail)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit text &amp; resend
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
