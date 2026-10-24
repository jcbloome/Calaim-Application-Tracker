'use client';

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Eye, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { type PortalActivityItem } from './application-detail-types';
import { type Dispatch, type SetStateAction } from 'react';

export interface MemberPortalLoginLogProps {
  familyPortalAccessSummary: { accessed: boolean; hasPortalLogin: boolean; hasLinkedAccount: boolean; firstLoginLabel: string; submittedLabel: string; lastActivityLabel: string; lastLoginLabel: string; lastAttemptLabel: string; lastAttemptSuccess: boolean | null; linkedAtLabel: string; contactLabel: string; successCount: number; failedCount: number; subsequentLoginCount: number; totalAttempts: number; activityItems: PortalActivityItem[]; isLoadingLog: boolean; };
  familyPortalLoginExpanded: boolean;
  setFamilyPortalLoginExpanded: Dispatch<SetStateAction<boolean>>;
  setMemberPortalLoginRefreshKey: Dispatch<SetStateAction<number>>;
  isLoadingMemberPortalLoginLog: boolean;
}

export function MemberPortalLoginLog({
  familyPortalAccessSummary,
  familyPortalLoginExpanded,
  setFamilyPortalLoginExpanded,
  setMemberPortalLoginRefreshKey,
  isLoadingMemberPortalLoginLog,
}: MemberPortalLoginLogProps) {
  return (
    <div className="order-[91]">
      {familyPortalAccessSummary.accessed || familyPortalAccessSummary.totalAttempts > 0 ? (
        <Collapsible
          open={familyPortalLoginExpanded}
          onOpenChange={(open) => {
            setFamilyPortalLoginExpanded(open);
            if (open) setMemberPortalLoginRefreshKey((key) => key + 1);
          }}
          className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sm text-sky-950"
        >
          <div className="flex items-start gap-2 font-medium leading-snug">
            <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            <div className="min-w-0">
              <div>Member portal login log</div>
              {familyPortalAccessSummary.contactLabel ? (
                <div className="mt-0.5 break-all text-xs font-normal text-sky-800/90">
                  {familyPortalAccessSummary.contactLabel}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-1.5 space-y-0.5 text-xs text-sky-800/90">
            {familyPortalAccessSummary.isLoadingLog ? (
              <div>Checking login history…</div>
            ) : (
              <>
                {familyPortalAccessSummary.firstLoginLabel ? (
                  <div>
                    First login:{' '}
                    <span className="font-medium">{familyPortalAccessSummary.firstLoginLabel}</span>
                  </div>
                ) : familyPortalAccessSummary.linkedAtLabel ? (
                  <div>Linked: {familyPortalAccessSummary.linkedAtLabel} (no login yet)</div>
                ) : (
                  <div>No portal login logged yet</div>
                )}
                {familyPortalAccessSummary.submittedLabel ? (
                  <div>
                    Application submitted:{' '}
                    <span className="font-medium">{familyPortalAccessSummary.submittedLabel}</span>
                  </div>
                ) : null}
                {familyPortalAccessSummary.lastActivityLabel ? (
                  <div>
                    Last activity:{' '}
                    <span className="font-medium">{familyPortalAccessSummary.lastActivityLabel}</span>
                    {familyPortalAccessSummary.lastLoginLabel &&
                    familyPortalAccessSummary.lastLoginLabel !==
                      familyPortalAccessSummary.firstLoginLabel
                      ? ` · last login ${familyPortalAccessSummary.lastLoginLabel}`
                      : ''}
                  </div>
                ) : familyPortalAccessSummary.lastAttemptLabel &&
                  !familyPortalAccessSummary.firstLoginLabel ? (
                  <div>
                    Last attempt:{' '}
                    <span className="font-medium">{familyPortalAccessSummary.lastAttemptLabel}</span>
                    {familyPortalAccessSummary.lastAttemptSuccess === false ? ' (failed)' : ''}
                  </div>
                ) : null}
                {familyPortalAccessSummary.totalAttempts > 0 ? (
                  <div>
                    {familyPortalAccessSummary.successCount} successful ·{' '}
                    {familyPortalAccessSummary.failedCount} failed
                    {familyPortalAccessSummary.subsequentLoginCount > 0
                      ? ` · ${familyPortalAccessSummary.subsequentLoginCount} later login${
                          familyPortalAccessSummary.subsequentLoginCount === 1 ? '' : 's'
                        }`
                      : ''}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 h-7 w-full justify-start px-1.5 text-xs text-sky-950 hover:bg-sky-100"
            >
              <ChevronDown
                className={cn(
                  'mr-1 h-3.5 w-3.5 shrink-0 transition-transform',
                  familyPortalLoginExpanded && 'rotate-180'
                )}
              />
              {familyPortalLoginExpanded
                ? 'Hide portal activity'
                : `Show portal activity${
                    familyPortalAccessSummary.activityItems.length
                      ? ` (${familyPortalAccessSummary.activityItems.length})`
                      : familyPortalAccessSummary.totalAttempts
                        ? ` (${familyPortalAccessSummary.totalAttempts})`
                        : ''
                  }`}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 space-y-2">
            {isLoadingMemberPortalLoginLog ? (
              <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-white/70 p-2 text-xs text-sky-950">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : familyPortalAccessSummary.activityItems.length === 0 ? (
              <div className="rounded-md border border-sky-200 bg-white/70 p-2 text-xs text-sky-950">
                No portal login or submission activity logged yet.
              </div>
            ) : (
              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
                {familyPortalAccessSummary.activityItems.map((item) => {
                  const timestampLabel = item.atMs
                    ? format(new Date(item.atMs), 'MMM d, yyyy h:mm a')
                    : 'Time unavailable';
                  const badgeClass =
                    item.kind === 'first_login'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      : item.kind === 'submitted'
                        ? 'border-violet-300 bg-violet-50 text-violet-900'
                        : item.kind === 'login_failed'
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : item.kind === 'upload' || item.kind === 'form'
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-sky-300 bg-sky-50 text-sky-800';
                  const badgeLabel =
                    item.kind === 'first_login'
                      ? 'First login'
                      : item.kind === 'submitted'
                        ? 'Submitted'
                        : item.kind === 'login'
                          ? 'Login'
                          : item.kind === 'login_failed'
                            ? 'Failed'
                            : item.kind === 'upload'
                              ? 'Upload'
                              : 'Form';
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'rounded-md border bg-white/80 px-2 py-1.5 text-xs',
                        item.kind === 'login_failed' ? 'border-red-200' : 'border-sky-200'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn('text-[10px]', badgeClass)}>
                          {badgeLabel}
                        </Badge>
                        <span className="font-medium text-slate-800">{timestampLabel}</span>
                      </div>
                      <div className="mt-1 text-slate-700">{item.label}</div>
                      {item.detail ? (
                        <div className="mt-0.5 break-all text-[11px] text-slate-600">{item.detail}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900">
          Family has not accessed the portal for this application yet.
        </div>
      )}
    </div>
  );
}
