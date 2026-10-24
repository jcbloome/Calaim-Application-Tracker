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
import { type NorthernDeclineBatchRecord } from './consolidator-types';
import { type Dispatch, type SetStateAction } from 'react';

export interface NorthernBatchEmailDialogProps {
  viewedNorthernBatch: NorthernDeclineBatchRecord | null;
  setViewedNorthernBatch: Dispatch<SetStateAction<NorthernDeclineBatchRecord | null>>;
  isUndeclining: boolean;
  undeclineNorthernBatchMembers: (batch: NorthernDeclineBatchRecord) => Promise<boolean>;
  isSendingDeclines: boolean;
  openResendNorthernBatchComposer: (batch: NorthernDeclineBatchRecord) => void;
}

export function NorthernBatchEmailDialog({
  viewedNorthernBatch,
  setViewedNorthernBatch,
  isUndeclining,
  undeclineNorthernBatchMembers,
  isSendingDeclines,
  openResendNorthernBatchComposer,
}: NorthernBatchEmailDialogProps) {
  return (
    <Dialog open={Boolean(viewedNorthernBatch)} onOpenChange={(open) => !open && setViewedNorthernBatch(null)}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>Bulk northern denial email</DialogTitle>
          <DialogDescription>
            {viewedNorthernBatch
              ? `${viewedNorthernBatch.memberCount} member(s) · sent ${
                  viewedNorthernBatch.sentAtIso
                    ? new Date(viewedNorthernBatch.sentAtIso).toLocaleString()
                    : '—'
                }`
              : 'Bulk decline email'}
          </DialogDescription>
        </DialogHeader>
        {viewedNorthernBatch ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-sky-200 bg-sky-50 px-3 py-2">
              <span className="text-sky-950">
                Preview of what was sent. Resend with edits, or Undecline all members in this email back onto Create
                Application / Northern lists.
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-sky-800"
                  disabled={isUndeclining || !(viewedNorthernBatch.members || []).length}
                  onClick={() => void undeclineNorthernBatchMembers(viewedNorthernBatch)}
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  Undecline all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSendingDeclines}
                  onClick={() => openResendNorthernBatchComposer(viewedNorthernBatch)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit text &amp; resend
                </Button>
              </div>
            </div>
            <div>
              <span className="font-medium">To:</span>{' '}
              {(viewedNorthernBatch.to.length ? viewedNorthernBatch.to : [...ILS_DECISION_TO]).join(', ')}
            </div>
            <div>
              <span className="font-medium">CC:</span>{' '}
              {(viewedNorthernBatch.cc.length ? viewedNorthernBatch.cc : [...ILS_DECISION_CC]).join(', ')}
            </div>
            <div>
              <span className="font-medium">Subject:</span> {viewedNorthernBatch.subject || '—'}
            </div>
            <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 leading-6">
              {viewedNorthernBatch.emailBodyText || 'Email body was not stored for this bulk send.'}
            </div>
            <div className="max-h-48 overflow-auto rounded border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left">
                  <tr>
                    <th className="px-2 py-1">Member</th>
                    <th className="px-2 py-1">MRN</th>
                    <th className="px-2 py-1">County</th>
                  </tr>
                </thead>
                <tbody>
                  {viewedNorthernBatch.members.map((member, index) => (
                    <tr
                      key={`${viewedNorthernBatch.id}-${member.memberMrn || index}`}
                      className="border-t"
                    >
                      <td className="px-2 py-1">
                        {member.memberLastName}, {member.memberFirstName}
                      </td>
                      <td className="px-2 py-1">{member.memberMrn || '—'}</td>
                      <td className="px-2 py-1">{member.memberCounty || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-muted-foreground">
              {viewedNorthernBatch.actedByEmail
                ? `Sent by ${viewedNorthernBatch.actedByEmail}`
                : 'Sender not recorded'}
            </div>
          </div>
        ) : null}
        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setViewedNorthernBatch(null)}>
            Close
          </Button>
          {viewedNorthernBatch ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="text-sky-800"
                disabled={isUndeclining || !(viewedNorthernBatch.members || []).length}
                onClick={() => void undeclineNorthernBatchMembers(viewedNorthernBatch)}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Undecline all
              </Button>
              <Button
                type="button"
                disabled={isSendingDeclines}
                onClick={() => openResendNorthernBatchComposer(viewedNorthernBatch)}
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
