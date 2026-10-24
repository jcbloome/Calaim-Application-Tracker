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
import { UploadCloud, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { type Dispatch, type SetStateAction } from 'react';

export interface AuthorizationUploadsDialogProps {
  latestAuthorizationUploadLabel: string;
  latestAuthorizationRecord: { id?: string | undefined; type?: string | undefined; startDate?: string | undefined; endDate?: string | undefined; fileName?: string | undefined; downloadURL?: string | undefined; uploadedAt?: any; createdByName?: string | undefined; expiryNotifiedAt?: string | undefined; } | null;
  isKaiserApplication: boolean;
  kaiserH2022Records: { id?: string | undefined; type?: string | undefined; startDate?: string | undefined; endDate?: string | undefined; fileName?: string | undefined; downloadURL?: string | undefined; uploadedAt?: any; createdByName?: string | undefined; expiryNotifiedAt?: string | undefined; }[];
  setAuthorizationUpload: Dispatch<SetStateAction<{ type: string; startDate: string; endDate: string; file: File | null; }>>;
  authorizationUpload: { type: string; startDate: string; endDate: string; file: File | null; };
  authorizationTypes: string[];
  authorizationUploading: boolean;
  authorizationUploadProgress: number;
  handleAuthorizationUpload: () => Promise<void>;
  authorizationSearch: string;
  setAuthorizationSearch: Dispatch<SetStateAction<string>>;
  getDaysUntil: (value?: any) => number | null;
  formatAuthorizationDate: (value?: any) => any;
  filteredAuthorizationRecords: { id?: string | undefined; type?: string | undefined; startDate?: string | undefined; endDate?: string | undefined; fileName?: string | undefined; downloadURL?: string | undefined; uploadedAt?: any; createdByName?: string | undefined; expiryNotifiedAt?: string | undefined; }[];
}

export function AuthorizationUploadsDialog({
  latestAuthorizationUploadLabel,
  latestAuthorizationRecord,
  isKaiserApplication,
  kaiserH2022Records,
  setAuthorizationUpload,
  authorizationUpload,
  authorizationTypes,
  authorizationUploading,
  authorizationUploadProgress,
  handleAuthorizationUpload,
  authorizationSearch,
  setAuthorizationSearch,
  getDaysUntil,
  formatAuthorizationDate,
  filteredAuthorizationRecords,
}: AuthorizationUploadsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="qa-trigger">
          <UploadCloud className="h-4 w-4" />
          <span className="qa-label">Authorization uploads</span>
        </Button>
      </DialogTrigger>
      {latestAuthorizationUploadLabel ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          Last authorization upload: {latestAuthorizationUploadLabel}
          {String(latestAuthorizationRecord?.type || '').trim()
            ? ` (${String(latestAuthorizationRecord?.type || '').trim()})`
            : ''}
        </div>
      ) : null}
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Authorization uploads</DialogTitle>
          <DialogDescription>
            Track authorization windows and upload documents. Use search to find previous auths for reauthorizations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isKaiserApplication ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm">
              <div className="font-medium text-indigo-900">Kaiser ongoing H2022 authorizations</div>
              <div className="mt-1 text-indigo-800">
                Use this section for ongoing six-month reassessment authorizations after T2038 expires.
                Upload the H2022 PDF and keep start/end dates current.
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">H2022 records: {kaiserH2022Records.length}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAuthorizationUpload((prev) => ({ ...prev, type: 'H2022' }))}
                >
                  Set Type to H2022
                </Button>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="authorization-type">Authorization Type</Label>
            <Select
              value={authorizationUpload.type}
              onValueChange={(value) => setAuthorizationUpload((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger id="authorization-type">
                <SelectValue placeholder="Select authorization type" />
              </SelectTrigger>
              <SelectContent>
                {authorizationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="authorization-start">Start Date</Label>
              <Input
                id="authorization-start"
                type="date"
                value={authorizationUpload.startDate}
                onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authorization-end">End Date</Label>
              <Input
                id="authorization-end"
                type="date"
                value={authorizationUpload.endDate}
                onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="authorization-file">Authorization Document</Label>
            <Input
              id="authorization-file"
              type="file"
              onChange={(event) => setAuthorizationUpload((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
            />
          </div>
          {authorizationUploading && <Progress value={authorizationUploadProgress} className="h-1 w-full" />}
          <Button onClick={handleAuthorizationUpload} className="w-full" disabled={authorizationUploading}>
            {authorizationUploading ? 'Uploading...' : 'Save Authorization'}
          </Button>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="authorization-search">Search Previous Authorizations</Label>
            <Input
              id="authorization-search"
              value={authorizationSearch}
              onChange={(event) => setAuthorizationSearch(event.target.value)}
              placeholder="Search by type, date, or file name..."
            />
          </div>

          {isKaiserApplication ? (
            <div className="space-y-2">
              <Label>Ongoing H2022 end-date tracker</Label>
              {kaiserH2022Records.length === 0 ? (
                <p className="text-sm text-muted-foreground">No H2022 records uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {kaiserH2022Records.map((record) => {
                    const daysUntilEnd = getDaysUntil(record.endDate);
                    const isExpiringSoon = typeof daysUntilEnd === 'number' && daysUntilEnd <= 30;
                    return (
                      <div key={`h2022-${record.id || `${record.startDate}-${record.fileName}`}`} className="rounded-md border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            H2022
                            {isExpiringSoon ? (
                              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                                Expires in {daysUntilEnd} days
                              </span>
                            ) : null}
                          </div>
                          {record.downloadURL ? (
                            <Button asChild variant="ghost" size="sm">
                              <a href={record.downloadURL} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-2 h-4 w-4" />
                                View PDF
                              </a>
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Start: {formatAuthorizationDate(record.startDate)} | End: {formatAuthorizationDate(record.endDate)}
                          {record.fileName ? ` | File: ${record.fileName}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {filteredAuthorizationRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground">No authorization records found.</p>
          ) : (
            <div className="space-y-3">
              {filteredAuthorizationRecords.map((record) => {
                const daysUntilEnd = getDaysUntil(record.endDate);
                const isExpiringSoon = typeof daysUntilEnd === 'number' && daysUntilEnd <= 30;
                return (
                  <div key={record.id || `${record.type}-${record.startDate}`} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">
                        {record.type || 'Authorization'}
                        {isExpiringSoon && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                            Expiring in {daysUntilEnd} days
                          </span>
                        )}
                      </div>
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
                      <div>Start: {formatAuthorizationDate(record.startDate)}</div>
                      <div>End: {formatAuthorizationDate(record.endDate)}</div>
                      <div>Uploaded: {formatAuthorizationDate(record.uploadedAt)}</div>
                      {record.fileName && <div>File: {record.fileName}</div>}
                      {record.createdByName && <div>Uploaded by: {record.createdByName}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
