'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowUp, Loader2, CheckCircle2, Send, Download } from 'lucide-react';
import { IspLayoutModeToggle } from '@/components/alft/IspLayoutModeToggle';
import { writeIspLayoutMode, type IspLayoutMode } from '@/lib/isp-layout-mode';
import { SwStyleAlftEditor } from '@/components/alft/SwStyleAlftEditor';
import {
  isIspAlftLockedField,
  applyAlftPlanIdFromMrn,
  ISP_ALFT_LOCKED_FIELD_IDS,
} from '@/lib/isp-alft-field-rules';
import { normalizeIspAssessmentPurpose } from '@/lib/isp-visit-location';
import {
  clean,
  clientIdOf,
  type AnswerMap,
  type KaiserMember,
  type ActiveIntake,
  type StaffOption,
  type DownloadLog,
} from './isp-workflow-helpers';
import { Button } from '@/components/ui/button';
import { scrollAdminPageToTop } from '@/components/ui/back-to-top';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { type H2022EndWarning } from '@/lib/h2022-end-warning';
import { type Dispatch, type SetStateAction } from 'react';
import { type AlftMedListAttachment } from '@/components/alft/AlftMedListUpload';

export interface IspAssessmentFormCardProps {
  showForm: boolean;
  ispLayoutMode: IspLayoutMode;
  assessmentPurpose: "" | "initial" | "change_condition" | "review";
  reauthH2022Warning: H2022EndWarning | null;
  setIspLayoutMode: Dispatch<SetStateAction<IspLayoutMode>>;
  caspioFilledIds: string[];
  answers: AnswerMap;
  setConfirmEdits: Dispatch<SetStateAction<boolean>>;
  setAnswers: Dispatch<SetStateAction<AnswerMap>>;
  selectedMember: KaiserMember;
  activeIntake: ActiveIntake | null;
  selectedClientId: string;
  medListAttachment: AlftMedListAttachment | null;
  setMedListAttachment: Dispatch<SetStateAction<AlftMedListAttachment | null>>;
  formerSwImportMode: boolean;
  socialWorkerName: string;
  createIntakeFromForm: () => Promise<void>;
  busyAction: string;
  adminOverrideMsw: boolean;
  adminOverrideRn: boolean;
  canFinalReview: boolean;
  awaitingRnSignature: boolean;
  sentToRnLabel: string;
  assignedRn: StaffOption;
  confirmEdits: boolean;
  saveFormEdits: (opts?: { quiet?: boolean | undefined; preserveBusy?: boolean | undefined; exactPacketAnswers?: AnswerMap | undefined; } | undefined) => Promise<boolean>;
  canFirstReview: boolean;
  acceptAndSendForSignature: () => Promise<void>;
  swAlreadySigned: boolean;
  rnAlreadySigned: boolean;
  canResendToRnForNewSignature: boolean;
  openResendRnDialog: () => void;
  completeFinalReview: () => Promise<void>;
  canDownloadPacket: boolean;
  requestIspDownloadConfirm: () => void;
  lastDownloadName: string;
  canBypassRnSignaturesForDownload: boolean;
  lastDownloadedAt: string;
  downloadLogs: DownloadLog[];
  redownloadLog: (logId: string) => Promise<void>;
}

