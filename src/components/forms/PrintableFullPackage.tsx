'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { PrintableCsSummaryForm } from './PrintableCsSummaryForm';
import { PrintableWaiversForm } from './PrintableWaiversForm';
import { PrintableDeclarationForm } from './PrintableDeclarationForm';
import { PrintableGlossaryForm } from './PrintableGlossaryForm';
import { PrintableProgramInfoForm } from './PrintableProgramInfoForm';
import { PrintableRoomBoardObligationForm } from './PrintableRoomBoardObligationForm';
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
  const printableRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    if (!printableRef.current) return;
    
    setIsGeneratingPDF(true);
    
    try {
      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import('html2pdf.js')).default;
      
      // Configure PDF options for full package
      const options = {
        margin: 0.5,
        filename: `CalAIM_Complete_Package_${applicationId || 'form'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          allowTaint: false,
          height: window.innerHeight,
          width: window.innerWidth
        },
        jsPDF: { 
          unit: 'in', 
          format: 'letter', 
          orientation: 'portrait' 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      // Generate and download PDF
      await html2pdf()
        .set(options)
        .from(printableRef.current)
        .save();
        
    } catch (error) {
      console.error('Error generating PDF:', error);
      // Fallback to print dialog
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print Controls - Upper left like other forms */}
      {showPrintButton && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3 print:hidden">
          <Button onClick={() => window.print()} className="flex-1 sm:flex-none">
            <Printer className="h-4 w-4 mr-2" />
            Print Complete Package
          </Button>
          <Button 
            onClick={handleDownloadPDF} 
            variant="outline" 
            className="flex-1 sm:flex-none"
            disabled={isGeneratingPDF}
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </div>
      )}
      
      <div ref={printableRef} className="space-y-12 print:space-y-16">

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

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Room and Board Commitment */}
      <PrintableRoomBoardObligationForm 
        memberName={applicationData.memberFirstName && applicationData.memberLastName 
          ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
          : ''}
        memberMrn={applicationData.memberMrn || ''}
        memberDob={applicationData.memberDob || ''}
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

      </div>
    </div>
  );
}