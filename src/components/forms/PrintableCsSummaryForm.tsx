'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection, PrintableFormRow } from './PrintableFormFields';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableCsSummaryFormProps {
  data?: Partial<FormValues>;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableCsSummaryForm({ 
  data = {}, 
  applicationId,
  showPrintButton = true 
}: PrintableCsSummaryFormProps) {
  return (
    <PrintableFormLayout
      title="CalAIM Community Support Member Summary Form"
      subtitle="Assisted Living Transitions Program"
      formType="cs-summary"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="mb-6 p-4 border border-blue-200 bg-blue-50 text-sm text-blue-900 print:text-black print:border-black">
        <p className="font-semibold">Important Note on Online Applications</p>
        <p>
          For the fastest and most secure experience, we strongly recommend completing the application through our
          online portal. Even if the CS Summary Form is uploaded, the information must be inputted online for quicker
          processing and application tracking.
        </p>
      </div>
      {/* Step 1: Member & Contact Information */}
      <PrintableFormSection title="Section 1: Member Information">
        <PrintableField
          label="Member First Name"
          value={data.memberFirstName}
          required
          width="half"
        />
        <PrintableField
          label="Member Last Name"
          value={data.memberLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="Date of Birth"
          value={data.memberDob}
          type="date"
          required
          width="half"
        />
        <PrintableField
          label="Age"
          value={data.memberAge?.toString()}
          width="half"
        />
        
        <PrintableField
          label="Sex"
          value={data.sex}
          type="radio"
          options={['Male', 'Female']}
          required
          width="half"
        />
        <PrintableField
          label="Primary Language"
          value={data.memberLanguage}
          required
          width="half"
        />
        
        <PrintableFormRow>
          <PrintableField
            label="Medi-Cal Number"
            value={data.memberMediCalNum}
            placeholder="9XXXXXXXA"
            required
            width="half"
          />
          <PrintableField
            label="Confirm Medi-Cal Number"
            value={data.confirmMemberMediCalNum}
            placeholder="9XXXXXXXA"
            required
            width="half"
          />
        </PrintableFormRow>
        
        <PrintableFormRow>
          <PrintableField
            label="MRN"
            value={data.memberMrn}
            required
            width="half"
          />
          <PrintableField
            label="Confirm MRN"
            value={data.confirmMemberMrn}
            required
            width="half"
          />
        </PrintableFormRow>
        <div className="col-span-full text-xs text-gray-500 print:text-black">
          Health Net uses the Medi-Cal number; Kaiser uses a different MRN (often starts with 0000).
        </div>
      </PrintableFormSection>

      {/* Referrer Information */}
      <PrintableFormSection title="Section 2: Referrer Information">
        <PrintableField
          label="Referrer First Name"
          value={data.referrerFirstName}
          width="half"
        />
        <PrintableField
          label="Referrer Last Name"
          value={data.referrerLastName}
          width="half"
        />
        
        <PrintableField
          label="Referrer Phone"
          value={data.referrerPhone}
          required
          width="half"
        />
        <PrintableField
          label="Relationship to Member"
          value={data.referrerRelationship}
          required
          width="half"
        />
        
        <PrintableField
          label="Agency/Organization"
          value={data.agency}
          width="full"
        />
      </PrintableFormSection>

      {/* Primary Contact Information */}
      <PrintableFormSection title="Section 3: Primary Contact Person">
        <PrintableField
          label="Contact First Name"
          value={data.bestContactFirstName}
          required
          width="half"
        />
        <PrintableField
          label="Contact Last Name"
          value={data.bestContactLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="Relationship to Member"
          value={data.bestContactRelationship}
          required
          width="half"
        />
        <PrintableField
          label="Phone Number"
          value={data.bestContactPhone}
          required
          width="half"
        />
        
        <PrintableField
          label="Email Address"
          value={data.bestContactEmail}
          required
          width="half"
        />
        <PrintableField
          label="Preferred Language"
          value={data.bestContactLanguage}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Secondary Contact (Optional) */}
      <PrintableFormSection title="Section 4: Secondary Contact Person (Optional)">
        <PrintableField
          label="Contact First Name"
          value={data.secondaryContactFirstName}
          width="half"
        />
        <PrintableField
          label="Contact Last Name"
          value={data.secondaryContactLastName}
          width="half"
        />
        
        <PrintableField
          label="Relationship to Member"
          value={data.secondaryContactRelationship}
          width="half"
        />
        <PrintableField
          label="Phone Number"
          value={data.secondaryContactPhone}
          width="half"
        />
        
        <PrintableField
          label="Email Address"
          value={data.secondaryContactEmail}
          width="half"
        />
        <PrintableField
          label="Preferred Language"
          value={data.secondaryContactLanguage}
          width="half"
        />
      </PrintableFormSection>

      {/* Legal Representative */}
      <PrintableFormSection title="Section 5: Legal Representative">
        <PrintableField
          label="Legal Representative Status"
          value={data.hasLegalRep}
          type="radio"
          options={[
            'Not Applicable',
            'Same as Primary Contact',
            'Different Person (fill below)',
            'Member has no legal representative'
          ]}
          width="full"
          className="col-span-full"
        />
        
        <PrintableField
          label="Representative First Name"
          value={data.repFirstName}
          width="half"
        />
        <PrintableField
          label="Representative Last Name"
          value={data.repLastName}
          width="half"
        />
        
        <PrintableField
          label="Relationship to Member"
          value={data.repRelationship}
          width="half"
        />
        <PrintableField
          label="Phone Number"
          value={data.repPhone}
          width="half"
        />
        
        <PrintableField
          label="Email Address"
          value={data.repEmail}
          width="full"
        />
      </PrintableFormSection>

      {/* Current Location */}
      <PrintableFormSection title="Section 6: Current Location Information">
        <PrintableField
          label="Current Location Type"
          value={data.currentLocation}
          type="select"
          options={[
            'Hospital',
            'Skilled Nursing Facility (SNF)',
            'Home/Community',
            'Assisted Living',
            'Other'
          ]}
          required
          width="full"
        />
        <div className="col-span-full text-xs text-gray-500 print:text-black">
          Examples: RCFE, SNF, Home, Unhoused, Hospital, Assisted Living, Other.
        </div>
        
        <PrintableField
          label="Current Address"
          value={data.currentAddress}
          required
          width="full"
        />
        <div className="col-span-full text-xs text-gray-500 print:text-black">
          Examples: RCFE, SNF, Home, Unhoused, Hospital, Assisted Living, Other.
        </div>
        
        <PrintableFormRow>
          <PrintableField
            label="City"
            value={data.currentCity}
            required
            width="half"
          />
          <PrintableField
            label="State"
            value={data.currentState}
            required
            width="half"
          />
        </PrintableFormRow>
        <PrintableFormRow>
          <PrintableField
            label="ZIP Code"
            value={data.currentZip}
            required
            width="half"
          />
          <PrintableField
            label="County"
            value={data.currentCounty}
            required
            width="half"
          />
        </PrintableFormRow>
      </PrintableFormSection>

      {/* Customary Residence */}
      <PrintableFormSection title="Section 6A: Customary Residence (Normal Long-Term Address)">
        <PrintableField
          label="Customary Location Type"
          value={data.customaryLocationType}
          type="select"
          options={[
            'Home',
            'Hospital',
            'Skilled Nursing Facility (SNF)',
            'Assisted Living',
            'Other'
          ]}
          required
          width="full"
        />
        <div className="col-span-full text-xs text-gray-500 print:text-black">
          Examples: RCFE, SNF, Home, Unhoused, Hospital, Assisted Living, Other.
        </div>
        <div className="col-span-full text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border border-gray-400 print:border-black rounded-sm" />
            Same as current location
          </span>
        </div>
        <PrintableField
          label="Customary Address"
          value={data.customaryAddress}
          required
          width="full"
        />
        <PrintableFormRow>
          <PrintableField
            label="City"
            value={data.customaryCity}
            required
            width="half"
          />
          <PrintableField
            label="State"
            value={data.customaryState}
            required
            width="half"
          />
        </PrintableFormRow>
        <PrintableFormRow>
          <PrintableField
            label="ZIP Code"
            value={data.customaryZip}
            required
            width="half"
          />
          <PrintableField
            label="County"
            value={data.customaryCounty}
            required
            width="half"
          />
        </PrintableFormRow>
      </PrintableFormSection>

      {/* Health Plan & Pathway */}
      <PrintableFormSection title="Section 7: Health Plan & Pathway Information">
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2">
          <p className="font-semibold">Important</p>
          <p>
            To enroll in the CalAIM program through Connections, you must be a member of Health Net or Kaiser.
            If you are currently in another Medi-Cal managed care plan, you will need to switch.
          </p>
          <p>
            In California, members enrolled in Medi-Cal MCPs can switch providers at any time. The change is
            effective at the beginning of the next month. For example, if a member wants to switch from one
            MCP on January 15th, they will be enrolled in the new MCP on February 1st.
          </p>
          <p>
            You can change your health plan by contacting California Health Care Options at 1-800-430-4263
            or visiting their website.
          </p>
        </div>
        <PrintableField
          label="Current Health Plan"
          value={data.healthPlan}
          type="radio"
          options={['Kaiser Permanente', 'Health Net', 'Other']}
          required
          width="full"
        />
        <PrintableField
          label="If other, name of existing health plan"
          value={data.existingHealthPlan}
          width="full"
        />
        <PrintableField
          label="Will member be switching Health Plan by end of month?"
          value={data.switchingHealthPlan}
          type="radio"
          options={['Yes', 'No', 'N/A']}
          width="full"
        />
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-3">
          <div>
            <p className="font-semibold">SNF Transition Eligibility Requirements</p>
            <p>Enables a current SNF resident to transfer to a RCFE or ARF.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Has resided in a SNF for at least 60 consecutive days (which can include a combination of Medicare and Medi-Cal days and back and forth from SNF-hospital-SNF); and</li>
              <li>Is willing to live in RCFE as an alternative to a SNF; and</li>
              <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services.</li>
              <li>Members recently discharged from SNFs, with the 60-day consecutive stay requirement, should also be considered as SNF transition.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">SNF Diversion Eligibility Requirements</p>
            <p>Transition a member who, without this support, would need to reside in a SNF and instead transitions him/her to RCFE or ARF in the community (e.g., from home or from the hospital).</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Interested in remaining in the community; and</li>
              <li>Is able to safely reside in RCFE with appropriate and cost-effective supports and services; and</li>
              <li>Must be currently at medically necessary SNF level of care: e.g., require substantial help with activities of daily living (help with dressing, bathing, incontinence, etc.) or at risk of premature institutionalization; and meet the criteria to receive those services in RCFE or ARF.</li>
            </ul>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-4 h-4 border border-gray-400 print:border-black rounded-sm mt-0.5" />
            <span>I confirm that all criteria for the selected pathway have been met.</span>
          </div>
        </div>

        <PrintableField
          label="CalAIM Pathway"
          value={data.pathway}
          type="radio"
          options={['SNF Transition', 'SNF Diversion']}
          required
          width="full"
        />
        
        {data.pathway === 'SNF Diversion' && (
          <PrintableField
            label="Reason for SNF Diversion"
            value={data.snfDiversionReason}
            type="textarea"
            width="full"
            rows={3}
          />
        )}
      </PrintableFormSection>

      {/* ISP & Facility Information */}
      <PrintableFormSection title="Section 8: Individual Service Plan (ISP)">
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2">
          <p>
            An Individual Service Plan (ISP) is a comprehensive assessment conducted by the Managed Care Plan's
            (MCP) clinical team to determine the member’s care needs and to approve them for the program. The ISP
            assessment is a critical step for getting the MCP's authorization. The ISP is either done virtually
            (Health Net) or in-person (Kaiser) by a Connections' MSW/RN to administer a tool to determine level of care
            (the amount the MCP will pay for the "assisted living" portion). For Health Net, the tiered level is
            determined by Connections. For Kaiser, the tiered level is determined by Kaiser.
          </p>
          <p>
            Our MSW/RN needs to know who to contact to discuss the care needs of the member, review the Physician's
            report (602), and other clinical notes. Who is the best person to contact for the ISP? Please note this
            is not the primary care doctor but could be a SNF social worker, etc.
          </p>
        </div>
        <PrintableField
          label="ISP Contact First Name"
          value={data.ispFirstName}
          required
          width="half"
        />
        <PrintableField
          label="ISP Contact Last Name"
          value={data.ispLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="ISP Contact Relationship to Member"
          value={data.ispRelationship}
          required
          width="half"
        />
        <PrintableField
          label="ISP Contact Phone Number"
          value={data.ispPhone}
          required
          width="half"
        />
        
        <PrintableField
          label="ISP Contact Email"
          value={data.ispEmail}
          width="half"
        />
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2">
          <p className="font-semibold">ISP Assessment Location</p>
          <p>
            The street address for the ISP assessment is only required for Kaiser members (which requires an in-person visit).
            For Health Net members, please put N/A in the below boxes.
          </p>
        </div>
        <PrintableField
          label="ISP Assessment Location Type"
          value={data.ispLocationType}
          type="select"
          options={[
            'Home',
            'Hospital',
            'Skilled Nursing Facility (SNF)',
            'Assisted Living',
            'Other'
          ]}
          required
          width="half"
        />
        <PrintableField
          label="ISP Assessment Facility Name"
          value={data.ispFacilityName}
          width="half"
        />
        <PrintableField
          label="ISP Assessment Address"
          value={data.ispAddress}
          required
          width="full"
        />

      </PrintableFormSection>

      {/* CalAIM vs. ALW */}
      <PrintableFormSection title="Section 9: CalAIM vs. Assisted Living Waiver (ALW)">
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black">
          CalAIM and ALW are duplicative services, a member enrolled in one will not be funded by the other.
        </div>
        <PrintableField
          label="On ALW waitlist"
          value={data.onALWWaitlist}
          type="radio"
          options={['Yes', 'No', 'Unknown']}
          width="full"
        />
      </PrintableFormSection>

      {/* NMOHC Payment */}
      <PrintableFormSection title="Section 10A: Non-Medical Out-of-Home Care (NMOHC) Payment">
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2">
          <p>
            Non-Medical Out-of-Home Care (NMOHC) is a payment supplement that boosts a person’s monthly SSI check
            because they live in a licensed assisted living home rather than an apartment or house.
          </p>
          <p>
            In California, if a person lives in a Residential Care Facility for the Elderly (RCFE), the state
            recognizes that costs are much higher than someone living independently. To help cover this, the
            person moves from the "Independent Living" rate to the "NMOHC" rate.
          </p>
          <div>
            <p className="font-semibold">1. Confirm Financial Eligibility (The "Paper" Test)</p>
            <p>Since NMOHC is part of the SSI program, you can verify the financial requirements now.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Income: For 2026, total "countable" monthly income must be less than $1,626.07.</li>
              <li>Assets: As of January 1, 2026, asset limits are reinstated. An individual must have less than $2,000 in countable resources ($3,000 for a couple).</li>
              <li>Note: One car and the primary home are usually excluded from this limit.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">2. Verification with Social Security (The "Pre-Move" Call)</p>
            <p>Contact SSA at 1-800-772-1213 or visit a local office for a living arrangement interview.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Tell them the person plans to move into a licensed RCFE.</li>
              <li>Ask for the new SSI payment calculation based on the 2026 NMOHC rate.</li>
              <li>Pro tip: Ask the RCFE for their License Number and a draft Admission Agreement. SSA will need a signed version to update the check.</li>
            </ul>
          </div>
        </div>
      </PrintableFormSection>

      {/* Room & Board Payments */}
      <PrintableFormSection title="Section 10B: Room & Board Payments">
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black space-y-2">
          <p>
            The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible
            for paying the RCFE the "assisted living" portion.
          </p>
          <p>
            For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is
            bumped up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives
            the $1,444.07 balance as payment for "room and board". Also, members eligible for the NMOHC will pay at
            least $1,447.00 to the RCFE. Members who receive more than this amount can pay more for "room and board"
            for a private room or to open up RCFEs in more expensive areas.
          </p>
          <p>
            Members not eligible for the NMOHC will still have a "room and board" obligation but the amount could be
            flexible depending on the RCFE and the assessed tiered level.
          </p>
          <p>
            Members who cannot pay any room and board portion usually are not eligible for the CS since program
            requirements mandate a "room and board" payment from the member (or their family).
          </p>
          <p>
            Working with CalAIM is at the discretion of the RCFEs. RCFEs, especially in more expensive areas, might not
            participate in CalAIM. Families looking to place members in expensive real estate areas should have the
            realistic expectation that CalAIM RCFEs might only be located in more affordable areas. Before accepting
            CalAIM members, RCFEs will need to know the "room and board" payment.
          </p>
        </div>
        <div className="col-span-full p-3 border border-gray-300 text-sm text-gray-700 print:text-black print:border-black">
          Proof of income (annual award letter or 3 months of bank statements showing Social Security income) will need
          to be submitted as part of this application.
        </div>
        <PrintableField
          label="Monthly Income"
          value={data.monthlyIncome}
          placeholder="$0.00"
          required
          width="half"
        />
        <PrintableField
          label="Acknowledges Room & Board Responsibility"
          value={data.ackRoomAndBoard ? 'Yes' : 'No'}
          type="radio"
          options={['Yes', 'No']}
          required
          width="full"
        />
      </PrintableFormSection>

      {/* Preferred RCFE */}
      <PrintableFormSection title="Section 11: Preferred Residential Care Facility (RCFE)">
        <PrintableField
          label="Has Preferred RCFE"
          value={data.hasPrefRCFE ? 'Yes' : 'No'}
          type="radio"
          options={['Yes', 'No']}
          width="full"
        />
        
        <PrintableField
          label="RCFE Name"
          value={data.rcfeName}
          width="full"
        />
        
        <PrintableField
          label="RCFE Address"
          value={data.rcfeAddress}
          width="full"
        />

        <PrintableField
          label="Preferred RCFE Cities"
          value={data.rcfePreferredCities}
          width="full"
        />
        
        <PrintableField
          label="RCFE Administrator First Name"
          value={data.rcfeAdminFirstName}
          width="half"
        />
        <PrintableField
          label="RCFE Administrator Last Name"
          value={data.rcfeAdminLastName}
          width="half"
        />
        
        <PrintableField
          label="Administrator Phone"
          value={data.rcfeAdminPhone}
          width="half"
        />
        
        <PrintableField
          label="Administrator Email"
          value={data.rcfeAdminEmail}
          width="full"
        />
      </PrintableFormSection>

    </PrintableFormLayout>
  );
}