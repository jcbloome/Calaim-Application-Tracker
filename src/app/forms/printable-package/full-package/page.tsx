
'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { PrintableCsSummaryFormContent } from '@/app/forms/cs-summary-form/printable/PrintableCsSummaryFormContent';
import { PrintableHipaaFormContent } from '@/app/forms/hipaa-authorization/printable/PrintableHipaaFormContent';
import { PrintableLiabilityWaiverContent } from '@/app/forms/liability-waiver/printable/PrintableLiabilityWaiverContent';
import { PrintableFreedomOfChoiceContent } from '@/app/forms/freedom-of-choice/printable/PrintableFreedomOfChoiceContent';
import { PrintableDeclarationOfEligibilityContent } from '@/app/forms/declaration-of-eligibility/printable/PrintableDeclarationOfEligibilityContent';
import { PrintableProgramInfo } from '@/app/info/components/PrintableProgramInfo';
import { PrintableGlossaryContent } from '@/app/forms/acronym-glossary/printable/PrintableGlossaryContent';
import Link from 'next/link';

const PageBreak = () => <div className="page-break-before"></div>;

export default function FullPackagePrintPage() {

  useEffect(() => {
    // Automatically trigger print dialog when component mounts
    const timeoutId = setTimeout(() => window.print(), 500);
    // Cleanup timeout if component unmounts
    return () => clearTimeout(timeoutId);
  }, []);
  
  return (
    <div className="bg-white">
        <div className="print:hidden p-8 text-center space-y-4 bg-gray-100">
            <div className="flex justify-start w-full">
                <Button variant="outline" asChild>
                    <Link href="/forms/printable-package">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Return to Printable Forms
                    </Link>
                </Button>
            </div>
            <div className="py-8">
                <h1 className="text-2xl font-bold">Preparing Application Package</h1>
                <p className="text-muted-foreground">Your print dialog should appear automatically. If it doesn't, please click the button below.</p>
                <Button onClick={() => window.print()} className="mt-4">
                  <Printer className="mr-2 h-4 w-4" />
                  Print Now
                </Button>
            </div>
        </div>
        <div className="p-8 print:p-4 space-y-8">
            {/* The content that will be printed */}
            <PrintableProgramInfo />
            <PageBreak />
            <PrintableGlossaryContent />
            <PageBreak />
            <PrintableCsSummaryFormContent />
            <PrintableHipaaFormContent />
            <PrintableLiabilityWaiverContent />
            <PrintableFreedomOfChoiceContent />
            <PrintableDeclarationOfEligibilityContent />
        </div>
        <style jsx global>{`
          @media print {
            .page-break-before {
              page-break-before: always;
            }
            .page-break-after {
                page-break-after: always;
            }
          }
        `}</style>
    </div>
  );
}
