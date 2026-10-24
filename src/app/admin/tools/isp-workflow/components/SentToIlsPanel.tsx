'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { type KaiserMember, type StaffOption } from './isp-workflow-helpers';
import { type Dispatch, type SetStateAction } from 'react';

export interface SentToIlsPanelProps {
  sentToIlsSource: string;
  sentToIlsManual: boolean;
  sentToIlsVerifierUid: string;
  sentToIlsSaving: boolean;
  selectedMember: KaiserMember;
  setSentToIlsVerifierUid: Dispatch<SetStateAction<string>>;
  ilsVerifierStaffOptions: StaffOption[];
  saveSentToIlsManual: (nextChecked: boolean, nextDateYmd?: string | undefined) => Promise<void>;
  sentToIlsDate: string;
  setSentToIlsDate: Dispatch<SetStateAction<string>>;
  sentToIlsVerifiedByName: string;
  sentToIlsVerifiedAtIso: string;
  sentToIlsVerifiedByEmail: string;
}

export function SentToIlsPanel({
  sentToIlsSource,
  sentToIlsManual,
  sentToIlsVerifierUid,
  sentToIlsSaving,
  selectedMember,
  setSentToIlsVerifierUid,
  ilsVerifierStaffOptions,
  saveSentToIlsManual,
  sentToIlsDate,
  setSentToIlsDate,
  sentToIlsVerifiedByName,
  sentToIlsVerifiedAtIso,
  sentToIlsVerifiedByEmail,
}: SentToIlsPanelProps) {
  return (
    <div className="rounded-md border border-teal-200 bg-teal-50/60 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-teal-950">Sent to ILS</div>
          <p className="text-xs text-teal-900/80 mt-0.5">
            Select the staff member verifying Sent to ILS, confirm, and enter the date sent. This
            archives the packet on ISP Tracker.
          </p>
        </div>
        {sentToIlsSource === 'cover_package' ? (
          <Badge className="bg-teal-700">From cover package send</Badge>
        ) : sentToIlsManual ? (
          <Badge variant="outline" className="border-teal-600 text-teal-800">
            Manual
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <div className="text-xs text-teal-900/80">Verified by (staff)</div>
          <select
            className="h-9 min-w-[220px] rounded-md border border-teal-200 bg-white px-2 text-sm"
            value={sentToIlsVerifierUid}
            disabled={sentToIlsSaving || !selectedMember}
            onChange={(e) => setSentToIlsVerifierUid(e.target.value)}
          >
            <option value="">Select staff…</option>
            {ilsVerifierStaffOptions.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.label} · {s.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-white px-3 py-2">
          <Checkbox
            id="sent-to-ils-manual"
            checked={sentToIlsManual}
            disabled={sentToIlsSaving || !selectedMember || !sentToIlsVerifierUid}
            onCheckedChange={(checked) => {
              void saveSentToIlsManual(Boolean(checked));
            }}
          />
          <Label htmlFor="sent-to-ils-manual" className="text-sm cursor-pointer">
            I confirm Sent to ILS
          </Label>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-teal-900/80">Date sent</div>
          <Input
            type="date"
            className="h-9 w-[170px] bg-white"
            value={sentToIlsDate}
            disabled={sentToIlsSaving || !selectedMember}
            onChange={(e) => setSentToIlsDate(e.target.value)}
            onBlur={() => {
              if (sentToIlsManual && sentToIlsDate && sentToIlsVerifierUid) {
                void saveSentToIlsManual(true, sentToIlsDate);
              }
            }}
          />
        </div>
        {sentToIlsSaving ? (
          <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
        ) : null}
      </div>
      {sentToIlsManual && (sentToIlsVerifiedByName || sentToIlsVerifiedAtIso) ? (
        <div className="rounded border border-teal-200 bg-white/80 px-3 py-2 text-xs text-teal-950">
          Verified by{' '}
          <span className="font-medium">
            {sentToIlsVerifiedByName || sentToIlsVerifiedByEmail || 'Staff'}
          </span>
          {sentToIlsVerifiedByEmail ? ` · ${sentToIlsVerifiedByEmail}` : ''}
          {sentToIlsVerifiedAtIso
            ? ` · ${new Date(sentToIlsVerifiedAtIso).toLocaleString()}`
            : ''}
          {sentToIlsDate ? ` · Sent date ${sentToIlsDate}` : ''}
        </div>
      ) : null}
    </div>
  );
}
