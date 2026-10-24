'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import {
  clean,
  type ApplicationClinicalFile,
  type KaiserMember,
  type SwPortalSupportFile,
} from './isp-workflow-helpers';
import { getDownloadURL, ref, type FirebaseStorage } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import type { useToast } from '@/hooks/use-toast';
import { type Dispatch, type SetStateAction } from 'react';

export interface MemberUploadsStepProps {
  confirmedClinicalUploads: boolean;
  confirmedIspLocation: boolean;
  loadingApplicationClinical: boolean;
  applicationClinicalFiles: ApplicationClinicalFile[];
  applicationClinicalSourceLabel: string;
  storage: FirebaseStorage;
  toast: ReturnType<typeof useToast>['toast'];
  canUploadClinical: boolean;
  pullingApplicationClinical: boolean;
  pullApplicationClinicalFilesIntoSwPortal: () => Promise<void>;
  selectedMember: KaiserMember;
  clinicalUploadLabel: string;
  setClinicalUploadLabel: Dispatch<SetStateAction<string>>;
  uploadMemberClinicalFiles: (filesOverride?: File[] | undefined, labelOverride?: string | undefined) => Promise<boolean>;
  clinicalUploading: boolean;
  clinicalUploadProgress: number;
  clinicalUploadFiles: File[];
  swPortalSupportFiles: SwPortalSupportFile[];
  deletingClinicalFileId: string;
  deleteSwPortalClinicalFile: (file: SwPortalSupportFile) => Promise<void>;
  setConfirmedClinicalUploads: Dispatch<SetStateAction<boolean>>;
}

