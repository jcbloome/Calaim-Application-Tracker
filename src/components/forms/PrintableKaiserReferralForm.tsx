'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

type ReferralPrefill = {
  memberName?: string;
  memberDob?: string;
  memberPhone?: string;
  memberAddress?: string;
  memberMrn?: string;
  memberMediCal?: string;
  caregiverName?: string;
  caregiverContact?: string;
  referralDate?: string;
  referrerName?: string;
  referrerOrganization?: string;
  referrerNpi?: string;
  referrerAddress?: string;
  referrerEmail?: string;
  referrerPhone?: string;
  referrerRelationship?: string;
  currentLocationName?: string;
  currentLocationAddress?: string;
  healthPlan?: string;
};

interface PrintableKaiserReferralFormProps extends ReferralPrefill {
  applicationId?: string;
  showPrintButton?: boolean;
}

const Checkbox = ({ checked }: { checked?: boolean }) => (
  <span
    aria-hidden
    className="inline-flex h-[13px] w-[13px] items-center justify-center border border-black align-middle text-[9px] leading-none"
  >
    {checked ? 'X' : ''}
  </span>
);

const lineValue = (value?: string) => String(value || '').trim();

function FieldLine({ label, value, className = '' }: { label: string; value?: string; className?: string }) {
  return (
    <div className={`leading-5 ${className}`}>
      <span className="font-semibold">{label}</span>{' '}
      <span className="inline-block min-w-[260px] border-b border-black px-1 align-baseline">{lineValue(value) || ' '}</span>
    </div>
  );
}

function PageShell({
  children,
  pageNumber,
  breakAfter = true,
}: {
  children: React.ReactNode;
  pageNumber: number;
  breakAfter?: boolean;
}) {
  return (
    <section
      className={`kaiser-packet-page border border-black bg-white px-5 py-4 ${
        breakAfter ? 'mb-6 break-after-page print:mb-0 print:break-after-page' : ''
      }`}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] leading-4">
        <span>Updated October 2025</span>
        <span>Page {pageNumber} of 15</span>
      </div>
      {children}
      <div className="mt-4 text-right text-xs">-- {pageNumber} of 15 --</div>
    </section>
  );
}

function SectionBHeader({ itemLabel = '' }: { itemLabel?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <img src="/kaiser-permanente-logo.png" alt="Kaiser Permanente" className="h-5 w-auto object-contain" />
      </div>
      <div className="text-[32px] font-bold leading-none">SECTION B: COMMUNITY SUPPORT SERVICES</div>
      <div className="mt-1 h-[6px] w-full bg-black" />
      {itemLabel ? <div className="mt-2 text-[36px] font-bold leading-none">{itemLabel}</div> : null}
    </div>
  );
}

