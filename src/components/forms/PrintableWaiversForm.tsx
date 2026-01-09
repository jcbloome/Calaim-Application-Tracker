'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection, PrintableSignatureBlock } from './PrintableFormFields';

interface PrintableWaiversFormProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableWaiversForm({ 
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true 
}: PrintableWaiversFormProps) {
  return (
    <PrintableFormLayout
      title="Waivers & Authorizations"
      subtitle="HIPAA Authorization, Liability Waiver, and Freedom of Choice"
      formType="waivers"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Member Information */}
      <PrintableFormSection title="Member Information">
        <PrintableField
          label="Member Name"
          value={memberName}
          required
          width="half"
        />
        <PrintableField
          label="MRN"
          value={memberMrn}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* MRN Guidelines */}
      <div className="mb-6 p-4 bg-blue-50 print:bg-gray-50 border border-blue-200 print:border-gray-400 rounded-lg print:rounded-none">
        <div className="flex items-start gap-3">
          <div className="text-blue-600 print:text-black text-lg">💡</div>
          <div>
            <h4 className="font-semibold text-blue-900 print:text-black text-sm mb-2">MRN Guidelines:</h4>
            <div className="text-xs text-blue-800 print:text-black space-y-1">
              <div><strong>Health Net:</strong> Use your Medi-Cal number (format: 9XXXXXXXA)</div>
              <div><strong>Kaiser:</strong> Use your specific Kaiser MRN (often starts with zeros)</div>
            </div>
          </div>
        </div>
      </div>

      {/* HIPAA Authorization */}
      <PrintableFormSection title="HIPAA Authorization">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            This form, when completed and signed by you (member or POA), authorizes the use and/or 
            disclosure of your protected health information. The information authorized for release may 
            include information related to HIV/AIDS, mental health, and substance use, unless specified otherwise.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-6">
            <div>
              <p className="font-semibold">Authorized to disclose:</p>
              <p>Any health care related agency or person providing information for the purpose of applying 
              for the CalAIM CS for Assisted Living Transitions</p>
            </div>
            <div>
              <p className="font-semibold">Authorized to receive:</p>
              <p>Connections Care Home Consultants, LLC</p>
            </div>
          </div>

          <div>
            <p className="font-semibold mb-2">Description of Information to be Disclosed</p>
            <p className="mb-2">The information to be disclosed includes, but is not limited to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Demographic information (Name, DOB, Social Security Number, Medi-Cal ID)</li>
              <li>Medical history and physical examination reports</li>
              <li>Individual Service Plans (ISP) and Functional Assessments</li>
              <li>Level of Care (LOC) Tier determinations</li>
              <li>Physician orders and medication lists</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold mb-2">Purpose of Disclosure</p>
            <p className="mb-2">This information will be used specifically for:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Determining eligibility for CalAIM Community Supports</li>
              <li>Conducting clinical assessments for tier-level placement</li>
              <li>Facilitating transition and admission into a contracted RCFE/ARF</li>
              <li>Coordinating billing and claims processing between the Facility, Connections, and the MCP</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="font-semibold">Expiration:</p>
              <p>One year from the date of signature</p>
            </div>
            <div>
              <p className="font-semibold">My Rights:</p>
              <p>Member (or POA) must sign document to move forward with the CS but can revoke this authorization at any time</p>
            </div>
          </div>

          <PrintableField
            label="I have read and understood the HIPAA Authorization section"
            type="checkbox"
            options={['Yes, I understand and agree']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      {/* Liability Waiver */}
      <PrintableFormSection title="Member/POA Waiver and Release of Liability">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <div>
            <p className="font-semibold mb-2">1. Acknowledgment of Independent Entities</p>
            <p>
              The undersigned (Member or Power of Attorney/Legal Authorized Representative) acknowledges that 
              Connections Care Home Consultants LLC ("CONNECTIONS") is a referral and administrative consultant. 
              I understand that the Residential Care Facilities for the Elderly (RCFE) or Adult Residential 
              Facilities (ARF) referred by CONNECTIONS are independent businesses. They are not owned, operated, 
              managed, or supervised by CONNECTIONS.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">2. Assumption of Risk</p>
            <p>
              I understand that placement in a care facility involves inherent risks, including but not limited 
              to medical emergencies, physical injuries, falls, or complications from care. I voluntarily assume 
              all risks associated with the Member's residency and care at any facility selected, whether or not 
              referred by CONNECTIONS.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">3. Release and Waiver of Liability</p>
            <p>
              To the maximum extent permitted by law, I, on behalf of myself, the Member, and our heirs or estate, 
              hereby release, forever discharge, and hold harmless Connections Care Home Consultants LLC, its officers, 
              employees, and agents from any and all liability, claims, and demands of whatever kind or nature, either 
              in law or in equity, which arise or may hereafter arise from the Member's placement at a facility. This 
              includes, but is not limited to, liability for: Physical Injury or Death, Clinical Care, Safety Issues, 
              or Infections/Illness.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">4. Covenant Not to Sue</p>
            <p>
              I agree that I will not initiate any legal action, lawsuit, or administrative claim against CONNECTIONS 
              for damages, injuries, or losses caused by the acts, omissions, or conditions of a third-party care facility. 
              I acknowledge that my sole legal recourse for matters involving the quality of care or physical safety 
              resides against the facility providing the direct care.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">5. RN Assessment (ISP) Disclosure</p>
            <p>
              I understand that while a CONNECTIONS RN may perform an Individual Service Plan (ISP) for the purpose 
              of CalAIM tier-level determination, this assessment does not constitute the "management of care." The 
              facility is solely responsible for creating its own care plan and ensuring the Member's daily needs 
              and safety are met.
            </p>
          </div>

          <PrintableField
            label="I have read and understood the Waiver and Release of Liability section"
            type="checkbox"
            options={['Yes, I understand and agree']}
            width="full"
          />
        </div>
      </PrintableFormSection>

      {/* Freedom of Choice */}
      <PrintableFormSection title="Freedom of Choice Waiver">
        <div className="col-span-full space-y-4 text-sm print:text-xs">
          <p>
            I (or my POA) understand I have a choice to receive services in the community. Community Supports 
            for Community Transition are available to help me. I (or my POA) can choose to accept or decline 
            these services.
          </p>
          
          <p>
            If I accept these services, I will receive assistance from Connections Care Home Consultants to 
            move into a community-based setting like an assisted living facility. They will help me find a 
            place, coordinate paperwork, and ensure I am settled in. This will be authorized and paid for by 
            my Managed Care Plan.
          </p>
          
          <p>
            If I decline these services, I am choosing to remain where I am, and I will not receive the 
            transition support services offered by this program at this time.
          </p>

          <PrintableField
            label="I have read and understood the Freedom of Choice Waiver section"
            type="checkbox"
            options={['Yes, I understand']}
            width="full"
          />

          <div className="mt-6">
            <h4 className="font-semibold mb-3">My Choice:</h4>
            <PrintableField
              label=""
              type="radio"
              options={[
                'I choose to accept Community Supports services for community transition',
                'I choose to decline Community Supports services for community transition'
              ]}
              width="full"
            />
          </div>
        </div>
      </PrintableFormSection>

      {/* Signature Section */}
      <div className="mt-12 print:mt-16">
        <h3 className="text-lg font-semibold mb-4">Signature for All Sections</h3>
        <p className="text-sm print:text-xs italic text-gray-600 print:text-black mb-4">
          By signing below, I acknowledge that under penalty of perjury, I am the member or an authorized 
          representative (POA) legally empowered to sign on behalf of the member, and that I agree to all sections above.
        </p>

        <PrintableField
          label="I am the:"
          type="radio"
          options={['Member', 'Authorized Representative (POA)']}
          width="full"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Signature (Full Name) *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Date *
            </label>
            <div className="h-16 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
            If authorized representative, what is relationship to member? (if not A/R please put N/A)
          </label>
          <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}