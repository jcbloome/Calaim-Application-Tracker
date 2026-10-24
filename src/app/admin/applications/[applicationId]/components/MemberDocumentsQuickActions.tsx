'use client';

import {
  isMifServiceRequestFormName,
  MIF_SERVICE_DELIVERY_FORM_NAME,
  collectWaiversAuthorizationsPdfUrls,
  WAIVERS_AUTHORIZATIONS_PACKET_FORM_NAME,
} from '@/lib/mif-service-delivery-form';
import { Button } from '@/components/ui/button';
import { Eye, Loader2, RefreshCw, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { type JSX, type Dispatch, type SetStateAction } from 'react';
import { type Application } from '@/lib/definitions';

export interface MemberDocumentsQuickActionsProps {
  MemberFilesDialog: ({ triggerLabel, triggerClassName, triggerVariant, }: { triggerLabel: string; triggerClassName?: string | undefined; triggerVariant?: "link" | "default" | "destructive" | "outline" | "secondary" | "ghost" | undefined; }) => JSX.Element;
  isKaiserAuthReceivedIntake: boolean;
  application: Application;
  effectiveCaspioCalAIMStatus: "" | "Pending" | "Authorized";
  setDocumentPreview: Dispatch<SetStateAction<{ url: string; title: string; } | null>>;
  setServiceDeliverySourceKind: Dispatch<SetStateAction<"mif" | "single_auth">>;
  resolveDefaultServiceDeliverySourceKind: () => "mif" | "single_auth";
  setServiceDeliveryCreateDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCreatingServiceDeliveryFile: boolean;
  handleCreateWaiversAuthorizationsPacket: () => Promise<void>;
  isCreatingWaiversAuthorizationsPacket: boolean;
  serviceDeliveryCreateDialogOpen: boolean;
  serviceDeliverySourceKind: "mif" | "single_auth";
  handleCreateMemberServiceDeliveryFile: (sourceKind?: "mif" | "single_auth" | undefined) => Promise<void>;
}

export function MemberDocumentsQuickActions({
  MemberFilesDialog,
  isKaiserAuthReceivedIntake,
  application,
  effectiveCaspioCalAIMStatus,
  setDocumentPreview,
  setServiceDeliverySourceKind,
  resolveDefaultServiceDeliverySourceKind,
  setServiceDeliveryCreateDialogOpen,
  isCreatingServiceDeliveryFile,
  handleCreateWaiversAuthorizationsPacket,
  isCreatingWaiversAuthorizationsPacket,
  serviceDeliveryCreateDialogOpen,
  serviceDeliverySourceKind,
  handleCreateMemberServiceDeliveryFile,
}: MemberDocumentsQuickActionsProps) {
  return (
    <div className="order-[12] space-y-2">
      <MemberFilesDialog triggerLabel="See Files" triggerClassName="qa-trigger" />
      {(() => {
        const isAuthorizedMember =
          isKaiserAuthReceivedIntake ||
          /^authorized$/i.test(String((application as any)?.caspioCalAIMStatus || '').trim()) ||
          /^authorized$/i.test(String(effectiveCaspioCalAIMStatus || '').trim());
        if (!isAuthorizedMember) return null;

        const forms = Array.isArray((application as any)?.forms)
          ? ((application as any).forms as any[])
          : [];
        const serviceDeliveryForm =
          forms.find((form) =>
            isMifServiceRequestFormName(form?.name)
          ) || null;
        const rootForm = (application as any)?.serviceDeliveryForm || {};
        const fileName = String(
          serviceDeliveryForm?.fileName ||
            serviceDeliveryForm?.uploadedFiles?.[0]?.fileName ||
            rootForm?.fileName ||
            ''
        ).trim();
        const downloadURL = String(
          serviceDeliveryForm?.downloadURL ||
            serviceDeliveryForm?.uploadedFiles?.[0]?.downloadURL ||
            rootForm?.downloadURL ||
            ''
        ).trim();
        const hasServiceDeliveryFile = Boolean(downloadURL);

        if (hasServiceDeliveryFile) {
          return (
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                className="qa-trigger"
                onClick={() =>
                  setDocumentPreview({
                    title: fileName || MIF_SERVICE_DELIVERY_FORM_NAME,
                    url: downloadURL,
                  })
                }
              >
                <Eye className="h-4 w-4" />
                <span className="qa-label">See Service Request Form</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="qa-trigger h-auto py-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  setServiceDeliverySourceKind(resolveDefaultServiceDeliverySourceKind());
                  setServiceDeliveryCreateDialogOpen(true);
                }}
                disabled={isCreatingServiceDeliveryFile}
              >
                {isCreatingServiceDeliveryFile ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="qa-label">Recreate Service Request Form</span>
              </Button>
            </div>
          );
        }

        return (
          <Button
            type="button"
            variant="outline"
            className="qa-trigger"
            onClick={() => {
              setServiceDeliverySourceKind(resolveDefaultServiceDeliverySourceKind());
              setServiceDeliveryCreateDialogOpen(true);
            }}
            disabled={isCreatingServiceDeliveryFile}
          >
            {isCreatingServiceDeliveryFile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span className="qa-label">Create Service Request Form</span>
          </Button>
        );
      })()}
      {(() => {
        const isAuthorizedMember =
          isKaiserAuthReceivedIntake ||
          /^authorized$/i.test(String((application as any)?.caspioCalAIMStatus || '').trim()) ||
          /^authorized$/i.test(String(effectiveCaspioCalAIMStatus || '').trim());
        if (!isAuthorizedMember) return null;
        const forms = Array.isArray((application as any)?.forms)
          ? ((application as any).forms as any[])
          : [];
        const packetForm =
          forms.find((form) =>
            String(form?.name || '')
              .toLowerCase()
              .includes('waivers & authorizations packet')
          ) || null;
        const rootPacket = (application as any)?.waiversAuthorizationsPacket || {};
        const packetName = String(
          packetForm?.fileName ||
            packetForm?.uploadedFiles?.[0]?.fileName ||
            rootPacket?.fileName ||
            ''
        ).trim();
        const packetUrl = String(
          packetForm?.downloadURL ||
            packetForm?.uploadedFiles?.[0]?.downloadURL ||
            rootPacket?.downloadURL ||
            ''
        ).trim();
        const hasPacket = Boolean(packetUrl);
        const hasSourcePdfs = collectWaiversAuthorizationsPdfUrls(application).length > 0;

        if (hasPacket) {
          return (
            <div className="space-y-1">
              <Button
                type="button"
                variant="outline"
                className="qa-trigger"
                onClick={() =>
                  setDocumentPreview({
                    title: packetName || WAIVERS_AUTHORIZATIONS_PACKET_FORM_NAME,
                    url: packetUrl,
                  })
                }
              >
                <Eye className="h-4 w-4" />
                <span className="qa-label">See Waivers &amp; Authorizations file</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="qa-trigger h-auto py-1.5 text-xs text-muted-foreground"
                onClick={() => void handleCreateWaiversAuthorizationsPacket()}
                disabled={isCreatingWaiversAuthorizationsPacket || !hasSourcePdfs}
              >
                {isCreatingWaiversAuthorizationsPacket ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="qa-label">Recreate Waivers &amp; Authorizations file</span>
              </Button>
            </div>
          );
        }

        return (
          <Button
            type="button"
            variant="outline"
            className="qa-trigger"
            onClick={() => void handleCreateWaiversAuthorizationsPacket()}
            disabled={isCreatingWaiversAuthorizationsPacket || !hasSourcePdfs}
            title={
              hasSourcePdfs
                ? 'Create a separate Drive file with waiver and authorization PDFs'
                : 'Upload waiver and/or authorization PDFs first'
            }
          >
            {isCreatingWaiversAuthorizationsPacket ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            <span className="qa-label">Create Waivers &amp; Authorizations file</span>
          </Button>
        );
      })()}
      <Dialog
        open={serviceDeliveryCreateDialogOpen}
        onOpenChange={(open) => {
          setServiceDeliveryCreateDialogOpen(open);
          if (open) {
            setServiceDeliverySourceKind(resolveDefaultServiceDeliverySourceKind());
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create member file for Google Drive</DialogTitle>
            <DialogDescription>
              Builds the Service Request Form PDF from this authorized member&apos;s data already in Firestore
              (MIF or Single Auth intake). This file is the Service Request Form only — create Waivers &amp;
              Authorizations as a separate downloadable file below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Created from</Label>
              <RadioGroup
                value={serviceDeliverySourceKind}
                onValueChange={(value) => setServiceDeliverySourceKind(value as 'mif' | 'single_auth')}
                className="grid gap-2"
              >
                <Label
                  htmlFor="sd-source-mif"
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                >
                  <RadioGroupItem id="sd-source-mif" value="mif" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">MIF spreadsheet member</span>
                    <span className="text-xs text-muted-foreground">
                      Use auth / member fields from MIF intake already on this application
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor="sd-source-single-auth"
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
                >
                  <RadioGroupItem id="sd-source-single-auth" value="single_auth" className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Single Auth member</span>
                    <span className="text-xs text-muted-foreground">
                      Use auth / member fields from Single Auth intake already on this application
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Member:{' '}
              <span className="font-medium text-foreground">
                {`${String((application as any)?.memberFirstName || '').trim()} ${String((application as any)?.memberLastName || '').trim()}`.trim() || '—'}
              </span>
              {' · '}MRN{' '}
              <span className="font-mono text-foreground">
                {String((application as any)?.memberMrn || '').trim() || '—'}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setServiceDeliveryCreateDialogOpen(false)}
                disabled={isCreatingServiceDeliveryFile}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateMemberServiceDeliveryFile()}
                disabled={isCreatingServiceDeliveryFile}
              >
                {isCreatingServiceDeliveryFile ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Create & add to Files
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
