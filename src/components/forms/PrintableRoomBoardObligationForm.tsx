'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableRoomBoardObligationFormProps {
  memberName?: string;
  memberMrn?: string;
  memberDob?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableRoomBoardObligationForm({
  memberName = '',
  applicationId,
  showPrintButton = true
}: PrintableRoomBoardObligationFormProps) {
  const safeMemberName = String(memberName || '').trim();

  return (
    <PrintableFormLayout
      title="Room and Board/Tier Level Agreement"
      subtitle=""
      formType="room-board-obligation"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-4 text-[16px] leading-7 print:text-[14px] print:leading-6">
        <div>
          <span className="font-semibold">Name of CalAIM Member:</span>{' '}
          <span className="inline-block min-w-[300px] border-b border-black align-baseline px-1">{safeMemberName || ' '}</span>
        </div>

        <div>
          The Managed Care Plan (MCP) "Assisted Living" payment at Tier Level{' '}
          <span className="inline-block min-w-[70px] border-b border-black align-baseline">&nbsp;</span>{' '}
          is
        </div>
        <div>
          $ <span className="inline-block min-w-[320px] border-b border-black align-baseline">&nbsp;</span>
        </div>

        <div>
          The Member's agreed "Room and Board" payment: ${' '}
          <span className="inline-block min-w-[220px] border-b border-black align-baseline">&nbsp;</span>.
        </div>

        <p>
          I, the member or authorized representative named above, agree to pay to{' '}
          <span className="inline-block min-w-[300px] border-b border-black align-baseline">&nbsp;</span> (Name of Facility) the amount indicated above for the "Room and Board" payment. If the amount is less than $1,626 and the member is eligible for the Non-Medical Out of Home Care (NMOHC) Payment (the maximum amount is $1,626): the member 1) pays the RCFE/ARF $1,444 and retains $182 for personal need expenses, although this supplemental amount varies and 2) will work with RCFE/ARF to apply for the NMOHC supplemental payment.
        </p>

        <p>
          This statement is provided solely for the purpose of applying for the CalAIM Community Support with the MCP based on documented income (e.g., social security annual award letter or bank statement). <span className="font-semibold">It does not preclude any other additional financial arrangement made with the RCFE/ARF, such as additional "room and board" payments for a private room or to access RCFEs/ARFs in more expensive geographic areas.</span>
        </p>

        <div className="pt-2">
          <p className="font-semibold">Member or Authorized Representative:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mt-2">
            <div>Signature: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Print Name: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div className="md:col-span-2">
              If authorized representative, what is relationship with member (e.g., son, POA, etc.){' '}
              <span className="inline-block min-w-[180px] border-b border-black align-baseline">&nbsp;</span>
            </div>
            <div>Phone: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Email: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
          </div>
        </div>

        <div className="pt-2">
          <p className="font-semibold">RCFE/ARF Authorized Signer for: Name of RCFE/ARF <span className="inline-block min-w-[290px] border-b border-black align-baseline">&nbsp;</span></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 mt-2">
            <div>Signature: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Print Name: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Title: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Phone: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div>Email: <span className="inline-block min-w-[250px] border-b border-black align-baseline">&nbsp;</span></div>
            <div className="md:col-span-2">Address: <span className="inline-block min-w-[540px] border-b border-black align-baseline">&nbsp;</span></div>
          </div>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
