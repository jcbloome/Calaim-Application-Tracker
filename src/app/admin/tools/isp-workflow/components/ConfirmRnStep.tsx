'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isUsableSwEmail, clean, type StaffOption } from './isp-workflow-helpers';
import { type Dispatch, type SetStateAction } from 'react';
import type { useToast } from '@/hooks/use-toast';

export interface ConfirmRnStepProps {
  confirmedRn: boolean;
  confirmedFirstReviewer: boolean;
  assessorType: "msw" | "rn";
  assignedRn: StaffOption;
  rnUid: string;
  setRnUid: Dispatch<SetStateAction<string>>;
  setConfirmedRn: Dispatch<SetStateAction<boolean>>;
  rnOptions: StaffOption[];
  staffOptions: StaffOption[];
  socialWorkerEmail: string;
  toast: ReturnType<typeof useToast>['toast'];
}

export function ConfirmRnStep({
  confirmedRn,
  confirmedFirstReviewer,
  assessorType,
  assignedRn,
  rnUid,
  setRnUid,
  setConfirmedRn,
  rnOptions,
  staffOptions,
  socialWorkerEmail,
  toast,
}: ConfirmRnStepProps) {
  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        confirmedRn ? 'border-green-300' : !confirmedFirstReviewer ? 'opacity-70' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">3</Badge>
        Confirm RN
        {confirmedRn ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
      </div>
      <label className="mb-1 block text-xs font-medium">
        {assessorType === 'rn'
          ? 'Assigned RN (same RN — ALFT + final approval)'
          : 'Assigned RN (after SW signature)'}
      </label>
      {assessorType === 'rn' ? (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm">
          <div className="font-medium">{assignedRn.label}</div>
          <div className="text-xs text-muted-foreground">{assignedRn.email}</div>
          <div className="mt-1 text-[11px] text-violet-900">
            Locked to the RN assessor from step 1. After admin review, final approval returns to
            this same RN.
          </div>
        </div>
      ) : (
        <select
          className="h-10 w-full rounded border border-input bg-background px-2 text-sm"
          value={rnUid}
          disabled={!confirmedFirstReviewer}
          onChange={(e) => {
            setRnUid(e.target.value);
            setConfirmedRn(false);
          }}
        >
          {(rnOptions.length ? rnOptions : staffOptions).map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.label} ({s.email})
            </option>
          ))}
        </select>
      )}
      {assessorType === 'msw' ? (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Default: leslie@carehomefinders.com
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="mt-2"
        variant={confirmedRn ? 'outline' : 'default'}
        disabled={!confirmedFirstReviewer || (assessorType === 'rn' && !isUsableSwEmail(socialWorkerEmail))}
        onClick={() => {
          if (assessorType === 'rn') {
            const match =
              rnOptions.find(
                (r) =>
                  clean(r.email).toLowerCase() === clean(socialWorkerEmail).toLowerCase()
              ) || null;
            if (match) setRnUid(match.uid);
          }
          setConfirmedRn(true);
          toast({
            title: 'RN confirmed',
            description: `${assignedRn.label} · ${assignedRn.email}`,
            className: 'bg-green-100 text-green-900 border-green-200',
          });
        }}
      >
        {confirmedRn ? 'Confirmed' : 'Confirm RN'}
      </Button>
    </div>
  );
}
