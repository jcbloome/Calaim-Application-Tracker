'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { type Dispatch, type SetStateAction } from 'react';

export interface DocumentPreviewDialogProps {
  documentPreview: { url: string; title: string; } | null;
  setDocumentPreview: Dispatch<SetStateAction<{ url: string; title: string; } | null>>;
}

export function DocumentPreviewDialog({
  documentPreview,
  setDocumentPreview,
}: DocumentPreviewDialogProps) {
  return (
    <Dialog open={Boolean(documentPreview)} onOpenChange={(open) => !open && setDocumentPreview(null)}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-6xl p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="truncate pr-8">{documentPreview?.title || 'Document preview'}</DialogTitle>
          <DialogDescription>
            Review the uploaded document here, then close this window to return to the application.
          </DialogDescription>
        </DialogHeader>
        {documentPreview?.url ? (
          <div className="h-[calc(92vh-96px)] border-t">
            <iframe
              src={documentPreview.url}
              title={documentPreview.title || 'Document preview'}
              className="h-full w-full"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
