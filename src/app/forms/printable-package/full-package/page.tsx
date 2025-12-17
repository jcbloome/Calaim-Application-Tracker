
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

const PageBreak = () => <div className="break-before-page"></div>;

export default function FullPackagePrintPage() {
  
  React.useEffect(() => {
    // Automatically trigger print dialog when component mounts
    // Using a timeout gives the browser a moment to render the content
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
        <header className="print:hidden p-8 text-center space-y-4 bg-gray-100 flex flex-col items-center">
            <div className="w-full max-w-5xl flex justify-start">
                <Button variant="outline" asChild>
                    <Link href="/forms/printable-package">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Return to Printable Forms
                    </Link>
                </Button>
            </div>
            <div className="py-8">
                <h1 className="text-2xl font-bold">Full Application Package</h1>
                <p className="text-muted-foreground">Your print dialog should appear automatically.</p>
                <p className="text-sm text-muted-foreground">If it doesn't, please use your browser's print function (Ctrl/Cmd + P).</p>
            </div>
        </header>
        <main className="p-8 print:p-4 space-y-8 bg-white max-w-5xl mx-auto">
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
        </main>
        <style jsx global>{`
          @media print {
            .break-before-page {
              page-break-before: always;
            }
          }
        `}</style>
    </div>
  );
}
