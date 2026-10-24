'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Database, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type Dispatch, type SetStateAction } from 'react';
import { type Firestore } from 'firebase/firestore';
import { type StandaloneUploadRow } from './application-detail-types';

export interface IntakeUploadPickerDialogProps {
  intakeImportOpen: boolean;
  setIntakeImportOpen: Dispatch<SetStateAction<boolean>>;
  setIntakeSelectedFileKey: Dispatch<SetStateAction<string>>;
  setIntakeSearch: Dispatch<SetStateAction<string>>;
  setIntakeError: Dispatch<SetStateAction<string>>;
  intakeRequirementTitle: string;
  intakeSearch: string;
  loadMemberStandaloneIntakes: () => Promise<void>;
  intakeLoading: boolean;
  firestore: Firestore;
  intakeError: string;
  intakeUploads: StandaloneUploadRow[];
  intakeSelectedFileKey: string;
  importStandaloneIntoSlot: (params: { fileKey: string; requirementTitle: string; }) => Promise<void>;
}

export function IntakeUploadPickerDialog({
  intakeImportOpen,
  setIntakeImportOpen,
  setIntakeSelectedFileKey,
  setIntakeSearch,
  setIntakeError,
  intakeRequirementTitle,
  intakeSearch,
  loadMemberStandaloneIntakes,
  intakeLoading,
  firestore,
  intakeError,
  intakeUploads,
  intakeSelectedFileKey,
  importStandaloneIntoSlot,
}: IntakeUploadPickerDialogProps) {
  return (
    <Dialog
      open={intakeImportOpen}
      onOpenChange={(open) => {
        setIntakeImportOpen(open);
        if (!open) {
          setIntakeSelectedFileKey('');
          setIntakeSearch('');
          setIntakeError('');
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="min-w-0">
            Import from Standalone Uploads
          </DialogTitle>
          <DialogDescription className="min-w-0">
            Attach a pending standalone intake upload into this slot: <span className="font-medium">{intakeRequirementTitle || '—'}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex-1 min-w-0">
              <Label htmlFor="intake-search" className="sr-only">Search</Label>
              <Input
                id="intake-search"
                value={intakeSearch}
                onChange={(e) => setIntakeSearch(e.target.value)}
                placeholder="Search document type / filename…"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadMemberStandaloneIntakes()} disabled={intakeLoading || !firestore}>
              {intakeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>

          {intakeError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unable to load standalone uploads</AlertTitle>
              <AlertDescription className="break-words">{intakeError}</AlertDescription>
            </Alert>
          )}

          {!intakeError && !intakeLoading && intakeUploads.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No pending standalone uploads found for this member.
            </div>
          )}

          <RadioGroup value={intakeSelectedFileKey} onValueChange={setIntakeSelectedFileKey} className="space-y-3">
            {(intakeUploads || [])
              .filter((u) => {
                const q = String(intakeSearch || '').trim().toLowerCase();
                if (!q) return true;
                const hay = `${u.documentType || ''} ${u.memberName || ''} ${u.medicalRecordNumber || ''} ${u.files.map(f => f.fileName).join(' ')}`.toLowerCase();
                return hay.includes(q);
              })
              .slice(0, 50)
              .map((u) => (
                <Card key={u.id} className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-start justify-between gap-2 min-w-0">
                      <span className="truncate">{u.documentType || 'Standalone upload'}</span>
                      <Badge variant="outline" className="shrink-0">
                        {u.createdAtMs ? new Date(u.createdAtMs).toLocaleDateString() : '—'}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="min-w-0">
                      <span className="truncate block">{u.memberName || '—'}</span>
                      <span className="truncate block">
                        {u.healthPlan ? `${u.healthPlan} • ` : ''}{u.medicalRecordNumber ? `MRN ${u.medicalRecordNumber}` : 'MRN —'}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {u.files.map((f, idx) => {
                        const key = `${u.id}:${idx}`;
                        return (
                          <div key={key} className="flex items-start gap-2">
                            <RadioGroupItem value={key} id={`intake-file-${key}`} />
                            <label htmlFor={`intake-file-${key}`} className="min-w-0 text-sm leading-snug cursor-pointer">
                              <span className="block truncate font-medium">{f.fileName}</span>
                              <span className="block text-xs text-muted-foreground truncate">{u.id}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </RadioGroup>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIntakeImportOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void importStandaloneIntoSlot({ fileKey: intakeSelectedFileKey, requirementTitle: intakeRequirementTitle })}
              disabled={!intakeSelectedFileKey || !intakeRequirementTitle}
            >
              Attach to slot
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
