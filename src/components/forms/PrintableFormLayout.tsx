'use client';

import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, Download, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';

interface PrintableFormLayoutProps {
  title: string;
  subtitle?: string;
  formType: 'cs-summary' | 'waivers' | 'declaration' | 'generic';
  children: React.ReactNode;
  applicationData?: any;
  showPrintButton?: boolean;
  className?: string;
  hideDocumentChrome?: boolean;
  disableMonochrome?: boolean;
  extraControls?: React.ReactNode;
  extraControlsBelow?: React.ReactNode;
}

export function PrintableFormLayout({
  title,
  subtitle,
  formType,
  children,
  applicationData,
  showPrintButton = true,
  className = '',
  hideDocumentChrome = false,
  disableMonochrome = false,
  extraControls,
  extraControlsBelow,
}: PrintableFormLayoutProps) {
  const printableRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const waitForPrintableAssets = async (root: HTMLElement) => {
    try {
      await (document as any)?.fonts?.ready;
    } catch {
      // Ignore
    }

    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(
      imgs.map(async (img) => {
        try {
          if (img.complete && img.naturalWidth > 0) {
            if (typeof (img as any).decode === 'function') {
              await (img as any).decode();
            }
            return;
          }
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        } catch {
          // Ignore
        }
      })
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!printableRef.current) return;
    
    setIsGeneratingPDF(true);
    
    try {
      const sectionNodes = Array.from(
        printableRef.current.querySelectorAll<HTMLElement>('.kaiser-packet-page, [data-pdf-page]')
      );

      if (sectionNodes.length > 0) {
        const pdfBytes = await generatePdfFromHtmlSections(sectionNodes, {
          stampPageNumbers: false,
          options: {
            marginIn: 0.08,
            scale: 3,
            orientation: 'portrait',
            format: 'letter',
            topBufferPts: 4,
            treatEachSectionAsSinglePage: true,
            imageFormat: 'png',
            fitSafetyScale: 0.998,
          },
        });

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Dynamically import html2pdf to avoid SSR issues
      const mod: any = await import('html2pdf.js');
      const html2pdf = mod?.default ?? mod;
      if (typeof html2pdf !== 'function') {
        throw new Error('PDF generator failed to load.');
      }

      await waitForPrintableAssets(printableRef.current);
      
      // Configure PDF options
      const options = {
        // Slightly larger top margin to prevent first-line clipping in PDFs
        margin: [0.75, 0.5, 0.5, 0.5],
        filename: `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          allowTaint: false,
          backgroundColor: '#ffffff'
        },
        jsPDF: { 
          unit: 'in', 
          format: 'letter', 
          orientation: 'portrait' 
        }
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
    <div className={`max-w-4xl mx-auto ${className}`}>
      {/* Print Controls - Hidden in print */}
      {showPrintButton && (
        <div className="mb-6 print:hidden">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handlePrint} className="flex-1 sm:flex-none">
              <Printer className="h-4 w-4 mr-2" />
              Print Form
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
            {extraControls}
          </div>
          {extraControlsBelow ? <div className="mt-2">{extraControlsBelow}</div> : null}
        </div>
      )}

      {/* Printable Form */}
      <div
        ref={printableRef}
        className={`bg-white shadow-lg print:shadow-none print:bg-white ${disableMonochrome ? '' : 'printable-monochrome'}`.trim()}
      >
        {hideDocumentChrome ? (
          <div className="p-8 print:p-6">{children}</div>
        ) : (
          <>
            {/* Header - Optimized for print */}
            <div className="p-8 print:p-6 border-b print:border-b-2 print:border-black">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:flex-row print:items-center">
                <div className="flex items-center gap-4">
                  <div className="print:hidden">
                    <Image
                      src="/calaimlogopdf.png"
                      alt="Connect CalAIM Logo"
                      width={210}
                      height={60}
                      className="object-contain"
                    />
                  </div>
                  <div className="hidden print:block">
                    <div className="text-2xl font-bold text-gray-900">Connect CalAIM</div>
                    <div className="text-sm text-gray-600">Community Support Application</div>
                  </div>
                </div>
                
                <div className="text-right print:text-right">
                  <div className="text-sm text-gray-600 print:text-black">
                    Form Generated: {format(new Date(), 'MMMM dd, yyyy')}
                  </div>
                  {applicationData?.id && (
                    <div className="text-sm text-gray-600 print:text-black">
                      Application ID: {applicationData.id}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Title Section */}
            <div className="p-8 print:p-6 bg-gray-50 print:bg-white border-b print:border-b print:border-gray-300">
              <div className="text-center">
                <h1 className="text-3xl print:text-2xl font-bold text-gray-900 mb-2">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-lg print:text-base text-gray-600 print:text-black">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Form Content */}
            <div className="p-8 print:p-6">
              {children}
            </div>

            {/* Footer - Print optimized */}
            <div className="p-8 print:p-6 border-t print:border-t-2 print:border-black bg-gray-50 print:bg-white">
              <div className="text-center text-sm print:text-xs text-gray-600 print:text-black">
                <p className="mb-2">
                  <strong>Connect CalAIM Community Support Program</strong>
                </p>
                <p>
                  For questions or assistance, contact Connections Care Home Consultants at
                  800-330-5993 or email us at calaim@carehomefinders.com.
                </p>
                <div className="mt-4 pt-4 border-t print:border-t print:border-gray-300">
                  <p className="text-xs print:text-xs">
                    This form is part of the California Advancing and Innovating Medi-Cal (CalAIM) initiative.
                    All information provided is confidential and protected under HIPAA regulations.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {!disableMonochrome ? (
        <style jsx global>{`
          .printable-monochrome,
          .printable-monochrome * {
            color: #000 !important;
            border-color: #000 !important;
            box-shadow: none !important;
            background: transparent !important;
          }

          .printable-monochrome {
            background: #fff !important;
          }
        `}</style>
      ) : null}
    </div>
  );
}

/* Print-specific styles */
export const printStyles = `
  @media print {
    @page {
      size: letter;
      margin: 0.5in;
    }
    
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .print\\:hidden {
      display: none !important;
    }
    
    .print\\:block {
      display: block !important;
    }
    
    .print\\:text-black {
      color: black !important;
    }
    
    .print\\:bg-white {
      background-color: white !important;
    }
    
    .print\\:border-black {
      border-color: black !important;
    }
    
    .print\\:border-gray-300 {
      border-color: #d1d5db !important;
    }
    
    .print\\:shadow-none {
      box-shadow: none !important;
    }
    
    .print\\:p-6 {
      padding: 1.5rem !important;
    }
    
    .print\\:text-2xl {
      font-size: 1.5rem !important;
      line-height: 2rem !important;
    }
    
    .print\\:text-base {
      font-size: 1rem !important;
      line-height: 1.5rem !important;
    }
    
    .print\\:text-xs {
      font-size: 0.75rem !important;
      line-height: 1rem !important;
    }
    
    /* Static form fields for printing */
    .static-field-line {
      border-bottom: 1px solid #000 !important;
      background: white !important;
      min-height: 24px;
    }
    
    .static-field-box {
      border: 1px solid #000 !important;
      background: white !important;
    }
    
    /* Make empty checkboxes and radio buttons visible */
    .static-checkbox,
    .static-radio {
      width: 12px;
      height: 12px;
      border: 1px solid #000 !important;
      background: white !important;
      display: inline-block;
    }
    
    .static-radio {
      border-radius: 50%;
    }
  }
`;