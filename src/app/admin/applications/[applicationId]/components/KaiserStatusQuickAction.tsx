'use client';

import { Label } from '@/components/ui/label';
import { QaDoneMeta, toMillisSafe, normalizeStatusToken } from './shared';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { Loader2, Link as LinkIcon, RefreshCw } from 'lucide-react';
import {
  applicationInactiveCalaimStatus,
  INACTIVE_CALAIM_STATUSES,
} from '@/lib/inactive-calaim-status';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';
import { type Application } from '@/lib/definitions';

export interface KaiserStatusQuickActionProps {
  isKaiserPlan: boolean;
  kaiserStatusSelectedForCaspio: boolean;
  caspioPushed: boolean;
  kaiserStatusPickerValue: string;
  application: Application;
  showManualKaiserStatusSection: boolean;
  kaiserStatusSelectValue: string;
  isKaiserNotInterested: boolean;
  updateDraftKaiserStatus: (status: string) => Promise<void>;
  kaiserStatusIsUnlisted: boolean;
  prePushKaiserStatusOptions: readonly ["T2038 Received, Need First Contact", "T2038 Received, doc collection", "T2038, Not Requested, Doc Collection", "T2038 Requested", "Not interested"];
  laterKaiserStatusOptions: string[];
  isUpdatingCaspioStatus: boolean;
  effectiveCaspioCalAIMStatus: "" | "Pending" | "Authorized";
  updateCaspioCalAIMStatus: (status: string) => Promise<void>;
  calaimStatusSelectedForCaspio: boolean;
  checkStatusesInCaspioNow: () => Promise<void>;
  isCheckingCaspioStatus: boolean;
}

