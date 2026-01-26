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
        
        <PrintableField
          label="Current Address"
          value={data.currentAddress}
          required
          width="full"
        />
        
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
            width="quarter"
          />
          <PrintableField
            label="ZIP Code"
            value={data.currentZip}
            required
            width="quarter"
          />
        </PrintableFormRow>
        
        <PrintableField
          label="County"
          value={data.currentCounty}
          required
          width="half"
        />
      </PrintableFormSection>

      {/* Health Plan & Pathway */}
      <PrintableFormSection title="Section 7: Health Plan & Pathway Information">
        <PrintableField
          label="Current Health Plan"
          value={data.healthPlan}
          type="radio"
          options={['Kaiser Permanente', 'Health Net', 'Other']}
          required
          width="full"
        />
        
        <PrintableField
          label="CalAIM Pathway"
          value={data.pathway}
          type="radio"
          options={['SNF Transition', 'SNF Diversion']}
          required
          width="full"
        />
        
        <PrintableField
          label="Member meets pathway criteria"
          value={data.meetsPathwayCriteria ? 'Yes' : 'No'}
          type="radio"
          options={['Yes', 'No']}
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
      <PrintableFormSection title="Section 8: Independent Support Person (ISP) & Facility Information">
        <PrintableField
          label="ISP First Name"
          value={data.ispFirstName}
          required
          width="half"
        />
        <PrintableField
          label="ISP Last Name"
          value={data.ispLastName}
          required
          width="half"
        />
        
        <PrintableField
          label="ISP Relationship to Member"
          value={data.ispRelationship}
          required
          width="half"
        />
        <PrintableField
          label="ISP Phone Number"
          value={data.ispPhone}
          required
          width="half"
        />
        
        <PrintableField
          label="ISP Email"
          value={data.ispEmail}
          width="half"
        />
        <PrintableField
          label="ISP Facility Name"
          value={data.ispFacilityName}
          width="half"
        />

        <PrintableField
          label="CalAIM vs. Assisted Living Waiver (ALW): On ALW waitlist"
          value={data.onALWWaitlist}
          type="radio"
          options={['Yes', 'No', 'Unknown']}
          width="full"
        />
        
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
      <PrintableFormSection title="Section 9: Preferred Residential Care Facility (RCFE)">
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

      {/* Form Footer */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black text-center">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-2">
          <strong>For Office Use Only</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-6 text-left">
          <div>
            <label className="block text-sm font-medium mb-2">Date Received:</label>
            <div className="h-10 border-b-2 border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Processed By:</label>
            <div className="h-10 border-b-2 border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Application ID:</label>
            <div className="h-10 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}