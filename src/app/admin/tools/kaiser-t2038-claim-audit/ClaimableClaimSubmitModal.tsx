'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ChevronLeft, ChevronRight, Download, Send } from 'lucide-react';
import { CONNECTIONS_CLAIM_SUBMIT_TABLE } from '@/lib/kaiser-t2038-connections-claim-submit';

export type ClaimSubmitTarget = { clientId2: string; monthKey: string; memberName?: string };

type PreviewField = { label: string; value: string };

type ClaimPreview = {
  id: string;
  clientId2: string;
  monthKey: string;
  monthLabel: string;
  dateOfService: string;
  memberName: string;
  blockers: string[];
  displayFields: PreviewField[];
  caspioBody: Record<string, string | number>;
};

export type ClaimPushResult = {
  clientId2: string;
  monthKey: string;
  caspioPushedAt: string;
  caspioClaimPkId?: string;
  alreadyPushed?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ClaimSubmitTarget[];
  getIdToken: () => Promise<string>;
  /** Called after each successful Caspio push so the member grid can mark the month. */
  onPushed?: (results: ClaimPushResult[]) => void;
};

/** Fields that change per claim month — always show. Member/Connections fields show once per member. */
const PER_CLAIM_FIELDS = new Set([
  'Date_of_Service',
  'Claim_Status',
  'Connections_T2038_Total_Charges',
  'Connections_or_RCFE_Claim',
]);

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ClaimableClaimSubmitModal({
  open,
  onOpenChange,
  targets,
  getIdToken,
  onPushed,
}: Props) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [previews, setPreviews] = useState<ClaimPreview[]>([]);
  const [index, setIndex] = useState(0);
  const [pushedIds, setPushedIds] = useState<Set<string>>(new Set());
  const [lastEdi, setLastEdi] = useState('');
  const [showAllFields, setShowAllFields] = useState(false);

  const loadPreviews = useCallback(async () => {
    if (!targets.length) {
      setPreviews([]);
      return;
    }
    setIsLoading(true);
    setLastEdi('');
    setPushedIds(new Set());
    setShowAllFields(false);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/admin/kaiser-t2038-claim-submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'preview',
          targets: targets.map((target) => ({
            clientId2: target.clientId2,
            monthKey: target.monthKey,
          })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `HTTP ${response.status}`));
      }
      const list = Array.isArray(body.previews) ? (body.previews as ClaimPreview[]) : [];
      setPreviews(list);
      setIndex(0);
    } catch (err: unknown) {
      toast({
        title: 'Could not build claim previews',
        description: String((err as { message?: string })?.message || err),
        variant: 'destructive',
      });
      setPreviews([]);
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken, targets, toast]);

  useEffect(() => {
    if (open) void loadPreviews();
  }, [open, loadPreviews]);

  const current = previews[index] || null;
  const prev = index > 0 ? previews[index - 1] : null;
  const sameMemberAsPrev = Boolean(
    current && prev && current.clientId2 && current.clientId2 === prev.clientId2
  );

  const visibleFields = useMemo(() => {
    if (!current) return [];
    const fields = current.displayFields || [];
    if (showAllFields || !sameMemberAsPrev) return fields;
    // Same member as previous claim — only show fields that change (DOS etc.).
    return fields.filter((field) => PER_CLAIM_FIELDS.has(field.label));
  }, [current, sameMemberAsPrev, showAllFields]);

  const pushCurrent = async () => {
    if (!current) return;
    if (current.blockers.length) {
      toast({
        title: 'Claim blocked',
        description: current.blockers.join('; '),
        variant: 'destructive',
      });
      return;
    }
    setIsPushing(true);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/admin/kaiser-t2038-claim-submit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'push',
          previewId: current.id,
          targets: [{ clientId2: current.clientId2, monthKey: current.monthKey }],
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) {
        throw new Error(String(body?.error || `HTTP ${response.status}`));
      }
      setPushedIds((prevSet) => new Set([...prevSet, current.id]));
      if (body.edi) setLastEdi(String(body.edi));
      const pushResults: ClaimPushResult[] = (Array.isArray(body.results) ? body.results : [])
        .filter((row: { ok?: boolean }) => row?.ok)
        .map(
          (row: {
            clientId2: string;
            monthKey: string;
            caspioPushedAt?: string;
            pkId?: string;
            alreadyPushed?: boolean;
          }) => ({
            clientId2: String(row.clientId2 || ''),
            monthKey: String(row.monthKey || ''),
            caspioPushedAt: String(row.caspioPushedAt || new Date().toISOString()),
            caspioClaimPkId: String(row.pkId || ''),
            alreadyPushed: Boolean(row.alreadyPushed),
          })
        );
      if (pushResults.length) onPushed?.(pushResults);
      const already = Boolean(body.results?.[0]?.alreadyPushed);
      toast({
        title: already ? 'Already pushed' : 'Claim pushed to Caspio',
        description: `${current.memberName} · ${current.monthLabel} → ${CONNECTIONS_CLAIM_SUBMIT_TABLE}${
          body.results?.[0]?.pkId ? ` · PK_ID ${body.results[0].pkId}` : ''
        }. No longer pushable.`,
      });
      if (index < previews.length - 1) setIndex((value) => value + 1);
    } catch (err: unknown) {
      toast({
        title: 'Caspio push failed',
        description: String((err as { message?: string })?.message || err),
        variant: 'destructive',
      });
    } finally {
      setIsPushing(false);
    }
  };

  const downloadEdi = () => {
    if (!lastEdi) {
      toast({
        title: 'No EDI yet',
        description: 'Push at least one claim first, then download SDS 837P.',
        variant: 'destructive',
      });
      return;
    }
    downloadTextFile(`kaiser-t2038-sds-${new Date().toISOString().slice(0, 10)}.edi`, lastEdi);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">Claim preview → Caspio</DialogTitle>
          <DialogDescription className="text-xs">
            One claim at a time · {CONNECTIONS_CLAIM_SUBMIT_TABLE}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: 'calc(90vh - 8.5rem)' }}>
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building previews…
            </div>
          ) : !current ? (
            <p className="py-8 text-sm text-muted-foreground">No claims to preview.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{current.memberName}</div>
                  <div className="text-xs text-muted-foreground">
                    {current.clientId2} · {current.monthLabel} · DOS {current.dateOfService || '—'}
                    {pushedIds.has(current.id) ? ' · pushed' : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={index <= 0}
                    onClick={() => setIndex((value) => Math.max(0, value - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1}/{previews.length}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={index >= previews.length - 1}
                    onClick={() => setIndex((value) => Math.min(previews.length - 1, value + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {current.blockers.length > 0 ? (
                <div className="rounded border border-rose-300 bg-rose-50 px-2.5 py-2 text-xs text-rose-950">
                  {current.blockers.join(' · ')}
                </div>
              ) : null}

              {sameMemberAsPrev && !showAllFields ? (
                <button
                  type="button"
                  className="text-xs text-sky-800 underline-offset-2 hover:underline"
                  onClick={() => setShowAllFields(true)}
                >
                  Same member — showing DOS fields only. Show all fields
                </button>
              ) : sameMemberAsPrev && showAllFields ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setShowAllFields(false)}
                >
                  Hide repeated member fields
                </button>
              ) : null}

              <div className="rounded border bg-white">
                {visibleFields.map((field) => (
                  <div
                    key={`${current.id}-${field.label}`}
                    className={`flex items-baseline gap-3 border-t px-2.5 py-1.5 text-sm first:border-t-0 ${
                      field.label === 'Date_of_Service' ? 'bg-amber-50/80' : ''
                    }`}
                  >
                    <span className="w-52 shrink-0 font-mono text-[12px] text-muted-foreground">
                      {field.label}
                    </span>
                    <span className="min-w-0 flex-1 break-words font-medium">
                      {field.label === 'Claim_Status' && !field.value ? '(blank)' : field.value || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t px-4 py-2.5 sm:justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!lastEdi} onClick={downloadEdi}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              SDS EDI
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !current || isLoading || isPushing || current.blockers.length > 0 || pushedIds.has(current.id)
              }
              onClick={() => void pushCurrent()}
            >
              {isPushing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              Push this claim
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
