'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Mail } from 'lucide-react';
import type { Application } from '@/lib/definitions';
import { format } from 'date-fns';
import { QaDoneMeta } from './shared';
import { getIntroEmailLastSentAtMs } from './application-detail-helpers';

export function IntroductoryEmailDialog({
  application,
  buttonVariant = 'outline',
  buttonClassName = 'w-full justify-start gap-2',
  buttonLabel,
}: {
  application: Application;
  buttonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  buttonClassName?: string;
  buttonLabel?: string;
}) {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const appUserId = String(searchParams.get('userId') || '').trim();
  const primaryContactEmail = String((application as any)?.bestContactEmail || '').trim();
  const lastSentAtMs = getIntroEmailLastSentAtMs(application as any);
  const lastSentTo = String((application as any)?.introEmailLastSentTo || '').trim();
  const lastSentShortLabel = useMemo(() => {
    if (!lastSentAtMs) return '';
    try {
      return format(new Date(lastSentAtMs), 'MMM d, yyyy');
    } catch {
      return '';
    }
  }, [lastSentAtMs]);
  const introInviteHistoryLabel = useMemo(() => {
    const raw = Array.isArray((application as any)?.introEmailSendHistory)
      ? ((application as any).introEmailSendHistory as Array<any>)
      : [];
    if (!raw.length) return '';
    const sorted = [...raw]
      .map((entry) => {
        const iso = String(entry?.sentAtIso || '').trim();
        const ms = iso ? new Date(iso).getTime() : 0;
        return { iso, ms };
      })
      .filter((entry) => Boolean(entry.iso) && Number.isFinite(entry.ms) && entry.ms > 0)
      .sort((a, b) => a.ms - b.ms);
    if (!sorted.length) return '';
    const first = sorted[0];
    const second = sorted[1];
    const firstLabel = format(new Date(first.ms), 'MMM d, yyyy h:mm a');
    if (!second) return `1st invite: ${firstLabel}`;
    const secondLabel = format(new Date(second.ms), 'MMM d, yyyy h:mm a');
    return `1st invite: ${firstLabel} • 2nd invite: ${secondLabel}`;
  }, [application]);

  const hasAssignedCaseManager = Boolean(String((application as any)?.assignedStaffId || '').trim());
  const caspioClientId2 = String(
    (application as any)?.clientId2 ||
      (application as any)?.client_ID2 ||
      (application as any)?.caspioClientId2 ||
      (application as any)?.caspioMatchedClientId2 ||
      ''
  ).trim();
  const isCaspioEstablished = Boolean((application as any)?.caspioSent) || Boolean(caspioClientId2);
  const pageHref = `/admin/applications/${encodeURIComponent(String(application.id || ''))}/email-primary-contact${
    appUserId ? `?userId=${encodeURIComponent(appUserId)}` : ''
  }`;

  return (
    <div className="space-y-1">
      <Button
        asChild={isCaspioEstablished}
        variant={buttonVariant}
        className={`${buttonClassName} flex items-center`}
        disabled={!isCaspioEstablished}
        title={
          !isCaspioEstablished
            ? 'Push member to Caspio before sending introduction email'
            : !primaryContactEmail
              ? 'Add primary contact email first'
              : undefined
        }
      >
        {isCaspioEstablished ? (
          <Link href={pageHref} className="flex w-full items-center gap-2">
            <Mail className="h-4 w-4" />
            <span className="qa-label">
              {buttonLabel ||
                (lastSentAtMs ? 'Re-email Primary Contact' : 'Email Primary Contact')}
            </span>
            <span className="ml-auto inline-flex shrink-0">
              <QaDoneMeta done={Boolean(lastSentAtMs)} atMs={lastSentAtMs || undefined} />
            </span>
          </Link>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            <span className="qa-label">
              {buttonLabel ||
                (lastSentAtMs ? 'Re-email Primary Contact' : 'Email Primary Contact')}
            </span>
            <span className="ml-auto inline-flex shrink-0">
              <QaDoneMeta done={Boolean(lastSentAtMs)} atMs={lastSentAtMs || undefined} />
            </span>
          </>
        )}
      </Button>
      {lastSentShortLabel ? (
        <div className="flex items-center gap-1 pl-1 text-[11px] font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Sent {lastSentShortLabel}{lastSentTo ? ` to ${lastSentTo}` : ''}</span>
        </div>
      ) : null}
      {introInviteHistoryLabel ? (
        <div className="text-[11px] text-muted-foreground">
          {introInviteHistoryLabel}
        </div>
      ) : null}
      {!isCaspioEstablished ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Establish this member in Caspio (Push to Caspio) before sending the primary introduction email.
        </div>
      ) : (!hasAssignedCaseManager || !primaryContactEmail) ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {!hasAssignedCaseManager
            ? 'Assign case manager before sending this email.'
            : 'Add primary contact email before sending this email.'}
        </div>
      ) : null}
    </div>
  );
}
