'use client';

import {
  resolveKaiserReferralMailingAddress,
  composeReferralAddressLine,
  resolveKaiserReferralCurrentLocation,
} from '@/lib/kaiser-referral-addresses';
import {
  resolveReferralAuthorizedCaregiver,
  resolveReferralBestContactParams,
} from '@/lib/kaiser-referral-caregiver';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { type Application } from '@/lib/definitions';
import { type User } from 'firebase/auth';

export interface KaiserReferralQuickActionProps {
  isKaiserPlan: boolean;
  application: Application;
  applicationId: string;
  appUserId: string;
  user: User | null;
  isKaiserAuthReceivedIntake: boolean;
  kaiserReferralSubmission: any;
  logKaiserReferralFormGenerated: () => Promise<void>;
  kaiserReferralFormGeneratedAtLabel: string;
  kaiserReferralFormGeneratedByName: string;
  kaiserReferralFormGeneratedByEmail: string;
  assignedStaffName: string;
  kaiserStep5Required: boolean;
  kaiserStep5Acknowledged: boolean;
  kaiserStep5AcknowledgedAtLabel: string;
}

export function KaiserReferralQuickAction({
  isKaiserPlan,
  application,
  applicationId,
  appUserId,
  user,
  isKaiserAuthReceivedIntake,
  kaiserReferralSubmission,
  logKaiserReferralFormGenerated,
  kaiserReferralFormGeneratedAtLabel,
  kaiserReferralFormGeneratedByName,
  kaiserReferralFormGeneratedByEmail,
  assignedStaffName,
  kaiserStep5Required,
  kaiserStep5Acknowledged,
  kaiserStep5AcknowledgedAtLabel,
}: KaiserReferralQuickActionProps) {
  return (
    <>
      {isKaiserPlan ? (() => {
        const appSource = application as any;
        const qaMemberAddress =
          resolveKaiserReferralMailingAddress(appSource) ||
          composeReferralAddressLine({
            street: appSource?.currentAddress,
            city: appSource?.currentCity,
            state: appSource?.currentState,
            zip: appSource?.currentZip,
          });
        const qaCurrentLiving = resolveKaiserReferralCurrentLocation(appSource);
        const qaReferrerName = `${String((application as any)?.referrerFirstName || '').trim()} ${String((application as any)?.referrerLastName || '').trim()}`.trim();
        const qaMemberPhone =
          String((application as any)?.memberPhone || '').trim() ||
          String((application as any)?.bestContactPhone || '').trim();
        const qaMemberEmail =
          String((application as any)?.memberEmail || '').trim() ||
          String((application as any)?.bestContactEmail || '').trim();
        const qaReferralQuery = new URLSearchParams({
          applicationId: String(applicationId || ''),
          userId: String(appUserId || ''),
          returnTo: `/admin/applications/${encodeURIComponent(String(applicationId || ''))}?userId=${encodeURIComponent(String(appUserId || ''))}`,
          memberName: `${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim(),
          memberDob: String((application as any)?.memberDob || '').trim(),
          memberPhone: qaMemberPhone,
          memberEmail: qaMemberEmail,
          memberAddress: qaMemberAddress,
          memberMrn: String((application as any)?.memberMrn || '').trim(),
          memberMediCal: String((application as any)?.memberMediCalNum || '').trim(),
          caregiverName: resolveReferralAuthorizedCaregiver(application as any).name,
          caregiverContact: resolveReferralAuthorizedCaregiver(application as any).contact,
          ...resolveReferralBestContactParams(application as any),
          referralDate: format(new Date(), 'yyyy-MM-dd'),
          referrerName: qaReferrerName,
          referrerOrganization: 'Connections Care Home Consultants, LLC',
          referrerNpi: '1508537325',
          referrerAddress: '1763 East Sandalwood Drive, Palm Springs, CA 92262',
          referrerEmail: 'deydry@carehomefinders.com',
          referrerPhone: '800-330-5993',
          referrerRelationship: 'Other',
          currentLocationName: qaCurrentLiving.name,
          currentLocationAddress: qaCurrentLiving.address,
          healthPlan: String((application as any)?.healthPlan || '').trim(),
          memberCounty: String((application as any)?.currentCounty || (application as any)?.memberCounty || '').trim(),
          submitterName: String(user?.displayName || '').trim(),
          submitterEmail: String(user?.email || '').trim().toLowerCase(),
          kaiserAuthAlreadyReceived: isKaiserAuthReceivedIntake ? '1' : '0',
          kaiserReferralSubmittedAtIso: String(kaiserReferralSubmission?.submittedAtIso || '').trim(),
        });
        return (
          <div className="space-y-2">
            {isKaiserAuthReceivedIntake ? (
              <Button
                type="button"
                variant="outline"
                className="qa-trigger border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-100"
                disabled
                title="Authorization already received at intake"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="qa-label">Generate Kaiser Referral Form (Pre-Filled)</span>
              </Button>
            ) : (
              <Button asChild variant="outline" className="qa-trigger border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100">
                <Link
                  href={`/forms/kaiser-referral/printable?${qaReferralQuery.toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void logKaiserReferralFormGenerated();
                  }}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="qa-label">Generate Kaiser Referral Form (Pre-Filled)</span>
                </Link>
              </Button>
            )}
            {kaiserReferralFormGeneratedAtLabel ? (
              <div className="rounded-md border border-blue-200 bg-blue-50/70 p-2 text-xs text-blue-900">
                Referral form generated at {kaiserReferralFormGeneratedAtLabel}
                {(kaiserReferralFormGeneratedByName || kaiserReferralFormGeneratedByEmail)
                  ? ` by ${kaiserReferralFormGeneratedByName || kaiserReferralFormGeneratedByEmail}${kaiserReferralFormGeneratedByName && kaiserReferralFormGeneratedByEmail ? ` (${kaiserReferralFormGeneratedByEmail})` : ''}`
                  : ''}
                .
              </div>
            ) : null}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              Assigned staff:{' '}
              <span className="font-medium text-foreground">
                {assignedStaffName || 'Unassigned'}
              </span>
            </div>
            {kaiserStep5Required ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                {kaiserStep5Acknowledged ? (
                  <>
                    Step 5 acknowledged {kaiserStep5AcknowledgedAtLabel ? `at ${kaiserStep5AcknowledgedAtLabel}` : ''}.<br />
                    Resend is available when override is enabled in the pre-email dialog.
                  </>
                ) : (
                  'Step 5 pending: referral send acknowledgment timestamp will appear after successful send.'
                )}
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                Authorization already received at intake. Referral send workflow is not required for this member.
              </div>
            )}
          </div>
        );
      })() : null}
    </>
  );
}
