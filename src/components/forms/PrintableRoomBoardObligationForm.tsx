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

        {/* Room and Board Payment Summary */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Room and Board Payment Summary
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              The MCP member is responsible for paying the RCFE the "room and board" portion and the MCP is responsible
              for paying the RCFE the "assisted living" portion.
            </p>
            <p>
              For members eligible for SSI/SSP and the 2026 Non-Medical Out of Home Care payment (NMOHC), SSI/SSP is bumped
              up to $1,626.07. The member usually retains $182 for personal needs expenses and the RCFE receives the
              $1,444.07 balance as payment for "room and board". Any income above $1,444.07 is not paid as "room and board"
              unless the member wants to pay more to access more expensive geographic areas or the RCFE/ARF agrees to a
              higher amount for a private room (since the program does not mandate private rooms).
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
            <p>
              The RCFE may also require the member/family to sign a separate admission agreement or contract that confirms
              the "room and board" obligation.
            </p>
            <p>
              If the member requests a private room, or the selected RCFE’s rates exceed the standard "room and board"
              plus the MCP "assisted living" payment, the RCFE may require a separate agreement for the member/family to
              pay an additional amount. Any such additional amount is not reflected in this commitment form.
            </p>
          </div>
        </div>

        {/* Payment Commitment */}
        <div className="p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Commitment *
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 border border-gray-400 print:border-black mt-0.5" />
              <p>
                Member/authorized representative agrees to pay the required "room and board" portion.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 border border-gray-400 print:border-black mt-0.5" />
              <p>
                Member/authorized representative does not agree to pay the required "room and board" portion.
              </p>
            </div>
          </div>
        </div>

        {/* Acknowledgment and Signature */}
        <div className="mt-6 p-3 print:p-4 border print:border-black">
          <h3 className="text-base font-semibold text-gray-900 print:text-black mb-2">
            Acknowledgment and Signature
          </h3>
          <div className="space-y-2 text-sm print:text-xs text-gray-700 print:text-black">
            <p>
              By signing below, I acknowledge I am the member or an authorized representative (POA) legally empowered to
              sign on behalf of the member.
            </p>
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
      </div>
    </PrintableFormLayout>
  );
}
