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
import { Eye, Pencil, Loader2, Send } from 'lucide-react';
import { ILS_DECISION_TO, ILS_DECISION_CC } from '@/lib/ils-decision-email';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NORTHERN_DECLINE_CONFIRM_THRESHOLD, type IlsMifMasterRow } from '@/lib/ils-mif-parse';
import { Checkbox } from '@/components/ui/checkbox';
import { type Dispatch, type SetStateAction } from 'react';

export interface DeclineComposerDialogProps {
  declineComposerOpen: boolean;
  isSendingDeclines: boolean;
  isCheckingDeclineCaspio: boolean;
  setDeclineComposerOpen: Dispatch<SetStateAction<boolean>>;
  setDeclineComposerRows: Dispatch<SetStateAction<IlsMifMasterRow[]>>;
  setDeclineComposerSubject: Dispatch<SetStateAction<string>>;
  setDeclineComposerBody: Dispatch<SetStateAction<string>>;
  setDeclineComposerIsResend: Dispatch<SetStateAction<boolean>>;
  setDeclineComposerShowEditor: Dispatch<SetStateAction<boolean>>;
  setDeclineComposerCaspioBlocked: Dispatch<SetStateAction<IlsMifMasterRow[]>>;
  setDeclinePreviewApproved: Dispatch<SetStateAction<boolean>>;
  setDeclineConfirmTyped: Dispatch<SetStateAction<string>>;
  declineComposerIsResend: boolean;
  declineComposerRows: IlsMifMasterRow[];
  declineComposerCaspioBlocked: IlsMifMasterRow[];
  declineComposerShowEditor: boolean;
  declineComposerSubject: string;
  declineComposerBody: string;
  declineConfirmTyped: string;
  declinePreviewApproved: boolean;
  bulkSendNorthernDeclines: () => Promise<void>;
}