export function IspAssessmentFormCard({
  showForm,
  ispLayoutMode,
  assessmentPurpose,
  reauthH2022Warning,
  setIspLayoutMode,
  caspioFilledIds,
  answers,
  setConfirmEdits,
  setAnswers,
  selectedMember,
  activeIntake,
  selectedClientId,
  medListAttachment,
  setMedListAttachment,
  formerSwImportMode,
  socialWorkerName,
  createIntakeFromForm,
  busyAction,
  adminOverrideMsw,
  adminOverrideRn,
  canFinalReview,
  awaitingRnSignature,
  sentToRnLabel,
  assignedRn,
  confirmEdits,
  saveFormEdits,
  canFirstReview,
  acceptAndSendForSignature,
  swAlreadySigned,
  rnAlreadySigned,
  canResendToRnForNewSignature,
  openResendRnDialog,
  completeFinalReview,
  canDownloadPacket,
  requestIspDownloadConfirm,
  lastDownloadName,
  canBypassRnSignaturesForDownload,
  lastDownloadedAt,
  downloadLogs,
  redownloadLog,
}: IspAssessmentFormCardProps) {
  return (
    <>
      {showForm ? (
        <Card className={ispLayoutMode === 'mobile' ? 'max-w-xl mx-auto' : undefined}>
          <CardHeader>
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Assessment type
              </span>
              {assessmentPurpose === 'initial' ? (
                <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">Initial</Badge>
              ) : assessmentPurpose === 'review' ? (
                <Badge className="bg-violet-100 text-violet-900 hover:bg-violet-100">Reauth</Badge>
              ) : assessmentPurpose === 'change_condition' ? (
                <Badge className="bg-amber-100 text-amber-950 hover:bg-amber-100">
                  Change of condition
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Not selected yet
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {assessmentPurpose === 'initial'
                  ? 'Initial ISP / ALFT assessment'
                  : assessmentPurpose === 'review'
                    ? 'Reassessment / reauthorization'
                    : assessmentPurpose === 'change_condition'
                      ? 'Change of condition assessment'
                      : 'Confirm purpose in step 4 above'}
              </span>
              {reauthH2022Warning?.h2022WarningLabel ? (
                <Badge
                  variant="outline"
                  className={`gap-1 text-xs ${
                    (reauthH2022Warning.h2022DaysUntilEnd ?? 0) < 0
                      ? 'border-red-400 bg-red-50 text-red-900'
                      : 'border-amber-400 bg-amber-50 text-amber-950'
                  }`}
                  title={
                    reauthH2022Warning.h2022EndDate
                      ? `H2022 end ${reauthH2022Warning.h2022EndDate}`
                      : reauthH2022Warning.h2022WarningLabel
                  }
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {reauthH2022Warning.h2022WarningLabel}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>ISP / ALFT Assessment Form</CardTitle>
                <CardDescription>
                  ALFT tool preview for the selected member. Green fields come from Caspio. Complete steps 1–7 and
                  Prefill to finalize before the SW invite. Use Mobile to preview the SW phone-friendly layout.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IspLayoutModeToggle
                  mode={ispLayoutMode}
                  onChange={(mode) => {
                    setIspLayoutMode(mode);
                    writeIspLayoutMode(mode);
                  }}
                />
                <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                  {caspioFilledIds.length} prefilled fields
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <SwStyleAlftEditor
              answers={answers}
              onChange={(id, value) => {
                if (isIspAlftLockedField(id)) return;
                if (
                  id === 'p1_purpose' &&
                  normalizeIspAssessmentPurpose(assessmentPurpose) &&
                  normalizeIspAssessmentPurpose(answers.p1_purpose)
                ) {
                  return;
                }
                setConfirmEdits(false);
                if (id === 'p1_purpose') {
                  const purpose = normalizeIspAssessmentPurpose(value);
                  setAnswers((prev) => ({ ...prev, [id]: purpose || String(value || '') }));
                  return;
                }
                setAnswers((prev) => {
                  const next = { ...prev, [id]: value };
                  if (id === 'p1_mrn' || id === 'p1_plan_id') {
                    return applyAlftPlanIdFromMrn(
                      next,
                      clean(selectedMember?.memberMrn) || clean(activeIntake?.medicalRecordNumber)
                    );
                  }
                  return next;
                });
              }}
              memberName={clean(answers.p1_member_name)}
              memberMrn={clean(answers.p1_mrn)}
              highlightedFieldIds={caspioFilledIds}
              disabledFieldIds={
                normalizeIspAssessmentPurpose(assessmentPurpose) &&
                normalizeIspAssessmentPurpose(answers.p1_purpose)
                  ? [...ISP_ALFT_LOCKED_FIELD_IDS, 'p1_purpose']
                  : [...ISP_ALFT_LOCKED_FIELD_IDS]
              }
              layoutMode={ispLayoutMode}
              memberId={selectedMember ? clientIdOf(selectedMember) : clean(selectedClientId) || undefined}
              medListAttachment={medListAttachment}
              onMedListAttachmentChange={(next) => {
                setConfirmEdits(false);
                setMedListAttachment(next);
              }}
              allowAdminSignatureOverride
            />

            {/* Sticky bottom actions — visible after Page 14 / completed PDF import */}
            <div className="sticky bottom-0 z-30 -mx-1 space-y-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">ISP review actions</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => scrollAdminPageToTop()}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Top of page
                </Button>
              </div>
              {!activeIntake?.id ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/80 p-3">
                  <p className="text-sm text-amber-950">
                    No ISP intake is linked yet (common after uploading a completed PDF). Create one to unlock{' '}
                    <span className="font-medium">Approve → Send to RN</span>, Final Review, and Download
                    {formerSwImportMode
                      ? `. Assessor will be saved as ${clean(socialWorkerName) || 'the name you entered'}.`
                      : '.'}
                  </p>
                  <Button onClick={() => void createIntakeFromForm()} disabled={Boolean(busyAction)}>
                    {busyAction === 'create-intake' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save as ISP intake &amp; unlock actions
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-xs text-muted-foreground">
                    Intake status: <span className="font-medium text-foreground">{activeIntake.workflowStatus || '—'}</span>
                    {adminOverrideMsw || adminOverrideRn
                      ? ` · Admin override${adminOverrideMsw && adminOverrideRn ? 's' : ''} on`
                      : ''}
                  </div>
                  {canFinalReview && !/^[1-5]$/.test(clean(answers?.p14_rn_recommended_tier)) ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      Select <span className="font-semibold">RN agree / suggest tier (1–5)</span> in the signature section,
                      then Complete Final Review. Admin override alone is not enough without a tier.
                    </div>
                  ) : null}
                  {awaitingRnSignature ? (
                    <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-950">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      <div>
                        <div className="font-medium">{sentToRnLabel}</div>
                        <div className="text-xs text-green-900">
                          Awaiting RN electronic signature
                          {clean(activeIntake?.alftRnEmail) || clean(assignedRn?.email)
                            ? ` · ${clean(activeIntake?.alftRnEmail) || clean(assignedRn?.email)}`
                            : ''}
                          . Use Resend only if they need another email.
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
                    <Checkbox
                      id="isp-workflow-confirm-edits-bottom"
                      checked={confirmEdits}
                      onCheckedChange={(v) => setConfirmEdits(Boolean(v))}
                      disabled={Boolean(busyAction)}
                    />
                    <Label htmlFor="isp-workflow-confirm-edits-bottom" className="text-sm leading-relaxed">
                      I confirm these edits are complete and accurate before submitting to the next step.
                    </Label>
                  </div>
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
                        {busyAction === 'accept' ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
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
                    {canFinalReview ? (
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
                      <Button onClick={() => requestIspDownloadConfirm()} disabled={Boolean(busyAction)}>
                        {busyAction === 'download' ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="mr-2 h-4 w-4" />
                        )}
                        {lastDownloadName ? 'Download again & Log' : 'Download & Log'}
                      </Button>
                    ) : null}
                    <Button variant="outline" asChild>
                      <Link
                        href={`/admin/alft-tracker?managerActions=1&edit=${encodeURIComponent(activeIntake.id)}`}
                      >
                        Open in ISP Tracker
                      </Link>
                    </Button>
                  </div>
                  {canBypassRnSignaturesForDownload && !rnAlreadySigned && !canFinalReview ? (
                    <p className="text-xs text-muted-foreground">
                      Imported / departed-SW ISP — new signatures are optional. Use{' '}
                      <span className="font-medium">Download &amp; Log</span> after edits, or still send to RN if
                      you need a fresh RN signature.
                    </p>
                  ) : null}
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
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button variant="link" size="sm" className="h-auto p-0" asChild>
                          <Link href="/admin/tools/isp-downloads">Open ISP Download Archive</Link>
                        </Button>
                        {downloadLogs[0]?.id ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => void redownloadLog(downloadLogs[0].id)}
                          >
                            Re-download last file
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
