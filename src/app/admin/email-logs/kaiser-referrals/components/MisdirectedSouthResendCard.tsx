'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { adminFetch } from '@/lib/admin-fetch';
import { appAlert, appConfirm } from '@/components/AppDialogHost';
import { formatDate, formatDateTime } from '@/lib/format-date';

type Candidate = {
  logId: string;
  memberName: string;
  memberMrn: string;
  clientId2: string;
  applicationId: string;
  originalSentAtIso: string | null;
  originalSubject: string;
  submitterName: string;
  sendCount: number;
  hasStoredPdf: boolean;
  kaiserStatus: string;
  alreadyResent: boolean;
  onMifMaster?: boolean;
  resentAtIso: string | null;
  resentBy: string;
  preselect: boolean;
  preselectReason: string;
};

type CoverSheet = {
  path: string;
  clientIdOrApp: string;
  memberName: string;
  fileName: string;
  createdAtIso: string | null;
  url: string;
};

type ListResponse = {
  misspelledAddress: string;
  correctAddress: string;
  candidates: Candidate[];
  coverSheets: CoverSheet[];
};

type ResendResult = { logId: string; memberName: string; result: 'sent' | 'skipped' | 'failed'; reason?: string };

const ENDPOINT = '/api/admin/kaiser-referrals/misdirected-resend';

