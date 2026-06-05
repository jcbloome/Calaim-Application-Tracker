'use client';

import React from 'react';
import { PrintableFormLayout } from './PrintableFormLayout';

interface PrintableDeclarationFormVietnameseProps {
  memberName?: string;
  memberMrn?: string;
  applicationId?: string;
  showPrintButton?: boolean;
}

export function PrintableDeclarationFormVietnamese({
  memberName = '',
  memberMrn = '',
  applicationId,
  showPrintButton = true
}: PrintableDeclarationFormVietnameseProps) {
  return (
    <PrintableFormLayout
      title="Tuyen bo ve dieu kien duyet ho so"
      subtitle="Ho tro cong dong CalAIM (CS) cho chuyen huong tu SNF sang song ho tro"
      formType="declaration"
      applicationData={{ id: applicationId }}
      showPrintButton={showPrintButton}
    >
      <div className="space-y-6 text-sm print:text-xs">
        <div className="p-4 print:p-6 border print:border-black">
          <h3 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
            Tuyen bo ve dieu kien duyet ho so (Tieng Viet)
          </h3>
          <p className="text-sm print:text-xs text-gray-700 print:text-black">
            Danh cho bac si cham soc chinh (PCP) hoan tat: Vui long in ro rang.
          </p>
        </div>
      </div>
    </PrintableFormLayout>
  );
}
