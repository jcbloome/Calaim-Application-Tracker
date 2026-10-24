'use client';

import { EMPTY_SINGLE_AUTH_CONTACT_PREVIEW } from './member-data-helpers';
import { Button } from '@/components/ui/button';
import { Loader2, FileText } from 'lucide-react';
import Link from 'next/link';
import { ILS_DECISION_RECIPIENTS, type IlsDecisionChoice } from '@/lib/ils-decision-email';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { type IlsDecisionPreviewDraft, type IlsDecisionLogState } from './create-application-types';

export interface SingleAuthPdfPanelProps {
  kaiserIlsPath: "" | "single_auth" | "pull_from_mif";
  serviceRequestFileInputRef: MutableRefObject<HTMLInputElement | null>;
  setServiceRequestFiles: Dispatch<SetStateAction<File[]>>;
  setServiceRequestFile: Dispatch<SetStateAction<File | null>>;
  setServiceRequestParsedFields: Dispatch<SetStateAction<string[]>>;
  setServiceRequestWarnings: Dispatch<SetStateAction<string[]>>;
  setSingleAuthContactPreview: Dispatch<SetStateAction<{ memberPhone: string; cellPhone: string; memberEmail: string; }>>;
  setSingleAuthMifMasterHit: Dispatch<SetStateAction<{ exists: boolean; matchLabel: string; matchedBy: string; runLabel?: string | undefined; caspioExists?: boolean | undefined; caspioMatchLabel?: string | undefined; alreadyInApp?: boolean | undefined; existingApplicationIds?: string[] | undefined; existingApplicationLabels?: string[] | undefined; mrnNameConflict?: boolean | undefined; mrnNameConflictLabels?: string[] | undefined; mrnNameConflictIds?: string[] | undefined; } | null>>;
  isParsingServiceRequest: boolean;
  serviceRequestFile: File | null;
  parseServiceRequestPdfAndApply: (fileOverride?: File | null | undefined) => Promise<void>;
  clearServiceRequestFile: () => void;
  singleAuthMifMasterHit: { exists: boolean; matchLabel: string; matchedBy: string; runLabel?: string | undefined; caspioExists?: boolean | undefined; caspioMatchLabel?: string | undefined; alreadyInApp?: boolean | undefined; existingApplicationIds?: string[] | undefined; existingApplicationLabels?: string[] | undefined; mrnNameConflict?: boolean | undefined; mrnNameConflictLabels?: string[] | undefined; mrnNameConflictIds?: string[] | undefined; } | null;
  serviceRequestFiles: File[];
  sendingIlsDecisionRowId: string;
  memberData: { memberFirstName: string; memberLastName: string; memberMrn: string; memberMediCalNum: string; confirmMemberMediCalNum: string; memberSex: string; parsedSourceType: string; createServiceDeliveryFormPdf: boolean; memberDob: string; memberPhone: string; memberEmail: string; memberCustomaryLocation: string; memberCustomaryAddress: string; memberCustomaryCity: string; memberCustomaryState: string; memberCustomaryZip: string; memberCustomaryCounty: string; Authorization_Number_T038: string; Authorization_Start_T2038: string; Authorization_End_T2038: string; Diagnostic_Code: string; kaiserStatus: string; contactFirstName: string; contactLastName: string; contactPhone: string; contactEmail: string; careManagerName: string; careManagerPhone: string; careManagerEmail: string; contactRelationship: string; eligibilityCheckStatus: string; notes: string; };
  openSingleAuthIlsServiceDecisionPreview: (choice: IlsDecisionChoice) => void;
  pendingIlsDecisionDraft: IlsDecisionPreviewDraft | null;
  singleAuthIlsDecisionLog: IlsDecisionLogState | null;
  setPendingIlsDecisionDraft: Dispatch<SetStateAction<IlsDecisionPreviewDraft | null>>;
  sendIlsServiceDecision: (draft: IlsDecisionPreviewDraft) => Promise<void>;
  serviceRequestParsedFields: string[];
  serviceRequestWarnings: string[];
  singleAuthContactPreview: { memberPhone: string; cellPhone: string; memberEmail: string; };
  lastCreatedSkeleton: { applicationId: string; memberName: string; clientId2: string; } | null;
  copyToClipboard: (label: string, value: string) => Promise<void>;
  familyPortalSignInLink: string;
  familyPortalContinueLink: string;
  loadIntroEmailPreview: () => Promise<void>;
  isLoadingIntroEmailPreview: boolean;
  isSendingIntroEmail: boolean;
  sendIntroductoryEmail: () => Promise<void>;
  introEmailDraft: { to: string; subject: string; message: string; senderFrom?: string | undefined; senderWarning?: string | undefined; senderUsesFallbackFrom?: boolean | undefined; } | null;
  selectedAssignedStaffId: string;
  setIntroEmailDraft: Dispatch<SetStateAction<{ to: string; subject: string; message: string; senderFrom?: string | undefined; senderWarning?: string | undefined; senderUsesFallbackFrom?: boolean | undefined; } | null>>;
}

