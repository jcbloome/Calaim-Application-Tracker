'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatSwEmailBodyPreviewHtml, type AlftAssignmentQueueRow } from './alft-tracker-helpers';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { type Dispatch, type SetStateAction } from 'react';

export interface SwEmailPreviewDialogProps {
  swEmailPreviewOpen: boolean;
  setSwEmailPreviewOpen: Dispatch<SetStateAction<boolean>>;
  setSwEmailPreviewUseTestOverride: Dispatch<SetStateAction<boolean>>;
  setSwEmailPreviewTestEmail: Dispatch<SetStateAction<string>>;
  setSwEmailPreviewEditableBody: Dispatch<SetStateAction<string>>;
  swEmailPreview: { to: string; subject: string; canSend: boolean; alreadySent: boolean; sentAtLabel: string; missingIspFields: string[]; logoPath: string; ispContactName: string; ispContactRelationship: string; ispAddress: string; ispFacilityName: string; ispFacilityType: string; ispPhone: string; ispEmail: string; body: string; } | null;
  swEmailPreviewRenderedBody: string;
  swEmailPreviewEditableBody: string;
  swEmailPreviewUseTestOverride: boolean;
  swEmailPreviewTestEmail: string;
  swPreviewActionRow: AlftAssignmentQueueRow | null;
  isResendingSwFromEdit: boolean;
  setConfirmResendSwSendOpen: Dispatch<SetStateAction<boolean>>;
}

export function SwEmailPreviewDialog({
  swEmailPreviewOpen,
  setSwEmailPreviewOpen,
  setSwEmailPreviewUseTestOverride,
  setSwEmailPreviewTestEmail,
  setSwEmailPreviewEditableBody,
  swEmailPreview,
  swEmailPreviewRenderedBody,
  swEmailPreviewEditableBody,
  swEmailPreviewUseTestOverride,
  swEmailPreviewTestEmail,
  swPreviewActionRow,
  isResendingSwFromEdit,
  setConfirmResendSwSendOpen,
}: SwEmailPreviewDialogProps) {
  return (
    <Dialog
      open={swEmailPreviewOpen}
      onOpenChange={(open) => {
        setSwEmailPreviewOpen(open);
        if (!open) {
          setSwEmailPreviewUseTestOverride(false);
          setSwEmailPreviewTestEmail('');
          setSwEmailPreviewEditableBody('');
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Social Worker email preview</DialogTitle>
          <DialogDescription>
            Preview the workflow notice email that will be sent for portal login and ALFT completion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm overflow-y-auto pr-1">
          <div>
            <span className="font-medium">To:</span> {swEmailPreview?.to || '—'}
          </div>
          <div>
            <span className="font-medium">Subject:</span> {swEmailPreview?.subject || '—'}
          </div>
          <div>
            <span className="font-medium">Status:</span>{' '}
            {swEmailPreview?.alreadySent
              ? `Already sent${swEmailPreview?.sentAtLabel ? ` at ${swEmailPreview.sentAtLabel}` : ''}`
              : 'Not sent yet'}
          </div>
          <div>
            <span className="font-medium">Body:</span>
            <div
              className="mt-1 whitespace-pre-wrap rounded border bg-muted/20 p-2 text-xs leading-5"
              dangerouslySetInnerHTML={{ __html: formatSwEmailBodyPreviewHtml(swEmailPreviewRenderedBody) }}
            />
            {swEmailPreview?.logoPath ? (
              <div className="mt-2">
                <img src={swEmailPreview.logoPath} alt="Connections logo" className="h-10 w-auto object-contain" />
              </div>
            ) : null}
          </div>
          {swEmailPreview?.missingIspFields?.length ? (
            <div className="rounded border bg-amber-50 p-2 text-xs text-amber-800">
              Missing required fields: {swEmailPreview.missingIspFields.join(', ')}
            </div>
          ) : null}
          <div className="rounded border bg-muted/20 p-2 space-y-1">
            <Label htmlFor="sw-email-editable-body" className="text-[11px] font-medium">
              Editable SW email body
            </Label>
            <textarea
              id="sw-email-editable-body"
              value={swEmailPreviewEditableBody}
              onChange={(e) => setSwEmailPreviewEditableBody(e.target.value)}
              placeholder="Edit the full email body before sending."
              rows={10}
              className="w-full rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
          <div className="rounded border bg-muted/20 p-2 space-y-2">
            <div className="font-medium text-xs">Test override</div>
            <div className="flex items-center gap-2 text-xs">
              <Label htmlFor="sw-email-test-override-mode">Use test override:</Label>
              <select
                id="sw-email-test-override-mode"
                value={swEmailPreviewUseTestOverride ? 'yes' : 'no'}
                onChange={(e) => setSwEmailPreviewUseTestOverride(e.target.value === 'yes')}
                className="h-8 rounded border bg-background px-2"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {swEmailPreviewUseTestOverride ? (
              <div>
                <Label htmlFor="sw-email-test-override-address" className="text-[11px]">
                  Test email
                </Label>
                <Input
                  id="sw-email-test-override-address"
                  value={swEmailPreviewTestEmail}
                  onChange={(e) => setSwEmailPreviewTestEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1 h-8 text-xs"
                />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t bg-background pt-3">
          {swPreviewActionRow ? (
            <Button
              variant={swEmailPreview?.canSend ? 'default' : 'outline'}
              className={swEmailPreview?.canSend ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''}
              disabled={
                !swEmailPreview?.canSend ||
                isResendingSwFromEdit ||
                (swEmailPreviewUseTestOverride && !String(swEmailPreviewTestEmail || '').trim())
              }
              onClick={() => setConfirmResendSwSendOpen(true)}
            >
              {isResendingSwFromEdit
                ? 'Sending...'
                : swEmailPreview?.alreadySent
                  ? 'Re-send SW Email (timestamped)'
                  : 'Send SW Email (timestamped)'}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setSwEmailPreviewOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
