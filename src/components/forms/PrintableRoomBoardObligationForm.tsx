'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';
import { PrintableField, PrintableFormSection } from './PrintableFormFields';

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
      title="Room and Board Commitment"
      subtitle=""
      formType="room-board-obligation"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-4 text-sm print:text-xs">
        {/* Member Information */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1">
          <PrintableField label="Member's Name" value={memberName} width="full" />
          <PrintableField label="MRN" value={memberMrn} width="full" />
          <PrintableField label="Date of Birth" value={memberDob} type="date" width="full" />
        </div>

        {/* Room and Board Explanation */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Room and Board Overview
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              <strong>Important:</strong> As a CalAIM Community Support participant, you are responsible for paying 
              the "room and board" portion of your assisted living costs. The Managed Care Plan (MCP) will pay 
              for the "assisted living services" portion.
            </p>
            <p>
              <strong>Room and Board</strong> includes: housing, meals, utilities, and basic facility services.
            </p>
            <p><strong>Assisted Living Services</strong> include personal care, meds, and covered health services.</p>
          </div>
        </div>

        {/* NMOHC Information */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            NMOHC Summary
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              NMOHC boosts monthly SSI for people living in licensed assisted living homes (RCFE). The rate moves
              from "Independent Living" to the "NMOHC" rate.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Income limit (2026): less than $1,626.07/month.</li>
              <li>Asset limits reinstated: $2,000 individual ($3,000 couple).</li>
              <li>Call SSA (1-800-772-1213) to confirm the new payment.</li>
            </ul>
          </div>
        </div>

        {/* Income Information */}
        <PrintableFormSection title="Monthly Income">
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
                Expected "room and board" payment (This amount will vary if the member receives the NMOHC payment): *
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold">$</span>
                <div className="flex-1 h-12 border-b-2 border-gray-400 print:border-black"></div>
                <span className="text-sm text-gray-600 print:text-black">per month</span>
              </div>
            </div>

            <div className="mt-3 p-3 print:p-4 border print:border-black bg-gray-50 print:bg-white">
              <p className="text-sm print:text-xs text-gray-700 print:text-black">
                <strong>Note:</strong> Proof of income (3 months of bank statements showing Social Security income OR Social Security annual award letter) will need to be uploaded with your application.
              </p>
            </div>
          </div>
        </PrintableFormSection>

        {/* Payment Commitment */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Commitment
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>I understand and acknowledge that:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>I must pay the room and board portion directly to the facility.</li>
              <li>SSI/SSP + NMOHC may increase the payment toward room and board.</li>
              <li>If I cannot pay any room and board, I may be ineligible.</li>
            </ul>
          </div>
        </div>

        {/* Acknowledgment and Signature */}
        <div className="mt-6 p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Acknowledgment and Signature
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>By signing below, I acknowledge this Room and Board Commitment.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:gap-8 mt-6">
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
          
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 print:text-black mb-2">
              Print Name
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
