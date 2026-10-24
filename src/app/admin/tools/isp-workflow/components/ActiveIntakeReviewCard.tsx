'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Send, CheckCircle2, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Textarea } from '@/components/ui/textarea';
import { type ActiveIntake, type AnswerMap, type DownloadLog } from './isp-workflow-helpers';
import { type Dispatch, type SetStateAction } from 'react';

export interface ActiveIntakeReviewCardProps {
  activeIntake: ActiveIntake | null;
  importedCompletedIsp: boolean;
  adminOverrideMsw: boolean;
  saveFormEdits: (opts?: { quiet?: boolean | undefined; preserveBusy?: boolean | undefined; exactPacketAnswers?: AnswerMap | undefined; } | undefined) => Promise<boolean>;
  busyAction: string;
  canFirstReview: boolean;
  acceptAndSendForSignature: () => Promise<void>;
  confirmEdits: boolean;
  swAlreadySigned: boolean;
  awaitingRnSignature: boolean;
  sentToRnLabel: string;
  rnAlreadySigned: boolean;
  adminOverrideRn: boolean;
  canResendToRnForNewSignature: boolean;
  openResendRnDialog: () => void;
  canFinalReview: boolean;
  canDownloadPacket: boolean;
  completeFinalReview: () => Promise<void>;
  downloadAndLog: (opts?: { archivedAtIso?: string | undefined; } | undefined) => Promise<void>;
  lastDownloadName: string;
  lastDownloadedAt: string;
  rejectReason: string;
  setRejectReason: Dispatch<SetStateAction<string>>;
  requestChanges: () => Promise<void>;
  downloadLogs: DownloadLog[];
  redownloadLog: (logId: string) => Promise<void>;
}

export function ActiveIntakeReviewCard({
  activeIntake,
  importedCompletedIsp,
  adminOverrideMsw,
  saveFormEdits,
  busyAction,
  canFirstReview,
  acceptAndSendForSignature,
  confirmEdits,
  swAlreadySigned,
  awaitingRnSignature,
  sentToRnLabel,
  rnAlreadySigned,
  adminOverrideRn,
  canResendToRnForNewSignature,
  openResendRnDialog,
  canFinalReview,
  canDownloadPacket,
  completeFinalReview,
  downloadAndLog,
  lastDownloadName,
  lastDownloadedAt,
  rejectReason,
  setRejectReason,
  requestChanges,
  downloadLogs,
  redownloadLog,
}: ActiveIntakeReviewCardProps) {
  return (
    <>
      {activeIntake ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active intake review</CardTitle>
            <CardDescription>
              {activeIntake.memberName || 'Member'} · Status:{' '}
              <span className="font-medium">{activeIntake.workflowStatus || '—'}</span>
              {activeIntake.alftStaffEmail ? ` · Staff: ${activeIntake.alftStaffName || activeIntake.alftStaffEmail}` : ''}
              {activeIntake.alftRnEmail ? ` · RN: ${activeIntake.alftRnName || activeIntake.alftRnEmail}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Confirm edits at the bottom of the ALFT form before Approve / Send / Final Review.
            </p>
            {importedCompletedIsp || adminOverrideMsw ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                <span className="font-medium">MSW signature bypass:</span> this ISP was imported as already signed
                {adminOverrideMsw ? ' (admin override on)' : ''}. Use{' '}
                <span className="font-medium">Approve → Send to RN</span> — the social worker will not be asked to
                e-sign again.
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void saveFormEdits()} disabled={Boolean(busyAction)}>
                {busyAction === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Form Edits
              </Button>
              {canFirstReview ? (
                <Button
                  onClick={() => void acceptAndSendForSignature()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                >
                  {busyAction === 'accept' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {swAlreadySigned ? 'Approve → Send to RN' : 'Accept → SW Signature'}
                </Button>
              ) : null}
              {awaitingRnSignature ? (
                <Button
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled
                  title="Packet already sent — awaiting RN electronic signature"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {sentToRnLabel}
                </Button>
              ) : null}
              {rnAlreadySigned && !canFirstReview && !awaitingRnSignature ? (
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled>
                  {adminOverrideRn ? 'RN signed (admin override)' : 'RN signed'}
                </Button>
              ) : null}
              {canResendToRnForNewSignature ? (
                <Button
                  variant="outline"
                  onClick={() => openResendRnDialog()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                  title={
                    !confirmEdits
                      ? 'Confirm edits required before resending'
                      : rnAlreadySigned
                        ? 'Clear prior RN signature and request a new one'
                        : 'Re-send RN signature request email'
                  }
                >
                  {busyAction === 'resend-rn' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {rnAlreadySigned ? 'Resend → RN (new signature)' : 'Resend → RN'}
                </Button>
              ) : null}
              {canFinalReview || canDownloadPacket ? (
                <Button
                  variant="outline"
                  onClick={() => void completeFinalReview()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                >
                  {busyAction === 'final' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Complete Final Review
                </Button>
              ) : null}
              {canDownloadPacket ? (
                <Button onClick={() => void downloadAndLog()} disabled={Boolean(busyAction)}>
                  {busyAction === 'download' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {lastDownloadName ? 'Download again & Log' : 'Download & Log'}
                </Button>
              ) : null}
            </div>
            {lastDownloadName ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                <div className="font-medium">Downloaded on this page</div>
                <div className="mt-0.5 truncate" title={lastDownloadName}>
                  {lastDownloadName}
                </div>
                {lastDownloadedAt ? (
                  <div className="mt-0.5 text-emerald-900">
                    {new Date(lastDownloadedAt).toLocaleString()}
                  </div>
                ) : null}
                <Button variant="link" size="sm" className="mt-1 h-auto p-0" asChild>
                  <Link href="/admin/tools/isp-downloads">Open ISP Download Archive</Link>
                </Button>
              </div>
            ) : null}

            {canFirstReview ? (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-sm font-medium">Request changes (return to SW)</div>
                <p className="text-xs text-muted-foreground">
                  {swAlreadySigned
                    ? 'SW already signed on submit. Use Approve → Send to RN if the form is good (or after your edits). Only send back when the SW must revise and re-sign.'
                    : 'Return with comments so the SW can revise, sign, and re-submit.'}
                </p>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Describe what the social worker needs to fix…"
                  rows={3}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void requestChanges()}
                  disabled={!confirmEdits || Boolean(busyAction)}
                >
                  {busyAction === 'reject' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send Back to Social Worker
                </Button>
              </div>
            ) : null}

            {downloadLogs.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Archived versions (this intake)</div>
                  <Button variant="link" size="sm" className="h-auto p-0" asChild>
                    <Link href="/admin/tools/isp-downloads">
                      View ISP Download Archive
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="space-y-1">
                  {downloadLogs.map((log) => (
                    <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                      <div>
                        <div className="font-medium">
                          {log.downloadName || 'ALFT packet'}
                          {Number(log.versionNumber) > 0 ? (
                            <span className="ml-1.5 text-[10px] font-semibold text-emerald-800">
                              v{Number(log.versionNumber)}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-muted-foreground">
                          {log.staffName || 'Staff'}
                          {log.createdAt ? ` · ${new Date(log.createdAt).toLocaleString()}` : ''}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void redownloadLog(log.id)}>
                        Re-download
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No archived versions for this intake yet.{' '}
                <Link href="/admin/tools/isp-downloads" className="underline underline-offset-2">
                  Open ISP Download Archive
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
