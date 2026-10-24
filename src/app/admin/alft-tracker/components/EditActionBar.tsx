'use client';

import { Checkbox } from '@/components/ui/checkbox';
import {
  isAlftRnAdminOverride,
  isAlftTierOption,
  ALFT_TIER_OPTIONS,
} from '@/lib/alft-tier-recommendation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TierLevelDefinitionsLink } from '@/components/alft/TierLevelDefinitionsLink';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { isDefaultAlftRnName, DEFAULT_ALFT_RN_LICENSE_NUMBER } from '@/lib/alft-rn-defaults';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Download, AlertTriangle, Circle, Send } from 'lucide-react';
import {
  hasRnElectronicallySigned,
  ispProgressSummary,
  type StandaloneUpload,
  type IspProgressState,
  type AlftAssignmentQueueRow,
} from './alft-tracker-helpers';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { type Dispatch, type SetStateAction } from 'react';

export interface EditActionBarProps {
  isRnReviewUi: boolean;
  editRnTierReady: boolean;
  editEffectiveRnTier: { tier: string; source: "" | "rn" | "form" | "sw_override_fallback"; justification: string; recommendedByName: string; };
  editRowLive: StandaloneUpload | null;
  editRow: StandaloneUpload | null;
  editRnTierReviewed: boolean;
  setEditConfirmEdits: Dispatch<SetStateAction<boolean>>;
  setEditRnTierAdminReviewed: Dispatch<SetStateAction<boolean>>;
  editSaving: boolean;
  sigRequestingId: string;
  rejectingId: string;
  editRnTierAdminNotes: string;
  setEditRnTierAdminNotes: Dispatch<SetStateAction<string>>;
  editConfirmEdits: boolean;
  rnSuggestedTier: string;
  setRnSuggestedTier: Dispatch<SetStateAction<string>>;
  rnOpeningSignLink: boolean;
  rnSignName: string;
  setRnSignName: Dispatch<SetStateAction<string>>;
  rnSignLicense: string;
  setRnSignLicense: Dispatch<SetStateAction<string>>;
  rnSignConsent: boolean;
  setRnSignConsent: Dispatch<SetStateAction<boolean>>;
  submitRnWithSuggestedTier: () => Promise<void>;
  isEditRoute: boolean;
  actionsQueueOnly: boolean;
  actionsQueueListHref: "/admin/alft-tracker" | "/admin/alft-tracker?managerActions=1" | "/admin/alft-tracker?rnActions=1";
  closeEditorHref: string;
  setEditOpen: Dispatch<SetStateAction<boolean>>;
  editAutosaveStatus: "idle" | "saving" | "saved" | "error";
  editAutosaveAt: string | null;
  resendLeslieFromEdit: (row: StandaloneUpload) => void;
  canResendToRnFromEdit: boolean;
  managerActionsOnly: boolean;
  markSentForSignature: (row: StandaloneUpload) => void;
  canApproveToRnFromEdit: boolean;
  approveToRnDisabledReason: "No ALFT loaded" | "Approval already in progress" | "Kaiser manager/staff access required" | "RN already signed — use Resend → RN (new signature) if she must sign again" | "Already sent to RN — use Resend to RN below if Leslie needs another email" | "SW ALFT content is required before sending to Leslie" | "Manager approval: route to Leslie (RN) and request signatures";
  openRejectToSw: (row: StandaloneUpload) => void;
  canRejectToSwFromEdit: boolean;
  canRunFinalReviewFromEdit: boolean;
  markManagerFinalReview: (row: StandaloneUpload) => Promise<void>;
  managerReviewingId: string;
  routeToCsManagerFinalReview: (row: StandaloneUpload) => Promise<void>;
  canRouteToCsManagerFromEdit: boolean;
  routingToFinalManagerId: string;
  openSendConfirm: (row: StandaloneUpload) => void;
  canSendCompletedFromEdit: boolean;
  sendingCompletedId: string;
  requestIspDownloadConfirm: (action: "approved" | "rebuild") => void;
  packetDownloading: boolean;
  canPrintOrDownloadFromEdit: boolean;
  lastDownloadFileName: string;
  lastDownloadedAtLabel: string;
  adminActionGaps: string[];
  editIspProgress: { key: string; label: string; state: IspProgressState; }[];
  openSentToIlsDialog: () => void;
  sentToIlsStatusMeta: { sent: boolean; manual: boolean; dateLabel: string; iso: string; };
  showBottomResendPanel: boolean;
  wasSentToSwFromEdit: boolean;
  isResendingSwFromEdit: boolean;
  editAssignmentRow: AlftAssignmentQueueRow | null;
  openResendSwPreviewFromEdit: (row: StandaloneUpload) => void;
  wasSentToRnFromEdit: boolean;
}

