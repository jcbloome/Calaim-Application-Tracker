'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2 } from 'lucide-react';
import {
  clean,
  clientIdOf,
  isUsableSwEmail,
  type CaspioAssessorRoleInfo,
  type KaiserMember,
  type StaffOption,
  type AnswerMap,
} from './isp-workflow-helpers';
import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { type Dispatch, type SetStateAction } from 'react';
import type { useToast } from '@/hooks/use-toast';

export interface ConfirmAssessorStepProps {
  confirmedSw: boolean;
  assessorType: "msw" | "rn";
  formerSwImportMode: boolean;
  assessorCaspioRole: CaspioAssessorRoleInfo | null;
  socialWorkerName: string;
  socialWorkerEmail: string;
  setAssessorType: Dispatch<SetStateAction<"msw" | "rn">>;
  setConfirmedSw: Dispatch<SetStateAction<boolean>>;
  setConfirmedRn: Dispatch<SetStateAction<boolean>>;
  setFormerSwImportMode: Dispatch<SetStateAction<boolean>>;
  setAssessorCaspioRole: Dispatch<SetStateAction<CaspioAssessorRoleInfo | null>>;
  selectedMember: KaiserMember;
  selectedClientId: string;
  loadCaspioFieldPreview: (memberIdRaw: string, memberOverride?: KaiserMember | null | undefined, options?: { preferLive?: boolean | undefined; assessorTypeOverride?: "msw" | "rn" | undefined; } | undefined) => Promise<void>;
  rnOptions: StaffOption[];
  setRnUid: Dispatch<SetStateAction<string>>;
  setSwPortalActive: Dispatch<SetStateAction<boolean | null>>;
  setAnswers: Dispatch<SetStateAction<AnswerMap>>;
  applyMswAdminOverrideToAnswers: (base: AnswerMap, opts?: { printName?: string | undefined; } | undefined) => AnswerMap;
  setSocialWorkerName: Dispatch<SetStateAction<string>>;
  setSocialWorkerEmail: Dispatch<SetStateAction<string>>;
  verifySwPortalAccess: (emailRaw: string, swIdRaw?: string | undefined) => Promise<boolean>;
  socialWorkerSwId: string;
  checkingSwPortal: boolean;
  swPortalActive: boolean | null;
  socialWorkerCounty: string;
  setSocialWorkerCounty: Dispatch<SetStateAction<string>>;
  memberCounty: string;
  setMemberCounty: Dispatch<SetStateAction<string>>;
  toast: ReturnType<typeof useToast>['toast'];
  setResolvedPreview: Dispatch<SetStateAction<Record<string, string>>>;
}