export function MisdirectedSouthResendCard() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<ResendResult[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await adminFetch<ListResponse>(ENDPOINT);
      setData(response);
      const next: Record<string, boolean> = {};
      for (const row of response.candidates) if (row.preselect) next[row.logId] = true;
      setSelected(next);
    } catch (error: any) {
      setLoadError(String(error?.message || 'Failed to load misdirected referrals.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const candidates = data?.candidates || [];
  const pending = useMemo(() => candidates.filter((row) => !row.alreadyResent), [candidates]);
  const visible = showAll ? candidates : pending;
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const resultById = useMemo(() => new Map((results || []).map((r) => [r.logId, r])), [results]);

  const handleResend = async () => {
    if (!selectedIds.length) {
      await appAlert('Select at least one referral to resend.');
      return;
    }
    const ok = await appConfirm({
      title: `Resend ${selectedIds.length} Kaiser South referral(s)?`,
      description: `Each original PDF will be emailed to ${data?.correctAddress || 'RegCareCoordCaseMgmt@kp.org'} (CC the staff member who sent the original, kpreferrals@ilshealth.com, jason, and you). Application statuses are not changed.`,
      confirmText: 'Resend',
    });
    if (!ok) return;
    setIsSending(true);
    try {
      const response = await adminFetch<{ sent: number; skipped: number; failed: number; results: ResendResult[] }>(
        ENDPOINT,
        { method: 'POST', json: { logIds: selectedIds } }
      );
      setResults(response.results);
      await appAlert(`Resent ${response.sent}. Skipped ${response.skipped}. Failed ${response.failed}.`);
      await load();
    } catch (error: any) {
      await appAlert(`Resend failed: ${String(error?.message || 'Unknown error')}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!isLoading && !loadError && data && candidates.length === 0 && data.coverSheets.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/40">
      <CardHeader>
        <CardTitle>Kaiser South referrals sent to misspelled address</CardTitle>
        <CardDescription>
          From Jul 8 to Oct 6, 2026 Kaiser South referrals went to {data?.misspelledAddress || 'RegCareCoorCaseMgmt@kp.org'} and
          never reached Kaiser (ILS received them as CC). Resend emails the stored original PDF to{' '}
          {data?.correctAddress || 'RegCareCoordCaseMgmt@kp.org'}, CC the staff member who sent the original request and
          kpreferrals@ilshealth.com. Members already past T2038 Requested, inactive, already resent,
          or on the current MIF consolidated list are not pre-selected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !data ? <div className="text-sm text-muted-foreground">Loading misdirected referrals...</div> : null}
        {loadError ? (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-700">{loadError}</div>
        ) : null}

        {data ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                <span className="font-semibold">{pending.length}</span> member(s) not yet resent ·{' '}
                <span className="font-semibold">{candidates.length - pending.length}</span> already resent ·{' '}
                <span className="font-semibold">{selectedIds.length}</span> selected
              </span>
              <Button size="sm" onClick={() => void handleResend()} disabled={isSending || !selectedIds.length}>
                {isSending ? 'Resending...' : `Resend selected (${selectedIds.length})`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={isLoading || isSending}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Hide already resent' : 'Show already resent'}
              </Button>
            </div>

            {visible.length ? (
              <div className="max-h-[420px] overflow-auto rounded-md border bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left">
                    <tr>
                      <th className="w-8 px-2 py-1.5">
                        <Checkbox
                          checked={visible.some((r) => !r.alreadyResent && r.hasStoredPdf) &&
                            visible.filter((r) => !r.alreadyResent && r.hasStoredPdf).every((r) => selected[r.logId])}
                          onCheckedChange={(checked) => {
                            setSelected((prev) => {
                              const next = { ...prev };
                              for (const r of visible) {
                                if (r.alreadyResent || !r.hasStoredPdf) continue;
                                if (checked === true) next[r.logId] = true;
                                else delete next[r.logId];
                              }
                              return next;
                            });
                          }}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-2 py-1.5">Member</th>
                      <th className="px-2 py-1.5">Originally sent</th>
                      <th className="px-2 py-1.5">Kaiser status</th>
                      <th className="px-2 py-1.5">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const result = resultById.get(row.logId);
                      const disabled = row.alreadyResent || !row.hasStoredPdf;
                      return (
                        <tr key={row.logId} className="border-t align-top">
                          <td className="px-2 py-1.5">
                            <Checkbox
                              checked={Boolean(selected[row.logId])}
                              disabled={disabled}
                              onCheckedChange={(checked) =>
                                setSelected((prev) => {
                                  const next = { ...prev };
                                  if (checked === true) next[row.logId] = true;
                                  else delete next[row.logId];
                                  return next;
                                })
                              }
                              aria-label={`Select ${row.memberName}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {row.clientId2 ? (
                              <Link href={`/admin/members/${encodeURIComponent(row.clientId2)}`} className="font-medium hover:underline">
                                {row.memberName}
                              </Link>
                            ) : (
                              <span className="font-medium">{row.memberName}</span>
                            )}
                            <div className="text-xs text-muted-foreground">
                              MRN {row.memberMrn || 'N/A'}
                              {row.clientId2 ? ` · ID ${row.clientId2}` : ''}
                              {row.sendCount > 1 ? ` · sent ${row.sendCount}x (latest shown)` : ''}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {formatDate(row.originalSentAtIso)}
                            <div className="text-xs text-muted-foreground">{row.submitterName || 'Unknown staff'}</div>
                          </td>
                          <td className="px-2 py-1.5">{row.kaiserStatus || <span className="text-muted-foreground">Unknown</span>}</td>
                          <td className="px-2 py-1.5 text-xs">
                            {row.alreadyResent ? (
                              <Badge variant="secondary">
                                Resent {formatDate(row.resentAtIso)}
                                {row.resentBy ? ` by ${row.resentBy}` : ''}
                              </Badge>
                            ) : row.onMifMaster ? (
                              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-800">
                                On MIF list
                              </Badge>
                            ) : (
                              <span className={row.preselect ? 'text-green-700' : 'text-amber-700'}>{row.preselectReason}</span>
                            )}
                            {row.onMifMaster && !row.alreadyResent ? (
                              <div className="mt-1 text-amber-800">{row.preselectReason}</div>
                            ) : null}
                            {result ? (
                              <div
                                className={
                                  result.result === 'sent'
                                    ? 'mt-1 text-green-700'
                                    : result.result === 'failed'
                                      ? 'mt-1 text-red-700'
                                      : 'mt-1 text-muted-foreground'
                                }
                              >
                                {result.result === 'sent' ? 'Sent' : result.result === 'failed' ? 'Failed' : 'Skipped'}
                                {result.reason ? `: ${result.reason}` : ''}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">All misdirected Kaiser South referrals have been resent.</div>
            )}

            {data.coverSheets.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Cover sheets to review ({data.coverSheets.length})</div>
                <p className="text-xs text-muted-foreground">
                  Kaiser ISP cover sheets emailed Sep 18–23, 2026 were not logged and South ones used the misspelled address.
                  The region was not recorded, so check each South member and resend from the cover sheet tool if needed.
                </p>
                <div className="max-h-[220px] overflow-auto rounded-md border bg-white text-sm">
                  {data.coverSheets.map((sheet) => (
                    <div key={sheet.path} className="flex flex-wrap items-center justify-between gap-2 border-t px-2 py-1.5 first:border-t-0">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{sheet.memberName || 'Unknown member'}</span>
                        <span className="text-xs text-muted-foreground"> · {sheet.clientIdOrApp} · {formatDateTime(sheet.createdAtIso)}</span>
                      </span>
                      {sheet.url ? (
                        <a href={sheet.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2">
                          Open PDF
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