export function DeclineComposerDialog({
  declineComposerOpen,
  isSendingDeclines,
  isCheckingDeclineCaspio,
  setDeclineComposerOpen,
  setDeclineComposerRows,
  setDeclineComposerSubject,
  setDeclineComposerBody,
  setDeclineComposerIsResend,
  setDeclineComposerShowEditor,
  setDeclineComposerCaspioBlocked,
  setDeclinePreviewApproved,
  setDeclineConfirmTyped,
  declineComposerIsResend,
  declineComposerRows,
  declineComposerCaspioBlocked,
  declineComposerShowEditor,
  declineComposerSubject,
  declineComposerBody,
  declineConfirmTyped,
  declinePreviewApproved,
  bulkSendNorthernDeclines,
}: DeclineComposerDialogProps) {
  return (
    <Dialog
      open={declineComposerOpen}
      onOpenChange={(open) => {
        if (isSendingDeclines || isCheckingDeclineCaspio) return;
        setDeclineComposerOpen(open);
        if (!open) {
          setDeclineComposerRows([]);
          setDeclineComposerSubject('');
          setDeclineComposerBody('');
          setDeclineComposerIsResend(false);
          setDeclineComposerShowEditor(false);
          setDeclineComposerCaspioBlocked([]);
          setDeclinePreviewApproved(false);
          setDeclineConfirmTyped('');
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>
            {declineComposerIsResend
              ? 'Resend northern denial — preview'
              : 'Bulk northern denial — preview'}
          </DialogTitle>
          <DialogDescription>
            {declineComposerIsResend
              ? 'Live Caspio check done. Review the email, edit if needed, approve, then resend. Covers '
              : 'Live Caspio check done. Review the email, edit if needed, approve, then send. Covers '}
            {declineComposerRows.length} member{declineComposerRows.length === 1 ? '' : 's'}
            {declineComposerCaspioBlocked.length
              ? ` (${declineComposerCaspioBlocked.length} already in Caspio excluded)`
              : ''}
            .
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant={declineComposerShowEditor ? 'outline' : 'default'}
              disabled={isSendingDeclines}
              onClick={() => setDeclineComposerShowEditor(false)}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              type="button"
              size="sm"
              variant={declineComposerShowEditor ? 'default' : 'outline'}
              disabled={isSendingDeclines}
              onClick={() => setDeclineComposerShowEditor(true)}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit text
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4 text-sm">
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Will be delivered to
            </div>
            <div>
              <span className="font-medium">To:</span>{' '}
              <span className="font-mono text-[13px]">{ILS_DECISION_TO.join(', ')}</span>
            </div>
            <div>
              <span className="font-medium">CC:</span>{' '}
              <span className="font-mono text-[13px]">{ILS_DECISION_CC.join(', ')}</span>
            </div>
          </div>

          {declineComposerShowEditor ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="northern-decline-subject">Subject</Label>
                <Input
                  id="northern-decline-subject"
                  value={declineComposerSubject}
                  onChange={(event) => {
                    setDeclineComposerSubject(event.target.value);
                    setDeclinePreviewApproved(false);
                  }}
                  disabled={isSendingDeclines}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="northern-decline-body">Email message</Label>
                <Textarea
                  id="northern-decline-body"
                  value={declineComposerBody}
                  onChange={(event) => {
                    setDeclineComposerBody(event.target.value);
                    setDeclinePreviewApproved(false);
                  }}
                  className="min-h-[280px] font-mono text-[13px] leading-6"
                  disabled={isSendingDeclines}
                />
                <div className="text-[11px] text-muted-foreground">
                  Changing the message clears the approval checkbox so you re-confirm before send.
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Subject
                </div>
                <div className="rounded border bg-white px-3 py-2 font-medium">
                  {declineComposerSubject || '—'}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Message preview
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={isSendingDeclines}
                    onClick={() => setDeclineComposerShowEditor(true)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit text
                  </Button>
                </div>
                <div className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded border bg-white p-3 leading-6">
                  {declineComposerBody || '—'}
                </div>
              </div>
            </>
          )}

          <div className="max-h-40 overflow-auto rounded border">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left">
                <tr>
                  <th className="px-2 py-1 w-10">#</th>
                  <th className="px-2 py-1">Member</th>
                  <th className="px-2 py-1">MRN</th>
                  <th className="px-2 py-1">County</th>
                  <th className="px-2 py-1">Caspio</th>
                </tr>
              </thead>
              <tbody>
                {declineComposerRows.map((row, index) => (
                  <tr key={row.rowId} className="border-t">
                    <td className="px-2 py-1 text-muted-foreground tabular-nums">{index + 1}</td>
                    <td className="px-2 py-1">
                      {row.memberLastName}, {row.memberFirstName}
                    </td>
                    <td className="px-2 py-1">{row.memberMrn || '—'}</td>
                    <td className="px-2 py-1">{row.memberCounty || '—'}</td>
                    <td className="px-2 py-1 text-emerald-700">Not in Caspio</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {declineComposerCaspioBlocked.length ? (
            <div className="space-y-2 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <div className="text-sm font-medium text-amber-950">
                Already in Caspio — excluded from this denial ({declineComposerCaspioBlocked.length})
              </div>
              <div className="text-xs text-amber-900">
                Live Kaiser check matched these members. They are flagged and left out of the email so you do not
                decline someone already in Caspio.
              </div>
              <div className="max-h-36 overflow-auto rounded border border-amber-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-amber-50/80 text-left">
                    <tr>
                      <th className="px-2 py-1">Member</th>
                      <th className="px-2 py-1">MRN</th>
                      <th className="px-2 py-1">County</th>
                      <th className="px-2 py-1">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declineComposerCaspioBlocked.map((row) => (
                      <tr key={`blocked-${row.rowId}`} className="border-t">
                        <td className="px-2 py-1 font-medium">
                          {row.memberLastName}, {row.memberFirstName}
                        </td>
                        <td className="px-2 py-1">{row.memberMrn || '—'}</td>
                        <td className="px-2 py-1">{row.memberCounty || '—'}</td>
                        <td className="px-2 py-1 text-amber-900">
                          {row.caspioMatchLabel ||
                            row.caspioMatchedClientId2 ||
                            row.caspioCalAIMStatus ||
                            'In Caspio'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {declineComposerRows.length >= NORTHERN_DECLINE_CONFIRM_THRESHOLD ? (
            <div className="space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <Label htmlFor="northern-decline-confirm-count" className="text-amber-950">
                Type {declineComposerRows.length} to confirm member count
              </Label>
              <Input
                id="northern-decline-confirm-count"
                value={declineConfirmTyped}
                onChange={(event) => setDeclineConfirmTyped(event.target.value)}
                placeholder={String(declineComposerRows.length)}
                className="max-w-[160px] bg-white"
                disabled={isSendingDeclines}
              />
            </div>
          ) : null}

          <label
            htmlFor="northern-decline-approve-preview"
            className="flex items-start gap-3 rounded border border-slate-300 bg-white px-3 py-3 cursor-pointer"
          >
            <Checkbox
              id="northern-decline-approve-preview"
              checked={declinePreviewApproved}
              onCheckedChange={(checked) => setDeclinePreviewApproved(checked === true)}
              disabled={isSendingDeclines}
              className="mt-0.5"
            />
            <span className="text-sm leading-5">
              <span className="font-medium text-slate-900">Required:</span> I have reviewed this email preview
              (recipients, subject, and message) and approve sending it to {ILS_DECISION_TO.join(', ')}
              {ILS_DECISION_CC.length ? ` (CC ${ILS_DECISION_CC.join(', ')})` : ''}.
            </span>
          </label>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSendingDeclines}
            onClick={() => setDeclineComposerOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              isSendingDeclines ||
              !declineComposerRows.length ||
              !declinePreviewApproved ||
              !String(declineComposerSubject || '').trim() ||
              !String(declineComposerBody || '').trim()
            }
            onClick={() => void bulkSendNorthernDeclines()}
          >
            {isSendingDeclines ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {declineComposerIsResend ? 'Approve preview and resend' : 'Approve preview and send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
