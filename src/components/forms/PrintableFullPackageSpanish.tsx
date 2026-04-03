'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { PrintableCsSummaryFormSpanish } from './PrintableCsSummaryFormSpanish';
import { PrintableWaiversFormSpanish } from './PrintableWaiversFormSpanish';
import { PrintableDeclarationFormSpanish } from './PrintableDeclarationFormSpanish';
import { PrintableGlossaryFormSpanish } from './PrintableGlossaryFormSpanish';
import { PrintableProgramInfoFormSpanish } from './PrintableProgramInfoFormSpanish';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';

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
      const sections = Array.from(
        printableRef.current.querySelectorAll('.printable-package-section')
      ) as HTMLElement[];
      const bytes = await generatePdfFromHtmlSections(sections, {
        stampPageNumbers: true,
        headerText: 'Solicitud de Apoyo Comunitario CalAIM',
        options: { marginIn: 0.5, scale: 2, format: 'letter', orientation: 'portrait' },
      });

      const fileName = `CalAIM_Paquete_Completo_${applicationId || 'formulario'}.pdf`;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
        
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
      
      <div ref={printableRef} className="space-y-12 print:space-y-0 printable-package">
        <div className="printable-package-section">
          <PrintableGlossaryFormSpanish applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableProgramInfoFormSpanish applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableCsSummaryFormSpanish data={applicationData} applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableWaiversFormSpanish
            memberName={
              applicationData.memberFirstName && applicationData.memberLastName
                ? `${applicationData.memberFirstName} ${applicationData.memberLastName}`
                : ''
            }
            memberMrn={applicationData.memberMrn || ''}
            applicationId={applicationId}
            showPrintButton={false}
          />
        </div>

        {(pathway === 'SNF Diversion' || applicationData.pathway === 'SNF Diversion') ? (
          <div className="printable-package-section">
            <PrintableDeclarationFormSpanish
              memberName={
                applicationData.memberFirstName && applicationData.memberLastName
                  ? `${applicationData.memberFirstName} ${applicationData.memberLastName}`
                  : ''
              }
              memberMrn={applicationData.memberMrn || ''}
              applicationId={applicationId}
              showPrintButton={false}
            />
          </div>
        ) : null}

        <div className="printable-package-section">
          <div className="mt-12 print:mt-0 p-4 print:p-6 bg-gray-50 print:bg-white border print:border-black">
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
                  <strong>Importante:</strong> Este correo electrónico es solo para información sobre el programa. Por favor no envíe ningún
                  formulario de solicitud aquí y en su lugar use nuestro portal seguro de carga de documentos en línea en:{' '}
                  <strong>connectcalaim.com/forms/printable-package</strong>
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">Referencia Rápida:</p>
                <ul className="space-y-1">
                  <li>
                    <strong>Servicios para Miembros de Health Net:</strong> 800-675-6110
                  </li>
                  <li>
                    <strong>Opciones de Atención Médica de California:</strong> 800-430-4263
                  </li>
                  <li>
                    <strong>Servicios para Miembros de Kaiser:</strong> 1-800-464-4000
                  </li>
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
    </div>
  );
}