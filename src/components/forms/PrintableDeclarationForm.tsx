'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection, PrintableSignatureBlock } from './PrintableFormFields';

interface PrintableDeclarationFormProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableDeclarationForm({ 
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true 
}: PrintableDeclarationFormProps) {
  return (
    <PrintableFormLayout
      title="Declaration of Eligibility"
      subtitle="Required for SNF Diversion - Not required for Kaiser members"
      formType="declaration"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      {/* Instructions */}
      <div className="col-span-full mb-8 p-4 print:p-6 bg-blue-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-blue-800 print:text-black">
          <strong>Instructions:</strong> This form is for a Physician/AP to establish presumptive eligibility 
          and must be signed by the member's Primary Care Provider (PCP). This form is not required for any 
          Kaiser members.
        </p>
      </div>

      {/* Member Information */}
      <PrintableFormSection title="Member Information">
        <PrintableField
          label="Member Name"
          value={memberName}
          required
          width="half"
        />
        <PrintableField
          label="Medical Record Number (MRN)"
          value={memberMrn}
          placeholder="For Health Net use Medi-Cal number (9XXXXXXXA). For Kaiser use specific MRN."
          required
          width="half"
        />
      </PrintableFormSection>

      {/* PCP Declaration */}
      <PrintableFormSection title="To be completed by the Primary Care Provider (PCP)">
        <div className="col-span-full space-y-6 text-sm print:text-xs">
          <div className="p-4 print:p-6 border print:border-black">
            <p className="mb-4">
              I, <span className="inline-block border-b border-gray-400 print:border-black w-64 mx-2"></span>, 
              in the professional capacity as a <span className="inline-block border-b border-gray-400 print:border-black w-64 mx-2"></span>, 
              affirm that Member <span className="inline-block border-b border-gray-400 print:border-black w-64 mx-2"></span> 
              is currently receiving a medically necessary Skilled Nursing Facility Level of Care (SNF LOC) or meets 
              the minimum criteria for receiving SNF LOC services and, in lieu of entering a facility, is choosing 
              to remain in the community and continue receiving medically necessary SNF LOC services in an assisted 
              living facility for the following reason(s):
            </p>
          </div>

          <PrintableField
            label="MRN"
            required
            width="full"
          />
          
          {/* MRN Guidelines */}
          <div className="col-span-full mb-4 p-3 bg-blue-50 print:bg-gray-50 border border-blue-200 print:border-gray-400 rounded-lg print:rounded-none">
            <div className="flex items-start gap-2">
              <div className="text-blue-600 print:text-black">💡</div>
              <div>
                <h5 className="font-semibold text-blue-900 print:text-black text-xs mb-1">MRN Guidelines:</h5>
                <div className="text-xs text-blue-800 print:text-black space-y-0.5">
                  <div><strong>Health Net:</strong> Use Medi-Cal number (starts with 9)</div>
                  <div><strong>Kaiser:</strong> Use specific Kaiser MRN</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-3">
              Reason(s) for choosing assisted living over skilled nursing facility: *
            </label>
            <div className="space-y-2">
              <div className="h-8 border-b border-gray-300 print:border-black"></div>
              <div className="h-8 border-b border-gray-300 print:border-black"></div>
              <div className="h-8 border-b border-gray-300 print:border-black"></div>
              <div className="h-8 border-b border-gray-300 print:border-black"></div>
              <div className="h-8 border-b border-gray-300 print:border-black"></div>
            </div>
          </div>

          <PrintableField
            label="Current medical conditions requiring SNF level of care"
            type="textarea"
            rows={4}
            width="full"
          />

          <PrintableField
            label="Specific medical services/treatments needed"
            type="textarea"
            rows={3}
            width="full"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PrintableField
              label="Date of Assessment"
              type="date"
              required
              width="full"
            />
            <PrintableField
              label="Next Review Date"
              type="date"
              width="full"
            />
          </div>
        </div>
      </PrintableFormSection>

      {/* Clinical Criteria */}
      <PrintableFormSection title="Clinical Criteria Checklist">
        <div className="col-span-full">
          <p className="text-sm print:text-xs mb-4">
            Please check all that apply to confirm the member meets SNF level of care criteria:
          </p>
          
          <PrintableField
            label="Medical Conditions (check all that apply):"
            type="checkbox"
            options={[
              'Requires skilled nursing observation and assessment',
              'Complex medication management requiring professional oversight',
              'Wound care requiring skilled nursing intervention',
              'IV therapy or injections requiring skilled administration',
              'Respiratory therapy or oxygen management',
              'Physical therapy requiring skilled intervention',
              'Occupational therapy for functional restoration',
              'Speech therapy for swallowing or communication disorders',
              'Diabetes management requiring skilled monitoring',
              'Cardiac monitoring and management',
              'Post-surgical care requiring skilled nursing',
              'Other (specify below)'
            ]}
            width="full"
          />

          <PrintableField
            label="If 'Other' selected, please specify:"
            type="textarea"
            rows={2}
            width="full"
          />
        </div>
      </PrintableFormSection>

      {/* Functional Assessment */}
      <PrintableFormSection title="Functional Assessment">
        <div className="col-span-full">
          <p className="text-sm print:text-xs mb-4">
            Please indicate the member's level of assistance needed:
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <PrintableField
                label="Activities of Daily Living (ADLs)"
                type="checkbox"
                options={[
                  'Bathing - requires assistance',
                  'Dressing - requires assistance', 
                  'Toileting - requires assistance',
                  'Transferring - requires assistance',
                  'Eating - requires assistance',
                  'Continence - requires management'
                ]}
                width="full"
              />
            </div>
            
            <div>
              <PrintableField
                label="Instrumental ADLs (IADLs)"
                type="checkbox"
                options={[
                  'Medication management',
                  'Meal preparation',
                  'Transportation',
                  'Shopping',
                  'Housekeeping',
                  'Financial management'
                ]}
                width="full"
              />
            </div>
          </div>
        </div>
      </PrintableFormSection>

      {/* Provider Information */}
      <PrintableFormSection title="Primary Care Provider Information">
        <PrintableField
          label="Provider Name"
          required
          width="half"
        />
        <PrintableField
          label="Medical License Number"
          required
          width="half"
        />
        
        <PrintableField
          label="Practice/Facility Name"
          required
          width="half"
        />
        <PrintableField
          label="Phone Number"
          required
          width="half"
        />
        
        <PrintableField
          label="Address"
          required
          width="full"
        />
        
        <PrintableField
          label="City"
          required
          width="third"
        />
        <PrintableField
          label="State"
          required
          width="third"
        />
        <PrintableField
          label="ZIP Code"
          required
          width="third"
        />
      </PrintableFormSection>

      {/* Signature Blocks */}
      <div className="mt-12 print:mt-16 space-y-8">
        <PrintableSignatureBlock
          title="Primary Care Provider Certification"
          subtitle="I certify that the information provided above is accurate and that this member meets the criteria for SNF level of care as described. I recommend assisted living placement as medically appropriate for this member's needs."
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Provider Stamp/Seal (if available)
            </label>
            <div className="h-20 border-2 border-dashed border-gray-300 print:border-black"></div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Date of Certification
            </label>
            <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>
      </div>

      {/* Office Use Only */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-4 font-semibold">
          For Office Use Only
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Date Received:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Reviewed By:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Approval Status:</label>
            <div className="h-8 border-b border-gray-300 print:border-black"></div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}