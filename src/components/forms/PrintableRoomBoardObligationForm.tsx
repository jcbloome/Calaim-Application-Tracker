'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField } from './PrintableField';
import { PrintableFormSection } from './PrintableFormSection';

interface PrintableRoomBoardObligationFormProps {
  memberName?: string;
  memberMrn?: string;
  memberDob?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableRoomBoardObligationForm({
  memberName = '',
  memberMrn = '',
  memberDob = '',
  applicationId,
  showPrintButton = true
}: PrintableRoomBoardObligationFormProps) {
  return (
    <PrintableFormLayout
      title="Room and Board Obligation Statement"
      subtitle="CalAIM Community Support for Assisted Living Transitions"
      formType="room-board-obligation"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        {/* Member Information */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
          <PrintableField label="Member's Name" value={memberName} width="full" />
          <PrintableField label="MRN" value={memberMrn} width="full" />
          <PrintableField label="Date of Birth" value={memberDob} type="date" width="full" />
        </div>

        {/* Room and Board Explanation */}
        <div className="p-4 print:p-6 border print:border-black bg-blue-50 print:bg-white">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Understanding Room and Board Obligations
          </h3>
          <div className="space-y-3 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              <strong>Important:</strong> As a CalAIM Community Support participant, you are responsible for paying 
              the "room and board" portion of your assisted living costs. The Managed Care Plan (MCP) will pay 
              for the "assisted living services" portion.
            </p>
            <p>
              <strong>Room and Board</strong> includes: housing, meals, utilities, and basic facility services.
            </p>
            <p>
              <strong>Assisted Living Services</strong> include: personal care assistance, medication management, 
              and other health-related services covered by your MCP.
            </p>
          </div>
        </div>

        {/* Income Information */}
        <PrintableFormSection title="Monthly Income Information">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                My current monthly Social Security income is: *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="flex-1 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">per month</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Other monthly income (if any):
              </label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-32 text-sm">Source:</span>
                  <div className="flex-1 h-8 border-b border-gray-300 print:border-black"></div>
                  <span className="w-16 text-sm">Amount: $</span>
                  <div className="w-24 h-8 border-b border-gray-300 print:border-black"></div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-32 text-sm">Source:</span>
                  <div className="flex-1 h-8 border-b border-gray-300 print:border-black"></div>
                  <span className="w-16 text-sm">Amount: $</span>
                  <div className="w-24 h-8 border-b border-gray-300 print:border-black"></div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Total Monthly Income: *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="w-32 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">per month</span>
              </div>
            </div>
          </div>
        </PrintableFormSection>

        {/* Payment Commitment */}
        <div className="p-4 print:p-6 border-2 print:border-black bg-yellow-50 print:bg-white">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Room and Board Payment Commitment
          </h3>
          <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              I understand and acknowledge that:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>I am required to pay the room and board portion of my assisted living costs directly to the facility.</li>
              <li>The amount I can pay for room and board will determine which facilities are available to me.</li>
              <li>If I am eligible for SSI/SSP and the Non-Medical Out of Home Care (NMOHC) payment, my SSI/SSP will be increased to $1,626.07 per month.</li>
              <li>I will typically retain $182 for personal needs, and the remaining amount will go toward room and board.</li>
              <li>If I cannot pay any room and board portion, I may not be eligible for this Community Support program.</li>
              <li>Room and board costs vary by facility and location throughout California.</li>
            </ul>
          </div>
        </div>

        {/* Acknowledgment and Signature */}
        <div className="mt-8 p-4 print:p-6 border-2 print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Acknowledgment and Agreement
          </h3>
          <div className="space-y-4 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              By signing below, I acknowledge that I have read and understood this Room and Board Obligation Statement. 
              I understand my financial responsibilities and agree to pay the room and board portion as outlined above.
            </p>
            <p>
              I understand that my ability to participate in the CalAIM Community Support program depends on my 
              ability to meet these room and board obligations.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
                Member/Representative Signature *
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
              Print Name
            </label>
            <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Relationship to Member (if signing as representative)
            </label>
            <div className="h-12 border-b-2 border-gray-300 print:border-black"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500 print:text-gray-700">
          <p>For questions about CalAIM Community Supports, please contact Connections at (800) 993-1778.</p>
          <p>More information available at <a href="https://www.connections.com/calaim" target="_blank" rel="noopener noreferrer" className="text-blue-600 print:text-blue-800 hover:underline">www.connections.com/calaim</a></p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}