
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import { PrintableProgramInfo } from '@/app/info/components/PrintableProgramInfo';
import Link from 'next/link';

export default function PrintableInfoPage() {
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col print:bg-white">
       <header className="print:hidden sticky top-0 bg-white/80 backdrop-blur-sm border-b z-10">
        <div className="container mx-auto py-4 px-4">
            <div className="flex justify-between items-center">
                <Button variant="outline" asChild>
                    <Link href="/forms/printable-package">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Printable Forms
                    </Link>
                </Button>
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print Form
                </Button>
            </div>
        </div>
      </header>
      <main className="flex-grow container mx-auto py-8 px-4 print:p-0">
        <div className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4 print:border-none">
          <PrintableProgramInfo />
        </div>
      </main>
    </div>
  );
}
