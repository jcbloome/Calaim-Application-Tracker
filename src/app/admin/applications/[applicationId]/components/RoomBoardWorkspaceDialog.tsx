'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Loader2, RefreshCw, Mail, Send } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { type Dispatch, type SetStateAction } from 'react';

export interface RoomBoardWorkspaceDialogProps {
  roomBoardWorkspaceOpen: boolean;
  setRoomBoardWorkspaceOpen: Dispatch<SetStateAction<boolean>>;
  roomBoardAgreementMeta: any;
  authorizedRepInviteEmail: string;
  isKaiserPlan: boolean;
  isUpdatingKaiserTierLevel: boolean;
  workspaceKaiserTierLevelValue: string;
  updateKaiserTierLevel: (tierLevel: string) => Promise<void>;
  rcfeSignerEmailInput: string;
  setRcfeSignerEmailInput: Dispatch<SetStateAction<string>>;
  isSendingRoomBoardInvites: boolean;
  agreedRoomBoardAmountInput: string;
  setAgreedRoomBoardAmountInput: Dispatch<SetStateAction<string>>;
  generateRoomBoardAgreementPreview: () => Promise<void>;
  isGeneratingRoomBoardPreview: boolean;
  sendRoomBoardAgreementInvites: () => Promise<void>;
  roomBoardPreview: { clientId2?: string | undefined; memberName?: string | undefined; mrn?: string | null | undefined; authorizedRepName?: string | undefined; authorizedRepEmail?: string | undefined; rcfeName?: string | undefined; rcfeSignerEmailDefault?: string | undefined; mcoAndTier?: string | undefined; tierLevel?: string | undefined; assistedLivingDailyRate?: string | undefined; assistedLivingMonthlyRate?: string | undefined; agreedRoomBoardAmountDefault?: string | undefined; } | null;
  roomBoardPreviewWarnings: string[];
  sendRoomBoardAgreementToIls: () => Promise<void>;
  isSendingRoomBoardIls: boolean;
}

export function RoomBoardWorkspaceDialog({
  roomBoardWorkspaceOpen,
  setRoomBoardWorkspaceOpen,
  roomBoardAgreementMeta,
  authorizedRepInviteEmail,
  isKaiserPlan,
  isUpdatingKaiserTierLevel,
  workspaceKaiserTierLevelValue,
  updateKaiserTierLevel,
  rcfeSignerEmailInput,
  setRcfeSignerEmailInput,
  isSendingRoomBoardInvites,
  agreedRoomBoardAmountInput,
  setAgreedRoomBoardAmountInput,
  generateRoomBoardAgreementPreview,
  isGeneratingRoomBoardPreview,
  sendRoomBoardAgreementInvites,
  roomBoardPreview,
  roomBoardPreviewWarnings,
  sendRoomBoardAgreementToIls,
  isSendingRoomBoardIls,
}: RoomBoardWorkspaceDialogProps) {
  return (
    <Dialog open={roomBoardWorkspaceOpen} onOpenChange={setRoomBoardWorkspaceOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Room and Board/Tier Level Agreement</DialogTitle>
          <DialogDescription>
            Enter required fields, generate preview, and send invites from one workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-normal">
                Status: {String(roomBoardAgreementMeta?.status || 'invited')}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                ILS: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Sent' : 'Pending'}
              </Badge>
              {roomBoardAgreementMeta?.requestId ? (
                <Badge variant="outline" className="text-[10px] font-normal">
                  Request {String(roomBoardAgreementMeta.requestId)}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              Authorized rep email (auto): {authorizedRepInviteEmail || 'Not found'}
            </div>
          </div>

          {isKaiserPlan ? (
            <div className="space-y-2 rounded-md border p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium">Kaiser Tier Level</Label>
                {isUpdatingKaiserTierLevel ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
              </div>
              <Select
                value={workspaceKaiserTierLevelValue || 'none'}
                onValueChange={(value) => void updateKaiserTierLevel(value === 'none' ? '' : value)}
                disabled={isUpdatingKaiserTierLevel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="4">4</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[11px] text-muted-foreground">
                Use this once Kaiser determines the member tier level.
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="room-board-rcfe-email-dialog" className="text-xs">RCFE signer email</Label>
            <Input
              id="room-board-rcfe-email-dialog"
              value={rcfeSignerEmailInput}
              onChange={(e) => setRcfeSignerEmailInput(e.target.value)}
              placeholder="rcfe-signer@example.com"
              disabled={isSendingRoomBoardInvites}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="room-board-agreed-amount-dialog" className="text-xs">Agreed room and board amount (manual)</Label>
            <Input
              id="room-board-agreed-amount-dialog"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={agreedRoomBoardAmountInput}
              onChange={(e) => setAgreedRoomBoardAmountInput(e.target.value)}
              placeholder="Enter amount manually"
              disabled={isSendingRoomBoardInvites}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void generateRoomBoardAgreementPreview()}
              disabled={isGeneratingRoomBoardPreview || isSendingRoomBoardInvites}
            >
              {isGeneratingRoomBoardPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void sendRoomBoardAgreementInvites()}
              disabled={isSendingRoomBoardInvites || !roomBoardPreview}
            >
              {isSendingRoomBoardInvites ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Generate + Send Invites
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            Generate preview first, then send invites.
          </div>

          {roomBoardPreview ? (
            <div className="rounded-md border bg-background p-3 text-xs space-y-1">
              <div><span className="font-medium">Member:</span> {String(roomBoardPreview.memberName || '—')}</div>
              <div><span className="font-medium">MRN:</span> {String(roomBoardPreview.mrn || '—')}</div>
              <div><span className="font-medium">RCFE Name:</span> {String(roomBoardPreview.rcfeName || '—')}</div>
              <div><span className="font-medium">MCO/Tier:</span> {String(roomBoardPreview.mcoAndTier || '—')}</div>
              <div><span className="font-medium">Assisted living:</span> {roomBoardPreview.assistedLivingMonthlyRate ? `$${roomBoardPreview.assistedLivingMonthlyRate} monthly` : '—'}{roomBoardPreview.assistedLivingDailyRate ? ` / $${roomBoardPreview.assistedLivingDailyRate} daily` : ''}</div>
            </div>
          ) : null}

          {roomBoardPreviewWarnings.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              {roomBoardPreviewWarnings.map((warning, idx) => (
                <div key={`rb-preview-warn-dialog-${idx}`}>- {warning}</div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void sendRoomBoardAgreementToIls()}
              disabled={isSendingRoomBoardIls}
            >
              {isSendingRoomBoardIls ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Signed Docs to ILS
            </Button>
          </div>

          {roomBoardAgreementMeta?.requestId ? (
            <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
              <div>Latest request: {String(roomBoardAgreementMeta.requestId)} ({String(roomBoardAgreementMeta.status || 'invited')})</div>
              <div>MCO/Tier: {String(roomBoardAgreementMeta.mcoAndTier || '—')}</div>
              <div>Assisted living: {roomBoardAgreementMeta.assistedLivingMonthlyRate ? `$${roomBoardAgreementMeta.assistedLivingMonthlyRate} monthly` : '—'}{roomBoardAgreementMeta.assistedLivingDailyRate ? ` / $${roomBoardAgreementMeta.assistedLivingDailyRate} daily` : ''}</div>
              <div>ILS sent: {roomBoardAgreementMeta?.ilsDispatch?.sentAt ? 'Yes' : 'No'}</div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