export function KaiserStatusQuickAction({
  isKaiserPlan,
  kaiserStatusSelectedForCaspio,
  caspioPushed,
  kaiserStatusPickerValue,
  application,
  showManualKaiserStatusSection,
  kaiserStatusSelectValue,
  isKaiserNotInterested,
  updateDraftKaiserStatus,
  kaiserStatusIsUnlisted,
  prePushKaiserStatusOptions,
  laterKaiserStatusOptions,
  isUpdatingCaspioStatus,
  effectiveCaspioCalAIMStatus,
  updateCaspioCalAIMStatus,
  calaimStatusSelectedForCaspio,
  checkStatusesInCaspioNow,
  isCheckingCaspioStatus,
}: KaiserStatusQuickActionProps) {
  return (
    <>
      {isKaiserPlan ? (
        <div className="order-[3] rounded-md border border-blue-200 bg-blue-50/60 p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">3. Kaiser Status *</Label>
              <QaDoneMeta
                done={kaiserStatusSelectedForCaspio || (caspioPushed && Boolean(kaiserStatusPickerValue))}
                atMs={
                  toMillisSafe((application as any)?.kaiserPrePushStatusPickedAt) ||
                  toMillisSafe((application as any)?.kaiserStatusSyncedFromCaspioAt) ||
                  toMillisSafe((application as any)?.kaiserStatusSyncedFromCacheAt) ||
                  toMillisSafe((application as any)?.kaiserStatusUpdatedAt) ||
                  undefined
                }
              />
            </div>
            {showManualKaiserStatusSection ? (
              <div className="mt-2 space-y-2">
                <Select
                  value={kaiserStatusSelectValue}
                  onValueChange={(value) => {
                    if (value === '__none__') {
                      // Only clear when a Caspio push status was selected.
                      // Do not wipe tracker statuses like "T2038 Requested".
                      if (kaiserStatusSelectedForCaspio || isKaiserNotInterested) {
                        void updateDraftKaiserStatus('');
                      }
                      return;
                    }
                    void updateDraftKaiserStatus(value);
                  }}
                >
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Select Kaiser status" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value="__none__">Not selected</SelectItem>
                    {kaiserStatusIsUnlisted ? (
                      <SelectGroup>
                        <SelectLabel className="text-[11px]">Current (from Caspio)</SelectLabel>
                        <SelectItem value={kaiserStatusPickerValue}>{kaiserStatusPickerValue}</SelectItem>
                      </SelectGroup>
                    ) : null}
                    <SelectGroup>
                      <SelectLabel className="text-[11px]">Before Caspio push</SelectLabel>
                      {prePushKaiserStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[11px]">All Kaiser statuses</SelectLabel>
                      {laterKaiserStatusOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {isKaiserNotInterested ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
                    Member marked <span className="font-semibold">Not interested</span>. Logged to the Not
                    Interested list. Caspio push is blocked for this status.
                  </div>
                ) : null}
                {!caspioPushed && kaiserStatusPickerValue && !kaiserStatusSelectedForCaspio && !isKaiserNotInterested ? (
                  <p className="text-[11px] text-muted-foreground">
                    Tracker status: {kaiserStatusPickerValue}. Choose a “Before Caspio push” status above.
                  </p>
                ) : null}
                {!caspioPushed && !kaiserStatusSelectedForCaspio && !isKaiserNotInterested ? (
                  <p className="text-[11px] text-red-700">Required before Push to Caspio.</p>
                ) : null}
                {caspioPushed ? (
                  <p className="text-[11px] text-muted-foreground">
                    Manual changes here update the app only — also change it in Caspio, or the daily check will
                    set it back to Caspio’s value.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                  {kaiserStatusPickerValue || 'Not set'}
                </div>
                <p className="text-xs text-blue-800">Read only. Synced from Caspio.</p>
              </div>
            )}
          </div>

          <div className="border-t border-blue-200/80 pt-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">4. CalAIM Status</Label>
              {isUpdatingCaspioStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </div>
            <div className="mt-2 space-y-2">
              <Select
                value={
                  applicationInactiveCalaimStatus(application as any) ||
                  (effectiveCaspioCalAIMStatus === 'Authorized' || effectiveCaspioCalAIMStatus === 'Pending'
                    ? effectiveCaspioCalAIMStatus
                    : '__none__')
                }
                onValueChange={(value) => {
                  if (value === '__none__') {
                    void updateCaspioCalAIMStatus('');
                    return;
                  }
                  void updateCaspioCalAIMStatus(value);
                }}
                disabled={isUpdatingCaspioStatus}
              >
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Select CalAIM status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not selected</SelectItem>
                  <SelectItem value="Authorized">Authorized</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  {INACTIVE_CALAIM_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {effectiveCaspioCalAIMStatus &&
              effectiveCaspioCalAIMStatus !== 'Authorized' &&
              effectiveCaspioCalAIMStatus !== 'Pending' ? (
                <p className="text-[11px] text-muted-foreground">
                  Caspio CalAIM_Status: <span className="font-medium">{effectiveCaspioCalAIMStatus}</span>
                </p>
              ) : null}
              {!calaimStatusSelectedForCaspio && !caspioPushed ? (
                <p className="text-[11px] text-red-700">
                  Required before Push to Caspio — choose Authorized or Pending.
                </p>
              ) : null}
              {(() => {
                const wantsReferral =
                  normalizeStatusToken(kaiserStatusPickerValue) === normalizeStatusToken('T2038 Requested') ||
                  effectiveCaspioCalAIMStatus === 'Pending';
                if (!wantsReferral) return null;
                const clientId2 = String(
                  (application as any)?.client_ID2 ||
                    (application as any)?.clientId2 ||
                    (application as any)?.Client_ID2 ||
                    (application as any)?.caspioClientId2 ||
                    ''
                ).trim();
                if (!caspioPushed || !clientId2) {
                  return (
                    <p className="text-[11px] text-amber-800">
                      Kaiser Referral Generator opens after this member is pushed to Caspio
                      {caspioPushed && !clientId2 ? ' and Client_ID2 is on the application' : ''}.
                    </p>
                  );
                }
                return (
                  <Button asChild variant="outline" size="sm" className="h-8 w-full bg-background text-xs">
                    <Link
                      href={`/admin/kaiser-referral-generator?clientId2=${encodeURIComponent(clientId2)}&source=caspio`}
                    >
                      <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                      Kaiser Referral Generator
                    </Link>
                  </Button>
                );
              })()}
            </div>
          </div>

          {caspioPushed ? (
            <div className="border-t border-blue-200/80 pt-3 space-y-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full bg-background text-xs"
                onClick={() => void checkStatusesInCaspioNow()}
                disabled={isCheckingCaspioStatus}
              >
                {isCheckingCaspioStatus ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Check Caspio now (Kaiser + CalAIM status)
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Checked daily against Caspio.
                {(() => {
                  const lastMs = Math.max(
                    toMillisSafe((application as any)?.caspioStatusCheckedAt),
                    toMillisSafe((application as any)?.kaiserStatusSyncedFromCaspioAt),
                    toMillisSafe((application as any)?.calaimStatusSyncedFromCaspioAt)
                  );
                  return lastMs > 0 ? ` Last synced ${format(new Date(lastMs), 'MMM d, yyyy h:mm a')}.` : '';
                })()}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
