'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { acronyms } from '@/lib/data';

interface PrintableProgramInfoFormProps {
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableProgramInfoForm({ 
  applicationId,
  showPrintButton = true 
}: PrintableProgramInfoFormProps) {
  return (
    <PrintableFormLayout
      title="CalAIM Program Information & Acknowledgment"
      subtitle="Community Support for Assisted Living Transitions"
      formType="generic"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Acronym Reference */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
          Quick Reference - Key Terms
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {acronyms.map((acronym) => (
            <div key={acronym.term} className="text-sm print:text-xs">
              <strong className="text-gray-900 print:text-black">{acronym.term}:</strong>{' '}
              <span className="text-gray-700 print:text-black">{acronym.definition}</span>
            </div>
          ))}
        </div>
      </div>

      {/* What is CalAIM */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          What is CalAIM?
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          California Advancing and Innovating Medi-Cal (CalAIM) is California's long-term initiative to 
          transform the Medi-Cal program by improving quality outcomes, reducing health disparities, and 
          creating a more seamless and consistent system. It aims to achieve this through a focus on 
          "whole person care," which includes addressing social determinants of health, integrating physical, 
          mental, and social services, and launching new programs like Enhanced Care Management (ECM) and 
          Community Supports. CS and ECM are administered through managed care plans (MCPs).
        </p>
      </div>

      {/* Community Support for Assisted Living Transitions */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Community Support for Assisted Living Transitions
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          There are 14 Community Supports (CS), and this application portal is for one of them, called
          Assisted Living Transitions. This CS gives eligible members the choice to reside in an assisted
          living setting-such as a Residential Care Facility for the Elderly (RCFE) or an Adult Residential
          Facility (ARF)-as a safe alternative to a skilled nursing facility (SNF), promoting greater
          independence and community integration.
        </p>
        <p className="mt-3 text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          The CS is either for SNF Diversion (e.g. for members coming from a community-based setting (e.g., from
          home or hospital) at risk of premature institutionalization or SNF Transitions (e.g., for members residing
          in SNFs) eligible to reside in assisted living settings.
        </p>
      </div>

      {/* The Role of Connections */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          The Role of Connections Care Home Consultants
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          For 35 years Connections has helped private paid families find care homes. We are excited to now 
          be partnered with MCPs as a CS Provider that assists with understanding the program, finding 
          participating facilities, coordinating paperwork and assessments, and liaising with your MCP to request authorization for the CS.
        </p>
        <p className="mt-3 text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          Once a member is placed, we also send a MSW to visit the member at the RCFE/ARF for monthly quality control checks and provide ongoing care coordination.
        </p>
      </div>

      {/* Types of Assisted Living */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Types of Assisted Living (RCFEs/ARFs)
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed mb-4">
          Assisted Living facilities (RCFEs or ARFs) come in various sizes, each offering a different 
          environment. Connections can help you find a setting that best suits your needs:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 print:p-4 bg-gray-50 print:bg-white border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">Small, Home-Like Settings</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Typically 4-6 bed homes that provide a high staff-to-resident ratio. This environment offers 
              more personalized attention and a quieter, more intimate living experience.
            </p>
          </div>
          <div className="p-4 print:p-4 bg-gray-50 print:bg-white border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">Large, Community Settings</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Often 100+ bed facilities that feature amenities like group dining rooms, a wide variety of 
              planned activities, and social opportunities. Staff is available as needed to provide care and support.
            </p>
          </div>
        </div>
      </div>

      {/* Medicare vs. Medi-Cal */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Medicare vs. Medi-Cal
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          Medicare is a federal health insurance program mainly for people 65 or older. Medi-Cal is California's
          Medicaid program for low-income individuals. The CalAIM program is a Medi-Cal benefit.
        </p>
      </div>

      {/* Managed Care Plans */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Managed Care Plans We Work With
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed mb-4">
          Connections currently is only contracted with <strong>Health Net</strong> and <strong>Kaiser</strong> for the CS for Assisted Living Transitions. 
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black">Health Net</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Serving members in <strong>Sacramento</strong> and <strong>Los Angeles</strong> counties.
            </p>
          </div>
          <div className="p-4 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black">Kaiser Permanente</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              Connections is contracted for the CS for Kaiser Permanente through a subcontract with Independent Living Systems (ILS), which manages the program for Kaiser. Kaiser is active in these counties: Alameda, Alpine, Amador, Butte, Calaveras, Colusa, Contra Costa, Del Norte, El Dorado, Fresno, Glenn, Humboldt, Imperial, Inyo, Kern, Kings, Lake, Lassen, Los Angeles, Madera, Marin, Mariposa, Mendocino, Merced, Modoc, Mono, Monterey, Napa, Nevada, Orange, Placer, Plumas, Riverside, Sacramento, San Benito, San Bernardino, San Diego, San Francisco, San Joaquin, San Luis Obispo, San Mateo, Santa Barbara, Santa Clara, Santa Cruz, Shasta, Sierra, Siskiyou, Solano, Sonoma, Stanislaus, Sutter, Tehama, Trinity, Tulare, Tuolumne, Ventura, Yolo, and Yuba.
            </p>
          </div>
        </div>
      </div>

      {/* Switching to Health Net or Kaiser */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Switching to Health Net or Kaiser
        </h2>
        <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
          <p>If you are in another Medi-Cal managed care plan and you would like to work with Connections, you will need to switch.</p>
          <p>You can change your health plan by contacting <a href="https://www.healthcareoptions.dhcs.ca.gov/en/enroll" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-black hover:underline">California Health Care Options</a> at 1-800-430-4263 or visiting their website.</p>
          <p>Generally, changes made by the end of the month are effective on the first day of the following month.</p>
        </div>
      </div>

      {/* Applying for Health Net (and being assigned to Molina) */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Applying for Health Net (and being assigned to Molina)
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          When applying for Medi-Cal with Health Net sometimes people are automatically assigned to Molina instead, 
          you will need to call Health Net (800-675-6110) and request to be switched to Health Net.
        </p>
      </div>

      {/* Expedited Disenrollment from Molina */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-orange-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Expedited Disenrollment from Molina
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black mb-4">
          If you were randomly assigned to Molina and need to switch to Health Net urgently (especially for SNF residents 
          needing CalAIM transition services), here are two escalation options:
        </p>
        <div className="space-y-4">
          <div className="p-3 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">1. Call Health Net directly: 1-800-675-6110</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
              Contact Health Net Member Services directly to request an expedited transfer from Molina to Health Net.
            </p>
          </div>
          <div className="p-3 print:p-4 border print:border-black">
            <h3 className="font-semibold text-gray-900 print:text-black mb-2">2. Contact the Medi-Cal Managed Care Ombudsman</h3>
            <p className="text-sm print:text-xs text-gray-700 print:text-black mb-2">
              If HCO says they cannot speed up the process, the Medi-Cal Managed Care Ombudsman is the "escalation" office.
              They have the authority to investigate enrollment errors and can sometimes manually override an assignment if
              it is preventing a member from receiving necessary care or a safe discharge.
            </p>
            <p className="text-sm print:text-xs text-gray-700 print:text-black mb-1">
              <strong>Phone:</strong> 1-888-452-8609
            </p>
            <p className="text-sm print:text-xs text-gray-700 print:text-black mb-1">
              <strong>Email:</strong> MMCDOmbudsmanOffice@dhcs.ca.gov
            </p>
            <p className="text-sm print:text-xs text-gray-700 print:text-black">
              <strong>What to say:</strong> "The member was randomly assigned to Molina despite requesting Health Net. This error is preventing access to CalAIM SNF-to-community transition services, effectively keeping the member institutionalized longer than necessary."
            </p>
          </div>
        </div>
      </div>

      {/* Share of Cost */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-red-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Share of Cost (SOC)
        </h2>
        <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
          <p className="font-semibold text-red-700 print:text-black">
            Members cannot apply for CalAIM with a SOC. It must be eliminated before becoming eligible to apply for CalAIM.
          </p>
          <p>
            A Share of Cost (SOC) is like a monthly deductible for Medi-Cal. It is the amount of money you may
            have to pay each month toward medical-related services or supplies before your Medi-Cal coverage
            begins to pay.
          </p>
          <p>
            This usually happens when income is above the limit for free Medi-Cal but the person still qualifies
            for the program.
          </p>
          <p>
            For information on reducing SOC, visit{' '}
            <a href="https://canhr.org/understanding-the-share-of-cost-for-medi-cal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-black hover:underline">
              canhr.org/understanding-the-share-of-cost-for-medi-cal
            </a>{' '}
            or contact your county case worker.
          </p>
          <div className="mt-4 rounded border border-zinc-300 bg-white p-3">
            <h3 className="text-base font-semibold text-gray-900 print:text-black">
              Eliminating Medi-Cal Share of Cost: The Key to CalAIM
            </h3>
            <div className="mt-2 space-y-2">
              <p>
                If you have Medi-Cal with a Share of Cost, you may be missing out on life-changing benefits.
                Programs like CalAIM (which provides care coordination and placement in residential care homes)
                generally require members to have <strong>Full-Scope, $0 Share of Cost</strong> Medi-Cal.
              </p>
              <p>
                For many seniors and disabled individuals, a monthly income above <strong>$1,856</strong> (the 2026 limit)
                triggers a high Share of Cost. However, California&apos;s <strong>250% Working Disabled Program (WDP)</strong> offers
                a legal way to eliminate that cost and keep more of your money.
              </p>
            </div>

            <h4 className="mt-3 font-semibold text-gray-900 print:text-black">How the 250% Working Disabled Program Works</h4>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong>Higher income allowed:</strong> up to <strong>$3,260</strong> per month with a <strong>$0 monthly premium</strong> and <strong>$0 Share of Cost</strong>.</li>
              <li><strong>Broad definition of "work":</strong> no traditional full-time job required. "Working" can include part-time tasks like pet sitting, consulting for a neighbor, or even recycling. No minimum hours required.</li>
              <li><strong>Income protection:</strong> most disability-related income (like SSDI or private disability) is not counted toward the limit. Even if SSDI converted to Social Security Retirement, it may still be exempt.</li>
              <li><strong>CalAIM ready:</strong> once Share of Cost is $0, you can qualify for CalAIM services, including Enhanced Care Management and Community Supports for care home placement.</li>
            </ul>

            <h4 className="mt-4 font-semibold text-gray-900 print:text-black">Additional SOC Reduction Strategies (County Eligibility Process)</h4>
            <div className="mt-2 space-y-3">
              <div>
                <p className="font-semibold text-gray-900 print:text-black">1. The "Excess Income" Room and Board Adjustment</p>
                <p>Under California law (and often reflected in RCFE admission agreements), there is a distinction between what an SSI recipient pays and what a private-pay or high-income resident pays.</p>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li><strong>The SSI Rate Cap:</strong> for residents on SSI, room and board is strictly capped (around $1,444.07 for 2026).</li>
                  <li><strong>The Non-SSI Exception:</strong> if a member has income other than SSI, the facility may charge the basic room and board amount plus additional contract-based charges.</li>
                  <li><strong>The Strategy:</strong> increasing room and board obligations on the admission agreement (minus the $182 personal needs allowance) may reduce countable income.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 print:text-black">2. The "Medical Expense" Spend-Down (Paperwork Fix)</p>
                <p>When board-and-care deduction is unavailable because CalAIM is paying for care, a spend-down strategy can still reduce SOC by documenting incurred medical or remedial expenses.</p>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li><strong>Remedial care expenses:</strong> the RCFE amount above standard room and board may be treated as remedial care expense.</li>
                  <li><strong>How to report:</strong> submit RCFE invoices to County Social Services (DPSS) as incurred medical expenses. Member out-of-pocket payments count toward SOC.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900 print:text-black">3. Purchase Supplemental Insurance (Often the Cleanest Fix)</p>
                <p>Lower gross countable income before SOC calculation by documenting deductible premiums and insurance deductions.</p>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li><strong>Dental/Vision/Health premiums:</strong> monthly premiums are deductible by the county.</li>
                  <li><strong>Medicare Part B/D:</strong> ensure all premiums are captured by the county eligibility worker.</li>
                </ul>
              </div>
            </div>
            <h4 className="mt-4 font-semibold text-gray-900 print:text-black">Summary of Where to Go</h4>
            <p className="mt-1">
              Take the following to the <strong>County Social Services Eligibility Worker</strong> (not the health plan):
            </p>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li><strong>Revised admission agreement:</strong> showing higher room and board obligation up to available income.</li>
              <li><strong>Medical receipts:</strong> out-of-pocket costs (incontinence supplies, OTC meds, transportation, etc.).</li>
              <li><strong>Insurance proof:</strong> monthly supplemental premium documentation.</li>
            </ul>
            <div className="mt-2 rounded border border-cyan-300 bg-cyan-50 p-2">
              <strong>Crucial note:</strong> once county deductions are entered and the case reflects zero SOC, the CalAIM managed care plan typically sees eligibility updates in about 24-48 hours.
            </div>
            <h4 className="mt-4 font-semibold text-gray-900 print:text-black">Who to Contact for Help</h4>
            <div className="mt-2 space-y-2">
              <p><strong>1. HICAP (Health Insurance Counseling &amp; Advocacy Program)</strong><br />Free, unbiased counseling on Medicare and Medi-Cal. Experts at the Working Disabled Program.<br /><strong>Phone:</strong> 1-800-434-0222<br /><strong>Website:</strong> aging.ca.gov/hicap</p>
              <p><strong>2. Health Consumer Alliance (HCA)</strong><br />Free legal assistance for Californians struggling with Medi-Cal eligibility or high Share of Cost.<br /><strong>Phone:</strong> 1-888-804-3536<br /><strong>Website:</strong> healthconsumer.org</p>
              <p><strong>3. Your Local County Social Services (DPSS)</strong><br />Contact your local county eligibility worker and ask for an <strong>"evaluation for the 250% Working Disabled Program."</strong><br /><strong>Online Portal:</strong> BenefitsCal.com</p>
            </div>
          </div>
        </div>
      </div>

      {/* Benefitscal.com */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Benefitscal.com
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          A one stop shop to apply and review Medi-Cal benefits including possible share of cost information
          and to add for the member an authorized representative/power of attorney.
        </p>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed mt-2">
          Visit{' '}
          <a href="https://www.benefitscal.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-black hover:underline">
            www.benefitscal.com
          </a>{' '}
          for current SOC verification and more information.
        </p>
      </div>

      {/* NMOHC */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-cyan-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Non-Medical Out-of-Home Care (NMOHC) Payment
        </h2>
        <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
          <p>
            NMOHC is a payment supplement that boosts a person's monthly SSI check because they live in a
            licensed assisted living home rather than an apartment or house.
          </p>
          <p>
            In California, if a person lives in a Residential Care Facility for the Elderly (RCFE), the state
            recognizes that costs are much higher than someone living independently. To help cover this, the person
            moves from the "Independent Living" rate to the "NMOHC" rate.
          </p>
          <p>
            <strong>1. Confirm Financial Eligibility (The "Paper" Test)</strong>
          </p>
          <p>
            Since NMOHC is part of the SSI program, you can verify the financial requirements now.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
            <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
            <li>Note: One car and the primary home are usually excluded from this limit.</li>
          </ul>
          <p>
            <strong>2. Verification with Social Security (The "Pre-Move" Call)</strong>
          </p>
          <p>
            Visit a local Social Security office in person for a living arrangement interview to confirm NMOHC
            eligibility and the supplement amount.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tell them the person plans to move into a licensed RCFE.</li>
            <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
          </ul>
        </div>
      </div>

      {/* Room and Board / Assisted Living Payments */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-yellow-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          "Room and Board" and "Assisted Living" Payments
        </h2>
        <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
          <p>
            The MCP member is responsible for paying the RCFE the 'room and board' portion and the MCP is
            responsible for paying the RCFE the 'assisted living' portion.
          </p>
          <p>
            For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for 'room and board' for a private room or to open up RCFEs in more expensive areas.
          </p>
          <p>
            Members not eligible for the NMOHC will still have a 'room and board' obligation but the amount could be flexible depending on the RCFE and the assessed tiered level.
          </p>
          <p>
            Members who cannot pay any room and board portion usually are not eligible for the CS since program requirements mandate a 'room and board' payment from the member (or their family).
          </p>
          <p>
            Working with CalAIM is at the discretion of the RCFEs. Many RCFEs, especially in more expensive areas, most likely will not participate in CalAIM. Families looking to place members in expensive real estate areas should have the realistic expectation that CalAIM RCFEs might only be located in more affordable areas.
          </p>
          <p>
            The "assisted living" payment paid by the MCP is a fixed rate based on level of care but may not
            align with market rate in certain counties or for all RCFEs. Supplementing the "room and board" to
            arrive at market rate is at the discretion of the families.
          </p>
        </div>
      </div>

      {/* Individual Service Plan */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          Individual Service Plan (ISP)
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black leading-relaxed">
          An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's 
          (MCP) clinical team to determine the member's care needs and to approve them for the program. The 
          ISP assessment is a critical step for getting the MCP's authorization. The ISP is either done 
          virtually (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to 
          determine level of care (the amount the MCP will pay for the 'assisted living' portion). For 
          Health Net, the tiered level is determined by Connections. For Kaiser, the tiered level is 
          determined by Kaiser.
        </p>
      </div>

      {/* CalAIM Turnaround Time */}
      <div className="col-span-full mb-8">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4 pb-2 border-b print:border-black">
          CalAIM Turnaround Time
        </h2>
        <p className="font-semibold text-sm print:text-xs text-gray-900 print:text-black">For Health Net (5-7 business days):</p>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
          <li>We compile all the required documents, have a RN do a virtual ISP visit with appropriate party.</li>
          <li>We determine the tiered rate.</li>
          <li>We recommend RCFEs to the family (in many cases, the family already knows the RCFE they would like for their relative).</li>
          <li>We submit the authorization request and receive the determination (approval or denial) within 5-7 business days.</li>
        </ol>
        <p className="mt-4 font-semibold text-sm print:text-xs text-gray-900 print:text-black">For Kaiser (4-8 weeks):</p>
        <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm print:text-xs text-gray-700 print:text-black">
          <li>Compile required documents &amp; Request Authorization.</li>
          <li>Receive authorization determination.</li>
          <li>If approved, send RN (or MSW with RN sign off) to do in-person visit with ISP tool.</li>
          <li>Send ISP tool to Kaiser for tier level.</li>
          <li>Receive tier level and recommend RCFEs to family.</li>
          <li>Once RCFE is selected sent RCFE to Kaiser for contracting and when RCFE receives Kaiser contract member can move into the RCFE.</li>
        </ol>
      </div>

      {/* Next Steps: The Application */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-green-50 print:bg-white border print:border-black">
        <h2 className="text-xl font-semibold text-gray-900 print:text-black mb-4">
          Next Steps: The Application
        </h2>
        <p className="text-sm print:text-xs text-gray-700 print:text-black">
          The next section is for filling out the CS Summary Form. This is the core of your application.
        </p>
        <p className="mt-2 text-sm print:text-xs text-gray-700 print:text-black">
          Kaiser turnaround is typically 4-8 weeks.
        </p>
        <p className="mt-2 text-sm print:text-xs text-gray-700 print:text-black">
          Based on the selections you make in the summary form (like the pathway), a personalized list of other required documents will be generated for you to upload.
        </p>
      </div>
    </PrintableFormLayout>
  );
}