export function MemberUploadsStep({
  confirmedClinicalUploads,
  confirmedIspLocation,
  loadingApplicationClinical,
  applicationClinicalFiles,
  applicationClinicalSourceLabel,
  storage,
  toast,
  canUploadClinical,
  pullingApplicationClinical,
  pullApplicationClinicalFilesIntoSwPortal,
  selectedMember,
  clinicalUploadLabel,
  setClinicalUploadLabel,
  uploadMemberClinicalFiles,
  clinicalUploading,
  clinicalUploadProgress,
  clinicalUploadFiles,
  swPortalSupportFiles,
  deletingClinicalFileId,
  deleteSwPortalClinicalFile,
  setConfirmedClinicalUploads,
}: MemberUploadsStepProps) {
  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        confirmedClinicalUploads
          ? 'border-green-300'
          : !confirmedIspLocation
            ? 'opacity-70'
            : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">6</Badge>
        Member clinical uploads
        {confirmedClinicalUploads ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Choose 602, facesheet, and other clinical documents — they upload automatically to the SW
        portal for this member. Labels are inferred from filenames (e.g. “602”) when left blank.
        Unlocks after ISP location is verified (step 5). If this member has an application in the
        portal, Medicine List and LIC 602A uploads are offered below when available.
      </p>
      {loadingApplicationClinical ? (
        <div className="mb-2 flex items-center gap-2 rounded border border-sky-200 bg-sky-50/70 px-2 py-1.5 text-[11px] text-sky-900">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking application portal for Medicine List / 602…
        </div>
      ) : applicationClinicalFiles.length > 0 ? (
        <div className="mb-2 space-y-2 rounded border border-emerald-200 bg-emerald-50/60 p-2">
          <div className="text-[11px] font-medium text-emerald-950">
            From application portal
            {applicationClinicalSourceLabel ? (
              <span className="font-normal text-emerald-800"> · {applicationClinicalSourceLabel}</span>
            ) : null}
          </div>
          <div className="space-y-1">
            {applicationClinicalFiles.map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-800"
              >
                <span>
                  <span className="font-medium">{file.label}</span>
                  {file.fileName ? ` · ${file.fileName}` : ''}
                  {file.alreadyPulled ? (
                    <span className="ml-1 text-emerald-700">(already on SW portal)</span>
                  ) : null}
                </span>
                {file.downloadURL || file.filePath ? (
                  <button
                    type="button"
                    className="text-blue-700 hover:underline"
                    onClick={() => {
                      void (async () => {
                        try {
                          const url =
                            clean(file.downloadURL) ||
                            (file.filePath && storage
                              ? await getDownloadURL(ref(storage, file.filePath))
                              : '');
                          if (url) window.open(url, '_blank', 'noopener,noreferrer');
                        } catch {
                          toast({
                            variant: 'destructive',
                            title: 'Could not open file',
                            description: file.fileName || file.label,
                          });
                        }
                      })();
                    }}
                  >
                    Preview
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={
              !canUploadClinical ||
              pullingApplicationClinical ||
              applicationClinicalFiles.every((f) => f.alreadyPulled)
            }
            onClick={() => void pullApplicationClinicalFilesIntoSwPortal()}
          >
            {pullingApplicationClinical ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Pulling…
              </>
            ) : (
              'Pull Medicine List & 602 into SW portal'
            )}
          </Button>
        </div>
      ) : selectedMember && !loadingApplicationClinical ? (
        <div className="mb-2 rounded border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground">
          No Medicine List or LIC 602A found on an application for this member (by MRN / Client_ID2).
          Upload manually below if needed.
        </div>
      ) : null}
      <div className="space-y-2 rounded border bg-muted/20 p-2">
        <div className="space-y-1">
          <Label htmlFor="isp-clinical-upload-label" className="text-[11px]">
            File label (optional — applies to next upload)
          </Label>
          <Input
            id="isp-clinical-upload-label"
            value={clinicalUploadLabel}
            onChange={(e) => setClinicalUploadLabel(e.target.value)}
            placeholder="Example: 602 or Facesheet"
            className="h-8 text-xs"
            disabled={!canUploadClinical}
          />
          <input
            id="isp-clinical-upload-input"
            type="file"
            multiple
            disabled={!canUploadClinical}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (!files.length || !confirmedIspLocation) return;
              void uploadMemberClinicalFiles(files, clinicalUploadLabel);
            }}
            className="text-xs"
          />
          {!confirmedIspLocation ? (
            <div className="text-[11px] text-amber-800">Verify ISP location (step 5) to enable clinical uploads.</div>
          ) : null}
          {clinicalUploading ? (
            <div className="flex items-center gap-2 text-[11px] text-blue-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading to SW portal
              {clinicalUploadProgress ? ` (${clinicalUploadProgress}%)` : '…'}
            </div>
          ) : clinicalUploadFiles.length ? (
            <div className="text-[11px] text-muted-foreground">
              Selected {clinicalUploadFiles.length} file
              {clinicalUploadFiles.length > 1 ? 's' : ''}:{' '}
              {clinicalUploadFiles
                .slice(0, 2)
                .map((f) => f.name)
                .join(', ')}
              {clinicalUploadFiles.length > 2 ? ` +${clinicalUploadFiles.length - 2} more` : ''}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              Files upload as soon as you choose them.
            </div>
          )}
        </div>
        {swPortalSupportFiles.length ? (
          <div className="space-y-1 border-t pt-2">
            <div className="text-[11px] font-medium text-slate-800">Uploaded for this member</div>
            {swPortalSupportFiles.slice(0, 12).map((file, idx) => (
              <div
                key={file.id || `${file.fileName}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"
              >
                <span className="min-w-0 flex-1">
                  <a
                    href={file.downloadURL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {file.label || file.fileName || 'Clinical file'}
                  </a>
                  {file.label && file.fileName && file.label !== file.fileName
                    ? ` (${file.fileName})`
                    : ''}
                  {file.uploadedAtLabel ? ` · uploaded ${file.uploadedAtLabel}` : ''}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={deletingClinicalFileId === file.id || clinicalUploading}
                  onClick={() => void deleteSwPortalClinicalFile(file)}
                  title="Delete clinical file"
                >
                  {deletingClinicalFileId === file.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1">Delete</span>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t pt-2 text-[11px] text-muted-foreground">
            No clinical files uploaded for this member yet.
          </div>
        )}
      </div>
      {!confirmedClinicalUploads ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={!canUploadClinical}
          onClick={() => {
            setConfirmedClinicalUploads(true);
            toast({
              title: 'Continuing without clinical files',
              description: 'You can upload later from ALFT Tracker or by choosing files above.',
              className: 'bg-green-100 text-green-900 border-green-200',
            });
          }}
        >
          Continue without clinical files
        </Button>
      ) : null}
    </div>
  );
}
