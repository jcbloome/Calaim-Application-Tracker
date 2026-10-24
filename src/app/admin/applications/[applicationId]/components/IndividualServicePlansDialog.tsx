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
import { FileText, Download } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { type Dispatch, type SetStateAction } from 'react';

export interface IndividualServicePlansDialogProps {
  ispUpload: { planDate: string; file: File | null; };
  setIspUpload: Dispatch<SetStateAction<{ planDate: string; file: File | null; }>>;
  ispUploading: boolean;
  ispUploadProgress: number;
  handleIspUpload: () => Promise<void>;
  ispRecords: { id?: string | undefined; planDate?: string | undefined; fileName?: string | undefined; downloadURL?: string | undefined; uploadedAt?: any; createdByName?: string | undefined; }[];
  formatAuthorizationDate: (value?: any) => any;
}

export function IndividualServicePlansDialog({
  ispUpload,
  setIspUpload,
  ispUploading,
  ispUploadProgress,
  handleIspUpload,
  ispRecords,
  formatAuthorizationDate,
}: IndividualServicePlansDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="qa-trigger">
          <FileText className="h-4 w-4" />
          <span className="qa-label">Individual service plans (ISP)</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Individual service plans</DialogTitle>
          <DialogDescription>
            Upload Individual Service Plans for backend record-keeping (not part of the pathway).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="isp-date">ISP Date</Label>
            <Input
              id="isp-date"
              type="date"
              value={ispUpload.planDate}
              onChange={(event) => setIspUpload((prev) => ({ ...prev, planDate: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="isp-file">ISP Document</Label>
            <Input
              id="isp-file"
              type="file"
              onChange={(event) => setIspUpload((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
            />
          </div>
          {ispUploading && <Progress value={ispUploadProgress} className="h-1 w-full" />}
          <Button onClick={handleIspUpload} className="w-full" disabled={ispUploading}>
            {ispUploading ? 'Uploading...' : 'Save ISP'}
          </Button>

          <Separator />

          {ispRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ISP records uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {ispRecords.map((record) => (
                <div key={record.id || `${record.planDate}-${record.fileName}`} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">ISP {formatAuthorizationDate(record.planDate)}</div>
                    {record.downloadURL && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={record.downloadURL} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          View
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    {record.fileName && <div>File: {record.fileName}</div>}
                    {record.createdByName && <div>Uploaded by: {record.createdByName}</div>}
                    <div>Uploaded: {formatAuthorizationDate(record.uploadedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
