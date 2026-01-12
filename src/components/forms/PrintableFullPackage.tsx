'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import { PrintableCsSummaryForm } from './PrintableCsSummaryForm';
import { PrintableWaiversForm } from './PrintableWaiversForm';
import { PrintableDeclarationForm } from './PrintableDeclarationForm';
import { PrintableGlossaryForm } from './PrintableGlossaryForm';
import { PrintableProgramInfoForm } from './PrintableProgramInfoForm';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableFullPackageProps {
  applicationData?: Partial<FormValues>;
  applicationId?: string;
  pathway?: 'SNF Transition' | 'SNF Diversion';
  showPrintButton?: boolean;
}

export function PrintableFullPackage({ 
  applicationData = {},
  applicationId,
  pathway,
  showPrintButton = true 
}: PrintableFullPackageProps) {
  return (
    <div className="space-y-12 print:space-y-16">

      {/* Program Information */}
      <PrintableProgramInfoForm 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* CS Summary Form */}
      <PrintableCsSummaryForm 
        data={applicationData}
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Waivers & Authorizations */}
      <PrintableWaiversForm 
        memberName={applicationData.memberFirstName && applicationData.memberLastName 
          ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
          : ''}
        memberMrn={applicationData.memberMrn || ''}
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Declaration of Eligibility (only for SNF Diversion) */}
      {(pathway === 'SNF Diversion' || applicationData.pathway === 'SNF Diversion') && (
        <>
          <div className="page-break print:page-break-before"></div>
          <PrintableDeclarationForm 
            memberName={applicationData.memberFirstName && applicationData.memberLastName 
              ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
              : ''}
            memberMrn={applicationData.memberMrn || ''}
            applicationId={applicationId}
            showPrintButton={false}
          />
        </>
      )}

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Acronym Glossary */}
      <PrintableGlossaryForm 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Package Footer */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black text-center">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-2">
          <strong>End of CalAIM Application Package</strong>
        </p>
        <p className="text-xs print:text-xs text-gray-500 print:text-black">
          For questions or assistance, please contact your assigned case worker or visit our website.
        </p>
        <div className="mt-4 pt-4 border-t print:border-t print:border-gray-300">
          <p className="text-xs print:text-xs text-gray-500 print:text-black">
            Package generated on {new Date().toLocaleDateString()} • Application ID: {applicationId || 'N/A'}
          </p>
        </div>
      </div>

      {/* Print Controls - Upper left like other forms */}
      {showPrintButton && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3 print:hidden">
          <Button onClick={() => window.print()} className="flex-1 sm:flex-none">
            <Printer className="h-4 w-4 mr-2" />
            Print Complete Package
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      )}
    </div>
  );
}