export function PrintableKaiserReferralForm({
  applicationId,
  showPrintButton = true,
  ...prefill
}: PrintableKaiserReferralFormProps) {
  const memberName = lineValue(prefill.memberName);
  const referrerRelationship = lineValue(prefill.referrerRelationship).toLowerCase();
  const hasKaiserPlan = lineValue(prefill.healthPlan).toLowerCase().includes('kaiser');
  const referralDate = lineValue(prefill.referralDate);
  const memberAddress = lineValue(prefill.memberAddress);
  const currentLocationAddress = lineValue(prefill.currentLocationAddress || prefill.memberAddress);
  const referrerName = lineValue(prefill.referrerName);
  const referrerOrg = lineValue(prefill.referrerOrganization);
  const referrerEmail = lineValue(prefill.referrerEmail);
  const referrerPhone = lineValue(prefill.referrerPhone);
  const referrerNpi = lineValue(prefill.referrerNpi);
  const referrerAddress = lineValue(prefill.referrerAddress);

  return (
    <PrintableFormLayout
      title="Kaiser Community Supports Member Referral Form"
      subtitle="Initial or Renewal Authorization Referral (Pre-Populated)"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="kaiser-referral-packet space-y-0 font-['Arial'] text-[11px] leading-[1.35] print:text-[10.5px] print:leading-[1.3]">
        <PageShell pageNumber={1}>
          <div className="flex items-center justify-between gap-4 border-b border-black pb-3">
            <div>
              <div className="text-[20px] font-bold leading-6">Community Supports Member Referral Form</div>
              <div className="text-[13px]">Keeping Members at Home and Chronic Conditions</div>
            </div>
            <img src="/kaiser-permanente-logo.png" alt="Kaiser Permanente" className="h-12 w-auto object-contain" />
          </div>
          <div className="mt-4 space-y-2 text-[11px]">
            <p>
              Kaiser Permanente ONLY accepts referrals for Medi-Cal Members whose coverage is assigned to Kaiser Permanente.
            </p>
            <p>
              Kaiser Permanente employs a "No Wrong Door" approach for Enhanced Care Management (ECM), Complex Case Management (CCM),
              Community Health Worker (CHW), and Community Supports (CS) referrals. Referrals should be submitted to the Member&apos;s
              Managed Care Plan (MCP) and will be accepted from all points of care within the continuum.
            </p>
            <p className="font-medium">What are Community Support services?</p>
            <p>
              CS services improve the health and well-being of MCP Members by addressing Members&apos; health-related social needs and
              helping them live healthier lives and avoid higher, costlier levels of care.
            </p>
            <p className="font-medium">Included Community Supports in this referral packet:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Respite Services (Caregiver Respite)</li>
              <li>Assisted Living Facility Transitions</li>
              <li>Community or Home Transition Services</li>
              <li>Personal Care and Homemaker Services</li>
              <li>Environmental Accessibility Adaptations</li>
              <li>Medically Tailored Meals / Medically-Supportive Food</li>
              <li>Asthma Remediation</li>
            </ul>
            <p className="font-medium">Regional referral email addresses:</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <div className="font-semibold">Northern California</div>
                <div className="font-mono text-xs">REGMCDURNs-KPNC@KP.org</div>
                <div className="text-[10px]">Provider Portal: NCAL - Provider Portal</div>
              </div>
              <div>
                <div className="font-semibold">Southern California</div>
                <div className="font-mono text-xs">RegCareCoordCaseMgmt@KP.org</div>
                <div className="text-[10px]">Provider Portal: SCal Provider Portal</div>
              </div>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={2}>
          <div className="mb-1 flex items-center gap-2">
            <img src="/kaiser-permanente-logo.png" alt="Kaiser Permanente" className="h-5 w-auto object-contain" />
          </div>
          <div className="text-[38px] font-bold leading-none">SECTION A</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[12px]">Fields marked with an asterisk (*) are mandatory</div>

          <div className="mt-2 border-2 border-black bg-[#d9e8f7] p-2 text-[13px] leading-5">
            <div className="font-semibold">Is the person being referred a Kaiser Permanente (KP) Medi-Cal Member?*</div>
            <div><Checkbox checked={hasKaiserPlan} /> Yes, this is a Kaiser Permanente Medi-Cal Member</div>
            <div><Checkbox checked={!hasKaiserPlan} /> No, STOP, do NOT proceed. Please send referral to their assigned Medi-Cal Managed Care Plan</div>
          </div>

          <div className="mt-2 text-[36px] font-bold leading-none">Referral Source Information</div>
          <div className="mt-1 border-2 border-black text-[13px]">
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Date of Referral*</div>
                <div className="mt-1 min-h-[22px]">{referralDate}</div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Referrer Name*</div>
                <div className="mt-1 min-h-[22px]">{referrerName}</div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referring Organization Name*</div>
              <div className="mt-1 min-h-[22px]">{referrerOrg}</div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referring Organization National Provider Identifier (NPI)*</div>
              <div className="mt-1 min-h-[22px]">{referrerNpi}</div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referrer/Referring Organization Address* (Street, City, State, Zip Code)</div>
              <div className="mt-1 min-h-[22px]">{referrerAddress}</div>
            </div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Referrer Email*</div>
                <div className="mt-1 min-h-[22px]">{referrerEmail}</div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Referrer Phone Number*</div>
                <div className="mt-1 min-h-[22px]">{referrerPhone}</div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Referrer Relationship to Member? Select the ONE that applies*:</div>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                <span><Checkbox checked={referrerRelationship.includes('medical')} /> Medical provider</span>
                <span><Checkbox checked={referrerRelationship.includes('social')} /> Social services provider</span>
                <span><Checkbox checked={referrerRelationship.includes('family') || referrerRelationship.includes('member')} /> Member/family</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span><Checkbox checked={!referrerRelationship || referrerRelationship.includes('community')} /> Other please specify:</span>
                <span className="inline-block min-w-[360px] border border-black px-1">Community Support (CalAim)</span>
              </div>
            </div>
            <div className="p-1.5">
              <div className="font-semibold">External referral by? Select the ONE that applies*:</div>
              <div className="mt-1 space-y-0.5">
                <div><Checkbox checked={false} /> Network Lead Entity (NLE)</div>
                <div><Checkbox checked={false} /> ECM, CHW or CS vendor - select the one you are affiliated with:</div>
                <div className="ml-4 flex flex-wrap gap-x-5 gap-y-0.5">
                  <span><Checkbox checked={false} /> Full Circle Health</span>
                  <span><Checkbox checked={false} /> Independent Living Systems</span>
                  <span><Checkbox checked={false} /> Mom&apos;s Meals</span>
                  <span><Checkbox checked={false} /> Partners in Care</span>
                </div>
                <div><Checkbox checked={false} /> Managed Care Plan (MCP)</div>
                <div><Checkbox checked={false} /> Other health care provider</div>
                <div><Checkbox checked={false} /> Mental health care provider</div>
                <div><Checkbox checked={false} /> Hospital or Emergency Room care team</div>
                <div><Checkbox checked={false} /> County or other government organization</div>
                <div><Checkbox checked={false} /> Schools/Local Education Agencies (LEAs)</div>
                <div><Checkbox checked /> Other community-based provider</div>
                <div><Checkbox checked={false} /> Legal aid organizations</div>
                <div><Checkbox checked={false} /> Justice involved organizations</div>
                <div className="mt-1 flex items-center gap-2">
                  <span><Checkbox checked={false} /> Other, please specify:</span>
                  <span className="inline-block min-w-[340px] border border-black px-1">&nbsp;</span>
                </div>
              </div>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={3}>
          <div className="mb-1 flex items-center gap-2">
            <img src="/kaiser-permanente-logo.png" alt="Kaiser Permanente" className="h-5 w-auto object-contain" />
          </div>
          <div className="text-[38px] font-bold leading-none">SECTION A</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[12px]">Fields marked with an asterisk (*) are mandatory</div>

          <div className="mt-2 text-[36px] font-bold leading-none">Member Information</div>
          <div className="mt-1 border-2 border-black text-[13px]">
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member Name (First Name, Middle Initial, Last Name)*</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">{memberName}</div>
            </div>
            <div className="grid grid-cols-2 border-b border-black">
              <div className="border-r border-black p-1.5">
                <div className="font-semibold">Member Date of Birth*</div>
                <div className="mt-1 min-h-[28px] border border-black px-1">{lineValue(prefill.memberDob)}</div>
              </div>
              <div className="p-1.5">
                <div className="font-semibold">Member Phone Number*</div>
                <div className="mt-1 min-h-[28px] border border-black px-1">{lineValue(prefill.memberPhone)}</div>
              </div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member Mailing Address* (Street, City, State, Zip Code)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">{memberAddress}</div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Member&apos;s Kaiser Permanente MRN* (or Medi-Cal CIN if MRN is unknown)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">{lineValue(prefill.memberMrn || prefill.memberMediCal)}</div>
            </div>
            <div className="border-b border-black p-1.5">
              <div className="font-semibold">Caregiver/Support Person Name</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">{lineValue(prefill.caregiverName)}</div>
            </div>
            <div className="p-1.5">
              <div className="font-semibold">Caregiver/Support Person Contact (Email/Phone Number)</div>
              <div className="mt-1 min-h-[28px] border border-black px-1">{lineValue(prefill.caregiverContact)}</div>
            </div>
          </div>

          <div className="mt-2 text-[36px] font-bold leading-none">Current Service Usage</div>
          <div className="mt-1 border-2 border-black p-1.5 text-[13px]">
            <div className="font-semibold">1.) Is the Member currently receiving any of the following services? Select ALL that apply:</div>
            <div className="mt-1"><Checkbox checked={false} /> A.) ECM - If selected, please include the following information:</div>
            <div className="ml-8 mt-0.5 flex items-center gap-2">
              <span className="font-semibold">Provider Name:</span>
              <span className="inline-block min-w-[340px] border border-black px-1">&nbsp;</span>
            </div>
            <div className="ml-8 mt-0.5 flex items-center gap-2">
              <span className="font-semibold">Email or Phone Number:</span>
              <span className="inline-block min-w-[305px] border border-black px-1">&nbsp;</span>
            </div>
            <div className="mt-1"><Checkbox checked={false} /> B.) CCM</div>
            <div><Checkbox checked={false} /> C.) CHW</div>
            <div><Checkbox checked /> D.) CS Services</div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-2">
              <div className="space-y-0.5">
                <div><Checkbox checked={false} /> Respite Services (Caregiver Respite)</div>
                <div><Checkbox checked /> Assisted Living Facility Transitions</div>
                <div><Checkbox checked={false} /> Community or Home Transition Services</div>
                <div><Checkbox checked={false} /> Personal Care and Homemaker Services</div>
                <div><Checkbox checked={false} /> Environmental Accessibility Adaptations (Home Modifications)</div>
                <div><Checkbox checked={false} /> Medically Tailored Meals/Medically-Supportive Food</div>
                <div><Checkbox checked={false} /> Sobering Centers</div>
              </div>
              <div className="space-y-0.5">
                <div><Checkbox checked={false} /> Asthma Remediation</div>
                <div><Checkbox checked={false} /> Housing Transition Navigation Services</div>
                <div><Checkbox checked={false} /> Housing Deposits</div>
                <div><Checkbox checked={false} /> Housing Tenancy and Sustaining Services</div>
                <div><Checkbox checked={false} /> Day Habilitation Programs</div>
                <div><Checkbox checked={false} /> Recuperative Care (Medical Respite)</div>
                <div><Checkbox checked={false} /> Short-Term Post-Hospitalization Housing</div>
              </div>
            </div>
          </div>

          <div className="mt-2 text-[36px] font-bold leading-none">Attestation*</div>
          <div className="mt-1 border-2 border-black bg-[#d9e8f7] p-1.5 text-[13px] leading-5">
            <div><Checkbox checked /> By checking this box, you confirm that all information provided on this form is accurate and has been verified.</div>
            <div>You also confirm that the Member has consented to participating in the program(s) they are being referred to</div>
            <div>AND that you can provide supporting documentation if requested.</div>
          </div>
        </PageShell>

        <PageShell pageNumber={4}>
          <div className="mb-1 flex items-center gap-2">
            <img src="/kaiser-permanente-logo.png" alt="Kaiser Permanente" className="h-5 w-auto object-contain" />
          </div>
          <div className="text-[32px] font-bold leading-none">SECTION B: COMMUNITY SUPPORT SERVICES</div>
          <div className="mt-1 h-[6px] w-full bg-black" />
          <div className="mt-2 text-[36px] font-bold leading-none"><Checkbox checked={false} /> 1. Respite Services (Caregiver Respite)</div>
          <div className="mt-1 border-y border-black p-1.5 text-[13px]">
            <div className="text-[34px] font-bold leading-none">Important Information - Please Read</div>
            <div><span className="font-semibold">Description:</span> Provides short-term relief for caregivers of Members who are at home or in an approved facility.</div>
            <div className="mt-1 font-semibold">Key Information:</div>
            <ul className="ml-6 list-disc">
              <li>Service limit is up to 336 hours per calendar year, unless an exception is made.</li>
              <li>Hours beyond the 336-hour calendar year limit may be approved when caregiver support changes.</li>
            </ul>
          </div>
          <div className="mt-2 text-[13px]">
            <div className="font-bold">1.1) THE MEMBER MUST MEET ONE OF THE FOLLOWING CRITERIA.</div>
            <div className="ml-4">-> Select the <span className="underline">one</span> that applies:</div>
            <div className="mt-1"><Checkbox checked={false} /> A) Lives in the community and is compromised with ADLs and dependent on caregiver support to avoid institutional placement;</div>
            <div className="mt-1 text-center font-bold">OR</div>
            <div><Checkbox checked={false} /> B) Other subsets include children who belong to any of the following categories:</div>
            <div className="ml-8 mt-1 space-y-0.5">
              <div><Checkbox checked={false} /> Previously covered for Respite Services under the Pediatrics Palliative Care Waiver</div>
              <div><Checkbox checked={false} /> Foster care program beneficiaries</div>
              <div><Checkbox checked={false} /> Members enrolled in either California Children&apos;s Services</div>
              <div><Checkbox checked={false} /> Genetically Handicapped Persons Program</div>
              <div><Checkbox checked={false} /> Members with Complex Care Needs</div>
              <div><Checkbox checked={false} /> Members live in a location where services can be provided</div>
            </div>
            <div className="mt-2 font-semibold">COMMENTS (optional)</div>
            <div className="mt-1 min-h-[105px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={5}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked /> 2. Assisted Living Facility Transitions (Page 1 of 2)</div>
            <div className="mt-1 border-y border-black p-1.5">
              <div className="text-[34px] font-bold leading-none">Important Information - Please Read</div>
              <div>
                <span className="font-semibold">Description:</span> Assisting Members who are residing at home or in a nursing facility,
                that need nursing facility level of care with transitioning to an assisted living facility (ALF) to avoid institutionalization.
              </div>
              <div className="mt-1 font-semibold">2.1) WHICH SERVICE IS THE MEMBER BEING REFERRED FOR?</div>
              <div className="ml-4">-> Select the one that applies:</div>
              <div className="mt-1"><Checkbox checked /> A) Time-Limited transition services and expenses</div>
              <div><Checkbox checked={false} /> B) Ongoing ALF services</div>
            </div>
          </div>
          <div className="mt-2 border-2 border-black p-2 text-[13px]">
              <div className="font-semibold">Pre-populated member snapshot</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <FieldLine label="Member Name" value={memberName} />
                <FieldLine label="DOB" value={prefill.memberDob} />
                <FieldLine label="MRN" value={prefill.memberMrn || prefill.memberMediCal} />
                <FieldLine label="Phone" value={prefill.memberPhone} />
              </div>
            </div>
        </PageShell>

        <PageShell pageNumber={6}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked /> 2. Assisted Living Facility Transitions (Page 2 of 2)</div>
            <div className="font-semibold">2.2) WHERE IS THE MEMBER CURRENTLY LIVING?</div>
            <div className="ml-4">-> Select the one that applies:</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> A) Skilled Nursing Facility (SNF)</div>
              <div><Checkbox checked={false} /> B) At home or in public subsidized housing</div>
              <div><Checkbox checked /> C) Assisted Living Facility (ALF) or Board and Care Facility</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <FieldLine label="Facility Name" value={prefill.currentLocationName} />
              <FieldLine label="Address" value={currentLocationAddress} />
              <FieldLine label="Current cost and coverage" value="" className="md:col-span-2" />
            </div>
            <div className="mt-4 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[220px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={7}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 3. Community or Home Transition Services</div>
            <p>Description: help with non-recurring costs to move from licensed facility to private residence.</p>
            <div className="mt-3 font-medium">3.1 Member must meet all criteria (select all that apply)</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> Receiving medically necessary nursing facility LOC services and choosing home transition</div>
              <div><Checkbox checked={false} /> Lived 60+ days in nursing home and/or recuperative care setting</div>
              <div><Checkbox checked={false} /> Interested in moving back to community</div>
              <div><Checkbox checked={false} /> Able to reside safely in community with supports</div>
            </div>
            <div className="mt-4 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[230px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={8}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 4. Personal Care and Homemaker Services (Page 1 of 2)</div>
            <p>Description: in-home support with ADLs/IADLs.</p>
            <div className="mt-3 font-medium">4.1 Member must meet one criterion (select one)</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> A) At risk of hospitalization or institutionalization</div>
              <div><Checkbox checked={false} /> B) Functional deficits and no adequate support system</div>
              <div><Checkbox checked={false} /> C) Approved for IHSS</div>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={9}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 4. Personal Care and Homemaker Services (Page 2 of 2)</div>
            <div className="font-medium">4.2 Member IHSS application status (select one)</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> A) Applied for IHSS, waiting for decision</div>
              <div><Checkbox checked={false} /> B) Receiving IHSS, reassessment pending</div>
              <div><Checkbox checked={false} /> C) Maximum IHSS hours approved but needs additional support</div>
              <div><Checkbox checked={false} /> D) Not eligible for IHSS and needs short-term support</div>
              <div><Checkbox checked={false} /> E) Not eligible for IHSS, on HCBA waiver waitlist</div>
            </div>
            <div className="mt-4 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[260px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={10}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
          <div className="font-bold"><Checkbox checked={false} /> 5. Environmental Accessibility Adaptations (Home Modifications)</div>
            <p>Description: physical home adaptations for health, welfare, safety, and independence.</p>
            <div className="mt-3 font-medium">5.1 Is member at risk of institutionalization in a nursing facility?</div>
            <div className="mt-2 flex gap-6">
              <span><Checkbox checked={false} /> No</span>
              <span><Checkbox checked={false} /> Yes</span>
            </div>
            <div className="mt-3 font-medium">5.2 What is member requesting? (select all that apply)</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> Home modification/adaptation</div>
              <div><Checkbox checked={false} /> Personal Emergency Response System (PERS)</div>
              <div><Checkbox checked={false} /> Other</div>
            </div>
            <div className="mt-3 font-medium">5.3 Home ownership status (select one)</div>
            <div className="mt-2 flex flex-wrap gap-4">
              <span><Checkbox checked={false} /> Owns home</span>
              <span><Checkbox checked={false} /> Rents home</span>
              <span><Checkbox checked={false} /> Other</span>
            </div>
            <div className="mt-4 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[170px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={11}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 6. Medically Tailored Meals / Medically Supportive Food (Page 1 of 2)</div>
            <p>
              Description: services addressing nutrition-sensitive chronic or acute conditions to improve outcomes and reduce avoidable costs.
            </p>
            <div className="mt-3 font-medium">6.1 Condition(s) that would benefit (select all that apply)</div>
            <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
              <div><Checkbox checked={false} /> Post-acute discharge / high hospitalization risk</div>
              <div><Checkbox checked={false} /> Malnutrition (MST ≥3)</div>
              <div><Checkbox checked={false} /> Diabetes (A1C ≥9)</div>
              <div><Checkbox checked={false} /> Cardiovascular disorder</div>
              <div><Checkbox checked={false} /> Congestive heart failure</div>
              <div><Checkbox checked={false} /> Renal failure</div>
              <div><Checkbox checked={false} /> Stroke (post discharge)</div>
              <div><Checkbox checked={false} /> Chronic lung disorders</div>
              <div><Checkbox checked={false} /> HIV with MST ≥3</div>
              <div><Checkbox checked={false} /> Cancer post-hospitalization / active treatment</div>
            </div>
            <FieldLine label="6.2 Special dietary needs / allergies" value="" className="mt-3" />
            <FieldLine label="6.3 Delivery address (if different)" value={memberAddress} className="mt-2" />
          </div>
        </PageShell>

        <PageShell pageNumber={12}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 6. Medically Tailored Meals / Medically Supportive Food (Page 2 of 2)</div>
            <div className="mt-3 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[560px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={13}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 7. Asthma Remediation (Page 1 of 2)</div>
            <p>Description: addresses environmental asthma triggers in the home to avoid emergency utilization.</p>
            <div className="mt-3 font-medium">7.1 Poorly controlled asthma documented by (select one)</div>
            <div className="mt-2 space-y-1">
              <div><Checkbox checked={false} /> A) ED visit / hospitalization / urgent care visits criteria</div>
              <div><Checkbox checked={false} /> B) Asthma Control Test score of 19 or lower</div>
              <div><Checkbox checked={false} /> C) Licensed provider recommendation</div>
            </div>
            <div className="mt-3 font-medium">7.2 Requested interventions (select all that apply)</div>
            <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
              <div><Checkbox checked={false} /> Allergen-impermeable mattress/pillow covers</div>
              <div><Checkbox checked={false} /> HEPA vacuum</div>
              <div><Checkbox checked={false} /> Integrated pest management</div>
              <div><Checkbox checked={false} /> De-humidifier</div>
              <div><Checkbox checked={false} /> Mechanical air filters / cleaners</div>
              <div><Checkbox checked={false} /> Moisture-control interventions</div>
              <div><Checkbox checked={false} /> Minor mold remediation</div>
              <div><Checkbox checked={false} /> Ventilation improvements</div>
              <div><Checkbox checked={false} /> Asthma-friendly cleaning supplies</div>
              <div><Checkbox checked={false} /> Other intervention</div>
            </div>
            <div className="mt-3 font-medium">7.3 Home ownership status (select one)</div>
            <div className="mt-2 flex flex-wrap gap-4">
              <span><Checkbox checked={false} /> Owns home</span>
              <span><Checkbox checked={false} /> Rents home</span>
              <span><Checkbox checked={false} /> Other</span>
            </div>
          </div>
        </PageShell>

        <PageShell pageNumber={14}>
          <SectionBHeader />
          <div className="mt-2 text-[13px]">
            <div className="font-bold"><Checkbox checked={false} /> 7. Asthma Remediation (Page 2 of 2)</div>
            <div className="mt-3 font-medium">Comments (optional)</div>
            <div className="mt-1 min-h-[560px] border-2 border-black bg-[#d9e8f7]" />
          </div>
        </PageShell>

        <PageShell pageNumber={15} breakAfter={false}>
          <div className="text-lg font-bold">STOP! PLEASE READ BEFORE SUBMITTING</div>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Complete all required fields to the best of your ability and submit this form via secure email to the
              appropriate region. Incomplete or outdated forms may cause processing delays.
            </p>
            <p>The most updated referral forms can be found on the provider portal.</p>
            <div className="grid grid-cols-1 gap-2 pt-2 md:grid-cols-2">
              <div className="border border-black p-3">
                <div className="font-semibold">Northern California</div>
                <div className="font-mono text-xs">REGMCDURNs-KPNC@KP.org</div>
                <div className="text-[10px]">Provider Portal: NCAL - Provider Portal</div>
              </div>
              <div className="border border-black p-3">
                <div className="font-semibold">Southern California</div>
                <div className="font-mono text-xs">RegCareCoordCaseMgmt@KP.org</div>
                <div className="text-[10px]">Provider Portal: SCal Provider Portal</div>
              </div>
            </div>
            <div className="border border-black p-3">
              <div className="font-medium">Pre-populated metadata</div>
              <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-2">
                <FieldLine label="Application ID" value={applicationId} />
                <FieldLine label="Member" value={memberName} />
                <FieldLine label="DOB" value={prefill.memberDob} />
                <FieldLine label="MRN" value={prefill.memberMrn || prefill.memberMediCal} />
                <FieldLine label="Referrer" value={referrerName} />
                <FieldLine label="Referral Date" value={referralDate} />
              </div>
            </div>
          </div>
        </PageShell>
      </div>
      <style jsx global>{`
        .kaiser-referral-packet .kaiser-packet-page {
          break-inside: avoid-page;
          page-break-inside: avoid;
          min-height: 9.85in;
          border-radius: 0 !important;
        }

        @media print {
          .kaiser-referral-packet .kaiser-packet-page {
            min-height: auto;
            border-width: 1px;
          }
        }
      `}</style>
    </PrintableFormLayout>
  );
}