export function EditActionBar({
  isRnReviewUi,
  editRnTierReady,
  editEffectiveRnTier,
  editRowLive,
  editRow,
  editRnTierReviewed,
  setEditConfirmEdits,
  setEditRnTierAdminReviewed,
  editSaving,
  sigRequestingId,
  rejectingId,
  editRnTierAdminNotes,
  setEditRnTierAdminNotes,
  editConfirmEdits,
  rnSuggestedTier,
  setRnSuggestedTier,
  rnOpeningSignLink,
  rnSignName,
  setRnSignName,
  rnSignLicense,
  setRnSignLicense,
  rnSignConsent,
  setRnSignConsent,
  submitRnWithSuggestedTier,
  isEditRoute,
  actionsQueueOnly,
  actionsQueueListHref,
  closeEditorHref,
  setEditOpen,
  editAutosaveStatus,
  editAutosaveAt,
  resendLeslieFromEdit,
  canResendToRnFromEdit,
  managerActionsOnly,
  markSentForSignature,
  canApproveToRnFromEdit,
  approveToRnDisabledReason,
  openRejectToSw,
  canRejectToSwFromEdit,
  canRunFinalReviewFromEdit,
  markManagerFinalReview,
  managerReviewingId,
  routeToCsManagerFinalReview,
  canRouteToCsManagerFromEdit,
  routingToFinalManagerId,
  openSendConfirm,
  canSendCompletedFromEdit,
  sendingCompletedId,
  requestIspDownloadConfirm,
  packetDownloading,
  canPrintOrDownloadFromEdit,
  lastDownloadFileName,
  lastDownloadedAtLabel,
  adminActionGaps,
  editIspProgress,
  openSentToIlsDialog,
  sentToIlsStatusMeta,
  showBottomResendPanel,
  wasSentToSwFromEdit,
  isResendingSwFromEdit,
  editAssignmentRow,
  openResendSwPreviewFromEdit,
  wasSentToRnFromEdit,
}: EditActionBarProps) {
  return (
    <div className="space-y-2 pb-20 sticky bottom-0 z-30 -mx-1 px-1 py-2 bg-background/95 backdrop-blur border-t">
      {!isRnReviewUi && editRnTierReady ? (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3 space-y-2 text-sm text-violet-950">
          <div className="font-semibold">
            Approve RN recommended tier:{' '}
            <span className="text-base">Tier {editEffectiveRnTier.tier}</span>
            {editEffectiveRnTier.source === 'sw_override_fallback' ? (
              <span className="ml-2 text-xs font-normal text-violet-800">
                (from SW — RN override, Leslie not required)
              </span>
            ) : null}
          </div>
          {editEffectiveRnTier.justification ||
          String((editRowLive || editRow as any)?.alftRnTierRecommendation?.justification || '').trim() ? (
            <div className="text-xs whitespace-pre-wrap">
              <span className="font-medium">Care-need notes: </span>
              {editEffectiveRnTier.justification ||
                String((editRowLive || editRow as any)?.alftRnTierRecommendation?.justification || '').trim()}
            </div>
          ) : null}
          <div className="flex items-start gap-3 rounded-md border border-violet-200 bg-white px-3 py-2">
            <Checkbox
              id="alft-edit-rn-tier-reviewed"
              checked={editRnTierReviewed}
              onCheckedChange={(v) => {
                setEditConfirmEdits(false);
                setEditRnTierAdminReviewed(Boolean(v));
              }}
              disabled={
                editSaving ||
                Boolean(sigRequestingId) ||
                Boolean(rejectingId) ||
                Boolean((editRowLive || editRow as any)?.alftRnTierRecommendation?.adminReviewedAtIso) ||
                isAlftRnAdminOverride(editRowLive || editRow)
              }
            />
            <Label htmlFor="alft-edit-rn-tier-reviewed" className="text-sm leading-relaxed">
              {isAlftRnAdminOverride(editRowLive || editRow)
                ? 'RN override on — SW/RN tier is accepted (Leslie signature not required). You can Approve tier + download.'
                : 'I reviewed the RN recommended tier. Required before Approve tier + download.'}
            </Label>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alft-edit-rn-tier-admin-notes" className="text-xs">
              Admin notes for tier-level request (optional)
            </Label>
            <Input
              id="alft-edit-rn-tier-admin-notes"
              value={editRnTierAdminNotes}
              onChange={(e) => {
                setEditConfirmEdits(false);
                setEditRnTierAdminNotes(e.target.value);
              }}
              placeholder="Optional notes for the tier-level request packet"
              disabled={Boolean((editRowLive || editRow as any)?.alftRnTierRecommendation?.adminReviewedAtIso)}
            />
          </div>
        </div>
      ) : null}
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2">
        <Checkbox
          id="alft-edit-confirm-edits"
          checked={editConfirmEdits}
          onCheckedChange={(v) => setEditConfirmEdits(Boolean(v))}
          disabled={editSaving || Boolean(sigRequestingId) || Boolean(rejectingId)}
        />
        <Label htmlFor="alft-edit-confirm-edits" className="text-sm leading-relaxed">
          {isRnReviewUi
            ? 'I confirm these edits are complete and accurate before submitting with my suggested tier.'
            : 'I confirm these edits are complete and accurate before submitting to the next step.'}
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
      {isRnReviewUi ? (
        <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50/60 p-3">
          <div className="text-sm font-semibold text-violet-950">
            Return to admin — suggested tier + signature
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="rn-suggested-tier-edit" className="text-sm font-semibold">
                  Suggested tier <span className="text-red-500">*</span>
                </Label>
                <TierLevelDefinitionsLink
                  audience="admin"
                  label="Definitions"
                  className="text-[11px] font-medium"
                />
              </div>
              <Select
                value={rnSuggestedTier || undefined}
                onValueChange={setRnSuggestedTier}
                disabled={rnOpeningSignLink || Boolean(editRowLive?.alftSignature?.rnSignedAt)}
              >
                <SelectTrigger
                  id="rn-suggested-tier-edit"
                  className={
                    !isAlftTierOption(rnSuggestedTier) ? 'border-amber-400 bg-white' : 'bg-white'
                  }
                >
                  <SelectValue placeholder="Tier 1–5" />
                </SelectTrigger>
                <SelectContent>
                  {ALFT_TIER_OPTIONS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      Tier {tier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rn-sign-name-edit" className="text-sm font-semibold">
                Printed name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rn-sign-name-edit"
                value={rnSignName}
                onChange={(e) => setRnSignName(e.target.value)}
                disabled={rnOpeningSignLink || Boolean(editRowLive?.alftSignature?.rnSignedAt)}
                className="bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rn-sign-license-edit" className="text-sm font-semibold">
                License number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rn-sign-license-edit"
                value={
                  isDefaultAlftRnName(rnSignName)
                    ? DEFAULT_ALFT_RN_LICENSE_NUMBER
                    : rnSignLicense
                }
                onChange={(e) => setRnSignLicense(e.target.value)}
                disabled={
                  rnOpeningSignLink ||
                  Boolean(editRowLive?.alftSignature?.rnSignedAt) ||
                  isDefaultAlftRnName(rnSignName)
                }
                title={
                  isDefaultAlftRnName(rnSignName)
                    ? 'Leslie Lopez license is fixed as 95357474'
                    : undefined
                }
                className="bg-white"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold">
                Electronic signature <span className="text-red-500">*</span>
              </Label>
              <div className="min-h-[88px] rounded-md border bg-white px-4 py-4">
                {String(rnSignName || '').trim() ? (
                  <>
                    <div className="font-serif text-2xl italic text-gray-900">
                      {String(rnSignName || '').trim()}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Electronically signed — typed name from printed name above
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Type your printed name above to create your electronic signature.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="rn-sign-consent-edit"
              checked={rnSignConsent}
              onCheckedChange={(v) => setRnSignConsent(Boolean(v))}
              disabled={rnOpeningSignLink || Boolean(editRowLive?.alftSignature?.rnSignedAt)}
            />
            <Label htmlFor="rn-sign-consent-edit" className="text-xs leading-relaxed">
              I attest this is my electronic signature and I am submitting this ALFT back to admin with my
              suggested tier.
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="flex-1 sm:flex-none bg-violet-700 text-white hover:bg-violet-800"
              onClick={() => void submitRnWithSuggestedTier()}
              disabled={
                !editConfirmEdits ||
                editSaving ||
                rnOpeningSignLink ||
                Boolean(editRowLive?.alftSignature?.rnSignedAt) ||
                !isAlftTierOption(rnSuggestedTier) ||
                !String(rnSignName || '').trim() ||
                !String(rnSignLicense || '').trim() ||
                !rnSignConsent
              }
            >
              {rnOpeningSignLink || editSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {Boolean(editRowLive?.alftSignature?.rnSignedAt)
                ? 'Already returned to admin'
                : 'Sign & return to admin'}
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant="outline"
              onClick={() => {
                if (isEditRoute) {
                  window.location.assign(actionsQueueOnly ? actionsQueueListHref : closeEditorHref);
                  return;
                }
                setEditOpen(false);
              }}
              disabled={editSaving || rnOpeningSignLink}
            >
              {actionsQueueOnly ? 'Back to pending members' : 'Close editor'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {editAutosaveStatus === 'saving'
                ? 'Autosaving…'
                : editAutosaveAt
                  ? `Autosaved ${new Date(editAutosaveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Autosaves while you edit'}
            </span>
          </div>
          {!Boolean(editRowLive?.alftSignature?.rnSignedAt) &&
          (!editConfirmEdits ||
            !isAlftTierOption(rnSuggestedTier) ||
            !String(rnSignName || '').trim() ||
            !String(rnSignLicense || '').trim() ||
            !rnSignConsent) ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <div className="font-semibold">
                Still needed before <span className="underline">Sign & return to admin</span>:
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {[
                  !editConfirmEdits ? 'confirm edits checkbox (above)' : '',
                  !isAlftTierOption(rnSuggestedTier) ? 'suggested tier (1–5)' : '',
                  !String(rnSignName || '').trim() ? 'printed name (electronic signature)' : '',
                  !String(rnSignLicense || '').trim() ? 'license number' : '',
                  !rnSignConsent ? 'signature attestation checkbox' : '',
                ]
                  .filter(Boolean)
                  .map((gap) => (
                    <li key={String(gap)}>{gap}</li>
                  ))}
              </ul>
            </div>
          ) : !Boolean(editRowLive?.alftSignature?.rnSignedAt) ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Ready to submit — all required RN signature items are complete.
            </div>
          ) : null}
        </div>
      ) : (
        <>
      {hasRnElectronicallySigned(editRowLive) ? (
        <>
          <Button
            className="flex-1 sm:flex-none bg-emerald-600 text-white hover:bg-emerald-700"
            disabled
            title="Leslie already electronically signed — approve tier + download below, or Resend → RN for a new signature"
          >
            RN signed
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            variant="outline"
            onClick={() => editRowLive && resendLeslieFromEdit(editRowLive)}
            disabled={!editConfirmEdits || sigRequestingId === String(editRowLive?.id || '')}
            title={
              !editConfirmEdits
                ? 'Confirm edits required before resending'
                : 'Clear prior RN signature and request a new one'
            }
          >
            {sigRequestingId === String(editRowLive?.id || '') ? 'Resending to RN…' : 'Resend → RN (new signature)'}
          </Button>
        </>
      ) : canResendToRnFromEdit ? (
        managerActionsOnly ? (
          <>
            <Button
              className="flex-1 sm:flex-none bg-green-600 text-white hover:bg-green-700"
              disabled
              title="Packet already sent to RN — awaiting Leslie's electronic signature"
            >
              Sent to RN
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant="outline"
              onClick={() => editRowLive && resendLeslieFromEdit(editRowLive)}
              disabled={!editConfirmEdits || sigRequestingId === String(editRowLive?.id || '')}
              title={!editConfirmEdits ? 'Confirm edits required before resending' : 'Re-send RN signature request email'}
            >
              {sigRequestingId === String(editRowLive?.id || '') ? 'Resending to RN…' : 'Resend → RN'}
            </Button>
          </>
        ) : (
          <Button
            className="flex-1 sm:flex-none bg-green-600 text-white hover:bg-green-700"
            onClick={() => editRowLive && resendLeslieFromEdit(editRowLive)}
            disabled={!editConfirmEdits || sigRequestingId === String(editRowLive?.id || '')}
            title={!editConfirmEdits ? 'Confirm edits required before resending' : 'Re-send RN signature request email'}
          >
            {sigRequestingId === String(editRowLive?.id || '') ? 'Resending to RN…' : 'Resend → RN'}
          </Button>
        )
      ) : (
        <Button
          className="flex-1 sm:flex-none bg-green-600 text-white hover:bg-green-700"
          onClick={() => editRowLive && markSentForSignature(editRowLive)}
          disabled={!editConfirmEdits || !canApproveToRnFromEdit || sigRequestingId === String(editRowLive?.id || '')}
          title={
            !editConfirmEdits
              ? 'Confirm edits required before approving'
              : approveToRnDisabledReason
          }
        >
          {sigRequestingId === String(editRowLive?.id || '') ? 'Approving…' : 'Approve → Send to RN'}
        </Button>
      )}
      <Button
        className="flex-1 sm:flex-none"
        variant="outline"
        onClick={() => editRowLive && openRejectToSw(editRowLive)}
        disabled={!editConfirmEdits || !canRejectToSwFromEdit || rejectingId === String(editRowLive?.id || '')}
        title={
          !editConfirmEdits
            ? 'Confirm edits required before returning to SW'
            : 'Reject and return this packet to the social worker for edits'
        }
      >
        Reject → Return to SW for edits
      </Button>
      {canRunFinalReviewFromEdit ? (
        <Button
          className="flex-1 sm:flex-none"
          variant="outline"
          onClick={() => editRow && void markManagerFinalReview(editRow)}
          disabled={
            !editConfirmEdits ||
            managerReviewingId === String(editRow?.id || '') ||
            !editRnTierReviewed ||
            !editRnTierReady
          }
          title={
            !editConfirmEdits
              ? 'Confirm edits required before final approval'
              : !editRnTierReady
                ? isAlftRnAdminOverride(editRowLive || editRow)
                  ? 'Set Tier 1–5 or ensure SW recommended a tier (Leslie not required with RN override)'
                  : 'RN recommended tier required first'
                : !editRnTierReviewed
                  ? 'Review RN tier recommendation before final approval'
                  : 'Final manager approval after RN updates/signature'
          }
        >
          {managerReviewingId === String(editRow?.id || '') ? 'Final approving…' : 'Final manager approval'}
        </Button>
      ) : null}
      {!managerActionsOnly ? (
        <>
          <Button
            className="flex-1 sm:flex-none"
            variant="outline"
            onClick={() => editRowLive && void routeToCsManagerFinalReview(editRowLive)}
            disabled={!editConfirmEdits || !canRouteToCsManagerFromEdit || routingToFinalManagerId === String(editRowLive?.id || '')}
            title={
              !editConfirmEdits
                ? 'Confirm edits required before routing'
                : !hasRnElectronicallySigned(editRowLive)
                  ? 'RN must electronically sign before packet returns to admin final review'
                  : 'After RN review/edits, route to John for final review'
            }
          >
            {routingToFinalManagerId === String(editRowLive?.id || '') ? 'Routing…' : 'Send to CS Manager for Final Review'}
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            variant="outline"
            onClick={() => editRow && openSendConfirm(editRow)}
            disabled={!canSendCompletedFromEdit || sendingCompletedId === String(editRow?.id || '')}
            title="Send approved packet to Jocelyn"
          >
            Send to Jocelyn
          </Button>
        </>
      ) : null}
      <Button
        className="flex-1 sm:flex-none"
        variant="outline"
        onClick={() => {
          if (isEditRoute) {
            window.location.assign(actionsQueueOnly ? actionsQueueListHref : closeEditorHref);
            return;
          }
          setEditOpen(false);
        }}
        disabled={editSaving}
      >
        {actionsQueueOnly ? 'Back to pending members' : 'Close editor'}
      </Button>
      <Button
        className="flex-1 sm:flex-none"
        onClick={() => requestIspDownloadConfirm('approved')}
        disabled={
          editSaving ||
          packetDownloading ||
          !editConfirmEdits ||
          !(canPrintOrDownloadFromEdit || canRunFinalReviewFromEdit) ||
          (canRunFinalReviewFromEdit && !canPrintOrDownloadFromEdit && (!editRnTierReady || !editRnTierReviewed))
        }
            title={
              canPrintOrDownloadFromEdit
                ? 'Rebuilds and downloads from your current edits, then archives a new ISP version'
                : canRunFinalReviewFromEdit && !editRnTierReady
                  ? isAlftRnAdminOverride(editRowLive || editRow)
                    ? 'Set Tier 1–5 or ensure SW recommended a tier (Leslie not required with RN override)'
                    : 'RN recommended tier required first'
                  : canRunFinalReviewFromEdit
                  ? 'Approves RN tier, then downloads from your current edits and archives a new ISP version'
                  : 'Unlocks after RN signs and you are ready for final tier approval'
            }
      >
        {editSaving || packetDownloading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : Boolean((editRowLive || editRow as any)?.alftStaffDownloadedAt) ? (
          <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        {packetDownloading
          ? 'Downloading…'
          : Boolean((editRowLive || editRow as any)?.alftStaffDownloadedAt)
          ? 'Download latest edits'
          : canPrintOrDownloadFromEdit
            ? 'Approved and download'
            : 'Approve tier + download'}
      </Button>
      <Button type="button" variant="outline" className="flex-1 sm:flex-none" asChild>
        <Link href="/admin/tools/isp-downloads">ISP Download Archive</Link>
      </Button>
      {lastDownloadFileName ? (
        <div className="w-full sm:w-auto max-w-[min(100%,28rem)] space-y-0.5">
          <div className="text-xs text-emerald-900 truncate" title={lastDownloadFileName}>
            Last archived on this page: {lastDownloadFileName}
          </div>
          {lastDownloadedAtLabel ? (
            <div className="text-[11px] text-emerald-900 font-medium">
              Version archived {lastDownloadedAtLabel}
            </div>
          ) : null}
        </div>
      ) : null}
      <span className="text-xs text-muted-foreground">
        {editAutosaveStatus === 'saving'
          ? 'Autosaving to Firestore…'
          : editAutosaveStatus === 'error'
            ? 'Autosave failed — confirm edits, then download to retry'
            : editAutosaveAt
              ? `Autosaved ${new Date(editAutosaveAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Autosaves to Firestore while you edit'}
      </span>
        </>
      )}
      </div>
      {isRnReviewUi ? (
        <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          Edit the form above if needed, choose <strong>Tier 1–5</strong>, sign, and return to admin. Reject and
          download are admin-only.
        </div>
      ) : null}
      {!isRnReviewUi && adminActionGaps.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <div className="font-semibold">Still needed before admin workflow actions:</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {adminActionGaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!isRnReviewUi ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 space-y-2 text-xs text-sky-950">
          <div className="text-sm font-semibold text-sky-950">Status tracking</div>
          <div className="flex flex-wrap items-center gap-3">
            {editIspProgress.map((step) => (
              <button
                key={`bottom-${step.key}`}
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-1 py-0.5',
                  step.key === 'sent_to_ils' &&
                    'cursor-pointer hover:bg-sky-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500'
                )}
                onClick={() => {
                  if (step.key === 'sent_to_ils') openSentToIlsDialog();
                }}
                title={
                  step.key === 'sent_to_ils'
                    ? 'Click to mark Sent to ILS (manual date + confirmation)'
                    : undefined
                }
              >
                {step.state === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : step.state === 'returned' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                ) : step.state === 'current' ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    step.state === 'done' && 'text-green-800 font-medium',
                    step.state === 'returned' && 'text-orange-800 font-semibold',
                    step.state === 'current' && 'text-amber-800 font-semibold',
                    step.state === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                  {step.key === 'sent_to_ils' && step.state !== 'done' ? ' (set date…)' : ''}
                  {step.key === 'sent_to_ils' && step.state === 'done' && sentToIlsStatusMeta.dateLabel
                    ? ` · ${sentToIlsStatusMeta.dateLabel}${sentToIlsStatusMeta.manual ? ' (manual)' : ''}`
                    : ''}
                </span>
              </button>
            ))}
          </div>
          {sentToIlsStatusMeta.sent && sentToIlsStatusMeta.dateLabel ? (
            <div className="rounded border border-teal-200 bg-white/70 px-2 py-1 text-[11px] text-teal-950">
              Sent to ILS date:{' '}
              <span className="font-semibold">{sentToIlsStatusMeta.dateLabel}</span>
              {sentToIlsStatusMeta.manual ? ' · manual' : ' · cover package'}
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => openSentToIlsDialog()}
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-sky-900/80">
              Click <span className="font-medium">Sent to ILS</span> to confirm and enter a manual date.
            </div>
          )}
          <div className="text-sky-950">{ispProgressSummary(editRowLive || editRow)}</div>
          {hasRnElectronicallySigned(editRowLive || editRow) ? (
            <div className="text-emerald-900">
              RN electronic signature is on file
              {String((editRowLive || editRow as any)?.alftRnTierRecommendation?.tier || '').trim()
                ? ` · recommended Tier ${String((editRowLive || editRow as any)?.alftRnTierRecommendation?.tier).trim()}`
                : ''}
              . Use <strong>Resend → RN (new signature)</strong> if edits require her to sign again.
            </div>
          ) : canResendToRnFromEdit ? (
            <div className="text-sky-900/90">
              {managerActionsOnly ? (
                <>
                  Leslie has <strong>not</strong> electronically signed yet. Name/license alone do not count as a
                  signature. Use <strong>Resend → RN</strong> only if she needs another link.
                </>
              ) : (
                <>
                  Leslie has <strong>not</strong> electronically signed yet — use <strong>Resend → RN</strong> if
                  she needs another link. Name/license alone do not count as a signature.
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {showBottomResendPanel ? (
        <div className="rounded-md border border-indigo-200 bg-indigo-50/80 px-3 py-3 space-y-2">
          <div className="text-sm font-semibold text-indigo-950">Resend again</div>
          <p className="text-xs text-indigo-900/90">
            Packet already sent — re-notify the social worker, or send RN a new signature request. Resending to RN
            after she already signed clears her prior electronic signature and emails a fresh link. Confirm edits
            above and enter a note before the RN email is sent.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-indigo-300 bg-white"
              disabled={!wasSentToSwFromEdit || isResendingSwFromEdit || !editAssignmentRow}
              title={
                !wasSentToSwFromEdit
                  ? 'SW invite has not been sent yet'
                  : !editAssignmentRow
                    ? 'SW assignment not found'
                    : 'Preview and re-send the SW workflow email'
              }
              onClick={() => editRowLive && openResendSwPreviewFromEdit(editRowLive)}
            >
              {isResendingSwFromEdit ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Resend → Social Worker
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-indigo-300 bg-white"
              disabled={
                !wasSentToRnFromEdit ||
                !editConfirmEdits ||
                sigRequestingId === String(editRowLive?.id || '') ||
                String((editRowLive || editRow as any)?.workflowStatus || '')
                  .toLowerCase()
                  .includes('completed_sent_to_jocelyn')
              }
              title={
                !wasSentToRnFromEdit
                  ? 'Not sent to RN yet'
                  : !editConfirmEdits
                    ? 'Confirm edits required before resending'
                    : hasRnElectronicallySigned(editRowLive || editRow)
                      ? 'Clear prior RN signature and request a new one (note required)'
                      : 'Re-send RN signature request email (note required)'
              }
              onClick={() => editRowLive && resendLeslieFromEdit(editRowLive)}
            >
              {sigRequestingId === String(editRowLive?.id || '') ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {hasRnElectronicallySigned(editRowLive || editRow)
                ? 'Resend → RN (new signature)'
                : 'Resend → RN'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
