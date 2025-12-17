'use client';

import React from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { PrintableCsSummaryFormContent } from './PrintableCsSummaryFormContent';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';

export default function PrintableCsSummaryForm() {
  return (
    <div className="bg-gray-50 min-h-screen flex flex-col print:bg-white">
      <Header />
      <main className="flex-grow container mx-auto py-8 px-4 print:p-0">
        <div className="flex justify-between items-center mb-8 print:hidden">
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
        <div className="bg-white p-4 sm:p-8 shadow-lg rounded-lg print:shadow-none print:p-4">
          <PrintableCsSummaryFormContent />
        </div>
      </main>
    </div>
  );
}
