'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { PrintableCsSummaryFormContent } from '@/app/forms/cs-summary-form/printable/PrintableCsSummaryFormContent';
import { PrintableWaiversContent } from '@/app/forms/waivers/printable/PrintableWaiversContent';
import { PrintableDeclarationOfEligibilityContent } from '@/app/forms/declaration-of-eligibility/printable/PrintableDeclarationOfEligibilityContent';
import { PrintableProgramInfo } from '@/app/info/components/PrintableProgramInfo';
import { PrintableGlossaryContent } from '@/app/forms/acronym-glossary/printable/PrintableGlossaryContent';
import Link from 'next/link';

const PageBreak = () => <div className="page-break-before"></div>;

export default function FullPackagePrintPage() {
  
  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
        <div className="print:hidden p-8 text-center space-y-4 bg-gray-100 flex flex-col items-center">
            <div className="w-full max-w-5xl flex justify-start">
                <Button variant="outline" asChild>
                    <Link href="/forms/printable-package">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Return to Printable Forms
                    </Link>
                </Button>
            </div>
            <div className="py-8">
                <h1 className="text-2xl font-bold">Print Full Application Package</h1>
                <p className="text-muted-foreground">Click the button below to open the print dialog for the complete package.</p>
                <Button onClick={() => window.print()} className="mt-4">
                  <Printer className="mr-2 h-4 w-4" />
                  Print Now
                </Button>
            </div>
        </div>
        <div className="p-8 print:p-4 space-y-8 bg-white max-w-5xl mx-auto">
            {/* This is the content that will be printed */}
            <PrintableProgramInfo />
            <PageBreak />
            <PrintableGlossaryContent />
            <PageBreak />
            <PrintableCsSummaryFormContent />
            <PageBreak />
            <PrintableWaiversContent />
            <PageBreak />
            <PrintableDeclarationOfEligibilityContent />
        </div>
        <style jsx global>{`
          @media print {
            .page-break-before {
              page-break-before: always;
            }
          }
        `}</style>
    </div>
  );
}
