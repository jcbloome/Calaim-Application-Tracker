'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, Loader2 } from 'lucide-react';
import { PrintableCsSummaryFormVietnamese } from './PrintableCsSummaryFormVietnamese';
import { PrintableWaiversFormVietnamese } from './PrintableWaiversFormVietnamese';
import { PrintableDeclarationFormVietnamese } from './PrintableDeclarationFormVietnamese';
import { PrintableGlossaryFormVietnamese } from './PrintableGlossaryFormVietnamese';
import { PrintableProgramInfoFormVietnamese } from './PrintableProgramInfoFormVietnamese';
import type { FormValues } from '@/app/forms/cs-summary-form/schema';
import { generatePdfFromHtmlSections } from '@/lib/pdf/generatePdfFromHtmlSections';

interface PrintableFullPackageVietnameseProps {
  applicationData?: Partial<FormValues>;
  applicationId?: string;
  pathway?: 'SNF Transition' | 'SNF Diversion';
  showPrintButton?: boolean;
}

export function PrintableFullPackageVietnamese({
  applicationData = {},
  applicationId,
  pathway,
  showPrintButton = true
}: PrintableFullPackageVietnameseProps) {
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
        headerText: 'Don Ho Tro Cong Dong CalAIM',
        options: { marginIn: 0.5, scale: 2, format: 'letter', orientation: 'portrait' },
      });

      const fileName = `CalAIM_Goi_Tai_Lieu_Day_Du_${applicationId || 'mau'}.pdf`;
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
      window.print();
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {showPrintButton && (
        <div className="mb-6 flex flex-col sm:flex-row gap-3 print:hidden">
          <Button onClick={() => window.print()} className="flex-1 sm:flex-none">
            <Printer className="h-4 w-4 mr-2" />
            In Tron Bo Ho So
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
                Dang tao PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Tai file PDF
              </>
            )}
          </Button>
        </div>
      )}

      <div ref={printableRef} className="space-y-12 print:space-y-0 printable-package">
        <div className="printable-package-section">
          <PrintableGlossaryFormVietnamese applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableProgramInfoFormVietnamese applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableCsSummaryFormVietnamese data={applicationData} applicationId={applicationId} showPrintButton={false} />
        </div>

        <div className="printable-package-section">
          <PrintableWaiversFormVietnamese
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
            <PrintableDeclarationFormVietnamese
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
              <strong>Ket thuc bo ho so CalAIM</strong>
            </p>

            <div className="space-y-4 text-xs print:text-xs text-gray-500 print:text-black">
              <div className="p-3 bg-yellow-50 print:bg-gray-100 border border-yellow-200 print:border-gray-400 rounded print:rounded-none">
                <p className="font-bold mb-2">Can ho tro?</p>
                <p className="font-semibold">Vui long lien he Connections Care Home Consultants:</p>
                <p className="font-semibold">Dien thoai: 800-330-5593</p>
                <p className="font-semibold">Email: calaim@carehomefinders.com</p>
                <p className="text-xs mt-2 font-medium">
                  <strong>Luu y:</strong> Email nay chi dung de hoi thong tin chuong trinh.
                  Vui long khong gui bieu mau qua email nay, hay tai len cong bao mat tai:{' '}
                  <strong>connectcalaim.com/forms/printable-package</strong>
                </p>
              </div>

              <div>
                <p className="font-semibold mb-2">So tham khao nhanh:</p>
                <ul className="space-y-1">
                  <li>
                    <strong>Dich vu thanh vien Health Net:</strong> 800-675-6110
                  </li>
                  <li>
                    <strong>California Health Care Options:</strong> 800-430-4263
                  </li>
                  <li>
                    <strong>Dich vu thanh vien Kaiser:</strong> 1-800-464-4000
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t print:border-t print:border-gray-300 text-center">
              <p className="text-xs print:text-xs text-gray-500 print:text-black">
                Bo ho so duoc tao ngay {new Date().toLocaleDateString('vi-VN')} • Ma ho so: {applicationId || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