export function ConfirmAssessorStep({
  confirmedSw,
  assessorType,
  formerSwImportMode,
  assessorCaspioRole,
  socialWorkerName,
  socialWorkerEmail,
  setAssessorType,
  setConfirmedSw,
  setConfirmedRn,
  setFormerSwImportMode,
  setAssessorCaspioRole,
  selectedMember,
  selectedClientId,
  loadCaspioFieldPreview,
  rnOptions,
  setRnUid,
  setSwPortalActive,
  setAnswers,
  applyMswAdminOverrideToAnswers,
  setSocialWorkerName,
  setSocialWorkerEmail,
  verifySwPortalAccess,
  socialWorkerSwId,
  checkingSwPortal,
  swPortalActive,
  socialWorkerCounty,
  setSocialWorkerCounty,
  memberCounty,
  setMemberCounty,
  toast,
  setResolvedPreview,
}: ConfirmAssessorStepProps) {
  return (
    <div
      className={`rounded-md border bg-white p-3 ${
        confirmedSw ? 'border-green-300' : ''
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Badge variant="outline">1</Badge>
        {assessorType === 'rn' ? 'Confirm RN assessor' : 'Confirm social worker'}
        {confirmedSw ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : null}
        {formerSwImportMode ? (
          <Badge className="bg-amber-100 text-amber-950 hover:bg-amber-100">
            Departed SW / completed ISP
          </Badge>
        ) : assessorCaspioRole?.caspioRole === 'msw' ||
          assessorCaspioRole?.caspioRole === 'both' ? (
          <Badge className="bg-sky-100 text-sky-950 hover:bg-sky-100">
            {assessorCaspioRole.caspioRole === 'both' ? 'MSW + RN' : 'MSW'} ·{' '}
            {clean(socialWorkerName) || clean(assessorCaspioRole.name) || 'From Caspio'}
          </Badge>
        ) : assessorCaspioRole?.caspioRole === 'rn' ? (
          <Badge className="bg-violet-100 text-violet-950 hover:bg-violet-100">
            RN · {clean(socialWorkerName) || clean(assessorCaspioRole.name) || 'From Caspio'}
          </Badge>
        ) : socialWorkerName || socialWorkerEmail ? (
          <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
            {assessorType === 'rn' ? 'From RN_ID / roster' : 'From Caspio'}
          </Badge>
        ) : null}
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="isp-assessor-type"
            checked={assessorType === 'msw'}
            onChange={() => {
              setAssessorType('msw');
              setConfirmedSw(false);
              setConfirmedRn(false);
              setFormerSwImportMode(false);
              setAssessorCaspioRole(null);
              const memberId = selectedMember
                ? clientIdOf(selectedMember)
                : clean(selectedClientId);
              if (memberId) {
                void loadCaspioFieldPreview(memberId, selectedMember, {
                  preferLive: true,
                  assessorTypeOverride: 'msw',
                });
              }
            }}
          />
          <span>MSW / Social Worker (default)</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="isp-assessor-type"
            checked={assessorType === 'rn'}
            onChange={() => {
              setAssessorType('rn');
              setConfirmedSw(false);
              setConfirmedRn(false);
              setFormerSwImportMode(false);
              setAssessorCaspioRole(null);
              // Same RN does ALFT and final approval after admin review.
              if (isUsableSwEmail(socialWorkerEmail)) {
                const match =
                  rnOptions.find(
                    (r) => clean(r.email).toLowerCase() === clean(socialWorkerEmail).toLowerCase()
                  ) || null;
                if (match) setRnUid(match.uid);
              }
              const memberId = selectedMember
                ? clientIdOf(selectedMember)
                : clean(selectedClientId);
              if (memberId) {
                void loadCaspioFieldPreview(memberId, selectedMember, {
                  preferLive: true,
                  assessorTypeOverride: 'rn',
                });
              }
            }}
          />
          <span>Override: RN does ALFT (in-person)</span>
        </label>
      </div>
      {assessorType === 'rn' ? (
        <p className="mb-3 text-xs text-violet-900">
          RN fills the ALFT on the Social Worker portal, admin does first review, then the{' '}
          <span className="font-medium">same RN</span> completes final approval. Enable
          portal access in{' '}
          <Link href="/admin/rn-user-management" className="underline underline-offset-2">
            RN User Management
          </Link>
          Prefills from member <span className="font-medium">RN_ID</span> (id) and{' '}
          <span className="font-medium">RN_Assigned</span> (name) when set in Caspio.
        </p>
      ) : null}
      {assessorType === 'msw' ? (
      <label className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-sm">
        <Checkbox
          checked={formerSwImportMode}
          onCheckedChange={(checked) => {
            const on = checked === true;
            setFormerSwImportMode(on);
            setConfirmedSw(false);
            if (on) {
              setSwPortalActive(null);
              setAnswers((prev) => applyMswAdminOverrideToAnswers(prev));
            }
          }}
        />
        <span>
          <span className="font-medium">SW no longer with us — import completed ISP</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Use when the social worker already completed and signed the ISP but is no longer active.
            Enter their name below (portal access not required), then continue steps and upload the
            completed ALFT PDF. MSW admin override lets you Approve → Send to RN without a new SW
            e-signature.
          </span>
        </span>
      </label>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium">
            {formerSwImportMode
              ? 'Name who did the assessment (required)'
              : assessorType === 'rn'
                ? 'RN name'
                : 'Name'}
          </label>
          <Input
            value={socialWorkerName}
            onChange={(e) => {
              setSocialWorkerName(e.target.value);
              setConfirmedSw(false);
              if (assessorType === 'rn') setConfirmedRn(false);
            }}
            placeholder={
              formerSwImportMode
                ? 'Social worker who completed / signed the ISP'
                : assessorType === 'rn'
                  ? 'RN who will complete the ALFT'
                  : 'Social worker name'
            }
            className={socialWorkerName ? 'border-green-400 bg-green-50/50' : undefined}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">
            Email {formerSwImportMode ? '(optional)' : '(invite destination)'}
          </label>
          <Input
            value={socialWorkerEmail}
            onChange={(e) => {
              setSocialWorkerEmail(e.target.value);
              setConfirmedSw(false);
              if (assessorType === 'rn') setConfirmedRn(false);
              if (!formerSwImportMode) setSwPortalActive(null);
            }}
            onBlur={() => {
              if (!formerSwImportMode && isUsableSwEmail(socialWorkerEmail)) {
                void verifySwPortalAccess(socialWorkerEmail, socialWorkerSwId);
              }
            }}
            placeholder={
              formerSwImportMode
                ? 'Optional — not required when importing a completed ISP'
                : assessorType === 'rn'
                  ? 'RN email (RN User Management portal)'
                  : 'From CalAIM_tbl_Social_Worker.SW_email'
            }
            className={
              isUsableSwEmail(socialWorkerEmail) ? 'border-green-400 bg-green-50/50' : undefined
            }
          />
          {!formerSwImportMode ? (
            <>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {assessorType === 'rn' ? (
                  <>
                    Prefer member <span className="font-medium">RN_ID</span> / Caspio RN roster email.
                    Portal access is managed in RN User Management.
                  </>
                ) : (
                  <>
                    Pulled from Caspio{' '}
                    <span className="font-medium">CalAIM_tbl_Social_Worker.SW_email</span> (same
                    email used when activating SW portal access).
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {checkingSwPortal ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking portal access…
                  </span>
                ) : swPortalActive === true ? (
                  <Badge className="bg-green-100 text-green-900 hover:bg-green-100">
                    Portal On (
                    {assessorType === 'rn' ? 'RN User Management' : 'SW User Management'})
                  </Badge>
                ) : swPortalActive === false ? (
                  <Badge variant="destructive">
                    Portal Off — enable in{' '}
                    {assessorType === 'rn' ? 'RN User Management' : 'SW User Management'}
                  </Badge>
                ) : (
                  <Badge variant="outline">Portal access not verified yet</Badge>
                )}
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link
                    href={
                      assessorType === 'rn'
                        ? '/admin/rn-user-management'
                        : '/admin/sw-user-management'
                    }
                    target="_blank"
                  >
                    Open {assessorType === 'rn' ? 'RN' : 'SW'} User Management
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Portal invite is skipped for departed SWs. After parsing the PDF, use{' '}
              <span className="font-medium">Save as ISP intake</span> to continue review / RN / download.
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">
            {assessorType === 'rn' ? 'RN county' : 'SW county'}
          </label>
          <Input
            value={socialWorkerCounty}
            onChange={(e) => {
              setSocialWorkerCounty(e.target.value);
            }}
            placeholder="From CalAIM_tbl_Social_Worker.County"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Member county</label>
          <Input
            value={memberCounty}
            onChange={(e) => {
              setMemberCounty(e.target.value);
            }}
            placeholder="From CalAIM_tbl_Members.Member_County"
          />
        </div>
      </div>
      {!formerSwImportMode && (socialWorkerName || assessorCaspioRole) ? (
        <div
          className={`mt-3 rounded-md border px-3 py-2.5 ${
            assessorType === 'msw' && assessorCaspioRole?.caspioRole === 'rn'
              ? 'border-red-300 bg-red-50'
              : assessorType === 'rn' && assessorCaspioRole?.caspioRole === 'msw'
                ? 'border-amber-300 bg-amber-50'
                : assessorCaspioRole?.caspioRole === 'msw' ||
                    assessorCaspioRole?.caspioRole === 'rn' ||
                    assessorCaspioRole?.caspioRole === 'both'
                  ? 'border-green-300 bg-green-50/70'
                  : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="text-xs font-medium text-slate-700">
            Confirm this {assessorType === 'rn' ? 'RN' : 'social worker'} (not the other role)
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {clean(socialWorkerName) || clean(assessorCaspioRole?.name) || 'Name not set'}
          </div>
          {clean(socialWorkerEmail) || clean(assessorCaspioRole?.email) ? (
            <div className="text-xs text-muted-foreground">
              {clean(socialWorkerEmail) || clean(assessorCaspioRole?.email)}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {assessorCaspioRole?.inMswTable ? (
              <Badge className="bg-sky-100 text-sky-950 hover:bg-sky-100">
                MSW · CalAIM_tbl_Social_Worker
              </Badge>
            ) : null}
            {assessorCaspioRole?.inRnTable ? (
              <Badge className="bg-violet-100 text-violet-950 hover:bg-violet-100">
                RN · CalAIM_tbl_RN
              </Badge>
            ) : null}
            {!assessorCaspioRole?.inMswTable && !assessorCaspioRole?.inRnTable ? (
              <Badge variant="outline">
                {assessorCaspioRole?.caspioRoleLabel || 'Unknown'} — not matched in Caspio MSW/RN
                tables yet
              </Badge>
            ) : null}
          </div>
          {assessorType === 'msw' && assessorCaspioRole?.caspioRole === 'rn' ? (
            <p className="mt-2 text-[11px] text-red-800">
              This person is on <span className="font-medium">CalAIM_tbl_RN</span> only — they are an
              RN, not an MSW/social worker. Switch to{' '}
              <span className="font-medium">Override: RN does ALFT</span>, or pick a social worker from{' '}
              <span className="font-medium">CalAIM_tbl_Social_Worker</span>.
            </p>
          ) : null}
          {assessorType === 'rn' && assessorCaspioRole?.caspioRole === 'msw' ? (
            <p className="mt-2 text-[11px] text-amber-900">
              This person is on <span className="font-medium">CalAIM_tbl_Social_Worker</span> only —
              they are MSW, not RN. Switch back to MSW / Social Worker, or assign someone from{' '}
              <span className="font-medium">CalAIM_tbl_RN</span>.
            </p>
          ) : null}
          {assessorType === 'msw' &&
          (assessorCaspioRole?.caspioRole === 'msw' ||
            assessorCaspioRole?.caspioRole === 'both') ? (
            <p className="mt-2 text-[11px] text-green-800">
              Matched as social worker / MSW
              {assessorCaspioRole.caspioRole === 'both' ? ' (also listed on RN table)' : ''}.
            </p>
          ) : null}
          {assessorType === 'rn' &&
          (assessorCaspioRole?.caspioRole === 'rn' ||
            assessorCaspioRole?.caspioRole === 'both') ? (
            <p className="mt-2 text-[11px] text-green-800">
              Matched as RN
              {assessorCaspioRole.caspioRole === 'both' ? ' (also listed on MSW table)' : ''}.
            </p>
          ) : null}
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        className="mt-2"
        variant={confirmedSw ? 'outline' : 'default'}
        onClick={() => {
          void (async () => {
            if (formerSwImportMode) {
              if (!clean(socialWorkerName)) {
                toast({
                  variant: 'destructive',
                  title: 'Social worker name required',
                  description:
                    'Enter the name of the social worker who completed the assessment.',
                });
                return;
              }
              setConfirmedSw(true);
              setAnswers((prev) => ({
                ...prev,
                p1_assessor_name: clean(prev.p1_assessor_name) || clean(socialWorkerName),
                p14_print_name: clean(prev.p14_print_name) || clean(socialWorkerName),
              }));
              toast({
                title: 'Departed SW confirmed',
                description: `${socialWorkerName} recorded as assessor. Continue steps, then upload the completed ALFT PDF.`,
                className: 'bg-green-100 text-green-900 border-green-200',
              });
              return;
            }
            if (!clean(socialWorkerName) && !clean(socialWorkerEmail)) {
              toast({
                variant: 'destructive',
                title: assessorType === 'rn' ? 'RN required' : 'Social worker required',
                description:
                  assessorType === 'rn'
                    ? 'Enter the RN name and email, then confirm.'
                    : 'Enter the social worker name and email, then confirm.',
              });
              return;
            }
            if (!clean(socialWorkerEmail) || !socialWorkerEmail.includes('@')) {
              toast({
                variant: 'destructive',
                title: assessorType === 'rn' ? 'Valid RN email required' : 'Valid SW email required',
                description: 'Invite needs a real email address.',
              });
              return;
            }
            if (assessorType === 'msw' && assessorCaspioRole?.caspioRole === 'rn') {
              toast({
                variant: 'destructive',
                title: 'This staff is RN, not MSW',
                description: `${clean(socialWorkerName) || 'This person'} is on CalAIM_tbl_RN only. Use RN override or choose a social worker from CalAIM_tbl_Social_Worker.`,
              });
              return;
            }
            if (assessorType === 'rn' && assessorCaspioRole?.caspioRole === 'msw') {
              toast({
                variant: 'destructive',
                title: 'This staff is MSW, not RN',
                description: `${clean(socialWorkerName) || 'This person'} is on CalAIM_tbl_Social_Worker only. Switch to MSW / Social Worker or pick someone from CalAIM_tbl_RN.`,
              });
              return;
            }
            const portalOk = await verifySwPortalAccess(
              socialWorkerEmail,
              socialWorkerSwId
            );
            if (!portalOk) {
              toast({
                variant: 'destructive',
                title: 'Portal access required',
                description:
                  assessorType === 'rn'
                    ? `Turn on Portal access for ${clean(socialWorkerEmail) || 'this RN'} in Admin → RN User Management before confirming.`
                    : `Turn on Portal access for ${clean(socialWorkerEmail) || 'this social worker'} in Admin → SW User Management before confirming. Or check “SW no longer with us” to import a completed ISP.`,
              });
              return;
            }
            setConfirmedSw(true);
            if (assessorType === 'rn') {
              const match =
                rnOptions.find(
                  (r) =>
                    clean(r.email).toLowerCase() === clean(socialWorkerEmail).toLowerCase()
                ) || null;
              if (match) setRnUid(match.uid);
              else setRnUid('');
              setConfirmedRn(true);
            }
            const assessorDisplayName = clean(socialWorkerName);
            if (assessorDisplayName) {
              setAnswers((prev) => ({
                ...prev,
                p1_assessor_name: clean(prev.p1_assessor_name) || assessorDisplayName,
                p14_print_name: clean(prev.p14_print_name) || assessorDisplayName,
              }));
              setResolvedPreview((prev) => ({
                ...prev,
                p1_assessor_name: clean(prev.p1_assessor_name) || assessorDisplayName,
              }));
            }
            toast({
              title: assessorType === 'rn' ? 'RN assessor confirmed' : 'Social worker confirmed',
              description: `${socialWorkerName || (assessorType === 'rn' ? 'RN' : 'SW')} · ${socialWorkerEmail}${
                assessorCaspioRole?.caspioRoleLabel &&
                assessorCaspioRole.caspioRole !== 'unknown'
                  ? ` · ${assessorCaspioRole.caspioRoleLabel}`
                  : ''
              } · Portal On`,
              className: 'bg-green-100 text-green-900 border-green-200',
            });
          })();
        }}
        disabled={checkingSwPortal}
      >
        {checkingSwPortal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {confirmedSw
          ? 'Confirmed'
          : formerSwImportMode
            ? 'Confirm departed SW name'
            : assessorType === 'rn'
              ? 'Confirm RN assessor'
              : 'Confirm social worker'}
      </Button>
      {!formerSwImportMode && swPortalActive === false ? (
        <p className="mt-2 text-xs text-red-700">
          {clean(socialWorkerEmail) || 'This SW'} does not have portal access in{' '}
          <Link
            href={
              assessorType === 'rn'
                ? '/admin/rn-user-management'
                : '/admin/sw-user-management'
            }
            className="underline underline-offset-2"
          >
            {assessorType === 'rn' ? 'RN User Management' : 'SW User Management'}
          </Link>
          . Enable Portal access there, then confirm again
          {assessorType === 'msw' ? (
            <>
              {' '}
              — or check <span className="font-medium">SW no longer with us</span> to import a
              completed ISP by name.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : null}
    </div>
  );
}
