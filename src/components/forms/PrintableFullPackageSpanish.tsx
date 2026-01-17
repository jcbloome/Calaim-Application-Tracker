'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { PrintableCsSummaryFormSpanish } from './PrintableCsSummaryFormSpanish';
import { PrintableWaiversFormSpanish } from './PrintableWaiversFormSpanish';
import { PrintableDeclarationFormSpanish } from './PrintableDeclarationFormSpanish';
import { PrintableGlossaryFormSpanish } from './PrintableGlossaryFormSpanish';
import { PrintableProgramInfoFormSpanish } from './PrintableProgramInfoFormSpanish';
import { PrintableRoomBoardObligationFormSpanish } from './PrintableRoomBoardObligationFormSpanish';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';

interface PrintableFullPackageSpanishProps {
  applicationData?: Partial<FormValues>;
  applicationId?: string;
  pathway?: 'SNF Transition' | 'SNF Diversion';
  showPrintButton?: boolean;
}

export function PrintableFullPackageSpanish({ 
  applicationData = {},
  applicationId,
  pathway,
  showPrintButton = true 
}: PrintableFullPackageSpanishProps) {
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
        filename: `CalAIM_Paquete_Completo_${applicationId || 'formulario'}.pdf`,
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
            Imprimir Paquete Completo
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
                Generando PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </>
            )}
          </Button>
        </div>
      )}
      
      <div ref={printableRef} className="space-y-12 print:space-y-16">

      {/* Acronym Glossary - First */}
      <PrintableGlossaryFormSpanish 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Program Information */}
      <PrintableProgramInfoFormSpanish 
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* CS Summary Form */}
      <PrintableCsSummaryFormSpanish 
        data={applicationData}
        applicationId={applicationId}
        showPrintButton={false}
      />

      {/* Page Break */}
      <div className="page-break print:page-break-before"></div>

      {/* Waivers & Authorizations */}
      <PrintableWaiversFormSpanish 
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
      <PrintableRoomBoardObligationFormSpanish 
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
          <PrintableDeclarationFormSpanish 
            memberName={applicationData.memberFirstName && applicationData.memberLastName 
              ? `${applicationData.memberFirstName} ${applicationData.memberLastName}` 
              : ''}
            memberMrn={applicationData.memberMrn || ''}
            applicationId={applicationId}
            showPrintButton={false}
          />
        </>
      )}

      {/* Package Footer */}
      <div className="mt-12 print:mt-16 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
        <p className="text-sm print:text-xs text-gray-600 print:text-black mb-4 text-center">
          <strong>Fin del Paquete de Solicitud CalAIM</strong>
        </p>
        
        <div className="space-y-4 text-xs print:text-xs text-gray-500 print:text-black">
          <div className="p-3 bg-yellow-50 print:bg-gray-100 border border-yellow-200 print:border-gray-400 rounded print:rounded-none">
            <p className="font-bold mb-2">¿Necesita Ayuda?</p>
            <p className="font-semibold">Contacte a Connections Care Home Consultants:</p>
            <p className="font-semibold">Teléfono: 800-330-5593</p>
            <p className="font-semibold">Correo electrónico: calaim@carehomefinders.com</p>
            <p className="text-xs mt-2 font-medium">
              <strong>Importante:</strong> Este correo electrónico es solo para información sobre el programa. 
              Por favor no envíe ningún formulario de solicitud aquí y en su lugar use nuestro 
              portal seguro de carga de documentos en línea en: <strong>connectcalaim.com/forms/printable-package</strong>
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">Referencia Rápida:</p>
            <ul className="space-y-1">
              <li><strong>Servicios para Miembros de Health Net:</strong> 800-675-6110</li>
              <li><strong>Opciones de Atención Médica de California:</strong> 800-430-4263</li>
              <li><strong>Servicios para Miembros de Kaiser:</strong> 1-800-464-4000</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t print:border-t print:border-gray-300 text-center">
          <p className="text-xs print:text-xs text-gray-500 print:text-black">
            Paquete generado el {new Date().toLocaleDateString('es-ES')} • ID de Solicitud: {applicationId || 'N/A'}
          </p>
        </div>
      </div>

      </div>
    </div>
  );
}