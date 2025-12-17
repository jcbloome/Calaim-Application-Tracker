
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { PrintableWaiversContent } from './PrintableWaiversContent';

export default function PrintableWaiversPage() {
  
  return (
    <div className="bg-gray-50 min-h-screen print:bg-white">
      <div className="container mx-auto py-8 px-4 print:p-0">
        <div className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4">
          <div className="flex justify-between items-start mb-8 print:hidden">
            <Button variant="outline" asChild>
                <Link href="/forms/printable-package">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Return to Printable Forms
                </Link>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print Form
            </Button>
          </div>
          
          <PrintableWaiversContent />
        </div>
      </div>
    </div>
  );
}