export function SingleAuthPdfPanel({
  kaiserIlsPath,
  serviceRequestFileInputRef,
  setServiceRequestFiles,
  setServiceRequestFile,
  setServiceRequestParsedFields,
  setServiceRequestWarnings,
  setSingleAuthContactPreview,
  setSingleAuthMifMasterHit,
  isParsingServiceRequest,
  serviceRequestFile,
  parseServiceRequestPdfAndApply,
  clearServiceRequestFile,
  singleAuthMifMasterHit,
  serviceRequestFiles,
  sendingIlsDecisionRowId,
  memberData,
  openSingleAuthIlsServiceDecisionPreview,
  pendingIlsDecisionDraft,
  singleAuthIlsDecisionLog,
  setPendingIlsDecisionDraft,
  sendIlsServiceDecision,
  serviceRequestParsedFields,
  serviceRequestWarnings,
  singleAuthContactPreview,
  lastCreatedSkeleton,
  copyToClipboard,
  familyPortalSignInLink,
  familyPortalContinueLink,
  loadIntroEmailPreview,
  isLoadingIntroEmailPreview,
  isSendingIntroEmail,
  sendIntroductoryEmail,
  introEmailDraft,
  selectedAssignedStaffId,
  setIntroEmailDraft,
}: SingleAuthPdfPanelProps) {
  return (
    <>
      {kaiserIlsPath === 'single_auth' ? (
      <div className="p-3 border rounded-md bg-white/80 space-y-2">
        <div className="-mx-3 -mt-3 mb-1 rounded-t-md border-b border-sky-200 bg-sky-100 px-3 py-2.5 shadow-sm">
          <div className="font-semibold tracking-tight text-sky-950">
            Upload Single Auth (Allow Multiple PDFs)
          </div>
          <div className="mt-0.5 text-xs text-sky-800">
            Parse checks the latest consolidated MIF master and Caspio. If the member is on the MIF list,
            consolidator fields are prioritized into the form. Being on the MIF list does not block create
            (most new apps are MIF members not yet in Caspio). Skeleton create is blocked when an application
            already exists or the member is on the declined list; already-in-Caspio still asks to confirm.
          </div>
        </div>
        <input
          ref={serviceRequestFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const selectedList = Array.from(e.target.files || []);
            setServiceRequestFiles(selectedList);
            setServiceRequestFile(selectedList[0] || null);
            setServiceRequestParsedFields([]);
            setServiceRequestWarnings([]);
            setSingleAuthContactPreview(EMPTY_SINGLE_AUTH_CONTACT_PREVIEW);
            setSingleAuthMifMasterHit(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-emerald-300 bg-emerald-100/70 text-emerald-900 hover:bg-emerald-200/80 hover:text-emerald-950 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700/50"
            onClick={() => serviceRequestFileInputRef.current?.click()}
            disabled={isParsingServiceRequest}
          >
            1) Upload Single Auth PDF
          </Button>
          <Button
            type="button"
            className={
              serviceRequestFile && !isParsingServiceRequest
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700/50 hover:bg-emerald-50'
            }
            variant={serviceRequestFile && !isParsingServiceRequest ? 'default' : 'outline'}
            onClick={() => void parseServiceRequestPdfAndApply()}
            disabled={!serviceRequestFile || isParsingServiceRequest}
          >
            {isParsingServiceRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            {isParsingServiceRequest ? 'Parsing...' : '2) Parse First PDF to Form'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={clearServiceRequestFile}
            disabled={!serviceRequestFile || isParsingServiceRequest}
          >
            Delete Single Auth PDF + Reset Form
          </Button>
        </div>
        {singleAuthMifMasterHit ? (
          <div
            className={`rounded-md border px-2 py-1.5 text-xs ${
              singleAuthMifMasterHit.caspioExists || singleAuthMifMasterHit.alreadyInApp
                ? 'border-red-300 bg-red-50 text-red-950'
                : singleAuthMifMasterHit.mrnNameConflict || singleAuthMifMasterHit.exists
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {singleAuthMifMasterHit.caspioExists ||
            singleAuthMifMasterHit.alreadyInApp ||
            singleAuthMifMasterHit.mrnNameConflict ||
            singleAuthMifMasterHit.exists ? (
              <div className="space-y-0.5">
                <div className="font-medium">
                  {singleAuthMifMasterHit.caspioExists || singleAuthMifMasterHit.alreadyInApp
                    ? 'Duplicate warning — review before creating a skeleton.'
                    : singleAuthMifMasterHit.mrnNameConflict
                      ? 'MRN/CIN warning — names do not match; not treated as the same person.'
                      : 'Duplicate warning — review before creating a skeleton.'}
                </div>
                {singleAuthMifMasterHit.caspioExists ? (
                  <div>
                    Already in Caspio
                    {singleAuthMifMasterHit.caspioMatchLabel
                      ? ` (${singleAuthMifMasterHit.caspioMatchLabel})`
                      : ''}
                    . Skeleton create will be blocked.
                  </div>
                ) : null}
                {singleAuthMifMasterHit.alreadyInApp ? (
                  <div className="space-y-1">
                    <div>
                      Already has application (matched by MRN or Medi-Cal/CIN — not Caspio). Skeleton
                      create will be blocked.
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {(singleAuthMifMasterHit.existingApplicationIds || []).slice(0, 3).map((appId, idx) => {
                        const label =
                          singleAuthMifMasterHit.existingApplicationLabels?.[idx] || appId;
                        return (
                          <li key={appId}>
                            <Link
                              href={`/admin/applications/${encodeURIComponent(appId)}`}
                              className="font-medium underline underline-offset-2"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open {label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="text-[11px] text-red-900/80">
                      If you don&apos;t see them on Applications, open the link above (list filters can
                      hide completed/soft-deleted rows). Soft-deleted apps no longer block create after
                      refresh.
                    </div>
                  </div>
                ) : null}
                {singleAuthMifMasterHit.mrnNameConflict ? (
                  <div className="space-y-1">
                    <div>
                      Parsed MRN/CIN also appears on a differently named application (likely a wrong MRN
                      on the PDF or on file). Skeleton create is allowed after you confirm.
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {(singleAuthMifMasterHit.mrnNameConflictIds || []).slice(0, 3).map((appId, idx) => {
                        const label =
                          singleAuthMifMasterHit.mrnNameConflictLabels?.[idx] || appId;
                        return (
                          <li key={`conflict-${appId}`}>
                            <Link
                              href={`/admin/applications/${encodeURIComponent(appId)}`}
                              className="font-medium underline underline-offset-2"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open {label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {singleAuthMifMasterHit.exists ? (
                  <div>
                    On latest consolidated MIF master
                    {singleAuthMifMasterHit.matchedBy
                      ? ` (${singleAuthMifMasterHit.matchedBy}`
                      : ''}
                    {singleAuthMifMasterHit.matchLabel
                      ? `${singleAuthMifMasterHit.matchedBy ? ' - ' : ': '}${singleAuthMifMasterHit.matchLabel}`
                      : ''}
                    {singleAuthMifMasterHit.matchedBy ? ')' : ''}
                    {singleAuthMifMasterHit.runLabel ? ` · ${singleAuthMifMasterHit.runLabel}` : ''}.
                    Form fields were prioritized from that MIF entry. You will be asked to confirm before
                    creating a skeleton.
                  </div>
                ) : null}
              </div>
            ) : (
              <>Parsed member is not on the latest MIF master list and was not found in Caspio.</>
            )}
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          Single auth PDF selected: {serviceRequestFiles.length}
        </div>
        {serviceRequestFiles.length > 0 ? (
          <div className="rounded-md border bg-slate-50 p-2 space-y-1">
            <div className="text-xs font-medium text-slate-700">Uploaded single-auth PDF:</div>
            <div className="space-y-1">
              {serviceRequestFiles.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="text-xs text-slate-700 break-all">
                  {idx + 1}. {file.name}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          Subject template for ILS updates: <span className="font-medium">To ILS RE: (Name of Member) MRN: (MRN)</span>
        </div>
        <div className="text-xs text-muted-foreground">
          ILS recipients for Decline: <span className="font-medium">{ILS_DECISION_RECIPIENTS.join(', ')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-red-300 bg-red-50 text-red-900 hover:bg-red-100"
            disabled={
              sendingIlsDecisionRowId === 'single_auth_form' ||
              !String(memberData.memberFirstName || '').trim()
            }
            onClick={() => openSingleAuthIlsServiceDecisionPreview('decline')}
          >
            {sendingIlsDecisionRowId === 'single_auth_form' &&
            pendingIlsDecisionDraft?.choice === 'decline' ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Decline — deny services &amp; notify ILS
          </Button>
        </div>
        {singleAuthIlsDecisionLog ? (
          <div className="text-[11px] text-muted-foreground">
            Last single-auth decision:{' '}
            {singleAuthIlsDecisionLog.choice === 'accept' ? 'Accepted' : 'Declined'} ·{' '}
            {singleAuthIlsDecisionLog.sentAtIso
              ? new Date(singleAuthIlsDecisionLog.sentAtIso).toLocaleString()
              : 'Logged'}{' '}
            · {singleAuthIlsDecisionLog.sentBy || 'Staff'}
          </div>
        ) : null}
        {pendingIlsDecisionDraft?.rowId === 'single_auth_form' ? (
          <div className="rounded-md border bg-slate-50 p-3 text-xs space-y-2">
            <div className="font-medium">
              Verification Email Preview (
              {pendingIlsDecisionDraft.choice === 'accept' ? 'Accept' : 'Decline'})
            </div>
            <div>
              <span className="font-medium">To:</span> {pendingIlsDecisionDraft.recipients.join(', ')}
            </div>
            <div className="space-y-1">
              <Label htmlFor="singleAuthIlsDecisionSubject" className="text-xs font-medium">
                Subject (editable)
              </Label>
              <Input
                id="singleAuthIlsDecisionSubject"
                value={pendingIlsDecisionDraft.subject}
                onChange={(event) =>
                  setPendingIlsDecisionDraft((prev) =>
                    prev ? { ...prev, subject: event.target.value } : prev
                  )
                }
                className="bg-white text-sm"
                disabled={sendingIlsDecisionRowId === 'single_auth_form'}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="singleAuthIlsDecisionBody" className="text-xs font-medium">
                Email message (editable)
              </Label>
              <Textarea
                id="singleAuthIlsDecisionBody"
                value={pendingIlsDecisionDraft.emailBodyText}
                onChange={(event) =>
                  setPendingIlsDecisionDraft((prev) =>
                    prev ? { ...prev, emailBodyText: event.target.value } : prev
                  )
                }
                className="min-h-[180px] bg-white font-mono text-[13px] leading-6"
                disabled={sendingIlsDecisionRowId === 'single_auth_form'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => void sendIlsServiceDecision(pendingIlsDecisionDraft)}
                disabled={
                  sendingIlsDecisionRowId === 'single_auth_form' ||
                  !String(pendingIlsDecisionDraft.subject || '').trim() ||
                  !String(pendingIlsDecisionDraft.emailBodyText || '').trim()
                }
              >
                {sendingIlsDecisionRowId === 'single_auth_form' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Send to ILS
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={sendingIlsDecisionRowId === 'single_auth_form'}
                onClick={() => setPendingIlsDecisionDraft(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {serviceRequestParsedFields.length > 0 ? (
          <div className="text-xs text-green-700">
            Parsed via PDF: {serviceRequestParsedFields.join(', ')}
          </div>
        ) : null}
        {serviceRequestWarnings.length > 0 ? (
          <div className="text-xs text-amber-700">
            {serviceRequestWarnings.join(' ')}
          </div>
        ) : null}
        {(singleAuthContactPreview.memberPhone || singleAuthContactPreview.cellPhone || singleAuthContactPreview.memberEmail) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs space-y-1">
            <div className="font-medium text-amber-900">
              Parsed contact preview (autofilled on this page)
            </div>
            <div className="text-amber-800">
              Member Phone: {singleAuthContactPreview.memberPhone || 'Not found'}
            </div>
            <div className="text-amber-800">
              Cell Phone: {singleAuthContactPreview.cellPhone || 'Not found'}
            </div>
            {singleAuthContactPreview.memberEmail ? (
              <div className="text-amber-800">
                Member Email: {singleAuthContactPreview.memberEmail}
              </div>
            ) : null}
          </div>
        ) : null}
        {lastCreatedSkeleton ? (
          <>
          <div className="rounded-md border bg-emerald-50/60 p-2 space-y-2">
            <div className="text-xs font-medium">
              Skeleton created: <span className="font-semibold">{lastCreatedSkeleton.applicationId}</span> ({lastCreatedSkeleton.memberName})
            </div>
            <div className="text-xs">
              <Link
                href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}
                className="font-medium text-primary underline underline-offset-2"
              >
                Go to this application
              </Link>
            </div>
            <div className="text-xs text-muted-foreground">
              Client_ID2: <span className="font-mono">{lastCreatedSkeleton.clientId2 || 'Pending (set after Caspio push)'}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Share these links with family so they can sign in, continue the application, and upload required documents.
            </div>
            <div className="text-xs text-muted-foreground">
              Primary contact email: {memberData.contactEmail || 'Not entered yet'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyToClipboard('Portal sign-in link', familyPortalSignInLink)}
              >
                Copy Sign-in Link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyToClipboard('Portal continue link', familyPortalContinueLink)}
              >
                Copy Continue Link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadIntroEmailPreview()}
                disabled={isLoadingIntroEmailPreview || isSendingIntroEmail}
              >
                {isLoadingIntroEmailPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Preview Introductory Email
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void sendIntroductoryEmail()}
                disabled={!introEmailDraft || isSendingIntroEmail || isLoadingIntroEmailPreview || !selectedAssignedStaffId}
              >
                {isSendingIntroEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send Introductory Email
              </Button>
            </div>
            {introEmailDraft ? (
              <div className="rounded-md border bg-white p-3 space-y-2">
                <div className="text-xs font-medium">Edit Introductory Email Before Sending</div>
                {introEmailDraft.senderFrom ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                    Sending as: <span className="font-medium">{introEmailDraft.senderFrom}</span>
                  </div>
                ) : null}
                {introEmailDraft.senderWarning ? (
                  <Alert variant={introEmailDraft.senderUsesFallbackFrom ? 'warning' : 'default'}>
                    <AlertTitle>Sender fallback notice</AlertTitle>
                    <AlertDescription>{introEmailDraft.senderWarning}</AlertDescription>
                  </Alert>
                ) : null}
                {!selectedAssignedStaffId ? (
                  <Alert variant="destructive">
                    <AlertTitle>Assigned case manager required</AlertTitle>
                    <AlertDescription>
                      Assign staff before sending the introductory invite.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="space-y-1">
                  <Label htmlFor="intro-email-to" className="text-xs">To</Label>
                  <Input
                    id="intro-email-to"
                    value={introEmailDraft.to}
                    onChange={(event) =>
                      setIntroEmailDraft((prev) => (prev ? { ...prev, to: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="intro-email-subject" className="text-xs">Subject</Label>
                  <Input
                    id="intro-email-subject"
                    value={introEmailDraft.subject}
                    onChange={(event) =>
                      setIntroEmailDraft((prev) => (prev ? { ...prev, subject: event.target.value } : prev))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="intro-email-message" className="text-xs">Message</Label>
                  <Textarea
                    id="intro-email-message"
                    value={introEmailDraft.message}
                    rows={10}
                    onChange={(event) =>
                      setIntroEmailDraft((prev) => (prev ? { ...prev, message: event.target.value } : prev))
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This email is logged in <span className="font-medium">Admin &gt; Email Logs</span> after sending.
                </p>
              </div>
            ) : null}
          </div>
          <Button type="button" className="w-full" asChild>
            <Link href={`/admin/applications/${lastCreatedSkeleton.applicationId}`}>
              Go to Application Main Page
            </Link>
          </Button>
          </>
        ) : null}
      </div>
      ) : null}
    </>
  );
}
